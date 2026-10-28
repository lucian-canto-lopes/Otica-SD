<?php
declare(strict_types=1);

function sendJson($data, int $statusCode = 200): never
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit();
}

function sendError(string $message, int $statusCode = 422, array $extra = []): never
{
    sendJson(['error' => $message, ...$extra], $statusCode);
}

function readJsonInput(string $method): array
{
    if ($method === 'GET' || $method === 'DELETE' && ($_SERVER['CONTENT_LENGTH'] ?? '0') === '0') {
        return [];
    }
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_starts_with($contentType, 'multipart/form-data')) {
        return $_POST;
    }
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $input = json_decode($raw, true);
    if (!is_array($input)) {
        sendError('JSON inválido.');
    }
    return $input;
}

function query(string $key, ?string $default = null): ?string
{
    $value = $_GET[$key] ?? null;
    if ($value === null || $value === '') {
        return $default;
    }
    return is_array($value) ? $default : trim((string) $value);
}

function queryInt(string $key, ?int $default = null): ?int
{
    $value = query($key);
    if ($value === null || filter_var($value, FILTER_VALIDATE_INT) === false) {
        return $default;
    }
    return (int) $value;
}

function queryList(string $key): array
{
    $value = $_GET[$key] ?? '';
    if (is_array($value)) {
        return array_values(array_filter(array_map('trim', $value), 'strlen'));
    }
    return array_values(array_filter(array_map('trim', explode(',', (string) $value)), 'strlen'));
}

function routeId(): ?int
{
    return queryInt('id');
}

function requireRouteId(): int
{
    $id = routeId();
    if (!$id || $id < 1) {
        sendError('Identificador inválido.', 400);
    }
    return $id;
}

/**
 * Pagina uma consulta: recebe o SQL sem ORDER/LIMIT e devolve {data, total, page, per_page}.
 */
function paginate(string $selectSql, string $fromWhereSql, array $parameters, string $orderBy, int $maxPerPage = 200): array
{
    $page = max(1, queryInt('page', 1));
    $perPage = min($maxPerPage, max(1, queryInt('per_page', 25)));
    $total = (int) fetchValue("SELECT COUNT(*) {$fromWhereSql}", $parameters);
    $offset = ($page - 1) * $perPage;
    $rows = fetchAllRows("{$selectSql} {$fromWhereSql} ORDER BY {$orderBy} LIMIT {$perPage} OFFSET {$offset}", $parameters);
    return ['data' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $perPage];
}

/** Escolhe a ordenação somente entre colunas permitidas. */
function sortClause(array $allowed, string $default): string
{
    $sort = query('sort', '');
    $direction = strtolower(query('dir', 'asc')) === 'desc' ? 'DESC' : 'ASC';
    if ($sort !== '' && isset($allowed[$sort])) {
        return $allowed[$sort] . ' ' . $direction;
    }
    return $default;
}

function likeTerm(string $term): string
{
    return '%' . addcslashes($term, '%_\\') . '%';
}

function clientIp(): string
{
    return substr((string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}
