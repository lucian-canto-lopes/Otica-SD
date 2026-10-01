"""Integration checks against a running demo. Creates a dedicated test tenant."""
import json, urllib.request, urllib.error, http.cookiejar, uuid

class Client:
    def __init__(self):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = ''
    def call(self, action, data=None, method=None, expected=200, csrf=True):
        req = urllib.request.Request('http://localhost:8080/api/index.php?action='+action,
            data=json.dumps(data).encode() if data is not None else None,
            headers={'Content-Type':'application/json', 'X-CSRF-Token':self.csrf if csrf else ''},
            method=method or ('POST' if data is not None else 'GET'))
        try: response = self.http.open(req)
        except urllib.error.HTTPError as e: response = e
        body = json.load(response)
        assert response.code == expected, (action, response.code, body)
        return body
    def login(self, email, password):
        self.call('login', dict(email=email,password=password))
        self.csrf = self.call('me')['csrf']

admin=Client(); admin.login('admin@sistema.test','admin123')
email='test-'+uuid.uuid4().hex[:8]+'@example.test'
admin.call('companies',dict(name='Ótica de teste automatizado',email=email,password='teste12345',plan='Teste'),expected=201)
tenant=admin.call('companies')[0]['id']
c=Client(); c.login(email,'teste12345')
c.call('clients',dict(name='Cliente teste',phone='123'),expected=201)
client=c.call('clients')[0]['id']
c.call('products',dict(name='Produto teste',category='Armação',price='10.50',stock=3),expected=201)
product=c.call('products')[0]['id']
sale=dict(client_id=client,product_id=product,quantity=2,paid='5.00')
c.call('sales',sale,csrf=False,expected=403)
c.call('sales',sale,expected=201)
assert c.call('products')[0]['stock']==1
assert float(c.call('sales')[0]['total'])==21
c.call('sales',sale,expected=422)
assert c.call('products')[0]['stock']==1
assert len(c.call('sales'))==1
c.call('sales',dict(sale,quantity=1,paid='99'),expected=422)
assert c.call('products')[0]['stock']==1
c.call('orders',dict(client_id=client,description='Montagem',delivery='2026-12-01'),expected=201)
order=c.call('orders')[0]['id']
c.call('orders',dict(id=order,status='ready'),method='PATCH')
assert c.call('orders')[0]['status']=='ready'
other=Client();other.login('dono@segunda.test','otica123')
assert client not in [r['id'] for r in other.call('clients')]
other.call('sales',sale,expected=422)
other.call('companies',expected=403)
admin.call('companies',dict(id=tenant,status='blocked'),method='PATCH')
c.call('clients',expected=403)
admin.call('companies',dict(id=tenant,status='active'),method='PATCH')
c.call('clients')
c.call('logout',{})
c.call('clients',expected=401)
print('PASS: login, CSRF, sale totals, stock rollback, tenant isolation, orders, subscriptions, logout')
