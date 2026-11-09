import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  atomicJson,
  bridgeToken,
  defaultDirectory,
  digest,
  readJson,
  redact,
} from '../server/local.js';
import { nativeCEOInstructions, nativeProfile } from '../server/profile.js';
import type { IntegrationManifest } from '../server/integration.js';
import type { HookEvent } from '../shared/companion.js';

function owner() {
  if (process.platform !== 'win32') return {};
  try {
    const script = `$taskProcesses=Get-CimInstance Win32_Process; $taskAncestor=${process.ppid}; for($taskLevel=0;$taskLevel -lt 10;$taskLevel++){ $taskProcess=$taskProcesses | Where-Object ProcessId -eq $taskAncestor | Select-Object -First 1; if(!$taskProcess){break}; if($taskProcess.Name -eq 'codex.exe'){ @{ownerPid=[int]$taskProcess.ProcessId;ownerStartedAt=$taskProcess.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress;break }; $taskAncestor=$taskProcess.ParentProcessId }`;
    return JSON.parse(
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        timeout: 1200,
        windowsHide: true,
      }),
    );
  } catch {
    return {};
  }
}
export async function handleHook(input: any, directory: string) {
  const manifest = readJson<IntegrationManifest>(join(directory, 'integration.json'));
  if (!manifest?.installed || !input?.session_id || !input?.hook_event_name) return {};
  const profile = nativeProfile(directory);
  const cacheFile = join(directory, 'bridge-state', digest(input.session_id) + '.json');
  const cache = readJson<any>(cacheFile) || {};
  let context = '';
  if (
    input.hook_event_name === 'SessionStart' ||
    (input.hook_event_name === 'UserPromptSubmit' && cache.profileRevision !== profile.revision)
  )
    context = nativeCEOInstructions(directory);
  if (input.hook_event_name === 'SubagentStart')
    context = `Approved user preferences (revision ${profile.revision}):\n${profile.profile.style}\nExamples: ${profile.profile.examples}\nUse these preferences when reporting to the orchestrator. Follow your assigned employee role and native session permissions.`;
  if (input.hook_event_name === 'SessionStart') Object.assign(cache, owner());
  // Only root-context delivery consumes a pending root preference refresh.
  if (context && input.hook_event_name !== 'SubagentStart')
    cache.profileRevision = profile.revision;
  atomicJson(cacheFile, cache);
  const event: HookEvent = {
    id: randomUUID(),
    installationId: manifest.id,
    timestamp: new Date().toISOString(),
    hook_event_name: String(input.hook_event_name),
    session_id: String(input.session_id),
    profileRevision:
      input.hook_event_name === 'SubagentStart'
        ? profile.revision
        : cache.profileRevision || profile.revision,
    ...(cache.ownerPid ? { ownerPid: cache.ownerPid, ownerStartedAt: cache.ownerStartedAt } : {}),
  };
  for (const key of [
    'agent_id',
    'agent_type',
    'cwd',
    'turn_id',
    'prompt',
    'transcript_path',
    'agent_transcript_path',
    'last_assistant_message',
    'tool_name',
    'tool_input',
    'tool_response',
  ] as const)
    if (input[key] !== undefined) (event as any)[key] = redact(input[key]);
  const queue = join(directory, 'bridge-queue');
  mkdirSync(queue, { recursive: true });
  const pending = join(queue, Date.now().toString(16) + '-' + event.id + '.json');
  atomicJson(pending, event);
  let total = 0;
  const files = readdirSync(queue)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
  for (const file of files) {
    try {
      total += statSync(join(queue, file)).size;
      if (total > 10 * 1024 * 1024) unlinkSync(join(queue, file));
    } catch {}
  }
  const service = readJson<any>(join(directory, 'service.json'));
  if (service && /^http:\/\/127\.0\.0\.1:\d+$/.test(service.url)) {
    try {
      const response = await fetch(service.url + '/api/companion/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-company-bridge': bridgeToken(directory) },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(500),
      });
      if (response.ok && existsSync(pending)) unlinkSync(pending);
    } catch {}
  }
  return context
    ? { hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext: context } }
    : {};
}
// The installed hook is deliberately fail-open and never emits a blocking decision.
if (process.argv[1] && /hook\.(?:js|ts)$/.test(process.argv[1])) {
  const flag = process.argv.indexOf('--data-dir');
  const directory = flag >= 0 ? process.argv[flag + 1] : defaultDirectory();
  let data = '';
  try {
    for await (const chunk of process.stdin) {
      data += chunk;
      if (data.length > 1100000) throw new Error('Hook input too large.');
    }
    process.stdout.write(JSON.stringify(await handleHook(JSON.parse(data), directory)) + '\n');
  } catch {
    process.stdout.write('{}\n');
  }
}
