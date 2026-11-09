import { open, realpath, stat, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { redact } from '../local.js';
import type { UsagePlan, UsageTotals, ObservedState } from '../../shared/companion.js';
export const TRANSCRIPT_ADAPTER_VERSION = 4;
export interface TranscriptUsage extends Omit<UsageTotals, 'responses'> {
  key: string;
  sessionId: string;
  timestamp: string;
}
export interface TranscriptEntry {
  key: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  tool?: string;
  toolInput?: unknown;
  turnId: string;
  timestamp: string;
}
export interface TranscriptCheckpoint {
  adapterVersion?: number;
  historyStart?: number;
  offset: number;
  turnId: string;
  source?: 'cli' | 'ide' | 'codex';
  sessionId?: string;
  skipping?: boolean;
  lifecycle?: { state: ObservedState; timestamp: string; phase: string };
}
function normalDrivePath(path: string) {
  // Native Windows hooks may report a drive path in extended-length notation.
  // Strip only that exact namespace; device/UNC paths remain subject to the
  // normal containment rejection, never converted into a trusted local path.
  return process.platform === 'win32' && path.startsWith('\\\\?\\') && /^[a-z]:\\/i.test(path.slice(4))
    ? path.slice(4)
    : path;
}
export async function allowedTranscript(file: string, codexHome: string) {
  const root = normalDrivePath(await realpath(resolve(codexHome, 'sessions')));
  const target = resolve(normalDrivePath(file));
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || !target.endsWith('.jsonl'))
    throw new Error('Transcript is outside the Codex sessions directory.');
  let part = root;
  for (const segment of rel.split(sep)) {
    part = resolve(part, segment);
    if ((await lstat(part)).isSymbolicLink())
      throw new Error('Transcript symlinks and junctions are not allowed.');
  }
  const actual = normalDrivePath(await realpath(target));
  if (actual !== target && relative(root, actual).startsWith('..'))
    throw new Error('Transcript escapes Codex state.');
  return actual;
}
export function parseTranscriptLine(
  line: string,
  checkpoint: TranscriptCheckpoint,
): { entries: TranscriptEntry[]; recognized: boolean; usage?: TranscriptUsage; plan?: UsagePlan } {
  const row = JSON.parse(line);
  const p = row.payload || {};
  const timestamp = typeof row.timestamp === 'string' ? row.timestamp : new Date().toISOString();
  if (row.type === 'session_meta') {
    // Forked employee rollouts include copied parent metadata after their own header.
    if (!checkpoint.sessionId) {
      checkpoint.sessionId = p.id;
      if (Number.isInteger(p.subagent_history_start_ordinal))
        checkpoint.historyStart = p.subagent_history_start_ordinal;
      const source = typeof p.source === 'string' ? p.source.toLowerCase() : '';
      const origin = String(p.originator || '').toLowerCase();
      checkpoint.source = /^(cli|exec|terminal)$/.test(source)
        ? 'cli'
        : /^(vscode|vs_code|ide|codex_ide)$/.test(source)
          ? 'ide'
          : p.source && typeof p.source === 'object'
            ? 'codex'
            : /vscode|vs_code|codex_ide/.test(origin)
              ? 'ide'
              : /cli|terminal/.test(origin)
                ? 'cli'
                : 'codex';
    }
    return { entries: [], recognized: true };
  }
  if (checkpoint.historyStart !== undefined) {
    if (!Number.isInteger(row.ordinal)) return { entries: [], recognized: false };
    if (row.ordinal < checkpoint.historyStart) return { entries: [], recognized: true };
  }
  if (row.type === 'event_msg' && ['task_started', 'turn_started'].includes(p.type)) {
    checkpoint.turnId = p.turn_id || checkpoint.turnId;
    checkpoint.lifecycle = { state: 'working', timestamp, phase: 'Turn started' };
    return { entries: [], recognized: true };
  }
  if (row.type === 'event_msg' && ['task_complete', 'turn_complete', 'turn_aborted'].includes(p.type)) {
    checkpoint.lifecycle = { state: p.type === 'turn_aborted' ? 'interrupted' : 'idle', timestamp, phase: p.type === 'turn_aborted' ? 'Turn interrupted' : 'Turn completed' };
    return { entries: [], recognized: true };
  }
  if (row.type === 'token_usage_record') {
    const u = p.usage;
    if (!u || !p.response_id || p.thread_id !== checkpoint.sessionId)
      return { entries: [], recognized: true };
    const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
    return { entries: [], recognized: true, usage: {
      key: String(p.response_id), sessionId: checkpoint.sessionId!, timestamp,
      inputTokens: count(u.input_tokens), cachedInputTokens: count(u.cached_input_tokens),
      outputTokens: count(u.output_tokens), totalTokens: count(u.total_tokens),
    } };
  }
  if (row.type === 'event_msg' && p.type === 'token_count' && p.rate_limits) {
    const limits = p.rate_limits;
    const windows = ['primary', 'secondary'].flatMap(name => {
      const w = limits[name];
      if (!w || typeof w.used_percent !== 'number' || !Number.isFinite(w.used_percent)) return [];
      return [{ name, usedPercent: w.used_percent,
        windowMinutes: typeof w.window_minutes === 'number' ? w.window_minutes : null,
        resetsAt: typeof w.resets_at === 'number' && Number.isFinite(w.resets_at) ? new Date(w.resets_at * 1000).toISOString() : null }];
    });
    return { entries: [], recognized: true, ...(windows.length ? { plan: {observedAt: timestamp, planType: typeof limits.plan_type === 'string' ? limits.plan_type : undefined, windows} } : {}) };
  }
  if (row.type === 'turn_context') {
    checkpoint.turnId = p.turn_id || checkpoint.turnId;
    return { entries: [], recognized: true };
  }
  if (row.type !== 'response_item')
    return {
      entries: [],
      recognized: [
        'event_msg',
        'turn_context',
        'world_state',
        'token_usage_record',
        'inter_agent_communication_metadata',
      ].includes(row.type),
    };
  if (['reasoning', 'additional_tools'].includes(p.type)) return { entries: [], recognized: true };
  if (p.type === 'message' || p.type === 'agent_message') {
    if (p.type === 'message' && !['user', 'assistant'].includes(p.role))
      return { entries: [], recognized: true };
    const text = (p.content || [])
      .filter((c: any) => ['input_text', 'output_text', 'text'].includes(c.type))
      .map((c: any) => c.text || '')
      .join('\n');
    // These are generated instruction envelopes, not user prompts. Hook prompts remain authoritative.
    if (
      p.role === 'user' &&
      /^(<environment_context>|# AGENTS\.md instructions for )/.test(text.trimStart())
    )
      return { entries: [], recognized: true };
    return {
      entries: text
        ? [
            {
              key: p.id || '',
              role: p.type === 'agent_message' ? 'tool' : p.role,
              ...(p.type === 'agent_message' ? { tool: 'agent_message' } : {}),
              text: redact(text),
              turnId: checkpoint.turnId,
              timestamp,
            },
          ]
        : [],
      recognized: true,
    };
  }
  if (
    [
      'function_call',
      'custom_tool_call',
      'function_call_output',
      'custom_tool_call_output',
    ].includes(p.type)
  ) {
    const value = p.arguments ?? p.input ?? p.output ?? '';
    const text = typeof value === 'string' ? redact(value) : JSON.stringify(redact(value), null, 2);
    return {
      entries: [
        {
          key: p.call_id || p.id || '',
          role: 'tool',
          text,
          tool: p.name || p.type,
          ...(['function_call','custom_tool_call'].includes(p.type) ? {toolInput:value} : {}),
          turnId: checkpoint.turnId,
          timestamp,
        },
      ],
      recognized: true,
    };
  }
  return { entries: [], recognized: false };
}
export async function readTranscript(file: string, home: string, checkpoint: TranscriptCheckpoint) {
  const target = await allowedTranscript(file, home);
  const size = (await stat(target)).size;
  const next: TranscriptCheckpoint =
    checkpoint.adapterVersion === TRANSCRIPT_ADAPTER_VERSION && size >= checkpoint.offset
      ? { ...checkpoint }
      : { offset: 0, turnId: '', adapterVersion: TRANSCRIPT_ADAPTER_VERSION };
  // Read bounded complete JSONL records only; leave partial trailing bytes for the next pass.
  const handle = await open(target, 'r');
  const buffer = Buffer.alloc(Math.min(size - next.offset, 2 * 1024 * 1024));
  let bytesRead = 0;
  try {
    // Recheck the first header even when resuming: native exports can replace a
    // path without shrinking it. Never import a different thread at an old offset.
    const header = Buffer.alloc(Math.min(size, 256 * 1024));
    const first = await handle.read(header, 0, header.length, 0);
    const newline = header.subarray(0, first.bytesRead).indexOf(10);
    if (newline < 0) throw new Error('Transcript has no complete supported identity header yet.');
    const row = JSON.parse(header.subarray(0, newline).toString('utf8'));
    if (row.type !== 'session_meta' || typeof row.payload?.id !== 'string' || !row.payload.id)
      throw new Error('Transcript has no supported session identity header.');
    if (next.sessionId && row.payload.id !== next.sessionId)
      throw new Error('Transcript session identity changed while reading.');
    ({ bytesRead } = await handle.read(buffer, 0, buffer.length, next.offset));
  } finally {
    await handle.close();
  }
  const chunk = buffer.subarray(0, bytesRead);
  let start = 0;
  if (next.skipping) {
    const newline = chunk.indexOf(10);
    if (newline < 0) {
      next.offset += bytesRead;
      return { checkpoint: next, entries: [], usage: [], plans: [], unsupported: true };
    }
    start = newline + 1;
    next.skipping = false;
  }
  const end = chunk.lastIndexOf(10);
  if (end < 0) {
    if (bytesRead === 2 * 1024 * 1024) {
      next.skipping = true;
      next.offset += bytesRead;
    }
    return { checkpoint: next, entries: [], usage: [], plans: [], unsupported: !!next.skipping };
  }
  const lines = chunk
    .subarray(start, end + 1)
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
  const entries: TranscriptEntry[] = [];
  const usage: TranscriptUsage[] = [];
  const plans: UsagePlan[] = [];
  let unsupported = false;
  for (const line of lines) {
    try {
      const parsed = parseTranscriptLine(line, next);
      entries.push(...parsed.entries);
      if (parsed.usage) usage.push(parsed.usage);
      if (parsed.plan) plans.push(parsed.plan);
      if (!parsed.recognized) unsupported = true;
    } catch {
      unsupported = true;
    }
  }
  next.offset += end + 1;
  return { checkpoint: next, entries, usage, plans, unsupported };
}
