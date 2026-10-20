<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/validation.php';
require_once __DIR__ . '/auth.php';

foreach (
    ['companies', 'branding', 'dashboard', 'clients', 'products', 'sales', 'orders']
    as $controller
) {
    require_once __DIR__ . '/controllers/' . $controller . '.php';
}

session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'path' => '/']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
