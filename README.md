# Nxsoos Company

Continuing in a new AI conversation? Ask it to read [AGENTS.md](AGENTS.md) and [HANDOFF.md](HANDOFF.md). The handoff records current behavior, useful problems/solutions, validation, and remaining work; keep it updated after meaningful changes.

Two local interfaces share Atlas, Scout, Iris, Nova, Sage, and your approved explanation preferences:

- **Company:** projects, CEO chat, assignments, approvals, memory, and the office.
- **Companion:** a read-only office and conversation inspector for your normal Codex CLI and IDE sessions. Keep talking and approving work in Codex.

## Start

Requires Node.js 24 and Codex `0.164.0-alpha.11.1` on this Windows installation.

```powershell
Set-Location C:\Nasser\nxsoos_company
npm.cmd ci
npm.cmd run build
npm.cmd run company
```

| Command                  | Result                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `npm run company`        | Starts/reuses the background service and opens Company mode |
| `npm run visualizer`     | Starts/reuses the service and opens only Companion          |
| `npm start`              | Alias for Company mode                                      |
| `npm run stop`           | Drains browser-owned work and stops the service             |
| `npm run codex:link`     | Installs the removable, user-level Codex integration        |
| `npm run codex:unlink`   | Removes unchanged company-owned integration entries         |
| `npm run codex:status`   | Shows installation and capture compatibility                |
| `npm run codex:diagnose` | Checks native hook enablement/trust without inference       |

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`. Both pages can stay open together at `http://127.0.0.1:4310/company` and `/visualizer`. Closing a terminal or browser does not stop the background service. No Windows startup service is installed. If an older foreground server already uses the port, stop that server once with Ctrl+C before using these launch commands; the launcher will not kill it.

Visualizer-only startup does not create the Company scheduler, recover assignments, or start a CEO conversation. Company mode activates its scheduler once; opening Companion afterward leaves that work running. Stopping the service leaves external Codex sessions running.

## Connect normal Codex

```powershell
npm.cmd run codex:link
codex
```

In Codex, run `/hooks`, review and trust the Nxsoos entries, then start or resume a conversation so the integration loads. This native approval is required because hooks execute local commands. The installer does not bypass it. It backs up affected configuration, preserves unrelated hooks/agents, and records owned entries for repeatable updates/removal. Existing user edits to owned entries are preserved or reported as conflicts.

The root Codex conversation receives shared Atlas guidance and your approved profile. Codex chooses when to delegate to `nxsoos_researcher`, `nxsoos_designer`, `nxsoos_developer`, or `nxsoos_reviewer`, using native tools and permissions. Company assignments use the existing guarded Company tools instead. They do not schedule duplicate work for each other.

**Verification:** native CLI capture is verified on this Windows installation using a real read-only `codex --no-daemon exec` run with Atlas â†’ Scout delegation, visible conversations, tool activity, and process identity. Interactive terminal UI behavior and IDE chat have not been separately verified; IDE capture remains unverified. New installations still need hook trust and their own capture check. Running fixture tests alone never marks a client verified. Run `npm run codex:diagnose` to inspect actual hook trust. Unsupported or missing transcripts retain activity with incomplete conversation coverage. See [Companion architecture](docs/companion.md) and [verification notes](docs/verification.md).

Official integration references: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [custom subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

If an older installation reports PowerShell `Unexpected token` or hook exit-code errors, rebuild and run `npm run codex:link`, then review the modified hooks through `/hooks` and restart/resume Codex. The Windows launcher now explicitly invokes PowerShell with safely encoded literal paths; it preserves hook JSON input through the shell. Existing Command Prompt-only tests did not cover the original PowerShell quoting error. Diagnostics recognize the exact installed commands from the ownership manifest.

## Use Company mode

1. Select **Make this company yours** and approve explanation preferences/examples.
2. Add a project with **Choose project folder**. The native Windows folder dialog opens, and the project name fills from the folder. You can paste a path instead. Overlapping project folders are rejected.
3. Connect Codex. Existing supported authentication is detected; managed sign-in is available in Settings.
4. Ask Atlas to investigate, implement, review, or explain in one company-wide conversation. Name a project when switching work; you do not need to select it in the sidebar.
5. Review proposed executable checks before approving them. Task evidence, review results, request budgets, and cancellation state remain visible.

Naming one registered project routes the request to its guarded tools behind the scenes. Distinctive multi-part names tolerate a single typo (for example, `map-makers` can match `map-markers` only when there is no competing match). Follow-ups such as "make that simpler" use the preceding request's project; ambiguous project references remain in Company context so Atlas can clarify in chat. Messages from all projects stay visible with project labels. Sidebar project clicks filter the office, tasks, and memory only. No project ID is needed in the URL.

Drag the divider along the left edge of the CEO panel to resize chat. Arrow keys resize a focused divider; double-click or Home resets its width. Your chosen width is saved in this browser. On narrow screens, chat stacks below the office.

Company mode limits concurrent workers, serializes project writers, scopes file access, checks expected hashes before writing, and automatically reviews implementation. Request budgets are based on aggregate reported usage, including repeated input. Native Windows checks cannot always be terminated individually: cancellation retains the project lock until the bounded check finishes. Shutdown drains that work.

## Use Companion

Run `npm run visualizer`, then work in your normal Codex CLI or IDE. The large headquarters shows the five shared employees working in their own offices. Role-name LEDs show live status, room footers show the current/last project, and speech bubbles summarize available activity. Project labels follow each employee's tool working directory or file/patch targets, even when the conversation started elsewhere. Roots use registered projects or nearby repository/package markers; no registration is required. Without supported activity, the fallback is explicitly marked `(session folder)`. Original session workspaces remain in the inspector and workspace filter. Multiple sessions are grouped under each role, with active work taking priority. Every left-hand team card shows its role, office, status, projects, activity, and conversation button directly, without selecting an agent. The desktop visualizer fits the window without page or team scrolling, with compact cards and the working count in the filter toolbar. Long project lists can be read by hovering or focusing their value. Connection details open in a dialog. On phones, show or hide the team with the team button; the page scrolls to preserve readable details.

Use **Connected conversations** in the header to open the right-hand drawer containing all captured sessions, including other workers and history. Filter by workspace/source/employee and inspect prompts, visible answers, tool activity, and parent/child conversations. Click an agent or **Inspect conversation** for its current session. The drawer supports Escape and keyboard focus. Client labels are CLI or IDE only when identified; otherwise they say Codex.

Idle employees occasionally take decorative coffee or TV breaks and return through the corridor. First outings are staggered after 2â€“4.5 minutes of idle time, with 3â€“5 minutes back at the desk between later outings. Coffee stops last 18â€“30 seconds and TV stops last 35â€“55 seconds; employees alternate activities. Working employees remain at their desks. These movements do not make inference calls or represent real agent decisions. Pause/resume controls and reduced-motion preferences stop decorative movement while status keeps updating. The floor supports zoom, pointer dragging, and arrow-key panning; mobile opens at a closer scale. Office animation is capped at 30 fps.

Company mode's office and task counters describe browser-owned assignments. Its **Codex visualizer** navigation link opens `/visualizer`, which shows external CLI/IDE activity alongside the read-only Browser source. A zero browser assignment count does not mean a connected CLI session is inactive.

There is no external-session composer or execution control. Approvals, cancellation, and task instructions stay in the originating CLI/IDE. Green means confirmed executing work; red means idle or waiting, with explicit text for other states. Lost connections or stale activity become unknown. A completed tool call alone does not mean the task succeeded.

An overlap notice warns when live browser assignments and external Codex work use overlapping project folders. CLI-only work does not trigger it. Company locks cannot enforce mutual exclusion on an independent CLI. **Clear companion history** deletes captured external history without deleting Company records or changing Codex transcripts.

### Usage and workspace labels

Select **Usage** beside the filters for reported token totals over the past hour, 7 days, and 30 days. Totals cover captured external Codex transcript usage (CLI/IDE), across the current filters; Company browser assignments are excluded. Only connected sessions are captured, with no historical account scan. This is not a complete account history or a monetary bill. Cached input is a subset of input. Missing usage shows as unavailable rather than a zero allowance. Separately, any supported Codex account-limit snapshot shows its reported window, percentage, reset time, and capture time. Expired snapshots are labeled; no monthly plan quota is invented when Codex supplies only other windows.

The **Workspace** label is the folder reported for the Codex session, not a claim about every file it edits. A session opened in `movie-list` can edit files in `nxsoos_company` through an explicit tool working directory while retaining `movie-list` as its session workspace. Open a new Codex session from the desired folder to change that context.

## Shared employees and preferences

| Employee | Responsibility                      |
| -------- | ----------------------------------- |
| Atlas    | Understand, coordinate, and explain |
| Scout    | Investigate and research            |
| Iris     | Interface design and user flows     |
| Nova     | Implementation                      |
| Sage     | Review and verification             |

Shared definitions live in `shared/agents.ts`. Execution permissions, scheduling, and model settings remain specific to each mode. Approved preferences are projected into a revisioned local shared profile. New turns can refresh a changed revision; active conversations are not silently rewritten. Automatic personality inference, profile rewriting, training, and cross-session project memory are deferred.

## Local storage and privacy

Data defaults to `%LOCALAPPDATA%\AICompany`; `COMPANY_DATA_DIR` overrides it. The service uses SQLite plus local profile documents. The Codex bridge has a separate local credential, and both interfaces bind only to loopback. Backups, the integration manifest, and diagnostics stay in this data directory.

Capture begins with connected sessions reported after integration setup. It does not scan all historical Codex sessions. Only reported transcript files inside the configured Codex sessions directory are accepted; symlinks/junctions are rejected. Hidden reasoning, internal instruction messages, provider credentials, and unrelated files are excluded. Recognized credential fields/patterns are redacted; arbitrary text may still contain private project content, so treat local history and exports accordingly.

The bridge makes no inference calls. It queues events locally when the service is unavailable, bounded to 10 MB, and replays them later without making old work appear live. Profile injection reads the approved local profile even while the service is closed. A clone on another device contains the code and shared role definitions, not this device's local history, preferences, authentication, or hook installation. Cross-device synchronization is deferred.

## Development and verification

`npm run dev` starts the backend and Vite at `http://127.0.0.1:5173`. Use an isolated data directory/port when another service is running.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:production
npm.cmd run test:companion
```

The companion proof uses disposable state and real launcher/hook subprocesses with transcript fixtures; it consumes no model inference and is not a live native CLI/IDE proof. Existing live Company checks are described in [verification notes](docs/verification.md). See [architecture](docs/architecture.md) for scheduler and security details.
