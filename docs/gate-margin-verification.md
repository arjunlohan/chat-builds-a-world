# P25 candidate gate margin verification

Implementation: `a6c265b`. November 1, 2026, Apple M1 Pro. No live provider calls. Renderer, assets,
measurement thresholds and production output are unchanged.

## Changes

The server owns one Chromium process and default profile, started in the background.
Every candidate creates a fresh page and private world server with new module
instances. Closing a page clears its globals and WebGL allocations. The browser
profile survives between checks. Page-close attempts have a two-second deadline; a hung
checker resets the browser, and a disconnected browser restarts on demand.

The first full-look render now supplies the first qualified visibility probe
instead of being discarded as an additional native warmup render. All three
probes remain, including the final probe. Costs still use seven adjacent on/off
pairs of 24 frames, at least 20 frames per slice, with the same 20% paired-drop
ceiling. Visibility, scale, resource and hook limits are unchanged.

The watchdog is 70 seconds, including browser acquisition. The round/build limit
is 240 seconds. BUILD_CHECK_RESERVE_MS is 114 seconds: 30 resource startup,
12 resource check, 70 candidate gate, 2 handoff. Nominal builder allowance is
126 seconds, reduced by elapsed preflight work. This exceeds the requested
110-second nominal allowance. Guard timing is unchanged.

The retained profile did not eliminate SwiftShader's per-page native compilation.
The approximately 30-second idle target is not met. The margin targets passed;
this is not a claim that the cache removed the cold-start cost.

## Timings

Before figures come from P24 evidence and the reported recording-tab failure.
They are separate runs with different background daemon load, not a controlled
before/after benchmark. Native warmup for the old idle lantern fixture was
13.451 seconds; the old idle range also includes other fixtures.

| Mode | Before gate | Before native warmup | After gate | After native warmup | Margin to 70 s |
| --- | --- | --- | --- | --- | --- |
| Idle cheap fixture | 38.6-42.6 s | 13.451 s reference | 37.099 s | 12.829 s | 32.901 s |
| Six CPU workers, cheap fixture | 45.025 s timeout | 15.114 s | 43.302 s | 13.534 s | 26.698 s |
| README with recording world tab | 45 s timeout, reported | 23.896 s, reported | 42.043 s | 14.933 s | 27.957 s |

The expensive fixture is rejected for three hook-budget overruns in 6.152 seconds
idle and 6.217 seconds with six workers. All passing runs have 14 slices of
24 measured frames and three qualifying visibility probes.

An additional canvas-only recording rehearsal shipped on attempt 1 with a
46.414-second gate and 15.640-second native warmup. The final full-tab rehearsal
below includes HTML labels as well as the world canvas.

## Commands and results

- `pnpm check`: 274 tests, type check, generated contracts, bundles, alpha-video
  checks, overlay playback/clearing and history smoke checks passed.
- `pnpm check:gate-load`: cheap passes and expensive fails, idle and with six
  competing CPU processes. The smoke asserts at least ten seconds of margin,
  three probes, 14 slices of 24 frames and a fresh page target.
- `pnpm exec tsx checks/chat-play.smoke.ts late-throws`: rejected for update fault
  after all 14 timing slices. No terminal pass was emitted.
- `pnpm exec tsx --test checks/gate-browser.test.ts`: fresh page globals/target,
  retained profile, page cleanup, explicit reset and close.

The fresh clone was created from 865d4db, with only this source patch copied and
committed inside the owned temporary clone before following the README. No .env
or runtime state was copied. The full check ran separately in the source checkout.

| README command/action | Result |
| --- | --- |
| `git clone --no-hardlinks` | Private temporary clone, 1.175 s |
| `pnpm install --frozen-lockfile` | Pass, 1.113 s |
| `pnpm exec playwright install chromium` | Pass, 1.106 s |
| `SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev` | HTTP ready, 2.377 s |
| Open `/world?overlay=1`, `/overlay`, `/history` | World before sim; empty history unchanged |
| Record world tab through CDP screencast and ffmpeg VP9 | 1920x1080, 30 fps, 2 Mbps target; held through ship |
| `pnpm sim` | 75.708 s; 184 events, 104 citizens, [1,9,2]; SHIPPED v1 Lantern orchard for Comet04, attempt 1 |
| `pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png` | 150 admitted, 254 citizens, 59.986 fps |
| Reopen `/history` | v1 and closing credits, zero browser errors |

The recording contains 2,262 frames over 75.4 seconds. ffprobe confirms VP9,
1920x1080 and 30 fps; the variable-rate encoder averaged 2.535 Mbps against its
2 Mbps target. A Playwright CDP Page.startScreencast captured the whole tab as JPEG
frames (quality 80, every second displayed frame); ffmpeg encoded them concurrently
with libvpx-vp9, realtime, cpu-used 8 and two threads.

Ignored evidence: `state/candidate-load-results.json`,
`state/asset-cache/p25-final-load-70.log`, `state/asset-cache/p25-check-release-final.log`,
`state/asset-cache/p25-late-fault.log`, and
`state/asset-cache/p25-tab-recording-demo/{results.json,checks,world-recording.webm}`.
The local walkthrough driver is `state/p25-tab-recording-demo.ts`; it retains no
credentials and stops its own browser, encoder and server.
