<?php
declare(strict_types=1);

function handleCompanySettings(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        $company = publicCompany(fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]));
        $company['plan'] = $company['plan_id'] ? fetchOne('SELECT name, price FROM plans WHERE id = ?', [$company['plan_id']]) : null;
        $company['invoices'] = fetchAllRows(
            'SELECT reference, description, amount, due_date, status, paid_at FROM billing_invoices WHERE company_id = ? ORDER BY due_date DESC LIMIT 12',
            [$companyId],
        );
        sendJson($company);
    }
    if ($method !== 'PATCH') {
        sendError('Método não permitido.', 405);
    }
    requirePermission('manage');
    $before = fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]);
    $values = [
        'name' => requiredText($input, 'name', 150, 'razão social'),
        'trade_name' => optionalText($input, 'trade_name', 150),
        'document' => optionalText($input, 'document', 30),
        'fiscal_ie' => optionalText($input, 'fiscal_ie', 30),
        'fiscal_city_code' => optionalFiscalCode($input, 'fiscal_city_code', 7, 7, 'Código IBGE do município da ótica'),
        'fiscal_crt' => optionalText($input, 'fiscal_crt', 1),
        'phone' => optionalText($input, 'phone', 30),
        'whatsapp' => optionalText($input, 'whatsapp', 30),
        'email' => optionalEmail($input),
        'instagram' => optionalText($input, 'instagram', 80),
        'zip' => optionalText($input, 'zip', 10),
        'address' => optionalText($input, 'address', 190),
        'number' => optionalText($input, 'number', 20),
        'neighborhood' => optionalText($input, 'neighborhood', 100),
        'city' => optionalText($input, 'city', 100),
        'state' => strtoupper(optionalText($input, 'state', 2)),
        'primary_color' => preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($input['primary_color'] ?? '')) ? $input['primary_color'] : $before['primary_color'],
        'next_sale_number' => validatedInteger($input['next_sale_number'] ?? $before['next_sale_number']),
        'next_order_number' => validatedInteger($input['next_order_number'] ?? $before['next_order_number']),
        'next_quote_number' => validatedInteger($input['next_quote_number'] ?? $before['next_quote_number']),
    ];
    if ($values['fiscal_crt'] !== '' && !in_array($values['fiscal_crt'], ['1', '2', '3', '4'], true)) {
        sendError('Informe um código CRT de 1 a 4.');
    }
    $settings = decodeJsonColumn($before['settings'], []);
    if (is_array($input['settings'] ?? null)) {
        foreach (['default_ddd', 'sale_terms', 'order_terms', 'quote_validity_days', 'prescription_validity_months', 'renewal_months', 'pdf_footer'] as $key) {
            if (array_key_exists($key, $input['settings'])) {
                $settings[$key] = is_scalar($input['settings'][$key]) ? mb_substr((string) $input['settings'][$key], 0, 1000) : '';
            }
        }
    }
    $values['settings'] = jsonColumn($settings);
    $assignments = implode(', ', array_map(static fn($c) => "{$c} = ?", array_keys($values)));
    executeQuery("UPDATE companies SET {$assignments} WHERE id = ?", [...array_values($values), $companyId]);
    auditLog('update', 'company', $companyId, 'Configurações da ótica atualizadas', changedFields($before, $values));
    sendJson(['ok' => true]);
}

function companySetting(string $key, $default = null)
{
    $settings = decodeJsonColumn(Context::$company['settings'] ?? null, []);
    return $settings[$key] ?? $default;
}

function handleCompanyLogo(string $method, array $input): never
{
    requirePermission('manage');
    $companyId = Context::companyId();
    if ($method === 'DELETE') {
        executeQuery('UPDATE companies SET logo_path = NULL WHERE id = ?', [$companyId]);
        auditLog('update', 'company', $companyId, 'Logo removido');
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST' || empty($_FILES['file'])) {
        sendError('Envie a imagem do logo.');
    }
    [$path, $mime] = storeUploadedFile($_FILES['file'], "company_{$companyId}/branding");
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        @unlink(storagePath($path));
        sendError('Use uma imagem JPG, PNG ou WEBP.');
    }
    executeQuery('UPDATE companies SET logo_path = ? WHERE id = ?', [$path, $companyId]);
    auditLog('update', 'company', $companyId, 'Logo atualizado');
    sendJson(['ok' => true]);
}

/** O logo é público para aparecer na tela de seleção e em documentos impressos. */
function handlePublicLogo(): never
{
    $companyId = (int) ($_GET['company'] ?? 0);
    $path = $companyId ? fetchValue('SELECT logo_path FROM companies WHERE id = ?', [$companyId]) : null;
    if (!$path) {
        sendError('Logo não encontrado.', 404);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file(storagePath($path)) ?: 'image/png';
    streamFile($path, $mime, 'logo', true);
}

function handleTeam(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        sendJson(
            fetchAllRows(
                'SELECT u.id, u.name, u.email, u.phone, u.last_login_at, cu.role, cu.active,
                        CASE WHEN cu.role = "owner" THEN COALESCE(p.max_users, 2) + c.extra_user_slots + c.extra_screen_slots ELSE cu.concurrent_screens END AS concurrent_screens,
                        (SELECT COUNT(*) FROM user_sessions us WHERE us.company_id = cu.company_id AND us.user_id = cu.user_id AND us.expires_at > NOW()) AS active_screens
                 FROM company_users cu JOIN users u ON u.id = cu.user_id
                 JOIN companies c ON c.id = cu.company_id LEFT JOIN plans p ON p.id = c.plan_id
                 WHERE cu.company_id = ? AND u.is_superadmin = 0 ORDER BY cu.active DESC, u.name',
                [$companyId],
            ),
        );
    }
    requirePermission('manage');
    if ($method === 'DELETE') {
        $userId = requireRouteId();
        if ($userId === Context::userId()) {
            sendError('Você não pode remover o próprio acesso.');
        }
        inTransaction(static function () use ($companyId, $userId): void {
            executeQuery('SELECT id FROM companies WHERE id = ? FOR UPDATE', [$companyId]);
            executeQuery('UPDATE company_users SET active = 0, session_generation = session_generation + 1 WHERE company_id = ? AND user_id = ?', [$companyId, $userId]);
            executeQuery('DELETE FROM user_sessions WHERE company_id = ? AND user_id = ?', [$companyId, $userId]);
        });
        auditLog('revoke_access', 'user', $userId, 'Acesso à ótica removido');
        sendJson(['ok' => true]);
    }
    $role = enumValue($input, 'role', array_keys(ROLE_LABELS), 'seller');
    if ($role === 'owner' && Context::$role !== 'owner' && !Context::isSuperadmin()) {
        sendError('Somente o proprietário pode conceder o papel de proprietário.', 403);
    }
    if ($method === 'PATCH') {
        $userId = requireRouteId();
        if (!empty($input['end_sessions'])) {
            inTransaction(static function () use ($companyId, $userId): void {
                executeQuery('SELECT id FROM companies WHERE id = ? FOR UPDATE', [$companyId]);
                executeQuery('UPDATE company_users SET session_generation = session_generation + 1 WHERE company_id = ? AND user_id = ?', [$companyId, $userId]);
                executeQuery('DELETE FROM user_sessions WHERE company_id = ? AND user_id = ?', [$companyId, $userId]);
            });
            auditLog('end_sessions', 'user', $userId, 'Sessões encerradas pelo administrador da ótica');
            sendJson(['ok' => true]);
        }
        if (array_key_exists('concurrent_screens', $input)) {
            $screens = max(1, min(20, (int) $input['concurrent_screens']));
            inTransaction(static function () use ($screens, $companyId, $userId): void {
                $pool = (int) fetchValue('SELECT extra_screen_slots FROM companies WHERE id = ? FOR UPDATE', [$companyId]);
                $membership = fetchOne('SELECT role, active, concurrent_screens FROM company_users WHERE company_id = ? AND user_id = ? FOR UPDATE', [$companyId, $userId]);
                if (!$membership) sendError('Funcionário não encontrado nesta ótica.', 404);
                if (!(int) $membership['active']) sendError('Reative o acesso antes de atribuir telas.', 409);
                if ($membership['role'] === 'owner') sendError('O proprietário usa as telas livres da ótica automaticamente.', 409);
                $assigned = (int) fetchValue('SELECT COALESCE(SUM(GREATEST(concurrent_screens - 1, 0)), 0) FROM company_users WHERE company_id = ? AND active = 1 AND role <> "owner"', [$companyId]);
                $newAssigned = $assigned - max(0, (int) $membership['concurrent_screens'] - 1) + max(0, $screens - 1);
                if ($newAssigned > $pool) sendError('A ótica não possui telas extras suficientes. Aumente primeiro o limite compartilhado da ótica.', 409, ['code' => 'screen_pool_limit']);
                $active = (int) fetchValue('SELECT COUNT(*) FROM user_sessions WHERE company_id = ? AND user_id = ? AND expires_at > NOW()', [$companyId, $userId]);
                if ($screens < $active) sendError("Este usuário possui {$active} sessão(ões) ativa(s); encerre alguma antes de reduzir o limite.", 409);
                executeQuery('UPDATE company_users SET concurrent_screens = ? WHERE company_id = ? AND user_id = ?', [$screens, $companyId, $userId]);
            });
            auditLog('update_screens', 'user', $userId, "Limite de telas alterado para {$screens}");
            sendJson(['ok' => true]);
        }
        inTransaction(static function () use ($companyId, $userId, $role, $input): void {
            $capacity = fetchOne(
                'SELECT c.extra_user_slots, COALESCE(p.max_users, 2) AS included_users
                 FROM companies c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = ? FOR UPDATE',
                [$companyId],
            );
            $membership = fetchOne('SELECT role, active, concurrent_screens FROM company_users WHERE company_id = ? AND user_id = ? FOR UPDATE', [$companyId, $userId]);
            if (!$membership) sendError('Funcionário não encontrado nesta ótica.', 404);
            $active = array_key_exists('active', $input) ? booleanValue($input, 'active') : (int) $membership['active'];
            if ($active && !(int) $membership['active']) {
                $used = (int) fetchValue('SELECT COUNT(*) FROM company_users WHERE company_id = ? AND active = 1', [$companyId]);
                if ($used >= (int) $capacity['included_users'] + (int) $capacity['extra_user_slots']) {
                    sendError('O limite de usuários desta ótica foi atingido. Aumente as vagas extras antes de reativar.', 409, ['code' => 'user_limit']);
                }
            }
            $screens = (int) $membership['concurrent_screens'];
            if ($membership['role'] !== $role && ($membership['role'] === 'owner' || $role === 'owner')) {
                if ($role !== 'owner') {
                    $open = (int) fetchValue('SELECT COUNT(*) FROM user_sessions WHERE company_id = ? AND user_id = ? AND expires_at > NOW()', [$companyId, $userId]);
                    if ($open > 1) sendError('Encerre as telas extras antes de mudar o papel do proprietário.', 409);
                }
                $screens = 1;
            }
            executeQuery('UPDATE company_users SET role = ?, active = ?, concurrent_screens = ?, session_generation = session_generation + ? WHERE company_id = ? AND user_id = ?',
                [$role, $active, $screens, $active ? 0 : 1, $companyId, $userId]);
            if (!$active) executeQuery('DELETE FROM user_sessions WHERE company_id = ? AND user_id = ?', [$companyId, $userId]);
        });
        auditLog('update_access', 'user', $userId, 'Papel alterado para ' . ROLE_LABELS[$role]);
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $email = mb_strtolower(requiredText($input, 'email', 190, 'e-mail'));
    $userId = inTransaction(static function () use ($email, $input, $companyId, $role): int {
        $capacity = fetchOne(
            'SELECT COALESCE(p.max_users, 2) AS included_users, c.extra_user_slots
             FROM companies c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = ? FOR UPDATE',
            [$companyId],
        );
        $alreadyActive = (int) fetchValue(
            'SELECT COUNT(*) FROM company_users cu JOIN users u ON u.id = cu.user_id
             WHERE cu.company_id = ? AND cu.active = 1 AND u.email = ?',
            [$companyId, $email],
        );
        $used = (int) fetchValue('SELECT COUNT(*) FROM company_users WHERE company_id = ? AND active = 1', [$companyId]);
        if (!$alreadyActive && $used >= (int) $capacity['included_users'] + (int) $capacity['extra_user_slots']) {
            sendError('O limite de usuários desta ótica foi atingido. Aumente as vagas extras para adicionar outro funcionário.', 409, ['code' => 'user_limit']);
        }
        $userId = findOrCreateUser($email, (string) ($input['name'] ?? ''), (string) ($input['password'] ?? ''));
        linkUserToCompany($userId, $companyId, $role);
        return $userId;
    });
    auditLog('grant_access', 'user', $userId, "Usuário {$email} adicionado como " . ROLE_LABELS[$role]);
    sendJson(['ok' => true, 'id' => $userId], 201);
}

function handleTeamSeats(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        $capacity = fetchOne(
            'SELECT c.extra_user_slots, c.extra_screen_slots, COALESCE(p.max_users, 2) AS included_users,
                    COALESCE(p.extra_user_price, 0) AS extra_user_price,
                    COALESCE(p.extra_screen_price, 0) AS extra_screen_price,
                    (SELECT COUNT(*) FROM company_users cu WHERE cu.company_id = c.id AND cu.active = 1) AS active_users,
                    (SELECT COALESCE(SUM(GREATEST(cu.concurrent_screens - 1, 0)), 0) FROM company_users cu WHERE cu.company_id = c.id AND cu.active = 1 AND cu.role <> "owner") AS assigned_extra_screens,
                    (SELECT COUNT(*) FROM user_sessions us WHERE us.company_id = c.id AND us.expires_at > NOW()) AS active_screens
             FROM companies c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = ?',
            [$companyId],
        );
        sendJson($capacity ?: []);
    }
    if ($method !== 'PATCH') sendError('Método não permitido.', 405);
    requirePermission('manage');
    $users = max(0, min(500, (int) ($input['extra_user_slots'] ?? 0)));
    $screens = max(0, min(500, (int) ($input['extra_screen_slots'] ?? 0)));
    $monthly = inTransaction(static function () use ($companyId, $users, $screens): float {
        $current = fetchOne(
            'SELECT c.extra_user_slots, c.extra_screen_slots, COALESCE(p.max_users, 2) AS included_users,
                    p.extra_user_price, p.extra_screen_price
             FROM companies c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = ? FOR UPDATE',
            [$companyId],
        );
        $activeUsers = (int) fetchValue('SELECT COUNT(*) FROM company_users WHERE company_id = ? AND active = 1', [$companyId]);
        $assignedScreens = (int) fetchValue('SELECT COALESCE(SUM(GREATEST(concurrent_screens - 1, 0)), 0) FROM company_users WHERE company_id = ? AND active = 1 AND role <> "owner"', [$companyId]);
        $activeScreens = (int) fetchValue('SELECT COUNT(*) FROM user_sessions WHERE company_id = ? AND expires_at > NOW()', [$companyId]);
        if ($users + (int) $current['included_users'] < $activeUsers) sendError('Mantenha vagas suficientes para todos os funcionários ativos.', 409);
        if ($screens < $assignedScreens) sendError('Reduza as telas atribuídas aos funcionários antes de diminuir o limite da ótica.', 409);
        if ($users + (int) $current['included_users'] + $screens < $activeScreens) sendError('Encerre telas em uso antes de diminuir a capacidade da ótica.', 409);
        executeQuery('UPDATE companies SET extra_user_slots = ?, extra_screen_slots = ? WHERE id = ?', [$users, $screens, $companyId]);
        return (float) ($current['extra_user_price'] ?? 0) * $users + (float) ($current['extra_screen_price'] ?? 0) * $screens;
    });
    auditLog('update_capacity', 'company', $companyId, "Vagas extras: {$users}; telas extras: {$screens}");
    sendJson(['ok' => true, 'estimated_extra_monthly' => $monthly]);
}

function handleTags(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        sendJson(
            fetchAllRows(
                'SELECT t.id, t.name, t.color, (SELECT COUNT(*) FROM client_tags ct WHERE ct.tag_id = t.id) AS clients
                 FROM tags t WHERE t.company_id = ? ORDER BY t.name',
                [$companyId],
            ),
        );
    }
    requirePermission('sell');
    if ($method === 'DELETE') {
        $tag = requireCompanyRecord('tags', requireRouteId(), $companyId, 'Etiqueta');
        executeQuery('DELETE FROM tags WHERE id = ? AND company_id = ?', [$tag['id'], $companyId]);
        auditLog('delete', 'tag', (int) $tag['id'], 'Etiqueta excluída: ' . $tag['name']);
        sendJson(['ok' => true]);
    }
    $values = [
        'name' => requiredText($input, 'name', 60, 'nome'),
        'color' => preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($input['color'] ?? '')) ? $input['color'] : '#6366f1',
    ];
    if ($method === 'PATCH') {
        $tag = requireCompanyRecord('tags', requireRouteId(), $companyId, 'Etiqueta');
        updateRow('tags', (int) $tag['id'], $companyId, $values);
        sendJson(['ok' => true]);
    }
    $tagId = insertRow('tags', ['company_id' => $companyId, ...$values]);
    auditLog('create', 'tag', $tagId, 'Etiqueta criada: ' . $values['name']);
    sendJson(['ok' => true, 'id' => $tagId], 201);
}

/** Garante a etiqueta pelo nome (usado em importações e automações). */
function ensureTag(int $companyId, string $name): int
{
    $name = mb_substr(trim($name), 0, 60);
    $id = fetchValue('SELECT id FROM tags WHERE company_id = ? AND name = ?', [$companyId, $name]);
    if ($id) {
        return (int) $id;
    }
    return insertRow('tags', ['company_id' => $companyId, 'name' => $name, 'color' => '#6366f1']);
}

function handleLossReasons(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        sendJson(
            fetchAllRows(
                'SELECT r.id, r.name, r.active,
                        (SELECT COUNT(*) FROM lost_opportunities l WHERE l.reason_id = r.id) AS uses
                 FROM loss_reasons r WHERE r.company_id = ? ORDER BY r.active DESC, r.name',
                [$companyId],
            ),
        );
    }
    requirePermission('manage');
    if ($method === 'DELETE') {
        $reason = requireCompanyRecord('loss_reasons', requireRouteId(), $companyId, 'Motivo');
        executeQuery('UPDATE loss_reasons SET active = 0 WHERE id = ? AND company_id = ?', [$reason['id'], $companyId]);
        sendJson(['ok' => true]);
    }
    $values = ['name' => requiredText($input, 'name', 120, 'motivo'), 'active' => array_key_exists('active', $input) ? booleanValue($input, 'active') : 1];
    if ($method === 'PATCH') {
        $reason = requireCompanyRecord('loss_reasons', requireRouteId(), $companyId, 'Motivo');
        updateRow('loss_reasons', (int) $reason['id'], $companyId, $values);
        sendJson(['ok' => true]);
    }
    $id = insertRow('loss_reasons', ['company_id' => $companyId, ...$values]);
    auditLog('create', 'loss_reason', $id, 'Motivo de perda: ' . $values['name']);
    sendJson(['ok' => true, 'id' => $id], 201);
}

function handleAudit(string $method, array $input): never
{
    requirePermission('manage');
    sendJson(auditQuery(Context::companyId(), false));
}
