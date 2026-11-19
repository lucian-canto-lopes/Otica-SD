ALTER TABLE user_sessions
  ADD COLUMN login_hash CHAR(64) NOT NULL DEFAULT '' AFTER session_hash,
  ADD KEY idx_user_sessions_login (login_hash);

ALTER TABLE company_users
  ADD COLUMN session_generation INT NOT NULL DEFAULT 0;

-- Os registros anteriores representavam o navegador inteiro, não uma aba.
DELETE FROM user_sessions;
