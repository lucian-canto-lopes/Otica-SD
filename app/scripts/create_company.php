<?php
declare(strict_types=1);

/*
 * Cadastra uma ótica pela linha de comando.
 * php app/scripts/create_company.php --name="Ótica Luzir" --owner-email=dono@exemplo.com --owner-password=senha123 [--logo=caminho.jpg]
 *   [--trade-name=...] [--document=...] [--city=...] [--state=..] [--phone=...] [--whatsapp=...] [--ddd=93] [--status=active]
 */

require __DIR__ . '/../src/bootstrap.php';

$options = getopt('', ['name:', 'trade-name::', 'owner-email:', 'owner-name::', 'owner-password::', 'logo::', 'document::', 'city::', 'state::', 'phone::', 'whatsapp::', 'ddd::', 'status::', 'color::']);
if (empty($options['name']) || empty($options['owner-email'])) {
    fwrite(STDERR, "Informe --name e --owner-email.\n");
    exit(1);
}

$existing = fetchValue('SELECT id FROM companies WHERE name = ?', [$options['name']]);
if ($existing) {
    echo "A ótica já existe (id {$existing}).\n";
    exit(0);
}

$password = $options['owner-password'] ?? bin2hex(random_bytes(5));
$companyId = inTransaction(static function () use ($options, $password): int {
    $companyId = insertRow('companies', [
        'name' => $options['name'],
        'trade_name' => $options['trade-name'] ?? $options['name'],
        'document' => $options['document'] ?? '',
        'city' => $options['city'] ?? '',
        'state' => strtoupper($options['state'] ?? ''),
        'phone' => $options['phone'] ?? '',
        'whatsapp' => $options['whatsapp'] ?? '',
        'status' => $options['status'] ?? 'active',
        'primary_color' => $options['color'] ?? '#4f2d7f',
        'plan_id' => fetchValue("SELECT id FROM plans WHERE name = 'Profissional'"),
        'monthly_fee' => (float) (fetchValue("SELECT price FROM plans WHERE name = 'Profissional'") ?? 0),
        'settings' => jsonColumn([
            'default_ddd' => $options['ddd'] ?? '',
            'quote_validity_days' => '15',
            'prescription_validity_months' => '12',
            'renewal_months' => '12',
            'sale_terms' => 'Declaro estar de acordo com os produtos, valores e condições deste pedido. Óculos não retirados em até 90 dias após o aviso de pronto poderão ser descartados. Garantia conforme fabricante.',
            'order_terms' => 'Conferir medidas e centragem antes da montagem.',
        ]),
    ]);
    seedCompanyDefaults($companyId);
    $userId = findOrCreateUser(strtolower($options['owner-email']), $options['owner-name'] ?? 'Responsável ' . $options['name'], $password);
    linkUserToCompany($userId, $companyId, 'owner');
    return $companyId;
});

if (!empty($options['logo']) && is_file($options['logo'])) {
    $extension = strtolower(pathinfo($options['logo'], PATHINFO_EXTENSION)) === 'png' ? 'png' : 'jpg';
    $relative = "company_{$companyId}/branding/logo." . $extension;
    ensureDirectory(dirname(storagePath($relative)));
    copy($options['logo'], storagePath($relative));
    executeQuery('UPDATE companies SET logo_path = ? WHERE id = ?', [$relative, $companyId]);
}

auditLog('create', 'company', $companyId, 'Ótica cadastrada pela linha de comando: ' . $options['name'], null, $companyId);
echo "Ótica criada (id {$companyId}). Acesso: {$options['owner-email']} / {$password}\n";
