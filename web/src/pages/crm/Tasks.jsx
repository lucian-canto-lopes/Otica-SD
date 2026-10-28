import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { date, today } from '../../lib/format.js';
import { useSession } from '../../lib/session.jsx';
import { TASK_TYPES } from '../../lib/constants.js';
import { Badge, Button, Card, Checkbox, Empty, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, Textarea, WhatsAppButton, useConfirm, useToast } from '../../components/ui.jsx';
import { ClientPicker } from '../../components/business.jsx';

function suggestedMessage(task, companyName) {
  const first = String(task.client_name || '').split(' ')[0];
  const name = first ? first.charAt(0) + first.slice(1).toLowerCase() : '';
  switch (task.type) {
    case 'birthday':
      return `Olá, ${name}! 🎉 A equipe da ${companyName} deseja um feliz aniversário! Neste mês você tem um presente especial esperando por aqui.`;
    case 'pickup':
      return `Olá, ${name}! Seus óculos já estão prontos para retirada na ${companyName}. Estamos te esperando!`;
    case 'prescription':
      return `Olá, ${name}! Sua receita de óculos está perto de vencer. Que tal agendar um novo exame e conferir as novidades da ${companyName}?`;
    case 'renewal':
      return `Olá, ${name}! Já faz um tempo desde seus últimos óculos. Que tal conhecer as novidades da ${companyName}? Temos condições especiais para você.`;
    case 'quote':
      return `Olá, ${name}! Passando para saber se ficou alguma dúvida sobre o orçamento que preparamos na ${companyName}.`;
    default:
      return `Olá, ${name}! Aqui é da ${companyName}.`;
  }
}

function groupOf(task) {
  const t = today();
  if (task.due_date < t) return 'late';
  if (task.due_date === t) return 'today';
  return 'next';
}

export default function Tasks() {
  const { company, can } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [type, setType] = useState('');
  const [mine, setMine] = useState(false);
  const [status, setStatus] = useState('pending');
  const [creating, setCreating] = useState(false);
  const [finishing, setFinishing] = useState(null);
  const [postponing, setPostponing] = useState(null);
  const { data, loading, reload } = useApi('tasks', { status, type, mine: mine ? 1 : undefined, per_page: 200, period: status === 'pending' ? 'week' : undefined });
  const companyName = company?.trade_name || company?.name || '';
  const tasks = data?.data || [];

  const groups = status === 'pending'
    ? [
        { key: 'late', title: 'Atrasadas', tone: 'danger' },
        { key: 'today', title: 'Para hoje', tone: 'brand' },
        { key: 'next', title: 'Próximos dias', tone: '' },
      ]
    : [{ key: 'all', title: status === 'done' ? 'Concluídas' : 'Canceladas' }];

  const update = async (task, body, message) => {
    try {
      await api.patch('tasks', body, { id: task.id });
      toast.success(message);
      reload();
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <>
      <PageHeader
        title="Tarefas do dia"
        subtitle="Aniversários, receitas vencendo, óculos prontos, retornos e orçamentos para acompanhar."
        actions={can('crm') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Nova tarefa</Button>}
      />
      <div className="filters" style={{ marginBottom: 14 }}>
        <div className="chips">
          <button type="button" className={`chip ${type === '' ? 'active' : ''}`} onClick={() => setType('')}>Todas</button>
          {Object.entries(TASK_TYPES).map(([key, t]) => {
            const count = data?.counts?.find((c) => c.type === key)?.total;
            return (
              <button key={key} type="button" className={`chip ${type === key ? 'active' : ''}`} onClick={() => setType(key)}>
                {t.label}
                {count ? <span className="badge">{count}</span> : null}
              </button>
            );
          })}
        </div>
        <Select style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'pending', label: 'Pendentes' }, { value: 'done', label: 'Concluídas' }, { value: 'cancelled', label: 'Canceladas' }]} />
        <Checkbox label="Somente minhas" checked={mine} onChange={(e) => setMine(e.target.checked)} />
      </div>
      {loading && !data ? (
        <Loading />
      ) : !tasks.length ? (
        <Card><Empty icon={Check} title="Tudo em dia!">Nenhuma tarefa encontrada com esses filtros.</Empty></Card>
      ) : (
        <div className="stack lg">
          {groups.map((group) => {
            const items = group.key === 'all' ? tasks : tasks.filter((t) => groupOf(t) === group.key);
            if (!items.length) return null;
            return (
              <Card key={group.key} title={<h3>{group.title} <Badge tone={group.tone}>{items.length}</Badge></h3>} bodyClass={null}>
                {items.map((task) => (
                  <div key={task.id} className="mobile-item" style={{ display: 'flex', cursor: 'default', flexWrap: 'wrap' }}>
                    <div className="grow" style={{ minWidth: 220 }}>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <StatusBadge map={TASK_TYPES} value={task.type} />
                        <span className={task.due_date < today() && task.status === 'pending' ? 'error-text' : 'subtle'}>{date(task.due_date)}</span>
                        {task.user_name && <span className="subtle">· {task.user_name}</span>}
                      </div>
                      <div style={{ marginTop: 4 }}>{task.title}</div>
                      {task.client_id && (
                        <Link to={`/clientes/${task.client_id}`} className="subtle">{task.client_name}</Link>
                      )}
                    </div>
                    {task.status === 'pending' && can('crm') && (
                      <div className="row wrap">
                        {task.client_whatsapp && <WhatsAppButton phone={task.client_whatsapp} text={suggestedMessage(task, companyName)} />}
                        <Button size="sm" icon={CalendarClock} onClick={() => setPostponing(task)} aria-label="Adiar" title="Adiar" />
                        <Button size="sm" variant="primary" icon={Check} onClick={() => setFinishing(task)}>Concluir</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Trash2}
                          aria-label="Cancelar tarefa"
                          onClick={async () => (await confirm({ message: 'Cancelar esta tarefa?', danger: true, confirmLabel: 'Cancelar tarefa' })) && update(task, { status: 'cancelled' }, 'Tarefa cancelada')}
                        />
                      </div>
                    )}
                    {task.status !== 'pending' && can('crm') && (
                      <Button size="sm" onClick={() => update(task, { status: 'pending' }, 'Tarefa reaberta')}>Reabrir</Button>
                    )}
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      )}
      <CreateTask open={creating} onClose={() => setCreating(false)} onSaved={reload} />
      <FinishTask task={finishing} onClose={() => setFinishing(null)} onSaved={reload} />
      <PostponeTask task={postponing} onClose={() => setPostponing(null)} onSave={(task, due) => update(task, { due_date: due }, 'Tarefa reagendada')} />
    </>
  );
}

function CreateTask({ open, onClose, onSaved }) {
  const toast = useToast();
  const [client, setClient] = useState(null);
  const [form, setForm] = useState({ title: '', type: 'follow_up', due_date: today() });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.post('tasks', { ...form, client_id: client?.id });
      toast.success('Tarefa criada');
      onClose();
      setClient(null);
      setForm({ title: '', type: 'follow_up', due_date: today() });
      onSaved();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} title="Nova tarefa" onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} disabled={!form.title} onClick={save}>Salvar</Button></>}>
      <div className="stack">
        <Field label="O que precisa ser feito"><Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Cliente (opcional)"><ClientPicker value={client} onChange={setClient} /></Field>
        <div className="grid cols-2">
          <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={Object.entries(TASK_TYPES).map(([value, t]) => ({ value, label: t.label }))} /></Field>
          <Field label="Data"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function FinishTask({ task, onClose, onSaved }) {
  const toast = useToast();
  const [register, setRegister] = useState(true);
  const [channel, setChannel] = useState('whatsapp');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.patch('tasks', { status: 'done', register_interaction: Boolean(task.client_id && register), channel, notes }, { id: task.id });
      toast.success('Tarefa concluída');
      setNotes('');
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={Boolean(task)} title="Concluir tarefa" onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} onClick={save}>Concluir</Button></>}>
      {task && (
        <div className="stack">
          <p>{task.title}</p>
          {task.client_id && (
            <>
              <Checkbox label="Registrar o contato no histórico do cliente" checked={register} onChange={(e) => setRegister(e.target.checked)} />
              {register && (
                <>
                  <Field label="Canal"><Select value={channel} onChange={(e) => setChannel(e.target.value)} options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'phone', label: 'Telefone' }, { value: 'visit', label: 'Presencial' }, { value: 'email', label: 'E-mail' }, { value: 'other', label: 'Outro' }]} /></Field>
                  <Field label="Observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Como foi o contato?" /></Field>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function PostponeTask({ task, onClose, onSave }) {
  const [due, setDue] = useState(today(1));
  return (
    <Modal open={Boolean(task)} title="Adiar tarefa" onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => (onSave(task, due), onClose())}>Reagendar</Button></>}>
      <div className="stack">
        <div className="chips">
          {[[1, 'Amanhã'], [3, 'Em 3 dias'], [7, 'Em 1 semana'], [30, 'Em 1 mês']].map(([days, label]) => (
            <button key={days} type="button" className={`chip ${due === today(days) ? 'active' : ''}`} onClick={() => setDue(today(days))}>{label}</button>
          ))}
        </div>
        <Field label="Nova data"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
