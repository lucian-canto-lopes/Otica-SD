<?php
declare(strict_types=1);

function showDashboard(int $companyId): never
{
    sendJson([
        'clients' => executeQuery(
            <<<'SQL'
            SELECT
              COUNT(*)
            FROM
              clients
            WHERE
              company_id = ?
            SQL
            ,
            [$companyId],
        )->fetchColumn(),
        'products' => executeQuery(
            <<<'SQL'
            SELECT
              COALESCE(SUM(stock), 0)
            FROM
              products
            WHERE
              company_id = ?
            SQL
            ,
            [$companyId],
        )->fetchColumn(),
        'revenue' => executeQuery(
            <<<'SQL'
            SELECT
              COALESCE(SUM(total), 0)
            FROM
              sales
            WHERE
              company_id = ?
            SQL
            ,
            [$companyId],
        )->fetchColumn(),
        'receivable' => executeQuery(
            <<<'SQL'
            SELECT
              COALESCE(SUM(total - paid), 0)
            FROM
              sales
            WHERE
              company_id = ?
            SQL
            ,
            [$companyId],
        )->fetchColumn(),
    ]);
}
