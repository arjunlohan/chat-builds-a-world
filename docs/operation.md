# Operation notes

The engineering rules and World Module API are in AGENTS.md. This page describes
the current implementation; completed historical measurements are recorded separately.

A PID/token server lock owns a checkout. Its runner queue serializes builds and
rollbacks and waits for cancellation cleanup. Runtime invocations have private
Codex homes, minimal environments and owned process groups. On restart, a recorded
orphan is killed only after its cwd matches the exact recorded worktree.

Promotion tags the checked commit before fast-forwarding master. A crash before
the fast-forward leaves master unchanged. A crash after it leaves an identifiable
tag, so recovery requires no tag repair or candidate-commit field. restoreForward
creates a new worktree and forward commit for rollback, failed activation and
startup recovery. Unrelated master changes stop recovery.

state/world.json has a format version and savedAt. It stores source roster, recent
raid/dedup IDs, scenes/receipts, summon cooldowns and round state. It omits derived
round views, normalized ideas/indexes and transient chat cooldowns. Loading rebuilds
those indexes; Phase 9 round files migrate on read. Only dedup IDs from the last
60 seconds are checkpointed. Active round elapsed time is recovered using savedAt;
paused clocks remain paused. Interrupted guard/build calls are cancelled, not replayed.

Ordinary changes use a 1.5-second trailing debounce. Phase/control changes, summons
and receipt POSTs flush immediately. Each POST joins the dirty/in-flight writer
once; GET polls and idle timers do no checkpoint I/O. Continuous noncritical traffic
can delay a trailing write until a pause or critical event. The writer serializes
per file, creates each parent directory once, writes with mode 0600, fsyncs and
renames. Failure removes the temporary file. Versions and Twitch token rotation
use the same JSON I/O. Keep state/ private and back it up with the tagged repository.

Raid citizens enter through generic {from,at,delay}. The instance exists on admission,
but its DOM label and text measurements are deferred until born. The same time-based
stagger controls both visibility and label creation. Matrix writes upload one dirty
range per frame; labels share projection/collision packing. History retains unchanged
module instances and caches serialized chapters until a version save.

DEMO_MODE changes ideas/vote/rollback to 20/10/10 seconds. Guard/build retain their
45/180-second deadlines. The simulator's explicit 15x rehearsal uses normal timers;
run it without DEMO_MODE. Summon reasoning defaults to max.
