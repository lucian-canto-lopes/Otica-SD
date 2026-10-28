<?php
declare(strict_types=1);

/*
 * WhatsApp integrado pela Evolution API.
 * Canais "gerenciados" (config.managed = 1) usam o servidor Evolution que acompanha o sistema
 * (EVOLUTION_URL/EVOLUTION_API_KEY): o Ocular cria a instância, configura o webhook e mostra o QR Code,
 * sem a ótica precisar de servidor próprio. Canais não gerenciados usam a URL, chave e instância informadas.
 */

function evolutionServerConfigured(): bool
{
    return appConfig('EVOLUTION_URL') !== '' && appConfig('EVOLUTION_API_KEY') !== '';
}

/** Servidor, chave e instância efetivos do canal. */
function evolutionTarget(array $channel): array
{
    $config = channelConfig($channel);
    if (!empty($config['managed'])) {
        return [
            'base' => rtrim(appConfig('EVOLUTION_URL'), '/'),
            'key' => appConfig('EVOLUTION_API_KEY'),
            'instance' => ($config['instance'] ?? '') ?: 'ocular_' . $channel['company_id'] . '_' . $channel['id'],
            'managed' => true,
        ];
    }
    return [
        'base' => rtrim((string) ($config['base_url'] ?? ''), '/'),
        'key' => (string) ($config['api_key'] ?? ''),
        'instance' => (string) ($config['instance'] ?? ''),
        'managed' => false,
    ];
}

function evolutionRequest(array $channel, string $method, string $path, ?array $body = null, int $timeout = 20): array
{
    $target = evolutionTarget($channel);
    if ($target['base'] === '') {
        return ['status' => 0, 'body' => [], 'error' => 'Servidor da Evolution API não configurado.'];
    }
    $path = str_replace('{instance}', rawurlencode($target['instance']), $path);
    return httpJson($method, $target['base'] . $path, ['apikey' => $target['key']], $body, $timeout);
}

function evolutionErrorText(array $result): string
{
    if ($result['error'] !== '') {
        return $result['error'];
    }
    $message = $result['body']['response']['message'] ?? $result['body']['message'] ?? $result['body']['error'] ?? null;
    if (is_array($message)) {
        $message = implode(' ', array_map(static fn($m) => is_scalar($m) ? (string) $m : json_encode($m, JSON_UNESCAPED_UNICODE), $message));
    }
    return (string) ($message ?: 'HTTP ' . $result['status']);
}

/** URL que o servidor Evolution chama para entregar mensagens e mudanças de conexão. */
function evolutionWebhookUrl(array $channel): string
{
    $base = appConfig('EVOLUTION_WEBHOOK_BASE') ?: appConfig('PUBLIC_URL');
    return rtrim($base, '/') . '/index.php?action=webhook&token=' . $channel['webhook_token'];
}

function evolutionSetWebhook(array $channel): array
{
    return evolutionRequest($channel, 'POST', '/webhook/set/{instance}', [
        'webhook' => [
            'enabled' => true,
            'url' => evolutionWebhookUrl($channel),
            'byEvents' => false,
            'base64' => false,
            'events' => ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
        ],
    ]);
}

/** Cria a instância no servidor integrado (se ainda não existir) e configura o webhook. */
function evolutionEnsureInstance(array $channel): array
{
    $target = evolutionTarget($channel);
    $existing = evolutionRequest($channel, 'GET', '/instance/fetchInstances?instanceName=' . rawurlencode($target['instance']));
    $found = $existing['status'] === 200 && is_array($existing['body']) && count(array_filter($existing['body'], 'is_array')) > 0;
    $created = null;
    if (!$found) {
        $created = evolutionRequest($channel, 'POST', '/instance/create', [
            'instanceName' => $target['instance'],
            'integration' => 'WHATSAPP-BAILEYS',
            'qrcode' => true,
            // A ótica atende pelo Ocular: grupos e chamadas não entram na caixa de entrada.
            'groupsIgnore' => true,
            'rejectCall' => false,
            'alwaysOnline' => false,
            'readMessages' => false,
            'syncFullHistory' => false,
        ], 30);
        if ($created['status'] < 200 || $created['status'] >= 300) {
            return ['ok' => false, 'error' => 'Não foi possível criar a conexão: ' . evolutionErrorText($created)];
        }
    }
    $webhook = evolutionSetWebhook($channel);
    if ($webhook['status'] < 200 || $webhook['status'] >= 300) {
        return ['ok' => false, 'error' => 'Conexão criada, mas o webhook falhou: ' . evolutionErrorText($webhook)];
    }
    return ['ok' => true, 'created' => $created];
}

/**
 * Gera o QR Code (ou o código de pareamento, se informado o número) para conectar o WhatsApp.
 * Retorna ['ok', 'qr' => data URI|null, 'pairing_code', 'state', 'error'].
 */
function evolutionConnect(array $channel, string $pairingNumber = ''): array
{
    if (evolutionTarget($channel)['managed']) {
        $ensure = evolutionEnsureInstance($channel);
        if (!$ensure['ok']) {
            return ['ok' => false, 'error' => $ensure['error']];
        }
    } else {
        evolutionSetWebhook($channel);
    }
    $state = evolutionRefreshState($channel);
    if ($state['state'] === 'open') {
        return ['ok' => true, 'state' => 'open', 'phone_number' => $state['phone_number'], 'qr' => null, 'pairing_code' => null];
    }
    $path = '/instance/connect/{instance}' . ($pairingNumber !== '' ? '?number=' . rawurlencode($pairingNumber) : '');
    $result = evolutionRequest($channel, 'GET', $path, null, 30);
    if ($result['status'] < 200 || $result['status'] >= 300) {
        return ['ok' => false, 'error' => 'Falha ao gerar o QR Code: ' . evolutionErrorText($result)];
    }
    $qr = $result['body']['base64'] ?? $result['body']['qrcode']['base64'] ?? null;
    if (is_string($qr) && $qr !== '' && !str_starts_with($qr, 'data:')) {
        $qr = 'data:image/png;base64,' . $qr;
    }
    return [
        'ok' => true,
        'state' => $state['state'] ?: 'connecting',
        'qr' => $qr ?: null,
        'pairing_code' => $result['body']['pairingCode'] ?? null,
    ];
}

/** Consulta o estado da conexão e o número conectado, e grava no canal. */
function evolutionRefreshState(array $channel): array
{
    $result = evolutionRequest($channel, 'GET', '/instance/connectionState/{instance}', null, 10);
    if ($result['status'] === 404) {
        $state = 'close';
    } elseif ($result['status'] < 200 || $result['status'] >= 300) {
        executeQuery('UPDATE channels SET state_checked_at = NOW(), last_error = ? WHERE id = ?', [mb_substr(evolutionErrorText($result), 0, 500), $channel['id']]);
        return ['state' => '', 'phone_number' => $channel['phone_number'] ?? '', 'error' => evolutionErrorText($result)];
    } else {
        $state = (string) ($result['body']['instance']['state'] ?? $result['body']['state'] ?? '');
    }
    $phone = (string) ($channel['phone_number'] ?? '');
    if ($state === 'open') {
        $target = evolutionTarget($channel);
        $info = evolutionRequest($channel, 'GET', '/instance/fetchInstances?instanceName=' . rawurlencode($target['instance']), null, 10);
        $instance = is_array($info['body']) ? (array_values(array_filter($info['body'], 'is_array'))[0] ?? []) : [];
        $owner = (string) ($instance['ownerJid'] ?? $instance['instance']['owner'] ?? $instance['number'] ?? '');
        if ($owner !== '') {
            $phone = onlyDigits(explode('@', $owner)[0]);
        }
    }
    applyChannelConnectionState($channel, $state, $phone);
    return ['state' => $state, 'phone_number' => $phone, 'error' => ''];
}

/**
 * Grava o estado da conexão. O início do aquecimento (connected_at) só é reiniciado quando
 * um número diferente é conectado ao canal.
 */
function applyChannelConnectionState(array $channel, string $state, string $phone = ''): void
{
    $phone = $phone !== '' ? $phone : (string) ($channel['phone_number'] ?? '');
    $sameNumber = $phone !== '' && $phone === (string) ($channel['phone_number'] ?? '');
    $connectedAt = $channel['connected_at'] ?? null;
    if ($state === 'open' && (!$connectedAt || !$sameNumber)) {
        $connectedAt = date('Y-m-d H:i:s');
    }
    $status = ['open' => 'active', 'close' => 'error'][$state] ?? null;
    executeQuery(
        "UPDATE channels SET connection_state = ?, phone_number = ?, connected_at = ?, state_checked_at = NOW(),
                status = IF(status = 'inactive' OR ? IS NULL, status, ?), last_error = IF(? = 'open', '', last_error) WHERE id = ?",
        [$state, $phone, $connectedAt, $status, $status, $state, $channel['id']],
    );
    if ($state === 'close') {
        executeQuery("UPDATE channels SET last_error = 'WhatsApp desconectado. Abra Configurações › Canais e leia o QR Code novamente.' WHERE id = ?", [$channel['id']]);
    }
}

function evolutionLogout(array $channel): array
{
    $result = evolutionRequest($channel, 'DELETE', '/instance/logout/{instance}', null, 15);
    applyChannelConnectionState($channel, 'close');
    $ok = ($result['status'] >= 200 && $result['status'] < 300) || $result['status'] === 404;
    return ['ok' => $ok, 'error' => $ok ? '' : evolutionErrorText($result)];
}

/**
 * Confere se o número tem WhatsApp antes do envio. Mensagens para números inexistentes
 * são um dos sinais mais fortes de disparo em massa para a Meta.
 * Retorna true/false, ou null quando não foi possível consultar.
 */
function evolutionNumberExists(array $channel, string $number): ?bool
{
    $result = evolutionRequest($channel, 'POST', '/chat/whatsappNumbers/{instance}', ['numbers' => [$number]], 15);
    if ($result['status'] < 200 || $result['status'] >= 300 || !is_array($result['body'])) {
        return null;
    }
    $row = array_values(array_filter($result['body'], 'is_array'))[0] ?? null;
    return $row === null ? null : (bool) ($row['exists'] ?? false);
}
