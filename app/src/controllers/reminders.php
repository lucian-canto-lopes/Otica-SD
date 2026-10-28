<?php
declare(strict_types=1);

function handleReminders(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        sendJson(
            executeQuery(
                <<<'SQL'
                SELECT
                  r.id,
                  r.client_id,
                  r.type,
                  r.due_date,
                  r.message,
                  r.status,
                  r.completed_at,
                  r.created_at,
                  c.name AS client,
                  c.phone,
                  COALESCE(c.message_consent, 0) AS message_consent,
                  c.message_consent_at
                FROM reminders r
                LEFT JOIN clients c
                  ON c.id = r.client_id
                  AND c.company_id = r.company_id
                WHERE r.company_id = ?
                ORDER BY
                  (r.status = 'completed'),
                  r.due_date,
                  r.id DESC
                SQL
                ,
                [$companyId],
            )->fetchAll(),
        );
    }
    if ($method === 'PATCH') {
        $status = (string) ($input['status'] ?? '');
        if (!in_array($status, ['pending', 'completed'], true)) {
            sendError('Situação do lembrete inválida.');
        }
        $reminderId = validatedInteger($input['id'] ?? 0);
        $statement = executeQuery(
            <<<'SQL'
            UPDATE reminders
            SET
              status = ?,
              completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE id = ?
              AND company_id = ?
            SQL
            ,
            [$status, $status, $reminderId, $companyId],
        );
        if ($statement->rowCount() === 0) {
            $exists = executeQuery('SELECT id FROM reminders WHERE id = ? AND company_id = ?', [
                $reminderId,
                $companyId,
            ])->fetch();
            if (!$exists) {
                sendError('Lembrete não encontrado.', 404);
            }
        }
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $type = (string) ($input['type'] ?? '');
    if (!in_array($type, ['birthday', 'renewal', 'pickup', 'follow_up', 'other'], true)) {
        sendError('Tipo de lembrete inválido.');
    }
    $clientId = null;
    if (($input['client_id'] ?? '') !== '') {
        $clientId = requireCompanyClient($input, $companyId);
        $authorizedClient = executeQuery(
            <<<'SQL'
            SELECT id
            FROM clients
            WHERE id = ?
              AND company_id = ?
              AND message_consent = 1
              AND TRIM(phone) <> ''
            SQL
            ,
            [$clientId, $companyId],
        )->fetch();
        if (!$authorizedClient) {
            sendError(
                'O cliente precisa autorizar mensagens e possuir telefone para entrar na central.',
            );
        }
    }
    executeQuery(
        <<<'SQL'
        INSERT INTO reminders (company_id, client_id, type, due_date, message)
        VALUES (?, ?, ?, ?, ?)
        SQL
        ,
        [
            $companyId,
            $clientId,
            $type,
            requiredDate($input, 'due_date'),
            requiredText($input, 'message', 500),
        ],
    );
    sendJson(['ok' => true], 201);
}
