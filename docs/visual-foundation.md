# Visual foundation verification

Product source: `33f6784`. Apple M1 Pro, Chromium on this Mac. No provider calls,
new downloaded assets or pushes. Palette, authored props and layout are retained.
P21 is closed separately in [its verification report](p21-verification.md).

## Scope

| Step | Status | Result |
| --- | --- | --- |
| 0 P21 | Done | All seven items verified; interleaved load results and timing comparison recorded separately. |
| 1 Before images | Done | `1d0aa32`, fixed home camera, fixed sky phases, procedural seeds and 150 raiders; full images and native crops. |
| 2 Edges/resolution | Done | HalfFloat composer, supported 4x MSAA or SMAA fallback; independent 1080p/4K framebuffer profiles. |
| 3 Surfaces | Done | Smooth normals, creased hard edges, finer terrain, curved citizen/spec primitives, beveled spec boxes and shared surface factory; resource estimates match actual geometry. |
| 4 Light | Done | Throttled procedural-sky PMREM, fitted 2048 soft shadows, GTAO, time-dependent ACES exposure, emissive-only bloom and readable night fill. |
| 5 Escape hatch | Done | `WORLD_LOOK=classic` or `?look=classic`; world, capture and gate use the selected pipeline. |
| 6 Frame capture | Done | Pinned version/take, virtual clock and seeded module hooks, three moving camera paths plus fixed; native 4K export and fresh-page hash checks. |

No requested step was skipped. Candidate cost slices use the main pass and classic 1024px shadows. Full-look
visibility keeps MSAA, environment, GTAO, emissive bloom and tone mapping at
probe resolution with that same shadow map.
Production new-look shadows remain 2048px. No admission or rejection thresholds
were relaxed.

| Commit | Change |
| --- | --- |
| `e1b475a` | P21 closure evidence |
| `3c0bc00` | Fixed-camera baseline |
| `6ffe947` | HDR AA and native 4K profiles |
| `6ac145c` | Smooth geometry and material factory |
| `c502cc8` | Environment, AO, exposure, shadows and emissive bloom |
| `76dbdb9` | Shared new/classic selection |
| `ccbf31d` | Bounded complete-pass checks |
| `91150c4` | Pinned virtual-clock capture and 4K driver |
| `f34800f` | Capture/fallback tests and operation guide |
| `cc66eab` | Candidate shadow resolution follows reduced profile |
| `90b8646` | Match probe and main HDR AA targets |
| `33f6784` | Camera flight presentation time under slow software rendering |

## 1080p comparisons and performance

Chromium ANGLE/Metal, 1920x1080, 150 raiders, reduced-motion fixed home camera.
Terrain/garden/raid seeds and viewport are shared. Each measurement observes five
seconds after loading the fixed sky phase. These are comparisons, not the
frame-exact capture contract: citizen presentation time is not pinned here.

| Stage | Source | Day FPS | Dusk FPS | Night FPS |
| --- | --- | ---: | ---: | ---: |
| Before | `1d0aa32` | 59.78 | 59.97 | 59.97 |
| Step 2 AA | `6ffe947` | 59.96 | 59.98 | 59.96 |
| Step 3 surfaces | `6ac145c` | 59.98 | 59.96 | 59.76 |
| Step 4 lighting | `c502cc8` | 59.96 | 59.96 | 59.95 |

Reproduce each stage with its ref, for example:

```sh
node --import tsx checks/visual-foundation.ts before 1d0aa32
node --import tsx checks/visual-foundation.ts step4 c502cc8
```

Full images: `state/visual/{before,step2,step3,step4}-{day,dusk,night}.png`.
Native 1:1 crops: `state/visual/{before,step2,step3,step4}-edge-crop.png` and
`state/visual/{before,step2,step3,step4}-citizens-crop.png`. Measurements:
`state/visual/{before,step2,step3,step4}-metrics.json`.

The final README raid also admitted 150 raiders into a 254-citizen world at
59.98 FPS, with average FPS 60.00. This exceeds the 58 FPS acceptance target on
this machine; it is not a measurement of OBS encoding contention.

Fallback smoke (`state/visual/look-fallback.log`): server classic, explicit new
MSAA and forced SMAA all rendered at 1920x1080 with zero browser errors.

## Candidate gate

`pnpm check:gate-load` uses Chromium/SwiftShader, 300 citizens and seven alternating
one-second baseline/candidate pairs. Six independent CPU processes supply host
load. Timing includes startup, warmup and visibility probes. Actual pixel
readbacks happen outside the timing slices; probe HDR targets match the main
composer's multisampling to avoid a cold second shader/target path.

Final results are in `state/visual/final-camera-load.log` and
`state/candidate-load-results.json`; individual artifacts remain in
`state/checks/<run-id>/`.

| Fixture | Load workers | P21 seconds | New look seconds | New FPS | Paired cost | Outcome |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Cheap | 0 | 25.674 | 29.650 | 7.07 | 0.00% | PASS |
| Expensive | 0 | 7.577 | 10.673 | n/a | n/a | REJECT: three 2ms overruns |
| Cheap | 6 | 28.388 | 32.949 | 5.28 | 2.00% | PASS |
| Expensive | 6 | 8.921 | 12.419 | n/a | n/a | REJECT: three 2ms overruns |

The additional passes make this software checker slower than P21. Production
Metal performance remains near 60 FPS. CPU/render p95 remain evidence, not new
reject paths; the relative 20% cost threshold, hook budgets, visibility and scale
requirements are unchanged.

The new surfaces exposed a real camera issue at low checker FPS: advancing a
camera flight with the module's clamped 0.05s dt stretched a 1.5s fly-to over
several wall-clock seconds. Presentation flights now use bounded real elapsed
time, while module simulation retains its original dt budget and frame capture
uses its virtual dt. A citizen-sized command result now passes all three probes
at 28,200 contrasted pixel-equivalents (`state/visual/small-player-after.log`,
32.10s); the prior reproduction missed the early probes at 2,900 pixels.

## Deterministic 4K capture

`pnpm check:capture` loaded the same v1 take/seed in two fresh pages for each
route and advanced 24 frames at 1/60s. Both routes produced 3840x2160 PNGs with
identical hashes within that route, including an active alpha reaction video.
There were zero browser errors. Raw results: `state/visual/capture-results.json`.

| Route | Average step time, two pages | PNG readback/encode | SHA-256, both pages |
| --- | --- | --- | --- |
| /world | 1.01-1.16ms | 862-898ms | `74a4a8be51217bc5fce208062650317f4660a90e9530fd58fba923db482bcc2e` |
| /capture | 37.92-39.67ms | 341-345ms | `c555b36e5bb758ce2ea507e8ba81725ed92614b24e9264ec5faa06c753349469` |

Step timing excludes PNG readback and encoding. This exports a virtual 60 FPS
sequence offline; it does not promise real-time 4K PNG output. The fresh README
run exported two native 4K frames in 0.674s after startup.

Normal GPU iframe/video compositing showed one-channel rounding differences.
The provided Playwright driver retains GPU WebGL but disables GPU page
compositing for reproducible PNGs. Hashes are verified on this Mac/browser,
not across different GPU drivers, browser builds or font rasterizers. Real CPU
watchdogs can still abort under overload. Takes pin server state and module
sources; they do not replay prior game events. See [capture operation and its
boundaries](capture.md) for the exact driver and clock contract.

## Literal README walkthrough

Fresh local clone of `33f6784`, no copied `.env`, private port 3137. `/world`
was opened before sim and stayed rendering during the gate. The empty history
page was closed before building. Log and screenshots:
`state/visual/final-readme/`; clone path is recorded in its `report.json`.

| Command/action | Seconds | Result |
| --- | ---: | --- |
| git clone --quiet --no-hardlinks SOURCE TEMP | 0.76 | Fresh checkout |
| pnpm install --frozen-lockfile | 1.06 | Installed |
| pnpm exec playwright install chromium | 0.88 | Ready |
| pnpm check | 59.70 | 245/245; bundles, 14 alpha media/playback checks and history smoke pass |
| PORT=3137 SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev | 1.44 | Ready, no Twitch/Bedrock credentials |
| Open /world, /overlay, empty /history | n/a | Ready; No versions yet |
| pnpm sim | 62.40 | SHIPPED v1 Lantern orchard for Comet04; 184 events, 104 citizens, ballots [1,9,2] |
| pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png | 19.63 | 150 admitted, 254 total, 59.98 FPS |
| pnpm capture:frames --url 'http://127.0.0.1:3137/capture?version=v1&take=readme&seed=42&path=orbit' --frames 2 --fps 60 --out state/readme-capture | 2.47 | Two native 3840x2160 PNGs |
| Open /history and await credits | n/a | v1 @Comet04, credits visible; zero browser errors |

There is no observed fixture-demo regression. The software gate's additional
rendering cost is reported above. No live Bedrock rounds or OBS recording were
run in this pass.
