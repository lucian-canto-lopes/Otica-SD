CREATE TABLE fiscal_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  sale_id INT NOT NULL,
  model ENUM('55', '65') NOT NULL DEFAULT '55',
  environment ENUM('simulation', 'homologation', 'production') NOT NULL DEFAULT 'simulation',
  status ENUM('simulated', 'authorized', 'rejected', 'cancelled') NOT NULL DEFAULT 'simulated',
  number INT NOT NULL,
  series INT NOT NULL DEFAULT 1,
  access_key VARCHAR(60) NOT NULL,
  xml LONGTEXT NOT NULL,
  snapshot MEDIUMTEXT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fiscal_sale (company_id, sale_id),
  UNIQUE KEY uq_fiscal_number (company_id, model, series, number),
  KEY idx_fiscal_status (company_id, status, created_at),
  CONSTRAINT fk_fiscal_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_fiscal_sale FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fiscal_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  fiscal_document_id INT NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  message VARCHAR(500) NOT NULL DEFAULT '',
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fiscal_events (company_id, fiscal_document_id, created_at),
  CONSTRAINT fk_fiscal_event_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_fiscal_event_document FOREIGN KEY (fiscal_document_id) REFERENCES fiscal_documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fiscal_sequences (
  company_id INT NOT NULL,
  model CHAR(2) NOT NULL,
  series INT NOT NULL,
  next_number INT NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, model, series),
  CONSTRAINT fk_fiscal_sequence_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
