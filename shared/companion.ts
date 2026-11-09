import type { Role } from './types';
export type ObservedState = 'working' | 'waiting' | 'idle' | 'interrupted' | 'ended' | 'unknown';
export interface ActiveProject {
  path: string;
  name: string;
  observedAt: string;
  evidence: 'tool-workdir' | 'file-target';
}
export interface ObservedSession {
  id: string;
  rootId: string;
  parentId: string | null;
  source: 'cli' | 'ide' | 'codex' | 'browser';
  role: Role | 'unknown';
  name: string;
  cwd: string;
  activeProject?: ActiveProject;
  state: ObservedState;
  phase: string;
  createdAt: string;
  updatedAt: string;
  profileRevision: string;
  coverage: 'pending' | 'partial' | 'complete';
  coverageNote: string;
  transcriptPath: string | null;
  ownerPid?: number;
  ownerStartedAt?: string;
}
export interface ObservedMessage {
  id: string;
  sessionId: string;
  turnId: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  tool?: string;
  createdAt: string;
  truncated?: boolean;
}
export interface HookEvent {
  id: string;
  installationId: string;
  timestamp: string;
  hook_event_name: string;
  session_id: string;
  agent_id?: string;
  agent_type?: string;
  cwd?: string;
  turn_id?: string;
  prompt?: string;
  transcript_path?: string | null;
  agent_transcript_path?: string | null;
  last_assistant_message?: string | null;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  profileRevision?: string;
  ownerPid?: number;
  ownerStartedAt?: string;
  source?: string;
}
export interface CompanionSnapshot {
  usage?: CompanionUsage;
  sessions: ObservedSession[];
  messages: ObservedMessage[];
  companyActive: boolean;
  conflicts: { cwd: string; projectName: string }[];
  integration: {
    installed: boolean;
    installedAt?: string;
    version?: string;
    hooksEnabled: boolean | null;
    cli: 'unverified' | 'verified';
    ide: 'unverified' | 'verified';
    notes: string[];
  };
}
export interface UsageTotals {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  responses: number;
}
export interface UsagePlan {
  observedAt: string;
  planType?: string;
  windows: { name: string; usedPercent: number; windowMinutes: number | null; resetsAt: string | null }[];
}
export interface CompanionUsage {
  hour: UsageTotals;
  week: UsageTotals;
  month: UsageTotals;
  observedSince: string | null;
  updatedAt: string;
  sessionCount: number;
  coverage: 'observed-only';
  plan: UsagePlan | null;
}
export interface OfficeInstance {
  projectNames?: string[];
  instanceCount?: number;
  id: string;
  role: Role;
  name: string;
  workspaceId: string | null;
  state: ObservedState;
  label: string;
}
