import type { Role, Status, Task } from './types';

/** Waiting employees are occupied but aren't currently executing work. */
export const isExecuting = (status: Status) =>
  status === 'working' || status === 'reviewing' || status === 'stopping';

export function isAgentWorking(role: Role, tasks: Task[], ceoBusy: boolean, online: boolean) {
  return (
    online &&
    (role === 'ceo' ? ceoBusy : tasks.some((t) => t.role === role && isExecuting(t.status)))
  );
}
