# Phase 10 verification

The latest sandbox, terminal-verdict, particle-budget and retry-classification
verification is recorded in [gatec3-followups.md](gatec3-followups.md).

The latest shared-rule, self-check and single-repair verification is recorded in
[gatec2-followups.md](gatec2-followups.md).

The subsequent Gate C import, builder-diagnostic and temporary-worktree checks are
recorded in [gatec-followups.md](gatec-followups.md). Results below retain their
original source revisions.

## Final cleanup verification

The final cleanup walkthrough ran from a fresh clone of **2637004** on October 31,
2026, with an actual pnpm installation and no copied credentials. Hardware:
Apple M1 Pro, ANGLE Metal, Node 25.1.0, pnpm 9.10.0. `/world?overlay=1` was open
before `pnpm sim`. All commands and browser checks passed; no provider calls were
made. The source checkout and fresh clone both passed **189/189** tests, strict
TypeScript and browser bundling.

| Literal README command | Result | Duration |
| --- | --- | ---: |
| `git clone --no-hardlinks <source> <temporary clone>` | Exit 0 | 0.40 s |
| `git rev-parse HEAD` | 2637004 | 0.01 s |
| `pnpm install --frozen-lockfile` | Exit 0 | 0.94 s |
| `pnpm exec playwright install chromium` | Exit 0 | 0.93 s |
| `pnpm check` | All tests, types and bundles passed | 9.03 s |
| `SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev` | Ready; stopped cleanly after browser checks | n/a |
| `pnpm sim` | Exit 0; v1 Lantern orchard for Comet04 | 51.79 s |
| `pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png` | Exit 0 | 19.20 s |
| `Ctrl+C (stop dev before standalone checks)` | Exit 0 | n/a |
| `cp .env.example .env` | Empty template assignments parse; no credentials | 0.01 s |
| `pnpm check:raid` | Exit 0 | 19.34 s |
| `pnpm exec tsx checks/hardening.smoke.ts` | Exit 0 | 38.51 s |
| `pnpm sim:soak --seconds=10 --interval=900 --sample=2 --output=state/soak-smoke.json` | Exit 0 | 74.06 s |

| Browser / recovery check | Result |
| --- | --- |
| World before simulator | Ready; 1920x1080 framebuffer |
| Overlay / empty history | Transparent overlay, HTTP 200; history says No versions yet |
| Simulator | 184 events; 104 citizens; three summons; votes [1,9,2]; shipped v1; zero reloads |
| World after simulator | 60.07 FPS; no browser errors |
| Follow-up raid | 150 admitted; 254 total citizens; 59.98 FPS |
| History after simulator | Plays v1 Lantern orchard for Comet04; one active module |
| Full-cap raid | 150 raiders replace 150 eligible citizens, retaining 150; 300 total; 59.98 FPS; production 1920x1080; zero errors |
| Idle API polling | No checkpoint writes |
| Vote-phase SIGKILL | Restored four citizens, one summon, ballot, round and v1; zero reloads |
| Build-phase SIGKILL | Orphan killed; candidate discarded; v1 retained; one main worktree |
| Corrupt checkpoint | Preserved invalid file; empty roster; v1 retained; specific warning below |
| Short soak | 10 s sampled after setup; 59.88–59.94 FPS; average 60.00; 300 citizens; 940 DOM elements; zero errors; one main worktree |

The corrupt-file restart logged:

```text
World checkpoint rejected (schema validation failed at /value/rounds/votes: must be array); preserved at <temporary clone>/state/world.json.invalid-<timestamp>-<uuid>.json. Starting fresh.
```

The original bytes were retained and no partial restore occurred. This test
intentionally corrupted the saved votes field, rather than invalidating its format.

| Final review item | Status | Reason / evidence |
| --- | --- | --- |
| 1. Schema drift and caps | Done | Shared world/round caps; ownerless job limits removed. Typed schema property maps require every checkpoint field. A temporary added checkpoint field failed TypeScript with TS2741; populated lifecycle snapshots cover all optional fields and round-trip through validation. |
| 2. Format ownership | Done | CHECKPOINT_FORMAT owns the schema, writer and migration target; Checkpoint receives format and migration policy from its caller. |
| 3. Validation readability | Done | One Scene Spec parser; shape validation followed by plain reference checks; warnings include the failing path or reference reason. |
| 4. Promotion tags | Done | Failed promotion deletes its reserved tag; reachability uses one merge-base command. Divergent-master test verifies no leftover tag or checkout change. |
| 5. Write cost | Done | Capture serializes synchronously once; the atomic writer receives the string. Serialization/generation test passes. |
| 6. Fallback policy | Done | Explicit exclusion and baseline policy shared by restoration, rollback and availability. Policy tests preserve the manual rollback gate. |
| 7. Small cleanup | Done | Parameterless durable, one format-1 migration test, full module-baseline fixture reset, unused citizen alias/placeholder removed, report wording corrected. |

No items skipped and no demo regression observed. Temporary clones and servers
were removed. This short soak verifies the harness; it does not replace or claim
a new two-hour soak. Historical measurements below retain their source revisions.
The user's independent d9830cb run also passed the README demo, raid, history,
crash recovery and invalid-checkpoint restart before these cleanup changes.

Implementation commits: **fbf15c5** (checkpoint contract and write path),
**2637004** (promotion/fallback policy and remaining cleanup). Raw command results,
browser checks and screenshots are ignored under `state/phase10-*`; the explicit
compile-failure probe is `state/final-cleanup-drift-probe.txt`.

## Previous completed follow-up checks

The fresh-clone walkthrough below ran at 857097b with no copied credentials and
actual pnpm installation, not a root node_modules symlink. The final reachability
cleanup refinement f885fa7 also passed the complete local check suite. These are
historical results; the final cleanup is recorded above. Hardware: Apple M1 Pro,
ANGLE Metal, Node 25.1.0, pnpm 9.10.0. No live Twitch/Bedrock requests were made.

| Command | Result | Duration |
| --- | --- | ---: |
| `git clone --no-hardlinks <source> <temporary clone>` | Exit 0 | 0.41 s |
| `git rev-parse HEAD` | Exit 0 | 0.01 s |
| `pnpm install --frozen-lockfile` | Exit 0 | 1.14 s |
| `pnpm exec playwright install chromium` | Exit 0 | 1.28 s |
| `pnpm check` | Pass: **186/186**; strict TypeScript and browser bundles | 9.32 s |
| `SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev` | Started; later stopped cleanly | n/a |
| `pnpm sim` | Exit 0 | 51.53 s |
| `pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png` | Exit 0 | 19.23 s |
| `Ctrl+C (stop dev before standalone checks)` | Exit 0 | n/a |
| `cp .env.example .env` | Exit 0 | 0.01 s |
| `pnpm check:raid` | Exit 0 | 19.32 s |
| `pnpm exec tsx checks/hardening.smoke.ts` | Exit 0 | 38.87 s |
| `pnpm sim:soak --seconds=10 --interval=900 --sample=2 --output=state/soak-smoke.json` | Exit 0 | 73.15 s |

The env template contains 14 empty assignments (optional entries commented with
defaults). Its copy parses with dotenv and contains no credentials. Current check results and test counts are maintained in this report.
Twitch CLI `token --help` and `configure --help` confirmed the device-flow and app
configuration flags. Actual OAuth login and token validation are interactive
account-owner steps; they were not rerun as part of this credential-free test.

| Browser / state check | Result |
| --- | --- |
| `/world?overlay=1` | Ready; 1920x1080 framebuffer; zero reloads |
| `/overlay` | HTTP 200; transparent body |
| `/history` before simulation | No versions yet |
| `/history` after simulation | Plays v1 Lantern orchard, requester Comet04; one active module |
| Full simulator | 184 events; 104 citizens; three summons; votes [1,9,2]; checked fixture v1 shipped |
| World FPS after simulator | 59.97 |
| Raid following demo | 150 admitted; 254 citizens; 59.98 FPS |
| Standalone raid stress | 150 raiders + 150 retained citizens; 60.05 FPS; 1 initial raider label; zero errors |
| Idle API polling | Checkpoint mtime unchanged |
| Vote-phase SIGKILL | Same four citizens, one summon, ballot, round and v1; zero reloads |
| Build-phase SIGKILL | Orphan killed, candidate discarded, v1 retained, one main worktree |
| Invalid checkpoint restart | Bad file preserved and warning logged; empty roster with v1 retained; no partial restore |
| Short soak | Complete; 59.89-59.93 FPS; 300 citizens; zero errors; clone cleaned |

No new two-hour soak is claimed. The completed historical measurements remain in
phase9-verification.md with their original revisions. All temporary clones and
servers from this walkthrough were cleaned up. Generated logs/screenshots remain
ignored under state/phase10-*.

## Follow-up review

| Item | Status | Reason / evidence |
| --- | --- | --- |
| B5 | Done | 1.5s trailing debounce, 5s max wait; generation-bounded flush; ordinary event POSTs batch; module ack has one final manifest save. Steady-traffic, generation and save-count tests pass. |
| B6 | Done | Whole format-2 Ajv validation before any restore, including references/admission; loader migrates valid format 1. Invalid files are quarantined with original bytes and a clear warning. Unit tests and real corrupt-file restart pass. |
| B7 | Done | Recovery removes only the recorded reserved tag proven unreachable from master. Compare-and-delete protects the expected ref; Git inspection errors do not count as proof. Recovery/tag and unrelated-master tests pass. |
| B8 | Done | Versions.fallbackTarget is the single healthy-version/baseline choice for recovery and restoration; rollback availability keeps its existing gate. |
| B9 | Done | Shared readJson/exists, named dedup windows, shared error/phase-key handlers, no Checkpoint.close alias, one optional citizen UI object, worktreeCount helper. Standalone fixtures work after a previous demo ship. |

No B items skipped. A1-A4 are complete: own completed command log, usable empty
.env template, verified Twitch device-flow flags plus authorization-code alternative,
and docs separated into rules, mechanics and judge instructions.

## Regression record and independent verification

The first completed main walkthrough at 662825d already passed install, checks,
fixture dev, the 52.64s sim, raid and history. Its extra standalone crash test then
failed because the nested clone inherited v1. This harness regression is fixed:
private fixture clones exclude source tags and prepare a clean scripted-module
baseline. The final full walkthrough above passes that check and the short soak.
The initial idle-write probe also needed to wait for its startup debounce before
measuring; GET requests themselves do not cause writes.

The user independently verified the main path at 662825d: install about 1s,
fixture dev startup 3s, sim 52s, 184 events, 104 citizens, [1,9,2], v1 for Comet04,
150 raid admissions to 254 citizens at 60.05 FPS, and history playback.

No user-facing demo regression was observed in the final run. Invalid checkpoints
now intentionally start fresh **after preservation and a warning**; valid format-1
checkpoints migrate. Ordinary event POST completion is not an immediate disk
receipt; persistence is bounded by the debounce/max-wait writer. This batching
is the requested durability policy, with phase and explicit receipt flushes.

## Commits for this follow-up

- c686e22: usable env template, Twitch device authentication and initial command log
- 76a3071: unshipped-tag cleanup and shared fallback target
- d134573: citizen UI grouping, shared helpers and repeatable standalone fixtures
- 857097b: bounded writes, format-2 schema, migration and corrupt-file recovery
- f885fa7: proven reachability cleanup and final README clarifications

The report completion commit contains this final record. No push was requested.
