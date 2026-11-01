# Chat Builds a World

Twitch chat builds a shared Three.js island. Each chatter becomes a citizen with
their display name and chat colour. Chat can move citizens, summon objects and
propose modules. A vote selects a proposal; Codex reviews and builds it, automated
checks gate it, and the browser activates it without a reload. Raids arrive through
a portal. `/history` replays shipped versions with requester credits.

```text
Twitch EventSub WebSocket          Local simulator
          |                            |
          +------------+---------------+
                       v
              Node.js / TypeScript
              | citizens, raids, rounds, votes
              | reactions -> chat meter/vote -> local alpha WebM playback
              | summon -> Bedrock Responses -> Scene Spec validation
              | idea -> Codex guard -> Codex builder in git worktree
              |                      -> policy + Chromium checks
              |                      -> tag + fast-forward + activation receipt
              +---- state/ checkpoints, versions, metrics
              |
              +---- same-origin SSE ---- /world   Three.js, 1920x1080
              +------------------------- /overlay transparent OBS source
              +------------------------- /history version playback
```

## Prerequisites

- Node.js 20 or newer, Git, and pnpm **9.10.0**. The lockfile is committed.
- A WebGL 2 browser or OBS browser source. Production rendering uses a physical
  GPU; software rendering is used separately for candidate checks.
- Playwright Chromium for the simulator's checked build and browser checks.
- For live guard/build only: a Codex CLI supporting the configured Amazon Bedrock
  provider. The tested CLI is **0.166.0-alpha.5.1**. `CODEX_BIN` selects its path;
  the default is `codex`. The no-Twitch fixture demo uses a local fake CLI instead.

Test hardware for the recorded performance numbers: Apple M1 Pro, macOS,
ANGLE Metal, Node 25.1.0. Results depend on hardware and concurrent load.

## Install and run the no-Twitch demo

Start with a clean clone on `master`, with Twitch credentials unset in the shell
and no copied `.env`. From its repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev
```

Leave the server running. Open [the world](http://127.0.0.1:3000/world?overlay=1)
**before running the simulator**. A world browser must acknowledge the checked
module's activation. Open [the overlay](http://127.0.0.1:3000/overlay) separately,
or use both as OBS sources below. A fresh [history page](http://127.0.0.1:3000/history)
shows **No versions yet**.

In a second terminal at the same clone's root:

```sh
pnpm sim
pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png
```

The full simulator sends **184 events**, produces **80 named chatters plus 24
representative raiders**, adds three fixture summons, and runs a 15x round:
seven proposals become four ideas, three candidates and twelve voters with totals
**[1,9,2]**. The fixture builder still passes the real path, policy, type, Chromium,
Git and browser-receipt checks. A passing run ships v1 for Comet04. Allow about a
minute. The follow-up raid admits 150 into the 104-citizen world, giving 254 total.
It uses the same incoming `channel.raid` decoder as Twitch and saves a screenshot.
Reopen `/history` to play v1. After the last chapter, contributor credits roll
over the world and hold the closing line. Reduced motion shows a static credits
list. Replay starts the timelapse again. Fixtures make no Twitch or Bedrock calls.

State survives restarts. For a repeatable first run, use another fresh clone;
restarting does not clear citizens, cooldowns or rounds. Keep `DEMO_MODE` unset
for this scripted simulator. Ctrl+C stops dev. Source changes restart the server;
reload browser pages after changing browser source.

## OBS sources

Create two Browser Sources at **1920x1080**, in this order:

| Source | URL |
| --- | --- |
| World | `http://127.0.0.1:3000/world?overlay=1` |
| Overlay, above world | `http://127.0.0.1:3000/overlay` |
| Combined recording source | `http://127.0.0.1:3000/capture` |
| Optional history scene | `http://127.0.0.1:3000/history` |

The overlay is transparent and keeps panels at the edges. `?overlay=1` hides the
world's title/hint. `?debug=1` adds an FPS readout; `window.__worldStats` exposes
fps, avgFps, frame and citizenCount regardless of that flag. `/world` defaults to a
1920x1080 framebuffer. Portrait pages retain the scene with readable page text.

## Rendering and frame capture

The new look is the default: 4x MSAA (SMAA fallback), smooth procedural surfaces,
sky environment lighting, contact AO and emissive-only bloom. OBS stays at
1920x1080. `?resolution=4k` selects a native 3840x2160 framebuffer independently of
CSS size; use a 1920x1080 viewport and deviceScaleFactor 2 for a 4K screenshot.

Sunday's fallback is `WORLD_LOOK=classic`: restart the server and refresh the OBS
sources. `?look=classic` also overrides a page, including `/capture`; the primary
live world's reported look selects the candidate gate. Capture pages do not
change that report.

For offline PNG sequences, add `capture=1`, select a shipped version, seed and
camera path, and drive `window.__capture.step(1/60)`. The
[frame capture guide](docs/capture.md) documents pinned takes, Playwright flags,
limits and determinism. The provided driver is:

```sh
pnpm capture:frames --url 'http://127.0.0.1:3000/capture?version=v1&take=closing&seed=42&path=orbit' --frames 600 --fps 60 --out state/closing
```

Measured frame rates, comparison images and capture hashes are recorded in the
[visual foundation verification](docs/visual-foundation.md).

The committed CC0 asset set needs no download at startup. Maintainers can rebuild
it with `pnpm assets:fetch`; raw downloads stay in ignored `state/asset-cache/`.
See [ASSETS.md](ASSETS.md) for sources, compression and sizes.

## Environment

`.env.example` contains empty dotenv assignments and commented optional settings,
not credentials or a copy of `.env`. On a new clone, configure live services with:

```sh
cp .env.example .env
```

Fill in the required values and uncomment optional settings only to override their
defaults. Edit an existing `.env` rather than overwriting it. Keep the file private.
Environment variables take precedence; restart after edits.
No `.env` is needed for the fixture demo above.

| Name | Meaning / default |
| --- | --- |
| `TWITCH_CLIENT_ID` | Registered Twitch application client ID |
| `TWITCH_CLIENT_SECRET` | Its server-side client secret |
| `TWITCH_ACCESS_TOKEN` | Broadcaster user access token |
| `TWITCH_REFRESH_TOKEN` | Refresh token from that authorization |
| `TWITCH_BROADCASTER_ID` | Numeric ID of that same broadcaster |
| `AWS_BEARER_TOKEN_BEDROCK` | Bedrock bearer API key, server-only |
| `PORT` | Local port, default 3000 |
| `WORLD_LOOK` | `new` by default; `classic` restores the prior rendering pipeline |
| `SUMMON_MODEL` | Default `openai.gpt-6.1-sol` |
| `SUMMON_REASONING_EFFORT` | Default **max** |
| `SUMMON_SERVICE_TIER` | Default `ultrafast` |
| `CODEX_BIN` | Codex executable, default `codex` |
| `SIMULATION_ALLOWED` | `1` enables local simulation/admin routes; `0` disables. Default enabled without complete Twitch configuration, disabled with it |
| `SIMULATION_MODE` | `fixture` injects offline providers/CLI; otherwise live providers |
| `DEMO_MODE` | `1`: ideas 20s, vote 10s, rollback vote 10s; normal 120s/45s/30s. Guard/build stay 45s/180s |

`PATH` and `HOME` come from the operating system. Runtime `CODEX_HOME` is assigned
internally to a private invocation directory, not supplied through this file.
Without Twitch configuration, the server logs one warning and keeps running.
Without the Bedrock key, live AI requests fail clearly; they never silently use fixtures.

## Twitch app and tokens

1. Register an application in the [Twitch developer console](https://dev.twitch.tv/docs/authentication/register-app/).
   Record its client ID and client secret. Configure those credentials privately
   in the [Twitch CLI](https://dev.twitch.tv/docs/cli/) using `twitch configure`.
2. Use the device code flow, which needs no self-hosted callback:

   ```sh
   twitch token -u --dcf -s 'user:read:chat user:write:chat'
   ```

   Follow the verification link and sign in as the broadcaster. Store the returned
   access and refresh tokens privately in TWITCH_ACCESS_TOKEN and TWITCH_REFRESH_TOKEN.
   The flags were checked against the installed `twitch token --help`.
3. Validate the token at `GET https://id.twitch.tv/oauth2/validate` with
   `Authorization: OAuth <access token>`. Set TWITCH_BROADCASTER_ID to its user_id.
   The client ID and both scopes must match. An app-only token is insufficient.
4. Populate all five Twitch variables, enable Twitch AutoMod on the channel,
   leave SIMULATION_MODE unset, and run `pnpm dev`. The server validates identity
   and scopes, subscribes on EventSub welcome, reconnects with backoff and refreshes
   tokens. Rotations persist privately in state/twitch-auth.json.

Alternatively, use Twitch's [authorization code grant](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow):
register an exact redirect URI for a callback you control; authorize as the
broadcaster with response_type=code, client_id, redirect_uri, both scopes and a
random state checked by your callback. Exchange the returned code at
`POST https://id.twitch.tv/oauth2/token` with client_id, client_secret, code,
grant_type=authorization_code and the identical redirect_uri. Store both tokens,
then validate and set the broadcaster ID as above. This repository does not host
an OAuth callback. Authentication is an interactive account-owner step, separate
from the credential-free command checks.

This implementation uses the broadcaster as both chat subscription user and
message sender. See Twitch's [chat authentication](https://dev.twitch.tv/docs/chat/authenticating/).
A real second-account raid remains a manual verification step for the broadcaster.
With live Twitch configured, set SIMULATION_ALLOWED=1 explicitly for local admin tests.
The simulator never sends chat to Twitch.

## Bedrock setup

In an AWS account permitted to invoke the configured model in **us-east-1**, open
the Bedrock console and generate a bearer key through
[API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html).
Select us-east-1 before generating a regional short-term key and account for its
expiry. Store it only as AWS_BEARER_TOKEN_BEDROCK. Account permissions and model
availability must cover `openai.gpt-6.1-sol`.

Summon calls the [Bedrock Responses API](https://developers.openai.com/api/docs/guides/amazon-bedrock)
at **https://bedrock-mantle.us-east-1.api.aws/openai/v1/responses** using
`openai.gpt-6.1-sol`, structured JSON output, max reasoning by default and
store=false. It creates Scene Spec data, not executable code. The runtime Codex
provider is selected in `.codex-runtime/config.toml`: amazon-bedrock, us-east-1,
`openai.gpt-6.1-sol`. Guard effort is low and builder effort is medium. Keep
SIMULATION_MODE unset for live calls. No OpenAI API key is required by this app.
Live model requests incur provider charges; the fixture demo requires no key.

## Chat commands

| Command | Action |
| --- | --- |
| `!jump`, `!dance`, `!home`, `!follow <name>` | Citizen motion |
| `!summon <thing>` | Validated visual with requester credit; 60s/user and 5s/global cooldown |
| `!idea <text>` | Back an idea in the collection phase |
| `!vote 1`, `!vote 2`, `!vote 3` | Vote; a later ballot replaces the earlier one |
| `!rollback`, then `!vote yes` or `!vote no` | Vote to restore the prior healthy module set |
| `!react 1`, `!react 2`, `!react 3` | Reaction vote, separate from idea votes |
| `!pause`, `!skip`/`!veto`, `!clear` | Verified moderators/broadcaster only: pause, advance/cancel, remove latest summon |

The roster caps at 300. A full world can replace the oldest citizen quiet for at
least three minutes, protecting recent chatters. A raid admits at most 150 within
that same cap. Idle citizens fade/expire after twenty minutes. Commands never
appear as raw speech bubbles. Guard rejections and failed builds retain the world.

## Safety model

- Incoming text is untrusted. Moderation, cooldowns and closed JSON schemas precede
  allocation. Summons cannot contain code, shaders, URLs or arbitrary assets.
- The Codex guard reviews quoted ideas read-only against a bounded schema and
  safety rules. The builder writes only approved files under world/modules/ in a
  fresh worktree. It cannot edit engine, prompts, checks, configs or dependencies.
- Runtime Codex gets only PATH, HOME, the Bedrock token and an isolated CODEX_HOME.
  Plugin/app/hook discovery is disabled. Output is bounded and redacted; the
  process group is killed on timeout/cancellation. Tokens are never logged.
- Path/AST/type/resource checks precede a Chromium/SwiftShader gate with 300
  citizens. Seven adjacent pairs toggle only the candidate's visual roots on/off
  in 24-frame slices, with the same camera, chat and running hooks. Cost uses a
  fixed main-plus-shadow pipeline over the actual scene; full-look visibility uses
  the production composer including AO, bloom and AA. The median
  paired throughput drop must not exceed 20%. Hook and render p95 are evidence;
  the host enforces its hook budget. Errors, frozen/black output, sustained collapse,
  unreadable geometry and props taller than the world tree envelope reject a build.
  Two early visibility misses reject immediately; a final probe must still pass.
  The gate has a 45-second watchdog; the builder reserves time for it and self-checks.
  Custom commands from the spec and candidate source are exercised by ten synthetic
  players; built-in commands are excluded. Camera focus, player objects, win markers
  and reachable wins follow the [rendered rules](AGENTS.md#world-module-api-v1).
  It uses a 1920x1080 viewport and a reduced 160x90 framebuffer for software
  rendering, with separate visibility probes; it is not a full-HD GPU benchmark.
- Checked modules require a live activation acknowledgement. Failed activations
  restore the healthy world without stashing/resetting user work. Unchanged instances survive
  hot swaps. Hooks have cooperative 2ms/module and 4ms/total frame budgets.
- JavaScript hooks cannot be preempted. Static policy, isolated checks and the
  watchdog reduce risk; CSP and hook try/catch are not an arbitrary-code sandbox.
- Saved state is validated before restoration. Interrupted provider calls are
  cancelled rather than replayed. Persistence and promotion mechanics are in
  [operation notes](docs/operation.md); implementation rules are in [AGENTS.md](AGENTS.md).
- The server binds to loopback. Browser connections use a same-origin CSP/SSE.
  `.env`, state/, worktrees/, node_modules/ and runtime homes are ignored. Only
  `.codex-runtime/config.toml` is tracked. World surfaces, plants, props and sky include committed CC0 data from Poly Haven
  and ambientCG, alongside authored geometry and shaders. No third-party logos,
  downloaded fonts or audio are included. See [asset notices](ASSET_LICENSES.md)
  and [per-asset provenance](ASSETS.md).

## How Codex was used

Codex, **GPT-6.1 Sol at High effort**, wrote all code in this repository in one build
session. A Claude Code harness pasted the phase prompts, ran verification and
forwarded review findings. It did not write repository files.

There are two runtime Codex uses, both through `codex exec`:

1. **Guard:** low effort, read-only sandbox, ephemeral JSON execution with an
   output schema. It judges chat ideas against the schema and safety rules.
2. **Builder:** medium effort, workspace-write sandbox in an isolated Git worktree.
   Its JSON events become short overlay feed lines. Policy, type, render and
   resource checks gate the module before ship and live activation.

The separate summon lane uses Bedrock Responses with `openai.gpt-6.1-sol` to
produce Scene Spec JSON visuals. It does not invoke the runtime Codex builder.
The code paths are server/guard/, server/runner/ and server/summon/provider.ts.
The engineering contract is [AGENTS.md](AGENTS.md); operational details are in
[docs/operation.md](docs/operation.md).

## Chat reactions (prerendered)

Chat reactions charge with distinct viewers in a sliding 20-second window. The
threshold is 35% of viewers active in the last two minutes, rounded up, with a
minimum of 3 and maximum of 30. Each reaction cools down for 90 seconds after it
starts. At most one clip plays and one waits; a vote winner has queue priority.
Repeated messages from one viewer refresh that viewer's window without adding
votes. Blocked messages and commands do not charge meters. Moderator `!pause`
freezes meters, votes, cooldowns and playback. State survives restart.

Every three minutes, outside idea and rollback voting, three random available
clips get a 30-second `!react 1|2|3` vote. A later ballot replaces the earlier one;
ties use the first offered option. An idea/rollback vote cancels a reaction vote.
An empty reaction vote plays nothing. Dog/carrot and worm appear only in votes.

The overlay plays committed **prerendered Blender clips**, made from scripts
Codex wrote. It does not generate video live. The source, disclosure, catalog
and render commands are in [assets/blender/README.md](assets/blender/README.md).
Judges need neither Blender nor ffmpeg. The two additional concept clips now
share this playback path. Clips are silent, VP9 WebM with alpha, served locally
under the existing same-origin policy. The charge meter measures participation.

With the fixture server running, open `/capture` (world plus overlay at
1920x1080), then in another terminal:

```sh
pnpm sim:reactions
pnpm check:reactions
```

The reaction simulator drives all twelve chat thresholds and one 30-second vote
through moderated sim chat. Allow about two minutes, use a fresh fixture server
and keep other chat idle. Its simulation-only route opens a normal reaction vote;
all ballots still use `/sim/chat`. It sends no chat to Twitch. With live Twitch
configured, explicitly enable `SIMULATION_ALLOWED=1` for simulation routes.
The world page must remain open before `pnpm sim` as described above; `/capture`
also supplies that world connection. The reaction media check starts its own
isolated HTTP server and browser. It can run without a dev server.

## Verification and reproduction

Current reaction checks and the fresh-clone command log are in
[docs/reactions-verification.md](docs/reactions-verification.md). The earlier
judge setup log is in [docs/phase10-verification.md](docs/phase10-verification.md).

Completed Phase 9 runs at the revisions recorded in
[the historical report](docs/phase9-verification.md) measured **60.06 FPS** with
150 raiders inside 300 citizens, production 1920x1080 on Apple M1 Pro / ANGLE Metal.
Both actual two-hour soaks completed nine start/15-minute/end samples. Final FPS
was **59.97-60.08**, server post-GC heap **55.932 to 55.847 MiB**, browser
**7.268 to 7.357 MiB**, with 300 citizens, 940 DOM elements and zero errors.
Those are completed historical measurements, not a new two-hour claim for this cleanup.

Stop dev and close the world/history tabs before these standalone checks, so GPU
workloads do not compete. To reproduce the raid workload and actual SIGKILL recovery:

```sh
pnpm check:raid
pnpm check:gate-load
pnpm check:chat-play
pnpm exec tsx checks/hardening.smoke.ts
```

`check:gate-load` compares cheap and expensive fixture modules with and without
six (or fewer, based on CPU count) parallel CPU-load processes. `check:chat-play`
exercises synthetic commands, focus/visible results and command-only exceptions.
Their JSON evidence remains under ignored `state/`. No provider calls are made.

A short run verifies the soak harness and full checked fixture setup:

```sh
pnpm sim:soak --seconds=10 --interval=900 --sample=2 --output=state/soak-smoke.json
```

For a full two-hour repetition, change seconds to 7200 and sample to 10. The
harness clones the current commit, runs the simulator, fills to 300, samples heap
and FPS and cleans its clone. Avoid concurrent GPU checks during its candidate
gate. The current fresh-clone run and the historical two-hour run are reported
separately. Test artifacts are ignored under state/.
