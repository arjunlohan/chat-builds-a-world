# Phase 9 verification

Implementation is committed on master. Summon reasoning remains max; no live
Bedrock or Twitch requests were made for these checks. The user-verified live
integrations are retained. Gate D (a real second-account raid) remains Arjun's
manual test.

## Part 1 review

| Item | Status | Change and evidence |
| --- | --- | --- |
| 1. Seats | Done | Shared CitizenRoster admission: free seats, then oldest quiet >=180000ms; protects recent chatters. RAID_CAP=150, global cap=300. Redundant raid-policy removed; cap/quiet/raid tests. |
| 2. Arrivals | Done | Generic entry {from,at,delay}, one born/waiting stagger, shared inParade. Renderer queue removed. |
| 3. Instance upload | Done | One min/max dirty matrix range/frame with readable placement comparisons. |
| 4. Shared tooling | Done | launchWorldPage/measureFps used by all nine requested scripts; candidate SwiftShader worker remains isolated. parseArgs simulator flags, resolved broadcaster config, exported Twitch Envelope. |
| 5. Processes | Done | One output/code/error result, timeout derived from enforced duration; streaming collection uses already-redacted lines, non-stream output redacted once at close. Removed includes guard. |
| 6. Ledger | Done | Single overCap query, itemError returns RenderFailure; removed ItemLimitError/shortfall/fits rescans. |
| 7. Roster work | Done | Arrive builds each citizen once; prune loops Map values without list/filter. |
| 8. History | Done | Progress writes only changed visible/playing state; unchanged id/hash module instances retained (lifecycle test); serialized history cached until save. |
| 9. Labels/portal | Done | Shared projectLabel; arrival burst uses existing 96-particle pool, only persistent ring/swirl remains portal-specific. |

No Part 1 items skipped.

## Hardening checks

- `pnpm check`: **174/174**, strict TypeScript, generated validator consistency
  and browser bundles pass.
- `pnpm exec tsx checks/hardening.smoke.ts`: actual SIGKILL during a vote restored
  the same four citizens (IDs, colours, homes, activity), one summon/receipt, one
  ballot, same round and v1 module. Zero browser reloads. A second SIGKILL during
  a real fake-CLI build recovered ideas with failed/interrupted status, drained
  the orphan PID, kept v1 and left one worktree (the main checkout). Authored v1
  recovery fixture, not a claim of another real AI ship. No providers replayed.
- A verified EventSub moderator veto cancels a real CLI fixture and removes its
  worktree in under two seconds (the entire test took approximately 0.4 seconds);
  the unprivileged viewer veto is refused. Existing reconnect/backoff/refresh tests pass.
- Recovery tests cover an unpromoted candidate, crash after fast-forward but
  before tag, and refusal to restore over unrelated user commits. Atomic private
  checkpoints coalesce bursts; invalid saved JSON fails closed.
- A clean credential-free clone launched **pnpm dev** and served `/world`,
  `/overlay`, `/history` and `/assets/world.js` with HTTP 200.
- DEMO_MODE: **20s ideas / 10s vote / 10s rollback**. Guard/build remain **45s/180s**;
  normal ideas/vote/rollback remain **120s/45s/30s**.
- HTTP mutations/receipts and `/api/world` flush before response. Live event
  checkpoints debounce 100ms with a one-second clock checkpoint; an abrupt crash
  can lose an unflushed live event in that small window. Offline time pauses the
  round, but citizen expiry remains wall time. Interrupted provider/build calls
  are cancelled rather than automatically replayed.

## Visual checks

`pnpm exec tsx checks/polish.smoke.ts`: **60.06 FPS**, **150 raiders + 150 retained
citizens = 300**, production 1920x1080 framebuffer on Apple M1 Pro / ANGLE Metal,
zero console/page errors. At 390x844, no horizontal overflow, 13px wordmark,
32px title, same full-HD framebuffer. Phase transitions are 200ms and reduced
motion has no running transition. Desktop emulation, not a physical-phone test.

| Area | Before | After | Purpose |
| --- | --- | --- | --- |
| Layout/color | Grey sky with Golden Hours at fixed midday | Blue/apricot gradient, warmer horizon/fog; fixed midday labelled Daylight | Align the visible scene with its label |
| Typography | Portrait HUD shrank inside the video | Readable native header/footer outside the full 16:9 scene | Keep the complete island and readable page controls on phones |
| Color/identity | Portal guests blended into ordinary citizens | Mint coats and a diamond marker | Make the parade identifiable without relying on colour alone |
| Motion | Phase text changed abruptly | Interruptible opacity/translation, 200ms; reduced-motion bypass | Make a low-frequency round change clear |
| Feedback/performance | Ship had no world celebration | Acknowledged new ships use existing pooled confetti; no replay on reconnect/history/rollback | Celebrate success without a new allocation pool |

Polish review: **Approve** for these verified surfaces. No new gesture controls or
external visual assets. Asset/licence audit: zero tracked fonts/images/audio/video;
OS fonts only, no asset URLs or audio players. Installed dependency inventory:
MIT (19), Apache-2.0 (5), BSD-2-Clause (1), BSD-3-Clause (1), 26 packages. Full browser
notices are retained in `ASSET_LICENSES.md`.

Captures (ignored local verification artifacts under repository `state/`):

- `phase9-before-1080.png`
- `phase9-after-1080.png`
- `phase9-after-composite-1080.png`
- `phase9-phone-390.png`
- `phase9-recovery.png`

## Two-hour measurements

Both actual two-hour runs completed successfully (exit 0), with nine formal
start/15-minute/end samples each. Hardware
rendering, 300 citizens, fixed seed, local offline providers only. The baseline
uses cb63470; final rendering uses 2d8f6c2 (later changes affect recovery/docs/tests,
not the render loop). Both runs replay the full real `pnpm sim` fixture round;
final also repeats `pnpm sim --crowd-only` every 15 minutes. Ordinary-citizen
heartbeats and replenishment keep 300 active. Heap values are after explicit GC,
with raw values and RSS retained in JSON. No accumulated per-frame arrays.


Command: `pnpm sim:soak --seconds=7200 --interval=900 --sample=10
--output=state/phase9-soak-final.json`. Both use Apple M1 Pro / ANGLE Metal,
production **1920x1080**, shadows and bloom. Heap values below are **MiB after GC**.
The baseline ran its earlier equivalent isolated harness against cb63470.

| Minute | Before FPS | Before server | Before browser | After FPS | After server | After browser |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 59.97 | 55.455 | 7.265 | 59.97 | 55.932 | 7.268 |
| 15 | 59.98 | 55.386 | 7.285 | 60.07 | 54.746 | 7.376 |
| 30 | 59.98 | 55.923 | 7.394 | 59.98 | 55.183 | 7.339 |
| 45 | 60.07 | 55.978 | 7.248 | 60.08 | 55.253 | 7.411 |
| 60 | 60.07 | 56.449 | 7.250 | 59.98 | 56.349 | 7.307 |
| 75 | 60.07 | 56.493 | 7.251 | 59.98 | 55.875 | 7.355 |
| 90 | 60.08 | 56.488 | 7.254 | 59.99 | 55.857 | 7.360 |
| 105 | 60.07 | 56.536 | 7.300 | 60.08 | 55.869 | 7.321 |
| 120 | 59.98 | 56.493 | 7.374 | 59.97 | 55.847 | 7.357 |

All nine final samples: **300 citizens, 940 DOM elements, zero console/page
errors**. All eight `pnpm sim` executions exited 0. Final setup shipped checked
fixture v1: independent SwiftShader gate **40.05 FPS** (rolling **40.68**), 15 timed
samples, **17100 full-HD pixel-equivalents**, 170x150px footprint, **23.68s** total
check. The gate thresholds were unchanged. Two earlier setup attempts were
rejected before the timed soak. The retained second check observed 39.7 FPS
under concurrent verification load (no frozen frame or console error) and hit
the watchdog during its finishing path. The first attempt did not retain gate
evidence; the harness now retains setup failures. The final harness suspends its own client during the independent
gate, just as runner:live already does, and resumes it for a real render receipt.
These failed setups are not counted as completed soak time.

Final measured sample interval: **7200.026s**; baseline: **7200.213s**. Final server
heap 55.932 -> **55.847 MiB** (-0.085); browser 7.268 -> **7.357 MiB** (+0.088).
Baseline server 55.455 -> **56.493 MiB**, browser 7.265 -> **7.374 MiB**. The bounded
warm-up/GC variations plateau; the final run has no sustained growth. FPS is
vsync-capped around 60 in both runs, so this is stability evidence, not a claim
of higher peak speed. Later recovery-only changes were verified separately by
unit/Git tests and the repeated SIGKILL smoke; they do not change this render loop.

Both runs leave exactly one main worktree before teardown and remove their own
clones. No live credentials were copied into either clone. Raw samples, pre-GC
heaps, RSS, health records, simulator output and screenshots remain in ignored
`state/phase9-soak-{baseline,final}.{json,png}`. `state/phase9-recovery.json`,
`phase9-polish.json`, `phase9-dev.json`, `phase9-initial-gate.json` and
`phase9-asset-audit.json` retain the other local evidence. No state files or
screenshots are committed.

## Commits

| Commit | Scope |
| --- | --- |
| f771287 | Process result/redaction cleanup |
| a1adde4 | Shared admission/entry/ledger/labels and retained modules/history |
| fe55b81 | Shared browser setup, simulator parsing and typed EventSub |
| 97671a3 | Atomic persistence, single-flight locks and crash recovery |
| 0993d49 | Sky, arrivals, phase transitions, pooled confetti and phone layout |
| 2d8f6c2 | Real crash/moderator verification and isolated soak gate |
| f58e780 | Merge-to-tag crash recovery and user-commit protection |
| 0e4da63 | Operation docs, polish smoke and asset/licence notices |
| 5b6631a | Nonzero exit for interrupted soak |
| b103c63 | Acceptance report recorded before the long run finished |

A final report commit records the completed measurements. All work is on master;
no push was requested or performed.
