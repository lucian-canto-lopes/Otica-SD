# Ocular — CRM e gestão operacional para óticas

Protótipo acadêmico de Sistemas Distribuídos. O Ocular reúne relacionamento com clientes, vendas, estoque, parceiros e ordens de serviço em uma plataforma multiempresa. A administração geral controla as óticas e suas assinaturas, enquanto cada estabelecimento acessa somente os próprios dados.

A interface usa HTML, CSS e JavaScript; a API e o processador de lembretes usam PHP 8.3; e os dados ficam no MySQL 8.4. Os componentes são executados em quatro serviços Docker. O Nginx entrega a interface e encaminha `/api/` à API por HTTP; a API e o worker acessam o banco pela rede interna do Compose. O navegador não acessa diretamente o banco.

## Organização do código

Consulte o [guia da estrutura](docs/estrutura.md) para conhecer as pastas, acompanhar o fluxo de uma requisição e localizar cada funcionalidade. A entrada da API fica em `app/api/index.php`, as regras em `app/src/controllers/` e os módulos da interface em `app/public/js/`.

## Executar

Requisitos: Docker Engine e Docker Compose v2.

```sh
docker compose up --build -d
```

Acesse http://localhost:8080. A primeira execução baixa as imagens e prepara o banco; pode levar alguns minutos.

O Compose inicia estes serviços:

| Serviço | Responsabilidade |
| --- | --- |
| `frontend` | Publica a interface e encaminha `/api/` |
| `api` | Autentica usuários e executa as regras de negócio |
| `worker` | Prepara lembretes em segundo plano a cada cinco minutos |
| `db` | Armazena os dados no MySQL |

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Administrador geral | admin@sistema.test | admin123 |
| Ótica Central | dono@otica.test | otica123 |
| Ótica Horizonte | dono@segunda.test | otica123 |

Todos os registros iniciais são fictícios. As credenciais são exclusivas desta demonstração local.

Para parar sem apagar dados: `docker compose down`. O volume `mysql_data` preserva os cadastros. Alterações na API ou no worker exigem nova execução com `--build`; a interface é montada diretamente da pasta `app/public`.

## Funcionalidades e regras

- **Administração geral:** cadastro de óticas e de seus responsáveis, consulta das empresas e controle manual da assinatura como avaliação, ativa ou suspensa.
- **Identidade da ótica:** cada responsável pode definir o nome e o logo exibidos no próprio ambiente.
- **Clientes e CRM:** cadastro de telefone, e-mail, data de nascimento, próximo contato, observações e aceite para recebimento de mensagens. A data do aceite fica registrada e a listagem também apresenta a última compra.
- **Interações:** histórico de contatos por WhatsApp, ligação, atendimento presencial, e-mail ou outro canal, com data, assunto e observações.
- **Central de relacionamento:** lembretes de aniversário, renovação dos óculos, retirada, acompanhamento ou outro motivo, vinculados a clientes que autorizaram mensagens e marcados como pendentes ou concluídos.
- **Preparação automática:** ao salvar um cliente, os lembretes de próximo contato e aniversário são criados imediatamente; uma venda agenda a renovação dos óculos para um ano após a data do pagamento; quando uma ordem chega à etapa pronta, a retirada também aparece na central na mesma hora. O worker repete a conferência a cada cinco minutos como garantia. Somente clientes com aceite e telefone entram nesse fluxo, e uma chave de origem evita duplicações.
- **WhatsApp:** os atalhos abrem uma conversa no WhatsApp com o telefone cadastrado. O contato e o envio da mensagem são realizados manualmente; o protótipo não usa a API oficial do WhatsApp nem envia mensagens automaticamente.
- **Parceiros:** cadastro de fornecedores e laboratórios. Produtos podem ser vinculados a um fornecedor, e ordens de serviço a um laboratório.
- **Vendas e estoque:** cada venda aceita vários produtos e quantidades, registra a data do pagamento e agenda o relacionamento de renovação. Os preços vêm do banco, o total é calculado na API e o pagamento não pode superar o total.
- **Ordens de serviço:** acompanhamento nas etapas recebida, enviada ao laboratório, em produção no laboratório, recebida do laboratório, pronta e entregue. Cada alteração cria um evento no histórico com data e observação.
- **Painel:** clientes, estoque, vendas, valores a receber, aniversários dos próximos 30 dias, lembretes pendentes, ordens atrasadas e produtos com estoque baixo.
- **Consulta rápida:** os indicadores do painel e as linhas das listagens abrem cards com as informações completas sem trocar de tela.

Todas as consultas operacionais usam a empresa da sessão. IDs enviados pelo navegador não permitem acessar clientes, parceiros, produtos, ordens, interações ou lembretes de outra ótica. Empresas suspensas perdem o acesso operacional imediatamente, inclusive em sessões existentes.

A venda, seus itens e todas as baixas de estoque são gravados em uma transação com bloqueio dos produtos, evitando vendas concorrentes acima do estoque disponível. Se um item falhar, nenhum estoque é alterado. As mudanças de etapa de uma ordem e seu evento de histórico também são gravados em uma única transação.

O sistema usa senhas com `password_hash`, consultas parametrizadas, sessão HttpOnly/SameSite e token CSRF para alterações autenticadas.

## API

Endereço: `/api/index.php?action=RECURSO`. Entrada e saída JSON.

| Recurso | Métodos | Finalidade |
| --- | --- | --- |
| login | POST | Autentica e estabelece a sessão |
| me | GET | Retorna usuário, empresa e token CSRF |
| logout | POST | Encerra a sessão |
| companies | GET, POST, PATCH, DELETE | Administra óticas e assinaturas; exclusivo do administrador geral |
| branding | GET, PATCH | Consulta e altera nome e logo; exclusivo do responsável da ótica |
| dashboard | GET | Retorna indicadores da ótica |
| clients | GET, POST, PATCH | Lista, cadastra e atualiza clientes |
| partners | GET, POST | Lista e cadastra fornecedores e laboratórios |
| products | GET, POST | Produtos, estoque e vínculo com fornecedor |
| sales | GET, POST | Vendas e baixa de estoque |
| orders | GET, POST, PATCH | Ordens, laboratório, etapa atual e histórico |
| interactions | GET, POST | Histórico de contatos com clientes |
| reminders | GET, POST, PATCH | Lembretes e alteração entre pendente e concluído |

Requisições autenticadas de alteração exigem o cookie de sessão e o cabeçalho `X-CSRF-Token` retornado por `me`.

## Roteiro de demonstração

Com os contêineres em execução, use `python3 tests/smoke.py` para validar os fluxos originais e `python3 tests/crm_smoke.py` para validar clientes, parceiros, vínculos, interações, lembretes, ordens e isolamento entre óticas.

Para confirmar o processamento em segundo plano, consulte o log após iniciar os serviços:

```sh
docker compose logs --tail=20 worker
```

As ações do cadastro e das ordens criam os lembretes imediatamente. O worker executa uma primeira verificação ao iniciar e depois repete o trabalho a cada cinco minutos para recuperar qualquer pendência. Os lembretes podem ser conferidos na **Central de relacionamento**. O aceite é desmarcado por padrão; marque-o no cadastro do cliente somente após receber a autorização.

1. Entre na Ótica Central e cadastre um cliente com aniversário, próximo contato e aceite para mensagens.
2. Cadastre um fornecedor e um laboratório na área **Parceiros**.
3. Cadastre um produto vinculado ao fornecedor, registre uma venda e confira o estoque e os indicadores.
4. Registre uma interação com o cliente e crie um lembrete na central de relacionamento.
5. Abra uma ordem vinculada ao laboratório e avance pelas seis etapas, observando o histórico.
6. Use um atalho do WhatsApp e confirme que a conversa é aberta para realização manual do contato.
7. Entre na Ótica Horizonte e confira que os dados da Central não aparecem.
8. Entre como administrador geral, cadastre uma ótica e acesse com o responsável criado.
9. Suspenda uma ótica e confirme que ela perde o acesso; reative para restaurá-lo.

## Limites e evolução

Assinaturas são administradas manualmente, sem cobrança real. O worker prepara os lembretes na tabela, mas não envia WhatsApp, e-mail ou qualquer outra mensagem. A integração com a API oficial do WhatsApp, emissão fiscal, recuperação de senha, filiais, funcionários e permissões adicionais, recebimentos posteriores e ajustes de estoque ficam para próximas etapas.

Os contêineres demonstram a comunicação entre interface, API, worker e banco, mas ainda não há fila de mensagens, replicação, alta disponibilidade nem sessões distribuídas.

O endereço publicado fica restrito ao computador local. Para hospedagem real, será necessário preparar HTTPS, segredos próprios, backups, limitação de tentativas de login e gestão das sessões. `DB_PASSWORD` e `DB_ROOT_PASSWORD` permitem substituir as senhas de demonstração na criação inicial do banco.
