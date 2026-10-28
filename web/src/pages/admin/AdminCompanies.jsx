import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, LogIn, Plus, Unlock } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useDebounce } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { date, money, number } from '../../lib/format.js';
import { COMPANY_STATUS, UF } from '../../lib/constants.js';
import {
  Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, StatusBadge, Textarea, useListState, useToast,
} from '../../components/ui.jsx';

export const emptyCompany = {
  name: '', trade_name: '', document: '', phone: '', whatsapp: '', email: '', city: '', state: '',
  status: 'trial', plan_id: '', monthly_fee: '', billing_day: 10, trial_ends_at: '', blocked_reason: '',
};

const statusOptions = Object.entries(COMPANY_STATUS).map(([value, { label }]) => ({ value, label }));

/** Campos da ótica usados no cadastro e na edição pelo administrador da plataforma. */
export function CompanyFields({ values, set, plans = [], withOwner }) {
  const bind = (key) => ({ value: values[key] ?? '', onChange: (e) => set(key, e.target.value) });
  const choosePlan = (planId) => {
    set('plan_id', planId);
    const plan = plans.find((p) => String(p.id) === String(planId));
    if (plan && !Number(values.monthly_fee)) set('monthly_fee', plan.price);
  };
  return (
    <div className="form-grid">
      <Field label="Razão social *" className="c6">
        <Input required {...bind('name')} />
      </Field>
      <Field label="Nome fantasia" className="c6">
        <Input {...bind('trade_name')} />
      </Field>
      <Field label="CNPJ/CPF" className="c4">
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
      <Field label="Cidade" className="c4">
        <Input {...bind('city')} />
      </Field>
      <Field label="UF" className="c2">
        <Select placeholder="—" options={UF} {...bind('state')} />
      </Field>
      <div className="form-section">Assinatura</div>
      <Field label="Plano" className="c4">
        <Select placeholder="Sem plano" options={plans.map((p) => ({ value: p.id, label: `${p.name} · ${money(p.price)}` }))} value={values.plan_id ?? ''} onChange={(e) => choosePlan(e.target.value)} />
      </Field>
      <Field label="Mensalidade (R$)" className="c3">
        <Input inputMode="decimal" {...bind('monthly_fee')} />
      </Field>
      <Field label="Dia de vencimento" className="c2">
        <Input type="number" min="1" max="28" {...bind('billing_day')} />
      </Field>
      <Field label="Situação" className="c3">
        <Select options={statusOptions} {...bind('status')} />
      </Field>
      <Field label="Fim da avaliação" className="c4">
        <Input type="date" {...bind('trial_ends_at')} />
      </Field>
      {values.status === 'blocked' && (
        <Field label="Motivo do bloqueio (aparece para a ótica)" className="c8">
          <Input {...bind('blocked_reason')} />
        </Field>
      )}
      {withOwner && (
        <>
          <div className="form-section">Responsável (acesso inicial)</div>
          <Field label="Nome" className="c4">
            <Input {...bind('owner_name')} />
          </Field>
          <Field label="E-mail de acesso" className="c4" hint="Se o e-mail já existir, o usuário é vinculado à nova ótica.">
            <Input type="email" {...bind('owner_email')} />
          </Field>
          <Field label="Senha inicial" className="c4" hint="Mínimo de 8 caracteres">
            <Input type="text" autoComplete="new-password" {...bind('owner_password')} />
          </Field>
        </>
      )}
    </div>
  );
}

/** Bloqueio/liberação rápida com motivo. */
export function BlockModal({ company, onClose, onDone }) {
  const toast = useToast();
  const blocking = company?.status !== 'blocked';
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);
  if (!company) return null;
  const submit = async () => {
    setSaving(true);
    try {
      await api.patch('admin_companies', { only_status: true, status: blocking ? 'blocked' : status, blocked_reason: blocking ? reason : '' }, { id: company.id });
      toast.success(blocking ? 'Acesso bloqueado' : 'Acesso liberado');
      onDone();
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title={blocking ? `Bloquear ${company.name}` : `Liberar ${company.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant={blocking ? 'danger solid' : 'primary'} loading={saving} onClick={submit}>
            {blocking ? 'Bloquear acesso' : 'Liberar acesso'}
          </Button>
        </>
      }
    >
      {blocking ? (
        <Field label="Motivo (exibido para a ótica ao tentar entrar)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: mensalidade em atraso. Regularize para liberar o acesso." />
        </Field>
      ) : (
        <Field label="Nova situação">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={statusOptions.filter((o) => o.value !== 'blocked')} />
        </Field>
      )}
    </Modal>
  );
}

export default function AdminCompanies() {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounce(term);
  const list = useListState({ key: 'name', dir: 'asc' });
  const { data, loading, reload } = useApi('admin_companies', { ...list.params, q, status });
  const plans = useApi('admin_plans');
  const { selectCompany } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(null);
  const [saving, setSaving] = useState(false);
  const [blocking, setBlocking] = useState(null);

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api.post('admin_companies', creating);
      toast.success('Ótica cadastrada');
      setCreating(null);
      navigate(`/admin/oticas/${result.id}`);
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  const enter = async (company) => {
    try {
      await selectCompany(company.id);
      navigate('/');
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <div className="stack">
      <PageHeader
        title="Óticas"
        subtitle="Cadastre, libere ou bloqueie o acesso e acompanhe as assinaturas."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating({ ...emptyCompany })}>
            Nova ótica
          </Button>
        }
      />
      <Card bodyClass={null}>
        <div className="card-body filters">
          <SearchInput value={term} onChange={(v) => (setTerm(v), list.setPage(1))} placeholder="Buscar por nome ou CNPJ…" className="grow" />
          <Select className="sm" style={{ maxWidth: 180 }} value={status} onChange={(e) => (setStatus(e.target.value), list.setPage(1))} placeholder="Todas as situações" options={statusOptions} />
        </div>
        <DataTable
          loading={loading}
          rows={data?.data}
          sort={list.sort}
          onSort={list.toggleSort}
          onRowClick={(row) => navigate(`/admin/oticas/${row.id}`)}
          mobile={(r) => (
            <div className="grow">
              <div className="row between">
                <strong className="truncate">{r.trade_name || r.name}</strong>
                <StatusBadge map={COMPANY_STATUS} value={r.status} />
              </div>
              <div className="subtle">
                {[r.city, r.plan_name, money(r.monthly_fee)].filter(Boolean).join(' · ')}
                {r.overdue_invoices > 0 && ` · ${r.overdue_invoices} fatura(s) vencida(s)`}
              </div>
            </div>
          )}
          columns={[
            {
              key: 'name',
              label: 'Ótica',
              sortable: true,
              render: (r) => (
                <div>
                  <strong>{r.trade_name || r.name}</strong>
                  <div className="subtle">{[r.document, r.city && `${r.city}${r.state ? `/${r.state}` : ''}`].filter(Boolean).join(' · ')}</div>
                </div>
              ),
            },
            { key: 'status', label: 'Situação', sortable: true, render: (r) => <StatusBadge map={COMPANY_STATUS} value={r.status} /> },
            { key: 'plan_name', label: 'Plano', render: (r) => r.plan_name || <span className="subtle">—</span> },
            { key: 'monthly_fee', label: 'Mensalidade', className: 'num', render: (r) => money(r.monthly_fee) },
            { key: 'users_count', label: 'Usuários', className: 'num', render: (r) => number(r.users_count) },
            {
              key: 'overdue',
              label: 'Financeiro',
              render: (r) => (r.overdue_invoices > 0 ? <Badge tone="danger">{r.overdue_invoices} vencida(s)</Badge> : <Badge tone="success">Em dia</Badge>),
            },
            { key: 'created_at', label: 'Desde', sortable: true, render: (r) => date(r.created_at) },
            {
              key: 'actions',
              label: '',
              className: 'right',
              render: (r) => (
                <div className="row end" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" icon={LogIn} onClick={() => enter(r)} title="Acessar ótica">
                    Acessar
                  </Button>
                  <Button
                    size="sm"
                    variant={r.status === 'blocked' ? '' : 'danger'}
                    icon={r.status === 'blocked' ? Unlock : Ban}
                    onClick={() => setBlocking(r)}
                    title={r.status === 'blocked' ? 'Liberar' : 'Bloquear'}
                  />
                </div>
              ),
            },
          ]}
        />
        {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={list.setPage} />}
      </Card>

      <Modal
        open={Boolean(creating)}
        size="lg"
        title="Nova ótica"
        onClose={() => setCreating(null)}
        footer={
          <>
            <Button onClick={() => setCreating(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="company-create" loading={saving}>
              Cadastrar
            </Button>
          </>
        }
      >
        {creating && (
          <form id="company-create" onSubmit={create}>
            <CompanyFields values={creating} set={(k, v) => setCreating((c) => ({ ...c, [k]: v }))} plans={plans.data || []} withOwner />
          </form>
        )}
      </Modal>
      <BlockModal company={blocking} onClose={() => setBlocking(null)} onDone={() => (setBlocking(null), reload())} />
    </div>
  );
}
