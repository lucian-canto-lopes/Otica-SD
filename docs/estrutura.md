# Estrutura do código

```
app/                      API PHP e processamento em segundo plano
  api/index.php           Roteador: ?action=RECURSO → função handle*()
  config/database.php     Configuração (variáveis de ambiente ou config/local.php) e acesso ao banco
  database/migrations/    Esquema do banco em migrações SQL numeradas
  lib/fpdf/               Biblioteca de PDF
  migrate.php             Cria o banco, aplica migrações, cadastra planos e o superadmin
  worker.php              Campanhas automáticas, automações agendadas, tarefas e webhooks
  scripts/                create_company.php (nova ótica) e seed_demo.php (dados fictícios)
  public/                 Interface compilada (gerada por web/, não editar à mão)
  storage/                Anexos e logos enviados (fora do Git)
  src/
    bootstrap.php         Carrega tudo e inicia a sessão
    http.php              JSON, paginação, ordenação segura
    validation.php        Validação e normalização (datas, dinheiro, telefone)
    auth.php              Login, contexto (usuário, ótica, papel), permissões, CSRF, chaves de API
    core.php              Auditoria, numeração, arquivos, eventos, modelos de mensagem
    controllers/          Um arquivo por área (clientes, vendas, OS, CRM, campanhas, relatórios…)
    services/             Filtros de cliente, mensageria (WhatsApp/Meta), automações, PDFs
web/                      Código-fonte da interface React
  src/lib/                Cliente da API, sessão, formatação, constantes, hooks
  src/components/         Componentes de interface, gráficos, peças de negócio e layout
  src/pages/              Uma pasta por área; cada tela é carregada sob demanda
tests/smoke.sh            Teste de fumaça do fluxo principal
```

## Fluxo de uma requisição

1. A interface chama `api/index.php?action=sales` (no XAMPP via `app/public/api/index.php`; no Docker o Nginx encaminha `/api/`).
2. `index.php` carrega o contexto: usuário da sessão (ou chave de API), ótica selecionada e papel do usuário nela. Óticas bloqueadas perdem o acesso na hora.
3. Alterações exigem o cabeçalho `X-CSRF-Token`.
4. O controlador valida a entrada, consulta sempre com `company_id` da sessão, grava em transação quando há mais de uma tabela envolvida e registra a auditoria.
5. Eventos de negócio (`emitEvent`) disparam webhooks de saída e automações por evento.

## Papéis

| Papel | Pode |
| --- | --- |
| Proprietário / Gerente | tudo na ótica, inclusive configurações, equipe, importação, auditoria e cancelamentos |
| Vendedor | clientes, orçamentos, vendas, OS, atendimento e campanhas |
| Laboratório | ordens de serviço e receitas |
| Somente leitura | consultar |

O superadministrador acessa qualquer ótica como proprietário (o acesso fica na auditoria).

## Onde está cada regra

| Regra | Arquivo |
| --- | --- |
| Filtros de público (etiquetas, idade, compras, receita…) | `services/client_filters.php` |
| Campanha sem envio duplicado | chave única `campaign_recipients (campaign_id, client_id)` + `buildCampaignRecipients()` |
| Envio pelos provedores e recebimento de webhooks | `services/messaging.php` |
| Automações e tarefas automáticas | `services/automation.php` |
| Pedido, OS e orçamento em PDF | `services/pdf.php` |
| Relatórios flexíveis | `controllers/reports.php` (`reportEntities()`) |
| Importação | `controllers/imports.php` |
