<?php
declare(strict_types=1);

function handleAdminDashboard(string $method, array $input): never
{
    requireSuperadmin();
    $statusCounts = [];
    foreach (fetchAllRows('SELECT status, COUNT(*) AS total FROM companies GROUP BY status') as $row) {
        $statusCounts[$row['status']] = (int) $row['total'];
    }
    $month = date('Y-m');
    sendJson([
        'companies' => $statusCounts,
        'companies_total' => array_sum($statusCounts),
        'users_total' => (int) fetchValue('SELECT COUNT(*) FROM users WHERE active = 1'),
        'mrr' => (float) fetchValue("SELECT COALESCE(SUM(monthly_fee), 0) FROM companies WHERE status = 'active'"),
        'invoices_month' => fetchOne(
            "SELECT COALESCE(SUM(amount), 0) AS billed,
                    COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) AS received
             FROM billing_invoices WHERE reference = ? AND status <> 'cancelled'",
            [$month],
        ),
        'overdue' => fetchOne(
            "SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
             FROM billing_invoices WHERE status = 'pending' AND due_date < CURRENT_DATE",
        ),
        'trials_ending' => fetchAllRows(
            "SELECT id, name, trial_ends_at FROM companies
             WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at <= DATE_ADD(CURRENT_DATE, INTERVAL 15 DAY)
             ORDER BY trial_ends_at LIMIT 10",
        ),
        'revenue_by_month' => fetchAllRows(
            "SELECT reference AS month,
                    COALESCE(SUM(amount), 0) AS billed,
                    COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) AS received
             FROM billing_invoices WHERE status <> 'cancelled'
             GROUP BY reference ORDER BY reference DESC LIMIT 12",
        ),
        'new_companies_by_month' => fetchAllRows(
            "SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS total
             FROM companies GROUP BY month ORDER BY month DESC LIMIT 12",
        ),
        'usage' => fetchAllRows(
            "SELECT c.id, c.name, c.status,
                    (SELECT COUNT(*) FROM clients cl WHERE cl.company_id = c.id AND cl.deleted_at IS NULL) AS clients,
                    (SELECT COUNT(*) FROM sales s WHERE s.company_id = c.id AND s.sale_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)) AS sales_30d,
                    (SELECT MAX(created_at) FROM audit_logs a WHERE a.company_id = c.id) AS last_activity
             FROM companies c ORDER BY last_activity DESC LIMIT 20",
        ),
    ]);
}

function handleAdminCompanies(string $method, array $input): never
{
    requireSuperadmin();
    $id = routeId();
    if ($method === 'GET' && $id) {
        $company = fetchOne('SELECT * FROM companies WHERE id = ?', [$id]) ?? sendError('Ótica não encontrada.', 404);
        $company = publicCompany($company);
        $company['users'] = fetchAllRows(
            'SELECT u.id, u.name, u.email, u.active, cu.role, cu.active AS member_active, u.last_login_at
             FROM company_users cu JOIN users u ON u.id = cu.user_id WHERE cu.company_id = ? ORDER BY u.name',
            [$id],
        );
        $company['invoices'] = fetchAllRows('SELECT * FROM billing_invoices WHERE company_id = ? ORDER BY due_date DESC LIMIT 24', [$id]);
        $company['stats'] = fetchOne(
            'SELECT
               (SELECT COUNT(*) FROM clients WHERE company_id = ? AND deleted_at IS NULL) AS clients,
               (SELECT COUNT(*) FROM products WHERE company_id = ?) AS products,
               (SELECT COUNT(*) FROM sales WHERE company_id = ?) AS sales,
               (SELECT COALESCE(SUM(total), 0) FROM sales WHERE company_id = ? AND status <> \'cancelled\') AS sales_total',
            [$id, $id, $id, $id],
        );
        sendJson($company);
    }
    if ($method === 'GET') {
        $where = 'WHERE 1 = 1';
        $params = [];
        if ($q = query('q')) {
            $where .= ' AND (c.name LIKE ? OR c.trade_name LIKE ? OR c.document LIKE ?)';
            array_push($params, likeTerm($q), likeTerm($q), likeTerm($q));
        }
        if ($status = query('status')) {
            $where .= ' AND c.status = ?';
            $params[] = $status;
        }
        sendJson(
            paginate(
                "SELECT c.id, c.name, c.trade_name, c.document, c.city, c.state, c.status, c.monthly_fee, c.trial_ends_at,
                        c.created_at, p.name AS plan_name,
                        (SELECT COUNT(*) FROM company_users cu WHERE cu.company_id = c.id AND cu.active = 1) AS users_count,
                        (SELECT COUNT(*) FROM billing_invoices bi WHERE bi.company_id = c.id AND bi.status = 'pending' AND bi.due_date < CURRENT_DATE) AS overdue_invoices",
                "FROM companies c LEFT JOIN plans p ON p.id = c.plan_id {$where}",
                $params,
                sortClause(['name' => 'c.name', 'created_at' => 'c.created_at', 'status' => 'c.status'], 'c.name ASC'),
            ),
        );
    }
    if ($method === 'DELETE') {
        $companyId = requireRouteId();
        $company = fetchOne('SELECT id, name FROM companies WHERE id = ?', [$companyId]) ?? sendError('Ótica não encontrada.', 404);
        if (($input['confirm'] ?? '') !== $company['name']) {
            sendError('Digite o nome exato da ótica para confirmar a exclusão.');
        }
        inTransaction(static function () use ($companyId): void {
            // As tabelas da ótica usam ON DELETE CASCADE; estas não têm chave para companies.
            foreach (['interactions', 'service_order_events', 'stock_movements', 'sale_payments', 'sale_items', 'quote_items', 'messages', 'automation_runs', 'webhook_deliveries'] as $table) {
                executeQuery("DELETE FROM {$table} WHERE company_id = ?", [$companyId]);
            }
            executeQuery('DELETE FROM companies WHERE id = ?', [$companyId]);
        });
        auditLog('delete', 'company', $companyId, 'Ótica excluída: ' . $company['name'], null, null);
        sendJson(['ok' => true]);
    }

    $values = [
        'name' => requiredText($input, 'name', 150, 'razão social'),
        'trade_name' => optionalText($input, 'trade_name', 150),
        'document' => optionalText($input, 'document', 30),
        'phone' => optionalText($input, 'phone', 30),
        'whatsapp' => optionalText($input, 'whatsapp', 30),
        'email' => optionalEmail($input),
        'city' => optionalText($input, 'city', 100),
        'state' => strtoupper(optionalText($input, 'state', 2)),
        'status' => enumValue($input, 'status', ['trial', 'active', 'blocked', 'cancelled'], 'trial'),
        'plan_id' => optionalCompanyPlan($input),
        'monthly_fee' => moneyValue($input, 'monthly_fee'),
        'billing_day' => max(1, min(28, (int) ($input['billing_day'] ?? 10))),
        'trial_ends_at' => optionalDate($input, 'trial_ends_at'),
        'blocked_reason' => optionalText($input, 'blocked_reason', 255),
    ];

    if ($method === 'PATCH') {
        $companyId = requireRouteId();
        $before = fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]) ?? sendError('Ótica não encontrada.', 404);
        if (($input['only_status'] ?? false) === true) {
            $values = ['status' => $values['status'], 'blocked_reason' => $values['blocked_reason']];
        }
        $assignments = implode(', ', array_map(static fn($c) => "{$c} = ?", array_keys($values)));
        executeQuery("UPDATE companies SET {$assignments} WHERE id = ?", [...array_values($values), $companyId]);
        $action = $before['status'] !== $values['status']
            ? ($values['status'] === 'blocked' ? 'block' : ($before['status'] === 'blocked' ? 'unblock' : 'update'))
            : 'update';
        auditLog($action, 'company', $companyId, 'Ótica ' . $before['name'] . ' atualizada', changedFields($before, $values), $companyId);
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }

    $companyId = inTransaction(static function () use ($values, $input): int {
        $companyId = insertRow('companies', $values);
        seedCompanyDefaults($companyId);
        $ownerEmail = mb_strtolower(trim((string) ($input['owner_email'] ?? '')));
        if ($ownerEmail !== '') {
            $userId = findOrCreateUser(
                $ownerEmail,
                (string) ($input['owner_name'] ?? '') ?: $values['name'],
                (string) ($input['owner_password'] ?? ''),
            );
            linkUserToCompany($userId, $companyId, 'owner');
        }
        return $companyId;
    });
    auditLog('create', 'company', $companyId, 'Ótica cadastrada: ' . $values['name'], null, $companyId);
    sendJson(['ok' => true, 'id' => $companyId], 201);
}

function optionalCompanyPlan(array $input): ?int
{
    $planId = $input['plan_id'] ?? null;
    if ($planId === null || $planId === '') {
        return null;
    }
    if (!fetchValue('SELECT id FROM plans WHERE id = ?', [$planId])) {
        sendError('Plano não encontrado.');
    }
    return (int) $planId;
}

function findOrCreateUser(string $email, string $name, string $password): int
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendError('E-mail do usuário inválido.');
    }
    $existing = fetchValue('SELECT id FROM users WHERE email = ?', [$email]);
    if ($existing) {
        return (int) $existing;
    }
    if (strlen($password) < 8) {
        sendError('Informe uma senha com pelo menos 8 caracteres para o novo usuário.');
    }
    return insertRow('users', [
        'name' => mb_substr(trim($name) ?: $email, 0, 120),
        'email' => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    ]);
}

function linkUserToCompany(int $userId, int $companyId, string $role): void
{
    executeQuery(
        'INSERT INTO company_users (company_id, user_id, role, active) VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE role = VALUES(role), active = 1',
        [$companyId, $userId, $role],
    );
}

/** Cadastros padrão de cada nova ótica: etiquetas, motivos de perda e modelos de mensagem. */
function seedCompanyDefaults(int $companyId): void
{
    $tags = [
        ['VIP', '#a855f7'], ['Lentes de contato', '#0ea5e9'], ['Multifocal', '#f59e0b'],
        ['Infantil', '#22c55e'], ['Convênio', '#64748b'], ['Indicação', '#ec4899'],
    ];
    foreach ($tags as [$name, $color]) {
        executeQuery('INSERT IGNORE INTO tags (company_id, name, color) VALUES (?, ?, ?)', [$companyId, $name, $color]);
    }
    $reasons = [
        'Preço acima do esperado', 'Vai pesquisar em outras óticas', 'Sem receita / receita vencida',
        'Prazo de entrega longo', 'Não gostou dos modelos', 'Comprou em outra ótica',
        'Vai decidir com a família', 'Sem condições de pagamento', 'Apenas pesquisando',
    ];
    foreach ($reasons as $reason) {
        executeQuery('INSERT IGNORE INTO loss_reasons (company_id, name) VALUES (?, ?)', [$companyId, $reason]);
    }
    $templates = [
        ['Aniversário', 'relacionamento', "Olá, {{primeiro_nome}}! 🎉 A equipe da {{otica}} deseja um feliz aniversário! Neste mês você tem um presente especial esperando por aqui. Venha nos visitar!"],
        ['Receita vencendo', 'relacionamento', "Olá, {{primeiro_nome}}! Sua receita de óculos vence em {{vencimento_receita}}. Que tal agendar um novo exame e conferir as novidades da {{otica}}?"],
        ['Óculos pronto', 'servico', "Olá, {{primeiro_nome}}! Seus óculos já estão prontos para retirada na {{otica}}. Estamos te esperando!"],
        ['Promoção do mês', 'marketing', "Olá, {{primeiro_nome}}! Neste mês a {{otica}} preparou condições especiais para você. Responda esta mensagem para saber mais."],
        ['Pós-venda', 'relacionamento', "Olá, {{primeiro_nome}}! Como está a adaptação com seus novos óculos? Qualquer ajuste, é só chamar a {{otica}}."],
    ];
    foreach ($templates as [$name, $category, $body]) {
        insertRow('message_templates', ['company_id' => $companyId, 'name' => $name, 'category' => $category, 'body' => $body]);
    }
    insertRow('channels', [
        'company_id' => $companyId,
        'type' => 'whatsapp_manual',
        'name' => 'WhatsApp (envio manual)',
        'config' => jsonColumn([]),
        'webhook_token' => bin2hex(random_bytes(16)),
        'is_default' => 1,
    ]);
}

function handleAdminUsers(string $method, array $input): never
{
    requireSuperadmin();
    if ($method === 'GET') {
        $where = 'WHERE 1 = 1';
        $params = [];
        if ($q = query('q')) {
            $where .= ' AND (u.name LIKE ? OR u.email LIKE ?)';
            array_push($params, likeTerm($q), likeTerm($q));
        }
        $result = paginate(
            "SELECT u.id, u.name, u.email, u.phone, u.is_superadmin, u.active, u.last_login_at, u.created_at",
            "FROM users u {$where}",
            $params,
            'u.name ASC',
        );
        $ids = array_column($result['data'], 'id');
        if ($ids) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $links = fetchAllRows(
                "SELECT cu.user_id, cu.company_id, cu.role, cu.active, c.name
                 FROM company_users cu JOIN companies c ON c.id = cu.company_id WHERE cu.user_id IN ({$placeholders})",
                $ids,
            );
            $byUser = [];
            foreach ($links as $link) {
                $byUser[$link['user_id']][] = $link;
            }
            foreach ($result['data'] as &$user) {
                $user['companies'] = $byUser[$user['id']] ?? [];
            }
            unset($user);
        }
        sendJson($result);
    }
    if ($method === 'DELETE') {
        $userId = requireRouteId();
        if ($userId === Context::userId()) {
            sendError('Você não pode desativar o próprio usuário.');
        }
        executeQuery('UPDATE users SET active = 0 WHERE id = ?', [$userId]);
        auditLog('deactivate', 'user', $userId, 'Usuário desativado', null, null);
        sendJson(['ok' => true]);
    }
    $email = mb_strtolower(requiredText($input, 'email', 190, 'e-mail'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendError('E-mail inválido.');
    }
    $values = [
        'name' => requiredText($input, 'name', 120, 'nome'),
        'email' => $email,
        'phone' => optionalText($input, 'phone', 30),
        'is_superadmin' => booleanValue($input, 'is_superadmin'),
        'active' => array_key_exists('active', $input) ? booleanValue($input, 'active') : 1,
    ];
    $password = (string) ($input['password'] ?? '');
    if ($password !== '') {
        if (strlen($password) < 8) {
            sendError('A senha precisa ter pelo menos 8 caracteres.');
        }
        $values['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
    }
    $memberships = is_array($input['companies'] ?? null) ? $input['companies'] : null;

    $userId = inTransaction(static function () use ($method, $values, $memberships): int {
        if ($method === 'PATCH') {
            $userId = requireRouteId();
            $assignments = implode(', ', array_map(static fn($c) => "{$c} = ?", array_keys($values)));
            executeQuery("UPDATE users SET {$assignments} WHERE id = ?", [...array_values($values), $userId]);
        } else {
            if (!isset($values['password_hash'])) {
                sendError('Informe a senha inicial do usuário.');
            }
            $userId = insertRow('users', $values);
        }
        if ($memberships !== null) {
            executeQuery('UPDATE company_users SET active = 0 WHERE user_id = ?', [$userId]);
            foreach ($memberships as $membership) {
                $companyId = validatedInteger($membership['company_id'] ?? 0);
                $role = $membership['role'] ?? 'seller';
                if (!isset(ROLE_LABELS[$role])) {
                    sendError('Papel inválido.');
                }
                linkUserToCompany($userId, $companyId, $role);
            }
        }
        return $userId;
    });
    auditLog($method === 'POST' ? 'create' : 'update', 'user', $userId, 'Usuário ' . $values['email'], null, null);
    sendJson(['ok' => true, 'id' => $userId], $method === 'POST' ? 201 : 200);
}

function handleAdminPlans(string $method, array $input): never
{
    if ($method === 'GET') {
        sendJson(fetchAllRows('SELECT p.*, (SELECT COUNT(*) FROM companies c WHERE c.plan_id = p.id) AS companies FROM plans p ORDER BY p.price'));
    }
    requireSuperadmin();
    $values = [
        'name' => requiredText($input, 'name', 80, 'nome'),
        'price' => moneyValue($input, 'price'),
        'max_users' => (int) ($input['max_users'] ?? 3),
        'max_clients' => (int) ($input['max_clients'] ?? 0),
        'features' => jsonColumn(array_values(array_filter((array) ($input['features'] ?? []), 'is_string'))),
        'active' => array_key_exists('active', $input) ? booleanValue($input, 'active') : 1,
    ];
    if ($method === 'PATCH') {
        $planId = requireRouteId();
        $assignments = implode(', ', array_map(static fn($c) => "{$c} = ?", array_keys($values)));
        executeQuery("UPDATE plans SET {$assignments} WHERE id = ?", [...array_values($values), $planId]);
        auditLog('update', 'plan', $planId, 'Plano ' . $values['name'], null, null);
        sendJson(['ok' => true]);
    }
    if ($method === 'POST') {
        $planId = insertRow('plans', $values);
        auditLog('create', 'plan', $planId, 'Plano ' . $values['name'], null, null);
        sendJson(['ok' => true, 'id' => $planId], 201);
    }
    sendError('Método não permitido.', 405);
}

function handleAdminInvoices(string $method, array $input): never
{
    requireSuperadmin();
    if ($method === 'GET') {
        $where = 'WHERE 1 = 1';
        $params = [];
        if ($companyId = queryInt('company_id')) {
            $where .= ' AND i.company_id = ?';
            $params[] = $companyId;
        }
        if ($status = query('status')) {
            if ($status === 'overdue') {
                $where .= " AND i.status = 'pending' AND i.due_date < CURRENT_DATE";
            } else {
                $where .= ' AND i.status = ?';
                $params[] = $status;
            }
        }
        if ($reference = query('reference')) {
            $where .= ' AND i.reference = ?';
            $params[] = $reference;
        }
        sendJson(
            paginate(
                'SELECT i.*, c.name AS company_name',
                "FROM billing_invoices i JOIN companies c ON c.id = i.company_id {$where}",
                $params,
                'i.due_date DESC, c.name',
            ),
        );
    }
    if ($method === 'POST' && ($input['generate'] ?? false)) {
        // Gera as mensalidades do mês para as óticas ativas que ainda não têm fatura na referência.
        $reference = preg_match('/^\d{4}-\d{2}$/', (string) ($input['reference'] ?? '')) ? $input['reference'] : date('Y-m');
        $created = executeQuery(
            "INSERT IGNORE INTO billing_invoices (company_id, reference, description, amount, due_date)
             SELECT id, ?, CONCAT('Mensalidade ', ?), monthly_fee,
                    STR_TO_DATE(CONCAT(?, '-', LPAD(billing_day, 2, '0')), '%Y-%m-%d')
             FROM companies WHERE status = 'active' AND monthly_fee > 0",
            [$reference, $reference, $reference],
        )->rowCount();
        auditLog('generate', 'invoice', null, "Faturas geradas para {$reference}: {$created}", null, null);
        sendJson(['ok' => true, 'created' => $created]);
    }
    if ($method === 'POST') {
        $companyId = validatedInteger($input['company_id'] ?? 0);
        $invoiceId = insertRow('billing_invoices', [
            'company_id' => $companyId,
            'reference' => preg_match('/^\d{4}-\d{2}$/', (string) ($input['reference'] ?? '')) ? $input['reference'] : date('Y-m'),
            'description' => optionalText($input, 'description', 190) ?: 'Mensalidade',
            'amount' => moneyValue($input, 'amount'),
            'due_date' => requiredDate($input, 'due_date'),
            'notes' => optionalText($input, 'notes', 500),
        ]);
        auditLog('create', 'invoice', $invoiceId, 'Fatura avulsa', null, $companyId);
        sendJson(['ok' => true, 'id' => $invoiceId], 201);
    }
    if ($method === 'PATCH') {
        $invoiceId = requireRouteId();
        $invoice = fetchOne('SELECT * FROM billing_invoices WHERE id = ?', [$invoiceId]) ?? sendError('Fatura não encontrada.', 404);
        $status = enumValue($input, 'status', ['pending', 'paid', 'cancelled'], $invoice['status']);
        executeQuery(
            'UPDATE billing_invoices SET status = ?, paid_at = ?, payment_method = ?, notes = ?, amount = ?, due_date = ? WHERE id = ?',
            [
                $status,
                $status === 'paid' ? (optionalDate($input, 'paid_at') ?? date('Y-m-d')) : null,
                optionalText($input, 'payment_method', 40),
                optionalText($input, 'notes', 500),
                array_key_exists('amount', $input) ? moneyValue($input, 'amount') : $invoice['amount'],
                optionalDate($input, 'due_date') ?? $invoice['due_date'],
                $invoiceId,
            ],
        );
        auditLog($status === 'paid' ? 'invoice_paid' : 'update', 'invoice', $invoiceId, 'Fatura ' . $invoice['reference'], null, (int) $invoice['company_id']);
        sendJson(['ok' => true]);
    }
    sendError('Método não permitido.', 405);
}

function handleAdminAudit(string $method, array $input): never
{
    requireSuperadmin();
    sendJson(auditQuery(queryInt('company_id'), true));
}

function auditQuery(?int $companyId, bool $includeCompany): array
{
    $where = 'WHERE 1 = 1';
    $params = [];
    if ($companyId) {
        $where .= ' AND a.company_id = ?';
        $params[] = $companyId;
    }
    foreach (['action' => 'a.action', 'entity' => 'a.entity'] as $key => $column) {
        if ($value = query($key)) {
            $where .= " AND {$column} = ?";
            $params[] = $value;
        }
    }
    if ($userId = queryInt('user_id')) {
        $where .= ' AND a.user_id = ?';
        $params[] = $userId;
    }
    if ($entityId = queryInt('entity_id')) {
        $where .= ' AND a.entity_id = ?';
        $params[] = $entityId;
    }
    if ($from = normalizeDate(query('from', ''))) {
        $where .= ' AND a.created_at >= ?';
        $params[] = $from;
    }
    if ($to = normalizeDate(query('to', ''))) {
        $where .= ' AND a.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
        $params[] = $to;
    }
    if ($q = query('q')) {
        $where .= ' AND (a.summary LIKE ? OR a.user_name LIKE ?)';
        array_push($params, likeTerm($q), likeTerm($q));
    }
    $select = 'SELECT a.id, a.company_id, a.user_id, a.user_name, a.action, a.entity, a.entity_id, a.summary, a.details, a.ip, a.created_at'
        . ($includeCompany ? ', c.name AS company_name' : '');
    $from = 'FROM audit_logs a' . ($includeCompany ? ' LEFT JOIN companies c ON c.id = a.company_id' : '') . " {$where}";
    $result = paginate($select, $from, $params, 'a.id DESC', 500);
    foreach ($result['data'] as &$row) {
        $row['details'] = decodeJsonColumn($row['details'], null);
    }
    unset($row);
    return $result;
}
