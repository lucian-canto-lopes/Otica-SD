<?php
declare(strict_types=1);

require __DIR__ . '/config/database.php';

function prepareAutomaticReminders(): void
{
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
          AND c.next_contact_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY)
        SQL
        ,
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
            AND c.birth_date IS NOT NULL
        ) birthday
        WHERE birthday.due_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY)
        SQL
        ,
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
          AND o.status = 'ready'
        SQL
        ,
    );
}

$interval = max(30, (int) (getenv('REMINDER_WORKER_INTERVAL') ?: 300));
do {
    $nextRunIn = $interval;
    try {
        prepareAutomaticReminders();
        error_log('Lembretes automáticos preparados em ' . date(DATE_ATOM));
    } catch (Throwable $exception) {
        error_log('Falha ao preparar lembretes: ' . $exception->getMessage());
        $nextRunIn = 10;
    }
    if (getenv('REMINDER_WORKER_ONCE') === '1') {
        break;
    }
    sleep($nextRunIn);
} while (true);
