# Guia de leitura do projeto

O Ocular é uma aplicação multiempresa com duas áreas. O administrador geral gerencia óticas e assinaturas; o responsável de cada ótica usa os recursos de CRM e gestão operacional. O ID da empresa vem da sessão autenticada e limita todas as consultas e referências entre registros.

A solução mantém quatro serviços: o Nginx entrega a interface e encaminha requisições HTTP à API PHP; a API aplica as regras de negócio; o worker prepara lembretes em segundo plano; e o MySQL armazena os dados. Os componentes são executados em contêineres e se comunicam pela rede do Docker Compose.

## Mapa dos arquivos

```text
app/
├── public/                   Interface entregue ao navegador
│   ├── index.html            Estrutura principal, navegação e modal
│   ├── styles.css            Estilos, responsividade e temas claro/escuro
│   ├── app.js                Inicialização, navegação, eventos e salvamento
│   └── js/
│       ├── api.js            Requisições HTTP e token da sessão
│       ├── constants.js      Títulos, tipos e nomes das etapas
│       ├── dashboard.js      Indicadores e próximas entregas
│       ├── branding.js       Nome, logo e prévia da identidade da ótica
│       ├── forms.js          Formulários dos recursos da aplicação
│       ├── tables.js         Listagens, status e atalhos de WhatsApp
│       └── utils.js          Elementos, datas, moeda, telefone e escape HTML
├── api/
│   └── index.php             Entrada HTTP e encaminhamento das ações
├── src/                      Código interno da API, fora da pasta pública
│   ├── bootstrap.php         Carregamento dos arquivos e início da sessão
│   ├── http.php              Leitura de JSON e envio de respostas
│   ├── auth.php              Login, usuário autenticado, CSRF e assinatura
│   ├── validation.php        Validação de campos e vínculos da mesma empresa
│   └── controllers/
│       ├── companies.php     Óticas, responsáveis e assinaturas
│       ├── branding.php      Nome e logo da ótica autenticada
│       ├── dashboard.php     Indicadores operacionais e de relacionamento
│       ├── clients.php       Clientes e dados de acompanhamento
│       ├── partners.php      Fornecedores e laboratórios
│       ├── products.php      Produtos, estoque e fornecedor
│       ├── sales.php         Vendas, cálculo do total e baixa de estoque
│       ├── orders.php        Ordens, laboratório, etapas e histórico
│       ├── interactions.php  Histórico de contatos com clientes
│       └── reminders.php     Lembretes e situação de atendimento
├── config/database.php       Conexão PDO e consultas parametrizadas
├── seed.php                  Evolução do esquema e contas de demonstração
├── worker.php                Preparação periódica de lembretes
└── Dockerfile                Construção do contêiner PHP
db/init.sql                   Esquema e dados da primeira inicialização
tests/smoke.py                Verificação dos fluxos básicos pela API
tests/crm_smoke.py            Verificação dos recursos de CRM e isolamento
compose.yaml                  Serviços, rede e volume do banco
nginx.conf                    Interface e encaminhamento da API
```

## Arquitetura e serviços

- `frontend` usa Nginx, publica a porta local `8080` e encaminha chamadas de `/api/` para o serviço `api`.
- `api` executa a aplicação PHP, autentica a sessão e atende as operações feitas pela interface.
- `worker` usa a mesma imagem PHP da API, executa `app/worker.php` continuamente e acessa somente o banco. O intervalo padrão é de 300 segundos.
- `db` executa MySQL 8.4 e mantém os dados no volume `mysql_data`.

O worker é independente das requisições da interface. Assim, a preparação dos lembretes continua ocorrendo enquanto os serviços estiverem ativos, mesmo que nenhum usuário esteja com o sistema aberto.

## Dados e relacionamentos

- `companies` e `users` representam as óticas, o administrador geral e os responsáveis.
- `clients` guarda telefone, e-mail, data de nascimento, próximo contato e observações. A última compra é calculada ao consultar os clientes.
- `partners` reúne fornecedores e laboratórios da ótica.
- `products` pode apontar para um parceiro do tipo fornecedor.
- `sales` liga cliente e produto e registra quantidade, total e valor pago.
- `orders` liga cliente e, opcionalmente, laboratório. `order_events` preserva cada mudança de etapa com data e observação.
- `interactions` registra o canal, o assunto, as observações e a data de cada contato com o cliente.
- `reminders` registra tarefas de aniversário, renovação, retirada, acompanhamento ou outro tipo, com vencimento e situação. `source_key` identifica a origem dos registros automáticos e evita duplicações dentro da mesma empresa.

As tabelas operacionais possuem `company_id`. Além de filtrar as listagens, a API valida se clientes, fornecedores e laboratórios referenciados pertencem à empresa autenticada e têm o tipo correto.

## Fluxos principais

### Relacionamento com o cliente

O formulário de cliente em `forms.js` coleta os dados de contato e acompanhamento. `app.js` envia o registro por `requestApi()`; `index.php` autentica a sessão e chama `handleClients()`. Depois, a ótica pode registrar contatos em `interactions` e tarefas em `reminders`. O worker também pode preparar lembretes a partir das datas e ordens cadastradas.

Os atalhos de WhatsApp montam um link a partir do telefone do cliente e abrem a conversa. O operador realiza o contato manualmente. Não existe envio automático nem integração com a API oficial do WhatsApp.

### Processamento de lembretes

`app/worker.php` executa uma verificação assim que o contêiner inicia e repete o processamento a cada cinco minutos. Para empresas em avaliação ou ativas, ele prepara lembretes pendentes para:

- clientes cuja data de próximo contato está entre hoje e os próximos 30 dias;
- clientes que fazem aniversário entre hoje e os próximos 30 dias;
- ordens que chegaram à etapa **Pronta**, indicando a retirada pelo cliente.

Cada tarefa automática recebe uma `source_key`. A restrição única por empresa permite repetir a consulta com segurança sem inserir o mesmo lembrete novamente. O worker grava tarefas na tabela `reminders`; ele não envia mensagens pelo WhatsApp, e-mail ou outro canal.

### Produtos e fornecedores

Ao abrir o formulário de produto, a interface consulta `partners` e oferece somente parceiros do tipo fornecedor. A API repete essa validação antes de gravar `supplier_id`, impedindo o uso de um laboratório ou de um registro de outra ótica.

### Ordens e laboratórios

O formulário de ordem oferece somente parceiros do tipo laboratório. Uma nova ordem começa como **Recebida** e cria o primeiro item do histórico. As seis etapas são:

1. Recebida.
2. Enviada ao laboratório.
3. Em produção no laboratório.
4. Recebida do laboratório.
5. Pronta.
6. Entregue.

Cada alteração de etapa atualiza a ordem e inclui um registro em `order_events` dentro da mesma transação.

### Painel

`dashboard.php` calcula os totais de clientes, peças em estoque, vendas e valores a receber. A evolução de CRM acrescenta aniversários nos próximos 30 dias, lembretes pendentes, ordens atrasadas e produtos com três unidades ou menos. A interface também lista ordens ainda não entregues pela previsão de entrega.

## Endpoints da evolução de CRM

- `partners`: `GET` lista e `POST` cadastra fornecedores ou laboratórios.
- `interactions`: `GET` lista e `POST` registra um contato com o cliente.
- `reminders`: `GET` lista, `POST` cria e `PATCH` marca como pendente ou concluído.

Os recursos anteriores permanecem disponíveis. `clients` agora também aceita `PATCH`; `products` recebe o fornecedor; e `orders` retorna laboratório e histórico, além de registrar uma observação a cada `PATCH` de etapa.

## Por onde começar

1. Leia `compose.yaml` para entender os quatro serviços.
2. Leia `app/api/index.php` para acompanhar a autenticação e o roteamento de uma requisição.
3. Abra o controlador correspondente em `app/src/controllers/` para encontrar a regra de negócio e o SQL.
4. Leia `app/public/app.js` para acompanhar a navegação e o envio dos formulários.
5. Consulte `forms.js`, `tables.js` e `dashboard.js` para alterar a apresentação dos recursos.
6. Leia `app/worker.php` para acompanhar a preparação dos lembretes em segundo plano.
7. Consulte `db/init.sql` para visualizar as tabelas e `app/seed.php` para entender como um volume existente recebe as novas estruturas.

## Convenções

- Nomes de funções e variáveis descrevem seu papel em inglês; textos da interface e explicações estão em português.
- PHP e Python usam quatro espaços; JavaScript, HTML e CSS usam dois.
- Funções com prefixo `handle` tratam um recurso da API e encerram a resposta com `sendJson` ou `sendError`.
- O ID da empresa vem da sessão autenticada. Preserve esse filtro nas consultas e valide referências a outros registros.
- Valores de venda são calculados em centavos na API; o banco armazena `DECIMAL`.
- A interface usa módulos JavaScript nativos, sem etapa de compilação. Os dados inseridos em templates HTML passam por `escapeHtml`.
- Os controladores mantêm as consultas próximas às regras nesta fase do protótipo; não há framework nem camadas adicionais obrigatórias.
- Os dados de `db/init.sql` são importados somente ao criar o volume. `app/seed.php` aplica as estruturas adicionais ao iniciar a API com um banco já existente.

## Formatação e validação

Docker continua sendo suficiente para executar o sistema. Node.js e npm são opcionais e usados somente para manter a formatação:

```sh
npm ci
npm run format
npm run format:check
```

Após modificar a API, reconstrua o contêiner e execute as duas verificações:

```sh
docker compose up --build -d
python3 tests/smoke.py
python3 tests/crm_smoke.py
```

Confira também se o worker iniciou e concluiu a preparação periódica:

```sh
docker compose logs --tail=20 worker
```

Os testes criam empresas e registros fictícios identificados como automáticos e não apagam cadastros existentes. Para validar a interface, entre como ótica e percorra clientes, interações, central de relacionamento, parceiros, produtos e ordens. Os lembretes preparados pelo worker aparecem na central de relacionamento. Entre como administrador geral para verificar a área de óticas e assinaturas.
