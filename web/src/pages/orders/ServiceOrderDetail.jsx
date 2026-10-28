import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Edit3, Printer, Trash2 } from 'lucide-react';
import { api, pdfUrl } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { date, dateTime, money, phone } from '../../lib/format.js';
import { ORDER_FLOW, ORDER_STATUS } from '../../lib/constants.js';
import { AttachmentsPanel, PrescriptionFields } from '../../components/business.jsx';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, StatusBadge, useConfirm, useToast, WhatsAppButton } from '../../components/ui.jsx';

export default function ServiceOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, company } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: order, loading, reload } = useApi('service_orders', { id });
  const [target, setTarget] = useState(null);
  const [notes, setNotes] = useState('');

  if (loading && !order) return <Loading />;
  if (!order) return <Empty title="Ordem de serviço não encontrada" />;
  const currentIndex = ORDER_FLOW.indexOf(order.status);

  const changeStatus = async () => {
    try {
      await api.patch('service_orders', { action: 'status', status: target, notes }, { id: order.id });
      toast.success(`Etapa alterada: ${ORDER_STATUS[target].label}`);
      setTarget(null);
      setNotes('');
      invalidate('service_orders');
      reload();
    } catch (error) {
      toast.error(error);
    }
  };
  const remove = async () => {
    if (!(await confirm({ message: `Excluir a OS nº ${order.number}?`, danger: true, confirmLabel: 'Excluir' }))) return;
    await api.del('service_orders', { id: order.id });
    invalidate('service_orders');
    navigate('/os');
  };
  const readyMessage = `Olá, ${(order.client_name || '').split(' ')[0]}! Seus óculos (OS nº ${order.number}) já estão prontos para retirada na ${company.trade_name || company.name}. Estamos te esperando!`;

  return (
    <div className="stack lg">
      <PageHeader
        back={<Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Voltar" />}
        title={`OS nº ${order.number}`}
        subtitle={`Aberta em ${dateTime(order.created_at)}${order.created_by_name ? ` por ${order.created_by_name}` : ''}`}
        actions={
          <>
            <a className="btn" href={pdfUrl('service_order', order.id)} target="_blank" rel="noreferrer">
              <Printer size={17} /> Imprimir OS
            </a>
            {order.status === 'ready' && order.client_whatsapp && <WhatsAppButton phone={order.client_whatsapp} text={readyMessage} size="" label="Avisar cliente" />}
            {can('service') && (
              <Button icon={Edit3} onClick={() => navigate(`/os/${order.id}/editar`)}>
                Editar
              </Button>
            )}
          </>
        }
      />
      <Card>
        <div className="row wrap" style={{ gap: 6 }}>
          {ORDER_FLOW.map((status, index) => {
            const done = index <= currentIndex && order.status !== 'cancelled';
            return (
              <button
                type="button"
                key={status}
                className={`chip ${status === order.status ? 'active' : ''}`}
                disabled={!can('service')}
                onClick={() => status !== order.status && setTarget(status)}
                style={done && status !== order.status ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
              >
                {done && status !== order.status && <Check size={13} />}
                {ORDER_STATUS[status].label}
              </button>
            );
          })}
          {order.status !== 'cancelled' && can('service') && (
            <button type="button" className="chip" onClick={() => setTarget('cancelled')} style={{ color: 'var(--danger)' }}>
              Cancelar OS
            </button>
          )}
          {order.status === 'cancelled' && <StatusBadge map={ORDER_STATUS} value="cancelled" />}
        </div>
      </Card>
      <div className="grid cols-3">
        <div className="span-2 stack">
          <Card title="Graus">
            <PrescriptionFields values={order} onChange={() => {}} readOnly />
          </Card>
          <Card title="Lentes e armação">
            <dl className="dl">
              <dt>Lentes</dt>
              <dd>{order.lens_description || '—'}</dd>
              <dt>Armação</dt>
              <dd>
                {order.frame_description || '—'} {Number(order.frame_from_client) ? <Badge tone="warning">do cliente</Badge> : null}
              </dd>
              <dt>Tipo</dt>
              <dd>{order.frame_type || '—'}</dd>
              <dt>Medidas</dt>
              <dd>{[order.bridge && `ponte ${order.bridge}`, order.horizontal && `H ${order.horizontal}`, order.vertical && `V ${order.vertical}`, order.diagonal && `D ${order.diagonal}`].filter(Boolean).join(' · ') || '—'}</dd>
              <dt>Observações</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{order.notes || '—'}</dd>
            </dl>
          </Card>
          <Card title="Anexos (fotos da armação, receita, comprovantes)">
            <AttachmentsPanel entityType="service_order" entityId={order.id} canEdit={can('service')} />
          </Card>
        </div>
        <div className="stack">
          <Card title="Cliente">
            {order.client_id ? (
              <div className="stack sm">
                <a href={`#/clientes/${order.client_id}`}>
                  <strong>{order.client_name}</strong>
                </a>
                <span className="subtle">{phone(order.client_whatsapp || order.client_phone)}</span>
              </div>
            ) : (
              '—'
            )}
          </Card>
          <Card title="Laboratório e prazo">
            <dl className="dl">
              <dt>Laboratório</dt>
              <dd>{order.laboratory_name || '—'}</dd>
              <dt>Previsão</dt>
              <dd>{date(order.promised_date) || '—'}</dd>
              <dt>Entregue</dt>
              <dd>{dateTime(order.delivered_at) || '—'}</dd>
              <dt>Custo lab.</dt>
              <dd>{money(order.lab_cost)}</dd>
              <dt>Venda</dt>
              <dd>{order.sale_id ? <a href={`#/vendas/${order.sale_id}`}>nº {order.sale_number} · saldo {money(Number(order.sale_total) - Number(order.sale_paid))}</a> : 'Avulsa'}</dd>
            </dl>
          </Card>
          <Card title="Histórico">
            <div className="timeline">
              {order.history.map((event) => (
                <div key={event.id} className="tl-item">
                  <span className="tl-dot">
                    <Check />
                  </span>
                  <strong>{ORDER_STATUS[event.status]?.label || event.status}</strong>
                  <div className="subtle">
                    {dateTime(event.created_at)} {event.user_name && `· ${event.user_name}`}
                  </div>
                  {event.notes && <div className="muted">{event.notes}</div>}
                </div>
              ))}
            </div>
          </Card>
          {can('manage') && (
            <Button variant="ghost" className="danger" icon={Trash2} onClick={remove}>
              Excluir OS
            </Button>
          )}
        </div>
      </div>
      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={`Mover para "${ORDER_STATUS[target]?.label}"`}
        footer={<><Button onClick={() => setTarget(null)}>Voltar</Button><Button variant={target === 'cancelled' ? 'danger solid' : 'primary'} onClick={changeStatus}>Confirmar</Button></>}
      >
        <div className="stack">
          <Field label="Observação (opcional)">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus placeholder="Ex.: enviada pelo motoboy, lente refeita…" />
          </Field>
          {target === 'ready' && <span className="subtle">Uma tarefa de aviso ao cliente será criada automaticamente.</span>}
        </div>
      </Modal>
    </div>
  );
}
