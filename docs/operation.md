# Operation notes

The engineering rules and World Module API are in AGENTS.md. This page describes
the current implementation; completed historical measurements are recorded separately.

A PID/token server lock owns a checkout. Its runner queue serializes builds and
rollbacks and waits for cancellation cleanup. Runtime invocations have private
Codex homes, minimal environments and owned process groups. On restart, a recorded
orphan is killed only after its cwd matches the exact recorded worktree.

Checked versions require a master-reachable tag and a healthy activation. Recovery
removes a recorded reserved tag that master never reached. restoreForward creates
a worktree and forward commit for rollback, failed activation and startup recovery.
Versions.fallbackTarget selects the applicable healthy version or v0 baseline.
Unrelated master changes stop recovery.

state/world.json uses format 2 and savedAt. A single root Ajv schema checks the
entire file, source shapes, references and resource admission before restoration.
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
checkpoint I/O. A flush joins writes only through its captured generation; future
traffic is scheduled separately. The shared writer serializes per file, creates
each parent directory once, writes mode 0600, fsyncs and renames. Versions and
Twitch token rotation use the same JSON I/O. Keep state/ private and back it up
with the tagged repository.

Raid citizens enter through generic {from,at,delay}. The instance exists on admission,
but its DOM label and text measurements are deferred until born. The same time-based
stagger controls both visibility and label creation. Matrix writes upload one dirty
range per frame; labels share projection/collision packing. History retains unchanged
module instances and caches serialized chapters until a version save.

DEMO_MODE changes ideas/vote/rollback to 20/10/10 seconds. Guard/build retain their
45/180-second deadlines. The simulator's explicit 15x rehearsal uses normal timers;
run it without DEMO_MODE. Summon reasoning defaults to max.
