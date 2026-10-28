import { escapeHtml, formatMoney, formatDate } from './utils.js?v=6';
import { statusLabels } from './constants.js?v=6';
import { renderTable } from './tables.js?v=12';

function indicatorCount(value) {
  return escapeHtml(Array.isArray(value) ? value.length : (value ?? 0));
}

export function renderDashboard(indicators, orders) {
  const cards = [
    {
      key: 'clients',
      label: 'Clientes',
      value: indicatorCount(indicators.clients),
      description: 'Relacionamentos cadastrados',
    },
    {
      key: 'products',
      label: 'Peças em estoque',
      value: indicatorCount(indicators.products),
      description: 'Disponíveis para venda',
    },
    {
      key: 'revenue',
      label: 'Vendas acumuladas',
      value: formatMoney(indicators.revenue),
      description: 'Total registrado',
    },
    {
      key: 'receivable',
      label: 'A receber',
      value: formatMoney(indicators.receivable),
      description: 'Saldo das vendas',
    },
  ];
  const relationshipCards = [
    {
      key: 'upcoming_birthdays',
      label: 'Próximos aniversários',
      description: 'Clientes para felicitar',
    },
    {
      key: 'pending_reminders',
      label: 'Lembretes pendentes',
      description: 'Contatos que precisam de atenção',
    },
    {
      key: 'overdue_orders',
      label: 'Ordens atrasadas',
      description: 'Entregas fora do prazo',
    },
    {
      key: 'low_stock',
      label: 'Estoque baixo',
      description: 'Produtos com poucas unidades',
    },
  ];
  relationshipCards.forEach((card) => {
    if (Object.hasOwn(indicators, card.key)) {
      cards.push({ ...card, value: indicatorCount(indicators[card.key]) });
    }
  });
  const cardsHtml = cards
    .map(
      (card) => `
    <button class="card dashboard-card" type="button" data-dashboard-card="${card.key}">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <small>${card.description}</small>
    </button>
  `,
    )
    .join('');
  const upcomingOrders = orders
    .filter((order) => order.status !== 'delivered')
    .sort((first, second) => String(first.delivery).localeCompare(String(second.delivery)));
  const upcomingDeliveries = upcomingOrders.map((order) => [
    escapeHtml(order.client),
    escapeHtml(order.description),
    formatDate(order.delivery),
    `<span class="badge">${escapeHtml(statusLabels[order.status] || order.status)}</span>`,
  ]);
  return `
    <section class="welcome">
      <div>
        <span class="eyebrow">TUDO SOB CONTROLE</span>
        <h2>Um olhar sobre sua ótica</h2>
        <p>Acompanhe os números e os próximos atendimentos.</p>
      </div>
    </section>
    <div class="cards">${cardsHtml}</div>
    <div class="toolbar"><h2>Próximas entregas</h2></div>
    ${renderTable(
      ['Cliente', 'Serviço', 'Previsão', 'Etapa'],
      upcomingDeliveries,
      upcomingOrders.map((order) => order.id),
    )}
  `;
}
