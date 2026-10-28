import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Cake, CalendarClock, Clock, DollarSign, FileText, Glasses, ListChecks, MessageCircle, Package, Plus, Receipt,
  ShoppingBag, TrendingUp, Users,
} from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { useSession } from '../lib/session.jsx';
import { compactMoney, date, money, monthEnd, monthLabel, monthStart, number, percent, today } from '../lib/format.js';
import { ORDER_STATUS, PAYMENT_METHODS } from '../lib/constants.js';
import { AreaChart, BarChart, DonutChart, HBars } from '../components/charts.jsx';
import { Button, Card, Kpi, Loading, PageHeader, Select } from '../components/ui.jsx';

const PERIODS = {
  month: { label: 'Este mês', from: () => monthStart(0), to: () => today() },
  last_month: { label: 'Mês passado', from: () => monthStart(-1), to: () => monthEnd(-1) },
  last_30: { label: 'Últimos 30 dias', from: () => today(-29), to: () => today() },
  last_90: { label: 'Últimos 90 dias', from: () => today(-89), to: () => today() },
  year: { label: 'Este ano', from: () => `${new Date().getFullYear()}-01-01`, to: () => today() },
};

function delta(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (!p) return null;
  return (c - p) / p;
}

export default function Dashboard() {
  const [period, setPeriod] = useState('month');
  const navigate = useNavigate();
  const { company, user, can } = useSession();
  const { data, loading } = useApi('dashboard', { from: PERIODS[period].from(), to: PERIODS[period].to() });

  if (!data) return <Loading />;
  const sales = data.sales;
  const prev = data.sales_previous;

  return (
    <div className="stack lg">
      <PageHeader
        title={`Olá, ${user?.name?.split(' ')[0] || ''}`}
        subtitle={`Indicadores da ${company.trade_name || company.name}`}
        actions={
          <>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} options={Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label }))} />
            {can('sell') && (
              <>
                <Button icon={FileText} onClick={() => navigate('/orcamentos/novo')} className="hidden-mobile">
                  Orçamento
                </Button>
                <Button variant="primary" icon={Plus} onClick={() => navigate('/vendas/nova')}>
                  Nova venda
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid kpis" style={{ opacity: loading ? 0.6 : 1 }}>
        <Kpi icon={DollarSign} label="Vendas no período" value={compactMoney(sales.total)} delta={delta(sales.total, prev.total)} hint="vs. período anterior" onClick={() => navigate('/vendas')} />
        <Kpi icon={ShoppingBag} label="Pedidos" value={number(sales.count)} delta={delta(sales.count, prev.count)} hint={`ticket médio ${money(sales.average_ticket)}`} />
        <Kpi icon={Receipt} label="A receber" value={compactMoney(data.receivable)} hint={`${data.overdue_installments.count} parcela(s) vencida(s)`} tone={data.overdue_installments.count ? 'danger' : undefined} onClick={() => navigate('/vendas?balance=1')} />
        <Kpi icon={TrendingUp} label="Conversão de orçamentos" value={percent(data.quotes.conversion)} hint={`${number(data.quotes.open)} em aberto · ${compactMoney(data.quotes.open_value)}`} onClick={() => navigate('/orcamentos')} />
        <Kpi icon={Glasses} label="OS em andamento" value={number(data.orders.open)} hint={`${number(data.orders.ready)} prontas · ${number(data.orders.late)} atrasadas`} tone={Number(data.orders.late) ? 'danger' : undefined} onClick={() => navigate('/os')} />
        <Kpi icon={Users} label="Clientes" value={number(data.clients.total)} hint={`${number(data.clients.new_in_period)} novos no período`} onClick={() => navigate('/clientes/painel')} />
      </div>

      <div className="grid kpis">
        <Kpi icon={ListChecks} label="Tarefas para hoje" value={number(data.tasks_today)} onClick={() => navigate('/tarefas')} />
        <Kpi icon={MessageCircle} label="Conversas não lidas" value={number(data.unread_conversations)} onClick={() => navigate('/atendimento')} />
        <Kpi icon={Cake} label="Aniversariantes" value={number(data.clients.birthdays_month)} hint={`${number(data.clients.birthdays_today)} hoje`} onClick={() => navigate('/clientes?birthday_window=this_month')} />
        <Kpi icon={CalendarClock} label="Receitas vencendo (30 dias)" value={number(data.prescriptions_expiring)} onClick={() => navigate('/clientes?prescription_expiring_days=30')} />
        <Kpi icon={Package} label="Estoque baixo" value={number(data.low_stock)} tone={data.low_stock ? 'warning' : undefined} onClick={() => navigate('/produtos?low_stock=1')} />
        <Kpi icon={AlertTriangle} label="Parcelas vencidas" value={compactMoney(data.overdue_installments.amount)} tone={Number(data.overdue_installments.amount) ? 'danger' : undefined} />
      </div>

      <div className="grid cols-3">
        <Card title="Vendas por dia" className="span-2">
          <AreaChart data={data.sales_by_day} labelKey="day" valueKey="total" format={money} labelFormat={(d) => date(d).slice(0, 5)} />
        </Card>
        <Card title="Vendas por vendedor">
          <HBars data={data.by_seller} format={compactMoney} />
        </Card>
      </div>

      <div className="grid cols-3">
        <Card title="Faturamento mensal (12 meses)" className="span-2">
          <BarChart data={data.sales_by_month} labelKey="month" valueKey="total" format={compactMoney} labelFormat={monthLabel} />
        </Card>
        <Card title="Formas de pagamento">
          <DonutChart data={data.payment_methods.map((p) => ({ ...p, label: PAYMENT_METHODS[p.label] || p.label }))} format={compactMoney} size={130} />
        </Card>
      </div>

      <div className="grid cols-3">
        <Card title="Mais vendidos">
          <HBars data={data.top_products} format={compactMoney} />
        </Card>
        <Card title="Categorias">
          <HBars data={data.top_categories} format={compactMoney} />
        </Card>
        <Card title="Motivos de não compra" actions={<Button size="sm" variant="ghost" onClick={() => navigate('/nao-compras')}>Ver</Button>}>
          <HBars data={data.loss_reasons} format={number} />
        </Card>
      </div>

      <div className="grid cols-3">
        <Card title="OS por etapa" actions={<Button size="sm" variant="ghost" onClick={() => navigate('/os')}>Quadro</Button>}>
          <HBars data={data.orders_by_status.map((o) => ({ ...o, label: ORDER_STATUS[o.label]?.label || o.label }))} format={number} />
        </Card>
        <Card title="Últimas vendas" bodyClass={null}>
          {data.recent_sales.map((sale) => (
            <div key={sale.id} className="mobile-item" style={{ display: 'flex' }} onClick={() => navigate(`/vendas/${sale.id}`)}>
              <div className="grow">
                <div className="truncate">
                  <strong>{sale.client_name || 'Consumidor'}</strong>
                </div>
                <div className="subtle">
                  nº {sale.number} · {date(sale.sale_date)}
                </div>
              </div>
              <strong className="mono">{money(sale.total)}</strong>
            </div>
          ))}
        </Card>
        <Card title="Campanhas em andamento" actions={<Button size="sm" variant="ghost" onClick={() => navigate('/campanhas')}>Todas</Button>}>
          {data.campaigns.length ? (
            <div className="stack">
              {data.campaigns.map((campaign) => (
                <div key={campaign.id} className="stack sm" style={{ cursor: 'pointer' }} onClick={() => navigate(`/campanhas/${campaign.id}`)}>
                  <div className="row between">
                    <strong className="truncate">{campaign.name}</strong>
                    <span className="subtle">
                      {campaign.sent}/{campaign.total}
                    </span>
                  </div>
                  <div className="progress">
                    <div style={{ width: `${campaign.total ? (campaign.sent / campaign.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <Clock size={24} />
              Nenhuma campanha ativa.
              <Button size="sm" onClick={() => navigate('/campanhas/nova')}>
                Criar campanha
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
