import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Printer } from 'lucide-react';
import { pdfUrl } from '../../lib/api.js';
import { useApi, useDebounce } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { date, money, monthStart, number, today } from '../../lib/format.js';
import { SALE_STATUS } from '../../lib/constants.js';
import { Badge, Button, Card, Checkbox, DataTable, Field, Input, Kpi, PageHeader, Pagination, SearchInput, Select, StatusBadge, useListState } from '../../components/ui.jsx';

export default function Sales() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { can } = useSession();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(params.get('balance') ? '' : monthStart(0));
  const [to, setTo] = useState(params.get('balance') ? '' : today());
  const [balance, setBalance] = useState(params.get('balance') === '1');
  const q = useDebounce(term, 300);
  const list = useListState({ key: 'sale_date', dir: 'desc' });
  const { data, loading } = useApi('sales', { q, status, from, to, balance: balance ? 1 : undefined, ...list.params });
  const summary = data?.summary;

  return (
    <div className="stack">
      <PageHeader
        title="Vendas"
        actions={can('sell') && <Button variant="primary" icon={Plus} onClick={() => navigate('/vendas/nova')}>Nova venda</Button>}
      />
      <div className="filters">
        <SearchInput className="grow" value={term} onChange={(v) => (setTerm(v), list.setPage(1))} placeholder="Cliente, CPF ou número do pedido…" />
        <Field>
          <Input type="date" value={from} onChange={(e) => (setFrom(e.target.value), list.setPage(1))} />
        </Field>
        <Field>
          <Input type="date" value={to} onChange={(e) => (setTo(e.target.value), list.setPage(1))} />
        </Field>
        <Select value={status} onChange={(e) => (setStatus(e.target.value), list.setPage(1))} placeholder="Todas as situações" options={Object.entries(SALE_STATUS).map(([value, s]) => ({ value, label: s.label }))} style={{ maxWidth: 190 }} />
        <Checkbox label="Com saldo a receber" checked={balance} onChange={(e) => (setBalance(e.target.checked), list.setPage(1))} />
      </div>
      {summary && (
        <div className="grid kpis">
          <Kpi label="Vendas" value={number(summary.count)} />
          <Kpi label="Total vendido" value={money(summary.total)} />
          <Kpi label="Recebido" value={money(summary.paid)} />
          <Kpi label="A receber" value={money(Number(summary.total) - Number(summary.paid))} />
        </div>
      )}
      <Card bodyClass={null}>
        <DataTable
          rows={data?.data}
          loading={loading}
          sort={list.sort}
          onSort={list.toggleSort}
          onRowClick={(s) => navigate(`/vendas/${s.id}`)}
          columns={[
            { key: 'number', label: 'Nº', sortable: true, render: (s) => <strong>{s.number}</strong> },
            { key: 'sale_date', label: 'Data', sortable: true, render: (s) => date(s.sale_date) },
            { key: 'client', label: 'Cliente', sortable: true, render: (s) => s.client_name || <span className="subtle">Consumidor</span> },
            { key: 'seller_name', label: 'Vendedor', render: (s) => s.seller_name || '—' },
            { key: 'status', label: 'Situação', render: (s) => (<div className="row"><StatusBadge map={SALE_STATUS} value={s.status} />{Number(s.orders_count) > 0 && <Badge>OS</Badge>}</div>) },
            { key: 'total', label: 'Total', sortable: true, className: 'num', render: (s) => money(s.total) },
            {
              key: 'balance',
              label: 'Saldo',
              className: 'num',
              render: (s) => (Number(s.total) - Number(s.paid) > 0.009 && s.status !== 'cancelled' ? <span style={{ color: 'var(--danger)' }}>{money(Number(s.total) - Number(s.paid))}</span> : '—'),
            },
            {
              key: 'print',
              label: '',
              render: (s) => (
                <a className="btn ghost icon sm" href={pdfUrl('sale', s.id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Imprimir pedido">
                  <Printer size={15} />
                </a>
              ),
            },
          ]}
          mobile={(s) => (
            <>
              <div className="grow">
                <strong className="truncate" style={{ display: 'block' }}>
                  {s.client_name || 'Consumidor'}
                </strong>
                <span className="subtle">
                  nº {s.number} · {date(s.sale_date)}
                </span>
              </div>
              <div className="stack sm" style={{ alignItems: 'flex-end' }}>
                <strong className="mono">{money(s.total)}</strong>
                {s.status !== 'completed' && <StatusBadge map={SALE_STATUS} value={s.status} />}
              </div>
            </>
          )}
        />
        {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={list.setPage} />}
      </Card>
    </div>
  );
}
