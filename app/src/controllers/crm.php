<?php
declare(strict_types=1);

function handleInteractions(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        $where = 'WHERE i.company_id = ?';
        $params = [$companyId];
        if ($clientId = queryInt('client_id')) {
            $where .= ' AND i.client_id = ?';
            $params[] = $clientId;
        }
        if ($channel = query('channel')) {
            $where .= ' AND i.channel = ?';
            $params[] = $channel;
        }
        sendJson(
            paginate(
                'SELECT i.*, c.name AS client_name, u.name AS user_name',
                "FROM interactions i JOIN clients c ON c.id = i.client_id LEFT JOIN users u ON u.id = i.user_id {$where}",
                $params,
                'i.contact_at DESC',
            ),
        );
    }
    requirePermission('crm');
    if ($method === 'DELETE') {
        $interaction = requireCompanyRecord('interactions', requireRouteId(), $companyId, 'Interação');
        executeQuery('DELETE FROM interactions WHERE id = ? AND company_id = ?', [$interaction['id'], $companyId]);
        auditLog('delete', 'interaction', (int) $interaction['id'], 'Interação excluída');
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $client = requireCompanyRecord('clients', $input['client_id'] ?? 0, $companyId, 'Cliente');
    $id = insertRow('interactions', [
        'company_id' => $companyId,
        'client_id' => $client['id'],
        'channel' => enumValue($input, 'channel', ['whatsapp', 'instagram', 'facebook', 'phone', 'visit', 'email', 'other'], 'other'),
        'direction' => enumValue($input, 'direction', ['in', 'out'], 'out'),
        'subject' => requiredText($input, 'subject', 150, 'assunto'),
        'notes' => optionalText($input, 'notes', 5000),
        'user_id' => Context::userId(),
        'contact_at' => optionalDateTime($input, 'contact_at') ?? date('Y-m-d H:i:s'),
    ]);
    if ($nextContact = optionalDate($input, 'next_contact_date')) {
        executeQuery('UPDATE clients SET next_contact_date = ? WHERE id = ?', [$nextContact, $client['id']]);
        generateTasks($companyId, (int) $client['id']);
    }
    auditLog('create', 'interaction', $id, 'Atendimento registrado para ' . $client['name']);
    sendJson(['ok' => true, 'id' => $id], 201);
}

function handleTasks(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        $where = 'WHERE t.company_id = ?';
        $params = [$companyId];
        $status = query('status', 'pending');
        if ($status !== 'all') {
            $where .= ' AND t.status = ?';
            $params[] = $status;
        }
        if ($type = query('type')) {
            $where .= ' AND t.type = ?';
            $params[] = $type;
        }
        if ($clientId = queryInt('client_id')) {
            $where .= ' AND t.client_id = ?';
            $params[] = $clientId;
        }
        if (query('mine') === '1') {
            $where .= ' AND (t.user_id = ? OR t.user_id IS NULL)';
            $params[] = Context::userId();
        }
        $period = query('period');
        if ($period === 'today') {
            $where .= ' AND t.due_date <= CURRENT_DATE';
        } elseif ($period === 'week') {
            $where .= ' AND t.due_date <= DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)';
        }
        $result = paginate(
            'SELECT t.*, c.name AS client_name, c.whatsapp AS client_whatsapp, c.message_consent, u.name AS user_name',
            "FROM tasks t LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN users u ON u.id = t.user_id {$where}",
            $params,
            't.due_date ASC, t.id ASC',
        );
        $result['counts'] = fetchAllRows(
            "SELECT type, COUNT(*) AS total FROM tasks WHERE company_id = ? AND status = 'pending' AND due_date <= DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY) GROUP BY type",
            [$companyId],
        );
        sendJson($result);
    }
    requirePermission('crm');
    if ($method === 'PATCH') {
        $task = requireCompanyRecord('tasks', requireRouteId(), $companyId, 'Tarefa');
        $status = enumValue($input, 'status', ['pending', 'done', 'cancelled'], $task['status']);
        executeQuery(
            'UPDATE tasks SET status = ?, done_at = ?, due_date = ?, title = ?, user_id = ? WHERE id = ? AND company_id = ?',
            [
                $status,
                $status === 'done' ? date('Y-m-d H:i:s') : null,
                optionalDate($input, 'due_date') ?? $task['due_date'],
                optionalText($input, 'title', 255) ?: $task['title'],
                array_key_exists('user_id', $input) ? ($input['user_id'] ?: null) : $task['user_id'],
                $task['id'],
                $companyId,
            ],
        );
        if ($status === 'done' && $task['client_id'] && ($input['register_interaction'] ?? false)) {
            insertRow('interactions', [
                'company_id' => $companyId,
                'client_id' => $task['client_id'],
                'channel' => enumValue($input, 'channel', ['whatsapp', 'phone', 'visit', 'email', 'other'], 'whatsapp'),
                'direction' => 'out',
                'subject' => mb_substr($task['title'], 0, 150),
                'notes' => optionalText($input, 'notes', 5000),
                'user_id' => Context::userId(),
            ]);
        }
        sendJson(['ok' => true]);
    }
    if ($method === 'DELETE') {
        $task = requireCompanyRecord('tasks', requireRouteId(), $companyId, 'Tarefa');
        executeQuery('DELETE FROM tasks WHERE id = ? AND company_id = ?', [$task['id'], $companyId]);
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $id = insertRow('tasks', [
        'company_id' => $companyId,
        'client_id' => optionalCompanyReference($input, 'client_id', 'clients', $companyId, 'Cliente'),
        'user_id' => $input['user_id'] ?? Context::userId(),
        'type' => enumValue($input, 'type', ['birthday', 'renewal', 'prescription', 'pickup', 'follow_up', 'quote', 'other'], 'follow_up'),
        'title' => requiredText($input, 'title', 255, 'título'),
        'due_date' => requiredDate($input, 'due_date'),
    ]);
    auditLog('create', 'task', $id, 'Tarefa criada');
    sendJson(['ok' => true, 'id' => $id], 201);
}

function handleLostOpportunities(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        $where = 'WHERE l.company_id = ?';
        $params = [$companyId];
        if ($from = normalizeDate(query('from', ''))) {
            $where .= ' AND l.occurred_at >= ?';
            $params[] = $from;
        }
        if ($to = normalizeDate(query('to', ''))) {
            $where .= ' AND l.occurred_at <= ?';
            $params[] = $to;
        }
        if ($reason = queryInt('reason_id')) {
            $where .= ' AND l.reason_id = ?';
            $params[] = $reason;
        }
        if ($clientId = queryInt('client_id')) {
            $where .= ' AND l.client_id = ?';
            $params[] = $clientId;
        }
        $kind = query('kind');
        if ($kind === 'client') {
            $where .= ' AND l.client_id IS NOT NULL';
        } elseif ($kind === 'non_client') {
            $where .= ' AND l.client_id IS NULL';
        }
        $from = "FROM lost_opportunities l LEFT JOIN clients c ON c.id = l.client_id LEFT JOIN loss_reasons r ON r.id = l.reason_id
                 LEFT JOIN users u ON u.id = l.user_id LEFT JOIN quotes q ON q.id = l.quote_id {$where}";
        $result = paginate(
            'SELECT l.*, COALESCE(c.name, l.contact_name) AS name, r.name AS reason, u.name AS user_name, q.number AS quote_number',
            $from,
            $params,
            'l.occurred_at DESC, l.id DESC',
        );
        $result['by_reason'] = fetchAllRows(
            "SELECT COALESCE(r.name, 'Não informado') AS label, COUNT(*) AS total, COALESCE(SUM(l.estimated_value), 0) AS value
             {$from} GROUP BY label ORDER BY total DESC",
            $params,
        );
        sendJson($result);
    }
    requirePermission('sell');
    if ($method === 'DELETE') {
        $lost = requireCompanyRecord('lost_opportunities', requireRouteId(), $companyId, 'Registro');
        executeQuery('DELETE FROM lost_opportunities WHERE id = ? AND company_id = ?', [$lost['id'], $companyId]);
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $clientId = optionalCompanyReference($input, 'client_id', 'clients', $companyId, 'Cliente');
    $contactName = optionalText($input, 'contact_name', 150);
    if (!$clientId && $contactName === '') {
        sendError('Informe o cliente ou o nome da pessoa atendida.');
    }
    $id = insertRow('lost_opportunities', [
        'company_id' => $companyId,
        'client_id' => $clientId,
        'contact_name' => $contactName,
        'contact_phone' => normalizePhone(optionalText($input, 'contact_phone', 30), (string) companySetting('default_ddd', '')),
        'reason_id' => optionalCompanyReference($input, 'reason_id', 'loss_reasons', $companyId, 'Motivo'),
        'estimated_value' => moneyValue($input, 'estimated_value'),
        'notes' => optionalText($input, 'notes', 1000),
        'user_id' => Context::userId(),
        'occurred_at' => optionalDate($input, 'occurred_at') ?? date('Y-m-d'),
    ]);
    // Contatos que ainda não são clientes podem virar leads para campanhas futuras.
    if (!$clientId && booleanValue($input, 'create_lead')) {
        $leadId = insertRow('clients', [
            'company_id' => $companyId,
            'kind' => 'lead',
            'name' => $contactName,
            'whatsapp' => normalizePhone(optionalText($input, 'contact_phone', 30), (string) companySetting('default_ddd', '')),
            'origin' => 'Atendimento sem compra',
            'message_consent' => booleanValue($input, 'message_consent'),
            'message_consent_at' => booleanValue($input, 'message_consent') ? date('Y-m-d H:i:s') : null,
        ]);
        executeQuery('UPDATE lost_opportunities SET client_id = ? WHERE id = ?', [$leadId, $id]);
    }
    auditLog('create', 'lost', $id, 'Não compra registrada: ' . ($contactName ?: 'cliente #' . $clientId));
    sendJson(['ok' => true, 'id' => $id], 201);
}

function publicChannel(array $channel): array
{
    $config = channelConfig($channel);
    foreach (SECRET_CHANNEL_FIELDS as $field) {
        if (!empty($config[$field])) {
            $config[$field] = '••••' . substr((string) $config[$field], -4);
        }
    }
    $channel['safety'] = channelSafetySummary($channel);
    $channel['config'] = $config;
    $channel['type_label'] = CHANNEL_TYPES[$channel['type']]['label'] ?? $channel['type'];
    $base = appConfig('PUBLIC_URL') ?: ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $channel['webhook_url'] = rtrim($base, '/') . '/index.php?action=webhook&token=' . $channel['webhook_token'];
    return $channel;
}

function handleChannels(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        $channels = array_map('publicChannel', fetchAllRows('SELECT * FROM channels WHERE company_id = ? ORDER BY is_default DESC, id', [$companyId]));
        sendJson(['channels' => $channels, 'types' => CHANNEL_TYPES, 'evolution_available' => evolutionServerConfigured(), 'warmup_steps' => WARMUP_STEPS]);
    }
    requirePermission('manage');
    if ($method === 'DELETE') {
        $channel = requireCompanyRecord('channels', requireRouteId(), $companyId, 'Canal');
        if ($channel['type'] === 'whatsapp_evolution' && evolutionTarget($channel)['managed']) {
            evolutionLogout($channel);
        }
        executeQuery("UPDATE channels SET status = 'inactive', is_default = 0 WHERE id = ? AND company_id = ?", [$channel['id'], $companyId]);
        auditLog('delete', 'channel', (int) $channel['id'], 'Canal desativado: ' . $channel['name']);
        sendJson(['ok' => true]);
    }
    if ($method === 'POST' && ($input['action'] ?? '') === 'test') {
        $channel = requireCompanyRecord('channels', requireRouteId(), $companyId, 'Canal');
        $to = normalizePhone(requiredText($input, 'to', 30, 'telefone de teste'), (string) companySetting('default_ddd', ''));
        $result = providerSendText($channel, $to, 'Mensagem de teste do Ocular CRM ✅');
        executeQuery('UPDATE channels SET status = ?, last_error = ? WHERE id = ?', [$result['ok'] ? 'active' : 'error', mb_substr((string) $result['error'], 0, 500), $channel['id']]);
        sendJson($result + ['wa_link' => $channel['type'] === 'whatsapp_manual' ? whatsappLink($to, 'Mensagem de teste do Ocular CRM') : null]);
    }
    if ($method === 'POST' && in_array($input['action'] ?? '', ['connect', 'state', 'logout'], true)) {
        $channel = requireCompanyRecord('channels', requireRouteId(), $companyId, 'Canal');
        if ($channel['type'] !== 'whatsapp_evolution') {
            sendError('A conexão por QR Code é exclusiva dos canais Evolution API.');
        }
        if ($input['action'] === 'connect') {
            $pairing = onlyDigits((string) ($input['pairing_number'] ?? ''));
            $result = evolutionConnect($channel, $pairing !== '' ? normalizePhone($pairing, (string) companySetting('default_ddd', '')) : '');
            auditLog('connect', 'channel', (int) $channel['id'], 'Conexão do WhatsApp solicitada: ' . $channel['name']);
        } elseif ($input['action'] === 'logout') {
            $result = evolutionLogout($channel);
            auditLog('disconnect', 'channel', (int) $channel['id'], 'WhatsApp desconectado: ' . $channel['name']);
        } else {
            $result = evolutionRefreshState($channel) + ['ok' => true];
        }
        $fresh = publicChannel(fetchOne('SELECT * FROM channels WHERE id = ?', [$channel['id']]));
        sendJson($result + ['channel' => $fresh]);
    }
    $type = enumValue($input, 'type', array_keys(CHANNEL_TYPES));
    $incoming = is_array($input['config'] ?? null) ? $input['config'] : [];
    $existing = null;
    if ($method === 'PATCH') {
        $existing = requireCompanyRecord('channels', requireRouteId(), $companyId, 'Canal');
    }
    $previousConfig = $existing ? channelConfig($existing) : [];
    $config = [];
    foreach (CHANNEL_TYPES[$type]['fields'] as $field) {
        $value = trim((string) ($incoming[$field] ?? ''));
        // Campos secretos mascarados ("••••1234") mantêm o valor salvo.
        $config[$field] = str_starts_with($value, '••••') ? ($previousConfig[$field] ?? '') : $value;
    }
    if ($type === 'whatsapp_evolution') {
        // Integrado: o Ocular cria e gerencia a instância no servidor Evolution do sistema.
        $config['managed'] = !empty($incoming['managed']) ? '1' : '';
        if ($config['managed'] && !evolutionServerConfigured()) {
            sendError('O WhatsApp integrado não está ativo nesta instalação. Configure EVOLUTION_URL e EVOLUTION_API_KEY ou informe um servidor próprio.');
        }
        if (!$config['managed'] && ($config['base_url'] === '' || $config['api_key'] === '' || $config['instance'] === '')) {
            sendError('Para usar um servidor Evolution próprio, informe a URL, a API Key e o nome da instância.');
        }
        if ($config['managed']) {
            $config['instance'] = $previousConfig['instance'] ?? '';
        }
    }
    $values = [
        'type' => $type,
        'name' => requiredText($input, 'name', 120, 'nome'),
        'config' => jsonColumn($config),
        'status' => $existing && $existing['status'] === 'error' ? 'error' : 'active',
        'is_default' => booleanValue($input, 'is_default'),
        'daily_limit' => max(0, min(1000, (int) ($input['daily_limit'] ?? 0))),
    ];
    $channelId = inTransaction(static function () use ($existing, $companyId, $values): int {
        if ($values['is_default']) {
            executeQuery('UPDATE channels SET is_default = 0 WHERE company_id = ?', [$companyId]);
        }
        if ($existing) {
            updateRow('channels', (int) $existing['id'], $companyId, $values);
            return (int) $existing['id'];
        }
        return insertRow('channels', ['company_id' => $companyId, ...$values, 'webhook_token' => bin2hex(random_bytes(16))]);
    });
    auditLog($existing ? 'update' : 'create', 'channel', $channelId, 'Canal ' . $values['name'] . ' (' . CHANNEL_TYPES[$type]['label'] . ')');
    sendJson(['ok' => true, 'id' => $channelId], $existing ? 200 : 201);
}

function handleConversations(string $method, array $input): never
{
    $companyId = Context::companyId();
    $id = routeId();
    if ($method === 'GET' && $id) {
        $conversation = fetchOne(
            'SELECT cv.*, ch.type AS channel_type, ch.name AS channel_name, c.name AS client_name
             FROM conversations cv JOIN channels ch ON ch.id = cv.channel_id LEFT JOIN clients c ON c.id = cv.client_id
             WHERE cv.id = ? AND cv.company_id = ?',
            [$id, $companyId],
        ) ?? sendError('Conversa não encontrada.', 404);
        $beforeId = queryInt('before');
        $conversation['messages'] = array_reverse(fetchAllRows(
            'SELECT m.id, m.direction, m.type, m.body, m.media_url, m.status, m.error, m.created_at, u.name AS user_name
             FROM messages m LEFT JOIN users u ON u.id = m.user_id
             WHERE m.conversation_id = ?' . ($beforeId ? ' AND m.id < ' . (int) $beforeId : '') . ' ORDER BY m.id DESC LIMIT 100',
            [$id],
        ));
        executeQuery('UPDATE conversations SET unread = 0 WHERE id = ?', [$id]);
        sendJson($conversation);
    }
    if ($method === 'GET') {
        $where = 'WHERE cv.company_id = ?';
        $params = [$companyId];
        if ($status = query('status')) {
            $where .= ' AND cv.status = ?';
            $params[] = $status;
        }
        if ($q = query('q')) {
            $where .= ' AND (cv.contact_name LIKE ? OR c.name LIKE ? OR cv.contact_handle LIKE ?)';
            array_push($params, likeTerm($q), likeTerm($q), likeTerm($q));
        }
        if (query('unread') === '1') {
            $where .= ' AND cv.unread > 0';
        }
        if (query('mine') === '1') {
            $where .= ' AND cv.assigned_user_id = ?';
            $params[] = Context::userId();
        }
        sendJson(
            paginate(
                'SELECT cv.id, cv.client_id, cv.contact_handle, cv.contact_name, cv.status, cv.unread, cv.last_message_at,
                        cv.last_message_preview, cv.assigned_user_id, ch.type AS channel_type, c.name AS client_name, u.name AS assigned_name',
                "FROM conversations cv JOIN channels ch ON ch.id = cv.channel_id LEFT JOIN clients c ON c.id = cv.client_id
                 LEFT JOIN users u ON u.id = cv.assigned_user_id {$where}",
                $params,
                'cv.last_message_at DESC, cv.id DESC',
                100,
            ),
        );
    }
    requirePermission('crm');
    if ($method === 'POST') {
        // Inicia (ou retoma) uma conversa com um cliente pelo canal escolhido.
        $client = requireCompanyRecord('clients', $input['client_id'] ?? 0, $companyId, 'Cliente');
        $channel = !empty($input['channel_id'])
            ? requireCompanyRecord('channels', $input['channel_id'], $companyId, 'Canal')
            : (defaultChannel($companyId) ?? sendError('Configure um canal de WhatsApp em Configurações › Canais.'));
        $handle = str_starts_with($channel['type'], 'whatsapp')
            ? normalizePhone($client['whatsapp'] ?: $client['phone'], (string) companySetting('default_ddd', ''))
            : '';
        if ($handle === '') {
            sendError('O cliente não possui WhatsApp cadastrado.');
        }
        $conversation = findOrCreateConversation($companyId, $channel, $handle, $client['name'], (int) $client['id']);
        sendJson(['ok' => true, 'id' => (int) $conversation['id']]);
    }
    if ($method === 'PATCH') {
        $conversation = requireCompanyRecord('conversations', requireRouteId(), $companyId, 'Conversa');
        $values = [];
        if (isset($input['status'])) {
            $values['status'] = enumValue($input, 'status', ['open', 'pending', 'closed']);
        }
        if (array_key_exists('assigned_user_id', $input)) {
            $values['assigned_user_id'] = $input['assigned_user_id'] ?: null;
        }
        if (array_key_exists('client_id', $input)) {
            $values['client_id'] = optionalCompanyReference($input, 'client_id', 'clients', $companyId, 'Cliente');
        }
        updateRow('conversations', (int) $conversation['id'], $companyId, $values);
        sendJson(['ok' => true]);
    }
    sendError('Método não permitido.', 405);
}

function handleMessages(string $method, array $input): never
{
    $companyId = Context::companyId();
    requirePermission('crm');
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $conversation = requireCompanyRecord('conversations', $input['conversation_id'] ?? 0, $companyId, 'Conversa');
    $body = requiredText($input, 'body', 4000, 'mensagem');
    $result = sendConversationMessage($conversation, $body);
    if ($conversation['client_id']) {
        $channelType = fetchValue('SELECT type FROM channels WHERE id = ?', [$conversation['channel_id']]);
        insertRow('interactions', [
            'company_id' => $companyId,
            'client_id' => $conversation['client_id'],
            'channel' => str_starts_with((string) $channelType, 'whatsapp') ? 'whatsapp' : (string) $channelType,
            'direction' => 'out',
            'subject' => 'Mensagem enviada',
            'notes' => mb_substr($body, 0, 1000),
            'user_id' => Context::userId(),
        ]);
    }
    auditLog('send_message', 'conversation', (int) $conversation['id'], 'Mensagem enviada' . ($result['ok'] ? '' : ' (falha)'));
    sendJson($result, $result['ok'] ? 201 : 502);
}

function handleTemplates(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        sendJson(fetchAllRows('SELECT * FROM message_templates WHERE company_id = ? ORDER BY category, name', [$companyId]));
    }
    requirePermission('crm');
    if ($method === 'DELETE') {
        $template = requireCompanyRecord('message_templates', requireRouteId(), $companyId, 'Modelo');
        executeQuery('DELETE FROM message_templates WHERE id = ? AND company_id = ?', [$template['id'], $companyId]);
        sendJson(['ok' => true]);
    }
    $values = [
        'name' => requiredText($input, 'name', 120, 'nome'),
        'category' => optionalText($input, 'category', 40) ?: 'marketing',
        'body' => requiredText($input, 'body', 4000, 'texto'),
        'meta_template_name' => optionalText($input, 'meta_template_name', 120),
        'meta_language' => optionalText($input, 'meta_language', 10) ?: 'pt_BR',
    ];
    if ($method === 'PATCH') {
        $template = requireCompanyRecord('message_templates', requireRouteId(), $companyId, 'Modelo');
        updateRow('message_templates', (int) $template['id'], $companyId, $values);
        sendJson(['ok' => true]);
    }
    $id = insertRow('message_templates', ['company_id' => $companyId, ...$values]);
    sendJson(['ok' => true, 'id' => $id], 201);
}
