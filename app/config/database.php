<?php
declare(strict_types=1);

// Variáveis de ambiente (Docker) têm prioridade; config/local.php atende instalações como o XAMPP.
function appConfig(string $key): string
{
    static $config = null;
    if ($config === null) {
        $config = [
            'DB_HOST' => '127.0.0.1',
            'DB_PORT' => '3306',
            'DB_NAME' => 'ocular',
            'DB_USER' => 'root',
            'DB_PASS' => '',
            'PUBLIC_URL' => '',
            'STORAGE_PATH' => dirname(__DIR__) . '/storage',
            'MAX_UPLOAD_MB' => '15',
            'APP_DEBUG' => '0',
            // WhatsApp integrado: servidor Evolution API que acompanha o sistema.
            'EVOLUTION_URL' => '',
            'EVOLUTION_API_KEY' => '',
            // Endereço da API do Ocular visto pelo servidor Evolution (para os webhooks); vazio = PUBLIC_URL.
            'EVOLUTION_WEBHOOK_BASE' => '',
        ];
        $localFile = __DIR__ . '/local.php';
        if (is_file($localFile)) {
            $config = array_merge($config, require $localFile);
        }
        foreach (array_keys($config) as $name) {
            $value = getenv($name);
            if ($value !== false && $value !== '') {
                $config[$name] = $value;
            }
        }
    }
    return (string) ($config[$key] ?? '');
}

function database(): PDO
{
    static $connection = null;
    if ($connection === null) {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            appConfig('DB_HOST'),
            appConfig('DB_PORT'),
            appConfig('DB_NAME'),
        );
        $connection = new PDO($dsn, appConfig('DB_USER'), appConfig('DB_PASS'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        $connection->exec("SET time_zone = '" . date('P') . "'");
    }
    return $connection;
}

function executeQuery(string $sql, array $parameters = []): PDOStatement
{
    $statement = database()->prepare($sql);
    $statement->execute(array_values($parameters));
    return $statement;
}

function fetchOne(string $sql, array $parameters = []): ?array
{
    $row = executeQuery($sql, $parameters)->fetch();
    return $row === false ? null : $row;
}

function fetchAllRows(string $sql, array $parameters = []): array
{
    return executeQuery($sql, $parameters)->fetchAll();
}

function fetchValue(string $sql, array $parameters = []): mixed
{
    $value = executeQuery($sql, $parameters)->fetchColumn();
    return $value === false ? null : $value;
}

function insertRow(string $table, array $values): int
{
    $columns = array_keys($values);
    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
    executeQuery(
        "INSERT INTO {$table} (" . implode(', ', $columns) . ") VALUES ({$placeholders})",
        array_values($values),
    );
    return (int) database()->lastInsertId();
}

// Atualiza somente dentro da empresa informada; o filtro por company_id nunca é opcional.
function updateRow(string $table, int $id, int $companyId, array $values): void
{
    if (!$values) {
        return;
    }
    $assignments = implode(', ', array_map(static fn(string $c): string => "{$c} = ?", array_keys($values)));
    executeQuery("UPDATE {$table} SET {$assignments} WHERE id = ? AND company_id = ?", [
        ...array_values($values),
        $id,
        $companyId,
    ]);
}

function inTransaction(callable $callback): mixed
{
    $db = database();
    $db->beginTransaction();
    try {
        $result = $callback();
        $db->commit();
        return $result;
    } catch (Throwable $exception) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $exception;
    }
}
