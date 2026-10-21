SET NAMES utf8mb4;

CREATE TABLE companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  document VARCHAR(30) NOT NULL DEFAULT '',
  plan VARCHAR(40) NOT NULL DEFAULT 'Essencial',
  status ENUM('trial', 'active', 'blocked') NOT NULL DEFAULT 'trial',
  logo_data MEDIUMTEXT NULL
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('platform_admin', 'company_admin') NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies (id)
);

CREATE TABLE clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  birth_date DATE NULL,
  next_contact_date DATE NULL,
  notes TEXT,
  FOREIGN KEY (company_id) REFERENCES companies (id)
);

CREATE TABLE partners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  type ENUM('supplier', 'laboratory') NOT NULL,
  document VARCHAR(30) NOT NULL DEFAULT '',
  phone VARCHAR(30) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies (id)
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(60) NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  supplier_id INT NULL,
  FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES partners (id)
);

CREATE TABLE sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  total DECIMAL(12, 2) NOT NULL,
  paid DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies (id),
  FOREIGN KEY (client_id) REFERENCES clients (id),
  FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  description VARCHAR(500) NOT NULL,
  prescription TEXT,
  laboratory_id INT NULL,
  status ENUM(
    'received',
    'sent_to_lab',
    'lab_production',
    'received_from_lab',
    'ready',
    'delivered'
  ) NOT NULL DEFAULT 'received',
  delivery DATE NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies (id),
  FOREIGN KEY (client_id) REFERENCES clients (id),
  CONSTRAINT fk_orders_laboratory FOREIGN KEY (laboratory_id) REFERENCES partners (id)
);

CREATE TABLE order_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  order_id INT NOT NULL,
  status VARCHAR(40) NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies (id),
  FOREIGN KEY (order_id) REFERENCES orders (id)
);

CREATE TABLE interactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  type ENUM('whatsapp', 'phone', 'visit', 'email', 'other') NOT NULL DEFAULT 'other',
  subject VARCHAR(120) NOT NULL,
  notes TEXT,
  contact_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies (id),
  FOREIGN KEY (client_id) REFERENCES clients (id)
);

CREATE TABLE reminders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NULL,
  type ENUM(
    'birthday',
    'renewal',
    'pickup',
    'follow_up',
    'other'
  ) NOT NULL DEFAULT 'other',
  due_date DATE NOT NULL,
  message VARCHAR(500) NOT NULL,
  status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
  completed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  source_key VARCHAR(190) NULL,
  FOREIGN KEY (company_id) REFERENCES companies (id),
  FOREIGN KEY (client_id) REFERENCES clients (id),
  UNIQUE KEY uq_reminders_source (company_id, source_key)
);

INSERT INTO
  companies (id, name, document, status)
VALUES
  (1, 'Ótica Central', 'Demonstração 01', 'active'),
  (2, 'Ótica Horizonte', 'Demonstração 02', 'trial');

INSERT INTO
  clients (
    company_id,
    name,
    phone,
    email,
    birth_date,
    next_contact_date,
    notes
  )
VALUES
  (
    1,
    'Mariana Oliveira',
    '(93) 99999-0101',
    'mariana@example.test',
    DATE_ADD(CURRENT_DATE, INTERVAL 20 DAY),
    DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY),
    'Prefere contato à tarde'
  ),
  (
    1,
    'Pedro Santos',
    '(93) 99999-0202',
    '',
    NULL,
    NULL,
    ''
  ),
  (
    2,
    'Julia Lima',
    '(93) 99999-0303',
    '',
    NULL,
    NULL,
    ''
  );

INSERT INTO
  partners (company_id, name, type, phone, email, notes)
VALUES
  (
    1,
    'Laboratório Visão Norte',
    'laboratory',
    '(93) 99999-0404',
    'contato@laboratorio.test',
    'Parceiro de demonstração'
  ),
  (
    1,
    'Distribuidora Aurora',
    'supplier',
    '(93) 99999-0505',
    'vendas@distribuidora.test',
    ''
  );

INSERT INTO
  products (
    company_id,
    name,
    category,
    price,
    stock,
    supplier_id
  )
VALUES
  (1, 'Armação Aurora', 'Armações', 249.90, 12, 2),
  (1, 'Lente antirreflexo', 'Lentes', 180, 24, 2),
  (1, 'Solar Horizonte', 'Óculos solares', 329, 8, 2),
  (2, 'Armação Clássica', 'Armações', 199, 10, NULL);

INSERT INTO
  orders (
    company_id,
    client_id,
    description,
    prescription,
    laboratory_id,
    status,
    delivery
  )
VALUES
  (
    1,
    1,
    'Montagem de óculos de grau',
    'Receita fictícia para demonstração',
    1,
    'lab_production',
    DATE_ADD(CURRENT_DATE, INTERVAL 5 DAY)
  );

INSERT INTO
  order_events (company_id, order_id, status, notes)
VALUES
  (1, 1, 'received', 'Ordem aberta na ótica'),
  (
    1,
    1,
    'sent_to_lab',
    'Enviada ao laboratório parceiro'
  ),
  (1, 1, 'lab_production', 'Produção iniciada');

INSERT INTO
  interactions (company_id, client_id, type, subject, notes)
VALUES
  (
    1,
    1,
    'whatsapp',
    'Confirmação do pedido',
    'Cliente confirmou os dados do pedido.'
  );

INSERT INTO
  reminders (company_id, client_id, type, due_date, message)
VALUES
  (
    1,
    1,
    'follow_up',
    DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY),
    'Entrar em contato para acompanhar a adaptação aos novos óculos.'
  );
