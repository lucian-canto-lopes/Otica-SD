export function selectElement(selector) {
  return document.querySelector(selector);
}

// Dados vindos da API precisam ser escapados antes de entrar em templates HTML.
export function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

export function formatMoney(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(value) {
  return escapeHtml(value?.split('-').reverse().join('/') || '—');
}
