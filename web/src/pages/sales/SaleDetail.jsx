import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, Edit3, FileText, Glasses, Printer, XCircle } from 'lucide-react';
import { api, apiUrl, pdfUrl } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { cpf, date, dateTime, money, phone } from '../../lib/format.js';
import { ORDER_STATUS, PAYMENT_METHODS, SALE_STATUS } from '../../lib/constants.js';
import { AttachmentsPanel, PrescriptionFields } from '../../components/business.jsx';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, StatusBadge, useToast, WhatsAppButton } from '../../components/ui.jsx';

export default function SaleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, company } = useSession();
  const toast = useToast();
  const { data: sale, loading, reload } = useApi('sales', { id });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [fiscalBusy, setFiscalBusy] = useState(false);
  const { data: fiscalData, error: fiscalError, loading: fiscalLoading, reload: reloadFiscal } = useApi('fiscal', { sale_id: id }, { keepPrevious: false });
  const { data: homologation, error: homologationError, loading: homologationLoading, reload: reloadHomologation } = useApi(
    can('manage') ? 'fiscal_homologation' : null,
    { sale_id: id },
    { enabled: can('manage'), keepPrevious: false },
  );
  const fiscalDoc = Number(fiscalData?.sale_id) === Number(id) ? fiscalData : null;
  const shouldCheckFiscal = Boolean(sale) && sale.status !== 'cancelled' && fiscalDoc?.status !== 'simulated';
  const { data: fiscalCheck, error: checkError, loading: checkLoading, reload: reloadFiscalCheck } = useApi(
    shouldCheckFiscal ? 'fiscal_check' : null, { sale_id: id }, { enabled: shouldCheckFiscal, keepPrevious: false },
  );

  if (loading && !sale) return <Loading />;
  if (!sale) return <Empty title="Venda não encontrada" />;
  const balance = Math.max(0, Number(sale.total) - Number(sale.paid));
  const cancelled = sale.status === 'cancelled';
  const fiscalActive = fiscalDoc?.status === 'simulated';
  const fiscalReady = !fiscalLoading && !fiscalError;
  const checkReady = shouldCheckFiscal && !checkLoading && !checkError && fiscalCheck?.ready === true;

  const receive = async (payment) => {
    try {
      await api.patch('sales', { action: 'receive', payment_id: payment.id }, { id: sale.id });
      toast.success('Recebimento registrado');
      invalidate('sales');
      reload();
    } catch (error) {
      toast.error(error);
    }
  };
  const cancel = async () => {
    try {
      await api.patch('sales', { action: 'cancel', reason }, { id: sale.id });
      toast.success('Venda cancelada e estoque estornado');
      setCancelling(false);
      invalidate('sales');
      reload();
    } catch (error) {
      toast.error(error);
    }
  };
  const simulateFiscal = async () => {
    setFiscalBusy(true);
    try {
      const check = await api.get('fiscal_check', { sale_id: id });
      if (!check.ready) {
        reloadFiscalCheck();
        toast.error('Corrija as pendências fiscais de teste antes de simular.');
        return;
      }
      await api.post('fiscal', { action: 'simulate', sale_id: Number(id), model: '55' });
      toast.success('Simulação NF-e 55 gerada, sem valor fiscal');
      reloadFiscal();
    } catch (error) { toast.error(error); }
    finally { setFiscalBusy(false); }
  };
  const firstName = (sale.client_name || '').split(' ')[0];
  const message = `Olá, ${firstName}! Aqui está o resumo do seu pedido nº ${sale.number} na ${company.trade_name || company.name}: total ${money(sale.total)}${sale.delivery_date ? `, previsão de entrega ${date(sale.delivery_date)}` : ''}. Obrigado pela preferência!`;

  return (
    <div className="stack lg">
      <PageHeader
        back={<Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Voltar" />}
        title={`Venda nº ${sale.number}`}
        subtitle={`${date(sale.sale_date)} · ${sale.seller_name || 'sem vendedor'}${sale.quote_number ? ` · orçamento nº ${sale.quote_number}` : ''}`}
        actions={
          <>
            <a className="btn" href={pdfUrl('sale', sale.id)} target="_blank" rel="noreferrer">
              <Printer size={17} /> Imprimir pedido
            </a>
            <a className="btn icon" href={pdfUrl('sale', sale.id, true)} title="Baixar PDF" aria-label="Baixar PDF">
              <Download size={17} />
            </a>
            {sale.client_whatsapp && <WhatsAppButton phone={sale.client_whatsapp} text={message} size="" label="Enviar resumo" />}
            {can('sell') && !cancelled && fiscalReady && !fiscalActive && (
              <Button icon={Edit3} onClick={() => navigate(`/vendas/${sale.id}/editar`)}>
                Editar
              </Button>
            )}
          </>
        }
      />
      <div className="row wrap">
        <StatusBadge map={SALE_STATUS} value={sale.status} />
        {balance > 0.009 && !cancelled && <Badge tone="warning">Saldo a receber {money(balance)}</Badge>}
        {cancelled && <span className="error-text">Motivo: {sale.cancel_reason}</span>}
      </div>
      <Card title="Simulação fiscal · NF-e modelo 55">
        <div className="stack">
          <p className="muted">Prévia local em leiaute NF-e 4.00, sem assinatura, transmissão à SEFAZ ou valor fiscal.</p>
          {!cancelled && !fiscalActive && fiscalReady && (
            <div className="stack sm">
              <strong>Conferência dos dados de teste</strong>
              <p className="subtle">Cenário de teste: venda interna, CRT 1, CFOP 5102 e CSOSN 102. O XSD confere a estrutura com uma assinatura fictícia somente em memória; o XML baixado permanece sem assinatura. A tributação não é validada.</p>
              {checkLoading ? <Loading inline /> : checkError ? (
                <div className="row wrap" role="alert">
                  <span className="error-text">Não foi possível conferir os dados: {checkError.message}</span>
                  <Button size="sm" onClick={reloadFiscalCheck}>Tentar novamente</Button>
                </div>
              ) : checkReady ? (
                <Badge tone="success">Estrutura conferida no XSD {fiscalCheck?.schema_version}</Badge>
              ) : (
                <>
                  <Badge tone="warning">Pendências para simular</Badge>
                  <ul className="stack sm">
                    {(fiscalCheck?.issues || []).map((issue, index) => {
                      const href = issue.href?.startsWith('#/') ? issue.href : issue.href?.startsWith('/') ? '#' + issue.href : null;
                      return <li key={issue.field + '-' + index}>
                        {issue.message}
                        {href && <> · <a href={href}>Corrigir</a></>}
                        {issue.section === 'schema' && <>
                          {' · '}<a href="#/configuracoes/otica">Dados da ótica</a>
                          {sale.client_id && <>{' · '}<a href={`#/clientes/${sale.client_id}`}>Dados do cliente</a></>}
                        </>}
                      </li>;
                    })}
                  </ul>
                  {!fiscalCheck?.issues?.length && <p className="muted">Revise os dados fiscais da ótica, do cliente e dos itens da venda.</p>}
                </>
              )}
            </div>
          )}
          {fiscalLoading ? <Loading inline /> : fiscalError ? (
            <div className="row wrap" role="alert">
              <span className="error-text">Não foi possível consultar a simulação fiscal: {fiscalError.message}</span>
              <Button size="sm" onClick={reloadFiscal}>Tentar novamente</Button>
            </div>
          ) : fiscalDoc ? (
            <>
              <div className="row wrap">
                <Badge tone={fiscalDoc.status === 'simulated' ? 'warning' : ''}>
                  {fiscalDoc.status === 'cancelled' ? 'Simulação cancelada' : 'Simulada'}
                </Badge>
                <span className="muted">Série {fiscalDoc.series} · número de teste {fiscalDoc.number}</span>
              </div>
              {fiscalDoc.status === 'cancelled' && <p className="muted">Os arquivos desta simulação cancelada continuam disponíveis. Uma nova simulação terá outro número de teste.</p>}
              {fiscalActive && <p className="muted">A edição e o cancelamento da venda ficam bloqueados enquanto esta simulação estiver ativa. Cancele a simulação no histórico fiscal para liberar a venda.</p>}
              <div className="row wrap">
                <a className="btn" href={apiUrl('fiscal_xml', { id: fiscalDoc.id })}><FileText size={17} /> Baixar prévia XML sem assinatura</a>
                <a className="btn" href={apiUrl('fiscal_pdf', { id: fiscalDoc.id })}><Download size={17} /> Baixar PDF de teste</a>
                {fiscalDoc.status === 'cancelled' && !cancelled && can('finance') && (
                  <Button loading={fiscalBusy} disabled={!checkReady} icon={Printer} onClick={simulateFiscal}>Simular NF-e 55 novamente</Button>
                )}
                <a href="#/fiscal">Ver histórico fiscal</a>
              </div>
            </>
          ) : cancelled ? (
            <p className="muted">Não é possível simular uma nota para uma venda cancelada.</p>
          ) : can('finance') ? (
            <Button loading={fiscalBusy} disabled={!checkReady} icon={Printer} onClick={simulateFiscal}>Simular NF-e 55</Button>
          ) : (
            <p className="muted">A simulação pode ser criada por quem tem permissão financeira.</p>
          )}
        </div>
      </Card>
      {can('manage') && <Card title="Preparação para homologação na SEFAZ">
        <div className="stack sm">
          <p className="muted">Esta conferência prepara a integração real. O Ocular ainda não assina nem envia esta venda à SEFAZ.</p>
          {homologationLoading ? <Loading inline /> : homologationError ? (
            <div className="row wrap" role="alert">
              <span className="error-text">Não foi possível consultar os pré-requisitos: {homologationError.message}</span>
              <Button size="sm" onClick={reloadHomologation}>Tentar novamente</Button>
            </div>
          ) : homologation && <>
            <div className="row wrap">
              <Badge tone="warning">Aguardando pré-requisitos</Badge>
              {homologation.authority && <span className="subtle">Autorizadora prevista: {homologation.authority}</span>}
              <span className="subtle">Certificado A1: {homologation.certificate.configured ? 'carregado' : 'não configurado'}</span>
            </div>
            <ul className="stack sm">
              {homologation.issues.map((issue) => <li key={issue.code}>
                {issue.message}
                {issue.href && <> · <a href={'#' + issue.href}>Ver dados</a></>}
              </li>)}
            </ul>
          </>}
        </div>
      </Card>}
      <div className="grid cols-3">
        <div className="span-2 stack">
          <Card title="Itens" bodyClass={null}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th className="num">Qtd</th>
                    <th className="num">Unitário</th>
                    <th className="num">Desconto</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.product_id ? <a href={`#/produtos/${item.product_id}`}>{item.description}</a> : item.description}
                        {!item.product_id && <span className="subtle"> · item livre</span>}
                      </td>
                      <td className="num">{Number(item.quantity).toLocaleString('pt-BR')}</td>
                      <td className="num">{money(item.unit_price)}</td>
                      <td className="num">{Number(item.discount) ? money(item.discount) : '—'}</td>
                      <td className="num">{money(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-body stack sm" style={{ maxWidth: 320, marginLeft: 'auto' }}>
              <div className="row between">
                <span className="muted">Subtotal</span>
                <span className="mono">{money(sale.subtotal)}</span>
              </div>
              <div className="row between">
                <span className="muted">Desconto</span>
                <span className="mono">{money(sale.discount)}</span>
              </div>
              <div className="row between">
                <strong>Total</strong>
                <strong className="mono" style={{ fontSize: 18 }}>
                  {money(sale.total)}
                </strong>
              </div>
              <div className="row between">
                <span className="muted">Pago</span>
                <span className="mono">{money(sale.paid)}</span>
              </div>
            </div>
          </Card>
          <Card title="Pagamentos">
            {sale.payments.length ? (
              <div className="stack sm">
                {sale.payments.map((p) => (
                  <div key={p.id} className="row between wrap">
                    <span>
                      {p.installment}ª · {PAYMENT_METHODS[p.method] || p.method} · <strong>{money(p.amount)}</strong>
                      {p.due_date && <span className="subtle"> · vence {date(p.due_date)}</span>}
                    </span>
                    {p.paid_at ? (
                      <Badge tone="success">Pago em {date(p.paid_at)}</Badge>
                    ) : (
                      <div className="row">
                        <Badge tone={p.due_date && p.due_date < new Date().toISOString().slice(0, 10) ? 'danger' : 'warning'}>Em aberto</Badge>
                        {can('sell') && !cancelled && (
                          <Button size="sm" icon={CheckCircle2} onClick={() => receive(p)}>
                            Receber
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="muted">{sale.payment_terms || 'Nenhum pagamento detalhado.'}</span>
            )}
          </Card>
          {sale.prescription && (
            <Card title="Receita">
              <PrescriptionFields values={sale.prescription} onChange={() => {}} readOnly />
            </Card>
          )}
          <Card title="Anexos">
            <AttachmentsPanel entityType="sale" entityId={sale.id} canEdit={can('sell')} />
          </Card>
        </div>
        <div className="stack">
          <Card title="Cliente">
            {sale.client_id ? (
              <div className="stack sm">
                <a href={`#/clientes/${sale.client_id}`}>
                  <strong>{sale.client_name}</strong>
                </a>
                {sale.client_cpf && <span className="subtle">CPF {cpf(sale.client_cpf)}</span>}
                <span className="subtle">{phone(sale.client_whatsapp || sale.client_phone)}</span>
                <span className="subtle">{[sale.client_address, sale.client_number, sale.client_neighborhood, sale.client_city].filter(Boolean).join(', ')}</span>
              </div>
            ) : (
              <span className="muted">Consumidor (sem cadastro)</span>
            )}
          </Card>
          <Card
            title="Ordens de serviço"
            actions={
              can('service') &&
              !cancelled && (
                <Button size="sm" icon={Glasses} onClick={() => navigate(`/os/nova?sale=${sale.id}`)}>
                  Nova OS
                </Button>
              )
            }
          >
            {sale.service_orders.length ? (
              <div className="stack sm">
                {sale.service_orders.map((o) => (
                  <div key={o.id} className="row between" style={{ cursor: 'pointer' }} onClick={() => navigate(`/os/${o.id}`)}>
                    <strong>OS nº {o.number}</strong>
                    <StatusBadge map={ORDER_STATUS} value={o.status} />
                  </div>
                ))}
              </div>
            ) : (
              <span className="subtle">Nenhuma OS vinculada.</span>
            )}
          </Card>
          <Card title="Informações">
            <dl className="dl">
              <dt>Entrega</dt>
              <dd>{date(sale.delivery_date) || '—'}</dd>
              <dt>Registrada</dt>
              <dd>{dateTime(sale.created_at)}</dd>
              {sale.legacy_id && (
                <>
                  <dt>Código anterior</dt>
                  <dd>{sale.legacy_id}</dd>
                </>
              )}
              <dt>Observações</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{sale.notes || '—'}</dd>
            </dl>
          </Card>
          {can('manage') && !cancelled && fiscalReady && !fiscalActive && (
            <Button variant="ghost" className="danger" icon={XCircle} onClick={() => setCancelling(true)}>
              Cancelar venda
            </Button>
          )}
        </div>
      </div>
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancelar venda"
        footer={<><Button onClick={() => setCancelling(false)}>Voltar</Button><Button variant="danger solid" onClick={cancel} disabled={!reason.trim()}>Cancelar venda</Button></>}
      >
        <div className="stack">
          <p>Os produtos do estoque voltam ao saldo e a venda deixa de contar nos indicadores. A ação fica registrada na auditoria.</p>
          <Field label="Motivo do cancelamento *">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
