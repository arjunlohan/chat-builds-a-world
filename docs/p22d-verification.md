# Stream-readability follow-up

November 1, 2026, Apple M1 Pro, Chromium ANGLE Metal at 1920x1080.
No live Bedrock calls or pushes. Candidate thresholds and classic rendering remain unchanged.

## Fixture delivery

`40829b8` fixes the fake builder's quote-dependent API path rewrite. The regression
executes the actual fake CLI for both kit fixtures and inspects its emitted source.
`pnpm check`: 269 tests, bundles, media/playback and history passed.

A fresh clone of that commit followed the README with no copied environment:

| Command/action | Seconds | Result |
| --- | ---: | --- |
| git clone --no-hardlinks | 1.20 | Clean master |
| pnpm install --frozen-lockfile | 1.22 | Passed |
| pnpm exec playwright install chromium | 1.28 | Passed |
| pnpm check | 66.11 | Passed |
| SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev | 1.44 | HTTP ready |
| Open world, overlay, empty history | n/a | No versions yet; world open before sim |
| pnpm sim | 73.73 | 184 events, 104 citizens, [1,9,2], v1 first attempt |
| pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png | 20.70 | 150 admitted, 254 total, 60.03 FPS |
| /history | n/a | Lantern orchard, Comet04, credits, zero errors |

The original world was closed after shipping before the screenshot raid command
opened its own world renderer. Logs and full metrics are in
`state/asset-cache/readme-final/`; screenshots `state/visual/realism-readme-*`.
Pre-change fixed stills: `state/visual/p22d-before-*-4k.png` and 1080p crops.

## Late gate fault

Simulation waits now throw when a module faults, and the checker rechecks module
health and console errors immediately before its terminal passing verdict.
`pnpm exec tsx checks/chat-play.smoke.ts late-throws` passed: the fixture completed
all 14 timing slices, then faulted during the last focus wait. It rejected with
`chat-late-throws: update threw` in 38.606s, with two early visibility probes and
no passing verdict. Evidence `state/checks/d8eb3814-4e74-4cad-9e2f-573808beeed6/`.
`pnpm check` passed again. The unchanged visuals were recaptured as
`state/visual/p22d-gate-*`; 150-raider FPS 59.97, GPU means 12.43-13.36ms.

## Sunny sky and alpha-aware bloom

The camera's downward view previously landed almost entirely inside the gray
horizon blend. The displayed panorama now lifts that horizon independently of
the physical environment, retains the scanned sky's blue/cloud detail, and uses
lighter distance fog. Golden-hour tint and low sun remain visibly distinct.
The cloud sea keeps its alpha and stays below the emissive bloom threshold.
Bloom occluders now borrow cutout maps, opacity, sidedness and wind deformation;
source disposal releases the cached mask without disposing borrowed textures.

`pnpm check`: 270 tests plus browser checks passed. Fixed stills at
`state/visual/p22d-sky-*-4k.png` show day and golden-hour frames from all paths.
Fresh-page world/composite capture hashes match; zero browser errors.
150-raider day/dusk/night FPS: 59.96/59.94/59.75; GPU means 14.35/13.98/13.80ms.
Cold load 2.167s. Logs `state/asset-cache/p22d-sky-*`.

## Readable stone

The new garden now preserves UV seams when indexing textured primitives. Classic
keeps its prior untextured indexing. Stone uses the moss-rock surface; floating
fragments and scanned supports retain daylight detail. Cliff albedo and AO retain
contrast without treating the whole underside as wet lake shore. Atlas sampling
uses unwrapped derivatives, avoiding mip jumps at tile boundaries.
The UV regression and full check pass. Final 150-raider day/dusk/night FPS:
59.95/60.14/59.96; GPU means 14.06/13.96/13.80ms; cold load 2.282s.
Fixed stills/crops: `state/visual/p22d-stone-*`. Final logs end in
`p22d-stone-{hardware,stills}-grad.log`.

## Citizen-scale kit lanterns

Scanned glass now honors the preset opacity and disables opaque depth writing.
Named wood wins over generic glTF metalness factors when choosing a surface.
The lantern's wood stays non-emissive; its glass has a warm light that strengthens
at dusk/night without adding lights or draw calls. This applies to every named
kit lantern. The fixture uses five 0.8m lanterns near the ground, using count and
contrast rather than building-sized props.

The material regression passes. All 57 kit parity cases pass. The smaller orchard
passes the real candidate gate in 39.243s: 10,200 contrasted pixel-equivalents,
230x160 footprint, three qualifying probes, 24 frames/slice and 2.13% median
paired drop. No threshold changed. Evidence
`state/checks/c9170787-3b8c-42da-96b2-8aa38a3cedf4/`.
Production 150-raider day/dusk/night FPS: 59.94/59.77/59.97; GPU means
13.37/13.43/12.82ms; cold readiness including the kit module 3.204s.
Images `state/visual/p22d-lantern-*`; logs `state/asset-cache/p22d-lantern-*`.

## Raid label fade and final checks

Anonymous raider labels hold for six seconds after each staggered arrival and
fade over two seconds. The raid banner stays; actual chatter labels and speech
retain normal handling. The pure policy regression covers individual staggering,
expiry and named chatter preservation.

`pnpm check`: 273/273 plus bundles, media/playback and history. Final 150-raider
FPS day/dusk/night: 59.93/59.96/59.98; GPU means 13.91/13.27/13.58ms.
Cold readiness including the lantern kit: 2.261s. Final six 4K stills have zero
browser errors and take 29.17-31.60ms per virtual frame, excluding PNG encoding.
`state/visual/p22d-final-*` includes the fixed 1080p/crop set and all six stills.
World and composite fresh-page hashes match with the glass kit and reaction video
(`state/asset-cache/p22d-final-capture.log`). Capture retains its existing fixed
ambient-fill fallback, and classic remains the escape hatch.

Optional canopy/mip filtering is deferred: no additional coverage/LOD change was
verified within the 09:50 cutoff. Alpha-cutout bloom masking is fixed above.
