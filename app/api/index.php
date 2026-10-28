<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

// Ação => [função, exige ótica selecionada]. A função recebe (método, entrada).
const ROUTES = [
    // Sessão
    'me' => ['handleMe', false],
    'logout' => ['handleLogout', false],
    'select_company' => ['handleSelectCompany', false],
    'profile' => ['handleProfile', false],
    // Plataforma (superadmin)
    'admin_dashboard' => ['handleAdminDashboard', false],
    'admin_companies' => ['handleAdminCompanies', false],
    'admin_users' => ['handleAdminUsers', false],
    'admin_plans' => ['handleAdminPlans', false],
    'admin_invoices' => ['handleAdminInvoices', false],
    'admin_audit' => ['handleAdminAudit', false],
    // Ótica
    'dashboard' => ['handleDashboard', true],
    'company' => ['handleCompanySettings', true],
    'company_logo' => ['handleCompanyLogo', true],
    'team' => ['handleTeam', true],
    'tags' => ['handleTags', true],
    'loss_reasons' => ['handleLossReasons', true],
    'clients' => ['handleClients', true],
    'client_timeline' => ['handleClientTimeline', true],
    'clients_overview' => ['handleClientsOverview', true],
    'prescriptions' => ['handlePrescriptions', true],
    'partners' => ['handlePartners', true],
    'products' => ['handleProducts', true],
    'stock' => ['handleStock', true],
    'quotes' => ['handleQuotes', true],
    'sales' => ['handleSales', true],
    'service_orders' => ['handleServiceOrders', true],
    'attachments' => ['handleAttachments', true],
    'interactions' => ['handleInteractions', true],
    'tasks' => ['handleTasks', true],
    'lost' => ['handleLostOpportunities', true],
    'channels' => ['handleChannels', true],
    'conversations' => ['handleConversations', true],
    'messages' => ['handleMessages', true],
    'templates' => ['handleTemplates', true],
    'campaigns' => ['handleCampaigns', true],
    'automations' => ['handleAutomations', true],
    'reports' => ['handleReports', true],
    'saved_reports' => ['handleSavedReports', true],
    'imports' => ['handleImports', true],
    'api_keys' => ['handleApiKeys', true],
    'webhooks' => ['handleWebhooks', true],
    'audit' => ['handleAudit', true],
    'pdf' => ['handlePdf', true],
    'search' => ['handleGlobalSearch', true],
];

try {
    $action = (string) ($_GET['action'] ?? 'me');
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit();
    }
    if (!in_array($method, ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], true)) {
        sendError('Método não permitido.', 405);
    }

    // Rotas públicas: verificação de saúde e recebimento de mensagens dos provedores.
    if ($action === 'health') {
        sendJson(['ok' => true, 'version' => APP_VERSION, 'time' => date(DATE_ATOM)]);
    }
    if ($action === 'webhook') {
        handleInboundWebhook($method);
    }
    if ($action === 'logo') {
        handlePublicLogo();
    }

    $input = readJsonInput($method);
    if ($action === 'login' && $method === 'POST') {
        login($input);
    }

    loadContext();
    validateCsrfToken($method);

    if (!isset(ROUTES[$action])) {
        sendError('Recurso não encontrado.', 404);
    }
    [$handler, $needsCompany] = ROUTES[$action];
    if ($needsCompany) {
        Context::companyId();
        if (Context::$viaApiKey && !in_array($action, ['clients', 'products', 'sales', 'quotes', 'service_orders', 'partners', 'reports'], true)) {
            sendError('Recurso indisponível pela API.', 403);
        }
    }
    $handler($method, $input);
    sendError('Método não permitido para este recurso.', 405);
} catch (Throwable $exception) {
    try {
        if (database()->inTransaction()) {
            database()->rollBack();
        }
    } catch (Throwable $rollbackException) {
        // A conexão pode ter falhado antes mesmo de a transação começar.
        error_log($rollbackException->getMessage());
    }
    error_log($exception->getMessage() . ' @ ' . $exception->getFile() . ':' . $exception->getLine());
    $message =
        $exception instanceof PDOException && $exception->getCode() === '23000'
            ? 'Registro duplicado ou em uso por outro cadastro.'
            : 'Não foi possível concluir a operação.';
    $extra = appConfig('APP_DEBUG') === '1' ? ['debug' => $exception->getMessage()] : [];
    sendError($message, 500, $extra);
}
