import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate, useApi, useDebounce } from '../../lib/hooks.js';
import { number, phone, today } from '../../lib/format.js';
import { CAMPAIGN_MODES, TEMPLATE_VARIABLES } from '../../lib/constants.js';
import { Button, Card, Field, Input, Loading, PageHeader, Select, Tabs, useToast } from '../../components/ui.jsx';
import AudienceFilters, { cleanFilters } from './AudienceFilters.jsx';

// Sugestões de mensagem e público para cada tipo de campanha.
const PRESETS = {
  monthly_promo: { message: 'Olá, {{primeiro_nome}}! Neste mês a {{otica}} preparou condições especiais em armações e lentes. Responda esta mensagem para saber mais! 👓', audience: {} },
  birthday_month: { message: 'Olá, {{primeiro_nome}}! 🎉 Este é o mês do seu aniversário e a {{otica}} tem um presente especial para você. Venha nos visitar!', audience: { birthday_window: 'this_month' } },
  prescription_expiry: { message: 'Olá, {{primeiro_nome}}! Sua receita de óculos vence em {{vencimento_receita}}. Que tal agendar um novo exame e conferir as novidades da {{otica}}?', audience: { prescription_expiring_days: 30 } },
  renewal: { message: 'Olá, {{primeiro_nome}}! Já faz um tempo desde seus últimos óculos ({{ultima_compra}}). A {{otica}} tem novidades e condições especiais para você renovar.', audience: { no_purchase_days: 365 } },
  reactivation: { message: 'Olá, {{primeiro_nome}}! Sentimos sua falta na {{otica}}. Preparamos uma condição exclusiva para você voltar. Posso te contar?', audience: { no_purchase_days: 540 } },
  christmas: { message: 'Olá, {{primeiro_nome}}! 🎄 Neste Natal, presenteie quem você ama com estilo. A {{otica}} está com ofertas especiais. Boas festas!', audience: {} },
  black_friday: { message: 'Olá, {{primeiro_nome}}! 🖤 Black Friday na {{otica}}: descontos imperdíveis em armações, lentes e óculos de sol. Só até domingo!', audience: {} },
  mothers_day: { message: 'Olá, {{primeiro_nome}}! 💐 Dia das Mães chegando: na {{otica}} você encontra o presente perfeito. Venha conferir!', audience: {} },
  fathers_day: { message: 'Olá, {{primeiro_nome}}! Dia dos Pais na {{otica}}: óculos de sol e armações com condições especiais. Venha conferir!', audience: {} },
  back_to_school: { message: 'Olá, {{primeiro_nome}}! Volta às aulas: que tal checar a visão das crianças? A {{otica}} tem condições especiais em óculos infantis.', audience: { age_max: 17 } },
  quote_recovery: { message: 'Olá, {{primeiro_nome}}! Ainda está pensando no orçamento que fizemos na {{otica}}? Consigo uma condição especial para fechar esta semana.', audience: { quote_status: ['open'] } },
  custom: { message: '', audience: {} },
};

const BLANK = {
  name: '',
  type: 'monthly_promo',
  mode: 'semi',
  channel_id: '',
  template_id: '',
  message: PRESETS.monthly_promo.message,
  audience: {},
  saved_report_id: '',
  scheduled_at: '',
  send_window_start: '08:00',
  send_window_end: '20:00',
  per_minute: 10,
  skip_recent_days: 0,
};

export default function CampaignEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const textarea = useRef(null);
  const existing = useApi(id ? 'campaigns' : null, { id }, { enabled: Boolean(id) });
  const meta = useApi('campaigns', { per_page: 1 });
  const channels = useApi('channels');
  const templates = useApi('templates');
  const savedReports = useApi('saved_reports');
  const [form, setForm] = useState(() => {
    const state = location.state || {};
    return {
      ...BLANK,
      type: state.audience || state.saved_report_id ? 'custom' : BLANK.type,
      message: state.audience || state.saved_report_id ? '' : BLANK.message,
      name: state.name || '',
      audience: state.audience || {},
      saved_report_id: state.saved_report_id || '',
    };
  });
  const [source, setSource] = useState(location.state?.saved_report_id ? 'report' : 'filters');
  const [loaded, setLoaded] = useState(!id);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!id || !existing.data || loaded) return;
    const c = existing.data;
    setForm({
      name: c.name,
      type: c.type,
      mode: c.mode,
      channel_id: c.channel_id || '',
      template_id: c.template_id || '',
      message: c.message,
      audience: Array.isArray(c.audience) ? {} : c.audience || {},
      saved_report_id: c.saved_report_id || '',
      scheduled_at: c.scheduled_at ? c.scheduled_at.slice(0, 16).replace(' ', 'T') : '',
      send_window_start: (c.send_window_start || '08:00').slice(0, 5),
      send_window_end: (c.send_window_end || '20:00').slice(0, 5),
      per_minute: c.per_minute,
      skip_recent_days: c.skip_recent_days,
    });
    setSource(c.saved_report_id ? 'report' : 'filters');
    setLoaded(true);
  }, [id, existing.data, loaded]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const payload = useMemo(
    () => ({
      ...form,
      audience: cleanFilters(form.audience),
      saved_report_id: source === 'report' ? form.saved_report_id : '',
      channel_id: form.channel_id || null,
      template_id: form.template_id || null,
    }),
    [form, source],
  );
  const previewKey = useDebounce(JSON.stringify([payload.audience, payload.saved_report_id, payload.message, payload.skip_recent_days]), 450);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    api
      .post('campaigns', { action: 'preview', audience: payload.audience, saved_report_id: payload.saved_report_id || undefined, message: payload.message, skip_recent_days: payload.skip_recent_days })
      .then((r) => !cancelled && setPreview(r))
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, loaded]);

  const chooseType = (type) => {
    const preset = PRESETS[type] || PRESETS.custom;
    const types = meta.data?.types || {};
    setForm((f) => ({
      ...f,
      type,
      message: preset.message || f.message,
      audience: Object.keys(preset.audience).length ? { ...preset.audience } : f.audience,
      name: f.name || `${types[type] || 'Campanha'} · ${today().slice(5, 7)}/${today().slice(0, 4)}`,
    }));
  };

  const insertVariable = (variable) => {
    const el = textarea.current;
    const start = el?.selectionStart ?? form.message.length;
    const end = el?.selectionEnd ?? form.message.length;
    const next = form.message.slice(0, start) + variable + form.message.slice(end);
    set('message', next);
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(start + variable.length, start + variable.length);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = id ? await api.patch('campaigns', payload, { id }) : await api.post('campaigns', payload);
      invalidate('campaigns');
      toast.success(id ? 'Campanha atualizada' : `Campanha criada com ${result.recipients} destinatário(s)`);
      navigate(`/campanhas/${result.id || id}`);
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <Loading />;
  const types = meta.data?.types || {};
  const channelList = (channels.data?.channels || []).filter((c) => c.status !== 'inactive');
  const selectedChannel = channelList.find((c) => String(c.id) === String(form.channel_id)) || channelList.find((c) => Number(c.is_default));

  return (
    <>
      <PageHeader
        title={id ? 'Editar campanha' : 'Nova campanha'}
        back={<Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Voltar" />}
        actions={<Button variant="primary" icon={Save} loading={saving} disabled={!form.name || !form.message} onClick={save}>Salvar campanha</Button>}
      />
      <div className="grid cols-3" style={{ alignItems: 'start' }}>
        <div className="stack lg span-2">
          <Card title="1. Campanha">
            <div className="form-grid">
              <Field label="Tipo" className="c5">
                <Select value={form.type} onChange={(e) => chooseType(e.target.value)} options={Object.entries(types).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Nome" className="c7">
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Promoção de novembro" />
              </Field>
              <Field label="Forma de envio" className="c6">
                <Select value={form.mode} onChange={(e) => set('mode', e.target.value)} options={Object.entries(CAMPAIGN_MODES).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Canal" className="c6" hint={form.mode === 'auto' && selectedChannel?.type === 'whatsapp_manual' ? 'O envio automático exige um canal com API configurada.' : undefined}>
                <Select placeholder="Canal padrão" value={form.channel_id} onChange={(e) => set('channel_id', e.target.value)} options={channelList.map((c) => ({ value: c.id, label: `${c.name} (${c.type_label})` }))} />
              </Field>
            </div>
          </Card>

          <Card title="2. Mensagem">
            <div className="stack">
              <Field label="Usar um modelo">
                <Select
                  placeholder="Escrever do zero"
                  value={form.template_id}
                  onChange={(e) => {
                    const template = (templates.data || []).find((t) => String(t.id) === e.target.value);
                    setForm((f) => ({ ...f, template_id: e.target.value, message: template ? template.body : f.message }));
                  }}
                  options={(templates.data || []).map((t) => ({ value: t.id, label: `${t.name}${t.meta_template_name ? ' (modelo Meta)' : ''}` }))}
                />
              </Field>
              <Field label="Texto" hint="As variáveis são trocadas pelos dados de cada cliente no envio.">
                <textarea ref={textarea} className="textarea" rows={6} value={form.message} onChange={(e) => set('message', e.target.value)} />
              </Field>
              <div className="chips">
                {TEMPLATE_VARIABLES.map(([variable, label]) => (
                  <button key={variable} type="button" className="chip" onClick={() => insertVariable(variable)} title={variable}>+ {label}</button>
                ))}
              </div>
            </div>
          </Card>

          <Card title="3. Público">
            <div className="stack">
              <Tabs active={source} onChange={setSource} tabs={[{ key: 'filters', label: 'Filtrar clientes' }, { key: 'report', label: 'Usar relatório salvo' }]} />
              {source === 'report' && (
                <Field label="Relatório salvo" hint="Os filtros de clientes do relatório definem o público; filtros abaixo são somados.">
                  <Select placeholder="Selecione…" value={form.saved_report_id} onChange={(e) => set('saved_report_id', e.target.value)} options={(savedReports.data || []).map((r) => ({ value: r.id, label: r.name }))} />
                </Field>
              )}
              {form.audience?.ids?.length ? (
                <div className="row between card card-body">
                  <span><Users size={15} /> Público definido por relatório: <strong>{number(form.audience.ids.length)}</strong> cliente(s)</span>
                  <Button size="sm" onClick={() => set('audience', {})}>Limpar</Button>
                </div>
              ) : null}
              <AudienceFilters value={form.audience} onChange={(audience) => set('audience', audience)} showConsent />
            </div>
          </Card>

          <Card title="4. Envio">
            <div className="form-grid">
              <Field label="Agendar início" className="c4" hint="Vazio = começa ao iniciar">
                <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => set('scheduled_at', e.target.value)} />
              </Field>
              <Field label="Enviar entre" className="c2"><Input type="time" value={form.send_window_start} onChange={(e) => set('send_window_start', e.target.value)} /></Field>
              <Field label="e" className="c2"><Input type="time" value={form.send_window_end} onChange={(e) => set('send_window_end', e.target.value)} /></Field>
              <Field label="Mensagens por minuto" className="c2"><Input type="number" min="1" max="60" value={form.per_minute} onChange={(e) => set('per_minute', e.target.value)} /></Field>
              <Field label="Pular quem recebeu campanha nos últimos (dias)" className="c4">
                <Input type="number" min="0" value={form.skip_recent_days} onChange={(e) => set('skip_recent_days', e.target.value)} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="stack lg" style={{ position: 'sticky', top: 76 }}>
          <Card title="Prévia do público">
            {preview ? (
              <div className="stack">
                <div>
                  <div className="kpi-value">{number(preview.total)}</div>
                  <span className="subtle">cliente(s) com WhatsApp{payload.audience.require_consent === false ? '' : ' e aceite de mensagens'}</span>
                </div>
                {preview.sample.length > 0 && (
                  <div className="stack sm">
                    {preview.sample.map((c) => (
                      <div key={c.id} className="row between" style={{ fontSize: 13 }}>
                        <span className="truncate">{c.name}</span>
                        <span className="subtle nowrap">{phone(c.whatsapp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Loading />
            )}
          </Card>
          {preview?.example && (
            <Card title="Exemplo de mensagem">
              <div className="bubble out" style={{ maxWidth: '100%' }}>{preview.example}</div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
