<?php
declare(strict_types=1);

function handleInteractions(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        sendJson(
            executeQuery(
                <<<'SQL'
                SELECT
                  i.id,
                  i.client_id,
                  i.type,
                  i.subject,
                  i.notes,
                  i.contact_date,
                  c.name AS client,
                  c.phone,
                  COALESCE(c.message_consent, 0) AS message_consent,
                  c.message_consent_at
                FROM interactions i
                JOIN clients c
                  ON c.id = i.client_id
                  AND c.company_id = i.company_id
                WHERE i.company_id = ?
                ORDER BY i.contact_date DESC, i.id DESC
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
    if (!in_array($type, ['whatsapp', 'phone', 'visit', 'email', 'other'], true)) {
        sendError('Tipo de interação inválido.');
    }
    $clientId = requireCompanyClient($input, $companyId);
    executeQuery(
        <<<'SQL'
        INSERT INTO interactions (
          company_id,
          client_id,
          type,
          subject,
          notes,
          contact_date
        )
        VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        SQL
        ,
        [
            $companyId,
            $clientId,
            $type,
            requiredText($input, 'subject'),
            substr(trim((string) ($input['notes'] ?? '')), 0, 2000),
            optionalDateTime($input, 'contact_date'),
        ],
    );
    sendJson(['ok' => true], 201);
}
