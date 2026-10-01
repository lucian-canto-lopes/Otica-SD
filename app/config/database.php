<?php
declare(strict_types=1);

function database(): PDO
{
    static $connection = null;
    if ($connection === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=utf8mb4',
            getenv('DB_HOST'),
            getenv('DB_NAME'),
        );
        $connection = new PDO($dsn, getenv('DB_USER'), getenv('DB_PASS'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $connection;
}

function executeQuery(string $sql, array $parameters = []): PDOStatement
{
    $statement = database()->prepare($sql);
    $statement->execute($parameters);
    return $statement;
}
