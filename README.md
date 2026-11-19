# Ocular — CRM e gestão para óticas (v2)

Sistema multiótica: cada ótica tem seu ambiente isolado (clientes, vendas, estoque, OS, CRM e campanhas) e um painel de plataforma permite ao superadministrador liberar, bloquear e cobrar cada ótica. Um mesmo usuário pode trabalhar em várias óticas, com um papel em cada uma.

- **Interface:** React 18 + Vite (`web/`), compilada para `app/public/`.
- **API e processamento:** PHP 8.2+ (`app/`), MySQL 8 ou MariaDB 10.4+.
- **PDFs:** FPDF (incluído em `app/lib/fpdf`), sem dependências extras.

## Funcionalidades

**Plataforma (superadmin):** painel com MRR, óticas por situação, faturas do mês e inadimplência; cadastro de óticas e responsáveis; bloqueio/desbloqueio com motivo (o acesso cai imediatamente, inclusive em sessões abertas); usuários com acesso a várias óticas; planos; faturas mensais (geração em lote, baixa e cancelamento); auditoria geral; acesso direto a qualquer ótica.

**Em cada ótica:**

- **Equipe e sessões:** planos incluem proprietário + 1, 3 ou 5 funcionários; vagas adicionais têm preço mensal configurável. Cada aba do sistema conta como uma tela, inclusive abas do mesmo navegador. O proprietário pode usar telas livres incluídas no plano, reduzindo as disponíveis para funcionários. Telas adicionais de um funcionário precisam estar contratadas no pacote compartilhado da ótica e atribuídas a ele. O painel inicial mostra a equipe e a aba **Configurações › Equipe** permite ajustar vagas, telas e encerrar sessões de funcionários. Fechar a aba libera a tela; se o navegador não comunicar o fechamento, a vaga expira após 10 minutos. O logout encerra as sessões imediatamente. A cobrança é estimada no protótipo e ainda não é debitada automaticamente.

- **Clientes** com etiquetas múltiplas, receitas (OD/OE), autorização de mensagens (LGPD), ficha com indicadores e **linha do tempo** unificada (vendas, orçamentos, OS, atendimentos, mensagens, campanhas, não compras, anexos). Painel da carteira (recência, faixa etária, cidades, origem, aniversariantes, receitas vencendo, melhores clientes).
- **Produtos e estoque** com histórico de movimentações, entrada de mercadoria, inventário e alerta de mínimo. **Fornecedores e laboratórios.**
- **Orçamentos** → conversão em venda com um clique ou registro de perda com motivo.
- **Vendas** não fiscais: itens do estoque **ou itens livres**, desconto, entrada + parcelas, baixa de parcelas, cancelamento com estorno de estoque, **pedido em PDF A5**.
- **Simulação fiscal:** a partir de uma venda, gera um documento demonstrativo NF-e modelo 55 com XML e PDF de teste, histórico e opção de cancelar a simulação.
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

## Simulação fiscal de teste

1. Entre em uma ótica e abra uma venda não cancelada em **Vendas**. O botão **Simular NF-e 55** fica no detalhe da venda e exige permissão financeira (proprietário ou gerente).
2. Complete os dados de teste indicados na conferência da venda: CNPJ (incluindo o formato alfanumérico com dois dígitos verificadores), IE, CRT, código IBGE e endereço em **Configurações › Ótica**; CPF ou CNPJ, indicador de IE e endereço no **cliente**; NCM, CFOP, origem e situação tributária no **produto** ou diretamente no item livre da **venda**. Vendas antigas e dados de demonstração podem precisar ser completados.
3. Esta prévia cobre **somente um cenário fechado**: CRT 1 (Simples Nacional), venda interna para destinatário não contribuinte, CFOP 5102 e CSOSN 102 em todos os itens. ICMS, PIS e COFINS são representados por grupos de teste sem cálculo tributário; a forma de pagamento do XML é fictícia. A conferência não verifica se o enquadramento é adequado à venda real.
4. Consulte o resultado em **Vendas › Notas fiscais (teste)**. O histórico mostra série, número de teste, venda, cliente, valor e situação. Baixe a prévia XML sem assinatura ou o PDF demonstrativo na venda ou no histórico.
5. Uma simulação pode ser cancelada no histórico. Enquanto ela estiver ativa, a venda não pode ser editada ou cancelada. O registro e os arquivos continuam disponíveis após o cancelamento da simulação, identificados como teste. Depois disso, a venda pode ser editada e simulada novamente, gerando outro número de teste; o detalhe da venda mostra o documento mais recente e o histórico mostra os anteriores. Uma venda cancelada não aceita nova simulação.

Este modo gera apenas **simulações locais de NF-e modelo 55**: não assina digitalmente, não transmite à SEFAZ, não consulta autorização e **não emite nota fiscal válida**. As novas prévias usam a estrutura NF-e 4.00 e são conferidas com o pacote oficial [PL_010h v1.03](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=YhWikFoTxUo%3D), publicado em 13/11/2026 (SHA-256 do ZIP: `bcbf6b277f79a6983d69016dfe0430f09b8a191997a4706a24938acddc18dc81`). Como o XSD exige `Signature`, a conferência insere uma assinatura **fictícia somente numa cópia em memória** para verificar a estrutura dos demais elementos. O XML baixado continua sem assinatura e, isoladamente, **não passa no XSD completo**. A validação estrutural não confirma regras de negócio da SEFAZ, códigos, tributos ou autorização. Registros antigos continuam com o formato XML demonstrativo próprio. O PDF traz aviso de ausência de valor fiscal. A numeração de teste é automática e separada por ótica, modelo e série.

A API expõe `GET /api/index.php?action=fiscal_check&sale_id=ID` para consultar pendências, inclusive os erros do XSD. `POST fiscal` rejeita a simulação quando elas não foram resolvidas. Os dados da ótica, cliente e itens ficam congelados no documento de teste depois da criação.

### Preparação para homologação real

O detalhe da venda mostra separadamente os pré-requisitos para uma futura validação na SEFAZ. A rota `GET /api/index.php?action=fiscal_homologation&sale_id=ID` é **somente leitura** e não assina nem transmite documentos. Ela verifica a configuração privada de um certificado A1, o vínculo com a ótica e os dados básicos, e aponta o que falta implementar. Consulte [docs/homologacao.md](docs/homologacao.md) para configurar um certificado quando houver um emitente habilitado e para ver as etapas que ainda bloqueiam o envio real.

## Desenvolvimento da interface

```sh
cd web
npm install
npm run dev     # http://localhost:5173, com /api encaminhado para a API do XAMPP
npm run build   # gera app/public
```

O build é versionado em `app/public` para que a instalação não precise de Node.

## Integração com WhatsApp

### WhatsApp integrado (Evolution API inclusa)

O `compose.yaml` já traz o serviço `evolution` (Evolution API v2 com banco próprio). Com ele ativo, a ótica cria um canal **WhatsApp por QR Code › WhatsApp integrado**, clica em **Conectar** e lê o QR Code (ou digita o código de pareamento) no celular. O Ocular cria a instância, configura o webhook e acompanha se o número está conectado.

- **Docker:** defina `EVOLUTION_API_KEY` (e `EVOLUTION_DB_PASSWORD`) no `.env` e rode `docker compose up -d`.
- **XAMPP:** a Evolution API precisa do Docker Desktop. Rode só ela com `docker compose up -d evolution` e, em `app/config/local.php`, informe `EVOLUTION_URL` (`http://127.0.0.1:8081`), `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_BASE` (`http://host.docker.internal/Otica-SD/app/public/api`). Deixe o processador (`app\worker.php`) rodando.

### Envio seguro de campanhas (WhatsApp por QR Code)

A Meta bloqueia números que se comportam como disparadores. Campanhas pelos canais Evolution e Z-API seguem regras fixas para reduzir esse risco:

- **Aquecimento:** número recém-conectado envia até 30 mensagens automáticas por dia, subindo para 60 (dia 4), 100 (dia 8), 180 (dia 15) e 250 (dia 31). O limite pode ser definido no canal.
- **Ritmo:** uma mensagem por vez no número, com intervalo aleatório (padrão 45–120 s) e pausa longa a cada lote (padrão 15 min a cada 20). Duas campanhas no mesmo número não somam velocidade.
- **Qualidade do público:** números sem WhatsApp são pulados antes do envio; quem já conversou com a ótica recebe primeiro; o aceite de mensagens vem marcado por padrão.
- **Descadastro:** rodapé "responda SAIR"; quem responde SAIR, PARAR, STOP etc. perde o aceite, sai das campanhas pendentes e recebe uma confirmação.
- **Pausa automática** se o WhatsApp desconectar ou se as falhas se acumularem.

Nada disso garante que a Meta não bloqueie o número. Para volume alto, use a API oficial (Meta Cloud).

### Outros provedores

Configure em **Configurações › Canais**. Cada canal mostra a URL de webhook a ser cadastrada no provedor:

| Modo | O que informar | Webhook |
| --- | --- | --- |
| Manual (wa.me) | nada | — |
| Meta Cloud API (oficial) | Phone number ID, token, App secret, verify token | URL de callback + verify token no app da Meta (campo *messages*) |
| Evolution API (servidor próprio) | URL do servidor, API key, instância | Configurado ao clicar em **Conectar** (eventos `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`) |
| Z-API | ID da instância, token, client token | Webhook "Ao receber" |
| Instagram / Messenger | Page ID, token da página, App secret | Webhook da página (campo *messages*) |

Fora da janela de 24 horas, a API oficial exige **modelos aprovados**: informe o nome do modelo da Meta em *Modelos de mensagem* para usá-lo nas campanhas.

## API para outros sistemas

`GET /api/index.php?action=clients|products|sales|quotes|service_orders|partners` com o cabeçalho `Authorization: Bearer ok_...` (chave criada em *Configurações › Integrações*). Webhooks de saída enviam `X-Ocular-Event` e `X-Ocular-Signature: sha256=HMAC(corpo, segredo)`.

## Segurança

Senhas com `password_hash`, consultas parametrizadas, sessão HttpOnly/SameSite, token CSRF, isolamento por ótica em todas as consultas (a ótica vem sempre da sessão), limitação de tentativas de login, validação de tipo real dos arquivos enviados e armazenamento dos anexos fora da pasta pública (com bloqueio por `.htaccess` em instalações Apache).

## Testes

`bash tests/smoke.sh` valida o fluxo principal contra a ótica de demonstração (cliente, venda com item livre e parcelas, OS, PDF, campanha sem duplicidade, cancelamento com estorno).

`python3 tests/fiscal_http.py` valida o fluxo fiscal de teste por HTTP contra os contêineres locais. Ele cria uma ótica temporária, verifica pendências cadastrais e do XSD, descontos, prévia XML sem assinatura, PDF, cancelamento e nova simulação, e remove os dados ao terminar.

Consulte o [guia da estrutura](docs/estrutura.md) e o [histórico de versões](CHANGELOG.md).
