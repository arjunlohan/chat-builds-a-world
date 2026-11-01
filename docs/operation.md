# Operation notes

The engineering rules and World Module API are in AGENTS.md. This page describes
the current implementation; completed historical measurements are recorded separately.

A PID/token server lock owns a checkout. Its runner queue serializes builds and
rollbacks and waits for cancellation cleanup. Runtime invocations have private
Codex homes, minimal environments and owned process groups. On restart, a recorded
orphan is killed only after its cwd matches the exact recorded worktree.
Worktrees use private per-run directories in os.tmpdir(), with a repository hash
and reserved version in the name. Recovery and removal require canonical paths,
no symlinks and registration in that repository's Git worktree list. Recorded
legacy worktrees/vN paths remain recoverable. Removal also deletes the owned
temporary parent; checked changes are still rejected outside approved modules.

Runtime Three.js imports come from server/runner/imports.ts. The static policy,
guard and builder use the same list; pnpm check verifies its generated AGENTS.md
block. Raw Points buffers and module-owned InstancedMesh capacity charge particle limits even
when drawRange, index count or active instance count is smaller. Each also charges
nodes/draws, and instanced geometry charges triangles at allocated capacity.
Base-world citizen/cloud instances reserve their geometry without consuming the
module particle pool. Numeric particle caps remain unchanged.
Builder public summaries, bounded readable feed lines, command counts and token
usage are retained in state/builds/. Reasoning, raw commands and stderr are not
retained. A no-edit completion reports the final summary or explicitly says the
builder provided no explanation.

The builder's locked self-check command is generated per run and points outside
its worktree to server/runner/self-check.ts and a private state/self-checks/ manifest.
Run it from the candidate worktree. It uses single-process node --import and checks
the entrypoint with the runner's static policy and TypeScript compilation. It runs
under the workspace sandbox without opening tsx IPC sockets or launching Chromium.
Resource admission remains the runner's responsibility, using the actual ModuleHost,
ResourceOwner and ResourceLedger. Generated code runs in an isolated
Chromium page with WebGL disabled, not in Node. This probe simulates bounded
updates but creates no renderer and samples no FPS or visibility. Its process and
browser are killed on cancellation/timeout. The runner calls the same selfCheck
function independently before the existing candidate gate. A valid terminal verdict
received before a check's deadline is final: the worker is killed immediately.
The candidate browser belongs to the server and retains its profile; every
candidate gets a new page, world and module instances. Pages close after each
verdict; a hung checker resets the browser. Cold full-look shader startup supplies
the first of the same three visibility probes, rather than adding a discarded
render. Cleanup cannot replace a passing verdict with a timeout.
Checker scratch artifacts live under the retained evidence directory.

The primary world's snapshot handshake reports the engine's allocated base usage.
That reservation, the reserved summon pool and retained module bundles form the
resource context. The prompt includes measured retained usage and available pool
capacity. Valid base reports are restricted to the primary stream and persisted in
versions.json only when changed. Builds refuse to start until a valid reservation
is known, including after restart. A standalone probe without base facts still
reserves the summon pool via modulePool(emptyUsage()).

Each accepted build gets at most two builder attempts in the same worktree, under
one original 240-second deadline. A policy/type/resource or candidate-gate rejection
may trigger the second attempt if enough time remains for independent checks. The
builder process deadline reserves 30 seconds of resource startup, the 12-second
resource self-check, the complete 70-second candidate watchdog and a 2-second
handoff margin. This leaves 126 seconds before preflight work. Never start a gate
without its full reserve;
a repair that exhausts its allowance retains the first rejection reason. The
repair prompt carries the exact redacted rejection, the locked self-check command
and the same resource context. The overlay shows Retry 2/2; runner metrics record
attempts and firstReason, with summed duration and token usage across attempts.
Guard rejections, path/protected-data violations, no-edit completions, CLI failures,
timeouts and cancellations do not retry. Gate failures carry candidate,
infrastructure or precondition categories; only an explicit candidate repair opt-in
retries. Active-module capacity is checked before creating a worktree. Every attempt is audited against the
original file inventory and repeats the independent checks; promotion happens once.

Checked versions require a master-reachable tag and a healthy activation. A failed merge removes its unshipped tag; recovery covers a crash between tag
creation and merge. restoreForward creates
a worktree and forward commit for rollback, failed activation and startup recovery.
Versions.fallbackTarget selects the applicable healthy version or v0 baseline.
Unrelated master changes stop recovery.

state/world.json uses format 2 and savedAt. Typed schema fields track checkpoint return types and shared runtime caps. Ajv
checks the shape, followed by plain reference/resource checks with specific
rejection reasons. Scene Specs pass their existing parser once before restoration.
The loader upgrades valid format-1 source/Phase-9 views to this format. Invalid or
unsupported checkpoints are renamed to world.json.invalid-<time>-<id>.json with
a warning, then a fresh world starts. The original bytes remain available; version
manifests remain separate. Rebuild indexes only after successful validation.

Persistent source state includes roster, recent raid/dedup IDs, scenes/receipts,
summon cooldowns and round state. Only the last 60 seconds of dedup IDs are saved.
Active round elapsed time is recovered using savedAt; paused clocks remain paused.
Interrupted guard/build calls are cancelled rather than replayed.

Ordinary changes use a 1.5-second trailing debounce with a five-second maximum wait.
Round phase changes flush immediately. Event-backed POSTs use the bounded writer;
summon receipts explicitly flush their changed state. Module acknowledgement
performs one final versions.json save. Read-only polls and idle timers do no
checkpoint I/O. A flush serializes its captured generation once, synchronously; future traffic is
scheduled separately and the writer receives the captured string. The shared writer serializes per file, creates
each parent directory once, writes mode 0600, fsyncs and renames. Versions and
Twitch token rotation use the same JSON I/O. Keep state/ private and back it up
with the tagged repository.

Raid citizens enter through generic {from,at,delay}. The instance exists on admission,
but its DOM label and text measurements are deferred until born. The same time-based
stagger controls both visibility and label creation. Matrix writes upload one dirty
range per frame; labels share projection/collision packing. History retains unchanged
module instances and caches serialized chapters until a version save.

DEMO_MODE changes ideas/vote/rollback to 20/10/10 seconds. Guard/build retain their
45/240-second deadlines. The simulator's explicit 15x rehearsal uses normal timers;
run it without DEMO_MODE. Summon reasoning defaults to max.
