<?php
declare(strict_types=1);

const AUTOMATION_TRIGGERS = [
    'birthday' => 'Aniversário do cliente',
    'prescription_expiring' => 'Receita perto de vencer',
    'no_purchase' => 'Cliente sem comprar há X dias',
    'purchase_anniversary' => 'X meses após a compra (renovação)',
    'post_sale' => 'X dias após a venda (pós-venda)',
    'quote_followup' => 'Orçamento em aberto há X dias',
    'order_ready' => 'Ordem de serviço pronta',
    'client_created' => 'Novo cliente cadastrado',
    'message_received' => 'Mensagem recebida com palavra-chave',
];

const AUTOMATION_ACTIONS = [
    'send_message' => 'Enviar mensagem',
    'create_task' => 'Criar tarefa para a equipe',
    'add_tag' => 'Adicionar etiqueta',
    'webhook' => 'Chamar integração (webhook)',
];

/**
 * Gera tarefas do dia a dia (central de relacionamento). Idempotente pela source_key.
 * Pode ser restrita a um cliente para atualizar logo após um cadastro ou venda.
 */
function generateTasks(?int $companyId = null, ?int $clientId = null): void
{
    $filter = '';
    $params = [];
    if ($companyId !== null) {
        $filter .= ' AND c.company_id = ?';
        $params[] = $companyId;
    }
    if ($clientId !== null) {
        $filter .= ' AND c.id = ?';
        $params[] = $clientId;
    }
    $active = "JOIN companies co ON co.id = c.company_id AND co.status IN ('trial', 'active')";

    executeQuery(
        "INSERT IGNORE INTO tasks (company_id, client_id, type, title, due_date, source_key)
         SELECT c.company_id, c.id, 'follow_up', CONCAT('Retornar contato: ', c.name), c.next_contact_date,
                CONCAT('next-contact:', c.id, ':', c.next_contact_date)
         FROM clients c {$active}
         WHERE c.deleted_at IS NULL AND c.next_contact_date BETWEEN DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY) AND DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY) {$filter}",
        $params,
    );
    executeQuery(
        "INSERT IGNORE INTO tasks (company_id, client_id, type, title, due_date, source_key)
         SELECT company_id, id, 'birthday', CONCAT('Parabenizar ', name, ' pelo aniversário'), due, CONCAT('birthday:', id, ':', YEAR(due))
         FROM (
           SELECT c.company_id, c.id, c.name,
                  STR_TO_DATE(CONCAT(YEAR(CURRENT_DATE) + (DATE_FORMAT(c.birth_date, '%m-%d') < DATE_FORMAT(CURRENT_DATE, '%m-%d')),
                                     DATE_FORMAT(c.birth_date, '-%m-%d')), '%Y-%m-%d') AS due
           FROM clients c {$active}
           WHERE c.deleted_at IS NULL AND c.birth_date IS NOT NULL AND c.message_consent = 1 {$filter}
         ) b WHERE due IS NOT NULL AND due BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)",
        $params,
    );
    executeQuery(
        "INSERT IGNORE INTO tasks (company_id, client_id, type, title, due_date, source_key)
         SELECT c.company_id, c.id, 'prescription', CONCAT('Receita de ', c.name, ' vence em ', DATE_FORMAT(pr.expires_at, '%d/%m/%Y')),
                DATE_SUB(pr.expires_at, INTERVAL 15 DAY), CONCAT('prescription:', pr.id)
         FROM prescriptions pr JOIN clients c ON c.id = pr.client_id {$active}
         WHERE c.deleted_at IS NULL AND pr.id = (SELECT MAX(p2.id) FROM prescriptions p2 WHERE p2.client_id = c.id)
           AND pr.expires_at BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY) {$filter}",
        $params,
    );
    executeQuery(
        "INSERT IGNORE INTO tasks (company_id, client_id, type, title, due_date, source_key)
         SELECT o.company_id, o.client_id, 'pickup', CONCAT('Avisar ', c.name, ' que a OS nº ', o.number, ' está pronta'), CURRENT_DATE,
                CONCAT('order-ready:', o.id)
         FROM service_orders o JOIN clients c ON c.id = o.client_id {$active}
         WHERE o.status = 'ready' {$filter}",
        $params,
    );
    executeQuery(
        "INSERT IGNORE INTO tasks (company_id, client_id, type, title, due_date, source_key)
         SELECT q.company_id, q.client_id, 'quote', CONCAT('Retomar orçamento nº ', q.number, ' de ', c.name),
                DATE_ADD(q.quote_date, INTERVAL 3 DAY), CONCAT('quote-followup:', q.id)
         FROM quotes q JOIN clients c ON c.id = q.client_id {$active}
         WHERE q.status IN ('open', 'sent') AND q.quote_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY) {$filter}",
        $params,
    );
    executeQuery(
        "INSERT IGNORE INTO tasks (company_id, client_id, type, title, due_date, source_key)
         SELECT s.company_id, s.client_id, 'renewal', CONCAT('Oferecer renovação dos óculos para ', c.name),
                DATE_ADD(s.sale_date, INTERVAL COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(co.settings, '$.renewal_months')) AS UNSIGNED), 12) MONTH),
                CONCAT('sale-renewal:', s.id)
         FROM sales s JOIN clients c ON c.id = s.client_id {$active}
         WHERE s.status <> 'cancelled' AND c.message_consent = 1
           AND DATE_ADD(s.sale_date, INTERVAL COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(co.settings, '$.renewal_months')) AS UNSIGNED), 12) MONTH)
               BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 15 DAY) {$filter}",
        $params,
    );
}

/** Clientes candidatos para cada gatilho agendado, com a chave que impede repetição. */
function automationCandidates(array $automation): array
{
    $companyId = (int) $automation['company_id'];
    $config = decodeJsonColumn($automation['trigger_config'], []);
    $days = max(0, (int) ($config['days'] ?? 0));
    $base = "FROM clients c WHERE c.company_id = ? AND c.deleted_at IS NULL";
    $rows = [];
    switch ($automation['trigger_type']) {
        case 'birthday':
            $rows = fetchAllRows(
                "SELECT c.*, CONCAT('birthday:', c.id, ':', YEAR(CURRENT_DATE)) AS ref_key {$base}
                 AND c.birth_date IS NOT NULL
                 AND DATE_FORMAT(c.birth_date, '%m-%d') = DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL ? DAY), '%m-%d')",
                [$companyId, $days],
            );
            break;
        case 'prescription_expiring':
            $rows = fetchAllRows(
                "SELECT c.*, pr.expires_at AS prescription_expires_at, CONCAT('prescription:', pr.id) AS ref_key
                 FROM prescriptions pr JOIN clients c ON c.id = pr.client_id
                 WHERE pr.company_id = ? AND c.deleted_at IS NULL
                   AND pr.id = (SELECT MAX(p2.id) FROM prescriptions p2 WHERE p2.client_id = c.id)
                   AND pr.expires_at = DATE_ADD(CURRENT_DATE, INTERVAL ? DAY)",
                [$companyId, $days],
            );
            break;
        case 'no_purchase':
            $rows = fetchAllRows(
                "SELECT c.*, ls.last_purchase, CONCAT('no-purchase:', c.id, ':', ls.last_purchase) AS ref_key
                 FROM clients c JOIN (
                   SELECT client_id, MAX(sale_date) AS last_purchase FROM sales WHERE company_id = ? AND status <> 'cancelled' GROUP BY client_id
                 ) ls ON ls.client_id = c.id
                 WHERE c.deleted_at IS NULL AND ls.last_purchase = DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)",
                [$companyId, max(1, $days)],
            );
            break;
        case 'purchase_anniversary':
            $months = max(1, (int) ($config['months'] ?? 12));
            $rows = fetchAllRows(
                "SELECT c.*, s.sale_date AS last_purchase, CONCAT('purchase-anniversary:', s.id) AS ref_key
                 FROM sales s JOIN clients c ON c.id = s.client_id
                 WHERE s.company_id = ? AND s.status <> 'cancelled' AND c.deleted_at IS NULL
                   AND s.sale_date = DATE_SUB(CURRENT_DATE, INTERVAL ? MONTH)",
                [$companyId, $months],
            );
            break;
        case 'post_sale':
            $rows = fetchAllRows(
                "SELECT c.*, s.sale_date AS last_purchase, s.number AS sale_number, CONCAT('post-sale:', s.id) AS ref_key
                 FROM sales s JOIN clients c ON c.id = s.client_id
                 WHERE s.company_id = ? AND s.status <> 'cancelled' AND c.deleted_at IS NULL
                   AND s.sale_date = DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)",
                [$companyId, max(1, $days)],
            );
            break;
        case 'quote_followup':
            $rows = fetchAllRows(
                "SELECT c.*, q.number AS quote_number, CONCAT('quote-followup:', q.id) AS ref_key
                 FROM quotes q JOIN clients c ON c.id = q.client_id
                 WHERE q.company_id = ? AND q.status IN ('open', 'sent') AND c.deleted_at IS NULL
                   AND q.quote_date <= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
                   AND q.quote_date >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)",
                [$companyId, max(1, $days), max(1, $days) + 30],
            );
            break;
    }
    // Filtros opcionais por etiqueta e aceite de mensagens.
    $requireConsent = ($config['require_consent'] ?? true) !== false;
    $tagId = (int) ($config['tag_id'] ?? 0);
    return array_values(array_filter($rows, static function (array $row) use ($requireConsent, $tagId): bool {
        if ($requireConsent && !(int) $row['message_consent']) {
            return false;
        }
        if ($tagId && !fetchValue('SELECT 1 FROM client_tags WHERE client_id = ? AND tag_id = ?', [$row['id'], $tagId])) {
            return false;
        }
        return true;
    }));
}

function runScheduledAutomations(?int $companyId = null): int
{
    $scheduled = ['birthday', 'prescription_expiring', 'no_purchase', 'purchase_anniversary', 'post_sale', 'quote_followup'];
    $sql = "SELECT a.* FROM automations a JOIN companies c ON c.id = a.company_id
            WHERE a.active = 1 AND c.status IN ('trial', 'active') AND a.trigger_type IN ('" . implode("','", $scheduled) . "')";
    $params = [];
    if ($companyId) {
        $sql .= ' AND a.company_id = ?';
        $params[] = $companyId;
    }
    $executed = 0;
    foreach (fetchAllRows($sql, $params) as $automation) {
        $config = decodeJsonColumn($automation['trigger_config'], []);
        // Respeita o horário configurado (padrão 09:00) para não enviar de madrugada.
        if (date('H:i') < ($config['time'] ?? '09:00')) {
            continue;
        }
        foreach (automationCandidates($automation) as $client) {
            $executed += executeAutomation($automation, $client, $client['ref_key']) ? 1 : 0;
        }
        executeQuery('UPDATE automations SET last_run_at = NOW() WHERE id = ?', [$automation['id']]);
    }
    return $executed;
}

/** Automações disparadas por eventos de negócio (chamadas por emitEvent). */
function runEventAutomations(int $companyId, string $event, array $payload): void
{
    $triggers = ['order.status_changed' => 'order_ready', 'client.created' => 'client_created', 'message.received' => 'message_received'];
    if (!isset($triggers[$event])) {
        return;
    }
    if ($event === 'order.status_changed' && ($payload['status'] ?? '') !== 'ready') {
        return;
    }
    $automations = fetchAllRows('SELECT * FROM automations WHERE company_id = ? AND active = 1 AND trigger_type = ?', [$companyId, $triggers[$event]]);
    foreach ($automations as $automation) {
        $config = decodeJsonColumn($automation['trigger_config'], []);
        $clientId = (int) ($payload['client_id'] ?? $payload['id'] ?? 0);
        if ($event === 'message.received') {
            $keywords = array_filter(array_map('trim', explode(',', mb_strtolower((string) ($config['keywords'] ?? '')))));
            $body = mb_strtolower((string) ($payload['body'] ?? ''));
            if ($keywords && !array_filter($keywords, static fn($k) => str_contains($body, $k))) {
                continue;
            }
            $clientId = (int) ($payload['client_id'] ?? 0);
        }
        $client = $clientId ? fetchOne('SELECT * FROM clients WHERE id = ? AND company_id = ?', [$clientId, $companyId]) : null;
        if (!$client && $event !== 'message.received') {
            continue;
        }
        $refKey = match ($event) {
            'order.status_changed' => 'order-ready:' . $payload['id'],
            'client.created' => 'client-created:' . $clientId,
            default => 'message:' . ($payload['conversation_id'] ?? 0) . ':' . date('Y-m-d'),
        };
        $client ??= ['id' => null, 'name' => '', 'whatsapp' => $payload['from'] ?? '', 'message_consent' => 1];
        $client['order_number'] = $payload['number'] ?? '';
        executeAutomation($automation, $client, $refKey, $payload['conversation_id'] ?? null);
    }
}

/** Executa a ação uma única vez por chave de referência. Retorna false se já tinha sido executada. */
function executeAutomation(array $automation, array $client, string $refKey, ?int $conversationId = null): bool
{
    $companyId = (int) $automation['company_id'];
    $inserted = executeQuery(
        'INSERT IGNORE INTO automation_runs (company_id, automation_id, client_id, ref_key, status) VALUES (?, ?, ?, ?, ?)',
        [$companyId, $automation['id'], $client['id'] ?? null, $refKey, 'running'],
    )->rowCount();
    if (!$inserted) {
        return false;
    }
    $runId = (int) database()->lastInsertId();
    $config = decodeJsonColumn($automation['action_config'], []);
    $company = fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]);
    $result = 'ok';
    try {
        switch ($automation['action_type']) {
            case 'send_message':
                $text = renderTemplate((string) ($config['message'] ?? ''), $client, $company, ['numero_os' => (string) ($client['order_number'] ?? ''), 'numero_orcamento' => (string) ($client['quote_number'] ?? '')]);
                $channel = !empty($config['channel_id'])
                    ? fetchOne('SELECT * FROM channels WHERE id = ? AND company_id = ?', [$config['channel_id'], $companyId])
                    : defaultChannel($companyId);
                $phone = normalizePhone((string) ($client['whatsapp'] ?: ($client['phone'] ?? '')), (string) (decodeJsonColumn($company['settings'], [])['default_ddd'] ?? ''));
                // Modo semiautomático, canal manual ou sem telefone: vira tarefa com a mensagem pronta.
                if ($automation['mode'] === 'semi' || !$channel || $channel['type'] === 'whatsapp_manual' || $phone === '') {
                    insertRow('tasks', [
                        'company_id' => $companyId,
                        'client_id' => $client['id'],
                        'type' => 'other',
                        'title' => mb_substr($automation['name'] . ': ' . $text, 0, 255),
                        'due_date' => date('Y-m-d'),
                        'source_key' => 'automation:' . $automation['id'] . ':' . $refKey,
                    ]);
                    $result = 'Tarefa criada para envio manual';
                } else {
                    $conversation = $conversationId
                        ? fetchOne('SELECT * FROM conversations WHERE id = ?', [$conversationId])
                        : findOrCreateConversation($companyId, $channel, $phone, (string) $client['name'], $client['id'] ? (int) $client['id'] : null);
                    $sent = sendConversationMessage($conversation, $text);
                    $result = $sent['ok'] ? 'Mensagem enviada' : 'Falha: ' . $sent['error'];
                    if ($client['id']) {
                        insertRow('interactions', [
                            'company_id' => $companyId,
                            'client_id' => $client['id'],
                            'channel' => 'whatsapp',
                            'direction' => 'out',
                            'subject' => 'Automação: ' . mb_substr($automation['name'], 0, 120),
                            'notes' => $text,
                        ]);
                    }
                }
                break;
            case 'create_task':
                insertRow('tasks', [
                    'company_id' => $companyId,
                    'client_id' => $client['id'],
                    'user_id' => $config['user_id'] ?? null,
                    'type' => 'other',
                    'title' => mb_substr(renderTemplate((string) ($config['title'] ?? $automation['name']), $client, $company), 0, 255),
                    'due_date' => date('Y-m-d', strtotime('+' . (int) ($config['due_in_days'] ?? 0) . ' days')),
                    'source_key' => 'automation:' . $automation['id'] . ':' . $refKey,
                ]);
                $result = 'Tarefa criada';
                break;
            case 'add_tag':
                if ($client['id'] && !empty($config['tag_id'])) {
                    executeQuery('INSERT IGNORE INTO client_tags (client_id, tag_id, company_id) SELECT ?, id, company_id FROM tags WHERE id = ? AND company_id = ?', [$client['id'], $config['tag_id'], $companyId]);
                }
                $result = 'Etiqueta adicionada';
                break;
            case 'webhook':
                $response = httpJson('POST', (string) ($config['url'] ?? ''), [], [
                    'automation' => $automation['name'],
                    'trigger' => $automation['trigger_type'],
                    'client' => array_intersect_key($client, array_flip(['id', 'name', 'whatsapp', 'email', 'birth_date', 'city'])),
                    'ref' => $refKey,
                ], 10);
                $result = 'HTTP ' . $response['status'];
                break;
        }
        executeQuery("UPDATE automation_runs SET status = 'done', result = ? WHERE id = ?", [mb_substr($result, 0, 500), $runId]);
    } catch (Throwable $exception) {
        executeQuery("UPDATE automation_runs SET status = 'failed', result = ? WHERE id = ?", [mb_substr($exception->getMessage(), 0, 500), $runId]);
        error_log('Automação ' . $automation['id'] . ': ' . $exception->getMessage());
    }
    executeQuery('UPDATE automations SET runs_count = runs_count + 1, last_run_at = NOW() WHERE id = ?', [$automation['id']]);
    return true;
}

/** Monta (ou completa) a lista de destinatários. A chave única evita mensagens repetidas. */
function buildCampaignRecipients(array $campaign): int
{
    $companyId = (int) $campaign['company_id'];
    $audience = decodeJsonColumn($campaign['audience'], []);
    if (!empty($campaign['saved_report_id'])) {
        $report = fetchOne('SELECT definition FROM saved_reports WHERE id = ? AND company_id = ?', [$campaign['saved_report_id'], $companyId]);
        $definition = decodeJsonColumn($report['definition'] ?? null, []);
        $audience = array_merge($definition['filters'] ?? [], $audience);
    }
    if (($audience['require_consent'] ?? true) !== false) {
        $audience['consent'] = 1;
    }
    $audience['has_whatsapp'] = 1;
    if ((int) $campaign['skip_recent_days'] > 0) {
        $audience['contacted_last_days_exclude'] = (int) $campaign['skip_recent_days'];
    }
    [$where, $params] = buildClientFilter($audience, $companyId);
    $computed = clientComputedColumns();
    // Quem pediu para sair nunca entra em campanha, mesmo sem o filtro de aceite.
    $clients = fetchAllRows(
        "SELECT c.*, {$computed['last_purchase']} AS last_purchase, {$computed['prescription_expires_at']} AS prescription_expires_at
         FROM clients c WHERE {$where} AND c.message_opt_out_at IS NULL AND NOT EXISTS (SELECT 1 FROM campaign_recipients cr WHERE cr.campaign_id = ? AND cr.client_id = c.id)
         LIMIT 20000",
        [...$params, $campaign['id']],
    );
    $company = fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]);
    $ddd = (string) (decodeJsonColumn($company['settings'], [])['default_ddd'] ?? '');
    $added = 0;
    foreach ($clients as $client) {
        $added += executeQuery(
            'INSERT IGNORE INTO campaign_recipients (company_id, campaign_id, client_id, phone, rendered_message) VALUES (?, ?, ?, ?, ?)',
            [$companyId, $campaign['id'], $client['id'], normalizePhone($client['whatsapp'], $ddd), renderTemplate($campaign['message'], $client, $company)],
        )->rowCount();
    }
    return $added;
}

/**
 * Envia as campanhas automáticas em andamento, respeitando a janela de horário. Canais oficiais seguem o
 * limite por minuto; canais não oficiais seguem o envio seguro (safe_sending.php).
 */
function processAutoCampaigns(): int
{
    $sent = 0;
    $busyChannels = [];
    $campaigns = fetchAllRows(
        "SELECT ca.* FROM campaigns ca JOIN companies co ON co.id = ca.company_id
         WHERE co.status IN ('trial', 'active') AND ca.mode = 'auto'
           AND (ca.status = 'running' OR (ca.status = 'scheduled' AND ca.scheduled_at <= NOW()))",
    );
    foreach ($campaigns as $campaign) {
        if ($campaign['status'] === 'scheduled') {
            buildCampaignRecipients($campaign);
            executeQuery("UPDATE campaigns SET status = 'running', started_at = NOW() WHERE id = ?", [$campaign['id']]);
        }
        $now = date('H:i:s');
        if ($now < $campaign['send_window_start'] || $now > $campaign['send_window_end']) {
            continue;
        }
        $channel = $campaign['channel_id'] ? fetchOne('SELECT * FROM channels WHERE id = ?', [$campaign['channel_id']]) : defaultChannel((int) $campaign['company_id']);
        if (!$channel || $channel['type'] === 'whatsapp_manual' || $channel['status'] === 'inactive') {
            continue;
        }
        if (isUnofficialChannel($channel)) {
            $sent += processSafeCampaign($campaign, $channel, $busyChannels);
            continue;
        }
        // O worker roda várias vezes por minuto: o limite por minuto vale para a janela do último minuto.
        $sentLastMinute = (int) fetchValue(
            "SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status IN ('sent', 'replied') AND sent_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)",
            [$campaign['id']],
        );
        $quota = min(60, (int) $campaign['per_minute']) - $sentLastMinute;
        if ($quota <= 0) {
            continue;
        }
        $recipients = fetchAllRows(
            "SELECT cr.*, c.name FROM campaign_recipients cr JOIN clients c ON c.id = cr.client_id
             WHERE cr.campaign_id = ? AND cr.status = 'pending' AND c.message_opt_out_at IS NULL ORDER BY cr.id LIMIT " . $quota,
            [$campaign['id']],
        );
        if (!$recipients) {
            executeQuery("UPDATE campaigns SET status = 'completed', finished_at = NOW() WHERE id = ?", [$campaign['id']]);
            continue;
        }
        foreach ($recipients as $recipient) {
            sendCampaignRecipient($campaign, $recipient, $channel);
            $sent++;
        }
    }
    return $sent;
}

function sendCampaignRecipient(array $campaign, array $recipient, array $channel, bool $manual = false): array
{
    $companyId = (int) $campaign['company_id'];
    if (isUnofficialChannel($channel)) {
        $guard = guardUnofficialSend($channel, $recipient, $manual);
        if (!$guard['ok']) {
            if (!empty($guard['skip'])) {
                executeQuery("UPDATE campaign_recipients SET status = 'skipped', error = ? WHERE id = ? AND status IN ('pending', 'failed')", [$guard['error'], $recipient['id']]);
            }
            return ['ok' => false, 'error' => $guard['error'], 'skipped' => !empty($guard['skip'])];
        }
    }
    // Marca como "na fila" antes do envio para que dois processos não enviem o mesmo destinatário.
    $claimed = executeQuery("UPDATE campaign_recipients SET status = 'queued' WHERE id = ? AND status IN ('pending', 'failed')", [$recipient['id']])->rowCount();
    if (!$claimed) {
        return ['ok' => false, 'error' => 'Destinatário já processado.'];
    }
    $conversation = findOrCreateConversation($companyId, $channel, $recipient['phone'], (string) ($recipient['name'] ?? ''), (int) $recipient['client_id']);
    $options = ['campaign_recipient_id' => $recipient['id']];
    if ($channel['type'] === 'whatsapp_cloud' && $campaign['template_id']) {
        $template = fetchOne('SELECT meta_template_name, meta_language FROM message_templates WHERE id = ?', [$campaign['template_id']]);
        if (!empty($template['meta_template_name'])) {
            $options += ['template' => $template['meta_template_name'], 'language' => $template['meta_language'], 'template_params' => [$recipient['rendered_message']]];
        }
    }
    // Modelos da Meta não aceitam quebra de linha nos parâmetros; nos demais casos vai o rodapé de descadastro.
    $body = (string) $recipient['rendered_message'];
    if ((int) ($campaign['opt_out_footer'] ?? 1) === 1 && empty($options['template'])) {
        $body = withOptOutFooter($body);
    }
    $result = sendConversationMessage($conversation, $body, $options);
    executeQuery(
        'UPDATE campaign_recipients SET status = ?, sent_at = ?, message_id = ?, error = ?, sent_by = ? WHERE id = ?',
        [$result['ok'] ? 'sent' : 'failed', $result['ok'] ? date('Y-m-d H:i:s') : null, $result['id'], mb_substr((string) $result['error'], 0, 500), Context::userId(), $recipient['id']],
    );
    if ($result['ok']) {
        insertRow('interactions', [
            'company_id' => $companyId,
            'client_id' => $recipient['client_id'],
            'channel' => 'whatsapp',
            'direction' => 'out',
            'subject' => 'Campanha: ' . mb_substr($campaign['name'], 0, 130),
            'notes' => $recipient['rendered_message'],
            'user_id' => Context::userId(),
            'campaign_id' => $campaign['id'],
        ]);
    }
    return $result;
}

function processWebhookDeliveries(): int
{
    $deliveries = fetchAllRows(
        "SELECT d.*, w.url, w.secret FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
         WHERE d.status = 'pending' AND w.active = 1 ORDER BY d.id LIMIT 50",
    );
    foreach ($deliveries as $delivery) {
        $signature = hash_hmac('sha256', $delivery['payload'], $delivery['secret']);
        $curl = curl_init($delivery['url']);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $delivery['payload'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Ocular-Event: ' . $delivery['event'], 'X-Ocular-Signature: sha256=' . $signature],
        ]);
        curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        $ok = $status >= 200 && $status < 300;
        $attempts = (int) $delivery['attempts'] + 1;
        executeQuery(
            'UPDATE webhook_deliveries SET status = ?, attempts = ?, response_code = ? WHERE id = ?',
            [$ok ? 'sent' : ($attempts >= 5 ? 'failed' : 'pending'), $attempts, $status, $delivery['id']],
        );
        executeQuery('UPDATE webhooks SET last_status = ?, last_called_at = NOW() WHERE id = ?', [$status, $delivery['webhook_id']]);
    }
    return count($deliveries);
}
