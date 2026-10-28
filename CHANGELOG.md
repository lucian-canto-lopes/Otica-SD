# Histórico de versões

O projeto segue [versionamento semântico](https://semver.org/lang/pt-BR/): MAIOR para mudanças incompatíveis, MENOR para novas funcionalidades e CORREÇÃO para ajustes.

## 2.1.0 — 2026-10-28

- **WhatsApp integrado:** a Evolution API passa a acompanhar o sistema (`compose.yaml`). A ótica conecta o número lendo o QR Code (ou por código de pareamento) em Configurações › Canais; o Ocular cria a instância, configura o webhook e acompanha a conexão.
- **Envio seguro de campanhas** pelo WhatsApp por QR Code: aquecimento do número com limite diário, uma mensagem por vez com intervalos aleatórios, pausas entre lotes, verificação de números sem WhatsApp, prioridade para quem já conversou com a ótica e pausa automática em caso de desconexão ou falhas seguidas.
- **Descadastro:** rodapé "responda SAIR" opcional; respostas SAIR/PARAR/STOP retiram o aceite, removem o cliente das campanhas pendentes e enviam uma confirmação.
- Status de entrega e leitura das mensagens enviadas pela Evolution API.
- O processador em segundo plano roda a cada 15 segundos.

## 2.0.0 — 2026-10-28

Reescrita como plataforma multiótica.

- Interface migrada de JavaScript puro para **React + Vite**, responsiva e com tema claro/escuro.
- Novo esquema de banco multiempresa com migrações; bancos da v1 são preservados com o prefixo `v1_`.
- Usuários com acesso a várias óticas e papéis por ótica; painel do superadministrador com planos, faturas, bloqueio e auditoria geral.
- Clientes com etiquetas, receitas, linha do tempo e painel da carteira.
- Orçamentos, vendas com itens livres e parcelas, ordens de serviço em kanban, anexos com captura pela câmera.
- PDFs A5 de pedido de venda, orçamento e OS (com canhoto).
- CRM com WhatsApp manual, Meta Cloud API, Evolution API, Z-API, Instagram e Messenger.
- Campanhas sem envio duplicado, automações, tarefas automáticas, relatórios flexíveis com criação de campanha.
- Registro de não compras, importação de planilhas, chaves de API, webhooks e auditoria de uso.
- Ótica Luzir cadastrada com logo e identidade visual.

## 1.x

Protótipo acadêmico (HTML/JS + PHP) com clientes, vendas, OS, parceiros e lembretes.
