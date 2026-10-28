import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Plus } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { date, number } from '../../lib/format.js';
import { useSession } from '../../lib/session.jsx';
import { CAMPAIGN_STATUS } from '../../lib/constants.js';
import { Button, Card, DataTable, Empty, PageHeader, Pagination, Select, StatusBadge, useListState } from '../../components/ui.jsx';

function Progress({ row }) {
  const total = Number(row.total) || 0;
  const sent = Number(row.sent) || 0;
  const pct = total ? Math.round((sent / total) * 100) : 0;
  return (
    <div style={{ minWidth: 140 }}>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <span className="subtle">
        {number(sent)} de {number(total)} enviadas · {number(row.pending)} faltam{Number(row.replied) ? ` · ${row.replied} responderam` : ''}
      </span>
    </div>
  );
}

export default function Campaigns() {
  const navigate = useNavigate();
  const { can } = useSession();
  const [status, setStatus] = useState('');
  const list = useListState();
  const { data, loading } = useApi('campaigns', { status, ...list.params });
  const types = data?.types || {};

  const columns = [
    { key: 'name', label: 'Campanha', render: (r) => <><strong>{r.name}</strong><div className="subtle">{types[r.type] || r.type}</div></> },
    { key: 'status', label: 'Situação', render: (r) => <StatusBadge map={CAMPAIGN_STATUS} value={r.status} /> },
    { key: 'mode', label: 'Envio', render: (r) => <span className="subtle">{{ manual: 'Manual', semi: 'Semiautomático', auto: 'Automático' }[r.mode]}{r.channel_name ? ` · ${r.channel_name}` : ''}</span> },
    { key: 'progress', label: 'Progresso', render: (r) => <Progress row={r} /> },
    { key: 'created_at', label: 'Criada em', render: (r) => <span className="subtle">{date(r.created_at)}{r.scheduled_at ? ` · agendada ${date(r.scheduled_at)}` : ''}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Campanhas"
        subtitle="Promoções, aniversariantes, receitas vencendo e datas especiais — sem enviar a mesma mensagem duas vezes."
        actions={can('crm') && <Button variant="primary" icon={Plus} onClick={() => navigate('/campanhas/nova')}>Nova campanha</Button>}
      />
      <div className="filters" style={{ marginBottom: 14 }}>
        <Select style={{ width: 200 }} placeholder="Todas as situações" value={status} onChange={(e) => (list.setPage(1), setStatus(e.target.value))} options={Object.entries(CAMPAIGN_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>
      <Card bodyClass={null}>
        <DataTable
          columns={columns}
          rows={data?.data}
          loading={loading}
          onRowClick={(r) => navigate(`/campanhas/${r.id}`)}
          empty={<Empty icon={Megaphone} title="Nenhuma campanha ainda">Crie uma campanha a partir de filtros de clientes ou de um relatório salvo.</Empty>}
          mobile={(r) => (
            <div className="grow stack sm">
              <div className="row between"><strong className="truncate">{r.name}</strong><StatusBadge map={CAMPAIGN_STATUS} value={r.status} /></div>
              <Progress row={r} />
            </div>
          )}
        />
        <Pagination page={list.page} perPage={25} total={data?.total} onChange={list.setPage} />
      </Card>
    </>
  );
}
