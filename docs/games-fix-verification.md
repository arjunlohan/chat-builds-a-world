# Game gate and readability verification

Product code verified at `53a0615`, on Apple M1 Pro / macOS, Node 25.1.0,
pnpm 9.10.0 and Playwright Chromium. All provider paths used fixtures; no live
Bedrock round or Twitch message was sent.

## Done / skipped

| Item | Status | Result |
| --- | --- | --- |
| Relative candidate gate | Done | Same browser, retained modules, 300 citizens and camera pose; baseline precedes candidate; hook CPU, render delta, throughput and breakage checks retained |
| Readable chat play | Done | Shared source renders guard/builder/AGENTS rules; approved commands enter the normal chat pipeline; callback errors, missing focus and visibility are gated |
| Versions title | Done | Shipped timeline/toast uses the approved title; original proposal remains in collection and build text |
| Live Bedrock game reruns | Skipped | Requested for Arjun to run with his recorder |

## Measurement contract

Warm 60 actual baseline frames, sample the retained world for 5 seconds, activate
the candidate, warm 30 actual candidate frames and sample it for 15 seconds.
Both timing phases use the same camera pose. This avoids charging the module for
base-world composition changes caused by a legitimate fly-to. Real focus is
then enabled for all three post-command visibility probes.

Throughput comparison trims 5% of RAF intervals from each tail, then compares
mean intervals. Raw and rolling FPS, every interval and all work measurements
remain in evidence. More than 20% throughput loss rejects. Candidate hook CPU
p95 and added render-call p95 must each stay within the existing 2 ms module
budget. The host also retains its existing three-overruns-in-60-frames rejection.
Render-call time is a wall-clock submission measure, not a GPU timer; relative
throughput covers rendering work that completes asynchronously.

An isolated scheduler gap is diagnostic. Errors, frozen/black canvas and three
consecutive frames over one second still reject. Baseline failure is reported
as infrastructure failure. Warmup has a 12-second allowance; the external
watchdog is 50 seconds so cold SwiftShader compilation, the paired samples and
visibility probes fit. The builder's total deadline remains 180 seconds. Module
budgets, resource caps, path policy and visibility minima remain unchanged.

Chat-play constants come from `world/shared/chat-play.ts`. The rendered contract
requires command-result focus, at least 1-unit player objects, a win marker above
the winning citizen with their name legible, and reachable progress within about
60 seconds for ten players. These design requirements guide generated code;
the gate exercises commands and verifies callbacks, focus and visible output,
rather than inferring arbitrary game win semantics.

## CPU-load proof

Command: `pnpm check:gate-load`. Six separate Node processes each alternate about
60 ms of CPU work with 20 ms idle. No browser clocks, RAF rates or gate thresholds
are changed. Processes remain active for both baseline and candidate phases and
are stopped in the test's finally block. The same cheap and expensive modules
are tested in both environments.

Comparison FPS below uses the trimmed interval mean described above.

| Fixture | CPU-load processes | Baseline FPS | Candidate FPS | Raw candidate FPS | Max owned hook work | Outcome |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Cheap | 0 | 53.49 | 55.55 | 51.28 | 0.10 ms | PASS |
| Expensive | 0 | 51.53 | · | · | 90.40 ms | REJECT: three 2 ms overruns |
| Cheap | 6 | 36.46 | 41.25 | 37.65 | 0.10 ms | PASS |
| Expensive | 6 | 39.60 | · | · | 91.50 ms | REJECT: three 2 ms overruns |

The loaded cheap fixture's raw FPS is below the former 40 FPS floor, and it still
passes the cost comparison. The expensive fixture fails its own hook budget in
both environments. Policy unit tests also cover a 1.3-second isolated scheduler
gap, relative throughput loss, added render cost, sustained collapse, absent
frames and frozen pixels. Hidden/tiny visibility fixtures remain rejected.

## Command probe proof

Command: `pnpm check:chat-play`.

| Fixture | Expected and observed outcome |
| --- | --- |
| Command-only visible game | PASS; 30 successful callbacks, ten citizens, three bursts, two focus requests, all three visibility probes qualify; winning Neighbor0 has a full visible name tag |
| Throws in onChat | REJECT: `onChat threw` |
| Visible command result without focus | REJECT: no command-result `camera.focus` |

The fixture's result starts hidden and its win marker appears after three valid
commands for a player. The final passing run measured baseline/candidate
comparison FPS of 53.25/54.63 and a best contrasted footprint of
102,100 full-HD pixel-equivalents. Final snapshots and frame traces are kept
under each result's `state/checks/<id>/` evidence directory, including failures.

## Fresh-clone README fixture demo

Clone: `/var/folders/dj/tq15mfnn4hb406dsp0m80ts40000gn/T/games-fix-readme-HrsuTt`.
The clone inherited PATH and HOME only, plus PORT=3137 for isolation. It had no
copied .env. The server used SIMULATION_MODE=fixture and SIMULATION_ALLOWED=1.
The physical-GPU world page was ready before sim and kept rendering throughout
the candidate gate, alongside the overlay. It was not suspended.

| Command / action | Time | Result |
| --- | ---: | --- |
| `git clone --quiet --no-hardlinks <source> <temp>` | 0.60 s | Clean checkout |
| `pnpm install --frozen-lockfile` | 1.03 s | + typescript-api <- typescript 5.9.3  Done in 967ms |
| `pnpm exec playwright install chromium` | 0.98 s |  |
| `pnpm check` | 56.26 s | 230/230 Node tests, TypeScript/contracts/bundles, reaction media and history browser checks passed |
| `PORT=3137 SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev` | 1.36 s | ready |
| `Open /world before sim, plus /overlay and empty /history` |  | ready; no versions yet; world kept rendering during the gate |
| `pnpm sim` | 60.24 s | 184 events; 104 citizens; [1,9,2]; shipped v1 Lantern orchard for Comet04 |
| `pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png` | 19.18 s | 150 admitted, 254 total citizens, 60.05 measured FPS / 60.00 avgFps |
| `Verify shipped title, history v1 and credits` |  | Canonical title visible; history v1 plays and reaches credits; zero browser errors |

All commands exited zero. The Versions panel showed `Lantern orchard`, rather
than the original `Grow a lantern orchard by the lake` proposal. The history
empty state remained `No versions yet`; v1 playback reached the contributor
credits. Servers and browsers used by the walkthrough were stopped afterward.

## Evidence and reproduction

```sh
pnpm check
pnpm check:gate-load
pnpm check:chat-play
```

The fresh-clone stdout/stderr, timings, screenshots and world stats are in ignored
`state/games-fix-verification/`. `versions-title.png` shows the corrected panel;
`credits-v1.png` is the final history shot. `state/candidate-load-results.json`
and `state/chat-play-gate-results.json` reference each retained checker evidence
folder. Each contains input, incremental baseline/candidate traces, visibility
probes, result JSON and a responsive-page screenshot.

Code commits: `de114c3` (paired cost gate), `deac2ea` (title), `e5b6781` (shared
play rules and probes), `53a0615` (actual-frame warmup and failure evidence).
