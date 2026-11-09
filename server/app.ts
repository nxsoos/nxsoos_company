import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, stat, realpath } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { Store, now, id } from './store.js';
import { Codex } from './codex.js';
import { Engine } from './engine.js';
import { Collector } from './companion/collector.js';
import { bridgeToken } from './local.js';
import { companyProjection } from './companion/company.js';
import { NativeFolderPicker } from './folder-picker.js';

export async function createApp(options: {
  directory: string;
  codex?: Codex;
  staticDirectory?: string;
  activateCompany?: boolean;
  instanceId?: string;
  pickFolder?: (initial: string) => Promise<string | null>;
}) {
  const app = Fastify({ logger: false, bodyLimit: 1100000 });
  const store = new Store(options.directory);
  let companyEngine: Engine | undefined;
  const getEngine = () => (companyEngine ||= new Engine(store, options.codex || new Codex()));
  if (options.activateCompany) getEngine();
  const collector = new Collector(store);
  const nativePicker = new NativeFolderPicker();
  const bridgeCredential = bridgeToken(options.directory);
  const instanceId = options.instanceId || id();
  const token = randomBytes(32).toString('hex');
  const clients = new Set<any>();
  const same = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) && host !== 'localhost:80')
      return reply.code(403).send({ error: 'Local connections only.' });
    const origin = req.headers.origin;
    if (origin) {
      try {
        const url = new URL(origin);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        )
          return reply.code(403).send({ error: 'Origin is not allowed.' });
      } catch {
        return reply.code(403).send({ error: 'Invalid origin.' });
      }
    }
    if (req.headers['sec-fetch-site'] === 'cross-site')
      return reply.code(403).send({ error: 'Cross-site requests are not allowed.' });
    const pathname = req.url.split('?')[0];
    if (pathname === '/api/companion/events' || pathname.startsWith('/api/control/')) {
      if (!same(String(req.headers['x-company-bridge'] || ''), bridgeCredential))
        return reply.code(403).send({ error: 'Invalid bridge credential.' });
    } else if (req.url.startsWith('/api/') && !['/api/session', '/api/health'].includes(pathname)) {
      const cookie =
        String(req.headers.cookie || '')
          .split(';')
          .map((s) => s.trim())
          .find((s) => s.startsWith('company_session='))
          ?.slice(16) || '';
      if (!same(cookie, token))
        return reply
          .code(401)
          .send({ error: 'Open the company app to establish a local session.' });
      if (
        !['GET', 'HEAD'].includes(req.method) &&
        !same(String(req.headers['x-company-token'] || ''), token)
      )
        return reply.code(403).send({ error: 'Missing local session token.' });
    }
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Frame-Options', 'DENY');
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((error, req, reply) => {
    reply.code(400).send({ error: error instanceof Error ? error.message : 'Request failed.' });
  });
  app.get('/api/session', async (_, reply) => {
    reply.header('Set-Cookie', `company_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
    return { token };
  });
  const inertSnapshot = () => ({
    projects: store.list('project'),
    tasks: store.list('task'),
    requests: store.list('request'),
    messages: store.list('message'),
    evidence: store.list('evidence'),
    activities: store.events(),
    approvals: store.list('approval'),
    preferences: store.list('preference'),
    profile: store.profile(),
    paused: store.settings().paused,
    ceoBusy: [],
    settings: store.settings(),
    runtime: {
      state: 'disconnected',
      authenticated: false,
      verified: false,
      executable: '',
      version: '',
      message: 'Company execution has not been activated.',
      models: [],
      model: '',
      rateLimits: null,
    },
  });
  app.get('/api/snapshot', async () =>
    companyEngine ? companyEngine.snapshot() : inertSnapshot(),
  );
  app.get('/api/health', async () => ({
    application: 'nxsoos-company',
    protocol: 2,
    instanceId,
    directory: resolve(options.directory),
    companyActive: !!companyEngine,
  }));
  app.post('/api/company/activate', async () => {
    getEngine();
    return { active: true };
  });
  app.post('/api/control/company', async () => {
    getEngine();
    return { active: true };
  });
  app.post('/api/control/stop', async (_, reply) => {
    reply.send({ stopping: true });
    setImmediate(() => void app.close());
  });
  app.post('/api/companion/events', async (req) => collector.ingest(req.body));
  app.get('/api/companion/snapshot', async () => {
    const snapshot = collector.snapshot(!!companyEngine);
    const browser = companyProjection(store, companyEngine);
    return {
      ...snapshot,
      sessions: [...snapshot.sessions, ...browser.sessions],
      messages: [...snapshot.messages, ...browser.messages],
    };
  });
  app.post('/api/companion/clear', async () => {
    collector.clear();
    return { ok: true };
  });
  app.get('/api/events', async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    clients.add(reply.raw);
    const last = Number(req.headers['last-event-id'] || 0);
    for (const e of store.events(last, 300))
      reply.raw.write(`id: ${e.id}\nevent: activity\ndata: ${JSON.stringify(e)}\n\n`);
    reply.raw.write('event: changed\ndata: {}\n\n');
    const keepalive = setInterval(() => reply.raw.write(': heartbeat\n\n'), 20000);
    req.raw.on('close', () => {
      clearInterval(keepalive);
      clients.delete(reply.raw);
    });
  });
  let notificationTimer: NodeJS.Timeout | undefined;
  store.on('change', () => {
    if (!notificationTimer)
      notificationTimer = setTimeout(() => {
        notificationTimer = undefined;
        for (const client of clients) client.write('event: changed\ndata: {}\n\n');
      }, 100);
  });
  store.on('activity', (event) => {
    for (const client of clients)
      client.write(`id: ${event.id}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`);
  });
  app.post('/api/projects', async (req) =>
    getEngine().addProject(
      z
        .object({
          name: z.string().trim().min(1).max(100),
          path: z.string().min(1).max(1000),
          description: z.string().max(3000),
        })
        .parse(req.body),
    ),
  );
  app.post('/api/folders/pick', async (req) => {
    const { path: initial } = z.object({ path: z.string().max(2000).optional() }).parse(req.body);
    const path = await (options.pickFolder || ((value: string) => nativePicker.select(value)))(
      initial || '',
    );
    if (!path) return { path: null };
    const canonical = await realpath(path);
    if (!(await stat(canonical)).isDirectory()) throw new Error('Select a folder.');
    return { path: canonical };
  });
  app.get('/api/folders', async (req) => {
    const input = z.object({ path: z.string().optional() }).parse(req.query);
    const root = await realpath(input.path || homedir());
    if (!(await stat(root)).isDirectory()) throw new Error('Folder not found.');
    const entries = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith('.'))
      .slice(0, 150)
      .map((e) => ({ name: e.name, path: join(root, e.name) }));
    return { path: root, parent: dirname(root), folders: entries };
  });
  app.post('/api/messages', async (req) => {
    const body = z
      .object({ projectId: z.string().nullable(), text: z.string().trim().min(1).max(16000) })
      .parse(req.body);
    return getEngine().message(body.projectId, body.text);
  });
  app.post('/api/codex/connect', async () => {
    await getEngine().connect();
    return getEngine().codex.state;
  });
  app.post('/api/codex/verify', async () => {
    await getEngine().verify();
    return getEngine().codex.state;
  });
  app.post('/api/codex/login', async () => {
    await getEngine().connect();
    return getEngine().codex.rpc('account/login/start', { type: 'chatgpt' });
  });
  app.post('/api/codex/refresh', async () => {
    await getEngine().codex.refreshAccount();
    return getEngine().codex.state;
  });
  app.post('/api/company/pause', async () => {
    await getEngine().pause();
    return { ok: true };
  });
  app.post('/api/company/resume', async () => {
    getEngine().resume();
    return { ok: true };
  });
  app.post('/api/tasks/:id/cancel', async (req) => {
    await getEngine().cancelTask((req.params as any).id);
    return { ok: true };
  });
  app.post('/api/tasks/:id/resume', async (req) => {
    getEngine().resumeTask((req.params as any).id);
    return { ok: true };
  });
  app.post('/api/tasks/:id/priority', async (req) => {
    const { priority } = z.object({ priority: z.number().int().min(-10).max(10) }).parse(req.body);
    store.update('task', (req.params as any).id, { priority });
    getEngine().schedule();
    return { ok: true };
  });
  app.post('/api/requests/:id/extend', async (req) => {
    getEngine().extendBudget((req.params as any).id);
    return { ok: true };
  });
  app.post('/api/approvals/:id', async (req) => {
    const body = z
      .object({ accept: z.boolean(), answer: z.string().max(6000).optional() })
      .parse(req.body);
    if (
      !getEngine().answerApproval((req.params as any).id, body.accept ? body.answer || true : false)
    )
      throw new Error('This approval is no longer pending.');
    return { ok: true };
  });
  app.post('/api/profile', async (req) => {
    const body = z
      .object({
        name: z.string().max(100),
        experience: z.string().max(1000),
        style: z.string().max(6000),
        updates: z.string().max(1000),
        examples: z.string().max(8000),
        onboarded: z.boolean(),
      })
      .parse(req.body);
    getEngine().saveProfile(body);
    return store.profile();
  });
  app.post('/api/preferences', async (req) => {
    const body = z.object({ instruction: z.string().trim().min(3).max(2000) }).parse(req.body);
    return getEngine().proposePreference(body.instruction);
  });
  app.post('/api/preferences/:id', async (req) => {
    const body = z.object({ action: z.enum(['accept', 'decline', 'undo']) }).parse(req.body);
    getEngine().preference((req.params as any).id, body.action);
    return { ok: true };
  });
  app.post('/api/settings', async (req) => {
    const body = z
      .object({
        maxEmployees: z.number().int().min(1).max(4),
        defaultBudget: z.number().int().min(1000).max(1000000),
        model: z.string().max(100),
      })
      .parse(req.body);
    if (body.model && !getEngine().codex.state.models.some((m) => m.id === body.model))
      throw new Error('Connect Codex and select a returned model.');
    store.update('settings', 'main', body);
    getEngine().schedule();
    return store.settings();
  });
  app.get('/api/export', async (_, reply) =>
    reply
      .header('Content-Disposition', 'attachment; filename="nxsoos-company-memory.json"')
      .send(store.export()),
  );
  app.post('/api/backup', async () => {
    const file = join(store.directory, 'backup-' + now().replace(/[:.]/g, '-') + '.sqlite');
    store.db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
    store.event('backup', 'Local database backup created.');
    return { path: file };
  });
  if (options.staticDirectory && existsSync(join(options.staticDirectory, 'index.html'))) {
    await app.register(fastifyStatic, { root: resolve(options.staticDirectory) });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/')
        ? reply.code(404).send({ error: 'Endpoint not found.' })
        : reply.sendFile('index.html'),
    );
  }
  app.addHook('preClose', async () => {
    nativePicker.close();
    for (const client of clients) client.end();
  });
  app.addHook('onClose', async () => {
    clearTimeout(notificationTimer);
    for (const client of clients) client.end();
    await collector.close();
    if (companyEngine) await companyEngine.shutdown();
    store.close();
  });
  return {
    app,
    get engine() {
      return getEngine();
    },
    get companyActive() {
      return !!companyEngine;
    },
    store,
    collector,
  };
}
