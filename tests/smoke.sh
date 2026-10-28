#!/usr/bin/env bash
# Teste de fumaça da API: login, cadastro de cliente, venda com item livre + parcelas + OS,
# PDF, campanha sem destinatários duplicados e cancelamento com estorno de estoque.
# Uso: API=http://localhost/Otica-SD/app/api/index.php bash tests/smoke.sh
# (padrão XAMPP; no Docker use API=http://localhost:8080/api/index.php). Requer a ótica de demonstração.
set -euo pipefail
API="${API:-http://localhost/Otica-SD/app/api/index.php}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT
fail() { echo "FALHOU: $*" >&2; exit 1; }
req() { curl -sf -b "$JAR" -c "$JAR" -X "$1" -H "X-CSRF-Token: ${CSRF:-}" -H 'Content-Type: application/json' ${3:+-d "$3"} "$API?$2"; }
field() { grep -o "\"$1\":[^,}]*" | head -1 | cut -d: -f2- | tr -d '"'; }

req GET "action=health" | grep -q '"ok":true' || fail "health"
req POST "action=login" '{"email":"demo@ocular.local","password":"demo1234"}' >/dev/null || fail "login"
CSRF="$(req GET 'action=me' | field csrf)"

CLIENT="$(req POST 'action=clients' '{"name":"Smoke Teste","whatsapp":"93988880000","message_consent":true}' | field id)"
STOCK_BEFORE="$(req GET 'action=products&id=1' | field stock)"
SALE_JSON="$(req POST 'action=sales' "{\"client_id\":$CLIENT,\"items\":[{\"product_id\":1,\"quantity\":1,\"unit_price\":100},{\"description\":\"Item livre\",\"quantity\":2,\"unit_price\":\"10,00\"}],\"payments\":[{\"method\":\"pix\",\"amount\":50,\"paid_at\":\"$(date +%F)\"},{\"method\":\"crediario\",\"amount\":70,\"due_date\":\"$(date +%F)\"}],\"create_service_order\":true}")"
SALE="$(echo "$SALE_JSON" | field id)"
echo "$SALE_JSON" | grep -q '"service_order_id":[0-9]' || fail "OS não foi gerada"
[ "$(req GET 'action=products&id=1' | field stock)" -eq $((STOCK_BEFORE - 1)) ] || fail "baixa de estoque"
req GET "action=sales&id=$SALE" | grep -q '"total":"120.00","paid":"50.00"' || fail "totais da venda"
curl -sf -b "$JAR" "$API?action=pdf&type=sale&id=$SALE" | head -c 4 | grep -q '%PDF' || fail "PDF do pedido"

CAMPAIGN="$(req POST 'action=campaigns' "{\"name\":\"Smoke\",\"message\":\"Oi {{primeiro_nome}}\",\"audience\":{\"ids\":[$CLIENT]}}" | field id)"
req PATCH "action=campaigns&id=$CAMPAIGN" '{"action":"build"}' | grep -q '"added":0' || fail "campanha duplicou destinatário"

req PATCH "action=sales&id=$SALE" '{"action":"cancel","reason":"smoke"}' >/dev/null
[ "$(req GET 'action=products&id=1' | field stock)" -eq "$STOCK_BEFORE" ] || fail "estorno de estoque"

req DELETE "action=campaigns&id=$CAMPAIGN" >/dev/null
req DELETE "action=clients&id=$CLIENT" >/dev/null
echo "OK: fluxo principal funcionando"
