"""Verifica a API em execução usando uma empresa fictícia exclusiva do teste."""

import http.cookiejar
import json
import urllib.error
import urllib.request
import uuid
from datetime import date


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

    # O responsável pode personalizar apenas a empresa vinculada à sua sessão.
    demo_logo = (
        'data:image/png;base64,'
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+'
        'A8AAQUBAScY42YAAAAASUVORK5CYII='
    )
    optical_client.call(
        'branding',
        dict(name='Ótica personalizada', logo_data=demo_logo),
        method='PATCH',
    )
    branding = optical_client.call('branding')
    assert branding['name'] == 'Ótica personalizada'
    assert branding['logo_data'] == demo_logo

    optical_client.call(
        'clients',
        dict(name='Cliente teste', phone='123', message_consent=1),
        expected=201,
    )
    client_id = optical_client.call('clients')[0]['id']
    assert int(optical_client.call('clients')[0]['message_consent']) == 1
    optical_client.call(
        'products',
        dict(name='Produto teste A', category='Armação', price='10.50', stock=3),
        expected=201,
    )
    optical_client.call(
        'products',
        dict(name='Produto teste B', category='Lente', price='20.00', stock=5),
        expected=201,
    )
    products = optical_client.call('products')
    product_a = next(product for product in products if product['name'] == 'Produto teste A')
    product_b = next(product for product in products if product['name'] == 'Produto teste B')
    sale = dict(
        client_id=client_id,
        items=[
            dict(product_id=product_a['id'], quantity=2),
            dict(product_id=product_b['id'], quantity=3),
        ],
        paid='5.00',
        payment_date=date.today().isoformat(),
    )

    # A venda exige CSRF e baixa todos os itens junto com a gravação do total.
    optical_client.call('sales', sale, csrf=False, expected=403)
    optical_client.call('sales', sale, expected=201)
    stocks = {int(product['id']): int(product['stock']) for product in optical_client.call('products')}
    assert stocks[int(product_a['id'])] == 1
    assert stocks[int(product_b['id'])] == 2
    recorded_sale = optical_client.call('sales')[0]
    assert float(recorded_sale['total']) == 81
    assert int(recorded_sale['quantity']) == 5
    assert {item['product'] for item in recorded_sale['items']} == {
        'Produto teste A',
        'Produto teste B',
    }
    assert recorded_sale['payment_date'] == date.today().isoformat()
    renewal_date = date.today().replace(year=date.today().year + 1).isoformat()
    renewal_reminders = [
        reminder
        for reminder in optical_client.call('reminders')
        if reminder['type'] == 'renewal'
        and int(reminder['client_id']) == int(client_id)
        and reminder['due_date'] == renewal_date
    ]
    assert len(renewal_reminders) == 1

    # Falha em um item não pode baixar o estoque de nenhum produto.
    optical_client.call('sales', sale, expected=422)
    stocks_after_failure = {
        int(product['id']): int(product['stock']) for product in optical_client.call('products')
    }
    assert stocks_after_failure == stocks
    assert len(optical_client.call('sales')) == 1
    smaller_sale = dict(
        sale,
        items=[
            dict(product_id=product_a['id'], quantity=1),
            dict(product_id=product_b['id'], quantity=1),
        ],
        paid='99',
    )
    optical_client.call('sales', smaller_sale, expected=422)
    assert {
        int(product['id']): int(product['stock']) for product in optical_client.call('products')
    } == stocks

    # A ordem pode avançar de etapa após ser criada.
    optical_client.call(
        'orders',
        dict(client_id=client_id, description='Montagem', delivery='2026-12-01'),
        expected=201,
    )
    order_id = optical_client.call('orders')[0]['id']
    optical_client.call('orders', dict(id=order_id, status='ready'), method='PATCH')
    assert optical_client.call('orders')[0]['status'] == 'ready'
    pickup_reminders = [
        reminder
        for reminder in optical_client.call('reminders')
        if reminder['type'] == 'pickup' and f'ordem #{order_id}' in reminder['message']
    ]
    assert len(pickup_reminders) == 1

    # Uma segunda empresa não deve acessar clientes ou operações da primeira.
    other_company = Client()
    other_company.login('dono@segunda.test', 'otica123')
    assert other_company.call('branding')['name'] != 'Ótica personalizada'
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
