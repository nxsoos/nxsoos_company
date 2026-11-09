import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createApp } from './app.js';
import { existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { atomicJson, defaultDirectory, readJson } from './local.js';
import { id } from './store.js';
const directory = defaultDirectory();
const lock = join(directory, 'service.lock');
(await import('node:fs')).mkdirSync(directory, { recursive: true });
if (existsSync(lock)) {
  const owner = readJson<any>(lock);
  let alive = false;
  if (owner?.pid)
    try {
      process.kill(owner.pid, 0);
      alive = true;
    } catch {}
  if (alive)
    throw new Error(
      'A company service already owns this data directory. Use npm run company or npm run visualizer to reuse it.',
    );
  unlinkSync(lock);
}
const lockHandle = openSync(lock, 'wx');
closeSync(lockHandle);
atomicJson(lock, { pid: process.pid });
const instanceId = id();
const { app } = await createApp({ directory, staticDirectory: resolve('dist'), instanceId });
const port = Number(process.env.PORT || 4310);
app.addHook('onClose', async () => {
  if (readJson<any>(join(directory, 'service.json'))?.instanceId === instanceId)
    unlinkSync(join(directory, 'service.json'));
  if (readJson<any>(lock)?.pid === process.pid) unlinkSync(lock);
});
try {
  await app.listen({ host: '127.0.0.1', port });
} catch (error) {
  await app.close();
  if (existsSync(lock)) unlinkSync(lock);
  throw error;
}
const address = app.server.address();
const actualPort = typeof address === 'object' && address ? address.port : port;
atomicJson(join(directory, 'service.json'), {
  url: `http://127.0.0.1:${actualPort}`,
  instanceId,
  pid: process.pid,
  protocol: 2,
});
console.log(`Nxsoos Company service: http://127.0.0.1:${actualPort}`);
console.log(`Local data: ${directory}`);
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('Stopping the company. Bounded checks may take up to two minutes to finish safely.');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
