import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Edit3, Printer, Send, ShoppingBag, Trash2, XCircle } from 'lucide-react';
import { api, pdfUrl } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { date, money, phone } from '../../lib/format.js';
import { QUOTE_STATUS } from '../../lib/constants.js';
import { AttachmentsPanel, PrescriptionFields } from '../../components/business.jsx';
import { Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, useConfirm, useToast, WhatsAppButton } from '../../components/ui.jsx';

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, company } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: quote, loading, reload } = useApi('quotes', { id });
  const reasons = useApi('loss_reasons').data || [];
  const [losing, setLosing] = useState(false);
  const [loss, setLoss] = useState({ loss_reason_id: '', loss_notes: '' });

  if (loading && !quote) return <Loading />;
  if (!quote) return <Empty title="Orçamento não encontrado" />;
  const closed = ['converted', 'lost'].includes(quote.status);
  const contactPhone = quote.client_whatsapp || quote.contact_phone;
  const name = quote.client_name || quote.contact_name;

  const setStatus = async (status) => {
    await api.patch('quotes', { action: 'status', status }, { id: quote.id });
    invalidate('quotes');
    reload();
  };
  const lose = async () => {
    try {
      await api.patch('quotes', { action: 'lose', ...loss }, { id: quote.id });
      toast.success('Registrado como perdido');
      setLosing(false);
      invalidate('quotes');
      reload();
    } catch (error) {
      toast.error(error);
    }
  };
  const remove = async () => {
    if (!(await confirm({ message: 'Excluir este orçamento?', danger: true, confirmLabel: 'Excluir' }))) return;
    await api.del('quotes', { id: quote.id });
    invalidate('quotes');
    navigate('/orcamentos');
  };
  const message = `Olá, ${(name || '').split(' ')[0]}! Segue o orçamento nº ${quote.number} da ${company.trade_name || company.name}: ${quote.items.map((i) => i.description).join(', ')}. Total ${money(quote.total)}, válido até ${date(quote.valid_until)}. Qualquer dúvida, estamos à disposição!`;

  return (
    <div className="stack lg">
      <PageHeader
        back={<Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Voltar" />}
        title={`Orçamento nº ${quote.number}`}
        subtitle={`${date(quote.quote_date)} · válido até ${date(quote.valid_until)} · ${quote.seller_name || ''}`}
        actions={
          <>
            <a className="btn" href={pdfUrl('quote', quote.id)} target="_blank" rel="noreferrer">
              <Printer size={17} /> Imprimir
            </a>
            {contactPhone && <WhatsAppButton phone={contactPhone} text={message} size="" label="Enviar" onSent={() => quote.status === 'open' && setStatus('sent')} />}
            {can('sell') && !closed && (
              <Button icon={Edit3} onClick={() => navigate(`/orcamentos/${quote.id}/editar`)}>
                Editar
              </Button>
            )}
          </>
        }
      />
      <div className="row wrap">
        <StatusBadge map={QUOTE_STATUS} value={quote.status} />
        {quote.status === 'lost' && <span className="muted">Motivo: {quote.loss_reason || 'não informado'} {quote.loss_notes && `— ${quote.loss_notes}`}</span>}
        {quote.sale_id && (
          <Button size="sm" onClick={() => navigate(`/vendas/${quote.sale_id}`)}>
            Ver venda nº {quote.sale_number}
          </Button>
        )}
      </div>
      {can('sell') && !closed && (
        <Card>
          <div className="row wrap">
            <Button variant="primary" icon={ShoppingBag} onClick={() => navigate(`/vendas/nova?quote=${quote.id}`)}>
              Fechar venda
            </Button>
            {quote.status === 'open' && (
              <Button icon={Send} onClick={() => setStatus('sent')}>
                Marcar como enviado
              </Button>
            )}
            {quote.status !== 'approved' && (
              <Button icon={CheckCircle2} onClick={() => setStatus('approved')}>
                Cliente aprovou
              </Button>
            )}
            <Button icon={XCircle} className="danger" onClick={() => setLosing(true)}>
              Não fechou
            </Button>
          </div>
        </Card>
      )}
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
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.description}</td>
                      <td className="num">{Number(item.quantity).toLocaleString('pt-BR')}</td>
                      <td className="num">{money(item.unit_price)}</td>
                      <td className="num">{money(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-body row between" style={{ maxWidth: 340, marginLeft: 'auto' }}>
              <span className="muted">Desconto {money(quote.discount)}</span>
              <strong style={{ fontSize: 18 }}>{money(quote.total)}</strong>
            </div>
          </Card>
          {quote.prescription && (
            <Card title="Receita">
              <PrescriptionFields values={quote.prescription} onChange={() => {}} readOnly />
            </Card>
          )}
          <Card title="Anexos">
            <AttachmentsPanel entityType="quote" entityId={quote.id} canEdit={can('sell')} />
          </Card>
        </div>
        <div className="stack">
          <Card title="Cliente">
            {quote.client_id ? (
              <a href={`#/clientes/${quote.client_id}`}>
                <strong>{quote.client_name}</strong>
              </a>
            ) : (
              <strong>{quote.contact_name}</strong>
            )}
            <div className="subtle">{phone(contactPhone)}</div>
          </Card>
          {quote.notes && (
            <Card title="Observações">
              <p style={{ whiteSpace: 'pre-wrap' }}>{quote.notes}</p>
            </Card>
          )}
          {can('manage') && !quote.sale_id && (
            <Button variant="ghost" className="danger" icon={Trash2} onClick={remove}>
              Excluir orçamento
            </Button>
          )}
        </div>
      </div>
      <Modal open={losing} onClose={() => setLosing(false)} title="Por que não fechou?" footer={<><Button onClick={() => setLosing(false)}>Voltar</Button><Button variant="primary" onClick={lose}>Registrar</Button></>}>
        <div className="stack">
          <Field label="Motivo">
            <Select value={loss.loss_reason_id} onChange={(e) => setLoss((l) => ({ ...l, loss_reason_id: e.target.value }))} placeholder="Selecione…" options={reasons.filter((r) => Number(r.active)).map((r) => ({ value: r.id, label: r.name }))} />
          </Field>
          <Field label="Detalhes">
            <Input value={loss.loss_notes} onChange={(e) => setLoss((l) => ({ ...l, loss_notes: e.target.value }))} />
          </Field>
          <span className="subtle">O registro alimenta o relatório de motivos de não compra.</span>
        </div>
      </Modal>
    </div>
  );
}
