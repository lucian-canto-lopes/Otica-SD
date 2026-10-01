<?php
declare(strict_types=1);

function handleOrders(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        sendJson(
            executeQuery(
                <<<'SQL'
                SELECT
                  o.*,
                  c.name AS client
                FROM
                  orders o
                  JOIN clients c ON c.id = o.client_id
                WHERE
                  o.company_id = ?
                ORDER BY
                  o.id DESC
                SQL
                ,
                [$companyId],
            )->fetchAll(),
        );
    }
    if ($method === 'PATCH') {
        $status = $input['status'] ?? '';
        if (!in_array($status, ['received', 'production', 'ready', 'delivered'], true)) {
            sendError('Etapa inválida.');
        }
        executeQuery(
            <<<'SQL'
            UPDATE orders
            SET
              status = ?
            WHERE
              id = ?
              AND company_id = ?
            SQL
            ,
            [$status, validatedInteger($input['id'] ?? 0), $companyId],
        );
        sendJson(['ok' => true]);
    }
    $clientId = requireCompanyClient($input, $companyId);

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $input['delivery'] ?? '');
    if (!$date || $date->format('Y-m-d') !== $input['delivery']) {
        sendError('Data inválida.');
    }
    executeQuery(
        <<<'SQL'
        INSERT INTO
          orders (
            company_id,
            client_id,
            description,
            prescription,
            delivery
          )
        VALUES
          (?, ?, ?, ?, ?)
        SQL
        ,
        [
            $companyId,
            $clientId,
            requiredText($input, 'description', 500),
            substr($input['prescription'] ?? '', 0, 2000),
            $input['delivery'],
        ],
    );
    sendJson(['ok' => true], 201);
}
