import { selectElement, escapeHtml, formatMoney } from './utils.js';
import { requestApi } from './api.js';
import { formTitles } from './constants.js';

function renderInput(name, label, type = 'text', attributes = '') {
  return `
    <label>
      ${label}
      <input name="${name}" type="${type}" required ${attributes}>
    </label>
  `;
}

function renderSelect(name, label, items) {
  const options = items
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join('');
  return `
    <label>
      ${label}
      <select name="${name}" required>
        <option value="">Selecione</option>
        ${options}
      </select>
    </label>
  `;
}

export async function openRecordForm(view) {
  let html = '';
  let clients = [];
  let products = [];
  if (view === 'companies') {
    html =
      renderInput('name', 'Nome da ótica') +
      renderInput('document', 'CNPJ ou identificação') +
      renderInput('plan', 'Plano', 'text', 'value="Essencial"') +
      renderInput('email', 'E-mail do responsável', 'email') +
      renderInput(
        'password',
        'Senha inicial',
        'password',
        'minlength="8" maxlength="72" autocomplete="new-password"',
      );
  }
  if (view === 'clients') {
    html =
      renderInput('name', 'Nome completo') +
      renderInput('phone', 'Telefone', 'tel') +
      '<label>Observações<textarea name="notes"></textarea></label>';
  }
  if (view === 'products') {
    html =
      renderInput('name', 'Nome do produto') +
      renderInput('category', 'Categoria') +
      renderInput('price', 'Preço (R$)', 'number', 'min="0" step="0.01"') +
      renderInput('stock', 'Quantidade em estoque', 'number', 'min="0" step="1"');
  }
  if (['sales', 'orders'].includes(view)) {
    clients = await requestApi('clients');
    html = renderSelect('client_id', 'Cliente', clients);
    if (view === 'sales') {
      products = await requestApi('products');
      html +=
        renderSelect(
          'product_id',
          'Produto',
          products
            .filter((product) => product.stock > 0)
            .map((product) => ({
              ...product,
              name: `${product.name} · ${formatMoney(product.price)} · ${product.stock} un.`,
            })),
        ) +
        renderInput('quantity', 'Quantidade', 'number', 'min="1" step="1" value="1"') +
        renderInput('paid', 'Valor pago (R$)', 'number', 'min="0" step="0.01" value="0"') +
        '<p class="hint" id="sale-total">Selecione um produto para calcular o total.</p>';
    } else {
      html +=
        renderInput('description', 'Serviço', 'text', 'maxlength="500"') +
        '<label>Resumo da receita<textarea name="prescription"></textarea></label>' +
        renderInput('delivery', 'Previsão de entrega', 'date');
    }
  }
  selectElement('#modal-title').textContent = formTitles[view];
  selectElement('#fields').innerHTML = html;
  selectElement('#form-error').textContent = '';
  selectElement('#modal').showModal();
  selectElement('#fields').oninput = () => {
    if (view === 'sales') {
      const form = selectElement('#record-form');
      const product = products.find((product) => product.id == form.elements.product_id.value);
      selectElement('#sale-total').textContent =
        'Total: ' +
        formatMoney(product ? Number(product.price) * Number(form.elements.quantity.value) : 0);
    }
  };
}
