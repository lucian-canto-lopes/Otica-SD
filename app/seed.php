<?php
declare(strict_types=1);

require __DIR__ . '/config/database.php';

// INSERT IGNORE preserva as contas existentes quando o contêiner reinicia.
// Atualiza volumes criados antes do recurso de identidade visual.
$logoColumnExists = (bool) executeQuery(
    <<<'SQL'
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'companies'
      AND column_name = 'logo_data'
    SQL
    ,
)->fetchColumn();

if (!$logoColumnExists) {
    executeQuery('ALTER TABLE companies ADD COLUMN logo_data MEDIUMTEXT NULL');
}

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
