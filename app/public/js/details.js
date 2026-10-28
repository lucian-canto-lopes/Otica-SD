import { escapeHtml, formatMoney, formatDate, formatDateTime } from './utils.js?v=6';
import {
  interactionTypeLabels,
  partnerTypeLabels,
  reminderTypeLabels,
  statusLabels,
} from './constants.js?v=6';

function valueOrDash(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function detailGrid(fields) {
  return `<dl class="detail-grid">${fields
    .map(
      ([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(valueOrDash(value))}</dd>
        </div>
      `,
    )
    .join('')}</dl>`;
}

function recordTitle(view, record) {
  const titles = {
    companies: record.name,
    clients: record.name,
    interactions: record.subject,
    reminders: record.client || 'Lembrete',
    partners: record.name,
    products: record.name,
    sales: `Venda #${record.id}`,
    orders: `Ordem #${record.id}`,
  };
  return valueOrDash(titles[view] || record.name || record.client);
}

function recordFields(view, record) {
  const fields = {
    companies: [
      ['Nome', record.name],
      ['Documento', record.document],
      ['Plano', record.plan],
      ['Assinatura', statusLabels[record.status] || record.status],
    ],
    clients: [
      ['Nome', record.name],
      ['Telefone', record.phone],
      ['E-mail', record.email],
      ['Aniversário', formatDate(record.birth_date)],
      ['Última compra', formatDate(record.last_purchase)],
      ['Próximo contato', formatDate(record.next_contact_date)],
      ['Mensagens', Number(record.message_consent) === 1 ? 'Autorizadas' : 'Não autorizadas'],
      ['Autorização registrada', formatDateTime(record.message_consent_at)],
      ['Observações', record.notes],
    ],
    interactions: [
      ['Cliente', record.client],
      ['Data', formatDateTime(record.contact_date)],
      ['Canal', interactionTypeLabels[record.type] || record.type],
      ['Assunto', record.subject],
      ['Detalhes', record.notes],
      ['Telefone', record.phone || record.client_phone],
    ],
    reminders: [
      ['Cliente', record.client],
      ['Data', formatDate(record.due_date)],
      ['Motivo', reminderTypeLabels[record.type] || record.type],
      ['Situação', statusLabels[record.status] || record.status],
      ['Mensagem', record.message],
      ['Telefone', record.phone],
      ['Concluído em', formatDateTime(record.completed_at)],
    ],
    partners: [
      ['Nome', record.name],
      ['Tipo', partnerTypeLabels[record.type] || record.type],
      ['Documento', record.document],
      ['Telefone', record.phone],
      ['E-mail', record.email],
      ['Observações', record.notes],
    ],
    products: [
      ['Produto', record.name],
      ['Categoria', record.category],
      ['Fornecedor', record.supplier],
      ['Preço', formatMoney(record.price)],
      ['Estoque', `${record.stock} un.`],
    ],
    sales: [
      ['Cliente', record.client],
      ['Data do pagamento', formatDate(record.payment_date)],
      ['Unidades', record.quantity],
      ['Total', formatMoney(record.total)],
      ['Pago', formatMoney(record.paid)],
      ['A receber', formatMoney(Number(record.total) - Number(record.paid))],
    ],
    orders: [
      ['Cliente', record.client],
      ['Laboratório', record.laboratory],
      ['Serviço', record.description],
      ['Receita', record.prescription],
      ['Previsão', formatDate(record.delivery)],
      ['Etapa', statusLabels[record.status] || record.status],
    ],
  };
  return fields[view] || [];
}

function saleItems(record) {
  if (!Array.isArray(record.items) || record.items.length === 0) return '';
  return `
    <div class="detail-section">
      <h4>Itens da venda</h4>
      <ul class="detail-list">
        ${record.items
          .map(
            (item) => `
              <li>
                <span>${escapeHtml(item.product)}</span>
                <strong>${escapeHtml(item.quantity)} × ${formatMoney(item.unit_price)}</strong>
              </li>
            `,
          )
          .join('')}
      </ul>
    </div>
  `;
}

function orderHistory(record) {
  if (!Array.isArray(record.history) || record.history.length === 0) return '';
  return `
    <div class="detail-section">
      <h4>Histórico da ordem</h4>
      <ol class="detail-history">
        ${[...record.history]
          .reverse()
          .map(
            (event) => `
              <li>
                <strong>${escapeHtml(statusLabels[event.status] || event.status)}</strong>
                <time>${formatDateTime(event.created_at)}</time>
                ${event.notes ? `<span>${escapeHtml(event.notes)}</span>` : ''}
              </li>
            `,
          )
          .join('')}
      </ol>
    </div>
  `;
}

function recordBody(view, record) {
  const extra =
    view === 'sales' ? saleItems(record) : view === 'orders' ? orderHistory(record) : '';
  return detailGrid(recordFields(view, record)) + extra;
}

export function renderRecordDetails(view, record) {
  return {
    title: recordTitle(view, record),
    content: recordBody(view, record),
  };
}

export function renderRecordCollection(
  view,
  records,
  emptyMessage = 'Nenhum registro encontrado.',
) {
  if (!records.length) {
    return `<div class="detail-empty">${escapeHtml(emptyMessage)}</div>`;
  }
  return `<div class="detail-cards">${records
    .map(
      (record) => `
        <article class="detail-summary-card">
          <h3>${escapeHtml(recordTitle(view, record))}</h3>
          ${recordBody(view, record)}
        </article>
      `,
    )
    .join('')}</div>`;
}
