# ÓticaFlow — protótipo de gestão de óticas

Projeto acadêmico de Sistemas Distribuídos. Interface HTML/CSS/JavaScript, API PHP 8.3 e MySQL 8.4, executados em três serviços Docker. O Nginx entrega a interface e encaminha `/api/` à API por HTTP; a API acessa o banco pela rede interna do Compose. O navegador não acessa diretamente o banco.

## Executar

Requisitos: Docker Engine e Docker Compose v2.

```sh
docker compose up --build -d
```

Acesse http://localhost:8080. A primeira execução baixa as imagens e prepara o banco; pode levar alguns minutos.

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Administrador geral | admin@sistema.test | admin123 |
| Ótica Central | dono@otica.test | otica123 |
| Ótica Horizonte | dono@segunda.test | otica123 |

Todos os registros iniciais são fictícios. As credenciais são exclusivas desta demonstração local.

Para parar sem apagar dados: `docker compose down`. O volume `mysql_data` preserva cadastros e vendas. Alterações na API exigem nova execução com `--build`; a interface é montada diretamente da pasta `app/public`.

## Funcionalidades e regras

- Administrador geral: cadastrar empresas com conta de responsável; controlar assinatura em avaliação, ativa ou suspensa.
- Cada ótica: painel, cadastro de clientes, produtos e estoque, registro de venda e acompanhamento de ordens de serviço.
- Todas as consultas operacionais usam a empresa da sessão. IDs enviados pelo navegador não permitem escolher outra empresa.
- Uma venda possui um produto e uma quantidade. O preço vem do banco, o total é calculado na API, e o pagamento não pode superar o total.
- A venda e a baixa de estoque são gravadas numa transação com bloqueio da linha do produto, evitando vendas concorrentes acima do estoque disponível.
- Ordens: recebida, em produção, pronta e entregue; nesta versão o operador pode corrigir livremente a etapa.
- Empresas suspensas perdem acesso operacional imediatamente, inclusive em sessões existentes.
- Senhas com `password_hash`, consultas parametrizadas, sessão HttpOnly/SameSite e token CSRF para alterações autenticadas.

## API

Endereço: `/api/index.php?action=RECURSO`. Entrada e saída JSON.

| Recurso | Métodos | Finalidade |
| --- | --- | --- |
| login | POST | E-mail e senha; estabelece sessão |
| me | GET | Usuário, empresa e token CSRF |
| logout | POST | Encerra sessão |
| companies | GET, POST, PATCH | Empresas e status de assinatura; administrador geral |
| dashboard | GET | Indicadores da ótica |
| clients | GET, POST | Clientes |
| products | GET, POST | Produtos |
| sales | GET, POST | Vendas e baixa de estoque |
| orders | GET, POST, PATCH | Ordens e etapas |

Requisições autenticadas de alteração exigem cookie de sessão e cabeçalho `X-CSRF-Token` retornado por `me`.

## Roteiro de demonstração

Validação automatizada: `python3 tests/smoke.py` com os contêineres em execução. O teste cria uma empresa fictícia própria e verifica autenticação, CSRF, isolamento, vendas, estoque, ordens e suspensão de acesso.

1. Entre na Ótica Central e cadastre um cliente e um produto.
2. Registre uma venda e confira o estoque e os indicadores.
3. Tente vender quantidade maior que a disponível: a operação deve ser recusada.
4. Abra uma ordem e altere a etapa até entregue.
5. Entre na Ótica Horizonte e confira que os dados da Central não aparecem.
6. Entre como administrador, cadastre uma empresa e acesse com o responsável criado.
7. Suspenda uma empresa e confirme que ela perde acesso; reative para restaurá-lo.

## Limites e evolução

Assinaturas são administradas manualmente, sem cobrança real. Filiais, funcionários e permissões adicionais, múltiplos itens por venda, recebimentos posteriores, ajustes de estoque, emissão fiscal, recuperação de senha e receita oftalmológica estruturada ficam para próximas etapas. Os contêineres demonstram comunicação entre serviços, mas ainda não há replicação, alta disponibilidade nem sessões distribuídas.

O endereço publicado fica restrito ao computador local. Para hospedagem real, preparar HTTPS, segredos próprios, backups, limitação de tentativas de login e gestão das sessões. `DB_PASSWORD` e `DB_ROOT_PASSWORD` permitem substituir as senhas de demonstração na criação inicial do banco.
