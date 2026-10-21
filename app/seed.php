<?php
declare(strict_types=1);

require __DIR__ . '/config/database.php';

function columnExists(string $table, string $column): bool
{
    return (bool) executeQuery(
        <<<'SQL'
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?
        SQL
        ,
        [$table, $column],
    )->fetchColumn();
}

function addColumn(string $table, string $column, string $definition): void
{
    if (!columnExists($table, $column)) {
        executeQuery("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
    }
}

function foreignKeyExists(string $table, string $constraint): bool
{
    return (bool) executeQuery(
        <<<'SQL'
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE()
          AND table_name = ?
          AND constraint_name = ?
          AND constraint_type = 'FOREIGN KEY'
        SQL
        ,
        [$table, $constraint],
    )->fetchColumn();
}

function indexExists(string $table, string $index): bool
{
    return (bool) executeQuery(
        <<<'SQL'
        SELECT 1
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND index_name = ?
        SQL
        ,
        [$table, $index],
    )->fetchColumn();
}

// As migrações simples preservam os dados de volumes criados por versões anteriores.
addColumn('companies', 'logo_data', 'MEDIUMTEXT NULL');
addColumn('clients', 'email', "VARCHAR(190) NOT NULL DEFAULT ''");
addColumn('clients', 'birth_date', 'DATE NULL');
addColumn('clients', 'next_contact_date', 'DATE NULL');

executeQuery(
    <<<'SQL'
    CREATE TABLE IF NOT EXISTS partners (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      type ENUM('supplier', 'laboratory') NOT NULL,
      document VARCHAR(30) NOT NULL DEFAULT '',
      phone VARCHAR(30) NOT NULL DEFAULT '',
      email VARCHAR(190) NOT NULL DEFAULT '',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_partners_company FOREIGN KEY (company_id) REFERENCES companies (id)
    )
    SQL
    ,
);

addColumn('products', 'supplier_id', 'INT NULL');
if (!foreignKeyExists('products', 'fk_products_supplier')) {
    executeQuery(
        'ALTER TABLE products ADD CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES partners(id)',
    );
}

addColumn('orders', 'laboratory_id', 'INT NULL');
if (!foreignKeyExists('orders', 'fk_orders_laboratory')) {
    executeQuery(
        'ALTER TABLE orders ADD CONSTRAINT fk_orders_laboratory FOREIGN KEY (laboratory_id) REFERENCES partners(id)',
    );
}

$orderStatusType = (string) executeQuery(
    <<<'SQL'
    SELECT column_type
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'orders'
      AND column_name = 'status'
    SQL
    ,
)->fetchColumn();
if (!str_contains($orderStatusType, 'sent_to_lab')) {
    executeQuery(
        <<<'SQL'
        ALTER TABLE orders
        MODIFY COLUMN status ENUM(
          'received',
          'production',
          'sent_to_lab',
          'lab_production',
          'received_from_lab',
          'ready',
          'delivered'
        ) NOT NULL DEFAULT 'received'
        SQL
        ,
    );
    executeQuery("UPDATE orders SET status = 'lab_production' WHERE status = 'production'");
}

executeQuery(
    <<<'SQL'
    CREATE TABLE IF NOT EXISTS order_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      order_id INT NOT NULL,
      status VARCHAR(40) NOT NULL,
      notes VARCHAR(500) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_order_events_company FOREIGN KEY (company_id) REFERENCES companies (id),
      CONSTRAINT fk_order_events_order FOREIGN KEY (order_id) REFERENCES orders (id)
    )
    SQL
    ,
);
executeQuery(
    <<<'SQL'
    INSERT INTO order_events (company_id, order_id, status, notes)
    SELECT
      o.company_id,
      o.id,
      o.status,
      'Histórico iniciado durante a atualização do sistema.'
    FROM orders o
    LEFT JOIN order_events event ON event.order_id = o.id
    WHERE event.id IS NULL
    SQL
    ,
);

executeQuery(
    <<<'SQL'
    CREATE TABLE IF NOT EXISTS interactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      client_id INT NOT NULL,
      type ENUM('whatsapp', 'phone', 'visit', 'email', 'other') NOT NULL DEFAULT 'other',
      subject VARCHAR(120) NOT NULL,
      notes TEXT,
      contact_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_interactions_company FOREIGN KEY (company_id) REFERENCES companies (id),
      CONSTRAINT fk_interactions_client FOREIGN KEY (client_id) REFERENCES clients (id)
    )
    SQL
    ,
);

executeQuery(
    <<<'SQL'
    CREATE TABLE IF NOT EXISTS reminders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      client_id INT NULL,
      type ENUM('birthday', 'renewal', 'pickup', 'follow_up', 'other') NOT NULL DEFAULT 'other',
      due_date DATE NOT NULL,
      message VARCHAR(500) NOT NULL,
      status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
      completed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_reminders_company FOREIGN KEY (company_id) REFERENCES companies (id),
      CONSTRAINT fk_reminders_client FOREIGN KEY (client_id) REFERENCES clients (id)
    )
    SQL
    ,
);
addColumn('reminders', 'source_key', 'VARCHAR(190) NULL');
if (!indexExists('reminders', 'uq_reminders_source')) {
    executeQuery(
        'ALTER TABLE reminders ADD UNIQUE KEY uq_reminders_source (company_id, source_key)',
    );
}

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
