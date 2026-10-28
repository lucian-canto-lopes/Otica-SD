<?php
declare(strict_types=1);

function handleCompanies(string $method, array $input, bool $isPlatformAdmin): never
{
    if (!$isPlatformAdmin) {
        sendError('Acesso restrito ao administrador geral.', 403);
    }
    if ($method === 'GET') {
        sendJson(
            executeQuery(
                <<<'SQL'
                SELECT
                  id,
                  name,
                  document,
                  plan,
                  status
                FROM
                  companies
                ORDER BY
                  id DESC
                SQL
                ,
            )->fetchAll(),
        );
    }
    if ($method === 'DELETE') {
        $companyId = validatedInteger($input['id'] ?? 0);
        database()->beginTransaction();
        $company = executeQuery('SELECT id, name FROM companies WHERE id = ? FOR UPDATE', [
            $companyId,
        ])->fetch();
        if (!$company) {
            database()->rollBack();
            sendError('Ótica não encontrada.', 404);
        }

        // A ordem respeita as referências entre os registros da ótica.
        executeQuery('DELETE FROM order_events WHERE company_id = ?', [$companyId]);
        executeQuery('DELETE FROM sale_items WHERE company_id = ?', [$companyId]);
        executeQuery('DELETE FROM interactions WHERE company_id = ?', [$companyId]);
        executeQuery('DELETE FROM reminders WHERE company_id = ?', [$companyId]);
        executeQuery('DELETE FROM orders WHERE company_id = ?', [$companyId]);
        executeQuery('DELETE FROM sales WHERE company_id = ?', [$companyId]);
        executeQuery('DELETE FROM products WHERE company_id = ?', [$companyId]);
        executeQuery('DELETE FROM partners WHERE company_id = ?', [$companyId]);
        executeQuery('DELETE FROM clients WHERE company_id = ?', [$companyId]);
        executeQuery('DELETE FROM users WHERE company_id = ?', [$companyId]);
        executeQuery('DELETE FROM companies WHERE id = ?', [$companyId]);
        database()->commit();
        sendJson(['ok' => true, 'name' => $company['name']]);
    }
    $status = $input['status'] ?? 'trial';
    if (!in_array($status, ['trial', 'active', 'blocked'], true)) {
        sendError('Status inválido.');
    }
    if ($method === 'PATCH') {
        executeQuery(
            <<<'SQL'
            UPDATE companies
            SET
              status = ?
            WHERE
              id = ?
            SQL
            ,
            [$status, validatedInteger($input['id'] ?? 0)],
        );
        sendJson(['ok' => true]);
    }
    $name = requiredText($input, 'name');
    $email = requiredText($input, 'email', 190);
    $password = requiredText($input, 'password', 72);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
        sendError('Informe e-mail válido e senha com pelo menos 8 caracteres.');
    }
    database()->beginTransaction();
    executeQuery(
        <<<'SQL'
        INSERT INTO
          companies (name, document, plan, status)
        VALUES
          (?, ?, ?, ?)
        SQL
        ,
        [$name, substr($input['document'] ?? '', 0, 30), requiredText($input, 'plan', 40), $status],
    );
    $id = database()->lastInsertId();
    executeQuery(
        <<<'SQL'
        INSERT INTO
          users (company_id, name, email, password_hash, role)
        VALUES
          (?, ?, ?, ?, ?)
        SQL
        ,
        [$id, $name, $email, password_hash($password, PASSWORD_DEFAULT), 'company_admin'],
    );
    database()->commit();
    sendJson(['ok' => true], 201);
}
