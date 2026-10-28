import { useEffect, useRef, useState } from 'react';
import { Copy, LogOut, Pencil, Plus, Power, QrCode, Send, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { phone } from '../../lib/format.js';
import { useSession } from '../../lib/session.jsx';
import { Badge, Button, Card, Checkbox, Empty, Field, Input, Loading, Modal, Select, useConfirm, useToast } from '../../components/ui.jsx';
import { ReadOnlyNotice } from './common.jsx';

const FIELD_LABELS = {
  phone_number_id: ['ID do número de telefone (Phone number ID)', 'No painel da Meta › WhatsApp › Configuração da API.'],
  waba_id: ['ID da conta do WhatsApp Business (WABA ID)', ''],
  access_token: ['Token de acesso permanente', 'Gere um token de usuário do sistema com permissão whatsapp_business_messaging.'],
  app_secret: ['Chave secreta do app (App Secret)', 'Usada para validar a assinatura dos webhooks.'],
  verify_token: ['Token de verificação do webhook', 'Qualquer texto; informe o mesmo valor no painel da Meta.'],
  graph_version: ['Versão da Graph API', 'Padrão: v21.0'],
  base_url: ['URL da Evolution API', 'Ex.: https://evolution.suaempresa.com.br'],
  api_key: ['API Key', 'Chave global ou da instância.'],
  instance: ['Nome da instância', 'Instância conectada ao WhatsApp da ótica (QR Code).'],
  instance_id: ['ID da instância', 'Painel Z-API › Instâncias.'],
  token: ['Token da instância', ''],
  client_token: ['Client-Token (segurança da conta)', 'Painel Z-API › Segurança.'],
  page_id: ['ID da página', 'Página do Facebook vinculada (e à conta do Instagram).'],
};

const SECRET_FIELDS = ['access_token', 'app_secret', 'api_key', 'token', 'client_token'];
const UNOFFICIAL_TYPES = ['whatsapp_evolution', 'whatsapp_zapi'];
const CONNECTION_LABELS = { open: ['Conectado', 'success'], connecting: ['Aguardando leitura do QR Code', 'warning'], close: ['Desconectado', 'danger'] };

function isManaged(channel) {
  return channel?.type === 'whatsapp_evolution' && Boolean(channel.config?.managed);
}

/** Aquecimento e uso do dia do número (envio seguro). */
function SafetyLine({ safety }) {
  if (!safety?.daily_limit) return null;
  const pct = Math.min(100, Math.round((safety.sent_today / safety.daily_limit) * 100));
  return (
    <div className="stack sm">
      <span className="row subtle">
        <ShieldCheck size={14} />
        Envio seguro · {safety.daily_limit_custom ? 'limite definido manualmente' : `aquecimento: dia ${safety.warmup_day + 1}`} · hoje {safety.sent_today} de {safety.daily_limit} mensagens automáticas
      </span>
      <div className="progress" style={{ height: 6 }}><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** Conexão do WhatsApp por QR Code (ou código de pareamento) com acompanhamento do estado. */
function ConnectModal({ channel, onClose, onConnected }) {
  const toast = useToast();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pairingNumber, setPairingNumber] = useState('');
  const timers = useRef([]);
  const done = useRef(false);
  const finish = (fresh) => {
    if (done.current) return;
    done.current = true;
    onConnected(fresh);
  };

  const connect = async (number = '') => {
    setLoading(true);
    try {
      const data = await api.post('channels', { action: 'connect', pairing_number: number || undefined }, { id: channel.id });
      if (!data.ok) toast.error(data.error || 'Falha ao gerar o QR Code');
      setResult(data);
      if (data.state === 'open') finish(data.channel);
    } catch (error) {
      toast.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    connect();
    // Acompanha a leitura do QR Code e renova o código antes de expirar.
    const poll = setInterval(async () => {
      try {
        const data = await api.post('channels', { action: 'state' }, { id: channel.id });
        if (data.state === 'open') finish(data.channel);
      } catch {
        /* nova tentativa no próximo ciclo */
      }
    }, 4000);
    const refresh = setInterval(() => connect(), 40000);
    timers.current = [poll, refresh];
    return () => timers.current.forEach(clearInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  return (
    <Modal open title={`Conectar WhatsApp · ${channel.name}`} onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        {result?.qr ? (
          <img src={result.qr} alt="QR Code para conectar o WhatsApp" width={264} height={264} style={{ background: '#fff', padding: 8, borderRadius: 8 }} />
        ) : (
          loading && <Loading />
        )}
        {result?.pairing_code && (
          <div className="stack sm">
            <span className="label">Código de pareamento</span>
            <strong className="mono" style={{ fontSize: 24, letterSpacing: 4 }}>{result.pairing_code}</strong>
          </div>
        )}
        <ol className="muted" style={{ textAlign: 'left', margin: 0, paddingLeft: 18 }}>
          <li>No celular da ótica, abra o WhatsApp (de preferência o WhatsApp Business).</li>
          <li>Toque em ⋮ ou Configurações › Aparelhos conectados › Conectar um aparelho.</li>
          <li>Aponte a câmera para o QR Code. Esta janela fecha sozinha quando conectar.</li>
        </ol>
        <div className="row" style={{ width: '100%' }}>
          <Input className="grow" inputMode="tel" placeholder="Ou conecte pelo número: (93) 99999-0000" value={pairingNumber} onChange={(e) => setPairingNumber(e.target.value)} />
          <Button disabled={!pairingNumber || loading} onClick={() => connect(pairingNumber)}>Gerar código</Button>
        </div>
      </div>
    </Modal>
  );
}

function SetupHelp({ type, url, verifyToken, managed }) {
  const copy = () => navigator.clipboard?.writeText(url);
  const urlBox = (
    <div className="row">
      <Input readOnly value={url} className="sm grow mono" onFocus={(e) => e.target.select()} />
      <Button size="sm" icon={Copy} onClick={copy} title="Copiar" />
    </div>
  );
  if (managed) {
    return (
      <p className="subtle">
        WhatsApp integrado: o Ocular cria a conexão e configura o recebimento de mensagens sozinho. Depois de salvar, clique em <strong>Conectar</strong> e leia o QR Code com o
        WhatsApp da ótica.
      </p>
    );
  }
  if (type === 'whatsapp_manual') {
    return (
      <p className="subtle">
        Sem integração: o sistema prepara a mensagem e abre o WhatsApp (web ou celular) do atendente com o texto pronto. Ideal para começar sem custo e para campanhas
        semiautomáticas.
      </p>
    );
  }
  const steps = {
    whatsapp_cloud: [
      'No app da Meta (developers.facebook.com), abra WhatsApp › Configuração.',
      'Em Webhook, informe a URL de retorno abaixo e o token de verificação configurado neste canal' + (verifyToken ? '' : ' (se vazio, use o código final da URL)') + '.',
      'Assine o campo "messages".',
      'Para campanhas fora da janela de 24 h, cadastre modelos aprovados e informe o nome do modelo em Modelos de mensagem.',
    ],
    whatsapp_evolution: [
      'Crie/conecte a instância na Evolution API lendo o QR Code com o WhatsApp da ótica.',
      'Em Webhook da instância, informe a URL abaixo e habilite o evento MESSAGES_UPSERT.',
    ],
    whatsapp_zapi: ['No painel da Z-API, abra a instância › Webhooks.', 'Cole a URL abaixo no campo "Ao receber".'],
    instagram: ['No app da Meta, adicione o produto Messenger/Instagram e vincule a página.', 'Em Webhooks, informe a URL e o token de verificação e assine "messages".'],
    facebook: ['No app da Meta, adicione o produto Messenger e vincule a página.', 'Em Webhooks, informe a URL e o token de verificação e assine "messages".'],
  }[type] || [];
  return (
    <div className="stack sm">
      <span className="label">Como configurar</span>
      <ol style={{ margin: 0, paddingLeft: 18 }} className="muted">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <span className="label">URL do webhook (receber mensagens)</span>
      {urlBox}
    </div>
  );
}

export default function ChannelsTab() {
  const { can } = useSession();
  const canEdit = can('manage');
  const { data, loading, reload } = useApi('channels');
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [connecting, setConnecting] = useState(null);

  if (loading && !data) return <Loading />;
  const types = data?.types || {};
  const channels = data?.channels || [];
  const evolutionAvailable = Boolean(data?.evolution_available);

  const open = (channel) =>
    setEditing(
      channel
        ? { ...channel, is_default: Boolean(Number(channel.is_default)), daily_limit: Number(channel.daily_limit) || '', config: { ...channel.config } }
        : evolutionAvailable
          ? { type: 'whatsapp_evolution', name: 'WhatsApp da loja', config: { managed: '1' }, daily_limit: '', is_default: !channels.length }
          : { type: 'whatsapp_cloud', name: '', config: {}, daily_limit: '', is_default: !channels.length },
    );

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { type: editing.type, name: editing.name, config: editing.config, is_default: editing.is_default, daily_limit: editing.daily_limit || 0 };
      const result = editing.id ? await api.patch('channels', payload, { id: editing.id }) : await api.post('channels', payload);
      toast.success('Canal salvo');
      const managedNew = !editing.id && isManaged(editing);
      setEditing(null);
      await reload();
      // Canal integrado recém-criado: abre direto o QR Code.
      if (managedNew && result?.id) setConnecting({ id: result.id, name: payload.name });
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (channel) => {
    if (!(await confirm({ message: `Desativar o canal "${channel.name}"?`, danger: true, confirmLabel: 'Desativar' }))) return;
    await api.del('channels', { id: channel.id });
    reload();
  };

  const logout = async (channel) => {
    if (!(await confirm({ message: `Desconectar o WhatsApp do canal "${channel.name}"? Campanhas por este número ficam pausadas até conectar de novo.`, danger: true, confirmLabel: 'Desconectar' }))) return;
    try {
      await api.post('channels', { action: 'logout' }, { id: channel.id });
      toast.success('WhatsApp desconectado');
      reload();
    } catch (error) {
      toast.error(error);
    }
  };

  const connected = () => {
    setConnecting(null);
    toast.success('WhatsApp conectado');
    reload();
  };

  const runTest = async () => {
    setSaving(true);
    try {
      const result = await api.post('channels', { action: 'test', to: testing.to }, { id: testing.channel.id });
      if (result.wa_link) window.open(result.wa_link, '_blank');
      if (result.ok) toast.success(result.wa_link ? 'WhatsApp aberto com a mensagem de teste' : 'Mensagem de teste enviada');
      else toast.error(result.error || 'Falha no envio');
      setTesting(null);
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      {!canEdit && <ReadOnlyNotice />}
      <Card
        title="Canais de atendimento"
        actions={
          canEdit && (
            <Button size="sm" variant="primary" icon={Plus} onClick={() => open(null)}>
              Novo canal
            </Button>
          )
        }
      >
        <div className="stack">
          <p className="muted">
            Escolha como a ótica conversa com os clientes: <strong>API oficial da Meta</strong> (WhatsApp Cloud), <strong>API não oficial</strong> (Evolution API ou Z-API, conectadas por QR
            Code) ou <strong>envio manual</strong> pelo WhatsApp do atendente. Instagram Direct e Messenger usam a Graph API da Meta. O canal padrão é usado em campanhas e automações.
          </p>
          {channels.length ? (
            channels.map((channel) => (
              <div key={channel.id} className="card card-body stack sm" style={{ boxShadow: 'none', opacity: channel.status === 'inactive' ? 0.55 : 1 }}>
                <div className="row between wrap">
                  <span className="row">
                    <span className={`status-dot ${channel.status === 'active' ? 'ok' : channel.status === 'error' ? 'err' : ''}`} />
                    <strong>{channel.name}</strong>
                    <Badge>{channel.type_label}</Badge>
                    {Number(channel.is_default) ? <Badge tone="brand">Padrão</Badge> : null}
                    {isManaged(channel) && <Badge tone="info">Integrado</Badge>}
                    {channel.type === 'whatsapp_evolution' && channel.status !== 'inactive' && CONNECTION_LABELS[channel.connection_state] && (
                      <Badge tone={CONNECTION_LABELS[channel.connection_state][1]}>
                        {CONNECTION_LABELS[channel.connection_state][0]}
                        {channel.connection_state === 'open' && channel.phone_number ? ` · ${phone(channel.phone_number)}` : ''}
                      </Badge>
                    )}
                    {channel.status === 'inactive' && <Badge>Inativo</Badge>}
                  </span>
                  {canEdit && (
                    <span className="row">
                      {channel.type === 'whatsapp_evolution' && channel.status !== 'inactive' && channel.connection_state !== 'open' && (
                        <Button size="sm" variant="primary" icon={QrCode} onClick={() => setConnecting(channel)}>
                          Conectar
                        </Button>
                      )}
                      {channel.type === 'whatsapp_evolution' && channel.connection_state === 'open' && (
                        <Button size="sm" variant="ghost" icon={LogOut} onClick={() => logout(channel)} title="Desconectar o WhatsApp" />
                      )}
                      {channel.status !== 'inactive' && (
                        <Button size="sm" icon={Send} onClick={() => setTesting({ channel, to: '' })}>
                          Testar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(channel)} aria-label="Editar" />
                      {channel.status !== 'inactive' && <Button size="sm" variant="ghost" icon={Power} onClick={() => deactivate(channel)} title="Desativar" />}
                    </span>
                  )}
                </div>
                {channel.status === 'error' && channel.last_error && <span className="error-text">Último erro: {channel.last_error}</span>}
                {channel.status !== 'inactive' && <SafetyLine safety={channel.safety} />}
                {channel.type !== 'whatsapp_manual' && !isManaged(channel) && canEdit && (
                  <div className="row">
                    <span className="subtle nowrap">Webhook:</span>
                    <Input readOnly className="sm mono grow" value={channel.webhook_url} onFocus={(e) => e.target.select()} />
                    <Button size="sm" icon={Copy} onClick={() => (navigator.clipboard?.writeText(channel.webhook_url), toast.success('URL copiada'))} title="Copiar" />
                  </div>
                )}
              </div>
            ))
          ) : (
            <Empty title="Nenhum canal configurado" />
          )}
        </div>
      </Card>

      <Modal
        open={Boolean(editing)}
        size="lg"
        title={editing?.id ? 'Editar canal' : 'Novo canal'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="channel-form" loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <form id="channel-form" className="stack" onSubmit={save}>
            <div className="form-grid">
              <Field label="Tipo" className="c6">
                <Select
                  value={editing.type}
                  disabled={Boolean(editing.id)}
                  onChange={(e) => setEditing((c) => ({ ...c, type: e.target.value, config: e.target.value === 'whatsapp_evolution' && evolutionAvailable ? { managed: '1' } : {} }))}
                  options={Object.entries(types).map(([value, t]) => ({ value, label: t.label }))}
                />
              </Field>
              <Field label="Nome *" className="c6">
                <Input required placeholder="Ex.: WhatsApp da loja" value={editing.name} onChange={(e) => setEditing((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              {editing.type === 'whatsapp_evolution' && (
                <Field
                  label="Servidor"
                  className="c12"
                  hint={evolutionAvailable ? undefined : 'O WhatsApp integrado não está ativo nesta instalação (veja EVOLUTION_URL no README). Informe um servidor próprio.'}
                >
                  <Select
                    value={editing.config.managed ? 'managed' : 'own'}
                    disabled={Boolean(editing.id)}
                    onChange={(e) => setEditing((c) => ({ ...c, config: { ...c.config, managed: e.target.value === 'managed' ? '1' : '' } }))}
                    options={[
                      ...(evolutionAvailable || editing.config.managed ? [{ value: 'managed', label: 'WhatsApp integrado do Ocular (recomendado): só ler o QR Code' }] : []),
                      { value: 'own', label: 'Servidor Evolution API próprio' },
                    ]}
                  />
                </Field>
              )}
              {(isManaged(editing) ? [] : types[editing.type]?.fields || []).map((field) => (
                <Field key={field} label={FIELD_LABELS[field]?.[0] || field} hint={FIELD_LABELS[field]?.[1]} className="c6">
                  <Input
                    type={SECRET_FIELDS.includes(field) && !String(editing.config[field] || '').startsWith('••••') ? 'password' : 'text'}
                    autoComplete="off"
                    value={editing.config[field] || ''}
                    onChange={(e) => setEditing((c) => ({ ...c, config: { ...c.config, [field]: e.target.value } }))}
                  />
                </Field>
              ))}
              {UNOFFICIAL_TYPES.includes(editing.type) && (
                <Field
                  label="Limite diário de mensagens automáticas"
                  className="c6"
                  hint={`Vazio = automático pelo aquecimento do número (${(data?.warmup_steps || []).map(([day, limit]) => `${limit}/dia a partir do dia ${day + 1}`).join(', ')}). Aumente só se o número já for antigo e bem avaliado.`}
                >
                  <Input type="number" min="0" max="1000" placeholder="Automático" value={editing.daily_limit} onChange={(e) => setEditing((c) => ({ ...c, daily_limit: e.target.value }))} />
                </Field>
              )}
              <Checkbox label="Canal padrão para campanhas e automações" checked={editing.is_default} onChange={(e) => setEditing((c) => ({ ...c, is_default: e.target.checked }))} />
            </div>
            <SetupHelp type={editing.type} managed={isManaged(editing)} url={editing.webhook_url || 'A URL aparece após salvar o canal.'} verifyToken={editing.config.verify_token} />
          </form>
        )}
      </Modal>

      {connecting && <ConnectModal channel={connecting} onClose={() => (setConnecting(null), reload())} onConnected={connected} />}

      <Modal
        open={Boolean(testing)}
        title="Enviar mensagem de teste"
        onClose={() => setTesting(null)}
        footer={
          <>
            <Button onClick={() => setTesting(null)}>Cancelar</Button>
            <Button variant="primary" icon={Send} loading={saving} onClick={runTest} disabled={!testing?.to}>
              Enviar teste
            </Button>
          </>
        }
      >
        {testing && (
          <Field label="WhatsApp de destino" hint="Com DDD. Ex.: (93) 99999-0000">
            <Input autoFocus inputMode="tel" value={testing.to} onChange={(e) => setTesting((t) => ({ ...t, to: e.target.value }))} />
          </Field>
        )}
      </Modal>
    </div>
  );
}
