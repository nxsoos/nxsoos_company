import type { Snapshot } from '../shared/types';
let token = '';
export async function establishSession() {
  const r = await fetch('/api/session');
  if (!r.ok) throw new Error('The local company service is not available.');
  token = (await r.json()).token;
}
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Company-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
export const loadSnapshot = () => api<Snapshot>('snapshot');
