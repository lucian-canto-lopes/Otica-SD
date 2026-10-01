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
