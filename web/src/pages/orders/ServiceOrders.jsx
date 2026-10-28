import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Columns3, List, Plus, Printer } from 'lucide-react';
import { api, pdfUrl } from '../../lib/api.js';
import { invalidate, useApi, useDebounce } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { date, relativeDate } from '../../lib/format.js';
import { ORDER_FLOW, ORDER_STATUS } from '../../lib/constants.js';
import { Badge, Button, Card, Checkbox, DataTable, PageHeader, Pagination, SearchInput, Select, StatusBadge, useListState, useToast } from '../../components/ui.jsx';

export default function ServiceOrders() {
  const navigate = useNavigate();
  const { can } = useSession();
  const toast = useToast();
  const [view, setView] = useState(() => (window.innerWidth < 860 ? 'list' : 'board'));
  const [term, setTerm] = useState('');
  const [lab, setLab] = useState('');
  const [late, setLate] = useState(false);
  const [showDelivered, setShowDelivered] = useState(false);
  const [dragging, setDragging] = useState(null);
  const q = useDebounce(term, 300);
  const list = useListState({ key: 'number', dir: 'desc' }, view === 'board' ? 500 : 25);
  const labs = useApi('partners', { type: 'laboratory', per_page: 200 }).data?.data || [];
  const { data, loading, reload } = useApi('service_orders', {
    q,
    laboratory_id: lab,
    late: late ? 1 : undefined,
    open: view === 'board' && !showDelivered ? 1 : undefined,
    ...list.params,
  });
  const orders = data?.data || [];

  const move = async (order, status) => {
    if (!status || order.status === status) return;
    try {
      await api.patch('service_orders', { action: 'status', status }, { id: order.id });
      toast.success(`OS nº ${order.number}: ${ORDER_STATUS[status].label}`);
      invalidate('service_orders');
      reload();
    } catch (error) {
      toast.error(error);
    }
  };

  const columns = ORDER_FLOW.filter((s) => showDelivered || s !== 'delivered');

  return (
    <div className="stack">
      <PageHeader
        title="Ordens de serviço"
        subtitle="Acompanhamento do laboratório e da montagem"
        actions={
          <>
            <Button icon={view === 'board' ? List : Columns3} onClick={() => setView(view === 'board' ? 'list' : 'board')}>
              {view === 'board' ? 'Lista' : 'Quadro'}
            </Button>
            {can('service') && (
              <Button variant="primary" icon={Plus} onClick={() => navigate('/os/nova')}>
                Nova OS
              </Button>
            )}
          </>
        }
      />
      <div className="filters">
        <SearchInput className="grow" value={term} onChange={setTerm} placeholder="Cliente, nº da OS ou armação…" />
        <Select value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Todos os laboratórios" options={labs.map((l) => ({ value: l.id, label: l.name }))} style={{ maxWidth: 220 }} />
        <Checkbox label="Somente atrasadas" checked={late} onChange={(e) => setLate(e.target.checked)} />
        {view === 'board' && <Checkbox label="Mostrar entregues" checked={showDelivered} onChange={(e) => setShowDelivered(e.target.checked)} />}
      </div>
      {view === 'board' ? (
        <div className="kanban">
          {columns.map((status) => {
            const items = orders.filter((o) => o.status === status);
            return (
              <div
                key={status}
                className="kanban-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragging) move(dragging, status);
                  setDragging(null);
                }}
              >
                <div className="row between">
                  <strong style={{ fontSize: 13 }}>{ORDER_STATUS[status].label}</strong>
                  <Badge>{items.length}</Badge>
                </div>
                {items.map((order) => {
                  const next = ORDER_FLOW[ORDER_FLOW.indexOf(order.status) + 1];
                  return (
                    <div
                      key={order.id}
                      className={`kanban-card ${Number(order.is_late) ? 'late' : ''}`}
                      draggable={can('service')}
                      onDragStart={() => setDragging(order)}
                      onClick={() => navigate(`/os/${order.id}`)}
                    >
                      <div className="row between">
                        <strong>OS {order.number}</strong>
                        {Number(order.is_late) ? (
                          <span className="badge danger">
                            <AlertTriangle size={11} /> atrasada
                          </span>
                        ) : (
                          order.promised_date && <span className="subtle">{relativeDate(order.promised_date)}</span>
                        )}
                      </div>
                      <span className="truncate">{order.client_name}</span>
                      {order.frame_description && <span className="subtle truncate">{order.frame_description}</span>}
                      {order.laboratory_name && <span className="subtle truncate">🔬 {order.laboratory_name}</span>}
                      {can('service') && next && (
                        <Button size="sm" variant="ghost" onClick={(e) => (e.stopPropagation(), move(order, next))} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>
                          → {ORDER_STATUS[next].label}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <Card bodyClass={null}>
          <DataTable
            rows={orders}
            loading={loading}
            sort={list.sort}
            onSort={list.toggleSort}
            onRowClick={(o) => navigate(`/os/${o.id}`)}
            columns={[
              { key: 'number', label: 'Nº', sortable: true, render: (o) => <strong>{o.number}</strong> },
              { key: 'created_at', label: 'Abertura', sortable: true, render: (o) => date(o.created_at) },
              { key: 'client_name', label: 'Cliente' },
              { key: 'laboratory_name', label: 'Laboratório', render: (o) => o.laboratory_name || '—' },
              { key: 'status', label: 'Etapa', render: (o) => <StatusBadge map={ORDER_STATUS} value={o.status} /> },
              { key: 'promised_date', label: 'Previsão', sortable: true, render: (o) => <span style={{ color: Number(o.is_late) ? 'var(--danger)' : undefined }}>{date(o.promised_date) || '—'}</span> },
              { key: 'sale_number', label: 'Venda', render: (o) => (o.sale_number ? `nº ${o.sale_number}` : 'Avulsa') },
              {
                key: 'print',
                label: '',
                render: (o) => (
                  <a className="btn ghost icon sm" href={pdfUrl('service_order', o.id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Imprimir OS">
                    <Printer size={15} />
                  </a>
                ),
              },
            ]}
            mobile={(o) => (
              <>
                <div className="grow">
                  <strong>
                    OS {o.number} · {o.client_name}
                  </strong>
                  <div className="subtle">{o.promised_date ? `previsão ${date(o.promised_date)}` : ''}</div>
                </div>
                <StatusBadge map={ORDER_STATUS} value={o.status} />
              </>
            )}
          />
          {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={list.setPage} />}
        </Card>
      )}
    </div>
  );
}
