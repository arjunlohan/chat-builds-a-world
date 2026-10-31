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

The final-code run is still in progress; this section will be completed from the
actual start/15-minute/end samples before this report is committed. Hardware
rendering, 300 citizens, fixed seed, local offline providers only. The baseline
uses cb63470; final rendering uses 2d8f6c2 (later changes affect recovery/docs/tests,
not the render loop). Both runs replay the full real `pnpm sim` fixture round;
final also repeats `pnpm sim --crowd-only` every 15 minutes. Ordinary-citizen
heartbeats and replenishment keep 300 active. Heap values are after explicit GC,
with raw values and RSS retained in JSON. No accumulated per-frame arrays.
