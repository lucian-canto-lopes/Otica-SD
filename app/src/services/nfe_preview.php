<?php
declare(strict_types=1);

const NFE_PREVIEW_NS = 'http://www.portalfiscal.inf.br/nfe';
const NFE_PREVIEW_XSD = __DIR__ . '/../../schemas/nfe/PL_010h_v1.03/nfe_v4.00.xsd';

function nfeNode(DOMElement $parent, string $name, string|int|float $value): DOMElement
{
    $node = $parent->ownerDocument->createElementNS(NFE_PREVIEW_NS, $name);
    $node->appendChild($parent->ownerDocument->createTextNode((string) $value));
    $parent->appendChild($node);
    return $node;
}

function nfeGroup(DOMElement $parent, string $name): DOMElement
{
    $node = $parent->ownerDocument->createElementNS(NFE_PREVIEW_NS, $name);
    $parent->appendChild($node);
    return $node;
}

function nfeFields(DOMElement $parent, array $fields): void
{
    foreach ($fields as $name => $value) {
        nfeNode($parent, $name, (string) $value);
    }
}

function nfeTestKey(array $issuer, int $series, int $number, string $issuedAt, string $numericCode): string
{
    $cityCode = (string) $issuer['fiscal_city_code'];
    $cnpj = normalizeFiscalCnpj((string) $issuer['document']);
    $body = substr($cityCode, 0, 2) . (new DateTimeImmutable($issuedAt))->format('ym') . $cnpj . '55'
        . str_pad((string) $series, 3, '0', STR_PAD_LEFT)
        . str_pad((string) $number, 9, '0', STR_PAD_LEFT) . '1' . $numericCode;
    $weight = 2;
    $sum = 0;
    for ($index = strlen($body) - 1; $index >= 0; $index--) {
        $sum += (ord($body[$index]) - 48) * $weight;
        $weight = $weight === 9 ? 2 : $weight + 1;
    }
    $remainder = $sum % 11;
    return $body . ($remainder < 2 ? '0' : (string) (11 - $remainder));
}

function nfePreviewAddress(DOMElement $parent, array $address): void
{
    nfeFields($parent, [
        'xLgr' => $address['address'], 'nro' => $address['number'],
        'xBairro' => $address['neighborhood'], 'cMun' => $address['fiscal_city_code'],
        'xMun' => $address['city'], 'UF' => $address['state'],
        'CEP' => onlyDigits((string) $address['zip']),
    ]);
}

/** Prévia sem assinatura para o cenário fechado: venda interna, consumidor final, CRT 1 e CSOSN 102. */
function nfePreviewXml(array $snapshot, int $series, int $number, ?string $numericCode = null): array
{
    $numericCode ??= str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
    $issuer = $snapshot['issuer'];
    $recipient = $snapshot['recipient'];
    $key = nfeTestKey($issuer, $series, $number, $snapshot['issued_at'], $numericCode);
    $dom = new DOMDocument('1.0', 'UTF-8');
    $dom->formatOutput = true;
    $root = $dom->createElementNS(NFE_PREVIEW_NS, 'NFe');
    $dom->appendChild($root);
    $info = nfeGroup($root, 'infNFe');
    $info->setAttribute('Id', 'NFe' . $key);
    $info->setAttribute('versao', '4.00');

    $ide = nfeGroup($info, 'ide');
    nfeFields($ide, [
        'cUF' => substr((string) $issuer['fiscal_city_code'], 0, 2),
        'cNF' => $numericCode, 'natOp' => 'Venda de mercadoria - teste',
        'mod' => '55', 'serie' => $series, 'nNF' => $number,
        'dhEmi' => $snapshot['issued_at'], 'tpNF' => '1', 'idDest' => '1',
        'cMunFG' => $issuer['fiscal_city_code'], 'tpImp' => '1', 'tpEmis' => '1',
        'cDV' => substr($key, -1), 'tpAmb' => '2', 'finNFe' => '1',
        'indFinal' => '1', 'indPres' => '1', 'procEmi' => '0', 'verProc' => 'Ocular 2.1',
    ]);

    $emit = nfeGroup($info, 'emit');
    nfeNode($emit, 'CNPJ', normalizeFiscalCnpj((string) $issuer['document']));
    nfeNode($emit, 'xNome', $issuer['name']);
    if (trim((string) $issuer['trade_name']) !== '') nfeNode($emit, 'xFant', $issuer['trade_name']);
    nfePreviewAddress(nfeGroup($emit, 'enderEmit'), $issuer);
    nfeFields($emit, ['IE' => $issuer['fiscal_ie'], 'CRT' => $issuer['fiscal_crt']]);

    $dest = nfeGroup($info, 'dest');
    if (trim((string) $recipient['cnpj']) !== '') {
        nfeNode($dest, 'CNPJ', normalizeFiscalCnpj((string) $recipient['cnpj']));
    } else {
        nfeNode($dest, 'CPF', onlyDigits((string) $recipient['document']));
    }
    nfeNode($dest, 'xNome', $recipient['name']);
    nfePreviewAddress(nfeGroup($dest, 'enderDest'), $recipient);
    nfeNode($dest, 'indIEDest', $recipient['fiscal_ie_indicator']);
    if ($recipient['fiscal_ie_indicator'] === '1') nfeNode($dest, 'IE', $recipient['fiscal_ie']);

    $remainingSaleDiscount = (int) round((float) $snapshot['sale_discount'] * 100);
    $subtotalCents = (int) round((float) $snapshot['subtotal'] * 100);
    $lastItemIndex = count($snapshot['items']) - 1;
    foreach ($snapshot['items'] as $itemIndex => $item) {
        $det = nfeGroup($info, 'det');
        $det->setAttribute('nItem', (string) $item['number']);
        $prod = nfeGroup($det, 'prod');
        nfeFields($prod, [
            'cProd' => ($item['sku'] ?? '') ?: 'ITEM-' . $item['number'],
            'cEAN' => 'SEM GTIN', 'xProd' => $item['description'],
            'NCM' => $item['fiscal_ncm'], 'CFOP' => $item['fiscal_cfop'],
            'uCom' => $item['unit'], 'qCom' => $item['quantity'],
            'vUnCom' => $item['unit_price'], 'vProd' => $item['gross'],
            'cEANTrib' => 'SEM GTIN', 'uTrib' => $item['unit'],
            'qTrib' => $item['quantity'], 'vUnTrib' => $item['unit_price'],
        ]);
        $saleShare = $itemIndex === $lastItemIndex || $subtotalCents === 0
            ? $remainingSaleDiscount
            : min($remainingSaleDiscount, (int) round((float) $item['total'] * 100 * (int) round((float) $snapshot['sale_discount'] * 100) / $subtotalCents));
        $remainingSaleDiscount -= $saleShare;
        $lineDiscount = (int) round((float) $item['discount'] * 100) + $saleShare;
        if ($lineDiscount > 0) nfeNode($prod, 'vDesc', number_format($lineDiscount / 100, 2, '.', ''));
        nfeNode($prod, 'indTot', '1');
        $tax = nfeGroup($det, 'imposto');
        $icms = nfeGroup(nfeGroup($tax, 'ICMS'), 'ICMSSN102');
        nfeFields($icms, ['orig' => $item['fiscal_origin'], 'CSOSN' => '102']);
        $pis = nfeGroup(nfeGroup($tax, 'PIS'), 'PISNT');
        nfeNode($pis, 'CST', '07');
        $cofins = nfeGroup(nfeGroup($tax, 'COFINS'), 'COFINSNT');
        nfeNode($cofins, 'CST', '07');
    }

    $total = nfeGroup(nfeGroup($info, 'total'), 'ICMSTot');
    nfeFields($total, [
        'vBC' => '0.00', 'vICMS' => '0.00', 'vICMSDeson' => '0.00',
        'vFCP' => '0.00', 'vBCST' => '0.00', 'vST' => '0.00',
        'vFCPST' => '0.00', 'vFCPSTRet' => '0.00',
        'vProd' => $snapshot['gross_total'], 'vFrete' => '0.00',
        'vSeg' => '0.00', 'vDesc' => $snapshot['total_discount'],
        'vII' => '0.00', 'vIPI' => '0.00', 'vIPIDevol' => '0.00',
        'vPIS' => '0.00', 'vCOFINS' => '0.00', 'vOutro' => '0.00',
        'vNF' => $snapshot['total'],
    ]);
    nfeNode(nfeGroup($info, 'transp'), 'modFrete', '9');
    $payment = nfeGroup(nfeGroup($info, 'pag'), 'detPag');
    nfeFields($payment, ['tPag' => '99', 'xPag' => 'Pagamento de teste', 'vPag' => $snapshot['total']]);
    nfeNode(nfeGroup($info, 'infAdic'), 'infCpl', 'PREVIA LOCAL SEM ASSINATURA E SEM VALOR FISCAL. NAO TRANSMITIR A SEFAZ. TRIBUTOS E PAGAMENTO SAO FICTICIOS.');

    return ['xml' => $dom->saveXML(), 'key' => $key];
}

/** O XSD exige Signature. Insere uma estrutura fictícia só na cópia em memória para conferir o restante. */
function nfePreviewSchemaErrors(string $unsignedXml): array
{
    $dom = new DOMDocument();
    $previousErrorMode = libxml_use_internal_errors(true);
    if (!$dom->loadXML($unsignedXml, LIBXML_NONET)) {
        $errors = array_map(static fn(LibXMLError $error): string => trim($error->message), libxml_get_errors());
        libxml_clear_errors();
        libxml_use_internal_errors($previousErrorMode);
        return $errors;
    }
    $ds = 'http://www.w3.org/2000/09/xmldsig#';
    $signature = $dom->createElementNS($ds, 'ds:Signature');
    $dom->documentElement->appendChild($signature);
    $signedInfo = $dom->createElementNS($ds, 'ds:SignedInfo');
    $signature->appendChild($signedInfo);
    foreach ([
        'CanonicalizationMethod' => 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
        'SignatureMethod' => 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    ] as $tag => $algorithm) {
        $node = $dom->createElementNS($ds, 'ds:' . $tag);
        $node->setAttribute('Algorithm', $algorithm);
        $signedInfo->appendChild($node);
    }
    $reference = $dom->createElementNS($ds, 'ds:Reference');
    $reference->setAttribute('URI', '#' . $dom->getElementsByTagNameNS(NFE_PREVIEW_NS, 'infNFe')->item(0)->getAttribute('Id'));
    $signedInfo->appendChild($reference);
    $transforms = $dom->createElementNS($ds, 'ds:Transforms');
    $reference->appendChild($transforms);
    foreach (['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'] as $algorithm) {
        $transform = $dom->createElementNS($ds, 'ds:Transform');
        $transform->setAttribute('Algorithm', $algorithm);
        $transforms->appendChild($transform);
    }
    $digestMethod = $dom->createElementNS($ds, 'ds:DigestMethod');
    $digestMethod->setAttribute('Algorithm', 'http://www.w3.org/2000/09/xmldsig#sha1');
    $reference->appendChild($digestMethod);
    $digest = $dom->createElementNS($ds, 'ds:DigestValue', 'AA==');
    $reference->appendChild($digest);
    $signature->appendChild($dom->createElementNS($ds, 'ds:SignatureValue', 'AA=='));
    $keyInfo = $dom->createElementNS($ds, 'ds:KeyInfo');
    $signature->appendChild($keyInfo);
    $x509 = $dom->createElementNS($ds, 'ds:X509Data');
    $keyInfo->appendChild($x509);
    $x509->appendChild($dom->createElementNS($ds, 'ds:X509Certificate', 'AA=='));

    $valid = $dom->schemaValidate(NFE_PREVIEW_XSD);
    $errors = $valid ? [] : array_map(static fn(LibXMLError $error): string => trim($error->message), libxml_get_errors());
    libxml_clear_errors();
    libxml_use_internal_errors($previousErrorMode);
    return array_values(array_unique($errors));
}
