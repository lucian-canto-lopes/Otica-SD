<?php
declare(strict_types=1);

function requiredText(array $input, string $key, int $maxLength = 120, string $label = ''): string
{
    $value = trim((string) ($input[$key] ?? ''));
    if ($value === '' || mb_strlen($value) > $maxLength) {
        sendError('Preencha corretamente: ' . ($label ?: $key));
    }
    return $value;
}

function optionalText(array $input, string $key, int $maxLength = 255): string
{
    $value = $input[$key] ?? '';
    if (is_array($value)) {
        return '';
    }
    return mb_substr(trim((string) $value), 0, $maxLength);
}

function validatedInteger($value, int $minimum = 1, int $maximum = 1000000000): int
{
    if (
        filter_var($value, FILTER_VALIDATE_INT) === false ||
        (int) $value < $minimum ||
        (int) $value > $maximum
    ) {
        sendError('Número ou identificador inválido.');
    }
    return (int) $value;
}

function optionalInteger(array $input, string $key, int $minimum = 0): ?int
{
    $value = $input[$key] ?? null;
    if ($value === null || $value === '') {
        return null;
    }
    return validatedInteger($value, $minimum);
}

/** Converte "1.234,56", "1234.56" ou número em float com duas casas. */
function parseMoney($value): float
{
    if (is_int($value) || is_float($value)) {
        return round((float) $value, 2);
    }
    $text = trim((string) $value);
    if ($text === '') {
        return 0.0;
    }
    $text = preg_replace('/[^\d,.\-]/', '', $text);
    if (str_contains($text, ',')) {
        $text = str_replace('.', '', $text);
        $text = str_replace(',', '.', $text);
    }
    return is_numeric($text) ? round((float) $text, 2) : 0.0;
}

function moneyValue(array $input, string $key, float $max = 99999999.99): float
{
    $value = parseMoney($input[$key] ?? 0);
    if ($value < 0 || $value > $max) {
        sendError('Valor monetário inválido: ' . $key);
    }
    return $value;
}

function quantityValue($value): float
{
    $number = parseMoney($value);
    if ($number <= 0 || $number > 100000) {
        sendError('Quantidade inválida.');
    }
    return $number;
}

/** Aceita AAAA-MM-DD e DD/MM/AAAA. */
function normalizeDate($value): ?string
{
    $text = trim((string) $value);
    if ($text === '') {
        return null;
    }
    $text = substr($text, 0, 10);
    foreach (['!Y-m-d', '!d/m/Y', '!d-m-Y', '!d/m/y'] as $format) {
        $date = DateTimeImmutable::createFromFormat($format, $text);
        if ($date && $date->format(ltrim($format, '!')) === $text) {
            $year = (int) $date->format('Y');
            if ($year < 1900 || $year > 2200) {
                return null;
            }
            return $date->format('Y-m-d');
        }
    }
    return null;
}

function optionalDate(array $input, string $key): ?string
{
    $raw = trim((string) ($input[$key] ?? ''));
    if ($raw === '') {
        return null;
    }
    $date = normalizeDate($raw);
    if ($date === null) {
        sendError('Data inválida: ' . $key);
    }
    return $date;
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
    $value = str_replace('T', ' ', substr($value, 0, 19));
    foreach (['!Y-m-d H:i:s', '!Y-m-d H:i'] as $format) {
        $date = DateTimeImmutable::createFromFormat($format, $value);
        if ($date) {
            return $date->format('Y-m-d H:i:s');
        }
    }
    sendError('Data e hora inválidas: ' . $key);
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
    if (in_array($value, [true, 1, '1', 'true', 'on', 'sim', 'S', 's'], true)) {
        return 1;
    }
    return 0;
}

function enumValue(array $input, string $key, array $allowed, ?string $default = null): string
{
    $value = (string) ($input[$key] ?? $default ?? '');
    if (!in_array($value, $allowed, true)) {
        sendError('Valor inválido: ' . $key);
    }
    return $value;
}

function onlyDigits(?string $value): string
{
    return preg_replace('/\D+/', '', (string) $value);
}

/** Normaliza telefones brasileiros para o formato internacional usado pelo WhatsApp (55 + DDD + número). */
function normalizePhone(?string $value, string $defaultDdd = ''): string
{
    $digits = onlyDigits($value);
    if ($digits === '') {
        return '';
    }
    $digits = ltrim($digits, '0');
    if (strlen($digits) === 8 || strlen($digits) === 9) {
        if ($defaultDdd === '') {
            return $digits;
        }
        $digits = $defaultDdd . $digits;
    }
    if (strlen($digits) === 10 || strlen($digits) === 11) {
        $digits = '55' . $digits;
    }
    return $digits;
}

function jsonColumn($value): ?string
{
    if ($value === null) {
        return null;
    }
    return json_encode($value, JSON_UNESCAPED_UNICODE);
}

function decodeJsonColumn(?string $value, $default = [])
{
    if ($value === null || $value === '') {
        return $default;
    }
    $decoded = json_decode($value, true);
    return $decoded ?? $default;
}

// Resolve registros dentro da empresa da sessão, nunca apenas pelo ID informado.
function requireCompanyRecord(string $table, $id, int $companyId, string $label = 'Registro'): array
{
    $recordId = validatedInteger($id);
    $row = fetchOne("SELECT * FROM {$table} WHERE id = ? AND company_id = ?", [$recordId, $companyId]);
    if (!$row) {
        sendError($label . ' não encontrado.', 404);
    }
    return $row;
}

function optionalCompanyReference(array $input, string $key, string $table, int $companyId, string $label): ?int
{
    $value = $input[$key] ?? null;
    if ($value === null || $value === '' || $value === 0 || $value === '0') {
        return null;
    }
    return (int) requireCompanyRecord($table, $value, $companyId, $label)['id'];
}
