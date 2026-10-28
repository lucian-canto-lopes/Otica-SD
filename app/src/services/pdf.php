<?php
declare(strict_types=1);

require_once __DIR__ . '/../../lib/fpdf/fpdf.php';

/** Documento A5 com cabeçalho da ótica. Textos UTF-8 são convertidos para o padrão das fontes do FPDF. */
final class OcularPdf extends FPDF
{
    public array $company = [];
    public string $docTitle = '';
    public string $docNumber = '';
    public string $docDate = '';
    public array $accent = [79, 45, 127];

    public function __construct(array $company)
    {
        parent::__construct('P', 'mm', 'A5');
        $this->company = $company;
        $this->SetMargins(8, 8, 8);
        $this->SetAutoPageBreak(true, 12);
        if (preg_match('/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i', (string) ($company['primary_color'] ?? ''), $m)) {
            $this->accent = [hexdec($m[1]), hexdec($m[2]), hexdec($m[3])];
        }
        $this->SetTitle(self::t($company['trade_name'] ?: $company['name']), false);
        $this->AliasNbPages();
    }

    public static function t(?string $text): string
    {
        $converted = @iconv('UTF-8', 'windows-1252//TRANSLIT//IGNORE', (string) $text);
        return $converted === false ? (string) $text : $converted;
    }

    public function Header(): void
    {
        $logoPath = $this->company['logo_path'] ? storagePath($this->company['logo_path']) : null;
        $textX = 8;
        if ($logoPath && is_file($logoPath) && preg_match('/\.(jpe?g|png)$/i', $logoPath)) {
            try {
                [$width, $height] = getimagesize($logoPath) ?: [1, 1];
                $logoHeight = 16;
                $logoWidth = min(40, $logoHeight * $width / max(1, $height));
                $this->Image($logoPath, 8, 7, $logoWidth, 0);
                $textX = 10 + $logoWidth;
            } catch (Throwable $exception) {
                error_log('Logo no PDF: ' . $exception->getMessage());
            }
        }
        $c = $this->company;
        $this->SetXY($textX, 7);
        $this->SetFont('Helvetica', 'B', 10.5);
        $this->SetTextColor(...$this->accent);
        $this->Cell(88 - $textX, 5, self::t($c['trade_name'] ?: $c['name']), 0, 2);
        $this->SetFont('Helvetica', '', 6.8);
        $this->SetTextColor(70, 70, 70);
        $address = trim(implode(', ', array_filter([$c['address'], $c['number'], $c['neighborhood']])));
        $cityLine = trim(implode(' - ', array_filter([$c['city'], $c['state']])));
        foreach (array_filter([
            $address,
            $cityLine . ($c['zip'] ? ' · CEP ' . $c['zip'] : ''),
            implode(' · ', array_filter([$c['phone'] ? 'Tel. ' . $c['phone'] : '', $c['whatsapp'] ? 'WhatsApp ' . $c['whatsapp'] : ''])),
            implode(' · ', array_filter([$c['document'] ? 'CNPJ ' . $c['document'] : '', $c['instagram'] ? '@' . ltrim($c['instagram'], '@') : ''])),
        ]) as $line) {
            $this->SetX($textX);
            $this->Cell(88 - $textX, 3.2, self::t($line), 0, 2);
        }
        // Caixa com o tipo e o número do documento.
        $this->SetXY(96, 7);
        $this->SetFillColor(...$this->accent);
        $this->SetTextColor(255, 255, 255);
        $this->SetFont('Helvetica', 'B', 7.5);
        $this->Cell(44, 5, self::t($this->docTitle), 0, 2, 'C', true);
        $this->SetTextColor(...$this->accent);
        $this->SetFont('Helvetica', 'B', 15);
        $this->Cell(44, 8, self::t('Nº ' . $this->docNumber), 'LR', 2, 'C');
        $this->SetFont('Helvetica', '', 7);
        $this->SetTextColor(60, 60, 60);
        $this->Cell(44, 4.5, self::t($this->docDate), 'LRB', 2, 'C');
        $this->SetDrawColor(...$this->accent);
        $this->SetLineWidth(0.4);
        $this->Line(8, 27, 140, 27);
        $this->SetLineWidth(0.2);
        $this->SetDrawColor(180, 180, 180);
        $this->SetY(29);
        $this->SetTextColor(20, 20, 20);
    }

    public function Footer(): void
    {
        $this->SetY(-10);
        $this->SetFont('Helvetica', 'I', 6);
        $this->SetTextColor(130, 130, 130);
        $footer = (string) (decodeJsonColumn($this->company['settings'] ?? null, [])['pdf_footer'] ?? '');
        $this->Cell(100, 4, self::t(($footer ?: 'Documento sem valor fiscal') . ' · Emitido em ' . date('d/m/Y H:i')), 0, 0, 'L');
        $this->Cell(32, 4, self::t('Página ' . $this->PageNo() . '/{nb}'), 0, 0, 'R');
    }

    public function sectionTitle(string $title): void
    {
        $this->Ln(1.5);
        $this->SetFont('Helvetica', 'B', 7.5);
        $this->SetTextColor(...$this->accent);
        $this->Cell(0, 4.5, self::t(mb_strtoupper($title)), 'B', 1);
        $this->SetTextColor(20, 20, 20);
        $this->Ln(0.8);
    }

    /** Linha de campos rotulados: [[rótulo, valor, largura], ...]. */
    public function fieldRow(array $fields, float $height = 4.6): void
    {
        $y = $this->GetY();
        $x = 8;
        foreach ($fields as [$label, $value, $width]) {
            $this->SetXY($x, $y);
            $this->SetFont('Helvetica', '', 5.8);
            $this->SetTextColor(110, 110, 110);
            $this->Cell($width, 2.6, self::t($label), 0, 2);
            $this->SetFont('Helvetica', 'B', 7.6);
            $this->SetTextColor(20, 20, 20);
            $this->Cell($width, $height - 2.4, self::t($this->fit((string) $value, $width)), 0, 0);
            $x += $width;
        }
        $this->SetXY(8, $y + $height + 1);
    }

    public function fit(string $text, float $width): string
    {
        $text = trim($text);
        while ($text !== '' && $this->GetStringWidth(self::t($text)) > $width - 1) {
            $text = mb_substr($text, 0, -2) . '…';
            if (mb_strlen($text) < 3) {
                break;
            }
        }
        return $text;
    }

    /** Grade de graus OD/OE usada em pedidos, orçamentos e OS. */
    public function prescriptionGrid(array $p, bool $withHeight = true): void
    {
        $columns = ['', 'Esférico', 'Cilíndrico', 'Eixo', 'DNP'];
        $widths = [16, 26, 26, 20, 20];
        if ($withHeight) {
            $columns[] = 'Altura';
            $widths[] = 24;
        }
        $this->SetFont('Helvetica', 'B', 6.5);
        $this->SetFillColor(243, 240, 248);
        foreach ($columns as $i => $column) {
            $this->Cell($widths[$i], 4.5, self::t($column), 1, 0, 'C', true);
        }
        $this->Ln();
        foreach (['od' => 'OD', 'oe' => 'OE'] as $eye => $label) {
            $this->SetFont('Helvetica', 'B', 7);
            $this->Cell($widths[0], 5, $label, 1, 0, 'C', true);
            $this->SetFont('Helvetica', '', 8);
            $fields = ['sph', 'cyl', 'axis', 'dnp'];
            if ($withHeight) {
                $fields[] = 'height';
            }
            foreach ($fields as $i => $field) {
                $this->Cell($widths[$i + 1], 5, self::t((string) ($p["{$eye}_{$field}"] ?? '')), 1, 0, 'C');
            }
            $this->Ln();
        }
        $this->SetFont('Helvetica', '', 6.5);
        $this->Cell(16, 4.5, self::t('Adição'), 1, 0, 'C', true);
        $this->SetFont('Helvetica', 'B', 8);
        $this->Cell(26, 4.5, self::t((string) ($p['addition'] ?? '')), 1, 0, 'C');
        $extra = array_filter([
            !empty($p['doctor']) ? 'Médico: ' . $p['doctor'] : '',
            !empty($p['prescribed_at']) ? 'Receita: ' . brDate($p['prescribed_at']) : '',
            !empty($p['expires_at']) ? 'Validade: ' . brDate($p['expires_at']) : '',
        ]);
        $this->SetFont('Helvetica', '', 6.5);
        $this->Cell(0, 4.5, self::t(' ' . implode(' · ', $extra)), 0, 1);
    }

    public function itemsTable(array $items): void
    {
        $this->SetFont('Helvetica', 'B', 6.5);
        $this->SetFillColor(243, 240, 248);
        $this->Cell(12, 4.5, 'Qtd', 1, 0, 'C', true);
        $this->Cell(76, 4.5, self::t('Descrição'), 1, 0, 'L', true);
        $this->Cell(22, 4.5, self::t('Unitário'), 1, 0, 'R', true);
        $this->Cell(22, 4.5, 'Total', 1, 1, 'R', true);
        $this->SetFont('Helvetica', '', 7.5);
        foreach ($items as $item) {
            $quantity = (float) $item['quantity'];
            $description = $item['description'] . ((float) $item['discount'] > 0 ? ' (desc. ' . money($item['discount']) . ')' : '');
            $lines = max(1, (int) ceil($this->GetStringWidth(self::t($description)) / 74));
            $height = 4.4 * min($lines, 3);
            if ($this->GetY() + $height > 190) {
                $this->AddPage();
            }
            $y = $this->GetY();
            $this->Cell(12, $height, self::t(rtrim(rtrim(number_format($quantity, 2, ',', ''), '0'), ',')), 1, 0, 'C');
            $this->MultiCell(76, $height / min($lines, 3), self::t($description), 1, 'L');
            $this->SetXY(96, $y);
            $this->Cell(22, $height, self::t(money($item['unit_price'])), 1, 0, 'R');
            $this->Cell(22, $height, self::t(money($item['total'])), 1, 1, 'R');
        }
    }

    public function totalsBox(array $rows, float $x = 88): void
    {
        foreach ($rows as [$label, $value, $bold]) {
            $this->SetX($x);
            $this->SetFont('Helvetica', $bold ? 'B' : '', $bold ? 8.5 : 7.5);
            if ($bold) {
                $this->SetTextColor(...$this->accent);
            }
            $this->Cell(30, 4.6, self::t($label), 0, 0, 'R');
            $this->Cell(22, 4.6, self::t(money($value)), 0, 1, 'R');
            $this->SetTextColor(20, 20, 20);
        }
    }

    public function paragraph(string $text, float $size = 7): void
    {
        $this->SetFont('Helvetica', '', $size);
        $this->MultiCell(0, 3.4, self::t($text));
    }

    public function signatures(array $labels): void
    {
        $this->Ln(9);
        $y = $this->GetY();
        $width = 132 / count($labels);
        foreach ($labels as $i => $label) {
            $x = 8 + $i * $width;
            $this->Line($x + 4, $y, $x + $width - 4, $y);
            $this->SetXY($x, $y + 0.5);
            $this->SetFont('Helvetica', '', 6.5);
            $this->Cell($width, 3.5, self::t($label), 0, 0, 'C');
        }
        $this->Ln(5);
    }
}

function clientAddressLine(array $row): string
{
    return trim(implode(', ', array_filter([
        $row['client_address'] ?? '',
        $row['client_number'] ?? '',
        $row['client_neighborhood'] ?? '',
        trim(($row['client_city'] ?? '') . (!empty($row['client_state']) ? '/' . $row['client_state'] : '')),
    ])), ', ');
}

function formatCpf(?string $cpf): string
{
    $digits = onlyDigits($cpf);
    return strlen($digits) === 11 ? substr($digits, 0, 3) . '.' . substr($digits, 3, 3) . '.' . substr($digits, 6, 3) . '-' . substr($digits, 9) : (string) $cpf;
}

function formatPhone(?string $phone): string
{
    $digits = onlyDigits($phone);
    if (strlen($digits) === 13 && str_starts_with($digits, '55')) {
        $digits = substr($digits, 2);
    } elseif (strlen($digits) === 12 && str_starts_with($digits, '55')) {
        $digits = substr($digits, 2);
    }
    if (strlen($digits) === 11) {
        return '(' . substr($digits, 0, 2) . ') ' . substr($digits, 2, 5) . '-' . substr($digits, 7);
    }
    if (strlen($digits) === 10) {
        return '(' . substr($digits, 0, 2) . ') ' . substr($digits, 2, 4) . '-' . substr($digits, 6);
    }
    return (string) $phone;
}

function renderSalePdf(array $company, array $sale): string
{
    $pdf = new OcularPdf($company);
    $pdf->docTitle = $sale['status'] === 'cancelled' ? 'PEDIDO CANCELADO' : 'PEDIDO DE VENDA';
    $pdf->docNumber = str_pad((string) $sale['number'], 5, '0', STR_PAD_LEFT);
    $pdf->docDate = 'Data: ' . brDate($sale['sale_date']);
    $pdf->AddPage();

    $pdf->sectionTitle('Cliente');
    $pdf->fieldRow([['Nome', $sale['client_name'] ?? 'Consumidor', 84], ['CPF', formatCpf($sale['client_cpf'] ?? ''), 26], ['Nascimento', brDate($sale['client_birth_date'] ?? null), 22]]);
    $pdf->fieldRow([['Endereço', clientAddressLine($sale), 84], ['Telefone / WhatsApp', formatPhone($sale['client_whatsapp'] ?: ($sale['client_phone'] ?? '')), 48]]);

    if (!empty($sale['prescription'])) {
        $pdf->sectionTitle('Receita');
        $pdf->prescriptionGrid($sale['prescription']);
    }

    $pdf->sectionTitle('Itens');
    $pdf->itemsTable($sale['items']);
    $pdf->Ln(1);
    $yTotals = $pdf->GetY();
    $balance = max(0, (float) $sale['total'] - (float) $sale['paid']);
    $pdf->totalsBox([
        ['Subtotal', $sale['subtotal'], false],
        ['Desconto', $sale['discount'], false],
        ['Total', $sale['total'], true],
        ['Pago / entrada', $sale['paid'], false],
        ['Saldo a pagar', $balance, true],
    ]);
    $yAfterTotals = $pdf->GetY();

    // Condições de pagamento ao lado dos totais.
    $pdf->SetXY(8, $yTotals);
    $pdf->SetFont('Helvetica', 'B', 6.8);
    $pdf->Cell(78, 4, OcularPdf::t('Condições de pagamento'), 0, 2);
    $pdf->SetFont('Helvetica', '', 6.8);
    if ($sale['payments']) {
        foreach (array_slice($sale['payments'], 0, 8) as $payment) {
            $line = $payment['installment'] . 'ª · ' . (PAYMENT_METHODS[$payment['method']] ?? $payment['method']) . ' · ' . money($payment['amount'])
                . ($payment['due_date'] ? ' · venc. ' . brDate($payment['due_date']) : '')
                . ($payment['paid_at'] ? ' · pago' : '');
            $pdf->Cell(78, 3.4, OcularPdf::t($line), 0, 2);
        }
    } else {
        $pdf->MultiCell(78, 3.4, OcularPdf::t($sale['payment_terms'] ?: '—'));
    }
    $pdf->SetY(max($yAfterTotals, $pdf->GetY()) + 1);

    $pdf->fieldRow([
        ['Previsão de entrega', brDate($sale['delivery_date']) ?: '—', 34],
        ['Vendedor(a)', $sale['seller_name'] ?? '', 50],
        ['OS vinculada', implode(', ', array_map(static fn($o) => 'nº ' . $o['number'], $sale['service_orders'])) ?: '—', 48],
    ]);
    if (trim((string) $sale['notes']) !== '') {
        $pdf->sectionTitle('Observações');
        $pdf->paragraph((string) $sale['notes']);
    }
    $terms = (string) (decodeJsonColumn($company['settings'], [])['sale_terms'] ?? '');
    if ($terms !== '') {
        $pdf->Ln(1);
        $pdf->SetTextColor(90, 90, 90);
        $pdf->paragraph($terms, 6.2);
        $pdf->SetTextColor(20, 20, 20);
    }
    if ($sale['status'] === 'cancelled') {
        $pdf->Ln(2);
        $pdf->SetTextColor(200, 30, 30);
        $pdf->paragraph('VENDA CANCELADA: ' . $sale['cancel_reason'], 8);
        $pdf->SetTextColor(20, 20, 20);
    }
    $pdf->signatures(['Assinatura do cliente', 'Assinatura da ótica']);
    return $pdf->Output('S');
}

function renderQuotePdf(array $company, array $quote): string
{
    $pdf = new OcularPdf($company);
    $pdf->docTitle = 'ORÇAMENTO';
    $pdf->docNumber = str_pad((string) $quote['number'], 5, '0', STR_PAD_LEFT);
    $pdf->docDate = 'Data: ' . brDate($quote['quote_date']);
    $pdf->AddPage();
    $pdf->sectionTitle('Cliente');
    $pdf->fieldRow([
        ['Nome', $quote['client_name'] ?: $quote['contact_name'], 84],
        ['Telefone / WhatsApp', formatPhone(($quote['client_whatsapp'] ?? '') ?: ($quote['contact_phone'] ?? '')), 48],
    ]);
    if (!empty($quote['prescription'])) {
        $pdf->sectionTitle('Receita');
        $pdf->prescriptionGrid($quote['prescription']);
    }
    $pdf->sectionTitle('Itens');
    $pdf->itemsTable($quote['items']);
    $pdf->Ln(1);
    $pdf->totalsBox([['Subtotal', $quote['subtotal'], false], ['Desconto', $quote['discount'], false], ['Total', $quote['total'], true]]);
    $pdf->Ln(1);
    $pdf->fieldRow([['Válido até', brDate($quote['valid_until']), 34], ['Vendedor(a)', $quote['seller_name'] ?? '', 98]]);
    if (trim((string) $quote['notes']) !== '') {
        $pdf->sectionTitle('Observações');
        $pdf->paragraph((string) $quote['notes']);
    }
    $pdf->Ln(2);
    $pdf->SetTextColor(90, 90, 90);
    $pdf->paragraph('Valores sujeitos a alteração após a validade. Prazo de entrega confirmado no fechamento do pedido.', 6.2);
    return $pdf->Output('S');
}

function renderServiceOrderPdf(array $company, array $order): string
{
    $pdf = new OcularPdf($company);
    $pdf->docTitle = 'ORDEM DE SERVIÇO';
    $pdf->docNumber = str_pad((string) $order['number'], 5, '0', STR_PAD_LEFT);
    $pdf->docDate = 'Abertura: ' . brDate($order['created_at']);
    $pdf->AddPage();
    $pdf->sectionTitle('Cliente e laboratório');
    $pdf->fieldRow([['Cliente', $order['client_name'] ?? '', 84], ['Telefone / WhatsApp', formatPhone($order['client_whatsapp'] ?: ($order['client_phone'] ?? '')), 48]]);
    $pdf->fieldRow([
        ['Laboratório', $order['laboratory_name'] ?? '—', 60],
        ['Previsão de entrega', brDate($order['promised_date']) ?: '—', 30],
        ['Venda', $order['sale_number'] ? 'nº ' . $order['sale_number'] : 'Avulsa', 20],
        ['Etapa', serviceOrderStatusLabel($order['status']), 22],
    ]);
    $pdf->sectionTitle('Graus');
    $pdf->prescriptionGrid($order);
    $pdf->sectionTitle('Lentes e armação');
    $pdf->fieldRow([['Lentes', $order['lens_description'] ?: '—', 132]]);
    $pdf->fieldRow([
        ['Armação', $order['frame_description'] ?: '—', 84],
        ['Tipo', $order['frame_type'] ?: '—', 26],
        ['Armação do cliente', $order['frame_from_client'] ? 'Sim' : 'Não', 22],
    ]);
    $pdf->fieldRow([
        ['Ponte', $order['bridge'], 33],
        ['Horizontal', $order['horizontal'], 33],
        ['Vertical', $order['vertical'], 33],
        ['Diagonal maior', $order['diagonal'], 33],
    ]);
    if ($order['sale_items']) {
        $pdf->sectionTitle('Itens da venda');
        $pdf->SetFont('Helvetica', '', 7);
        foreach (array_slice($order['sale_items'], 0, 6) as $item) {
            $pdf->Cell(0, 3.6, OcularPdf::t('• ' . rtrim(rtrim(number_format((float) $item['quantity'], 2, ',', ''), '0'), ',') . 'x ' . $item['description']), 0, 1);
        }
    }
    if (trim((string) $order['notes']) !== '') {
        $pdf->sectionTitle('Observações');
        $pdf->paragraph((string) $order['notes']);
    }
    $terms = (string) (decodeJsonColumn($company['settings'], [])['order_terms'] ?? '');
    if ($terms !== '') {
        $pdf->Ln(1);
        $pdf->SetTextColor(90, 90, 90);
        $pdf->paragraph($terms, 6.2);
        $pdf->SetTextColor(20, 20, 20);
    }
    $pdf->signatures(['Responsável', 'Conferência / montagem']);

    // Canhoto destacável para o cliente apresentar na retirada.
    if ($pdf->GetY() > 160) {
        $pdf->AddPage();
    }
    $y = max($pdf->GetY() + 2, 168);
    $pdf->SetDrawColor(150, 150, 150);
    for ($x = 8; $x < 140; $x += 3) {
        $pdf->Line($x, $y, $x + 1.5, $y);
    }
    $pdf->SetXY(8, $y + 1.5);
    $pdf->SetFont('Helvetica', 'I', 5.5);
    $pdf->SetTextColor(130, 130, 130);
    $pdf->Cell(0, 2.5, OcularPdf::t('recorte aqui · comprovante do cliente'), 0, 1, 'C');
    $pdf->SetTextColor(20, 20, 20);
    $pdf->SetFont('Helvetica', 'B', 9);
    $pdf->SetTextColor(...$pdf->accent);
    $pdf->Cell(90, 5, OcularPdf::t(($company['trade_name'] ?: $company['name']) . ' · OS nº ' . $pdf->docNumber), 0, 0);
    $pdf->SetFont('Helvetica', '', 7);
    $pdf->SetTextColor(20, 20, 20);
    $pdf->Cell(42, 5, OcularPdf::t('Retirada prevista: ' . (brDate($order['promised_date']) ?: 'a confirmar')), 0, 1, 'R');
    $pdf->fieldRow([
        ['Cliente', $order['client_name'] ?? '', 84],
        ['Valor da venda', $order['sale_total'] !== null ? money($order['sale_total']) : '—', 24],
        ['Saldo', $order['sale_total'] !== null ? money(max(0, (float) $order['sale_total'] - (float) $order['sale_paid'])) : '—', 24],
    ]);
    $pdf->SetFont('Helvetica', '', 6.3);
    $pdf->Cell(0, 3.2, OcularPdf::t('Apresente este comprovante na retirada. Contato: ' . formatPhone($company['whatsapp'] ?: $company['phone'])), 0, 1);
    return $pdf->Output('S');
}

function handlePdf(string $method, array $input): never
{
    $companyId = Context::companyId();
    $company = fetchOne('SELECT * FROM companies WHERE id = ?', [$companyId]);
    $type = query('type', '');
    $id = requireRouteId();
    [$content, $name] = match ($type) {
        'sale' => (static function () use ($company, $id, $companyId): array {
            $sale = saleDetail($id, $companyId);
            return [renderSalePdf($company, $sale), 'pedido-' . $sale['number'] . '.pdf'];
        })(),
        'quote' => (static function () use ($company, $id, $companyId): array {
            $quote = quoteDetail($id, $companyId);
            return [renderQuotePdf($company, $quote), 'orcamento-' . $quote['number'] . '.pdf'];
        })(),
        'service_order' => (static function () use ($company, $id, $companyId): array {
            $order = serviceOrderDetail($id, $companyId);
            return [renderServiceOrderPdf($company, $order), 'os-' . $order['number'] . '.pdf'];
        })(),
        default => sendError('Tipo de documento inválido.'),
    };
    auditLog('print', $type, $id, 'Documento impresso: ' . $name);
    header_remove('Content-Type');
    header('Content-Type: application/pdf');
    header('Content-Length: ' . strlen($content));
    header('Content-Disposition: ' . (query('download') === '1' ? 'attachment' : 'inline') . '; filename="' . $name . '"');
    echo $content;
    exit();
}
