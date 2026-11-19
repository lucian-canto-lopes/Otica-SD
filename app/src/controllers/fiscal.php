<?php
declare(strict_types=1);

/**
 * Formato legado de demonstração, mantido para as simulações anteriores.
 */
function fiscalAmount(mixed $value): string
{
    return number_format((float) $value, 2, '.', '');
}

function fiscalXmlField(string $name, mixed $value): string
{
    $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', (string) $value);
    $escaped = htmlspecialchars($clean ?? '', ENT_XML1 | ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    return "<{$name}>{$escaped}</{$name}>";
}

function fiscalItemCode(array $item, string $field): string
{
    $own = trim((string) ($item[$field] ?? ''));
    return $own !== '' ? $own : trim((string) ($item['product_' . $field] ?? ''));
}

/** Congela cadastro, itens e totais no instante em que a simulação é criada. */
function fiscalSnapshot(array $sale, array $company): array
{
    if (!$sale['items']) {
        sendError('Adicione itens à venda antes de criar uma simulação fiscal.', 409);
    }
    $items = [];
    $grossCents = 0;
    $itemDiscountCents = 0;
    foreach ($sale['items'] as $index => $item) {
        $gross = (int) round((float) $item['quantity'] * (float) $item['unit_price'] * 100);
        $discount = (int) round((float) $item['discount'] * 100);
        $total = (int) round((float) $item['total'] * 100);
        if ($gross - $discount !== $total) {
            sendError('Os valores dos itens da venda não estão consistentes para a simulação.', 409);
        }
        $grossCents += $gross;
        $itemDiscountCents += $discount;
        $items[] = [
            'number' => $index + 1,
            'product_id' => $item['product_id'] ? (int) $item['product_id'] : null,
            'sku' => (string) ($item['sku'] ?? ''),
            'description' => (string) $item['description'],
            'unit' => (string) ($item['product_unit'] ?? 'UN'),
            'fiscal_ncm' => fiscalItemCode($item, 'fiscal_ncm'),
            'fiscal_cfop' => fiscalItemCode($item, 'fiscal_cfop'),
            'fiscal_origin' => fiscalItemCode($item, 'fiscal_origin'),
            'fiscal_tax_situation' => fiscalItemCode($item, 'fiscal_tax_situation'),
            'quantity' => (string) $item['quantity'],
            'unit_price' => fiscalAmount($item['unit_price']),
            'gross' => fiscalAmount($gross / 100),
            'discount' => fiscalAmount($discount / 100),
            'total' => fiscalAmount($total / 100),
        ];
    }
    $subtotalCents = (int) round((float) $sale['subtotal'] * 100);
    $saleDiscountCents = (int) round((float) $sale['discount'] * 100);
    $totalCents = (int) round((float) $sale['total'] * 100);
    if ($grossCents - $itemDiscountCents !== $subtotalCents || $subtotalCents - $saleDiscountCents !== $totalCents) {
        sendError('Os totais da venda não estão consistentes para a simulação.', 409);
    }
    return [
        'sale_number' => (int) $sale['number'],
        'sale_date' => (string) $sale['sale_date'],
        'issued_at' => date(DATE_ATOM),
        'client' => (string) ($sale['client_name'] ?: 'Consumidor não identificado'),
        'issuer' => [
            'name' => (string) $company['name'],
            'trade_name' => (string) $company['trade_name'],
            'document' => (string) $company['document'],
            'fiscal_ie' => (string) $company['fiscal_ie'],
            'fiscal_city_code' => (string) $company['fiscal_city_code'],
            'fiscal_crt' => (string) $company['fiscal_crt'],
            'address' => (string) $company['address'],
            'number' => (string) $company['number'],
            'neighborhood' => (string) $company['neighborhood'],
            'city' => (string) $company['city'],
            'state' => (string) $company['state'],
            'zip' => (string) $company['zip'],
        ],
        'recipient' => [
            'name' => (string) ($sale['client_name'] ?: 'Consumidor não identificado'),
            'document' => (string) ($sale['client_cpf'] ?? ''),
            'cnpj' => (string) ($sale['client_cnpj'] ?? ''),
            'fiscal_ie_indicator' => (string) ($sale['client_fiscal_ie_indicator'] ?? '9'),
            'fiscal_ie' => (string) ($sale['client_fiscal_ie'] ?? ''),
            'fiscal_city_code' => (string) ($sale['client_fiscal_city_code'] ?? ''),
            'zip' => (string) ($sale['client_zip'] ?? ''),
            'address' => (string) ($sale['client_address'] ?? ''),
            'number' => (string) ($sale['client_number'] ?? ''),
            'neighborhood' => (string) ($sale['client_neighborhood'] ?? ''),
            'city' => (string) ($sale['client_city'] ?? ''),
            'state' => (string) ($sale['client_state'] ?? ''),
        ],
        'items' => $items,
        'gross_total' => fiscalAmount($grossCents / 100),
        'item_discount' => fiscalAmount($itemDiscountCents / 100),
        'sale_discount' => fiscalAmount($saleDiscountCents / 100),
        'total_discount' => fiscalAmount(($itemDiscountCents + $saleDiscountCents) / 100),
        'subtotal' => fiscalAmount($subtotalCents / 100),
        'total' => fiscalAmount($totalCents / 100),
        'note' => 'DOCUMENTO DE TESTE - SEM VALOR FISCAL. XML demonstrativo, sem assinatura ou transmissão à SEFAZ.',
    ];
}

function fiscalSimulationXml(array $document, array $snapshot, string $status): string
{
    $issuer = $snapshot['issuer'] ?? [];
    $recipient = $snapshot['recipient'] ?? [];
    $itemsXml = '';
    $gross = 0.0;
    $itemDiscount = 0.0;
    foreach ($snapshot['items'] ?? [] as $index => $item) {
        $lineGross = (float) ($item['gross'] ?? round((float) ($item['quantity'] ?? 0) * (float) ($item['unit_price'] ?? 0), 2));
        $lineDiscount = (float) ($item['discount'] ?? 0);
        $gross += $lineGross;
        $itemDiscount += $lineDiscount;
        $itemsXml .= '<det nItem="' . ($index + 1) . '"><prod>'
            . fiscalXmlField('cProd', ($item['sku'] ?? '') ?: 'ITEM-' . ($index + 1))
            . fiscalXmlField('xProd', $item['description'] ?? '')
            . fiscalXmlField('uCom', $item['unit'] ?? 'UN')
            . fiscalXmlField('NCM', $item['fiscal_ncm'] ?? '')
            . fiscalXmlField('CFOP', $item['fiscal_cfop'] ?? '')
            . fiscalXmlField('orig', $item['fiscal_origin'] ?? '')
            . fiscalXmlField('situacaoTributaria', $item['fiscal_tax_situation'] ?? '')
            . fiscalXmlField('qCom', $item['quantity'] ?? 0)
            . fiscalXmlField('vUnCom', fiscalAmount($item['unit_price'] ?? 0))
            . fiscalXmlField('vProd', fiscalAmount($lineGross))
            . fiscalXmlField('vDesc', fiscalAmount($lineDiscount))
            . fiscalXmlField('vLiquido', fiscalAmount($item['total'] ?? ($lineGross - $lineDiscount)))
            . '</prod></det>';
    }
    // Snapshots da primeira versão guardavam apenas o total final da venda.
    $saleDiscount = (float) ($snapshot['sale_discount'] ?? max(0, round($gross - $itemDiscount - (float) ($snapshot['total'] ?? 0), 2)));
    $notice = $status === 'cancelled'
        ? 'SIMULAÇÃO CANCELADA - DOCUMENTO DE TESTE SEM VALOR FISCAL. Não transmitido à SEFAZ.'
        : 'DOCUMENTO DE TESTE - SEM VALOR FISCAL. XML demonstrativo, sem assinatura ou transmissão à SEFAZ.';
    return '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
        . '<simulacaoFiscal xmlns="urn:ocular:simulacao-fiscal:1" versao="1.0">'
        . fiscalXmlField('aviso', $notice)
        . '<ide>'
        . fiscalXmlField('mod', '55')
        . fiscalXmlField('serie', $document['series'])
        . fiscalXmlField('nNF', $document['number'])
        . fiscalXmlField('identificadorTeste', $document['access_key'])
        . fiscalXmlField('dhEmi', $snapshot['issued_at'] ?? $document['created_at'] ?? '')
        . fiscalXmlField('nVenda', $snapshot['sale_number'] ?? '')
        . '</ide>'
        . '<emit>'
        . fiscalXmlField('xNome', $issuer['name'] ?? Context::$company['name'] ?? '')
        . fiscalXmlField('xFant', $issuer['trade_name'] ?? Context::$company['trade_name'] ?? '')
        . fiscalXmlField('CNPJ', $issuer['document'] ?? Context::$company['document'] ?? '')
        . fiscalXmlField('IE', $issuer['fiscal_ie'] ?? '')
        . fiscalXmlField('CRT', $issuer['fiscal_crt'] ?? '')
        . '<enderEmit>'
        . fiscalXmlField('xLgr', $issuer['address'] ?? '')
        . fiscalXmlField('nro', $issuer['number'] ?? '')
        . fiscalXmlField('xBairro', $issuer['neighborhood'] ?? '')
        . fiscalXmlField('xMun', $issuer['city'] ?? '')
        . fiscalXmlField('cMun', $issuer['fiscal_city_code'] ?? '')
        . fiscalXmlField('UF', $issuer['state'] ?? '')
        . fiscalXmlField('CEP', $issuer['zip'] ?? '')
        . '</enderEmit></emit>'
        . '<dest>'
        . fiscalXmlField('xNome', $recipient['name'] ?? $snapshot['client'] ?? 'Consumidor não identificado')
        . (!empty($recipient['cnpj']) ? fiscalXmlField('CNPJ', $recipient['cnpj']) : fiscalXmlField('CPF', $recipient['document'] ?? ''))
        . fiscalXmlField('indIEDest', $recipient['fiscal_ie_indicator'] ?? '9')
        . fiscalXmlField('IE', $recipient['fiscal_ie'] ?? '')
        . '<enderDest>'
        . fiscalXmlField('xLgr', $recipient['address'] ?? '')
        . fiscalXmlField('nro', $recipient['number'] ?? '')
        . fiscalXmlField('xBairro', $recipient['neighborhood'] ?? '')
        . fiscalXmlField('xMun', $recipient['city'] ?? '')
        . fiscalXmlField('cMun', $recipient['fiscal_city_code'] ?? '')
        . fiscalXmlField('UF', $recipient['state'] ?? '')
        . fiscalXmlField('CEP', $recipient['zip'] ?? '')
        . '</enderDest></dest>'
        . $itemsXml
        . '<total>'
        . fiscalXmlField('vProd', fiscalAmount($snapshot['gross_total'] ?? $gross))
        . fiscalXmlField('vDescItens', fiscalAmount($snapshot['item_discount'] ?? $itemDiscount))
        . fiscalXmlField('vDescVenda', fiscalAmount($saleDiscount))
        . fiscalXmlField('vDesc', fiscalAmount($snapshot['total_discount'] ?? ($itemDiscount + $saleDiscount)))
        . fiscalXmlField('vNF', fiscalAmount($snapshot['total'] ?? 0))
        . '</total>'
        . fiscalXmlField('situacao', $status)
        . '</simulacaoFiscal>';
}

function fiscalDetail(int $id, int $companyId): array
{
    $document = fetchOne('SELECT * FROM fiscal_documents WHERE id = ? AND company_id = ?', [$id, $companyId]);
    if (!$document) sendError('Documento fiscal de teste não encontrado.', 404);
    $document['snapshot'] = decodeJsonColumn($document['snapshot'], []);
    $document['events'] = fetchAllRows(
        'SELECT event_type, message, created_at FROM fiscal_events WHERE fiscal_document_id = ? AND company_id = ? ORDER BY id',
        [$id, $companyId],
    );
    // Prévias novas permanecem imutáveis; documentos legados seguem como XML demonstrativo.
    if (($document['snapshot']['xml_layout'] ?? '') !== 'nfe4_unsigned_preview'
        && ($document['status'] === 'cancelled' || str_contains($document['xml'], '<NFe '))) {
        $document['xml'] = fiscalSimulationXml($document, $document['snapshot'], (string) $document['status']);
    }
    return $document;
}

/** Chamado com a linha da venda bloqueada para evitar edição durante a simulação. */
function hasActiveFiscalSimulation(int $companyId, int $saleId): bool
{
    return (bool) fetchValue("SELECT id FROM fiscal_documents WHERE company_id = ? AND sale_id = ? AND status <> 'cancelled' LIMIT 1", [$companyId, $saleId]);
}

function requireNoActiveFiscalSimulation(int $companyId, int $saleId, string $operation = 'alterar ou cancelar esta venda'): void
{
    if (hasActiveFiscalSimulation($companyId, $saleId)) {
        sendError('Cancele a simulação fiscal ativa antes de ' . $operation . '.', 409, ['code' => 'fiscal_document_active']);
    }
}

/**
 * Pré-validação limitada à simulação: presença, formato e contas.
 * Não verifica cadastro de códigos oficiais nem enquadramento tributário.
 */
function fiscalCheck(int $companyId, int $saleId): array
{
    $sale = saleDetail($saleId, $companyId);
    $company = fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]);
    $issues = [];
    $add = static function (string $section, string $field, string $message, string $href) use (&$issues): void {
        $issues[] = compact('section', 'field', 'message', 'href');
    };
    $companyHref = '/configuracoes/otica';
    $saleHref = '/vendas/' . $saleId . '/editar';
    $cnpj = normalizeFiscalCnpj((string) $company['document']);
    if (!preg_match('/^[A-Z0-9]{12}\d{2}$/D', $cnpj)) {
        $add('company', 'company.document', 'Informe o CNPJ da ótica com 12 caracteres alfanuméricos e 2 dígitos verificadores.', $companyHref);
    }
    if (trim((string) $company['name']) === '') {
        $add('company', 'company.name', 'Informe a razão social da ótica.', $companyHref);
    }
    if (trim((string) $company['fiscal_ie']) === '') {
        $add('company', 'company.fiscal_ie', 'Informe a inscrição estadual de teste da ótica.', $companyHref);
    }
    if (!in_array((string) $company['fiscal_crt'], ['1', '2', '3', '4'], true)) {
        $add('company', 'company.fiscal_crt', 'Selecione o código CRT da ótica.', $companyHref);
    } elseif ((string) $company['fiscal_crt'] !== '1') {
        $add('company', 'company.fiscal_crt', 'Esta prévia XSD cobre somente óticas com CRT 1 (Simples Nacional).', $companyHref);
    }
    if (!preg_match('/^\d{7}$/D', (string) $company['fiscal_city_code'])) {
        $add('company', 'company.fiscal_city_code', 'Informe o código IBGE de 7 dígitos do município da ótica.', $companyHref);
    }
    foreach ([
        'address' => 'logradouro', 'number' => 'número', 'neighborhood' => 'bairro',
        'city' => 'cidade', 'state' => 'UF',
    ] as $field => $label) {
        if (trim((string) $company[$field]) === '') {
            $add('company', 'company.' . $field, 'Informe ' . $label . ' no endereço da ótica.', $companyHref);
        }
    }
    if (!preg_match('/^\d{8}$/D', onlyDigits((string) $company['zip']))) {
        $add('company', 'company.zip', 'Informe o CEP de 8 dígitos da ótica.', $companyHref);
    }

    if (!$sale['client_id']) {
        $add('client', 'sale.client_id', 'Selecione um cliente para a simulação NF-e 55.', $saleHref);
    } else {
        $clientHref = '/clientes/' . (int) $sale['client_id'];
        $cpf = onlyDigits((string) ($sale['client_cpf'] ?? ''));
        $clientCnpj = normalizeFiscalCnpj((string) ($sale['client_cnpj'] ?? ''));
        if ($cpf === '' && $clientCnpj === '') {
            $add('client', 'client.document', 'Informe CPF ou CNPJ do cliente.', $clientHref);
        }
        if ($cpf !== '' && !preg_match('/^\d{11}$/D', $cpf)) {
            $add('client', 'client.cpf', 'O CPF do cliente deve conter 11 dígitos.', $clientHref);
        }
        if ($clientCnpj !== '' && !preg_match('/^[A-Z0-9]{12}\d{2}$/D', $clientCnpj)) {
            $add('client', 'client.cnpj', 'O CNPJ do cliente deve ter 12 caracteres alfanuméricos e 2 dígitos verificadores.', $clientHref);
        }
        if ($cpf !== '' && $clientCnpj !== '') {
            $add('client', 'client.document', 'Use CPF ou CNPJ, sem preencher ambos para o mesmo destinatário.', $clientHref);
        }
        if (trim((string) ($sale['client_name'] ?? '')) === '') {
            $add('client', 'client.name', 'Informe o nome do cliente.', $clientHref);
        }
        foreach ([
            'client_address' => 'logradouro', 'client_number' => 'número',
            'client_neighborhood' => 'bairro', 'client_city' => 'cidade', 'client_state' => 'UF',
        ] as $field => $label) {
            if (trim((string) ($sale[$field] ?? '')) === '') {
                $add('client', $field, 'Informe ' . $label . ' no endereço do cliente.', $clientHref);
            }
        }
        if (!preg_match('/^\d{8}$/D', onlyDigits((string) ($sale['client_zip'] ?? '')))) {
            $add('client', 'client.zip', 'Informe o CEP de 8 dígitos do cliente.', $clientHref);
        }
        if (!preg_match('/^\d{7}$/D', (string) ($sale['client_fiscal_city_code'] ?? ''))) {
            $add('client', 'client.fiscal_city_code', 'Informe o código IBGE de 7 dígitos do município do cliente.', $clientHref);
        }
        $indicator = (string) ($sale['client_fiscal_ie_indicator'] ?? '9');
        if (!in_array($indicator, ['1', '2', '9'], true)) {
            $add('client', 'client.fiscal_ie_indicator', 'Selecione o indicador de inscrição estadual do cliente.', $clientHref);
        }
        if ($indicator === '1' && trim((string) ($sale['client_fiscal_ie'] ?? '')) === '') {
            $add('client', 'client.fiscal_ie', 'Informe a inscrição estadual do cliente contribuinte.', $clientHref);
        }
        if ($indicator !== '9') {
            $add('client', 'client.fiscal_ie_indicator', 'Esta prévia XSD cobre somente destinatário não contribuinte (indicador 9).', $clientHref);
        }
        if (strtoupper((string) ($sale['client_state'] ?? '')) !== strtoupper((string) $company['state'])) {
            $add('client', 'client.state', 'Esta prévia XSD cobre somente venda dentro da mesma UF.', $clientHref);
        }
    }

    if ($sale['status'] === 'cancelled') {
        $add('sale', 'sale.status', 'Venda cancelada não pode gerar uma nova simulação.', '/vendas/' . $saleId);
    }
    if (!$sale['items']) {
        $add('sale', 'sale.items', 'Adicione ao menos um item à venda.', $saleHref);
    }
    $grossCents = 0;
    $itemDiscountCents = 0;
    foreach ($sale['items'] as $index => $item) {
        $position = $index + 1;
        foreach ([
            'fiscal_ncm' => ['NCM', '/^\d{8}$/D'],
            'fiscal_cfop' => ['CFOP', '/^\d{4}$/D'],
            'fiscal_origin' => ['origem', '/^[0-8]$/D'],
            'fiscal_tax_situation' => ['situação tributária', '/^\d{2,3}$/D'],
        ] as $field => [$label, $pattern]) {
            $value = fiscalItemCode($item, $field);
            if (!preg_match($pattern, $value)) {
                $itemHref = $item['product_id'] && trim((string) ($item[$field] ?? '')) === ''
                    ? '/produtos/' . (int) $item['product_id']
                    : $saleHref;
                $add('item', 'items.' . $position . '.' . $field, 'Informe ' . $label . ' do item ' . $position . ' (' . $item['description'] . ') no formato indicado.', $itemHref);
            }
        }
        if (fiscalItemCode($item, 'fiscal_cfop') !== '5102') {
            $add('item', 'items.' . $position . '.fiscal_cfop', 'Esta prévia XSD usa apenas CFOP 5102 no item ' . $position . '.', $saleHref);
        }
        if (fiscalItemCode($item, 'fiscal_tax_situation') !== '102') {
            $add('item', 'items.' . $position . '.fiscal_tax_situation', 'Esta prévia XSD usa apenas CSOSN 102 no item ' . $position . '.', $saleHref);
        }
        $lineGross = (int) round((float) $item['quantity'] * (float) $item['unit_price'] * 100);
        $lineDiscount = (int) round((float) $item['discount'] * 100);
        $lineTotal = (int) round((float) $item['total'] * 100);
        if ($lineGross - $lineDiscount !== $lineTotal) {
            $add('item', 'items.' . $position . '.total', 'Revise quantidade, preço e desconto do item ' . $position . '.', $saleHref);
        }
        $grossCents += $lineGross;
        $itemDiscountCents += $lineDiscount;
    }
    $subtotalCents = (int) round((float) $sale['subtotal'] * 100);
    $saleDiscountCents = (int) round((float) $sale['discount'] * 100);
    $totalCents = (int) round((float) $sale['total'] * 100);
    if ($grossCents - $itemDiscountCents !== $subtotalCents || $subtotalCents - $saleDiscountCents !== $totalCents) {
        $add('sale', 'sale.total', 'Os descontos e totais da venda não conferem com os itens.', $saleHref);
    }
    if (!$issues) {
        $snapshot = fiscalSnapshot($sale, $company);
        $preview = nfePreviewXml($snapshot, 1, 1, '12345678');
        foreach (array_slice(nfePreviewSchemaErrors($preview['xml']), 0, 20) as $error) {
            $add('schema', 'schema.xml', 'XSD: ' . $error, $saleHref);
        }
    }
    return ['ready' => !$issues, 'issues' => $issues, 'schema_version' => 'PL_010h_v1.03'];
}

function handleFiscalCheck(string $method, array $input): never
{
    if ($method !== 'GET') sendError('Método não permitido.', 405);
    sendJson(fiscalCheck(Context::companyId(), validatedInteger(query('sale_id'))));
}

function handleFiscalHomologation(string $method, array $input): never
{
    if ($method !== 'GET') sendError('Método não permitido.', 405);
    requirePermission('manage');
    $companyId = Context::companyId();
    $company = fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]);
    $sale = query('sale_id') !== null ? saleDetail(validatedInteger(query('sale_id')), $companyId) : null;
    sendJson(nfeHomologationReadiness($company, $sale));
}

function handleFiscal(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        if (query('id') !== null) {
            sendJson(fiscalDetail(validatedInteger(query('id')), $companyId));
        }
        if (query('sale_id') !== null) {
            $saleId = validatedInteger(query('sale_id'));
            $id = fetchValue('SELECT id FROM fiscal_documents WHERE company_id = ? AND sale_id = ? ORDER BY id DESC LIMIT 1', [$companyId, $saleId]);
            sendJson($id ? fiscalDetail((int) $id, $companyId) : null);
        }
        $rows = fetchAllRows(
            'SELECT f.id, f.sale_id, f.model, f.environment, f.status, f.number, f.series, f.access_key, f.created_at,
                    f.snapshot, s.total AS current_total, s.number AS current_sale_number, c.name AS current_client_name
             FROM fiscal_documents f JOIN sales s ON s.id = f.sale_id LEFT JOIN clients c ON c.id = s.client_id
             WHERE f.company_id = ? ORDER BY f.id DESC LIMIT 200',
            [$companyId],
        );
        foreach ($rows as &$row) {
            $snapshot = decodeJsonColumn($row['snapshot'], []);
            $row['total'] = $snapshot['total'] ?? $row['current_total'];
            $row['sale_number'] = $snapshot['sale_number'] ?? $row['current_sale_number'];
            $row['client_name'] = $snapshot['client'] ?? $row['current_client_name'];
            unset($row['snapshot'], $row['current_total'], $row['current_sale_number'], $row['current_client_name']);
        }
        unset($row);
        sendJson(['data' => $rows]);
    }

    requirePermission('finance');
    if ($method === 'POST') {
        if (($input['action'] ?? '') !== 'simulate') sendError('Ação fiscal inválida.');
        if ((string) ($input['model'] ?? '55') !== '55') {
            sendError('Nesta etapa, somente a simulação da NF-e modelo 55 está disponível.', 422, ['code' => 'fiscal_model_unsupported']);
        }
        $saleId = validatedInteger($input['sale_id'] ?? 0);
        $series = validatedInteger($input['series'] ?? 1, 1, 999);
        [$id, $saleNumber] = inTransaction(static function () use ($companyId, $saleId, $series): array {
            $saleRow = fetchOne('SELECT id, number, status FROM sales WHERE id = ? AND company_id = ? FOR UPDATE', [$saleId, $companyId]);
            if (!$saleRow) sendError('Venda não encontrada.', 404);
            if ($saleRow['status'] === 'cancelled') sendError('Não é possível simular nota para venda cancelada.', 409);
            requireNoActiveFiscalSimulation($companyId, $saleId, 'gerar outra');
            $check = fiscalCheck($companyId, $saleId);
            if (!$check['ready']) {
                sendError('Complete os dados indicados antes da simulação fiscal.', 422, [
                    'code' => 'fiscal_data_incomplete',
                    'issues' => $check['issues'],
                ]);
            }
            $sale = saleDetail($saleId, $companyId);
            $company = fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]);
            $snapshot = fiscalSnapshot($sale, $company);
            executeQuery('INSERT IGNORE INTO fiscal_sequences (company_id, model, series, next_number) VALUES (?, ?, ?, 1)', [$companyId, '55', $series]);
            $number = (int) fetchValue('SELECT next_number FROM fiscal_sequences WHERE company_id = ? AND model = ? AND series = ? FOR UPDATE', [$companyId, '55', $series]);
            executeQuery('UPDATE fiscal_sequences SET next_number = ? WHERE company_id = ? AND model = ? AND series = ?', [$number + 1, $companyId, '55', $series]);
            $preview = nfePreviewXml($snapshot, $series, $number);
            $schemaErrors = nfePreviewSchemaErrors($preview['xml']);
            if ($schemaErrors) {
                sendError('A prévia XML não passou na validação estrutural.', 422, [
                    'code' => 'fiscal_schema_invalid', 'issues' => $schemaErrors,
                ]);
            }
            $snapshot['xml_layout'] = 'nfe4_unsigned_preview';
            $id = insertRow('fiscal_documents', [
                'company_id' => $companyId, 'sale_id' => $saleId, 'model' => '55',
                'environment' => 'simulation', 'status' => 'simulated', 'number' => $number,
                'series' => $series, 'access_key' => $preview['key'], 'xml' => $preview['xml'],
                'snapshot' => jsonColumn($snapshot), 'created_by' => Context::userId(),
            ]);
            insertRow('fiscal_events', [
                'company_id' => $companyId, 'fiscal_document_id' => $id,
                'event_type' => 'simulated', 'message' => 'Documento de teste criado localmente; sem transmissão fiscal.',
                'created_by' => Context::userId(),
            ]);
            return [$id, $saleRow['number']];
        });
        auditLog('create', 'fiscal_document', $id, 'Documento fiscal simulado para venda ' . $saleNumber);
        sendJson(['ok' => true, 'id' => $id], 201);
    }
    if ($method === 'PATCH') {
        $id = requireRouteId();
        $saleId = fetchValue('SELECT sale_id FROM fiscal_documents WHERE id = ? AND company_id = ?', [$id, $companyId]);
        if (!$saleId) sendError('Documento fiscal de teste não encontrado.', 404);
        inTransaction(static function () use ($companyId, $id, $saleId): void {
            fetchOne('SELECT id FROM sales WHERE id = ? AND company_id = ? FOR UPDATE', [$saleId, $companyId]);
            $document = fetchOne('SELECT id, status FROM fiscal_documents WHERE id = ? AND company_id = ? FOR UPDATE', [$id, $companyId]);
            if (!$document || $document['status'] !== 'simulated') sendError('Somente simulações ativas podem ser canceladas.', 409);
            executeQuery("UPDATE fiscal_documents SET status = 'cancelled' WHERE id = ? AND company_id = ?", [$id, $companyId]);
            insertRow('fiscal_events', [
                'company_id' => $companyId, 'fiscal_document_id' => $id,
                'event_type' => 'cancelled', 'message' => 'Simulação cancelada pelo usuário.',
                'created_by' => Context::userId(),
            ]);
        });
        auditLog('cancel', 'fiscal_document', $id, 'Simulação fiscal cancelada');
        sendJson(['ok' => true]);
    }
    sendError('Método não permitido.', 405);
}

function handleFiscalXml(string $method, array $input): never
{
    if ($method !== 'GET') sendError('Método não permitido.', 405);
    $document = fiscalDetail(requireRouteId(), Context::companyId());
    header_remove('Content-Type');
    header('Content-Type: application/xml; charset=utf-8');
    header('Content-Disposition: attachment; filename="simulacao-nfe55-' . (int) $document['number'] . '.xml"');
    echo $document['xml'];
    exit();
}

function handleFiscalPdf(string $method, array $input): never
{
    if ($method !== 'GET') sendError('Método não permitido.', 405);
    $companyId = Context::companyId();
    $document = fiscalDetail(requireRouteId(), $companyId);
    $snapshot = $document['snapshot'];
    $company = fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]);
    foreach (['name', 'trade_name', 'document', 'address', 'number', 'neighborhood', 'city', 'state', 'zip'] as $field) {
        if (isset($snapshot['issuer'][$field])) $company[$field] = $snapshot['issuer'][$field];
    }
    $pdf = new OcularPdf($company);
    $pdf->docTitle = $document['status'] === 'cancelled' ? 'TESTE CANCELADO' : 'SIMULAÇÃO - SEM VALOR';
    $pdf->docNumber = (string) $document['number'];
    $pdf->docDate = date('d/m/Y', strtotime($document['created_at']));
    $pdf->AddPage();
    $pdf->SetY(32);
    $pdf->sectionTitle('Documento fiscal de teste - modelo 55');
    $pdf->fieldRow([
        ['Ambiente', 'SIMULAÇÃO LOCAL', 44],
        ['Série / Número', $document['series'] . ' / ' . $document['number'], 44],
        ['Situação', $document['status'] === 'cancelled' ? 'CANCELADA' : 'SIMULADA', 44],
    ]);
    $pdf->fieldRow([['Identificador de teste', $document['access_key'], 132]]);
    $pdf->Ln(4);
    $pdf->SetFont('Helvetica', 'B', 14);
    $pdf->SetTextColor(180, 35, 35);
    $pdf->MultiCell(0, 8, OcularPdf::t($document['status'] === 'cancelled' ? 'SIMULAÇÃO CANCELADA - SEM VALOR FISCAL' : 'DOCUMENTO DE TESTE - SEM VALOR FISCAL'));
    $pdf->SetTextColor(20, 20, 20);
    $pdf->sectionTitle('Resumo da venda no momento da simulação');
    $pdf->fieldRow([
        ['Venda', 'Nº ' . ($snapshot['sale_number'] ?? ''), 44],
        ['Cliente', ($snapshot['client'] ?? '') ?: 'Não identificado', 88],
    ]);
    foreach ($snapshot['items'] ?? [] as $item) {
        $pdf->fieldRow([
            ['Item', $item['description'] ?? '', 70],
            ['Qtd', $item['quantity'] ?? '', 20],
            ['Total', money((float) ($item['total'] ?? 0)), 42],
        ]);
    }
    $pdf->Ln(2);
    $pdf->fieldRow([
        ['Bruto', money((float) ($snapshot['gross_total'] ?? $snapshot['subtotal'] ?? 0)), 44],
        ['Descontos', money((float) ($snapshot['total_discount'] ?? $snapshot['sale_discount'] ?? 0)), 44],
        ['Total simulado', money((float) ($snapshot['total'] ?? 0)), 44],
    ]);
    $pdf->SetFont('Helvetica', '', 8);
    $pdf->MultiCell(0, 5, OcularPdf::t('Prévia XML sem assinatura digital e sem transmissão à SEFAZ. A validação XSD é apenas estrutural. Este PDF não pode ser utilizado como documento fiscal.'));
    $content = $pdf->Output('S');
    header_remove('Content-Type');
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="simulacao-nfe55-' . (int) $document['number'] . '.pdf"');
    echo $content;
    exit();
}
