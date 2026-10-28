# Ocular — CRM e gestão para óticas (v2)

Sistema multiótica: cada ótica tem seu ambiente isolado (clientes, vendas, estoque, OS, CRM e campanhas) e um painel de plataforma permite ao superadministrador liberar, bloquear e cobrar cada ótica. Um mesmo usuário pode trabalhar em várias óticas, com um papel em cada uma.

- **Interface:** React 18 + Vite (`web/`), compilada para `app/public/`.
- **API e processamento:** PHP 8.2+ (`app/`), MySQL 8 ou MariaDB 10.4+.
- **PDFs:** FPDF (incluído em `app/lib/fpdf`), sem dependências extras.

## Funcionalidades

**Plataforma (superadmin):** painel com MRR, óticas por situação, faturas do mês e inadimplência; cadastro de óticas e responsáveis; bloqueio/desbloqueio com motivo (o acesso cai imediatamente, inclusive em sessões abertas); usuários com acesso a várias óticas; planos; faturas mensais (geração em lote, baixa e cancelamento); auditoria geral; acesso direto a qualquer ótica.

**Em cada ótica:**

- **Clientes** com etiquetas múltiplas, receitas (OD/OE), autorização de mensagens (LGPD), ficha com indicadores e **linha do tempo** unificada (vendas, orçamentos, OS, atendimentos, mensagens, campanhas, não compras, anexos). Painel da carteira (recência, faixa etária, cidades, origem, aniversariantes, receitas vencendo, melhores clientes).
- **Produtos e estoque** com histórico de movimentações, entrada de mercadoria, inventário e alerta de mínimo. **Fornecedores e laboratórios.**
- **Orçamentos** → conversão em venda com um clique ou registro de perda com motivo.
- **Vendas** não fiscais: itens do estoque **ou itens livres**, desconto, entrada + parcelas, baixa de parcelas, cancelamento com estorno de estoque, **pedido em PDF A5**.
- **Ordens de serviço** vinculadas à venda ou avulsas, quadro kanban por etapa (arrastar e soltar), histórico, **OS em PDF A5 com canhoto** para o cliente.
- **Numeração configurável** do próximo pedido, OS e orçamento (continuidade com o sistema anterior).
- **Anexos** (fotos e documentos) em cliente, venda, OS e orçamento — no celular, o botão *Tirar foto* abre a câmera.
- **Atendimento (CRM)**: caixa de conversas por WhatsApp, Instagram e Messenger. Cada ótica escolhe o modo:
  - *Manual*: o sistema prepara a mensagem e abre o WhatsApp do atendente (wa.me);
  - *API oficial da Meta* (WhatsApp Cloud API), com modelos aprovados para campanhas;
  - *API não oficial*: Evolution API ou Z-API.
- **Campanhas** (promoção do mês, aniversariantes, vencimento de receita, Natal, Black Friday, reativação…) com público por filtros ou relatório salvo, modos manual/semiautomático/automático, janela de horário e limite por minuto. **Cada cliente recebe a campanha uma única vez** e a tela mostra quem já recebeu, quem respondeu e quem falta.
- **Automações** por gatilho (aniversário, receita vencendo, X dias sem comprar, pós-venda, orçamento parado, OS pronta, novo cliente, palavra-chave recebida) com ações de enviar mensagem, criar tarefa, etiquetar ou chamar um webhook.
- **Tarefas do dia** geradas automaticamente (aniversários, receitas, retirada, orçamentos, renovação).
- **Não compras / desistências** de clientes e não clientes, com motivos configuráveis e relatório gerencial.
- **Relatórios flexíveis** sobre clientes, vendas, itens, orçamentos, OS, atendimentos, não compras, produtos e recebimentos: filtros cruzados (inclusive filtros de cliente em qualquer relatório), colunas, agrupamento, exportação CSV, relatórios salvos e **criação de campanha a partir do relatório**.
- **Importação** de planilhas (Excel/CSV) de clientes, produtos, fornecedores, vendas, itens de venda e receitas, com mapeamento de colunas e reimportação sem duplicar.
- **Integrações:** chaves de API (somente leitura ou leitura/escrita) e webhooks de saída assinados por evento.
- **Auditoria** de todas as operações (quem, quando, o quê, IP), inclusive tentativas de acesso.

## Acessos iniciais

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Superadmin da plataforma | admin@ocular.local | admin123 |
| Ótica Luzir | luzir@ocular.local | luzir123 |
| Ótica Demonstração (dados fictícios) | demo@ocular.local | demo1234 |

O e-mail da Ótica Luzir é provisório. Troque esse e-mail e todas as senhas (em *Meu perfil* ou em *Plataforma › Usuários*) antes de usar o sistema com dados reais.

## Executar no XAMPP (Windows)

1. Coloque o projeto em `C:\xampp\htdocs\Otica-SD` e inicie Apache e MySQL.
2. (Opcional) copie `app/config/local.example.php` para `app/config/local.php` e ajuste o banco.
3. Prepare o banco: `C:\xampp\php\php.exe app\migrate.php` (cria o banco `ocular` se não existir).
4. Acesse `http://localhost/Otica-SD/` — o administrador inicial é `admin@ocular.local` / `admin123` (altere a senha em *Meu perfil*).
5. Para campanhas automáticas, automações e webhooks, deixe o processador rodando: `C:\xampp\php\php.exe app\worker.php` — ou agende `php app\worker.php --once` a cada minuto no Agendador de Tarefas.

Dados de demonstração: `php app/scripts/seed_demo.php` cria a *Ótica Demonstração* (`demo@ocular.local` / `demo1234`).
Nova ótica pela linha de comando: `php app/scripts/create_company.php --name="Ótica X" --owner-email=... --owner-password=... --logo=logo.jpg`.

## Executar com Docker

```sh
docker compose up --build -d
```

Acesse http://localhost:8080. Os serviços são `frontend` (Nginx), `api` (PHP/Apache, aplica as migrações ao iniciar), `worker` (campanhas, automações, webhooks) e `db` (MySQL 8.4). Variáveis úteis: `PUBLIC_URL` (endereço público da API para os webhooks), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DB_PASSWORD`.

## Desenvolvimento da interface

```sh
cd web
npm install
npm run dev     # http://localhost:5173, com /api encaminhado para a API do XAMPP
npm run build   # gera app/public
```

O build é versionado em `app/public` para que a instalação não precise de Node.

## Integração com WhatsApp

Configure em **Configurações › Canais**. Cada canal mostra a URL de webhook a ser cadastrada no provedor:

| Modo | O que informar | Webhook |
| --- | --- | --- |
| Manual (wa.me) | nada | — |
| Meta Cloud API (oficial) | Phone number ID, token, App secret, verify token | URL de callback + verify token no app da Meta (campo *messages*) |
| Evolution API | URL do servidor, API key, instância | Webhook da instância com o evento `MESSAGES_UPSERT` |
| Z-API | ID da instância, token, client token | Webhook "Ao receber" |
| Instagram / Messenger | Page ID, token da página, App secret | Webhook da página (campo *messages*) |

Fora da janela de 24 horas, a API oficial exige **modelos aprovados**: informe o nome do modelo da Meta em *Modelos de mensagem* para usá-lo nas campanhas.

## API para outros sistemas

`GET /api/index.php?action=clients|products|sales|quotes|service_orders|partners` com o cabeçalho `Authorization: Bearer ok_...` (chave criada em *Configurações › Integrações*). Webhooks de saída enviam `X-Ocular-Event` e `X-Ocular-Signature: sha256=HMAC(corpo, segredo)`.

## Segurança

Senhas com `password_hash`, consultas parametrizadas, sessão HttpOnly/SameSite, token CSRF, isolamento por ótica em todas as consultas (a ótica vem sempre da sessão), limitação de tentativas de login, validação de tipo real dos arquivos enviados e armazenamento dos anexos fora da pasta pública (com bloqueio por `.htaccess` em instalações Apache).

## Testes

`bash tests/smoke.sh` valida o fluxo principal contra a ótica de demonstração (cliente, venda com item livre e parcelas, OS, PDF, campanha sem duplicidade, cancelamento com estorno).

Consulte o [guia da estrutura](docs/estrutura.md) e o [histórico de versões](CHANGELOG.md).
