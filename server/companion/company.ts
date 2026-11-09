import type { Engine } from '../engine.js';
import type { Store } from '../store.js';
import type { ObservedSession, ObservedMessage, ObservedState } from '../../shared/companion.js';
import type { Project, Task, Message } from '../../shared/types.js';
import { nativeProfile } from '../profile.js';
import { employees } from '../../shared/agents.js';
export function companyProjection(store: Store, engine?: Engine) {
  const sessions: ObservedSession[] = [];
  const messages: ObservedMessage[] = [];
  for (const project of store.list<Project>('project')) {
    const conversation = store.list<Message>('message').filter((m) => m.projectId === project.id);
    const tasks = store
      .list<Task>('task')
      .filter((t) => t.projectId === project.id)
      .slice(-30);
    if (!conversation.length && !tasks.length) continue;
    const rootId = 'browser-' + project.id;
    const common = {
      source: 'browser' as const,
      cwd: project.path,
      createdAt: project.createdAt,
      updatedAt: conversation.at(-1)?.createdAt || project.createdAt,
      profileRevision: nativeProfile(store.directory).revision,
      coverage: 'complete' as const,
      coverageNote: 'Company-owned conversation.',
      transcriptPath: null,
    };
    sessions.push({
      ...common,
      id: rootId,
      rootId,
      parentId: null,
      role: 'ceo',
      name: 'Atlas',
      state: engine?.busyScopes.has(project.id) ? 'working' : 'idle',
      phase: engine ? 'Company conversation' : 'Saved Company history',
    });
    for (const m of conversation)
      messages.push({
        id: 'browser-' + m.id,
        sessionId: rootId,
        turnId: m.requestId,
        role: m.author === 'user' ? 'user' : m.author === 'ceo' ? 'assistant' : 'tool',
        text: m.text,
        createdAt: m.createdAt,
      });
    for (const task of tasks) {
      const active = engine && [...engine.sessions.values()].some((s) => s.taskId === task.id);
      const state: ObservedState = ['completed', 'cancelled', 'failed'].includes(task.status)
        ? 'ended'
        : task.status === 'awaiting_input'
          ? 'waiting'
          : task.status === 'interrupted'
            ? 'interrupted'
            : active
              ? 'working'
              : task.status === 'queued'
                ? 'idle'
                : 'unknown';
      const sid = 'browser-task-' + task.id;
      sessions.push({
        ...common,
        id: sid,
        rootId,
        parentId: rootId,
        role: task.role,
        name: employees.find((e) => e.id === task.role)!.name,
        state,
        phase: task.title,
        updatedAt: task.updatedAt,
      });
      if (task.result)
        messages.push({
          id: sid + '-result',
          sessionId: sid,
          role: 'assistant',
          turnId: task.requestId,
          text: task.result,
          createdAt: task.updatedAt,
        });
    }
  }
  return { sessions, messages };
}
