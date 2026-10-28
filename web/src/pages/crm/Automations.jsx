import { useState } from 'react';
import { History, Pencil, Play, Plus, Trash2, Workflow } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { dateTime } from '../../lib/format.js';
import { useSession } from '../../lib/session.jsx';
import { TEMPLATE_VARIABLES } from '../../lib/constants.js';
import { Badge, Button, Card, Checkbox, DataTable, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea, useConfirm, useToast } from '../../components/ui.jsx';

const DAY_TRIGGERS = {
  birthday: 'Dias de antecedência (0 = no dia)',
  prescription_expiring: 'Dias antes do vencimento',
  no_purchase: 'Dias desde a última compra',
  post_sale: 'Dias após a venda',
  quote_followup: 'Dias com o orçamento em aberto',
};
const SCHEDULED = ['birthday', 'prescription_expiring', 'no_purchase', 'purchase_anniversary', 'post_sale', 'quote_followup'];

function describe(a, triggers, actions) {
  const t = a.trigger_config || {};
  let when = triggers[a.trigger_type] || a.trigger_type;
  if (t.days !== undefined && t.days !== '' && DAY_TRIGGERS[a.trigger_type]) when += ` · ${t.days} dia(s)`;
  if (a.trigger_type === 'purchase_anniversary') when += ` · ${t.months || 12} meses`;
  if (a.trigger_type === 'message_received' && t.keywords) when += ` · "${t.keywords}"`;
  return `${when} → ${actions[a.action_type] || a.action_type}`;
}

export default function Automations() {
  const { can } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useApi('automations');
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState(null);
  const [running, setRunning] = useState(false);
  const triggers = data?.triggers || {};
  const actions = data?.actions || {};

  const toggle = async (a) => {
    try {
      await api.patch('automations', { ...a, active: !Number(a.active) }, { id: a.id });
      reload();
    } catch (error) {
      toast.error(error);
    }
  };
  const runNow = async () => {
    setRunning(true);
    try {
      const result = await api.post('automations', { action: 'run_now' });
      toast.success(`${result.executed} ação(ões) executada(s) agora`);
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setRunning(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Automação', render: (a) => <><strong>{a.name}</strong><div className="subtle">{describe(a, triggers, actions)}</div></> },
    { key: 'mode', label: 'Modo', render: (a) => <Badge tone={a.mode === 'auto' ? 'brand' : 'info'}>{a.mode === 'auto' ? 'Automático' : 'Semiautomático'}</Badge> },
    { key: 'runs', label: 'Execuções', render: (a) => <span className="subtle">{a.runs_count} · última {a.last_run_at ? dateTime(a.last_run_at) : 'nunca'}</span> },
    {
      key: 'active',
      label: 'Ativa',
      render: (a) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox label={Number(a.active) ? 'Sim' : 'Não'} checked={Boolean(Number(a.active))} disabled={!can('manage')} onChange={() => toggle(a)} />
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (a) => (
        <div className="row" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" icon={History} onClick={() => setHistory(a)} aria-label="Histórico" title="Histórico" />
          {can('manage') && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(a)} aria-label="Editar" />}
          {can('manage') && (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              aria-label="Excluir"
              onClick={async () => {
                if (await confirm({ message: `Excluir a automação "${a.name}"?`, danger: true, confirmLabel: 'Excluir' })) {
                  await api.del('automations', { id: a.id });
                  reload();
                }
              }}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Automações"
        subtitle="Mensagens e tarefas disparadas sozinhas: aniversário, receita vencendo, pós-venda, óculos pronto e mais."
        actions={
          can('manage') && (
            <>
              <Button icon={Play} loading={running} onClick={runNow}>Executar agora</Button>
              <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Nova automação</Button>
            </>
          )
        }
      />
      <Card bodyClass={null}>
        {loading && !data ? (
          <Loading />
        ) : (
          <DataTable
            columns={columns}
            rows={data?.data}
            onRowClick={(a) => can('manage') && setEditing(a)}
            empty={<Empty icon={Workflow} title="Nenhuma automação">Crie, por exemplo, uma mensagem de parabéns no aniversário ou um pós-venda 7 dias após a compra.</Empty>}
            mobile={(a) => (
              <div className="grow">
                <div className="row between"><strong className="truncate">{a.name}</strong><Badge tone={Number(a.active) ? 'success' : ''}>{Number(a.active) ? 'Ativa' : 'Inativa'}</Badge></div>
                <span className="subtle">{describe(a, triggers, actions)}</span>
              </div>
            )}
          />
        )}
      </Card>
      <Card style={{ marginTop: 16 }}>
        <p className="subtle">
          <strong>Semiautomático:</strong> a automação cria uma tarefa com a mensagem pronta para a equipe enviar pelo WhatsApp. <strong>Automático:</strong> a mensagem é enviada pela API do canal configurado (WhatsApp oficial ou não oficial). Cada cliente recebe cada automação uma única vez por ocorrência. As automações agendadas rodam a partir do horário definido, pelo processamento em segundo plano.
        </p>
      </Card>
      {editing && <AutomationForm automation={editing} triggers={triggers} actions={actions} onClose={() => setEditing(null)} onSaved={reload} />}
      {history && <RunHistory automation={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function AutomationForm({ automation, triggers, actions, onClose, onSaved }) {
  const toast = useToast();
  const tags = useApi('tags');
  const channels = useApi('channels');
  const team = useApi('team');
  const [form, setForm] = useState({
    name: automation.name || '',
    trigger_type: automation.trigger_type || 'birthday',
    trigger_config: { time: '09:00', days: 0, ...(automation.trigger_config || {}) },
    action_type: automation.action_type || 'send_message',
    action_config: { ...(automation.action_config || {}) },
    mode: automation.mode || 'semi',
    active: automation.id ? Boolean(Number(automation.active)) : true,
  });
  const [saving, setSaving] = useState(false);
  const setT = (key, value) => setForm((f) => ({ ...f, trigger_config: { ...f.trigger_config, [key]: value } }));
  const setA = (key, value) => setForm((f) => ({ ...f, action_config: { ...f.action_config, [key]: value } }));
  const tc = form.trigger_config;
  const ac = form.action_config;

  const save = async () => {
    setSaving(true);
    try {
      if (automation.id) await api.patch('automations', form, { id: automation.id });
      else await api.post('automations', form);
      toast.success('Automação salva');
      onClose();
      onSaved();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={automation.id ? 'Editar automação' : 'Nova automação'}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} disabled={!form.name} onClick={save}>Salvar</Button></>}
    >
      <div className="form-grid">
        <Field label="Nome" className="c8"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Parabéns no aniversário" /></Field>
        <Field label="Modo" className="c4">
          <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} options={[{ value: 'semi', label: 'Semiautomático' }, { value: 'auto', label: 'Automático (API)' }]} />
        </Field>
        <div className="form-section">Quando</div>
        <Field label="Gatilho" className="c6">
          <Select value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })} options={Object.entries(triggers).map(([value, label]) => ({ value, label }))} />
        </Field>
        {DAY_TRIGGERS[form.trigger_type] && (
          <Field label={DAY_TRIGGERS[form.trigger_type]} className="c3"><Input type="number" min="0" value={tc.days ?? ''} onChange={(e) => setT('days', e.target.value)} /></Field>
        )}
        {form.trigger_type === 'purchase_anniversary' && (
          <Field label="Meses após a compra" className="c3"><Input type="number" min="1" value={tc.months ?? 12} onChange={(e) => setT('months', e.target.value)} /></Field>
        )}
        {SCHEDULED.includes(form.trigger_type) && (
          <Field label="A partir das" className="c3"><Input type="time" value={tc.time || '09:00'} onChange={(e) => setT('time', e.target.value)} /></Field>
        )}
        {form.trigger_type === 'message_received' && (
          <Field label="Palavras-chave (separadas por vírgula)" className="c6" hint="Vazio = qualquer mensagem recebida">
            <Input value={tc.keywords || ''} onChange={(e) => setT('keywords', e.target.value)} placeholder="preço, horário, endereço" />
          </Field>
        )}
        {SCHEDULED.includes(form.trigger_type) && (
          <>
            <Field label="Somente clientes com a etiqueta" className="c6">
              <Select placeholder="Todos os clientes" value={tc.tag_id || ''} onChange={(e) => setT('tag_id', e.target.value)} options={(tags.data || []).map((t) => ({ value: t.id, label: t.name }))} />
            </Field>
            <div className="c6" style={{ alignSelf: 'end' }}>
              <Checkbox label="Somente quem autorizou mensagens" checked={tc.require_consent !== false} onChange={(e) => setT('require_consent', e.target.checked)} />
            </div>
          </>
        )}
        <div className="form-section">Fazer</div>
        <Field label="Ação" className="c6">
          <Select value={form.action_type} onChange={(e) => setForm({ ...form, action_type: e.target.value })} options={Object.entries(actions).map(([value, label]) => ({ value, label }))} />
        </Field>
        {form.action_type === 'send_message' && (
          <>
            <Field label="Canal" className="c6">
              <Select placeholder="Canal padrão" value={ac.channel_id || ''} onChange={(e) => setA('channel_id', e.target.value)} options={(channels.data?.channels || []).filter((c) => c.status !== 'inactive').map((c) => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Mensagem" hint={`Variáveis: ${TEMPLATE_VARIABLES.map(([v]) => v).join(' ')} {{numero_os}} {{numero_orcamento}}`}>
              <Textarea rows={4} value={ac.message || ''} onChange={(e) => setA('message', e.target.value)} />
            </Field>
          </>
        )}
        {form.action_type === 'create_task' && (
          <>
            <Field label="Título da tarefa" className="c8"><Input value={ac.title || ''} onChange={(e) => setA('title', e.target.value)} placeholder="Ligar para {{nome}}" /></Field>
            <Field label="Prazo (dias)" className="c4"><Input type="number" min="0" value={ac.due_in_days ?? 0} onChange={(e) => setA('due_in_days', e.target.value)} /></Field>
            <Field label="Responsável" className="c6">
              <Select placeholder="Equipe" value={ac.user_id || ''} onChange={(e) => setA('user_id', e.target.value)} options={(team.data || []).filter((u) => Number(u.active)).map((u) => ({ value: u.id, label: u.name }))} />
            </Field>
          </>
        )}
        {form.action_type === 'add_tag' && (
          <Field label="Etiqueta" className="c6">
            <Select placeholder="Selecione…" value={ac.tag_id || ''} onChange={(e) => setA('tag_id', e.target.value)} options={(tags.data || []).map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
        )}
        {form.action_type === 'webhook' && (
          <Field label="URL de destino" hint="Recebe um POST JSON com a automação, o gatilho e os dados do cliente (Zapier, Make, n8n…)">
            <Input value={ac.url || ''} onChange={(e) => setA('url', e.target.value)} placeholder="https://" />
          </Field>
        )}
        <div><Checkbox label="Automação ativa" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /></div>
      </div>
    </Modal>
  );
}

function RunHistory({ automation, onClose }) {
  const { data, loading } = useApi('automations', { id: automation.id });
  return (
    <Modal open size="lg" title={`Histórico · ${automation.name}`} onClose={onClose}>
      {loading && !data ? (
        <Loading />
      ) : (
        <DataTable
          rows={data?.runs}
          empty={<Empty title="Ainda não executou" />}
          columns={[
            { key: 'created_at', label: 'Quando', render: (r) => dateTime(r.created_at) },
            { key: 'client_name', label: 'Cliente', render: (r) => r.client_name || '—' },
            { key: 'status', label: 'Situação', render: (r) => <Badge tone={r.status === 'done' ? 'success' : r.status === 'failed' ? 'danger' : ''}>{r.status === 'done' ? 'OK' : r.status === 'failed' ? 'Falhou' : r.status}</Badge> },
            { key: 'result', label: 'Resultado', render: (r) => <span className="subtle">{r.result}</span> },
          ]}
        />
      )}
    </Modal>
  );
}
