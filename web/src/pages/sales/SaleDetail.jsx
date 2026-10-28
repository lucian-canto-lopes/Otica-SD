import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, Edit3, Glasses, Printer, XCircle } from 'lucide-react';
import { api, pdfUrl } from '../../lib/api.js';
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

  if (loading && !sale) return <Loading />;
  if (!sale) return <Empty title="Venda não encontrada" />;
  const balance = Math.max(0, Number(sale.total) - Number(sale.paid));
  const cancelled = sale.status === 'cancelled';

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
            {can('sell') && !cancelled && (
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
          {can('manage') && !cancelled && (
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
