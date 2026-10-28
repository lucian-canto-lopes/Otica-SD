<?php
declare(strict_types=1);

/*
 * Processamento em segundo plano:
 *  - a cada ciclo (15 s): campanhas automáticas e webhooks de saída. O ciclo curto permite que o envio
 *    seguro pelo WhatsApp respeite intervalos aleatórios entre as mensagens;
 *  - a cada 10 min: automações agendadas e geração de tarefas.
 * Uso contínuo: php app/worker.php   ·   Execução única (agendador do Windows/cron): php app/worker.php --once
 */

require __DIR__ . '/src/bootstrap.php';

$interval = max(10, (int) (getenv('WORKER_INTERVAL') ?: 15));
$once = in_array('--once', $argv, true) || getenv('WORKER_ONCE') === '1';
$lastHeavyRun = 0;

do {
    $startedAt = time();
    try {
        $sent = processAutoCampaigns();
        $delivered = processWebhookDeliveries();
        if ($once || $startedAt - $lastHeavyRun >= 600) {
            $executed = runScheduledAutomations();
            generateTasks();
            $lastHeavyRun = $startedAt;
            error_log(sprintf('[worker] automações executadas: %d', $executed));
        }
        if ($sent || $delivered) {
            error_log(sprintf('[worker] mensagens de campanha: %d · webhooks: %d', $sent, $delivered));
        }
    } catch (Throwable $exception) {
        error_log('[worker] falha: ' . $exception->getMessage());
    }
    if ($once) {
        break;
    }
    sleep(max(1, $interval - (time() - $startedAt)));
} while (true);
