<?php
declare(strict_types=1);

function handleProducts(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        sendJson(
            executeQuery(
                <<<'SQL'
                SELECT
                  p.*,
                  partner.name AS supplier
                FROM
                  products p
                  LEFT JOIN partners partner
                    ON partner.id = p.supplier_id
                    AND partner.company_id = p.company_id
                WHERE
                  p.company_id = ?
                ORDER BY
                  p.id DESC
                SQL
                ,
                [$companyId],
            )->fetchAll(),
        );
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $supplierId = optionalCompanyPartner($input, 'supplier_id', $companyId, 'supplier');
    executeQuery(
        <<<'SQL'
        INSERT INTO
          products (company_id, name, category, price, stock, supplier_id)
        VALUES
          (?, ?, ?, ?, ?, ?)
        SQL
        ,
        [
            $companyId,
            requiredText($input, 'name'),
            requiredText($input, 'category', 60),
            moneyToCents($input['price'] ?? '') / 100,
            validatedInteger($input['stock'] ?? 0, 0),
            $supplierId,
        ],
    );
    sendJson(['ok' => true], 201);
}
