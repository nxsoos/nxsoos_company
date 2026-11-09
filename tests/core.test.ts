import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, id, now } from '../server/store';
import { readScoped, writeScoped, scopedPath, hash, listFiles } from '../server/files';
import { Codex } from '../server/codex';
import { Engine } from '../server/engine';
import { createApp } from '../server/app';
import { referencedProject } from '../shared/project-reference';
import { folderPickerScript } from '../server/folder-picker';
import { execFileSync } from 'node:child_process';
import type { Task } from '../shared/types';

const stores: Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'nxsoos-test-'));
  const project = join(root, 'project');
  await mkdir(project);
  const store = new Store(join(root, 'data'));
  stores.push(store);
  const codex = new Codex();
  const engine = new Engine(store, codex);
  const p = await engine.addProject({ name: 'Test', path: project, description: 'A fixture' });
  const request = {
    id: id(),
    projectId: p.id,
    text: 'Test',
    tokens: 0,
    budget: 50000,
    budgetPaused: false,
    createdAt: now(),
  };
  store.put('request', request);
  return { root, project, store, codex, engine, p, request };
}
describe('native project folder selection', () => {
  it.skipIf(process.platform !== 'win32')(
    'initializes the Windows Common Item Dialog with folder-only options',
    () => {
      const script = folderPickerScript + '\n[NxsoosFolderPicker]::Validate()';
      const result = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-STA',
          '-EncodedCommand',
          Buffer.from(script, 'utf16le').toString('base64'),
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 15000 },
      );
      expect(result.trim()).toBe('True');
    },
  );
  it('requires browser mutation authentication and preserves cancellation without activating Company', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nxsoos-picker-'));
    const pickFolder = vi.fn().mockResolvedValueOnce(directory).mockResolvedValueOnce(null);
    const service = await createApp({ directory: join(directory, 'data'), pickFolder });
    try {
      expect(
        (await service.app.inject({ method: 'POST', url: '/api/folders/pick', payload: {} }))
          .statusCode,
      ).toBe(401);
      expect(pickFolder).not.toHaveBeenCalled();
      const session = await service.app.inject({ url: '/api/session' });
      const headers = {
        cookie: String(session.headers['set-cookie']).split(';')[0],
        'x-company-token': session.json().token,
      };
      expect(
        (
          await service.app.inject({
            method: 'POST',
            url: '/api/folders/pick',
            headers: { cookie: headers.cookie },
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
      const initial = 'C:\\Projects\\a folder';
      const selected = await service.app.inject({
        method: 'POST',
        url: '/api/folders/pick',
        headers,
        payload: { path: initial },
      });
      expect(selected.statusCode).toBe(200);
      expect(selected.json().path).toBe(directory);
      expect(pickFolder).toHaveBeenCalledWith(initial);
      expect(
        (
          await service.app.inject({
            method: 'POST',
            url: '/api/folders/pick',
            headers,
            payload: {},
          })
        ).json(),
      ).toEqual({ path: null });
      expect(service.companyActive).toBe(false);
    } finally {
      await service.app.close();
    }
  });
});

describe('project boundary and direct-edit protection', () => {
  it('rejects traversal, absolute paths, credentials, and links', async () => {
    const { project, root } = await setup();
    await writeFile(join(root, 'secret.txt'), 'secret');
    await expect(scopedPath(project, '../secret.txt')).rejects.toThrow();
    await expect(scopedPath(project, join(root, 'secret.txt'))).rejects.toThrow();
    await expect(scopedPath(project, '.env')).rejects.toThrow();
    await expect(scopedPath(project, '.ENV.production')).rejects.toThrow();
    await expect(scopedPath(project, '.git./config', true)).rejects.toThrow();
    await expect(scopedPath(project, 'file.txt:secret', true)).rejects.toThrow();
    await mkdir(join(project, '.git'));
    await expect(scopedPath(project, '.GIT/config', true)).rejects.toThrow();
    await symlink(root, join(project, 'escape'), 'junction');
    await expect(scopedPath(project, 'escape/secret.txt')).rejects.toThrow();
  });
  it('preserves a human edit when a stale agent write arrives', async () => {
    const { project } = await setup();
    await writeFile(join(project, 'hello.txt'), 'first');
    const before = await readScoped(project, 'hello.txt');
    await writeFile(join(project, 'hello.txt'), 'human edit');
    await expect(writeScoped(project, 'hello.txt', 'agent edit', before.hash)).rejects.toThrow(
      'CONFLICT',
    );
    expect(await readFile(join(project, 'hello.txt'), 'utf8')).toBe('human edit');
  });
  it('creates files and updates only with the current hash', async () => {
    const { project } = await setup();
    await writeScoped(project, 'src/greeting.txt', 'hello', null);
    await writeScoped(project, 'src/greeting.txt', 'world', hash('hello'));
    expect((await readScoped(project, 'src/greeting.txt')).content).toBe('world');
    await expect(writeScoped(project, 'src/greeting.txt', 'overwrite', null)).rejects.toThrow(
      'CONFLICT',
    );
  });
});
describe('company workflow', () => {
  it('routes an overview request to one named registered project and preserves explicit scope', async () => {
    const { engine, codex, store, p, root } = await setup();
    const other = join(root, 'map-markers');
    await mkdir(other);
    const map = await engine.addProject({ name: 'map-markers', path: other, description: '' });
    codex.state.state = 'ready';
    codex.state.authenticated = true;
    vi.spyOn(engine as any, 'pumpCEO').mockResolvedValue(undefined);
    const request = engine.message(null, 'Look at map-makers and explain what it is about.');
    expect(request.projectId).toBe(map.id);
    expect(store.list('message').find((m) => m.requestId === request.id)?.projectId).toBe(map.id);
    expect(engine.message(null, 'Explain MAP MARKERS.').projectId).toBe(map.id);
    expect(engine.message(null, 'How does it work?').projectId).toBe(map.id);
    expect(engine.message(null, 'Explain Test.').projectId).toBe(p.id);
    expect(engine.message(null, 'Make that simpler.').projectId).toBe(p.id);
    expect(engine.message(p.id, 'Compare this with map-markers.').projectId).toBe(p.id);
    expect(engine.message(null, 'Explain Test and map-markers.').projectId).toBe(null);
    expect(engine.message(null, 'Help me organize my projects.').projectId).toBe(null);
    const projects = store.list('project');
    expect(
      referencedProject(
        [...projects, { ...map, id: 'duplicate', name: 'map-makers' }],
        'Explain map makers.',
      ),
    ).toBeUndefined();
    expect(referencedProject(projects, 'Explain contest results.')).toBeUndefined();
  });
  it('keeps projects separate and rejects cross-request dependencies', async () => {
    const { engine, p, request, root } = await setup();
    const other = join(root, 'other');
    await mkdir(other);
    const p2 = await engine.addProject({ name: 'Work', path: other, description: '' });
    const task = engine.createTask(p.id, request.id, {
      role: 'developer',
      title: 'Build',
      brief: 'Do work',
      acceptance: 'Works',
      dependencies: [],
    });
    expect(() =>
      engine.createTask(p2.id, request.id, {
        role: 'reviewer',
        title: 'Review',
        brief: 'Review',
        acceptance: 'Works',
        dependencies: [task.id],
      }),
    ).toThrow();
    await expect(
      engine.addProject({ name: 'Duplicate', path: p.path, description: '' }),
    ).rejects.toThrow('overlaps');
  });
  it('enforces a four-worker ceiling and serializes project writers', async () => {
    const { engine, codex, store, p, request, root } = await setup();
    codex.state.state = 'ready';
    codex.state.authenticated = true;
    const started: string[] = [];
    (engine as any).runTask = async (t: Task) => {
      started.push(t.id);
    };
    engine.createTask(p.id, request.id, {
      role: 'developer',
      title: 'Write 1',
      brief: 'x',
      acceptance: 'x',
    });
    engine.createTask(p.id, request.id, {
      role: 'developer',
      title: 'Write 2',
      brief: 'x',
      acceptance: 'x',
    });
    for (let i = 0; i < 5; i++)
      engine.createTask(p.id, request.id, {
        role: 'researcher',
        title: 'Read ' + i,
        brief: 'x',
        acceptance: 'x',
      });
    await (engine as any).dispatch();
    expect(started.length).toBe(4);
    expect(
      store.list<Task>('task').filter((t) => t.role === 'developer' && t.status === 'working'),
    ).toHaveLength(1);
    expect(store.list<Task>('task').filter((t) => t.status === 'queued')).toHaveLength(3);
  });
  it('requires approval before persistent preference changes and supports undo', async () => {
    const { engine, store } = await setup();
    const original = store.profile().style;
    const p = engine.proposePreference('Use an example before jargon.');
    expect(store.profile().style).toBe(original);
    engine.preference(p.id, 'accept');
    expect(store.profile().style).toContain('Use an example');
    engine.preference(p.id, 'undo');
    expect(store.profile().style).toBe(original);
  });
  it('does not replay active assignments after service restart', async () => {
    const { engine, store, p, request } = await setup();
    const t = engine.createTask(p.id, request.id, {
      role: 'developer',
      title: 'Partial',
      brief: 'x',
      acceptance: 'x',
    });
    store.update('task', t.id, { status: 'working' });
    const restarted = new Engine(store, new Codex());
    expect(store.get<Task>('task', t.id)?.status).toBe('interrupted');
    expect(store.settings().paused).toBe(true);
    expect(restarted.sessions.size).toBe(0);
  });
  it('blocks work with failed prerequisites and bounds assignment count', async () => {
    const { engine, store, p, request, codex } = await setup();
    const first = engine.createTask(p.id, request.id, {
      role: 'developer',
      title: 'Build',
      brief: 'x',
      acceptance: 'x',
    });
    store.update('task', first.id, { status: 'failed' });
    const review = engine.createTask(p.id, request.id, {
      role: 'reviewer',
      title: 'Review',
      brief: 'x',
      acceptance: 'x',
      dependencies: [first.id],
    });
    codex.state.state = 'ready';
    codex.state.authenticated = true;
    (engine as any).runTask = async () => {};
    await (engine as any).dispatch();
    expect(store.get<Task>('task', review.id)?.status).toBe('blocked');
    for (let i = 0; i < 10; i++)
      engine.createTask(p.id, request.id, {
        role: 'researcher',
        title: 'Read',
        brief: 'x',
        acceptance: 'x',
      });
    expect(() =>
      engine.createTask(p.id, request.id, {
        role: 'researcher',
        title: 'Overflow',
        brief: 'x',
        acceptance: 'x',
      }),
    ).toThrow('twelve');
  });
  it('automatically reviews developer work without an unnecessary CEO turn', async () => {
    const { engine, store, p, request } = await setup();
    const task = engine.createTask(p.id, request.id, {
      role: 'developer',
      title: 'Create a file',
      brief: 'x',
      acceptance: 'File exists',
    });
    const session: any = {
      threadId: 'worker',
      turnId: 'turn',
      projectId: p.id,
      requestId: request.id,
      taskId: task.id,
      role: 'developer',
      text: JSON.stringify({ summary: 'Created the file.', verdict: 'pass', findings: [] }),
      cancelled: false,
    };
    engine.sessions.set(session.threadId, session);
    await (engine as any).finish(session, { status: 'completed' });
    const reviewer = store.list<Task>('task').find((t) => t.role === 'reviewer');
    expect(reviewer?.dependencies).toEqual([task.id]);
    expect(engine.ceoQueues.get(p.id)?.length || 0).toBe(0);
    expect(store.get('project', p.id).summary).toContain('Created the file.');
  });
  it('interrupts work at the reported-token budget and requires extension', async () => {
    const { engine, store, p, request } = await setup();
    store.update('request', request.id, { budget: 1000 });
    const task = engine.createTask(p.id, request.id, {
      role: 'researcher',
      title: 'Read',
      brief: 'x',
      acceptance: 'x',
    });
    const session: any = {
      threadId: 'budget-worker',
      turnId: null,
      projectId: p.id,
      requestId: request.id,
      taskId: task.id,
      role: 'researcher',
      cancelled: false,
    };
    engine.sessions.set(session.threadId, session);
    await (engine as any).notification('thread/tokenUsage/updated', {
      threadId: session.threadId,
      tokenUsage: { total: { totalTokens: 1500 } },
    });
    expect(store.get('request', request.id).budgetPaused).toBe(true);
    expect(store.get<Task>('task', task.id)?.status).toBe('interrupted');
    engine.extendBudget(request.id);
    expect(store.get('request', request.id).budgetPaused).toBe(false);
    expect(store.get('request', request.id).budget).toBe(51000);
  });
  it('keeps a cancelled writer locked until interruption is confirmed', async () => {
    const { engine, store, p, request, codex } = await setup();
    const first = engine.createTask(p.id, request.id, {
      role: 'developer',
      title: 'First',
      brief: 'x',
      acceptance: 'x',
    });
    const second = engine.createTask(p.id, request.id, {
      role: 'developer',
      title: 'Second',
      brief: 'x',
      acceptance: 'x',
    });
    store.update('task', first.id, { status: 'working' });
    const session: any = {
      threadId: 'cancel-worker',
      turnId: null,
      projectId: p.id,
      requestId: request.id,
      taskId: first.id,
      role: 'developer',
      cancelled: false,
    };
    engine.sessions.set(session.threadId, session);
    await engine.cancelTask(first.id);
    codex.state.state = 'ready';
    codex.state.authenticated = true;
    let started = false;
    (engine as any).runTask = async () => {
      started = true;
    };
    await (engine as any).dispatch();
    expect(started).toBe(false);
    expect(store.get<Task>('task', second.id)?.status).toBe('queued');
  });
  it('waits for a command approval and resolves a decline without executing', async () => {
    const { engine, store, p, request } = await setup();
    const task = engine.createTask(p.id, request.id, {
      role: 'reviewer',
      title: 'Check',
      brief: 'x',
      acceptance: 'x',
    });
    const result = engine.approval(task.id, 'command', 'Run check?', 'git status');
    expect(store.get<Task>('task', task.id)?.status).toBe('awaiting_input');
    const approval = store.list('approval')[0];
    engine.answerApproval(approval.id, false);
    expect(await result).toBe(false);
    expect(store.get('approval', approval.id).status).toBe('declined');
  });
  it('holds a Windows sandbox check in stopping until execution completes', async () => {
    if (process.platform !== 'win32') return;
    const { engine, store, p, request } = await setup();
    const task = engine.createTask(p.id, request.id, {
      role: 'reviewer',
      title: 'Bounded check',
      brief: 'Verify',
      acceptance: 'Exit zero',
    });
    store.update('task', task.id, { status: 'reviewing' });
    store.put('process', { id: task.id, processId: 'native-check' });
    const session: any = {
      threadId: 'windows-check',
      turnId: null,
      projectId: p.id,
      requestId: request.id,
      taskId: task.id,
      role: 'reviewer',
      cancelled: false,
    };
    engine.sessions.set(session.threadId, session);
    await engine.cancelTask(task.id);
    expect(store.get<Task>('task', task.id)?.status).toBe('stopping');
    expect(store.get<Task>('task', task.id)?.error).toContain('remains locked');
    store.update('process', task.id, { processId: null });
    await engine.interruptSession(session, 'Check finished.', true);
    expect(store.get<Task>('task', task.id)?.status).toBe('cancelled');
  });
  it('restores interrupted CEO jobs as visible history without replaying them', async () => {
    const { store, p, request } = await setup();
    store.put('ceoJob', {
      id: id(),
      projectId: p.id,
      requestId: request.id,
      text: 'Pending request',
      status: 'queued',
      createdAt: now(),
    });
    const restarted = new Engine(store, new Codex());
    expect(store.list('ceoJob')[0].status).toBe('interrupted');
    expect(store.list('message').at(-1).text).toContain('not automatically replayed');
    expect(restarted.ceoQueues.size).toBe(0);
  });
});
describe('HTTP session security and persistence', () => {
  it('rejects remote origins and mutations without a local token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nxsoos-http-'));
    const { app } = await createApp({ directory });
    try {
      expect(
        (await app.inject({ url: '/api/session', headers: { origin: 'https://example.com' } }))
          .statusCode,
      ).toBe(403);
      const session = await app.inject({ url: '/api/session' });
      expect(session.statusCode).toBe(200);
      const cookie = String(session.headers['set-cookie']).split(';')[0];
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/company/resume',
            headers: { cookie },
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
      const token = session.json().token;
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/company/resume',
            headers: { cookie, 'x-company-token': token },
            payload: {},
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await app.inject({ url: '/api/snapshot', headers: { cookie } })).json().tasks,
      ).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
