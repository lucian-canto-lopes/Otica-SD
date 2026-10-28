<?php
declare(strict_types=1);

function handleSales(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        $sales = executeQuery(
            <<<'SQL'
            SELECT
              s.id,
              s.client_id,
              s.total,
              s.paid,
              s.payment_date,
              s.created_at,
              c.name AS client
            FROM sales s
            JOIN clients c
              ON c.id = s.client_id
              AND c.company_id = s.company_id
            WHERE s.company_id = ?
            ORDER BY s.id DESC
            SQL
            ,
            [$companyId],
        )->fetchAll();
        $items = executeQuery(
            <<<'SQL'
            SELECT
              item.id,
              item.sale_id,
              item.product_id,
              item.quantity,
              item.unit_price,
              item.subtotal,
              product.name AS product
            FROM sale_items item
            JOIN products product
              ON product.id = item.product_id
              AND product.company_id = item.company_id
            WHERE item.company_id = ?
            ORDER BY item.id
            SQL
            ,
            [$companyId],
        )->fetchAll();
        $itemsBySale = [];
        foreach ($items as $item) {
            $itemsBySale[(int) $item['sale_id']][] = $item;
        }
        foreach ($sales as &$sale) {
            $sale['items'] = $itemsBySale[(int) $sale['id']] ?? [];
            $sale['quantity'] = array_sum(
                array_map(static fn(array $item): int => (int) $item['quantity'], $sale['items']),
            );
        }
        unset($sale);
        sendJson($sales);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }

    $clientId = requireCompanyClient($input, $companyId);
    $requestedItems = $input['items'] ?? null;
    if (!is_array($requestedItems) || count($requestedItems) < 1 || count($requestedItems) > 50) {
        sendError('Adicione entre 1 e 50 itens à venda.');
    }

    // Produtos repetidos são agrupados para que estoque e total sejam calculados uma única vez.
    $quantitiesByProduct = [];
    foreach ($requestedItems as $item) {
        if (!is_array($item)) {
            sendError('Item de venda inválido.');
        }
        $productId = validatedInteger($item['product_id'] ?? 0);
        $quantity = validatedInteger($item['quantity'] ?? 0);
        $quantitiesByProduct[$productId] = ($quantitiesByProduct[$productId] ?? 0) + $quantity;
        if ($quantitiesByProduct[$productId] > 1000000) {
            sendError('Quantidade total do produto inválida.');
        }
    }
    ksort($quantitiesByProduct);

    $paidCents = moneyToCents($input['paid'] ?? '0');
    $paymentDate = requiredDate($input, 'payment_date');
    if ($paymentDate > date('Y-m-d')) {
        sendError('A data do pagamento não pode estar no futuro.');
    }
    database()->beginTransaction();
    $placeholders = implode(', ', array_fill(0, count($quantitiesByProduct), '?'));
    $products = executeQuery(
        "SELECT id, name, price, stock
         FROM products
         WHERE company_id = ? AND id IN ({$placeholders})
         ORDER BY id
         FOR UPDATE",
        [$companyId, ...array_keys($quantitiesByProduct)],
    )->fetchAll();
    if (count($products) !== count($quantitiesByProduct)) {
        database()->rollBack();
        sendError('Um ou mais produtos não estão disponíveis.');
    }

    $saleItems = [];
    $totalCents = 0;
    foreach ($products as $product) {
        $productId = (int) $product['id'];
        $quantity = $quantitiesByProduct[$productId];
        if ((int) $product['stock'] < $quantity) {
            database()->rollBack();
            sendError('Estoque insuficiente para: ' . $product['name'] . '.');
        }
        $unitPriceCents = moneyToCents($product['price']);
        $subtotalCents = $unitPriceCents * $quantity;
        $totalCents += $subtotalCents;
        if ($totalCents > 999999999999) {
            database()->rollBack();
            sendError('Total da venda inválido.');
        }
        $saleItems[] = [
            'product_id' => $productId,
            'quantity' => $quantity,
            'unit_price' => $unitPriceCents / 100,
            'subtotal' => $subtotalCents / 100,
        ];
    }
    if ($paidCents > $totalCents) {
        database()->rollBack();
        sendError('O valor pago não pode superar o total da venda.');
    }

    executeQuery(
        'INSERT INTO sales (company_id, client_id, total, paid, payment_date) VALUES (?, ?, ?, ?, ?)',
        [$companyId, $clientId, $totalCents / 100, $paidCents / 100, $paymentDate],
    );
    $saleId = (int) database()->lastInsertId();
    foreach ($saleItems as $item) {
        executeQuery('UPDATE products SET stock = stock - ? WHERE id = ? AND company_id = ?', [
            $item['quantity'],
            $item['product_id'],
            $companyId,
        ]);
        executeQuery(
            <<<'SQL'
            INSERT INTO sale_items (
              company_id,
              sale_id,
              product_id,
              quantity,
              unit_price,
              subtotal
            )
            VALUES (?, ?, ?, ?, ?, ?)
            SQL
            ,
            [
                $companyId,
                $saleId,
                $item['product_id'],
                $item['quantity'],
                $item['unit_price'],
                $item['subtotal'],
            ],
        );
    }
    prepareAutomaticReminders($companyId, $clientId, null, $saleId);
    database()->commit();

    sendJson(['ok' => true, 'id' => $saleId], 201);
}
