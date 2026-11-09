import { describe, it, expect } from 'vitest';
import { activityText, groupEmployees } from '../src/companion-view';
import type { ObservedSession } from '../shared/companion';
const session = (overrides: Partial<ObservedSession> = {}): ObservedSession => ({
  id: 'root',
  rootId: 'root',
  parentId: null,
  role: 'developer',
  name: 'Nova',
  source: 'cli',
  cwd: 'C:\\Projects\\map-markers',
  activeProject: {path:'C:\\Projects\\map-markers',name:'map-markers',observedAt:'2026-11-09T00:00:00Z',evidence:'tool-workdir'},
  state: 'working',
  phase: 'PreModelRequest',
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
  profileRevision: 'v1',
  coverage: 'complete',
  coverageNote: 'Captured',
  transcriptPath: null,
  ...overrides,
});
describe('headquarters role summaries', () => {
  it('groups concurrent sessions under the shared role and gives active work priority', () => {
    const members = groupEmployees(
      [
        session({ id: 'old', state: 'ended' }),
        session({ id: 'waiting', state: 'waiting' }),
        session({ id: 'working' }),
        session({ id: 'another', cwd: 'C:\\Projects\\website',activeProject:{path:'C:\\Projects\\website',name:'website',observedAt:'2026-11-09T00:00:00Z',evidence:'tool-workdir'} }),
      ],
      [],
      true,
    );
    expect(members).toHaveLength(5);
    const nova = members.find((member) => member.employee.id === 'developer')!;
    expect(nova.state).toBe('working');
    expect(nova.working).toBe(2);
    expect(nova.projects).toEqual(['map-markers', 'website']);
    expect(nova.current?.id).toBe('working');
  });
  it('never shows confirmed work after disconnect and keeps waiting distinct from idle', () => {
    expect(
      groupEmployees([session()], [], false).every((member) => member.state === 'unknown'),
    ).toBe(true);
    expect(
      groupEmployees([session({ state: 'waiting' })], [], true).find(
        (member) => member.employee.id === 'developer',
      )?.activity,
    ).toBe('Waiting for your input');
  });
  it('shows actual project independently of the originating conversation folder and labels fallback',()=>{
    const actual=groupEmployees([session({cwd:'C:\\Projects\\movie-list'})],[],true).find(m=>m.employee.id==='developer')!;
    expect(actual.projects).toEqual(['map-markers']);
    const fallback=groupEmployees([session({activeProject:undefined,cwd:'C:\\Projects\\movie-list'})],[],true).find(m=>m.employee.id==='developer')!;
    expect(fallback.projects).toEqual(['movie-list (session folder)']);
  });
  it('uses available tool activity for readable bubbles rather than hook protocol names', () => {
    expect(
      activityText(session(), [
        {
          id: 'tool',
          sessionId: 'root',
          turnId: 't',
          role: 'tool',
          tool: 'Bash',
          text: 'flutter analyze',
          createdAt: '',
        },
      ]),
    ).toBe('Running project checks');
    expect(activityText(session(), [])).toBe('Building the implementation');
    expect(activityText(session({ state: 'idle' }), [])).toBe('Ready for the next task');
    expect(
      activityText(session({ role: 'ceo' }), [
        {
          id: 'read',
          sessionId: 'root',
          turnId: 't',
          role: 'tool',
          tool: 'read_file',
          text: 'const tests = ["test", "analyze"];',
          createdAt: '',
        },
      ]),
    ).toBe('Reading project files');
  });
});
