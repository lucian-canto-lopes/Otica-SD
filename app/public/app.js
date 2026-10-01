import { selectElement } from './js/utils.js';
import { pageTitles, createButtonLabels } from './js/constants.js';
import { requestApi, setSession } from './js/api.js';
import { renderRecordsTable } from './js/tables.js';
import { renderDashboard } from './js/dashboard.js';
import { openRecordForm } from './js/forms.js';

let currentView;

function showNotice(errorOrMessage) {
  selectElement('#notice').textContent = errorOrMessage.message || errorOrMessage;
}

function showLogin() {
  selectElement('#login').hidden = false;
  selectElement('#app').hidden = true;
}

async function startApplication() {
  const session = await requestApi('me');
  setSession(session);
  selectElement('#login').hidden = true;
  selectElement('#app').hidden = false;
  selectElement('#username').textContent = session.user.name;
  selectElement('#context').textContent = session.company?.name || 'ADMINISTRAÇÃO DA PLATAFORMA';

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
    showLogin();
  } catch (error) {
    showNotice(error);
  }
}

function bindEvents() {
  selectElement('#nav').onclick = (event) => {
    const button = event.target.closest('[data-view]');
    if (button) {
      loadPage(button.dataset.view).catch(showNotice);
    }
  };
  selectElement('#record-form').onsubmit = saveRecord;
  selectElement('#login-form').onsubmit = submitLogin;
  selectElement('#close-modal').onclick = () => selectElement('#modal').close();
  selectElement('#logout').onclick = logout;
}

bindEvents();
startApplication().catch(showLogin);
