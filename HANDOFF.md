# Nxsoos Company handoff

Last updated: 2026-11-09. This is the current project summary, not a chat transcript.

## Start here

- Repository on this device: `C:\Nasser\nxsoos_company`.
- Windows / PowerShell; Node.js 24+, TypeScript, React, PixiJS.
- `npm run company`: full browser application (also `npm start`).
- `npm run visualizer`: read-only Codex companion office.
- `npm run stop`: stops the local company service; external Codex sessions continue.
- Default address: `http://127.0.0.1:4310`; routes `/company` and `/visualizer`.
- Data: `%LOCALAPPDATA%\AICompany`, separate from repository code. Cloning does not transfer local history, profile, or integration.
- Build with `npm run build`; frontend changes require a browser refresh. Backend changes require a safe service restart. Preserve browser work and external Codex processes.

## Current behavior

- One local background service; Company execution is activated lazily. Visualizer-only launch must not start the scheduler or AI assignments.
- Company owns projects, chat, guarded tasks, approvals, and memory. Companion observes native Codex work without scheduling duplicate assignments.
- Shared roles: Atlas coordinates; Nova implements; Sage reviews; Scout researches; Iris designs.
- Approved explanation preferences are shared and revisioned. Automatic learning/training and cross-session project memory are deferred.
- Memory distinction confirmed in code: Company persists records in SQLite and supplies project summaries, recent tasks, and recent messages to its CEO turns. Companion captures native session history for inspection; it does not feed that history back as cross-session project memory. Native guidance shares roles and approved preferences; repository continuity depends on reading maintained files such as this handoff.
- CLI capture verified with installed Codex `0.164.0-alpha.11.1`. IDE capture has not been separately verified. Hooks are installed/trusted; avoid unnecessary hook-command changes, which require native trust review.
- Dark office: five work offices, common room, LEDs, activity bubbles, inline team details, conversation drawer, zoom/pan, pause/reduced motion.
- Desktop visualizer fits the viewport without page scrolling. Mobile retains accessible scrolling.
- Idle coffee/TV outings are decorative, spaced minutes apart, and make no AI requests. Working agents remain at desks.
- Agent project labels use actual tool working directories and file/patch targets, independent of the session's original folder. Original workspace stays in the inspector/filter. Missing evidence is explicitly labeled as a session-folder fallback.
- Usage dialog shows captured external Codex tokens for rolling 1 hour / 7 days / 30 days. Browser Company assignments are excluded. Cached input is a subset of input, not additional tokens.
- Plan allowance is a timestamped Codex-reported snapshot, not a live quota query. Compact 5-hour/weekly cards appear above headquarters using existing data; unavailable/expired snapshots remain explicit.

## Confirmed problems and solutions

- Blank page during chat updates: React effect accidentally returned the Promise from `scrollIntoView`. Effect now returns nothing; root error boundary keeps render errors visible.
- Atlas stayed green and showed transcript identity errors: employee tool/model hooks were incorrectly routed to root. Route by `agent_id`, repair identifiable legacy tool records, use terminal transcript events and stale-status fallback. A live process alone does not prove active work.
- Windows transcript paths can use `\\?\C:\...`: normalize only extended drive paths while preserving containment, junction/symlink, and session identity checks. Device/outside paths remain rejected.
- Large transcript records blocked later activity: bounded reader skips oversized records and keeps incomplete coverage explicit. Adapter version 4 marks actual tool-call inputs for project attribution; outputs/prompts/source strings are not project evidence.
- Original folder `movie-list` appeared despite edits in `nxsoos_company`: original session workspace and actual working project are now separate. Per-agent timestamped evidence prevents delayed events overwriting newer project attribution.
- More than five observed sessions crashed old artwork: avatars now group under shared roles; full sessions remain in the drawer.
- Repeated context/subagent work consumed substantial tokens: keep future work and reads focused, avoid unnecessary delegation/check repetition, and start new chats with this file.

## Important files

- UI: `src/Companion.tsx`, `src/CompanionUsage.tsx`, `src/companion-view.ts`, `src/Office.tsx`, `src/styles.css`.
- Capture: `server/companion/collector.ts`, `transcript.ts`, `active-project.ts`.
- Contracts/profile: `shared/companion.ts`, `shared/agents.ts`, `server/profile.ts`.
- Setup: `server/integration.ts`, `scripts/hook.ts`, `scripts/launch.ts`.
- Further detail: `README.md`, `docs/companion.md`, `docs/verification.md`.

## Validation and remaining limits

- Last full unit/integration run: 50 tests passed after active-project tracking.
- Four Companion browser tests passed for active-project tracking, viewport, mobile, and motion behavior.
- Latest allowance-card change: TypeScript check, focused usage browser test, and production build passed. Full suite was not rerun for that small UI change.
- Some native transcript content remains unsupported/oversized and honestly marked partial. Never claim complete coverage or IDE verification without evidence.
- Working-project inference is evidence-based, not mind reading; dynamic/ambiguous tool arguments may lack attribution until a supported call appears.
- No pending implementation task. No commit requested. Files may be untracked from the initial repository setup; preserve them.
- Laptop migration check: project source files are currently untracked locally, so cloning origin alone cannot transfer this working copy. Copy source files or explicitly commit/push when requested. Rebuild and relink on the laptop (installer requires exactly `codex-cli 0.164.0-alpha.11.1`), approve hooks there, and recreate approved preferences/project paths. Do not transplant PC hook commands/manifests; paths and credentials are device-local. No laptop installation or capture validation has been performed.

## Maintaining this file

Update the sections above after meaningful work. For each unresolved issue, record the symptom, evidence, next step, and whether it blocks use. When resolved, replace it with a short problem → solution note. Keep detailed logs and raw tool output out of this file. Record exactly which checks ran, without implying older checks cover newer changes.

