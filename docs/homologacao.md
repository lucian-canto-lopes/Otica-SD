# Preparação para homologação NF-e

Esta etapa **não faz transmissões**. A rota `GET /api/index.php?action=fiscal_homologation&sale_id=ID` mostra os pré-requisitos da ótica e da venda. O painel da venda exibe o mesmo resultado apenas a proprietários e gerentes. A simulação local continua separada.

## O que já está preparado

- A rota identifica a autorizadora SVRS para as UFs atendidas por ela, incluindo PA. Para outras UFs, a rota mostra que o endereço ainda precisa ser configurado. A relação deve ser conferida no [Portal da NF-e](https://hom.nfe.fazenda.gov.br/portal/webServices.aspx) antes de transmitir.
- A configuração privada permite vincular **um certificado A1 a uma ótica de teste** pelo ID, sem guardar o PFX ou a senha no banco, na imagem Docker ou no Git. A API verifica se os arquivos estão acessíveis, se o PFX abre com a senha, se o certificado está no prazo de validade e se a chave privada corresponde. Quando consegue extrair o CNPJ do certificado, compara-o ao CNPJ cadastrado na ótica. **Ainda não valida a cadeia de confiança ICP-Brasil.**
- A tela lista os bloqueios técnicos e fiscais. A resposta não contém senha, chave privada, conteúdo do PFX ou caminho dos arquivos.

## Configuração futura do certificado

1. Coloque o PFX e um arquivo de texto com sua senha em `secrets/`, fora do versionamento. Restrinja as permissões dos dois arquivos. **Não envie a senha pelo chat nem a inclua no `.env` ou no Compose.**
2. Copie `compose.homologacao.example.yaml` para `compose.homologacao.yaml`. O arquivo local e `secrets/` são ignorados pelo Git.
3. Configure em `.env` somente valores não secretos: `NFE_HOMOLOGATION_COMPANY_ID` com o ID da ótica, `NFE_HOMOLOGATION_PFX_PATH=/run/secrets/nfe-a1.pfx` e `NFE_HOMOLOGATION_PASSWORD_FILE=/run/secrets/nfe-a1-password`.
4. Inicie a API com `docker compose -f compose.yaml -f compose.homologacao.yaml up -d --build api` e consulte a preparação no detalhe de uma venda.

A configuração inicial é intencionalmente limitada a **uma ótica para o primeiro teste real**. Não reutilize o certificado de uma ótica em outra. Uma operação multiótica exigirá gerenciamento individual e seguro dos certificados.

## O que falta antes do envio real

1. Confirmar com a ótica e seu contador o credenciamento NF-e na UF, os códigos e o cálculo de tributos para a operação escolhida. O XML local atual tem **tributos e forma de pagamento fictícios**.
2. Mapear os pagamentos reais e demais campos exigidos pela operação para o XML; remover os textos de prévia local.
3. Implementar assinatura XML Digital Signature com o certificado A1, validar o XML **completo** no XSD e verificar a assinatura.
4. Integrar o serviço `NFeAutorizacao4` da UF em homologação, guardar XML assinado, recibo, `cStat`, `xMotivo` e protocolo, e consultar o recibo quando a resposta for assíncrona. Usar idempotência e trilha de auditoria para evitar envio duplicado.
5. Só depois habilitar a ação de transmitir. A rota atual é somente leitura e continuará com `ready: false` até essas partes serem implementadas e testadas.

Referências: [Manual de Orientação do Contribuinte 7.0](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-visao-geral.pdf), [serviços de homologação](https://hom.nfe.fazenda.gov.br/portal/webServices.aspx) e [perguntas frequentes do Portal da NF-e](https://www.nfe.fazenda.gov.br/Portal/perguntasFrequentes.aspx?tipoConteudo=4figqHYhYho%3D).
