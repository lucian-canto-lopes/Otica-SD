import { selectElement } from './js/utils.js?v=6';
import { pageTitles, createButtonLabels } from './js/constants.js?v=6';
import { requestApi, setSession } from './js/api.js?v=6';
import { renderRecordsTable } from './js/tables.js?v=12';
import { renderDashboard } from './js/dashboard.js?v=7';
import { openRecordForm } from './js/forms.js?v=11';
import { bindBrandingForm, renderBranding } from './js/branding.js?v=6';
import { renderRecordDetails, renderRecordCollection } from './js/details.js?v=1';

let currentView;
let currentSession;

function showNotice(errorOrMessage) {
  selectElement('#notice').textContent = errorOrMessage.message || errorOrMessage;
}

function showLogin() {
  selectElement('#login').hidden = false;
  selectElement('#app').hidden = true;
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('ocular-theme', theme);

  const toggle = selectElement('#theme-toggle');
  toggle.querySelector('span').textContent = isDark ? '☀' : '☾';
  toggle.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
  toggle.title = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
}

async function startApplication() {
  const session = await requestApi('me');
  currentSession = session;
  setSession(session);
  selectElement('#login').hidden = true;
  selectElement('#app').hidden = false;
  selectElement('#username').textContent = session.user.name;
  selectElement('#context').textContent = session.company?.name || 'ADMINISTRAÇÃO DA PLATAFORMA';
  updateWorkspaceBrand(session.company);
  selectElement('#edit-appearance').hidden = !session.company;

  const availablePages =
    session.user.role === 'platform_admin'
      ? ['companies']
      : [
          'dashboard',
          'clients',
          'interactions',
          'reminders',
          'products',
          'partners',
          'sales',
          'orders',
        ];
  const navigationIcons = {
    companies: '◇',
    dashboard: '◈',
    clients: '○',
    interactions: '◌',
    reminders: '◷',
    products: '▦',
    partners: '⌘',
    sales: '↗',
    orders: '▤',
  };
  selectElement('#nav').innerHTML = availablePages
    .map(
      (page) => `
    <button data-view="${page}">
      <span>${navigationIcons[page]}</span> &nbsp;${pageTitles[page]}
    </button>
  `,
    )
    .join('');
  await loadPage(availablePages[0]);
}

async function loadPage(page = currentView) {
  currentView = page;
  selectElement('#notice').textContent = '';
  selectElement('#title').textContent = pageTitles[page];
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === page);
  });

  if (page === 'dashboard') {
    const indicators = await requestApi('dashboard');
    const orders = await requestApi('orders');
    selectElement('#content').innerHTML = renderDashboard(indicators, orders);
    bindRecordDetailRows('orders', orders);
    document.querySelectorAll('[data-dashboard-card]').forEach((card) => {
      card.onclick = () => openDashboardDetails(card.dataset.dashboardCard).catch(showNotice);
    });
    return;
  }

  if (page === 'branding') {
    const company = await requestApi('branding');
    selectElement('#content').innerHTML = renderBranding(company);
    bindBrandingForm(company, brandingSaved);
    return;
  }

  const records = await requestApi(page);
  const countLabels = {
    companies: 'óticas cadastradas',
    clients: 'clientes',
    interactions: 'interações registradas',
    reminders: 'lembretes',
    products: 'produtos',
    partners: 'parceiros',
    sales: 'vendas',
    orders: 'ordens de serviço',
  };
  const countLabel = countLabels[page] || 'registros';
  const pageHint =
    page === 'companies'
      ? '<p class="hint">Gerencie o acesso das empresas. A exclusão remove permanentemente a ótica e todos os dados vinculados.</p>'
      : page === 'reminders'
        ? '<p class="hint">Os lembretes aparecem automaticamente para acompanhamento, aniversário, renovação um ano após o pagamento e retirada de ordens prontas.</p>'
        : '';
  selectElement('#content').innerHTML = `
    <div class="toolbar">
      <h2>${records.length} ${countLabel}</h2>
      <button id="new">+ ${createButtonLabels[page]}</button>
    </div>
    ${renderRecordsTable(page, records)}
    ${pageHint}
  `;
  selectElement('#new').onclick = () => openRecordForm(page).catch(showNotice);
  bindRecordDetailRows(page, records);
  document.querySelectorAll('[data-status]').forEach((select) => {
    select.onchange = () => updateStatus(select, page).catch(showNotice);
  });
  document.querySelectorAll('[data-edit]').forEach((button) => {
    button.onclick = () => {
      const record = records.find((item) => String(item.id) === button.dataset.edit);
      if (record) {
        openRecordForm(page, {
          ...record,
          phone: record.phone || record.client_phone || button.dataset.editPhone || '',
        }).catch(showNotice);
      }
    };
  });
  document.querySelectorAll('[data-delete-company]').forEach((button) => {
    button.onclick = () => {
      const record = records.find((item) => String(item.id) === button.dataset.deleteCompany);
      if (record) deleteCompany(record, button).catch(showNotice);
    };
  });
}

function openDetails(title, content) {
  selectElement('#details-title').textContent = title;
  selectElement('#details-content').innerHTML = content;
  selectElement('#details-modal').showModal();
}

function bindRecordDetailRows(view, records) {
  document.querySelectorAll('[data-record-id]').forEach((row) => {
    const openRecord = (event) => {
      if (
        event.target !== row &&
        event.target.closest('button, select, a, input, summary, details')
      ) {
        return;
      }
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      if (event.type === 'keydown') event.preventDefault();

      const record = records.find((item) => String(item.id) === row.dataset.recordId);
      if (!record) return;
      const details = renderRecordDetails(view, record);
      openDetails(details.title, details.content);
    };
    row.onclick = openRecord;
    row.onkeydown = openRecord;
  });
}

function daysUntilBirthday(value) {
  const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!match) return Number.POSITIVE_INFINITY;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let birthday = new Date(today.getFullYear(), Number(match[1]) - 1, Number(match[2]));
  if (birthday < today) {
    birthday = new Date(today.getFullYear() + 1, Number(match[1]) - 1, Number(match[2]));
  }
  return Math.round((birthday.getTime() - today.getTime()) / 86_400_000);
}

async function openDashboardDetails(key) {
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const definitions = {
    clients: { title: 'Clientes cadastrados', action: 'clients', view: 'clients' },
    products: { title: 'Peças em estoque', action: 'products', view: 'products' },
    revenue: { title: 'Vendas acumuladas', action: 'sales', view: 'sales' },
    receivable: {
      title: 'Valores a receber',
      action: 'sales',
      view: 'sales',
      filter: (record) => Number(record.total) > Number(record.paid),
    },
    upcoming_birthdays: {
      title: 'Próximos aniversários',
      action: 'clients',
      view: 'clients',
      filter: (record) => daysUntilBirthday(record.birth_date) <= 30,
    },
    pending_reminders: {
      title: 'Lembretes pendentes',
      action: 'reminders',
      view: 'reminders',
      filter: (record) => record.status === 'pending',
    },
    overdue_orders: {
      title: 'Ordens atrasadas',
      action: 'orders',
      view: 'orders',
      filter: (record) => record.delivery < localToday && record.status !== 'delivered',
    },
    low_stock: {
      title: 'Produtos com estoque baixo',
      action: 'products',
      view: 'products',
      filter: (record) => Number(record.stock) <= 3,
    },
  };
  const definition = definitions[key];
  if (!definition) return;

  let records = await requestApi(definition.action);
  if (definition.filter) records = records.filter(definition.filter);
  openDetails(definition.title, renderRecordCollection(definition.view, records));
}

async function deleteCompany(company, button) {
  const confirmed = window.confirm(
    `Excluir a ótica “${company.name}”? Todos os usuários e dados vinculados serão apagados permanentemente.`,
  );
  if (!confirmed) return;

  button.disabled = true;
  try {
    await requestApi('companies', { id: company.id }, 'DELETE');
    await loadPage('companies');
    showNotice(`Ótica “${company.name}” excluída.`);
  } catch (error) {
    button.disabled = false;
    throw error;
  }
}

async function updateStatus(select, page) {
  await requestApi(page, { id: select.dataset.status, status: select.value }, 'PATCH');
  await loadPage();
  showNotice(page === 'reminders' ? 'Lembrete atualizado.' : 'Etapa atualizada.');
}

async function brandingSaved(company) {
  currentSession.company = { ...currentSession.company, ...company };
  selectElement('#context').textContent = company.name;
  updateWorkspaceBrand(currentSession.company);
  showNotice('Identidade da ótica atualizada.');
}

function updateWorkspaceBrand(company) {
  const name = company?.name || 'Ocular';
  const logo = company?.logo_data || null;
  const image = selectElement('#workspace-brand-logo');
  const symbol = selectElement('.workspace-brand-symbol');

  selectElement('#workspace-brand-name').textContent = name;
  image.hidden = !logo;
  symbol.hidden = Boolean(logo);
  if (logo) {
    image.src = logo;
    image.alt = `Logo de ${name}`;
  } else {
    image.removeAttribute('src');
    image.alt = '';
  }
}

async function saveRecord(event) {
  event.preventDefault();
  const saveButton = selectElement('#save');
  saveButton.disabled = true;
  try {
    const input = Object.fromEntries(new FormData(event.target));
    if (currentView === 'sales') {
      input.items = [...event.target.querySelectorAll('.sale-item-row')].map((row) => ({
        product_id: row.querySelector('.sale-product').value,
        quantity: row.querySelector('.sale-quantity').value,
      }));
      delete input.item_product_id;
      delete input.item_quantity;
    }
    const method = event.target.dataset.method || 'POST';
    if (method === 'PATCH') {
      input.id = event.target.dataset.recordId;
    }
    await requestApi(currentView, input, method);
    selectElement('#modal').close();
    await loadPage();
    showNotice('Registro salvo com sucesso.');
  } catch (error) {
    selectElement('#form-error').textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const loginButton = event.target.querySelector('button');
  loginButton.disabled = true;
  selectElement('#login-error').textContent = '';
  try {
    const credentials = Object.fromEntries(new FormData(event.target));
    await requestApi('login', credentials);
    await startApplication();
  } catch (error) {
    selectElement('#login-error').textContent = error.message;
  } finally {
    loginButton.disabled = false;
  }
}

async function logout() {
  try {
    await requestApi('logout', {});
    setSession(null);
    currentSession = null;
    showLogin();
  } catch (error) {
    showNotice(error);
  }
}

function bindEvents() {
  applyTheme(document.documentElement.dataset.theme || 'light');
  selectElement('#theme-toggle').onclick = toggleTheme;
  selectElement('#nav').onclick = (event) => {
    const button = event.target.closest('[data-view]');
    if (button) {
      loadPage(button.dataset.view).catch(showNotice);
    }
  };
  selectElement('#edit-appearance').onclick = (event) => {
    loadPage(event.currentTarget.dataset.view).catch(showNotice);
  };
  selectElement('#record-form').onsubmit = saveRecord;
  selectElement('#login-form').onsubmit = submitLogin;
  selectElement('#close-modal').onclick = () => selectElement('#modal').close();
  selectElement('#close-details').onclick = () => selectElement('#details-modal').close();
  selectElement('#logout').onclick = logout;
}

bindEvents();
startApplication().catch(showLogin);
