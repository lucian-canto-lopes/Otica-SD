import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Filter, Megaphone, PieChart, Plus, X } from 'lucide-react';
import { useApi, useDebounce } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import { date, money, MONTH_NAMES, phone, relativeDate } from '../../lib/format.js';
import { Badge, Button, Card, Checkbox, DataTable, Field, Input, PageHeader, Pagination, SearchInput, Select, TagChip, useListState, WhatsAppButton } from '../../components/ui.jsx';
import ClientForm from './ClientForm.jsx';

const FILTER_KEYS = ['kind', 'consent', 'birthday_window', 'birth_month', 'no_purchase_days', 'never_purchased', 'prescription_expiring_days', 'city', 'tags_any', 'age_min', 'age_max'];

export default function ClientsList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = useSession();
  const [term, setTerm] = useState(params.get('q') || '');
  const [showFilters, setShowFilters] = useState(() => FILTER_KEYS.some((k) => params.get(k)));
  const [creating, setCreating] = useState(false);
  const q = useDebounce(term, 300);
  const list = useListState({ key: 'name', dir: 'asc' });
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || undefined]).filter(([, v]) => v)), [params]);
  const { data, loading } = useApi('clients', { q, ...filters, ...list.params });
  const tags = useApi('tags').data || [];

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === '' || value === undefined || value === false) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
    list.setPage(1);
  };
  const activeCount = Object.keys(filters).length;

  const columns = [
    {
      key: 'name',
      label: 'Cliente',
      sortable: true,
      render: (c) => (
        <div className="stack sm" style={{ gap: 2 }}>
          <strong>{c.name}</strong>
          <div className="chips">
            {c.kind === 'lead' && <Badge tone="info">Contato</Badge>}
            {c.tags.slice(0, 3).map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
          </div>
        </div>
      ),
    },
    { key: 'whatsapp', label: 'WhatsApp', render: (c) => <span className="nowrap">{phone(c.whatsapp || c.phone)}</span> },
    { key: 'city', label: 'Cidade', render: (c) => c.city || '—' },
    { key: 'birth_date', label: 'Aniversário', sortable: true, render: (c) => (c.birth_date ? date(c.birth_date).slice(0, 5) : '—') },
    { key: 'last_purchase', label: 'Última compra', sortable: true, render: (c) => (c.last_purchase ? relativeDate(c.last_purchase) : <span className="subtle">nunca</span>) },
    { key: 'total_spent', label: 'Total comprado', sortable: true, className: 'num', render: (c) => money(c.total_spent) },
    {
      key: 'actions',
      label: '',
      className: 'right',
      render: (c) => (c.whatsapp ? <WhatsAppButton phone={c.whatsapp} label="" /> : null),
    },
  ];

  return (
    <div className="stack">
      <PageHeader
        title="Clientes"
        subtitle={data ? `${data.total.toLocaleString('pt-BR')} encontrados` : ' '}
        actions={
          <>
            <Button icon={PieChart} onClick={() => navigate('/clientes/painel')} className="hidden-mobile">
              Visão da carteira
            </Button>
            {activeCount > 0 && (
              <Button icon={Megaphone} onClick={() => navigate('/campanhas/nova', { state: { audience: { ...filters, q: q || undefined }, name: 'Campanha para clientes filtrados' } })}>
                Campanha com este filtro
              </Button>
            )}
            {can('sell') && (
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                Novo cliente
              </Button>
            )}
          </>
        }
      />
      <div className="row wrap">
        <SearchInput className="grow" value={term} onChange={(v) => (setTerm(v), list.setPage(1))} placeholder="Nome, CPF, telefone ou e-mail…" />
        <Button icon={Filter} onClick={() => setShowFilters((s) => !s)}>
          Filtros{activeCount ? ` (${activeCount})` : ''}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" icon={X} onClick={() => setParams({}, { replace: true })}>
            Limpar
          </Button>
        )}
      </div>
      {showFilters && (
        <Card>
          <div className="filter-panel">
            <Field label="Tipo">
              <Select value={filters.kind || ''} onChange={(e) => setFilter('kind', e.target.value)} placeholder="Todos" options={[{ value: 'client', label: 'Clientes' }, { value: 'lead', label: 'Contatos/leads' }]} />
            </Field>
            <Field label="Etiqueta">
              <Select value={filters.tags_any || ''} onChange={(e) => setFilter('tags_any', e.target.value)} placeholder="Todas" options={tags.map((t) => ({ value: t.id, label: t.name }))} />
            </Field>
            <Field label="Aniversário">
              <Select
                value={filters.birthday_window || ''}
                onChange={(e) => setFilter('birthday_window', e.target.value)}
                placeholder="Qualquer data"
                options={[{ value: 'today', label: 'Hoje' }, { value: 'week', label: 'Próximos 7 dias' }, { value: 'this_month', label: 'Este mês' }, { value: 'next_30', label: 'Próximos 30 dias' }]}
              />
            </Field>
            <Field label="Mês de aniversário">
              <Select value={filters.birth_month || ''} onChange={(e) => setFilter('birth_month', e.target.value)} placeholder="Todos" options={MONTH_NAMES.map((m, i) => ({ value: i + 1, label: m }))} />
            </Field>
            <Field label="Sem comprar há">
              <Select
                value={filters.no_purchase_days || ''}
                onChange={(e) => setFilter('no_purchase_days', e.target.value)}
                placeholder="—"
                options={[{ value: 180, label: '6 meses' }, { value: 365, label: '1 ano' }, { value: 540, label: '1 ano e meio' }, { value: 730, label: '2 anos' }]}
              />
            </Field>
            <Field label="Receita vencendo em">
              <Select value={filters.prescription_expiring_days || ''} onChange={(e) => setFilter('prescription_expiring_days', e.target.value)} placeholder="—" options={[{ value: 15, label: '15 dias' }, { value: 30, label: '30 dias' }, { value: 60, label: '60 dias' }]} />
            </Field>
            <Field label="Idade">
              <div className="row">
                <Input type="number" placeholder="de" value={filters.age_min || ''} onChange={(e) => setFilter('age_min', e.target.value)} />
                <Input type="number" placeholder="até" value={filters.age_max || ''} onChange={(e) => setFilter('age_max', e.target.value)} />
              </div>
            </Field>
            <Field label="Cidade">
              <Input value={filters.city || ''} onChange={(e) => setFilter('city', e.target.value)} />
            </Field>
            <div className="stack sm" style={{ justifyContent: 'flex-end' }}>
              <Checkbox label="Aceita mensagens" checked={filters.consent === '1'} onChange={(e) => setFilter('consent', e.target.checked ? '1' : '')} />
              <Checkbox label="Nunca comprou" checked={filters.never_purchased === '1'} onChange={(e) => setFilter('never_purchased', e.target.checked ? '1' : '')} />
            </div>
          </div>
        </Card>
      )}
      <Card bodyClass={null}>
        <DataTable
          columns={columns}
          rows={data?.data}
          loading={loading}
          sort={list.sort}
          onSort={list.toggleSort}
          onRowClick={(c) => navigate(`/clientes/${c.id}`)}
          mobile={(c) => (
            <>
              <div className="avatar">{c.name[0]}</div>
              <div className="grow">
                <strong className="truncate" style={{ display: 'block' }}>
                  {c.name}
                </strong>
                <span className="subtle">
                  {phone(c.whatsapp || c.phone)} {c.last_purchase && `· última compra ${relativeDate(c.last_purchase)}`}
                </span>
              </div>
              {c.whatsapp && <WhatsAppButton phone={c.whatsapp} label="" />}
            </>
          )}
        />
        {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={list.setPage} />}
      </Card>
      <ClientForm open={creating} onClose={() => setCreating(false)} onSaved={(c) => navigate(`/clientes/${c.id}`)} />
    </div>
  );
}
