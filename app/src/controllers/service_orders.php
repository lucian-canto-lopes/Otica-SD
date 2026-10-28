<?php
declare(strict_types=1);

const SERVICE_ORDER_STATUSES = [
    'open' => 'Aberta',
    'sent_to_lab' => 'Enviada ao laboratório',
    'in_production' => 'Em produção',
    'received_from_lab' => 'Recebida do laboratório',
    'mounting' => 'Em montagem',
    'ready' => 'Pronta para retirada',
    'delivered' => 'Entregue',
    'cancelled' => 'Cancelada',
];

function serviceOrderStatusLabel(string $status): string
{
    return SERVICE_ORDER_STATUSES[$status] ?? $status;
}

function serviceOrderValues(array $input, int $companyId): array
{
    $values = prescriptionValues($input);
    // Se uma receita for informada e os graus vierem vazios, copia os graus da receita.
    $prescriptionId = optionalCompanyReference($input, 'prescription_id', 'prescriptions', $companyId, 'Receita');
    if ($prescriptionId && !array_filter($values)) {
        $prescription = fetchOne('SELECT * FROM prescriptions WHERE id = ?', [$prescriptionId]);
        foreach (array_keys($values) as $key) {
            $values[$key] = (string) ($prescription[$key] ?? '');
        }
    }
    return [
        ...$values,
        'client_id' => optionalCompanyReference($input, 'client_id', 'clients', $companyId, 'Cliente'),
        'sale_id' => optionalCompanyReference($input, 'sale_id', 'sales', $companyId, 'Venda'),
        'laboratory_id' => optionalCompanyReference($input, 'laboratory_id', 'partners', $companyId, 'Laboratório'),
        'prescription_id' => $prescriptionId,
        'lens_description' => optionalText($input, 'lens_description', 255),
        'frame_description' => optionalText($input, 'frame_description', 255),
        'frame_type' => optionalText($input, 'frame_type', 40),
        'frame_from_client' => booleanValue($input, 'frame_from_client'),
        'bridge' => optionalText($input, 'bridge', 10),
        'horizontal' => optionalText($input, 'horizontal', 10),
        'vertical' => optionalText($input, 'vertical', 10),
        'diagonal' => optionalText($input, 'diagonal', 10),
        'promised_date' => optionalDate($input, 'promised_date'),
        'lab_cost' => moneyValue($input, 'lab_cost'),
        'notes' => optionalText($input, 'notes', 5000),
    ];
}

/** Cria a OS (diretamente ou a partir de uma venda). Deve ser chamada dentro de transação. */
function createServiceOrder(int $companyId, array $input): int
{
    $values = serviceOrderValues($input, $companyId);
    if (!$values['client_id'] && $values['sale_id']) {
        $values['client_id'] = fetchValue('SELECT client_id FROM sales WHERE id = ?', [$values['sale_id']]);
    }
    if (!$values['client_id']) {
        sendError('Informe o cliente da ordem de serviço.');
    }
    $number = !empty($input['number']) ? validatedInteger($input['number']) : reserveNumber($companyId, 'order');
    $orderId = insertRow('service_orders', [
        'company_id' => $companyId,
        'number' => $number,
        'status' => 'open',
        ...$values,
        'created_by' => Context::userId(),
    ]);
    insertRow('service_order_events', [
        'company_id' => $companyId,
        'service_order_id' => $orderId,
        'status' => 'open',
        'notes' => $values['sale_id'] ? 'OS aberta a partir da venda.' : 'OS aberta.',
        'user_id' => Context::userId(),
    ]);
    return $orderId;
}

function handleServiceOrders(string $method, array $input): never
{
    $companyId = Context::companyId();
    $id = routeId();
    if ($method === 'GET' && $id) {
        sendJson(serviceOrderDetail($id, $companyId));
    }
    if ($method === 'GET') {
        $where = 'WHERE o.company_id = ?';
        $params = [$companyId];
        if ($q = query('q')) {
            $where .= ' AND (c.name LIKE ? OR o.number = ? OR o.frame_description LIKE ?)';
            array_push($params, likeTerm($q), ctype_digit($q) ? (int) $q : -1, likeTerm($q));
        }
        $statuses = queryList('status');
        if ($statuses) {
            $where .= ' AND o.status IN (' . implode(',', array_fill(0, count($statuses), '?')) . ')';
            array_push($params, ...$statuses);
        } elseif (query('open') === '1') {
            $where .= " AND o.status NOT IN ('delivered', 'cancelled')";
        }
        foreach (['laboratory_id' => 'o.laboratory_id', 'client_id' => 'o.client_id', 'sale_id' => 'o.sale_id'] as $key => $column) {
            if ($value = queryInt($key)) {
                $where .= " AND {$column} = ?";
                $params[] = $value;
            }
        }
        if (query('late') === '1') {
            $where .= " AND o.promised_date < CURRENT_DATE AND o.status NOT IN ('ready', 'delivered', 'cancelled')";
        }
        sendJson(
            paginate(
                "SELECT o.id, o.number, o.status, o.promised_date, o.created_at, o.updated_at, o.sale_id, o.client_id,
                        o.frame_description, o.lens_description, c.name AS client_name, c.whatsapp AS client_whatsapp,
                        l.name AS laboratory_name, s.number AS sale_number,
                        (o.promised_date < CURRENT_DATE AND o.status NOT IN ('ready', 'delivered', 'cancelled')) AS is_late",
                "FROM service_orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN partners l ON l.id = o.laboratory_id
                 LEFT JOIN sales s ON s.id = o.sale_id {$where}",
                $params,
                sortClause(['number' => 'o.number', 'promised_date' => 'o.promised_date', 'created_at' => 'o.created_at'], 'o.number DESC'),
                500,
            ),
        );
    }
    requirePermission('service');
    if ($method === 'PATCH' && ($input['action'] ?? '') === 'status') {
        $order = requireCompanyRecord('service_orders', requireRouteId(), $companyId, 'Ordem de serviço');
        $status = enumValue($input, 'status', array_keys(SERVICE_ORDER_STATUSES));
        $notes = optionalText($input, 'notes', 500);
        inTransaction(static function () use ($order, $companyId, $status, $notes): void {
            executeQuery(
                'UPDATE service_orders SET status = ?, delivered_at = ? WHERE id = ? AND company_id = ?',
                [$status, $status === 'delivered' ? date('Y-m-d H:i:s') : null, $order['id'], $companyId],
            );
            insertRow('service_order_events', [
                'company_id' => $companyId,
                'service_order_id' => $order['id'],
                'status' => $status,
                'notes' => $notes,
                'user_id' => Context::userId(),
            ]);
        });
        auditLog('status', 'service_order', (int) $order['id'], 'OS nº ' . $order['number'] . ': ' . serviceOrderStatusLabel($status));
        if ($status === 'ready' && $order['client_id']) {
            generateTasks($companyId, (int) $order['client_id']);
        }
        emitEvent($companyId, 'order.status_changed', ['id' => (int) $order['id'], 'number' => (int) $order['number'], 'client_id' => $order['client_id'], 'status' => $status]);
        sendJson(['ok' => true]);
    }
    if ($method === 'DELETE') {
        requirePermission('manage');
        $order = requireCompanyRecord('service_orders', requireRouteId(), $companyId, 'Ordem de serviço');
        executeQuery('DELETE FROM service_orders WHERE id = ? AND company_id = ?', [$order['id'], $companyId]);
        auditLog('delete', 'service_order', (int) $order['id'], 'OS nº ' . $order['number'] . ' excluída');
        sendJson(['ok' => true]);
    }
    if ($method === 'PATCH') {
        $before = requireCompanyRecord('service_orders', requireRouteId(), $companyId, 'Ordem de serviço');
        $values = serviceOrderValues($input, $companyId);
        updateRow('service_orders', (int) $before['id'], $companyId, $values);
        auditLog('update', 'service_order', (int) $before['id'], 'OS nº ' . $before['number'] . ' alterada', changedFields($before, $values));
        sendJson(['ok' => true, 'id' => (int) $before['id']]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $orderId = inTransaction(static fn(): int => createServiceOrder($companyId, $input));
    $number = (int) fetchValue('SELECT number FROM service_orders WHERE id = ?', [$orderId]);
    auditLog('create', 'service_order', $orderId, "OS nº {$number} aberta");
    emitEvent($companyId, 'order.created', ['id' => $orderId, 'number' => $number]);
    sendJson(['ok' => true, 'id' => $orderId, 'number' => $number], 201);
}

function serviceOrderDetail(int $orderId, int $companyId): array
{
    $order = fetchOne(
        'SELECT o.*, c.name AS client_name, c.whatsapp AS client_whatsapp, c.phone AS client_phone, c.cpf AS client_cpf,
                c.birth_date AS client_birth_date, l.name AS laboratory_name, l.phone AS laboratory_phone, s.number AS sale_number,
                s.total AS sale_total, s.paid AS sale_paid, u.name AS created_by_name
         FROM service_orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN partners l ON l.id = o.laboratory_id
         LEFT JOIN sales s ON s.id = o.sale_id LEFT JOIN users u ON u.id = o.created_by
         WHERE o.id = ? AND o.company_id = ?',
        [$orderId, $companyId],
    );
    if (!$order) {
        sendError('Ordem de serviço não encontrada.', 404);
    }
    $order['history'] = fetchAllRows(
        'SELECT e.*, u.name AS user_name FROM service_order_events e LEFT JOIN users u ON u.id = e.user_id
         WHERE e.service_order_id = ? ORDER BY e.id',
        [$orderId],
    );
    $order['sale_items'] = $order['sale_id']
        ? fetchAllRows('SELECT description, quantity, unit_price, total FROM sale_items WHERE sale_id = ? ORDER BY position, id', [$order['sale_id']])
        : [];
    return $order;
}

function handleAttachments(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET' && ($id = routeId())) {
        $attachment = requireCompanyRecord('attachments', $id, $companyId, 'Anexo');
        streamFile($attachment['stored_name'], $attachment['mime'], $attachment['original_name'], query('download') !== '1');
    }
    $entityTables = ['client' => 'clients', 'sale' => 'sales', 'service_order' => 'service_orders', 'quote' => 'quotes'];
    if ($method === 'GET') {
        $entityType = query('entity_type', '');
        if (!isset($entityTables[$entityType])) {
            sendError('Tipo de anexo inválido.');
        }
        $entityId = queryInt('entity_id', 0);
        // Na ficha do cliente, mostra também os anexos das vendas, OS e orçamentos dele.
        if ($entityType === 'client') {
            $rows = fetchAllRows(
                'SELECT a.*, u.name AS uploaded_by_name FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
                 WHERE a.company_id = ? AND (a.client_id = ? OR (a.entity_type = \'client\' AND a.entity_id = ?)) ORDER BY a.id DESC',
                [$companyId, $entityId, $entityId],
            );
        } else {
            $rows = fetchAllRows(
                'SELECT a.*, u.name AS uploaded_by_name FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
                 WHERE a.company_id = ? AND a.entity_type = ? AND a.entity_id = ? ORDER BY a.id DESC',
                [$companyId, $entityType, $entityId],
            );
        }
        foreach ($rows as &$row) {
            unset($row['stored_name']);
        }
        sendJson($rows);
    }
    requirePermission('service');
    if ($method === 'DELETE') {
        $attachment = requireCompanyRecord('attachments', requireRouteId(), $companyId, 'Anexo');
        executeQuery('DELETE FROM attachments WHERE id = ? AND company_id = ?', [$attachment['id'], $companyId]);
        @unlink(storagePath($attachment['stored_name']));
        auditLog('delete', 'attachment', (int) $attachment['id'], 'Anexo excluído: ' . $attachment['original_name']);
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $entityType = (string) ($_POST['entity_type'] ?? '');
    if (!isset($entityTables[$entityType])) {
        sendError('Tipo de anexo inválido.');
    }
    $entity = requireCompanyRecord($entityTables[$entityType], $_POST['entity_id'] ?? 0, $companyId, 'Registro');
    $clientId = $entityType === 'client' ? (int) $entity['id'] : ($entity['client_id'] ?? null);
    $files = normalizeUploadedFiles($_FILES['files'] ?? $_FILES['file'] ?? null);
    if (!$files) {
        sendError('Selecione ao menos um arquivo.');
    }
    $created = [];
    foreach ($files as $file) {
        [$path, $mime, $size] = storeUploadedFile($file, "company_{$companyId}/attachments/" . date('Y/m'));
        $originalName = mb_substr(basename((string) $file['name']) ?: 'arquivo', 0, 190);
        $created[] = insertRow('attachments', [
            'company_id' => $companyId,
            'entity_type' => $entityType,
            'entity_id' => $entity['id'],
            'client_id' => $clientId,
            'original_name' => $originalName,
            'stored_name' => $path,
            'mime' => $mime,
            'size' => $size,
            'description' => mb_substr(trim((string) ($_POST['description'] ?? '')), 0, 255),
            'uploaded_by' => Context::userId(),
        ]);
        auditLog('upload', 'attachment', end($created), "Anexo em {$entityType} #{$entity['id']}: {$originalName}");
    }
    sendJson(['ok' => true, 'ids' => $created], 201);
}

/** Converte o formato de $_FILES com múltiplos arquivos em uma lista simples. */
function normalizeUploadedFiles(?array $files): array
{
    if (!$files) {
        return [];
    }
    if (!is_array($files['name'])) {
        return [$files];
    }
    $list = [];
    foreach ($files['name'] as $index => $name) {
        $list[] = [
            'name' => $name,
            'type' => $files['type'][$index],
            'tmp_name' => $files['tmp_name'][$index],
            'error' => $files['error'][$index],
            'size' => $files['size'][$index],
        ];
    }
    return array_slice($list, 0, 20);
}
