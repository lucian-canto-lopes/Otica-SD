<?php
declare(strict_types=1);

require __DIR__ . '/config/database.php';

// INSERT IGNORE preserva as contas existentes quando o contêiner reinicia.

$demoUsers = [
    [null, 'Administrador geral', 'admin@sistema.test', 'admin123', 'platform_admin'],
    [1, 'Ana Silva', 'dono@otica.test', 'otica123', 'company_admin'],
    [2, 'Bruno Costa', 'dono@segunda.test', 'otica123', 'company_admin'],
];

foreach ($demoUsers as [$companyId, $name, $email, $password, $role]) {
    executeQuery(
        'INSERT IGNORE INTO users(company_id,name,email,password_hash,role) VALUES(?,?,?,?,?)',
        [$companyId, $name, $email, password_hash($password, PASSWORD_DEFAULT), $role],
    );
}
