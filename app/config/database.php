<?php
declare(strict_types=1);
function db(): PDO {
    static $pdo;
    return $pdo ??= new PDO('mysql:host='.getenv('DB_HOST').';dbname='.getenv('DB_NAME').';charset=utf8mb4', getenv('DB_USER'), getenv('DB_PASS'), [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false]);
}
function query(string $sql, array $args=[]): PDOStatement {
    $s=db()->prepare($sql); $s->execute($args); return $s;
}
