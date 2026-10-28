<?php
declare(strict_types=1);

/**
 * Filtros de clientes compartilhados por listagem, relatórios e público de campanhas.
 * Cada filtro vira uma condição sobre o alias "c" (tabela clients), sempre restrita à empresa.
 * Retorna [sql WHERE, parâmetros].
 */
function buildClientFilter(array $f, int $companyId): array
{
    $where = ['c.company_id = ?', 'c.deleted_at IS NULL'];
    $params = [$companyId];
    $has = static fn(string $key): bool => isset($f[$key]) && $f[$key] !== '' && $f[$key] !== null && $f[$key] !== [];
    $ids = static fn($value): array => array_values(array_filter(array_map('intval', (array) $value)));
    $date = static fn(string $key): ?string => normalizeDate($f[$key] ?? '');
    $validSale = "s.company_id = c.company_id AND s.client_id = c.id AND s.status <> 'cancelled'";

    if ($has('q')) {
        $term = likeTerm((string) $f['q']);
        $digits = onlyDigits((string) $f['q']);
        $condition = '(c.name LIKE ? OR c.nickname LIKE ? OR c.email LIKE ?';
        array_push($params, $term, $term, $term);
        if (strlen($digits) >= 3) {
            $condition .= ' OR c.whatsapp LIKE ? OR c.phone LIKE ? OR c.cpf LIKE ?';
            array_push($params, "%{$digits}%", "%{$digits}%", "%{$digits}%");
        }
        $where[] = $condition . ')';
    }
    if ($has('ids')) {
        $list = $ids($f['ids']) ?: [0];
        $where[] = 'c.id IN (' . implode(',', $list) . ')';
    }
    if ($has('kind')) {
        $where[] = 'c.kind = ?';
        $params[] = $f['kind'];
    }
    foreach (['city', 'state', 'neighborhood', 'origin', 'gender'] as $column) {
        if ($has($column)) {
            $values = (array) $f[$column];
            $where[] = "c.{$column} IN (" . implode(',', array_fill(0, count($values), '?')) . ')';
            array_push($params, ...array_map('strval', $values));
        }
    }
    if ($has('seller_id')) {
        $where[] = 'c.seller_id = ?';
        $params[] = (int) $f['seller_id'];
    }
    if ($has('tags_any')) {
        $where[] = 'EXISTS (SELECT 1 FROM client_tags ct WHERE ct.client_id = c.id AND ct.tag_id IN (' . implode(',', $ids($f['tags_any']) ?: [0]) . '))';
    }
    if ($has('tags_all')) {
        $list = $ids($f['tags_all']) ?: [0];
        $where[] = '(SELECT COUNT(DISTINCT ct.tag_id) FROM client_tags ct WHERE ct.client_id = c.id AND ct.tag_id IN (' . implode(',', $list) . ')) = ' . count($list);
    }
    if ($has('tags_none')) {
        $where[] = 'NOT EXISTS (SELECT 1 FROM client_tags ct WHERE ct.client_id = c.id AND ct.tag_id IN (' . implode(',', $ids($f['tags_none']) ?: [0]) . '))';
    }
    if ($has('consent')) {
        $where[] = 'c.message_consent = ?';
        $params[] = (int) (bool) $f['consent'];
    }
    if ($has('has_whatsapp')) {
        $where[] = $f['has_whatsapp'] ? "c.whatsapp <> ''" : "c.whatsapp = ''";
    }
    if ($has('has_email')) {
        $where[] = $f['has_email'] ? "c.email <> ''" : "c.email = ''";
    }
    if ($has('age_min')) {
        $where[] = 'c.birth_date IS NOT NULL AND TIMESTAMPDIFF(YEAR, c.birth_date, CURRENT_DATE) >= ?';
        $params[] = (int) $f['age_min'];
    }
    if ($has('age_max')) {
        $where[] = 'c.birth_date IS NOT NULL AND TIMESTAMPDIFF(YEAR, c.birth_date, CURRENT_DATE) <= ?';
        $params[] = (int) $f['age_max'];
    }
    if ($has('birth_month')) {
        $months = $ids($f['birth_month']) ?: [0];
        $where[] = 'MONTH(c.birth_date) IN (' . implode(',', $months) . ')';
    }
    if ($has('birthday_window')) {
        $days = ['today' => 0, 'week' => 6, 'next_30' => 30][$f['birthday_window']] ?? null;
        if ($f['birthday_window'] === 'this_month') {
            $where[] = 'MONTH(c.birth_date) = MONTH(CURRENT_DATE)';
        } elseif ($days !== null) {
            // Compara pelo "dia do ano" do próximo aniversário, tratando a virada de ano.
            $where[] = "c.birth_date IS NOT NULL AND MOD(DAYOFYEAR(c.birth_date) - DAYOFYEAR(CURRENT_DATE) + 366, 366) <= {$days}";
        }
    }
    if ($has('created_from')) {
        $where[] = 'c.created_at >= ?';
        $params[] = $date('created_from');
    }
    if ($has('created_to')) {
        $where[] = 'c.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
        $params[] = $date('created_to');
    }
    if ($has('purchased_from') || $has('purchased_to')) {
        $condition = "EXISTS (SELECT 1 FROM sales s WHERE {$validSale}";
        if ($has('purchased_from')) {
            $condition .= ' AND s.sale_date >= ?';
            $params[] = $date('purchased_from');
        }
        if ($has('purchased_to')) {
            $condition .= ' AND s.sale_date <= ?';
            $params[] = $date('purchased_to');
        }
        $where[] = $condition . ')';
    }
    if ($has('no_purchase_since')) {
        // Clientes que já compraram, mas não compram desde a data informada.
        $where[] = "EXISTS (SELECT 1 FROM sales s WHERE {$validSale})";
        $where[] = "NOT EXISTS (SELECT 1 FROM sales s WHERE {$validSale} AND s.sale_date >= ?)";
        $params[] = $date('no_purchase_since');
    }
    if ($has('no_purchase_days')) {
        $where[] = "EXISTS (SELECT 1 FROM sales s WHERE {$validSale})";
        $where[] = "NOT EXISTS (SELECT 1 FROM sales s WHERE {$validSale} AND s.sale_date >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY))";
        $params[] = (int) $f['no_purchase_days'];
    }
    if ($has('never_purchased') && $f['never_purchased']) {
        $where[] = "NOT EXISTS (SELECT 1 FROM sales s WHERE {$validSale})";
    }
    if ($has('total_spent_min')) {
        $where[] = "(SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE {$validSale}) >= ?";
        $params[] = parseMoney($f['total_spent_min']);
    }
    if ($has('total_spent_max')) {
        $where[] = "(SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE {$validSale}) <= ?";
        $params[] = parseMoney($f['total_spent_max']);
    }
    if ($has('sales_count_min')) {
        $where[] = "(SELECT COUNT(*) FROM sales s WHERE {$validSale}) >= ?";
        $params[] = (int) $f['sales_count_min'];
    }
    if ($has('bought_category') || $has('bought_product')) {
        $condition = "EXISTS (SELECT 1 FROM sales s JOIN sale_items si ON si.sale_id = s.id LEFT JOIN products p ON p.id = si.product_id WHERE {$validSale}";
        if ($has('bought_category')) {
            $condition .= ' AND p.category = ?';
            $params[] = (string) $f['bought_category'];
        }
        if ($has('bought_product')) {
            $condition .= ' AND (si.description LIKE ? OR p.name LIKE ? OR p.brand LIKE ?)';
            $term = likeTerm((string) $f['bought_product']);
            array_push($params, $term, $term, $term);
        }
        $where[] = $condition . ')';
    }
    if ($has('quote_status')) {
        $statuses = (array) $f['quote_status'];
        $where[] = 'EXISTS (SELECT 1 FROM quotes q WHERE q.company_id = c.company_id AND q.client_id = c.id AND q.status IN ('
            . implode(',', array_fill(0, count($statuses), '?')) . ')'
            . ($has('quote_from') ? ' AND q.quote_date >= ?' : '')
            . ($has('quote_to') ? ' AND q.quote_date <= ?' : '') . ')';
        array_push($params, ...array_map('strval', $statuses));
        if ($has('quote_from')) {
            $params[] = $date('quote_from');
        }
        if ($has('quote_to')) {
            $params[] = $date('quote_to');
        }
    }
    if ($has('lost_reason_id')) {
        $where[] = 'EXISTS (SELECT 1 FROM lost_opportunities l WHERE l.company_id = c.company_id AND l.client_id = c.id AND l.reason_id IN ('
            . implode(',', $ids($f['lost_reason_id']) ?: [0]) . '))';
    }
    if ($has('prescription_expires_from') || $has('prescription_expires_to')) {
        $condition = 'EXISTS (SELECT 1 FROM prescriptions pr WHERE pr.company_id = c.company_id AND pr.client_id = c.id'
            . ' AND pr.id = (SELECT MAX(p2.id) FROM prescriptions p2 WHERE p2.client_id = c.id)';
        if ($has('prescription_expires_from')) {
            $condition .= ' AND pr.expires_at >= ?';
            $params[] = $date('prescription_expires_from');
        }
        if ($has('prescription_expires_to')) {
            $condition .= ' AND pr.expires_at <= ?';
            $params[] = $date('prescription_expires_to');
        }
        $where[] = $condition . ')';
    }
    if ($has('prescription_expiring_days')) {
        $where[] = 'EXISTS (SELECT 1 FROM prescriptions pr WHERE pr.company_id = c.company_id AND pr.client_id = c.id
            AND pr.id = (SELECT MAX(p2.id) FROM prescriptions p2 WHERE p2.client_id = c.id)
            AND pr.expires_at BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL ? DAY))';
        $params[] = (int) $f['prescription_expiring_days'];
    }
    if ($has('order_status')) {
        $statuses = (array) $f['order_status'];
        $where[] = 'EXISTS (SELECT 1 FROM service_orders o WHERE o.company_id = c.company_id AND o.client_id = c.id AND o.status IN ('
            . implode(',', array_fill(0, count($statuses), '?')) . '))';
        array_push($params, ...array_map('strval', $statuses));
    }
    if ($has('no_interaction_days')) {
        $where[] = 'NOT EXISTS (SELECT 1 FROM interactions i WHERE i.company_id = c.company_id AND i.client_id = c.id AND i.contact_at >= DATE_SUB(NOW(), INTERVAL ? DAY))';
        $params[] = (int) $f['no_interaction_days'];
    }
    if ($has('interaction_channel')) {
        $where[] = 'EXISTS (SELECT 1 FROM interactions i WHERE i.company_id = c.company_id AND i.client_id = c.id AND i.channel = ?)';
        $params[] = (string) $f['interaction_channel'];
    }
    if ($has('campaign_received')) {
        $where[] = "EXISTS (SELECT 1 FROM campaign_recipients cr WHERE cr.client_id = c.id AND cr.campaign_id = ? AND cr.status IN ('sent', 'replied'))";
        $params[] = (int) $f['campaign_received'];
    }
    if ($has('campaign_not_received')) {
        $where[] = "NOT EXISTS (SELECT 1 FROM campaign_recipients cr WHERE cr.client_id = c.id AND cr.campaign_id = ? AND cr.status IN ('sent', 'replied'))";
        $params[] = (int) $f['campaign_not_received'];
    }
    if ($has('contacted_last_days_exclude')) {
        // Evita repetir contato: exclui quem recebeu qualquer campanha nos últimos N dias.
        $where[] = "NOT EXISTS (SELECT 1 FROM campaign_recipients cr WHERE cr.client_id = c.id AND cr.status = 'sent' AND cr.sent_at >= DATE_SUB(NOW(), INTERVAL ? DAY))";
        $params[] = (int) $f['contacted_last_days_exclude'];
    }

    return [implode(' AND ', $where), $params];
}

/** Colunas calculadas disponíveis para listagens e relatórios de clientes. */
function clientComputedColumns(): array
{
    $validSale = "s.company_id = c.company_id AND s.client_id = c.id AND s.status <> 'cancelled'";
    return [
        'last_purchase' => "(SELECT MAX(s.sale_date) FROM sales s WHERE {$validSale})",
        'total_spent' => "(SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE {$validSale})",
        'sales_count' => "(SELECT COUNT(*) FROM sales s WHERE {$validSale})",
        'age' => 'TIMESTAMPDIFF(YEAR, c.birth_date, CURRENT_DATE)',
        'prescription_expires_at' => '(SELECT pr.expires_at FROM prescriptions pr WHERE pr.client_id = c.id ORDER BY pr.id DESC LIMIT 1)',
        'last_interaction' => '(SELECT MAX(i.contact_at) FROM interactions i WHERE i.client_id = c.id)',
        'open_quotes' => "(SELECT COUNT(*) FROM quotes q WHERE q.client_id = c.id AND q.status IN ('open', 'sent'))",
        'tags' => "(SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', ') FROM client_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.client_id = c.id)",
    ];
}

/** Lista os IDs dos clientes que atendem aos filtros (usado para montar público de campanha). */
function clientIdsForFilter(array $filters, int $companyId, int $limit = 50000): array
{
    [$where, $params] = buildClientFilter($filters, $companyId);
    return array_map('intval', array_column(fetchAllRows("SELECT c.id FROM clients c WHERE {$where} LIMIT {$limit}", $params), 'id'));
}
