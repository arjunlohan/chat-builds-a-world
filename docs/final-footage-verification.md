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
