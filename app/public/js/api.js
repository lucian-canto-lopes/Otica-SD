let currentSession = null;

export function setSession(session) {
  currentSession = session;
}

export async function requestApi(action, body, method = 'POST') {
  const response = await fetch('/api/index.php?action=' + action, {
    method: body ? method : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': currentSession?.csrf ?? '' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 413) {
      throw new Error('A imagem excedeu o limite permitido de 2 MB.');
    }
    throw new Error(result?.error || 'O servidor não conseguiu processar a solicitação.');
  }
  if (!result) {
    throw new Error('O servidor devolveu uma resposta inválida.');
  }
  return result;
}
