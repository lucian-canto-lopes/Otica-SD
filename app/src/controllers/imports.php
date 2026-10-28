<?php
declare(strict_types=1);

const IMPORT_FIELDS = [
    'clients' => [
        'legacy_id' => 'Código no sistema anterior', 'name' => 'Nome *', 'nickname' => 'Apelido', 'cpf' => 'CPF', 'rg' => 'RG',
        'birth_date' => 'Data de nascimento', 'gender' => 'Sexo', 'phone' => 'Telefone', 'whatsapp' => 'Celular/WhatsApp',
        'email' => 'E-mail', 'zip' => 'CEP', 'address' => 'Endereço', 'number' => 'Número', 'complement' => 'Complemento',
        'neighborhood' => 'Bairro', 'city' => 'Cidade', 'state' => 'UF', 'occupation' => 'Profissão', 'origin' => 'Origem',
        'notes' => 'Observações', 'tags' => 'Etiquetas (separadas por vírgula)', 'message_consent' => 'Aceita mensagens (S/N)',
        'created_at' => 'Data de cadastro',
    ],
    'products' => [
        'legacy_id' => 'Código no sistema anterior', 'sku' => 'Referência/Código', 'barcode' => 'Código de barras', 'name' => 'Descrição *',
        'category' => 'Categoria/Grupo', 'brand' => 'Marca', 'model' => 'Modelo', 'color' => 'Cor', 'size' => 'Tamanho', 'unit' => 'Unidade',
        'cost' => 'Preço de custo', 'price' => 'Preço de venda', 'stock' => 'Estoque', 'min_stock' => 'Estoque mínimo', 'supplier' => 'Fornecedor (nome)',
    ],
    'partners' => [
        'legacy_id' => 'Código no sistema anterior', 'type' => 'Tipo (fornecedor/laboratório)', 'name' => 'Nome *', 'trade_name' => 'Nome fantasia',
        'document' => 'CNPJ/CPF', 'contact_name' => 'Contato', 'phone' => 'Telefone', 'whatsapp' => 'WhatsApp', 'email' => 'E-mail',
        'city' => 'Cidade', 'state' => 'UF', 'notes' => 'Observações',
    ],
    'sales' => [
        'legacy_id' => 'Código da venda no sistema anterior *', 'number' => 'Número do pedido', 'client_legacy_id' => 'Código do cliente',
        'client_cpf' => 'CPF do cliente', 'client_name' => 'Nome do cliente', 'sale_date' => 'Data da venda *', 'delivery_date' => 'Data de entrega',
        'subtotal' => 'Subtotal', 'discount' => 'Desconto', 'total' => 'Total', 'paid' => 'Valor pago', 'payment_terms' => 'Forma de pagamento',
        'status' => 'Situação (cancelada?)', 'notes' => 'Observações',
    ],
    'sale_items' => [
        'sale_legacy_id' => 'Código da venda *', 'product_legacy_id' => 'Código do produto', 'product_sku' => 'Referência do produto',
        'description' => 'Descrição do item', 'quantity' => 'Quantidade', 'unit_price' => 'Preço unitário', 'discount' => 'Desconto', 'total' => 'Total do item',
    ],
    'prescriptions' => [
        'client_legacy_id' => 'Código do cliente', 'client_cpf' => 'CPF do cliente', 'client_name' => 'Nome do cliente',
        'prescribed_at' => 'Data da receita', 'expires_at' => 'Validade', 'doctor' => 'Médico',
        'od_sph' => 'OD esférico', 'od_cyl' => 'OD cilíndrico', 'od_axis' => 'OD eixo', 'od_dnp' => 'OD DNP', 'od_height' => 'OD altura',
        'oe_sph' => 'OE esférico', 'oe_cyl' => 'OE cilíndrico', 'oe_axis' => 'OE eixo', 'oe_dnp' => 'OE DNP', 'oe_height' => 'OE altura',
        'addition' => 'Adição', 'notes' => 'Observações',
    ],
];

function handleImports(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        sendJson([
            'fields' => IMPORT_FIELDS,
            'history' => fetchAllRows(
                'SELECT i.id, i.entity, i.filename, i.total, i.created, i.updated, i.failed, i.created_at, u.name AS user_name
                 FROM imports i LEFT JOIN users u ON u.id = i.user_id WHERE i.company_id = ? ORDER BY i.id DESC LIMIT 50',
                [$companyId],
            ),
        ]);
    }
    requirePermission('manage');
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $entity = enumValue($input, 'entity', array_keys(IMPORT_FIELDS));
    $rows = $input['rows'] ?? null;
    if (!is_array($rows) || count($rows) > 2000) {
        sendError('Envie no máximo 2.000 linhas por lote.');
    }
    $updateExisting = ($input['update_existing'] ?? true) !== false;
    $importId = (int) ($input['import_id'] ?? 0);
    if ($importId) {
        requireCompanyRecord('imports', $importId, $companyId, 'Importação');
    } else {
        $importId = insertRow('imports', [
            'company_id' => $companyId,
            'entity' => $entity,
            'filename' => mb_substr((string) ($input['filename'] ?? ''), 0, 190),
            'user_id' => Context::userId(),
        ]);
        auditLog('import_start', 'import', $importId, "Importação de {$entity} iniciada: " . ($input['filename'] ?? ''));
    }
    $offset = (int) ($input['offset'] ?? 0);
    $stats = ['created' => 0, 'updated' => 0, 'failed' => 0, 'errors' => []];
    $ddd = (string) companySetting('default_ddd', '');
    foreach ($rows as $index => $row) {
        if (!is_array($row)) {
            continue;
        }
        $row = array_map(static fn($v) => is_string($v) ? trim($v) : $v, $row);
        try {
            database()->beginTransaction();
            $result = match ($entity) {
                'clients' => importClient($companyId, $row, $updateExisting, $ddd),
                'products' => importProduct($companyId, $row, $updateExisting),
                'partners' => importPartner($companyId, $row, $updateExisting, $ddd),
                'sales' => importSale($companyId, $row, $updateExisting),
                'sale_items' => importSaleItem($companyId, $row),
                'prescriptions' => importPrescription($companyId, $row),
            };
            database()->commit();
            $stats[$result]++;
        } catch (ImportRowException $exception) {
            database()->rollBack();
            $stats['failed']++;
            $stats['errors'][] = ['row' => $offset + $index + 2, 'error' => $exception->getMessage()];
        } catch (Throwable $exception) {
            if (database()->inTransaction()) {
                database()->rollBack();
            }
            $stats['failed']++;
            $stats['errors'][] = ['row' => $offset + $index + 2, 'error' => 'Erro ao gravar: ' . mb_substr($exception->getMessage(), 0, 200)];
        }
    }
    $previous = fetchOne('SELECT errors FROM imports WHERE id = ?', [$importId]);
    $allErrors = array_slice(array_merge(decodeJsonColumn($previous['errors'] ?? null, []), $stats['errors']), 0, 2000);
    executeQuery(
        'UPDATE imports SET total = total + ?, created = created + ?, updated = updated + ?, failed = failed + ?, errors = ? WHERE id = ?',
        [count($rows), $stats['created'], $stats['updated'], $stats['failed'], jsonColumn($allErrors), $importId],
    );
    if (!empty($input['last_chunk'])) {
        finishImport($companyId, $entity);
        $totals = fetchOne('SELECT total, created, updated, failed FROM imports WHERE id = ?', [$importId]);
        auditLog('import', 'import', $importId, "Importação de {$entity}: {$totals['created']} novos, {$totals['updated']} atualizados, {$totals['failed']} com erro");
    }
    sendJson(['import_id' => $importId, ...$stats]);
}

final class ImportRowException extends RuntimeException
{
}

function importFail(string $message): never
{
    throw new ImportRowException($message);
}

/** Ajustes pós-importação: contadores de numeração e totais de vendas importadas sem valor. */
function finishImport(int $companyId, string $entity): void
{
    if ($entity === 'sales' || $entity === 'sale_items') {
        executeQuery(
            "UPDATE sales s JOIN (SELECT sale_id, SUM(total) AS items_total FROM sale_items WHERE company_id = ? GROUP BY sale_id) i ON i.sale_id = s.id
             SET s.subtotal = i.items_total, s.total = GREATEST(i.items_total - s.discount, 0)
             WHERE s.company_id = ? AND s.legacy_id IS NOT NULL AND s.total = 0",
            [$companyId, $companyId],
        );
        executeQuery(
            'UPDATE companies SET next_sale_number = GREATEST(next_sale_number, (SELECT COALESCE(MAX(number), 0) + 1 FROM sales WHERE company_id = ?)) WHERE id = ?',
            [$companyId, $companyId],
        );
    }
    generateTasks($companyId);
}

function importValue(array $row, string $key): string
{
    return trim((string) ($row[$key] ?? ''));
}

function importDate(array $row, string $key): ?string
{
    $value = importValue($row, $key);
    if ($value === '') {
        return null;
    }
    // Planilhas do Excel podem trazer datas como número serial.
    if (is_numeric($value) && (float) $value > 1000 && (float) $value < 80000) {
        return date('Y-m-d', (int) round(((float) $value - 25569) * 86400));
    }
    return normalizeDate($value);
}

function findImportedClient(int $companyId, array $row): ?int
{
    $legacy = importValue($row, 'client_legacy_id');
    if ($legacy !== '' && ($id = fetchValue('SELECT id FROM clients WHERE company_id = ? AND legacy_id = ?', [$companyId, $legacy]))) {
        return (int) $id;
    }
    $cpf = onlyDigits(importValue($row, 'client_cpf'));
    if (strlen($cpf) >= 11 && ($id = fetchValue('SELECT id FROM clients WHERE company_id = ? AND cpf = ? AND deleted_at IS NULL', [$companyId, $cpf]))) {
        return (int) $id;
    }
    $name = importValue($row, 'client_name');
    if ($name !== '' && ($id = fetchValue('SELECT id FROM clients WHERE company_id = ? AND name = ? AND deleted_at IS NULL LIMIT 1', [$companyId, $name]))) {
        return (int) $id;
    }
    return null;
}

function importClient(int $companyId, array $row, bool $updateExisting, string $ddd): string
{
    $name = mb_substr(importValue($row, 'name'), 0, 150);
    if ($name === '') {
        importFail('Nome do cliente em branco.');
    }
    $phone = importValue($row, 'phone');
    $whatsapp = normalizePhone(importValue($row, 'whatsapp') ?: (strlen(onlyDigits($phone)) >= 10 ? $phone : ''), $ddd);
    $email = importValue($row, 'email');
    $gender = mb_strtoupper(mb_substr(importValue($row, 'gender'), 0, 1));
    $consent = in_array(mb_strtolower(importValue($row, 'message_consent')), ['s', 'sim', '1', 'true', 'x', 'yes'], true);
    $values = [
        'name' => $name,
        'nickname' => mb_substr(importValue($row, 'nickname'), 0, 80),
        'cpf' => substr(onlyDigits(importValue($row, 'cpf')), 0, 20),
        'rg' => mb_substr(importValue($row, 'rg'), 0, 30),
        'birth_date' => importDate($row, 'birth_date'),
        'gender' => in_array($gender, ['F', 'M'], true) ? $gender : '',
        'phone' => mb_substr($phone, 0, 30),
        'whatsapp' => substr($whatsapp, 0, 30),
        'email' => filter_var($email, FILTER_VALIDATE_EMAIL) ? mb_substr($email, 0, 190) : '',
        'zip' => substr(onlyDigits(importValue($row, 'zip')), 0, 10),
        'address' => mb_substr(importValue($row, 'address'), 0, 190),
        'number' => mb_substr(importValue($row, 'number'), 0, 20),
        'complement' => mb_substr(importValue($row, 'complement'), 0, 80),
        'neighborhood' => mb_substr(importValue($row, 'neighborhood'), 0, 100),
        'city' => mb_substr(importValue($row, 'city'), 0, 100),
        'state' => mb_strtoupper(mb_substr(importValue($row, 'state'), 0, 2)),
        'occupation' => mb_substr(importValue($row, 'occupation'), 0, 100),
        'origin' => mb_substr(importValue($row, 'origin') ?: 'Importação', 0, 60),
        'notes' => mb_substr(importValue($row, 'notes'), 0, 5000),
    ];
    $legacy = mb_substr(importValue($row, 'legacy_id'), 0, 40);
    $existing = null;
    if ($legacy !== '') {
        $existing = fetchValue('SELECT id FROM clients WHERE company_id = ? AND legacy_id = ?', [$companyId, $legacy]);
    }
    if (!$existing && strlen($values['cpf']) === 11) {
        $existing = fetchValue('SELECT id FROM clients WHERE company_id = ? AND cpf = ? AND deleted_at IS NULL', [$companyId, $values['cpf']]);
    }
    if ($existing) {
        if (!$updateExisting) {
            return 'updated';
        }
        // Atualiza somente os campos preenchidos na planilha.
        $changes = array_filter($values, static fn($v) => $v !== '' && $v !== null);
        if ($legacy !== '') {
            $changes['legacy_id'] = $legacy;
        }
        updateRow('clients', (int) $existing, $companyId, $changes);
        $clientId = (int) $existing;
        $status = 'updated';
    } else {
        $createdAt = importDate($row, 'created_at');
        $clientId = insertRow('clients', [
            'company_id' => $companyId,
            'legacy_id' => $legacy !== '' ? $legacy : null,
            ...$values,
            'message_consent' => $consent ? 1 : 0,
            'message_consent_at' => $consent ? date('Y-m-d H:i:s') : null,
            'created_at' => $createdAt ? $createdAt . ' 00:00:00' : date('Y-m-d H:i:s'),
        ]);
        $status = 'created';
    }
    foreach (array_filter(array_map('trim', preg_split('/[,;|]/', importValue($row, 'tags')))) as $tagName) {
        executeQuery('INSERT IGNORE INTO client_tags (client_id, tag_id, company_id) VALUES (?, ?, ?)', [$clientId, ensureTag($companyId, $tagName), $companyId]);
    }
    return $status;
}

function importProduct(int $companyId, array $row, bool $updateExisting): string
{
    $name = mb_substr(importValue($row, 'name'), 0, 190);
    if ($name === '') {
        importFail('Descrição do produto em branco.');
    }
    $supplierId = null;
    if (($supplierName = importValue($row, 'supplier')) !== '') {
        $supplierId = fetchValue('SELECT id FROM partners WHERE company_id = ? AND name = ?', [$companyId, $supplierName])
            ?: insertRow('partners', ['company_id' => $companyId, 'type' => 'supplier', 'name' => mb_substr($supplierName, 0, 150)]);
    }
    $values = [
        'sku' => mb_substr(importValue($row, 'sku'), 0, 60),
        'barcode' => mb_substr(importValue($row, 'barcode'), 0, 60),
        'name' => $name,
        'category' => mb_substr(importValue($row, 'category'), 0, 60),
        'brand' => mb_substr(importValue($row, 'brand'), 0, 80),
        'model' => mb_substr(importValue($row, 'model'), 0, 80),
        'color' => mb_substr(importValue($row, 'color'), 0, 60),
        'size' => mb_substr(importValue($row, 'size'), 0, 30),
        'unit' => mb_substr(importValue($row, 'unit') ?: 'UN', 0, 10),
        'cost' => parseMoney(importValue($row, 'cost')),
        'price' => parseMoney(importValue($row, 'price')),
        'min_stock' => (int) parseMoney(importValue($row, 'min_stock')),
        'supplier_id' => $supplierId,
    ];
    $legacy = mb_substr(importValue($row, 'legacy_id'), 0, 40);
    $existing = $legacy !== '' ? fetchValue('SELECT id FROM products WHERE company_id = ? AND legacy_id = ?', [$companyId, $legacy]) : null;
    if (!$existing && $values['sku'] !== '') {
        $existing = fetchValue('SELECT id FROM products WHERE company_id = ? AND sku = ? LIMIT 1', [$companyId, $values['sku']]);
    }
    $stockValue = importValue($row, 'stock');
    if ($existing) {
        if ($updateExisting) {
            updateRow('products', (int) $existing, $companyId, array_filter($values, static fn($v) => $v !== '' && $v !== null));
            if ($stockValue !== '') {
                moveStock($companyId, (int) $existing, 'adjust', (int) parseMoney($stockValue), 'Saldo importado');
            }
        }
        return 'updated';
    }
    $productId = insertRow('products', ['company_id' => $companyId, 'legacy_id' => $legacy !== '' ? $legacy : null, ...$values, 'stock' => 0]);
    if ($stockValue !== '' && (int) parseMoney($stockValue) !== 0) {
        moveStock($companyId, $productId, 'adjust', (int) parseMoney($stockValue), 'Saldo importado');
    }
    return 'created';
}

function importPartner(int $companyId, array $row, bool $updateExisting, string $ddd): string
{
    $name = mb_substr(importValue($row, 'name'), 0, 150);
    if ($name === '') {
        importFail('Nome do fornecedor em branco.');
    }
    $typeText = mb_strtolower(importValue($row, 'type'));
    $values = [
        'type' => str_contains($typeText, 'lab') ? 'laboratory' : 'supplier',
        'name' => $name,
        'trade_name' => mb_substr(importValue($row, 'trade_name'), 0, 150),
        'document' => mb_substr(importValue($row, 'document'), 0, 30),
        'contact_name' => mb_substr(importValue($row, 'contact_name'), 0, 120),
        'phone' => mb_substr(importValue($row, 'phone'), 0, 30),
        'whatsapp' => substr(normalizePhone(importValue($row, 'whatsapp'), $ddd), 0, 30),
        'email' => mb_substr(importValue($row, 'email'), 0, 190),
        'city' => mb_substr(importValue($row, 'city'), 0, 100),
        'state' => mb_strtoupper(mb_substr(importValue($row, 'state'), 0, 2)),
        'notes' => mb_substr(importValue($row, 'notes'), 0, 5000),
    ];
    $legacy = mb_substr(importValue($row, 'legacy_id'), 0, 40);
    $existing = $legacy !== '' ? fetchValue('SELECT id FROM partners WHERE company_id = ? AND legacy_id = ?', [$companyId, $legacy]) : null;
    $existing = $existing ?: fetchValue('SELECT id FROM partners WHERE company_id = ? AND name = ?', [$companyId, $name]);
    if ($existing) {
        if ($updateExisting) {
            updateRow('partners', (int) $existing, $companyId, array_filter($values, static fn($v) => $v !== ''));
        }
        return 'updated';
    }
    insertRow('partners', ['company_id' => $companyId, 'legacy_id' => $legacy !== '' ? $legacy : null, ...$values]);
    return 'created';
}

function importSale(int $companyId, array $row, bool $updateExisting): string
{
    $legacy = mb_substr(importValue($row, 'legacy_id'), 0, 40);
    if ($legacy === '') {
        importFail('Código da venda em branco.');
    }
    $saleDate = importDate($row, 'sale_date');
    if (!$saleDate) {
        importFail('Data da venda inválida: ' . importValue($row, 'sale_date'));
    }
    $clientId = findImportedClient($companyId, $row);
    if (!$clientId && importValue($row, 'client_name') !== '') {
        $clientId = insertRow('clients', ['company_id' => $companyId, 'name' => mb_substr(importValue($row, 'client_name'), 0, 150), 'origin' => 'Importação de vendas']);
    }
    $statusText = mb_strtolower(importValue($row, 'status'));
    $total = parseMoney(importValue($row, 'total'));
    $discount = parseMoney(importValue($row, 'discount'));
    $subtotal = importValue($row, 'subtotal') !== '' ? parseMoney(importValue($row, 'subtotal')) : $total + $discount;
    $paidText = importValue($row, 'paid');
    $values = [
        'client_id' => $clientId,
        'status' => str_contains($statusText, 'cancel') ? 'cancelled' : 'completed',
        'sale_date' => $saleDate,
        'delivery_date' => importDate($row, 'delivery_date'),
        'subtotal' => $subtotal,
        'discount' => $discount,
        'total' => $total,
        'paid' => $paidText === '' ? $total : parseMoney($paidText),
        'payment_terms' => mb_substr(importValue($row, 'payment_terms'), 0, 255),
        'notes' => mb_substr(importValue($row, 'notes'), 0, 5000),
    ];
    $existing = fetchValue('SELECT id FROM sales WHERE company_id = ? AND legacy_id = ?', [$companyId, $legacy]);
    if ($existing) {
        if ($updateExisting) {
            updateRow('sales', (int) $existing, $companyId, $values);
        }
        return 'updated';
    }
    $number = (int) onlyDigits(importValue($row, 'number'));
    if (!$number && ctype_digit($legacy)) {
        $number = (int) $legacy;
    }
    if (!$number || fetchValue('SELECT 1 FROM sales WHERE company_id = ? AND number = ?', [$companyId, $number])) {
        $number = reserveNumber($companyId, 'sale');
    }
    insertRow('sales', ['company_id' => $companyId, 'legacy_id' => $legacy, 'number' => $number, ...$values, 'created_at' => $saleDate . ' 12:00:00']);
    return 'created';
}

function importSaleItem(int $companyId, array $row): string
{
    $saleLegacy = importValue($row, 'sale_legacy_id');
    $sale = $saleLegacy !== '' ? fetchOne('SELECT id FROM sales WHERE company_id = ? AND legacy_id = ?', [$companyId, $saleLegacy]) : null;
    if (!$sale) {
        importFail('Venda não encontrada para o código ' . $saleLegacy . '. Importe as vendas antes dos itens.');
    }
    $product = null;
    if (($productLegacy = importValue($row, 'product_legacy_id')) !== '') {
        $product = fetchOne('SELECT id, name, price FROM products WHERE company_id = ? AND legacy_id = ?', [$companyId, $productLegacy]);
    }
    if (!$product && ($sku = importValue($row, 'product_sku')) !== '') {
        $product = fetchOne('SELECT id, name, price FROM products WHERE company_id = ? AND sku = ? LIMIT 1', [$companyId, $sku]);
    }
    $description = importValue($row, 'description') ?: ($product['name'] ?? '');
    if ($description === '') {
        importFail('Item sem descrição e sem produto correspondente.');
    }
    $quantity = parseMoney(importValue($row, 'quantity')) ?: 1;
    $unitPrice = importValue($row, 'unit_price') !== '' ? parseMoney(importValue($row, 'unit_price')) : (float) ($product['price'] ?? 0);
    $discount = parseMoney(importValue($row, 'discount'));
    $total = importValue($row, 'total') !== '' ? parseMoney(importValue($row, 'total')) : round($quantity * $unitPrice - $discount, 2);
    if (importValue($row, 'unit_price') === '' && $total > 0 && $quantity > 0) {
        $unitPrice = round(($total + $discount) / $quantity, 2);
    }
    $position = (int) fetchValue('SELECT COUNT(*) FROM sale_items WHERE sale_id = ?', [$sale['id']]);
    // Itens históricos não movimentam o estoque: o saldo atual vem da importação de produtos.
    insertRow('sale_items', [
        'company_id' => $companyId,
        'sale_id' => $sale['id'],
        'product_id' => $product['id'] ?? null,
        'description' => mb_substr($description, 0, 255),
        'quantity' => $quantity,
        'unit_price' => $unitPrice,
        'discount' => $discount,
        'total' => $total,
        'position' => $position,
    ]);
    return 'created';
}

function importPrescription(int $companyId, array $row): string
{
    $clientId = findImportedClient($companyId, $row);
    if (!$clientId) {
        importFail('Cliente não encontrado para a receita.');
    }
    $values = [];
    foreach (['od_sph', 'od_cyl', 'od_axis', 'od_dnp', 'od_height', 'oe_sph', 'oe_cyl', 'oe_axis', 'oe_dnp', 'oe_height', 'addition'] as $field) {
        $values[$field] = mb_substr(importValue($row, $field), 0, 10);
    }
    $prescribedAt = importDate($row, 'prescribed_at');
    $expiresAt = importDate($row, 'expires_at') ?? ($prescribedAt ? date('Y-m-d', strtotime($prescribedAt . ' +12 months')) : null);
    insertRow('prescriptions', [
        'company_id' => $companyId,
        'client_id' => $clientId,
        'prescribed_at' => $prescribedAt,
        'expires_at' => $expiresAt,
        'doctor' => mb_substr(importValue($row, 'doctor'), 0, 120),
        ...$values,
        'notes' => mb_substr(importValue($row, 'notes'), 0, 500),
    ]);
    return 'created';
}

function handleApiKeys(string $method, array $input): never
{
    $companyId = Context::companyId();
    requirePermission('manage');
    if ($method === 'GET') {
        sendJson(fetchAllRows('SELECT id, name, prefix, scopes, last_used_at, revoked_at, created_at FROM api_keys WHERE company_id = ? ORDER BY id DESC', [$companyId]));
    }
    if ($method === 'DELETE') {
        $key = requireCompanyRecord('api_keys', requireRouteId(), $companyId, 'Chave');
        executeQuery('UPDATE api_keys SET revoked_at = NOW() WHERE id = ? AND company_id = ?', [$key['id'], $companyId]);
        auditLog('revoke', 'api_key', (int) $key['id'], 'Chave de API revogada: ' . $key['name']);
        sendJson(['ok' => true]);
    }
    if ($method !== 'POST') {
        sendError('Método não permitido.', 405);
    }
    $plain = 'ok_' . bin2hex(random_bytes(20));
    $id = insertRow('api_keys', [
        'company_id' => $companyId,
        'name' => requiredText($input, 'name', 120, 'nome'),
        'prefix' => substr($plain, 0, 10),
        'key_hash' => hash('sha256', $plain),
        'scopes' => ($input['write'] ?? false) ? 'read,write' : 'read',
    ]);
    auditLog('create', 'api_key', $id, 'Chave de API criada');
    // A chave completa só é exibida uma vez.
    sendJson(['ok' => true, 'id' => $id, 'key' => $plain], 201);
}

function handleWebhooks(string $method, array $input): never
{
    $companyId = Context::companyId();
    requirePermission('manage');
    if ($method === 'GET') {
        sendJson([
            'webhooks' => fetchAllRows('SELECT * FROM webhooks WHERE company_id = ? ORDER BY id DESC', [$companyId]),
            'events' => ['client.created', 'client.updated', 'sale.created', 'sale.cancelled', 'quote.created', 'quote.lost', 'order.created', 'order.status_changed', 'message.received'],
            'recent' => fetchAllRows(
                'SELECT d.id, d.webhook_id, d.event, d.status, d.attempts, d.response_code, d.created_at FROM webhook_deliveries d WHERE d.company_id = ? ORDER BY d.id DESC LIMIT 30',
                [$companyId],
            ),
        ]);
    }
    if ($method === 'DELETE') {
        $hook = requireCompanyRecord('webhooks', requireRouteId(), $companyId, 'Webhook');
        executeQuery('DELETE FROM webhooks WHERE id = ? AND company_id = ?', [$hook['id'], $companyId]);
        sendJson(['ok' => true]);
    }
    $url = requiredText($input, 'url', 500, 'URL');
    if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#', $url)) {
        sendError('Informe uma URL válida (http ou https).');
    }
    $events = implode(',', array_filter(array_map('trim', (array) ($input['events'] ?? ['*'])))) ?: '*';
    if ($method === 'PATCH') {
        $hook = requireCompanyRecord('webhooks', requireRouteId(), $companyId, 'Webhook');
        updateRow('webhooks', (int) $hook['id'], $companyId, ['url' => $url, 'events' => $events, 'active' => booleanValue($input, 'active')]);
        sendJson(['ok' => true]);
    }
    $id = insertRow('webhooks', ['company_id' => $companyId, 'url' => $url, 'events' => $events, 'secret' => bin2hex(random_bytes(16))]);
    auditLog('create', 'webhook', $id, 'Webhook cadastrado: ' . $url);
    sendJson(['ok' => true, 'id' => $id], 201);
}
