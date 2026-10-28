<?php
declare(strict_types=1);

require __DIR__ . '/config/database.php';
require __DIR__ . '/src/services/automatic_reminders.php';

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
