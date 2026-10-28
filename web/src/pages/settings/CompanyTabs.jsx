import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Save, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { applyBrand, useSession } from '../../lib/session.jsx';
import { date, money } from '../../lib/format.js';
import { COMPANY_STATUS, INVOICE_STATUS, UF } from '../../lib/constants.js';
import { Badge, Button, Card, DataTable, Empty, Field, Input, Loading, Select, StatusBadge, Textarea, useToast } from '../../components/ui.jsx';
import { ReadOnlyNotice } from './common.jsx';

const COMPANY_KEYS = [
  'name', 'trade_name', 'document', 'phone', 'whatsapp', 'email', 'instagram', 'zip', 'address', 'number', 'neighborhood', 'city', 'state',
  'primary_color', 'next_sale_number', 'next_order_number', 'next_quote_number',
];

/** Carrega e salva os dados da ótica (compartilhado pelas abas "Ótica" e "Documentos"). */
function useCompanyForm() {
  const { data, loading, reload } = useApi('company');
  const { refresh } = useSession();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) {
      const settings = Array.isArray(data.settings) ? {} : data.settings || {};
      setForm({ ...Object.fromEntries(COMPANY_KEYS.map((k) => [k, data[k] ?? ''])), settings });
    }
  }, [data]);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setSetting = (key, value) => setForm((f) => ({ ...f, settings: { ...f.settings, [key]: value } }));
  const save = async (event) => {
    event?.preventDefault();
    setSaving(true);
    try {
      await api.patch('company', form);
      toast.success('Configurações salvas');
      await refresh();
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  return { data, loading, form, set, setSetting, save, saving, reload };
}

function SaveBar({ saving, disabled }) {
  return (
    <div className="row end">
      <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={disabled}>
        Salvar alterações
      </Button>
    </div>
  );
}

function LogoCard({ canEdit, onChanged }) {
  const { company, logoUrl, refresh } = useSession();
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const logo = logoUrl(company);
  const upload = async (file) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      await api.upload('company_logo', form);
      toast.success('Logo atualizado');
      await refresh();
      onChanged?.();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.del('company_logo');
      await refresh();
      onChanged?.();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Logo">
      <div className="stack">
        <div style={{ height: 110, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', borderRadius: 10 }}>
          {logo ? <img src={logo} alt="Logo da ótica" style={{ maxHeight: 96, maxWidth: '90%', objectFit: 'contain' }} /> : <span className="subtle">Sem logo</span>}
        </div>
        <span className="subtle">Aparece no menu, na tela de entrada e nos PDFs de pedido, orçamento e OS. Use JPG ou PNG.</span>
        {canEdit && (
          <div className="row">
            <Button icon={ImagePlus} loading={busy} onClick={() => input.current.click()}>
              Enviar logo
            </Button>
            {logo && <Button variant="ghost" icon={Trash2} onClick={remove} disabled={busy} aria-label="Remover logo" />}
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => (upload(e.target.files[0]), (e.target.value = ''))} />
          </div>
        )}
      </div>
    </Card>
  );
}

export function CompanyTab() {
  const { can } = useSession();
  const canEdit = can('manage');
  const { loading, form, set, setSetting, save, saving } = useCompanyForm();
  if (loading && !form) return <Loading />;
  if (!form) return <Empty title="Não foi possível carregar os dados" />;
  const bind = (key) => ({ value: form[key] ?? '', onChange: (e) => set(key, e.target.value), readOnly: !canEdit });
  const bindSetting = (key) => ({ value: form.settings[key] ?? '', onChange: (e) => setSetting(key, e.target.value), readOnly: !canEdit });

  return (
    <form className="stack" onSubmit={save}>
      {!canEdit && <ReadOnlyNotice />}
      <div className="grid cols-3">
        <Card title="Dados da ótica" className="span-2">
          <div className="form-grid">
            <Field label="Razão social *" className="c6">
              <Input required {...bind('name')} />
            </Field>
            <Field label="Nome fantasia" className="c6">
              <Input {...bind('trade_name')} />
            </Field>
            <Field label="CNPJ" className="c4">
              <Input {...bind('document')} />
            </Field>
            <Field label="Telefone" className="c4">
              <Input {...bind('phone')} />
            </Field>
            <Field label="WhatsApp" className="c4">
              <Input {...bind('whatsapp')} />
            </Field>
            <Field label="E-mail" className="c6">
              <Input type="email" {...bind('email')} />
            </Field>
            <Field label="Instagram" className="c6">
              <Input placeholder="@suaotica" {...bind('instagram')} />
            </Field>
            <Field label="CEP" className="c3">
              <Input {...bind('zip')} />
            </Field>
            <Field label="Endereço" className="c7">
              <Input {...bind('address')} />
            </Field>
            <Field label="Número" className="c2">
              <Input {...bind('number')} />
            </Field>
            <Field label="Bairro" className="c5">
              <Input {...bind('neighborhood')} />
            </Field>
            <Field label="Cidade" className="c5">
              <Input {...bind('city')} />
            </Field>
            <Field label="UF" className="c2">
              <Select placeholder="—" options={UF} {...bind('state')} disabled={!canEdit} />
            </Field>
          </div>
        </Card>
        <div className="stack">
          <LogoCard canEdit={canEdit} />
          <Card title="Cor da marca">
            <div className="row">
              <input
                type="color"
                value={form.primary_color || '#4f2d7f'}
                disabled={!canEdit}
                onChange={(e) => {
                  set('primary_color', e.target.value);
                  applyBrand(e.target.value);
                }}
                style={{ width: 52, height: 38, border: 'none', background: 'none', cursor: 'pointer' }}
              />
              <Input value={form.primary_color} readOnly={!canEdit} onChange={(e) => set('primary_color', e.target.value)} style={{ maxWidth: 120 }} />
            </div>
            <span className="subtle">Usada no sistema e nos documentos impressos.</span>
          </Card>
        </div>
      </div>
      <Card title="Preferências">
        <div className="form-grid">
          <Field label="DDD padrão" hint="Completa telefones sem DDD (ex.: 93)" className="c3">
            <Input inputMode="numeric" maxLength={2} {...bindSetting('default_ddd')} />
          </Field>
          <Field label="Validade da receita (meses)" className="c3">
            <Input type="number" min="1" {...bindSetting('prescription_validity_months')} />
          </Field>
          <Field label="Lembrar renovação após (meses)" className="c3">
            <Input type="number" min="1" {...bindSetting('renewal_months')} />
          </Field>
          <Field label="Validade do orçamento (dias)" className="c3">
            <Input type="number" min="1" {...bindSetting('quote_validity_days')} />
          </Field>
        </div>
      </Card>
      {canEdit && <SaveBar saving={saving} />}
    </form>
  );
}

export function DocumentsTab() {
  const { can } = useSession();
  const canEdit = can('manage');
  const { loading, form, set, setSetting, save, saving } = useCompanyForm();
  if (loading && !form) return <Loading />;
  if (!form) return <Empty title="Não foi possível carregar os dados" />;
  const bind = (key) => ({ value: form[key] ?? '', onChange: (e) => set(key, e.target.value), readOnly: !canEdit });
  const bindSetting = (key) => ({ value: form.settings[key] ?? '', onChange: (e) => setSetting(key, e.target.value), readOnly: !canEdit });
  return (
    <form className="stack" onSubmit={save}>
      {!canEdit && <ReadOnlyNotice />}
      <Card title="Numeração">
        <div className="stack">
          <p className="muted">
            Defina o próximo número de cada documento. Use para continuar a sequência do sistema ou talão anterior — por exemplo, se o último pedido em papel foi 4.580,
            informe 4581. Números já usados são pulados automaticamente.
          </p>
          <div className="form-grid">
            <Field label="Próximo pedido de venda" className="c4">
              <Input type="number" min="1" required {...bind('next_sale_number')} />
            </Field>
            <Field label="Próxima ordem de serviço" className="c4">
              <Input type="number" min="1" required {...bind('next_order_number')} />
            </Field>
            <Field label="Próximo orçamento" className="c4">
              <Input type="number" min="1" required {...bind('next_quote_number')} />
            </Field>
          </div>
        </div>
      </Card>
      <Card title="Textos dos documentos (PDF A5)">
        <div className="form-grid">
          <Field label="Termos do pedido de venda" hint="Impresso acima das assinaturas do pedido.">
            <Textarea rows={4} {...bindSetting('sale_terms')} />
          </Field>
          <Field label="Observações padrão da ordem de serviço">
            <Textarea rows={3} {...bindSetting('order_terms')} />
          </Field>
          <Field label="Rodapé dos documentos" hint='Padrão: "Documento sem valor fiscal".'>
            <Input maxLength={200} {...bindSetting('pdf_footer')} />
          </Field>
        </div>
      </Card>
      {canEdit && <SaveBar saving={saving} />}
    </form>
  );
}

export function PlanTab() {
  const { data, loading } = useApi('company');
  if (loading && !data) return <Loading />;
  if (!data) return <Empty title="Não foi possível carregar o plano" />;
  return (
    <div className="grid cols-3">
      <Card title="Assinatura">
        <div className="stack">
          <div className="row between">
            <span className="muted">Plano</span>
            <strong>{data.plan?.name || 'Não definido'}</strong>
          </div>
          <div className="row between">
            <span className="muted">Mensalidade</span>
            <strong>{money(data.monthly_fee)}</strong>
          </div>
          <div className="row between">
            <span className="muted">Vencimento</span>
            <strong>Todo dia {data.billing_day}</strong>
          </div>
          <div className="row between">
            <span className="muted">Situação</span>
            <StatusBadge map={COMPANY_STATUS} value={data.status} />
          </div>
          {data.status === 'trial' && data.trial_ends_at && (
            <Badge tone="info">Avaliação até {date(data.trial_ends_at)}</Badge>
          )}
          <span className="subtle">Para mudar de plano, fale com o suporte da plataforma.</span>
        </div>
      </Card>
      <Card title="Faturas" className="span-2" bodyClass={null}>
        <DataTable
          rows={data.invoices}
          rowKey="reference"
          empty={<Empty title="Nenhuma fatura" />}
          columns={[
            { key: 'reference', label: 'Referência' },
            { key: 'description', label: 'Descrição' },
            { key: 'due_date', label: 'Vencimento', render: (r) => date(r.due_date) },
            { key: 'amount', label: 'Valor', className: 'num', render: (r) => money(r.amount) },
            { key: 'status', label: 'Situação', render: (r) => <StatusBadge map={INVOICE_STATUS} value={r.status} /> },
          ]}
        />
      </Card>
    </div>
  );
}
