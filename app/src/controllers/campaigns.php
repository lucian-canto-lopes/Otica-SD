<?php
declare(strict_types=1);

const CAMPAIGN_TYPES = [
    'monthly_promo' => 'Promoção do mês',
    'birthday_month' => 'Aniversariantes do mês',
    'prescription_expiry' => 'Vencimento de receita',
    'renewal' => 'Renovação de óculos',
    'reactivation' => 'Reativação de clientes inativos',
    'christmas' => 'Natal',
    'black_friday' => 'Black Friday',
    'mothers_day' => 'Dia das Mães',
    'fathers_day' => 'Dia dos Pais',
    'back_to_school' => 'Volta às aulas',
    'quote_recovery' => 'Recuperação de orçamentos',
    'custom' => 'Personalizada',
];

function campaignCounts(int $campaignId): array
{
    $counts = ['pending' => 0, 'queued' => 0, 'sent' => 0, 'failed' => 0, 'skipped' => 0, 'replied' => 0];
    foreach (fetchAllRows('SELECT status, COUNT(*) AS total FROM campaign_recipients WHERE campaign_id = ? GROUP BY status', [$campaignId]) as $row) {
        $counts[$row['status']] = (int) $row['total'];
    }
    $counts['total'] = array_sum($counts);
    return $counts;
}

function handleCampaigns(string $method, array $input): never
{
    $companyId = Context::companyId();
    $id = routeId();

    if ($method === 'GET' && $id && query('next') === '1') {
        // Fluxo semiautomático: entrega o próximo destinatário pendente com a mensagem pronta.
        $campaign = requireCompanyRecord('campaigns', $id, $companyId, 'Campanha');
        $recipient = fetchOne(
            "SELECT cr.*, c.name, c.whatsapp FROM campaign_recipients cr JOIN clients c ON c.id = cr.client_id
             WHERE cr.campaign_id = ? AND cr.status = 'pending' ORDER BY cr.id LIMIT 1",
            [$campaign['id']],
        );
        if ($recipient) {
            $recipient['wa_link'] = whatsappLink($recipient['phone'], (string) $recipient['rendered_message']);
        }
        sendJson(['recipient' => $recipient, 'counts' => campaignCounts((int) $campaign['id'])]);
    }
    if ($method === 'GET' && $id && query('recipients') === '1') {
        requireCompanyRecord('campaigns', $id, $companyId, 'Campanha');
        $where = 'WHERE cr.campaign_id = ?';
        $params = [$id];
        if ($status = query('status')) {
            $where .= ' AND cr.status = ?';
            $params[] = $status;
        }
        if ($q = query('q')) {
            $where .= ' AND c.name LIKE ?';
            $params[] = likeTerm($q);
        }
        sendJson(
            paginate(
                'SELECT cr.id, cr.client_id, cr.phone, cr.status, cr.sent_at, cr.error, cr.rendered_message, c.name, u.name AS sent_by_name',
                "FROM campaign_recipients cr JOIN clients c ON c.id = cr.client_id LEFT JOIN users u ON u.id = cr.sent_by {$where}",
                $params,
                'cr.id ASC',
            ),
        );
    }
    if ($method === 'GET' && $id) {
        $campaign = fetchOne(
            'SELECT ca.*, ch.name AS channel_name, ch.type AS channel_type, sr.name AS saved_report_name, u.name AS created_by_name
             FROM campaigns ca LEFT JOIN channels ch ON ch.id = ca.channel_id LEFT JOIN saved_reports sr ON sr.id = ca.saved_report_id
             LEFT JOIN users u ON u.id = ca.created_by WHERE ca.id = ? AND ca.company_id = ?',
            [$id, $companyId],
        ) ?? sendError('Campanha não encontrada.', 404);
        $campaign['audience'] = decodeJsonColumn($campaign['audience'], new stdClass());
        $campaign['counts'] = campaignCounts($id);
        $channel = $campaign['channel_id'] ? fetchOne('SELECT * FROM channels WHERE id = ?', [$campaign['channel_id']]) : defaultChannel($companyId);
        $campaign['channel_type'] ??= $channel['type'] ?? null;
        $campaign['safe_sending'] = isUnofficialChannel($channel);
        $campaign['channel_safety'] = $channel ? channelSafetySummary($channel) : [];
        sendJson($campaign);
    }
    if ($method === 'GET') {
        $where = 'WHERE ca.company_id = ?';
        $params = [$companyId];
        if ($status = query('status')) {
            $where .= ' AND ca.status = ?';
            $params[] = $status;
        }
        $result = paginate(
            "SELECT ca.id, ca.name, ca.type, ca.status, ca.mode, ca.scheduled_at, ca.created_at, ca.started_at, ca.finished_at,
                    ch.name AS channel_name, ch.type AS channel_type,
                    (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = ca.id) AS total,
                    (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = ca.id AND cr.status IN ('sent', 'replied')) AS sent,
                    (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = ca.id AND cr.status = 'replied') AS replied,
                    (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = ca.id AND cr.status = 'pending') AS pending",
            "FROM campaigns ca LEFT JOIN channels ch ON ch.id = ca.channel_id {$where}",
            $params,
            'ca.id DESC',
        );
        $result['types'] = CAMPAIGN_TYPES;
        sendJson($result);
    }

    requirePermission('crm');
    $action = (string) ($input['action'] ?? '');

    if ($method === 'POST' && $action === 'preview') {
        $audience = is_array($input['audience'] ?? null) ? $input['audience'] : [];
        if (!empty($input['saved_report_id'])) {
            $report = requireCompanyRecord('saved_reports', $input['saved_report_id'], $companyId, 'Relatório');
            $audience = array_merge(decodeJsonColumn($report['definition'], [])['filters'] ?? [], $audience);
        }
        if (($audience['require_consent'] ?? true) !== false) {
            $audience['consent'] = 1;
        }
        $audience['has_whatsapp'] = 1;
        if (!empty($input['skip_recent_days'])) {
            $audience['contacted_last_days_exclude'] = (int) $input['skip_recent_days'];
        }
        [$where, $params] = buildClientFilter($audience, $companyId);
        $where .= ' AND c.message_opt_out_at IS NULL';
        $total = (int) fetchValue("SELECT COUNT(*) FROM clients c WHERE {$where}", $params);
        $sample = fetchAllRows("SELECT c.id, c.name, c.whatsapp, c.city FROM clients c WHERE {$where} ORDER BY c.name LIMIT 8", $params);
        $company = Context::$company;
        $example = $sample ? renderTemplate((string) ($input['message'] ?? ''), $sample[0], $company) : '';
        sendJson(['total' => $total, 'sample' => $sample, 'example' => $example]);
    }

    if ($method === 'PATCH' && $id && $action !== '') {
        $campaign = requireCompanyRecord('campaigns', $id, $companyId, 'Campanha');
        switch ($action) {
            case 'build':
                $added = buildCampaignRecipients($campaign);
                auditLog('build', 'campaign', $id, "Público atualizado: {$added} novos destinatários");
                sendJson(['ok' => true, 'added' => $added, 'counts' => campaignCounts($id)]);
            case 'start':
                if (campaignCounts($id)['total'] === 0) {
                    buildCampaignRecipients($campaign);
                }
                $status = $campaign['scheduled_at'] && strtotime($campaign['scheduled_at']) > time() ? 'scheduled' : 'running';
                executeQuery("UPDATE campaigns SET status = ?, started_at = COALESCE(started_at, NOW()), next_send_at = NULL, sent_in_batch = 0, pause_reason = '' WHERE id = ?", [$status, $id]);
                auditLog('start', 'campaign', $id, 'Campanha iniciada: ' . $campaign['name']);
                sendJson(['ok' => true, 'status' => $status]);
            case 'pause':
            case 'resume':
            case 'cancel':
            case 'complete':
                $status = ['pause' => 'paused', 'resume' => 'running', 'cancel' => 'cancelled', 'complete' => 'completed'][$action];
                executeQuery(
                    "UPDATE campaigns SET status = ?, finished_at = IF(? IN ('cancelled', 'completed'), NOW(), finished_at), pause_reason = '',
                            next_send_at = IF(? = 'running', NULL, next_send_at) WHERE id = ?",
                    [$status, $status, $status, $id],
                );
                auditLog($action, 'campaign', $id, 'Campanha ' . $campaign['name'] . ': ' . $status);
                sendJson(['ok' => true]);
            case 'mark':
                // Registro manual do envio (modo semiautomático pelo WhatsApp do atendente).
                $recipient = fetchOne('SELECT cr.*, c.name FROM campaign_recipients cr JOIN clients c ON c.id = cr.client_id WHERE cr.id = ? AND cr.campaign_id = ?', [$input['recipient_id'] ?? 0, $id])
                    ?? sendError('Destinatário não encontrado.', 404);
                $status = enumValue($input, 'status', ['sent', 'skipped', 'failed', 'pending']);
                executeQuery(
                    'UPDATE campaign_recipients SET status = ?, sent_at = ?, sent_by = ?, error = ? WHERE id = ?',
                    [$status, $status === 'sent' ? date('Y-m-d H:i:s') : null, Context::userId(), optionalText($input, 'error', 500), $recipient['id']],
                );
                if ($status === 'sent') {
                    insertRow('interactions', [
                        'company_id' => $companyId,
                        'client_id' => $recipient['client_id'],
                        'channel' => 'whatsapp',
                        'direction' => 'out',
                        'subject' => 'Campanha: ' . mb_substr($campaign['name'], 0, 130),
                        'notes' => $recipient['rendered_message'],
                        'user_id' => Context::userId(),
                        'campaign_id' => $id,
                    ]);
                    if ($campaign['status'] === 'draft') {
                        executeQuery("UPDATE campaigns SET status = 'running', started_at = NOW() WHERE id = ?", [$id]);
                    }
                }
                $counts = campaignCounts($id);
                if ($counts['pending'] === 0 && $counts['queued'] === 0) {
                    executeQuery("UPDATE campaigns SET status = 'completed', finished_at = NOW() WHERE id = ? AND status IN ('running', 'draft')", [$id]);
                }
                sendJson(['ok' => true, 'counts' => $counts]);
            case 'send_one':
                $recipient = fetchOne('SELECT cr.*, c.name FROM campaign_recipients cr JOIN clients c ON c.id = cr.client_id WHERE cr.id = ? AND cr.campaign_id = ?', [$input['recipient_id'] ?? 0, $id])
                    ?? sendError('Destinatário não encontrado.', 404);
                $channel = $campaign['channel_id'] ? fetchOne('SELECT * FROM channels WHERE id = ?', [$campaign['channel_id']]) : defaultChannel($companyId);
                if (!$channel || $channel['type'] === 'whatsapp_manual') {
                    sendError('Esta campanha usa envio manual: abra o WhatsApp e marque como enviado.');
                }
                $result = sendCampaignRecipient($campaign, $recipient, $channel, true);
                sendJson(['ok' => $result['ok'], 'error' => $result['error'] ?? '', 'skipped' => !empty($result['skipped']), 'counts' => campaignCounts($id)]);
            case 'retry_failed':
                executeQuery("UPDATE campaign_recipients SET status = 'pending', error = '' WHERE campaign_id = ? AND status = 'failed'", [$id]);
                sendJson(['ok' => true, 'counts' => campaignCounts($id)]);
        }
        sendError('Ação inválida.');
    }

    if ($method === 'DELETE') {
        $campaign = requireCompanyRecord('campaigns', requireRouteId(), $companyId, 'Campanha');
        if (campaignCounts((int) $campaign['id'])['sent'] > 0) {
            executeQuery("UPDATE campaigns SET status = 'cancelled' WHERE id = ?", [$campaign['id']]);
        } else {
            executeQuery('DELETE FROM campaigns WHERE id = ? AND company_id = ?', [$campaign['id'], $companyId]);
        }
        auditLog('delete', 'campaign', (int) $campaign['id'], 'Campanha removida: ' . $campaign['name']);
        sendJson(['ok' => true]);
    }

    $values = [
        'name' => requiredText($input, 'name', 150, 'nome'),
        'type' => isset(CAMPAIGN_TYPES[$input['type'] ?? '']) ? $input['type'] : 'custom',
        'mode' => enumValue($input, 'mode', ['manual', 'semi', 'auto'], 'semi'),
        'channel_id' => optionalCompanyReference($input, 'channel_id', 'channels', $companyId, 'Canal'),
        'template_id' => optionalCompanyReference($input, 'template_id', 'message_templates', $companyId, 'Modelo'),
        'message' => requiredText($input, 'message', 4000, 'mensagem'),
        'audience' => jsonColumn(is_array($input['audience'] ?? null) ? $input['audience'] : []),
        'saved_report_id' => optionalCompanyReference($input, 'saved_report_id', 'saved_reports', $companyId, 'Relatório'),
        'scheduled_at' => optionalDateTime($input, 'scheduled_at'),
        'send_window_start' => preg_match('/^\d{2}:\d{2}$/', (string) ($input['send_window_start'] ?? '')) ? $input['send_window_start'] . ':00' : '08:00:00',
        'send_window_end' => preg_match('/^\d{2}:\d{2}$/', (string) ($input['send_window_end'] ?? '')) ? $input['send_window_end'] . ':00' : '20:00:00',
        'per_minute' => max(1, min(60, (int) ($input['per_minute'] ?? 10))),
        // Ritmo do envio seguro (WhatsApp por QR Code). Valores fora da faixa segura são ajustados.
        'min_interval_seconds' => max(30, min(900, (int) ($input['min_interval_seconds'] ?? 45))),
        'max_interval_seconds' => max(30, min(1800, (int) ($input['max_interval_seconds'] ?? 120))),
        'batch_size' => max(5, min(50, (int) ($input['batch_size'] ?? 20))),
        'batch_pause_minutes' => max(5, min(180, (int) ($input['batch_pause_minutes'] ?? 15))),
        'opt_out_footer' => array_key_exists('opt_out_footer', $input) ? booleanValue($input, 'opt_out_footer') : 1,
        'skip_recent_days' => max(0, (int) ($input['skip_recent_days'] ?? 0)),
    ];
    $values['max_interval_seconds'] = max($values['min_interval_seconds'], $values['max_interval_seconds']);
    if ($method === 'PATCH') {
        $campaign = requireCompanyRecord('campaigns', requireRouteId(), $companyId, 'Campanha');
        updateRow('campaigns', (int) $campaign['id'], $companyId, $values);
        // Mensagens ainda pendentes recebem o novo texto.
        if ($campaign['message'] !== $values['message']) {
            $company = Context::$company;
            foreach (fetchAllRows("SELECT cr.id, c.* FROM campaign_recipients cr JOIN clients c ON c.id = cr.client_id WHERE cr.campaign_id = ? AND cr.status = 'pending'", [$campaign['id']]) as $row) {
                executeQuery('UPDATE campaign_recipients SET rendered_message = ? WHERE id = ?', [renderTemplate($values['message'], $row, $company), $row['id']]);
            }
        }
        auditLog('update', 'campaign', (int) $campaign['id'], 'Campanha alterada: ' . $values['name']);
        sendJson(['ok' => true, 'id' => (int) $campaign['id']]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $campaignId = insertRow('campaigns', ['company_id' => $companyId, ...$values, 'status' => 'draft', 'created_by' => Context::userId()]);
    $added = buildCampaignRecipients(fetchOne('SELECT * FROM campaigns WHERE id = ?', [$campaignId]));
    auditLog('create', 'campaign', $campaignId, "Campanha criada: {$values['name']} ({$added} destinatários)");
    sendJson(['ok' => true, 'id' => $campaignId, 'recipients' => $added], 201);
}

function handleAutomations(string $method, array $input): never
{
    $companyId = Context::companyId();
    $id = routeId();
    if ($method === 'GET' && $id) {
        $automation = requireCompanyRecord('automations', $id, $companyId, 'Automação');
        $automation['trigger_config'] = decodeJsonColumn($automation['trigger_config'], new stdClass());
        $automation['action_config'] = decodeJsonColumn($automation['action_config'], new stdClass());
        $automation['runs'] = fetchAllRows(
            'SELECT r.*, c.name AS client_name FROM automation_runs r LEFT JOIN clients c ON c.id = r.client_id WHERE r.automation_id = ? ORDER BY r.id DESC LIMIT 100',
            [$id],
        );
        sendJson($automation);
    }
    if ($method === 'GET') {
        $rows = fetchAllRows('SELECT * FROM automations WHERE company_id = ? ORDER BY active DESC, name', [$companyId]);
        foreach ($rows as &$row) {
            $row['trigger_config'] = decodeJsonColumn($row['trigger_config'], new stdClass());
            $row['action_config'] = decodeJsonColumn($row['action_config'], new stdClass());
        }
        unset($row);
        sendJson(['data' => $rows, 'triggers' => AUTOMATION_TRIGGERS, 'actions' => AUTOMATION_ACTIONS]);
    }
    requirePermission('manage');
    if ($method === 'POST' && ($input['action'] ?? '') === 'run_now') {
        $count = runScheduledAutomations($companyId);
        generateTasks($companyId);
        sendJson(['ok' => true, 'executed' => $count]);
    }
    if ($method === 'DELETE') {
        $automation = requireCompanyRecord('automations', requireRouteId(), $companyId, 'Automação');
        executeQuery('DELETE FROM automations WHERE id = ? AND company_id = ?', [$automation['id'], $companyId]);
        auditLog('delete', 'automation', (int) $automation['id'], 'Automação excluída: ' . $automation['name']);
        sendJson(['ok' => true]);
    }
    $values = [
        'name' => requiredText($input, 'name', 150, 'nome'),
        'trigger_type' => enumValue($input, 'trigger_type', array_keys(AUTOMATION_TRIGGERS)),
        'trigger_config' => jsonColumn(is_array($input['trigger_config'] ?? null) ? $input['trigger_config'] : []),
        'action_type' => enumValue($input, 'action_type', array_keys(AUTOMATION_ACTIONS)),
        'action_config' => jsonColumn(is_array($input['action_config'] ?? null) ? $input['action_config'] : []),
        'mode' => enumValue($input, 'mode', ['auto', 'semi'], 'semi'),
        'active' => array_key_exists('active', $input) ? booleanValue($input, 'active') : 1,
    ];
    if ($values['action_type'] === 'webhook') {
        $url = (string) (($input['action_config']['url'] ?? ''));
        if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#', $url)) {
            sendError('Informe uma URL válida para o webhook.');
        }
    }
    if ($method === 'PATCH') {
        $automation = requireCompanyRecord('automations', requireRouteId(), $companyId, 'Automação');
        updateRow('automations', (int) $automation['id'], $companyId, $values);
        auditLog('update', 'automation', (int) $automation['id'], 'Automação alterada: ' . $values['name']);
        sendJson(['ok' => true]);
    }
    $automationId = insertRow('automations', ['company_id' => $companyId, ...$values]);
    auditLog('create', 'automation', $automationId, 'Automação criada: ' . $values['name']);
    sendJson(['ok' => true, 'id' => $automationId], 201);
}
