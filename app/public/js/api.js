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
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Falha de conexão.');
  }
  return result;
}
