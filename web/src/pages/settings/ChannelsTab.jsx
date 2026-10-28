import { useState } from 'react';
import { Copy, Pencil, Plus, Power, Send } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
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

function SetupHelp({ type, url, verifyToken }) {
  const copy = () => navigator.clipboard?.writeText(url);
  const urlBox = (
    <div className="row">
      <Input readOnly value={url} className="sm grow mono" onFocus={(e) => e.target.select()} />
      <Button size="sm" icon={Copy} onClick={copy} title="Copiar" />
    </div>
  );
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

  if (loading && !data) return <Loading />;
  const types = data?.types || {};
  const channels = data?.channels || [];

  const open = (channel) =>
    setEditing(channel ? { ...channel, is_default: Boolean(Number(channel.is_default)), config: { ...channel.config } } : { type: 'whatsapp_cloud', name: '', config: {}, is_default: !channels.length });

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { type: editing.type, name: editing.name, config: editing.config, is_default: editing.is_default };
      if (editing.id) await api.patch('channels', payload, { id: editing.id });
      else await api.post('channels', payload);
      toast.success('Canal salvo');
      setEditing(null);
      reload();
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
                    {channel.status === 'inactive' && <Badge>Inativo</Badge>}
                  </span>
                  {canEdit && (
                    <span className="row">
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
                {channel.type !== 'whatsapp_manual' && canEdit && (
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
                  onChange={(e) => setEditing((c) => ({ ...c, type: e.target.value, config: {} }))}
                  options={Object.entries(types).map(([value, t]) => ({ value, label: t.label }))}
                />
              </Field>
              <Field label="Nome *" className="c6">
                <Input required placeholder="Ex.: WhatsApp da loja" value={editing.name} onChange={(e) => setEditing((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              {(types[editing.type]?.fields || []).map((field) => (
                <Field key={field} label={FIELD_LABELS[field]?.[0] || field} hint={FIELD_LABELS[field]?.[1]} className="c6">
                  <Input
                    type={SECRET_FIELDS.includes(field) && !String(editing.config[field] || '').startsWith('••••') ? 'password' : 'text'}
                    autoComplete="off"
                    value={editing.config[field] || ''}
                    onChange={(e) => setEditing((c) => ({ ...c, config: { ...c.config, [field]: e.target.value } }))}
                  />
                </Field>
              ))}
              <Checkbox label="Canal padrão para campanhas e automações" checked={editing.is_default} onChange={(e) => setEditing((c) => ({ ...c, is_default: e.target.checked }))} />
            </div>
            <SetupHelp type={editing.type} url={editing.webhook_url || 'A URL aparece após salvar o canal.'} verifyToken={editing.config.verify_token} />
          </form>
        )}
      </Modal>

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
