# Final footage and judge checkout verification

November 1, 2026. Verification uses private ephemeral ports, no live provider
calls and no access to the separate stream server on port 3000. The extra in-app
world tab was closed before measurement. Gate thresholds and classic are retained.

Items 1-6 used live 1080p frames with PMREM while capture still had its known
ambient fallback. Items 7-9 include native 4K capture with PMREM restored.
The pre-lighting reference set is `state/visual/p26-before-{day,golden,dusk,night}.png`.

| Item | Check | 150-raider FPS, day/golden/dusk/night | GPU ms, same order |
| --- | --- | --- | --- |
| 1. Twitch failure notice | 275 tests and browser checks pass | 60.13 / 59.97 / 59.97 / 60.16 | 17.63 / 13.04 / 12.46 / 12.28 |
| 2. History autoplay | 275 tests and browser checks pass | 59.96 / 60.15 / 59.95 / 59.96 | 12.73 / 11.98 / 12.07 / 12.71 |
| 3. Builder kit guidance | 276 tests and browser checks pass | 59.96 / 59.97 / 59.97 / 60.16 | 12.18 / 12.22 / 14.13 / 13.53 |
| 4. Model preload and retry | 278 tests, computed-kind gate/live and recorded README pass | 59.95 / 59.94 / 59.95 / 59.96 | 22.18 / 22.21 / 22.58 / 22.14 |
| 5. Golden-hour lighting | 279 tests and browser checks pass | 59.95 / 59.95 / 59.90 / 59.97 | 22.32 / 21.46 / 22.68 / 22.52 |
| 6. Dusk, moonlight and sky band | 280 tests and browser checks pass | 60.05 / 59.95 / 59.97 / 60.16 | 21.18 / 20.89 / 20.10 / 20.47 |
| 7. Capture image-based lighting | 281 tests and fresh-page capture comparisons pass | 59.96 / 59.97 / 59.96 / 60.16 | 14.65 / 14.06 / 13.89 / 12.76 |
| 8. Canopy mip coverage | Full check and four-phase browser check pass | 59.98 / 59.95 / 59.98 / 59.97 | 12.84 / 13.10 / 12.42 / 12.21 |
| 9. Shared texture sources and image-free LODs | 283 tests, recorded README and gate load check pass | 59.96 / 59.96 / 59.96 / 59.93 | 13.44 / 13.04 / 13.66 / 13.58 |

## 1. Twitch failure visibility

Configured Twitch starts disconnected, becomes connected after subscriptions
succeed, and reports disconnection on authorization, socket or keepalive failure.
A transient status is in the snapshot and revisioned SSE stream, so reloading the
overlay retains the notice. It is not restored from a checkpoint. No-credential
demos remain disabled and hide the notice. Fatal refresh tests use synthetic
responses; no live Twitch request was made.

Tests cover invalid refresh, subscription readiness, connection loss, notice
visibility after overlay reload, and hiding in connected/no-credential modes.
`pnpm check` and `pnpm exec tsx checks/realism.smoke.ts p26-1 --kit` pass.
Four lighting stills, crops and metrics are under `state/visual/p26-1-*`.

## 2. OBS history autoplay

`/history?autoplay=1` starts from chapter one after loading, without a click,
including on a reduced-motion system. Credits retain their static reduced-motion
presentation. The no-flag behavior and empty state are unchanged. The history
browser smoke verifies both paths and credits after the final chapter.
`pnpm check` and `pnpm exec tsx checks/realism.smoke.ts p26-2 --kit --settled`
pass. The settled option waits for arrival focus to return to the home shot;
it changes verification only. These unchanged-world frames are also copied to
`p26-before-*` for subsequent lighting comparisons.

## 3. Builder material and prop guidance

The shared kit guidance now prefers named models before raw geometry, gives a
citizen-relative lantern size, asks for small clusters rather than inflated
props, and reserves unlit materials for glow/particle accents. Solid surfaces
use named PBR presets. AGENTS.md is generated from the same text. No admission
threshold or renderer behavior changed. The prompt/contract test and full check
pass, as do the settled four-phase stills and 150-raider check (`p26-3-*`).

## 4. Checked model preload metadata

The source AST and TypeScript type facts produce model-kind metadata alongside
the compiled module. The metadata passes through resource checks, the candidate
worker, immutable version manifests, restart/history and pinned capture snapshots.
The browser prepares named models before synchronous activation without searching
bundled code. Broad/opaque dynamic kinds conservatively name the finite catalog;
ordinary typed kinds remain selective. Legacy bundles are inspected as ASTs on
the server. Unconditional catalog preload was rejected: both current LOD sets
decode to about 536 MiB of image pixels before mipmaps.

Failed model promises are evicted. The computed-kind fixture builds its name
from pieces and has no complete kind literal after bundling. It passed policy,
types and the candidate gate in 40.296 seconds. In a live page, an intentionally
aborted first fetch failed activation; a second activation fetched again and
succeeded. Unit tests also cover failed-load eviction and metadata restart.
Evidence: `state/model-preload-results.json`, `p26-computed-model.png`.

The private-port recorded README run shipped v1 on attempt 1 in 93.470 seconds
of simulation (gate 57.791 seconds, native warmup 18.967 seconds). It admitted
150 more raiders to 254 total at 59.98 fps; history/credits and browser errors
passed. It encoded the complete 1080p tab at a 2 Mbps VP9 target throughout the
build. Logs and evidence: `state/asset-cache/p26-4-readme-recording/` and
`p26-4-readme-recording-final.log`. A preceding run also shipped, but its gate
took 64.941 seconds (19.973 native warmup), leaving only 5.059 seconds on the
unchanged 70-second watchdog and failing the inherited P25 ten-second margin
assertion. This timing limitation is retained rather than hidden or fixed by
changing thresholds. The source full check and settled four-phase performance
check pass (`p26-4-*`).

## 5. Golden hour

Warmth is concentrated in the low sun and horizon, with blue overhead scattering
and photographed cloud structure retained. Cloud tops stay white-gold instead of
receiving an overall brown grade. Grazing sunlight has additional sky/hemisphere
fill so the green ground and citizen colors remain legible. Shared authored
constants define this look; normal day and night use their prior zero-warmth
settings. No geometry or gate limit changed.

`pnpm check` and the settled four-phase 150-raider check pass. Before/after:
`p26-before-golden.png` and `p26-5-golden.png`. Day/golden/dusk/night frames,
crops and GPU measurements are in `state/visual/p26-5-*`.

## 6. Dusk/night readability and the sky stripe

The vertical band came from collapsing a tilted equirectangular panorama onto
one horizon row (`source.y=max(.025,source.y)`). Private ablations preserved it
with cloud sprites hidden, removed it with the sky dome hidden, and showed no
change when texture wrapping changed. Unclamped panorama directions removed the
stretched stripe. The original HDR directions now pass intact to sampling.
Diagnostics: `p26-sky-dusk-{full,no-clouds,no-sky,repeat}.png` and
`p26-sky-test-dusk-{unclamped,horizon-fade}.png`.

Cool hemisphere/ground fill and moonlight make grass, rocks and paths visible
outside lantern pools. The existing directional light blends toward an
above-horizon moon during blue hour instead of remaining below the terrain.
There are no additional lights, shadows or passes. The daylight/classic budgets
and the constant night environment-bake behavior are retained. Golden scattering
fades with daylight so dusk stays cool.

The full check and settled four-phase 150-raider check pass. Before/after:
`p26-before-{dusk,night}.png` and `p26-6-{dusk,night}.png`. All frames/crops and
GPU timings are under `state/visual/p26-6-*`.

## 7. Capture retains image-based lighting

Capture now uses the same sky PMREM as live rendering. Fresh 4K pages at the
same take, seed and frame compare pixels with a maximum channel delta of 1/255
and at most 0.5% differing pixels. The test rejects either excess separately;
PNG hashes remain diagnostic. Both `/world` and `/capture`, including an active
alpha reaction, actually matched byte for byte (zero differing pixels). The
capture-mode fence and lifecycle budgets are unchanged.

A metal/brass/glass fixture also verifies that live and capture both have a
PMREM environment, one bake, no module error and the same home camera. See
`p26-capture-vs-live-{live,capture}-4k.png` and the side-by-side
`p26-capture-vs-live.png`. This comparison is visual evidence, not the determinism
test: live reduced motion and fixed-step capture sample foliage/water differently.
The fresh-page repeat test is the determinism boundary.

`pnpm check`, `pnpm check:capture`, `checks/capture-lighting.smoke.ts` and the
settled 150-raider check pass. Native 4K capture frames took 67.1-82.0 ms in the
repeat test, excluding 468-552 ms PNG capture/encoding. This is offline rendering.
A kit-specific repeat encountered an init-budget rejection under load; its
independent first pair was exact. No budget was relaxed. The full default repeat
passed both routes. All four lighting phases and three camera paths are saved
under `state/visual/p26-7-*-*-4k.png`; metrics are in `p26-7-stills.json`.
The settled 12-shot set took 28.0-30.4 ms per GPU-complete frame on this run.

## 8. Canopy filtering

Cutout maps receive a progressive, coverage-preserving mip chain once when the
asset loads. The adjustment never lowers filtered alpha, preserving thin tips.
MSAA alpha-to-coverage remains enabled; there are no added draws, geometry or
passes. The canvas base image is also installed as the texture source so WebGL
sets the right upload orientation for canvas mips. Owned copies retain the mip
chain. Classic skips asset preparation and is unchanged.

Numeric tests cover thin coverage, transparent texels, color retention and empty
or fully covered input. The full check and settled four-phase 150-raider check
pass. The change is modest: it reduces thin-leaf dropout, not the authored scan's
leaf-cluster detail. Matching crops are `p26-canopy-{before,after}-1080.png` and
`p26-canopy-{before,after}-4k.png`, with side-by-side
`p26-canopy-{1080,4k}-comparison.png`. The complete four-phase sets and three
native-4K camera paths are under `state/visual/p26-8-*`.
The fresh-page 4K capture repeat also passes both routes with zero differing
pixels (`p26-8-capture-results.json`).

## 9. Shared image sources and image-free LODs

Owner textures now use `Texture.clone()`: independent sampler/UV parameters and
disposal, with a shared immutable Source. Low LOD GLBs contain geometry, surface
names and UVs, and borrow their paired high LOD's named materials after loading.
Failed/ambiguous surface matching fails closed. The fetch pipeline reproduces
image-free LODs. All 40 high/low model files retain their triangle/draw admission
counts; checksums, exact file sizes and provenance are updated in ASSETS.md.

This removes 11,925,368 bytes. World outputs are 31,309,937 bytes; all committed
asset data/sources/media are 47,517,685 bytes, below the 120,000,000-byte budget.
The closed model catalog's decoded image pixels halve from 536 to 268 MiB before
mipmaps. The browser test loads the entire catalog, submits two real fixture
summons through the pipeline and verifies render acknowledgements. GPU textures
are 61 before, 64 after the first, and 64 after the second. Clearing one retains
64 for the remaining owner; clearing both settles at 62. A second summon/clear
cycle repeats the same 64 peak and 62 steady count without growth. Before this
change the two-summon sequence was 71, 74, 77. Evidence:
`state/visual/p26-texture-sharing{,-before}.json`.

The full check passes (283 tests, browser/media/history). The 150-raider browser
cold load is 1.519 seconds. All 12 four-phase/three-path native 4K stills are
byte-identical to item 8 (`p26-lod-visual-parity.json`). Fresh-page capture repeats
also match exactly for `/world` and `/capture` (`p26-9-capture-results.json`).
The settled stills take 28.3-31.7 ms per GPU-complete native 4K frame.
A final `CAPTURE_KIT=1 pnpm check:capture` also passes both routes with byte-identical
fresh-page PNGs and no init-budget/browser errors. Its model-kit frames and
metrics are saved as `p26-9-kit-{world,capture}-{a,b}.png` and
`p26-9-kit-capture-results.json`.

Final literal README run, in an owned fresh clone with the source patch committed
there before running commands (no .env or live credentials copied):

| Command/action | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | 1.19 s, passes |
| `pnpm exec playwright install chromium` | 1.11 s, passes |
| `pnpm check` | 69.29 s, all checks pass |
| `SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev` | HTTP ready in 1.75 s on private port 64550 |
| Open world, overlay and history before sim | World/overlay ready; history says No versions yet |
| Record the full 1080p world tab, VP9 target 2 Mbps | Held through build and ship |
| `pnpm sim` | 75.05 s, v1 Lantern orchard for Comet04 on attempt 1; 184 events, 104 citizens, votes [1,9,2] |
| `pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png` | 20.63 s, 150 admitted, 254 total, 59.98 fps |
| Open history | v1 chapter and closing credits; zero browser errors |

The recorded gate takes 41.509 seconds, native warmup 15.078 seconds, leaving
28.491 seconds on the unchanged watchdog. Build/activation total: 47.399 seconds
with synthetic fixture token usage. Full logs, recording and copied evidence:
`state/asset-cache/p26-9-readme-recording/`.

The independent interleaved gate load check also passes all four cases:

| Module | Host | Outcome | Gate seconds | Native warmup seconds |
| --- | --- | --- | ---: | ---: |
| Cheap | Idle | PASS | 35.138 | 12.243 |
| Expensive | Idle | REJECT, hook overruns | 5.764 | n/a |
| Cheap | Six workers | PASS | 43.346 | 12.815 |
| Expensive | Six workers | REJECT, hook overruns | 6.547 | n/a |

Both cheap gates retain seven pairs of 24-frame slices, fresh pages and all three
visibility probes. No threshold changed. Evidence is copied to
`state/visual/p26-9-gate-load-results.json`. The stream clone on port 3000 was
untouched; the extra in-app world tab stayed closed. There were no live Bedrock
rounds or pushes.
