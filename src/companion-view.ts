import { employees, type Role } from '../shared/types';
import type { ObservedMessage, ObservedSession, ObservedState } from '../shared/companion';

export const workspaceName = (path: string) =>
  path.split(/[\\/]/).filter(Boolean).at(-1) || 'No workspace';
export const activeProjectName = (session: ObservedSession) => session.activeProject?.name ||
  (session.source === 'browser' ? workspaceName(session.cwd) : workspaceName(session.cwd) + ' (session folder)');
export const activeProjectPath = (session: ObservedSession) => session.activeProject?.path || session.cwd;
const stateOrder: Record<ObservedState, number> = {
  working: 0,
  waiting: 1,
  unknown: 2,
  idle: 3,
  interrupted: 4,
  ended: 5,
};
export const employeeDescription: Record<Role, string> = {
  ceo: 'Understands your request, coordinates the team, and explains the outcome.',
  researcher: 'Explores the project and brings back useful findings and evidence.',
  designer: 'Shapes interfaces, interactions, and the experience of using your project.',
  developer: 'Builds features, fixes problems, and checks the implementation.',
  reviewer: 'Reviews changes and verifies that the result meets your request.',
};
export function stateLabel(state: ObservedState) {
  return {
    working: 'Working',
    waiting: 'Waiting for input',
    idle: 'Idle',
    unknown: 'Status unknown',
    interrupted: 'Interrupted',
    ended: 'Ended',
  }[state];
}
export function activityText(session: ObservedSession, messages: ObservedMessage[]) {
  if (session.state !== 'working')
    return (
      {
        waiting: 'Waiting for your input',
        idle: 'Ready for the next task',
        unknown: 'Waiting for a connection',
        interrupted: 'Work was interrupted',
        ended: 'Session finished',
      } as Record<string, string>
    )[session.state];
  const tool = [...messages]
    .reverse()
    .find(
      (message) =>
        message.sessionId === session.id &&
        message.role === 'tool' &&
        !/^(function_call_output|custom_tool_call_output)$/.test(message.tool || ''),
    );
  const activity = (session.phase + ' ' + (tool?.tool || '')).toLowerCase();
  // Inspect command arguments, never arbitrary file contents or command results.
  // A source file containing the word "tests" is not evidence of a running check.
  let command = '';
  if (/bash|powershell|exec_command|run_command|shell/.test(tool?.tool?.toLowerCase() || '')) {
    try {
      const args = JSON.parse(tool?.text || '{}');
      command =
        typeof args.cmd === 'string'
          ? args.cmd
          : typeof args.command === 'string'
            ? args.command
            : '';
    } catch {
      if (tool?.text && !/[\n\r{}]/.test(tool.text)) command = tool.text;
    }
  }
  if (
    /\b(?:npm|pnpm|yarn|bun|flutter|dart|pytest|vitest|jest|tsc|eslint)\b[^\n;]*\b(?:tests?|analy[sz]e|lint|typecheck|--noemit)\b/i.test(
      command,
    ) ||
    /run_check/.test(activity)
  )
    return 'Running project checks';
  if (/apply_patch|replace_text|write_file|edit_file/.test(activity))
    return 'Implementing the changes';
  if (/get-content|read_file|readscoped/.test(activity)) return 'Reading project files';
  if (/spawn_agent|create_task|wait_agent/.test(activity)) return 'Coordinating the team';
  if (/search|research|web|\brg\b/.test(activity)) return 'Investigating the project';
  return {
    ceo: 'Planning the next step',
    researcher: 'Investigating the project',
    designer: 'Designing the experience',
    developer: 'Building the implementation',
    reviewer: 'Reviewing the changes',
    unknown: 'Working on the request',
  }[session.role];
}
export function groupEmployees(
  sessions: ObservedSession[],
  messages: ObservedMessage[],
  online: boolean,
) {
  return employees.map((employee) => {
    const matching = sessions
      .filter((session) => session.role === employee.id)
      .sort(
        (a, b) =>
          stateOrder[a.state] - stateOrder[b.state] || b.updatedAt.localeCompare(a.updatedAt),
      );
    const current = matching[0];
    const working = matching.filter((session) => session.state === 'working');
    const state: ObservedState = !online
      ? 'unknown'
      : current && current.state !== 'ended'
        ? current.state
        : 'idle';
    const projects = [
      ...new Set(
        (working.length ? working : current && current.state !== 'ended' ? [current] : []).map(
          activeProjectName,
        ),
      ),
    ];
    return {
      employee,
      sessions: matching,
      current,
      working: working.length,
      state,
      projects,
      activity: current ? activityText({ ...current, state }, messages) : 'Ready for the next task',
    };
  });
}
