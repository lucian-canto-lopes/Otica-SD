<?php
declare(strict_types=1);

function handleMe(string $method, array $input): never
{
    sendJson(sessionPayload());
}

function handleLogout(string $method, array $input): never
{
    auditLog('logout', 'user', Context::userId(), 'Saída do sistema');
    $_SESSION = [];
    session_destroy();
    sendJson(['ok' => true]);
}

function handleSelectCompany(string $method, array $input): never
{
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $companyId = (int) ($input['company_id'] ?? 0);
    if ($companyId === 0) {
        unset($_SESSION['company_id']);
        Context::$company = null;
        Context::$role = '';
        sendJson(sessionPayload());
    }
    selectCompany(validatedInteger($companyId));
    if (Context::isSuperadmin()) {
        auditLog('enter_company', 'company', $companyId, 'Administrador da plataforma acessou a ótica');
    }
    sendJson(sessionPayload());
}

function handleProfile(string $method, array $input): never
{
    if ($method !== 'PATCH') {
        sendError('Método não permitido.', 405);
    }
    $userId = (int) Context::userId();
    $values = [
        'name' => requiredText($input, 'name', 120, 'nome'),
        'phone' => optionalText($input, 'phone', 30),
    ];
    $newPassword = (string) ($input['new_password'] ?? '');
    if ($newPassword !== '') {
        $current = fetchValue('SELECT password_hash FROM users WHERE id = ?', [$userId]);
        if (!password_verify((string) ($input['current_password'] ?? ''), (string) $current)) {
            sendError('Senha atual incorreta.');
        }
        if (strlen($newPassword) < 8) {
            sendError('A nova senha precisa ter pelo menos 8 caracteres.');
        }
        $values['password_hash'] = password_hash($newPassword, PASSWORD_DEFAULT);
    }
    $assignments = implode(', ', array_map(static fn($c) => "{$c} = ?", array_keys($values)));
    executeQuery("UPDATE users SET {$assignments} WHERE id = ?", [...array_values($values), $userId]);
    auditLog('update', 'user', $userId, $newPassword !== '' ? 'Perfil e senha atualizados' : 'Perfil atualizado');
    sendJson(['ok' => true]);
}

function handleGlobalSearch(string $method, array $input): never
{
    $companyId = Context::companyId();
    $term = query('q', '');
    if (mb_strlen($term) < 2) {
        sendJson([]);
    }
    $like = likeTerm($term);
    $digits = onlyDigits($term);
    $results = [];
    foreach (
        fetchAllRows(
            "SELECT id, name, whatsapp, phone, cpf FROM clients
             WHERE company_id = ? AND deleted_at IS NULL
               AND (name LIKE ? OR nickname LIKE ? OR (? <> '' AND (whatsapp LIKE ? OR phone LIKE ? OR cpf LIKE ?)))
             ORDER BY name LIMIT 8",
            [$companyId, $like, $like, $digits, "%{$digits}%", "%{$digits}%", "%{$digits}%"],
        )
        as $row
    ) {
        $results[] = ['type' => 'client', 'id' => $row['id'], 'title' => $row['name'], 'subtitle' => $row['whatsapp'] ?: $row['phone']];
    }
    if (ctype_digit($term)) {
        foreach (fetchAllRows('SELECT id, number, total FROM sales WHERE company_id = ? AND number = ?', [$companyId, (int) $term]) as $row) {
            $results[] = ['type' => 'sale', 'id' => $row['id'], 'title' => 'Venda nº ' . $row['number'], 'subtitle' => money($row['total'])];
        }
        foreach (fetchAllRows('SELECT id, number, status FROM service_orders WHERE company_id = ? AND number = ?', [$companyId, (int) $term]) as $row) {
            $results[] = ['type' => 'service_order', 'id' => $row['id'], 'title' => 'OS nº ' . $row['number'], 'subtitle' => $row['status']];
        }
        foreach (fetchAllRows('SELECT id, number, total FROM quotes WHERE company_id = ? AND number = ?', [$companyId, (int) $term]) as $row) {
            $results[] = ['type' => 'quote', 'id' => $row['id'], 'title' => 'Orçamento nº ' . $row['number'], 'subtitle' => money($row['total'])];
        }
    }
    foreach (
        fetchAllRows(
            'SELECT id, name, sku, price FROM products WHERE company_id = ? AND active = 1 AND (name LIKE ? OR sku LIKE ? OR barcode = ?) ORDER BY name LIMIT 5',
            [$companyId, $like, $like, $term],
        )
        as $row
    ) {
        $results[] = ['type' => 'product', 'id' => $row['id'], 'title' => $row['name'], 'subtitle' => money($row['price'])];
    }
    sendJson($results);
}
