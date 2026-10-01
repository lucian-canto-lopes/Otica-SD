<?php
declare(strict_types=1);

function handleSales(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        sendJson(
            executeQuery(
                <<<'SQL'
                SELECT
                  s.*,
                  c.name AS client,
                  p.name AS product
                FROM
                  sales s
                  JOIN clients c ON c.id = s.client_id
                  JOIN products p ON p.id = s.product_id
                WHERE
                  s.company_id = ?
                ORDER BY
                  s.id DESC
                SQL
                ,
                [$companyId],
            )->fetchAll(),
        );
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $clientId = requireCompanyClient($input, $companyId);
    // A transação e o bloqueio FOR UPDATE mantêm a venda e o estoque consistentes.

    $quantity = validatedInteger($input['quantity'] ?? 0);
    $paidCents = moneyToCents($input['paid'] ?? '0');
    database()->beginTransaction();
    $product = executeQuery(
        <<<'SQL'
        SELECT
          *
        FROM
          products
        WHERE
          id = ?
          AND company_id = ? FOR
        UPDATE
        SQL
        ,
        [validatedInteger($input['product_id'] ?? 0), $companyId],
    )->fetch();
    if (!$product || $product['stock'] < $quantity) {
        database()->rollBack();
        sendError('Produto indisponível ou estoque insuficiente.');
    }
    $totalCents = moneyToCents($product['price']) * $quantity;
    if ($paidCents > $totalCents || $totalCents > 999999999999) {
        database()->rollBack();
        sendError('Valor pago ou total inválido.');
    }
    executeQuery(
        <<<'SQL'
        UPDATE products
        SET
          stock = stock - ?
        WHERE
          id = ?
        SQL
        ,
        [$quantity, $product['id']],
    );
    executeQuery(
        <<<'SQL'
        INSERT INTO
          sales (
            company_id,
            client_id,
            product_id,
            quantity,
            total,
            paid
          )
        VALUES
          (?, ?, ?, ?, ?, ?)
        SQL
        ,
        [$companyId, $clientId, $product['id'], $quantity, $totalCents / 100, $paidCents / 100],
    );
    database()->commit();

    sendJson(['ok' => true], 201);
}
