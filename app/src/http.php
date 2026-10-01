<?php
declare(strict_types=1);

function sendJson($data, int $statusCode = 200): never
{
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}
function sendError(string $message, int $statusCode = 422): never
{
    sendJson(['error' => $message], $statusCode);
}

function readJsonInput(string $method): array
{
    if ($method === 'GET') {
        return [];
    }
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        sendError('JSON inválido.');
    }
    return $input;
}
