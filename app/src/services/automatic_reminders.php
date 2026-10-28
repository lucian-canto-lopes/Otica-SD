<?php
declare(strict_types=1);

function prepareAutomaticReminders(
    ?int $companyId = null,
    ?int $clientId = null,
    ?int $orderId = null,
    ?int $saleId = null,
): void {
    $clientFilters = '';
    $clientParameters = [];
    if ($companyId !== null) {
        $clientFilters .= ' AND c.company_id = ?';
        $clientParameters[] = $companyId;
    }
    if ($clientId !== null) {
        $clientFilters .= ' AND c.id = ?';
        $clientParameters[] = $clientId;
    }

    executeQuery(
        <<<'SQL'
        INSERT IGNORE INTO reminders (
          company_id,
          client_id,
          type,
          due_date,
          message,
          source_key
        )
        SELECT
          c.company_id,
          c.id,
          'follow_up',
          c.next_contact_date,
          CONCAT('Entrar em contato com ', c.name, '.'),
          CONCAT('next-contact:', c.id, ':', c.next_contact_date)
        FROM clients c
        JOIN companies company ON company.id = c.company_id
        WHERE company.status IN ('trial', 'active')
          AND c.message_consent = 1
          AND TRIM(c.phone) <> ''
          AND c.next_contact_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY)
        SQL
        . $clientFilters,
        $clientParameters,
    );

    executeQuery(
        <<<'SQL'
        INSERT IGNORE INTO reminders (
          company_id,
          client_id,
          type,
          due_date,
          message,
          source_key
        )
        SELECT
          birthday.company_id,
          birthday.client_id,
          'birthday',
          birthday.due_date,
          CONCAT('Enviar uma mensagem de aniversário para ', birthday.client_name, '.'),
          CONCAT('birthday:', birthday.client_id, ':', YEAR(birthday.due_date))
        FROM (
          SELECT
            c.company_id,
            c.id AS client_id,
            c.name AS client_name,
            STR_TO_DATE(
              CONCAT(
                YEAR(CURRENT_DATE) + (
                  DATE_FORMAT(c.birth_date, '%m-%d') < DATE_FORMAT(CURRENT_DATE, '%m-%d')
                ),
                '-',
                DATE_FORMAT(c.birth_date, '%m-%d')
              ),
              '%Y-%m-%d'
            ) AS due_date
          FROM clients c
          JOIN companies company ON company.id = c.company_id
          WHERE company.status IN ('trial', 'active')
            AND c.message_consent = 1
            AND TRIM(c.phone) <> ''
            AND c.birth_date IS NOT NULL
        SQL
        .
            $clientFilters .
            <<<'SQL'
            ) birthday
            WHERE birthday.due_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY)
            SQL
            ,
        $clientParameters,
    );

    $saleFilters = '';
    $saleParameters = [];
    if ($companyId !== null) {
        $saleFilters .= ' AND s.company_id = ?';
        $saleParameters[] = $companyId;
    }
    if ($clientId !== null) {
        $saleFilters .= ' AND s.client_id = ?';
        $saleParameters[] = $clientId;
    }
    if ($saleId !== null) {
        $saleFilters .= ' AND s.id = ?';
        $saleParameters[] = $saleId;
    }

    executeQuery(
        <<<'SQL'
        INSERT IGNORE INTO reminders (
          company_id,
          client_id,
          type,
          due_date,
          message,
          source_key
        )
        SELECT
          s.company_id,
          s.client_id,
          'renewal',
          DATE_ADD(s.payment_date, INTERVAL 1 YEAR),
          CONCAT('Entrar em contato com ', c.name, ' para lembrar da renovação dos óculos.'),
          CONCAT('sale-renewal:', s.id)
        FROM sales s
        JOIN clients c
          ON c.id = s.client_id
          AND c.company_id = s.company_id
        JOIN companies company ON company.id = s.company_id
        WHERE company.status IN ('trial', 'active')
          AND c.message_consent = 1
          AND TRIM(c.phone) <> ''
        SQL
        . $saleFilters,
        $saleParameters,
    );

    $orderFilters = '';
    $orderParameters = [];
    if ($companyId !== null) {
        $orderFilters .= ' AND o.company_id = ?';
        $orderParameters[] = $companyId;
    }
    if ($clientId !== null) {
        $orderFilters .= ' AND o.client_id = ?';
        $orderParameters[] = $clientId;
    }
    if ($orderId !== null) {
        $orderFilters .= ' AND o.id = ?';
        $orderParameters[] = $orderId;
    }

    executeQuery(
        <<<'SQL'
        INSERT IGNORE INTO reminders (
          company_id,
          client_id,
          type,
          due_date,
          message,
          source_key
        )
        SELECT
          o.company_id,
          o.client_id,
          'pickup',
          CURRENT_DATE,
          CONCAT('Avisar ', c.name, ' que a ordem #', o.id, ' está pronta para retirada.'),
          CONCAT('order-ready:', o.id)
        FROM orders o
        JOIN clients c
          ON c.id = o.client_id
          AND c.company_id = o.company_id
        JOIN companies company ON company.id = o.company_id
        WHERE company.status IN ('trial', 'active')
          AND c.message_consent = 1
          AND TRIM(c.phone) <> ''
          AND o.status = 'ready'
        SQL
        . $orderFilters,
        $orderParameters,
    );
}
