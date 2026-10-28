import { escapeHtml, formatMoney, formatDate, formatDateTime } from './utils.js?v=6';
import {
  interactionTypeLabels,
  partnerTypeLabels,
  reminderTypeLabels,
  statusLabels,
} from './constants.js?v=6';

export function renderTable(headers, rows, recordIds = []) {
  const headings = headers.map((heading) => `<th>${heading}</th>`).join('');
  const emptyRow = `
    <tr><td colspan="${headers.length}" class="empty">
      Nenhum registro por aqui. Comece pelo botão acima.
    </td></tr>
  `;
  const body = rows.length
    ? rows
        .map((row, index) => {
          const recordId = recordIds[index];
          const attributes =
            recordId === undefined
              ? ''
              : ` data-record-id="${escapeHtml(recordId)}" tabindex="0" aria-label="Ver detalhes deste registro"`;
          return `<tr${attributes}>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
        })
        .join('')
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

function displayText(value) {
  return value ? escapeHtml(value) : '<span class="muted">—</span>';
}

function displayLabel(labels, value) {
  return displayText(labels[value] || value);
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
    <select aria-label="Status de ${escapeHtml(record.name || record.client)}" data-status="${escapeHtml(record.id)}">
      ${options}
    </select>
  `;
}

function safeWhatsAppUrl(record) {
  if (record.whatsapp_url) {
    try {
      const url = new URL(record.whatsapp_url);
      const allowedHosts = ['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'];
      if (url.protocol === 'https:' && allowedHosts.includes(url.hostname)) {
        return url.href;
      }
    } catch {
      // Se a URL recebida for inválida, tentamos montar uma pelo telefone.
    }
  }

  let digits = String(record.phone || record.client_phone || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }
  const message = record.message ? `?text=${encodeURIComponent(record.message)}` : '';
  return `https://wa.me/${digits}${message}`;
}

function contactCell(record) {
  const phone = record.phone || record.client_phone || '';
  const consentIsKnown = Object.prototype.hasOwnProperty.call(record, 'message_consent');
  const hasConsent = !consentIsKnown || Number(record.message_consent) === 1;
  if (!hasConsent) {
    return `<div class="contact-cell">${phone ? `<span>${escapeHtml(phone)}</span>` : ''}<span class="badge denied">Sem autorização</span></div>`;
  }
  const whatsappUrl = safeWhatsAppUrl(record);
  const link = whatsappUrl
    ? `<a class="whatsapp-link" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Conversar com ${escapeHtml(record.client || record.name || 'o contato')} pelo WhatsApp">WhatsApp ↗</a>`
    : '';
  return `<div class="contact-cell">${phone ? `<span>${escapeHtml(phone)}</span>` : ''}${link || '<span class="muted">—</span>'}</div>`;
}

function consentCell(record) {
  if (Number(record.message_consent) !== 1) {
    return '<span class="badge denied">Não autorizado</span>';
  }
  const date = record.message_consent_at
    ? `<small>Desde ${formatDateTime(record.message_consent_at)}</small>`
    : '';
  return `<div class="consent-status"><span class="badge">Autorizado</span>${date}</div>`;
}

function saleItemsCell(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<span class="muted">—</span>';
  }
  return `<ul class="sale-items-summary">${items
    .map(
      (item) => `
        <li>
          <span>${escapeHtml(item.product)}</span>
          <small>${escapeHtml(item.quantity)} × ${formatMoney(item.unit_price)}</small>
        </li>
      `,
    )
    .join('')}</ul>`;
}

function orderHistoryCell(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return '<span class="muted">—</span>';
  }
  const events = [...history]
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
    .join('');
  return `
    <details class="order-history">
      <summary>${history.length} ${history.length === 1 ? 'movimentação' : 'movimentações'}</summary>
      <ol>${events}</ol>
    </details>
  `;
}

export function renderRecordsTable(view, records) {
  const recordIds = records.map((record) => record.id);
  switch (view) {
    case 'companies':
      return renderTable(
        ['Ótica', 'Documento', 'Plano', 'Assinatura', 'Ações'],
        records.map((record) => [
          displayText(record.name),
          displayText(record.document),
          displayText(record.plan),
          statusSelect(record, ['trial', 'active', 'blocked']),
          `<button class="table-action danger-action" type="button" data-delete-company="${escapeHtml(record.id)}" aria-label="Excluir ${escapeHtml(record.name)}">Excluir</button>`,
        ]),
        recordIds,
      );
    case 'clients':
      return renderTable(
        [
          'Nome',
          'Contato',
          'E-mail',
          'Aniversário',
          'Última compra',
          'Próximo contato',
          'Mensagens',
          'Observações',
          'Ações',
        ],
        records.map((record) => [
          displayText(record.name),
          contactCell(record),
          displayText(record.email),
          formatDate(record.birth_date),
          formatDate(record.last_purchase),
          formatDate(record.next_contact_date),
          consentCell(record),
          displayText(record.notes),
          `<button class="table-action" type="button" data-edit="${escapeHtml(record.id)}" data-edit-phone="${escapeHtml(record.phone || record.client_phone || '')}">Editar</button>`,
        ]),
        recordIds,
      );
    case 'interactions':
      return renderTable(
        ['Data', 'Cliente', 'Canal', 'Assunto', 'Detalhes', 'Contato'],
        records.map((record) => [
          formatDateTime(record.contact_date),
          displayText(record.client),
          displayLabel(interactionTypeLabels, record.type),
          displayText(record.subject),
          displayText(record.notes),
          contactCell(record),
        ]),
        recordIds,
      );
    case 'reminders':
      return renderTable(
        ['Data', 'Cliente', 'Motivo', 'Mensagem', 'Contato', 'Situação'],
        records.map((record) => [
          formatDate(record.due_date),
          displayText(record.client),
          displayLabel(reminderTypeLabels, record.type),
          displayText(record.message),
          contactCell(record),
          statusSelect(record, ['pending', 'completed']),
        ]),
        recordIds,
      );
    case 'partners':
      return renderTable(
        ['Parceiro', 'Tipo', 'Documento', 'Contato', 'E-mail', 'Observações'],
        records.map((record) => [
          displayText(record.name),
          displayLabel(partnerTypeLabels, record.type),
          displayText(record.document),
          contactCell(record),
          displayText(record.email),
          displayText(record.notes),
        ]),
        recordIds,
      );
    case 'products':
      return renderTable(
        ['Produto', 'Categoria', 'Fornecedor', 'Preço', 'Estoque'],
        records.map((record) => [
          displayText(record.name),
          displayText(record.category),
          displayText(record.supplier),
          formatMoney(record.price),
          `${escapeHtml(record.stock)} un.`,
        ]),
        recordIds,
      );
    case 'sales':
      return renderTable(
        ['Venda', 'Cliente', 'Pagamento', 'Itens', 'Unidades', 'Total', 'Pago', 'A receber'],
        records.map((record) => [
          '#' + escapeHtml(record.id),
          displayText(record.client),
          formatDate(record.payment_date),
          saleItemsCell(record.items),
          escapeHtml(record.quantity),
          formatMoney(record.total),
          formatMoney(record.paid),
          formatMoney(record.total - record.paid),
        ]),
        recordIds,
      );
    case 'orders':
      return renderTable(
        [
          'Ordem',
          'Cliente',
          'Laboratório',
          'Descrição',
          'Receita',
          'Previsão',
          'Histórico',
          'Etapa',
        ],
        records.map((record) => [
          '#' + escapeHtml(record.id),
          displayText(record.client),
          displayText(record.laboratory),
          displayText(record.description),
          displayText(record.prescription),
          formatDate(record.delivery),
          orderHistoryCell(record.history),
          statusSelect(record, [
            'received',
            'sent_to_lab',
            'lab_production',
            'received_from_lab',
            'ready',
            'delivered',
          ]),
        ]),
        recordIds,
      );
  }
}
