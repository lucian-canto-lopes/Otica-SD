import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Printer } from 'lucide-react';
import { pdfUrl } from '../../lib/api.js';
import { useApi, useDebounce } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { date, money, phone } from '../../lib/format.js';
import { QUOTE_STATUS } from '../../lib/constants.js';
import { Button, Card, DataTable, PageHeader, Pagination, SearchInput, StatusBadge, Tabs, useListState, WhatsAppButton } from '../../components/ui.jsx';

export default function Quotes() {
  const navigate = useNavigate();
  const { can } = useSession();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounce(term, 300);
  const list = useListState({ key: 'quote_date', dir: 'desc' });
  const { data, loading } = useApi('quotes', { q, status, ...list.params });
  const counts = Object.fromEntries((data?.summary || []).map((s) => [s.status, s]));

  return (
    <div className="stack">
      <PageHeader title="Orçamentos" actions={can('sell') && <Button variant="primary" icon={Plus} onClick={() => navigate('/orcamentos/novo')}>Novo orçamento</Button>} />
      <Tabs
        active={status}
        onChange={(s) => (setStatus(s), list.setPage(1))}
        tabs={[{ key: '', label: 'Todos' }, ...['open', 'sent', 'approved', 'converted', 'lost'].map((key) => ({ key, label: QUOTE_STATUS[key].label, count: status ? undefined : counts[key]?.count }))]}
      />
      <SearchInput value={term} onChange={(v) => (setTerm(v), list.setPage(1))} placeholder="Cliente ou número…" />
      <Card bodyClass={null}>
        <DataTable
          rows={data?.data}
          loading={loading}
          sort={list.sort}
          onSort={list.toggleSort}
          onRowClick={(row) => navigate(`/orcamentos/${row.id}`)}
          columns={[
            { key: 'number', label: 'Nº', sortable: true, render: (r) => <strong>{r.number}</strong> },
            { key: 'quote_date', label: 'Data', sortable: true, render: (r) => date(r.quote_date) },
            { key: 'client_name', label: 'Cliente', render: (r) => (<div>{r.client_name}<div className="subtle">{phone(r.client_whatsapp)}</div></div>) },
            { key: 'seller_name', label: 'Vendedor', render: (r) => r.seller_name || '—' },
            { key: 'status', label: 'Situação', render: (r) => (<div className="stack sm" style={{ gap: 2 }}><StatusBadge map={QUOTE_STATUS} value={r.status} />{r.loss_reason && <span className="subtle">{r.loss_reason}</span>}</div>) },
            { key: 'valid_until', label: 'Validade', render: (r) => date(r.valid_until) },
            { key: 'total', label: 'Total', sortable: true, className: 'num', render: (r) => money(r.total) },
            {
              key: 'actions',
              label: '',
              render: (r) => (
                <div className="row" onClick={(e) => e.stopPropagation()}>
                  <a className="btn ghost icon sm" href={pdfUrl('quote', r.id)} target="_blank" rel="noreferrer" title="Imprimir">
                    <Printer size={15} />
                  </a>
                  {['open', 'sent', 'approved'].includes(r.status) && <WhatsAppButton phone={r.client_whatsapp} label="" />}
                </div>
              ),
            },
          ]}
          mobile={(r) => (
            <>
              <div className="grow">
                <strong className="truncate" style={{ display: 'block' }}>
                  {r.client_name}
                </strong>
                <span className="subtle">
                  nº {r.number} · {date(r.quote_date)}
                </span>
              </div>
              <div className="stack sm" style={{ alignItems: 'flex-end' }}>
                <strong className="mono">{money(r.total)}</strong>
                <StatusBadge map={QUOTE_STATUS} value={r.status} />
              </div>
            </>
          )}
        />
        {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={list.setPage} />}
      </Card>
    </div>
  );
}
