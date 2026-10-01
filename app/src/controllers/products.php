<?php
declare(strict_types=1);

function handleProducts(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        sendJson(
            executeQuery(
                <<<'SQL'
                SELECT
                  *
                FROM
                  products
                WHERE
                  company_id = ?
                ORDER BY
                  id DESC
                SQL
                ,
                [$companyId],
            )->fetchAll(),
        );
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    executeQuery(
        <<<'SQL'
        INSERT INTO
          products (company_id, name, category, price, stock)
        VALUES
          (?, ?, ?, ?, ?)
        SQL
        ,
        [
            $companyId,
            requiredText($input, 'name'),
            requiredText($input, 'category', 60),
            moneyToCents($input['price'] ?? '') / 100,
            validatedInteger($input['stock'] ?? 0, 0),
        ],
    );
    sendJson(['ok' => true], 201);
}
