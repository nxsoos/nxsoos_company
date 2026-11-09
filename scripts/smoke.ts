import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createApp } from '../server/app.js';
import type { Task } from '../shared/types.js';
const root = resolve('.runtime', 'live-smoke-' + Date.now());
await mkdir(join(root, 'project'), { recursive: true });
await writeFile(
  join(root, 'project', 'README.md'),
  '# Smoke test fixture\nThis folder is exclusively for testing Nxsoos Company.\n',
);
const { app, engine, store } = await createApp({ directory: join(root, 'data') });
let completed = false;
try {
  await engine.connect();
  store.update('settings', 'main', { defaultBudget: 250000 });
  const project = await engine.addProject({
    name: 'Live smoke fixture',
    path: join(root, 'project'),
    description: 'A disposable company integration test.',
  });
  const request = engine.message(
    project.id,
    'Use company_create_task to assign a developer to create greeting.txt with exactly Hello from Nxsoos Company! followed by a newline. This is a tiny disposable test fixture. Do not run commands or modify other files. The automatic reviewer should read the file and confirm the exact content. Explain the outcome when the reviewer finishes.',
  );
  const deadline = Date.now() + 180000;
  let last = '';
  while (Date.now() < deadline) {
    const tasks = store.list<Task>('task').filter((t) => t.requestId === request.id);
    const summary = tasks.map((t) => `${t.role}: ${t.status}`).join(', ');
    if (summary !== last) {
      console.log(summary || 'CEO planning');
      last = summary;
    }
    if (
      tasks.some((t) => t.role === 'reviewer' && t.status === 'completed') &&
      !engine.busyScopes.size &&
      ![...engine.ceoQueues.values()].some((q) => q.length)
    ) {
      const content = await readFile(join(root, 'project', 'greeting.txt'), 'utf8');
      if (content !== 'Hello from Nxsoos Company!\n')
        throw new Error('File content did not match.');
      completed = true;
      console.log(
        'LIVE PASS: CEO delegation, scoped write, evidence, automatic review, project memory, and CEO explanation.',
      );
      console.log('Reported tokens:', store.get('request', request.id).tokens);
      break;
    }
    if (tasks.some((t) => t.status === 'failed'))
      console.log(
        'Task failure:',
        tasks.filter((t) => t.status === 'failed').map((t) => t.error),
      );
    if (store.get('request', request.id).budgetPaused)
      throw new Error('Smoke test request reached its budget.');
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!completed) {
    console.log(store.list('message').map((m) => ({ author: m.author, text: m.text })));
    throw new Error('Live company workflow did not complete within three minutes.');
  }
} catch (e: any) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await app.close();
}
