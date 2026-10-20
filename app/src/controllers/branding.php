<?php
declare(strict_types=1);

function handleBranding(string $method, array $input, int $companyId): never
{
    if ($method === 'GET') {
        $company = executeQuery('SELECT name, logo_data FROM companies WHERE id = ?', [
            $companyId,
        ])->fetch();
        sendJson($company);
    }

    if ($method !== 'PATCH') {
        sendError('Método não permitido.', 405);
    }

    $name = requiredText($input, 'name', 120);
    $logoData = validateLogoData($input['logo_data'] ?? null);

    executeQuery('UPDATE companies SET name = ?, logo_data = ? WHERE id = ?', [
        $name,
        $logoData,
        $companyId,
    ]);
    sendJson(['ok' => true, 'name' => $name, 'logo_data' => $logoData]);
}

function validateLogoData(mixed $logoData): ?string
{
    if ($logoData === null || $logoData === '') {
        return null;
    }
    if (!is_string($logoData)) {
        sendError('Logo inválido.');
    }

    $pattern = '/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+\/=]+)$/';
    if (!preg_match($pattern, $logoData, $matches)) {
        sendError('Envie uma imagem PNG, JPEG ou WebP.');
    }
    $binary = base64_decode($matches[2], true);
    if ($binary === false || strlen($binary) > 2 * 1024 * 1024) {
        sendError('O logo deve ter no máximo 2 MB.');
    }

    $imageInfo = @getimagesizefromstring($binary);
    $allowedTypes = [IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP];
    if (!$imageInfo || !in_array($imageInfo[2], $allowedTypes, true)) {
        sendError('O arquivo enviado não é uma imagem válida.');
    }
    return $logoData;
}
