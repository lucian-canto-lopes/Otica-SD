-- Ocular v2: esquema multiempresa completo.
-- Compatível com MySQL 8 e MariaDB 10.4+. Campos JSON usam MEDIUMTEXT para manter a compatibilidade.

CREATE TABLE plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  max_users INT NOT NULL DEFAULT 3,
  max_clients INT NOT NULL DEFAULT 0,
  features MEDIUMTEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  trade_name VARCHAR(150) NOT NULL DEFAULT '',
  document VARCHAR(30) NOT NULL DEFAULT '',
  phone VARCHAR(30) NOT NULL DEFAULT '',
  whatsapp VARCHAR(30) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  instagram VARCHAR(80) NOT NULL DEFAULT '',
  zip VARCHAR(10) NOT NULL DEFAULT '',
  address VARCHAR(190) NOT NULL DEFAULT '',
  number VARCHAR(20) NOT NULL DEFAULT '',
  neighborhood VARCHAR(100) NOT NULL DEFAULT '',
  city VARCHAR(100) NOT NULL DEFAULT '',
  state CHAR(2) NOT NULL DEFAULT '',
  logo_path VARCHAR(255) NULL,
  primary_color VARCHAR(9) NOT NULL DEFAULT '#4f2d7f',
  status ENUM('trial', 'active', 'blocked', 'cancelled') NOT NULL DEFAULT 'trial',
  plan_id INT NULL,
  monthly_fee DECIMAL(12, 2) NOT NULL DEFAULT 0,
  billing_day TINYINT NOT NULL DEFAULT 10,
  trial_ends_at DATE NULL,
  blocked_reason VARCHAR(255) NOT NULL DEFAULT '',
  next_sale_number INT NOT NULL DEFAULT 1,
  next_order_number INT NOT NULL DEFAULT 1,
  next_quote_number INT NOT NULL DEFAULT 1,
  settings MEDIUMTEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_companies_plan FOREIGN KEY (plan_id) REFERENCES plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  is_superadmin TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Um usuário pode trabalhar em várias óticas, com um papel em cada uma.
CREATE TABLE company_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('owner', 'manager', 'seller', 'lab', 'viewer') NOT NULL DEFAULT 'seller',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_company_users (company_id, user_id),
  CONSTRAINT fk_cu_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_cu_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  reference VARCHAR(7) NOT NULL,
  description VARCHAR(190) NOT NULL DEFAULT '',
  amount DECIMAL(12, 2) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('pending', 'paid', 'cancelled') NOT NULL DEFAULT 'pending',
  paid_at DATE NULL,
  payment_method VARCHAR(40) NOT NULL DEFAULT '',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoice_ref (company_id, reference),
  CONSTRAINT fk_inv_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NULL,
  user_id INT NULL,
  user_name VARCHAR(120) NOT NULL DEFAULT '',
  action VARCHAR(40) NOT NULL,
  entity VARCHAR(40) NOT NULL DEFAULT '',
  entity_id INT NULL,
  summary VARCHAR(255) NOT NULL DEFAULT '',
  details MEDIUMTEXT NULL,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_company (company_id, created_at),
  KEY idx_audit_entity (company_id, entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(60) NOT NULL,
  color VARCHAR(9) NOT NULL DEFAULT '#6366f1',
  UNIQUE KEY uq_tags (company_id, name),
  CONSTRAINT fk_tags_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  legacy_id VARCHAR(40) NULL,
  kind ENUM('client', 'lead') NOT NULL DEFAULT 'client',
  name VARCHAR(150) NOT NULL,
  nickname VARCHAR(80) NOT NULL DEFAULT '',
  cpf VARCHAR(20) NOT NULL DEFAULT '',
  rg VARCHAR(30) NOT NULL DEFAULT '',
  birth_date DATE NULL,
  gender ENUM('', 'F', 'M', 'O') NOT NULL DEFAULT '',
  phone VARCHAR(30) NOT NULL DEFAULT '',
  whatsapp VARCHAR(30) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  instagram VARCHAR(80) NOT NULL DEFAULT '',
  zip VARCHAR(10) NOT NULL DEFAULT '',
  address VARCHAR(190) NOT NULL DEFAULT '',
  number VARCHAR(20) NOT NULL DEFAULT '',
  complement VARCHAR(80) NOT NULL DEFAULT '',
  neighborhood VARCHAR(100) NOT NULL DEFAULT '',
  city VARCHAR(100) NOT NULL DEFAULT '',
  state CHAR(2) NOT NULL DEFAULT '',
  occupation VARCHAR(100) NOT NULL DEFAULT '',
  origin VARCHAR(60) NOT NULL DEFAULT '',
  notes TEXT NULL,
  message_consent TINYINT(1) NOT NULL DEFAULT 0,
  message_consent_at DATETIME NULL,
  next_contact_date DATE NULL,
  seller_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_clients_company_name (company_id, name),
  KEY idx_clients_company_phone (company_id, whatsapp),
  KEY idx_clients_company_cpf (company_id, cpf),
  KEY idx_clients_birth (company_id, birth_date),
  UNIQUE KEY uq_clients_legacy (company_id, legacy_id),
  CONSTRAINT fk_clients_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE client_tags (
  client_id INT NOT NULL,
  tag_id INT NOT NULL,
  company_id INT NOT NULL,
  PRIMARY KEY (client_id, tag_id),
  KEY idx_client_tags_tag (company_id, tag_id),
  CONSTRAINT fk_ct_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
  CONSTRAINT fk_ct_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Receitas oftalmológicas: base para OS e para campanhas de vencimento de receita.
CREATE TABLE prescriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  prescribed_at DATE NULL,
  expires_at DATE NULL,
  doctor VARCHAR(120) NOT NULL DEFAULT '',
  doctor_crm VARCHAR(30) NOT NULL DEFAULT '',
  od_sph VARCHAR(10) NOT NULL DEFAULT '',
  od_cyl VARCHAR(10) NOT NULL DEFAULT '',
  od_axis VARCHAR(10) NOT NULL DEFAULT '',
  od_dnp VARCHAR(10) NOT NULL DEFAULT '',
  od_height VARCHAR(10) NOT NULL DEFAULT '',
  oe_sph VARCHAR(10) NOT NULL DEFAULT '',
  oe_cyl VARCHAR(10) NOT NULL DEFAULT '',
  oe_axis VARCHAR(10) NOT NULL DEFAULT '',
  oe_dnp VARCHAR(10) NOT NULL DEFAULT '',
  oe_height VARCHAR(10) NOT NULL DEFAULT '',
  addition VARCHAR(10) NOT NULL DEFAULT '',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_presc_client (company_id, client_id),
  KEY idx_presc_expires (company_id, expires_at),
  CONSTRAINT fk_presc_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE partners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  legacy_id VARCHAR(40) NULL,
  type ENUM('supplier', 'laboratory', 'both') NOT NULL DEFAULT 'supplier',
  name VARCHAR(150) NOT NULL,
  trade_name VARCHAR(150) NOT NULL DEFAULT '',
  document VARCHAR(30) NOT NULL DEFAULT '',
  contact_name VARCHAR(120) NOT NULL DEFAULT '',
  phone VARCHAR(30) NOT NULL DEFAULT '',
  whatsapp VARCHAR(30) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  address VARCHAR(190) NOT NULL DEFAULT '',
  city VARCHAR(100) NOT NULL DEFAULT '',
  state CHAR(2) NOT NULL DEFAULT '',
  notes TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_partners_company (company_id, name),
  UNIQUE KEY uq_partners_legacy (company_id, legacy_id),
  CONSTRAINT fk_partners_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  legacy_id VARCHAR(40) NULL,
  sku VARCHAR(60) NOT NULL DEFAULT '',
  barcode VARCHAR(60) NOT NULL DEFAULT '',
  name VARCHAR(190) NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT '',
  brand VARCHAR(80) NOT NULL DEFAULT '',
  model VARCHAR(80) NOT NULL DEFAULT '',
  color VARCHAR(60) NOT NULL DEFAULT '',
  size VARCHAR(30) NOT NULL DEFAULT '',
  unit VARCHAR(10) NOT NULL DEFAULT 'UN',
  cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  track_stock TINYINT(1) NOT NULL DEFAULT 1,
  supplier_id INT NULL,
  description TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_products_company (company_id, name),
  KEY idx_products_sku (company_id, sku),
  KEY idx_products_barcode (company_id, barcode),
  UNIQUE KEY uq_products_legacy (company_id, legacy_id),
  CONSTRAINT fk_products_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES partners (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  product_id INT NOT NULL,
  type ENUM('in', 'out', 'adjust', 'sale', 'sale_cancel') NOT NULL,
  quantity INT NOT NULL,
  balance_after INT NOT NULL,
  unit_cost DECIMAL(12, 2) NULL,
  reason VARCHAR(255) NOT NULL DEFAULT '',
  ref_type VARCHAR(20) NOT NULL DEFAULT '',
  ref_id INT NULL,
  user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stock_product (company_id, product_id, created_at),
  CONSTRAINT fk_stock_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE loss_reasons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_loss_reasons (company_id, name),
  CONSTRAINT fk_lr_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quotes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  number INT NOT NULL,
  client_id INT NULL,
  contact_name VARCHAR(150) NOT NULL DEFAULT '',
  contact_phone VARCHAR(30) NOT NULL DEFAULT '',
  seller_id INT NULL,
  prescription_id INT NULL,
  status ENUM('open', 'sent', 'approved', 'lost', 'expired', 'converted') NOT NULL DEFAULT 'open',
  quote_date DATE NOT NULL,
  valid_until DATE NULL,
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  loss_reason_id INT NULL,
  loss_notes VARCHAR(500) NOT NULL DEFAULT '',
  sale_id INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_quotes_number (company_id, number),
  KEY idx_quotes_client (company_id, client_id),
  KEY idx_quotes_status (company_id, status, quote_date),
  CONSTRAINT fk_quotes_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_quotes_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quote_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  quote_id INT NOT NULL,
  product_id INT NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  KEY idx_qi_quote (quote_id),
  CONSTRAINT fk_qi_quote FOREIGN KEY (quote_id) REFERENCES quotes (id) ON DELETE CASCADE,
  CONSTRAINT fk_qi_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  legacy_id VARCHAR(40) NULL,
  number INT NOT NULL,
  client_id INT NULL,
  seller_id INT NULL,
  quote_id INT NULL,
  prescription_id INT NULL,
  status ENUM('open', 'completed', 'cancelled') NOT NULL DEFAULT 'completed',
  sale_date DATE NOT NULL,
  delivery_date DATE NULL,
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  paid DECIMAL(12, 2) NOT NULL DEFAULT 0,
  payment_terms VARCHAR(255) NOT NULL DEFAULT '',
  notes TEXT NULL,
  cancel_reason VARCHAR(255) NOT NULL DEFAULT '',
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_number (company_id, number),
  UNIQUE KEY uq_sales_legacy (company_id, legacy_id),
  KEY idx_sales_date (company_id, sale_date),
  KEY idx_sales_client (company_id, client_id),
  CONSTRAINT fk_sales_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- product_id é opcional: a venda não é fiscal e aceita itens livres.
CREATE TABLE sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  sale_id INT NOT NULL,
  product_id INT NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  KEY idx_si_sale (sale_id),
  KEY idx_si_product (company_id, product_id),
  CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
  CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  sale_id INT NOT NULL,
  method VARCHAR(30) NOT NULL DEFAULT 'dinheiro',
  amount DECIMAL(12, 2) NOT NULL,
  installment INT NOT NULL DEFAULT 1,
  due_date DATE NULL,
  paid_at DATE NULL,
  notes VARCHAR(255) NOT NULL DEFAULT '',
  KEY idx_sp_sale (sale_id),
  KEY idx_sp_due (company_id, paid_at, due_date),
  CONSTRAINT fk_sp_sale FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  number INT NOT NULL,
  sale_id INT NULL,
  client_id INT NULL,
  laboratory_id INT NULL,
  prescription_id INT NULL,
  status ENUM('open', 'sent_to_lab', 'in_production', 'received_from_lab', 'mounting', 'ready', 'delivered', 'cancelled') NOT NULL DEFAULT 'open',
  od_sph VARCHAR(10) NOT NULL DEFAULT '',
  od_cyl VARCHAR(10) NOT NULL DEFAULT '',
  od_axis VARCHAR(10) NOT NULL DEFAULT '',
  od_dnp VARCHAR(10) NOT NULL DEFAULT '',
  od_height VARCHAR(10) NOT NULL DEFAULT '',
  oe_sph VARCHAR(10) NOT NULL DEFAULT '',
  oe_cyl VARCHAR(10) NOT NULL DEFAULT '',
  oe_axis VARCHAR(10) NOT NULL DEFAULT '',
  oe_dnp VARCHAR(10) NOT NULL DEFAULT '',
  oe_height VARCHAR(10) NOT NULL DEFAULT '',
  addition VARCHAR(10) NOT NULL DEFAULT '',
  lens_description VARCHAR(255) NOT NULL DEFAULT '',
  frame_description VARCHAR(255) NOT NULL DEFAULT '',
  frame_type VARCHAR(40) NOT NULL DEFAULT '',
  frame_from_client TINYINT(1) NOT NULL DEFAULT 0,
  bridge VARCHAR(10) NOT NULL DEFAULT '',
  horizontal VARCHAR(10) NOT NULL DEFAULT '',
  vertical VARCHAR(10) NOT NULL DEFAULT '',
  diagonal VARCHAR(10) NOT NULL DEFAULT '',
  promised_date DATE NULL,
  delivered_at DATETIME NULL,
  lab_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_so_number (company_id, number),
  KEY idx_so_status (company_id, status, promised_date),
  KEY idx_so_client (company_id, client_id),
  KEY idx_so_sale (company_id, sale_id),
  CONSTRAINT fk_so_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_so_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL,
  CONSTRAINT fk_so_sale FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE SET NULL,
  CONSTRAINT fk_so_lab FOREIGN KEY (laboratory_id) REFERENCES partners (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_order_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  service_order_id INT NOT NULL,
  status VARCHAR(30) NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_soe_order (service_order_id),
  CONSTRAINT fk_soe_order FOREIGN KEY (service_order_id) REFERENCES service_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  entity_type ENUM('client', 'sale', 'service_order', 'quote') NOT NULL,
  entity_id INT NOT NULL,
  client_id INT NULL,
  original_name VARCHAR(190) NOT NULL,
  stored_name VARCHAR(190) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  uploaded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_att_entity (company_id, entity_type, entity_id),
  KEY idx_att_client (company_id, client_id),
  CONSTRAINT fk_att_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registros de não compra / desistência, para clientes ou contatos ainda não cadastrados.
CREATE TABLE lost_opportunities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NULL,
  contact_name VARCHAR(150) NOT NULL DEFAULT '',
  contact_phone VARCHAR(30) NOT NULL DEFAULT '',
  reason_id INT NULL,
  quote_id INT NULL,
  estimated_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  user_id INT NULL,
  occurred_at DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lost_company (company_id, occurred_at),
  CONSTRAINT fk_lost_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_lost_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL,
  CONSTRAINT fk_lost_reason FOREIGN KEY (reason_id) REFERENCES loss_reasons (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE interactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  channel ENUM('whatsapp', 'instagram', 'facebook', 'phone', 'visit', 'email', 'other') NOT NULL DEFAULT 'other',
  direction ENUM('in', 'out') NOT NULL DEFAULT 'out',
  subject VARCHAR(150) NOT NULL,
  notes TEXT NULL,
  user_id INT NULL,
  campaign_id INT NULL,
  contact_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_int_client (company_id, client_id, contact_at),
  CONSTRAINT fk_int_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NULL,
  user_id INT NULL,
  type ENUM('birthday', 'renewal', 'prescription', 'pickup', 'follow_up', 'quote', 'other') NOT NULL DEFAULT 'other',
  title VARCHAR(255) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('pending', 'done', 'cancelled') NOT NULL DEFAULT 'pending',
  done_at DATETIME NULL,
  source_key VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tasks_source (company_id, source_key),
  KEY idx_tasks_due (company_id, status, due_date),
  CONSTRAINT fk_tasks_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Canais de mensagem: cada ótica escolhe API oficial (Meta Cloud), não oficial (Evolution/Z-API) ou modo manual.
CREATE TABLE channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  type ENUM('whatsapp_manual', 'whatsapp_cloud', 'whatsapp_evolution', 'whatsapp_zapi', 'instagram', 'facebook') NOT NULL,
  name VARCHAR(120) NOT NULL,
  config MEDIUMTEXT NULL,
  webhook_token VARCHAR(64) NOT NULL,
  status ENUM('active', 'inactive', 'error') NOT NULL DEFAULT 'active',
  last_error VARCHAR(500) NOT NULL DEFAULT '',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_channels_token (webhook_token),
  CONSTRAINT fk_channels_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  channel_id INT NOT NULL,
  client_id INT NULL,
  contact_handle VARCHAR(80) NOT NULL,
  contact_name VARCHAR(150) NOT NULL DEFAULT '',
  status ENUM('open', 'pending', 'closed') NOT NULL DEFAULT 'open',
  assigned_user_id INT NULL,
  unread INT NOT NULL DEFAULT 0,
  last_message_at DATETIME NULL,
  last_message_preview VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conv (company_id, channel_id, contact_handle),
  KEY idx_conv_last (company_id, last_message_at),
  CONSTRAINT fk_conv_channel FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  conversation_id INT NOT NULL,
  direction ENUM('in', 'out') NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'text',
  body TEXT NULL,
  media_url VARCHAR(500) NULL,
  external_id VARCHAR(190) NULL,
  status ENUM('queued', 'sent', 'delivered', 'read', 'failed', 'received', 'manual') NOT NULL DEFAULT 'queued',
  error VARCHAR(500) NOT NULL DEFAULT '',
  campaign_recipient_id INT NULL,
  user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_msg_conv (conversation_id, id),
  KEY idx_msg_external (company_id, external_id),
  KEY idx_msg_queue (status, id),
  CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE message_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'marketing',
  body TEXT NOT NULL,
  meta_template_name VARCHAR(120) NOT NULL DEFAULT '',
  meta_language VARCHAR(10) NOT NULL DEFAULT 'pt_BR',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mt_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE saved_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  entity VARCHAR(30) NOT NULL,
  definition MEDIUMTEXT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sr_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'custom',
  status ENUM('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  mode ENUM('manual', 'semi', 'auto') NOT NULL DEFAULT 'semi',
  channel_id INT NULL,
  template_id INT NULL,
  message TEXT NOT NULL,
  audience MEDIUMTEXT NULL,
  saved_report_id INT NULL,
  scheduled_at DATETIME NULL,
  send_window_start TIME NOT NULL DEFAULT '08:00:00',
  send_window_end TIME NOT NULL DEFAULT '20:00:00',
  per_minute INT NOT NULL DEFAULT 10,
  skip_recent_days INT NOT NULL DEFAULT 0,
  created_by INT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_camp_company (company_id, status),
  CONSTRAINT fk_camp_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_channel FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A chave única (campaign_id, client_id) garante que ninguém receba a mesma campanha duas vezes.
CREATE TABLE campaign_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  campaign_id INT NOT NULL,
  client_id INT NOT NULL,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  status ENUM('pending', 'queued', 'sent', 'failed', 'skipped', 'replied') NOT NULL DEFAULT 'pending',
  rendered_message TEXT NULL,
  sent_at DATETIME NULL,
  sent_by INT NULL,
  message_id BIGINT NULL,
  error VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_client (campaign_id, client_id),
  KEY idx_cr_status (campaign_id, status),
  KEY idx_cr_client (company_id, client_id),
  CONSTRAINT fk_cr_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE automations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  trigger_type VARCHAR(40) NOT NULL,
  trigger_config MEDIUMTEXT NULL,
  action_type VARCHAR(40) NOT NULL,
  action_config MEDIUMTEXT NULL,
  mode ENUM('auto', 'semi') NOT NULL DEFAULT 'semi',
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_run_at DATETIME NULL,
  runs_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auto_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE automation_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  automation_id INT NOT NULL,
  client_id INT NULL,
  ref_key VARCHAR(190) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'done',
  result VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auto_run (automation_id, ref_key),
  CONSTRAINT fk_ar_automation FOREIGN KEY (automation_id) REFERENCES automations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Integrações com outros apps: chaves de API para leitura e webhooks de saída por evento.
CREATE TABLE api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  prefix VARCHAR(12) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  scopes VARCHAR(255) NOT NULL DEFAULT 'read',
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_api_keys_hash (key_hash),
  CONSTRAINT fk_ak_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE webhooks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  url VARCHAR(500) NOT NULL,
  events VARCHAR(500) NOT NULL DEFAULT '*',
  secret VARCHAR(64) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_status INT NULL,
  last_called_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wh_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE webhook_deliveries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  webhook_id INT NOT NULL,
  event VARCHAR(60) NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  response_code INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_whd_status (status, id),
  CONSTRAINT fk_whd_webhook FOREIGN KEY (webhook_id) REFERENCES webhooks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  entity VARCHAR(30) NOT NULL,
  filename VARCHAR(190) NOT NULL DEFAULT '',
  total INT NOT NULL DEFAULT 0,
  created INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  errors MEDIUMTEXT NULL,
  user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_imp_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
