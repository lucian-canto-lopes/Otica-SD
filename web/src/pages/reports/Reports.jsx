import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Download, FolderOpen, Megaphone, Play, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api, downloadPost } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { date, dateTime, money, monthStart, number, phone, today } from '../../lib/format.js';
import { useSession } from '../../lib/session.jsx';
import { CHANNEL_LABELS, ORDER_STATUS, PAYMENT_METHODS, QUOTE_STATUS, SALE_STATUS } from '../../lib/constants.js';
import { Button, Card, Checkbox, Empty, Field, Input, Loading, Modal, PageHeader, Select, useConfirm, useToast } from '../../components/ui.jsx';
import { HBars } from '../../components/charts.jsx';
import AudienceFilters, { cleanFilters } from '../crm/AudienceFilters.jsx';

const toOptions = (map) => Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }));

function formatCell(value, type) {
  if (value === null || value === undefined || value === '') return <span className="subtle">—</span>;
  switch (type) {
    case 'money':
      return money(value);
    case 'number':
      return number(value);
    case 'date':
      return date(value);
    case 'datetime':
      return dateTime(value);
    case 'bool':
      return Number(value) ? 'Sim' : 'Não';
    case 'phone':
      return phone(value);
    default:
      return String(value);
  }
}

/** Filtros específicos de cada tipo de relatório (os mesmos aceitos por buildReportQuery). */
function EntityFilters({ entity, filters, set }) {
  const team = useApi('team');
  const reasons = useApi(['quotes', 'lost'].includes(entity) ? 'loss_reasons' : null, {}, { enabled: ['quotes', 'lost'].includes(entity) });
  const labs = useApi(entity === 'service_orders' ? 'partners' : null, { type: 'laboratory', per_page: 200 }, { enabled: entity === 'service_orders' });
  const suppliers = useApi(entity === 'products' ? 'partners' : null, { type: 'supplier', per_page: 500 }, { enabled: entity === 'products' });
  const campaigns = useApi(entity === 'interactions' ? 'campaigns' : null, { per_page: 100 }, { enabled: entity === 'interactions' });
  const products = useApi(['products', 'sale_items'].includes(entity) ? 'products' : null, { per_page: 1, with_meta: 1 }, { enabled: ['products', 'sale_items'].includes(entity) });
  const bind = (key) => ({ value: filters[key] ?? '', onChange: (e) => set(key, e.target.value) });
  const teamOptions = (team.data || []).map((u) => ({ value: u.id, label: u.name }));
  const categories = (products.data?.categories || []).map((c) => ({ value: c, label: c }));

  switch (entity) {
    case 'sales':
      return (
        <>
          <Field label="Situação"><Select placeholder="Concluídas e em aberto" {...bind('status')} options={toOptions(SALE_STATUS)} /></Field>
          <Field label="Vendedor"><Select placeholder="Todos" {...bind('seller_id')} options={teamOptions} /></Field>
        </>
      );
    case 'quotes':
      return (
        <>
          <Field label="Situação"><Select placeholder="Todas" {...bind('status')} options={toOptions(QUOTE_STATUS)} /></Field>
          <Field label="Vendedor"><Select placeholder="Todos" {...bind('seller_id')} options={teamOptions} /></Field>
          <Field label="Motivo da perda"><Select placeholder="Todos" {...bind('loss_reason_id')} options={(reasons.data || []).map((r) => ({ value: r.id, label: r.name }))} /></Field>
        </>
      );
    case 'service_orders':
      return (
        <>
          <Field label="Etapa"><Select placeholder="Todas" {...bind('status')} options={toOptions(ORDER_STATUS)} /></Field>
          <Field label="Laboratório"><Select placeholder="Todos" {...bind('laboratory_id')} options={(labs.data?.data || []).map((p) => ({ value: p.id, label: p.name }))} /></Field>
          <div style={{ alignSelf: 'end' }}><Checkbox label="Somente atrasadas" checked={Boolean(filters.late)} onChange={(e) => set('late', e.target.checked ? 1 : '')} /></div>
        </>
      );
    case 'interactions':
      return (
        <>
          <Field label="Canal"><Select placeholder="Todos" {...bind('channel')} options={toOptions(CHANNEL_LABELS)} /></Field>
          <Field label="Atendente"><Select placeholder="Todos" {...bind('user_id')} options={teamOptions} /></Field>
          <Field label="Campanha"><Select placeholder="Todas" {...bind('campaign_id')} options={(campaigns.data?.data || []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
        </>
      );
    case 'lost':
      return (
        <>
          <Field label="Motivo"><Select placeholder="Todos" {...bind('reason_id')} options={(reasons.data || []).map((r) => ({ value: r.id, label: r.name }))} /></Field>
          <Field label="Atendente"><Select placeholder="Todos" {...bind('user_id')} options={teamOptions} /></Field>
        </>
      );
    case 'products':
      return (
        <>
          <Field label="Categoria"><Select placeholder="Todas" {...bind('category')} options={categories} /></Field>
          <Field label="Fornecedor"><Select placeholder="Todos" {...bind('supplier_id')} options={(suppliers.data?.data || []).map((p) => ({ value: p.id, label: p.name }))} /></Field>
          <Field label="Marca"><Input {...bind('brand')} /></Field>
          <div style={{ alignSelf: 'end' }}><Checkbox label="Somente estoque baixo" checked={Boolean(filters.low_stock)} onChange={(e) => set('low_stock', e.target.checked ? 1 : '')} /></div>
        </>
      );
    case 'sale_items':
      return (
        <>
          <Field label="Categoria"><Select placeholder="Todas" {...bind('category')} options={categories} /></Field>
          <Field label="Marca"><Input {...bind('brand')} /></Field>
          <Field label="Descrição contém"><Input {...bind('description')} placeholder="Ex.: multifocal" /></Field>
        </>
      );
    case 'payments':
      return (
        <>
          <Field label="Forma"><Select placeholder="Todas" {...bind('method')} options={toOptions(PAYMENT_METHODS)} /></Field>
          <Field label="Situação"><Select placeholder="Todas" {...bind('situation')} options={[{ value: 'paid', label: 'Pagas' }, { value: 'open', label: 'Em aberto' }, { value: 'overdue', label: 'Vencidas' }]} /></Field>
        </>
      );
    default:
      return null;
  }
}

export default function Reports() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const meta = useApi('reports');
  const saved = useApi('saved_reports');
  const [entity, setEntity] = useState('sales');
  const [filters, setFilters] = useState({ date_from: monthStart(), date_to: today() });
  const [clientFilters, setClientFilters] = useState({});
  const [columns, setColumns] = useState([]);
  const [groupBy, setGroupBy] = useState('');
  const [sort, setSort] = useState({ key: '', dir: 'asc' });
  const [showClient, setShowClient] = useState(false);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [savingOpen, setSavingOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [name, setName] = useState('');

  const info = meta.data?.[entity];
  useEffect(() => {
    if (info && !columns.length) setColumns(Object.keys(info.columns).slice(0, 6));
  }, [info, columns.length]);

  const definition = useMemo(() => {
    const entityFilters = cleanFilters(filters);
    if (entity === 'sales' && entityFilters.status === 'cancelled') entityFilters.include_cancelled = 1;
    const client = cleanFilters(clientFilters);
    return {
      entity,
      filters: entity === 'clients' ? { ...entityFilters, ...client } : { ...entityFilters, ...(Object.keys(client).length ? { client } : {}) },
      columns,
      group_by: groupBy,
      sort: sort.key,
      dir: sort.dir,
    };
  }, [entity, filters, clientFilters, columns, groupBy, sort]);

  const run = async (def = definition) => {
    setRunning(true);
    try {
      setResult(await api.post('reports', { ...def, limit: 2000 }));
    } catch (error) {
      toast.error(error);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (meta.data) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.data, sort]);

  const changeEntity = (next) => {
    setEntity(next);
    setColumns(Object.keys(meta.data[next].columns).slice(0, 6));
    // Em clientes o período filtra a data de cadastro; por padrão a carteira inteira.
    setFilters((f) => (next === 'clients' ? {} : { date_from: f.date_from || monthStart(), date_to: f.date_to || today() }));
    setGroupBy('');
    setSort({ key: '', dir: 'asc' });
    setResult(null);
  };

  const loadSaved = (report) => {
    const def = report.definition || {};
    const f = { ...(def.filters || {}) };
    const client = f.client || {};
    delete f.client;
    setEntity(def.entity || 'clients');
    setFilters(def.entity === 'clients' ? { date_from: f.date_from || '', date_to: f.date_to || '' } : f);
    setClientFilters(def.entity === 'clients' ? f : client);
    setColumns(def.columns || []);
    setGroupBy(def.group_by || '');
    setName(report.name);
    setLoadOpen(false);
    run(def);
  };

  const saveReport = async () => {
    try {
      await api.post('saved_reports', { name, definition });
      toast.success('Relatório salvo');
      setSavingOpen(false);
      saved.reload();
    } catch (error) {
      toast.error(error);
    }
  };

  const createCampaign = async () => {
    try {
      if (entity === 'clients') {
        navigate('/campanhas/nova', { state: { audience: cleanFilters({ ...filters, ...clientFilters, date_from: undefined, date_to: undefined, created_from: filters.date_from, created_to: filters.date_to }), name } });
        return;
      }
      const response = await api.post('reports', { ...definition, action: 'client_ids' });
      if (!response.count) {
        toast.info('Nenhum cliente encontrado neste relatório.');
        return;
      }
      navigate('/campanhas/nova', { state: { audience: { ids: response.ids }, name: name ? `Campanha · ${name}` : '' } });
    } catch (error) {
      toast.error(error);
    }
  };

  if (meta.loading && !meta.data) return <Loading />;
  if (!info) return <Empty title="Relatórios indisponíveis" />;
  const toggleColumn = (key) => setColumns((cols) => (cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]));
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clientFilterCount = Object.keys(cleanFilters(clientFilters)).length;

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle="Monte relatórios cruzando clientes, vendas, orçamentos, atendimentos e campanhas — e transforme o resultado em campanha."
        actions={
          <>
            <Button icon={FolderOpen} onClick={() => setLoadOpen(true)}>Abrir salvo{saved.data?.length ? ` (${saved.data.length})` : ''}</Button>
            {can('crm') && <Button icon={Save} onClick={() => setSavingOpen(true)}>Salvar</Button>}
          </>
        }
      />
      <Card style={{ marginBottom: 16 }}>
        <div className="stack">
          <div className="filter-panel">
            <Field label="Relatório de">
              <Select value={entity} onChange={(e) => changeEntity(e.target.value)} options={Object.entries(meta.data).map(([value, m]) => ({ value, label: m.label }))} />
            </Field>
            <Field label="De"><Input type="date" value={filters.date_from || ''} onChange={(e) => setFilter('date_from', e.target.value)} /></Field>
            <Field label="Até"><Input type="date" value={filters.date_to || ''} onChange={(e) => setFilter('date_to', e.target.value)} /></Field>
            <EntityFilters entity={entity} filters={filters} set={setFilter} />
            <Field label="Agrupar por">
              <Select placeholder="Sem agrupamento (lista)" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} options={Object.entries(info.groups).map(([value, label]) => ({ value, label }))} />
            </Field>
          </div>
          {(info.has_client || entity === 'clients') && (
            <div>
              <Button size="sm" variant="ghost" icon={SlidersHorizontal} onClick={() => setShowClient((s) => !s)}>
                {entity === 'clients' ? 'Filtros de clientes' : 'Filtrar pelos dados do cliente'}
                {clientFilterCount ? ` (${clientFilterCount})` : ''}
              </Button>
              {showClient && (
                <div className="card card-body" style={{ marginTop: 8, background: 'var(--surface-2)' }}>
                  <AudienceFilters value={clientFilters} onChange={setClientFilters} />
                  {clientFilterCount > 0 && <Button size="sm" style={{ marginTop: 10 }} onClick={() => setClientFilters({})}>Limpar filtros de cliente</Button>}
                </div>
              )}
            </div>
          )}
          {!groupBy && (
            <Field label="Colunas">
              <div className="chips">
                {Object.entries(info.columns).map(([key, col]) => (
                  <button key={key} type="button" className={`chip ${columns.includes(key) ? 'active' : ''}`} onClick={() => toggleColumn(key)}>{col.label}</button>
                ))}
              </div>
            </Field>
          )}
          <div className="row wrap end">
            {(info.has_client || entity === 'clients') && can('crm') && <Button icon={Megaphone} onClick={createCampaign}>Criar campanha com este público</Button>}
            <Button icon={Download} onClick={() => downloadPost('reports', { ...definition, format: 'csv' }, `relatorio-${entity}.csv`).catch((e) => toast.error(e))}>Exportar CSV</Button>
            <Button variant="primary" icon={Play} loading={running} onClick={() => run()}>Gerar relatório</Button>
          </div>
        </div>
      </Card>

      {running && !result && <Loading />}
      {result && (
        <Card
          title={<h3>{info.label} · {number(result.total)} {result.grouped ? 'grupo(s)' : 'registro(s)'}{result.sum !== null && result.sum !== undefined && !result.grouped ? ` · total ${money(result.sum)}` : ''}</h3>}
          bodyClass={null}
        >
          {result.grouped ? (
            <div className="grid cols-2" style={{ padding: 16 }}>
              <HBars data={result.rows.slice(0, 15).map((r) => ({ label: groupLabel(r.label, groupBy), total: Number(r.total ?? r.count) }))} format={result.columns.some((c) => c.key === 'total') ? money : number} />
              <ResultTable result={{ ...result, rows: result.rows.map((r) => ({ ...r, label: groupLabel(r.label, groupBy) })) }} />
            </div>
          ) : result.rows.length ? (
            <ResultTable
              result={result}
              sort={sort}
              onSort={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
              onRow={(row) => row._client_id && navigate(`/clientes/${row._client_id}`)}
            />
          ) : (
            <Empty icon={BarChart3} title="Nenhum resultado com esses filtros" />
          )}
          {!result.grouped && result.total > result.rows.length && (
            <div className="pagination"><span className="subtle">Mostrando {number(result.rows.length)} de {number(result.total)}. Exporte em CSV para ver todos.</span></div>
          )}
        </Card>
      )}

      <Modal open={savingOpen} title="Salvar relatório" onClose={() => setSavingOpen(false)} footer={<><Button onClick={() => setSavingOpen(false)}>Cancelar</Button><Button variant="primary" disabled={!name} onClick={saveReport}>Salvar</Button></>}>
        <Field label="Nome" hint="Relatórios salvos podem ser usados como público de campanhas."><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Clientes multifocal sem comprar há 1 ano" /></Field>
      </Modal>
      <Modal open={loadOpen} title="Relatórios salvos" onClose={() => setLoadOpen(false)}>
        {saved.data?.length ? (
          <div className="stack sm">
            {saved.data.map((report) => (
              <div key={report.id} className="row between card card-body" style={{ padding: 10 }}>
                <button type="button" className="btn ghost grow" style={{ justifyContent: 'flex-start' }} onClick={() => loadSaved(report)}>
                  <strong className="truncate">{report.name}</strong>
                  <span className="subtle">{meta.data[report.entity]?.label}</span>
                </button>
                {can('crm') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    aria-label="Excluir"
                    onClick={async () => {
                      if (await confirm({ message: `Excluir "${report.name}"?`, danger: true, confirmLabel: 'Excluir' })) {
                        await api.del('saved_reports', { id: report.id });
                        saved.reload();
                      }
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Nenhum relatório salvo" />
        )}
      </Modal>
    </>
  );
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const STATUS_LABELS = { ...Object.fromEntries(Object.entries({ ...SALE_STATUS, ...QUOTE_STATUS, ...ORDER_STATUS }).map(([k, v]) => [k, v.label])), ...CHANNEL_LABELS, ...PAYMENT_METHODS, client: 'Cliente', lead: 'Lead', F: 'Feminino', M: 'Masculino' };

function groupLabel(value, groupBy) {
  if (value === null || value === undefined) return 'Não informado';
  if (groupBy === 'birth_month') return MONTHS[Number(value) - 1] || 'Não informado';
  if (groupBy === 'weekday') return WEEKDAYS[Number(value) - 1] || value;
  if (groupBy === 'day') return date(value);
  return STATUS_LABELS[value] || String(value);
}

function ResultTable({ result, sort, onSort, onRow }) {
  return (
    <div className="table-wrap">
      <table className="table compact">
        <thead>
          <tr>
            {result.columns.map((c) => (
              <th key={c.key} className={`${['money', 'number'].includes(c.type) ? 'num' : ''} ${onSort ? 'sortable' : ''}`} onClick={() => onSort?.(c.key)}>
                {c.label}
                {sort?.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={row._id ?? i} className={onRow && row._client_id ? 'clickable' : ''} onClick={() => onRow?.(row)}>
              {result.columns.map((c) => (
                <td key={c.key} className={['money', 'number'].includes(c.type) ? 'num' : ''}>
                  {formatCell(['status', 'channel', 'direction', 'method', 'kind', 'gender'].includes(c.key) ? STATUS_LABELS[row[c.key]] || row[c.key] : row[c.key], c.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
