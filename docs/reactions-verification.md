# Chat reactions verification

Verified on Apple M1 Pro, macOS, Node 25.1.0, pnpm 9.10.0, Playwright Chromium
with ANGLE Metal for the world. Product revision: `dc8f3e7`. No Twitch or Bedrock
credentials were copied to the private clone. No live provider calls were made.

## Result

`pnpm check` passed **224/224** Node tests, TypeScript, generated contracts,
browser bundling, all **14** WebM alpha decodes and overlay playback checks.
This retains every existing test. The media checks require Playwright Chromium,
not Blender or ffmpeg.

Coverage includes token boundaries and every alias, distinct viewers, refreshing
and expiring a 20-second window, threshold scaling, cooldowns, a single takeover
plus one queue slot, ballot replacement, tie breaking, no-vote outcomes, collision
with idea/rollback votes, blocked messages, verified pause, restart, schema
validation and coherent phase-change flushes. The browser checks prove native
ending and server-clock expiry clear the video, duplicate state does not replay
it, and pause/resume works.

All media are silent VP9 alpha WebMs, 1920x1080 at 30 fps, six seconds per
reaction and seven seconds for the two extra vote-only clips. Every decoded
first and last frame has exactly **0%** visible alpha across the entire frame.
Midpoint coverage ranges from 5.23% to 26.18%. The encoder forces a last-frame
keyframe and checks decoded alpha, after Blender checks both saved PNG endpoints.
This catches faint residual alpha from lossy interframe prediction.

## Fresh-clone README walkthrough

Clone: `/var/folders/dj/tq15mfnn4hb406dsp0m80ts40000gn/T/reactions-readme-0MuPlx`.
Only PATH and HOME were inherited; the server added SIMULATION_MODE=fixture and
SIMULATION_ALLOWED=1. URLs used the README's default port 3000. The direct world
page was ready before the simulator started. All commands below exited zero.

| Command / action | Time | Result |
| --- | ---: | --- |
| `git clone --quiet --no-hardlinks <source> <temporary clone>` | 0.51 s | Clean master checkout |
| `pnpm install --frozen-lockfile` | 0.97 s | Lockfile unchanged |
| `pnpm exec playwright install chromium` | 0.88 s | Browser available |
| `pnpm check` | 44.16 s | All checks above passed |
| `SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev` | 1.35 s | Serving on :3000 |
| Open `/world?overlay=1`, `/overlay`, `/history` | | Ready canvas, connected overlay, “No versions yet” |
| `pnpm sim` | 53.23 s | 184 events, 104 citizens, [1,9,2], shipped v1 Lantern orchard for Comet04 |
| `pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png` | 19.18 s | 150 admitted, 254 citizens, 60.05 measured FPS, 60.00 avgFps |
| Reopen `/history` | | v1 available and playing |
| Open `/capture` | | 1920x1080 world and transparent overlay composite |
| `pnpm sim:reactions` | 127.99 s | All twelve reactions plus a vote, 319 accepted messages, final video cleared |
| `pnpm check:reactions` | 10.45 s | All 14 alpha clips and playback checks passed again |

The capture observed playback in order: laugh, hype, love, w, l, gg, f, dance,
nervous, sleepy, rage, sarcasm, worm-takeover. The final vote had three distinct
voters with counts [0,3,0], including a replaced ballot, and chose worm-takeover.
The world held 284 citizens and avgFps was **60.003** over the capture session.
There were zero page errors or error-level browser console messages. The server
and browser used for verification were stopped afterward.

The first walkthrough also passed install, checks, the demo and the raid; its
local verification harness then waited for a connection indicator to become
visible even though connected indicators are intentionally hidden. The harness
wait was corrected to check attachment. The complete walkthrough above was then
rerun in a new clone; no product change was needed.

## Reaction simulator output

```text
Chat reactions: prerecorded clips, moderated /sim/chat path, real 20s windows and playback durations.
laugh: 30 distinct viewers / threshold 30; playing 6s
hype: 30 distinct viewers / threshold 30; playing 6s
love: 30 distinct viewers / threshold 30; playing 6s
w: 30 distinct viewers / threshold 30; playing 6s
l: 30 distinct viewers / threshold 30; playing 6s
gg: 30 distinct viewers / threshold 30; playing 6s
f: 30 distinct viewers / threshold 30; playing 6s
dance: 30 distinct viewers / threshold 30; playing 6s
nervous: 30 distinct viewers / threshold 30; playing 6s
sleepy: 15 distinct viewers / threshold 15; playing 6s
rage: 15 distinct viewers / threshold 15; playing 6s
sarcasm: 15 distinct viewers / threshold 15; playing 6s
Vote: laugh, worm-takeover, dog-carrot; counts [0,3,0], 3 voters (replacement counted once).
Vote winner: worm-takeover; playing prerecorded clip.
PASS: 12 chat reactions + 1 vote, 319 accepted messages, 127.5s; takeover cleared.
```

## Render and encoding measurements

Eleven new scenes were rendered at full resolution in this pass. Hype, dog/carrot
and worm reused the previously verified full-resolution PNG sequences; their
recorded prior render times are marked “reused”. Every clip was freshly encoded
and decoded here. “Render” is EEVEE time; Blender total also includes the alpha
MOV and endpoint check. Encoding includes the successful size-selection passes
and decoded endpoint check. All files remain below the existing 2 MiB runtime
inventory limit, as well as the requested 3 MB target.

| Clip | WebM bytes | MiB | Render | Blender total | WebM encode/check |
| --- | ---: | ---: | ---: | ---: | ---: |
| laugh | 1,182,727 | 1.13 | 49.98 s | 56.59 s | 6.72 s |
| hype | 1,615,414 | 1.54 | 74.94 s (reused) | 81.28 s | 14.18 s |
| love | 1,273,733 | 1.21 | 50.49 s | 55.67 s | 5.84 s |
| w | 1,437,188 | 1.37 | 50.26 s | 56.27 s | 5.89 s |
| l | 963,843 | 0.92 | 47.82 s | 54.18 s | 6.35 s |
| gg | 1,696,308 | 1.62 | 52.15 s | 57.48 s | 6.75 s |
| f | 959,315 | 0.91 | 47.14 s | 51.79 s | 6.43 s |
| dance | 1,082,625 | 1.03 | 47.54 s | 52.37 s | 9.24 s |
| nervous | 912,274 | 0.87 | 46.56 s | 51.20 s | 6.07 s |
| sleepy | 1,082,885 | 1.03 | 47.90 s | 53.25 s | 9.27 s |
| rage | 861,024 | 0.82 | 51.73 s | 57.60 s | 6.52 s |
| sarcasm | 1,187,824 | 1.13 | 51.53 s | 56.39 s | 5.03 s |
| dog-carrot | 1,124,565 | 1.07 | 93.66 s (reused) | 100.83 s | 5.68 s |
| worm-takeover | 766,232 | 0.73 | 69.16 s (reused) | 76.35 s | 5.38 s |

Commands run, one invocation per name:

```sh
pnpm demo:render <laugh|love|w|l|gg|f|dance|nervous|sleepy|rage|sarcasm>
pnpm demo:render <hype|dog-carrot|worm-takeover> --encode-only
```

The earlier encodes were repeated with `--encode-only` after adding the final
keyframe. Source PNG endpoints and decoded WebM endpoints all remained zero.
All source scripts also passed `python3 -m py_compile assets/blender/*.py`.

The [catalog](../assets/blender/README.md#catalog) provides the complete twelve
trigger lists and one-line original clip descriptions, plus the two vote-only
options. It also documents the render command and disclosure.

## Local evidence

Ignored evidence is in `state/reactions-verification/`:

- `fresh-clone.json`: command timings, observed plays, world stats and errors.
- `command-*.log`: stdout/stderr for each completed command.
- `asset-metrics.json`: per-clip renderer and encoder measurements.
- `contact.png`: inspected midpoint sheet for all fourteen clips.
- `reaction-capture.png`: inspected full composite during laugh playback.
- `vote.png`: reaction vote panel with [0,3,0] and three voters.
- `history.png`: v1 playback in the temporary clone.

Live Twitch triggering and an OBS recording were not part of this offline run;
Arjun will record the end-to-end videos. The feature uses the same moderated chat
entrypoint for Twitch and simulation.
