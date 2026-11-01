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
