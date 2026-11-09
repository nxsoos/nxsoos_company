import { join, resolve, sep } from 'node:path';
import { existsSync, readdirSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store, now } from '../store.js';
import { atomicJson, digest, readJson, redact } from '../local.js';
import { nativeProfile } from '../profile.js';
import { integrationStatus, type IntegrationManifest } from '../integration.js';
import { employees, nativeRole } from '../../shared/agents.js';
import type {
  CompanionSnapshot,
  HookEvent,
  ObservedMessage,
  ObservedSession,
  ObservedState,
  CompanionUsage,
  UsageTotals,
  UsagePlan,
} from '../../shared/companion.js';
import { readTranscript, TRANSCRIPT_ADAPTER_VERSION, type TranscriptUsage } from './transcript.js';
import { inferProject } from './active-project.js';

const schema = z.object({
  id: z.string().min(1).max(200),
  installationId: z.string(),
  timestamp: z.string().datetime(),
  hook_event_name: z.string().max(80),
  session_id: z.string().min(1).max(200),
  agent_id: z.string().max(200).optional(),
  agent_type: z.string().max(100).optional(),
  cwd: z.string().max(2000).optional(),
  turn_id: z.string().max(200).optional(),
  prompt: z.string().max(500000).optional(),
  transcript_path: z.string().max(4000).nullable().optional(),
  agent_transcript_path: z.string().max(4000).nullable().optional(),
  last_assistant_message: z.string().max(500000).nullable().optional(),
  tool_name: z.string().max(200).optional(),
  tool_input: z.unknown().optional(),
  tool_response: z.unknown().optional(),
  profileRevision: z.string().optional(),
  ownerPid: z.number().int().positive().optional(),
  ownerStartedAt: z.string().optional(),
  source: z.string().optional(),
});
const kinds = ['observedSession', 'observedMessage', 'observedEvent', 'observedCheckpoint', 'observedUsage', 'observedPlan'];
function eventState(event: HookEvent): ObservedState {
  return event.hook_event_name === 'SessionEnd' ? 'ended'
    : event.hook_event_name === 'Interrupt' ? 'interrupted'
      : ['Stop', 'SubagentStop', 'SessionStart'].includes(event.hook_event_name) ? 'idle'
        : event.hook_event_name === 'PermissionRequest' ? 'waiting' : 'working';
}
export class Collector {
  timer: NodeJS.Timeout;
  polling = false;
  closed = false;
  processChecks = new Map<number, { at: number; matches: boolean }>();
  generation = 0;
  constructor(public store: Store) {
    this.timer = setInterval(
      () =>
        void this.poll().catch((error) => {
          if (!this.closed && !store.closed)
            store.event('companion', 'Collector: ' + error.message);
        }),
      1500,
    );
    this.timer.unref();
  }
  get manifest() {
    return readJson<IntegrationManifest>(join(this.store.directory, 'integration.json'));
  }
  ingest(input: unknown, replayed = false) {
    const event = schema.parse(redact(input)) as HookEvent;
    const manifest = this.manifest;
    if (!manifest?.installed || manifest.id !== event.installationId)
      throw new Error('This hook integration is not linked.');
    const epoch = Date.parse(event.timestamp);
    const cleared = this.store.get('companionSettings', 'main')?.clearedAt || manifest.installedAt;
    if (epoch < Date.parse(cleared) || epoch > Date.now() + 60000)
      return { accepted: false, reason: 'outside capture window' };
    if (this.store.get('observedEvent', event.id)) return { accepted: true, duplicate: true };
    this.store.put('observedEvent', { ...event, id: event.id });
    const rootId = event.session_id;
    // Employee tool/model hooks retain the root session_id and identify their
    // actual owner with agent_id, not only on SubagentStart/Stop.
    const child = !!event.agent_id && event.agent_id !== rootId;
    let root = this.store.get<ObservedSession>('observedSession', rootId);
    if (!root) {
      root = this.makeSession(rootId, rootId, null, event);
      this.store.put('observedSession', root);
    }
    const sessionId = child ? event.agent_id! : rootId;
    let session =
      this.store.get<ObservedSession>('observedSession', sessionId) ||
      this.makeSession(sessionId, rootId, child ? rootId : null, event);
    if (epoch >= Date.parse(session.updatedAt)) {
      const state = eventState(event);
      session = {
        ...session,
        cwd: event.cwd || session.cwd,
        state,
        phase: event.tool_name || event.hook_event_name,
        updatedAt: event.timestamp,
        profileRevision: event.profileRevision || session.profileRevision,
        transcriptPath:
          (child
            ? event.agent_transcript_path ||
              event.transcript_path
            : event.transcript_path) || session.transcriptPath,
        ownerPid: event.ownerPid || session.ownerPid,
        ownerStartedAt: event.ownerStartedAt || session.ownerStartedAt,
      };
      if (replayed && state === 'working' && Date.now() - epoch > 30000) session.state = 'unknown';
    }
    this.store.put('observedSession', session);
    if (event.tool_name && event.tool_input !== undefined)
      this.updateProject(sessionId, event.tool_name, event.tool_input, event.timestamp);
    if (event.prompt)
      this.message(sessionId, 'user', event.prompt, event.turn_id || '', event.timestamp);
    if (event.last_assistant_message)
      this.message(
        sessionId,
        'assistant',
        event.last_assistant_message,
        event.turn_id || '',
        event.timestamp,
      );
    if (event.tool_name)
      this.message(
        sessionId,
        'tool',
        JSON.stringify(
          redact(
            event.hook_event_name === 'PostToolUse'
              ? (event.tool_response ?? event.tool_input ?? {})
              : (event.tool_input ?? {}),
          ),
          null,
          2,
        ),
        event.turn_id || '',
        event.timestamp,
        event.tool_name,
        event.id,
      );
    this.store.event('companion', `${session.name}: ${event.tool_name || event.hook_event_name}`);
    return { accepted: true };
  }
  private makeSession(
    id: string,
    rootId: string,
    parentId: string | null,
    event: HookEvent,
  ): ObservedSession {
    const role = parentId ? nativeRole(event.agent_type) : 'ceo';
    return {
      id,
      rootId,
      parentId,
      source: 'codex',
      role,
      name:
        role === 'unknown'
          ? `Worker ${id.slice(0, 6)}`
          : employees.find((e) => e.id === role)!.name,
      cwd: event.cwd || '',
      state: 'unknown',
      phase: 'Connected',
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      profileRevision: event.profileRevision || '',
      coverage: 'pending',
      coverageNote: 'Waiting for a supported transcript.',
      transcriptPath: null,
    };
  }
  private updateProject(sessionId: string, tool: string, input: unknown, timestamp: string) {
    const session = this.store.get<ObservedSession>('observedSession', sessionId);
    if (!session || !Number.isFinite(Date.parse(timestamp))) return;
    if (session.activeProject && Date.parse(timestamp) < Date.parse(session.activeProject.observedAt)) return;
    const project = inferProject(tool, input, session.cwd, timestamp, this.store.list('project'));
    if (project) this.store.update('observedSession', sessionId, {activeProject:project});
  }
  private backfillProjects() {
    const settings = this.store.get('companionSettings', 'main');
    if (settings?.projectTrackingVersion === 1) return;
    const events = this.store.list<HookEvent>('observedEvent');
    for (const event of events)
      if (event.tool_name && event.tool_input !== undefined)
        this.updateProject(event.agent_id || event.session_id, event.tool_name, event.tool_input, event.timestamp);
    // Stored messages mix call arguments and results. Backfill only recorded hook
    // inputs; adapter v4 replays original transcript calls with explicit provenance.
    this.store.put('companionSettings', {...settings,id:'main',projectTrackingVersion:1});
  }
  message(
    sessionId: string,
    role: ObservedMessage['role'],
    text: string,
    turnId: string,
    timestamp: string,
    tool?: string,
    unique?: string,
  ) {
    const clean = String(redact(text));
    const key = digest(
      JSON.stringify([sessionId, role, turnId, tool || '', unique || clean.trim()]),
    );
    // Hooks and transcripts often describe the same user/assistant message.
    if (
      role !== 'tool' &&
      this.store
        .list<ObservedMessage>('observedMessage')
        .some(
          (m) =>
            m.sessionId === sessionId &&
            m.role === role &&
            m.text.trim() === clean.trim() &&
            (!m.turnId || !turnId || m.turnId === turnId),
        )
    )
      return;
    if (!this.store.get('observedMessage', key))
      this.store.put('observedMessage', {
        id: key,
        sessionId,
        role,
        text: clean,
        tool,
        turnId,
        createdAt: timestamp,
        truncated: text.length > 120000,
      } satisfies ObservedMessage);
  }
  async poll() {
    if (this.closed || this.polling) return;
    this.polling = true;
    const generation = this.generation;
    try {
      const queue = join(this.store.directory, 'bridge-queue');
      if (existsSync(queue))
        for (const file of readdirSync(queue)
          .filter((f) => /^[a-f0-9-]+\.json$/.test(f))
          .sort()
          .slice(0, 100)) {
          const path = join(queue, file);
          try {
            this.ingest(JSON.parse(readFileSync(path, 'utf8')), true);
            if (existsSync(path)) unlinkSync(path);
          } catch {
            try {
              if (Date.now() - statSync(path).mtimeMs > 86400000) unlinkSync(path);
            } catch {}
          }
        }
      const manifest = this.manifest;
      if (!manifest?.installed) return;
      this.repairLegacyRouting();
      this.backfillProjects();
      const owners = this.store
        .list<ObservedSession>('observedSession')
        .filter((s) => s.ownerPid && s.ownerStartedAt && ['working', 'waiting'].includes(s.state));
      if (process.platform === 'win32')
        for (const s of owners.slice(0, 40)) {
          if (Date.now() - (this.processChecks.get(s.ownerPid!)?.at || 0) < 5000) continue;
          try {
            const { stdout } = await promisify(execFile)(
              'powershell.exe',
              [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                `$taskOwner=Get-CimInstance Win32_Process -Filter "ProcessId=${s.ownerPid}"; if($taskOwner){$taskOwner.CreationDate.ToUniversalTime().ToString('o')}`,
              ],
              { windowsHide: true, timeout: 1500 },
            );
            this.processChecks.set(s.ownerPid!, {
              at: Date.now(),
              matches: Date.parse(stdout.trim()) === Date.parse(s.ownerStartedAt!),
            });
          } catch {
            this.processChecks.set(s.ownerPid!, { at: Date.now(), matches: false });
          }
        }
      for (const session of this.store.list<ObservedSession>('observedSession')) {
        if (!session.transcriptPath) continue;
        const key = session.id;
        const checkpoint = this.store.get('observedCheckpoint', key) || { offset: 0, turnId: '' };
        try {
          const info = statSync(session.transcriptPath);
          // Native hook exports can be rewritten while a turn runs. Revalidate a bounded
          // finished export once so a transient/incomplete earlier export is recoverable.
          const finalAudit =
            checkpoint.unsupported &&
            ['idle', 'ended', 'interrupted'].includes(session.state) &&
            info.size <= 2 * 1024 * 1024 &&
            checkpoint.auditedSize !== info.size;
          if (
            checkpoint.adapterVersion === TRANSCRIPT_ADAPTER_VERSION &&
            checkpoint.mtimeMs === info.mtimeMs &&
            checkpoint.offset === info.size &&
            !finalAudit
          )
            continue;
          const inputCheckpoint = finalAudit ? { offset: 0, turnId: '' } : checkpoint;
          const result = await readTranscript(
            session.transcriptPath,
            manifest.codexHome,
            inputCheckpoint,
          );
          if (this.closed || generation !== this.generation) return;
          if (result.checkpoint.sessionId && result.checkpoint.sessionId !== session.id)
            throw new Error('Transcript session identity does not match the connected session.');
          const cutoff = Date.parse(
            this.store.get('companionSettings', 'main')?.clearedAt || manifest.installedAt,
          );
          for (const entry of result.entries)
            if (Date.parse(entry.timestamp) >= cutoff) {
              this.message(
                session.id,
                entry.role,
                entry.text,
                entry.turnId,
                entry.timestamp,
                entry.tool,
                entry.role === 'tool' ? entry.key + ':' + digest(entry.text) : undefined,
              );
              if (entry.role === 'tool' && entry.tool && entry.toolInput !== undefined)
                this.updateProject(session.id, entry.tool, entry.toolInput, entry.timestamp);
            }
          for (const sample of result.usage)
            if (Date.parse(sample.timestamp) >= cutoff) {
              const usageId = digest(JSON.stringify([session.id, sample.key]));
              if (!this.store.get('observedUsage', usageId))
                this.store.put('observedUsage', { id: usageId, ...sample });
            }
          for (const plan of result.plans)
            if (Date.parse(plan.observedAt) >= cutoff) {
              const existing = this.store.get<UsagePlan>('observedPlan', 'main');
              if (!existing || plan.observedAt > existing.observedAt)
                this.store.put('observedPlan', { id: 'main', ...plan });
            }
          this.store.put('observedCheckpoint', {
            id: key,
            ...result.checkpoint,
            mtimeMs: info.mtimeMs,
            auditedSize: finalAudit ? info.size : checkpoint.auditedSize,
            unsupported:
              (inputCheckpoint.adapterVersion === TRANSCRIPT_ADAPTER_VERSION && checkpoint.unsupported) ||
              result.unsupported,
          });
          const source = result.checkpoint.source || session.source;
          const unsupported =
            (inputCheckpoint.adapterVersion === TRANSCRIPT_ADAPTER_VERSION && checkpoint.unsupported) || result.unsupported;
          const lifecycle = result.checkpoint.lifecycle;
          const lifecycleUpdate = lifecycle && Date.parse(lifecycle.timestamp) >= Date.parse(session.updatedAt)
            ? { state: lifecycle.state, phase: lifecycle.phase, updatedAt: lifecycle.timestamp } : {};
          this.store.update('observedSession', key, {
            ...lifecycleUpdate,
            source,
            coverage: unsupported
              ? 'partial'
              : result.checkpoint.offset > 0
                ? 'complete'
                : 'pending',
            coverageNote: unsupported
              ? 'Some transcript records are unsupported; available messages are shown.'
              : result.checkpoint.offset
                ? 'Supported transcript captured.'
                : 'Waiting for complete transcript records.',
          });
        } catch (error: any) {
          this.store.update('observedSession', key, {
            coverage: 'partial',
            coverageNote:
              error.code === 'ENOENT' ? 'Transcript is not available yet.' : error.message,
          });
        }
      }
      const sessions = this.store.list<ObservedSession>('observedSession');
      const messages = this.store.list<ObservedMessage>('observedMessage');
      for (const source of ['cli', 'ide'] as const) {
        const verified = sessions.some(
          (root) =>
            !root.parentId &&
            root.source === source &&
            root.coverage === 'complete' &&
            !!root.ownerPid &&
            this.processChecks.get(root.ownerPid)?.matches &&
            messages.some((m) => m.sessionId === root.id && m.role === 'user') &&
            messages.some((m) => m.sessionId === root.id && m.role === 'assistant') &&
            sessions.some(
              (child) =>
                child.parentId === root.id &&
                child.role !== 'unknown' &&
                child.coverage === 'complete' &&
                messages.some((m) => m.sessionId === child.id && m.role === 'assistant'),
            ),
        );
        const key = source === 'cli' ? 'cliVerified' : 'ideVerified';
        if (verified && !manifest[key]) {
          const current = this.manifest;
          if (current?.installed && current.id === manifest.id) {
            current[key] = true;
            atomicJson(join(this.store.directory, 'integration.json'), current);
            this.store.emit('change');
          }
        }
      }
    } finally {
      this.polling = false;
    }
  }
  snapshot(companyActive = false): CompanionSnapshot {
    const sessions = this.store.list<ObservedSession>('observedSession').map((session) => {
      if (session.parentId) {
        const root = this.store.get<ObservedSession>('observedSession', session.rootId);
        if (root)
          session = {
            ...session,
            source: root.source,
            ownerPid: session.ownerPid || root.ownerPid,
          };
      }
      if (['working', 'waiting'].includes(session.state)) {
        // An open CLI/IDE process can be idle indefinitely. Its existence is not
        // a heartbeat proving an old model/tool event is still executing.
        if (session.state === 'working' && Date.now() - Date.parse(session.updatedAt) > 120000)
          return { ...session, state: 'unknown' as const, phase: 'No recent executing activity; session may be idle' };
        if (session.ownerPid) {
          try {
            process.kill(session.ownerPid, 0);
          } catch {
            return {
              ...session,
              state: 'interrupted' as const,
              phase: 'Owning Codex process is no longer running',
            };
          }
          const check = this.processChecks.get(session.ownerPid);
          if (check && !check.matches)
            return {
              ...session,
              state: 'unknown' as const,
              phase: 'Codex process identity could not be verified',
            };
          if (!check && Date.now() - Date.parse(session.updatedAt) > 30000)
            return {
              ...session,
              state: 'unknown' as const,
              phase: 'Awaiting process identity verification',
            };
        } else if (Date.now() - Date.parse(session.updatedAt) > 30000)
          return {
            ...session,
            state: 'unknown' as const,
            phase: 'No recent activity or verified process heartbeat',
          };
      }
      return session;
    });
    const active = sessions.filter((s) => s.state === 'working');
    const browserProjects = new Set(
      companyActive
        ? this.store
            .list('task')
            .filter((task) =>
              ['working', 'reviewing', 'stopping', 'awaiting_input'].includes(task.status),
            )
            .map((task) => task.projectId)
        : [],
    );
    const conflicts = this.store
      .list('project')
      .filter((p) => browserProjects.has(p.id))
      .filter((p) =>
        active.some((s) => {
          const activePath = s.activeProject?.path || s.cwd;
          if (!activePath) return false;
          const external = resolve(activePath).toLowerCase(),
            project = resolve(p.path).toLowerCase();
          return (
            external === project ||
            external.startsWith(project + sep) ||
            project.startsWith(external + sep)
          );
        }),
      )
      .map((p) => ({ cwd: p.path, projectName: p.name }));
    return {
      sessions,
      messages: this.store
        .list<ObservedMessage>('observedMessage')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      companyActive,
      conflicts,
      integration: integrationStatus(this.store.directory),
      usage: this.usage(),
    };
  }
  private repairLegacyRouting() {
    const settings = this.store.get('companionSettings', 'main');
    if (settings?.routingVersion === 3) return;
    const events = this.store.list<HookEvent>('observedEvent')
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const latest = new Map<string, HookEvent>();
    const paths = new Map<string, string>();
    for (const event of events) {
      const sessionId = event.agent_id || event.session_id;
      latest.set(sessionId, event);
      const path = event.agent_transcript_path || event.transcript_path;
      if (path) paths.set(sessionId, path);
      if (event.agent_id && event.agent_id !== event.session_id && event.tool_name) {
        const wrongId = digest(JSON.stringify([event.session_id, 'tool', event.turn_id || '', event.tool_name, event.id]));
        const old = this.store.get<ObservedMessage>('observedMessage', wrongId);
        if (old) {
          this.message(sessionId, old.role, old.text, old.turnId, old.createdAt, old.tool, event.id);
          this.store.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run('observedMessage', wrongId);
        }
      }
    }
    for (const [key, event] of latest) {
      if (!this.store.get('observedSession', key)) continue;
      this.store.update('observedSession', key, {
        state: eventState(event), phase: event.tool_name || event.hook_event_name,
        updatedAt: event.timestamp, transcriptPath: paths.get(key) || null,
      });
    }
    this.store.put('companionSettings', { ...settings, id: 'main', routingVersion: 3 });
  }
  usage(): CompanionUsage {
    const samples = this.store.list<TranscriptUsage>('observedUsage');
    const end = Date.now();
    const total = (duration: number): UsageTotals => samples.filter(sample => {
      const time = Date.parse(sample.timestamp);
      return time >= end - duration && time <= end;
    }).reduce((sum, sample) => ({ inputTokens: sum.inputTokens + sample.inputTokens,
      cachedInputTokens: sum.cachedInputTokens + sample.cachedInputTokens,
      outputTokens: sum.outputTokens + sample.outputTokens, totalTokens: sum.totalTokens + sample.totalTokens,
      responses: sum.responses + 1 }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, responses: 0 });
    return { hour: total(3600000), week: total(7 * 86400000), month: total(30 * 86400000),
      observedSince: samples.length ? samples.map(sample => sample.timestamp).sort()[0] : null,
      updatedAt: now(), sessionCount: new Set(samples.map(sample => sample.sessionId)).size,
      coverage: 'observed-only', plan: this.store.get<UsagePlan>('observedPlan', 'main') || null };
  }
  clear() {
    this.generation++;
    this.processChecks.clear();
    for (const kind of kinds) this.store.db.prepare('DELETE FROM records WHERE kind=?').run(kind);
    this.store.db.prepare("DELETE FROM events WHERE type='companion'").run();
    this.store.put('companionSettings', { id: 'main', clearedAt: now() });
    this.store.emit('change');
  }
  async close() {
    this.closed = true;
    clearInterval(this.timer);
    while (this.polling) await new Promise((r) => setTimeout(r, 20));
  }
}
