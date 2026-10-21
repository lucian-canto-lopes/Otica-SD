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
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
}

export function formatDateTime(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return match
    ? `${match[3]}/${match[2]}/${match[1]} às ${match[4]}:${match[5]}`
    : formatDate(value);
}
