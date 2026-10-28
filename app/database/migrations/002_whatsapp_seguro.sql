-- WhatsApp integrado (Evolution API do próprio sistema) e envio seguro de campanhas.

-- Estado da conexão do WhatsApp e limite diário do número (0 = automático pelo aquecimento).
ALTER TABLE channels
  ADD COLUMN connection_state VARCHAR(20) NOT NULL DEFAULT '' AFTER status,
  ADD COLUMN phone_number VARCHAR(30) NOT NULL DEFAULT '' AFTER connection_state,
  ADD COLUMN connected_at DATETIME NULL AFTER phone_number,
  ADD COLUMN state_checked_at DATETIME NULL AFTER connected_at,
  ADD COLUMN daily_limit INT NOT NULL DEFAULT 0 AFTER state_checked_at;

-- Ritmo de envio das campanhas por APIs não oficiais: intervalo aleatório entre mensagens,
-- pausas entre lotes, rodapé de descadastro e motivo de pausa automática.
ALTER TABLE campaigns
  ADD COLUMN min_interval_seconds INT NOT NULL DEFAULT 45 AFTER per_minute,
  ADD COLUMN max_interval_seconds INT NOT NULL DEFAULT 120 AFTER min_interval_seconds,
  ADD COLUMN batch_size INT NOT NULL DEFAULT 20 AFTER max_interval_seconds,
  ADD COLUMN batch_pause_minutes INT NOT NULL DEFAULT 15 AFTER batch_size,
  ADD COLUMN opt_out_footer TINYINT(1) NOT NULL DEFAULT 1 AFTER batch_pause_minutes,
  ADD COLUMN next_send_at DATETIME NULL AFTER opt_out_footer,
  ADD COLUMN sent_in_batch INT NOT NULL DEFAULT 0 AFTER next_send_at,
  ADD COLUMN pause_reason VARCHAR(255) NOT NULL DEFAULT '' AFTER sent_in_batch;

-- Clientes que pediram para não receber mais mensagens (resposta SAIR/PARAR).
ALTER TABLE clients
  ADD COLUMN message_opt_out_at DATETIME NULL AFTER message_consent_at;
