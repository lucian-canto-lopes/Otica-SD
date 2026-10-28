<?php
declare(strict_types=1);

/*
 * Cria a "Ótica Demonstração" com dados fictícios para conhecer o sistema.
 * php app/scripts/seed_demo.php
 */

require __DIR__ . '/../src/bootstrap.php';

if (fetchValue("SELECT id FROM companies WHERE name = 'Ótica Demonstração'")) {
    echo "A ótica de demonstração já existe.\n";
    exit(0);
}
mt_srand(42);

$companyId = inTransaction(static function (): int {
    $companyId = insertRow('companies', [
        'name' => 'Ótica Demonstração',
        'trade_name' => 'Ótica Demonstração',
        'document' => '00.000.000/0001-00',
        'phone' => '(93) 3522-0000',
        'whatsapp' => '(93) 99999-0000',
        'address' => 'Av. Principal',
        'number' => '100',
        'neighborhood' => 'Centro',
        'city' => 'Santarém',
        'state' => 'PA',
        'status' => 'active',
        'primary_color' => '#0f766e',
        'monthly_fee' => 169.90,
        'plan_id' => fetchValue("SELECT id FROM plans WHERE name = 'Profissional'"),
        'next_sale_number' => 1001,
        'next_order_number' => 501,
        'next_quote_number' => 201,
        'settings' => jsonColumn(['default_ddd' => '93', 'quote_validity_days' => '15', 'prescription_validity_months' => '12', 'renewal_months' => '12']),
    ]);
    seedCompanyDefaults($companyId);
    $owner = findOrCreateUser('demo@ocular.local', 'Ana Demonstração', 'demo1234');
    linkUserToCompany($owner, $companyId, 'owner');
    $seller = findOrCreateUser('vendedor@ocular.local', 'Bruno Vendedor', 'demo1234');
    linkUserToCompany($seller, $companyId, 'seller');
    return $companyId;
});

$users = array_column(fetchAllRows('SELECT user_id FROM company_users WHERE company_id = ?', [$companyId]), 'user_id');
$lab = insertRow('partners', ['company_id' => $companyId, 'type' => 'laboratory', 'name' => 'Laboratório Visão Norte', 'phone' => '(93) 3522-1111']);
$supplier = insertRow('partners', ['company_id' => $companyId, 'type' => 'supplier', 'name' => 'Distribuidora Aurora', 'phone' => '(11) 4000-0000']);

$catalog = [
    ['Armações', 'Ray-Ban', 'Armação Ray-Ban RB5154', 320, 650],
    ['Armações', 'Oakley', 'Armação Oakley OX8046', 280, 590],
    ['Armações', 'Atitude', 'Armação Atitude AT1520', 110, 289],
    ['Armações', 'Ana Hickmann', 'Armação Ana Hickmann AH6450', 150, 399],
    ['Armações', 'Genérica', 'Armação acetato infantil', 45, 149],
    ['Lentes', 'Essilor', 'Lente Varilux Comfort (par)', 420, 1290],
    ['Lentes', 'Zeiss', 'Lente monofocal antirreflexo (par)', 120, 380],
    ['Lentes', 'Hoya', 'Lente filtro azul (par)', 160, 450],
    ['Lentes', 'Genérica', 'Lente monofocal CR-39 (par)', 40, 160],
    ['Óculos solares', 'Ray-Ban', 'Solar Ray-Ban Aviator', 380, 799],
    ['Óculos solares', 'Chilli Beans', 'Solar Chilli Beans', 90, 249],
    ['Lentes de contato', 'Acuvue', 'Lente de contato Acuvue Oasys (cx)', 110, 239],
    ['Acessórios', 'Genérica', 'Estojo + flanela', 5, 25],
    ['Acessórios', 'Genérica', 'Spray limpa lentes', 4, 19],
];
$products = [];
foreach ($catalog as $i => [$category, $brand, $name, $cost, $price]) {
    $products[] = ['id' => insertRow('products', [
        'company_id' => $companyId, 'sku' => 'P' . str_pad((string) ($i + 1), 4, '0', STR_PAD_LEFT), 'name' => $name, 'category' => $category,
        'brand' => $brand, 'cost' => $cost, 'price' => $price, 'stock' => mt_rand(0, 25), 'min_stock' => 3, 'supplier_id' => $supplier,
    ]), 'name' => $name, 'price' => $price, 'category' => $category];
}

$first = ['Maria', 'José', 'Ana', 'João', 'Francisca', 'Antônio', 'Juliana', 'Carlos', 'Fernanda', 'Paulo', 'Luana', 'Pedro', 'Raimunda', 'Lucas', 'Patrícia', 'Marcos', 'Aline', 'Rafael', 'Beatriz', 'Diego'];
$last = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Almeida', 'Rodrigues', 'Gomes', 'Barbosa'];
$neighborhoods = ['Centro', 'Aldeia', 'Santa Clara', 'Maracanã', 'Prainha', 'Jardim Santarém', 'Caranazal'];
$tags = array_column(fetchAllRows('SELECT id FROM tags WHERE company_id = ?', [$companyId]), 'id');
$reasons = array_column(fetchAllRows('SELECT id FROM loss_reasons WHERE company_id = ?', [$companyId]), 'id');
$clients = [];
for ($i = 0; $i < 160; $i++) {
    $created = date('Y-m-d H:i:s', strtotime('-' . mt_rand(0, 700) . ' days'));
    $clientId = insertRow('clients', [
        'company_id' => $companyId,
        'name' => $first[array_rand($first)] . ' ' . $last[array_rand($last)] . ' ' . $last[array_rand($last)],
        'cpf' => str_pad((string) mt_rand(10000000000, 99999999999), 11, '0', STR_PAD_LEFT),
        'birth_date' => date('Y-m-d', strtotime('-' . mt_rand(8 * 365, 75 * 365) . ' days')),
        'gender' => mt_rand(0, 1) ? 'F' : 'M',
        'whatsapp' => '5593' . '9' . mt_rand(10000000, 99999999),
        'neighborhood' => $neighborhoods[array_rand($neighborhoods)],
        'city' => mt_rand(0, 5) ? 'Santarém' : 'Belterra',
        'state' => 'PA',
        'origin' => ['Indicação', 'Instagram', 'Passou na frente', 'Google', 'Campanha WhatsApp'][mt_rand(0, 4)],
        'message_consent' => mt_rand(0, 4) ? 1 : 0,
        'message_consent_at' => $created,
        'created_at' => $created,
        'kind' => mt_rand(0, 9) ? 'client' : 'lead',
    ]);
    $clients[] = $clientId;
    if ($tags && mt_rand(0, 2) === 0) {
        executeQuery('INSERT IGNORE INTO client_tags (client_id, tag_id, company_id) VALUES (?, ?, ?)', [$clientId, $tags[array_rand($tags)], $companyId]);
    }
    if (mt_rand(0, 2)) {
        $prescribed = date('Y-m-d', strtotime('-' . mt_rand(10, 420) . ' days'));
        $grade = static fn() => (mt_rand(0, 1) ? '-' : '+') . number_format(mt_rand(0, 16) * 0.25, 2, ',', '');
        insertRow('prescriptions', [
            'company_id' => $companyId, 'client_id' => $clientId, 'prescribed_at' => $prescribed,
            'expires_at' => date('Y-m-d', strtotime($prescribed . ' +12 months')), 'doctor' => 'Dr. Oftalmologista',
            'od_sph' => $grade(), 'od_cyl' => '-' . number_format(mt_rand(0, 8) * 0.25, 2, ',', ''), 'od_axis' => (string) (mt_rand(0, 18) * 10), 'od_dnp' => (string) mt_rand(29, 34),
            'oe_sph' => $grade(), 'oe_cyl' => '-' . number_format(mt_rand(0, 8) * 0.25, 2, ',', ''), 'oe_axis' => (string) (mt_rand(0, 18) * 10), 'oe_dnp' => (string) mt_rand(29, 34),
            'addition' => mt_rand(0, 3) ? '' : '+' . number_format(mt_rand(4, 12) * 0.25, 2, ',', ''),
        ]);
    }
}

$statuses = ['open', 'sent_to_lab', 'in_production', 'received_from_lab', 'ready', 'delivered'];
for ($i = 0; $i < 260; $i++) {
    $daysAgo = (int) floor(pow(mt_rand(0, 1000) / 1000, 1.6) * 400);
    $saleDate = date('Y-m-d', strtotime("-{$daysAgo} days"));
    $clientId = $clients[array_rand($clients)];
    $picked = [$products[array_rand(array_slice($products, 0, 5, true))], $products[5 + mt_rand(0, 3)]];
    if (mt_rand(0, 3) === 0) {
        $picked[] = $products[12 + mt_rand(0, 1)];
    }
    $items = [];
    $subtotal = 0;
    foreach ($picked as $position => $product) {
        $items[] = ['product_id' => $product['id'], 'description' => $product['name'], 'quantity' => 1, 'unit_price' => $product['price'], 'discount' => 0, 'total' => $product['price'], 'position' => $position];
        $subtotal += $product['price'];
    }
    $discount = mt_rand(0, 2) ? 0 : round($subtotal * 0.1, 2);
    $total = $subtotal - $discount;
    $paid = $daysAgo > 60 || mt_rand(0, 1) ? $total : round($total * 0.4, 2);
    $number = reserveNumber($companyId, 'sale');
    $saleId = insertRow('sales', [
        'company_id' => $companyId, 'number' => $number, 'client_id' => $clientId, 'seller_id' => $users[array_rand($users)],
        'sale_date' => $saleDate, 'delivery_date' => date('Y-m-d', strtotime($saleDate . ' +7 days')), 'subtotal' => $subtotal,
        'discount' => $discount, 'total' => $total, 'paid' => $paid, 'created_at' => $saleDate . ' ' . sprintf('%02d:%02d:00', mt_rand(9, 18), mt_rand(0, 59)),
        'prescription_id' => fetchValue('SELECT id FROM prescriptions WHERE client_id = ? ORDER BY id DESC LIMIT 1', [$clientId]),
    ]);
    foreach ($items as $item) {
        insertRow('sale_items', ['company_id' => $companyId, 'sale_id' => $saleId, ...$item]);
    }
    $method = ['pix', 'cartao_credito', 'dinheiro', 'crediario', 'cartao_debito'][mt_rand(0, 4)];
    insertRow('sale_payments', ['company_id' => $companyId, 'sale_id' => $saleId, 'method' => $method, 'amount' => $paid, 'installment' => 1, 'due_date' => $saleDate, 'paid_at' => $saleDate]);
    if ($paid < $total) {
        insertRow('sale_payments', ['company_id' => $companyId, 'sale_id' => $saleId, 'method' => 'crediario', 'amount' => $total - $paid, 'installment' => 2, 'due_date' => date('Y-m-d', strtotime($saleDate . ' +30 days'))]);
    }
    if ($daysAgo < 25) {
        $status = $statuses[min(5, (int) floor((25 - $daysAgo) / 4))];
        $orderNumber = reserveNumber($companyId, 'order');
        $orderId = insertRow('service_orders', [
            'company_id' => $companyId, 'number' => $orderNumber, 'sale_id' => $saleId, 'client_id' => $clientId, 'laboratory_id' => $lab,
            'status' => $status, 'lens_description' => $items[1]['description'], 'frame_description' => $items[0]['description'],
            'promised_date' => date('Y-m-d', strtotime($saleDate . ' +7 days')), 'created_at' => $saleDate . ' 10:00:00',
        ]);
        insertRow('service_order_events', ['company_id' => $companyId, 'service_order_id' => $orderId, 'status' => 'open', 'notes' => 'OS aberta a partir da venda.']);
        if ($status !== 'open') {
            insertRow('service_order_events', ['company_id' => $companyId, 'service_order_id' => $orderId, 'status' => $status, 'notes' => '']);
        }
    }
}

for ($i = 0; $i < 45; $i++) {
    $date = date('Y-m-d', strtotime('-' . mt_rand(0, 120) . ' days'));
    $product = $products[mt_rand(0, 9)];
    $status = ['open', 'sent', 'lost', 'converted', 'lost', 'open'][mt_rand(0, 5)];
    $reason = $status === 'lost' ? $reasons[array_rand($reasons)] : null;
    $clientId = $clients[array_rand($clients)];
    $quoteId = insertRow('quotes', [
        'company_id' => $companyId, 'number' => reserveNumber($companyId, 'quote'), 'client_id' => $clientId, 'seller_id' => $users[0],
        'status' => $status, 'quote_date' => $date, 'valid_until' => date('Y-m-d', strtotime($date . ' +15 days')),
        'subtotal' => $product['price'], 'total' => $product['price'], 'loss_reason_id' => $reason,
    ]);
    insertRow('quote_items', ['company_id' => $companyId, 'quote_id' => $quoteId, 'product_id' => $product['id'], 'description' => $product['name'], 'quantity' => 1, 'unit_price' => $product['price'], 'total' => $product['price']]);
    if ($reason) {
        insertRow('lost_opportunities', ['company_id' => $companyId, 'client_id' => $clientId, 'reason_id' => $reason, 'quote_id' => $quoteId, 'estimated_value' => $product['price'], 'occurred_at' => $date]);
    }
}
for ($i = 0; $i < 20; $i++) {
    insertRow('lost_opportunities', [
        'company_id' => $companyId, 'contact_name' => $first[array_rand($first)] . ' ' . $last[array_rand($last)],
        'contact_phone' => '55939' . mt_rand(10000000, 99999999), 'reason_id' => $reasons[array_rand($reasons)],
        'estimated_value' => mt_rand(150, 1500), 'occurred_at' => date('Y-m-d', strtotime('-' . mt_rand(0, 90) . ' days')),
    ]);
}
foreach (array_slice($clients, 0, 80) as $clientId) {
    insertRow('interactions', [
        'company_id' => $companyId, 'client_id' => $clientId, 'channel' => ['whatsapp', 'phone', 'visit'][mt_rand(0, 2)],
        'subject' => ['Dúvida sobre lentes', 'Retorno de orçamento', 'Ajuste de armação', 'Aviso de óculos pronto'][mt_rand(0, 3)],
        'contact_at' => date('Y-m-d H:i:s', strtotime('-' . mt_rand(0, 200) . ' days')),
    ]);
}
executeQuery('UPDATE products p SET stock = GREATEST(stock, 0) WHERE company_id = ?', [$companyId]);
insertRow('automations', [
    'company_id' => $companyId, 'name' => 'Parabéns no aniversário', 'trigger_type' => 'birthday', 'trigger_config' => jsonColumn(['days' => 0, 'time' => '09:00']),
    'action_type' => 'send_message', 'action_config' => jsonColumn(['message' => 'Feliz aniversário, {{primeiro_nome}}! 🎉 A {{otica}} preparou um presente para você neste mês.']), 'mode' => 'semi',
]);
insertRow('automations', [
    'company_id' => $companyId, 'name' => 'Pós-venda 7 dias', 'trigger_type' => 'post_sale', 'trigger_config' => jsonColumn(['days' => 7]),
    'action_type' => 'send_message', 'action_config' => jsonColumn(['message' => 'Olá, {{primeiro_nome}}! Como está a adaptação com seus óculos novos? Qualquer ajuste, é só chamar a {{otica}}.']), 'mode' => 'semi',
]);
generateTasks($companyId);
echo "Ótica Demonstração criada (id {$companyId}). Acesso: demo@ocular.local / demo1234\n";
