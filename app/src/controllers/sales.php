<?php
declare(strict_types=1);

const PAYMENT_METHODS = [
    'dinheiro' => 'Dinheiro',
    'pix' => 'PIX',
    'cartao_credito' => 'Cartão de crédito',
    'cartao_debito' => 'Cartão de débito',
    'boleto' => 'Boleto',
    'crediario' => 'Crediário',
    'cheque' => 'Cheque',
    'convenio' => 'Convênio',
    'outro' => 'Outro',
];

/**
 * Valida os itens de venda/orçamento. Itens podem apontar para um produto ou ser livres
 * (somente descrição), pois a venda não é fiscal.
 */
function parseDocumentItems($rawItems, int $companyId): array
{
    if (!is_array($rawItems) || count($rawItems) < 1 || count($rawItems) > 100) {
        sendError('Adicione entre 1 e 100 itens.');
    }
    $items = [];
    $subtotal = 0.0;
    foreach (array_values($rawItems) as $position => $item) {
        if (!is_array($item)) {
            sendError('Item inválido.');
        }
        $product = null;
        if (!empty($item['product_id'])) {
            $product = requireCompanyRecord('products', $item['product_id'], $companyId, 'Produto');
        }
        $description = trim((string) ($item['description'] ?? '')) ?: ($product['name'] ?? '');
        if ($description === '') {
            sendError('Informe a descrição do item ' . ($position + 1) . '.');
        }
        $quantity = quantityValue($item['quantity'] ?? 1);
        $unitPrice = parseMoney($item['unit_price'] ?? ($product['price'] ?? 0));
        $discount = parseMoney($item['discount'] ?? 0);
        if ($unitPrice < 0 || $discount < 0) {
            sendError('Valores do item ' . ($position + 1) . ' inválidos.');
        }
        $total = round($quantity * $unitPrice - $discount, 2);
        if ($total < 0) {
            sendError('O desconto do item ' . ($position + 1) . ' supera o valor do item.');
        }
        $subtotal += $total;
        $items[] = [
            'product_id' => $product ? (int) $product['id'] : null,
            'description' => mb_substr($description, 0, 255),
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
            'discount' => $discount,
            'total' => $total,
            'position' => $position,
        ];
    }
    return [$items, round($subtotal, 2)];
}

function parsePayments($rawPayments, float $total): array
{
    if (!is_array($rawPayments)) {
        return [];
    }
    $payments = [];
    foreach (array_values($rawPayments) as $index => $payment) {
        $amount = parseMoney($payment['amount'] ?? 0);
        if ($amount <= 0) {
            continue;
        }
        $method = (string) ($payment['method'] ?? 'dinheiro');
        $payments[] = [
            'method' => isset(PAYMENT_METHODS[$method]) ? $method : 'outro',
            'amount' => $amount,
            'installment' => max(1, (int) ($payment['installment'] ?? $index + 1)),
            'due_date' => normalizeDate($payment['due_date'] ?? ''),
            'paid_at' => normalizeDate($payment['paid_at'] ?? ''),
            'notes' => mb_substr(trim((string) ($payment['notes'] ?? '')), 0, 255),
        ];
    }
    $sum = array_sum(array_column($payments, 'amount'));
    if ($sum - $total > 0.009) {
        sendError('A soma dos pagamentos (' . money($sum) . ') supera o total (' . money($total) . ').');
    }
    return $payments;
}

function handleSales(string $method, array $input): never
{
    $companyId = Context::companyId();
    $id = routeId();
    if ($method === 'GET' && $id) {
        sendJson(saleDetail($id, $companyId));
    }
    if ($method === 'GET') {
        $where = 'WHERE s.company_id = ?';
        $params = [$companyId];
        if ($q = query('q')) {
            $where .= ' AND (c.name LIKE ? OR s.number = ? OR c.cpf = ?)';
            array_push($params, likeTerm($q), ctype_digit($q) ? (int) $q : -1, onlyDigits($q));
        }
        foreach (['status' => 's.status', 'client_id' => 's.client_id', 'seller_id' => 's.seller_id'] as $key => $column) {
            if ($value = query($key)) {
                $where .= " AND {$column} = ?";
                $params[] = $value;
            }
        }
        if ($from = normalizeDate(query('from', ''))) {
            $where .= ' AND s.sale_date >= ?';
            $params[] = $from;
        }
        if ($to = normalizeDate(query('to', ''))) {
            $where .= ' AND s.sale_date <= ?';
            $params[] = $to;
        }
        if (query('balance') === '1') {
            $where .= ' AND s.total - s.paid > 0.009';
        }
        $from = "FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.seller_id {$where}";
        $result = paginate(
            'SELECT s.id, s.number, s.sale_date, s.delivery_date, s.status, s.subtotal, s.discount, s.total, s.paid,
                    s.client_id, c.name AS client_name, c.whatsapp AS client_whatsapp, u.name AS seller_name,
                    (SELECT COUNT(*) FROM service_orders o WHERE o.sale_id = s.id) AS orders_count',
            $from,
            $params,
            sortClause(['number' => 's.number', 'sale_date' => 's.sale_date', 'total' => 's.total', 'client' => 'c.name'], 's.sale_date DESC, s.number DESC'),
        );
        $result['summary'] = fetchOne(
            "SELECT COUNT(*) AS count, COALESCE(SUM(s.total), 0) AS total, COALESCE(SUM(s.paid), 0) AS paid
             {$from} AND s.status <> 'cancelled'",
            $params,
        );
        sendJson($result);
    }

    if ($method === 'PATCH' && ($input['action'] ?? '') === 'cancel') {
        requirePermission('manage');
        $sale = requireCompanyRecord('sales', requireRouteId(), $companyId, 'Venda');
        if ($sale['status'] === 'cancelled') {
            sendError('Esta venda já está cancelada.');
        }
        $reason = requiredText($input, 'reason', 255, 'motivo do cancelamento');
        inTransaction(static function () use ($sale, $companyId, $reason): void {
            restockSale($companyId, $sale, 'Cancelamento da venda nº ' . $sale['number']);
            executeQuery("UPDATE sales SET status = 'cancelled', cancel_reason = ? WHERE id = ? AND company_id = ?", [$reason, $sale['id'], $companyId]);
        });
        auditLog('cancel', 'sale', (int) $sale['id'], 'Venda nº ' . $sale['number'] . ' cancelada: ' . $reason);
        emitEvent($companyId, 'sale.cancelled', ['id' => (int) $sale['id'], 'number' => (int) $sale['number'], 'reason' => $reason]);
        sendJson(['ok' => true]);
    }
    if ($method === 'PATCH' && ($input['action'] ?? '') === 'receive') {
        // Baixa de parcela: marca o pagamento como recebido e recalcula o total pago.
        requirePermission('sell');
        $sale = requireCompanyRecord('sales', requireRouteId(), $companyId, 'Venda');
        $paymentId = validatedInteger($input['payment_id'] ?? 0);
        $paidAt = optionalDate($input, 'paid_at') ?? date('Y-m-d');
        executeQuery('UPDATE sale_payments SET paid_at = ? WHERE id = ? AND sale_id = ? AND company_id = ?', [$paidAt, $paymentId, $sale['id'], $companyId]);
        refreshSalePaid((int) $sale['id'], $companyId);
        auditLog('receive', 'sale', (int) $sale['id'], 'Recebimento registrado na venda nº ' . $sale['number']);
        sendJson(['ok' => true]);
    }

    requirePermission('sell');
    if (!in_array($method, ['POST', 'PATCH'], true)) {
        sendError('Método não permitido.', 405);
    }
    $data = saleInput($input, $companyId);

    if ($method === 'PATCH') {
        $before = requireCompanyRecord('sales', requireRouteId(), $companyId, 'Venda');
        if ($before['status'] === 'cancelled') {
            sendError('Vendas canceladas não podem ser alteradas.');
        }
        inTransaction(static function () use ($before, $companyId, $data): void {
            restockSale($companyId, $before, 'Alteração da venda nº ' . $before['number']);
            updateRow('sales', (int) $before['id'], $companyId, $data['sale']);
            executeQuery('DELETE FROM sale_items WHERE sale_id = ? AND company_id = ?', [$before['id'], $companyId]);
            executeQuery('DELETE FROM sale_payments WHERE sale_id = ? AND company_id = ?', [$before['id'], $companyId]);
            writeSaleChildren((int) $before['id'], (int) $before['number'], $companyId, $data);
        });
        auditLog('update', 'sale', (int) $before['id'], 'Venda nº ' . $before['number'] . ' alterada', changedFields($before, $data['sale']));
        sendJson(['ok' => true, 'id' => (int) $before['id']]);
    }

    [$saleId, $number, $orderId] = inTransaction(static function () use ($companyId, $data, $input): array {
        $number = !empty($input['number']) ? validatedInteger($input['number']) : reserveNumber($companyId, 'sale');
        if (!empty($input['number']) && fetchValue('SELECT 1 FROM sales WHERE company_id = ? AND number = ?', [$companyId, $number])) {
            sendError("Já existe uma venda com o número {$number}.");
        }
        $saleId = insertRow('sales', [
            'company_id' => $companyId,
            'number' => $number,
            ...$data['sale'],
            'created_by' => Context::userId(),
        ]);
        writeSaleChildren($saleId, $number, $companyId, $data);
        if (!empty($data['sale']['quote_id'])) {
            executeQuery("UPDATE quotes SET status = 'converted', sale_id = ? WHERE id = ? AND company_id = ?", [$saleId, $data['sale']['quote_id'], $companyId]);
        }
        $orderId = null;
        if (!empty($input['create_service_order'])) {
            $orderInput = is_array($input['service_order'] ?? null) ? $input['service_order'] : [];
            $orderId = createServiceOrder($companyId, [
                ...$orderInput,
                'sale_id' => $saleId,
                'client_id' => $data['sale']['client_id'],
                'prescription_id' => $data['sale']['prescription_id'],
                'promised_date' => $orderInput['promised_date'] ?? $data['sale']['delivery_date'],
            ]);
        }
        return [$saleId, $number, $orderId];
    });
    auditLog('create', 'sale', $saleId, "Venda nº {$number} registrada: " . money($data['sale']['total']));
    if ($data['sale']['client_id']) {
        generateTasks($companyId, (int) $data['sale']['client_id']);
    }
    emitEvent($companyId, 'sale.created', ['id' => $saleId, 'number' => $number, 'client_id' => $data['sale']['client_id'], 'total' => $data['sale']['total']]);
    sendJson(['ok' => true, 'id' => $saleId, 'number' => $number, 'service_order_id' => $orderId], 201);
}

function saleInput(array $input, int $companyId): array
{
    [$items, $subtotal] = parseDocumentItems($input['items'] ?? null, $companyId);
    $discount = moneyValue($input, 'discount');
    if ($discount > $subtotal) {
        sendError('O desconto não pode superar o subtotal.');
    }
    $total = round($subtotal - $discount, 2);
    $payments = parsePayments($input['payments'] ?? [], $total);
    $paid = $payments
        ? array_sum(array_map(static fn($p) => $p['paid_at'] ? $p['amount'] : 0, $payments))
        : min($total, moneyValue($input, 'paid'));
    $clientId = optionalCompanyReference($input, 'client_id', 'clients', $companyId, 'Cliente');
    $sellerId = $input['seller_id'] ?? Context::userId();
    if ($sellerId && !fetchValue('SELECT 1 FROM company_users WHERE company_id = ? AND user_id = ?', [$companyId, $sellerId]) && !Context::isSuperadmin()) {
        $sellerId = Context::userId();
    }
    return [
        'items' => $items,
        'payments' => $payments,
        'sale' => [
            'client_id' => $clientId,
            'seller_id' => $sellerId ?: null,
            'quote_id' => optionalCompanyReference($input, 'quote_id', 'quotes', $companyId, 'Orçamento'),
            'prescription_id' => optionalCompanyReference($input, 'prescription_id', 'prescriptions', $companyId, 'Receita'),
            'status' => in_array($input['status'] ?? 'completed', ['open', 'completed'], true) ? ($input['status'] ?? 'completed') : 'completed',
            'sale_date' => optionalDate($input, 'sale_date') ?? date('Y-m-d'),
            'delivery_date' => optionalDate($input, 'delivery_date'),
            'subtotal' => $subtotal,
            'discount' => $discount,
            'total' => $total,
            'paid' => round($paid, 2),
            'payment_terms' => optionalText($input, 'payment_terms', 255),
            'notes' => optionalText($input, 'notes', 5000),
        ],
    ];
}

function writeSaleChildren(int $saleId, int $number, int $companyId, array $data): void
{
    foreach ($data['items'] as $item) {
        insertRow('sale_items', ['company_id' => $companyId, 'sale_id' => $saleId, ...$item]);
        if ($item['product_id']) {
            moveStock($companyId, $item['product_id'], 'sale', -$item['quantity'], "Venda nº {$number}", 'sale', $saleId);
        }
    }
    foreach ($data['payments'] as $payment) {
        insertRow('sale_payments', ['company_id' => $companyId, 'sale_id' => $saleId, ...$payment]);
    }
}

function restockSale(int $companyId, array $sale, string $reason): void
{
    $items = fetchAllRows('SELECT product_id, quantity FROM sale_items WHERE sale_id = ? AND company_id = ? AND product_id IS NOT NULL', [$sale['id'], $companyId]);
    foreach ($items as $item) {
        moveStock($companyId, (int) $item['product_id'], 'sale_cancel', (float) $item['quantity'], $reason, 'sale', (int) $sale['id']);
    }
}

function refreshSalePaid(int $saleId, int $companyId): void
{
    executeQuery(
        'UPDATE sales SET paid = (SELECT COALESCE(SUM(amount), 0) FROM sale_payments WHERE sale_id = ? AND paid_at IS NOT NULL) WHERE id = ? AND company_id = ?',
        [$saleId, $saleId, $companyId],
    );
}

function saleDetail(int $saleId, int $companyId): array
{
    $sale = fetchOne(
        'SELECT s.*, c.name AS client_name, c.whatsapp AS client_whatsapp, c.phone AS client_phone, c.cpf AS client_cpf,
                c.address AS client_address, c.number AS client_number, c.neighborhood AS client_neighborhood,
                c.city AS client_city, c.state AS client_state, c.birth_date AS client_birth_date, c.email AS client_email,
                u.name AS seller_name, q.number AS quote_number
         FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.seller_id
         LEFT JOIN quotes q ON q.id = s.quote_id
         WHERE s.id = ? AND s.company_id = ?',
        [$saleId, $companyId],
    );
    if (!$sale) {
        sendError('Venda não encontrada.', 404);
    }
    $sale['items'] = fetchAllRows(
        'SELECT si.*, p.sku, p.category FROM sale_items si LEFT JOIN products p ON p.id = si.product_id WHERE si.sale_id = ? ORDER BY si.position, si.id',
        [$saleId],
    );
    $sale['payments'] = fetchAllRows('SELECT * FROM sale_payments WHERE sale_id = ? ORDER BY installment, id', [$saleId]);
    $sale['prescription'] = $sale['prescription_id'] ? fetchOne('SELECT * FROM prescriptions WHERE id = ?', [$sale['prescription_id']]) : null;
    $sale['service_orders'] = fetchAllRows('SELECT id, number, status, promised_date FROM service_orders WHERE sale_id = ? AND company_id = ?', [$saleId, $companyId]);
    return $sale;
}

function handleQuotes(string $method, array $input): never
{
    $companyId = Context::companyId();
    $id = routeId();
    if ($method === 'GET' && $id) {
        sendJson(quoteDetail($id, $companyId));
    }
    if ($method === 'GET') {
        $where = 'WHERE q.company_id = ?';
        $params = [$companyId];
        if ($q = query('q')) {
            $where .= ' AND (c.name LIKE ? OR q.contact_name LIKE ? OR q.number = ?)';
            array_push($params, likeTerm($q), likeTerm($q), ctype_digit($q) ? (int) $q : -1);
        }
        if ($status = query('status')) {
            $where .= ' AND q.status = ?';
            $params[] = $status;
        }
        if ($clientId = queryInt('client_id')) {
            $where .= ' AND q.client_id = ?';
            $params[] = $clientId;
        }
        if ($from = normalizeDate(query('from', ''))) {
            $where .= ' AND q.quote_date >= ?';
            $params[] = $from;
        }
        if ($to = normalizeDate(query('to', ''))) {
            $where .= ' AND q.quote_date <= ?';
            $params[] = $to;
        }
        $from = "FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LEFT JOIN users u ON u.id = q.seller_id
                 LEFT JOIN loss_reasons r ON r.id = q.loss_reason_id {$where}";
        $result = paginate(
            'SELECT q.id, q.number, q.quote_date, q.valid_until, q.status, q.total, q.client_id,
                    COALESCE(c.name, q.contact_name) AS client_name, COALESCE(c.whatsapp, q.contact_phone) AS client_whatsapp,
                    u.name AS seller_name, r.name AS loss_reason, q.sale_id',
            $from,
            $params,
            sortClause(['number' => 'q.number', 'quote_date' => 'q.quote_date', 'total' => 'q.total'], 'q.quote_date DESC, q.number DESC'),
        );
        $result['summary'] = fetchAllRows("SELECT q.status, COUNT(*) AS count, COALESCE(SUM(q.total), 0) AS total {$from} GROUP BY q.status", $params);
        sendJson($result);
    }
    requirePermission('sell');
    $action = $input['action'] ?? '';

    if ($method === 'PATCH' && $action === 'lose') {
        $quote = requireCompanyRecord('quotes', requireRouteId(), $companyId, 'Orçamento');
        $reasonId = optionalCompanyReference($input, 'loss_reason_id', 'loss_reasons', $companyId, 'Motivo');
        $notes = optionalText($input, 'loss_notes', 500);
        inTransaction(static function () use ($quote, $companyId, $reasonId, $notes): void {
            executeQuery("UPDATE quotes SET status = 'lost', loss_reason_id = ?, loss_notes = ? WHERE id = ? AND company_id = ?", [$reasonId, $notes, $quote['id'], $companyId]);
            insertRow('lost_opportunities', [
                'company_id' => $companyId,
                'client_id' => $quote['client_id'],
                'contact_name' => $quote['contact_name'],
                'contact_phone' => $quote['contact_phone'],
                'reason_id' => $reasonId,
                'quote_id' => $quote['id'],
                'estimated_value' => $quote['total'],
                'notes' => $notes,
                'user_id' => Context::userId(),
                'occurred_at' => date('Y-m-d'),
            ]);
        });
        auditLog('lose', 'quote', (int) $quote['id'], 'Orçamento nº ' . $quote['number'] . ' marcado como perdido');
        emitEvent($companyId, 'quote.lost', ['id' => (int) $quote['id'], 'number' => (int) $quote['number'], 'reason_id' => $reasonId]);
        sendJson(['ok' => true]);
    }
    if ($method === 'PATCH' && $action === 'status') {
        $quote = requireCompanyRecord('quotes', requireRouteId(), $companyId, 'Orçamento');
        $status = enumValue($input, 'status', ['open', 'sent', 'approved', 'expired']);
        executeQuery('UPDATE quotes SET status = ? WHERE id = ? AND company_id = ?', [$status, $quote['id'], $companyId]);
        auditLog('status', 'quote', (int) $quote['id'], 'Orçamento nº ' . $quote['number'] . ': ' . $status);
        sendJson(['ok' => true]);
    }
    if ($method === 'DELETE') {
        requirePermission('manage');
        $quote = requireCompanyRecord('quotes', requireRouteId(), $companyId, 'Orçamento');
        if ($quote['sale_id']) {
            sendError('Orçamentos convertidos em venda não podem ser excluídos.');
        }
        executeQuery('DELETE FROM quotes WHERE id = ? AND company_id = ?', [$quote['id'], $companyId]);
        auditLog('delete', 'quote', (int) $quote['id'], 'Orçamento nº ' . $quote['number'] . ' excluído');
        sendJson(['ok' => true]);
    }

    [$items, $subtotal] = parseDocumentItems($input['items'] ?? null, $companyId);
    $discount = moneyValue($input, 'discount');
    if ($discount > $subtotal) {
        sendError('O desconto não pode superar o subtotal.');
    }
    $clientId = optionalCompanyReference($input, 'client_id', 'clients', $companyId, 'Cliente');
    $contactName = optionalText($input, 'contact_name', 150);
    if (!$clientId && $contactName === '') {
        sendError('Selecione o cliente ou informe o nome do contato.');
    }
    $quoteDate = optionalDate($input, 'quote_date') ?? date('Y-m-d');
    $validity = (int) companySetting('quote_validity_days', 15) ?: 15;
    $values = [
        'client_id' => $clientId,
        'contact_name' => $contactName,
        'contact_phone' => normalizePhone(optionalText($input, 'contact_phone', 30), (string) companySetting('default_ddd', '')),
        'seller_id' => $input['seller_id'] ?? Context::userId(),
        'prescription_id' => optionalCompanyReference($input, 'prescription_id', 'prescriptions', $companyId, 'Receita'),
        'quote_date' => $quoteDate,
        'valid_until' => optionalDate($input, 'valid_until') ?? date('Y-m-d', strtotime("{$quoteDate} +{$validity} days")),
        'subtotal' => $subtotal,
        'discount' => $discount,
        'total' => round($subtotal - $discount, 2),
        'notes' => optionalText($input, 'notes', 5000),
    ];
    if ($method === 'PATCH') {
        $before = requireCompanyRecord('quotes', requireRouteId(), $companyId, 'Orçamento');
        if (in_array($before['status'], ['converted'], true)) {
            sendError('Orçamentos convertidos não podem ser alterados.');
        }
        inTransaction(static function () use ($before, $companyId, $values, $items): void {
            updateRow('quotes', (int) $before['id'], $companyId, $values);
            executeQuery('DELETE FROM quote_items WHERE quote_id = ? AND company_id = ?', [$before['id'], $companyId]);
            foreach ($items as $item) {
                insertRow('quote_items', ['company_id' => $companyId, 'quote_id' => $before['id'], ...$item]);
            }
        });
        auditLog('update', 'quote', (int) $before['id'], 'Orçamento nº ' . $before['number'] . ' alterado');
        sendJson(['ok' => true, 'id' => (int) $before['id']]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    [$quoteId, $number] = inTransaction(static function () use ($companyId, $values, $items): array {
        $number = reserveNumber($companyId, 'quote');
        $quoteId = insertRow('quotes', ['company_id' => $companyId, 'number' => $number, 'status' => 'open', ...$values, 'created_by' => Context::userId()]);
        foreach ($items as $item) {
            insertRow('quote_items', ['company_id' => $companyId, 'quote_id' => $quoteId, ...$item]);
        }
        return [$quoteId, $number];
    });
    auditLog('create', 'quote', $quoteId, "Orçamento nº {$number}: " . money($values['total']));
    generateTasks($companyId, $clientId);
    emitEvent($companyId, 'quote.created', ['id' => $quoteId, 'number' => $number, 'client_id' => $clientId, 'total' => $values['total']]);
    sendJson(['ok' => true, 'id' => $quoteId, 'number' => $number], 201);
}

function quoteDetail(int $quoteId, int $companyId): array
{
    $quote = fetchOne(
        'SELECT q.*, c.name AS client_name, c.whatsapp AS client_whatsapp, c.phone AS client_phone, c.cpf AS client_cpf,
                c.address AS client_address, c.city AS client_city, u.name AS seller_name, r.name AS loss_reason, s.number AS sale_number
         FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LEFT JOIN users u ON u.id = q.seller_id
         LEFT JOIN loss_reasons r ON r.id = q.loss_reason_id LEFT JOIN sales s ON s.id = q.sale_id
         WHERE q.id = ? AND q.company_id = ?',
        [$quoteId, $companyId],
    );
    if (!$quote) {
        sendError('Orçamento não encontrado.', 404);
    }
    $quote['items'] = fetchAllRows('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY position, id', [$quoteId]);
    $quote['prescription'] = $quote['prescription_id'] ? fetchOne('SELECT * FROM prescriptions WHERE id = ?', [$quote['prescription_id']]) : null;
    return $quote;
}
