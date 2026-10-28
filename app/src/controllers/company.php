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
                'SELECT u.id, u.name, u.email, u.phone, u.last_login_at, cu.role, cu.active
                 FROM company_users cu JOIN users u ON u.id = cu.user_id
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
        executeQuery('UPDATE company_users SET active = 0 WHERE company_id = ? AND user_id = ?', [$companyId, $userId]);
        auditLog('revoke_access', 'user', $userId, 'Acesso à ótica removido');
        sendJson(['ok' => true]);
    }
    $role = enumValue($input, 'role', array_keys(ROLE_LABELS), 'seller');
    if ($role === 'owner' && Context::$role !== 'owner' && !Context::isSuperadmin()) {
        sendError('Somente o proprietário pode conceder o papel de proprietário.', 403);
    }
    if ($method === 'PATCH') {
        $userId = requireRouteId();
        executeQuery(
            'UPDATE company_users SET role = ?, active = ? WHERE company_id = ? AND user_id = ?',
            [$role, array_key_exists('active', $input) ? booleanValue($input, 'active') : 1, $companyId, $userId],
        );
        auditLog('update_access', 'user', $userId, 'Papel alterado para ' . ROLE_LABELS[$role]);
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $email = mb_strtolower(requiredText($input, 'email', 190, 'e-mail'));
    $userId = inTransaction(static function () use ($email, $input, $companyId, $role): int {
        $userId = findOrCreateUser($email, (string) ($input['name'] ?? ''), (string) ($input['password'] ?? ''));
        linkUserToCompany($userId, $companyId, $role);
        return $userId;
    });
    auditLog('grant_access', 'user', $userId, "Usuário {$email} adicionado como " . ROLE_LABELS[$role]);
    sendJson(['ok' => true, 'id' => $userId], 201);
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
