# Final footage and judge checkout verification

November 1, 2026. Verification uses private ephemeral ports, no live provider
calls and no access to the separate stream server on port 3000. The extra in-app
world tab was closed before measurement. Gate thresholds and classic are retained.

Before capture lighting is corrected in item 7, lighting stills are live 1080p
frames with PMREM, rather than 4K capture frames with the known ambient fallback.
The pre-lighting reference set is `state/visual/p26-before-{day,golden,dusk,night}.png`.

| Item | Check | 150-raider FPS, day/golden/dusk/night | GPU ms, same order |
| --- | --- | --- | --- |
| 1. Twitch failure notice | 275 tests and browser checks pass | 60.13 / 59.97 / 59.97 / 60.16 | 17.63 / 13.04 / 12.46 / 12.28 |

| 2. History autoplay | 275 tests and browser checks pass | 59.96 / 60.15 / 59.95 / 59.96 | 12.73 / 11.98 / 12.07 / 12.71 |

| 3. Builder kit guidance | 276 tests and browser checks pass | 59.96 / 59.97 / 59.97 / 60.16 | 12.18 / 12.22 / 14.13 / 13.53 |

| 4. Model preload and retry | 278 tests, computed-kind gate/live and recorded README pass | 59.95 / 59.94 / 59.95 / 59.96 | 22.18 / 22.21 / 22.58 / 22.14 |

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
