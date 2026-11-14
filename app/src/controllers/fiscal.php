<?php
declare(strict_types=1);

function fiscalXml(array $sale, int $number, int $series, string $key): string
{
    $escape = static fn($value): string => htmlspecialchars((string) $value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    $items = '';
    foreach ($sale['items'] as $index => $item) {
        $items .= '<det nItem="' . ($index + 1) . '"><prod><xProd>' . $escape($item['description']) . '</xProd><qCom>' . $escape($item['quantity']) . '</qCom><vUnCom>' . number_format((float) $item['unit_price'], 2, '.', '') . '</vUnCom><vProd>' . number_format((float) $item['total'], 2, '.', '') . '</vProd></prod></det>';
    }
    return '<?xml version="1.0" encoding="UTF-8"?>' . "\n" .
        '<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe' . $escape($key) . '"><ide><mod>55</mod><serie>' . $series . '</serie><nNF>' . $number . '</nNF><tpAmb>2</tpAmb></ide><emit><xNome>' . $escape(Context::$company['trade_name'] ?: Context::$company['name']) . '</xNome></emit><dest><xNome>' . $escape($sale['client_name'] ?: 'Consumidor não identificado') . '</xNome></dest><detalhes>' . $items . '</detalhes><total><vNF>' . number_format((float) $sale['total'], 2, '.', '') . '</vNF></total></infNFe><infAdic><infCpl>DOCUMENTO DE TESTE - SEM VALOR FISCAL. Não transmitido à SEFAZ.</infCpl></infAdic></NFe>';
}

function fiscalDetail(int $id, int $companyId): array
{
    $document = fetchOne('SELECT * FROM fiscal_documents WHERE id = ? AND company_id = ?', [$id, $companyId]);
    if (!$document) sendError('Documento fiscal não encontrado.', 404);
    $document['snapshot'] = decodeJsonColumn($document['snapshot'], []);
    $document['events'] = fetchAllRows('SELECT event_type, message, created_at FROM fiscal_events WHERE fiscal_document_id = ? AND company_id = ? ORDER BY id', [$id, $companyId]);
    return $document;
}

function handleFiscal(string $method, array $input): never
{
    $companyId = Context::companyId();
    if ($method === 'GET') {
        if ($id = queryInt('id')) sendJson(fiscalDetail($id, $companyId));
        $rows = fetchAllRows('SELECT f.id, f.sale_id, f.model, f.environment, f.status, f.number, f.series, f.access_key, f.created_at, s.total, s.sale_date, s.number AS sale_number, c.name AS client_name FROM fiscal_documents f JOIN sales s ON s.id=f.sale_id LEFT JOIN clients c ON c.id=s.client_id WHERE f.company_id=? ORDER BY f.id DESC LIMIT 200', [$companyId]);
        sendJson(['data' => $rows]);
    }
    requirePermission('finance');
    if ($method === 'POST') {
        if (($input['action'] ?? '') !== 'simulate') sendError('Ação fiscal inválida.');
        $saleId = (int) ($input['sale_id'] ?? 0);
        $sale = saleDetail($saleId, $companyId);
        if ($sale['status'] === 'cancelled') sendError('Não é possível simular nota para venda cancelada.');
        if (fetchValue('SELECT id FROM fiscal_documents WHERE company_id=? AND sale_id=?', [$companyId, $saleId])) sendError('Esta venda já possui documento fiscal.');
        $model = in_array((string) ($input['model'] ?? '55'), ['55', '65'], true) ? (string) $input['model'] : '55';
        database()->beginTransaction();
        try {
            $series = max(1, (int) ($input['series'] ?? 1));
            executeQuery('INSERT IGNORE INTO fiscal_sequences (company_id, model, series, next_number) VALUES (?, ?, ?, 1)', [$companyId, $model, $series]);
            $number = (int) fetchValue('SELECT next_number FROM fiscal_sequences WHERE company_id=? AND model=? AND series=? FOR UPDATE', [$companyId, $model, $series]);
            executeQuery('UPDATE fiscal_sequences SET next_number=? WHERE company_id=? AND model=? AND series=?', [$number + 1, $companyId, $model, $series]);
            $key = str_pad((string) $companyId, 8, '0', STR_PAD_LEFT) . date('ym') . str_pad((string) $number, 9, '0', STR_PAD_LEFT) . strtoupper(bin2hex(random_bytes(5)));
            $xml = fiscalXml($sale, $number, $series, $key);
            $snapshot = ['sale_number' => $sale['number'], 'client' => $sale['client_name'], 'total' => $sale['total'], 'items' => $sale['items'], 'note' => 'Documento de simulação sem valor fiscal. Nenhuma transmissão para SEFAZ.'];
            $id = insertRow('fiscal_documents', ['company_id'=>$companyId,'sale_id'=>$saleId,'model'=>$model,'environment'=>'simulation','status'=>'simulated','number'=>$number,'series'=>$series,'access_key'=>$key,'xml'=>$xml,'snapshot'=>jsonColumn($snapshot),'created_by'=>Context::userId()]);
            insertRow('fiscal_events', ['company_id'=>$companyId,'fiscal_document_id'=>$id,'event_type'=>'simulated','message'=>'Documento de teste criado localmente; sem transmissão fiscal.','created_by'=>Context::userId()]);
            database()->commit();
        } catch (Throwable $e) { database()->rollBack(); throw $e; }
        auditLog('create', 'fiscal_document', $id, 'Documento fiscal simulado para venda ' . $sale['number']);
        sendJson(['ok'=>true,'id'=>$id], 201);
    }
    if ($method === 'PATCH') {
        $document = fiscalDetail(requireRouteId(), $companyId);
        if ($document['status'] !== 'simulated') sendError('Somente simulações podem ser canceladas.');
        executeQuery("UPDATE fiscal_documents SET status='cancelled' WHERE id=? AND company_id=?", [$document['id'],$companyId]);
        insertRow('fiscal_events', ['company_id'=>$companyId,'fiscal_document_id'=>$document['id'],'event_type'=>'cancelled','message'=>'Simulação cancelada pelo usuário.','created_by'=>Context::userId()]);
        auditLog('cancel', 'fiscal_document', (int)$document['id'], 'Simulação fiscal cancelada');
        sendJson(['ok'=>true]);
    }
    sendError('Método não permitido.', 405);
}

function handleFiscalXml(string $method, array $input): never
{
    if ($method !== 'GET') sendError('Método não permitido.', 405);
    $companyId = Context::companyId();
    $document = fiscalDetail(requireRouteId(), $companyId);
    header_remove('Content-Type');
    header('Content-Type: application/xml; charset=utf-8');
    header('Content-Disposition: attachment; filename="simulacao-nfe-' . (int)$document['number'] . '.xml"');
    echo $document['xml'];
    exit();
}

function handleFiscalPdf(string $method, array $input): never
{
    if ($method !== 'GET') sendError('Método não permitido.', 405);
    $companyId = Context::companyId();
    $doc = fiscalDetail(requireRouteId(), $companyId);
    $company = fetchOne('SELECT * FROM companies WHERE id=?', [$companyId]);
    $pdf = new OcularPdf($company);
    $pdf->docTitle = 'SIMULAÇÃO - SEM VALOR FISCAL';
    $pdf->docNumber = (string)$doc['number'];
    $pdf->docDate = date('d/m/Y', strtotime($doc['created_at']));
    $pdf->AddPage();
    $pdf->SetY(32);
    $pdf->sectionTitle('Documento fiscal de teste');
    $pdf->fieldRow([['Ambiente','SIMULAÇÃO LOCAL',44],['Modelo','NF-e '.$doc['model'],44],['Série / Número',$doc['series'].' / '.$doc['number'],44]]);
    $pdf->fieldRow([['Chave fictícia',$doc['access_key'],132]]);
    $pdf->Ln(4);
    $pdf->SetFont('Helvetica','B',18);
    $pdf->SetTextColor(180,35,35);
    $pdf->MultiCell(0,9,OcularPdf::t('DOCUMENTO DE TESTE - SEM VALOR FISCAL'));
    $pdf->SetTextColor(20,20,20);
    $snapshot=$doc['snapshot'];
    $pdf->sectionTitle('Resumo da venda');
    $pdf->fieldRow([['Venda','Nº '.$snapshot['sale_number'],44],['Cliente',$snapshot['client'] ?: 'Não identificado',88]]);
    foreach (($snapshot['items'] ?? []) as $item) {
        $pdf->fieldRow([['Item',$item['description'],70],['Qtd',$item['quantity'],20],['Total',money((float)$item['total']),42]]);
    }
    $pdf->Ln(2);
    $pdf->SetFont('Helvetica','B',10);
    $pdf->Cell(0,7,OcularPdf::t('Total simulado: '.money((float)$snapshot['total'])),0,1,'R');
    $pdf->SetFont('Helvetica','',8);
    $pdf->MultiCell(0,5,OcularPdf::t('Este arquivo foi gerado pelo modo de simulação do Ocular. Não foi assinado digitalmente nem transmitido à SEFAZ e não pode ser utilizado como documento fiscal.'));
    $content=$pdf->Output('S');
    header_remove('Content-Type'); header('Content-Type: application/pdf'); header('Content-Disposition: attachment; filename="simulacao-nfe-'.$doc['number'].'.pdf"'); echo $content; exit();
}
