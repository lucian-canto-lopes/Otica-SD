<?php
declare(strict_types=1);

/*
 * Envio seguro pelo WhatsApp não oficial (Evolution API e Z-API).
 * A Meta bloqueia números que se comportam como disparadores: muitas mensagens em pouco tempo,
 * envio para números inexistentes, para quem nunca pediu e muitas denúncias. Por isso as campanhas
 * nesses canais seguem regras fixas:
 *  - aquecimento: número recém-conectado começa com poucas mensagens por dia e aumenta aos poucos;
 *  - uma mensagem por vez no número, com intervalo aleatório e pausas longas entre lotes;
 *  - só dentro da janela de horário da campanha;
 *  - números sem WhatsApp são pulados antes do envio;
 *  - quem já conversou com a ótica recebe primeiro; quem responde SAIR nunca mais recebe;
 *  - rodapé com a opção de descadastro;
 *  - pausa automática se o WhatsApp desconectar ou se as falhas se acumularem.
 * Nada disso garante que a Meta não bloqueie o número; a API oficial (Cloud) é o caminho sem esse risco.
 */

const UNOFFICIAL_CHANNEL_TYPES = ['whatsapp_evolution', 'whatsapp_zapi'];

// Mensagens automáticas por dia conforme os dias desde que o número foi conectado.
const WARMUP_STEPS = [[0, 30], [3, 60], [7, 100], [14, 180], [30, 250]];

const OPT_OUT_KEYWORDS = ['sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar', 'remover', 'nao quero', 'nao quero mais', 'nao quero receber'];

const OPT_OUT_FOOTER = 'Para não receber mais mensagens, responda SAIR.';

// Intervalo mínimo entre envios manuais (botão "Enviar") pelo mesmo número.
const MANUAL_SEND_GAP_SECONDS = 15;

function isUnofficialChannel(?array $channel): bool
{
    return $channel !== null && in_array($channel['type'], UNOFFICIAL_CHANNEL_TYPES, true);
}

function channelWarmupDay(array $channel): int
{
    $connectedAt = $channel['connected_at'] ?? null;
    return $connectedAt ? max(0, (int) floor((time() - strtotime($connectedAt)) / 86400)) : 0;
}

function channelDailyLimit(array $channel): int
{
    if ((int) ($channel['daily_limit'] ?? 0) > 0) {
        return (int) $channel['daily_limit'];
    }
    $day = channelWarmupDay($channel);
    $limit = WARMUP_STEPS[0][1];
    foreach (WARMUP_STEPS as [$fromDay, $value]) {
        if ($day >= $fromDay) {
            $limit = $value;
        }
    }
    return $limit;
}

/** Mensagens automáticas (campanhas e automações) enviadas hoje pelo número. Respostas de atendentes não contam. */
function channelAutomatedSentToday(int $channelId): int
{
    return (int) fetchValue(
        "SELECT COUNT(*) FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
         WHERE cv.channel_id = ? AND m.direction = 'out' AND m.status IN ('queued', 'sent', 'delivered', 'read')
           AND (m.campaign_recipient_id IS NOT NULL OR m.user_id IS NULL) AND m.created_at >= CURDATE()",
        [$channelId],
    );
}

function channelLastOutboundAt(int $channelId): ?int
{
    $value = fetchValue(
        "SELECT MAX(m.created_at) FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
         WHERE cv.channel_id = ? AND m.direction = 'out' AND m.status <> 'failed' AND m.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)",
        [$channelId],
    );
    return $value ? strtotime((string) $value) : null;
}

/** Resumo exibido na tela de canais e na campanha. */
function channelSafetySummary(array $channel): array
{
    if (!isUnofficialChannel($channel)) {
        return [];
    }
    return [
        'warmup_day' => channelWarmupDay($channel),
        'daily_limit' => channelDailyLimit($channel),
        'daily_limit_custom' => (int) ($channel['daily_limit'] ?? 0) > 0,
        'sent_today' => channelAutomatedSentToday((int) $channel['id']),
    ];
}

/**
 * Estado da conexão com cache de 2 minutos. Retorna true (conectado), false (desconectado)
 * ou null (não foi possível verificar / provedor sem consulta).
 */
function channelIsConnected(array $channel): ?bool
{
    if ($channel['type'] !== 'whatsapp_evolution') {
        return null;
    }
    $checkedAt = $channel['state_checked_at'] ?? null;
    $state = (string) ($channel['connection_state'] ?? '');
    if (!$checkedAt || strtotime($checkedAt) < time() - 120 || $state === '') {
        $state = evolutionRefreshState($channel)['state'];
    }
    return $state === '' ? null : $state === 'open';
}

/**
 * Regras aplicadas a todo envio de campanha por canal não oficial (automático ou pelo botão "Enviar").
 * Retorna ['ok' => true] ou ['ok' => false, 'error' => ..., 'skip' => true quando o destinatário deve ser pulado].
 */
function guardUnofficialSend(array $channel, array $recipient, bool $manual): array
{
    if (channelIsConnected($channel) === false) {
        return ['ok' => false, 'error' => 'O WhatsApp está desconectado. Leia o QR Code novamente em Configurações › Canais.'];
    }
    $limit = channelDailyLimit($channel);
    if (channelAutomatedSentToday((int) $channel['id']) >= $limit) {
        return ['ok' => false, 'error' => "Limite diário de {$limit} mensagens deste número atingido. Continue amanhã."];
    }
    if ($manual && ($last = channelLastOutboundAt((int) $channel['id'])) && time() - $last < MANUAL_SEND_GAP_SECONDS) {
        return ['ok' => false, 'error' => 'Aguarde alguns segundos entre um envio e outro.'];
    }
    if ($channel['type'] === 'whatsapp_evolution' && evolutionNumberExists($channel, (string) $recipient['phone']) === false) {
        return ['ok' => false, 'error' => 'Número sem WhatsApp.', 'skip' => true];
    }
    return ['ok' => true];
}

function withOptOutFooter(string $message): string
{
    if (str_contains(normalizeOptOutText($message), 'responda sair')) {
        return $message;
    }
    return rtrim($message) . "\n\n" . OPT_OUT_FOOTER;
}

function normalizeOptOutText(string $text): string
{
    $text = mb_strtolower(trim($text));
    $text = strtr($text, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'é' => 'e', 'ê' => 'e', 'í' => 'i', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ú' => 'u', 'ç' => 'c']);
    return trim(preg_replace('/[^a-z ]+/', ' ', $text) ?? '');
}

/** A mensagem inteira precisa ser a palavra-chave ("sair", "Parar!"): frases comuns não descadastram. */
function isOptOutMessage(string $body): bool
{
    return in_array(preg_replace('/\s+/', ' ', normalizeOptOutText($body)), OPT_OUT_KEYWORDS, true);
}

/** Cliente pediu para sair: retira o aceite, tira de todas as campanhas pendentes e confirma uma única vez. */
function registerOptOut(array $channel, array $conversation): void
{
    $companyId = (int) $channel['company_id'];
    $client = $conversation['client_id']
        ? fetchOne('SELECT id, name, message_opt_out_at FROM clients WHERE id = ? AND company_id = ?', [$conversation['client_id'], $companyId])
        : findClientByPhone($companyId, (string) $conversation['contact_handle']);
    $alreadyOut = $client && !empty($client['message_opt_out_at']) && strtotime($client['message_opt_out_at']) > time() - 86400;
    if ($client) {
        executeQuery('UPDATE clients SET message_consent = 0, message_consent_at = NULL, message_opt_out_at = NOW() WHERE id = ? AND company_id = ?', [$client['id'], $companyId]);
        executeQuery(
            "UPDATE campaign_recipients SET status = 'skipped', error = 'Pediu para não receber mensagens'
             WHERE company_id = ? AND client_id = ? AND status IN ('pending', 'queued')",
            [$companyId, $client['id']],
        );
        insertRow('interactions', [
            'company_id' => $companyId,
            'client_id' => $client['id'],
            'channel' => 'whatsapp',
            'direction' => 'in',
            'subject' => 'Pediu para não receber mensagens',
            'notes' => 'Respondeu com palavra de descadastro. O aceite de mensagens foi retirado.',
        ]);
        auditLog('opt_out', 'client', (int) $client['id'], 'Cliente pediu para não receber mensagens pelo WhatsApp', null, $companyId);
    }
    if (!$alreadyOut && $channel['type'] !== 'whatsapp_manual') {
        $company = fetchOne('SELECT name, trade_name FROM companies WHERE id = ?', [$companyId]);
        $name = ($company['trade_name'] ?? '') ?: ($company['name'] ?? 'a ótica');
        sendConversationMessage($conversation, "Pronto! Você não receberá mais mensagens promocionais de {$name}. Se precisar de algo, é só chamar por aqui.");
    }
}

function scheduleNextCampaignSend(array $campaign, bool $countsForBatch): void
{
    $min = max(20, (int) $campaign['min_interval_seconds']);
    $max = max($min, (int) $campaign['max_interval_seconds']);
    $inBatch = (int) $campaign['sent_in_batch'] + ($countsForBatch ? 1 : 0);
    if ($inBatch >= max(1, (int) $campaign['batch_size'])) {
        $pause = max(1, (int) $campaign['batch_pause_minutes']) * 60;
        $delay = random_int($pause, (int) round($pause * 1.5));
        $inBatch = 0;
    } else {
        $delay = random_int($min, $max);
    }
    executeQuery('UPDATE campaigns SET next_send_at = ?, sent_in_batch = ?, pause_reason = ? WHERE id = ?', [date('Y-m-d H:i:s', time() + $delay), $inBatch, '', $campaign['id']]);
}

function autoPauseCampaign(array $campaign, string $reason): void
{
    executeQuery("UPDATE campaigns SET status = 'paused', pause_reason = ? WHERE id = ?", [mb_substr($reason, 0, 255), $campaign['id']]);
    auditLog('pause', 'campaign', (int) $campaign['id'], 'Campanha pausada automaticamente: ' . $reason, null, (int) $campaign['company_id']);
}

/**
 * Um passo do envio seguro: no máximo uma mensagem por número por ciclo do processador.
 * $busyChannels evita que duas campanhas usem o mesmo número no mesmo ciclo.
 */
function processSafeCampaign(array $campaign, array $channel, array &$busyChannels): int
{
    $channelId = (int) $channel['id'];
    if (isset($busyChannels[$channelId]) || ($campaign['next_send_at'] && strtotime($campaign['next_send_at']) > time())) {
        return 0;
    }
    if (channelIsConnected($channel) === false) {
        autoPauseCampaign($campaign, 'O WhatsApp desconectou. Leia o QR Code novamente e retome a campanha.');
        return 0;
    }
    // Disjuntor: muitas falhas recentes costumam indicar número restrito ou desconectado.
    $recent = fetchAllRows(
        "SELECT m.status FROM messages m JOIN campaign_recipients cr ON cr.id = m.campaign_recipient_id
         WHERE cr.campaign_id = ? AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) ORDER BY m.id DESC LIMIT 10",
        [$campaign['id']],
    );
    if (count($recent) >= 5 && count(array_filter($recent, static fn($r) => $r['status'] === 'failed')) >= 4) {
        autoPauseCampaign($campaign, 'Muitas falhas seguidas no envio. Verifique o WhatsApp antes de retomar.');
        return 0;
    }
    $limit = channelDailyLimit($channel);
    if (channelAutomatedSentToday($channelId) >= $limit) {
        $resume = date('Y-m-d', strtotime('+1 day')) . ' ' . $campaign['send_window_start'];
        executeQuery('UPDATE campaigns SET next_send_at = ?, pause_reason = ? WHERE id = ?', [
            $resume,
            "Limite diário do número atingido ({$limit} mensagens). Continua amanhã às " . substr((string) $campaign['send_window_start'], 0, 5) . '.',
            $campaign['id'],
        ]);
        return 0;
    }
    if (($last = channelLastOutboundAt($channelId)) && time() - $last < max(20, (int) $campaign['min_interval_seconds'])) {
        return 0;
    }
    // Quem já conversou com a ótica recebe primeiro: contatos conhecidos raramente denunciam.
    $recipients = fetchAllRows(
        "SELECT cr.*, c.name FROM campaign_recipients cr JOIN clients c ON c.id = cr.client_id
         WHERE cr.campaign_id = ? AND cr.status = 'pending' AND c.message_opt_out_at IS NULL
         ORDER BY EXISTS (SELECT 1 FROM conversations cv JOIN messages m ON m.conversation_id = cv.id AND m.direction = 'in'
                          WHERE cv.company_id = cr.company_id AND cv.client_id = cr.client_id) DESC, cr.id
         LIMIT 3",
        [$campaign['id']],
    );
    if (!$recipients) {
        if (!fetchValue("SELECT 1 FROM campaign_recipients WHERE campaign_id = ? AND status IN ('pending', 'queued') LIMIT 1", [$campaign['id']])) {
            executeQuery("UPDATE campaigns SET status = 'completed', finished_at = NOW(), pause_reason = '' WHERE id = ?", [$campaign['id']]);
        }
        return 0;
    }
    foreach ($recipients as $recipient) {
        $result = sendCampaignRecipient($campaign, $recipient, $channel);
        if (!empty($result['skipped'])) {
            continue; // número sem WhatsApp: pula sem gastar o intervalo
        }
        $busyChannels[$channelId] = true;
        scheduleNextCampaignSend($campaign, true);
        return $result['ok'] ? 1 : 0;
    }
    scheduleNextCampaignSend($campaign, false);
    return 0;
}
