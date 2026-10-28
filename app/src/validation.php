<?php
declare(strict_types=1);

function requiredText(array $input, string $key, int $maxLength = 120): string
{
    $value = trim((string) ($input[$key] ?? ''));
    if ($value === '' || strlen($value) > $maxLength) {
        sendError('Preencha corretamente: ' . $key);
    }
    return $value;
}
function validatedInteger($value, int $minimum = 1): int
{
    if (
        filter_var($value, FILTER_VALIDATE_INT) === false ||
        (int) $value < $minimum ||
        (int) $value > 1000000
    ) {
        sendError('Quantidade ou identificador inválido.');
    }
    return (int) $value;
}
function moneyToCents($value): int
{
    if (!preg_match('/^\d{1,8}(\.\d{1,2})?$/', (string) $value)) {
        sendError('Valor monetário inválido.');
    }
    return (int) round((float) $value * 100);
}

function optionalDate(array $input, string $key): ?string
{
    $value = trim((string) ($input[$key] ?? ''));
    if ($value === '') {
        return null;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) {
        sendError('Data inválida: ' . $key);
    }
    return $value;
}

function requiredDate(array $input, string $key): string
{
    $date = optionalDate($input, $key);
    if ($date === null) {
        sendError('Preencha corretamente: ' . $key);
    }
    return $date;
}

function optionalDateTime(array $input, string $key): ?string
{
    $value = trim((string) ($input[$key] ?? ''));
    if ($value === '') {
        return null;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $value);
    if (!$date || $date->format('Y-m-d\TH:i') !== $value) {
        sendError('Data e hora inválidas: ' . $key);
    }
    return $date->format('Y-m-d H:i:s');
}

function optionalEmail(array $input, string $key = 'email'): string
{
    $email = trim((string) ($input[$key] ?? ''));
    if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190)) {
        sendError('Informe um e-mail válido.');
    }
    return $email;
}

function booleanValue(array $input, string $key): int
{
    $value = $input[$key] ?? false;
    if (in_array($value, [true, 1, '1', 'true', 'on'], true)) {
        return 1;
    }
    if (in_array($value, [false, 0, '0', 'false', 'off', '', null], true)) {
        return 0;
    }
    sendError('Valor inválido: ' . $key);
}

// Resolve o cliente dentro da empresa da sessão, nunca apenas pelo ID informado.
function requireCompanyClient(array $input, int $companyId): int
{
    $clientId = validatedInteger($input['client_id'] ?? 0);
    $client = executeQuery(
        <<<'SQL'
        SELECT
          id
        FROM
          clients
        WHERE
          id = ?
          AND company_id = ?
        SQL
        ,
        [$clientId, $companyId],
    )->fetch();
    if (!$client) {
        sendError('Cliente não encontrado.');
    }
    return $clientId;
}

function optionalCompanyPartner(
    array $input,
    string $key,
    int $companyId,
    ?string $expectedType = null,
): ?int {
    $value = $input[$key] ?? null;
    if ($value === null || $value === '') {
        return null;
    }
    $partnerId = validatedInteger($value);
    $sql = 'SELECT id FROM partners WHERE id = ? AND company_id = ?';
    $parameters = [$partnerId, $companyId];
    if ($expectedType !== null) {
        $sql .= ' AND type = ?';
        $parameters[] = $expectedType;
    }
    if (!executeQuery($sql, $parameters)->fetch()) {
        sendError('Parceiro não encontrado ou incompatível.');
    }
    return $partnerId;
}
