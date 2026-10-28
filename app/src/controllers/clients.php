<?php
declare(strict_types=1);

const CLIENT_FIELDS = [
    'kind', 'name', 'nickname', 'cpf', 'rg', 'birth_date', 'gender', 'phone', 'whatsapp', 'email', 'instagram',
    'zip', 'address', 'number', 'complement', 'neighborhood', 'city', 'state', 'occupation', 'origin', 'notes',
    'next_contact_date', 'seller_id',
];

function handleClients(string $method, array $input): never
{
    $companyId = Context::companyId();
    $id = routeId();

    if ($method === 'GET' && $id) {
        sendJson(clientDetail($id, $companyId));
    }
    if ($method === 'GET') {
        $filters = $_GET;
        foreach (['tags_any', 'tags_all', 'tags_none', 'birth_month', 'city', 'ids'] as $listKey) {
            if (isset($filters[$listKey]) && is_string($filters[$listKey])) {
                $filters[$listKey] = queryList($listKey);
            }
        }
        [$where, $params] = buildClientFilter($filters, $companyId);
        $computed = clientComputedColumns();
        $result = paginate(
            "SELECT c.id, c.kind, c.name, c.nickname, c.cpf, c.whatsapp, c.phone, c.email, c.birth_date, c.city,
                    c.neighborhood, c.message_consent, c.created_at,
                    {$computed['last_purchase']} AS last_purchase,
                    {$computed['total_spent']} AS total_spent",
            "FROM clients c WHERE {$where}",
            $params,
            sortClause(
                ['name' => 'c.name', 'created_at' => 'c.created_at', 'last_purchase' => 'last_purchase', 'total_spent' => 'total_spent', 'birth_date' => 'DAYOFYEAR(c.birth_date)'],
                'c.name ASC',
            ),
        );
        attachClientTags($result['data']);
        sendJson($result);
    }

    if ($method === 'DELETE') {
        requirePermission('manage');
        $client = requireCompanyRecord('clients', requireRouteId(), $companyId, 'Cliente');
        executeQuery('UPDATE clients SET deleted_at = NOW() WHERE id = ? AND company_id = ?', [$client['id'], $companyId]);
        auditLog('delete', 'client', (int) $client['id'], 'Cliente excluído: ' . $client['name']);
        sendJson(['ok' => true]);
    }
    requirePermission('sell');
    if (!in_array($method, ['POST', 'PATCH'], true)) {
        sendError('Método não permitido.', 405);
    }
    $values = clientValuesFromInput($input, $companyId);
    $tagIds = array_key_exists('tag_ids', $input) ? array_values(array_unique(array_map('intval', (array) $input['tag_ids']))) : null;

    if ($method === 'PATCH') {
        $before = requireCompanyRecord('clients', requireRouteId(), $companyId, 'Cliente');
        $clientId = (int) $before['id'];
        assertUniqueClientDocument($values['cpf'], $companyId, $clientId);
        $consent = booleanValue($input, 'message_consent');
        $values['message_consent'] = $consent;
        $values['message_consent_at'] = $consent ? ($before['message_consent_at'] ?? date('Y-m-d H:i:s')) : null;
        inTransaction(static function () use ($clientId, $companyId, $values, $tagIds): void {
            updateRow('clients', $clientId, $companyId, $values);
            if ($tagIds !== null) {
                syncClientTags($clientId, $companyId, $tagIds);
            }
        });
        auditLog('update', 'client', $clientId, 'Cliente atualizado: ' . $values['name'], changedFields($before, $values));
        generateTasks($companyId, $clientId);
        emitEvent($companyId, 'client.updated', ['id' => $clientId, 'name' => $values['name']]);
        sendJson(['ok' => true, 'id' => $clientId]);
    }

    assertUniqueClientDocument($values['cpf'], $companyId, null);
    $consent = booleanValue($input, 'message_consent');
    $clientId = inTransaction(static function () use ($companyId, $values, $tagIds, $consent): int {
        $clientId = insertRow('clients', [
            'company_id' => $companyId,
            ...$values,
            'message_consent' => $consent,
            'message_consent_at' => $consent ? date('Y-m-d H:i:s') : null,
        ]);
        if ($tagIds) {
            syncClientTags($clientId, $companyId, $tagIds);
        }
        return $clientId;
    });
    auditLog('create', 'client', $clientId, 'Cliente cadastrado: ' . $values['name']);
    generateTasks($companyId, $clientId);
    emitEvent($companyId, 'client.created', ['id' => $clientId, 'name' => $values['name'], 'whatsapp' => $values['whatsapp']]);
    sendJson(['ok' => true, 'id' => $clientId], 201);
}

function clientValuesFromInput(array $input, int $companyId): array
{
    $ddd = (string) companySetting('default_ddd', '');
    $whatsapp = normalizePhone((string) ($input['whatsapp'] ?? ''), $ddd);
    $phone = optionalText($input, 'phone', 30);
    if ($whatsapp === '' && $phone !== '' && strlen(onlyDigits($phone)) >= 10) {
        $whatsapp = normalizePhone($phone, $ddd);
    }
    $sellerId = $input['seller_id'] ?? null;
    if ($sellerId && !fetchValue('SELECT 1 FROM company_users WHERE company_id = ? AND user_id = ?', [$companyId, $sellerId])) {
        $sellerId = null;
    }
    return [
        'kind' => in_array($input['kind'] ?? 'client', ['client', 'lead'], true) ? ($input['kind'] ?? 'client') : 'client',
        'name' => requiredText($input, 'name', 150, 'nome'),
        'nickname' => optionalText($input, 'nickname', 80),
        'cpf' => onlyDigits(optionalText($input, 'cpf', 20)),
        'rg' => optionalText($input, 'rg', 30),
        'birth_date' => optionalDate($input, 'birth_date'),
        'gender' => in_array($input['gender'] ?? '', ['F', 'M', 'O'], true) ? $input['gender'] : '',
        'phone' => $phone,
        'whatsapp' => substr($whatsapp, 0, 30),
        'email' => optionalEmail($input),
        'instagram' => ltrim(optionalText($input, 'instagram', 80), '@'),
        'zip' => onlyDigits(optionalText($input, 'zip', 10)),
        'address' => optionalText($input, 'address', 190),
        'number' => optionalText($input, 'number', 20),
        'complement' => optionalText($input, 'complement', 80),
        'neighborhood' => optionalText($input, 'neighborhood', 100),
        'city' => optionalText($input, 'city', 100),
        'state' => strtoupper(optionalText($input, 'state', 2)),
        'occupation' => optionalText($input, 'occupation', 100),
        'origin' => optionalText($input, 'origin', 60),
        'notes' => optionalText($input, 'notes', 5000),
        'next_contact_date' => optionalDate($input, 'next_contact_date'),
        'seller_id' => $sellerId ? (int) $sellerId : null,
    ];
}

function assertUniqueClientDocument(string $cpf, int $companyId, ?int $ignoreId): void
{
    if ($cpf === '') {
        return;
    }
    $existing = fetchOne(
        'SELECT id, name FROM clients WHERE company_id = ? AND cpf = ? AND deleted_at IS NULL AND id <> ?',
        [$companyId, $cpf, $ignoreId ?? 0],
    );
    if ($existing) {
        sendError('Já existe um cliente com este CPF: ' . $existing['name'], 422, ['duplicate_id' => $existing['id']]);
    }
}

function syncClientTags(int $clientId, int $companyId, array $tagIds): void
{
    executeQuery('DELETE FROM client_tags WHERE client_id = ?', [$clientId]);
    foreach ($tagIds as $tagId) {
        if (fetchValue('SELECT 1 FROM tags WHERE id = ? AND company_id = ?', [$tagId, $companyId])) {
            executeQuery('INSERT IGNORE INTO client_tags (client_id, tag_id, company_id) VALUES (?, ?, ?)', [$clientId, $tagId, $companyId]);
        }
    }
}

function attachClientTags(array &$clients): void
{
    $ids = array_column($clients, 'id');
    if (!$ids) {
        return;
    }
    $rows = fetchAllRows(
        'SELECT ct.client_id, t.id, t.name, t.color FROM client_tags ct JOIN tags t ON t.id = ct.tag_id
         WHERE ct.client_id IN (' . implode(',', array_map('intval', $ids)) . ') ORDER BY t.name',
    );
    $byClient = [];
    foreach ($rows as $row) {
        $byClient[$row['client_id']][] = ['id' => $row['id'], 'name' => $row['name'], 'color' => $row['color']];
    }
    foreach ($clients as &$client) {
        $client['tags'] = $byClient[$client['id']] ?? [];
    }
    unset($client);
}

function clientDetail(int $clientId, int $companyId): array
{
    $client = fetchOne('SELECT * FROM clients WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [$clientId, $companyId]);
    if (!$client) {
        sendError('Cliente não encontrado.', 404);
    }
    $list = [$client];
    attachClientTags($list);
    $client = $list[0];
    $client['seller_name'] = $client['seller_id'] ? fetchValue('SELECT name FROM users WHERE id = ?', [$client['seller_id']]) : null;
    $client['stats'] = fetchOne(
        "SELECT COUNT(*) AS sales_count,
                COALESCE(SUM(total), 0) AS total_spent,
                COALESCE(AVG(total), 0) AS average_ticket,
                MAX(sale_date) AS last_purchase,
                MIN(sale_date) AS first_purchase,
                COALESCE(SUM(total - paid), 0) AS balance_due
         FROM sales WHERE company_id = ? AND client_id = ? AND status <> 'cancelled'",
        [$companyId, $clientId],
    );
    $client['stats']['open_quotes'] = (int) fetchValue(
        "SELECT COUNT(*) FROM quotes WHERE company_id = ? AND client_id = ? AND status IN ('open', 'sent')",
        [$companyId, $clientId],
    );
    $client['stats']['open_orders'] = (int) fetchValue(
        "SELECT COUNT(*) FROM service_orders WHERE company_id = ? AND client_id = ? AND status NOT IN ('delivered', 'cancelled')",
        [$companyId, $clientId],
    );
    $client['stats']['interactions'] = (int) fetchValue('SELECT COUNT(*) FROM interactions WHERE company_id = ? AND client_id = ?', [$companyId, $clientId]);
    $client['stats']['last_interaction'] = fetchValue('SELECT MAX(contact_at) FROM interactions WHERE company_id = ? AND client_id = ?', [$companyId, $clientId]);
    $client['prescriptions'] = fetchAllRows('SELECT * FROM prescriptions WHERE company_id = ? AND client_id = ? ORDER BY COALESCE(prescribed_at, created_at) DESC, id DESC', [$companyId, $clientId]);
    $client['sales'] = fetchAllRows(
        'SELECT id, number, sale_date, total, paid, status FROM sales WHERE company_id = ? AND client_id = ? ORDER BY sale_date DESC, id DESC LIMIT 50',
        [$companyId, $clientId],
    );
    $client['quotes'] = fetchAllRows(
        'SELECT id, number, quote_date, total, status FROM quotes WHERE company_id = ? AND client_id = ? ORDER BY quote_date DESC, id DESC LIMIT 50',
        [$companyId, $clientId],
    );
    $client['service_orders'] = fetchAllRows(
        'SELECT id, number, status, promised_date, created_at FROM service_orders WHERE company_id = ? AND client_id = ? ORDER BY id DESC LIMIT 50',
        [$companyId, $clientId],
    );
    $client['tasks'] = fetchAllRows(
        "SELECT id, type, title, due_date, status FROM tasks WHERE company_id = ? AND client_id = ? AND status = 'pending' ORDER BY due_date",
        [$companyId, $clientId],
    );
    $client['purchased_categories'] = fetchAllRows(
        "SELECT COALESCE(NULLIF(p.category, ''), 'Itens livres') AS category, SUM(si.total) AS total
         FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN products p ON p.id = si.product_id
         WHERE s.company_id = ? AND s.client_id = ? AND s.status <> 'cancelled'
         GROUP BY category ORDER BY total DESC LIMIT 6",
        [$companyId, $clientId],
    );
    $client['conversation_id'] = fetchValue('SELECT id FROM conversations WHERE company_id = ? AND client_id = ? ORDER BY last_message_at DESC LIMIT 1', [$companyId, $clientId]);
    return $client;
}

/** Linha do tempo unificada de todas as interações do cliente com a ótica. */
function handleClientTimeline(string $method, array $input): never
{
    $companyId = Context::companyId();
    $client = requireCompanyRecord('clients', requireRouteId(), $companyId, 'Cliente');
    $clientId = (int) $client['id'];
    $p = [$companyId, $clientId];
    $events = [];
    $push = static function (array $rows, callable $map) use (&$events): void {
        foreach ($rows as $row) {
            $events[] = $map($row);
        }
    };
    $push(
        fetchAllRows("SELECT id, number, total, status, sale_date, created_at FROM sales WHERE company_id = ? AND client_id = ?", $p),
        static fn($r) => ['type' => 'sale', 'id' => $r['id'], 'at' => $r['sale_date'] . ' ' . substr((string) $r['created_at'], 11, 8), 'title' => 'Venda nº ' . $r['number'] . ($r['status'] === 'cancelled' ? ' (cancelada)' : ''), 'detail' => money($r['total'])],
    );
    $push(
        fetchAllRows("SELECT id, number, total, status, created_at FROM quotes WHERE company_id = ? AND client_id = ?", $p),
        static fn($r) => ['type' => 'quote', 'id' => $r['id'], 'at' => $r['created_at'], 'title' => 'Orçamento nº ' . $r['number'], 'detail' => money($r['total']) . ' · ' . $r['status']],
    );
    $push(
        fetchAllRows(
            "SELECT e.id, e.status, e.notes, e.created_at, o.id AS order_id, o.number
             FROM service_order_events e JOIN service_orders o ON o.id = e.service_order_id
             WHERE o.company_id = ? AND o.client_id = ?",
            $p,
        ),
        static fn($r) => ['type' => 'service_order', 'id' => $r['order_id'], 'at' => $r['created_at'], 'title' => 'OS nº ' . $r['number'] . ': ' . serviceOrderStatusLabel($r['status']), 'detail' => $r['notes']],
    );
    $push(
        fetchAllRows("SELECT i.id, i.channel, i.direction, i.subject, i.notes, i.contact_at, u.name AS user_name FROM interactions i LEFT JOIN users u ON u.id = i.user_id WHERE i.company_id = ? AND i.client_id = ?", $p),
        static fn($r) => ['type' => 'interaction', 'id' => $r['id'], 'at' => $r['contact_at'], 'title' => $r['subject'], 'detail' => $r['notes'], 'channel' => $r['channel'], 'direction' => $r['direction'], 'user' => $r['user_name']],
    );
    $push(
        fetchAllRows(
            "SELECT m.id, m.direction, m.body, m.status, m.created_at, ch.type AS channel
             FROM messages m JOIN conversations cv ON cv.id = m.conversation_id JOIN channels ch ON ch.id = cv.channel_id
             WHERE cv.company_id = ? AND cv.client_id = ? ORDER BY m.id DESC LIMIT 100",
            $p,
        ),
        static fn($r) => ['type' => 'message', 'id' => $r['id'], 'at' => $r['created_at'], 'title' => $r['direction'] === 'in' ? 'Mensagem recebida' : 'Mensagem enviada', 'detail' => mb_substr((string) $r['body'], 0, 300), 'channel' => $r['channel'], 'direction' => $r['direction'], 'status' => $r['status']],
    );
    $push(
        fetchAllRows(
            "SELECT cr.id, cr.status, cr.sent_at, cr.created_at, ca.name, ca.id AS campaign_id
             FROM campaign_recipients cr JOIN campaigns ca ON ca.id = cr.campaign_id
             WHERE cr.company_id = ? AND cr.client_id = ? AND cr.status IN ('sent', 'replied', 'failed')",
            $p,
        ),
        static fn($r) => ['type' => 'campaign', 'id' => $r['campaign_id'], 'at' => $r['sent_at'] ?? $r['created_at'], 'title' => 'Campanha: ' . $r['name'], 'detail' => $r['status'] === 'failed' ? 'Falha no envio' : 'Mensagem enviada'],
    );
    $push(
        fetchAllRows(
            "SELECT l.id, l.notes, l.estimated_value, l.occurred_at, l.created_at, r.name AS reason
             FROM lost_opportunities l LEFT JOIN loss_reasons r ON r.id = l.reason_id WHERE l.company_id = ? AND l.client_id = ?",
            $p,
        ),
        static fn($r) => ['type' => 'lost', 'id' => $r['id'], 'at' => $r['occurred_at'] . ' ' . substr((string) $r['created_at'], 11, 8), 'title' => 'Não comprou: ' . ($r['reason'] ?? 'motivo não informado'), 'detail' => $r['notes']],
    );
    $push(
        fetchAllRows("SELECT id, prescribed_at, expires_at, doctor, created_at FROM prescriptions WHERE company_id = ? AND client_id = ?", $p),
        static fn($r) => ['type' => 'prescription', 'id' => $r['id'], 'at' => $r['prescribed_at'] ?? $r['created_at'], 'title' => 'Receita registrada' . ($r['doctor'] ? ' · ' . $r['doctor'] : ''), 'detail' => $r['expires_at'] ? 'Validade: ' . brDate($r['expires_at']) : ''],
    );
    $push(
        fetchAllRows("SELECT id, original_name, entity_type, created_at FROM attachments WHERE company_id = ? AND client_id = ?", $p),
        static fn($r) => ['type' => 'attachment', 'id' => $r['id'], 'at' => $r['created_at'], 'title' => 'Anexo: ' . $r['original_name'], 'detail' => ''],
    );
    $push(
        fetchAllRows("SELECT id, title, type, done_at FROM tasks WHERE company_id = ? AND client_id = ? AND status = 'done'", $p),
        static fn($r) => ['type' => 'task', 'id' => $r['id'], 'at' => $r['done_at'], 'title' => 'Tarefa concluída', 'detail' => $r['title']],
    );
    $events[] = ['type' => 'created', 'id' => $clientId, 'at' => $client['created_at'], 'title' => 'Cadastro criado', 'detail' => $client['origin'] ? 'Origem: ' . $client['origin'] : ''];
    usort($events, static fn($a, $b) => strcmp((string) $b['at'], (string) $a['at']));
    sendJson(array_slice($events, 0, 300));
}

/** Painel geral da carteira de clientes da ótica. */
function handleClientsOverview(string $method, array $input): never
{
    $companyId = Context::companyId();
    $p = [$companyId];
    $base = 'FROM clients c WHERE c.company_id = ? AND c.deleted_at IS NULL';
    $lastSale = "(SELECT MAX(s.sale_date) FROM sales s WHERE s.client_id = c.id AND s.status <> 'cancelled')";
    sendJson([
        'totals' => fetchOne(
            "SELECT COUNT(*) AS total,
                    SUM(c.kind = 'lead') AS leads,
                    SUM(c.message_consent = 1) AS consent,
                    SUM(c.whatsapp <> '') AS with_whatsapp,
                    SUM(c.created_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')) AS new_this_month,
                    SUM({$lastSale} >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)) AS active_12m
             {$base}",
            $p,
        ),
        'recency' => fetchAllRows(
            "SELECT bucket, COUNT(*) AS total FROM (
               SELECT CASE
                 WHEN ls IS NULL THEN 'Nunca comprou'
                 WHEN ls >= DATE_SUB(CURRENT_DATE, INTERVAL 3 MONTH) THEN 'Até 3 meses'
                 WHEN ls >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH) THEN '3 a 6 meses'
                 WHEN ls >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH) THEN '6 a 12 meses'
                 WHEN ls >= DATE_SUB(CURRENT_DATE, INTERVAL 24 MONTH) THEN '1 a 2 anos'
                 ELSE 'Mais de 2 anos' END AS bucket
               FROM (SELECT {$lastSale} AS ls {$base}) x
             ) y GROUP BY bucket",
            $p,
        ),
        'age_groups' => fetchAllRows(
            "SELECT CASE
               WHEN c.birth_date IS NULL THEN 'Não informado'
               WHEN TIMESTAMPDIFF(YEAR, c.birth_date, CURRENT_DATE) < 18 THEN 'Até 17'
               WHEN TIMESTAMPDIFF(YEAR, c.birth_date, CURRENT_DATE) < 30 THEN '18 a 29'
               WHEN TIMESTAMPDIFF(YEAR, c.birth_date, CURRENT_DATE) < 40 THEN '30 a 39'
               WHEN TIMESTAMPDIFF(YEAR, c.birth_date, CURRENT_DATE) < 50 THEN '40 a 49'
               WHEN TIMESTAMPDIFF(YEAR, c.birth_date, CURRENT_DATE) < 60 THEN '50 a 59'
               ELSE '60 ou mais' END AS label, COUNT(*) AS total
             {$base} GROUP BY label ORDER BY MIN(COALESCE(TIMESTAMPDIFF(YEAR, c.birth_date, CURRENT_DATE), 999))",
            $p,
        ),
        'gender' => fetchAllRows("SELECT CASE c.gender WHEN 'F' THEN 'Feminino' WHEN 'M' THEN 'Masculino' WHEN 'O' THEN 'Outro' ELSE 'Não informado' END AS label, COUNT(*) AS total {$base} GROUP BY label ORDER BY total DESC", $p),
        'cities' => fetchAllRows("SELECT COALESCE(NULLIF(c.city, ''), 'Não informada') AS label, COUNT(*) AS total {$base} GROUP BY label ORDER BY total DESC LIMIT 8", $p),
        'origins' => fetchAllRows("SELECT COALESCE(NULLIF(c.origin, ''), 'Não informada') AS label, COUNT(*) AS total {$base} GROUP BY label ORDER BY total DESC LIMIT 8", $p),
        'tags' => fetchAllRows(
            'SELECT t.id, t.name AS label, t.color, COUNT(ct.client_id) AS total FROM tags t
             LEFT JOIN client_tags ct ON ct.tag_id = t.id WHERE t.company_id = ? GROUP BY t.id ORDER BY total DESC LIMIT 12',
            $p,
        ),
        'new_by_month' => fetchAllRows(
            "SELECT DATE_FORMAT(c.created_at, '%Y-%m') AS month, COUNT(*) AS total {$base}
             AND c.created_at >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 11 MONTH) GROUP BY month ORDER BY month",
            $p,
        ),
        'birthdays' => fetchAllRows(
            "SELECT c.id, c.name, c.birth_date, c.whatsapp, c.message_consent {$base}
             AND c.birth_date IS NOT NULL AND MONTH(c.birth_date) = MONTH(CURRENT_DATE) ORDER BY DAY(c.birth_date) LIMIT 100",
            $p,
        ),
        'prescriptions_expiring' => fetchAllRows(
            "SELECT c.id, c.name, c.whatsapp, pr.expires_at FROM prescriptions pr JOIN clients c ON c.id = pr.client_id
             WHERE pr.company_id = ? AND c.deleted_at IS NULL
               AND pr.id = (SELECT MAX(p2.id) FROM prescriptions p2 WHERE p2.client_id = c.id)
               AND pr.expires_at BETWEEN DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY) AND DATE_ADD(CURRENT_DATE, INTERVAL 60 DAY)
             ORDER BY pr.expires_at LIMIT 50",
            $p,
        ),
        'top_clients' => fetchAllRows(
            "SELECT c.id, c.name, COUNT(s.id) AS sales_count, SUM(s.total) AS total
             FROM sales s JOIN clients c ON c.id = s.client_id
             WHERE s.company_id = ? AND s.status <> 'cancelled' AND c.deleted_at IS NULL
             GROUP BY c.id ORDER BY total DESC LIMIT 10",
            $p,
        ),
    ]);
}

function handlePrescriptions(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        $clientId = queryInt('client_id');
        sendJson(fetchAllRows('SELECT * FROM prescriptions WHERE company_id = ? AND client_id = ? ORDER BY id DESC', [$companyId, $clientId ?? 0]));
    }
    requirePermission('service');
    if ($method === 'DELETE') {
        $prescription = requireCompanyRecord('prescriptions', requireRouteId(), $companyId, 'Receita');
        executeQuery('DELETE FROM prescriptions WHERE id = ? AND company_id = ?', [$prescription['id'], $companyId]);
        auditLog('delete', 'prescription', (int) $prescription['id'], 'Receita excluída');
        sendJson(['ok' => true]);
    }
    $values = prescriptionValues($input);
    $values['doctor'] = optionalText($input, 'doctor', 120);
    $values['doctor_crm'] = optionalText($input, 'doctor_crm', 30);
    $values['prescribed_at'] = optionalDate($input, 'prescribed_at');
    $values['expires_at'] = optionalDate($input, 'expires_at');
    if (!$values['expires_at'] && $values['prescribed_at']) {
        $months = (int) companySetting('prescription_validity_months', 12) ?: 12;
        $values['expires_at'] = date('Y-m-d', strtotime($values['prescribed_at'] . " +{$months} months"));
    }
    $values['notes'] = optionalText($input, 'notes', 500);
    if ($method === 'PATCH') {
        $prescription = requireCompanyRecord('prescriptions', requireRouteId(), $companyId, 'Receita');
        updateRow('prescriptions', (int) $prescription['id'], $companyId, $values);
        auditLog('update', 'prescription', (int) $prescription['id'], 'Receita atualizada');
        sendJson(['ok' => true]);
    }
    $client = requireCompanyRecord('clients', $input['client_id'] ?? 0, $companyId, 'Cliente');
    $id = insertRow('prescriptions', ['company_id' => $companyId, 'client_id' => $client['id'], ...$values]);
    auditLog('create', 'prescription', $id, 'Receita registrada para ' . $client['name']);
    generateTasks($companyId, (int) $client['id']);
    sendJson(['ok' => true, 'id' => $id], 201);
}

/** Campos de grau (OD/OE) comuns à receita e à ordem de serviço. */
function prescriptionValues(array $input): array
{
    $values = [];
    foreach (['od', 'oe'] as $eye) {
        foreach (['sph', 'cyl', 'axis', 'dnp', 'height'] as $field) {
            $values["{$eye}_{$field}"] = optionalText($input, "{$eye}_{$field}", 10);
        }
    }
    $values['addition'] = optionalText($input, 'addition', 10);
    return $values;
}
