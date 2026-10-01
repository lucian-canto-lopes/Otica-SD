# Guia de leitura do projeto

O projeto mantém três serviços: o Nginx entrega a interface e encaminha requisições HTTP à API PHP; a API consulta o MySQL. A reorganização não altera as URLs, o formato JSON ou as tabelas existentes.

## Mapa dos arquivos

```text
app/
├── public/                   Interface entregue ao navegador
│   ├── index.html            Estrutura das telas e do modal
│   ├── styles.css            Estilos divididos em seções comentadas
│   ├── app.js                Inicialização, navegação e eventos
│   └── js/
│       ├── api.js            Requisições HTTP e token da sessão
│       ├── constants.js      Títulos, botões e nomes das etapas
│       ├── dashboard.js      Apresentação dos indicadores e entregas
│       ├── forms.js          Campos dos formulários e total da venda
│       ├── tables.js         Listagens e seletores de status
│       └── utils.js          Seleção de elementos, datas, moeda e escape HTML
├── api/
│   └── index.php             Entrada HTTP e encaminhamento das ações
├── src/                      Código interno da API, fora da pasta pública
│   ├── bootstrap.php         Carregamento dos arquivos e início da sessão
│   ├── http.php              Leitura de JSON e envio de respostas
│   ├── auth.php              Login, usuário autenticado, CSRF e assinatura
│   ├── validation.php        Validação de campos e vínculo do cliente à empresa
│   └── controllers/
│       ├── companies.php     Empresas, responsáveis e assinaturas
│       ├── dashboard.php     Consultas dos indicadores
│       ├── clients.php       Cadastro e consulta de clientes
│       ├── products.php      Cadastro e consulta de produtos
│       ├── sales.php         Vendas, cálculo do total e baixa de estoque
│       └── orders.php        Ordens e alteração de etapa
├── config/database.php      Conexão PDO e execução de consultas parametrizadas
├── seed.php                 Criação das contas de demonstração
└── Dockerfile               Construção do contêiner PHP
db/init.sql                  Tabelas e dados iniciais
tests/smoke.py               Verificação dos fluxos pela API
compose.yaml                 Serviços, rede e volume do banco
nginx.conf                   Publicação da interface e encaminhamento da API
```

## Por onde começar

1. Leia `compose.yaml` para entender os três serviços.
2. Leia `app/api/index.php` para acompanhar uma requisição no servidor.
3. Abra o arquivo correspondente em `app/src/controllers/` para encontrar a regra de negócio e o SQL.
4. Leia `app/public/app.js` para acompanhar a navegação e o envio de formulários.
5. Consulte `forms.js`, `tables.js` e `dashboard.js` para alterar a apresentação.

Exemplo de venda: o formulário gera os campos em `forms.js`; `saveRecord()` em `app.js` envia os dados por `requestApi()`; `index.php` autentica a sessão e chama `handleSales()`. Esse controlador valida o cliente, bloqueia o produto durante a transação, calcula o total no servidor e grava a venda junto da baixa de estoque.

## Convenções

- Nomes de funções e variáveis descrevem seu papel em inglês; textos da interface e explicações estão em português.
- PHP e Python usam quatro espaços; JavaScript, HTML e CSS usam dois.
- Funções com prefixo `handle` tratam um recurso da API e encerram a resposta com `sendJson` ou `sendError`.
- O ID da empresa vem da sessão autenticada. Preserve esse filtro em novas consultas operacionais.
- Valores de venda são calculados em centavos na API; o banco armazena `DECIMAL`.
- A interface usa módulos JavaScript nativos, sem etapa de compilação. Os dados inseridos em templates HTML passam por `escapeHtml`.
- Os controladores mantêm consultas próximas às regras nesta fase do protótipo; não há framework nem camadas adicionais obrigatórias.
- Os dados iniciais do SQL só são importados na criação do volume. Formatar esse arquivo não modifica bancos já existentes.

## Formatação e validação

Docker continua sendo suficiente para executar o sistema. Node.js e npm são opcionais, usados apenas para manter a formatação:

```sh
npm ci
npm run format
npm run format:check
```

Após modificar a API, reconstrua o contêiner e execute os testes:

```sh
docker compose up --build -d
python3 tests/smoke.py
```

O teste cria uma empresa fictícia identificada como teste automatizado. Ele não apaga cadastros existentes. Para validar a interface, entre como ótica, abra as listagens e os formulários; entre como administrador para verificar a área de empresas.
