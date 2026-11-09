import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from '../server/app.js';

const directory = resolve('.runtime', 'production-probe-' + Date.now());
const { app } = await createApp({ directory, staticDirectory: resolve('dist') });
try {
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const html = await fetch(address);
  if (!html.ok || !(await html.text()).includes('Nxsoos Company'))
    throw new Error('Built interface did not serve.');
  const session = await fetch(address + '/api/session');
  const cookie = session.headers.get('set-cookie')!.split(';')[0];
  const { token } = (await session.json()) as { token: string };
  const snapshot = await fetch(address + '/api/snapshot', { headers: { cookie } });
  if (!snapshot.ok) throw new Error('Authenticated snapshot failed.');
  const backup = await fetch(address + '/api/backup', {
    method: 'POST',
    headers: { cookie, 'x-company-token': token, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const result = (await backup.json()) as { path: string };
  if (!backup.ok || !existsSync(result.path)) throw new Error('SQLite backup failed.');
  const exported = await fetch(address + '/api/export', { headers: { cookie } });
  if (!exported.ok || !((await exported.json()) as any).records.length)
    throw new Error('Memory export failed.');
  console.log(
    'PASS: production interface, local session, snapshot, SQLite backup, and memory export.',
  );
} finally {
  await app.close();
}
