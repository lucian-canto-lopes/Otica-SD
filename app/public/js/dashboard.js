import { escapeHtml, formatMoney, formatDate } from './utils.js?v=4';
import { statusLabels } from './constants.js?v=4';
import { renderTable } from './tables.js?v=4';

export function renderDashboard(indicators, orders) {
  const cards = [
    { label: 'Clientes', value: indicators.clients, description: 'Relacionamentos cadastrados' },
    {
      label: 'Peças em estoque',
      value: indicators.products,
      description: 'Disponíveis para venda',
    },
    {
      label: 'Vendas acumuladas',
      value: formatMoney(indicators.revenue),
      description: 'Total registrado',
    },
    {
      label: 'A receber',
      value: formatMoney(indicators.receivable),
      description: 'Saldo das vendas',
    },
  ];
  const cardsHtml = cards
    .map(
      (card) => `
    <article class="card">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <small>${card.description}</small>
    </article>
  `,
    )
    .join('');
  const upcomingDeliveries = orders
    .filter((order) => order.status !== 'delivered')
    .sort((first, second) => first.delivery.localeCompare(second.delivery))
    .map((order) => [
      escapeHtml(order.client),
      escapeHtml(order.description),
      formatDate(order.delivery),
      `<span class="badge">${statusLabels[order.status]}</span>`,
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
    ${renderTable(['Cliente', 'Serviço', 'Previsão', 'Etapa'], upcomingDeliveries)}
  `;
}
