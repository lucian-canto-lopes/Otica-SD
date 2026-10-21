<?php
declare(strict_types=1);

function handlePartners(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        sendJson(
            executeQuery(
                <<<'SQL'
                SELECT
                  id,
                  name,
                  type,
                  document,
                  phone,
                  email,
                  notes,
                  created_at
                FROM partners
                WHERE company_id = ?
                ORDER BY name
                SQL
                ,
                [$companyId],
            )->fetchAll(),
        );
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $type = (string) ($input['type'] ?? '');
    if (!in_array($type, ['supplier', 'laboratory'], true)) {
        sendError('Tipo de parceiro inválido.');
    }
    executeQuery(
        <<<'SQL'
        INSERT INTO partners (
          company_id,
          name,
          type,
          document,
          phone,
          email,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        SQL
        ,
        [
            $companyId,
            requiredText($input, 'name'),
            $type,
            substr(trim((string) ($input['document'] ?? '')), 0, 30),
            substr(trim((string) ($input['phone'] ?? '')), 0, 30),
            optionalEmail($input),
            substr(trim((string) ($input['notes'] ?? '')), 0, 2000),
        ],
    );
    sendJson(['ok' => true], 201);
}
