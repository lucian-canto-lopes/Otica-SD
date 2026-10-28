import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useApi, useDebounce } from '../lib/hooks.js';
import { dateTime } from '../lib/format.js';
import { Badge, Card, Empty, Input, Loading, PageHeader, Pagination, SearchInput, Select } from '../components/ui.jsx';

export const AUDIT_ACTIONS = {
  login: 'Acesso',
  login_failed: 'Falha de acesso',
  logout: 'Saída',
  create: 'Criação',
  update: 'Alteração',
  delete: 'Exclusão',
  cancel: 'Cancelamento',
  status: 'Mudança de etapa',
  print: 'Impressão',
  export: 'Exportação',
  import: 'Importação',
  import_start: 'Início de importação',
  upload: 'Anexo',
  send_message: 'Mensagem',
  block: 'Bloqueio',
  unblock: 'Desbloqueio',
  enter_company: 'Acesso do administrador',
  grant_access: 'Acesso concedido',
  revoke_access: 'Acesso removido',
  update_access: 'Papel alterado',
  receive: 'Recebimento',
  lose: 'Orçamento perdido',
  start: 'Campanha iniciada',
  build: 'Público atualizado',
  invoice_paid: 'Fatura paga',
  generate: 'Geração de faturas',
};

export const AUDIT_ENTITIES = {
  client: 'Cliente',
  sale: 'Venda',
  quote: 'Orçamento',
  service_order: 'OS',
  product: 'Produto',
  partner: 'Fornecedor',
  prescription: 'Receita',
  attachment: 'Anexo',
  campaign: 'Campanha',
  automation: 'Automação',
  channel: 'Canal',
  company: 'Ótica',
  user: 'Usuário',
  invoice: 'Fatura',
  plan: 'Plano',
  import: 'Importação',
  report: 'Relatório',
  tag: 'Etiqueta',
  task: 'Tarefa',
  interaction: 'Interação',
  conversation: 'Conversa',
  api_key: 'Chave de API',
  webhook: 'Webhook',
};

const toneFor = (action) =>
  ['delete', 'cancel', 'login_failed', 'block', 'revoke_access'].includes(action) ? 'danger' : ['create', 'invoice_paid', 'unblock'].includes(action) ? 'success' : action === 'update' ? 'info' : '';

function AuditRow({ row, showCompany }) {
  const [open, setOpen] = useState(false);
  const hasDetails = row.details && Object.keys(row.details).length > 0;
  return (
    <>
      <tr className={hasDetails ? 'clickable' : ''} onClick={() => hasDetails && setOpen((o) => !o)}>
        <td className="nowrap mono">{dateTime(row.created_at)}</td>
        {showCompany && <td className="truncate" style={{ maxWidth: 160 }}>{row.company_name || '—'}</td>}
        <td>{row.user_name || <span className="subtle">Sistema</span>}</td>
        <td>
          <Badge tone={toneFor(row.action)}>{AUDIT_ACTIONS[row.action] || row.action}</Badge>
        </td>
        <td className="nowrap">
          {AUDIT_ENTITIES[row.entity] || row.entity}
          {row.entity_id ? <span className="subtle"> #{row.entity_id}</span> : null}
        </td>
        <td>
          <span className="row">
            {hasDetails && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
            {row.summary}
          </span>
        </td>
        <td className="subtle hidden-mobile">{row.ip}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={showCompany ? 7 : 6} style={{ background: 'var(--surface-2)' }}>
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(row.details, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  );
}

/** Tabela de auditoria com filtros, usada pela ótica e pelo administrador da plataforma. */
export function AuditTable({ action = 'audit', showCompany = false, companies = [], users = [] }) {
  const [filters, setFilters] = useState({ q: '', action: '', entity: '', from: '', to: '', company_id: '', user_id: '' });
  const [page, setPage] = useState(1);
  const q = useDebounce(filters.q, 300);
  const set = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const { action: auditAction, ...rest } = filters;
  const { data, loading } = useApi(action, { ...rest, audit_action: auditAction, q, page, per_page: 50 });

  return (
    <Card bodyClass={null}>
      <div className="card-body filters">
        <SearchInput value={filters.q} onChange={(v) => set('q', v)} placeholder="Buscar no resumo ou usuário…" className="grow" />
        {showCompany && (
          <Select
            className="sm"
            style={{ maxWidth: 200 }}
            value={filters.company_id}
            onChange={(e) => set('company_id', e.target.value)}
            placeholder="Todas as óticas"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        {users.length > 0 && (
          <Select className="sm" style={{ maxWidth: 180 }} value={filters.user_id} onChange={(e) => set('user_id', e.target.value)} placeholder="Todos os usuários" options={users.map((u) => ({ value: u.id, label: u.name }))} />
        )}
        <Select
          className="sm"
          style={{ maxWidth: 170 }}
          value={filters.action}
          onChange={(e) => set('action', e.target.value)}
          placeholder="Todas as ações"
          options={Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label }))}
        />
        <Select
          className="sm"
          style={{ maxWidth: 160 }}
          value={filters.entity}
          onChange={(e) => set('entity', e.target.value)}
          placeholder="Todos os registros"
          options={Object.entries(AUDIT_ENTITIES).map(([value, label]) => ({ value, label }))}
        />
        <Input className="sm" type="date" style={{ maxWidth: 150 }} value={filters.from} onChange={(e) => set('from', e.target.value)} title="De" />
        <Input className="sm" type="date" style={{ maxWidth: 150 }} value={filters.to} onChange={(e) => set('to', e.target.value)} title="Até" />
      </div>
      {loading && !data ? (
        <Loading />
      ) : data?.data?.length ? (
        <>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Data</th>
                  {showCompany && <th>Ótica</th>}
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Registro</th>
                  <th>Resumo</th>
                  <th className="hidden-mobile">IP</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <AuditRow key={row.id} row={row} showCompany={showCompany} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} perPage={data.per_page} total={data.total} onChange={setPage} />
        </>
      ) : (
        <Empty title="Nenhum registro de auditoria" />
      )}
    </Card>
  );
}

export default function Audit() {
  const team = useApi('team');
  return (
    <div className="stack">
      <PageHeader title="Auditoria" subtitle="Quem fez o quê e quando: acessos, cadastros, alterações, impressões e exportações." />
      <AuditTable action="audit" users={team.data || []} />
    </div>
  );
}
