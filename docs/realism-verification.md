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

## Cold resource-worker startup

Resource admission now has two bounded phases. Bundling, tsx and Chromium/page
startup have a 30s startup allowance; a ready handshake starts the unchanged
12s allocation-probe budget. The enclosing 180s build deadline and cancellation
still cover both phases. A cold startup cannot spend the probe's allowance.
Neither phase can wait indefinitely. This does not expand the builder sandbox.

`checks/json-worker.test.ts`: 3/3, including delayed readiness and independent
startup/probe timeout failures. `checks/self-check.test.ts`: 4/4, including the
exact command under the workspace sandbox and real browser allocation probes.

## Step 3: sky, light and capture completion

The 2K photo HDR supplies the sky; its recorded sun direction is rotated to the
world sun. A CC0 photographic alpha cloud layer forms the cloud sea. Sun,
hemisphere fill, environment intensity, exposure and fog follow one lighting
state. Daylight occupies 86% of the 600s cycle; a short moonlit blue hour retains
lantern readability. Dark basalt and soft contact shadows retain depth.
PMREM rebakes only past day/warmth/direction epsilons, into a stable texture
identity; identical night states do not rebake. AO operates at half resolution
with single-sample normals; the scene alone uses 4x MSAA, post targets stay
single-sample. Selective bloom retains fog. Home/capture share the director pose.

Capture limitation: dynamic HDR PMREM produced intermittent one-byte pixel
variance on this GPU, even after a completion fence. Capture therefore uses
fixed ambient fill without PMREM, as permitted, while live rendering retains
HDR environment reflections. Sky, sun, shadows, seeded world and virtual time
still advance. Two consecutive complete fresh-page hash runs passed for both
/world and /capture, including active reaction video. World hash:
`1af906f57356b4778dee1c117c32d249222fd53f007b9635a4ba06dd32f2b088`;
composite hash `69fe82bd4a670b07a890789dacd7a3608ac0d3148d4d29425361c3c45972313d`.
The asynchronous step now waits on a GPU fence instead of assuming gl.finish
blocks the browser's GPU process. 4K world steps about 25-28ms; composite 35-36ms.

| Phase | FPS, 150 raiders | GPU average ms | GPU p95 ms |
| --- | ---: | ---: | ---: |
| Day | 59.94 | 11.68 | 16.24 |
| Dusk | 59.95 | 11.43 | 12.36 |
| Night | 59.75 | 11.50 | 16.05 |

Cold load 1.039s. `pnpm check`: 259/259 plus bundles and media/history smokes.
Classic, new 4x MSAA and forced SMAA smoke: zero errors. Interleaved gate:
cheap passes idle/loaded at 37.71/24.91 FPS, median paired drops -0.015%/0.012%,
24 frames per slice, 25.686/31.806s total. Expensive rejects on the unchanged
hook budget in 7.796/8.757s. No live provider calls.

1080p set/crops: `state/visual/realism-step3-*`; six 4K frames:
`realism-step3-{day,golden}-{orbit,push-in,flyover}-4k.png`. The native-4K still
harness uses a fixed seed, 150 raiders, a fixture module and 18s of virtual time.
Stills averaged 27.1-27.6ms/frame. Logs `state/asset-cache/step3-*-final.log`,
`step3-capture-fixed-ambient-{1,2}.log`, `step3-fallback.log`, `step3-stills.log`.

## Step 5: scanned vegetation

The seven tree anchors now use scanned woody geometry and cutout canopies;
cone grass is replaced by 320 crossed photographic grass clumps. Fixed near/far
instance pools retain tree LODs, plus scanned ferns, shrubs and flowers. Paths
stay clear. Leaves use alpha-to-coverage under scene MSAA, bounded wind and
alpha-aware GTAO normals. Classic keeps the procedural garden unchanged.

Visual QA found and fixed quantized glTF conversion: transforms must decode
integer positions first; material splitting must read normalized UV getters.
The float conversion regression covers both. Generic whole-tree decimation
also destroyed leaf coverage, so the offline Blender helper now bakes the full
CC0 scan's canopy/grass into alpha cards and simplifies only continuous wood.
It commits only data, never raw source files. Tree LODs: 1,581/507 triangles;
grass: four triangles. Blender is needed only to regenerate those assets.

| Phase | FPS, 150 raiders | GPU average ms | GPU p95 ms |
| --- | ---: | ---: | ---: |
| Day | 59.95 | 13.79 | 15.64 |
| Dusk | 59.96 | 13.61 | 14.94 |
| Night | 59.76 | 13.68 | 15.86 |

Cold load 1.679s; base reserves 119,835 triangles at all 300 citizen slots,
leaving 10,165 for modules after the unchanged 70,000-triangle summon pool.
Asset total at preparation: 59,442,673 bytes. `pnpm check`: 260/260 plus bundles
and media/history smokes. The classic triangle-budget test remains; new-world
admission is checked with actual loaded assets in the hardware smoke.
Fresh-page 4K hashes match for both world and composite; no browser errors.
Six native-4K stills took 28.4-30.1ms per virtual frame.

Gate, cheap idle/loaded: 24.91/17.84 FPS, 24 frames in every slice,
35.512/42.574s total, median paired drops -0.012%/-0.023%. Expensive rejects on
hook overruns in 10.355/11.030s. The loaded check passes, but its 2.4s watchdog
margin is narrow and remains a performance constraint for subsequent steps.
Images: `state/visual/realism-step5-*`, including day/golden orbit, push-in and
flyover 4K stills. Logs: `state/asset-cache/step5-*`, `vegetation-prepare.log`.

## Step 6: upgraded citizens

Creatures retain the same silhouette, ears, cream face patch, viewer colors and
label layout. Smoother bodies, soft physical sheen, rounded limbs, eye highlights,
blinking, alternating footfalls and ear/tail motion share one instanced draw.
Animation is bounded per citizen; GPU vertices use four prepared animation values
instead of evaluating trigonometry for every vertex. Jump, dance, follow and
home routing are unchanged. Each new creature is 300 triangles versus 296 before;
all 300 reserved slots leave 8,965 module triangles after the summon pool.
Classic retains its original geometry/material look.

| Phase | FPS, 150 raiders | GPU average ms | GPU p95 ms |
| --- | ---: | ---: | ---: |
| Day | 59.95 | 13.51 | 15.52 |
| Dusk | 60.16 | 13.13 | 14.07 |
| Night | 59.96 | 13.54 | 15.30 |

Cold load 1.591s. Geometry regression checks the triangle count, silhouette and
all eye/limb regions. `pnpm check`: 261/261 plus bundles/media/history. Native-4K
stills: 28.1-30.0ms/frame; fresh world/composite PNG hashes match, zero errors.
Interleaved cheap gate idle/loaded: 25.39/16.71 FPS, 24 frames per slice,
35.069/43.295s, paired drops 0%/3.81%. Expensive rejects both at 10.290/11.107s.
The loaded watchdog margin remains narrow. Images `state/visual/realism-step6-*`;
logs `state/asset-cache/step6-*`.

The fresh-clone README fixture demo at vegetation commit e8e2b68 also shipped v1
on attempt one: 184 events, 104 citizens, zero errors, 68.91s simulator,
41.18s complete build and 36.34s gate. No Twitch/Bedrock calls.

## Shadow work parity before water

The first water trial held 60 FPS but its loaded cheap gate reached slice 14
and hit the unchanged 45s watchdog. The checker was refreshing every scanned
canopy shadow every frame while live rendering cached the map. New-look live
and measurement now share a 0.25s simulation-time refresh, invalidated immediately
by scene changes or A/B root toggles. Full-look probes force a fresh map for both
images. This also keeps moving live props' shadows current. Geometry, materials,
1024px cost shadows, paired frame counts and every rejection threshold remain.
Classic retains its prior shadow path.

After parity, cheap passes idle/loaded at 27.50/20.00 FPS, median paired drops
-1.95%/1.51%, exactly 24 frames per slice, 34.057/40.017s total. Expensive rejects
in 10.448/11.722s on the same hook budget. Live 150-raider day/dusk/night FPS:
59.93/59.98/60.17; GPU means 14.01/14.12/13.42ms. Cold load 1.894s.
Six 4K stills, capture hashes and classic/MSAA/SMAA fallback pass with no errors.
`pnpm check`: 262/262 plus bundles/media/history. Images/logs:
`state/visual/realism-shadow-parity-*`, `state/asset-cache/shadow-parity-*`.

## Fixed engine cost for module admission

The water trial still exposed insufficient software-gate margin after shadow
parity. Cost rendering now uses fixed Lambert/flat-shader proxies only for the
locked engine base. It retains base geometry, leaf alpha holes and vertex motion;
module/retained-module geometry, shaders and materials remain native. Full-look
visibility restores every production material and uses the same complete composer.
The policy is rendered into builder rules and recorded in candidate evidence.
No admission, visibility, frame-count, budget or watchdog threshold changed.

Cheap idle/loaded: 28.70/23.16 FPS, median paired drops 2.18%/-1.83%, 24 frames
per slice, 34.102/38.468s. Expensive rejects on hook budget in 9.097/10.181s.
Live output is unchanged: 150-raider day/dusk/night FPS 59.95/59.96/59.97;
GPU means 14.00/14.59/13.35ms; cold load 1.370s. Six 4K stills and fresh-page
world/composite hashes pass. `pnpm check`: 263/263 plus bundles/media/history.
The isolation test confirms proxies cannot replace a module material and restore
all originals. Images/logs `state/visual/realism-cost-proxy-*`,
`state/asset-cache/cost-proxy-*`.

## Step 7: flowing water

The spring and stream now use a deterministic tiled micro-normal field,
terrain-derived depth color, shallow-edge foam, physical sky reflections and
restrained clearcoat. The waterfall has vertical normal flow, soft strand edges
and 64 pooled spray droplets leaving the lip. All landmark positions and the
stream route are unchanged. No transmission scene capture or downloaded water
texture is required. Classic retains its original water shader.

The cost proxies use unlit base shading rather than Lambert lighting so new
engine surfaces cannot consume the module gate's watchdog. Module materials,
shadow casters and full-look visibility remain native; every threshold is unchanged.
Final cheap idle/loaded: 28.70/23.16 FPS, 24 frames per slice, paired drops
2.14%/-3.79%, 34.297/39.487s. Expensive rejects in 7.588/8.391s.

| Phase | FPS, 150 raiders | GPU average ms | GPU p95 ms |
| --- | ---: | ---: | ---: |
| Day | 59.95 | 14.00 | 14.90 |
| Dusk | 59.96 | 13.92 | 16.30 |
| Night | 59.96 | 13.52 | 16.46 |

Cold load 2.119s. Base: 121,155 triangles and 280 particles, retaining 8,845
module triangles and 744 particles after summon reserves. Water regression
checks depth bounds, unchanged fall anchor, 360 triangles and 64 spray particles.
`pnpm check`: 264/264 plus bundles/media/history. Six 4K stills and fresh-page
world/composite hashes match with no errors; world steps about 28-30ms.
Images `state/visual/realism-step7-*`; logs `state/asset-cache/step7-*-passed.log`,
`step7-gate-unlit.log`, `step7-check-unlit.log`.


## Step 4: named PBR and model kits

The closed Scene Spec catalog adds 20 local CC0 models and 17 named surfaces.
The model kinds and LOD accounting generate from the audited manifest; the same
names and exact resource counts render into the builder contract. A drift check
runs in `pnpm check`. The server, browser ledger and resource worker share pure
admission arithmetic. Both glTF LODs retain their scanned material groups and
UVs, fit the requested bounding box and count every rendered triangle/draw.
The kit uses the existing tree-height envelope. No external asset lookup is added.

Raw standard materials normalize in place, preserving captured color/opacity
references. Basic/Lambert/Phong meshes map to a standard preset with bridged
animation fields. Custom shaders and particles remain authored. Each owner gets
independent texture objects and upload versions; disposal cannot invalidate the
base bank. Immutable decoded pixels remain engine-owned. Local dependencies are
prepared and model templates warmed before synchronous module activation.
Classic needs no photo assets and uses budgeted procedural model substitutes.

The fixture demo now builds three scanned lanterns. A separate race-track visual
fixture uses bridge planks and crates. Both pass the real policy/type/browser gate:
orchard 35.208s, race track 35.081s. The allocation smoke passes all 57 cases
(20 models at two LODs plus 17 presets), with exact ledger parity and no base
texture disposal/version changes. Full native shaders warm before timed visibility
probes, under the existing whole-worker watchdog. Cold shader startup does not
consume an individual probe timeout; all three measured probes retain their
original timeout. Faulty hooks reject before
shader warmup; actual probe, cost and watchdog thresholds are unchanged.

Final base plus three lanterns, 150 raiders, production 1920x1080, ANGLE Metal:

| Phase | FPS | GPU mean ms | GPU p95 ms |
| --- | ---: | ---: | ---: |
| Day | 59.75 | 14.80 | 19.24 |
| Dusk | 59.75 | 14.71 | 20.99 |
| Night | 59.95 | 13.98 | 15.48 |

Cold readiness including the active kit module: 1.626s. These are five-second
steady-state windows after warmup, with separate thirty-frame GPU timer queries.
GPU p95 can exceed a frame even when average throughput remains vsync capped.
The base remains 121,155 triangles at all 300 allocated citizen slots, retaining
8,845 module triangles after the summon reserve. Assets total 59,443,090 bytes
including source scripts/media/manifest; world payloads alone are 43,235,305 bytes.

The final fixed cost pipeline uses a 256px shadow target and engine-only unlit
proxies. Module geometry/materials remain native. Full-look visibility restores
all materials and uses the complete live composer. Final interleaved results:

| Fixture | CPU workers | Candidate FPS | Median paired drop | Frames/slice | Seconds | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Cheap | 0 | 29.34 | -2.23% | 24 | 35.032 | PASS |
| Expensive | 0 | n/a | n/a | n/a | 7.603 | REJECT: three hook overruns |
| Cheap | 6 | 25.39 | -4.08% | 24 | 38.668 | PASS |
| Expensive | 6 | n/a | n/a | n/a | 8.396 | REJECT: three hook overruns |

See `state/candidate-load-results.json` for exact evidence paths and all paired
rates. The negative paired drops are scheduler noise, not a speedup claim.
Six native 4K stills show the kit and settled raid crowd at midday/golden hour,
from orbit, push-in and flyover. Virtual frame step times are 29.44-31.34ms,
excluding PNG encoding. Capture retains the documented fixed hemisphere-fill
fallback instead of dynamic PMREM. Live pages retain the photo-sky environment.
Images: `state/visual/realism-final-{day,golden}-{orbit,push-in,flyover}-4k.png`.
1080p comparisons/crops: `state/visual/realism-kit-*`; prior P22 reference:
`state/visual/before-*`. Logs: `state/asset-cache/step4-*`, `final-*.log`.

Final `pnpm check`: 268/268, browser bundles, fourteen alpha media/playback cases
and history credits. Both the seeded math fixture and scanned-lantern fixture
produce identical fresh-page PNG hashes for `/world` and `/capture`, with active
reaction playback. Classic, new/MSAA and forced-SMAA smoke paths pass with zero
browser errors. See `state/visual/capture-{default,kit}-final-results.json` and
`state/asset-cache/final-{capture,kit-capture,fallback}.log`.
