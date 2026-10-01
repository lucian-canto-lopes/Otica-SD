<?php
declare(strict_types=1);

function login(array $input): never
{
    $user = executeQuery(
        <<<'SQL'
        SELECT
          *
        FROM
          users
        WHERE
          email = ?
        SQL
        ,
        [$input['email'] ?? ''],
    )->fetch();
    if (!$user || !password_verify($input['password'] ?? '', $user['password_hash'])) {
        sendError('E-mail ou senha incorretos.', 401);
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = $user['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    sendJson(['ok' => true]);
}

function authenticatedUser(): array
{
    $user = executeQuery(
        <<<'SQL'
        SELECT
          id,
          company_id,
          name,
          email,
          role
        FROM
          users
        WHERE
          id = ?
        SQL
        ,
        [$_SESSION['uid'] ?? 0],
    )->fetch();
    if (!$user) {
        sendError('Entre para continuar.', 401);
    }
    return $user;
}

function validateCsrfToken(string $method): void
{
    if ($method === 'GET') {
        return;
    }
    if (!hash_equals($_SESSION['csrf'] ?? '', $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '!')) {
        sendError('Sessão inválida. Entre novamente.', 403);
    }
}

function accessibleCompany(array $user): ?array
{
    if ($user['role'] === 'platform_admin') {
        return null;
    }
    $company = executeQuery(
        <<<'SQL'
        SELECT
          *
        FROM
          companies
        WHERE
          id = ?
        SQL
        ,
        [$user['company_id']],
    )->fetch();
    if ($company['status'] === 'blocked') {
        sendError('A assinatura desta ótica está suspensa.', 403);
    }
    return $company;
}
