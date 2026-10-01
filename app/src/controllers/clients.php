<?php
declare(strict_types=1);

function handleClients(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        sendJson(
            executeQuery(
                <<<'SQL'
                SELECT
                  *
                FROM
                  clients
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
          clients (company_id, name, phone, notes)
        VALUES
          (?, ?, ?, ?)
        SQL
        ,
        [
            $companyId,
            requiredText($input, 'name'),
            substr($input['phone'] ?? '', 0, 30),
            substr($input['notes'] ?? '', 0, 2000),
        ],
    );
    sendJson(['ok' => true], 201);
}
