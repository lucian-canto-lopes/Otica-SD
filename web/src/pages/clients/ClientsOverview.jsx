import { useNavigate } from 'react-router-dom';
import { Cake, CalendarClock, Megaphone, MessageCircle, UserCheck, UserPlus, Users } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { date, money, monthLabel, number, percent } from '../../lib/format.js';
import { BarChart, DonutChart, HBars } from '../../components/charts.jsx';
import { Button, Card, Kpi, Loading, PageHeader, WhatsAppButton } from '../../components/ui.jsx';

const RECENCY_ORDER = ['Até 3 meses', '3 a 6 meses', '6 a 12 meses', '1 a 2 anos', 'Mais de 2 anos', 'Nunca comprou'];

export default function ClientsOverview() {
  const { data } = useApi('clients_overview');
  const navigate = useNavigate();
  if (!data) return <Loading />;
  const t = data.totals;
  const total = Number(t.total) || 0;
  const recency = RECENCY_ORDER.map((label) => ({ label, total: data.recency.find((r) => r.bucket === label)?.total || 0 }));

  return (
    <div className="stack lg">
      <PageHeader
        title="Visão da carteira"
        subtitle="Quem são, onde estão e quando compraram os clientes da ótica"
        actions={
          <Button icon={Users} onClick={() => navigate('/clientes')}>
            Lista de clientes
          </Button>
        }
      />
      <div className="grid kpis">
        <Kpi icon={Users} label="Clientes cadastrados" value={number(total)} hint={`${number(t.leads)} contatos ainda sem compra`} />
        <Kpi icon={UserCheck} label="Ativos (12 meses)" value={number(t.active_12m)} hint={percent(total ? t.active_12m / total : 0) + ' da carteira'} />
        <Kpi icon={UserPlus} label="Novos este mês" value={number(t.new_this_month)} />
        <Kpi icon={MessageCircle} label="Autorizaram mensagens" value={percent(total ? t.consent / total : 0)} hint={`${number(t.consent)} clientes`} />
        <Kpi icon={Cake} label="Aniversariantes do mês" value={number(data.birthdays.length)} onClick={() => navigate('/clientes?birthday_window=this_month')} />
        <Kpi icon={CalendarClock} label="Receitas a vencer/vencidas" value={number(data.prescriptions_expiring.length)} />
      </div>

      <div className="grid cols-3">
        <Card
          title="Tempo desde a última compra"
          className="span-2"
          actions={
            <Button size="sm" icon={Megaphone} onClick={() => navigate('/campanhas/nova', { state: { audience: { no_purchase_days: 365 }, name: 'Reativação: sem comprar há 1 ano', type: 'reactivation' } })}>
              Reativar inativos
            </Button>
          }
        >
          <HBars data={recency} format={number} />
        </Card>
        <Card title="Faixa etária">
          <HBars data={data.age_groups} format={number} />
        </Card>
      </div>

      <div className="grid cols-3">
        <Card title="Novos clientes por mês" className="span-2">
          <BarChart data={data.new_by_month} labelKey="month" valueKey="total" format={number} labelFormat={monthLabel} height={180} />
        </Card>
        <Card title="Sexo">
          <DonutChart data={data.gender} format={number} size={120} />
        </Card>
      </div>

      <div className="grid cols-3">
        <Card title="Cidades">
          <HBars data={data.cities} format={number} />
        </Card>
        <Card title="Como conheceram a ótica">
          <HBars data={data.origins} format={number} />
        </Card>
        <Card title="Etiquetas">
          <HBars data={data.tags} format={number} onClick={(tag) => navigate(`/clientes?tags_any=${tag.id}`)} />
        </Card>
      </div>

      <div className="grid cols-3">
        <Card
          title="Aniversariantes do mês"
          bodyClass={null}
          actions={
            <Button size="sm" icon={Megaphone} onClick={() => navigate('/campanhas/nova', { state: { audience: { birthday_window: 'this_month' }, name: 'Aniversariantes do mês', type: 'birthday_month' } })}>
              Campanha
            </Button>
          }
        >
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {data.birthdays.map((c) => (
              <div key={c.id} className="mobile-item" style={{ display: 'flex' }} onClick={() => navigate(`/clientes/${c.id}`)}>
                <strong className="mono" style={{ width: 44 }}>
                  {date(c.birth_date).slice(0, 5)}
                </strong>
                <span className="grow truncate">{c.name}</span>
                {Number(c.message_consent) ? <WhatsAppButton phone={c.whatsapp} label="" text={`Feliz aniversário, ${c.name.split(' ')[0]}! 🎉`} /> : null}
              </div>
            ))}
            {!data.birthdays.length && <div className="empty">Nenhum aniversariante este mês.</div>}
          </div>
        </Card>
        <Card
          title="Receitas vencendo"
          bodyClass={null}
          actions={
            <Button size="sm" icon={Megaphone} onClick={() => navigate('/campanhas/nova', { state: { audience: { prescription_expiring_days: 60 }, name: 'Receitas vencendo', type: 'prescription_expiry' } })}>
              Campanha
            </Button>
          }
        >
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {data.prescriptions_expiring.map((c) => (
              <div key={c.id} className="mobile-item" style={{ display: 'flex' }} onClick={() => navigate(`/clientes/${c.id}`)}>
                <span className="grow truncate">{c.name}</span>
                <span className="subtle">{date(c.expires_at)}</span>
              </div>
            ))}
            {!data.prescriptions_expiring.length && <div className="empty">Nenhuma receita vencendo.</div>}
          </div>
        </Card>
        <Card title="Melhores clientes" bodyClass={null}>
          {data.top_clients.map((c, i) => (
            <div key={c.id} className="mobile-item" style={{ display: 'flex' }} onClick={() => navigate(`/clientes/${c.id}`)}>
              <span className="subtle" style={{ width: 18 }}>
                {i + 1}
              </span>
              <span className="grow truncate">{c.name}</span>
              <span className="subtle">{c.sales_count}x</span>
              <strong className="mono">{money(c.total)}</strong>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
