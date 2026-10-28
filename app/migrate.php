<?php
declare(strict_types=1);

/*
 * Prepara o banco: cria o schema (se necessário), aplica as migrações pendentes e garante
 * os cadastros mínimos (planos e administrador da plataforma).
 * Uso: php app/migrate.php
 */

require __DIR__ . '/src/bootstrap.php';

function out(string $message): void
{
    fwrite(STDOUT, $message . PHP_EOL);
}

// Cria o banco quando ele ainda não existe (instalações locais como o XAMPP).
try {
    database();
} catch (PDOException $exception) {
    if ($exception->getCode() !== 1049 && !str_contains($exception->getMessage(), 'Unknown database')) {
        throw $exception;
    }
    $server = new PDO(
        sprintf('mysql:host=%s;port=%s;charset=utf8mb4', appConfig('DB_HOST'), appConfig('DB_PORT')),
        appConfig('DB_USER'),
        appConfig('DB_PASS'),
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
    );
    $server->exec('CREATE DATABASE `' . str_replace('`', '', appConfig('DB_NAME')) . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    out('Banco ' . appConfig('DB_NAME') . ' criado.');
}

function tableExists(string $table): bool
{
    return (bool) fetchValue(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
        [$table],
    );
}

function columnExists(string $table, string $column): bool
{
    return (bool) fetchValue(
        'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
        [$table, $column],
    );
}

// Bancos da versão 1 são preservados com o prefixo v1_ antes da criação do novo esquema.
if (!tableExists('schema_migrations') && tableExists('clients') && !columnExists('clients', 'legacy_id')) {
    database()->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach (['order_events', 'orders', 'reminders', 'interactions', 'sale_items', 'sales', 'products', 'partners', 'clients', 'users', 'companies'] as $table) {
        if (tableExists($table)) {
            database()->exec("RENAME TABLE `{$table}` TO `v1_{$table}`");
        }
    }
    database()->exec('SET FOREIGN_KEY_CHECKS = 1');
    out('Tabelas da versão 1 preservadas com o prefixo v1_.');
}

database()->exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (
       version VARCHAR(100) PRIMARY KEY,
       applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
);
$applied = array_column(fetchAllRows('SELECT version FROM schema_migrations'), 'version');
$files = glob(__DIR__ . '/database/migrations/*.sql');
sort($files);
// MySQL 5.6 / MariaDB 10.1: índices utf8mb4 acima de 767 bytes só funcionam com ROW_FORMAT=DYNAMIC
// (exige innodb_large_prefix, ligado nas hospedagens com Barracuda). A partir do 5.7 o padrão já é DYNAMIC.
$serverVersion = (string) fetchValue('SELECT VERSION()');
$legacyServer = !str_contains(strtolower($serverVersion), 'mariadb') && version_compare($serverVersion, '5.7', '<');
foreach ($files as $file) {
    $version = basename($file, '.sql');
    if (in_array($version, $applied, true)) {
        continue;
    }
    $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
    foreach (array_filter(array_map('trim', preg_split('/;\s*\n/', $sql))) as $statement) {
        if ($legacyServer && preg_match('/^CREATE TABLE/i', $statement) && !stripos($statement, 'ROW_FORMAT')) {
            $statement .= ' ROW_FORMAT=DYNAMIC';
        }
        database()->exec($statement);
    }
    executeQuery('INSERT INTO schema_migrations (version) VALUES (?)', [$version]);
    out("Migração aplicada: {$version}");
}

if (!fetchValue('SELECT COUNT(*) FROM plans')) {
    foreach ([
        ['Essencial', 89.90, 3, 3000, ['Clientes, vendas e OS', 'Pedidos em PDF', 'WhatsApp manual']],
        ['Profissional', 169.90, 8, 15000, ['Tudo do Essencial', 'Campanhas e automações', 'API do WhatsApp', 'Relatórios flexíveis']],
        ['Rede', 349.90, 30, 0, ['Tudo do Profissional', 'Várias lojas', 'Integrações e webhooks', 'Suporte prioritário']],
    ] as [$name, $price, $users, $clients, $features]) {
        insertRow('plans', ['name' => $name, 'price' => $price, 'max_users' => $users, 'max_clients' => $clients, 'features' => jsonColumn($features)]);
    }
    out('Planos padrão cadastrados.');
}

if (!fetchValue('SELECT COUNT(*) FROM users WHERE is_superadmin = 1')) {
    $email = getenv('ADMIN_EMAIL') ?: 'admin@ocular.local';
    $password = getenv('ADMIN_PASSWORD') ?: 'admin123';
    insertRow('users', [
        'name' => 'Administrador da plataforma',
        'email' => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'is_superadmin' => 1,
    ]);
    out("Administrador da plataforma criado: {$email}" . (getenv('ADMIN_PASSWORD') ? '' : ' / senha inicial admin123 (altere após o primeiro acesso)'));
}

ensureDirectory(storagePath());
// Proteção extra caso a pasta de arquivos fique dentro da raiz pública do Apache.
file_put_contents(storagePath('.htaccess'), "Require all denied\n");
out('Banco pronto (versão ' . APP_VERSION . ').');
