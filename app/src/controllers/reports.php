<?php
declare(strict_types=1);

/**
 * Definição das entidades do relatório flexível: tabela base, colunas disponíveis,
 * agrupamentos e a expressão que liga cada linha a um cliente (para gerar campanhas).
 */
function reportEntities(): array
{
    $computed = clientComputedColumns();
    return [
        'clients' => [
            'label' => 'Clientes',
            'from' => 'FROM clients c',
            'client_expr' => 'c.id',
            'date_column' => 'c.created_at',
            'columns' => [
                'name' => ['Nome', 'c.name', 'text'],
                'whatsapp' => ['WhatsApp', 'c.whatsapp', 'phone'],
                'email' => ['E-mail', 'c.email', 'text'],
                'cpf' => ['CPF', 'c.cpf', 'text'],
                'birth_date' => ['Nascimento', 'c.birth_date', 'date'],
                'age' => ['Idade', $computed['age'], 'number'],
                'gender' => ['Sexo', 'c.gender', 'text'],
                'city' => ['Cidade', 'c.city', 'text'],
                'neighborhood' => ['Bairro', 'c.neighborhood', 'text'],
                'origin' => ['Origem', 'c.origin', 'text'],
                'kind' => ['Tipo', 'c.kind', 'text'],
                'message_consent' => ['Aceita mensagens', 'c.message_consent', 'bool'],
                'tags' => ['Etiquetas', $computed['tags'], 'text'],
                'last_purchase' => ['Última compra', $computed['last_purchase'], 'date'],
                'sales_count' => ['Nº de compras', $computed['sales_count'], 'number'],
                'total_spent' => ['Total comprado', $computed['total_spent'], 'money'],
                'prescription_expires_at' => ['Receita vence', $computed['prescription_expires_at'], 'date'],
                'last_interaction' => ['Último contato', $computed['last_interaction'], 'datetime'],
                'open_quotes' => ['Orçamentos abertos', $computed['open_quotes'], 'number'],
                'created_at' => ['Cadastrado em', 'c.created_at', 'datetime'],
            ],
            'groups' => [
                'city' => ['Cidade', "COALESCE(NULLIF(c.city, ''), 'Não informada')"],
                'neighborhood' => ['Bairro', "COALESCE(NULLIF(c.neighborhood, ''), 'Não informado')"],
                'gender' => ['Sexo', "COALESCE(NULLIF(c.gender, ''), '-')"],
                'origin' => ['Origem', "COALESCE(NULLIF(c.origin, ''), 'Não informada')"],
                'birth_month' => ['Mês de aniversário', 'MONTH(c.birth_date)'],
                'created_month' => ['Mês de cadastro', "DATE_FORMAT(c.created_at, '%Y-%m')"],
                'kind' => ['Tipo', 'c.kind'],
            ],
            'sum' => $computed['total_spent'],
        ],
        'sales' => [
            'label' => 'Vendas',
            'from' => 'FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.seller_id',
            'client_expr' => 's.client_id',
            'date_column' => 's.sale_date',
            'base_where' => "s.status <> 'cancelled'",
            'columns' => [
                'number' => ['Nº', 's.number', 'number'],
                'sale_date' => ['Data', 's.sale_date', 'date'],
                'client' => ['Cliente', 'c.name', 'text'],
                'whatsapp' => ['WhatsApp', 'c.whatsapp', 'phone'],
                'seller' => ['Vendedor', 'u.name', 'text'],
                'subtotal' => ['Subtotal', 's.subtotal', 'money'],
                'discount' => ['Desconto', 's.discount', 'money'],
                'total' => ['Total', 's.total', 'money'],
                'paid' => ['Pago', 's.paid', 'money'],
                'balance' => ['Saldo', 's.total - s.paid', 'money'],
                'status' => ['Situação', 's.status', 'text'],
                'items' => ['Itens', "(SELECT GROUP_CONCAT(si.description SEPARATOR '; ') FROM sale_items si WHERE si.sale_id = s.id)", 'text'],
                'payment_methods' => ['Pagamento', "(SELECT GROUP_CONCAT(DISTINCT sp.method SEPARATOR ', ') FROM sale_payments sp WHERE sp.sale_id = s.id)", 'text'],
                'city' => ['Cidade', 'c.city', 'text'],
            ],
            'groups' => [
                'day' => ['Dia', 's.sale_date'],
                'month' => ['Mês', "DATE_FORMAT(s.sale_date, '%Y-%m')"],
                'weekday' => ['Dia da semana', 'DAYOFWEEK(s.sale_date)'],
                'seller' => ['Vendedor', "COALESCE(u.name, 'Sem vendedor')"],
                'city' => ['Cidade do cliente', "COALESCE(NULLIF(c.city, ''), 'Não informada')"],
                'status' => ['Situação', 's.status'],
            ],
            'sum' => 's.total',
        ],
        'sale_items' => [
            'label' => 'Itens vendidos',
            'from' => 'FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN products p ON p.id = si.product_id LEFT JOIN clients c ON c.id = s.client_id',
            'client_expr' => 's.client_id',
            'date_column' => 's.sale_date',
            'company_column' => 'si.company_id',
            'base_where' => "s.status <> 'cancelled'",
            'columns' => [
                'sale_number' => ['Venda', 's.number', 'number'],
                'sale_date' => ['Data', 's.sale_date', 'date'],
                'client' => ['Cliente', 'c.name', 'text'],
                'description' => ['Item', 'si.description', 'text'],
                'category' => ['Categoria', "COALESCE(NULLIF(p.category, ''), 'Item livre')", 'text'],
                'brand' => ['Marca', 'p.brand', 'text'],
                'quantity' => ['Qtd.', 'si.quantity', 'number'],
                'unit_price' => ['Preço', 'si.unit_price', 'money'],
                'total' => ['Total', 'si.total', 'money'],
                'cost' => ['Custo', 'COALESCE(p.cost, 0) * si.quantity', 'money'],
                'margin' => ['Margem', 'si.total - COALESCE(p.cost, 0) * si.quantity', 'money'],
            ],
            'groups' => [
                'product' => ['Produto/Item', 'si.description'],
                'category' => ['Categoria', "COALESCE(NULLIF(p.category, ''), 'Item livre')"],
                'brand' => ['Marca', "COALESCE(NULLIF(p.brand, ''), 'Sem marca')"],
                'month' => ['Mês', "DATE_FORMAT(s.sale_date, '%Y-%m')"],
            ],
            'sum' => 'si.total',
        ],
        'quotes' => [
            'label' => 'Orçamentos',
            'from' => 'FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LEFT JOIN users u ON u.id = q.seller_id LEFT JOIN loss_reasons r ON r.id = q.loss_reason_id',
            'client_expr' => 'q.client_id',
            'date_column' => 'q.quote_date',
            'columns' => [
                'number' => ['Nº', 'q.number', 'number'],
                'quote_date' => ['Data', 'q.quote_date', 'date'],
                'client' => ['Cliente', 'COALESCE(c.name, q.contact_name)', 'text'],
                'whatsapp' => ['WhatsApp', 'COALESCE(c.whatsapp, q.contact_phone)', 'phone'],
                'seller' => ['Vendedor', 'u.name', 'text'],
                'total' => ['Total', 'q.total', 'money'],
                'status' => ['Situação', 'q.status', 'text'],
                'loss_reason' => ['Motivo da perda', 'r.name', 'text'],
                'valid_until' => ['Validade', 'q.valid_until', 'date'],
            ],
            'groups' => [
                'status' => ['Situação', 'q.status'],
                'seller' => ['Vendedor', "COALESCE(u.name, 'Sem vendedor')"],
                'month' => ['Mês', "DATE_FORMAT(q.quote_date, '%Y-%m')"],
                'loss_reason' => ['Motivo da perda', "COALESCE(r.name, '-')"],
            ],
            'sum' => 'q.total',
        ],
        'service_orders' => [
            'label' => 'Ordens de serviço',
            'from' => 'FROM service_orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN partners l ON l.id = o.laboratory_id',
            'client_expr' => 'o.client_id',
            'date_column' => 'o.created_at',
            'columns' => [
                'number' => ['Nº', 'o.number', 'number'],
                'created_at' => ['Abertura', 'o.created_at', 'datetime'],
                'client' => ['Cliente', 'c.name', 'text'],
                'laboratory' => ['Laboratório', 'l.name', 'text'],
                'status' => ['Etapa', 'o.status', 'text'],
                'promised_date' => ['Previsão', 'o.promised_date', 'date'],
                'delivered_at' => ['Entregue em', 'o.delivered_at', 'datetime'],
                'lens' => ['Lentes', 'o.lens_description', 'text'],
                'frame' => ['Armação', 'o.frame_description', 'text'],
                'lab_cost' => ['Custo laboratório', 'o.lab_cost', 'money'],
            ],
            'groups' => [
                'status' => ['Etapa', 'o.status'],
                'laboratory' => ['Laboratório', "COALESCE(l.name, 'Sem laboratório')"],
                'month' => ['Mês', "DATE_FORMAT(o.created_at, '%Y-%m')"],
            ],
            'sum' => 'o.lab_cost',
        ],
        'interactions' => [
            'label' => 'Atendimentos e contatos',
            'from' => 'FROM interactions i JOIN clients c ON c.id = i.client_id LEFT JOIN users u ON u.id = i.user_id LEFT JOIN campaigns ca ON ca.id = i.campaign_id',
            'client_expr' => 'i.client_id',
            'date_column' => 'i.contact_at',
            'columns' => [
                'contact_at' => ['Data', 'i.contact_at', 'datetime'],
                'client' => ['Cliente', 'c.name', 'text'],
                'channel' => ['Canal', 'i.channel', 'text'],
                'direction' => ['Sentido', 'i.direction', 'text'],
                'subject' => ['Assunto', 'i.subject', 'text'],
                'user' => ['Atendente', 'u.name', 'text'],
                'campaign' => ['Campanha', 'ca.name', 'text'],
            ],
            'groups' => [
                'channel' => ['Canal', 'i.channel'],
                'user' => ['Atendente', "COALESCE(u.name, 'Sistema')"],
                'month' => ['Mês', "DATE_FORMAT(i.contact_at, '%Y-%m')"],
                'campaign' => ['Campanha', "COALESCE(ca.name, 'Sem campanha')"],
            ],
            'sum' => null,
        ],
        'lost' => [
            'label' => 'Não compras / desistências',
            'from' => 'FROM lost_opportunities l LEFT JOIN clients c ON c.id = l.client_id LEFT JOIN loss_reasons r ON r.id = l.reason_id LEFT JOIN users u ON u.id = l.user_id',
            'client_expr' => 'l.client_id',
            'date_column' => 'l.occurred_at',
            'columns' => [
                'occurred_at' => ['Data', 'l.occurred_at', 'date'],
                'name' => ['Pessoa', 'COALESCE(c.name, l.contact_name)', 'text'],
                'phone' => ['Telefone', 'COALESCE(c.whatsapp, l.contact_phone)', 'phone'],
                'is_client' => ['É cliente', "IF(c.kind = 'client', 1, 0)", 'bool'],
                'reason' => ['Motivo', 'r.name', 'text'],
                'estimated_value' => ['Valor estimado', 'l.estimated_value', 'money'],
                'user' => ['Atendente', 'u.name', 'text'],
                'notes' => ['Observações', 'l.notes', 'text'],
            ],
            'groups' => [
                'reason' => ['Motivo', "COALESCE(r.name, 'Não informado')"],
                'month' => ['Mês', "DATE_FORMAT(l.occurred_at, '%Y-%m')"],
                'user' => ['Atendente', "COALESCE(u.name, '-')"],
                'kind' => ['Cliente x não cliente', "IF(c.kind = 'client', 'Cliente', 'Não cliente')"],
            ],
            'sum' => 'l.estimated_value',
        ],
        'products' => [
            'label' => 'Produtos e estoque',
            'from' => 'FROM products p LEFT JOIN partners f ON f.id = p.supplier_id',
            'client_expr' => null,
            'date_column' => 'p.created_at',
            'base_where' => 'p.active = 1',
            'columns' => [
                'sku' => ['Código', 'p.sku', 'text'],
                'name' => ['Produto', 'p.name', 'text'],
                'category' => ['Categoria', 'p.category', 'text'],
                'brand' => ['Marca', 'p.brand', 'text'],
                'supplier' => ['Fornecedor', 'f.name', 'text'],
                'stock' => ['Estoque', 'p.stock', 'number'],
                'min_stock' => ['Mínimo', 'p.min_stock', 'number'],
                'cost' => ['Custo', 'p.cost', 'money'],
                'price' => ['Preço', 'p.price', 'money'],
                'stock_value' => ['Valor em estoque', 'GREATEST(p.stock, 0) * p.cost', 'money'],
                'sold_90d' => ['Vendidos (90 dias)', "(SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.product_id = p.id AND s.status <> 'cancelled' AND s.sale_date >= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY))", 'number'],
            ],
            'groups' => [
                'category' => ['Categoria', "COALESCE(NULLIF(p.category, ''), 'Sem categoria')"],
                'brand' => ['Marca', "COALESCE(NULLIF(p.brand, ''), 'Sem marca')"],
                'supplier' => ['Fornecedor', "COALESCE(f.name, 'Sem fornecedor')"],
            ],
            'sum' => 'GREATEST(p.stock, 0) * p.cost',
        ],
        'payments' => [
            'label' => 'Recebimentos e parcelas',
            'from' => 'FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id LEFT JOIN clients c ON c.id = s.client_id',
            'client_expr' => 's.client_id',
            'date_column' => 'COALESCE(sp.paid_at, sp.due_date, s.sale_date)',
            'company_column' => 'sp.company_id',
            'base_where' => "s.status <> 'cancelled'",
            'columns' => [
                'sale_number' => ['Venda', 's.number', 'number'],
                'client' => ['Cliente', 'c.name', 'text'],
                'whatsapp' => ['WhatsApp', 'c.whatsapp', 'phone'],
                'method' => ['Forma', 'sp.method', 'text'],
                'installment' => ['Parcela', 'sp.installment', 'number'],
                'amount' => ['Valor', 'sp.amount', 'money'],
                'due_date' => ['Vencimento', 'sp.due_date', 'date'],
                'paid_at' => ['Pago em', 'sp.paid_at', 'date'],
            ],
            'groups' => [
                'method' => ['Forma de pagamento', 'sp.method'],
                'month' => ['Mês', "DATE_FORMAT(COALESCE(sp.paid_at, sp.due_date), '%Y-%m')"],
                'situation' => ['Situação', "IF(sp.paid_at IS NOT NULL, 'Pago', IF(sp.due_date < CURRENT_DATE, 'Vencido', 'A vencer'))"],
            ],
            'sum' => 'sp.amount',
        ],
    ];
}

/** Monta a consulta do relatório a partir da definição (entidade, filtros, colunas, agrupamento). */
function buildReportQuery(array $definition, int $companyId): array
{
    $entities = reportEntities();
    $entityKey = (string) ($definition['entity'] ?? 'clients');
    if (!isset($entities[$entityKey])) {
        sendError('Tipo de relatório inválido.');
    }
    $entity = $entities[$entityKey];
    $filters = is_array($definition['filters'] ?? null) ? $definition['filters'] : [];
    $alias = explode(' ', trim(substr($entity['from'], 5)))[1] ?? 'c';
    $companyColumn = $entity['company_column'] ?? "{$alias}.company_id";
    $where = ["{$companyColumn} = ?"];
    $params = [$companyId];
    if (!empty($entity['base_where']) && empty($filters['include_cancelled'])) {
        $where[] = $entity['base_where'];
    }
    if ($from = normalizeDate($filters['date_from'] ?? '')) {
        $where[] = "{$entity['date_column']} >= ?";
        $params[] = $from;
    }
    if ($to = normalizeDate($filters['date_to'] ?? '')) {
        $where[] = "{$entity['date_column']} < DATE_ADD(?, INTERVAL 1 DAY)";
        $params[] = $to;
    }
    // Filtros específicos de cada entidade.
    $simple = [
        'sales' => ['seller_id' => 's.seller_id', 'status' => 's.status'],
        'quotes' => ['seller_id' => 'q.seller_id', 'status' => 'q.status', 'loss_reason_id' => 'q.loss_reason_id'],
        'service_orders' => ['status' => 'o.status', 'laboratory_id' => 'o.laboratory_id'],
        'interactions' => ['channel' => 'i.channel', 'user_id' => 'i.user_id', 'campaign_id' => 'i.campaign_id'],
        'lost' => ['reason_id' => 'l.reason_id', 'user_id' => 'l.user_id'],
        'products' => ['category' => 'p.category', 'supplier_id' => 'p.supplier_id', 'brand' => 'p.brand'],
        'sale_items' => ['category' => 'p.category', 'product_id' => 'si.product_id', 'brand' => 'p.brand'],
        'payments' => ['method' => 'sp.method'],
    ][$entityKey] ?? [];
    foreach ($simple as $key => $column) {
        if (isset($filters[$key]) && $filters[$key] !== '' && $filters[$key] !== []) {
            $values = (array) $filters[$key];
            $where[] = "{$column} IN (" . implode(',', array_fill(0, count($values), '?')) . ')';
            array_push($params, ...array_map('strval', $values));
        }
    }
    if ($entityKey === 'products' && !empty($filters['low_stock'])) {
        $where[] = 'p.track_stock = 1 AND p.stock <= p.min_stock';
    }
    if ($entityKey === 'payments' && !empty($filters['situation'])) {
        $where[] = ['paid' => 'sp.paid_at IS NOT NULL', 'open' => 'sp.paid_at IS NULL', 'overdue' => 'sp.paid_at IS NULL AND sp.due_date < CURRENT_DATE'][$filters['situation']] ?? '1 = 1';
    }
    if ($entityKey === 'sale_items' && !empty($filters['description'])) {
        $where[] = 'si.description LIKE ?';
        $params[] = likeTerm((string) $filters['description']);
    }
    if ($entityKey === 'service_orders' && !empty($filters['late'])) {
        $where[] = "o.promised_date < CURRENT_DATE AND o.status NOT IN ('ready', 'delivered', 'cancelled')";
    }
    // Filtros de cliente (etiquetas, idade, cidade, compras...) valem para qualquer entidade ligada a cliente.
    $clientFilters = is_array($filters['client'] ?? null) ? $filters['client'] : [];
    if ($entityKey === 'clients') {
        $clientFilters = array_merge($filters, $clientFilters);
    }
    if ($entity['client_expr'] && array_filter($clientFilters, static fn($v) => $v !== '' && $v !== null && $v !== [])) {
        [$clientWhere, $clientParams] = buildClientFilter($clientFilters, $companyId);
        if ($entityKey === 'clients') {
            $where[] = $clientWhere;
        } else {
            $where[] = "{$entity['client_expr']} IN (SELECT c.id FROM clients c WHERE {$clientWhere})";
        }
        array_push($params, ...$clientParams);
    } elseif ($entityKey === 'clients') {
        $where[] = 'c.deleted_at IS NULL';
    }
    return [$entity, $entityKey, $entity['from'] . ' WHERE ' . implode(' AND ', $where), $params];
}

function runReport(array $definition, int $companyId, int $limit = 1000): array
{
    [$entity, $entityKey, $fromWhere, $params] = buildReportQuery($definition, $companyId);
    $groupBy = (string) ($definition['group_by'] ?? '');
    if ($groupBy !== '') {
        if (!isset($entity['groups'][$groupBy])) {
            sendError('Agrupamento inválido.');
        }
        [$label, $expression] = $entity['groups'][$groupBy];
        $sumSql = $entity['sum'] ? ", COALESCE(SUM({$entity['sum']}), 0) AS total" : '';
        $rows = fetchAllRows("SELECT {$expression} AS label, COUNT(*) AS count {$sumSql} {$fromWhere} GROUP BY label ORDER BY count DESC LIMIT 500", $params);
        $columns = [['key' => 'label', 'label' => $label, 'type' => 'text'], ['key' => 'count', 'label' => 'Quantidade', 'type' => 'number']];
        if ($entity['sum']) {
            $columns[] = ['key' => 'total', 'label' => 'Valor', 'type' => 'money'];
        }
        return ['entity' => $entityKey, 'grouped' => true, 'columns' => $columns, 'rows' => $rows, 'total' => count($rows)];
    }
    $requested = array_values(array_filter((array) ($definition['columns'] ?? []), static fn($c) => isset($entity['columns'][$c])));
    if (!$requested) {
        $requested = array_slice(array_keys($entity['columns']), 0, 6);
    }
    $select = [];
    $columns = [];
    foreach ($requested as $key) {
        [$label, $expression, $type] = $entity['columns'][$key];
        $select[] = "{$expression} AS `{$key}`";
        $columns[] = ['key' => $key, 'label' => $label, 'type' => $type];
    }
    $idAlias = explode(' ', trim(substr($entity['from'], 5)))[1];
    $select[] = "{$idAlias}.id AS _id";
    if ($entity['client_expr']) {
        $select[] = "{$entity['client_expr']} AS _client_id";
    }
    $sort = (string) ($definition['sort'] ?? '');
    $orderBy = isset($entity['columns'][$sort]) ? $entity['columns'][$sort][1] . (($definition['dir'] ?? 'asc') === 'desc' ? ' DESC' : ' ASC') : "{$idAlias}.id DESC";
    $total = (int) fetchValue("SELECT COUNT(*) {$fromWhere}", $params);
    $rows = fetchAllRows('SELECT ' . implode(', ', $select) . " {$fromWhere} ORDER BY {$orderBy} LIMIT {$limit}", $params);
    $summary = $entity['sum'] ? (float) fetchValue("SELECT COALESCE(SUM({$entity['sum']}), 0) {$fromWhere}", $params) : null;
    return ['entity' => $entityKey, 'grouped' => false, 'columns' => $columns, 'rows' => $rows, 'total' => $total, 'sum' => $summary];
}

function handleReports(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        // Metadados para montar a tela do construtor de relatórios.
        $meta = [];
        foreach (reportEntities() as $key => $entity) {
            $meta[$key] = [
                'label' => $entity['label'],
                'columns' => array_map(static fn($c) => ['label' => $c[0], 'type' => $c[2]], $entity['columns']),
                'groups' => array_map(static fn($g) => $g[0], $entity['groups']),
                'has_client' => (bool) $entity['client_expr'],
            ];
        }
        sendJson($meta);
    }
    $definition = $input;
    if (($input['action'] ?? '') === 'client_ids') {
        // Lista de clientes do relatório: usada para criar uma campanha a partir de qualquer relatório.
        [$entity, , $fromWhere, $params] = buildReportQuery($definition, $companyId);
        if (!$entity['client_expr']) {
            sendError('Este relatório não está ligado a clientes.');
        }
        $ids = array_map('intval', array_column(fetchAllRows("SELECT DISTINCT {$entity['client_expr']} AS id {$fromWhere} AND {$entity['client_expr']} IS NOT NULL LIMIT 20000", $params), 'id'));
        sendJson(['ids' => $ids, 'count' => count($ids)]);
    }
    if (($input['format'] ?? '') === 'csv') {
        $report = runReport($definition, $companyId, 50000);
        auditLog('export', 'report', null, 'Relatório exportado: ' . $report['entity'] . ' (' . count($report['rows']) . ' linhas)');
        header_remove('Content-Type');
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="relatorio-' . $report['entity'] . '-' . date('Ymd-His') . '.csv"');
        $output = fopen('php://output', 'w');
        fwrite($output, "\xEF\xBB\xBF");
        fputcsv($output, array_column($report['columns'], 'label'), ';');
        foreach ($report['rows'] as $row) {
            $line = [];
            foreach ($report['columns'] as $column) {
                $value = $row[$column['key']] ?? '';
                if ($column['type'] === 'money' || $column['type'] === 'number') {
                    $value = str_replace('.', ',', (string) $value);
                } elseif ($column['type'] === 'date') {
                    $value = brDate((string) $value);
                }
                $line[] = $value;
            }
            fputcsv($output, $line, ';');
        }
        fclose($output);
        exit();
    }
    sendJson(runReport($definition, $companyId, min(5000, max(1, (int) ($input['limit'] ?? 500)))));
}

function handleSavedReports(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        $rows = fetchAllRows('SELECT r.*, u.name AS created_by_name FROM saved_reports r LEFT JOIN users u ON u.id = r.created_by WHERE r.company_id = ? ORDER BY r.name', [$companyId]);
        foreach ($rows as &$row) {
            $row['definition'] = decodeJsonColumn($row['definition'], new stdClass());
        }
        unset($row);
        sendJson($rows);
    }
    requirePermission('crm');
    if ($method === 'DELETE') {
        $report = requireCompanyRecord('saved_reports', requireRouteId(), $companyId, 'Relatório');
        executeQuery('DELETE FROM saved_reports WHERE id = ? AND company_id = ?', [$report['id'], $companyId]);
        sendJson(['ok' => true]);
    }
    $definition = is_array($input['definition'] ?? null) ? $input['definition'] : [];
    $values = [
        'name' => requiredText($input, 'name', 120, 'nome'),
        'entity' => (string) ($definition['entity'] ?? 'clients'),
        'definition' => jsonColumn($definition),
    ];
    if ($method === 'PATCH') {
        $report = requireCompanyRecord('saved_reports', requireRouteId(), $companyId, 'Relatório');
        updateRow('saved_reports', (int) $report['id'], $companyId, $values);
        sendJson(['ok' => true]);
    }
    $id = insertRow('saved_reports', ['company_id' => $companyId, ...$values, 'created_by' => Context::userId()]);
    auditLog('create', 'saved_report', $id, 'Relatório salvo: ' . $values['name']);
    sendJson(['ok' => true, 'id' => $id], 201);
}

function handleDashboard(string $method, array $input): never
{
    $companyId = Context::companyId();
    if (query('compact') === '1') {
        // Contadores leves para os avisos do menu.
        sendJson([
            'tasks_today' => (int) fetchValue("SELECT COUNT(*) FROM tasks WHERE company_id = ? AND status = 'pending' AND due_date <= CURRENT_DATE", [$companyId]),
            'unread_conversations' => (int) fetchValue('SELECT COUNT(*) FROM conversations WHERE company_id = ? AND unread > 0', [$companyId]),
        ]);
    }
    $from = normalizeDate(query('from', '')) ?? date('Y-m-01');
    $to = normalizeDate(query('to', '')) ?? date('Y-m-d');
    $days = max(1, (int) ((strtotime($to) - strtotime($from)) / 86400) + 1);
    $previousTo = date('Y-m-d', strtotime($from . ' -1 day'));
    $previousFrom = date('Y-m-d', strtotime($previousTo . ' -' . ($days - 1) . ' days'));
    $p = [$companyId];
    $salesInRange = static fn(string $a, string $b): array => fetchOne(
        "SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(paid), 0) AS paid, COALESCE(SUM(discount), 0) AS discount
         FROM sales WHERE company_id = ? AND status <> 'cancelled' AND sale_date BETWEEN ? AND ?",
        [$companyId, $a, $b],
    );
    $current = $salesInRange($from, $to);
    $previous = $salesInRange($previousFrom, $previousTo);
    $quotes = fetchOne(
        "SELECT COUNT(*) AS total, SUM(status = 'converted') AS converted, SUM(status = 'lost') AS lost,
                SUM(status IN ('open', 'sent', 'approved')) AS open, COALESCE(SUM(CASE WHEN status IN ('open', 'sent', 'approved') THEN total END), 0) AS open_value
         FROM quotes WHERE company_id = ? AND quote_date BETWEEN ? AND ?",
        [$companyId, $from, $to],
    );
    sendJson([
        'period' => ['from' => $from, 'to' => $to, 'previous_from' => $previousFrom, 'previous_to' => $previousTo],
        'sales' => $current + ['average_ticket' => $current['count'] ? $current['total'] / $current['count'] : 0],
        'sales_previous' => $previous + ['average_ticket' => $previous['count'] ? $previous['total'] / $previous['count'] : 0],
        'receivable' => (float) fetchValue("SELECT COALESCE(SUM(total - paid), 0) FROM sales WHERE company_id = ? AND status <> 'cancelled' AND total - paid > 0.009", $p),
        'overdue_installments' => fetchOne(
            "SELECT COUNT(*) AS count, COALESCE(SUM(sp.amount), 0) AS amount FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
             WHERE sp.company_id = ? AND s.status <> 'cancelled' AND sp.paid_at IS NULL AND sp.due_date < CURRENT_DATE",
            $p,
        ),
        'quotes' => $quotes + ['conversion' => ($quotes['converted'] + $quotes['lost']) > 0 ? $quotes['converted'] / ($quotes['converted'] + $quotes['lost']) : null],
        'orders' => fetchOne(
            "SELECT SUM(status NOT IN ('delivered', 'cancelled')) AS open, SUM(status = 'ready') AS ready,
                    SUM(promised_date < CURRENT_DATE AND status NOT IN ('ready', 'delivered', 'cancelled')) AS late
             FROM service_orders WHERE company_id = ?",
            $p,
        ),
        'clients' => fetchOne(
            "SELECT COUNT(*) AS total, SUM(created_at >= ?) AS new_in_period,
                    SUM(birth_date IS NOT NULL AND DATE_FORMAT(birth_date, '%m-%d') = DATE_FORMAT(CURRENT_DATE, '%m-%d')) AS birthdays_today,
                    SUM(birth_date IS NOT NULL AND MONTH(birth_date) = MONTH(CURRENT_DATE)) AS birthdays_month
             FROM clients WHERE company_id = ? AND deleted_at IS NULL",
            [$from, $companyId],
        ),
        'prescriptions_expiring' => (int) fetchValue(
            'SELECT COUNT(*) FROM prescriptions pr WHERE pr.company_id = ? AND pr.id = (SELECT MAX(p2.id) FROM prescriptions p2 WHERE p2.client_id = pr.client_id)
             AND pr.expires_at BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY)',
            $p,
        ),
        'unread_conversations' => (int) fetchValue('SELECT COUNT(*) FROM conversations WHERE company_id = ? AND unread > 0', $p),
        'tasks_today' => (int) fetchValue("SELECT COUNT(*) FROM tasks WHERE company_id = ? AND status = 'pending' AND due_date <= CURRENT_DATE", $p),
        'low_stock' => (int) fetchValue('SELECT COUNT(*) FROM products WHERE company_id = ? AND active = 1 AND track_stock = 1 AND stock <= min_stock', $p),
        'sales_by_day' => fetchAllRows(
            "SELECT sale_date AS day, COUNT(*) AS count, SUM(total) AS total FROM sales
             WHERE company_id = ? AND status <> 'cancelled' AND sale_date BETWEEN ? AND ? GROUP BY sale_date ORDER BY sale_date",
            [$companyId, $from, $to],
        ),
        'sales_by_month' => fetchAllRows(
            "SELECT DATE_FORMAT(sale_date, '%Y-%m') AS month, COUNT(*) AS count, SUM(total) AS total FROM sales
             WHERE company_id = ? AND status <> 'cancelled' AND sale_date >= DATE_SUB(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 11 MONTH)
             GROUP BY month ORDER BY month",
            $p,
        ),
        'top_categories' => fetchAllRows(
            "SELECT COALESCE(NULLIF(p.category, ''), 'Itens livres') AS label, SUM(si.total) AS total, SUM(si.quantity) AS quantity
             FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN products p ON p.id = si.product_id
             WHERE si.company_id = ? AND s.status <> 'cancelled' AND s.sale_date BETWEEN ? AND ?
             GROUP BY label ORDER BY total DESC LIMIT 6",
            [$companyId, $from, $to],
        ),
        'top_products' => fetchAllRows(
            "SELECT si.description AS label, SUM(si.quantity) AS quantity, SUM(si.total) AS total
             FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE si.company_id = ? AND s.status <> 'cancelled' AND s.sale_date BETWEEN ? AND ?
             GROUP BY si.description ORDER BY total DESC LIMIT 8",
            [$companyId, $from, $to],
        ),
        'by_seller' => fetchAllRows(
            "SELECT COALESCE(u.name, 'Sem vendedor') AS label, COUNT(*) AS count, SUM(s.total) AS total
             FROM sales s LEFT JOIN users u ON u.id = s.seller_id
             WHERE s.company_id = ? AND s.status <> 'cancelled' AND s.sale_date BETWEEN ? AND ? GROUP BY label ORDER BY total DESC",
            [$companyId, $from, $to],
        ),
        'payment_methods' => fetchAllRows(
            "SELECT sp.method AS label, SUM(sp.amount) AS total FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
             WHERE sp.company_id = ? AND s.status <> 'cancelled' AND s.sale_date BETWEEN ? AND ? GROUP BY sp.method ORDER BY total DESC",
            [$companyId, $from, $to],
        ),
        'loss_reasons' => fetchAllRows(
            "SELECT COALESCE(r.name, 'Não informado') AS label, COUNT(*) AS total FROM lost_opportunities l LEFT JOIN loss_reasons r ON r.id = l.reason_id
             WHERE l.company_id = ? AND l.occurred_at BETWEEN ? AND ? GROUP BY label ORDER BY total DESC LIMIT 6",
            [$companyId, $from, $to],
        ),
        'orders_by_status' => fetchAllRows(
            "SELECT status AS label, COUNT(*) AS total FROM service_orders WHERE company_id = ? AND status NOT IN ('delivered', 'cancelled') GROUP BY status",
            $p,
        ),
        'recent_sales' => fetchAllRows(
            "SELECT s.id, s.number, s.sale_date, s.total, c.name AS client_name FROM sales s LEFT JOIN clients c ON c.id = s.client_id
             WHERE s.company_id = ? AND s.status <> 'cancelled' ORDER BY s.id DESC LIMIT 6",
            $p,
        ),
        'campaigns' => fetchAllRows(
            "SELECT ca.id, ca.name, ca.status,
                    (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = ca.id) AS total,
                    (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = ca.id AND cr.status IN ('sent', 'replied')) AS sent
             FROM campaigns ca WHERE ca.company_id = ? AND ca.status IN ('running', 'scheduled', 'paused') ORDER BY ca.id DESC LIMIT 5",
            $p,
        ),
    ]);
}
