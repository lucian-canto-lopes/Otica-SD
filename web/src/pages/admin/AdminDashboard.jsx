import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, CircleDollarSign, Clock, TrendingUp, Users } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { compactMoney, date, dateTime, money, monthLabel, number, relativeDate } from '../../lib/format.js';
import { COMPANY_STATUS } from '../../lib/constants.js';
import { BarChart, DonutChart } from '../../components/charts.jsx';
import { Card, DataTable, Empty, Kpi, Loading, PageHeader, StatusBadge } from '../../components/ui.jsx';

export default function AdminDashboard() {
  const { data, loading } = useApi('admin_dashboard');
  const navigate = useNavigate();
  if (loading && !data) return <Loading />;
  if (!data) return <Empty title="Não foi possível carregar o painel" />;

  const counts = data.companies || {};
  const revenue = [...(data.revenue_by_month || [])].reverse();
  const newCompanies = [...(data.new_companies_by_month || [])].reverse();
  const billed = Number(data.invoices_month?.billed || 0);
  const received = Number(data.invoices_month?.received || 0);

  return (
    <div className="stack lg">
      <PageHeader title="Painel da plataforma" subtitle="Visão geral das óticas, assinaturas e uso do sistema." />
      <div className="grid kpis">
        <Kpi label="Óticas cadastradas" icon={Building2} value={number(data.companies_total)} hint={`${counts.active || 0} ativas · ${counts.trial || 0} em avaliação`} onClick={() => navigate('/admin/oticas')} />
        <Kpi label="Bloqueadas" icon={AlertTriangle} tone="danger" value={number(counts.blocked || 0)} hint={`${counts.cancelled || 0} canceladas`} onClick={() => navigate('/admin/oticas')} />
        <Kpi label="Usuários ativos" icon={Users} value={number(data.users_total)} onClick={() => navigate('/admin/usuarios')} />
        <Kpi label="Receita recorrente (MRR)" icon={TrendingUp} value={money(data.mrr)} hint="Mensalidades das óticas ativas" />
        <Kpi
          label="Faturado no mês"
          icon={CircleDollarSign}
          value={money(billed)}
          hint={`${money(received)} recebido${billed ? ` · ${Math.round((received / billed) * 100)}%` : ''}`}
          onClick={() => navigate('/admin/financeiro')}
        />
        <Kpi
          label="Faturas vencidas"
          icon={Clock}
          tone="warning"
          value={money(data.overdue?.amount)}
          hint={`${data.overdue?.count || 0} fatura(s) em atraso`}
          onClick={() => navigate('/admin/financeiro')}
        />
      </div>

      <div className="grid cols-3">
        <Card title="Faturamento por mês" className="span-2">
          <BarChart data={revenue} labelKey="month" valueKey="billed" format={compactMoney} labelFormat={monthLabel} />
        </Card>
        <Card title="Óticas por situação">
          <DonutChart
            data={Object.entries(counts).map(([status, total]) => ({ label: COMPANY_STATUS[status]?.label || status, total }))}
            format={number}
          />
        </Card>
      </div>

      <div className="grid cols-3">
        <Card title="Novas óticas por mês">
          <BarChart data={newCompanies} labelKey="month" valueKey="total" format={number} labelFormat={monthLabel} height={170} />
        </Card>
        <Card title="Avaliações terminando" className="span-2" bodyClass={null}>
          {data.trials_ending?.length ? (
            <DataTable
              rows={data.trials_ending}
              onRowClick={(row) => navigate(`/admin/oticas/${row.id}`)}
              columns={[
                { key: 'name', label: 'Ótica' },
                { key: 'trial_ends_at', label: 'Fim da avaliação', render: (r) => `${date(r.trial_ends_at)} (${relativeDate(r.trial_ends_at)})` },
              ]}
            />
          ) : (
            <Empty title="Nenhuma avaliação terminando nos próximos 15 dias" />
          )}
        </Card>
      </div>

      <Card title="Uso recente das óticas" bodyClass={null}>
        <DataTable
          rows={data.usage || []}
          onRowClick={(row) => navigate(`/admin/oticas/${row.id}`)}
          mobile={(r) => (
            <div className="grow">
              <div className="row between">
                <strong className="truncate">{r.name}</strong>
                <StatusBadge map={COMPANY_STATUS} value={r.status} />
              </div>
              <div className="subtle">
                {number(r.clients)} clientes · {number(r.sales_30d)} vendas (30 dias) · {r.last_activity ? relativeDate(r.last_activity) : 'sem atividade'}
              </div>
            </div>
          )}
          columns={[
            { key: 'name', label: 'Ótica' },
            { key: 'status', label: 'Situação', render: (r) => <StatusBadge map={COMPANY_STATUS} value={r.status} /> },
            { key: 'clients', label: 'Clientes', className: 'num', render: (r) => number(r.clients) },
            { key: 'sales_30d', label: 'Vendas (30 dias)', className: 'num', render: (r) => number(r.sales_30d) },
            { key: 'last_activity', label: 'Última atividade', render: (r) => (r.last_activity ? dateTime(r.last_activity) : <span className="subtle">—</span>) },
          ]}
        />
      </Card>
    </div>
  );
}
