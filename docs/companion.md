# Company and Codex Companion

## Startup and ownership

`scripts/launch.ts` starts or reuses one service per company data directory. Launch and process locks serialize competing launches. The launcher validates loopback health, protocol, directory, and instance identity before reuse or shutdown, and refuses incompatible occupied ports.

`server/app.ts` constructs the Store and Collector immediately. The Company Engine is lazy: only Company activation or an explicit Company operation creates it and performs recovery. Companion reads never activate the scheduler. Stopping the service drains Company work while independent Codex sessions continue.

`shared/agents.ts` holds role behavior. `server/profile.ts` projects approved preferences with a revision. Company uses guarded project tools; native Codex uses its own permissions, tools, and delegation. No live thread is shared between modes.

## Integration

`server/integration.ts` checks the installed version, backs up affected configuration, and records owned hook groups and employee-file hashes. Installation preserves unrelated hooks and agents, including existing inline TOML hooks. Updates detect manual edits; unlink removes only unchanged owned content. Relinking after removal starts a new installation identity.

Hook trust is left to native `/hooks` review. `scripts/diagnostics.ts` calls `hooks/list` without inference. Successful installation or fixture tests do not establish native capture compatibility. CLI and IDE have independent verification flags.

On Windows, the generated command explicitly starts PowerShell and invokes Node with single-quoted literal paths inside an encoded command. This avoids incompatible quoted-executable syntax between PowerShell and Command Prompt and protects spaces, apostrophes, dollar signs, and backticks in paths. Encoding is command-line transport, not a trust bypass: changed commands still require native review. Diagnostics match exact commands from the ownership manifest rather than searching readable path substrings. The end-to-end fixture runs the installed command through PowerShell, matching the observed native Codex shell.

## Collection and privacy

`scripts/hook.ts` accepts allowlisted lifecycle fields, redacts recognized credentials, queues events atomically, and attempts a bounded loopback POST using a separate local credential. Failures return valid non-blocking hook output. The queue is bounded to 10 MB and makes no inference calls. Profile injection reads approved local preferences without requiring the service; employee starts retain specialist identity.

`server/companion/collector.ts` validates installation identity and capture time, persists observed roots/children, and deduplicates repeated/out-of-order events. Observed sessions never become Company projects or assignments. Capture starts with reported sessions after installation; there is no historical directory scan.

`server/companion/transcript.ts` isolates the version-specific JSONL format. It accepts only reported paths inside the Codex sessions directory, rejects symlinks/junctions, verifies session identity, and excludes reasoning/system/developer messages. Visible prompts, answers, and supported tool content are redacted before storage. Byte checkpoints persist; partial trailing records retry later. Unsupported formats retain activity with incomplete coverage.

Queued historical activity cannot make abandoned work appear live. Freshness and Windows process identity checks distinguish unknown status from confirmed work. Turn completion does not imply task success. Native client verification additionally requires a real process, identified source, supported visible conversations, and a known employee child conversation.

History clearing deletes observed records/checkpoints/events, records a cutoff, and prevents old queues or in-flight reads from repopulating history. It preserves Company records and original Codex transcripts. Redaction recognizes specific credential patterns, not arbitrary sensitive prose.

## Interfaces

- `GET /api/health`: identity, protocol, directory, and execution capability.
- `GET /api/companion/snapshot`: sessions, messages, integration status, Company projection, and workspace conflicts; browser authentication required.
- `POST /api/companion/events`: validated hook ingestion with the separate bridge credential.
- `POST /api/companion/clear`: external-history deletion with browser mutation authentication.
- `POST /api/control/company` and `/api/control/stop`: credential-protected launcher controls.
- `POST /api/company/activate`: browser Company activation.
- `GET /api/events`: browser updates from both activity sources.

Companion offers source/workspace filters, employee instances, and read-only conversations. Approvals and cancellation stay in Codex. Unidentified clients remain labeled Codex. Company concurrency, budgets, and locks govern browser work only; overlapping external work produces a notice.

## Headquarters presentation

The Companion page gives the office most of the viewport, places the shared employee roster and details on the left, and moves connected session history into a keyboard-accessible right drawer. Each team card includes its role, office, status, projects, current activity, and inspection button without a selection step. The desktop view uses a fixed viewport with five compact cards and a flexible map, without page or team scrollbars. The working count lives in the filter toolbar; connection details open in a dialog. Project lists have hover/focus disclosure for long values. Mobile retains a scrollable document and inline toggleable team for readable details. Live sources and workspace filters still affect the same underlying observations. One visible employee represents each shared role; active sessions take precedence over waiting, idle, and ended history. Concurrent session counts and project labels remain available, and every captured session is inspectable in the drawer.

The map has five work offices and a common room rather than extra workspace rooms. Role LEDs and project strips are separate from the character's decorative movement. Working avatars stay at their desks; idle avatars occasionally follow corridor paths to the coffee station or TV sofas and back. First breaks are staggered after 2â€“4.5 minutes; later breaks wait 3â€“5 minutes at the desk, alternating coffee (18â€“30 seconds) and TV (35â€“55 seconds). Waiting/disconnected states interrupt outings and reset the idle interval. Speech bubbles summarize available tool/stage activity, never hidden reasoning. Pause and reduced-motion preferences stop decorative movement. The rendering loop caps at 30 fps and retains safe cleanup/retry behavior. Canvas zoom and pointer/keyboard panning support the closer mobile view.

## Usage presentation

The Usage toolbar button opens a read-only dialog without changing the fixed desktop floor. Rolling hour, 7-day, and 30-day reported token totals span captured external Codex transcript usage (CLI/IDE), independently of source/workspace filters. Company browser assignments are excluded. Only connected sessions are captured; no historical account scan is performed. Input, cached input (included in input), output, and response counts are shown only when usage was captured. These local totals exclude missing or unsupported data and do not estimate bills or remaining account allowance. The separate account-limit section displays only Codex-reported windows with their capture/reset timestamps; an expired snapshot cannot be presented as current remaining quota.

Project labels follow per-agent supported tool inputs: explicit working directories, file targets, and patch headers. Code-mode calls are read with a static literal tokenizer; no code is evaluated, and embedded source strings, prompts, outputs, and dynamic expressions are not mined for project names. The nearest repository/package marker or registered project determines the root. Newer evidence can switch projects; delayed events cannot overwrite it. Hook-input history and original transcript call records backfill existing connected sessions. Without evidence, the displayed folder is explicitly marked `(session folder)`. Session workspace remains the originating Codex folder in the filter and inspector. Activity summaries inspect known tool names and explicit shell command arguments rather than words inside arbitrary file contents.

## Compatibility boundaries

The adapter initially targets Windows Codex `0.164.0-alpha.11.1`. Transcripts are not a stable API. Hooks require trust, and existing sessions may need restart/resume. IDE support is not inferred from CLI success. Automatic learning, cross-session project memory, conversation handoff, and cross-device synchronization are deferred.
