// ─── API CLIENT ───────────────────────────────────────────────────────────────
// En producción (Railway), VITE_API_URL apunta al backend deployado.
// En desarrollo local, Vite proxea /api → localhost:3001 automáticamente.
const BASE = import.meta.env.VITE_API_URL || '';

async function req(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getAll:   ()         => req('GET',    '/producciones'),
  save:     (prod)     => req('PUT',    `/producciones/${prod.id}`, prod),
  delete:   (id)       => req('DELETE', `/producciones/${id}`),
};
