import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MessageSquarePlus, RotateCcw, Send, User, UserPlus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useDebounce } from '../../lib/hooks.js';
import { dateTime, initials, phone, relativeDate } from '../../lib/format.js';
import { useSession } from '../../lib/session.jsx';
import { Badge, Button, Card, Empty, Loading, Modal, SearchInput, Tabs, useToast } from '../../components/ui.jsx';
import { ClientPicker } from '../../components/business.jsx';

const CHANNEL_NAMES = {
  whatsapp_manual: 'WhatsApp',
  whatsapp_cloud: 'WhatsApp',
  whatsapp_evolution: 'WhatsApp',
  whatsapp_zapi: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Messenger',
};
const STATUS_TONE = { queued: 'info', sent: '', delivered: '', read: 'success', failed: 'danger', manual: 'warning', received: '' };
const STATUS_LABEL = { queued: 'na fila', sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou', manual: 'envio manual', received: '' };

export default function Inbox() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const [filter, setFilter] = useState('open');
  const [term, setTerm] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const q = useDebounce(term, 300);
  const params = { q, per_page: 100, status: filter === 'open' ? 'open' : filter === 'closed' ? 'closed' : undefined, unread: filter === 'unread' ? 1 : undefined, mine: filter === 'mine' ? 1 : undefined };
  const list = useApi('conversations', params);

  useEffect(() => {
    const timer = setInterval(() => list.reload(), 8000);
    return () => clearInterval(timer);
  }, [list.reload]);

  const conversations = list.data?.data || [];
  return (
    <>
      <Card bodyClass={null} className={`chat ${id ? 'has-active' : ''}`}>
        <div className="chat-list">
          <div className="stack sm" style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <div className="row between">
              <h2>Atendimento</h2>
              {can('crm') && <Button size="sm" variant="primary" icon={MessageSquarePlus} onClick={() => setNewOpen(true)}>Nova</Button>}
            </div>
            <SearchInput value={term} onChange={setTerm} placeholder="Buscar conversa…" />
            <Tabs
              active={filter}
              onChange={setFilter}
              tabs={[
                { key: 'open', label: 'Abertas' },
                { key: 'unread', label: 'Não lidas' },
                { key: 'mine', label: 'Minhas' },
                { key: 'closed', label: 'Encerradas' },
                { key: 'all', label: 'Todas' },
              ]}
            />
          </div>
          {list.loading && !list.data && <Loading />}
          {!list.loading && !conversations.length && <Empty title="Nenhuma conversa">As mensagens recebidas pelos canais configurados aparecem aqui.</Empty>}
          {conversations.map((c) => (
            <div key={c.id} className={`chat-item ${String(c.id) === id ? 'active' : ''}`} onClick={() => navigate(`/atendimento/${c.id}`)}>
              <span className="avatar">{initials(c.client_name || c.contact_name || '?')}</span>
              <div className="grow">
                <div className="row between">
                  <strong className="truncate">{c.client_name || c.contact_name || phone(c.contact_handle)}</strong>
                  <span className="subtle nowrap">{relativeDate(c.last_message_at)}</span>
                </div>
                <div className="row between">
                  <span className="subtle truncate">{c.last_message_preview || '—'}</span>
                  {c.unread > 0 && <span className="badge danger">{c.unread}</span>}
                </div>
                <span className="subtle">{CHANNEL_NAMES[c.channel_type] || c.channel_type}{c.assigned_name ? ` · ${c.assigned_name}` : ''}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="chat-pane">
          {id ? <Conversation key={id} id={id} onChanged={list.reload} /> : <Empty title="Selecione uma conversa">Escolha uma conversa à esquerda ou inicie uma nova.</Empty>}
        </div>
      </Card>
      <NewConversation open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}

function Conversation({ id, onChanged }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { can, user } = useSession();
  const { data, loading, reload } = useApi('conversations', { id });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [linking, setLinking] = useState(false);
  const bottom = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => reload(), 8000);
    return () => clearInterval(timer);
  }, [reload]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages?.length]);

  if (loading && !data) return <Loading />;
  if (!data) return <Empty title="Conversa não encontrada" />;

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const result = await api.post('messages', { conversation_id: Number(id), body });
      if (result.wa_link) window.open(result.wa_link, '_blank', 'noopener');
      setText('');
      reload();
      onChanged();
    } catch (error) {
      toast.error(error.data?.error || error.message);
      reload();
    } finally {
      setSending(false);
    }
  };

  const patch = async (body, message) => {
    try {
      await api.patch('conversations', body, { id });
      toast.success(message);
      reload();
      onChanged();
    } catch (error) {
      toast.error(error);
    }
  };

  const manual = data.channel_type === 'whatsapp_manual';
  return (
    <>
      <div className="row between" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="row grow">
          <Button variant="ghost" icon={ArrowLeft} className="menu-toggle" onClick={() => navigate('/atendimento')} aria-label="Voltar" />
          <span className="avatar">{initials(data.client_name || data.contact_name || '?')}</span>
          <div className="grow">
            <strong className="truncate">{data.client_name || data.contact_name || phone(data.contact_handle)}</strong>
            <div className="subtle truncate">
              {phone(data.contact_handle)} · {data.channel_name}
            </div>
          </div>
        </div>
        <div className="row">
          {data.client_id ? (
            <Link className="btn sm" to={`/clientes/${data.client_id}`}>
              <User size={15} /> <span className="hidden-mobile">Cliente</span>
            </Link>
          ) : (
            can('crm') && <Button size="sm" icon={UserPlus} onClick={() => setLinking(true)}><span className="hidden-mobile">Vincular</span></Button>
          )}
          {can('crm') && !data.assigned_user_id && (
            <Button size="sm" className="hidden-mobile" onClick={() => patch({ assigned_user_id: user.id }, 'Conversa atribuída a você')}>Assumir</Button>
          )}
          {can('crm') &&
            (data.status === 'closed' ? (
              <Button size="sm" icon={RotateCcw} onClick={() => patch({ status: 'open' }, 'Conversa reaberta')} aria-label="Reabrir" />
            ) : (
              <Button size="sm" icon={CheckCircle2} onClick={() => patch({ status: 'closed' }, 'Conversa encerrada')}><span className="hidden-mobile">Encerrar</span></Button>
            ))}
        </div>
      </div>
      <div className="messages">
        {!data.messages.length && <Empty title="Sem mensagens ainda" />}
        {data.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.direction}`}>
            {m.body}
            <div className="meta">
              {m.user_name && `${m.user_name} · `}
              {dateTime(m.created_at)}
              {m.direction === 'out' && STATUS_LABEL[m.status] && (
                <>
                  {' · '}
                  <span style={{ color: STATUS_TONE[m.status] === 'danger' ? 'var(--danger)' : undefined }} title={m.error || ''}>
                    {STATUS_LABEL[m.status]}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {can('crm') && (
        <div className="composer">
          <textarea
            className="textarea"
            style={{ minHeight: 42, height: 42 }}
            placeholder={manual ? 'Escreva e envie — o WhatsApp será aberto com a mensagem pronta' : 'Escreva uma mensagem… (Enter envia, Shift+Enter quebra linha)'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button variant="primary" icon={Send} loading={sending} onClick={send} aria-label="Enviar" />
        </div>
      )}
      {manual && (
        <div className="subtle" style={{ padding: '0 12px 8px', background: 'var(--surface)' }}>
          <Badge tone="warning">Canal manual</Badge> as mensagens são registradas aqui e enviadas pelo seu WhatsApp. Configure uma API em Configurações › Canais para envio e recebimento automáticos.
        </div>
      )}
      <Modal open={linking} title="Vincular a um cliente" onClose={() => setLinking(false)}>
        <ClientPicker
          value={null}
          autoFocus
          onChange={async (client) => {
            setLinking(false);
            if (client) await patch({ client_id: client.id }, 'Conversa vinculada ao cliente');
          }}
        />
      </Modal>
    </>
  );
}

function NewConversation({ open, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const channels = useApi(open ? 'channels' : null, {}, { enabled: open });
  const [client, setClient] = useState(null);
  const [channelId, setChannelId] = useState('');
  const [loading, setLoading] = useState(false);
  const list = (channels.data?.channels || []).filter((c) => c.status !== 'inactive' && c.type.startsWith('whatsapp'));

  const start = async () => {
    setLoading(true);
    try {
      const result = await api.post('conversations', { client_id: client.id, channel_id: channelId || undefined });
      onClose();
      setClient(null);
      navigate(`/atendimento/${result.id}`);
    } catch (error) {
      toast.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Nova conversa"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!client} loading={loading} onClick={start}>Iniciar</Button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <label>Cliente</label>
          <ClientPicker value={client} onChange={setClient} autoFocus />
        </div>
        {list.length > 1 && (
          <div className="field">
            <label>Canal</label>
            <select className="select" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Canal padrão</option>
              {list.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}
