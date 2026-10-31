# Chat Builds a World

Twitch chat builds a living 3D world on stream. Every chatter becomes a creature,
small wishes become objects, bigger ideas become live-coded systems, and raids
arrive through a portal. A Codex x TwitchCon Hackathon entry by Arjun.

This is **Phase 3 of 10: Twitch, citizens and the simulator**. `/world` renders the Lantern Garden: an
original procedural island with jade terrain, layered basalt cliffs, coral trees,
a spring and waterfall, a moon gate and glowing lanterns. The painted sky follows
a ten-minute day/night cycle. Soft shadows, shader ripples, GPU fireflies and bloom
keep the empty world alive. All geometry, shaders and effects are authored in
code; there are no external assets or fonts. Twitch is optional and server-only;
the complete offline crowd demo needs no credentials.

The cinematic camera drifts quietly around the island. Click a spot to fly closer;
the camera holds the view, then smoothly returns to its establishing shot. Reduced
motion keeps the composition and continuous effects still. The module host now
implements the documented lifecycle, timing budgets, bounded event dispatch,
resource admission and cleanup. Chatters now become colorful little creatures
with name tags and speech bubbles. `!jump`, `!dance`, `!follow <name>` and `!home`
animate them. The server caps the roster at 300; six instanced draws render the
creatures, which fade five seconds after becoming idle for 20 minutes. Automatic
arrival/action camera shots coalesce and are at least eight seconds apart.
AI lanes, Scene Spec materialization and version playback remain future work. `/overlay` and `/history`
remain placeholders. Integration stubs fail explicitly if called.

## Run from a fresh clone

Requirements: Node.js **20 or newer** and **pnpm 9.10.0** (the pinned package
manager). From the cloned repository root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

In a second terminal at the repository root, run `pnpm sim`. It replays 80 named
chatters in varied colors, 80 chat lines, 80 commands (20 of each kind), and one
raid through the same pipeline as Twitch. Expect **161 accepted events and 80
citizens**. Repeat runs reuse those 80 identities; a dev-server restart clears the
in-memory roster. Raid intake is implemented; its portal/parade is a later tier.

Open [the world](http://127.0.0.1:3000/world) in a WebGL 2-capable browser. It uses a
fixed **1920×1080 framebuffer at DPR 1**, fitted to the viewport at 16:9 without
stretching. Set an OBS browser source to 1920×1080. `/` redirects to `/world`.

- `/world?debug=1` shows instantaneous FPS and the rolling 120-frame average.
  Diagnostics are hidden by default. `window.__worldStats` always exposes
  `{ fps, avgFps, frame, citizenCount, raidCount, cameraFocuses }` for automation. FPS measures actual frame intervals;
  hidden-tab time is excluded and simulation dt is clamped to 0.05 seconds.
- `?time=dawn`, `?time=day`, `?time=dusk`, `?time=night` freeze the sky at an
  authored time of day for screenshots. Water and fireflies keep animating.
- Full-HD rendering uses instanced plants/props, pooled particles, one cached
  1024px soft-shadow map, and a half-resolution bloom chain. Crowd shadows refresh
  every other frame; active modules cause per-frame shadow refresh. No per-frame geometry/material allocation.

The server binds only to `127.0.0.1`. To change the port, use `PORT=3001 pnpm dev`.
Stop with Ctrl+C. Browser bundles are built in memory at startup; restart dev
after changing browser source. Server TypeScript changes restart automatically.

No `.env`, API keys, AWS login, Twitch account or Codex runtime is needed for sim.
Without the Twitch variables, dev logs one clear warning and keeps running in
sim-only mode. Both dev and sim quietly load an optional `.env` (`PORT` defaults to
3000). `.env.example` remains an inventory of **names only**, not a populated file.
Never commit `.env` or put secrets into browser bundles.

## Checks and local simulation

- `pnpm check`: strict TypeScript checks, 36 contract/engine/integration tests covering lifecycle,
  budgets, queues, cleanup, roster/cap/expiry, HTTP/SSE, Twitch reconnect/refresh,
  camera and FPS, and compilation of both browser bundles. No external API calls.
- `pnpm sim`: sends the scripted crowd to the running server, verifies the roster
  and prints counts. It exits with an error if dev is not running or events fail.
- `pnpm dev`: starts the local Node server and serves the world and placeholder pages.

Optional browser verification (downloads Chromium on first setup):

```sh
pnpm exec playwright install chromium
pnpm exec playwright test -c checks/playwright.config.ts
```

Playwright launches headless Chromium with SwiftShader at 1920×1080, verifies
nonblack rendering, advancing frame statistics, hidden/visible diagnostics and
night/day scenes, saves screenshots in ignored `test-results/`, and fails on
console/page errors. It starts a dev server if port 3000 is free or reuses one.
Software rendering is a correctness check and is much slower than a physical GPU.

With `pnpm dev` running, measure the empty world on the local physical GPU:

```sh
pnpm exec tsx checks/world.performance.ts
```

This identifies the WebGL renderer, warms up, measures 15 seconds of actual frames,
checks for near-60 FPS (minimum 55), checks console errors and saves a screenshot.
On macOS it uses ANGLE/Metal; it rejects software backends. Hardware results depend
on the machine and load. The later 300-citizen/module candidate gate from
`AGENTS.md`, including freeze/black-frame and external watchdog checks, remains
future work.

## Crowd performance verification

With `pnpm dev` running on port 3000 and capacity for 80 citizens:

```sh
pnpm exec tsx checks/crowd.performance.ts
```

The hardware-backed Chromium check opens `/world?debug=1`, executes **pnpm sim**,
compares all 80 server IDs with browser tags, verifies Twitch colors and all four
commands, checks bounded bubbles and raid delivery, warms up and samples 15 seconds.
It requires both measured FPS and `window.__worldStats.avgFps` >=50, no console
errors and at most three automatic fly-tos. Screenshots go to `test-results/`.
The M1 Pro/Metal development run held about 60 FPS at 1920×1080 with exactly 80
citizens and two automatic shots. Performance depends on hardware and load.

## Optional live Twitch

Create a private ignored `.env` with these names populated: `TWITCH_CLIENT_ID`,
`TWITCH_CLIENT_SECRET`, `TWITCH_ACCESS_TOKEN`, `TWITCH_REFRESH_TOKEN`,
`TWITCH_BROADCASTER_ID`. Use an OAuth Authorization Code **user token belonging to
that broadcaster**, with **user:read:chat** and **user:write:chat** scopes. Enable
Twitch AutoMod on the channel. Restart dev after editing credentials.

The server validates identity/scopes at startup and hourly, subscribes to
channel.chat.message and incoming channel.raid on session welcome, watches
keepalives, migrates Twitch-directed reconnects without duplicate subscriptions,
and uses capped exponential backoff on connection loss. A 401 performs a shared
token refresh. Rotated tokens are atomically stored in ignored
`state/twitch-auth.json` with mode 0600 so restarts keep working; changing the
original env refresh token or account bypasses the old cache. No tokens, auth
headers, upstream payloads or raw upstream errors are logged or sent to the world.
`TwitchClient.sendChat(message)` uses POST /helix/chat/messages with the broadcaster
as sender. The simulator never sends chat to Twitch. Live Twitch behavior is
covered by mocked socket/HTTP tests; no live account was used for verification.
See Twitch's [WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/),
[token refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/), and
[Send Chat Message](https://dev.twitch.tv/docs/api/reference/#send-chat-message).

## Local event API

Both Twitch and the simulator call `WorldPipeline.chat` / `.raid`; validation,
deduplication, cooldowns, capacity, commands and broadcasts are identical.

- `POST /sim/chat`: JSON with `id`, `userId`, `displayName`, `color` (hex RGB or
  empty for a stable fallback), `text`. An optional timestamp is ignored; arrival
  time belongs to the server. IDs are 1–128 ASCII letters/digits/underscore/hyphen,
  display names 1–64 characters and chat text 1–500 characters.
- `POST /sim/raid`: JSON with `id`, `broadcasterId`, `broadcasterName`, `viewerCount`
  (positive integer <=1,000,000). It feeds the same raid hook and counter; it does
  not invent viewers or spawn raid citizens yet.
- `GET /api/world`: current authoritative roster and raid/control metadata.
- `GET /events`: SSE snapshot then revisioned deltas, 15-second heartbeats,
  automatic browser reconnect and fresh snapshots. At most 16 local viewers.

Simulator POSTs require JSON <=8 KiB, loopback Host headers and same-origin browser
requests. No simulator body can claim moderator privileges. Incoming chat is
limited to one accepted message/user/250 ms and 200 messages/second globally.
Only server-verified Twitch broadcaster/moderator roles may invoke `!pause`,
`!skip`, `!clear`. Pause gates new actions; skip/clear publish controls for the
future lanes. Current blocklist filtering is basic. Speech is always textContent,
never HTML; at most 16 recent bubbles are visible and each expires after 5.5s.

## Layout and implementation order

`AGENTS.md` defines the product, architecture, World Module API, frame budgets,
Scene Spec JSON schema and hard limits. The canonical executable schema is
`server/summon/scene-spec.schema.json`; checks ensure its copy in `AGENTS.md` stays
identical. `world/engine/api.ts` defines the TypeScript module interface.

```text
server/       twitch, citizens, summon, rounds, guard, runner, versions, sim
world/engine/ procedural world, renderer, camera, bounded module host
world/modules/ only runtime Codex edit surface
overlay/      queue, votes, Codex feed, timeline and toasts
checks/       contracts, browser bundling and Playwright/SwiftShader smoke
state/        future persisted world/round/version data (ignored; created at runtime)
.codex-runtime/config.toml  nonsecret runtime model configuration
```

Build the independently demo-able tiers in order: world/citizens, Summon,
Build, then raids/history. The live server routes Twitch EventSub events to the world over same-origin SSE;
the future overlay can consume that stream. Summon will generate validated data via Bedrock Responses;
Build will guard proposals, write isolated world modules, check them and activate
versioned changes.

Later-phase model settings from the product contract are retained in `AGENTS.md`
and `.codex-runtime/config.toml`: `openai.gpt-6.1-sol` on Bedrock in `us-east-1`;
summon defaults `max` reasoning and `ultrafast` service tier, configurable through
`SUMMON_MODEL`, `SUMMON_REASONING_EFFORT` and `SUMMON_SERVICE_TIER`. Guard uses low
effort and builder medium effort. Provider access and latency are not exercised
or verified yet.

## Safety model

- Fast lane runs data, never code. The schema and server parser enforce payload,
  count, numeric, reference and size constraints. Moderation, cooldowns, global
  rate limits, full geometry bounds and resource admission are later-phase work.
- Runtime code changes are confined to `world/modules/**`; the future runner must
  reject every diff outside that path, including path escapes and symlinks.
- Runtime Codex receives an allowlisted environment with no secrets except the
  Bedrock key and its own `CODEX_HOME=.codex-runtime`. Guard uses a read-only
  sandbox; builder uses workspace-write in a fresh worktree. Neither runs yet.
- The module host catches each hook, rejects async hooks, clamps dt, limits each
  module to 2 ms/frame and all modules to 4 ms/frame, and disables a module after
  three overruns in 60 frames. Queues hold at most 128 events and dispatch at most
  16/module/frame. Init/dispose have an 8 ms measured allowance. Candidates are
  initialized and audited before a previous instance is retired. Mesh, triangle,
  draw, light and particle admission shares world caps with the base environment.
  Host-tracked resources are cleaned even when a hook throws; service calls are
  scoped and rate limited. JS timing is cooperative, not a sandbox: arbitrary code
  still needs the future guard and external headless/watchdog gate before live
  activation. It cannot preempt an infinite loop or prevent malicious global access.
- The served world has `default-src 'self'` and `connect-src 'self'` CSP for
  the event stream/local API, locally bundled assets, no inline scripts and no
  external browser connections. All Twitch networking and credentials stay on Node.
- Guard prompts must treat chat as untrusted data and reject networking, edits
  outside modules, real people, personal data, offensive content and copyrighted
  games/brands. Twitch AutoMod remains upstream; the local basic blocklist,
  cooldowns and verified moderator controls apply before citizen updates.
- `state/`, `.env`, `worktrees/`, `node_modules/` and everything in
  `.codex-runtime/` except `config.toml` are ignored. No secrets are committed.
- All interaction uses chat commands; no Twitch Extensions or Affiliate-only
  features. No third-party logos, unlicensed fonts or copyrighted audio.
