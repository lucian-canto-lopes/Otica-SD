import { escapeHtml, selectElement } from './utils.js?v=6';
import { requestApi } from './api.js?v=6';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function renderBranding(company) {
  const logo = company.logo_data
    ? `<img class="branding-preview-image" src="${company.logo_data}" alt="Logo atual">`
    : '<span class="branding-placeholder">◎</span>';

  return `
    <section class="settings-card">
      <div>
        <span class="eyebrow">IDENTIDADE VISUAL</span>
        <h2>Nome e logo da sua ótica</h2>
        <p>Essas informações aparecem no seu espaço de trabalho.</p>
      </div>
      <form id="branding-form">
        <div class="branding-preview" id="branding-preview">${logo}</div>
        <label>
          Nome da ótica
          <input name="name" maxlength="120" required value="${escapeHtml(company.name)}">
        </label>
        <label>
          Logo
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp">
        </label>
        <p class="hint">PNG, JPEG ou WebP, com no máximo 2 MB.</p>
        <label class="remove-logo">
          <input name="remove_logo" type="checkbox"> Remover o logo atual
        </label>
        <div id="branding-error" role="alert"></div>
        <button>Salvar identidade</button>
      </form>
    </section>
  `;
}

export function bindBrandingForm(company, onSaved) {
  const form = selectElement('#branding-form');
  const fileInput = form.elements.logo;
  let selectedLogo = company.logo_data || null;

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type) || file.size > MAX_LOGO_BYTES) {
      showBrandingError('Escolha uma imagem PNG, JPEG ou WebP de até 2 MB.');
      fileInput.value = '';
      return;
    }
    selectedLogo = await readFileAsDataUrl(file);
    selectElement('#branding-preview').innerHTML =
      `<img class="branding-preview-image" src="${selectedLogo}" alt="Prévia do novo logo">`;
    form.elements.remove_logo.checked = false;
    showBrandingError('');
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const logoData = form.elements.remove_logo.checked ? null : selectedLogo;
      const result = await requestApi(
        'branding',
        { name: form.elements.name.value, logo_data: logoData },
        'PATCH',
      );
      await onSaved(result);
    } catch (error) {
      showBrandingError(error.message);
    } finally {
      button.disabled = false;
    }
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function showBrandingError(message) {
  selectElement('#branding-error').textContent = message;
}
