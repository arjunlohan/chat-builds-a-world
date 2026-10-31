# Chat Builds a World

Twitch chat builds a living 3D world on stream. Every chatter becomes a creature,
small wishes become objects, bigger ideas become live-coded systems, and raids
arrive through a portal. A Codex x TwitchCon Hackathon entry by Arjun.

This is **Phase 2 of 10: the World**. `/world` renders the Lantern Garden: an
original procedural island with jade terrain, layered basalt cliffs, coral trees,
a spring and waterfall, a moon gate and glowing lanterns. The painted sky follows
a ten-minute day/night cycle. Soft shadows, shader ripples, GPU fireflies and bloom
keep the empty world alive. All geometry, shaders and effects are authored in
code; there are no external assets, fonts, network integrations or API keys.

The cinematic camera drifts quietly around the island. Click a spot to fly closer;
the camera holds the view, then smoothly returns to its establishing shot. Reduced
motion keeps the composition and continuous effects still. The module host now
implements the documented lifecycle, timing budgets, bounded event dispatch,
resource admission and cleanup. Citizens, chat transport, AI lanes, Scene Spec
materialization and version playback remain future work. `/overlay` and `/history`
remain placeholders. Integration stubs fail explicitly if called.

## Run from a fresh clone

Requirements: Node.js **20 or newer** and **pnpm 9.10.0** (the pinned package
manager). From the cloned repository root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm sim
pnpm dev
```

Open [the world](http://127.0.0.1:3000/world) in a WebGL 2-capable browser. It uses a
fixed **1920×1080 framebuffer at DPR 1**, fitted to the viewport at 16:9 without
stretching. Set an OBS browser source to 1920×1080. `/` redirects to `/world`.

- `/world?debug=1` shows instantaneous FPS and the rolling 120-frame average.
  Diagnostics are hidden by default. `window.__worldStats` always exposes
  `{ fps, avgFps, frame }` for automation. FPS measures actual frame intervals;
  hidden-tab time is excluded and simulation dt is clamped to 0.05 seconds.
- `?time=dawn`, `?time=day`, `?time=dusk`, `?time=night` freeze the sky at an
  authored time of day for screenshots. Water and fireflies keep animating.
- Full-HD rendering uses instanced plants/props, pooled particles, one cached
  1024px soft-shadow map, and a half-resolution bloom chain. Modules that animate
  geometry cause shadows to refresh. No per-frame geometry/material allocation.

The server binds only to `127.0.0.1`. To change the port, use `PORT=3001 pnpm dev`.
Stop with Ctrl+C. Browser bundles are built in memory at startup; restart dev
after changing browser source. Server TypeScript changes restart automatically.

No `.env`, API keys, AWS login, Twitch account or Codex runtime is needed. The app
reads only the optional `PORT` variable and makes no provider calls. `.env.example`
is an inventory of variable **names only**, not a populated dotenv file. Future
phases will add credential loading; never put secrets into browser bundles.

## Checks and local simulation

- `pnpm check`: strict TypeScript checks, 17 contract/engine tests covering lifecycle,
  budgets, queues, cleanup, resource admission, camera and FPS, and compilation of both browser bundles. No API calls.
- `pnpm sim`: prints one deterministic chat fixture and one raid fixture; exits.
  It does not yet deliver events to the world.
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
Build, then raids/history. The live server will route Twitch EventSub events to
the world and overlay. Summon will generate validated data via Bedrock Responses;
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
- The served world has `default-src 'self'` and `connect-src 'none'` CSP, local
  assets only, no inline scripts and no browser network integrations.
- Guard prompts must treat chat as untrusted data and reject networking, edits
  outside modules, real people, personal data, offensive content and copyrighted
  games/brands. Twitch AutoMod, a blocklist, cooldowns and verified moderator
  commands `!pause`, `!skip`, `!clear` are required before chat integration.
- `state/`, `.env`, `worktrees/`, `node_modules/` and everything in
  `.codex-runtime/` except `config.toml` are ignored. No secrets are committed.
- All interaction uses chat commands; no Twitch Extensions or Affiliate-only
  features. No third-party logos, unlicensed fonts or copyrighted audio.
