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
                    SELECT MAX(s.payment_date)
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
    $messageConsent = booleanValue($input, 'message_consent');
    if ($method === 'PATCH') {
        $clientId = validatedInteger($input['id'] ?? 0);
        $statement = executeQuery(
            <<<'SQL'
            UPDATE clients
            SET
              name = ?,
              phone = ?,
              email = ?,
              birth_date = ?,
              next_contact_date = ?,
              notes = ?,
              message_consent_at = CASE
                WHEN ? = 1 AND message_consent = 0 THEN CURRENT_TIMESTAMP
                WHEN ? = 0 THEN NULL
                ELSE message_consent_at
              END,
              message_consent = ?
            WHERE id = ?
              AND company_id = ?
            SQL
            ,
            [...$values, $messageConsent, $messageConsent, $messageConsent, $clientId, $companyId],
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
        prepareAutomaticReminders($companyId, $clientId);
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
            notes,
            message_consent,
            message_consent_at
          )
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END)
        SQL
        ,
        [$companyId, ...$values, $messageConsent, $messageConsent],
    );
    $clientId = (int) database()->lastInsertId();
    prepareAutomaticReminders($companyId, $clientId);
    sendJson(['ok' => true], 201);
}
