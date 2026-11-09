# Verification notes

## Automated checks

The unit/integration suite covers:

- Traversal, credential paths, Windows path variants/streams, and junction escapes.
- New-file creation and stale-hash protection preserving a human edit.
- Non-overlapping project roots and cross-request dependency rejection.
- Four-worker concurrency and serialized project writers.
- Failed prerequisites and the twelve-task ceiling.
- Automatic review and avoiding an unnecessary intermediate CEO turn.
- Token-budget interruption and explicit extension.
- Holding a cancelled writer’s lock until interruption confirmation.
- Windows check cancellation remains stopping until the bounded command finishes; its project lock is retained.
- Command approvals and explicit declines.
- Approved preference updates and undo.
- Interrupted-task recovery without command replay.
- Local HTTP sessions, origin checks, and mutation-token enforcement.

The backend suite has 36 tests. Companion coverage includes installation/removal preserving unrelated configuration and manual edits, lazy Company activation, separate bridge authentication, deduplication, parent/child relationships, redaction, partial transcript tails and persistent checkpoints, stale activity, capture cutoffs, history clearing, offline profile refresh across tool/employee events, and the 10 MB queue bound. A Windows regression executes installed hooks through both PowerShell and Command Prompt with spaces, apostrophes, dollar signs, backticks, and ampersands in paths, and checks JSON stdin plus injected profile output. Company coverage includes named-project routing, small typos, conversational follow-ups, ambiguity, explicit API scope, authenticated native folder selection, cancellation, and Windows Common Item Dialog initialization. Native adapter regressions cover fork boundaries, source precedence, encrypted-content exclusion, and final-export recovery. Conflict notices require live browser assignments and external execution in overlapping folders. Headquarters summaries verify role grouping, project attribution, offline status, and readable activity text.

Eight Playwright tests cover Company and Companion. They exercise onboarding, native-picker responses/cancellation, task/memory navigation, rendered office graphics, desktop/mobile layouts, populated task evidence and approvals, source filters, multiple employee instances, read-only conversations, observer-only startup, reconnection, and absence of browser exceptions and horizontal overflow. Chat tests retain messages across projects, sidebar filters, streamed replies, and refresh without project query parameters. Divider tests verify mouse/keyboard resizing, saved width, and mobile stacking. Graphics tests use two workers to bound simultaneous WebGL rendering. The production probe verifies built serving, authentication, snapshots, SQLite backups, and memory export. The office regression groups nine captured sessions under five role offices and changes source filters without graphics errors or leaked canvases. Headquarters checks cover the left team rail, conversation drawer navigation, mobile team details, decorative-motion pause/resume, and reduced-motion behavior.

A Windows desktop proof also opened the real native folder dialog in a disposable directory, cancelled it, reopened it, and confirmed selection of a path containing spaces. Both returned the expected results; no Company project was registered by this dialog-only check.

`npm run test:companion` uses real launcher and hook subprocesses through PowerShell with isolated data and transcript fixtures. It checks singleton reuse, observer-only startup, browser activation, profile injection, root/employee capture, and shutdown without inference. It is not a live native CLI/IDE acceptance test.

## Native Companion verification

An actual user CLI run exposed a PowerShell launcher error that the original Command Prompt fixture missed. After correcting the launcher and native user review, diagnostics report all 12 hooks enabled and trusted. Two real read-only `codex --no-daemon exec` runs completed with native Scout delegation in disposable projects. The collector captured prompts, Atlas answers, Scout reports, tools, profile revision, parent/child links, and process identity. Both root and employee transcripts reached complete coverage. A local `integration-live-verification.json` records the verified run; the installation now marks CLI capture verified. Interactive terminal UI behavior and IDE chat have not been separately exercised, and IDE capture remains unverified. No trust bypass or user-project edits were used.

The native runs also established adapter behavior beyond the original fixtures: explicit `source: exec` takes precedence over an inherited VS Code originator, the first employee header defines transcript identity, and `subagent_history_start_ordinal` excludes copied parent context. Recognized internal metadata is ignored; inter-agent records expose plaintext text only and exclude encrypted content. A bounded final audit recovers from earlier incomplete transcript exports while preserving genuinely unsupported coverage warnings. Windows process discovery uses one process snapshot across shell ancestors. Atomic local writes retry brief Windows file-sharing failures without deleting the destination.

Missing, malformed, inaccessible, or unsupported transcripts retain activity with incomplete coverage. Transcript formats remain version-specific. A successful hook fixture does not establish IDE support.

## Live checks

The verified Codex executable is `codex-cli 0.164.0-alpha.11.1`.

A real Company browser chat reproduced a blank page during message updates: the browser returned a Promise from `scrollIntoView`, which an expression-bodied React effect accidentally returned as its cleanup. The effect now returns nothing. After the fix, a real streamed reply rendered successfully, and a disposable `map-markers` project was inspected from an overview request containing the `map-makers` typo. The answer accurately described its README and acknowledged the lack of implementation. Registered user projects were not used for this check.

Real tests demonstrated supported sign-in detection, model catalog access, dynamic tool registration, inference and a tool round trip, a sandboxed non-destructive Git command, and the complete CEO/developer/reviewer/explanation workflow in a disposable project. No registered user project is used for live smoke tests.

The native cancellation probe confirmed that the Windows sandbox does not support per-command termination. The application therefore keeps a stopping assignment and its project locked until the check finishes or reaches its timeout; graceful shutdown drains bounded checks. It does not claim immediate command cancellation on Windows.

An early complete workflow reported 106,513 aggregate tokens, including repeated/cached input and intermediate CEO turns. This is not a monetary estimate or a fixed per-task requirement. The production 50,000-token soft limit correctly interrupted an earlier run. The implementation subsequently eliminated redundant CEO notifications during automatic review/repair and paginated file context.

The subsequent saved live fixture completed its developer, reviewer, and both CEO jobs with 84,975 aggregate reported tokens. This validates the working flow and demonstrates why a full multi-agent request may require an explicit extension of the conservative default budget.

## Limits of verification

Automated role/scheduler tests use controlled fixtures. Real-model behavior remains variable. Live checks do not prove every model, future Codex version, arbitrary repository, project script, or malicious prompt safe. The application pins the verified Codex version and requires explicit approvals for executable commands.

The office is event-driven: animation reflects saved tasks, not internal model thoughts or a numeric completion estimate. Asset provenance: all map tiles, furniture, sprites, and avatar graphics are authored procedurally in this repository; no reference-image artwork was copied or downloaded.
