import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Edit, MessageCircle, Pause, Play, RefreshCw, Send, SkipForward, Square, Trash2, Users, XCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi } from '../../lib/hooks.js';
import { dateTime, number, phone } from '../../lib/format.js';
import { useSession } from '../../lib/session.jsx';
import { CAMPAIGN_STATUS, RECIPIENT_STATUS } from '../../lib/constants.js';
import { Badge, Button, Card, DataTable, Empty, Kpi, Loading, PageHeader, Pagination, Select, StatusBadge, useConfirm, useListState, useToast } from '../../components/ui.jsx';

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const campaign = useApi('campaigns', { id });
  const [busy, setBusy] = useState('');
  const [recipientStatus, setRecipientStatus] = useState('');
  const list = useListState();
  const recipients = useApi('campaigns', { id, recipients: 1, status: recipientStatus, ...list.params });

  if (campaign.loading && !campaign.data) return <Loading />;
  const c = campaign.data;
  if (!c) return <Empty title="Campanha não encontrada" />;
  const counts = c.counts || {};
  const done = (counts.sent || 0) + (counts.replied || 0);
  const pct = counts.total ? Math.round(((done + (counts.skipped || 0)) / counts.total) * 100) : 0;
  const apiChannel = c.channel_type && c.channel_type !== 'whatsapp_manual';

  const refresh = () => {
    campaign.reload();
    recipients.reload();
    invalidate('campaigns');
  };
  const run = async (action, message, body = {}) => {
    setBusy(action);
    try {
      const result = await api.patch('campaigns', { action, ...body }, { id });
      toast.success(result.added !== undefined ? `${result.added} novo(s) destinatário(s) adicionado(s)` : message);
      refresh();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy('');
    }
  };
  const remove = async () => {
    if (!(await confirm({ message: 'Excluir esta campanha? Se já houve envios, ela será apenas cancelada.', danger: true, confirmLabel: 'Excluir' }))) return;
    await api.del('campaigns', { id });
    invalidate('campaigns');
    navigate('/campanhas');
  };

  const columns = [
    { key: 'name', label: 'Cliente', render: (r) => <Link to={`/clientes/${r.client_id}`} onClick={(e) => e.stopPropagation()}>{r.name}</Link> },
    { key: 'phone', label: 'WhatsApp', render: (r) => <span className="nowrap">{phone(r.phone)}</span> },
    { key: 'status', label: 'Situação', render: (r) => <span title={r.error || ''}><StatusBadge map={RECIPIENT_STATUS} value={r.status} /></span> },
    { key: 'sent_at', label: 'Enviada em', render: (r) => <span className="subtle">{dateTime(r.sent_at)}{r.sent_by_name ? ` · ${r.sent_by_name}` : ''}</span> },
    {
      key: 'actions',
      label: '',
      render: (r) =>
        can('crm') && ['pending', 'failed'].includes(r.status) && (
          <div className="row" onClick={(e) => e.stopPropagation()}>
            {apiChannel ? (
              <Button size="sm" icon={Send} onClick={() => run('send_one', 'Mensagem enviada', { recipient_id: r.id })}>Enviar</Button>
            ) : (
              <a className="btn whatsapp sm" href={waLink(r.phone, r.rendered_message)} target="_blank" rel="noreferrer" onClick={() => run('mark', 'Marcado como enviado', { recipient_id: r.id, status: 'sent' })}>
                <MessageCircle size={14} /> Enviar
              </a>
            )}
            <Button size="sm" variant="ghost" icon={SkipForward} title="Pular" aria-label="Pular" onClick={() => run('mark', 'Destinatário pulado', { recipient_id: r.id, status: 'skipped' })} />
          </div>
        ),
    },
  ];

  const active = ['draft', 'running', 'scheduled', 'paused'].includes(c.status);
  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={<span className="row wrap"><StatusBadge map={CAMPAIGN_STATUS} value={c.status} /> {c.channel_name || 'Canal padrão'} · {{ manual: 'Manual', semi: 'Semiautomático', auto: 'Automático' }[c.mode]}{c.saved_report_name ? ` · relatório "${c.saved_report_name}"` : ''}</span>}
        back={<Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/campanhas')} aria-label="Voltar" />}
        actions={
          can('crm') && (
            <>
              {active && <Button icon={Users} loading={busy === 'build'} onClick={() => run('build')} title="Inclui clientes que passaram a atender aos filtros (sem duplicar)">Atualizar público</Button>}
              {['draft', 'scheduled'].includes(c.status) && <Button variant="primary" icon={Play} loading={busy === 'start'} onClick={() => run('start', 'Campanha iniciada')}>Iniciar</Button>}
              {c.status === 'running' && <Button icon={Pause} loading={busy === 'pause'} onClick={() => run('pause', 'Campanha pausada')}>Pausar</Button>}
              {c.status === 'paused' && <Button variant="primary" icon={Play} loading={busy === 'resume'} onClick={() => run('resume', 'Campanha retomada')}>Retomar</Button>}
              {counts.failed > 0 && <Button icon={RefreshCw} loading={busy === 'retry_failed'} onClick={() => run('retry_failed', 'Falhas voltaram para a fila')}>Reenviar falhas</Button>}
              {active && <Button icon={CheckCircle2} onClick={() => run('complete', 'Campanha concluída')}>Concluir</Button>}
              {active && <Button variant="ghost" icon={Edit} onClick={() => navigate(`/campanhas/${id}/editar`)} aria-label="Editar" />}
              {active && <Button variant="ghost" icon={Square} onClick={async () => (await confirm({ message: 'Cancelar a campanha? Os envios pendentes não serão feitos.', danger: true, confirmLabel: 'Cancelar campanha' })) && run('cancel', 'Campanha cancelada')} aria-label="Cancelar campanha" title="Cancelar campanha" />}
              <Button variant="ghost" icon={Trash2} onClick={remove} aria-label="Excluir" />
            </>
          )
        }
      />
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi label="Público" value={number(counts.total)} />
        <Kpi label="Enviadas" value={number(done)} tone="success" icon={CheckCircle2} hint={counts.replied ? `${counts.replied} responderam` : undefined} />
        <Kpi label="Faltam enviar" value={number((counts.pending || 0) + (counts.queued || 0))} onClick={() => (list.setPage(1), setRecipientStatus('pending'))} />
        <Kpi label="Falharam" value={number(counts.failed)} tone="danger" icon={XCircle} onClick={() => (list.setPage(1), setRecipientStatus('failed'))} />
        <Kpi label="Puladas" value={number(counts.skipped)} />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <strong>Progresso</strong>
          <span className="subtle">{pct}% concluído</span>
        </div>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        {c.mode === 'auto' && apiChannel && c.status === 'running' && (
          <p className="subtle" style={{ marginTop: 8 }}>Envio automático em segundo plano: até {c.per_minute} mensagens por minuto, entre {c.send_window_start?.slice(0, 5)} e {c.send_window_end?.slice(0, 5)}.</p>
        )}
        {c.mode === 'auto' && !apiChannel && (
          <p className="error-text" style={{ marginTop: 8 }}>O envio automático exige um canal com API. Com o canal manual, use o envio um a um abaixo.</p>
        )}
      </Card>

      {can('crm') && active && (counts.pending || 0) > 0 && (c.mode !== 'auto' || !apiChannel) && <NextContact campaignId={id} apiChannel={apiChannel} onChanged={refresh} />}

      <Card
        title="Destinatários"
        bodyClass={null}
        actions={<Select className="sm" style={{ width: 170 }} placeholder="Todos" value={recipientStatus} onChange={(e) => (list.setPage(1), setRecipientStatus(e.target.value))} options={Object.entries(RECIPIENT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />}
      >
        <DataTable
          columns={columns}
          rows={recipients.data?.data}
          loading={recipients.loading}
          empty={<Empty title="Nenhum destinatário">Use "Atualizar público" para montar a lista com os filtros da campanha.</Empty>}
          mobile={(r) => (
            <div className="grow">
              <div className="row between"><strong className="truncate">{r.name}</strong><StatusBadge map={RECIPIENT_STATUS} value={r.status} /></div>
              <span className="subtle">{phone(r.phone)} {r.sent_at && `· ${dateTime(r.sent_at)}`}</span>
            </div>
          )}
        />
        <Pagination page={list.page} perPage={25} total={recipients.data?.total} onChange={list.setPage} />
      </Card>
      <Card title="Mensagem" style={{ marginTop: 16 }}>
        <div className="bubble out" style={{ maxWidth: '100%' }}>{c.message}</div>
      </Card>
    </>
  );
}

function waLink(phoneNumber, text) {
  return `https://wa.me/${String(phoneNumber || '').replace(/\D/g, '')}?text=${encodeURIComponent(text || '')}`;
}

/** Envio semiautomático: mostra o próximo cliente com a mensagem pronta para enviar com um toque. */
function NextContact({ campaignId, apiChannel, onChanged }) {
  const toast = useToast();
  const next = useApi('campaigns', { id: campaignId, next: 1 });
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const recipient = next.data?.recipient;

  const mark = async (status) => {
    setBusy(true);
    try {
      await api.patch('campaigns', { action: 'mark', recipient_id: recipient.id, status }, { id: campaignId });
      setOpened(false);
      next.reload();
      onChanged();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };
  const sendNow = async () => {
    setBusy(true);
    try {
      const result = await api.patch('campaigns', { action: 'send_one', recipient_id: recipient.id }, { id: campaignId });
      if (!result.ok) toast.error(result.error || 'Falha no envio');
      next.reload();
      onChanged();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };

  if (next.loading && !next.data) return <Card style={{ marginBottom: 16 }}><Loading /></Card>;
  if (!recipient) return null;
  return (
    <Card title={<h3>Próximo contato <Badge tone="warning">{number(next.data.counts.pending)} na fila</Badge></h3>} style={{ marginBottom: 16 }}>
      <div className="grid cols-2">
        <div className="stack sm">
          <strong style={{ fontSize: 16 }}>{recipient.name}</strong>
          <span className="muted">{phone(recipient.phone)}</span>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {apiChannel ? (
              <Button variant="primary" icon={Send} loading={busy} onClick={sendNow}>Enviar agora</Button>
            ) : (
              <a className="btn whatsapp" href={recipient.wa_link} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}>
                <MessageCircle size={16} /> Abrir no WhatsApp
              </a>
            )}
            {!apiChannel && (
              <Button variant={opened ? 'primary' : ''} icon={CheckCircle2} loading={busy} onClick={() => mark('sent')}>Enviada, próximo</Button>
            )}
            <Button variant="ghost" icon={SkipForward} disabled={busy} onClick={() => mark('skipped')}>Pular</Button>
          </div>
          {!apiChannel && <span className="subtle">Abra o WhatsApp, envie a mensagem e confirme para passar ao próximo cliente.</span>}
        </div>
        <div className="bubble out" style={{ maxWidth: '100%' }}>{recipient.rendered_message}</div>
      </div>
    </Card>
  );
}
