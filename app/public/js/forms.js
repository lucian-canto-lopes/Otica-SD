import { selectElement, escapeHtml, formatMoney } from './utils.js?v=6';
import { requestApi } from './api.js?v=6';
import {
  formTitles,
  interactionTypeLabels,
  partnerTypeLabels,
  reminderTypeLabels,
} from './constants.js?v=6';

function renderInput(name, label, options = {}) {
  const { type = 'text', attributes = '', required = true, value } = options;
  const valueAttribute =
    value === undefined || value === null ? '' : `value="${escapeHtml(value)}"`;
  return `
    <label>
      ${label}
      <input name="${name}" type="${type}" ${required ? 'required' : ''} ${valueAttribute} ${attributes}>
    </label>
  `;
}

function renderTextarea(name, label, { required = false, attributes = '', value = '' } = {}) {
  return `
    <label>
      ${label}
      <textarea name="${name}" ${required ? 'required' : ''} ${attributes}>${escapeHtml(value)}</textarea>
    </label>
  `;
}

function renderCheckbox(name, label, description, checked = false) {
  return `
    <label class="consent-field">
      <input name="${name}" type="checkbox" value="1" ${checked ? 'checked' : ''}>
      <span>
        <strong>${label}</strong>
        <small>${description}</small>
      </span>
    </label>
  `;
}

function renderSelect(name, label, items, options = {}) {
  const { required = true, emptyLabel = 'Selecione', selectedId = '' } = options;
  const choices = items
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`,
    )
    .join('');
  return `
    <label>
      ${label}
      <select name="${name}" ${required ? 'required' : ''}>
        <option value="">${emptyLabel}</option>
        ${choices}
      </select>
    </label>
  `;
}

function labelOptions(labels) {
  return Object.entries(labels).map(([id, name]) => ({ id, name }));
}

function localDateTimeValue() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}

function renderSaleItem(products) {
  const options = products
    .filter((product) => Number(product.stock) > 0)
    .map(
      (product) => `
        <option value="${escapeHtml(product.id)}">
          ${escapeHtml(product.name)} · ${formatMoney(product.price)} · ${escapeHtml(product.stock)} un.
        </option>
      `,
    )
    .join('');
  return `
    <div class="sale-item-row">
      <label>
        Produto
        <select name="item_product_id" class="sale-product" required>
          <option value="">Selecione</option>
          ${options}
        </select>
      </label>
      <label>
        Quantidade
        <input name="item_quantity" class="sale-quantity" type="number" min="1" step="1" value="1" required>
      </label>
      <button class="remove-sale-item secondary" type="button" aria-label="Remover item">Remover</button>
      <strong class="sale-item-subtotal">R$ 0,00</strong>
    </div>
  `;
}

function updateSaleTotal(products) {
  let total = 0;
  document.querySelectorAll('.sale-item-row').forEach((row) => {
    const product = products.find(
      (item) => String(item.id) === row.querySelector('.sale-product').value,
    );
    const quantity = Math.max(0, Number(row.querySelector('.sale-quantity').value) || 0);
    const subtotal = product ? Number(product.price) * quantity : 0;
    row.querySelector('.sale-item-subtotal').textContent = formatMoney(subtotal);
    total += subtotal;
  });
  selectElement('#sale-total').textContent = `Total: ${formatMoney(total)}`;
}

function updateAddSaleItemButton() {
  const button = selectElement('#add-sale-item');
  const rows = [...document.querySelectorAll('.sale-item-row')];
  if (!button || rows.length === 0) return;

  const lastRow = rows.at(-1);
  const hasProduct = Boolean(lastRow.querySelector('.sale-product').value);
  const quantity = Number(lastRow.querySelector('.sale-quantity').value);
  const canAddItem = hasProduct && Number.isInteger(quantity) && quantity > 0;

  button.disabled = !canAddItem || rows.length >= 50;
  button.title = canAddItem
    ? rows.length >= 50
      ? 'Limite de 50 itens atingido'
      : ''
    : 'Preencha o produto e a quantidade do item atual';
}

export async function openRecordForm(view, record = null) {
  let html = '';
  let products = [];

  if (view === 'companies') {
    html =
      renderInput('name', 'Nome da ótica') +
      renderInput('document', 'CNPJ ou identificação') +
      renderInput('plan', 'Plano', { value: 'Essencial' }) +
      renderInput('email', 'E-mail do responsável', { type: 'email' }) +
      renderInput('password', 'Senha inicial', {
        type: 'password',
        attributes: 'minlength="8" maxlength="72" autocomplete="new-password"',
      });
  }

  if (view === 'clients') {
    html =
      renderInput('name', 'Nome completo', { value: record?.name }) +
      renderInput('phone', 'Telefone / WhatsApp', {
        type: 'tel',
        attributes: 'maxlength="30" placeholder="(93) 99999-9999"',
        required: false,
        value: record?.phone,
      }) +
      renderInput('email', 'E-mail', {
        type: 'email',
        attributes: 'maxlength="190"',
        required: false,
        value: record?.email,
      }) +
      renderInput('birth_date', 'Data de nascimento', {
        type: 'date',
        required: false,
        value: record?.birth_date,
      }) +
      renderInput('next_contact_date', 'Próximo contato', {
        type: 'date',
        required: false,
        value: record?.next_contact_date,
      }) +
      renderCheckbox(
        'message_consent',
        'Cliente autorizou o recebimento de mensagens',
        'Marque somente após o cliente aceitar contatos da ótica por telefone ou WhatsApp.',
        Number(record?.message_consent) === 1,
      ) +
      renderTextarea('notes', 'Observações', {
        attributes: 'maxlength="2000"',
        value: record?.notes,
      });
  }

  if (view === 'partners') {
    html =
      renderInput('name', 'Nome do parceiro') +
      renderSelect('type', 'Tipo de parceiro', labelOptions(partnerTypeLabels)) +
      renderInput('document', 'CNPJ ou identificação', {
        attributes: 'maxlength="30"',
        required: false,
      }) +
      renderInput('phone', 'Telefone / WhatsApp', {
        type: 'tel',
        attributes: 'maxlength="30"',
        required: false,
      }) +
      renderInput('email', 'E-mail', {
        type: 'email',
        attributes: 'maxlength="190"',
        required: false,
      }) +
      renderTextarea('notes', 'Observações', { attributes: 'maxlength="2000"' });
  }

  if (view === 'interactions') {
    const clients = await requestApi('clients');
    html =
      renderSelect('client_id', 'Cliente', clients) +
      renderSelect('type', 'Canal de atendimento', labelOptions(interactionTypeLabels)) +
      renderInput('contact_date', 'Data e hora do contato', {
        type: 'datetime-local',
        value: localDateTimeValue(),
      }) +
      renderInput('subject', 'Assunto', { attributes: 'maxlength="120"' }) +
      renderTextarea('notes', 'Detalhes do atendimento', { attributes: 'maxlength="2000"' });
  }

  if (view === 'reminders') {
    const clients = await requestApi('clients');
    const authorizedClients = clients.filter(
      (client) => Number(client.message_consent) === 1 && client.phone,
    );
    html =
      renderSelect('client_id', 'Cliente autorizado', authorizedClients) +
      renderSelect('type', 'Tipo de lembrete', labelOptions(reminderTypeLabels)) +
      renderInput('due_date', 'Data do lembrete', { type: 'date' }) +
      renderTextarea('message', 'Mensagem', {
        required: true,
        attributes: 'maxlength="500" placeholder="Escreva a mensagem que será usada no contato"',
      }) +
      '<p class="hint">A lista mostra somente clientes que autorizaram mensagens e possuem telefone.</p>';
  }

  if (view === 'products') {
    const partners = await requestApi('partners');
    const suppliers = partners.filter((partner) => partner.type === 'supplier');
    html =
      renderInput('name', 'Nome do produto') +
      renderInput('category', 'Categoria') +
      renderSelect('supplier_id', 'Fornecedor', suppliers, {
        required: false,
        emptyLabel: 'Sem fornecedor vinculado',
      }) +
      renderInput('price', 'Preço (R$)', {
        type: 'number',
        attributes: 'min="0" step="0.01"',
      }) +
      renderInput('stock', 'Quantidade em estoque', {
        type: 'number',
        attributes: 'min="0" step="1"',
      });
  }

  if (view === 'sales') {
    const clients = await requestApi('clients');
    products = await requestApi('products');
    html =
      renderSelect('client_id', 'Cliente', clients) +
      `<div class="sale-items-heading"><strong>Itens da venda</strong><span>Até 50 itens</span></div>` +
      `<div id="sale-items">${renderSaleItem(products)}</div>` +
      '<button id="add-sale-item" class="secondary add-sale-item" type="button">+ Adicionar produto</button>' +
      renderInput('payment_date', 'Data do pagamento', {
        type: 'date',
        value: localDateTimeValue().slice(0, 10),
        attributes: `max="${localDateTimeValue().slice(0, 10)}"`,
      }) +
      renderInput('paid', 'Valor pago (R$)', {
        type: 'number',
        attributes: 'min="0" step="0.01"',
        value: 0,
      }) +
      '<p class="sale-total" id="sale-total">Total: R$ 0,00</p>';
  }

  if (view === 'orders') {
    const [clients, partners] = await Promise.all([requestApi('clients'), requestApi('partners')]);
    const laboratories = partners.filter((partner) => partner.type === 'laboratory');
    html =
      renderSelect('client_id', 'Cliente', clients) +
      renderSelect('laboratory_id', 'Laboratório', laboratories, {
        required: false,
        emptyLabel: 'Sem laboratório vinculado',
      }) +
      renderInput('description', 'Serviço', { attributes: 'maxlength="500"' }) +
      renderTextarea('prescription', 'Resumo da receita', { attributes: 'maxlength="2000"' }) +
      renderInput('delivery', 'Previsão de entrega', { type: 'date' });
  }

  const form = selectElement('#record-form');
  form.dataset.method = record ? 'PATCH' : 'POST';
  form.dataset.recordId = record?.id || '';
  selectElement('#modal-title').textContent =
    view === 'clients' && record ? 'Editar cliente' : formTitles[view];
  selectElement('#fields').innerHTML = html;
  selectElement('#modal').classList.toggle('wide-modal', view === 'sales');
  if (view === 'clients' && record) {
    ['name', 'phone', 'email', 'birth_date', 'next_contact_date', 'notes'].forEach((field) => {
      form.elements[field].value = record[field] ?? '';
    });
  }
  selectElement('#form-error').textContent = '';
  selectElement('#modal').showModal();
  const fields = selectElement('#fields');
  fields.oninput = () => {
    if (view === 'sales') {
      updateSaleTotal(products);
      updateAddSaleItemButton();
    }
  };
  fields.onclick = (event) => {
    if (view !== 'sales') return;
    if (event.target.closest('#add-sale-item')) {
      const rows = selectElement('#sale-items');
      const lastRow = rows.lastElementChild;
      const productId = lastRow.querySelector('.sale-product').value;
      const quantity = Number(lastRow.querySelector('.sale-quantity').value);
      if (productId && Number.isInteger(quantity) && quantity > 0 && rows.children.length < 50) {
        rows.insertAdjacentHTML('beforeend', renderSaleItem(products));
      }
    }
    const removeButton = event.target.closest('.remove-sale-item');
    if (removeButton && document.querySelectorAll('.sale-item-row').length > 1) {
      removeButton.closest('.sale-item-row').remove();
    }
    updateSaleTotal(products);
    updateAddSaleItemButton();
  };
  if (view === 'sales') updateAddSaleItemButton();
}
