<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

try {
    $action = $_GET['action'] ?? 'me';
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET', 'POST', 'PATCH'], true)) {
        sendError('Método não permitido.', 405);
    }
    $input = readJsonInput($method);
    if ($action === 'login' && $method === 'POST') {
        login($input);
    }

    $user = authenticatedUser();
    validateCsrfToken($method);
    if ($action === 'logout' && $method === 'POST') {
        session_destroy();
        sendJson(['ok' => true]);
    }

    $company = accessibleCompany($user);
    $isPlatformAdmin = $user['role'] === 'platform_admin';
    if ($action === 'me' && $method === 'GET') {
        sendJson(['user' => $user, 'csrf' => $_SESSION['csrf'], 'company' => $company]);
    }
    if ($action === 'companies') {
        handleCompanies($method, $input, $isPlatformAdmin);
    }
    if ($isPlatformAdmin) {
        sendError('Use uma conta de ótica para acessar a operação.', 403);
    }

    // A empresa sempre vem da sessão autenticada, nunca do corpo da requisição.
    $companyId = (int) $user['company_id'];
    switch ($action) {
        case 'dashboard':
            if ($method === 'GET') {
                showDashboard($companyId);
            }
            break;
        case 'branding':
            if ($user['role'] !== 'company_admin') {
                sendError('Acesso restrito ao responsável pela ótica.', 403);
            }
            handleBranding($method, $input, $companyId);
        case 'clients':
            handleClients($method, $input, $companyId);
        case 'partners':
            handlePartners($method, $input, $companyId);
        case 'products':
            handleProducts($method, $input, $companyId);
        case 'sales':
            handleSales($method, $input, $companyId);
        case 'orders':
            handleOrders($method, $input, $companyId);
        case 'interactions':
            handleInteractions($method, $input, $companyId);
        case 'reminders':
            handleReminders($method, $input, $companyId);
    }
    sendError('Recurso não encontrado.', 404);
} catch (Throwable $exception) {
    try {
        if (database()->inTransaction()) {
            database()->rollBack();
        }
    } catch (Throwable $rollbackException) {
        // A conexão pode ter falhado antes mesmo de a transação começar.
        error_log($rollbackException->getMessage());
    }
    error_log($exception->getMessage());
    $message =
        $exception instanceof PDOException && $exception->getCode() === '23000'
            ? 'Registro duplicado ou referência inválida.'
            : 'Não foi possível concluir a operação.';
    sendError($message, 500);
}
