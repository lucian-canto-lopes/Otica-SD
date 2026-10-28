import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, CheckCircle2, FilePlus2, Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { date, money, today } from '../../lib/format.js';
import { INVOICE_STATUS, PAYMENT_METHODS } from '../../lib/constants.js';
import {
  Badge, Button, Card, DataTable, Field, Input, Kpi, Modal, PageHeader, Pagination, Select, StatusBadge, useConfirm, useListState, useToast,
} from '../../components/ui.jsx';

const currentReference = () => today().slice(0, 7);

export default function AdminInvoices() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({ status: '', reference: '', company_id: searchParams.get('company') || '' });
  const list = useListState(null, 50);
  const { data, loading, reload } = useApi('admin_invoices', { ...list.params, ...filters });
  const companies = useApi('admin_companies', { per_page: 500 });
  const toast = useToast();
  const confirm = useConfirm();
  const [generating, setGenerating] = useState(null);
  const [creating, setCreating] = useState(null);
  const [paying, setPaying] = useState(null);
  const [busy, setBusy] = useState(false);

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    list.setPage(1);
  };

  const totals = useMemo(() => {
    const rows = data?.data || [];
    const todayIso = today();
    return rows.reduce(
      (acc, r) => {
        if (r.status === 'cancelled') return acc;
        acc.billed += Number(r.amount);
        if (r.status === 'paid') acc.paid += Number(r.amount);
        else if (r.due_date < todayIso) acc.overdue += Number(r.amount);
        else acc.open += Number(r.amount);
        return acc;
      },
      { billed: 0, paid: 0, open: 0, overdue: 0 },
    );
  }, [data]);

  const run = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      if (message) toast.success(message);
      reload();
      return true;
    } catch (error) {
      toast.error(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const result = await api.post('admin_invoices', { generate: true, reference: generating });
      toast.success(`${result.created} fatura(s) gerada(s)`);
      setGenerating(null);
      reload();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  };

  const update = (invoice, changes) =>
    api.patch('admin_invoices', { status: invoice.status, amount: invoice.amount, due_date: invoice.due_date, notes: invoice.notes, payment_method: invoice.payment_method, ...changes }, { id: invoice.id });

  const cancel = async (invoice) => {
    if (!(await confirm({ message: `Cancelar a fatura ${invoice.reference} de ${invoice.company_name}?`, danger: true, confirmLabel: 'Cancelar fatura' }))) return;
    run(() => update(invoice, { status: 'cancelled' }), 'Fatura cancelada');
  };

  const companyOptions = (companies.data?.data || []).map((c) => ({ value: c.id, label: c.trade_name || c.name }));

  return (
    <div className="stack">
      <PageHeader
        title="Financeiro"
        subtitle="Mensalidades das óticas: geração, recebimento e inadimplência."
        actions={
          <>
            <Button icon={Plus} onClick={() => setCreating({ company_id: '', reference: currentReference(), description: 'Mensalidade', amount: '', due_date: today(), notes: '' })}>
              Fatura avulsa
            </Button>
            <Button variant="primary" icon={FilePlus2} onClick={() => setGenerating(currentReference())}>
              Gerar mensalidades
            </Button>
          </>
        }
      />
      <div className="grid kpis">
        <Kpi label="Faturado (filtro)" value={money(totals.billed)} />
        <Kpi label="Recebido" value={money(totals.paid)} tone="success" icon={CheckCircle2} />
        <Kpi label="A vencer" value={money(totals.open)} />
        <Kpi label="Vencido" value={money(totals.overdue)} tone="danger" icon={Ban} />
      </div>
      <Card bodyClass={null}>
        <div className="card-body filters">
          <Select className="sm" style={{ maxWidth: 160 }} value={filters.status} onChange={(e) => setFilter('status', e.target.value)} placeholder="Todas as situações"
            options={[{ value: 'pending', label: 'Em aberto' }, { value: 'overdue', label: 'Vencidas' }, { value: 'paid', label: 'Pagas' }, { value: 'cancelled', label: 'Canceladas' }]} />
          <Input className="sm" type="month" style={{ maxWidth: 170 }} value={filters.reference} onChange={(e) => setFilter('reference', e.target.value)} title="Referência" />
          <Select className="sm" style={{ maxWidth: 240 }} value={filters.company_id} onChange={(e) => setFilter('company_id', e.target.value)} placeholder="Todas as óticas" options={companyOptions} />
        </div>
        <DataTable
          loading={loading}
          rows={data?.data}
          mobile={(r) => (
            <div className="grow">
              <div className="row between">
                <strong className="truncate">{r.company_name}</strong>
                <strong className="mono">{money(r.amount)}</strong>
              </div>
              <div className="subtle">
                {r.reference} · vence {date(r.due_date)} · {INVOICE_STATUS[r.status]?.label}
              </div>
            </div>
          )}
          columns={[
            { key: 'company_name', label: 'Ótica' },
            { key: 'reference', label: 'Referência' },
            { key: 'description', label: 'Descrição' },
            { key: 'due_date', label: 'Vencimento', render: (r) => date(r.due_date) },
            { key: 'amount', label: 'Valor', className: 'num', render: (r) => money(r.amount) },
            {
              key: 'status',
              label: 'Situação',
              render: (r) => (r.status === 'pending' && r.due_date < today() ? <Badge tone="danger">Vencida</Badge> : <StatusBadge map={INVOICE_STATUS} value={r.status} />),
            },
            { key: 'paid_at', label: 'Pago em', render: (r) => (r.paid_at ? `${date(r.paid_at)}${r.payment_method ? ` · ${PAYMENT_METHODS[r.payment_method] || r.payment_method}` : ''}` : '') },
            {
              key: 'actions',
              label: '',
              className: 'right',
              render: (r) =>
                r.status === 'pending' ? (
                  <div className="row end">
                    <Button size="sm" icon={CheckCircle2} onClick={() => setPaying({ ...r, paid_at: today(), payment_method: 'pix' })}>
                      Receber
                    </Button>
                    <Button size="sm" variant="ghost" icon={Ban} onClick={() => cancel(r)} title="Cancelar" />
                  </div>
                ) : null,
            },
          ]}
        />
        {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={list.setPage} />}
      </Card>

      <Modal
        open={Boolean(generating)}
        title="Gerar mensalidades"
        onClose={() => setGenerating(null)}
        footer={
          <>
            <Button onClick={() => setGenerating(null)}>Cancelar</Button>
            <Button variant="primary" loading={busy} onClick={generate}>
              Gerar
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="muted">Cria uma fatura para cada ótica ativa com mensalidade definida, no dia de vencimento configurado. Óticas que já têm fatura na referência são ignoradas.</p>
          <Field label="Referência">
            <Input type="month" value={generating || ''} onChange={(e) => setGenerating(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(creating)}
        title="Fatura avulsa"
        onClose={() => setCreating(null)}
        footer={
          <>
            <Button onClick={() => setCreating(null)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => (await run(() => api.post('admin_invoices', creating), 'Fatura criada')) && setCreating(null)}
            >
              Criar
            </Button>
          </>
        }
      >
        {creating && (
          <div className="form-grid">
            <Field label="Ótica *">
              <Select placeholder="Selecione" options={companyOptions} value={creating.company_id} onChange={(e) => setCreating((c) => ({ ...c, company_id: e.target.value }))} />
            </Field>
            <Field label="Referência" className="c6">
              <Input type="month" value={creating.reference} onChange={(e) => setCreating((c) => ({ ...c, reference: e.target.value }))} />
            </Field>
            <Field label="Vencimento" className="c6">
              <Input type="date" value={creating.due_date} onChange={(e) => setCreating((c) => ({ ...c, due_date: e.target.value }))} />
            </Field>
            <Field label="Descrição" className="c8">
              <Input value={creating.description} onChange={(e) => setCreating((c) => ({ ...c, description: e.target.value }))} />
            </Field>
            <Field label="Valor (R$)" className="c4">
              <Input inputMode="decimal" value={creating.amount} onChange={(e) => setCreating((c) => ({ ...c, amount: e.target.value }))} />
            </Field>
            <Field label="Observações">
              <Input value={creating.notes} onChange={(e) => setCreating((c) => ({ ...c, notes: e.target.value }))} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(paying)}
        title="Registrar recebimento"
        onClose={() => setPaying(null)}
        footer={
          <>
            <Button onClick={() => setPaying(null)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => (await run(() => update(paying, { status: 'paid', paid_at: paying.paid_at, payment_method: paying.payment_method }), 'Pagamento registrado')) && setPaying(null)}
            >
              Confirmar
            </Button>
          </>
        }
      >
        {paying && (
          <div className="form-grid">
            <p className="muted">
              {paying.company_name} · {paying.reference} · <strong>{money(paying.amount)}</strong>
            </p>
            <Field label="Data do pagamento" className="c6">
              <Input type="date" value={paying.paid_at} onChange={(e) => setPaying((p) => ({ ...p, paid_at: e.target.value }))} />
            </Field>
            <Field label="Forma" className="c6">
              <Select
                options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))}
                value={paying.payment_method}
                onChange={(e) => setPaying((p) => ({ ...p, payment_method: e.target.value }))}
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
