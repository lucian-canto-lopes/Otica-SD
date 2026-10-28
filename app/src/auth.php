<?php
declare(strict_types=1);

/**
 * Contexto da requisição: usuário autenticado, ótica selecionada e papel nessa ótica.
 * A ótica sempre vem da sessão (ou da chave de API), nunca do corpo da requisição.
 */
final class Context
{
    public static ?array $user = null;
    public static ?array $company = null;
    public static string $role = '';
    public static bool $viaApiKey = false;

    public static function companyId(): int
    {
        if (!self::$company) {
            sendError('Selecione uma ótica para continuar.', 409, ['code' => 'company_required']);
        }
        return (int) self::$company['id'];
    }

    public static function userId(): ?int
    {
        return self::$user ? (int) self::$user['id'] : null;
    }

    public static function isSuperadmin(): bool
    {
        return (bool) (self::$user['is_superadmin'] ?? false);
    }
}

const ROLE_LABELS = [
    'owner' => 'Proprietário',
    'manager' => 'Gerente',
    'seller' => 'Vendedor',
    'lab' => 'Laboratório',
    'viewer' => 'Somente leitura',
];

// Permissões por papel. "read" é concedida a todos os membros ativos.
const ROLE_PERMISSIONS = [
    'owner' => ['read', 'sell', 'service', 'crm', 'manage', 'finance'],
    'manager' => ['read', 'sell', 'service', 'crm', 'manage', 'finance'],
    'seller' => ['read', 'sell', 'service', 'crm'],
    'lab' => ['read', 'service'],
    'viewer' => ['read'],
];

function can(string $permission): bool
{
    if (Context::isSuperadmin() && Context::$company) {
        return true;
    }
    return in_array($permission, ROLE_PERMISSIONS[Context::$role] ?? [], true);
}

function requirePermission(string $permission): void
{
    if (!can($permission)) {
        sendError('Seu perfil não tem permissão para esta operação.', 403);
    }
}

function requireSuperadmin(): void
{
    if (!Context::isSuperadmin()) {
        sendError('Acesso restrito ao administrador da plataforma.', 403);
    }
}

function startAppSession(): void
{
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_name('OCULARSESSID');
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'path' => '/',
        'secure' => $secure,
        'lifetime' => 60 * 60 * 12,
    ]);
    session_start();
}

function login(array $input): never
{
    $email = mb_strtolower(trim((string) ($input['email'] ?? '')));
    $attemptsKey = 'login_failures';
    $failures = $_SESSION[$attemptsKey] ?? ['count' => 0, 'at' => 0];
    if ($failures['count'] >= 8 && time() - $failures['at'] < 300) {
        sendError('Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
    }
    $user = fetchOne('SELECT * FROM users WHERE email = ?', [$email]);
    if (!$user || !$user['active'] || !password_verify((string) ($input['password'] ?? ''), $user['password_hash'])) {
        $_SESSION[$attemptsKey] = ['count' => $failures['count'] + 1, 'at' => time()];
        auditLog('login_failed', 'user', $user ? (int) $user['id'] : null, 'Tentativa de acesso: ' . $email, null, null);
        sendError('E-mail ou senha incorretos.', 401);
    }
    session_regenerate_id(true);
    $_SESSION = ['uid' => (int) $user['id'], 'csrf' => bin2hex(random_bytes(24))];
    executeQuery('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$user['id']]);

    $companies = userCompanies((int) $user['id']);
    if (count($companies) === 1) {
        $_SESSION['company_id'] = (int) $companies[0]['id'];
    }
    Context::$user = $user;
    auditLog('login', 'user', (int) $user['id'], 'Acesso ao sistema', null, $_SESSION['company_id'] ?? null);
    sendJson(['ok' => true]);
}

function userCompanies(int $userId): array
{
    return fetchAllRows(
        <<<'SQL'
        SELECT c.id, c.name, c.trade_name, c.status, c.logo_path, c.primary_color, cu.role
        FROM company_users cu
        JOIN companies c ON c.id = cu.company_id
        WHERE cu.user_id = ? AND cu.active = 1
        ORDER BY c.name
        SQL
        ,
        [$userId],
    );
}

function loadContext(): void
{
    if (authenticateApiKey()) {
        return;
    }
    $userId = (int) ($_SESSION['uid'] ?? 0);
    $user = $userId
        ? fetchOne('SELECT id, name, email, phone, is_superadmin, active FROM users WHERE id = ?', [$userId])
        : null;
    if (!$user || !$user['active']) {
        sendError('Entre para continuar.', 401, ['code' => 'unauthenticated']);
    }
    $user['is_superadmin'] = (bool) $user['is_superadmin'];
    Context::$user = $user;

    $companyId = (int) ($_SESSION['company_id'] ?? 0);
    if ($companyId) {
        selectCompany($companyId, false);
    }
}

/** Seleciona a ótica de trabalho, validando vínculo e situação da assinatura. */
function selectCompany(int $companyId, bool $strict = true): void
{
    $company = fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]);
    $role = null;
    if ($company) {
        $role = fetchValue(
            'SELECT role FROM company_users WHERE company_id = ? AND user_id = ? AND active = 1',
            [$companyId, Context::userId()],
        );
        if (!$role && Context::isSuperadmin()) {
            $role = 'owner';
        }
    }
    if (!$company || !$role) {
        unset($_SESSION['company_id']);
        if ($strict) {
            sendError('Ótica não encontrada ou sem acesso.', 404);
        }
        return;
    }
    if (in_array($company['status'], ['blocked', 'cancelled'], true) && !Context::isSuperadmin()) {
        unset($_SESSION['company_id']);
        if ($strict) {
            sendError(
                'O acesso desta ótica está bloqueado.' . ($company['blocked_reason'] ? ' ' . $company['blocked_reason'] : ''),
                403,
                ['code' => 'company_blocked'],
            );
        }
        return;
    }
    $_SESSION['company_id'] = $companyId;
    Context::$company = $company;
    Context::$role = (string) $role;
}

function validateCsrfToken(string $method): void
{
    if ($method === 'GET' || Context::$viaApiKey) {
        return;
    }
    if (!hash_equals($_SESSION['csrf'] ?? '', $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '!')) {
        sendError('Sessão expirada. Entre novamente.', 403, ['code' => 'csrf']);
    }
}

/** Integrações externas usam "Authorization: Bearer ok_..." com acesso somente de leitura. */
function authenticateApiKey(): bool
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(ok_[A-Za-z0-9]{20,})$/', $header, $match)) {
        return false;
    }
    $key = fetchOne(
        'SELECT k.*, c.status FROM api_keys k JOIN companies c ON c.id = k.company_id WHERE k.key_hash = ? AND k.revoked_at IS NULL',
        [hash('sha256', $match[1])],
    );
    if (!$key || in_array($key['status'], ['blocked', 'cancelled'], true)) {
        sendError('Chave de API inválida.', 401);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'GET' && !str_contains($key['scopes'], 'write')) {
        sendError('Esta chave permite somente leitura.', 403);
    }
    executeQuery('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [$key['id']]);
    Context::$viaApiKey = true;
    Context::$user = ['id' => null, 'name' => 'API: ' . $key['name'], 'is_superadmin' => false];
    Context::$company = fetchOne('SELECT * FROM companies WHERE id = ?', [$key['company_id']]);
    Context::$role = str_contains($key['scopes'], 'write') ? 'seller' : 'viewer';
    return true;
}

function sessionPayload(): array
{
    $user = Context::$user;
    $companies = Context::isSuperadmin()
        ? fetchAllRows(
            "SELECT id, name, trade_name, status, logo_path, primary_color, 'owner' AS role FROM companies ORDER BY name",
        )
        : userCompanies((int) $user['id']);
    $company = Context::$company;
    if ($company) {
        $company = publicCompany($company);
    }
    return [
        'user' => $user,
        'csrf' => $_SESSION['csrf'] ?? '',
        'company' => $company,
        'role' => Context::$role,
        'permissions' => Context::$company
            ? (Context::isSuperadmin() ? ROLE_PERMISSIONS['owner'] : ROLE_PERMISSIONS[Context::$role] ?? [])
            : [],
        'companies' => $companies,
    ];
}

function publicCompany(array $company): array
{
    $company['settings'] = decodeJsonColumn($company['settings'] ?? null, new stdClass());
    $company['logo_url'] = $company['logo_path'] ? 'index.php?action=logo&company=' . $company['id'] . '&v=' . substr(md5($company['logo_path']), 0, 8) : null;
    return $company;
}
