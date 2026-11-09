import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  appendFileSync,
  copyFileSync,
  symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'smol-toml';
import { Store, id, now } from '../server/store';
import { Collector } from '../server/companion/collector';
import { linkIntegration, unlinkIntegration } from '../server/integration';
import { spawn } from 'node:child_process';
import { TESTED_CODEX_VERSION } from '../server/codex';
import { bridgeToken, readJson, atomicJson, redact, digest } from '../server/local';
import { nativeProfile } from '../server/profile';
import { handleHook } from '../scripts/hook';
import { readTranscript, parseTranscriptLine, allowedTranscript } from '../server/companion/transcript';
import { createApp } from '../server/app';
const disposers: Array<() => Promise<unknown> | void> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose();
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'nxsoos-companion-'));
  const home = join(directory, 'codex');
  mkdirSync(join(home, 'sessions'), { recursive: true });
  const store = new Store(join(directory, 'data'));
  const manifest = linkIntegration(store.directory, {
    codexHome: home,
    hookFile: resolve('dist-server/hook.js'),
    version: TESTED_CODEX_VERSION,
  });
  const collector = new Collector(store);
  disposers.push(
    () => store.close(),
    () => collector.close(),
  );
  const event = (fields: any = {}) => ({
    id: id(),
    installationId: manifest.id,
    timestamp: now(),
    hook_event_name: 'SessionStart',
    session_id: 'root',
    cwd: join(directory, 'project'),
    ...fields,
  });
  return { directory, home, store, manifest, collector, event };
}
describe('observed active projects',()=>{
  it('attributes each employee independently and ignores delayed events and tool results',async()=>{
    const {directory,collector,event,store}=fixture();
    const original=join(directory,'movie-list'), maps=join(directory,'map-markers'), company=join(directory,'nxsoos_company');
    for(const folder of [original,maps,company]) {mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'package.json'),'{}');}
    const start=Date.now()+100;
    collector.ingest(event({cwd:original,timestamp:new Date(start).toISOString()}));
    collector.ingest(event({cwd:original,hook_event_name:'SubagentStart',agent_id:'nova',agent_type:'nxsoos_developer',timestamp:new Date(start+1).toISOString()}));
    collector.ingest(event({cwd:original,hook_event_name:'PreToolUse',agent_id:'nova',tool_name:'exec_command',tool_input:{workdir:maps,cmd:'npm test'},timestamp:new Date(start+200).toISOString()}));
    collector.ingest(event({cwd:original,hook_event_name:'PreToolUse',tool_name:'exec_command',tool_input:{workdir:company},timestamp:new Date(start+100).toISOString()}));
    collector.ingest(event({cwd:original,hook_event_name:'PreToolUse',agent_id:'nova',tool_name:'exec_command',tool_input:{workdir:original},timestamp:new Date(start+50).toISOString()}));
    collector.ingest(event({cwd:original,hook_event_name:'PostToolUse',agent_id:'nova',tool_name:'read_file',tool_response:{path:join(company,'app.ts')},timestamp:new Date(start+300).toISOString()}));
    expect(store.get('observedSession','nova').activeProject.path).toBe(maps);
    expect(store.get('observedSession','root').activeProject.path).toBe(company);
    expect(store.get('observedSession','root').cwd).toBe(original);
    collector.ingest(event({cwd:original,hook_event_name:'PreToolUse',agent_id:'nova',tool_name:'exec_command',tool_input:{workdir:company},timestamp:new Date(start+400).toISOString()}));
    expect(store.get('observedSession','nova').activeProject.path).toBe(company);
  });
  it('backfills existing connected native code-mode calls without changing session workspace',async()=>{
    const {directory,collector,event,store,home}=fixture();
    const target=join(directory,'nxsoos_company');mkdirSync(target);writeFileSync(join(target,'package.json'),'{}');
    const timestamp=now(), transcript=join(home,'sessions','project.jsonl');
    writeFileSync(transcript,[
      {type:'session_meta',payload:{id:'root'}},
      {timestamp,type:'response_item',payload:{type:'custom_tool_call',name:'exec',input:'text(await tools.exec_command({cmd:"npm test",workdir:'+JSON.stringify(target)+'}));'}},
      {timestamp,type:'response_item',payload:{type:'function_call_output',name:'read_file',output:JSON.stringify({path:join(directory,'wrong','app.ts')})}},
    ].map(row=>JSON.stringify(row)).join('\n')+'\n');
    collector.ingest(event({transcript_path:transcript}));
    collector.message('root','tool',JSON.stringify({workdir:join(directory,'wrong')}),'',timestamp,'exec_command','untrusted-result');
    await collector.poll();
    expect(store.get('observedSession','root').activeProject.path).toBe(target);
    expect(store.get('observedSession','root').cwd).not.toBe(target);
  });
});

describe('reversible Codex integration', () => {
  it.skipIf(process.platform !== 'win32')(
    'delivers stdin and profile output through PowerShell and cmd with literal special-character paths',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'nxsoos-shell-'));
      const special = join(directory, "company $cash `tick 'quoted' & spaces");
      mkdirSync(special);
      const hookFile = join(special, 'hook.js');
      copyFileSync(resolve('dist-server/hook.js'), hookFile);
      const store = new Store(join(special, 'data'));
      disposers.push(() => store.close());
      const manifest = linkIntegration(store.directory, {
        codexHome: join(special, 'codex'),
        hookFile,
        version: TESTED_CODEX_VERSION,
      });
      const command = manifest.hookGroups.SessionStart.hooks[0].command;
      for (const shell of ['powershell', 'cmd']) {
        const output = await new Promise<string>((done, reject) => {
          const child =
            shell === 'powershell'
              ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
                  windowsHide: true,
                  stdio: ['pipe', 'pipe', 'pipe'],
                })
              : spawn(command, [], {
                  shell: true,
                  windowsHide: true,
                  stdio: ['pipe', 'pipe', 'pipe'],
                });
          let result = '',
            error = '';
          const deadline = setTimeout(() => child.kill(), 4000);
          child.stdout.on('data', (data) => (result += data));
          child.stderr.on('data', (data) => (error += data));
          child.on('error', reject);
          child.on('exit', (code) => {
            clearTimeout(deadline);
            code === 0 ? done(result) : reject(new Error(error || 'Hook timed out.'));
          });
          child.stdin.end(
            JSON.stringify({
              session_id: shell,
              hook_event_name: 'UserPromptSubmit',
              prompt: 'Literal input survives stdin.',
            }),
          );
        });
        expect(JSON.parse(output).hookSpecificOutput.additionalContext).toContain('Atlas');
      }
      const queued = readdirSync(join(store.directory, 'bridge-queue')).map((file) =>
        readJson<any>(join(store.directory, 'bridge-queue', file)),
      );
      expect(queued.map((event) => event.session_id).sort()).toEqual(['cmd', 'powershell']);
      expect(queued.every((event) => event.prompt === 'Literal input survives stdin.')).toBe(true);
    },
  );
  it('preserves existing hooks, is repeatable, and removes only owned entries', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nxsoos-link-'));
    const home = join(directory, 'codex');
    mkdirSync(home);
    const existing = {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing' }] }] },
    };
    writeFileSync(join(home, 'hooks.json'), JSON.stringify(existing));
    const options = {
      codexHome: home,
      hookFile: resolve('dist-server/hook.js'),
      version: TESTED_CODEX_VERSION,
    };
    const first = linkIntegration(join(directory, 'data'), options);
    linkIntegration(join(directory, 'data'), options);
    const data = readJson<any>(join(home, 'hooks.json'));
    expect(data.hooks.Stop).toHaveLength(2);
    expect(data.hooks.Stop[0]).toEqual(existing.hooks.Stop[0]);
    const developer = first.files.find((f) => f.path.includes('developer'))!;
    expect((parse(readFileSync(developer.path, 'utf8')) as any).name).toBe('nxsoos_developer');
    appendFileSync(developer.path, '# user customization\n');
    const result = unlinkIntegration(join(directory, 'data'));
    expect(result.preserved).toContain(developer.path);
    expect(readJson<any>(join(home, 'hooks.json')).hooks.Stop).toEqual(existing.hooks.Stop);
    expect(readFileSync(developer.path, 'utf8')).toContain('user customization');
  });
  it('preserves inline TOML configuration and hooks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nxsoos-inline-'));
    const home = join(directory, 'codex');
    mkdirSync(home);
    const original =
      'model = "existing-model"\n[[hooks.Stop]]\n[[hooks.Stop.hooks]]\ntype = "command"\ncommand = "echo existing"\n';
    writeFileSync(join(home, 'config.toml'), original);
    const options = {
      codexHome: home,
      hookFile: resolve('dist-server/hook.js'),
      version: TESTED_CODEX_VERSION,
    };
    linkIntegration(join(directory, 'data'), options);
    linkIntegration(join(directory, 'data'), options);
    const config: any = parse(readFileSync(join(home, 'config.toml'), 'utf8'));
    expect(config.model).toBe('existing-model');
    expect(config.hooks.Stop).toHaveLength(2);
    unlinkIntegration(join(directory, 'data'));
    expect((parse(readFileSync(join(home, 'config.toml'), 'utf8')) as any).hooks.Stop).toHaveLength(
      1,
    );
  });
});
describe('observer lifecycle and conversation capture', () => {
  it.skipIf(process.platform !== 'win32')('accepts contained extended-length drive paths without accepting escaped or device paths', async () => {
    const { home, directory } = fixture();
    const file = join(home, 'sessions', 'native.jsonl');
    writeFileSync(file, JSON.stringify({ type: 'session_meta', payload: { id: 'native' } }) + '\n');
    expect(await allowedTranscript('\\\\?\\' + file, home)).toBe(file);
    const outside = join(directory, 'outside.jsonl');
    writeFileSync(outside, 'unrelated');
    await expect(allowedTranscript('\\\\?\\' + outside, home)).rejects.toThrow('outside');
    await expect(allowedTranscript('\\\\?\\GLOBALROOT\\Device\\sessions\\native.jsonl', home)).rejects.toThrow('outside');
    await expect(allowedTranscript('\\\\?\\UNC\\host\\share\\native.jsonl', home)).rejects.toThrow('outside');
    await expect(allowedTranscript('\\\\.\\pipe\\native.jsonl', home)).rejects.toThrow('outside');
  });
  it('routes ordinary employee hooks without changing root identity or reviving completed work', async () => {
    const { collector, store, home, event } = fixture();
    const rootPath = join(home, 'sessions', 'root.jsonl');
    const childPath = join(home, 'sessions', 'child.jsonl');
    writeFileSync(rootPath, JSON.stringify({ type: 'session_meta', payload: { id: 'root' } }) + '\n');
    writeFileSync(childPath, JSON.stringify({ type: 'session_meta', payload: { id: 'child' } }) + '\n');
    collector.ingest(event({ transcript_path: rootPath }));
    collector.ingest(event({ hook_event_name: 'Stop', transcript_path: rootPath }));
    collector.ingest(event({ hook_event_name: 'SubagentStart', agent_id: 'child', agent_type: 'nxsoos_developer', transcript_path: childPath }));
    const childTool = event({ hook_event_name: 'PreToolUse', agent_id: 'child', tool_name: 'read_file', transcript_path: childPath });
    collector.ingest(childTool);
    // Simulate records written by the previous collector before its routing fix.
    store.update('observedSession', 'root', { state: 'working', transcriptPath: childPath });
    const wronglyRouted = { ...store.list('observedMessage').find(message => message.tool === 'read_file'), id: digest(JSON.stringify(['root', 'tool', '', 'read_file', childTool.id])), sessionId: 'root' };
    store.put('observedMessage', wronglyRouted);
    await collector.poll();
    expect(store.get('observedSession', 'root').transcriptPath).toBe(rootPath);
    expect(store.get('observedSession', 'root').state).toBe('idle');
    expect(store.get('observedSession', 'child').state).toBe('working');
    expect(store.get('observedSession', 'child').coverage).toBe('complete');
    expect(store.list('observedMessage').find(message => message.tool === 'read_file').sessionId).toBe('child');
    expect(store.list('observedMessage').filter(message => message.tool === 'read_file')).toHaveLength(1);
    collector.ingest(event({ hook_event_name: 'PreModelRequest', agent_id: 'root', transcript_path: rootPath }));
    expect(store.get('observedSession', 'root').parentId).toBeNull();
    store.update('observedSession', 'root', { updatedAt: new Date(Date.now() - 130000).toISOString(), ownerPid: process.pid });
    collector.processChecks.set(process.pid, { at: Date.now(), matches: true });
    expect(collector.snapshot().sessions.find(session => session.id === 'root')?.state).toBe('unknown');
  });
  it('buckets observed usage into rolling time windows and excludes future samples', () => {
    const { collector, store } = fixture();
    [0.5, 24, 8 * 24, 31 * 24, -1].forEach((hours, index) => store.put('observedUsage', {
      id: String(index), key: String(index), sessionId: 'root', timestamp: new Date(Date.now() - hours * 3600000).toISOString(),
      inputTokens: 10, cachedInputTokens: 5, outputTokens: 2, totalTokens: 12,
    }));
    const usage = collector.usage();
    expect(usage.hour.totalTokens).toBe(12);
    expect(usage.week.totalTokens).toBe(24);
    expect(usage.month.totalTokens).toBe(36);
    expect(usage.month.cachedInputTokens).toBe(15);
  });
  it('captures completed turns, per-response usage and reported plan windows without double counting', async () => {
    const { collector, store, home, event } = fixture();
    const transcript = join(home, 'sessions', 'root.jsonl');
    const timestamp = new Date(Date.now() + 1).toISOString();
    const sample = { timestamp, type: 'token_usage_record', payload: { thread_id: 'root', response_id: 'response-1', usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20, total_tokens: 120 } } };
    const rows = [
      { type: 'session_meta', payload: { id: 'root' } }, sample, sample,
      { ...sample, payload: { ...sample.payload, thread_id: 'unrelated', response_id: 'copied-parent' } },
      { timestamp, type: 'event_msg', payload: { type: 'token_count', rate_limits: { plan_type: 'plus', primary: { used_percent: 37, window_minutes: 300, resets_at: 1794247892 }, secondary: { used_percent: 49, window_minutes: 10080 } } } },
      { timestamp, type: 'event_msg', payload: { type: 'task_complete' } },
    ];
    collector.ingest(event({ hook_event_name: 'PreModelRequest', transcript_path: transcript }));
    writeFileSync(transcript, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    await new Promise(resolve => setTimeout(resolve, 3));
    await collector.poll();
    await collector.poll();
    expect(store.get('observedSession', 'root').state).toBe('idle');
    expect(collector.usage().hour).toEqual({ inputTokens: 100, cachedInputTokens: 80, outputTokens: 20, totalTokens: 120, responses: 1 });
    expect(collector.usage().week.totalTokens).toBe(120);
    expect(collector.usage().month.totalTokens).toBe(120);
    expect(collector.usage().plan?.windows.map(window => window.windowMinutes)).toEqual([300, 10080]);
    expect(collector.usage().plan?.observedAt).toBe(timestamp);
    collector.clear();
    expect(collector.usage().hour.totalTokens).toBe(0);
    expect(collector.usage().plan).toBeNull();
  });
  it('skips oversized transcript records and still captures later completion and usage', async () => {
    const { home } = fixture();
    const transcript = join(home, 'sessions', 'large.jsonl');
    writeFileSync(transcript, [
      JSON.stringify({ type: 'session_meta', payload: { id: 'large' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'reasoning', content: 'x'.repeat(3 * 1024 * 1024) } }),
      JSON.stringify({ timestamp: now(), type: 'event_msg', payload: { type: 'task_complete' } }),
    ].join('\n') + '\n');
    let checkpoint = { offset: 0, turnId: '' };
    let partial = false;
    for (let index = 0; index < 4; index++) {
      const read = await readTranscript(transcript, home, checkpoint);
      checkpoint = read.checkpoint;
      partial ||= read.unsupported;
    }
    expect(partial).toBe(true);
    expect((checkpoint as any).lifecycle.state).toBe('idle');
    writeFileSync(transcript, JSON.stringify({ type: 'session_meta', payload: { id: 'different' } }) + '\n' + ' '.repeat(statSync(transcript).size));
    await expect(readTranscript(transcript, home, checkpoint)).rejects.toThrow('identity changed');
    writeFileSync(transcript, JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{type: 'output_text', text: 'Unverified content'}] } }) + '\n' + ' '.repeat(statSync(transcript).size));
    await expect(readTranscript(transcript, home, checkpoint)).rejects.toThrow('identity header');
  });
  it('warns only when browser assignments and external execution overlap a project', () => {
    const { collector, store, event, directory } = fixture();
    const projectPath = join(directory, 'project');
    store.put('project', { id: 'p', name: 'Example', path: projectPath });
    collector.ingest(event({ hook_event_name: 'PreToolUse', cwd: join(projectPath, 'src') }));
    expect(collector.snapshot(true).conflicts).toEqual([]);
    store.put('task', { id: 'browser-task', projectId: 'p', status: 'working' });
    expect(collector.snapshot(false).conflicts).toEqual([]);
    expect(collector.snapshot(true).conflicts).toEqual([
      { cwd: projectPath, projectName: 'Example' },
    ]);
    store.update('task', 'browser-task', { status: 'completed' });
    expect(collector.snapshot(true).conflicts).toEqual([]);
  });
  it('reads native employee fork boundaries, explicit CLI source, and visible inter-agent text only', async () => {
    const { collector, store, home, event } = fixture();
    const rootPath = join(home, 'sessions', 'root.jsonl');
    const childPath = join(home, 'sessions', 'child.jsonl');
    const rows = [
      {
        ordinal: 0,
        type: 'session_meta',
        payload: { id: 'child', source: { subagent: {} }, subagent_history_start_ordinal: 4 },
      },
      {
        ordinal: 1,
        type: 'session_meta',
        payload: { id: 'root', source: 'exec', originator: 'codex_vscode' },
      },
      {
        ordinal: 2,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Copied parent history.' }],
        },
      },
      { ordinal: 3, type: 'event_msg', payload: { type: 'turn_aborted' } },
      { ordinal: 4, type: 'event_msg', payload: { type: 'task_started', turn_id: 'child-turn' } },
      {
        ordinal: 5,
        type: 'response_item',
        payload: {
          type: 'agent_message',
          id: 'brief',
          content: [
            { type: 'input_text', text: 'Visible delegation brief.' },
            { type: 'encrypted_content', encrypted_content: 'do-not-capture' },
          ],
        },
      },
      { ordinal: 6, type: 'world_state', payload: {} },
      { ordinal: 7, type: 'token_usage_record', payload: {} },
      { ordinal: 8, type: 'inter_agent_communication_metadata', payload: {} },
      { ordinal: 9, type: 'response_item', payload: { type: 'additional_tools' } },
      {
        ordinal: 10,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Scout report.' }],
        },
      },
    ].map((row) => ({ ...row, timestamp: now() }));
    writeFileSync(childPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
    writeFileSync(
      rootPath,
      JSON.stringify({
        type: 'session_meta',
        payload: { id: 'root', source: 'exec', originator: 'codex_vscode' },
      }) + '\n',
    );
    collector.ingest(event({ transcript_path: rootPath }));
    collector.ingest(
      event({
        hook_event_name: 'SubagentStart',
        agent_id: 'child',
        agent_type: 'nxsoos_researcher',
        transcript_path: childPath,
      }),
    );
    await collector.poll();
    expect(store.get('observedSession', 'child').transcriptPath).toBe(childPath);
    expect(store.get('observedSession', 'child').coverage).toBe('complete');
    expect(store.get('observedSession', 'root').source).toBe('cli');
    expect(store.get('observedCheckpoint', 'child').sessionId).toBe('child');
    const captured = JSON.stringify(store.list('observedMessage'));
    expect(captured).toContain('Visible delegation brief.');
    expect(captured).toContain('Scout report.');
    expect(captured).not.toContain('Copied parent history.');
    expect(captured).not.toContain('do-not-capture');
    const checkpoint = { offset: 0, turnId: '' };
    expect(
      parseTranscriptLine(
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: '<environment_context>internal context</environment_context>',
              },
            ],
          },
        }),
        checkpoint,
      ).entries,
    ).toEqual([]);
  });
  it('separates bridge credentials from browser authentication', async () => {
    const { store, event } = fixture();
    const service = await createApp({ directory: store.directory });
    disposers.push(() => service.app.close());
    const session = await service.app.inject({ url: '/api/session' });
    const cookie = String(session.headers['set-cookie']).split(';')[0];
    const payload = event({ hook_event_name: 'UserPromptSubmit', prompt: 'Authenticated.' });
    const browserOnly = await service.app.inject({
      method: 'POST',
      url: '/api/companion/events',
      headers: { cookie, 'x-company-token': session.json().token },
      payload,
    });
    expect(browserOnly.statusCode).toBe(403);
    const bridge = { 'x-company-bridge': bridgeToken(store.directory) };
    expect(
      (
        await service.app.inject({
          method: 'POST',
          url: '/api/companion/events',
          headers: bridge,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await service.app.inject({
          url: '/api/companion/snapshot',
          headers: bridge,
        })
      ).statusCode,
    ).toBe(401);
    expect(service.companyActive).toBe(false);
  });
  it('does not initialize or recover Company execution in visualizer-only mode', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nxsoos-lazy-'));
    const seed = new Store(directory);
    seed.put('task', { id: 'active', status: 'working' });
    seed.close();
    const { app, store, companyActive } = await createApp({ directory });
    disposers.push(() => app.close());
    expect(companyActive).toBe(false);
    const session = await app.inject({ url: '/api/session' });
    const cookie = String(session.headers['set-cookie']).split(';')[0];
    expect(
      (await app.inject({ url: '/api/companion/snapshot', headers: { cookie } })).statusCode,
    ).toBe(200);
    expect(store.get('task', 'active').status).toBe('working');
    expect(store.settings().paused).toBe(false);
    const health = (await app.inject({ url: '/api/health' })).json();
    expect(health.companyActive).toBe(false);
  });
  it('records prompts, tools, and employee relationships without duplicate events', () => {
    const { collector, store, event } = fixture();
    const first = event({
      hook_event_name: 'UserPromptSubmit',
      turn_id: 't1',
      prompt: 'Please investigate.',
    });
    collector.ingest(first);
    collector.ingest(first);
    collector.ingest(
      event({
        hook_event_name: 'SubagentStart',
        agent_id: 'child',
        agent_type: 'nxsoos_researcher',
      }),
    );
    collector.ingest(
      event({
        hook_event_name: 'PreToolUse',
        tool_name: 'read_file',
        tool_input: { api_key: 'secret', path: 'README.md' },
      }),
    );
    expect(store.list('observedEvent')).toHaveLength(3);
    expect(store.get('observedSession', 'child').parentId).toBe('root');
    expect(store.get('observedSession', 'child').name).toBe('Scout');
    expect(store.list('observedMessage').find((m) => m.role === 'tool').text).not.toContain(
      '"secret"',
    );
    collector.ingest(event({ hook_event_name: 'PermissionRequest' }));
    expect(collector.snapshot().sessions.find((s) => s.id === 'root')?.state).toBe('waiting');
    collector.ingest(
      event({ hook_event_name: 'Stop', last_assistant_message: 'Done.', turn_id: 't1' }),
    );
    expect(collector.snapshot().sessions.find((s) => s.id === 'root')?.state).toBe('idle');
  });
  it('rejects invalid installation credentials and imports no historical sessions', () => {
    const { collector, store, event } = fixture();
    expect(() => collector.ingest(event({ installationId: 'wrong' }))).toThrow('not linked');
    collector.ingest(event({ timestamp: '2000-01-01T00:00:00.000Z' }));
    expect(store.list('observedSession')).toHaveLength(0);
  });
  it('tails complete records, excludes reasoning, redacts secrets, and checkpoints restart', async () => {
    const { collector, store, home, event } = fixture();
    const transcript = join(home, 'sessions', 'root.jsonl');
    const timestamp = now();
    const rows = [
      {
        timestamp,
        type: 'session_meta',
        payload: { id: 'root', source: 'cli', originator: 'codex_cli_rs' },
      },
      { timestamp, type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn' } },
      {
        timestamp,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Explain this.' }],
        },
      },
      {
        timestamp,
        type: 'response_item',
        payload: { type: 'reasoning', content: 'hidden reasoning' },
      },
      {
        timestamp,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'A simple answer. api_key=private-value' }],
        },
      },
    ];
    writeFileSync(transcript, rows.map((r) => JSON.stringify(r)).join('\n'));
    collector.ingest(
      event({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Explain this.',
        turn_id: 'turn',
        transcript_path: transcript,
      }),
    );
    await collector.poll();
    expect(store.list('observedMessage').filter((m) => m.role === 'assistant')).toHaveLength(0);
    appendFileSync(transcript, '\n');
    await collector.poll();
    await collector.poll();
    const messages = store.list('observedMessage');
    expect(messages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(JSON.stringify(messages)).not.toContain('hidden reasoning');
    expect(JSON.stringify(messages)).not.toContain('private-value');
    expect(store.get('observedSession', 'root').source).toBe('cli');
    expect(store.get('observedSession', 'root').coverage).toBe('complete');
    await collector.close();
    const restarted = new Collector(store);
    disposers.push(() => restarted.close());
    await restarted.poll();
    expect(store.list('observedMessage')).toHaveLength(messages.length);
  });
  it('preserves partial coverage and rejects unrelated transcript locations', async () => {
    const { collector, store, home, event, directory } = fixture();
    const transcript = join(home, 'sessions', 'root.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        timestamp: now(),
        type: 'response_item',
        payload: { type: 'unsupported-new-format' },
      }) + '\n',
    );
    collector.ingest(event({ transcript_path: transcript }));
    await collector.poll();
    await collector.poll();
    expect(store.get('observedSession', 'root').coverage).toBe('partial');
    const outside = join(directory, 'unrelated.jsonl');
    writeFileSync(outside, 'secret\n');
    await expect(readTranscript(outside, home, { offset: 0, turnId: '' })).rejects.toThrow(
      'outside',
    );
  });
  it('revalidates a finished native export after an earlier incomplete rewrite', async () => {
    const { collector, store, home, event } = fixture();
    const transcript = join(home, 'sessions', 'root.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({ type: 'response_item', payload: { type: 'unsupported-transient-record' } }) +
        '\n',
    );
    collector.ingest(event({ hook_event_name: 'PreModelRequest', transcript_path: transcript }));
    await collector.poll();
    expect(store.get('observedSession', 'root').coverage).toBe('partial');
    writeFileSync(
      transcript,
      [
        { type: 'session_meta', payload: { id: 'root', source: 'exec' } },
        {
          timestamp: now(),
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Finished export.' }],
          },
        },
      ]
        .map((row) => JSON.stringify(row))
        .join('\n') + '\n',
    );
    collector.ingest(event({ hook_event_name: 'SessionEnd' }));
    await collector.poll();
    expect(store.get('observedSession', 'root').coverage).toBe('complete');
    expect(store.list('observedMessage').some((m) => m.text === 'Finished export.')).toBe(true);
    const count = store.list('observedMessage').length;
    await collector.poll();
    expect(store.list('observedMessage')).toHaveLength(count);
  });
  it('does not keep abandoned or delayed work permanently green', () => {
    const { collector, store, event } = fixture();
    collector.ingest(event({ hook_event_name: 'PreToolUse', tool_name: 'read' }));
    store.update('observedSession', 'root', {
      updatedAt: new Date(Date.now() - 60000).toISOString(),
    });
    expect(collector.snapshot().sessions[0].state).toBe('unknown');
    collector.ingest(event({ hook_event_name: 'Stop' }));
    collector.ingest(
      event({
        hook_event_name: 'PreToolUse',
        timestamp: new Date(Date.now() - 1000).toISOString(),
      }),
      true,
    );
    expect(collector.snapshot().sessions[0].state).toBe('idle');
  });
  it('clears only captured history and prevents older events from returning', async () => {
    const { collector, store, event } = fixture();
    store.put('project', { id: 'keep', name: 'Company project' });
    const old = event({ hook_event_name: 'UserPromptSubmit', prompt: 'Captured.' });
    collector.ingest(old);
    await new Promise((r) => setTimeout(r, 5));
    collector.clear();
    collector.ingest(old);
    expect(store.list('observedMessage')).toHaveLength(0);
    expect(store.get('project', 'keep').name).toBe('Company project');
  });
  it('injects approved preferences without a service and bounds the offline queue', async () => {
    const { store, manifest } = fixture();
    store.update('profile', 'main', { style: 'Use an example before jargon.' });
    store.syncProfileFiles();
    const before = nativeProfile(store.directory).revision;
    const output: any = await handleHook(
      {
        session_id: 'offline',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Work',
        cwd: 'C:\\fixture',
      },
      store.directory,
    );
    expect(output.hookSpecificOutput.additionalContext).toContain('Use an example before jargon.');
    expect(
      (await handleHook(
        { session_id: 'offline', hook_event_name: 'UserPromptSubmit', prompt: 'Next' },
        store.directory,
      )) as any,
    ).toEqual({});
    store.update('profile', 'main', { style: 'Define terms first.' });
    store.syncProfileFiles();
    expect(nativeProfile(store.directory).revision).not.toBe(before);
    await handleHook(
      { session_id: 'offline', hook_event_name: 'PostToolUse', tool_name: 'read' },
      store.directory,
    );
    await handleHook(
      { session_id: 'offline', hook_event_name: 'SubagentStart', agent_id: 'worker' },
      store.directory,
    );
    const update: any = await handleHook(
      { session_id: 'offline', hook_event_name: 'UserPromptSubmit', prompt: 'Again' },
      store.directory,
    );
    expect(update.hookSpecificOutput.additionalContext).toContain('Define terms first.');
    const queue = join(store.directory, 'bridge-queue');
    for (let i = 0; i < 12; i++)
      writeFileSync(join(queue, (1000 + i).toString(16) + '-a.json'), 'x'.repeat(1024 * 1024));
    await handleHook(
      { session_id: 'offline', hook_event_name: 'Stop', last_assistant_message: 'Finished.' },
      store.directory,
    );
    expect(
      readdirSync(queue).reduce((n, f) => n + statSync(join(queue, f)).size, 0),
    ).toBeLessThanOrEqual(10 * 1024 * 1024);
  });
});
