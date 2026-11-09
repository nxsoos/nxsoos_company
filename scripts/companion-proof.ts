import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { linkIntegration } from '../server/integration.js';
import { TESTED_CODEX_VERSION } from '../server/codex.js';
import { readJson, bridgeToken } from '../server/local.js';
const root = resolve('.runtime', 'companion-proof-' + Date.now());
const directory = join(root, 'data');
const home = join(root, 'codex');
mkdirSync(join(home, 'sessions'), { recursive: true });
linkIntegration(directory, {
  codexHome: home,
  hookFile: resolve('dist-server/hook.js'),
  version: TESTED_CODEX_VERSION,
});
const environment = {
  ...process.env,
  COMPANY_DATA_DIR: directory,
  CODEX_HOME: home,
  COMPANY_NO_OPEN: '1',
  PORT: '0',
};
const run = async (action: string) =>
  promisify(execFile)(process.execPath, [resolve('dist-server/launch.js'), action], {
    cwd: process.cwd(),
    env: environment,
    windowsHide: true,
    timeout: 30000,
  });
async function hook(payload: object) {
  return new Promise<any>((resolveHook, reject) => {
    const configured = readJson<any>(join(home, 'hooks.json'));
    const command = configured.hooks.SessionStart[0].hooks[0].command;
    const child = spawn(
      process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
      process.platform === 'win32'
        ? ['-NoProfile', '-NonInteractive', '-Command', command]
        : ['-c', command],
      {
        env: environment,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let output = '';
    let diagnostic = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (diagnostic = (diagnostic + d).slice(-1500)));
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolveHook(JSON.parse(output))
        : reject(new Error('Hook process failed: ' + diagnostic)),
    );
    child.stdin.end(JSON.stringify(payload));
  });
}
try {
  await run('visualizer');
  const service = readJson<any>(join(directory, 'service.json'))!;
  let health: any = await (await fetch(service.url + '/api/health')).json();
  if (health.companyActive) throw new Error('Visualizer activated Company execution.');
  await run('visualizer');
  if (readJson<any>(join(directory, 'service.json'))!.instanceId !== service.instanceId)
    throw new Error('Duplicate service launched.');
  const response = await fetch(service.url + '/api/session');
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const timestamp = new Date().toISOString();
  const transcript = join(home, 'sessions', 'proof-root.jsonl');
  writeFileSync(
    transcript,
    [
      {
        timestamp,
        type: 'session_meta',
        payload: { id: 'proof-root', source: 'cli', originator: 'codex_cli_rs' },
      },
      { timestamp, type: 'event_msg', payload: { type: 'task_started', turn_id: 'proof-turn' } },
      {
        timestamp,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Show a fixture workflow.' }],
        },
      },
      {
        timestamp,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'The bridge fixture completed.' }],
        },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n',
  );
  const context = await hook({
    session_id: 'proof-root',
    hook_event_name: 'SessionStart',
    cwd: root,
    transcript_path: transcript,
  });
  if (!context.hookSpecificOutput.additionalContext.includes('Atlas'))
    throw new Error('CEO profile not injected.');
  await hook({
    session_id: 'proof-root',
    hook_event_name: 'UserPromptSubmit',
    turn_id: 'proof-turn',
    cwd: root,
    prompt: 'Show a fixture workflow.',
    transcript_path: transcript,
  });
  await hook({
    session_id: 'proof-root',
    hook_event_name: 'SubagentStart',
    agent_id: 'proof-child',
    agent_type: 'nxsoos_researcher',
    cwd: root,
  });
  await hook({
    session_id: 'proof-root',
    hook_event_name: 'SubagentStop',
    agent_id: 'proof-child',
    agent_type: 'nxsoos_researcher',
    cwd: root,
    last_assistant_message: 'Scout fixture report.',
  });
  await hook({
    session_id: 'proof-root',
    hook_event_name: 'Stop',
    turn_id: 'proof-turn',
    cwd: root,
    last_assistant_message: 'The bridge fixture completed.',
    transcript_path: transcript,
  });
  await new Promise((r) => setTimeout(r, 2200));
  const snapshot: any = await (
    await fetch(service.url + '/api/companion/snapshot', { headers: { cookie } })
  ).json();
  if (
    snapshot.sessions.length !== 2 ||
    !snapshot.messages.some((m: any) => m.text.includes('bridge fixture completed'))
  )
    throw new Error('Captured session or conversation missing.');
  await run('company');
  health = await (await fetch(service.url + '/api/health')).json();
  if (!health.companyActive) throw new Error('Company activation failed.');
  if (health.instanceId !== service.instanceId)
    throw new Error('Company launch did not reuse the observer service.');
  console.log(
    'PASS: two launcher modes, singleton reuse, lazy activation, PowerShell hook process delivery, shared profile injection, parent/child capture, and transcript messages.',
  );
  console.log('This fixture does not claim native CLI or IDE hook trust/live verification.');
} catch (error: any) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await run('stop').catch(() => {});
}
