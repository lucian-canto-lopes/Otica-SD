ALTER TABLE plans
  ADD COLUMN extra_user_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN extra_screen_price DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE companies
  ADD COLUMN extra_user_slots INT NOT NULL DEFAULT 0,
  ADD COLUMN extra_screen_slots INT NOT NULL DEFAULT 0;

ALTER TABLE company_users
  ADD COLUMN concurrent_screens INT NOT NULL DEFAULT 1;

CREATE TABLE user_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_hash CHAR(64) NOT NULL,
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  last_seen_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_session_hash (session_hash),
  KEY idx_user_sessions_member (company_id, user_id, expires_at),
  CONSTRAINT fk_user_sessions_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Os limites de usuários incluem o proprietário: dono + 1, 3 ou 5 funcionários.
UPDATE plans SET max_users = 2, features = '["Dono + 1 funcionário","Clientes, vendas e OS","Pedidos em PDF"]' WHERE id = 1 AND name = 'Essencial';
UPDATE plans SET max_users = 4, features = '["Dono + 3 funcionários","Tudo do Essencial","Campanhas, automações e relatórios"]' WHERE id = 2 AND name = 'Profissional';
UPDATE plans SET max_users = 6, features = '["Dono + 5 funcionários","Tudo do Profissional","Várias lojas e integrações"]' WHERE id = 3 AND name = 'Rede';
