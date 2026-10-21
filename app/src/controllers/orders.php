<?php
declare(strict_types=1);

function handleOrders(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        $orders = executeQuery(
            <<<'SQL'
            SELECT
              o.*,
              c.name AS client,
              partner.name AS laboratory
            FROM orders o
            JOIN clients c
              ON c.id = o.client_id
              AND c.company_id = o.company_id
            LEFT JOIN partners partner
              ON partner.id = o.laboratory_id
              AND partner.company_id = o.company_id
            WHERE o.company_id = ?
            ORDER BY o.id DESC
            SQL
            ,
            [$companyId],
        )->fetchAll();
        $events = executeQuery(
            <<<'SQL'
            SELECT id, order_id, status, notes, created_at
            FROM order_events
            WHERE company_id = ?
            ORDER BY created_at, id
            SQL
            ,
            [$companyId],
        )->fetchAll();
        $historyByOrder = [];
        foreach ($events as $event) {
            $historyByOrder[(int) $event['order_id']][] = $event;
        }
        foreach ($orders as &$order) {
            $order['history'] = $historyByOrder[(int) $order['id']] ?? [];
        }
        unset($order);
        sendJson($orders);
    }
    if ($method === 'PATCH') {
        $status = $input['status'] ?? '';
        $validStatuses = [
            'received',
            'sent_to_lab',
            'lab_production',
            'received_from_lab',
            'ready',
            'delivered',
        ];
        if (!in_array($status, $validStatuses, true)) {
            sendError('Etapa inválida.');
        }
        $orderId = validatedInteger($input['id'] ?? 0);
        database()->beginTransaction();
        $order = executeQuery('SELECT id FROM orders WHERE id = ? AND company_id = ? FOR UPDATE', [
            $orderId,
            $companyId,
        ])->fetch();
        if (!$order) {
            database()->rollBack();
            sendError('Ordem de serviço não encontrada.', 404);
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
            [$status, $orderId, $companyId],
        );
        executeQuery(
            <<<'SQL'
            INSERT INTO order_events (company_id, order_id, status, notes)
            VALUES (?, ?, ?, ?)
            SQL
            ,
            [$companyId, $orderId, $status, substr(trim((string) ($input['notes'] ?? '')), 0, 500)],
        );
        database()->commit();
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $clientId = requireCompanyClient($input, $companyId);
    $laboratoryId = optionalCompanyPartner($input, 'laboratory_id', $companyId, 'laboratory');
    database()->beginTransaction();
    executeQuery(
        <<<'SQL'
        INSERT INTO
          orders (
            company_id,
            client_id,
            description,
            prescription,
            laboratory_id,
            delivery
          )
        VALUES
          (?, ?, ?, ?, ?, ?)
        SQL
        ,
        [
            $companyId,
            $clientId,
            requiredText($input, 'description', 500),
            substr($input['prescription'] ?? '', 0, 2000),
            $laboratoryId,
            requiredDate($input, 'delivery'),
        ],
    );
    $orderId = (int) database()->lastInsertId();
    executeQuery(
        <<<'SQL'
        INSERT INTO order_events (company_id, order_id, status, notes)
        VALUES (?, ?, 'received', ?)
        SQL
        ,
        [$companyId, $orderId, 'Ordem de serviço aberta.'],
    );
    database()->commit();
    sendJson(['ok' => true], 201);
}
