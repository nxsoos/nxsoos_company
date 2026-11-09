export type Role = 'ceo' | 'researcher' | 'designer' | 'developer' | 'reviewer';
export { employees } from './agents';
export type Status =
  | 'stopping'
  | 'queued'
  | 'working'
  | 'awaiting_input'
  | 'blocked'
  | 'reviewing'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';
export interface Project {
  id: string;
  name: string;
  path: string;
  description: string;
  color: string;
  summary: string;
  createdAt: string;
}
export interface WorkRequest {
  id: string;
  projectId: string | null;
  text: string;
  tokens: number;
  budget: number;
  budgetPaused: boolean;
  createdAt: string;
}
export interface Task {
  id: string;
  requestId: string;
  projectId: string;
  role: Exclude<Role, 'ceo'>;
  title: string;
  brief: string;
  acceptance: string;
  dependencies: string[];
  status: Status;
  priority: number;
  result: string;
  error: string;
  threadId: string | null;
  turnId: string | null;
  tokens: number;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}
export interface Message {
  id: string;
  projectId: string | null;
  requestId: string;
  author: 'user' | 'ceo' | 'system';
  text: string;
  createdAt: string;
}
export interface Evidence {
  id: string;
  taskId: string;
  kind: 'file' | 'command' | 'finding' | 'conflict';
  title: string;
  content: string;
  before?: string;
  after?: string;
  createdAt: string;
}
export interface Activity {
  id: number;
  type: string;
  projectId: string | null;
  taskId: string | null;
  message: string;
  createdAt: string;
}
export interface Approval {
  id: string;
  taskId: string | null;
  title: string;
  details: string;
  kind: 'command' | 'codex' | 'question';
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}
export interface Profile {
  name: string;
  experience: string;
  style: string;
  updates: string;
  examples: string;
  onboarded: boolean;
}
export interface Preference {
  id: string;
  instruction: string;
  status: 'pending' | 'accepted' | 'declined' | 'undone';
  previous: string;
  createdAt: string;
}
export interface RuntimeStatus {
  state: 'disconnected' | 'connecting' | 'ready' | 'error';
  authenticated: boolean;
  verified: boolean;
  executable: string;
  version: string;
  message: string;
  models: { id: string; name: string }[];
  model: string;
  rateLimits: unknown;
}
export interface Snapshot {
  projects: Project[];
  tasks: Task[];
  requests: WorkRequest[];
  messages: Message[];
  evidence: Evidence[];
  activities: Activity[];
  approvals: Approval[];
  preferences: Preference[];
  profile: Profile;
  runtime: RuntimeStatus;
  paused: boolean;
  ceoBusy: string[];
  settings: { maxEmployees: number; defaultBudget: number; model: string };
}
