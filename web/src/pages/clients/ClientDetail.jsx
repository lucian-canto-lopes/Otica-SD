import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Cake, CalendarClock, CheckCircle2, ClipboardList, Edit3, Eye, FileText, Glasses, Mail, MapPin, Megaphone,
  MessageCircle, MessagesSquare, Paperclip, Phone, Plus, ShoppingBag, Trash2, UserPlus, XCircle,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { age, cpf, date, dateTime, initials, money, number, phone, relativeDate, today } from '../../lib/format.js';
import { CHANNEL_LABELS, ORDER_STATUS, QUOTE_STATUS, SALE_STATUS, TASK_TYPES } from '../../lib/constants.js';
import { AttachmentsPanel, PrescriptionFields, prescriptionSummary } from '../../components/business.jsx';
import { HBars } from '../../components/charts.jsx';
import {
  Badge, Button, Card, DataTable, Empty, Field, Input, Kpi, Loading, Modal, Select, StatusBadge, Tabs, TagChip, Textarea,
  useConfirm, useToast, WhatsAppButton,
} from '../../components/ui.jsx';
import ClientForm from './ClientForm.jsx';

const TIMELINE_ICONS = {
  sale: ShoppingBag, quote: FileText, service_order: Glasses, interaction: MessagesSquare, message: MessageCircle, campaign: Megaphone,
  lost: XCircle, prescription: Eye, attachment: Paperclip, task: CheckCircle2, created: UserPlus,
};
const TIMELINE_LINKS = { sale: '/vendas/', quote: '/orcamentos/', service_order: '/os/', campaign: '/campanhas/' };

function Timeline({ clientId }) {
  const { data, loading } = useApi('client_timeline', { id: clientId });
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  if (loading && !data) return <Loading />;
  const events = (data || []).filter((e) => !filter || e.type === filter);
  const types = [...new Set((data || []).map((e) => e.type))];
  const labels = { sale: 'Vendas', quote: 'Orçamentos', service_order: 'OS', interaction: 'Atendimentos', message: 'Mensagens', campaign: 'Campanhas', lost: 'Não compras', prescription: 'Receitas', attachment: 'Anexos', task: 'Tarefas', created: 'Cadastro' };
  return (
    <div className="stack">
      <div className="chips">
        <button type="button" className={`chip ${!filter ? 'active' : ''}`} onClick={() => setFilter('')}>
          Tudo
        </button>
        {types.map((type) => (
          <button type="button" key={type} className={`chip ${filter === type ? 'active' : ''}`} onClick={() => setFilter(type)}>
            {labels[type] || type}
          </button>
        ))}
      </div>
      {events.length ? (
        <div className="timeline">
          {events.map((event, index) => {
            const Icon = TIMELINE_ICONS[event.type] || ClipboardList;
            const link = TIMELINE_LINKS[event.type];
            return (
              <div key={`${event.type}-${event.id}-${index}`} className="tl-item">
                <span className="tl-dot" style={event.direction === 'in' ? { borderColor: '#25d366', color: '#16a34a' } : undefined}>
                  <Icon />
                </span>
                <div className="row between top">
                  <div className="grow">
                    <div style={{ cursor: link ? 'pointer' : undefined }} onClick={() => link && navigate(link + event.id)}>
                      <strong>{event.title}</strong>
                      {event.channel && <span className="subtle"> · {CHANNEL_LABELS[event.channel] || event.channel.replace('whatsapp_', 'WhatsApp ')}</span>}
                      {event.user && <span className="subtle"> · {event.user}</span>}
                    </div>
                    {event.detail && (
                      <div className="muted" style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>
                        {event.detail}
                      </div>
                    )}
                  </div>
                  <span className="subtle nowrap" title={dateTime(event.at)}>
                    {relativeDate(event.at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty title="Sem interações registradas" />
      )}
    </div>
  );
}

function InteractionModal({ open, client, onClose, onSaved }) {
  const [values, setValues] = useState({ channel: 'whatsapp', direction: 'out', subject: '', notes: '', next_contact_date: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (f) => (e) => setValues((v) => ({ ...v, [f]: e.target.value }));
  const save = async () => {
    setSaving(true);
    try {
      await api.post('interactions', { ...values, client_id: client.id });
      toast.success('Atendimento registrado');
      onSaved();
      onClose();
      setValues({ channel: 'whatsapp', direction: 'out', subject: '', notes: '', next_contact_date: '' });
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Registrar atendimento" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="form-grid">
        <Field label="Canal" className="c6">
          <Select value={values.channel} onChange={set('channel')} options={Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="Quem iniciou" className="c6">
          <Select value={values.direction} onChange={set('direction')} options={[{ value: 'out', label: 'A ótica' }, { value: 'in', label: 'O cliente' }]} />
        </Field>
        <Field label="Assunto *">
          <Input value={values.subject} onChange={set('subject')} placeholder="Ex.: Dúvida sobre lentes, retorno de orçamento…" autoFocus />
        </Field>
        <Field label="Detalhes">
          <Textarea value={values.notes} onChange={set('notes')} rows={4} />
        </Field>
        <Field label="Agendar próximo contato" hint="Cria uma tarefa para a data">
          <Input type="date" value={values.next_contact_date} onChange={set('next_contact_date')} />
        </Field>
      </div>
    </Modal>
  );
}

export function PrescriptionModal({ open, clientId, prescription, onClose, onSaved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [loadedFor, setLoadedFor] = useState(null);
  if (open && loadedFor !== (prescription?.id || 'new')) {
    setLoadedFor(prescription?.id || 'new');
    setValues(prescription ? { ...prescription } : { prescribed_at: today() });
  }
  const set = (f, v) => setValues((s) => ({ ...s, [f]: v }));
  const save = async () => {
    setSaving(true);
    try {
      if (prescription?.id) await api.patch('prescriptions', values, { id: prescription.id });
      else await api.post('prescriptions', { ...values, client_id: clientId });
      toast.success('Receita salva');
      onSaved();
      onClose();
      setLoadedFor(null);
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => (onClose(), setLoadedFor(null))}
      title={prescription?.id ? 'Editar receita' : 'Nova receita'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} onClick={save}>Salvar</Button></>}
    >
      <div className="stack">
        <PrescriptionFields values={values} onChange={set} />
        <div className="form-grid">
          <Field label="Data da receita" className="c4">
            <Input type="date" value={values.prescribed_at || ''} onChange={(e) => set('prescribed_at', e.target.value)} />
          </Field>
          <Field label="Validade" className="c4" hint="Vazio = calcula pela configuração">
            <Input type="date" value={values.expires_at || ''} onChange={(e) => set('expires_at', e.target.value)} />
          </Field>
          <Field label="CRM" className="c4">
            <Input value={values.doctor_crm || ''} onChange={(e) => set('doctor_crm', e.target.value)} />
          </Field>
          <Field label="Médico(a)">
            <Input value={values.doctor || ''} onChange={(e) => set('doctor', e.target.value)} />
          </Field>
          <Field label="Observações">
            <Input value={values.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function LostModal({ open, client, onClose, onSaved }) {
  const reasons = useApi(open ? 'loss_reasons' : null).data || [];
  const [values, setValues] = useState({ reason_id: '', estimated_value: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const save = async () => {
    setSaving(true);
    try {
      await api.post('lost', { ...values, client_id: client.id });
      toast.success('Registro salvo');
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Registrar não compra / desistência" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="form-grid">
        <Field label="Motivo" className="c8">
          <Select value={values.reason_id} onChange={(e) => setValues((v) => ({ ...v, reason_id: e.target.value }))} placeholder="Selecione…" options={reasons.filter((r) => Number(r.active)).map((r) => ({ value: r.id, label: r.name }))} />
        </Field>
        <Field label="Valor estimado" className="c4">
          <Input inputMode="decimal" value={values.estimated_value} onChange={(e) => setValues((v) => ({ ...v, estimated_value: e.target.value }))} />
        </Field>
        <Field label="Observações">
          <Textarea value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: client, loading, reload } = useApi('clients', { id });
  const [tab, setTab] = useState('timeline');
  const [modal, setModal] = useState(null);
  const [prescription, setPrescription] = useState(null);
  const [timelineKey, setTimelineKey] = useState(0);

  if (loading && !client) return <Loading />;
  if (!client) return <Empty title="Cliente não encontrado" />;
  const stats = client.stats;
  const lastPrescription = client.prescriptions[0];
  const refreshAll = () => {
    reload();
    invalidate('client_timeline');
    setTimelineKey((k) => k + 1);
  };

  const startConversation = async () => {
    try {
      const result = await api.post('conversations', { client_id: client.id });
      navigate(`/atendimento/${result.id}`);
    } catch (error) {
      toast.error(error);
    }
  };
  const remove = async () => {
    if (!(await confirm({ message: `Excluir o cadastro de ${client.name}? O histórico de vendas é mantido.`, danger: true, confirmLabel: 'Excluir' }))) return;
    await api.del('clients', { id: client.id });
    invalidate('clients');
    navigate('/clientes');
  };

  const tabs = [
    { key: 'timeline', label: 'Linha do tempo' },
    { key: 'data', label: 'Dados' },
    { key: 'prescriptions', label: 'Receitas', count: client.prescriptions.length },
    { key: 'sales', label: 'Vendas', count: client.sales.length },
    { key: 'quotes', label: 'Orçamentos', count: client.quotes.length },
    { key: 'orders', label: 'OS', count: client.service_orders.length },
    { key: 'attachments', label: 'Anexos' },
  ];

  return (
    <div className="stack lg">
      <div className="row top wrap" style={{ gap: 14 }}>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Voltar" />
        <div className="avatar lg">{initials(client.name)}</div>
        <div className="grow stack sm" style={{ minWidth: 220 }}>
          <div className="row wrap">
            <h1>{client.name}</h1>
            {client.kind === 'lead' && <Badge tone="info">Contato</Badge>}
            {!Number(client.message_consent) && <Badge tone="warning">Sem autorização de mensagens</Badge>}
          </div>
          <div className="row wrap muted" style={{ gap: 14, fontSize: 13 }}>
            {(client.whatsapp || client.phone) && (
              <span className="row">
                <Phone size={14} />
                {phone(client.whatsapp || client.phone)}
              </span>
            )}
            {client.birth_date && (
              <span className="row">
                <Cake size={14} />
                {date(client.birth_date)} ({age(client.birth_date)} anos)
              </span>
            )}
            {client.email && (
              <span className="row">
                <Mail size={14} />
                {client.email}
              </span>
            )}
            {client.city && (
              <span className="row">
                <MapPin size={14} />
                {[client.neighborhood, client.city].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
          {client.tags.length > 0 && (
            <div className="chips">
              {client.tags.map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </div>
          )}
        </div>
        <div className="row wrap">
          {client.whatsapp && <WhatsAppButton phone={client.whatsapp} size="" />}
          {can('crm') && (
            <Button icon={MessagesSquare} onClick={startConversation} className="hidden-mobile">
              Conversa
            </Button>
          )}
          {can('sell') && (
            <Button icon={Edit3} onClick={() => setModal('edit')}>
              Editar
            </Button>
          )}
        </div>
      </div>

      {can('sell') && (
        <div className="row wrap">
          <Button variant="primary" icon={ShoppingBag} onClick={() => navigate(`/vendas/nova?client=${client.id}`)}>
            Nova venda
          </Button>
          <Button icon={FileText} onClick={() => navigate(`/orcamentos/novo?client=${client.id}`)}>
            Orçamento
          </Button>
          <Button icon={Glasses} onClick={() => navigate(`/os/nova?client=${client.id}`)}>
            Ordem de serviço
          </Button>
          <Button icon={MessagesSquare} onClick={() => setModal('interaction')}>
            Registrar atendimento
          </Button>
          <Button icon={XCircle} onClick={() => setModal('lost')}>
            Não comprou
          </Button>
        </div>
      )}

      <div className="grid kpis">
        <Kpi label="Total comprado" value={money(stats.total_spent)} hint={`${number(stats.sales_count)} compra(s)`} />
        <Kpi label="Ticket médio" value={money(stats.average_ticket)} />
        <Kpi label="Última compra" value={stats.last_purchase ? relativeDate(stats.last_purchase) : '—'} hint={stats.first_purchase ? `cliente desde ${date(stats.first_purchase)}` : 'ainda não comprou'} />
        <Kpi label="Saldo a receber" value={money(stats.balance_due)} tone={Number(stats.balance_due) > 0 ? 'danger' : undefined} />
        <Kpi
          icon={CalendarClock}
          label="Receita"
          value={lastPrescription?.expires_at ? date(lastPrescription.expires_at) : '—'}
          hint={lastPrescription ? (lastPrescription.expires_at < today() ? 'vencida' : 'validade') : 'sem receita registrada'}
          tone={lastPrescription?.expires_at && lastPrescription.expires_at < today() ? 'danger' : undefined}
        />
        <Kpi label="Em andamento" value={`${stats.open_orders} OS · ${stats.open_quotes} orç.`} hint={`${number(stats.interactions)} atendimentos`} />
      </div>

      <div className="grid cols-3">
        <div className="span-2 stack">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
          <Card>
            {tab === 'timeline' && <Timeline key={timelineKey} clientId={client.id} />}
            {tab === 'data' && (
              <dl className="dl">
                <dt>CPF</dt>
                <dd>{cpf(client.cpf) || '—'}</dd>
                <dt>RG</dt>
                <dd>{client.rg || '—'}</dd>
                <dt>Telefone</dt>
                <dd>{phone(client.phone) || '—'}</dd>
                <dt>Instagram</dt>
                <dd>{client.instagram ? `@${client.instagram}` : '—'}</dd>
                <dt>Endereço</dt>
                <dd>{[client.address, client.number, client.complement, client.neighborhood, client.city, client.state, client.zip].filter(Boolean).join(', ') || '—'}</dd>
                <dt>Profissão</dt>
                <dd>{client.occupation || '—'}</dd>
                <dt>Origem</dt>
                <dd>{client.origin || '—'}</dd>
                <dt>Mensagens</dt>
                <dd>{Number(client.message_consent) ? `Autorizado em ${dateTime(client.message_consent_at)}` : 'Não autorizado'}</dd>
                <dt>Próximo contato</dt>
                <dd>{date(client.next_contact_date) || '—'}</dd>
                <dt>Cadastro</dt>
                <dd>
                  {dateTime(client.created_at)}
                  {client.legacy_id && <span className="subtle"> · código anterior {client.legacy_id}</span>}
                </dd>
                <dt>Observações</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{client.notes || '—'}</dd>
              </dl>
            )}
            {tab === 'prescriptions' && (
              <div className="stack">
                {can('service') && (
                  <div>
                    <Button icon={Plus} onClick={() => (setPrescription(null), setModal('prescription'))}>
                      Nova receita
                    </Button>
                  </div>
                )}
                {client.prescriptions.length ? (
                  client.prescriptions.map((p) => (
                    <div key={p.id} className="card card-body stack sm">
                      <div className="row between">
                        <strong>
                          {date(p.prescribed_at) || 'Sem data'} {p.doctor && <span className="muted">· {p.doctor}</span>}
                        </strong>
                        <div className="row">
                          {p.expires_at && <Badge tone={p.expires_at < today() ? 'danger' : 'success'}>{p.expires_at < today() ? 'Vencida' : 'Válida'} até {date(p.expires_at)}</Badge>}
                          {can('service') && <Button size="sm" variant="ghost" icon={Edit3} onClick={() => (setPrescription(p), setModal('prescription'))} aria-label="Editar" />}
                        </div>
                      </div>
                      <PrescriptionFields values={p} onChange={() => {}} readOnly />
                      {p.notes && <span className="subtle">{p.notes}</span>}
                    </div>
                  ))
                ) : (
                  <Empty icon={Eye} title="Nenhuma receita registrada" />
                )}
              </div>
            )}
            {tab === 'sales' && (
              <DataTable
                rows={client.sales}
                onRowClick={(s) => navigate(`/vendas/${s.id}`)}
                columns={[
                  { key: 'number', label: 'Nº' },
                  { key: 'sale_date', label: 'Data', render: (s) => date(s.sale_date) },
                  { key: 'status', label: 'Situação', render: (s) => <StatusBadge map={SALE_STATUS} value={s.status} /> },
                  { key: 'total', label: 'Total', className: 'num', render: (s) => money(s.total) },
                  { key: 'paid', label: 'Pago', className: 'num', render: (s) => money(s.paid) },
                ]}
                mobile={(s) => (
                  <>
                    <div className="grow">
                      <strong>Venda nº {s.number}</strong>
                      <div className="subtle">{date(s.sale_date)}</div>
                    </div>
                    <strong>{money(s.total)}</strong>
                  </>
                )}
              />
            )}
            {tab === 'quotes' && (
              <DataTable
                rows={client.quotes}
                onRowClick={(q) => navigate(`/orcamentos/${q.id}`)}
                columns={[
                  { key: 'number', label: 'Nº' },
                  { key: 'quote_date', label: 'Data', render: (q) => date(q.quote_date) },
                  { key: 'status', label: 'Situação', render: (q) => <StatusBadge map={QUOTE_STATUS} value={q.status} /> },
                  { key: 'total', label: 'Total', className: 'num', render: (q) => money(q.total) },
                ]}
              />
            )}
            {tab === 'orders' && (
              <DataTable
                rows={client.service_orders}
                onRowClick={(o) => navigate(`/os/${o.id}`)}
                columns={[
                  { key: 'number', label: 'Nº' },
                  { key: 'created_at', label: 'Abertura', render: (o) => date(o.created_at) },
                  { key: 'status', label: 'Etapa', render: (o) => <StatusBadge map={ORDER_STATUS} value={o.status} /> },
                  { key: 'promised_date', label: 'Previsão', render: (o) => date(o.promised_date) },
                ]}
              />
            )}
            {tab === 'attachments' && <AttachmentsPanel entityType="client" entityId={client.id} canEdit={can('service')} />}
          </Card>
        </div>
        <div className="stack">
          <Card title="Tarefas pendentes" actions={<Button size="sm" variant="ghost" onClick={() => navigate('/tarefas')}>Todas</Button>}>
            {client.tasks.length ? (
              <div className="stack sm">
                {client.tasks.map((task) => (
                  <div key={task.id} className="row between">
                    <span className="truncate">
                      <Badge tone={TASK_TYPES[task.type]?.tone}>{TASK_TYPES[task.type]?.label}</Badge> {task.title}
                    </span>
                    <span className="subtle nowrap">{relativeDate(task.due_date)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="subtle">Nenhuma tarefa pendente.</span>
            )}
          </Card>
          <Card title="Última receita">
            {lastPrescription ? (
              <div className="stack sm">
                <span className="mono">{prescriptionSummary(lastPrescription)}</span>
                <span className="subtle">
                  {date(lastPrescription.prescribed_at)} {lastPrescription.doctor && `· ${lastPrescription.doctor}`}
                </span>
              </div>
            ) : (
              <span className="subtle">Nenhuma receita.</span>
            )}
          </Card>
          <Card title="O que costuma comprar">
            <HBars data={client.purchased_categories.map((c) => ({ label: c.category, total: c.total }))} format={money} />
          </Card>
          {can('manage') && (
            <Button variant="ghost" className="danger" icon={Trash2} onClick={remove}>
              Excluir cliente
            </Button>
          )}
        </div>
      </div>

      <ClientForm open={modal === 'edit'} client={client} onClose={() => setModal(null)} onSaved={refreshAll} />
      <InteractionModal open={modal === 'interaction'} client={client} onClose={() => setModal(null)} onSaved={refreshAll} />
      <LostModal open={modal === 'lost'} client={client} onClose={() => setModal(null)} onSaved={refreshAll} />
      <PrescriptionModal open={modal === 'prescription'} clientId={client.id} prescription={prescription} onClose={() => setModal(null)} onSaved={refreshAll} />
    </div>
  );
}
