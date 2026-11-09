import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import Markdown from 'react-markdown';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  Copy,
  ExternalLink,
  Folder,
  FolderOpen,
  LayoutGrid,
  ListTodo,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Users,
  X,
} from 'lucide-react';
import { Office } from './Office';
import { conversationProject } from '../shared/project-reference';
import { ChatDivider } from './ChatDivider';
import { isAgentWorking, isExecuting } from '../shared/agent-status';
import { api, establishSession, loadSnapshot } from './api';
import {
  employees,
  type Snapshot,
  type Role,
  type Task,
  type Profile,
  type Project,
  type Evidence,
} from '../shared/types';

const running = (t: Task) =>
  ['working', 'reviewing', 'awaiting_input', 'stopping'].includes(t.status);
const pretty = (text: string) => text.replaceAll('_', ' ');
const stamp = (date: string) =>
  new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function Avatar({ role = 'ceo', size = 34 }: { role?: Role; size?: number }) {
  const e = employees.find((e) => e.id === role)!;
  return (
    <span className="avatar" style={{ width: size, height: size, background: e.color + '22' }}>
      <svg
        width={size * 0.7}
        height={size * 0.85}
        viewBox="0 0 24 32"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path fill="#35473f" d="M6 24h5v7H6zm8 0h5v7h-5z" />
        <path fill={e.color} d="M5 15h15v12H5zM2 17h4v8H2zm18 0h3v8h-3z" />
        <path fill="#dfbc9d" d="M6 4h13v12H6zM2 25h4v3H2zm18 0h3v3h-3z" />
        <path fill={role === 'designer' ? '#6d4c62' : '#594b3e'} d="M5 1h14v5H5zm-1 4h4v7H4z" />
        <path fill="#263a32" d="M9 9h2v2H9zm6 0h2v2h-2z" />
      </svg>
    </span>
  );
}
function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={'modal ' + (wide ? 'modal-wide' : '')}>
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={19} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Status({ status }: { status: string }) {
  return (
    <span className={'status status-' + status}>
      <i />
      {pretty(status)}
    </span>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState('office');
  const [modal, setModal] = useState<'project' | 'settings' | 'profile' | null>(null);
  const [employee, setEmployee] = useState<Role | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState('');
  const [input, setInput] = useState('');
  const [tab, setTab] = useState('chat');
  const [filter, setFilter] = useState('all');
  const [eventOnline, setEventOnline] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const refresh = useCallback(async () => {
    try {
      setSnapshot(await loadSnapshot());
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    let stream: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const reconnect = async () => {
      if (cancelled) return;
      stream?.close();
      try {
        await establishSession();
        if (cancelled) return;
        await api('company/activate', {});
        await refresh();
        stream = new EventSource('/api/events');
        stream.onopen = () => setEventOnline(true);
        stream.onerror = () => {
          setEventOnline(false);
          clearTimeout(retry);
          retry = setTimeout(() => void reconnect(), 2000);
        };
        stream.addEventListener('changed', () => void refresh());
      } catch (e: any) {
        if (!cancelled) {
          setEventOnline(false);
          setError(e.message);
          retry = setTimeout(() => void reconnect(), 2000);
        }
      }
    };
    void reconnect();
    return () => {
      cancelled = true;
      clearTimeout(retry);
      stream?.close();
    };
  }, [refresh]);
  const act = async (label: string, path: string, body: unknown = {}) => {
    setWorking(label);
    setError('');
    try {
      const result = await api(path, body);
      await refresh();
      return result;
    } catch (e: any) {
      setError(e.message);
      return undefined;
    } finally {
      setWorking('');
    }
  };
  const inspect = useCallback((role: Role) => setEmployee(role), []);
  const messages = snapshot?.messages || [];
  const lastText = messages.at(-1)?.text;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lastText]);
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.delete('project');
    history.replaceState(null, '', url);
  }, []);
  useEffect(() => {
    if (snapshot && selected && !snapshot.projects.some((p) => p.id === selected))
      setSelected(null);
  }, [snapshot, selected]);
  if (!snapshot)
    return (
      <div className="loading-screen">
        <span className="brand-mark">n.</span>
        <h1>Nxsoos Company</h1>
        {error ? (
          <>
            <p>{error}</p>
            <button className="primary" onClick={() => location.reload()}>
              Reconnect
            </button>
          </>
        ) : (
          <p>
            <LoaderCircle className="spin" size={16} /> Opening the office…
          </p>
        )}
      </div>
    );
  const project = snapshot.projects.find((p) => p.id === selected);
  const suggestedProject = conversationProject(snapshot.projects, snapshot.messages, input);
  const tasks = snapshot.tasks.filter((t) => !selected || t.projectId === selected);
  const active = snapshot.tasks.filter(running);
  const completed = tasks.filter((t) => t.status === 'completed');
  const pending = snapshot.approvals.filter((a) => a.status === 'pending');
  const preferences = snapshot.preferences.filter((p) => p.status === 'pending');
  const ready = snapshot.runtime.state === 'ready' && snapshot.runtime.authenticated;
  const ceoWorking = isAgentWorking(
    'ceo',
    snapshot.tasks,
    snapshot.ceoBusy.length > 0,
    eventOnline,
  );
  const busy = snapshot.ceoBusy.length > 0;
  const focusedTask = snapshot.tasks.find((t) => t.id === taskId);
  const scopedEvents = snapshot.activities.filter((e) => !selected || e.projectId === selected);
  const totalTokens = snapshot.requests
    .filter((r) => !selected || r.projectId === selected)
    .reduce((sum, r) => sum + r.tokens, 0);
  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    const text = input;
    const result = await act('Sending', 'messages', { projectId: null, text });
    if (result) {
      setInput('');
    }
  };
  const prompt = (text: string) => {
    setInput(text);
    setTab('chat');
    textarea.current?.focus();
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setSelected(null);
            setView('office');
          }}
        >
          <span className="brand-mark">n.</span>
          <span>
            nxsoos<span className="brand-sub">COMPANY</span>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-symbol">
            <Command size={15} />
          </span>
          Personal workspace<span className="local-badge">LOCAL</span>
        </div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav aria-label="Workspace">
          <button
            className={view === 'office' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setView('office')}
          >
            <LayoutGrid size={17} />
            The office<span className="nav-shortcut">⌘ 1</span>
          </button>
          <button
            className={view === 'tasks' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setView('tasks')}
          >
            <ListTodo size={17} />
            Task board{active.length > 0 && <span className="nav-count">{active.length}</span>}
          </button>
          <button
            className={view === 'memory' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setView('memory')}
          >
            <BookOpen size={17} />
            Company memory
          </button>
          <a
            className="nav-item"
            href="/visualizer"
            target="_blank"
            rel="noreferrer"
            aria-label="Codex visualizer"
          >
            <Terminal size={17} />
            <span className="nav-label">Codex visualizer</span>
            <ExternalLink size={12} />
          </a>
        </nav>
        <div className="nav-section-label projects-label">
          YOUR PROJECTS
          <button
            className="icon-button"
            aria-label="Add project"
            onClick={() => setModal('project')}
          >
            <Plus size={15} />
          </button>
        </div>
        <button
          className={'project-nav ' + (!selected ? 'project-selected' : '')}
          onClick={() => setSelected(null)}
        >
          <span className="project-dot all-dot" />
          All projects<span>{snapshot.projects.length}</span>
        </button>
        {snapshot.projects.map((p) => (
          <button
            key={p.id}
            className={'project-nav ' + (selected === p.id ? 'project-selected' : '')}
            onClick={() => setSelected(p.id)}
          >
            <span className="project-dot" style={{ background: p.color }} />
            {p.name}
            <span>
              {snapshot.tasks.filter((t) => t.projectId === p.id && running(t)).length || ''}
            </span>
          </button>
        ))}
        <button className="add-project" onClick={() => setModal('project')}>
          <Plus size={15} />
          Add a project
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <ShieldCheck size={18} />
            </span>
            <strong>Your space. Your control.</strong>
            <p>
              Runs on your computer.
              <br />
              Works on your terms.
            </p>
          </div>
          <button className="nav-item" onClick={() => setModal('settings')}>
            <Settings size={17} />
            Settings
          </button>
          <button className="profile-button" onClick={() => setModal('profile')}>
            <span className="user-initial">{snapshot.profile.name?.[0]?.toUpperCase() || 'Y'}</span>
            <span>
              <strong>{snapshot.profile.name || 'Your workspace'}</strong>
              <small>{snapshot.profile.onboarded ? 'Personal profile' : 'Set up your CEO'}</small>
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <strong>
              {view === 'office'
                ? 'The office'
                : view === 'tasks'
                  ? 'Task board'
                  : 'Company memory'}
            </strong>
            {project && (
              <>
                <ChevronRight size={14} />
                <span>{project.name}</span>
              </>
            )}
          </div>
          <div className="topbar-actions">
            <span className="service-state">
              <i className={eventOnline ? 'connected' : ''} />
              {eventOnline ? 'Service online' : 'Reconnecting'}
            </span>
            <button
              className="icon-button notification-button"
              aria-label={`${pending.length + preferences.length} items need your attention`}
              onClick={() => setTab('inbox')}
            >
              <Bell size={18} />
              {pending.length + preferences.length > 0 && <span />}
            </button>
            <span className="topbar-divider" />
            <button
              className="user-initial small"
              aria-label="Your profile"
              onClick={() => setModal('profile')}
            >
              {snapshot.profile.name?.[0]?.toUpperCase() || 'Y'}
            </button>
          </div>
        </header>
        {error && (
          <div role="alert" className="error-banner">
            <span>{error}</span>
            <button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="main-columns">
          <main className="main-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">A PLACE FOR YOUR NEXT BIG IDEA</div>
                <h1>
                  {view === 'office'
                    ? 'Your company, at a glance.'
                    : view === 'tasks'
                      ? 'Good work, in progress.'
                      : 'A company that remembers.'}
                </h1>
                <p>
                  {view === 'office'
                    ? 'One conversation. A team of possibilities.'
                    : view === 'tasks'
                      ? 'Every assignment, decision, and result in one place.'
                      : 'The context behind your projects and how you like to work.'}
                </p>
              </div>
              <button className="secondary compact" onClick={() => setModal('project')}>
                <Plus size={15} />
                New project
              </button>
            </div>
            {!snapshot.profile.onboarded && (
              <button className="welcome-strip" onClick={() => setModal('profile')}>
                <span className="welcome-icon">
                  <Sparkles size={18} />
                </span>
                <span>
                  <strong>Make this company yours.</strong>
                  <span>Teach your CEO how you like to think and learn.</span>
                </span>
                <ArrowRight size={17} />
              </button>
            )}
            {view === 'office' && (
              <div className="company-observation-note">
                <Terminal size={17} />
                <span>
                  This office shows work assigned in the browser chat. For Codex CLI or IDE
                  activity,{' '}
                  <a href="/visualizer" target="_blank" rel="noreferrer">
                    open the Codex visualizer <ExternalLink size={12} />
                  </a>
                  .
                </span>
              </div>
            )}
            <div className="stats-grid">
              <div>
                <span className="stat-label">
                  <Users size={14} />
                  ON THE FLOOR
                </span>
                <strong>
                  {active.length}
                  <small>/ {snapshot.settings.maxEmployees}</small>
                  <span className="stat-text">employees working</span>
                </strong>
              </div>
              <div>
                <span className="stat-label">
                  <ListTodo size={14} />
                  IN THE PIPELINE
                </span>
                <strong>
                  {tasks.filter((t) => t.status === 'queued').length}
                  <span className="stat-text">tasks queued</span>
                </strong>
              </div>
              <div>
                <span className="stat-label">
                  <Check size={14} />
                  WRAPPED UP
                </span>
                <strong>
                  {completed.length}
                  <span className="stat-text">assignments completed</span>
                </strong>
              </div>
            </div>
            {view === 'office' ? (
              <>
                <section className="office-section">
                  <div className="section-bar">
                    <div>
                      <span className="section-dot" />
                      THE COMPANY FLOOR<span className="subtle">Floor 01</span>
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        void act(
                          snapshot.paused ? 'Resuming' : 'Pausing',
                          snapshot.paused ? 'company/resume' : 'company/pause',
                        )
                      }
                    >
                      {snapshot.paused ? <Play size={13} /> : <Pause size={13} />}{' '}
                      {snapshot.paused ? 'Resume work' : 'Pause work'}
                    </button>
                  </div>
                  <Office
                    tasks={eventOnline ? snapshot.tasks : []}
                    projects={snapshot.projects}
                    online={eventOnline}
                    busy={eventOnline && snapshot.ceoBusy.length > 0}
                    onEmployee={inspect}
                  />
                </section>
                <section className="team-section">
                  <div className="section-title">
                    <h2>
                      Meet your team<span>05</span>
                    </h2>
                    <span className="agent-legend">
                      <i aria-hidden="true" />
                      Working
                      <i aria-hidden="true" />
                      Not working
                    </span>
                  </div>
                  <div className="team-grid">
                    {employees.map((e) => {
                      const current = snapshot.tasks
                        .filter((t) => t.role === e.id && running(t))
                        .sort(
                          (a, b) => Number(isExecuting(b.status)) - Number(isExecuting(a.status)),
                        );
                      const isBusy = isAgentWorking(
                        e.id,
                        snapshot.tasks,
                        snapshot.ceoBusy.length > 0,
                        eventOnline,
                      );
                      const ledLabel = !eventOnline
                        ? 'Disconnected: status unavailable'
                        : isBusy
                          ? 'Working'
                          : current.some((t) => t.status === 'awaiting_input')
                            ? 'Not working: waiting for your input'
                            : 'Idle';
                      return (
                        <button key={e.id} className="team-card" onClick={() => inspect(e.id)}>
                          <div className="team-top">
                            <Avatar role={e.id} size={40} />
                            <span
                              className={'employee-dot ' + (isBusy ? 'active' : '')}
                              role="img"
                              aria-label={`${e.name}: ${ledLabel}`}
                              title={ledLabel}
                              data-state={isBusy ? 'working' : 'idle'}
                            />
                          </div>
                          <strong>{e.name}</strong>
                          <span>{e.title}</span>
                          <small>
                            {!eventOnline
                              ? 'Connection lost'
                              : current[0]?.status === 'awaiting_input'
                                ? 'Needs your input'
                                : current[0]?.status === 'stopping'
                                  ? 'Stopping safely'
                                  : isBusy
                                    ? current.length > 1
                                      ? `${current.length} assignments`
                                      : 'Working'
                                    : 'Idle · ready when you are'}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section className="activity-section">
                  <div className="section-title">
                    <h2>Office journal</h2>
                    <span>Updates that matter</span>
                  </div>
                  {scopedEvents.length === 0 ? (
                    <div className="journal-empty">
                      <span className="journal-line" />
                      <p>A fresh start. Your company’s story begins with its first project.</p>
                    </div>
                  ) : (
                    <div className="journal-list">
                      {scopedEvents
                        .slice(-5)
                        .reverse()
                        .map((e) => (
                          <button
                            disabled={!e.taskId}
                            onClick={() => setTaskId(e.taskId)}
                            className="journal-item"
                            key={e.id}
                          >
                            <span
                              className={'journal-marker ' + (e.type === 'completed' ? 'done' : '')}
                            />
                            <span>{e.message}</span>
                            <time>{stamp(e.createdAt)}</time>
                          </button>
                        ))}
                    </div>
                  )}
                </section>
              </>
            ) : view === 'tasks' ? (
              <>
                <div className="task-toolbar">
                  <div className="segmented">
                    {['all', 'active', 'completed'].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? 'chosen' : ''}
                        onClick={() => setFilter(f)}
                      >
                        {f === 'all' ? 'All tasks' : f === 'active' ? 'In progress' : 'Completed'}
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => void act('Pausing', 'company/pause')}
                  >
                    <Square size={13} />
                    Stop all
                  </button>
                </div>
                <div className="task-list">
                  {tasks
                    .filter(
                      (t) =>
                        filter === 'all' ||
                        (filter === 'active' && running(t)) ||
                        (filter === 'completed' && t.status === 'completed'),
                    )
                    .slice()
                    .reverse()
                    .map((t) => (
                      <button key={t.id} className="task-row" onClick={() => setTaskId(t.id)}>
                        <Avatar role={t.role} />
                        <span>
                          <strong>{t.title}</strong>
                          <small>
                            {snapshot.projects.find((p) => p.id === t.projectId)?.name} ·{' '}
                            {employees.find((e) => e.id === t.role)?.name}
                          </small>
                        </span>
                        <Status status={t.status} />
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  {tasks.length === 0 && (
                    <div className="empty-content">
                      <ListTodo size={26} />
                      <h3>No assignments yet.</h3>
                      <p>
                        Give your CEO a task in the conversation.
                        <br />
                        Assignments will appear here as they’re created.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="memory-view">
                <section className="memory-card">
                  <div className="section-title">
                    <h2>Your CEO’s guide</h2>
                    <button className="text-button" onClick={() => setModal('profile')}>
                      Personalize
                      <ArrowRight size={13} />
                    </button>
                  </div>
                  <p className="memory-label">HOW TO EXPLAIN THINGS TO YOU</p>
                  <p>{snapshot.profile.style}</p>
                  <p className="memory-label">EXPERIENCE</p>
                  <p>{snapshot.profile.experience}</p>
                  <p className="memory-label">UPDATES</p>
                  <p>{snapshot.profile.updates}</p>
                </section>
                {snapshot.projects
                  .filter((p) => !selected || p.id === selected)
                  .map((p) => (
                    <section className="memory-card" key={p.id}>
                      <h2>
                        <span className="project-dot" style={{ background: p.color }} />
                        {p.name}
                      </h2>
                      <p>{p.description || 'No project description yet.'}</p>
                      <div className="memory-summary">
                        <Markdown>
                          {p.summary ||
                            'Project decisions and employee results will be recorded here as work happens.'}
                        </Markdown>
                      </div>
                      <code className="folder-path">{p.path}</code>
                    </section>
                  ))}
                <button
                  className="secondary"
                  onClick={() => {
                    window.location.href = '/api/export';
                  }}
                >
                  <ArrowDownToLine size={15} />
                  Export company memory
                </button>
              </div>
            )}
            <footer className="workspace-footer">
              <span>
                <span className="tiny-diamond" />
                Built around the way you work.
              </span>
              <span>
                {totalTokens.toLocaleString()} reported tokens<span className="footer-dot">·</span>
                {snapshot.projects.length} projects
              </span>
            </footer>
          </main>
          <ChatDivider />
          <aside
            className={'conversation-panel ' + (tab === 'inbox' ? 'inbox-active' : '')}
            aria-label="CEO conversation"
          >
            <div className="conversation-header">
              <Avatar size={40} />
              <div>
                <strong>
                  Atlas<span className="ceo-badge">CEO</span>
                </strong>
                <span>
                  <i
                    className={'agent-status-light' + (ceoWorking ? ' active' : '')}
                    role="img"
                    aria-label={`CEO activity: ${ceoWorking ? 'Working' : 'Idle'}`}
                  />
                  {!eventOnline
                    ? 'Connection lost'
                    : busy
                      ? 'Thinking through your request'
                      : ready
                        ? 'Idle · ready to help'
                        : 'Idle · connect Codex to start'}
                </span>
              </div>
              <button
                className="icon-button"
                aria-label="CEO settings"
                onClick={() => setModal('settings')}
              >
                <MoreHorizontal size={19} />
              </button>
            </div>
            <div className="conversation-tabs">
              <button className={tab === 'chat' ? 'current' : ''} onClick={() => setTab('chat')}>
                <MessageSquare size={14} />
                Conversation
              </button>
              <button className={tab === 'inbox' ? 'current' : ''} onClick={() => setTab('inbox')}>
                <Bell size={14} />
                Needs you
                {pending.length + preferences.length > 0 && (
                  <span>{pending.length + preferences.length}</span>
                )}
              </button>
            </div>
            {tab === 'chat' ? (
              <>
                <div className="conversation-context">
                  <MessageSquare size={13} />
                  <span>
                    {suggestedProject
                      ? `Next request: ${suggestedProject.name}`
                      : 'All projects · one CEO conversation'}
                  </span>
                </div>
                <div className="chat-scroll">
                  {messages.length === 0 ? (
                    <div className="chat-welcome">
                      <span className="hello-symbol">
                        <Sparkles size={26} />
                      </span>
                      <h2>What’s on your mind?</h2>
                      <p>
                        I’m Atlas, your CEO. Tell me what you want to build, fix, or understand.
                        I’ll help turn it into a next step.
                      </p>
                      <div className="suggestions">
                        <button
                          onClick={() =>
                            prompt(
                              project
                                ? `Explore project "${project.name}" and explain how it works in simple English.`
                                : 'Help me decide how to organize my projects.',
                            )
                          }
                        >
                          <BookOpen size={15} />
                          {project
                            ? 'Help me understand this project'
                            : 'Help me organize my projects'}
                          <ArrowRight size={13} />
                        </button>
                        <button
                          onClick={() =>
                            prompt(
                              'Help me plan a feature. Ask me what outcome I want before assigning work.',
                            )
                          }
                        >
                          <Sparkles size={15} />
                          Let’s plan something new
                          <ArrowRight size={13} />
                        </button>
                        <button onClick={() => setModal('profile')}>
                          <Users size={15} />
                          Get to know how I think
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={'chat-message message-' + m.author}>
                        <div className="message-meta">
                          {m.author === 'ceo' ? (
                            <Avatar size={23} />
                          ) : m.author === 'user' ? (
                            <span className="mini-user">{snapshot.profile.name?.[0] || 'Y'}</span>
                          ) : (
                            <CircleHelp size={15} />
                          )}
                          <strong>
                            {m.author === 'ceo' ? 'Atlas' : m.author === 'user' ? 'You' : 'Company'}
                          </strong>
                          <time>{stamp(m.createdAt)}</time>
                          {m.projectId && (
                            <span className="message-project">
                              {snapshot.projects.find((p) => p.id === m.projectId)?.name ||
                                'Project'}
                            </span>
                          )}
                        </div>
                        <div className="markdown">
                          <Markdown>{m.text}</Markdown>
                        </div>
                        {m.author === 'ceo' && m.text && (
                          <div className="explain-actions">
                            <button
                              onClick={() =>
                                prompt(
                                  `For ${snapshot.projects.find((p) => p.id === m.projectId)?.name || 'the company'}, explain this answer more simply with one concrete example: ${m.text.slice(0, 2500)}`,
                                )
                              }
                            >
                              Simpler
                            </button>
                            <button
                              onClick={() =>
                                prompt(
                                  `For ${snapshot.projects.find((p) => p.id === m.projectId)?.name || 'the company'}, show actual code or evidence behind this answer: ${m.text.slice(0, 2500)}`,
                                )
                              }
                            >
                              Show evidence
                            </button>
                            <button
                              aria-label="Copy answer"
                              onClick={() =>
                                void navigator.clipboard
                                  .writeText(m.text)
                                  .catch((e) => setError(e.message))
                              }
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {busy && (
                    <div className="thinking">
                      <span />
                      <span />
                      <span />
                      Atlas is working through it
                    </div>
                  )}
                  <div ref={end} />
                </div>
                {!ready && (
                  <div className="connection-card">
                    <div>
                      <Terminal size={15} />
                      <strong>
                        {snapshot.runtime.state === 'connecting'
                          ? 'Connecting…'
                          : 'Bring your company online'}
                      </strong>
                    </div>
                    <p>
                      {snapshot.runtime.state === 'error'
                        ? snapshot.runtime.message
                        : 'Connect your local Codex to start a real conversation.'}
                    </p>
                    <button
                      className="primary"
                      disabled={!!working}
                      onClick={() => void act('Connecting', 'codex/connect')}
                    >
                      {working === 'Connecting' ? (
                        <LoaderCircle className="spin" size={14} />
                      ) : (
                        <Command size={14} />
                      )}
                      Connect Codex
                      <ArrowRight size={14} />
                    </button>
                    {snapshot.runtime.state === 'ready' && !snapshot.runtime.authenticated && (
                      <button
                        className="text-button"
                        onClick={() =>
                          void act('Signing in', 'codex/login').then((result) => {
                            if (result?.authUrl)
                              window.open(result.authUrl, '_blank', 'noopener,noreferrer');
                          })
                        }
                      >
                        Sign in with ChatGPT
                        <ExternalLink size={12} />
                      </button>
                    )}
                  </div>
                )}
                <form className="composer" onSubmit={send}>
                  <label className="sr-only" htmlFor="ceo-message">
                    Message Atlas
                  </label>
                  <textarea
                    id="ceo-message"
                    ref={textarea}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      ready
                        ? 'Tell Atlas what you have in mind…'
                        : 'Connect Codex to start the conversation…'
                    }
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (ready && !working) void send();
                      }
                    }}
                  />
                  <div>
                    <span>
                      <span className="composer-key">↵</span> to send
                      <span className="subtle"> · Shift ↵ for a new line</span>
                    </span>
                    <button
                      type="submit"
                      className="send-button"
                      aria-label="Send message"
                      disabled={!ready || !input.trim() || !!working}
                    >
                      {working === 'Sending' ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ArrowUp size={19} />
                      )}
                    </button>
                  </div>
                </form>
                <p className="composer-note">Real work. Clear explanations. Always your call.</p>
              </>
            ) : (
              <div className="inbox-scroll">
                {pending.length + preferences.length === 0 ? (
                  <div className="empty-inbox">
                    <Check size={24} />
                    <h3>You’re all caught up.</h3>
                    <p>
                      Questions, command approvals, and preference suggestions will appear here.
                    </p>
                  </div>
                ) : (
                  <>
                    {pending.map((a) => (
                      <ApprovalCard key={a.id} approval={a} act={act} />
                    ))}
                    {preferences.map((p) => (
                      <div className="approval-card" key={p.id}>
                        <span className="eyebrow">PERSONAL PREFERENCE</span>
                        <h3>Should I remember this?</h3>
                        <p>{p.instruction}</p>
                        <div>
                          <button
                            className="primary"
                            onClick={() =>
                              void act('Saving', `preferences/${p.id}`, { action: 'accept' })
                            }
                          >
                            Remember this
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              void act('Declining', `preferences/${p.id}`, { action: 'decline' })
                            }
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {snapshot.requests
                  .filter((r) => r.budgetPaused)
                  .map((r) => (
                    <div className="approval-card" key={r.id}>
                      <h3>Request budget reached</h3>
                      <p>{r.tokens.toLocaleString()} reported tokens. Partial work is saved.</p>
                      <button
                        className="primary"
                        onClick={() => void act('Extending', `requests/${r.id}/extend`)}
                      >
                        Add {snapshot.settings.defaultBudget.toLocaleString()} tokens
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <div className="conversation-bottom">
              <span className={ready ? 'live-dot' : 'offline-dot'} />
              {ready
                ? snapshot.runtime.verified
                  ? 'Codex · live connection verified'
                  : 'Codex · connected, unverified'
                : 'Local service · Codex offline'}
              <span className="spacer" />
              <ShieldCheck size={12} />
            </div>
          </aside>
        </div>
      </div>
      {modal === 'project' && (
        <ProjectModal
          onClose={() => setModal(null)}
          onSubmit={async (values) => {
            const p = await api<Project>('projects', values);
            await refresh();
            setSelected(p.id);
            setModal(null);
          }}
        />
      )}
      {modal === 'profile' && (
        <ProfileModal
          profile={snapshot.profile}
          onClose={() => setModal(null)}
          onSave={async (profile) => {
            if (await act('Saving profile', 'profile', profile)) setModal(null);
          }}
          preferences={snapshot.preferences}
          act={act}
        />
      )}
      {modal === 'settings' && (
        <SettingsModal snapshot={snapshot} onClose={() => setModal(null)} act={act} />
      )}
      {employee && (
        <Modal
          title={`${employees.find((e) => e.id === employee)!.name} · ${employees.find((e) => e.id === employee)!.title}`}
          description="Real assignments and the capabilities of this employee."
          onClose={() => setEmployee(null)}
        >
          <div className="employee-profile">
            <Avatar role={employee} size={68} />
            <p>
              {employee === 'ceo'
                ? 'Your point of contact. Plans work, delegates bounded assignments, and explains the evidence in your preferred style.'
                : employee === 'developer'
                  ? 'Implements changes directly in the selected project. Every write checks the file’s previous version, and completed work is assigned a review.'
                  : employee === 'reviewer'
                    ? 'Checks implementation against acceptance criteria. Verification commands wait for your approval.'
                    : employee === 'researcher'
                      ? 'Investigates project files and returns concise findings with evidence. Project access is read-only.'
                      : 'Proposes interfaces and user flows using the selected project context. Project access is read-only.'}
            </p>
          </div>
          <h3 className="small-heading">ASSIGNMENTS</h3>
          {snapshot.tasks
            .filter((t) => t.role === employee)
            .slice(-12)
            .reverse()
            .map((t) => (
              <button
                className="task-row"
                key={t.id}
                onClick={() => {
                  setEmployee(null);
                  setTaskId(t.id);
                }}
              >
                <span>
                  <strong>{t.title}</strong>
                  <small>{snapshot.projects.find((p) => p.id === t.projectId)?.name}</small>
                </span>
                <Status status={t.status} />
              </button>
            ))}
          {!snapshot.tasks.some((t) => t.role === employee) && (
            <p className="empty-copy">No assignments yet. Ready when you are.</p>
          )}
        </Modal>
      )}
      {focusedTask && (
        <TaskModal
          task={focusedTask}
          evidence={snapshot.evidence.filter((e) => e.taskId === focusedTask.id)}
          onClose={() => setTaskId(null)}
          act={act}
          onExplain={(text) => {
            setSelected(focusedTask.projectId);
            setTaskId(null);
            prompt(
              `For project "${snapshot.projects.find((p) => p.id === focusedTask.projectId)?.name}": ${text}`,
            );
          }}
        />
      )}
      {working && (
        <div className="working-toast" role="status">
          <LoaderCircle className="spin" size={15} />
          {working}…
        </div>
      )}
    </div>
  );
}

function ProjectModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (v: { name: string; path: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const browse = async () => {
    setPicking(true);
    setError('');
    try {
      const result = await api<{ path: string | null }>('folders/pick', { path });
      if (result.path) {
        setPath(result.path);
        if (!name.trim()) setName(result.path.split(/[\\/]/).filter(Boolean).at(-1) || 'Project');
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setPicking(false);
    }
  };
  return (
    <Modal
      title="Add a project"
      description="Choose the folder you want your team to work on."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError('');
          try {
            await onSubmit({ name, path, description });
          } catch (error: any) {
            setError(error.message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="project-folder-choice">
          <FolderOpen size={28} />
          <strong>
            {path ? name || 'Project folder selected' : 'Start with your project folder'}
          </strong>
          <p>{path || 'Select a folder from Windows File Explorer.'}</p>
          <button
            type="button"
            className="primary"
            disabled={picking || saving}
            onClick={() => void browse()}
          >
            {picking ? <LoaderCircle className="spin" size={16} /> : <FolderOpen size={16} />}
            {picking
              ? 'Waiting for folder selection…'
              : path
                ? 'Change folder'
                : 'Choose project folder'}
          </button>
        </div>
        <details className="manual-folder">
          <summary>Enter a folder path instead</summary>
          <label>
            Project folder
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder={'C:\\Projects\\my-project'}
            />
          </label>
        </details>
        <label>
          Project name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Filled from your folder name"
            maxLength={100}
          />
        </label>
        <label>
          What is this project about?
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Optional — what should Atlas know about it?"
            maxLength={3000}
          />
        </label>
        <div className="form-note">
          <ShieldCheck size={17} />
          <p>Your files stay in place. Commands and publishing require your approval.</p>
        </div>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            disabled={saving || picking}
          >
            Cancel
          </button>
          <button className="primary" disabled={saving || picking || !path.trim() || !name.trim()}>
            {saving ? 'Adding…' : 'Add project'}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ProfileModal({
  profile,
  onClose,
  onSave,
  preferences,
  act,
}: {
  profile: Profile;
  onClose: () => void;
  onSave: (p: Profile) => Promise<void>;
  preferences: Snapshot['preferences'];
  act: any;
}) {
  const [draft, setDraft] = useState(profile);
  const [step, setStep] = useState(profile.onboarded ? 1 : 0);
  const [saving, setSaving] = useState(false);
  const [example, setExample] = useState('practical');
  const update = (key: keyof Profile, value: string) => setDraft({ ...draft, [key]: value });
  return (
    <Modal
      title={step === 0 ? 'Let’s make this feel like you.' : 'A CEO who speaks your language.'}
      description="Your preferences become explicit instructions. You can change them at any time."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (step === 0) {
            setStep(1);
            return;
          }
          setSaving(true);
          await onSave({
            ...draft,
            onboarded: true,
            examples:
              draft.examples ||
              (example === 'practical'
                ? 'Favorites now survive closing the app. Before, the list lived only while the app was open. We saved it locally and checked reopening it. Explain the outcome and example before implementation details.'
                : 'Explain the technical mechanism with defined terms and a concrete example.'),
          });
          setSaving(false);
        }}
      >
        {step === 0 ? (
          <>
            <label>
              What should Atlas call you?
              <input
                value={draft.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Your name"
                maxLength={100}
              />
            </label>
            <label>
              Where are you in your coding journey?
              <select
                value={draft.experience}
                onChange={(e) => update('experience', e.target.value)}
              >
                {[
                  'Learning by building',
                  'Comfortable with the basics',
                  'Experienced developer',
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <p className="field-label">Which explanation clicks faster?</p>
            <button
              type="button"
              className={'example-choice ' + (example === 'practical' ? 'chosen' : '')}
              onClick={() => {
                setExample('practical');
                update(
                  'style',
                  'Start with the practical outcome, then use one concrete example from my project. Define unfamiliar terms. Give technical details when I ask.',
                );
              }}
            >
              <strong>A · Start with what changed</strong>
              <p>
                “Your favorites now survive closing the app. We saved the list on your device and
                checked that it comes back when you reopen it.”
              </p>
            </button>
            <button
              type="button"
              className={'example-choice ' + (example === 'technical' ? 'chosen' : '')}
              onClick={() => {
                setExample('technical');
                update(
                  'style',
                  'Explain the technical mechanism first, define unfamiliar terms, and connect it to a concrete project example.',
                );
              }}
            >
              <strong>B · Start with how it works</strong>
              <p>
                “Favorites are serialized—a conversion into storable text—and persisted locally. The
                app loads them when it starts.”
              </p>
            </button>
            <button className="primary">
              Continue
              <ArrowRight size={15} />
            </button>
          </>
        ) : (
          <>
            <label>
              Your name
              <input value={draft.name} onChange={(e) => update('name', e.target.value)} />
            </label>
            <label>
              How should Atlas explain things?
              <textarea
                rows={4}
                value={draft.style}
                onChange={(e) => update('style', e.target.value)}
                maxLength={6000}
              />
            </label>
            <label>
              When should Atlas update you?
              <select value={draft.updates} onChange={(e) => update('updates', e.target.value)}>
                {[
                  'Meaningful milestones and blockers',
                  'Only when work finishes or needs me',
                  'Frequent progress updates',
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              An explanation or example you liked
              <textarea
                rows={3}
                value={draft.examples}
                onChange={(e) => update('examples', e.target.value)}
                placeholder="Optional. Give Atlas something concrete to learn from."
                maxLength={8000}
              />
            </label>
            <div className="form-note">
              <BookOpen size={17} />
              <p>
                Your profile is saved locally as Markdown and loaded into CEO conversations.
                Suggested changes always wait for you to approve them.
              </p>
            </div>
            <div className="form-actions">
              {!profile.onboarded && (
                <button type="button" className="secondary" onClick={() => setStep(0)}>
                  Back
                </button>
              )}
              <button className="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save my preferences'}
                <Check size={15} />
              </button>
            </div>
            {preferences
              .filter((p) => p.status === 'accepted')
              .slice()
              .reverse()
              .map((p) => (
                <div className="preference-history" key={p.id}>
                  <span>{p.instruction}</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void act('Undoing', `preferences/${p.id}`, { action: 'undo' })}
                  >
                    Undo
                  </button>
                </div>
              ))}
          </>
        )}
      </form>
    </Modal>
  );
}
function SettingsModal({
  snapshot,
  onClose,
  act,
}: {
  snapshot: Snapshot;
  onClose: () => void;
  act: any;
}) {
  const [settings, setSettings] = useState(snapshot.settings);
  const [notice, setNotice] = useState('');
  return (
    <Modal
      title="Your company, your rules."
      description="Connection, usage limits, and local data."
      onClose={onClose}
    >
      <div className="form">
        <section className="settings-section">
          <div className="section-title">
            <h3>Codex connection</h3>
            <Status status={snapshot.runtime.state === 'ready' ? 'completed' : 'blocked'} />
          </div>
          <p>{snapshot.runtime.message}</p>
          <code className="folder-path">
            {snapshot.runtime.version || 'No executable connected yet'}
          </code>
          <div className="button-row">
            <button className="secondary" onClick={() => void act('Connecting', 'codex/connect')}>
              Connect
            </button>
            <button
              className="secondary"
              disabled={snapshot.runtime.state !== 'ready'}
              onClick={() =>
                void act('Signing in', 'codex/login').then((r: any) => {
                  if (r?.authUrl) window.open(r.authUrl, '_blank', 'noopener,noreferrer');
                })
              }
            >
              Sign in
              <ExternalLink size={12} />
            </button>
            <button
              className="secondary"
              disabled={!snapshot.runtime.authenticated}
              onClick={() => void act('Verifying connection', 'codex/verify')}
            >
              Verify live connection
            </button>
          </div>
          <p className="help-text">
            Verification uses a small real inference request. Existing Codex account limits apply.
          </p>
        </section>
        <section className="settings-section">
          <h3>Usage controls</h3>
          <label>
            Model
            <select
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            >
              <option value="">Use Codex default</option>
              {snapshot.runtime.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-columns">
            <label>
              Concurrent employees
              <select
                value={settings.maxEmployees}
                onChange={(e) => setSettings({ ...settings, maxEmployees: Number(e.target.value) })}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} employees
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tokens per request
              <input
                type="number"
                min={1000}
                max={1000000}
                step={1000}
                value={settings.defaultBudget}
                onChange={(e) =>
                  setSettings({ ...settings, defaultBudget: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <p className="help-text">
            Soft limits use reported tokens, which can arrive after consumption. They aren’t an
            exact billing cap.
          </p>
          <button
            className="primary"
            onClick={() =>
              void act('Saving settings', 'settings', settings).then(
                (r: any) => r && setNotice('Settings saved.'),
              )
            }
          >
            Save controls
            <Check size={14} />
          </button>
          {snapshot.runtime.rateLimits !== null && (
            <details>
              <summary>Account limit information</summary>
              <pre>{JSON.stringify(snapshot.runtime.rateLimits, null, 2)}</pre>
            </details>
          )}
        </section>
        <section className="settings-section">
          <h3>Local data</h3>
          <p>
            Memory stays in the local company database. Project content sent to Codex is processed
            by your AI provider.
          </p>
          <div className="button-row">
            <button
              className="secondary"
              onClick={() => {
                window.location.href = '/api/export';
              }}
            >
              <ArrowDownToLine size={14} />
              Export memory
            </button>
            <button
              className="secondary"
              onClick={() =>
                void act('Backing up', 'backup').then(
                  (r: any) => r && setNotice('Backup created: ' + r.path),
                )
              }
            >
              Create database backup
            </button>
          </div>
          <p className="help-text">
            Closing this browser keeps work running. Stopping the service interrupts work; it never
            replays uncertain commands automatically.
          </p>
        </section>
        {notice && (
          <p role="status" className="success-note">
            {notice}
          </p>
        )}
      </div>
    </Modal>
  );
}
function ApprovalCard({ approval, act }: { approval: Snapshot['approvals'][number]; act: any }) {
  const [answer, setAnswer] = useState('');
  return (
    <div className="approval-card">
      <span className="eyebrow">
        {approval.kind === 'question' ? 'A QUICK QUESTION' : 'COMMAND APPROVAL'}
      </span>
      <h3>{approval.title}</h3>
      <pre>{approval.details}</pre>
      {approval.kind === 'question' && (
        <label>
          Your answer
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} />
        </label>
      )}
      <div>
        <button
          className="primary"
          onClick={() =>
            void act('Approving', `approvals/${approval.id}`, { accept: true, answer })
          }
        >
          {approval.kind === 'question' ? 'Send answer' : 'Approve once'}
        </button>
        <button
          className="secondary"
          onClick={() => void act('Declining', `approvals/${approval.id}`, { accept: false })}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
function TaskModal({
  task,
  evidence,
  onClose,
  act,
  onExplain,
}: {
  task: Task;
  evidence: Evidence[];
  onClose: () => void;
  act: any;
  onExplain: (text: string) => void;
}) {
  const [tab, setTab] = useState('overview');
  return (
    <Modal
      title={task.title}
      description={`Assigned to ${employees.find((e) => e.id === task.role)?.name} · ${task.tokens.toLocaleString()} reported tokens`}
      onClose={onClose}
      wide
    >
      <div className="task-detail-bar">
        <Status status={task.status} />
        <div className="button-row">
          {task.status === 'queued' && (
            <button
              className="secondary compact"
              onClick={() =>
                void act('Prioritizing', `tasks/${task.id}/priority`, {
                  priority: Math.min(10, task.priority + 1),
                })
              }
            >
              Prioritize
            </button>
          )}
          {['queued', 'working', 'reviewing', 'awaiting_input'].includes(task.status) && (
            <button
              className="secondary compact"
              onClick={() => void act('Cancelling', `tasks/${task.id}/cancel`)}
            >
              Cancel assignment
            </button>
          )}
          {['interrupted', 'failed', 'blocked'].includes(task.status) && (
            <button
              className="secondary compact"
              onClick={() => void act('Resuming', `tasks/${task.id}/resume`)}
            >
              Inspect & resume
            </button>
          )}
        </div>
      </div>
      <div className="detail-tabs">
        {['overview', 'evidence', 'changes'].map((t) => (
          <button className={tab === t ? 'current' : ''} key={t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'overview' ? (
        <div className="task-overview">
          <h3>The assignment</h3>
          <p>{task.brief}</p>
          <h3>What success looks like</h3>
          <p>{task.acceptance}</p>
          {task.error && (
            <div role="alert" className="task-error">
              {task.error}
            </div>
          )}
          {task.result && (
            <>
              <h3>Employee report</h3>
              <div className="markdown">
                <Markdown>{task.result}</Markdown>
              </div>
            </>
          )}
          <p className="help-text">
            {task.role === 'developer' && task.status === 'completed'
              ? 'Developer assignment finished. Check the linked review before treating the full request as complete.'
              : 'Task status reflects execution; evidence records what was actually checked.'}
          </p>
          <button
            className="primary"
            onClick={() =>
              onExplain(
                `Explain task ${task.id} (${task.title}) simply. Tell me what changed, why, what was verified, and what remains uncertain. Use its actual evidence.`,
              )
            }
          >
            Explain this to me
            <ArrowRight size={14} />
          </button>
        </div>
      ) : tab === 'changes' ? (
        <div className="evidence-list">
          {evidence
            .filter((e) => e.kind === 'file' || e.kind === 'conflict')
            .map((e) => (
              <details key={e.id} className="evidence-item">
                <summary>
                  {e.title}
                  <span>{e.kind === 'conflict' ? 'Conflict preserved' : 'File change'}</span>
                </summary>
                <div className="diff-grid">
                  <div>
                    <h4>Before</h4>
                    <pre>{e.before || '(new file)'}</pre>
                  </div>
                  <div>
                    <h4>{e.kind === 'conflict' ? 'Proposed content' : 'After'}</h4>
                    <pre>{e.after}</pre>
                  </div>
                </div>
              </details>
            ))}
          {!evidence.some((e) => e.kind === 'file' || e.kind === 'conflict') && (
            <p className="empty-copy">No recorded file changes for this assignment.</p>
          )}
        </div>
      ) : (
        <div className="evidence-list">
          {evidence.map((e) => (
            <details key={e.id} className="evidence-item">
              <summary>
                {e.title}
                <span>{e.kind}</span>
              </summary>
              <pre>{e.content}</pre>
            </details>
          ))}
          {evidence.length === 0 && (
            <p className="empty-copy">
              Evidence appears as the employee reads, edits, and verifies work.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
