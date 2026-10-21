<?php
declare(strict_types=1);

function handleClients(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        sendJson(
            executeQuery(
                <<<'SQL'
                SELECT
                  c.*,
                  (
                    SELECT MAX(s.created_at)
                    FROM sales s
                    WHERE s.client_id = c.id
                      AND s.company_id = c.company_id
                  ) AS last_purchase
                FROM
                  clients c
                WHERE
                  c.company_id = ?
                ORDER BY
                  c.id DESC
                SQL
                ,
                [$companyId],
            )->fetchAll(),
        );
    }
    if (!in_array($method, ['POST', 'PATCH'], true)) {
        sendError('Método não permitido.', 405);
    }

    $values = [
        requiredText($input, 'name'),
        substr(trim((string) ($input['phone'] ?? '')), 0, 30),
        optionalEmail($input),
        optionalDate($input, 'birth_date'),
        optionalDate($input, 'next_contact_date'),
        substr(trim((string) ($input['notes'] ?? '')), 0, 2000),
    ];
    if ($method === 'PATCH') {
        $clientId = validatedInteger($input['id'] ?? 0);
        $statement = executeQuery(
            <<<'SQL'
            UPDATE clients
            SET name = ?, phone = ?, email = ?, birth_date = ?, next_contact_date = ?, notes = ?
            WHERE id = ?
              AND company_id = ?
            SQL
            ,
            [...$values, $clientId, $companyId],
        );
        if ($statement->rowCount() === 0) {
            $exists = executeQuery('SELECT id FROM clients WHERE id = ? AND company_id = ?', [
                $clientId,
                $companyId,
            ])->fetch();
            if (!$exists) {
                sendError('Cliente não encontrado.', 404);
            }
        }
        sendJson(['ok' => true]);
    }
    executeQuery(
        <<<'SQL'
        INSERT INTO
          clients (
            company_id,
            name,
            phone,
            email,
            birth_date,
            next_contact_date,
            notes
          )
        VALUES
          (?, ?, ?, ?, ?, ?, ?)
        SQL
        ,
        [$companyId, ...$values],
    );
    sendJson(['ok' => true], 201);
}
