# P21 stream-risk fixes: verification

Product source: `1d0aa32`. Provider calls and pushes: none. Apple M1 Pro, Chromium/SwiftShader, 300 citizens.

| Item | Status | Result |
| --- | --- | --- |
| 1 Built-ins | Done | Shared ownership catalog; physical commands, including !dance, are excluded from custom probes. |
| 2 Discovery | Done | AST literal discovery plus spec prose; four-command cap without throwing; feed notice for untestable onChat logic. |
| 3 Gate noise | Done | Seven interleaved one-second on/off pairs, alternating pair order; median paired cost. CPU/render p95 remain evidence. |
| 4 Gate time | Done | Early visibility failures; complete self-check/gate reserve; original rejection survives an exhausted repair allowance. |
| 5 Scale | Done | Shared authored tree envelope, transformed visible geometry bounds, animated buffers refreshed. |
| 6 Guard | Done | One spec-level sentence generated from CHAT_PLAY; full rules remain builder-only. |
| 7 Small | Done | Notices wrap within 360px; user-facing em dashes removed; guard fixtures use temporary roots. |

## Gate timing comparison

Before values are retained measurements from the preceding paired-window implementation. After values are the final P21 rerun; no other verification browser or test suite ran alongside the load process. Six independent CPU processes are the loaded cases. Timing includes startup, warmup, probes and terminal verdict. These are observations, not a controlled benchmark of identical host load.

| Fixture | Load workers | Before seconds | After seconds | After FPS | Paired FPS drop | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| good | 0 | 29.390 | 25.674 | 52.22 | 1.89% | PASS |
| slow | 0 | 12.530 | 7.577 | n/a | n/a | REJECT: three 2ms overruns in 60 frames |
| good | 6 | 32.533 | 28.388 | 33.58 | -4.72% | PASS |
| slow | 6 | 12.999 | 8.921 | n/a | n/a | REJECT: three 2ms overruns in 60 frames |

Reproduce: `pnpm check:gate-load`. JSON and incremental evidence are retained under ignored `state/checks/`, with the comparison inputs and logs in `state/stream-fix-verification/`.

Visibility smoke: good passes; hidden/tiny reject after two misses in 8.59/8.61 seconds; oversized geometry rejects in 8.24 seconds. `pnpm check:chat-play` passes command visibility, win focus, onChat exceptions and missing-focus rejection. Notice screenshot: `state/stream-fix-verification/notice.png`; right edge 1888px, no horizontal overflow at 1920x1080. The working copy guard-metrics hash was unchanged by pnpm check.

## Fresh README walkthrough

Credential-free temporary clone of `1d0aa32`, no copied .env. The world was open before sim and stayed rendering through the candidate gate. The separate empty history page was closed before the build.

| Command/action | Seconds | Result |
| --- | ---: | --- |
| git clone --no-hardlinks <source> <temporary clone> | 0.65 | OK |
| pnpm install --frozen-lockfile | 1.13 | + typescript-api <- typescript 5.9.3  Done in 1s |
| pnpm exec playwright install chromium | 0.8 |  |
| pnpm check | 56.11 | PASS: all tests, bundles, 14 alpha media/playback checks and history smoke |
| PORT=3137 SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev | 1.35 | ready |
| Open /world before sim, plus /overlay and empty /history | n/a | ready; no versions yet; world kept rendering during the gate |
| pnpm sim | 56.24 |  Round rehearsal: 7 proposals → 4 distinct ideas → 3 candidates; 13 ballots → 12 voters [1,9,2]; fixture shipped v1 for Comet04. Timings 120/45/180 s at 15×. Simulator: 184 events accepted, 80/80 scripted citizens, 104 total citizens, 1 raid event(s), 3 fixture summons. |
| pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png | 19.18 | > tsx server/sim/raid.ts "--viewers=150" "--channel=AuroraCrew" "--screenshot=state/demo-raid.png"  {"accepted":true,"count":254,"admitted":150,"replaced":0,"channel":"AuroraCrew","viewers":150,"fps":60.04665111629457,"avgFps":60.00300015000749,"citizens":254,"screenshot":"/private/var/folders/dj/tq15mfnn4hb406dsp0m80ts40000gn/T/stream-fix-readme-Uqdgkm/state/demo-raid.png"} |
| Verify shipped title, history v1 and credits | n/a | Lantern orchard, @Comet04; v1 credits; zero browser errors |

No observed product regression. A first overlapping unit/performance run hit a baseline warmup timeout under extreme host contention; rerunning the four-case load suite alone passed, as did the final rerun. No live Bedrock rounds were run.
