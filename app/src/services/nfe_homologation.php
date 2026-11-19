<?php
declare(strict_types=1);

/**
 * Preparação da integração real. Nenhuma função deste arquivo envia dados à SEFAZ.
 * O certificado é lido apenas de arquivos privados montados em /run/secrets.
 */
const NFE_SVRS_UFS = ['AC', 'AL', 'AP', 'CE', 'DF', 'ES', 'PA', 'PB', 'PI', 'RJ', 'RN', 'RO', 'RR', 'SC', 'SE', 'TO'];

function nfeHomologationIssue(array &$issues, string $code, string $message, ?string $href = null): void
{
    $issues[] = ['code' => $code, 'message' => $message, 'href' => $href];
}

function nfePrivateSecret(string $variable, array &$issues): ?string
{
    $configuredPath = trim((string) getenv($variable));
    if ($configuredPath === '') return null;
    $path = realpath($configuredPath);
    if ($path === false || !str_starts_with($path, '/run/secrets/') || !is_file($path) || !is_readable($path)) {
        nfeHomologationIssue($issues, 'secret_unavailable', 'Um arquivo privado da homologação não está acessível em /run/secrets.');
        return null;
    }
    $content = file_get_contents($path);
    if ($content === false || $content === '') {
        nfeHomologationIssue($issues, 'secret_empty', 'Um arquivo privado da homologação está vazio.');
        return null;
    }
    return $content;
}

function nfeCertificateIdentity(array $parsed): ?string
{
    $alternative = (string) ($parsed['extensions']['subjectAltName'] ?? '');
    if (preg_match('/2\.16\.76\.1\.3\.3[^0-9A-Z]*([0-9A-Z]{12}[0-9]{2})/i', $alternative, $matches)) {
        return strtoupper($matches[1]);
    }
    $serial = (string) ($parsed['subject']['serialNumber'] ?? '');
    if (preg_match('/(?:CNPJ\D*)?([0-9A-Z]{12}[0-9]{2})/i', $serial, $matches)) {
        return strtoupper($matches[1]);
    }
    return null;
}

/** Não inclui senha, chave privada, caminho do certificado ou XML na resposta. */
function nfeHomologationReadiness(array $company, ?array $sale = null): array
{
    $issues = [];
    $companyHref = '/configuracoes/otica';
    $saleHref = $sale ? '/vendas/' . (int) $sale['id'] : null;
    $uf = strtoupper((string) ($company['state'] ?? ''));
    $cnpj = normalizeFiscalCnpj((string) ($company['document'] ?? ''));
    $endpoint = null;
    if (in_array($uf, NFE_SVRS_UFS, true)) {
        $endpoint = 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx';
    } else {
        nfeHomologationIssue($issues, 'uf_not_configured', 'A rota de homologação desta UF ainda precisa ser configurada.', $companyHref);
    }
    if (!preg_match('/^[A-Z0-9]{12}[0-9]{2}$/D', $cnpj)) {
        nfeHomologationIssue($issues, 'issuer_cnpj', 'Informe o CNPJ completo do emitente.', $companyHref);
    }
    if (trim((string) ($company['fiscal_ie'] ?? '')) === '') {
        nfeHomologationIssue($issues, 'issuer_ie', 'Informe a inscrição estadual do emitente.', $companyHref);
    }
    if (!preg_match('/^\d{7}$/D', (string) ($company['fiscal_city_code'] ?? ''))) {
        nfeHomologationIssue($issues, 'issuer_city', 'Informe o código IBGE do município da ótica.', $companyHref);
    }

    $certificate = ['configured' => false, 'valid_until' => null, 'identity_checked' => false];
    $boundCompany = filter_var(getenv('NFE_HOMOLOGATION_COMPANY_ID'), FILTER_VALIDATE_INT);
    if (!$boundCompany || (int) $boundCompany !== (int) $company['id']) {
        nfeHomologationIssue($issues, 'company_binding', 'Vincule o certificado de homologação a esta ótica na configuração privada.');
    } else {
        $pfx = nfePrivateSecret('NFE_HOMOLOGATION_PFX_PATH', $issues);
        $passwordFile = nfePrivateSecret('NFE_HOMOLOGATION_PASSWORD_FILE', $issues);
        if ($pfx === null || $passwordFile === null) {
            nfeHomologationIssue($issues, 'certificate_missing', 'Configure um certificado A1 da ótica e a senha em arquivos privados.');
        } else {
            $parts = [];
            if (!openssl_pkcs12_read($pfx, $parts, rtrim($passwordFile, "\r\n"))
                || empty($parts['cert']) || empty($parts['pkey'])) {
                nfeHomologationIssue($issues, 'certificate_invalid', 'Não foi possível abrir o certificado A1 com a senha configurada.');
            } else {
                $parsed = openssl_x509_parse($parts['cert']);
                if (!is_array($parsed) || !openssl_x509_check_private_key($parts['cert'], $parts['pkey'])) {
                    nfeHomologationIssue($issues, 'certificate_key', 'O certificado e a chave privada não correspondem.');
                } else {
                    $certificate['configured'] = true;
                    $certificate['valid_until'] = date('Y-m-d', (int) ($parsed['validTo_time_t'] ?? 0));
                    if ((int) ($parsed['validFrom_time_t'] ?? 0) > time() || (int) ($parsed['validTo_time_t'] ?? 0) <= time()) {
                        nfeHomologationIssue($issues, 'certificate_expired', 'O certificado digital não está dentro do período de validade.');
                    }
                    $certificateCnpj = nfeCertificateIdentity($parsed);
                    if ($certificateCnpj === null) {
                        nfeHomologationIssue($issues, 'certificate_identity_unknown', 'Confirme o CNPJ do certificado digital antes de usar esta ótica.');
                    } elseif ($certificateCnpj !== $cnpj) {
                        nfeHomologationIssue($issues, 'certificate_identity_mismatch', 'O CNPJ do certificado não corresponde ao CNPJ da ótica.');
                    } else {
                        $certificate['identity_checked'] = true;
                    }
                }
            }
        }
    }

    if ($sale !== null) {
        if ($sale['status'] === 'cancelled') {
            nfeHomologationIssue($issues, 'sale_cancelled', 'Uma venda cancelada não pode ser usada na homologação.', $saleHref);
        }
        if (!$sale['client_id'] || !$sale['items']) {
            nfeHomologationIssue($issues, 'sale_incomplete', 'A venda precisa ter cliente e itens.', $saleHref);
        }
    }

    // Bloqueios de implementação deliberados: a prévia local usa tributos e pagamento fictícios.
    nfeHomologationIssue($issues, 'tax_mapping_pending', 'Falta mapear e revisar os tributos reais da operação e de cada item.', $saleHref);
    nfeHomologationIssue($issues, 'payment_mapping_pending', 'Falta mapear os pagamentos reais da venda para a NF-e.', $saleHref);
    nfeHomologationIssue($issues, 'certificate_chain_pending', 'Falta validar a cadeia ICP-Brasil e a adequação do certificado para transmissão.');
    nfeHomologationIssue($issues, 'signing_transport_pending', 'Faltam assinatura digital, transmissão e leitura do protocolo da SEFAZ.');

    return [
        'ready' => false,
        'environment' => 'homologation',
        'authority' => $endpoint ? 'SVRS' : null,
        'endpoint' => $endpoint,
        'certificate' => $certificate,
        'issues' => $issues,
    ];
}
