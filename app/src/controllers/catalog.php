<?php
declare(strict_types=1);

function handlePartners(string $method, array $input): never
{
    $companyId = Context::companyId();
    $id = routeId();
    if ($method === 'GET' && $id) {
        $partner = requireCompanyRecord('partners', $id, $companyId, 'Fornecedor');
        $partner['products'] = fetchAllRows('SELECT id, name, stock, price FROM products WHERE company_id = ? AND supplier_id = ? ORDER BY name LIMIT 200', [$companyId, $id]);
        $partner['orders'] = fetchAllRows(
            'SELECT o.id, o.number, o.status, o.promised_date, c.name AS client FROM service_orders o LEFT JOIN clients c ON c.id = o.client_id
             WHERE o.company_id = ? AND o.laboratory_id = ? ORDER BY o.id DESC LIMIT 100',
            [$companyId, $id],
        );
        sendJson($partner);
    }
    if ($method === 'GET') {
        $where = 'WHERE p.company_id = ?';
        $params = [$companyId];
        if ($type = query('type')) {
            $where .= " AND (p.type = ? OR p.type = 'both')";
            $params[] = $type;
        }
        if ($q = query('q')) {
            $where .= ' AND (p.name LIKE ? OR p.trade_name LIKE ? OR p.document LIKE ? OR p.contact_name LIKE ?)';
            array_push($params, likeTerm($q), likeTerm($q), likeTerm($q), likeTerm($q));
        }
        if (query('active', '1') === '1') {
            $where .= ' AND p.active = 1';
        }
        sendJson(
            paginate(
                'SELECT p.*, (SELECT COUNT(*) FROM products pr WHERE pr.supplier_id = p.id) AS products_count',
                "FROM partners p {$where}",
                $params,
                sortClause(['name' => 'p.name', 'type' => 'p.type'], 'p.name ASC'),
                1000,
            ),
        );
    }
    requirePermission('sell');
    if ($method === 'DELETE') {
        $partner = requireCompanyRecord('partners', requireRouteId(), $companyId, 'Fornecedor');
        executeQuery('UPDATE partners SET active = 0 WHERE id = ? AND company_id = ?', [$partner['id'], $companyId]);
        auditLog('delete', 'partner', (int) $partner['id'], 'Fornecedor desativado: ' . $partner['name']);
        sendJson(['ok' => true]);
    }
    $values = [
        'type' => enumValue($input, 'type', ['supplier', 'laboratory', 'both'], 'supplier'),
        'name' => requiredText($input, 'name', 150, 'nome'),
        'trade_name' => optionalText($input, 'trade_name', 150),
        'document' => optionalText($input, 'document', 30),
        'contact_name' => optionalText($input, 'contact_name', 120),
        'phone' => optionalText($input, 'phone', 30),
        'whatsapp' => normalizePhone(optionalText($input, 'whatsapp', 30), (string) companySetting('default_ddd', '')),
        'email' => optionalEmail($input),
        'address' => optionalText($input, 'address', 190),
        'city' => optionalText($input, 'city', 100),
        'state' => strtoupper(optionalText($input, 'state', 2)),
        'notes' => optionalText($input, 'notes', 5000),
        'active' => array_key_exists('active', $input) ? booleanValue($input, 'active') : 1,
    ];
    if ($method === 'PATCH') {
        $before = requireCompanyRecord('partners', requireRouteId(), $companyId, 'Fornecedor');
        updateRow('partners', (int) $before['id'], $companyId, $values);
        auditLog('update', 'partner', (int) $before['id'], 'Fornecedor atualizado: ' . $values['name'], changedFields($before, $values));
        sendJson(['ok' => true]);
    }
    $partnerId = insertRow('partners', ['company_id' => $companyId, ...$values]);
    auditLog('create', 'partner', $partnerId, 'Fornecedor cadastrado: ' . $values['name']);
    sendJson(['ok' => true, 'id' => $partnerId], 201);
}

function handleProducts(string $method, array $input): never
{
    $companyId = Context::companyId();
    $id = routeId();
    if ($method === 'GET' && $id) {
        $product = requireCompanyRecord('products', $id, $companyId, 'Produto');
        $product['supplier_name'] = $product['supplier_id'] ? fetchValue('SELECT name FROM partners WHERE id = ?', [$product['supplier_id']]) : null;
        $product['movements'] = fetchAllRows(
            'SELECT m.*, u.name AS user_name FROM stock_movements m LEFT JOIN users u ON u.id = m.user_id
             WHERE m.company_id = ? AND m.product_id = ? ORDER BY m.id DESC LIMIT 100',
            [$companyId, $id],
        );
        $product['sales_stats'] = fetchOne(
            "SELECT COALESCE(SUM(si.quantity), 0) AS quantity, COALESCE(SUM(si.total), 0) AS total, MAX(s.sale_date) AS last_sale
             FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.company_id = ? AND si.product_id = ? AND s.status <> 'cancelled'",
            [$companyId, $id],
        );
        sendJson($product);
    }
    if ($method === 'GET') {
        $where = 'WHERE p.company_id = ?';
        $params = [$companyId];
        if ($q = query('q')) {
            $where .= ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode = ? OR p.brand LIKE ? OR p.model LIKE ?)';
            array_push($params, likeTerm($q), likeTerm($q), $q, likeTerm($q), likeTerm($q));
        }
        if ($category = query('category')) {
            $where .= ' AND p.category = ?';
            $params[] = $category;
        }
        if ($supplier = queryInt('supplier_id')) {
            $where .= ' AND p.supplier_id = ?';
            $params[] = $supplier;
        }
        if (query('low_stock') === '1') {
            $where .= ' AND p.track_stock = 1 AND p.stock <= p.min_stock';
        }
        $active = query('active', '1');
        if ($active !== 'all') {
            $where .= ' AND p.active = ?';
            $params[] = (int) $active;
        }
        $result = paginate(
            'SELECT p.id, p.sku, p.barcode, p.name, p.category, p.brand, p.model, p.color, p.cost, p.price, p.stock, p.min_stock,
                    p.track_stock, p.active, p.supplier_id, s.name AS supplier_name',
            "FROM products p LEFT JOIN partners s ON s.id = p.supplier_id {$where}",
            $params,
            sortClause(['name' => 'p.name', 'stock' => 'p.stock', 'price' => 'p.price', 'category' => 'p.category'], 'p.name ASC'),
            500,
        );
        if (query('with_meta') === '1') {
            $result['categories'] = array_column(fetchAllRows("SELECT DISTINCT category FROM products WHERE company_id = ? AND category <> '' ORDER BY category", [$companyId]), 'category');
            $result['summary'] = fetchOne(
                'SELECT COUNT(*) AS products, COALESCE(SUM(CASE WHEN track_stock = 1 THEN stock END), 0) AS units,
                        COALESCE(SUM(CASE WHEN track_stock = 1 AND stock > 0 THEN stock * cost END), 0) AS cost_value,
                        COALESCE(SUM(CASE WHEN track_stock = 1 AND stock > 0 THEN stock * price END), 0) AS sale_value,
                        SUM(track_stock = 1 AND stock <= min_stock) AS low_stock
                 FROM products WHERE company_id = ? AND active = 1',
                [$companyId],
            );
        }
        sendJson($result);
    }
    requirePermission('sell');
    if ($method === 'DELETE') {
        $product = requireCompanyRecord('products', requireRouteId(), $companyId, 'Produto');
        executeQuery('UPDATE products SET active = 0 WHERE id = ? AND company_id = ?', [$product['id'], $companyId]);
        auditLog('delete', 'product', (int) $product['id'], 'Produto desativado: ' . $product['name']);
        sendJson(['ok' => true]);
    }
    $values = productValues($input, $companyId);
    if ($method === 'PATCH') {
        $before = requireCompanyRecord('products', requireRouteId(), $companyId, 'Produto');
        unset($values['stock']);
        updateRow('products', (int) $before['id'], $companyId, $values);
        auditLog('update', 'product', (int) $before['id'], 'Produto atualizado: ' . $values['name'], changedFields($before, $values));
        sendJson(['ok' => true]);
    }
    $productId = inTransaction(static function () use ($companyId, $values): int {
        $initialStock = $values['stock'];
        $values['stock'] = 0;
        $productId = insertRow('products', ['company_id' => $companyId, ...$values]);
        if ($initialStock !== 0) {
            moveStock($companyId, $productId, 'in', $initialStock, 'Estoque inicial');
        }
        return $productId;
    });
    auditLog('create', 'product', $productId, 'Produto cadastrado: ' . $values['name']);
    sendJson(['ok' => true, 'id' => $productId], 201);
}

function productValues(array $input, int $companyId): array
{
    return [
        'sku' => optionalText($input, 'sku', 60),
        'barcode' => optionalText($input, 'barcode', 60),
        'name' => requiredText($input, 'name', 190, 'nome'),
        'category' => optionalText($input, 'category', 60),
        'brand' => optionalText($input, 'brand', 80),
        'model' => optionalText($input, 'model', 80),
        'color' => optionalText($input, 'color', 60),
        'size' => optionalText($input, 'size', 30),
        'unit' => optionalText($input, 'unit', 10) ?: 'UN',
        'cost' => moneyValue($input, 'cost'),
        'price' => moneyValue($input, 'price'),
        'stock' => (int) ($input['stock'] ?? 0),
        'min_stock' => max(0, (int) ($input['min_stock'] ?? 0)),
        'track_stock' => array_key_exists('track_stock', $input) ? booleanValue($input, 'track_stock') : 1,
        'supplier_id' => optionalCompanyReference($input, 'supplier_id', 'partners', $companyId, 'Fornecedor'),
        'description' => optionalText($input, 'description', 5000),
        'active' => array_key_exists('active', $input) ? booleanValue($input, 'active') : 1,
    ];
}

/**
 * Movimenta o estoque e registra o histórico. Deve ser chamada dentro de transação.
 * Quantidade positiva soma; negativa subtrai. "adjust" define o saldo absoluto.
 */
function moveStock(int $companyId, int $productId, string $type, float|int $quantity, string $reason, string $refType = '', ?int $refId = null, ?float $unitCost = null): void
{
    $product = fetchOne('SELECT id, stock, track_stock FROM products WHERE id = ? AND company_id = ? FOR UPDATE', [$productId, $companyId]);
    if (!$product || !$product['track_stock']) {
        return;
    }
    $quantity = (int) round($quantity);
    $balance = $type === 'adjust' ? $quantity : (int) $product['stock'] + $quantity;
    $delta = $type === 'adjust' ? $balance - (int) $product['stock'] : $quantity;
    executeQuery('UPDATE products SET stock = ? WHERE id = ? AND company_id = ?', [$balance, $productId, $companyId]);
    insertRow('stock_movements', [
        'company_id' => $companyId,
        'product_id' => $productId,
        'type' => $type,
        'quantity' => $delta,
        'balance_after' => $balance,
        'unit_cost' => $unitCost,
        'reason' => mb_substr($reason, 0, 255),
        'ref_type' => $refType,
        'ref_id' => $refId,
        'user_id' => Context::userId(),
    ]);
    if ($type === 'in' && $unitCost !== null && $unitCost > 0) {
        executeQuery('UPDATE products SET cost = ? WHERE id = ? AND company_id = ?', [$unitCost, $productId, $companyId]);
    }
}

function handleStock(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        $where = 'WHERE m.company_id = ?';
        $params = [$companyId];
        if ($productId = queryInt('product_id')) {
            $where .= ' AND m.product_id = ?';
            $params[] = $productId;
        }
        if ($type = query('type')) {
            $where .= ' AND m.type = ?';
            $params[] = $type;
        }
        sendJson(
            paginate(
                'SELECT m.*, p.name AS product_name, u.name AS user_name',
                "FROM stock_movements m JOIN products p ON p.id = m.product_id LEFT JOIN users u ON u.id = m.user_id {$where}",
                $params,
                'm.id DESC',
            ),
        );
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    requirePermission('sell');
    $type = enumValue($input, 'type', ['in', 'out', 'adjust'], 'in');
    $items = is_array($input['items'] ?? null) ? $input['items'] : [['product_id' => $input['product_id'] ?? 0, 'quantity' => $input['quantity'] ?? 0, 'unit_cost' => $input['unit_cost'] ?? null]];
    $reason = optionalText($input, 'reason', 255) ?: ['in' => 'Entrada de mercadoria', 'out' => 'Saída manual', 'adjust' => 'Ajuste de inventário'][$type];
    inTransaction(static function () use ($items, $companyId, $type, $reason): void {
        foreach ($items as $item) {
            $product = requireCompanyRecord('products', $item['product_id'] ?? 0, $companyId, 'Produto');
            $quantity = (int) ($item['quantity'] ?? 0);
            if ($type !== 'adjust' && $quantity <= 0) {
                sendError('Quantidade inválida para ' . $product['name']);
            }
            $unitCost = isset($item['unit_cost']) && $item['unit_cost'] !== '' ? parseMoney($item['unit_cost']) : null;
            moveStock($companyId, (int) $product['id'], $type, $type === 'out' ? -$quantity : $quantity, $reason, 'manual', null, $unitCost);
        }
    });
    auditLog('stock_' . $type, 'product', null, $reason . ' (' . count($items) . ' item(ns))', $items);
    sendJson(['ok' => true]);
}
