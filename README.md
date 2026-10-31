# Chat Builds a World

Twitch chat builds a living 3D world on stream. Every chatter becomes a creature,
small wishes become objects, bigger ideas become live-coded systems, and raids
arrive through a portal. A Codex x TwitchCon Hackathon entry by Arjun.

This is **Phase 1 of 10: spec and scaffold**. The runnable demo is an offline
Three.js canvas with a placeholder at `/world`, plus placeholder `/overlay` and
`/history` pages. The island, citizens, chat transport, AI lanes, module host and
version playback are future work. Integration stubs fail explicitly if called.

## Run from a fresh clone

Requirements: Node.js **20 or newer** and **pnpm 9.10.0** (the pinned package
manager). From the cloned repository root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm sim
pnpm dev
```

Open [the world](http://127.0.0.1:3000/world). Expect “A world waiting for chat.”
and “Three.js ready · offline scaffold” in a WebGL-capable browser. The canvas is
prepared for a 1920×1080 OBS browser source and resizes to its viewport. The
placeholder intentionally has no island geometry yet. `/` redirects to `/world`.

The server binds only to `127.0.0.1`. To change the port, use `PORT=3001 pnpm dev`.
Stop with Ctrl+C. Browser bundles are built in memory at startup; restart dev
after changing browser source. Server TypeScript changes restart automatically.

No `.env`, API keys, AWS login, Twitch account or Codex runtime is needed. Phase 1
reads only the optional `PORT` variable and makes no provider calls. `.env.example`
is an inventory of variable **names only**, not a populated dotenv file. Future
phases will add credential loading; never put secrets into browser bundles.

## Checks and local simulation

- `pnpm check`: strict TypeScript checks for every source stub, seven data-contract
  tests, and in-memory compilation of both browser bundles. No API calls.
- `pnpm sim`: prints one deterministic chat fixture and one raid fixture; exits.
  It does not yet deliver events to the world.
- `pnpm dev`: starts the local Node server and serves the placeholder pages.

Optional browser verification (downloads Chromium on first setup):

```sh
pnpm exec playwright install chromium
pnpm exec playwright test -c checks/playwright.config.ts
```

Playwright launches headless Chromium with SwiftShader at 1920×1080, checks the
visible placeholder and Three.js readiness, and fails on console/page errors.
It starts its own dev server if port 3000 is free or reuses an already running
one. This is a Phase 1 smoke check; the 15-second module, performance and frozen/
black-canvas gate described in `AGENTS.md` is still to be implemented.

## Layout and implementation order

`AGENTS.md` defines the product, architecture, World Module API, frame budgets,
Scene Spec JSON schema and hard limits. The canonical executable schema is
`server/summon/scene-spec.schema.json`; checks ensure its copy in `AGENTS.md` stays
identical. `world/engine/api.ts` defines the TypeScript module interface.

```text
server/       twitch, citizens, summon, rounds, guard, runner, versions, sim
world/engine/ locked runtime engine and module host contracts
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
or verified in Phase 1.

## Safety model

- Fast lane runs data, never code. The schema and server parser enforce payload,
  count, numeric, reference and size constraints. Moderation, cooldowns, global
  rate limits, full geometry bounds and resource admission are later-phase work.
- Runtime code changes are confined to `world/modules/**`; the future runner must
  reject every diff outside that path, including path escapes and symlinks.
- Runtime Codex receives an allowlisted environment with no secrets except the
  Bedrock key and its own `CODEX_HOME=.codex-runtime`. Guard uses a read-only
  sandbox; builder uses workspace-write in a fresh worktree. Neither runs yet.
- The future module host must catch every hook, enforce per-frame scheduling
  budgets, disable failing modules and clean up owned resources. Headless checks
  must precede merge/tag/hot swap and preserve a known-good version for rollback.
  Hook timing is cooperative and cannot preempt an infinite JavaScript loop.
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
