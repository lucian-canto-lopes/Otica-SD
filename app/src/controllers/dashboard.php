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
        'upcoming_birthdays' => executeQuery(
            <<<'SQL'
            SELECT COUNT(*)
            FROM clients
            WHERE company_id = ?
              AND birth_date IS NOT NULL
              AND DATEDIFF(
                STR_TO_DATE(
                  CONCAT(
                    YEAR(CURRENT_DATE) + (
                      DATE_FORMAT(birth_date, '%m-%d') < DATE_FORMAT(CURRENT_DATE, '%m-%d')
                    ),
                    '-',
                    DATE_FORMAT(birth_date, '%m-%d')
                  ),
                  '%Y-%m-%d'
                ),
                CURRENT_DATE
              ) BETWEEN 0 AND 30
            SQL
            ,
            [$companyId],
        )->fetchColumn(),
        'pending_reminders' => executeQuery(
            <<<'SQL'
            SELECT COUNT(*)
            FROM reminders
            WHERE company_id = ?
              AND status = 'pending'
            SQL
            ,
            [$companyId],
        )->fetchColumn(),
        'overdue_orders' => executeQuery(
            <<<'SQL'
            SELECT COUNT(*)
            FROM orders
            WHERE company_id = ?
              AND delivery < CURRENT_DATE
              AND status <> 'delivered'
            SQL
            ,
            [$companyId],
        )->fetchColumn(),
        'low_stock' => executeQuery(
            <<<'SQL'
            SELECT COUNT(*)
            FROM products
            WHERE company_id = ?
              AND stock <= 3
            SQL
            ,
            [$companyId],
        )->fetchColumn(),
    ]);
}
