// Cliente da API PHP. Todas as chamadas usam o cookie de sessão; alterações enviam o token CSRF.
export const API_URL = import.meta.env.VITE_API_URL || 'api/index.php';

let csrfToken = '';
let onUnauthorized = () => {};

export function setCsrf(token) {
  csrfToken = token || '';
}
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export function apiUrl(action, params = {}) {
  const search = new URLSearchParams({ action });
  for (const [key, value] of Object.entries(params)) {
    // "action" é a rota da API e nunca pode ser sobrescrita por um filtro.
    if (key === 'action' || value === undefined || value === null || value === '') continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return `${API_URL}?${search.toString()}`;
}

async function request(method, action, { params, body, form } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(apiUrl(action, params), { method, headers, body: payload, credentials: 'same-origin' });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 300) || 'Resposta inválida do servidor.' };
  }
  if (!response.ok) {
    if (response.status === 401 && action !== 'login') onUnauthorized();
    throw new ApiError(data?.error || `Erro ${response.status}`, response.status, data);
  }
  return data;
}

export const api = {
  get: (action, params) => request('GET', action, { params }),
  post: (action, body, params) => request('POST', action, { body, params }),
  patch: (action, body, params) => request('PATCH', action, { body, params }),
  del: (action, params, body) => request('DELETE', action, { params, body }),
  upload: (action, form, params) => request('POST', action, { form, params }),
};

/** Baixa um arquivo gerado pela API (ex.: CSV) mantendo a sessão. */
export async function downloadPost(action, body, filename) {
  const response = await fetch(apiUrl(action), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!response.ok) throw new ApiError('Não foi possível gerar o arquivo.', response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pdfUrl(type, id, download = false) {
  return apiUrl('pdf', { type, id, download: download ? 1 : undefined });
}
