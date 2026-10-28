<?php
declare(strict_types=1);

const APP_VERSION = '2.0.0';

date_default_timezone_set(getenv('TZ') ?: 'America/Sao_Paulo');
mb_internal_encoding('UTF-8');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/validation.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/core.php';

foreach (glob(__DIR__ . '/services/*.php') as $service) {
    require_once $service;
}
foreach (glob(__DIR__ . '/controllers/*.php') as $controller) {
    require_once $controller;
}

if (PHP_SAPI !== 'cli') {
    startAppSession();
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
}
