# Realism rollout verification

Source baseline: `b15dd74` (P22). No live Bedrock calls or pushes.
The saved land height function, coast, paths, landmark coordinates and module
anchors are unchanged. The classic switch remains the live escape hatch.

## Asset sources

The offline pipeline uses Poly Haven's public API and ambientCG's direct ZIP
endpoint. Powered by [Poly Haven](https://polyhaven.com). Both asset providers
license their data as CC0: [Poly Haven](https://polyhaven.com/license),
[ambientCG](https://docs.ambientcg.com/license/). Per-asset sources, transforms,
compressed sizes and hashes are in [ASSETS.md](../ASSETS.md) and its manifest.

The glTF meshopt decoder uses WebAssembly. CSP permits `wasm-unsafe-eval` only,
not JavaScript eval, and same-page blob image/buffer decoding; it grants no
external network origins. Models and maps are finite committed data. Only
manifest-listed filenames are served by `/world-assets/`; no path-based disk
lookup or remote asset proxy is exposed. Runtime builders still cannot fetch,
import asset files, modify the engine or install dependencies.

## Step 1: committed data and loading

Prepared 29 CC0 inputs: eight surface sets, twenty named models with LODs, and a
2K HDR sky. Asset payload/source total at preparation: 55,011,338 bytes, below
120,000,000. Models use meshopt glTF and 1K WebP; each surface has color, OpenGL
normal and packed AO/roughness/metalness maps. No downloaded code is retained.

The first hardware cold load took 1.12 seconds. With 150 raiders the day/dusk/night
measurements were 60.10/59.75/59.84 FPS. Images/metrics:
`state/visual/realism-step1-*`.

The software gate passes cheap and rejects expensive, both idle and with six
parallel CPU load workers (`state/asset-cache/step1-gate-final.log`). Cheap gate
latency: 30.770/34.120 seconds. Expensive fixtures reject on three 2ms overruns.
A first loaded run missed the initial rAF-polled readiness timeout; readiness now
polls state on a timer. A later run reached the last measurement slice at the
old 35s deadline. The cold-asset-aware checker reserve is now 45s, drawn from the
same 180s build deadline. Relative cost, visibility, scale, hook budgets and
sustained-collapse thresholds are unchanged. Base assets preload once; additional
kit props resolve before a synchronous spawnSpec-capable module factory runs.

A first unit run overlapped texture compression and hit three existing real-time
fixture deadlines. The isolated rerun passed all 246 unit tests. Browser history
waits now account for asynchronous asset initialization instead of reading an
undefined stats object. The final `pnpm check` passed 246/246, browser bundles, all fourteen alpha
media/playback cases and the history smoke. Whole-command log:
`state/asset-cache/step1-check-final.log`. No test or runtime timing threshold was widened to address those
unit fixtures.

## Gate and shared-clock correction

This supersedes P22's all-pass cost measurement. The frozen, cheap measurement
pipeline runs one main render plus classic-cost shadows (1024); the module keeps
its actual geometry and materials. Seven alternating on/off pairs each collect
exactly 24 rendered frames after dropping the crossing interval. Full-look
visibility separately uses the same production composer factory, including GTAO,
emissive bloom, AA and output conversion. Evidence also retains a byte-encoded
full-look probe image. Camera holds and command spacing wait on simulation time.

One SimulationClock supplies dt, elapsed time and translated server timestamps to
the camera, modules, citizens, labels, sky, water and effects. A hitch clamps all
presentation together. Capture changes the clock's input, not subsystem clocks.
The host checks visible owned bounds at init and every simulation second,
including spawnSpec roots; growth disables and cleans the offending module.
Rejections print the median paired cost and all deciding per-pair rates.

The composer resolves one MSAA scene target into single-sample, depth-free post
targets. GTAO normals remain single-sample. Bloom keeps scene fog enabled rather
than changing emissive shader programs each frame. Director and fixed capture
share an exported establishing pose. A bounded `?benchmark=1` helper measures
offscreen GPU time with disjoint-checked timer queries, in addition to CPU submission
and vsync-capped FPS. GPU queries run only under the explicit benchmark flag.

Asset-loaded gate results (`state/asset-cache/gate-fix-load.log`):

| Fixture | CPU load workers | Cost FPS, candidate median | Baseline median | Median paired drop | Frames per slice | Total seconds | Outcome |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Cheap | 0 | 41.24 | 41.25 | 3.04% | 24 | 22.491 | PASS |
| Expensive | 0 | n/a | n/a | n/a | n/a | 6.949 | REJECT: hook overruns |
| Cheap | 6 | 27.50 | 29.34 | -2.10% | 24 | 29.786 | PASS |
| Expensive | 6 | n/a | n/a | n/a | n/a | 8.539 | REJECT: hook overruns |

The median of paired drops decides the verdict. Dividing independently computed
median FPS values is not equivalent. Full per-pair values remain in evidence.

The corrected full live pipeline with 150 raiders measured 60.17/59.76/59.77 FPS
(day/dusk/night). Actual GPU timers measured 11.41/11.93/11.53ms average;
GPU p95 was 11.86/18.41/12.27ms. CPU submission was 0.27-0.30ms. Cold load was
0.746s. This is GPU headroom evidence rather than an inference from the 60Hz cap
(`state/asset-cache/gate-fix-visual.log`).

The native 4K capture determinism check passed both routes including an active
reaction video; zero browser errors (`state/asset-cache/gate-fix-capture.log`).
Chat-play smoke passed normal and citizen-sized results and rejected onChat
exceptions and missing focus (`state/asset-cache/gate-fix-chat-play.log`).

Gate correction `pnpm check`: 253/253, all bundles, media and history checks pass
(`state/asset-cache/gate-fix-check-final.log`). The clock, post-target sample
allocation, live growth bounds and deciding-median tests are included.

## Step 2: scanned ground and closer framing

Slope/height blends grass, moss, forest floor and wet basalt over the original
heightfield, with triplanar cliffs, macro variation and scanned basalt outcrops.
The authored navigation function, coast and landmark anchors are unchanged.
A padded 2K atlas reduces sampler pressure; coherent slope branches avoid
sampling absent layers. The first unoptimized shader measured 16.90ms GPU and
hit a cold software-probe compile timeout. The optimized shader measures below.
Cold probe compilation uses the existing warmup timeout inside the same overall
gate deadline. The shared new home pose fills about 65% of frame width; classic
keeps its original pose, and fixed capture reads the director's exported pose.

| Phase | FPS, 150 raiders | GPU average ms | GPU p95 ms | CPU submission ms |
| --- | ---: | ---: | ---: | ---: |
| Day | 59.97 | 15.52 | 18.67 | 0.47 |
| Dusk | 59.77 | 15.67 | 16.83 | 0.41 |
| Night | 59.97 | 15.08 | 15.34 | 0.46 |

Cold load: 2.397s. Assets at preparation: 59,145,272 bytes including existing
media/source, below 120 MB. `pnpm check`: 254/254 plus bundles/media/history.
Gate: cheap passes idle/loaded at 33.85/19.70 median FPS, with exactly 24 frames
in every slice; 27.262/36.341s total. Median paired costs 2.50%/-7.26%.
Expensive rejects idle/loaded on hook overruns in 8.530/9.414s. All real geometry
and materials remain in the cost scene. The loaded windows extend to collect
24 frames rather than judging a handful of frames in one wall-clock second.

Raw logs: `state/asset-cache/step2-{visual,gate,check}-final.log`.
Images/metrics: `state/visual/realism-step2-*`. P22 before set:
`state/visual/realism-before-{day,dusk,night}.png`, plus native edge/citizen crops.
GPU headroom remains limited at this step and is tracked through the remaining
scene work; no inference of spare GPU capacity is made from the 60Hz ceiling.

## Live-build blocker: audited assets

Inventory fingerprints every regular file without imposing a candidate-write size
limit on unchanged source assets. The changed-file audit still rejects every
added or modified file over 2 MiB, including ignored and outside-module writes.
The regression test inventories a fresh worktree of the real tracked tree,
including the 5,451,493-byte HDR, then rejects oversized module and asset writes.

`pnpm exec tsx --test checks/runner.test.ts`: 29/29. Fresh isolated README
fixture server, world opened before `pnpm sim`: first attempt SHIPPED v1 for
Comet04, 184 events, 104 citizens, three summons, zero browser errors. Simulator
58.65s; build 31.30s; gate 26.60s. No provider calls. Screenshot:
`state/visual/blocker-fixture-shipped.png`; log `state/asset-cache/blocker-readme.log`.
