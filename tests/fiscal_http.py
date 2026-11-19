#!/usr/bin/env python3
"""Fluxo fiscal de simulação via HTTP real, com uma ótica temporária no Docker.

Uso: API=http://localhost:8080/api/index.php python3 tests/fiscal_http.py
Requer os serviços `api`, `db` e `frontend` do compose em execução. O teste cria
somente dados com um identificador aleatório e os remove mesmo se uma asserção falhar.
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zlib


API = os.environ.get("API", "http://localhost:8080/api/index.php")
SCREEN_ID = secrets.token_hex(16)


class TestFailure(Exception):
    pass


def check(condition: bool, message: str) -> None:
    if not condition:
        raise TestFailure(message)


def sql_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def db(sql: str) -> str:
    result = subprocess.run(
        [
            "docker", "compose", "exec", "-T", "db", "sh", "-c",
            'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -h 127.0.0.1 '
            '-u "$MYSQL_USER" "$MYSQL_DATABASE" --batch --skip-column-names',
        ],
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise TestFailure(f"Falha no banco de teste: {result.stderr.strip()}")
    return result.stdout.strip()


def php_password_hash(password: str) -> str:
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "api", "php", "-r",
         "echo password_hash($argv[1], PASSWORD_DEFAULT);", password],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode or not result.stdout.startswith("$"):
        raise TestFailure(f"Não foi possível criar a senha da fixture: {result.stderr.strip()}")
    return result.stdout.strip()


def check_digit(digits: str, weights: list[int]) -> str:
    remainder = sum(int(digit) * weight for digit, weight in zip(digits, weights)) % 11
    return str(0 if remainder < 2 else 11 - remainder)


def fake_cnpj() -> str:
    base = f"{secrets.randbelow(90_000_000) + 10_000_000:08d}0001"
    first = check_digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    second = check_digit(base + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return base + first + second


def fake_cpf() -> str:
    base = f"{secrets.randbelow(900_000_000) + 100_000_000:09d}"
    first = check_digit(base, list(range(10, 1, -1)))
    second = check_digit(base + first, list(range(11, 1, -1)))
    return base + first + second


class HttpClient:
    def __init__(self) -> None:
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self.csrf = ""

    def request(self, method: str, action: str, params: dict | None = None,
                payload: dict | None = None) -> tuple[int, bytes]:
        query = urllib.parse.urlencode({"action": action, "screen_id": SCREEN_ID, **(params or {})})
        separator = "&" if "?" in API else "?"
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"X-Screen-Id": SCREEN_ID, "Accept": "application/json"}
        if method != "GET":
            headers["X-CSRF-Token"] = self.csrf
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(API + separator + query, body, headers, method=method)
        try:
            with self.opener.open(request, timeout=20) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def json(self, method: str, action: str, params: dict | None = None,
             payload: dict | None = None, status: int = 200) -> dict | list | None:
        actual, body = self.request(method, action, params, payload)
        check(actual == status, f"{method} {action}: esperado HTTP {status}, recebido {actual}: {body[:500]!r}")
        try:
            return json.loads(body)
        except json.JSONDecodeError as error:
            raise TestFailure(f"{method} {action}: resposta não é JSON: {body[:300]!r}") from error

    def rejected(self, method: str, action: str, params: dict | None = None,
                 payload: dict | None = None) -> None:
        status, body = self.request(method, action, params, payload)
        check(400 <= status < 500, f"{method} {action}: deveria rejeitar a operação; HTTP {status}: {body[:300]!r}")

    def rejected_code(self, method: str, action: str, code: str,
                      params: dict | None = None, payload: dict | None = None,
                      expected_status: int = 409) -> dict:
        status, body = self.request(method, action, params, payload)
        try:
            response = json.loads(body)
        except json.JSONDecodeError:
            response = None
        check(status == expected_status and isinstance(response, dict) and response.get("code") == code,
              f"{method} {action}: esperado HTTP {expected_status}/{code}, recebido {status}: {body[:300]!r}")
        return response


def pdf_text(pdf: bytes) -> str:
    chunks = [pdf]
    for stream in re.findall(rb"stream\r?\n(.*?)\r?\nendstream", pdf, flags=re.DOTALL):
        try:
            chunks.append(zlib.decompress(stream))
        except zlib.error:
            chunks.append(stream)
    return b"\n".join(chunks).decode("latin-1", errors="replace")


def xml_text(xml: bytes) -> tuple[ET.Element, str]:
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as error:
        raise TestFailure(f"XML de teste inválido: {error}") from error
    return root, xml.decode("utf-8", errors="replace")


def tag_text(root: ET.Element, name: str) -> str | None:
    element = root.find(f".//{{*}}{name}")
    return element.text if element is not None else None


def total_text(root: ET.Element, name: str) -> str | None:
    element = root.find(f".//{{*}}total/{{*}}ICMSTot/{{*}}{name}")
    return element.text if element is not None else None


def create_fixture(marker: str, email: str, password: str) -> tuple[int, int]:
    company_name = f"Fiscal Teste {marker}"
    company_id = int(db(
        "INSERT INTO companies "
        "(name, trade_name, document, zip, address, number, neighborhood, city, state, status) "
        f"VALUES ({sql_string(company_name)}, {sql_string(company_name)}, "
        f"{sql_string(fake_cnpj())}, '68000000', 'Rua de Teste', '10', "
        "'Centro', 'Santarem', 'PA', 'active'); SELECT LAST_INSERT_ID();"
    ).splitlines()[-1])
    password_hash = php_password_hash(password)
    user_id = int(db(
        "INSERT INTO users (name, email, password_hash) "
        f"VALUES ('Usuário Fiscal Teste', {sql_string(email)}, {sql_string(password_hash)}); "
        "SELECT LAST_INSERT_ID();"
    ).splitlines()[-1])
    db(
        "INSERT INTO company_users (company_id, user_id, role, active, concurrent_screens) "
        f"VALUES ({company_id}, {user_id}, 'owner', 1, 1);"
    )
    return company_id, user_id


def cleanup_fixture(marker: str, email: str) -> None:
    company_name = f"Fiscal Teste {marker}"
    company_id = db(f"SELECT id FROM companies WHERE name = {sql_string(company_name)} LIMIT 1;")
    user_id = db(f"SELECT id FROM users WHERE email = {sql_string(email)} LIMIT 1;")
    if company_id:
        check(company_id.isdigit(), "Identificador inesperado ao limpar a ótica de teste")
        for table in (
            "interactions", "service_order_events", "stock_movements", "sale_payments",
            "sale_items", "quote_items", "messages", "automation_runs", "webhook_deliveries",
        ):
            db(f"DELETE FROM {table} WHERE company_id = {company_id};")
        db(f"DELETE FROM companies WHERE id = {company_id};")
        db(f"DELETE FROM audit_logs WHERE company_id = {company_id};")
    if user_id:
        check(user_id.isdigit(), "Identificador inesperado ao limpar o usuário de teste")
        db(f"DELETE FROM users WHERE id = {user_id};")
        db(f"DELETE FROM audit_logs WHERE user_id = {user_id};")


def run() -> None:
    marker = secrets.token_hex(5)
    email = f"fiscal-{marker}@ocular.local"
    password = f"FiscalTeste-{marker}!"
    client = HttpClient()
    check(client.json("GET", "health") is not None, "API indisponível")
    try:
        company_id, _ = create_fixture(marker, email, password)
        client.json("POST", "login", payload={"email": email, "password": password})
        me = client.json("GET", "me")
        check(isinstance(me, dict) and me.get("company", {}).get("id") == company_id,
              "Login não selecionou a ótica de teste")
        client.csrf = me["csrf"]

        original_client_name = f"Cliente Fiscal {marker}"
        customer_cpf = fake_cpf()
        customer = client.json("POST", "clients", payload={
            "name": original_client_name, "cpf": customer_cpf, "address": "Rua de Teste",
            "number": "20", "neighborhood": "Centro", "city": "Santarem", "state": "PA",
        }, status=201)
        customer_id = customer["id"]
        product_name = "Armação de teste"
        product_sku = f"FISCAL-{marker}"
        product = client.json("POST", "products", payload={
            "name": product_name, "sku": product_sku, "price": 40,
            "track_stock": False,
        }, status=201)
        product_id = product["id"]
        sale_items = [
            {"product_id": product_id, "description": product_name,
             "quantity": 2, "unit_price": 40, "discount": 5},
            {"description": "Lente de teste", "quantity": 1, "unit_price": 25},
        ]
        sale = client.json("POST", "sales", payload={
            "client_id": customer_id, "items": sale_items, "discount": 10,
        }, status=201)
        sale_id = sale["id"]
        legacy_sale_id = f"fiscal-{marker}"
        db(f"UPDATE sales SET legacy_id = {sql_string(legacy_sale_id)} "
           f"WHERE id = {int(sale_id)} AND company_id = {company_id};")
        detail = client.json("GET", "sales", {"id": sale_id})
        check(float(detail["total"]) == 90.0, "Total da venda com descontos deveria ser 90,00")
        original_item_ids = [item["id"] for item in detail["items"]]
        check(int(detail["items"][0]["product_id"]) == product_id
              and detail["items"][1]["product_id"] is None,
              "Venda de teste precisa ter um item de catálogo e outro livre")
        import_payload = {
            "entity": "sale_items", "filename": "fiscal-teste.csv", "last_chunk": True,
            "rows": [{
                "sale_legacy_id": legacy_sale_id, "description": "Item importado de teste",
                "quantity": "1", "unit_price": "7.00", "total": "7.00",
            }],
        }

        check(client.json("GET", "fiscal", {"sale_id": sale_id}) is None,
              "Venda nova já apresenta simulação fiscal")
        homologation = client.json("GET", "fiscal_homologation", {"sale_id": sale_id})
        check(homologation["ready"] is False and homologation["environment"] == "homologation"
              and any(issue["code"] == "signing_transport_pending" for issue in homologation["issues"]),
              "Preparação da homologação deve bloquear o envio real")
        check("password" not in json.dumps(homologation).lower()
              and "private_key" not in json.dumps(homologation).lower(),
              "A conferência da homologação expôs informação privada")
        client.rejected("POST", "fiscal_homologation", payload={"sale_id": sale_id})
        incomplete = client.json("GET", "fiscal_check", {"sale_id": sale_id})
        check(incomplete["ready"] is False and isinstance(incomplete["issues"], list)
              and len(incomplete["issues"]) > 0,
              "Pré-validação deveria listar pendências fiscais da venda incompleta")
        for issue in incomplete["issues"]:
            check(all(isinstance(issue.get(key), str) and issue[key] for key in
                      ("field", "message", "section", "href"))
                  and not issue["href"].startswith("#"),
                  f"Pendência fiscal sem campo, seção ou rota válida: {issue!r}")
        incomplete_post = client.rejected_code(
            "POST", "fiscal", "fiscal_data_incomplete", payload={
                "action": "simulate", "sale_id": sale_id, "model": "55",
            }, expected_status=422,
        )
        check(isinstance(incomplete_post.get("issues"), list) and incomplete_post["issues"],
              "Erro de dados fiscais incompletos não trouxe as pendências")
        client.rejected("POST", "fiscal", payload={
            "action": "simulate", "sale_id": sale_id, "model": "65",
        })
        check(client.json("GET", "fiscal", {"sale_id": sale_id}) is None,
              "Modelo 65 rejeitado não pode gerar documento")

        company = client.json("GET", "company")
        client.json("PATCH", "company", payload={
            "name": company["name"], "trade_name": company["trade_name"],
            "document": company["document"], "zip": company["zip"],
            "address": company["address"], "number": company["number"],
            "neighborhood": company["neighborhood"], "city": company["city"],
            "state": company["state"], "fiscal_ie": "123456789",
            "fiscal_city_code": "1506807", "fiscal_crt": "1",
        })
        client.json("PATCH", "clients", {"id": customer_id}, payload={
            "name": original_client_name, "cpf": customer_cpf,
            "address": "Rua de Teste", "number": "20", "neighborhood": "Centro",
            "city": "Santarem", "state": "PA", "zip": "68000000",
            "fiscal_city_code": "1506807",
            "fiscal_ie_indicator": "9",
        })
        catalog_fiscal = {
            "fiscal_ncm": "90031100", "fiscal_cfop": "5102",
            "fiscal_origin": "0", "fiscal_tax_situation": "102",
        }
        free_fiscal = {
            "fiscal_ncm": "90015000", "fiscal_cfop": "5102",
            "fiscal_origin": "0", "fiscal_tax_situation": "102",
        }
        client.json("PATCH", "products", {"id": product_id}, payload={
            "name": product_name, "sku": product_sku, "price": 40,
            "track_stock": False, **catalog_fiscal,
        })
        sale_items = [sale_items[0], {**sale_items[1], **free_fiscal}]
        client.json("PATCH", "sales", {"id": sale_id}, payload={
            "client_id": customer_id, "items": sale_items, "discount": 10,
        })
        original_item_ids = [item["id"] for item in client.json("GET", "sales", {"id": sale_id})["items"]]
        complete = client.json("GET", "fiscal_check", {"sale_id": sale_id})
        check(complete["ready"] is True and complete["issues"] == [],
              f"Venda deveria estar pronta após completar os dados fiscais: {complete!r}")
        check(complete["schema_version"] == "PL_010h_v1.03",
              "Prévia não informa a versão do XSD oficial")

        # Um campo aceito pelo cadastro pode exceder o limite do XSD da NF-e.
        long_name = "Cliente Fiscal " + "X" * 70
        client.json("PATCH", "clients", {"id": customer_id}, payload={
            "name": long_name, "cpf": customer_cpf,
            "address": "Rua de Teste", "number": "20", "neighborhood": "Centro",
            "city": "Santarem", "state": "PA", "zip": "68000000",
            "fiscal_city_code": "1506807", "fiscal_ie_indicator": "9",
        })
        schema_check = client.json("GET", "fiscal_check", {"sale_id": sale_id})
        check(schema_check["ready"] is False and any(i["section"] == "schema" for i in schema_check["issues"]),
              "Erro do XSD não apareceu na lista de pendências")
        client.rejected_code("POST", "fiscal", "fiscal_data_incomplete", payload={
            "action": "simulate", "sale_id": sale_id, "model": "55",
        }, expected_status=422)
        client.json("PATCH", "clients", {"id": customer_id}, payload={
            "name": original_client_name, "cpf": customer_cpf,
            "address": "Rua de Teste", "number": "20", "neighborhood": "Centro",
            "city": "Santarem", "state": "PA", "zip": "68000000",
            "fiscal_city_code": "1506807", "fiscal_ie_indicator": "9",
        })

        created = client.json("POST", "fiscal", payload={
            "action": "simulate", "sale_id": sale_id, "model": "55",
        }, status=201)
        document_id = created["id"]
        fiscal = client.json("GET", "fiscal", {"id": document_id})
        check(fiscal["sale_id"] == sale_id and fiscal["model"] == "55"
              and fiscal["environment"] == "simulation" and fiscal["status"] == "simulated",
              "Dados do documento de teste incorretos")
        check(float(fiscal["snapshot"]["total"]) == 90.0,
              "Snapshot não preservou o total original")
        check(any(event["event_type"] == "simulated" for event in fiscal["events"]),
              "Evento de simulação ausente")
        latest = client.json("GET", "fiscal", {"sale_id": sale_id})
        check(latest["id"] == document_id, "Consulta por venda não retornou o documento")
        client.rejected("POST", "fiscal", payload={
            "action": "simulate", "sale_id": sale_id, "model": "55",
        })

        status, xml = client.request("GET", "fiscal_xml", {"id": document_id})
        check(status == 200, f"Falha ao baixar XML: HTTP {status}")
        root, xml_string = xml_text(xml)
        check(root.tag == "{http://www.portalfiscal.inf.br/nfe}NFe",
              "Prévia XML não usa o namespace e a raiz da NF-e")
        check(root.find(".//{http://www.w3.org/2000/09/xmldsig#}Signature") is None,
              "Prévia local não deve conter assinatura fictícia")
        check(tag_text(root, "mod") == "55", "Modelo do XML de teste incorreto")
        check(len(root.findall(".//{*}det")) == 2, "XML não contém os dois itens da venda")
        expected_totals = {
            "vProd": "105.00", "vDesc": "15.00", "vNF": "90.00",
        }
        for name, expected in expected_totals.items():
            check(total_text(root, name) == expected,
                  f"XML: {name} deveria ser {expected}, recebeu {total_text(root, name)}")
        check("SEM VALOR FISCAL" in xml_string.upper(), "XML sem aviso de prévia")
        status, pdf = client.request("GET", "fiscal_pdf", {"id": document_id})
        check(status == 200 and pdf.startswith(b"%PDF"), "PDF de teste não foi gerado")
        check("SEM VALOR FISCAL" in pdf_text(pdf).upper(), "PDF sem aviso de simulação")

        # Uma simulação ativa impede mutações na venda até o cancelamento fiscal.
        client.rejected_code("PATCH", "sales", "fiscal_document_active", {"id": sale_id}, {
            "client_id": customer_id, "items": sale_items, "discount": 20,
        })
        client.rejected_code("PATCH", "sales", "fiscal_document_active", {"id": sale_id}, {
            "action": "cancel", "reason": "Deve ser bloqueado",
        })
        check(float(client.json("GET", "sales", {"id": sale_id})["total"]) == 90.0,
              "Venda mudou apesar do bloqueio fiscal")
        blocked_import = client.json("POST", "imports", payload=import_payload)
        check(blocked_import["failed"] == 1 and blocked_import["created"] == 0
              and "simulação fiscal ativa" in blocked_import["errors"][0]["error"].lower(),
              "Importação de item não foi bloqueada pela simulação ativa")
        unchanged_sale = client.json("GET", "sales", {"id": sale_id})
        check([item["id"] for item in unchanged_sale["items"]] == original_item_ids
              and float(unchanged_sale["total"]) == 90.0,
              "Importação bloqueada alterou os itens ou o total da venda")

        client.json("PATCH", "fiscal", {"id": document_id}, payload={})
        cancelled = client.json("GET", "fiscal", {"id": document_id})
        check(cancelled["status"] == "cancelled"
              and any(event["event_type"] == "cancelled" for event in cancelled["events"]),
              "Cancelamento não foi registrado")
        latest_cancelled = client.json("GET", "fiscal", {"sale_id": sale_id})
        check(latest_cancelled["id"] == document_id and latest_cancelled["status"] == "cancelled",
              "Consulta por venda não reflete o cancelamento")
        status, cancelled_xml = client.request("GET", "fiscal_xml", {"id": document_id})
        check(status == 200 and cancelled_xml == xml,
              "Cancelamento alterou o XML original da prévia")
        status, cancelled_pdf = client.request("GET", "fiscal_pdf", {"id": document_id})
        check(status == 200 and "cancel" in pdf_text(cancelled_pdf).lower(),
              "PDF baixado não reflete o cancelamento")
        allowed_import = client.json("POST", "imports", payload=import_payload)
        check(allowed_import["created"] == 1 and allowed_import["failed"] == 0,
              "Importação de item deveria ser permitida após cancelar a simulação")
        imported_sale = client.json("GET", "sales", {"id": sale_id})
        check(len(imported_sale["items"]) == len(original_item_ids) + 1
              and any(item["description"] == "Item importado de teste" for item in imported_sale["items"]),
              "Item importado não aparece na venda após cancelamento")

        # O documento cancelado guarda os dados originais, enquanto a venda pode ser editada.
        updated_client_name = f"Cliente Fiscal Alterado {marker}"
        client.json("PATCH", "clients", {"id": customer_id}, payload={
            "name": updated_client_name, "cpf": "", "cnpj": "AB123456000112",
            "address": "Rua de Teste", "number": "20", "neighborhood": "Centro",
            "city": "Santarem", "state": "PA", "zip": "68000000",
            "fiscal_city_code": "1506807",
            "fiscal_ie_indicator": "9",
        })
        client.json("PATCH", "sales", {"id": sale_id}, payload={
            "client_id": customer_id, "items": sale_items, "discount": 20,
        })
        ready_for_reissue = client.json("GET", "fiscal_check", {"sale_id": sale_id})
        check(ready_for_reissue["ready"] is True and ready_for_reissue["issues"] == [],
              f"CNPJ alfanumérico do destinatário deveria permitir nova simulação: {ready_for_reissue!r}")
        listing = client.json("GET", "fiscal")
        old_row = next(row for row in listing["data"] if row["id"] == document_id)
        check(float(old_row["total"]) == 90.0 and old_row["client_name"] == original_client_name,
              "Histórico fiscal mudou após editar a venda/cliente")
        status, old_xml = client.request("GET", "fiscal_xml", {"id": document_id})
        check(status == 200 and original_client_name in old_xml.decode("utf-8")
              and total_text(xml_text(old_xml)[0], "vNF") == "90.00",
              "XML histórico mudou após editar a venda/cliente")
        status, old_pdf = client.request("GET", "fiscal_pdf", {"id": document_id})
        check(status == 200 and original_client_name in pdf_text(old_pdf),
              "PDF histórico mudou após editar o cliente")

        reissued = client.json("POST", "fiscal", payload={
            "action": "simulate", "sale_id": sale_id, "model": "55",
        }, status=201)
        check(reissued["id"] != document_id, "Nova simulação substituiu o histórico cancelado")
        newest = client.json("GET", "fiscal", {"sale_id": sale_id})
        check(newest["id"] == reissued["id"] and newest["status"] == "simulated",
              "Consulta por venda não priorizou a nova simulação")
        check(int(newest["number"]) > int(cancelled["number"]),
              "Reemissão reutilizou a numeração anterior")
        check(float(newest["snapshot"]["total"]) == 80.0,
              "Nova simulação não usou o valor editado da venda")
        listing = client.json("GET", "fiscal")
        related = [row for row in listing["data"] if row["sale_id"] == sale_id]
        check(len(related) == 2 and {row["status"] for row in related} == {"cancelled", "simulated"},
              "Histórico não preservou as duas simulações")

        cancelled_sale = client.json("POST", "sales", payload={
            "items": [{"description": "Venda cancelada", "quantity": 1, "unit_price": 10}],
        }, status=201)
        client.json("PATCH", "sales", {"id": cancelled_sale["id"]}, payload={
            "action": "cancel", "reason": "Teste fiscal",
        })
        client.rejected("POST", "fiscal", payload={
            "action": "simulate", "sale_id": cancelled_sale["id"], "model": "55",
        })
        check(client.json("GET", "fiscal", {"sale_id": cancelled_sale["id"]}) is None,
              "Venda cancelada não pode gerar documento")
        print("OK: fluxo fiscal HTTP, descontos, histórico, downloads e rejeições")
    finally:
        cleanup_fixture(marker, email)


if __name__ == "__main__":
    try:
        run()
    except (TestFailure, OSError, KeyError, TypeError, StopIteration, ValueError) as error:
        print(f"FALHOU: {error}", file=sys.stderr)
        sys.exit(1)
