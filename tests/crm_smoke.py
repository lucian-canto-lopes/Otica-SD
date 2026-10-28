"""Valida os fluxos de CRM sem reutilizar dados das óticas de demonstração."""

from datetime import date, datetime, timedelta
import http.cookiejar
import json
import os
import urllib.error
import urllib.request
import uuid


BASE_URL = os.environ.get('OCULAR_BASE_URL', 'http://localhost:8080/api/index.php')


class Client:
    """Cliente HTTP com cookies e token CSRF próprios."""

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

        raw_body = response.read().decode()
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError as error:
            raise AssertionError(
                f'{action}: resposta HTTP {response.code} não contém JSON: {raw_body!r}'
            ) from error

        assert response.code == expected, (action, response.code, body)
        return body

    def login(self, email, password):
        self.call('login', dict(email=email, password=password))
        self.csrf = self.call('me')['csrf']


def find_record(records, **expected_fields):
    """Encontra exatamente um registro pelos campos informados."""

    matches = [
        record
        for record in records
        if all(record.get(field) == value for field, value in expected_fields.items())
    ]
    assert len(matches) == 1, (expected_fields, matches)
    return matches[0]


def create_company(admin, marker, suffix):
    name = f'Ótica CRM {suffix} {marker}'
    email = f'crm-{suffix.lower()}-{marker}@example.test'
    password = 'teste12345'
    admin.call(
        'companies',
        dict(name=name, email=email, password=password, plan='Teste CRM'),
        expected=201,
    )
    company = find_record(admin.call('companies'), name=name)
    return company, email, password


def record_is_absent(records, **fields):
    return not any(
        all(record.get(field) == value for field, value in fields.items())
        for record in records
    )


def birth_date_for(upcoming_day):
    """Mantém o mês e o dia futuros, usando um ano de nascimento válido."""

    birth_year = 1992 if (upcoming_day.month, upcoming_day.day) == (2, 29) else 1990
    return upcoming_day.replace(year=birth_year).isoformat()


def main():
    marker = uuid.uuid4().hex[:10]
    today = date.today()

    # Duas empresas exclusivas tornam as verificações independentes dos dados demo.
    admin = Client()
    admin.login('admin@sistema.test', 'admin123')
    company_a, email_a, password_a = create_company(admin, marker, 'A')
    _, email_b, password_b = create_company(admin, marker, 'B')

    company_a_client = Client()
    company_a_client.login(email_a, password_a)
    company_b_client = Client()
    company_b_client.login(email_b, password_b)

    # O administrador geral não acessa dados operacionais e a ótica não gerencia empresas.
    admin.call('partners', expected=403)
    company_a_client.call('companies', expected=403)

    client_a_name = f'Cliente A {marker}'
    client_a_payload = dict(
        name=client_a_name,
        phone='(93) 99999-1111',
        email=f'cliente-a-{marker}@example.test',
        birth_date=birth_date_for(today + timedelta(days=7)),
        next_contact_date=(today + timedelta(days=5)).isoformat(),
        notes='Prefere contato por WhatsApp.',
        message_consent=1,
    )

    # Toda mutação passa pelo mesmo bloqueio CSRF e não deixa efeito colateral.
    company_a_client.call('clients', client_a_payload, csrf=False, expected=403)
    assert record_is_absent(company_a_client.call('clients'), name=client_a_name)
    company_a_client.call('clients', client_a_payload, expected=201)
    client_a = find_record(company_a_client.call('clients'), name=client_a_name)
    assert client_a['email'] == client_a_payload['email']
    assert client_a['birth_date'] == client_a_payload['birth_date']
    assert client_a['next_contact_date'] == client_a_payload['next_contact_date']
    assert int(client_a['message_consent']) == 1
    assert client_a['message_consent_at'] is not None
    automatic_reminders = company_a_client.call('reminders')
    automatic_types = {
        reminder['type']
        for reminder in automatic_reminders
        if int(reminder['client_id']) == int(client_a['id'])
    }
    assert {'birthday', 'follow_up'} <= automatic_types
    company_a_client.call(
        'clients', dict(client_a_payload, id=client_a['id']), method='PATCH'
    )
    repeated_automatic_reminders = [
        reminder
        for reminder in company_a_client.call('reminders')
        if int(reminder['client_id']) == int(client_a['id'])
        and reminder['type'] in ('birthday', 'follow_up')
    ]
    assert len(repeated_automatic_reminders) == 2

    client_b_name = f'Cliente B {marker}'
    company_b_client.call(
        'clients',
        dict(
            name=client_b_name,
            phone='(93) 99999-2222',
            email=f'cliente-b-{marker}@example.test',
            birth_date='',
            next_contact_date=(today + timedelta(days=6)).isoformat(),
            notes='',
        ),
        expected=201,
    )
    client_b = find_record(company_b_client.call('clients'), name=client_b_name)
    assert int(client_b['message_consent']) == 0
    assert client_b['message_consent_at'] is None
    assert int(client_a['id']) not in {
        int(record['id']) for record in company_b_client.call('clients')
    }

    supplier_a_name = f'Fornecedor A {marker}'
    laboratory_a_name = f'Laboratório A {marker}'
    company_a_client.call(
        'partners',
        dict(
            name=supplier_a_name,
            type='supplier',
            document='FOR-A',
            phone='(93) 3333-1111',
            email=f'fornecedor-a-{marker}@example.test',
            notes='Fornecedor principal.',
        ),
        expected=201,
    )
    company_a_client.call(
        'partners',
        dict(
            name=laboratory_a_name,
            type='laboratory',
            document='LAB-A',
            phone='(93) 3333-2222',
            email=f'laboratorio-a-{marker}@example.test',
            notes='Laboratório principal.',
        ),
        expected=201,
    )
    partners_a = company_a_client.call('partners')
    supplier_a = find_record(partners_a, name=supplier_a_name)
    laboratory_a = find_record(partners_a, name=laboratory_a_name)
    assert supplier_a['type'] == 'supplier'
    assert laboratory_a['type'] == 'laboratory'

    supplier_b_name = f'Fornecedor B {marker}'
    laboratory_b_name = f'Laboratório B {marker}'
    for name, partner_type in (
        (supplier_b_name, 'supplier'),
        (laboratory_b_name, 'laboratory'),
    ):
        company_b_client.call(
            'partners',
            dict(
                name=name,
                type=partner_type,
                document='',
                phone='',
                email='',
                notes='',
            ),
            expected=201,
        )
    partners_b = company_b_client.call('partners')
    supplier_b = find_record(partners_b, name=supplier_b_name)
    laboratory_b = find_record(partners_b, name=laboratory_b_name)
    assert int(supplier_a['id']) not in {int(record['id']) for record in partners_b}
    assert int(laboratory_a['id']) not in {int(record['id']) for record in partners_b}

    product_a_name = f'Armação CRM {marker}'
    product_a_payload = dict(
        name=product_a_name,
        category='Armações',
        price='149.90',
        stock=2,
        supplier_id=supplier_a['id'],
    )
    company_a_client.call('products', product_a_payload, expected=201)
    product_a = find_record(company_a_client.call('products'), name=product_a_name)
    assert int(product_a['supplier_id']) == int(supplier_a['id'])

    # Uma referência de outra empresa nunca pode ser usada para criar relações.
    company_b_client.call(
        'products',
        dict(product_a_payload, name=f'Produto invasor {marker}'),
        expected=422,
    )
    assert record_is_absent(
        company_b_client.call('products'), name=f'Produto invasor {marker}'
    )
    company_a_client.call(
        'products',
        dict(
            product_a_payload,
            name=f'Produto com laboratório {marker}',
            supplier_id=laboratory_a['id'],
        ),
        expected=422,
    )

    interaction_subject = f'Acompanhamento {marker}'
    interaction_payload = dict(
        client_id=client_a['id'],
        type='whatsapp',
        subject=interaction_subject,
        notes='Cliente confirmou o recebimento da mensagem.',
        contact_date=datetime.combine(today, datetime.min.time())
        .replace(hour=14)
        .strftime('%Y-%m-%dT%H:%M'),
    )
    company_a_client.call('interactions', interaction_payload, expected=201)
    interaction = find_record(
        company_a_client.call('interactions'), subject=interaction_subject
    )
    assert int(interaction['client_id']) == int(client_a['id'])
    assert interaction['type'] == 'whatsapp'
    company_b_client.call(
        'interactions',
        dict(interaction_payload, subject=f'Interação invasora {marker}'),
        expected=422,
    )
    assert record_is_absent(
        company_b_client.call('interactions'), subject=interaction_subject
    )
    assert record_is_absent(
        company_b_client.call('interactions'), subject=f'Interação invasora {marker}'
    )

    reminder_message = f'Retorno CRM {marker}'
    reminder_payload = dict(
        client_id=client_a['id'],
        type='follow_up',
        due_date=(today + timedelta(days=3)).isoformat(),
        message=reminder_message,
        status='pending',
    )
    company_a_client.call('reminders', reminder_payload, expected=201)
    reminder = find_record(company_a_client.call('reminders'), message=reminder_message)
    assert reminder['status'] == 'pending'
    assert int(reminder['message_consent']) == 1
    company_b_client.call(
        'reminders',
        dict(
            client_id=client_b['id'],
            type='follow_up',
            due_date=(today + timedelta(days=3)).isoformat(),
            message=f'Lembrete sem autorização {marker}',
        ),
        expected=422,
    )
    company_b_client.call(
        'reminders',
        dict(reminder_payload, message=f'Lembrete invasor {marker}'),
        expected=422,
    )
    assert record_is_absent(
        company_b_client.call('reminders'), message=reminder_message
    )
    assert record_is_absent(
        company_b_client.call('reminders'), message=f'Lembrete invasor {marker}'
    )

    order_description = f'Montagem CRM {marker}'
    order_payload = dict(
        client_id=client_a['id'],
        laboratory_id=laboratory_a['id'],
        description=order_description,
        prescription='Receita de teste do fluxo CRM.',
        delivery=(today - timedelta(days=2)).isoformat(),
    )
    company_a_client.call('orders', order_payload, expected=201)
    order = find_record(company_a_client.call('orders'), description=order_description)
    assert int(order['laboratory_id']) == int(laboratory_a['id'])
    assert order['status'] == 'received'
    assert [event['status'] for event in order['history']] == ['received']

    # As duas chaves relacionadas da OS são verificadas separadamente.
    company_b_client.call(
        'orders',
        dict(
            order_payload,
            laboratory_id=laboratory_b['id'],
            description=f'Ordem com cliente externo {marker}',
        ),
        expected=422,
    )
    company_a_client.call(
        'orders',
        dict(
            order_payload,
            laboratory_id=supplier_a['id'],
            description=f'Ordem com fornecedor {marker}',
        ),
        expected=422,
    )
    company_b_client.call(
        'orders',
        dict(
            order_payload,
            client_id=client_b['id'],
            description=f'Ordem com laboratório externo {marker}',
        ),
        expected=422,
    )
    orders_b = company_b_client.call('orders')
    assert record_is_absent(
        orders_b, description=f'Ordem com cliente externo {marker}'
    )
    assert record_is_absent(
        orders_b, description=f'Ordem com laboratório externo {marker}'
    )

    status_note = f'Enviada ao laboratório {marker}'
    company_a_client.call(
        'orders',
        dict(id=order['id'], status='sent_to_lab', notes=status_note),
        method='PATCH',
        csrf=False,
        expected=403,
    )
    unchanged_order = find_record(
        company_a_client.call('orders'), description=order_description
    )
    assert unchanged_order['status'] == 'received'
    assert len(unchanged_order['history']) == 1

    company_a_client.call(
        'orders',
        dict(id=order['id'], status='sent_to_lab', notes=status_note),
        method='PATCH',
    )
    updated_order = find_record(company_a_client.call('orders'), description=order_description)
    assert updated_order['status'] == 'sent_to_lab'
    assert [event['status'] for event in updated_order['history']] == [
        'received',
        'sent_to_lab',
    ]
    assert updated_order['history'][-1]['notes'] == status_note

    # IDs de outra ótica não podem ser alterados, nem gerar eventos de histórico.
    company_b_client.call(
        'orders',
        dict(id=order['id'], status='ready', notes='Tentativa externa'),
        method='PATCH',
        expected=404,
    )
    protected_order = find_record(company_a_client.call('orders'), description=order_description)
    assert protected_order['status'] == 'sent_to_lab'
    assert len(protected_order['history']) == 2

    dashboard = company_a_client.call('dashboard')
    assert int(dashboard['upcoming_birthdays']) == 1
    assert int(dashboard['pending_reminders']) == 3
    assert int(dashboard['overdue_orders']) == 1
    assert int(dashboard['low_stock']) == 1

    # Concluir o lembrete muda seu estado e o indicador central.
    company_a_client.call(
        'reminders',
        dict(id=reminder['id'], status='completed'),
        method='PATCH',
        csrf=False,
        expected=403,
    )
    pending_after_rejected_patch = find_record(
        company_a_client.call('reminders'), message=reminder_message
    )
    assert pending_after_rejected_patch['status'] == 'pending'

    company_b_client.call(
        'reminders',
        dict(id=reminder['id'], status='completed'),
        method='PATCH',
        expected=404,
    )
    company_a_client.call(
        'reminders',
        dict(id=reminder['id'], status='completed'),
        method='PATCH',
    )
    completed_reminder = find_record(
        company_a_client.call('reminders'), message=reminder_message
    )
    assert completed_reminder['status'] == 'completed'
    assert completed_reminder['completed_at'] is not None
    assert int(company_a_client.call('dashboard')['pending_reminders']) == 2

    # A revogação limpa a data do aceite e bloqueia novos lembretes para contato.
    company_a_client.call(
        'clients',
        dict(client_a_payload, id=client_a['id'], message_consent=0),
        method='PATCH',
    )
    client_after_revocation = find_record(
        company_a_client.call('clients'), name=client_a_name
    )
    assert int(client_after_revocation['message_consent']) == 0
    assert client_after_revocation['message_consent_at'] is None
    company_a_client.call(
        'reminders',
        dict(reminder_payload, message=f'Lembrete após revogação {marker}'),
        expected=422,
    )

    # Entregar a ordem retira a pendência vencida e acrescenta o evento final.
    company_a_client.call(
        'orders',
        dict(id=order['id'], status='delivered', notes='Entregue ao cliente.'),
        method='PATCH',
    )
    delivered_order = find_record(company_a_client.call('orders'), description=order_description)
    assert delivered_order['status'] == 'delivered'
    assert delivered_order['history'][-1]['status'] == 'delivered'
    assert int(company_a_client.call('dashboard')['overdue_orders']) == 0

    # A assinatura continua sendo aplicada a todos os novos recursos.
    admin.call(
        'companies',
        dict(id=company_a['id'], status='blocked'),
        method='PATCH',
    )
    for action in ('clients', 'partners', 'interactions', 'reminders', 'orders', 'dashboard'):
        company_a_client.call(action, expected=403)
    admin.call(
        'companies',
        dict(id=company_a['id'], status='active'),
        method='PATCH',
    )
    company_a_client.call('dashboard')

    print(
        'PASS: CRM clients, partners, tenant references, interactions, reminders, '
        'order history, dashboard, CSRF and subscriptions'
    )


if __name__ == '__main__':
    main()
