import { useState } from 'react';
import { Copy, KeyRound, Pencil, Plus, Trash2, Webhook } from 'lucide-react';
import { API_URL, api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { dateTime } from '../../lib/format.js';
import { Badge, Button, Card, Checkbox, DataTable, Empty, Field, Input, Loading, Modal, useConfirm, useToast } from '../../components/ui.jsx';

const EVENT_LABELS = {
  'client.created': 'Cliente cadastrado',
  'client.updated': 'Cliente alterado',
  'sale.created': 'Venda registrada',
  'sale.cancelled': 'Venda cancelada',
  'quote.created': 'Orçamento criado',
  'quote.lost': 'Orçamento perdido',
  'order.created': 'OS aberta',
  'order.status_changed': 'Etapa da OS alterada',
  'message.received': 'Mensagem recebida',
};

function copyText(text, toast) {
  navigator.clipboard?.writeText(text);
  toast.success('Copiado');
}

function ApiKeys() {
  const { data, loading, reload } = useApi('api_keys');
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(null);
  const [created, setCreated] = useState(null);
  const [saving, setSaving] = useState(false);
  const baseUrl = new URL(API_URL, window.location.href).href;

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api.post('api_keys', creating);
      setCreating(null);
      setCreated(result.key);
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  const revoke = async (key) => {
    if (!(await confirm({ message: `Revogar a chave "${key.name}"? Integrações que a usam deixarão de funcionar.`, danger: true, confirmLabel: 'Revogar' }))) return;
    await api.del('api_keys', { id: key.id });
    reload();
  };

  return (
    <Card
      title={
        <span className="row">
          <KeyRound size={16} />
          <h3>Chaves de API</h3>
        </span>
      }
      actions={
        <Button size="sm" variant="primary" icon={Plus} onClick={() => setCreating({ name: '', write: false })}>
          Nova chave
        </Button>
      }
    >
      <div className="stack">
        <p className="muted">
          Permitem que outros aplicativos (BI, planilhas, automações como n8n/Make/Zapier) leiam os dados da ótica. Envie a chave no cabeçalho <code>Authorization: Bearer ok_…</code>.
        </p>
        <div className="card card-body stack sm" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
          <span className="label">Exemplo</span>
          <code style={{ fontSize: 12, wordBreak: 'break-all' }}>curl -H "Authorization: Bearer SUA_CHAVE" "{baseUrl}?action=clients&amp;per_page=50"</code>
          <span className="subtle">
            Recursos disponíveis: <code>clients</code>, <code>products</code>, <code>sales</code>, <code>quotes</code>, <code>service_orders</code>, <code>partners</code> e{' '}
            <code>reports</code> (POST com a definição do relatório, em chaves com escrita). Listagens aceitam <code>page</code>, <code>per_page</code> e <code>q</code>; detalhe com{' '}
            <code>id</code>.
          </span>
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <DataTable
            rows={data}
            empty={<Empty title="Nenhuma chave criada" />}
            columns={[
              { key: 'name', label: 'Nome' },
              { key: 'prefix', label: 'Chave', render: (k) => <code>{k.prefix}…</code> },
              { key: 'scopes', label: 'Permissão', render: (k) => <Badge tone={k.scopes.includes('write') ? 'warning' : ''}>{k.scopes.includes('write') ? 'Leitura e escrita' : 'Somente leitura'}</Badge> },
              { key: 'last_used_at', label: 'Último uso', render: (k) => (k.last_used_at ? dateTime(k.last_used_at) : <span className="subtle">Nunca</span>) },
              { key: 'status', label: 'Situação', render: (k) => (k.revoked_at ? <Badge tone="danger">Revogada</Badge> : <Badge tone="success">Ativa</Badge>) },
              { key: 'actions', label: '', className: 'right', render: (k) => (!k.revoked_at ? <Button size="sm" variant="ghost" icon={Trash2} onClick={() => revoke(k)} title="Revogar" /> : null) },
            ]}
          />
        )}
      </div>
      <Modal
        open={Boolean(creating)}
        title="Nova chave de API"
        onClose={() => setCreating(null)}
        footer={
          <>
            <Button onClick={() => setCreating(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="key-form" loading={saving}>
              Criar chave
            </Button>
          </>
        }
      >
        {creating && (
          <form id="key-form" className="stack" onSubmit={create}>
            <Field label="Nome (para identificar a integração) *">
              <Input required value={creating.name} onChange={(e) => setCreating((c) => ({ ...c, name: e.target.value }))} placeholder="Ex.: Planilha de vendas" />
            </Field>
            <Checkbox label="Permitir escrita (criar e alterar registros)" checked={creating.write} onChange={(e) => setCreating((c) => ({ ...c, write: e.target.checked }))} />
          </form>
        )}
      </Modal>
      <Modal open={Boolean(created)} title="Chave criada" onClose={() => setCreated(null)} footer={<Button variant="primary" onClick={() => setCreated(null)}>Já copiei</Button>}>
        <div className="stack">
          <p className="muted">Copie agora: por segurança, a chave completa não será exibida novamente.</p>
          <div className="row">
            <Input readOnly className="mono grow" value={created || ''} onFocus={(e) => e.target.select()} />
            <Button icon={Copy} onClick={() => copyText(created, toast)} title="Copiar" />
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function Webhooks() {
  const { data, loading, reload } = useApi('webhooks');
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const events = data?.events || [];

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { url: editing.url, events: editing.all ? ['*'] : editing.events, active: editing.active };
      if (editing.id) await api.patch('webhooks', payload, { id: editing.id });
      else await api.post('webhooks', payload);
      toast.success('Webhook salvo');
      setEditing(null);
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (hook) => {
    if (!(await confirm({ message: `Excluir o webhook para ${hook.url}?`, danger: true, confirmLabel: 'Excluir' }))) return;
    await api.del('webhooks', { id: hook.id });
    reload();
  };
  const open = (hook) => {
    const list = hook ? hook.events.split(',').map((e) => e.trim()) : [];
    setEditing(hook ? { id: hook.id, url: hook.url, all: list.includes('*'), events: list.filter((e) => e !== '*'), active: Boolean(Number(hook.active)) } : { url: '', all: true, events: [], active: true });
  };
  const toggleEvent = (name) =>
    setEditing((h) => ({ ...h, events: h.events.includes(name) ? h.events.filter((e) => e !== name) : [...h.events, name] }));

  return (
    <Card
      title={
        <span className="row">
          <Webhook size={16} />
          <h3>Webhooks de saída</h3>
        </span>
      }
      actions={
        <Button size="sm" variant="primary" icon={Plus} onClick={() => open(null)}>
          Novo webhook
        </Button>
      }
    >
      <div className="stack">
        <p className="muted">
          O sistema envia um POST em JSON para a URL a cada evento escolhido (ex.: venda registrada → planilha, OS pronta → outro sistema). Cada envio traz o cabeçalho{' '}
          <code>X-Ocular-Event</code> e a assinatura <code>X-Ocular-Signature: sha256=…</code> (HMAC-SHA256 do corpo com o segredo do webhook) para você validar a origem. Falhas são
          repetidas até 5 vezes.
        </p>
        {loading && !data ? (
          <Loading />
        ) : data?.webhooks?.length ? (
          data.webhooks.map((hook) => (
            <div key={hook.id} className="card card-body stack sm" style={{ boxShadow: 'none', opacity: Number(hook.active) ? 1 : 0.6 }}>
              <div className="row between wrap">
                <span className="row truncate">
                  <span className={`status-dot ${!hook.last_status ? '' : hook.last_status >= 200 && hook.last_status < 300 ? 'ok' : 'err'}`} />
                  <strong className="truncate">{hook.url}</strong>
                  {!Number(hook.active) && <Badge>Inativo</Badge>}
                </span>
                <span className="row">
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(hook)} aria-label="Editar" />
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(hook)} aria-label="Excluir" />
                </span>
              </div>
              <div className="chips">
                {hook.events.split(',').map((e) => (
                  <Badge key={e}>{e === '*' ? 'Todos os eventos' : EVENT_LABELS[e] || e}</Badge>
                ))}
              </div>
              <div className="row">
                <span className="subtle nowrap">Segredo:</span>
                <Input readOnly className="sm mono grow" value={hook.secret} onFocus={(e) => e.target.select()} />
                <Button size="sm" icon={Copy} onClick={() => copyText(hook.secret, toast)} title="Copiar" />
              </div>
              {hook.last_called_at && (
                <span className="subtle">
                  Última chamada {dateTime(hook.last_called_at)} · HTTP {hook.last_status}
                </span>
              )}
            </div>
          ))
        ) : (
          <Empty title="Nenhum webhook cadastrado" />
        )}
        {data?.recent?.length > 0 && (
          <>
            <span className="label">Envios recentes</span>
            <DataTable
              rows={data.recent}
              columns={[
                { key: 'created_at', label: 'Data', render: (d) => dateTime(d.created_at) },
                { key: 'event', label: 'Evento', render: (d) => EVENT_LABELS[d.event] || d.event },
                { key: 'status', label: 'Situação', render: (d) => <Badge tone={d.status === 'sent' ? 'success' : d.status === 'failed' ? 'danger' : 'warning'}>{{ sent: 'Enviado', failed: 'Falhou', pending: 'Pendente' }[d.status]}</Badge> },
                { key: 'attempts', label: 'Tentativas', className: 'num' },
                { key: 'response_code', label: 'HTTP', className: 'num' },
              ]}
            />
          </>
        )}
      </div>
      <Modal
        open={Boolean(editing)}
        title={editing?.id ? 'Editar webhook' : 'Novo webhook'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="webhook-form" loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <form id="webhook-form" className="stack" onSubmit={save}>
            <Field label="URL de destino *">
              <Input required type="url" placeholder="https://…" value={editing.url} onChange={(e) => setEditing((h) => ({ ...h, url: e.target.value }))} />
            </Field>
            <Checkbox label="Todos os eventos" checked={editing.all} onChange={(e) => setEditing((h) => ({ ...h, all: e.target.checked }))} />
            {!editing.all && (
              <div className="grid cols-2" style={{ gap: 8 }}>
                {events.map((name) => (
                  <Checkbox key={name} label={EVENT_LABELS[name] || name} checked={editing.events.includes(name)} onChange={() => toggleEvent(name)} />
                ))}
              </div>
            )}
            {editing.id && <Checkbox label="Webhook ativo" checked={editing.active} onChange={(e) => setEditing((h) => ({ ...h, active: e.target.checked }))} />}
          </form>
        )}
      </Modal>
    </Card>
  );
}

export default function IntegrationsTab() {
  const { can } = useSession();
  if (!can('manage')) return <Empty title="Acesso restrito">Somente proprietários e gerentes podem gerenciar integrações.</Empty>;
  return (
    <div className="stack">
      <ApiKeys />
      <Webhooks />
    </div>
  );
}
