# Offline frame capture

The normal `/world` and `/capture` URLs use real presentation time. Add
`capture=1` to load a pinned take and advance only when `window.__capture.step(dt)`
is called. This is an offline renderer, not a real-time 4K recorder.

## Select the shot

Use the same query on `/world` or `/capture`:

- `resolution=4k`: 3840x2160 framebuffer; CSS remains 1920x1080.
- `capture=1&version=v1&take=closing`: pin a shipped version and the current roster,
  summons and overlay state. The first request saves `state/captures/v1-closing.json`.
  Both capture iframes and later fresh pages use that same take. Choose a new take
  name to capture a newer roster/overlay snapshot. `version=latest` selects the
  latest healthy shipped version; `v0` selects the baseline.
- `seed=42`: seeded module factories/hooks, including their `Math.random` calls.
  Authored terrain/garden seeds remain fixed to preserve the world's layout.
- `path=fixed`, `path=orbit`, `path=push-in&module=module-id`, or `path=flyover`:
  fixed establishing shot, slow orbit, push toward owned bounds, or low flyover.
- `time=day|golden|dawn|dusk|night`: hold a sky phase. Omit it for the virtual day cycle.
- `look=classic|new`: override the server's `WORLD_LOOK` default.

A take stores source state and the module manifest. Modules start from their
factory/init state. Earlier chat events, game progress and future server events
are not replayed. Overlay countdowns and reaction-video seeks use the virtual
clock; the pinned server phase/queue/feed does not run a new round. Capture pages
never acknowledge builds or subscribe to live input.

## Export PNGs

Start the server, ship a fixture version using the README demo, then run:

```sh
pnpm capture:frames --url 'http://127.0.0.1:3000/capture?version=v1&take=closing&seed=42&path=orbit' --frames 600 --fps 60 --out state/closing
```

This exports native 4K `frame-000000.png` onward and `capture.json`. Existing frame
files are not overwritten. Frame zero is the loaded presentation; each later
frame advances by 1/fps seconds. The JSON records actual elapsed time separately
from video playback rate. Reaction assets retain their original 1080p/30fps
resolution and cadence.

The driver uses a 1920x1080 CSS viewport, deviceScaleFactor 2, GPU WebGL (Metal on
this Mac), and **`--disable-gpu-compositing`**. Software page compositing prevents
one-bit color/alpha differences across iframe and video surfaces. It does not
change the normal OBS source or the candidate gate. Reuse
`checks/capture-browser.ts` when driving Playwright yourself; its encoder waits
for presentation and explicitly requests a native 4K PNG.

Await `window.__capture.ready`, then await `step(1/60)` before each screenshot.
`frame` starts at zero and `time` is seconds. A step accepts 0..0.05 seconds.
Sky, water, citizens, effects, camera paths and module update hooks use that
clock. `services.clock.now()` exposes virtual milliseconds to modules, while
real CPU timing still enforces hook budgets. Module/graphics failures abort
capture. `__worldStats` uses virtual intervals in this mode and is not a speed
benchmark.

## Determinism boundary

`pnpm check:capture` compares fresh-page PNG pixels at the same version, take,
seed and frame, including an active alpha reaction video. Maximum channel delta
is 1/255, with at most 0.5% of pixels differing; larger changes fail. Hashes are
retained as diagnostics. It also checks native
4K dimensions and browser errors. Images and timings are saved to `state/visual/`.

Normal GPU page compositing can vary alpha/color by one channel value. Use the
provided driver flags for comparisons. Tolerances are verified on this Mac and
Chromium build; different GPUs, browser versions or system-font rasterizers may
produce different pixels. Real hook watchdogs remain active, so machine overload
can abort a capture. Module code must use dt/the host clock and the seeded random
stream, rather than unapproved external sources of time or entropy.

Capture retains the same sky-driven PMREM environment as live pages, including
metal, glass and surface reflections. It does not replace image-based lighting
with ambient fill. `step()` waits for a WebGL fence, so it resolves only after
that frame has finished on the GPU.
The 4K capture path is offline rendering, not a 60 fps real-time promise.
