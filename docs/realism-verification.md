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
