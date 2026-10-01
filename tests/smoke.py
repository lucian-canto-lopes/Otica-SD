"""Verifica a API em execução usando uma empresa fictícia exclusiva do teste."""

import http.cookiejar
import json
import urllib.error
import urllib.request
import uuid


BASE_URL = 'http://localhost:8080/api/index.php'

class Client:
    def __init__(self):
        cookies = http.cookiejar.CookieJar()
        self.http = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(cookies)
        )
        self.csrf = ''

    def call(self, action, data=None, method=None, expected=200, csrf=True):
        request = urllib.request.Request(
            BASE_URL + '?action=' + action,
            data=json.dumps(data).encode() if data is not None else None,
            headers={
                'Content-Type': 'application/json',
                'X-CSRF-Token': self.csrf if csrf else '',
            },
            method=method or ('POST' if data is not None else 'GET'),
        )
        try:
            response = self.http.open(request)
        except urllib.error.HTTPError as error:
            response = error
        body = json.load(response)
        assert response.code == expected, (action, response.code, body)
        return body

    def login(self, email, password):
        self.call('login', dict(email=email, password=password))
        self.csrf = self.call('me')['csrf']


def main():
    # Prepara uma empresa nova para não alterar o estoque das óticas de demonstração.
    admin = Client()
    admin.login('admin@sistema.test', 'admin123')
    email = 'test-' + uuid.uuid4().hex[:8] + '@example.test'
    admin.call(
        'companies',
        dict(
            name='Ótica de teste automatizado',
            email=email,
            password='teste12345',
            plan='Teste',
        ),
        expected=201,
    )
    company_id = admin.call('companies')[0]['id']
    optical_client = Client()
    optical_client.login(email, 'teste12345')
    optical_client.call('clients', dict(name='Cliente teste', phone='123'), expected=201)
    client_id = optical_client.call('clients')[0]['id']
    optical_client.call(
        'products',
        dict(name='Produto teste', category='Armação', price='10.50', stock=3),
        expected=201,
    )
    product_id = optical_client.call('products')[0]['id']
    sale = dict(client_id=client_id, product_id=product_id, quantity=2, paid='5.00')

    # A venda exige CSRF e baixa o estoque junto com a gravação do total.
    optical_client.call('sales', sale, csrf=False, expected=403)
    optical_client.call('sales', sale, expected=201)
    assert optical_client.call('products')[0]['stock'] == 1
    assert float(optical_client.call('sales')[0]['total']) == 21

    # Falhas de estoque e pagamento não podem deixar alterações parciais.
    optical_client.call('sales', sale, expected=422)
    assert optical_client.call('products')[0]['stock'] == 1
    assert len(optical_client.call('sales')) == 1
    optical_client.call('sales', dict(sale, quantity=1, paid='99'), expected=422)
    assert optical_client.call('products')[0]['stock'] == 1

    # A ordem pode avançar de etapa após ser criada.
    optical_client.call(
        'orders',
        dict(client_id=client_id, description='Montagem', delivery='2026-12-01'),
        expected=201,
    )
    order_id = optical_client.call('orders')[0]['id']
    optical_client.call('orders', dict(id=order_id, status='ready'), method='PATCH')
    assert optical_client.call('orders')[0]['status'] == 'ready'

    # Uma segunda empresa não deve acessar clientes ou operações da primeira.
    other_company = Client()
    other_company.login('dono@segunda.test', 'otica123')
    assert client_id not in [record['id'] for record in other_company.call('clients')]
    other_company.call('sales', sale, expected=422)
    other_company.call('companies', expected=403)

    # Suspender e reativar a assinatura afeta uma sessão já autenticada.
    admin.call('companies', dict(id=company_id, status='blocked'), method='PATCH')
    optical_client.call('clients', expected=403)
    admin.call('companies', dict(id=company_id, status='active'), method='PATCH')
    optical_client.call('clients')

    # Encerrar a sessão remove o acesso às operações.
    optical_client.call('logout', {})
    optical_client.call('clients', expected=401)
    print(
        'PASS: login, CSRF, sale totals, stock rollback, '
        'tenant isolation, orders, subscriptions, logout'
    )


if __name__ == '__main__':
    main()
