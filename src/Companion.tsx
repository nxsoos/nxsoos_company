import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import Markdown from 'react-markdown';
import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  CircleHelp,
  Command,
  Folder,
  Menu,
  MessageSquare,
  Radio,
  RefreshCw,
  Trash2,
  Users,
  X,
  Coffee,
  ScanEye,
} from 'lucide-react';
import { Office } from './Office';
import { api, establishSession } from './api';
import { employees, type Project, type Role } from '../shared/types';
import type { CompanionSnapshot, OfficeInstance } from '../shared/companion';
import {
  activeProjectName,
  activeProjectPath,
  activityText,
  groupEmployees,
  stateLabel,
  workspaceName,
} from './companion-view';
import { CompanionUsage, PlanUsageStrip } from './CompanionUsage';

export function Companion() {
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState('all');
  const [workspace, setWorkspace] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [conversationRole, setConversationRole] = useState('all');
  const refresh = useCallback(async () => {
    try {
      setSnapshot(await api<CompanionSnapshot>('companion/snapshot'));
    } catch (error: any) {
      setError(error.message);
    }
  }, []);
  useEffect(() => {
    let stopped = false,
      stream: EventSource | undefined,
      retry: ReturnType<typeof setTimeout>;
    const connect = async () => {
      if (stopped) return;
      try {
        await establishSession();
        if (stopped) return;
        await refresh();
        if (stopped) return;
        stream?.close();
        stream = new EventSource('/api/events');
        stream.onopen = () => {
          setOnline(true);
          setError('');
        };
        stream.addEventListener('changed', () => void refresh());
        stream.onerror = () => {
          setOnline(false);
          clearTimeout(retry);
          retry = setTimeout(() => void connect(), 2000);
        };
      } catch (error: any) {
        if (!stopped) {
          setOnline(false);
          setError(error.message);
          retry = setTimeout(() => void connect(), 2000);
        }
      }
    };
    void connect();
    const clock = setInterval(() => void refresh(), 5000);
    return () => {
      stopped = true;
      stream?.close();
      clearInterval(clock);
      clearTimeout(retry);
    };
  }, [refresh]);
  const sessions = useMemo(
    () =>
      (snapshot?.sessions || []).filter(
        (session) =>
          (source === 'all' || session.source === source) &&
          (workspace === 'all' || session.cwd === workspace),
      ),
    [snapshot, source, workspace],
  );
  const members = useMemo(
    () => groupEmployees(sessions, snapshot?.messages || [], online),
    [sessions, snapshot, online],
  );
  const chosen = sessions.find((session) => session.id === selected);
  const conversation = snapshot?.messages.filter((message) => message.sessionId === selected) || [];
  const projects: Project[] = useMemo(
    () =>
      [...new Set(sessions.map(activeProjectPath).filter(Boolean))].map((path, index) => ({
        id: path,
        path,
        name: workspaceName(path),
        description: 'Observed workspace',
        color: employees[index % employees.length].color,
        summary: '',
        createdAt: '',
      })),
    [sessions],
  );
  const instances: OfficeInstance[] = members.map((member) => ({
    id: member.employee.id,
    role: member.employee.id,
    name: member.employee.name,
    workspaceId:
      member.projects.length && member.current ? activeProjectPath(member.current) : null,
    state: member.state,
    label: member.activity,
    projectNames: member.projects,
    instanceCount:
      member.working || member.sessions.filter((session) => session.state !== 'ended').length,
  }));
  const latest = useRef(members);
  latest.current = members;
  const inspect = useCallback((role: Role) => {
    const current = latest.current.find((member) => member.employee.id === role)?.current;
    if (current) {
      setSelected(current.id);
      setDrawer(true);
    }
  }, []);
  const openList = () => {
    setSelected(null);
    setConversationRole('all');
    setDrawer(true);
  };
  const visibleConversations = sessions
    .filter((session) => conversationRole === 'all' || session.role === conversationRole)
    .sort(
      (a, b) =>
        Number(b.state === 'working') - Number(a.state === 'working') ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const activeCount = sessions.filter((session) => session.state === 'working').length;
  return (
    <Dialog.Root
      open={drawer}
      onOpenChange={(open) => {
        setDrawer(open);
        if (!open) setSelected(null);
      }}
    >
      <div className="companion-shell hq-shell">
        <header className="companion-header hq-header">
          <a className="brand" href="/visualizer">
            <span className="brand-mark">n.</span>
            <span>
              nxsoos<span className="brand-sub">HEADQUARTERS</span>
            </span>
          </a>
          <span className="hq-mode">
            <Radio size={13} /> CODEX COMPANION
          </span>
          <span className="spacer" />
          <span className="service-state">
            <i className={online ? 'connected' : ''} />
            {online ? 'Live connection' : 'Reconnecting'}
          </span>
          <button
            className="icon-button hq-team-toggle"
            aria-label="Show agent team"
            aria-expanded={teamOpen}
            onClick={() => setTeamOpen(!teamOpen)}
          >
            <Users size={19} />
          </button>
          <button
            className="secondary compact"
            aria-label="Codex connection"
            onClick={() => setShowSetup(!showSetup)}
          >
            <Command size={15} />
            <span className="hq-button-text">
              {snapshot?.integration.installed ? 'Connection' : 'Connect Codex'}
            </span>
          </button>
          <Dialog.Trigger asChild>
            <button className="hq-conversations-button" onClick={openList}>
              <Menu size={18} />
              <span>Connected conversations</span>
              <b>{sessions.filter((session) => !session.parentId).length}</b>
            </button>
          </Dialog.Trigger>
          <a
            className="icon-button"
            href="/company"
            target="_blank"
            rel="noreferrer"
            aria-label="Open Company mode"
          >
            <ArrowUpRight size={18} />
          </a>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <main className="hq-main" aria-label="Codex headquarters">
          <Dialog.Root open={showSetup} onOpenChange={setShowSetup}>
            <Dialog.Portal>
              <Dialog.Overlay className="modal-overlay" />
              <Dialog.Content
                className="modal companion-setup hq-setup"
                aria-describedby="connection-description"
              >
                <div>
                  <Command size={18} />
                  <Dialog.Title asChild>
                    <h2>
                      {snapshot?.integration.installed
                        ? 'Your Codex connection'
                        : 'Connect your Codex sessions'}
                    </h2>
                  </Dialog.Title>
                  <span className="spacer" />
                  <button
                    className="icon-button"
                    aria-label="Close connection details"
                    onClick={() => setShowSetup(false)}
                  >
                    <X size={17} />
                  </button>
                </div>
                <Dialog.Description asChild>
                  <p id="connection-description">
                    Run <code>npm run codex:link</code> once, review the hooks with{' '}
                    <code>/hooks</code>, then use your normal Codex CLI or IDE chat.
                  </p>
                </Dialog.Description>
                <div className="coverage-badges">
                  <span>CLI: {snapshot?.integration.cli || 'unverified'}</span>
                  <span>IDE: {snapshot?.integration.ide || 'unverified'}</span>
                </div>
                {snapshot?.integration.notes.map((note) => (
                  <p className="help-text" key={note}>
                    {note}
                  </p>
                ))}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          {!!snapshot?.conflicts.length && (
            <div className="conflict-notice">
              <CircleHelp size={17} />
              <span>
                Browser assignments and Codex are both active in{' '}
                {snapshot.conflicts.map((conflict) => conflict.projectName).join(', ')}. Their edits
                can overlap.
              </span>
            </div>
          )}
          <div className="hq-filterbar">
            <label>
              <span>Source</span>
              <select
                aria-label="Session source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                <option value="all">All sources</option>
                <option value="cli">Codex CLI</option>
                <option value="ide">Codex IDE</option>
                <option value="codex">Codex · unidentified</option>
                <option value="browser">Browser Company</option>
              </select>
            </label>
            <label className="hq-workspace-filter">
              <Folder size={14} />
              <select
                aria-label="Observed workspace"
                value={workspace}
                onChange={(event) => setWorkspace(event.target.value)}
              >
                <option value="all">All session workspaces</option>
                {[
                  ...new Set(
                    (snapshot?.sessions || []).map((session) => session.cwd).filter(Boolean),
                  ),
                ].map((path) => (
                  <option value={path} key={path}>
                    {workspaceName(path)}
                  </option>
                ))}
              </select>
            </label>
            <CompanionUsage usage={snapshot?.usage} online={online} />
            <span className="spacer" />
            <div className="hq-live-count" role="status" aria-label="Working agents">
              <span className={online && activeCount ? 'live-dot' : 'offline-dot'} />
              {online ? (
                <>
                  <strong>{activeCount}</strong> working now
                </>
              ) : (
                'Status unavailable'
              )}
            </div>
            <span className="agent-legend">
              <i />
              Working
              <i />
              Idle / waiting
            </span>
            <button
              className="icon-button"
              aria-label="Refresh observed sessions"
              onClick={() => void refresh()}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <div className="hq-stage">
            <aside
              className={'hq-team ' + (teamOpen ? 'hq-team-open' : '')}
              aria-label="Agent team"
            >
              <header>
                <div>
                  <span className="eyebrow">THE PEOPLE</span>
                  <h2>
                    Your team <span>05</span>
                  </h2>
                </div>
                <button
                  className="icon-button hq-team-toggle"
                  aria-label="Close agent team"
                  onClick={() => setTeamOpen(false)}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="hq-team-roster">
                {members.map((member) => (
                  <article
                    key={member.employee.id}
                    className="hq-member"
                    aria-label={member.employee.name + ' details'}
                  >
                    <div className="hq-member-heading">
                      <span
                        className={'hq-portrait portrait-' + member.employee.id}
                        style={{ '--portrait-color': member.employee.color } as CSSProperties}
                      >
                        <span />
                        <i />
                      </span>
                      <span className="hq-member-copy">
                        <span className="hq-member-name">
                          {member.employee.name}
                          <span
                            className={
                              'employee-dot ' + (member.state === 'working' ? 'active' : '')
                            }
                            role="img"
                            aria-label={member.employee.name + ' role: ' + stateLabel(member.state)}
                          />
                        </span>
                        <span className="hq-member-role">{member.employee.title}</span>
                        <span className="hq-member-status">
                          {stateLabel(member.state)}
                          {member.working > 1 ? ' · ' + member.working + ' sessions' : ''}
                        </span>
                      </span>
                      <button
                        className="hq-member-inspect"
                        disabled={!member.current}
                        onClick={() => inspect(member.employee.id)}
                        aria-label={'Inspect ' + member.employee.name + ' conversation'}
                        title="Inspect conversation"
                      >
                        <ScanEye size={15} />
                      </button>
                    </div>
                    <dl className="hq-member-details">
                      <div>
                        <dt>Office</dt>
                        <dd>{member.employee.room}</dd>
                      </div>
                      <div>
                        <dt>Project</dt>
                        <dd
                          className="hq-project-value"
                          tabIndex={0}
                          data-full={member.projects.join(', ') || 'No identified project'}
                          aria-label={
                            'Project or labeled session-folder fallback: ' +
                            (member.projects.join(', ') || 'None')
                          }
                        >
                          <span>{member.projects.join(', ') || 'No identified project'}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Activity</dt>
                        <dd>{member.activity}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              <footer>
                <span className={online ? 'live-dot' : 'offline-dot'} />
                {online ? 'Updates from your Codex sessions' : 'Waiting for connection'}
              </footer>
            </aside>
            <section className="hq-map" aria-label="Headquarters floor">
              <div className="hq-map-heading">
                <span>
                  <span className="live-dot" />
                  THE COMPANY FLOOR
                </span>
                <span>
                  05 offices <span className="hq-dot">·</span> common room
                </span>
              </div>
              <PlanUsageStrip usage={snapshot?.usage} online={online} />
              <div className="office-section companion-office">
                <Office
                  tasks={[]}
                  projects={projects}
                  instances={instances}
                  busy={false}
                  online={online}
                  onEmployee={inspect}
                  onAgent={(id) => inspect(id as Role)}
                />
              </div>
              <footer className="hq-map-footer">
                <span>
                  <Coffee size={13} />
                  Idle movement is decorative. LEDs show real activity.
                </span>
                <span>
                  <MessageSquare size={13} />
                  Continue chatting and approving work in Codex.
                </span>
              </footer>
            </section>
          </div>
        </main>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="hq-drawer-overlay" />
        <Dialog.Content
          className={'conversation-inspector hq-drawer ' + (chosen ? 'hq-inspecting' : '')}
          aria-describedby="hq-drawer-description"
        >
          <header>
            <div>
              <span className="eyebrow">
                {chosen ? chosen.source.toUpperCase() + ' · READ ONLY' : 'YOUR CONNECTED SESSIONS'}
              </span>
              <Dialog.Title>{chosen ? chosen.name : 'Connected conversations'}</Dialog.Title>
              <Dialog.Description id="hq-drawer-description">
                {chosen
                  ? 'Session workspace: ' + chosen.cwd
                  : 'Prompts, answers, and tool activity from your existing sessions.'}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label={chosen ? 'Close conversation inspector' : 'Close connected conversations'}
            >
              <X size={19} />
            </Dialog.Close>
          </header>
          {chosen ? (
            <>
              <button className="hq-back text-button" onClick={() => setSelected(null)}>
                <ChevronLeft size={15} />
                All conversations
              </button>
              <div className="inspector-status">
                <span className="status">
                  {online ? stateLabel(chosen.state) : 'Status unknown'}
                </span>
                <span>{chosen.coverageNote}</span>
              </div>
              <p className="hq-workspace-note">
                Project: {activeProjectName(chosen)}.{' '}
                {chosen.activeProject
                  ? 'Detected from recent tool activity in ' + chosen.activeProject.path + '. '
                  : 'No supported project activity identified yet. '}
                Session workspace is the original folder reported by Codex and can be different.
              </p>
              <div className="inspector-messages">
                {conversation.length ? (
                  conversation.map((message) => (
                    <article
                      key={message.id}
                      className={
                        'chat-message message-' +
                        (message.role === 'assistant' ? 'ceo' : message.role)
                      }
                    >
                      <div className="message-meta">
                        <strong>
                          {message.role === 'user'
                            ? 'You'
                            : message.role === 'assistant'
                              ? chosen.name
                              : message.tool || 'Tool'}
                        </strong>
                        <time>
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                      {message.role === 'tool' ? (
                        <pre>{message.text}</pre>
                      ) : (
                        <div className="markdown">
                          <Markdown>{message.text}</Markdown>
                        </div>
                      )}
                      {message.truncated && (
                        <p className="help-text">Large content was truncated.</p>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="empty-inbox">
                    <MessageSquare size={24} />
                    <p>
                      No available messages yet. Activity remains visible while conversation
                      coverage is incomplete.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="hq-session-controls">
                <label>
                  Employee
                  <select
                    aria-label="Conversation employee"
                    value={conversationRole}
                    onChange={(event) => setConversationRole(event.target.value)}
                  >
                    <option value="all">Everyone</option>
                    {employees.map((employee) => (
                      <option value={employee.id} key={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                    <option value="unknown">Other workers</option>
                  </select>
                </label>
                <button className="text-button" onClick={() => setClearing(true)}>
                  <Trash2 size={13} />
                  Clear history
                </button>
              </div>
              <div className="hq-session-list">
                {!visibleConversations.length ? (
                  <div className="companion-empty">
                    <Activity size={24} />
                    <h3>No conversations here yet.</h3>
                    <p>Use your normal Codex chat after linking and trusting the hooks.</p>
                  </div>
                ) : (
                  visibleConversations.map((session) => (
                    <button
                      key={session.id}
                      className="observed-card"
                      onClick={() => setSelected(session.id)}
                    >
                      <div>
                        <span className="observed-source">{session.source.toUpperCase()}</span>
                        <span
                          className={
                            'employee-dot ' +
                            (online && session.state === 'working' ? 'active' : '')
                          }
                          role="img"
                          aria-label={
                            session.name +
                            ': ' +
                            (online ? stateLabel(session.state) : 'Status unknown')
                          }
                        />
                      </div>
                      <h3>
                        {session.name}
                        <small>{session.parentId ? 'Employee' : 'CEO session'}</small>
                      </h3>
                      <p className="observed-phase">
                        {activityText(session, snapshot?.messages || [])}
                      </p>
                      <p>
                        <Folder size={12} />
                        {activeProjectName(session)}
                      </p>
                      <footer>
                        <span>{online ? stateLabel(session.state) : 'Status unknown'}</span>
                        <span>
                          {session.coverage === 'complete'
                            ? 'Conversation available'
                            : session.coverage === 'partial'
                              ? 'Partial conversation'
                              : 'Awaiting transcript'}
                        </span>
                      </footer>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
          <footer>Read only. Reply, approve commands, and cancel work in Codex.</footer>
        </Dialog.Content>
      </Dialog.Portal>
      <Dialog.Root open={clearing} onOpenChange={setClearing}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal">
            <Dialog.Title>Clear captured external history?</Dialog.Title>
            <Dialog.Description>
              Deletes locally captured conversations. Company projects and original Codex
              conversations are preserved.
            </Dialog.Description>
            <div className="form-actions">
              <Dialog.Close className="secondary">Cancel</Dialog.Close>
              <button
                className="primary"
                onClick={() =>
                  void api('companion/clear', {})
                    .then(() => {
                      setSelected(null);
                      setDrawer(false);
                      setClearing(false);
                      void refresh();
                    })
                    .catch((error) => setError(error.message))
                }
              >
                Clear history
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Dialog.Root>
  );
}
