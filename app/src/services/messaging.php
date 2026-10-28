<?php
declare(strict_types=1);

/*
 * Camada de mensageria. Cada ótica configura um ou mais canais:
 *  - whatsapp_manual: sem API; o sistema monta o link wa.me e o atendente envia pelo próprio WhatsApp.
 *  - whatsapp_cloud: API oficial da Meta (WhatsApp Cloud API).
 *  - whatsapp_evolution / whatsapp_zapi: APIs não oficiais (Evolution API, Z-API).
 *  - instagram / facebook: Messenger Platform (Graph API) para Direct e Messenger.
 * As mensagens recebidas chegam por webhook em index.php?action=webhook&token=...
 */

const CHANNEL_TYPES = [
    'whatsapp_manual' => ['label' => 'WhatsApp manual (link wa.me)', 'fields' => []],
    'whatsapp_cloud' => ['label' => 'WhatsApp API oficial (Meta Cloud)', 'fields' => ['phone_number_id', 'waba_id', 'access_token', 'app_secret', 'verify_token', 'graph_version']],
    'whatsapp_evolution' => ['label' => 'WhatsApp por QR Code (Evolution API)', 'fields' => ['base_url', 'api_key', 'instance']],
    'whatsapp_zapi' => ['label' => 'WhatsApp não oficial (Z-API)', 'fields' => ['instance_id', 'token', 'client_token']],
    'instagram' => ['label' => 'Instagram Direct (Meta)', 'fields' => ['page_id', 'access_token', 'app_secret', 'verify_token', 'graph_version']],
    'facebook' => ['label' => 'Facebook Messenger (Meta)', 'fields' => ['page_id', 'access_token', 'app_secret', 'verify_token', 'graph_version']],
];

const SECRET_CHANNEL_FIELDS = ['access_token', 'app_secret', 'api_key', 'token', 'client_token'];

function channelConfig(array $channel): array
{
    return decodeJsonColumn($channel['config'] ?? null, []);
}

function httpJson(string $method, string $url, array $headers = [], ?array $body = null, int $timeout = 20): array
{
    $curl = curl_init($url);
    $headerLines = ['Content-Type: application/json', 'Accept: application/json'];
    foreach ($headers as $name => $value) {
        $headerLines[] = "{$name}: {$value}";
    }
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headerLines,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 8,
    ]);
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    return [
        'status' => $status,
        'body' => is_string($response) ? (json_decode($response, true) ?? ['raw' => mb_substr($response, 0, 500)]) : [],
        'error' => $error,
    ];
}

/**
 * Envia uma mensagem de texto pelo provedor do canal.
 * Retorna ['ok' => bool, 'external_id' => ?string, 'error' => string, 'status' => string].
 */
function providerSendText(array $channel, string $to, string $text, array $options = []): array
{
    $config = channelConfig($channel);
    $type = $channel['type'];
    if ($type === 'whatsapp_manual') {
        return ['ok' => true, 'external_id' => null, 'error' => '', 'status' => 'manual'];
    }
    if ($type === 'whatsapp_cloud') {
        $version = $config['graph_version'] ?? 'v21.0';
        $payload = ['messaging_product' => 'whatsapp', 'to' => $to];
        if (!empty($options['template'])) {
            // Fora da janela de 24 h a Meta exige modelo aprovado; o parâmetro {{1}} recebe o texto personalizado.
            $payload['type'] = 'template';
            $payload['template'] = [
                'name' => $options['template'],
                'language' => ['code' => $options['language'] ?? 'pt_BR'],
                'components' => !empty($options['template_params'])
                    ? [['type' => 'body', 'parameters' => array_map(static fn($p) => ['type' => 'text', 'text' => (string) $p], $options['template_params'])]]
                    : [],
            ];
        } else {
            $payload['type'] = 'text';
            $payload['text'] = ['preview_url' => true, 'body' => $text];
        }
        $result = httpJson('POST', "https://graph.facebook.com/{$version}/{$config['phone_number_id']}/messages", [
            'Authorization' => 'Bearer ' . ($config['access_token'] ?? ''),
        ], $payload);
        $ok = $result['status'] >= 200 && $result['status'] < 300;
        return [
            'ok' => $ok,
            'external_id' => $result['body']['messages'][0]['id'] ?? null,
            'error' => $ok ? '' : ($result['body']['error']['message'] ?? $result['error'] ?: 'HTTP ' . $result['status']),
            'status' => $ok ? 'sent' : 'failed',
        ];
    }
    if ($type === 'whatsapp_evolution') {
        $result = evolutionRequest($channel, 'POST', '/message/sendText/{instance}', ['number' => $to, 'text' => $text]);
        $ok = $result['status'] >= 200 && $result['status'] < 300;
        return [
            'ok' => $ok,
            'external_id' => $result['body']['key']['id'] ?? null,
            'error' => $ok ? '' : evolutionErrorText($result),
            'status' => $ok ? 'sent' : 'failed',
        ];
    }
    if ($type === 'whatsapp_zapi') {
        $url = sprintf('https://api.z-api.io/instances/%s/token/%s/send-text', rawurlencode((string) ($config['instance_id'] ?? '')), rawurlencode((string) ($config['token'] ?? '')));
        $result = httpJson('POST', $url, ['Client-Token' => $config['client_token'] ?? ''], ['phone' => $to, 'message' => $text]);
        $ok = $result['status'] >= 200 && $result['status'] < 300;
        return [
            'ok' => $ok,
            'external_id' => $result['body']['messageId'] ?? $result['body']['id'] ?? null,
            'error' => $ok ? '' : ($result['body']['error'] ?? $result['error'] ?: 'HTTP ' . $result['status']),
            'status' => $ok ? 'sent' : 'failed',
        ];
    }
    if ($type === 'instagram' || $type === 'facebook') {
        $version = $config['graph_version'] ?? 'v21.0';
        $result = httpJson(
            'POST',
            "https://graph.facebook.com/{$version}/me/messages?access_token=" . rawurlencode((string) ($config['access_token'] ?? '')),
            [],
            ['recipient' => ['id' => $to], 'messaging_type' => 'RESPONSE', 'message' => ['text' => $text]],
        );
        $ok = $result['status'] >= 200 && $result['status'] < 300;
        return [
            'ok' => $ok,
            'external_id' => $result['body']['message_id'] ?? null,
            'error' => $ok ? '' : ($result['body']['error']['message'] ?? $result['error'] ?: 'HTTP ' . $result['status']),
            'status' => $ok ? 'sent' : 'failed',
        ];
    }
    return ['ok' => false, 'external_id' => null, 'error' => 'Canal desconhecido.', 'status' => 'failed'];
}

function defaultChannel(int $companyId): ?array
{
    return fetchOne(
        "SELECT * FROM channels WHERE company_id = ? AND status <> 'inactive' AND type LIKE 'whatsapp%' ORDER BY is_default DESC, id LIMIT 1",
        [$companyId],
    );
}

/** Localiza o cliente pelo telefone comparando os 8 últimos dígitos e o DDD (tolera o nono dígito). */
function findClientByPhone(int $companyId, string $phone): ?array
{
    $digits = onlyDigits($phone);
    if (strlen($digits) < 8) {
        return null;
    }
    $last8 = substr($digits, -8);
    $candidates = fetchAllRows(
        "SELECT id, name, whatsapp, phone FROM clients
         WHERE company_id = ? AND deleted_at IS NULL AND (RIGHT(whatsapp, 8) = ? OR RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), 8) = ?)
         LIMIT 5",
        [$companyId, $last8, $last8],
    );
    if (!$candidates) {
        return null;
    }
    $ddd = strlen($digits) >= 12 ? substr($digits, 2, 2) : '';
    foreach ($candidates as $candidate) {
        if ($ddd === '' || str_contains(onlyDigits($candidate['whatsapp'] . $candidate['phone']), $ddd)) {
            return $candidate;
        }
    }
    return $candidates[0];
}

function findOrCreateConversation(int $companyId, array $channel, string $handle, string $name = '', ?int $clientId = null): array
{
    $conversation = fetchOne('SELECT * FROM conversations WHERE company_id = ? AND channel_id = ? AND contact_handle = ?', [$companyId, $channel['id'], $handle]);
    if ($conversation) {
        if ($clientId && !$conversation['client_id']) {
            executeQuery('UPDATE conversations SET client_id = ? WHERE id = ?', [$clientId, $conversation['id']]);
            $conversation['client_id'] = $clientId;
        }
        return $conversation;
    }
    if (!$clientId && str_starts_with($channel['type'], 'whatsapp')) {
        $client = findClientByPhone($companyId, $handle);
        $clientId = $client ? (int) $client['id'] : null;
        $name = $name ?: ($client['name'] ?? '');
    }
    $id = insertRow('conversations', [
        'company_id' => $companyId,
        'channel_id' => $channel['id'],
        'client_id' => $clientId,
        'contact_handle' => $handle,
        'contact_name' => mb_substr($name, 0, 150),
    ]);
    return fetchOne('SELECT * FROM conversations WHERE id = ?', [$id]);
}

/**
 * Registra e (quando há API) envia uma mensagem. Para o canal manual, a mensagem fica como "manual"
 * e o front-end abre o link do WhatsApp. Retorna a linha da mensagem com o link, se houver.
 */
function sendConversationMessage(array $conversation, string $body, array $options = []): array
{
    $channel = fetchOne('SELECT * FROM channels WHERE id = ?', [$conversation['channel_id']]);
    $messageId = insertRow('messages', [
        'company_id' => $conversation['company_id'],
        'conversation_id' => $conversation['id'],
        'direction' => 'out',
        'body' => $body,
        'status' => 'queued',
        'campaign_recipient_id' => $options['campaign_recipient_id'] ?? null,
        'user_id' => Context::userId(),
    ]);
    $result = ['ok' => true, 'status' => 'queued', 'external_id' => null, 'error' => ''];
    if (empty($options['defer'])) {
        $result = providerSendText($channel, $conversation['contact_handle'], $body, $options);
        executeQuery('UPDATE messages SET status = ?, external_id = ?, error = ? WHERE id = ?', [
            $result['status'],
            $result['external_id'],
            mb_substr((string) $result['error'], 0, 500),
            $messageId,
        ]);
        if (!$result['ok']) {
            executeQuery("UPDATE channels SET status = 'error', last_error = ? WHERE id = ?", [mb_substr((string) $result['error'], 0, 500), $channel['id']]);
        }
    }
    executeQuery(
        "UPDATE conversations SET last_message_at = NOW(), last_message_preview = ?, status = IF(status = 'closed', 'open', status) WHERE id = ?",
        [mb_substr($body, 0, 255), $conversation['id']],
    );
    return [
        'id' => $messageId,
        'status' => $result['status'],
        'error' => $result['error'],
        'ok' => $result['ok'],
        'wa_link' => $channel['type'] === 'whatsapp_manual' ? whatsappLink($conversation['contact_handle'], $body) : null,
    ];
}

function whatsappLink(string $phone, string $text = ''): string
{
    return 'https://wa.me/' . onlyDigits($phone) . ($text !== '' ? '?text=' . rawurlencode($text) : '');
}

/** Envia mensagens enfileiradas (status queued) — usado pelo worker para campanhas automáticas. */
function deliverQueuedMessage(array $message): void
{
    $conversation = fetchOne('SELECT * FROM conversations WHERE id = ?', [$message['conversation_id']]);
    $channel = $conversation ? fetchOne('SELECT * FROM channels WHERE id = ?', [$conversation['channel_id']]) : null;
    if (!$conversation || !$channel) {
        executeQuery("UPDATE messages SET status = 'failed', error = 'Conversa ou canal removido' WHERE id = ?", [$message['id']]);
        return;
    }
    $options = [];
    if ($message['campaign_recipient_id']) {
        $template = fetchOne(
            'SELECT t.meta_template_name, t.meta_language FROM campaign_recipients cr JOIN campaigns ca ON ca.id = cr.campaign_id
             LEFT JOIN message_templates t ON t.id = ca.template_id WHERE cr.id = ?',
            [$message['campaign_recipient_id']],
        );
        if ($channel['type'] === 'whatsapp_cloud' && !empty($template['meta_template_name'])) {
            $options = ['template' => $template['meta_template_name'], 'language' => $template['meta_language'], 'template_params' => [$message['body']]];
        }
    }
    $result = providerSendText($channel, $conversation['contact_handle'], (string) $message['body'], $options);
    executeQuery('UPDATE messages SET status = ?, external_id = ?, error = ? WHERE id = ?', [
        $result['ok'] ? 'sent' : 'failed',
        $result['external_id'],
        mb_substr((string) $result['error'], 0, 500),
        $message['id'],
    ]);
    if ($message['campaign_recipient_id']) {
        executeQuery(
            'UPDATE campaign_recipients SET status = ?, sent_at = IF(? , NOW(), sent_at), error = ? WHERE id = ?',
            [$result['ok'] ? 'sent' : 'failed', $result['ok'] ? 1 : 0, mb_substr((string) $result['error'], 0, 500), $message['campaign_recipient_id']],
        );
    }
}

/** Recebe webhooks dos provedores (rota pública identificada pelo token do canal). */
function handleInboundWebhook(string $method): never
{
    $token = (string) ($_GET['token'] ?? '');
    $channel = $token !== '' ? fetchOne('SELECT * FROM channels WHERE webhook_token = ?', [$token]) : null;
    if (!$channel) {
        sendError('Canal não encontrado.', 404);
    }
    $config = channelConfig($channel);
    // Verificação de assinatura da Meta (GET com hub.challenge).
    if ($method === 'GET') {
        if (($_GET['hub_mode'] ?? '') === 'subscribe' && hash_equals((string) ($config['verify_token'] ?? $channel['webhook_token']), (string) ($_GET['hub_verify_token'] ?? ''))) {
            header('Content-Type: text/plain');
            echo (string) ($_GET['hub_challenge'] ?? '');
            exit();
        }
        sendError('Verificação inválida.', 403);
    }
    $raw = (string) file_get_contents('php://input');
    if (in_array($channel['type'], ['whatsapp_cloud', 'instagram', 'facebook'], true) && !empty($config['app_secret'])) {
        $signature = (string) ($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
        if (!hash_equals('sha256=' . hash_hmac('sha256', $raw, (string) $config['app_secret']), $signature)) {
            sendError('Assinatura inválida.', 401);
        }
    }
    $payload = json_decode($raw, true) ?: [];
    $companyId = (int) $channel['company_id'];
    foreach (parseInboundPayload($channel['type'], $payload) as $event) {
        if ($event['kind'] === 'connection') {
            applyChannelConnectionState($channel, $event['state']);
            $channel = fetchOne('SELECT * FROM channels WHERE id = ?', [$channel['id']]);
            continue;
        }
        if ($event['kind'] === 'status') {
            executeQuery('UPDATE messages SET status = ? WHERE company_id = ? AND external_id = ?', [$event['status'], $companyId, $event['external_id']]);
            continue;
        }
        if ($event['external_id'] && fetchValue('SELECT 1 FROM messages WHERE company_id = ? AND external_id = ?', [$companyId, $event['external_id']])) {
            continue;
        }
        storeInboundMessage($channel, $event);
    }
    if ($channel['status'] === 'error' && ($channel['connection_state'] ?? '') !== 'close') {
        executeQuery("UPDATE channels SET status = 'active', last_error = '' WHERE id = ?", [$channel['id']]);
    }
    sendJson(['ok' => true]);
}

/** Normaliza os formatos de cada provedor em eventos {kind: message|status, ...}. */
function parseInboundPayload(string $type, array $payload): array
{
    $events = [];
    if ($type === 'whatsapp_cloud') {
        foreach ($payload['entry'] ?? [] as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                $value = $change['value'] ?? [];
                $names = [];
                foreach ($value['contacts'] ?? [] as $contact) {
                    $names[$contact['wa_id'] ?? ''] = $contact['profile']['name'] ?? '';
                }
                foreach ($value['messages'] ?? [] as $message) {
                    $events[] = [
                        'kind' => 'message',
                        'from' => $message['from'] ?? '',
                        'name' => $names[$message['from'] ?? ''] ?? '',
                        'external_id' => $message['id'] ?? null,
                        'type' => $message['type'] ?? 'text',
                        'body' => $message['text']['body'] ?? $message['button']['text'] ?? $message['interactive']['button_reply']['title'] ?? ($message['image']['caption'] ?? '[' . ($message['type'] ?? 'mídia') . ']'),
                    ];
                }
                foreach ($value['statuses'] ?? [] as $status) {
                    $map = ['sent' => 'sent', 'delivered' => 'delivered', 'read' => 'read', 'failed' => 'failed'];
                    if (isset($map[$status['status'] ?? ''])) {
                        $events[] = ['kind' => 'status', 'external_id' => $status['id'] ?? '', 'status' => $map[$status['status']]];
                    }
                }
            }
        }
    } elseif ($type === 'whatsapp_evolution') {
        $eventName = strtolower(str_replace('_', '.', (string) ($payload['event'] ?? '')));
        $data = $payload['data'] ?? [];
        if ($eventName === 'messages.upsert' && empty($data['key']['fromMe'])) {
            $jid = (string) ($data['key']['remoteJid'] ?? '');
            if (!str_contains($jid, '@g.us')) {
                $message = $data['message'] ?? [];
                $events[] = [
                    'kind' => 'message',
                    'from' => explode('@', $jid)[0],
                    'name' => $data['pushName'] ?? '',
                    'external_id' => $data['key']['id'] ?? null,
                    'type' => 'text',
                    'body' => $message['conversation'] ?? $message['extendedTextMessage']['text'] ?? $message['imageMessage']['caption'] ?? '[mídia]',
                ];
            }
        } elseif ($eventName === 'messages.update') {
            $map = ['SERVER_ACK' => 'sent', 'DELIVERY_ACK' => 'delivered', 'READ' => 'read', 'PLAYED' => 'read', 'ERROR' => 'failed'];
            foreach (isset($data['status']) ? [$data] : (array) $data as $update) {
                $status = $map[strtoupper((string) ($update['status'] ?? ''))] ?? null;
                $externalId = (string) ($update['keyId'] ?? $update['key']['id'] ?? '');
                if ($status && $externalId !== '') {
                    $events[] = ['kind' => 'status', 'external_id' => $externalId, 'status' => $status];
                }
            }
        } elseif ($eventName === 'connection.update' && isset($data['state'])) {
            $events[] = ['kind' => 'connection', 'state' => (string) $data['state']];
        }
    } elseif ($type === 'whatsapp_zapi') {
        if (($payload['type'] ?? '') === 'ReceivedCallback' && empty($payload['fromMe']) && empty($payload['isGroup'])) {
            $events[] = [
                'kind' => 'message',
                'from' => (string) ($payload['phone'] ?? ''),
                'name' => $payload['senderName'] ?? $payload['chatName'] ?? '',
                'external_id' => $payload['messageId'] ?? null,
                'type' => 'text',
                'body' => $payload['text']['message'] ?? $payload['image']['caption'] ?? '[mídia]',
            ];
        }
    } elseif ($type === 'instagram' || $type === 'facebook') {
        foreach ($payload['entry'] ?? [] as $entry) {
            foreach ($entry['messaging'] ?? [] as $messaging) {
                if (isset($messaging['message']) && empty($messaging['message']['is_echo'])) {
                    $events[] = [
                        'kind' => 'message',
                        'from' => (string) ($messaging['sender']['id'] ?? ''),
                        'name' => '',
                        'external_id' => $messaging['message']['mid'] ?? null,
                        'type' => 'text',
                        'body' => $messaging['message']['text'] ?? '[mídia]',
                    ];
                }
            }
        }
    }
    return array_values(array_filter($events, static fn($e) => $e['kind'] !== 'message' || $e['from'] !== ''));
}

function storeInboundMessage(array $channel, array $event): void
{
    $companyId = (int) $channel['company_id'];
    $conversation = findOrCreateConversation($companyId, $channel, $event['from'], (string) $event['name']);
    insertRow('messages', [
        'company_id' => $companyId,
        'conversation_id' => $conversation['id'],
        'direction' => 'in',
        'type' => $event['type'],
        'body' => $event['body'],
        'external_id' => $event['external_id'],
        'status' => 'received',
    ]);
    executeQuery(
        "UPDATE conversations SET unread = unread + 1, last_message_at = NOW(), last_message_preview = ?, status = 'open',
                contact_name = IF(contact_name = '', ?, contact_name) WHERE id = ?",
        [mb_substr((string) $event['body'], 0, 255), mb_substr((string) $event['name'], 0, 150), $conversation['id']],
    );
    if ($conversation['client_id']) {
        // Uma resposta nos 7 dias seguintes ao envio marca o destinatário da campanha como "respondeu".
        executeQuery(
            "UPDATE campaign_recipients SET status = 'replied'
             WHERE company_id = ? AND client_id = ? AND status = 'sent' AND sent_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
            [$companyId, $conversation['client_id']],
        );
    }
    if (isOptOutMessage((string) $event['body'])) {
        registerOptOut($channel, $conversation);
    }
    emitEvent($companyId, 'message.received', [
        'conversation_id' => (int) $conversation['id'],
        'client_id' => $conversation['client_id'] ? (int) $conversation['client_id'] : null,
        'from' => $event['from'],
        'body' => $event['body'],
        'channel' => $channel['type'],
    ]);
}
