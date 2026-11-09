import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bridgeToken, defaultDirectory, readJson } from '../server/local.js';
const directory = defaultDirectory();
mkdirSync(directory, { recursive: true });
const command = process.argv[2] || 'company';
const descriptor = join(directory, 'service.json');
async function health() {
  const info = readJson<any>(descriptor);
  if (!info || !/^http:\/\/127\.0\.0\.1:\d+$/.test(info.url)) return null;
  try {
    const response = await fetch(info.url + '/api/health', { signal: AbortSignal.timeout(1000) });
    const value: any = await response.json();
    return value.application === 'nxsoos-company' &&
      value.protocol === 2 &&
      value.directory === directory &&
      value.instanceId === info.instanceId
      ? info
      : null;
  } catch {
    return null;
  }
}
async function wait() {
  for (let i = 0; i < 100; i++) {
    const current = await health();
    if (current) return current;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Local service did not become ready. Read service.log in ' + directory);
}
try {
  let service = await health();
  if (command === 'stop') {
    if (service) {
      await fetch(service.url + '/api/control/stop', {
        method: 'POST',
        headers: { 'x-company-bridge': bridgeToken(directory) },
      });
      console.log(
        'Stopping the local service. Browser checks drain safely; external Codex continues running.',
      );
    } else console.log('No compatible local service is running.');
  } else {
    if (!['company', 'visualizer'].includes(command))
      throw new Error('Choose company, visualizer, or stop.');
    if (!service) {
      const lock = join(directory, 'launch.lock');
      let owner = false;
      try {
        const handle = openSync(lock, 'wx');
        closeSync(handle);
        owner = true;
      } catch (error: any) {
        if (error.code !== 'EEXIST') throw error;
        try {
          const age = Date.now() - (await import('node:fs')).statSync(lock).mtimeMs;
          if (age > 30000) {
            unlinkSync(lock);
            const handle = openSync(lock, 'wx');
            closeSync(handle);
            owner = true;
          }
        } catch {}
      }
      if (owner) {
        try {
          const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
          const server = join(root, 'dist-server', 'index.js');
          if (!existsSync(server)) throw new Error('Run npm run build before launching.');
          const port = Number(process.env.PORT || 4310);
          try {
            const probe = await fetch(`http://127.0.0.1:${port}/api/health`, {
              signal: AbortSignal.timeout(500),
            });
            if (probe.status) {
              const raw = await probe.text();
              let value: any;
              try {
                value = JSON.parse(raw);
              } catch {}
              if (value?.application === 'nxsoos-company' && value.directory === directory) {
                throw new Error(
                  'Another company process owns this data directory. Stop the previous service before launching this release.',
                );
              }
              throw new Error(
                `Port ${port} is occupied. Stop the older service or choose a different PORT and data directory.`,
              );
            }
          } catch (e: any) {
            if (!/fetch failed|timeout|aborted/i.test(e.message)) throw e;
          }
          const log = openSync(join(directory, 'service.log'), 'a');
          const child = spawn(process.execPath, [server], {
            cwd: root,
            detached: true,
            windowsHide: true,
            stdio: ['ignore', log, log],
            env: { ...process.env, COMPANY_DATA_DIR: directory, COMPANY_SINGLETON: '1' },
          });
          child.unref();
          closeSync(log);
          service = await wait();
        } finally {
          if (existsSync(lock)) unlinkSync(lock);
        }
      } else service = await wait();
    }
    if (command === 'company') {
      const response = await fetch(service.url + '/api/control/company', {
        method: 'POST',
        headers: { 'x-company-bridge': bridgeToken(directory) },
      });
      if (!response.ok) throw new Error('Company activation failed.');
    }
    const url = service.url + (command === 'company' ? '/company' : '/visualizer');
    console.log(
      `${command === 'company' ? 'Company' : 'Companion visualizer'}: ${url}\nStop the local service with npm run stop.`,
    );
    if (process.env.COMPANY_NO_OPEN !== '1') {
      const browser =
        process.platform === 'win32'
          ? 'explorer.exe'
          : process.platform === 'darwin'
            ? 'open'
            : 'xdg-open';
      const child = spawn(browser, [url], { windowsHide: true, stdio: 'ignore' });
      child.on('error', () => console.log('Open the printed URL in your browser.'));
      child.unref();
    }
  }
} catch (error: any) {
  console.error(error.message);
  process.exitCode = 1;
}
