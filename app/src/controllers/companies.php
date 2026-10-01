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
