-- Dados opcionais para a pré-validação da simulação NF-e 55.
-- Não representam cálculo tributário nem tornam o XML demonstrativo oficial.
ALTER TABLE companies
  ADD COLUMN fiscal_ie VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN fiscal_city_code CHAR(7) NOT NULL DEFAULT '',
  ADD COLUMN fiscal_crt CHAR(1) NOT NULL DEFAULT '';

ALTER TABLE clients
  ADD COLUMN cnpj VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN fiscal_city_code CHAR(7) NOT NULL DEFAULT '',
  ADD COLUMN fiscal_ie_indicator CHAR(1) NOT NULL DEFAULT '9',
  ADD COLUMN fiscal_ie VARCHAR(30) NOT NULL DEFAULT '';

ALTER TABLE products
  ADD COLUMN fiscal_ncm CHAR(8) NOT NULL DEFAULT '',
  ADD COLUMN fiscal_cfop CHAR(4) NOT NULL DEFAULT '',
  ADD COLUMN fiscal_origin CHAR(1) NOT NULL DEFAULT '',
  ADD COLUMN fiscal_tax_situation VARCHAR(3) NOT NULL DEFAULT '';

ALTER TABLE sale_items
  ADD COLUMN fiscal_ncm CHAR(8) NOT NULL DEFAULT '',
  ADD COLUMN fiscal_cfop CHAR(4) NOT NULL DEFAULT '',
  ADD COLUMN fiscal_origin CHAR(1) NOT NULL DEFAULT '',
  ADD COLUMN fiscal_tax_situation VARCHAR(3) NOT NULL DEFAULT '';
