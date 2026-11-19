-- Mantém o histórico de simulações canceladas e permite outra simulação para a mesma venda.
-- A API bloqueia duas simulações ativas da mesma venda com a venda bloqueada em transação.
ALTER TABLE fiscal_documents DROP INDEX uq_fiscal_sale;
CREATE INDEX idx_fiscal_sale ON fiscal_documents (company_id, sale_id, id);
