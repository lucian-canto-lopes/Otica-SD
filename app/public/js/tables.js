import { escapeHtml, formatMoney, formatDate } from './utils.js?v=4';
import { statusLabels } from './constants.js?v=4';

export function renderTable(headers, rows) {
  const headings = headers.map((heading) => `<th>${heading}</th>`).join('');
  const emptyRow = `
    <tr><td colspan="${headers.length}" class="empty">
      Nenhum registro por aqui. Comece pelo botão acima.
    </td></tr>
  `;
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
    : emptyRow;

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headings}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}
function statusSelect(record, statuses) {
  const options = statuses
    .map(
      (status) => `
    <option value="${status}" ${record.status === status ? 'selected' : ''}>
      ${statusLabels[status]}
    </option>
  `,
    )
    .join('');
  return `
    <select aria-label="Status de ${escapeHtml(record.name || record.client)}" data-status="${record.id}">
      ${options}
    </select>
  `;
}
export function renderRecordsTable(view, records) {
  switch (view) {
    case 'companies':
      return renderTable(
        ['Ótica', 'Documento', 'Plano', 'Assinatura'],
        records.map((record) => [
          escapeHtml(record.name),
          escapeHtml(record.document),
          escapeHtml(record.plan),
          statusSelect(record, ['trial', 'active', 'blocked']),
        ]),
      );
    case 'clients':
      return renderTable(
        ['Nome', 'Telefone', 'Observações'],
        records.map((record) => [
          escapeHtml(record.name),
          escapeHtml(record.phone),
          escapeHtml(record.notes),
        ]),
      );
    case 'products':
      return renderTable(
        ['Produto', 'Categoria', 'Preço', 'Estoque'],
        records.map((record) => [
          escapeHtml(record.name),
          escapeHtml(record.category),
          formatMoney(record.price),
          `${record.stock} un.`,
        ]),
      );
    case 'sales':
      return renderTable(
        ['Venda', 'Cliente', 'Produto', 'Quantidade', 'Total', 'Pago', 'A receber'],
        records.map((record) => [
          '#' + record.id,
          escapeHtml(record.client),
          escapeHtml(record.product),
          record.quantity,
          formatMoney(record.total),
          formatMoney(record.paid),
          formatMoney(record.total - record.paid),
        ]),
      );
    case 'orders':
      return renderTable(
        ['Ordem', 'Cliente', 'Descrição', 'Receita', 'Previsão', 'Etapa'],
        records.map((record) => [
          '#' + record.id,
          escapeHtml(record.client),
          escapeHtml(record.description),
          escapeHtml(record.prescription),
          formatDate(record.delivery),
          statusSelect(record, ['received', 'production', 'ready', 'delivered']),
        ]),
      );
  }
}
