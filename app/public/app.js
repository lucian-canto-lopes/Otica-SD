import { selectElement } from './js/utils.js?v=4';
import { pageTitles, createButtonLabels } from './js/constants.js?v=4';
import { requestApi, setSession } from './js/api.js?v=4';
import { renderRecordsTable } from './js/tables.js?v=4';
import { renderDashboard } from './js/dashboard.js?v=4';
import { openRecordForm } from './js/forms.js?v=4';
import { bindBrandingForm, renderBranding } from './js/branding.js?v=4';

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
      : ['dashboard', 'clients', 'products', 'sales', 'orders'];
  const navigationIcons = ['◈', '○', '▦', '↗', '▤'];
  selectElement('#nav').innerHTML = availablePages
    .map(
      (page, index) => `
    <button data-view="${page}">
      <span>${navigationIcons[index]}</span> &nbsp;${pageTitles[page]}
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
    return;
  }

  if (page === 'branding') {
    const company = await requestApi('branding');
    selectElement('#content').innerHTML = renderBranding(company);
    bindBrandingForm(company, brandingSaved);
    return;
  }

  const records = await requestApi(page);
  const countLabel = page === 'companies' ? 'óticas cadastradas' : 'registros';
  const subscriptionHint =
    page === 'companies'
      ? '<p class="hint">Gerencie o acesso das empresas. As assinaturas são controladas manualmente neste protótipo.</p>'
      : '';
  selectElement('#content').innerHTML = `
    <div class="toolbar">
      <h2>${records.length} ${countLabel}</h2>
      <button id="new">+ ${createButtonLabels[page]}</button>
    </div>
    ${renderRecordsTable(page, records)}
    ${subscriptionHint}
  `;
  selectElement('#new').onclick = () => openRecordForm(page).catch(showNotice);
  document.querySelectorAll('[data-status]').forEach((select) => {
    select.onchange = () => updateStatus(select, page).catch(showNotice);
  });
}

async function updateStatus(select, page) {
  await requestApi(page, { id: select.dataset.status, status: select.value }, 'PATCH');
  await loadPage();
  showNotice('Etapa atualizada.');
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
    await requestApi(currentView, input);
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
  selectElement('#logout').onclick = logout;
}

bindEvents();
startApplication().catch(showLogin);
