<?php
declare(strict_types=1);

/** Registra a auditoria de uso. Falhas aqui nunca interrompem a operação principal. */
function auditLog(
    string $action,
    string $entity = '',
    ?int $entityId = null,
    string $summary = '',
    $details = null,
    ?int $companyId = -1,
): void {
    try {
        $company = $companyId === -1 ? (Context::$company['id'] ?? null) : $companyId;
        insertRow('audit_logs', [
            'company_id' => $company,
            'user_id' => Context::userId(),
            'user_name' => mb_substr((string) (Context::$user['name'] ?? ''), 0, 120),
            'action' => $action,
            'entity' => $entity,
            'entity_id' => $entityId,
            'summary' => mb_substr($summary, 0, 255),
            'details' => $details === null ? null : jsonColumn($details),
            'ip' => clientIp(),
            'user_agent' => mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'sistema'), 0, 255),
        ]);
    } catch (Throwable $exception) {
        error_log('Falha na auditoria: ' . $exception->getMessage());
    }
}

/** Diferença campo a campo para registrar alterações na auditoria. */
function changedFields(array $before, array $after): array
{
    $changes = [];
    foreach ($after as $key => $value) {
        if (array_key_exists($key, $before) && (string) $before[$key] !== (string) $value) {
            $changes[$key] = ['de' => $before[$key], 'para' => $value];
        }
    }
    return $changes;
}

/**
 * Reserva o próximo número de pedido, OS ou orçamento.
 * O contador fica nas configurações da ótica para permitir continuar a numeração do sistema legado.
 */
function reserveNumber(int $companyId, string $kind): int
{
    $column = [
        'sale' => 'next_sale_number',
        'order' => 'next_order_number',
        'quote' => 'next_quote_number',
    ][$kind];
    $table = ['sale' => 'sales', 'order' => 'service_orders', 'quote' => 'quotes'][$kind];
    $next = (int) fetchValue("SELECT {$column} FROM companies WHERE id = ? FOR UPDATE", [$companyId]);
    // Se o número já existir (ex.: importado), avança até o primeiro livre.
    while (fetchValue("SELECT 1 FROM {$table} WHERE company_id = ? AND number = ?", [$companyId, $next])) {
        $next++;
    }
    executeQuery("UPDATE companies SET {$column} = ? WHERE id = ?", [$next + 1, $companyId]);
    return $next;
}

function storagePath(string $relative = ''): string
{
    $base = rtrim(appConfig('STORAGE_PATH'), '/\\');
    return $relative === '' ? $base : $base . '/' . ltrim($relative, '/');
}

function ensureDirectory(string $path): void
{
    if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
        throw new RuntimeException('Não foi possível criar o diretório de arquivos.');
    }
}

const ALLOWED_UPLOAD_TYPES = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
    'image/heic' => 'heic',
    'image/heif' => 'heif',
    'application/pdf' => 'pdf',
    'text/plain' => 'txt',
    'text/csv' => 'csv',
    'application/msword' => 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
    'application/vnd.ms-excel' => 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
];

/** Valida e grava um arquivo enviado, retornando [nome armazenado, mime, tamanho]. */
function storeUploadedFile(array $file, string $folder): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        sendError('Falha no envio do arquivo (código ' . ($file['error'] ?? '?') . ').');
    }
    $maxBytes = (int) appConfig('MAX_UPLOAD_MB') * 1024 * 1024;
    if ($file['size'] > $maxBytes) {
        sendError('Arquivo maior que o limite de ' . appConfig('MAX_UPLOAD_MB') . ' MB.');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: 'application/octet-stream';
    if (!isset(ALLOWED_UPLOAD_TYPES[$mime])) {
        sendError('Tipo de arquivo não permitido: ' . $mime);
    }
    $directory = storagePath($folder);
    ensureDirectory($directory);
    $storedName = date('Ymd') . '_' . bin2hex(random_bytes(10)) . '.' . ALLOWED_UPLOAD_TYPES[$mime];
    if (!move_uploaded_file($file['tmp_name'], $directory . '/' . $storedName)) {
        if (!rename($file['tmp_name'], $directory . '/' . $storedName)) {
            throw new RuntimeException('Não foi possível gravar o arquivo.');
        }
    }
    return [$folder . '/' . $storedName, $mime, (int) $file['size']];
}

function streamFile(string $relativePath, string $mime, string $downloadName, bool $inline = true): never
{
    $path = storagePath($relativePath);
    if (!is_file($path)) {
        sendError('Arquivo não encontrado.', 404);
    }
    header_remove('Content-Type');
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, max-age=86400');
    header('X-Content-Type-Options: nosniff');
    $disposition = $inline ? 'inline' : 'attachment';
    header("Content-Disposition: {$disposition}; filename*=UTF-8''" . rawurlencode($downloadName));
    readfile($path);
    exit();
}

/**
 * Publica um evento de negócio: enfileira webhooks de saída e dispara automações imediatas.
 * Eventos: client.created, client.updated, sale.created, sale.cancelled, quote.created,
 * quote.lost, order.created, order.status_changed, message.received.
 */
function emitEvent(int $companyId, string $event, array $payload): void
{
    try {
        $hooks = fetchAllRows('SELECT id, events FROM webhooks WHERE company_id = ? AND active = 1', [$companyId]);
        foreach ($hooks as $hook) {
            $events = array_map('trim', explode(',', $hook['events']));
            if (in_array('*', $events, true) || in_array($event, $events, true)) {
                insertRow('webhook_deliveries', [
                    'company_id' => $companyId,
                    'webhook_id' => $hook['id'],
                    'event' => $event,
                    'payload' => jsonColumn(['event' => $event, 'company_id' => $companyId, 'data' => $payload, 'sent_at' => date(DATE_ATOM)]),
                ]);
            }
        }
        runEventAutomations($companyId, $event, $payload);
    } catch (Throwable $exception) {
        error_log('Falha ao publicar evento ' . $event . ': ' . $exception->getMessage());
    }
}

function money(float|string|null $value): string
{
    return 'R$ ' . number_format((float) $value, 2, ',', '.');
}

function brDate(?string $value): string
{
    if (!$value) {
        return '';
    }
    $time = strtotime($value);
    return $time ? date('d/m/Y', $time) : '';
}

/** Substitui variáveis {{nome}}, {{primeiro_nome}}, {{otica}} etc. em mensagens. */
function renderTemplate(string $template, array $client, array $company, array $extra = []): string
{
    $firstName = trim(explode(' ', trim((string) ($client['name'] ?? '')))[0] ?? '');
    $firstName = mb_convert_case(mb_strtolower($firstName), MB_CASE_TITLE);
    $variables = [
        'nome' => $client['name'] ?? '',
        'primeiro_nome' => $firstName,
        'apelido' => ($client['nickname'] ?? '') ?: $firstName,
        'otica' => ($company['trade_name'] ?? '') ?: ($company['name'] ?? ''),
        'telefone_otica' => ($company['whatsapp'] ?? '') ?: ($company['phone'] ?? ''),
        'cidade' => $client['city'] ?? '',
        'aniversario' => brDate($client['birth_date'] ?? null),
        'ultima_compra' => brDate($client['last_purchase'] ?? null),
        'vencimento_receita' => brDate($client['prescription_expires_at'] ?? null),
        ...$extra,
    ];
    return preg_replace_callback(
        '/\{\{\s*([a-z_]+)\s*\}\}/i',
        static fn(array $m): string => (string) ($variables[strtolower($m[1])] ?? $m[0]),
        $template,
    );
}
