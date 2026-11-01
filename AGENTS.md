# Chat Builds a World · engineering contract

## Product and delivery

Twitch chat builds a living 3D world on stream. Every chatter becomes a creature;
small wishes appear in seconds; substantial systems are coded live; raids arrive
through a portal. Entry by Arjun for the Codex x TwitchCon Hackathon, due Monday,
November 2, 2026 at 2:00 PM Pacific. All source lives at this repository root.

Build in this order; cut scope from the bottom:

1. **World and citizens:** Three.js floating island diorama (terrain, water, sky,
   lighting) in a 1920×1080 OBS browser source; cinematic drift and event focus.
   Chat color tints each citizen; name tags and speech bubbles. `!jump`, `!dance`,
   `!follow <name>`, `!home`. GPU instancing, at most 300 active citizens, 60 fps
   target, idle fade after 20 minutes. No AI needed for this tier.
2. **Summon:** `!summon <thing>` → moderation, per-user cooldown and global rate
   limit → Bedrock Responses structured JSON → schema/semantic/resource checks →
   spawn with effect and viewer credit. Data only; never execute generated code.
   Aim for under 10 seconds and measure it when implemented.
3. **Build:** about five-minute `!idea` rounds, top three candidates and `!vote
   1|2|3`. Guard approves a safe spec or rejects it. Runtime Codex builds a module
   in a fresh worktree; plan and file edits stream to the overlay. Headless checks
   precede merge/tag vN and hot swap. Credit the viewer; show failures and revert
   automatically. `!rollback` opens a vote to undo the last version.
4. **Raids and history:** EventSub `channel.raid`, filtered by this channel's
   `to_broadcaster_user_id`; portal and a parade labelled with the source channel,
   scaled to viewer count within the citizen cap. `/history` replays v1…vN as a
   time-lapse. Cross-channel module gifts are stretch scope.

Twitch and Bedrock are optional. Missing Twitch configuration must keep sim-only
mode running; missing Bedrock credentials must fail live AI requests without
silently substituting fixtures. Offline adapters must be explicit startup
configuration and exercise the same validation, limits, checks and activation
paths. Never print or log credentials. Runtime Codex must remain confined to
approved module files under the guard, runner and World Module API rules below.

## Architecture and ownership

```text
Twitch EventSub WS → Node 20+ TypeScript server → /world (Three.js / OBS)
                                ├─ citizens, chat, raids, rounds and votes
                                ├─ summon → Bedrock → Scene Spec validator
                                ├─ guard → builder/worktree → checks → versions
                                └─ /overlay (queue, votes, Codex feed, timeline, toasts)
Persisted snapshots/rounds/versions → state/ (ignored)
Version playback → /history
```

Use pnpm, ES modules, strict TypeScript, Node >=20 and the committed lockfile.
`pnpm dev` serves local pages, `pnpm sim` posts a scripted crowd of 80 chatters
and one raid, three fixture summons and an accelerated scripted round to the running
server, and `pnpm check` type-checks all sources,
tests contracts/integrations and bundles browser entrypoints. Restart dev after browser-source changes.
No external CDN, fonts, logos or audio. Browser networking is same-origin only;
Twitch networking and credentials stay on the Node server.

- `server/twitch/`: EventSub, reconnect/dedup, tokens, moderation commands.
- `server/citizens/`: authoritative roster, activity/expiry and command routing.
- `server/summon/`: provider adapter, moderation/rate limits, schema and validator.
- `server/rounds/`: proposals, top-three votes and rollback votes.
- `server/reactions/`: moderated distinct-viewer charge windows, separate `!react` votes, bounded playback queue and pause-aware persisted clock.
- `assets/world/`: curated CC0 data from Poly Haven and ambientCG, with provenance in ASSETS.md; offline preparation lives in scripts/. Runtime builders cannot edit or fetch these assets.
- `assets/blender/`: offline procedural animation sources; `assets/reactions/`: committed, silent VP9 alpha WebMs served locally. Runtime builders cannot edit either path.
- `server/guard/`: read-only Codex review; low effort and JSON schema output.
- `server/runner/`: worktree builder, medium effort, feed, path checks and checks.
- `server/versions/`: merges, tags, attribution, snapshots and recovery.
- `server/sim/`: credential-free deterministic local inputs.
- `world/engine/`: locked renderer, camera director, citizens, materializer,
  module host, effects and logging. Normal product engineering may edit these;
  **runtime Codex may not**.
- `world/modules/`: the only runtime-editable path; one default factory per module.
- `overlay/`: queue, votes, Codex feed, timeline, toasts.
- `checks/`: contract checks and Playwright/Chromium + SwiftShader smoke scaffold.

Provider contract for later phases, retained exactly as specified by the product:
Bedrock region `us-east-1`, Responses endpoint
`https://bedrock-mantle.us-east-1.api.aws/openai/v1`, model `openai.gpt-6.1-sol`.
Read `AWS_BEARER_TOKEN_BEDROCK` only from the environment. Summon settings are
`SUMMON_MODEL` (default `openai.gpt-6.1-sol`), `SUMMON_REASONING_EFFORT` (default
`max`), `SUMMON_SERVICE_TIER` (default `ultrafast`). Guard effort is `low`, builder
is `medium`; use `codex exec` and `CODEX_HOME` in a per-invocation `.codex-runtime` directory under ignored
`.codex-runtime/runs/`, seeded from the canonical config and cleaned afterward.
This prevents CLI preference writes from dirtying tracked configuration. Availability,
configuration and latency will be verified when the integration is built.
`.env.example` contains empty dotenv assignments, with optional defaults in comments;
never add credentials or populated values.

## Phase 3 event and citizen contract

- `server/pipeline.ts` is the only chat/raid ingestion path. Both EventSub and
  `POST /sim/chat`, `POST /sim/raid` call it. It validates inputs, deduplicates a
  bounded history, enforces a 250 ms per-user chat cooldown and 200 chats/second,
  applies the basic blocklist and updates the authoritative capped roster.
- `/events` sends same-origin SSE, a snapshot on every connection, then revisioned
  deltas; heartbeats keep connections open. `/api/world` returns a roster snapshot
  for inspection and tests. Limit local streams to 16 and terminate slow readers.
  Mutating endpoints require JSON <=8 KiB and reject cross-origin requests. Bind
  only to loopback and accept localhost/127.0.0.1 Host headers.
- Reserve resources for 300 creatures in one indexed instanced geometry/draw. Each citizen has
  a dry, unique home, current command, last activity, name/color and latest speech.
  Bodies/ears/tails use the Twitch color (stable palette fallback for empty color).
  Name tags and at most eight visible speech bubbles use textContent, never HTML.
  Bubbles expire after 5.5 seconds. Idle citizens dither-fade for five seconds
  starting at 20 minutes, then the server removes them and releases their home.
- `!jump`, `!dance`, `!follow <name>` (case-insensitive display name/ID), `!home`
  share the same command parser for Twitch and sim. Follow uses indexed lookups
  and cached paths over a fixed dry-land grid. Home cancels follow. Missing follow targets do not crash.
- Camera notices coalesce into a weighted target and automatic shots are at least
  eight seconds apart. New arrivals and jump/dance moments get shots; direct clicks
  have higher priority. No generated module controls this notification scheduler.
- `window.__worldStats` adds `citizenCount`, `raidCount` and `cameraFocuses` to
  `fps`, `avgFps`, `frame`. `checks/crowd.performance.ts` invokes pnpm sim, compares
  server IDs with browser tags, checks every command, and measures 15 seconds on
  a physical GPU with both average FPS values >=50. No live credentials in tests.
- Twitch WebSockets begin at `wss://eventsub.wss.twitch.tv/ws`. Initial welcomes
  create v1 channel.chat.message (broadcaster_user_id and user_id both this channel)
  and channel.raid (to_broadcaster_user_id this channel) subscriptions via Helix.
  Respect keepalive timeouts, use a new socket for Twitch's reconnect URL while
  holding the old socket until welcome, and retain migrated subscriptions. Fresh
  sessions resubscribe. Network failures back off with jitter, capped at 60s.
  Only official Twitch wss reconnect destinations are accepted. ws handles pong;
  never send EventSub data frames.
- Load optional .env server-side, validate the broadcaster user token at startup
  and hourly (user:read:chat + user:write:chat). A 401 triggers one shared refresh
  through TWITCH_REFRESH_TOKEN; retain rotated tokens in ignored
  state/twitch-auth.json (0600, atomic write, tied to this env/account). Raw API
  bodies, errors, headers and credentials are never logged. `sendChat` is a
  server-only POST /helix/chat/messages; no test sends a real Twitch message.
- Only authenticated EventSub broadcaster/moderator roles can invoke !pause,
  !skip, !clear. Sim JSON cannot grant roles. !pause gates new chat actions;
  skip advances/cancels the Build lane; clear now removes the last
  active Summon as specified below.
  Twitch AutoMod is upstream; enable it on the channel. The current blocklist is
  deliberately basic, not a claim of comprehensive moderation.

## Phase 4 Summon and label contract

- Citizen tags are packed in a shared 1920×1080 screen layout with HUD exclusion
  zones. Bubbles win, then summon credits, focus, near/recent arrivals and tags.
  Full tags are eligible within 19 world units, within 30 seconds of speaking,
  within eight seconds of arrival, or near the camera focus. Quiet distant tags
  are smaller/faded. Show at most eight bubbles, 22 full labels and six quiet tags;
  hide colliding rectangles. Keep full text in the DOM; use textContent throughout.
- !summon goes through `server/summon/index.ts`: untrusted wish/blocklist check,
  60-second per-user cooldown, global one-per-five-seconds limit, provider,
  normalize, strict schema/reference/workload/bounds validation, global admission,
  SSE event, atomic browser materialization, then visible-paint receipt.
- Live calls use the exact specified Bedrock Responses endpoint/model and
  configurable reasoning/service tier. The key is read only from
  AWS_BEARER_TOKEN_BEDROCK server-side. Requests use store:false, a fixed output
  token ceiling, no tools and a 120-second timeout (including possible cold
  grammar compilation). A compatible schema projection removes unsupported
  provider grammar keywords and replaces behavior conditionals with explicit
  alternatives; the canonical full schema remains authoritative locally.
- `normalizeSceneSpec` accepts only finite numeric values of the correct types,
  clamps declared numeric ranges, scaled dimensions and transformed/animated
  world positions, and then invokes the strict validator. Never repair unknown
  fields, IDs, references, unsupported types, oversized payloads or array counts.
  Clamp cannot turn executable code or unsafe content into an allowed spec.
- Strict and structural validators are AJV standalone output, generated at build
  time from the canonical JSON schema. `pnpm check` checks the generated file is
  current. Regenerate with `pnpm exec tsx checks/generate-validator.ts`. The browser
  executes no dynamic validator compilation; CSP continues to disallow eval.
- Materialization covers all nine geometry recipes, all six behaviors, vetted
  emitter shaders and point/spot lights without shadows. Geometry is fitted to
  its declared local bounding box; workload estimates are tested against actual
  recipe triangles at every detail level. No textures, external assets or code
  come from model output. Revalidate in the browser and reserve shared resources
  before attaching anything. Dispose geometries, materials, particles, labels and
  reservations on removal. Module spawnSpec handles also count toward aggregate
  module quotas, in addition to shared world admission.
- Summons have a spawn burst when first visible, a requester credit in the shared
  label layout and a priority camera fly-to. !clear is accepted only from verified
  Twitch moderators/broadcaster and removes the last active summon. Sim JSON can
  never grant moderator privileges. No generated code runs in this lane.
- Fixture adapters are injected at startup with SIMULATION_MODE=fixture. Viewer
  `fixture`/`mode` fields never select a provider or binary. The sim adds three different existing viewers' fixture wishes at least 5.1 seconds
  apart; it does not bypass limits or need Bedrock credentials. There are four
  hand-written fixtures. `checks/summon-prompts.json` has 30 labeled prompt cases:
  12 allowed, 10 blocked/injection cases and eight invalid output fixtures.
- `/summon/ack` accepts a request-bound render receipt. The world sends it on the
  RAF after compositing a frustum-visible object and credit label; total latency
  is server receipt time minus accepted request time. Provider time is separate.
  `/api/summons/<id>` exposes bounded diagnostic status, validity and usage.
  Never log raw prompts, provider bodies, reasoning text, receipts or credentials.
- Append metrics to ignored `state/summon-metrics.jsonl`: mode, model/settings,
  validity, clamp flag, reason, provider time, request-to-screen latency and
  input/output/total/reasoning/cached token counts. Fixtures have explicit zero
  usage. Missing usage stays null. No visible receipt after 30 seconds records
  null screen latency; a late valid receipt can append the observed result.
- Failures produce a safe chat reply via Twitch sendChat, or a local on-screen
  reply for simulator traffic. Never echo raw provider errors. Cooldown refusal
  replies are coalesced per user to avoid flooding chat.
- Keep at most 24 active scenes, per-spec canonical caps, conservative server
  global headroom and a final client ledger check. `pnpm summon:bench` requires the
  key and a fresh running dev server; it opens Chromium and submits 20 live wishes
  sequentially through permitted `/sim/chat` with the live provider injected, respects the five-second
  global limit, and prints validity, provider/screen latency and token counts.
  Live measurements must be reported separately from synthetic fixture usage.

## Phase 5 rounds and stream overlay contract

- Normal rounds collect `!idea <text>` for **120 seconds**, vote with `!vote 1|2|3`
  for **45 seconds**, then review with the guard before a build with a **180-second hard deadline**. Empty rounds
  collect again. Top three rank by unique backers, then earliest idea. Normalize
  case/punctuation/stop words and conservatively merge near-identical wishes.
  One backed idea/user; a later idea moves that support. Preserve original credit.
- One vote/user; later votes replace earlier votes. Tied results choose the
  earliest original idea, regardless of candidate order. Server time owns all
  deadlines. Pause freezes the clock; verified moderator `!skip` advances a phase
  or cancels the current build. Roster capacity never prevents a round ballot.
- The build is now the Phase 7 runner described below. There is no timer-based
  stub ship. Only independent checks, Git promotion and a live activation receipt
  produce a ship; failure retains the known-good world and shows REVERTED.
- Up to 100 ideas, 5,000 backers/voters, eight displayed queue items (four visible),
  three candidates, 12 timeline entries (two visible), eight pending toasts (two
  visible). Publish bounded snapshots at most ten times/second only on state
  changes; the overlay computes countdowns locally from endsAt. SSE sends current state on reconnect. All user text is textContent.
- `/overlay` is a transparent 1920×1080 source. Panels stay in the side rails,
  preserving the center rectangle X=400..1520, Y=150..910. Columns are 360 px wide;
  panels fit content, the phase card is 120 px high, and empty/idle panels are hidden. Local system fonts,
  readable cream/teal type, reduced-motion support, no external assets. Use
  `/world?overlay=1` beneath it to hide the large world title and interaction hint.
- `POST /sim/round` starts a 15× rehearsal only with simulation permission and an empty,
  unpaused collection phase. It selects `ship|fail|timeout`; real durations remain
  120/45/180 seconds on the same logical clock and state machine. `pnpm sim`
  submits seven ideas and 13 ballots through `/sim/chat`, verifies four distinct
  ideas, three candidates, 12 voters [1,9,2] and the credited checked fixture result.
  `--round-only --outcome=fail|timeout` exercises other outcomes. Rehearsal mode is
  clearly labelled on stream, resets to normal speed on completion and needs no keys.
- `checks/overlay.smoke.ts` composites the actual sources in hardware-backed
  Chromium, drives a ship and a failure via `pnpm sim`, checks vote totals,
  attribution, transparency, clear center, late-viewer state and console errors,
  measures crowd FPS and saves screenshots to ignored `test-results/`.

## Phase 6 guard and command contract

- `server/guard/guard.schema.json` is the closed output contract: verdict
  accept/reject, a public reason (1..240 chars), title (1..40 chars), bounded build
  `spec` or null, and `files[]`. This is a **module build plan**, distinct from the
  Summon Scene Spec. Accepted plans have one module ID, a description <=600 chars,
  1..4 steps and checks <=160 chars each, estimatedSeconds 1..119, and 1..2 `.ts`
  paths under `world/modules/`. Rejections require null spec and no files.
- Validate every decision, cross-field condition, 8 KiB size cap, canonical module
  paths and symlink-free parents/files. Reject executable/remote plan syntax.
  Complexity/time is a bounded planning estimate, not proof of future build time;
  the runner enforces its own deadline and independent candidate gate.
- Chat is JSON-quoted untrusted data at the end of a fixed policy prompt. Never
  follow role tags, encoded instructions, moderator claims or requests to change
  safety policy. Reject networking, edits outside modules, real people/personal
  data, offensive content, games/brands and oversized systems. Require safe
  synchronous lifecycle hooks, ownership cleanup, instancing and frame budgets.
- Invoke an argv array with shell:false: `codex exec --sandbox read-only
  --ephemeral --json --output-schema <generated strict projection> -c
  model_reasoning_effort="low"`, with approval_policy=never, explicit Bedrock
  provider and the product model. `CODEX_BIN` selects the executable (default
  `codex`), never becomes part of the child's environment. The CLI is trusted
  installation/configuration, never chat-controlled.
- The child environment is freshly constructed from only PATH, HOME,
  AWS_BEARER_TOKEN_BEDROCK, plus required absolute CODEX_HOME in an isolated
  per-invocation .codex-runtime home under .codex-runtime/runs/.
  No Twitch/OpenAI credentials, ambient Codex settings or debug variables are
  inherited. Never log raw stdout, stderr, prompts, reasoning or credentials.
  Parse completed JSONL agent messages only after successful turn/exit; malformed
  output, tool events, failures or missing key fail closed with a public reason.
  Read-only is a filesystem policy, not a general arbitrary-code/secret sandbox.
- Hard-kill the process group at 45 seconds or cancellation. Bound combined
  stdout/stderr to 1 MiB. Validate final data again before passing the plan to the
  runner. A rejected review starts a new collection with a reason toast,
  creates no version and never starts the builder. Skip/shutdown cancel review;
  ignore stale completions. If paused, hold the result until resume; the process's
  real-time 45-second deadline still applies.
- Rehearsals use one explicitly approved hand-written guard fixture for the
  scripted lantern orchard, through the same validator. It is labelled FIXTURE;
  no real guard/provider call occurs. Missing live credentials never fall back.
- `server/guard/ideas.json` has 20 tricky cases (14 rejects, six accepts).
  Fake-CLI tests exercise prompt quoting, schema/path checks, environment/argv,
  timeout/descendant cleanup, cancellation and round gating. They verify plumbing,
  not live model policy accuracy. `pnpm guard:eval` runs all 20 sequentially through
  the real configured CLI/Bedrock when a key exists, reporting verdict/latency,
  expected matches and infrastructure errors; it exits before spawning if no key.
- Commands are chat events for modules but never citizen speech. The server
  clears spoken text for command messages and the browser independently suppresses
  command bubbles. Jump/dance/follow/home keep their physical animation; other
  admitted commands get a small pooled sparkle. Reduced motion suppresses the
  reaction animation. Pools and roster caps remain unchanged.

## Phase 7 runner and versions contract

- A guard-accepted plan enters `server/runner`. Start only on clean master. Create
  a detached worktree from its exact tip in a private per-run directory under
  os.tmpdir(), outside synced repository folders; never checkout, reset, stash, clean,
  amend or commit in the main checkout. Recheck clean state and unchanged master
  immediately before fast-forward-only promotion; create immutable vN tags.
  Build commits use `vN: <title> (requested by @user)`. Failed pre-promotion builds
  never alter master. Recovery/removal require a registered worktree with the
  repository-specific temporary prefix, canonical path and no symlink ancestors.
  Recorded legacy worktrees/vN paths may be recovered under the same checks.
- Run CODEX_BIN with `exec --sandbox workspace-write --json --ephemeral`, medium
  effort, explicit Bedrock model/provider, approval_policy=never and cwd=worktree.
  Only inherit PATH/HOME/AWS_BEARER_TOKEN_BEDROCK plus absolute dedicated CODEX_HOME
  under project `.codex-runtime/runs/` (outside the candidate tree). Seed its config
  from the canonical config, and clean it after close; never let CLI preferences
  change tracked configuration. The prompt embeds
  this file's World Module API/budgets and JSON-quoted guard plan. No dependency
  installation or Git operations by runtime Codex. No raw JSON/reasoning/commands,
  stderr or credentials are streamed/logged; readable bounded feed lines only.
  Require the approved entrypoint to be written before the final reply. Retain
  bounded redacted public summaries, readable events, command counts and usage
  under state/builds/ so a no-edit completion can report its explanation.
  The rendered builder self-check must run inside workspace-write without socket
  exceptions: policy and TypeScript only. The runner independently enforces those,
  resource admission and the candidate gate. Only explicitly classified candidate
  defects may retry; infrastructure failures and fixed preconditions may not.
- Enforce the 180 s build deadline with cancellation and process-group kill.
  Inspect every changed file, including ignored and untracked entries; reject
  paths outside the exact approved `world/modules/*.ts` list, symlinks, renames,
  deletions, executable/mode changes, changed builder HEAD and oversized sources.
  Inventory hashes are checked again after the candidate gate. Bundle only vetted
  Three imports and API types; reject ambient authority, top-level effects,
  asynchronous hooks and unchecked/dynamic capabilities. Type-check every approved
  source against the locked API. Static policy is conservative, not a JS sandbox.
- Run `checks/candidate.worker.ts` in an independent process with an external
  watchdog; kill both the worker and its separately tracked Chromium process group
  on freeze/cancellation. Probe the candidate's own geometry/spawnSpec pixels so an
  empty module cannot pass on island/crowd pixels. Shared Three.js is bundled
  locally once; modules load only by host-generated immutable SHA-256 asset URLs.
- Successful checks precede a worktree commit, fast-forward master and tag, then
  an engine-only same-origin module import. Initialize a fresh host before disposing
  the old host; failed initialization retains the old scene. A matching version
  receipt after eight stable update frames acknowledges activation; no page reload.
  A failed acknowledgement restores the old module tree with a new forward commit.
  A later disabled module reports a receipt-bound fault for automatic restoration.
- Persist immutable module bundles, version manifests, pending worktree recovery
  and per-run duration/input/output/total tokens under ignored state/. Missing
  usage is null; fixture usage is synthetic and labelled fixture. Announce ships
  and rollbacks through the existing chat adapter. Chat delivery failure does not
  undo a successful ship. Recover only the recorded owned worktree on restart.
- `!rollback` opens a 30 s `!vote yes|no` ballot while collection is idle. Later
  ballots replace earlier ones; a strict yes majority restores the prior tag's
  module content in a new forward commit/tag and swaps its checked artifacts.
  No votes or a tie keep the current version. No history reset or tag deletion.
- `pnpm runner:sim` snapshots tracked/non-ignored sources into a disposable Git
  repository, uses fake guard/builder CLIs and 10 scripted rounds, checks paths,
  exceptions, overruns, empty output, timeout, ships and rollback. It keeps one live
  browser page, verifies receipts and worktree cleanup, and checks original HEAD,
  status and source hashes. Results go to state/runner-sim-results.json.
- `pnpm runner:live` explicitly requests one real local round through the real guard
  and builder after a key exists. It opens a local viewer for activation receipts;
  the server's loopback-only endpoint advances only that empty round's voting
  timers. It is not an offline demo and intentionally commits/tags checked changes.

## World Module API v1

<!-- runtime-imports:start -->
Only these named imports from "three" are allowed: Mesh, Group, Object3D, Vector2, Vector3, Euler, Quaternion, Matrix4, Color, BoxGeometry, SphereGeometry, IcosahedronGeometry, CylinderGeometry, ConeGeometry, TorusGeometry, PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial, Points, PointsMaterial, BufferGeometry, BufferAttribute, Float32BufferAttribute, InstancedMesh. All other Three.js imports are rejected. Points buffers and module-owned instance capacity count toward the 512 particles/module cap; built-in citizen/cloud instances do not consume particle capacity. Allocate bounded buffers once in init, reuse in update, and dispose them.
Write one default-factory entrypoint in the approved world/modules/*.ts file, at most 65536 source bytes. No other edits, dependencies, Git, external URLs/assets or file/network access. Only API type imports plus the named Three.js imports above.
No any types. Bracket indices must be a numeric literal or identifier: arr[i * 3] fails; compute const j = i * 3 first, then arr[j]. Use dot properties for named fields.
All hooks synchronous: no async, await, promises, dynamic imports, timers, workers or animation loops.
Allocate geometry, materials, attributes and typed arrays once in init, never in update; reuse them and dispose owned resources.
Top level: imports, function/interface/type declarations, literal or function variables, and a default factory export only. No top-level calls, new objects, side effects, classes, enums or export declarations.
Forbidden identifiers: window, document, globalThis, self, global, process, require, fetch, XMLHttpRequest, WebSocket, Worker, navigator, location, eval, Function, setTimeout, setInterval, requestAnimationFrame, queueMicrotask, Promise, performance, Date, console, importScripts, Reflect, Proxy. Forbidden property names (including strings): constructor, __proto__, prototype, parent, onBeforeRender, onAfterRender, onBeforeCompile, addEventListener, removeEventListener.
Resource admission: module nodes=64, triangles=50000, draws=64, lights=4, particles=512; global nodes=1024, triangles=200000, draws=256, lights=8, particles=2048. The base world plus reserved summon pool (nodes=512, triangles=70000, draws=128, lights=6, particles=1024) and retained modules reduce available capacity; use the attached live resource context, not just the per-module maximum. Points count allocated vertices even with a small drawRange/index. InstancedMesh charges allocated instance capacity as particles and geometry triangles times capacity. Nodes and draw calls count too. Materials have no independent numeric cap; reuse a small shared set, material/group draws still count. No local lights are in the import allowlist.
Frame budget: 2 ms/module, 4 ms/all modules; dt <= 0.05 s; at most 8 active modules. Init/dispose <= 8 ms. 3 overruns in 60 frames disable the module. No per-frame allocations or nested roster scans.
Candidate gate: after 4 world warmup frames and 2 candidate warmup frames, measure 7 adjacent on/off pairs of 24 rendered-frame slices in a fixed main-plus-classic-resolution-shadow measurement pipeline (the same 0.25s simulation-time shadow refresh as live, plus scene/root changes) with a full citizen crowd, the same locked camera, chat and running hooks. The engine base uses fixed unlit/flat-shader proxies in cost slices; module geometry and materials stay native. Full-look probes restore every original material. Only your visual roots toggle; your real geometry and materials are retained. Each slice has at least 20 frames; waits use the shared world simulation clock. Visibility probes separately use the live look's complete post-processing chain from the production factory. Trim 5% scheduler outliers at each tail; median paired throughput may drop at most 20% versus hidden-root slices. Hook CPU p95 and render p95 are evidence only; the host enforces the hook budget. No errors, frozen or black output; 3 consecutive frames over 1000 ms are sustained collapse. External watchdog 45 s. Visibility: contribute >= 4096 contrasted 1920x1080 pixel-equivalents AND a >= 64x64px footprint in 2 of 3 probes, including the final probe. Contrast must change a color channel by >= 12/255 against the same scene without your module. Keep it visible immediately, above terrain and clear of trees; use strong contrast and margin above the minima. Do not move the camera merely to game visibility; command-driven focus must show the actual play result.
World scale: a citizen-sized player object is >= 1 world unit. Everyday props should be around 1-2 citizen sizes, not buildings. No prop may be taller than the tallest tree; the gate bounds your entire module world-space vertical extent to 6.72 units, including transformed geometry, particles and command results. The live host checks this bound at init and at least every 1 simulation second, disabling overgrown modules. Meet stream readability through count, contrast and motion rather than inflating props or hiding other modules.
Prefer the engine's CC0 model kit through spawnSpec for ordinary props. Named geometry kinds (detail 0 uses low LOD; 1-3 use high LOD), low/high triangles and low/high draws: lantern 820/1136t 5/5d; bench 200/630t 1/1d; crate 390/652t 3/3d; barrel 194/500t 1/1d; bridge-planks 288/900t 1/1d; plinth 286/498t 1/1d; campfire 223/697t 1/1d; bucket 472/709t 2/2d; pot 144/450t 1/1d; flowers 142/446t 1/1d; fern 143/449t 1/1d; grass 4/4t 2/2d; scanned-tree 507/1581t 4/4d; rock 76/240t 1/1d; moss-rock 144/452t 1/1d; shrub 159/499t 1/1d; log 198/620t 1/1d; ladder 1450/1450t 2/2d; chair 346/700t 1/1d; table 207/649t 1/1d. size is the fitted local bounding box; use modest citizen-relative sizes, tint with the referenced material color, and reuse geometry/material IDs. Named material presets: wood, weathered-wood, stone, brick, iron, brass, copper, gold, paper, glass, canvas, rope, foliage, water, ice, glow, painted. Set material.preset on primitive Scene Specs; model parts retain their scanned PBR maps and resolve native surfaces to the kit. For raw meshes, set material.name to a preset when useful; plain standard/basic/lambert/phong surfaces map to the nearest kit preset and smooth shading. Injected texture images are immutable engine data; do not read or close image/source internals. Custom shaders and particles are unchanged. Reuse materials and keep particle work bounded.
Chat-play readability: custom commands must have a useful no-argument action. For each command result, call services.camera.focus on the result or participating citizen; coalesce to one request per 1 s. Use duration 1.5 s (allowed 0.25..5), progress priority 1, and win priority 3 (allowed 0..3). Prioritize/coalesce winning focus over progress so the winning citizen's name tag stays visible; focus the citizen's position, not a raised marker or a large object's center. Player-owned racers/tokens must be at least 1 world unit in width and height, citizen-sized or larger, with contrasting player colors. Keep a visible win marker at least 1.2 units above the winning citizen's position for several seconds; leave their name tag unobstructed.
Make at least one win reachable by normal play within about 60 s with 10 players. Bound progress to <=6 valid commands/player; avoid rare-random-only wins. Citizens do not teleport or walk to a target just because a custom command was typed: use their reachable positions, advance visible progress per command, and test pickups against an accessible ground-plane region/outer edge rather than 3D distance to a raised building-sized center. Pool player objects and index by citizen ID. Preserve at most 4 explicit !command tokens in the spec. The gate sends 3 bursts from 10 synthetic citizens through the normal chat pipeline, tests onChat errors/budgets and camera focus, and includes post-command results in visibility probes.
Compliant particle indexing: const positions = new Float32Array(96 * 3); for (let i=0; i<96; i++) { const x=i*3, y=x+1, z=x+2; positions[x]=Math.cos(i)*2; positions[y]=4+(i%12)/3; positions[z]=Math.sin(i)*2; } const geometry=new BufferGeometry(); geometry.setAttribute("position",new Float32BufferAttribute(positions,3)); const cloud=new Points(geometry,new PointsMaterial({color:"#fff2aa",size:0.4})); services.scene.add(cloud); // inside init; update only reuses/rotates cloud; dispose geometry/material.
Run the provided locked self-check command, fix policy/type failures, and rerun before finishing. This sandbox-compatible command checks policy and TypeScript only; do not launch Chromium or try alternate commands. The runner independently repeats those checks, performs resource admission, and runs the relative-cost/visibility gate.
<!-- runtime-imports:end -->

The authoritative TypeScript interfaces are `world/engine/api.ts`. A module's
only imports are type imports from that API and optional vetted math/Three.js
imports; no top-level side effects. Default export: `() => WorldModule`. The host
creates a fresh instance for every activation. IDs are stable unique module IDs,
1–48 ASCII letters/digits/underscore/hyphen, starting with a letter.

```ts
interface WorldModule {
  readonly id: string;
  init(services: WorldServices): void;
  update(dt: number): void;
  onChat(event: Readonly<ChatEvent>): void;
  onCitizenSpawn(citizen: Citizen): void;
  onRaid(event: Readonly<RaidEvent>): void;
  dispose(): void;
}
```

Lifecycle: construct → init once → queued events and update each frame → dispose
once. All hooks are synchronous; no promises, timers, listeners, animation loops,
workers or unbounded recursion. `dt` is seconds, clamped to `[0, 0.05]`; pause
simulation for hidden tabs and reset the clock when resumed. Events arrive before
update in FIFO order. Chat strings are untrusted text; render through textContent,
never HTML. A module never receives tokens, sockets or server internals.

World services injected into init:

| Service | Signature and authority |
| --- | --- |
| `clock` | Optional read-only `now(): number`, monotonic milliseconds. Capture uses virtual elapsed time; hook CPU measurement remains real. |
| `scene` | A module-owned Three.js `Group`, not the engine root. Only attach/detach own objects; never traverse parents or alter engine state. |
| `citizens` | `get(id): Citizen | undefined`, `list(): readonly Citizen[]`. Frozen snapshots with id, displayName, color, position; no mutable roster. |
| `spawnSpec` | `(spec: SceneSpec): SpawnHandle`. Host validates again, reserves global resources atomically and records ownership; handle has `id` and idempotent `dispose()`. |
| `camera.focus` | `(position, {duration?, priority?}?): void`. Copy/clamp position to world bounds; duration 0.25–5 seconds, priority integer 0–3, coalesce to one request per module per second. |
| `effects` | `play('spawn' | 'portal' | 'sparkle', position): void`. Host-pooled effects, at most four requests/module/second, counted in world particle limits. |
| `log` | `(level: 'info' | 'warn' | 'error', message: string): void`. Truncate to 512 characters, at most ten records/module/second; no secrets or raw personal data. |

`ChatEvent`: id, userId, displayName, color, text, timestamp (Unix milliseconds).
`RaidEvent`: id, broadcasterId, broadcasterName, viewerCount (positive integer;
cap actual spawned citizens to available slots). Engine transports deduplicate IDs.
`Citizen.position` is a readonly Vector3 snapshot. Event callbacks may retain
snapshots, never references into engine-owned mutable objects.

`dispose` removes all module allocations, geometries, materials, instances,
particles and retained references. The host also tracks and force-cleans resources
if dispose throws; cleanup is idempotent. No module may dispose shared engine
resources. Hot swap initializes a candidate before detaching the previous module;
failed activation disposes the candidate and keeps the previous version active.

### Frame and allocation budgets

- Target 60 fps (16.67 ms frame); at most eight active modules. Each module gets
  **2 ms total per frame** across event hooks and update. All modules together get
  **4 ms per frame**. Measure with performance.now; stop scheduling remaining work
  when either budget is consumed. Dispatch at most 16 event callbacks/module/frame;
  bounded queue of 128 events/module, drop oldest with a rate-limited warning.
- A hook exception disables that module immediately. Three budget overruns in any
  rolling 60-frame window also disable it and schedule cleanup; the overlay shows
  the module ID and sanitized reason. Init/dispose each have an 8 ms measured
  allowance; init overrun rejects activation, dispose overrun is logged and cleaned.
- Timing checks are cooperative: JavaScript hooks cannot be preempted. An infinite
  loop can freeze the page. Static policy and headless watchdog checks are required
  before live activation; try/catch and CSP are not an arbitrary-code sandbox.
- No per-frame geometry/material creation, allocations proportional to chat volume,
  full-roster scans in nested loops, synchronous I/O, dynamic imports, eval,
  Function, fetch, sockets, DOM access or direct renderer/camera mutation. Reuse
  vectors and pools, use instancing, and index citizen lookups.
- A module gets at most 64 mesh nodes, 50,000 triangles, 64 draw calls, four local
  lights and 512 particles. Raw scene allocations count toward the same limits as
  spawnSpec. All modules, summons, effects and citizens share global admission
  caps: 1,024 mesh nodes, 200,000 triangles, 256 draw calls, eight local lights,
  2,048 particles and 300 citizens. The engine reserves headroom for its base world;
  reject an allocation atomically if capacity is unavailable. Dispose releases it.
- Candidate evaluation follows the rendered gate rules above. Chromium/SwiftShader
  uses a 1920×1080 viewport, reduced 160×90 framebuffer, fixed seed and 300 citizens.
  Interleave candidate visual roots on/off in the same window while hooks and chat
  continue. Judge median paired throughput; hook/render p95 remain evidence.
  Keep errors, frozen/black pixels, sustained collapse, visibility and scale checks.
- `?check=1` uses a fixed main-plus-classic-shadow cost pipeline over the real
  geometry and materials. Full-look visibility probes use the production composer
  factory, including GTAO, bloom and AA. No cached island, replacement materials
  or crowd proxies are substituted. Normal production allocates no probe targets.
- Hardware performance checks remain separate, measuring the full world/crowd.
  Static policy plus headless checks reduce risk; they do not prove arbitrary JS
  safe or preempt a delayed infinite loop in the live page.

## Scene Spec v1: data only

Canonical machine-readable schema: `server/summon/scene-spec.schema.json`, JSON
Schema draft 2020-12. `parseSceneSpec` enforces schema plus byte size, ID uniqueness, references, scaled
dimensions, transformed/animated bounds and workload limits. The browser independently revalidates and materializes atomically, including
allocation, triangle, transformed bounds and motion limits below.
Schema and TypeScript definitions must change together; update contract tests.
No code, shaders, external URLs, file paths, textures, scripts or arbitrary assets.
All object properties are closed; unknown fields are rejected, never stripped.
No nested scene graph; nodes reference shared geometries/materials by ID.

| Limit | Hard ceiling / range |
| --- | --- |
| UTF-8 JSON payload | 32,768 bytes before parse |
| Spec version and title | version exactly 1; name 1–80 characters, display as text |
| IDs | unique across all arrays; 1–48 characters, ASCII pattern in schema |
| Geometries / materials / mesh nodes | 32 / 16 / 64 per spec |
| Lights / emitters / behaviors | 4 / 4 / 32 per spec |
| Geometry size / detail / node scale | each axis 0.1–12; detail integer 0–3; scale each axis 0.1–8 |
| Scaled dimensions | each geometry size × corresponding node scale <=24 units |
| Positions | X/Z in [-64,64], Y in [-8,48] |
| Rotations | radians in [-π,π], schema tolerance 3.141593 |
| Material | hex RGB only; opacity 0.25–1; emission 0–2; roughness/metalness 0–1 |
| Local lights | point/spot only; intensity 0–3, distance 0.1–32; no shadows |
| Particles | <=128/emitter, <=512/spec; rate <=32/s; lifetime 0.1–8 s; size 0.01–0.5 |
| Behaviors | float, orbit, wander, pulse, follow-citizen, flee only; speed 0–3, amplitude 0–8, radius 0–12 |
| Citizen targets | follow-citizen/flee require citizenId; other behaviors forbid it |
| Geometry workload | <=50,000 triangles and <=64 draw calls/spec, computed before allocation |

Geometry kinds box/sphere/cylinder/cone/torus/plane are primitives;
crystal/mushroom/tree are vetted procedural implementations. Additional closed
model kinds and optional material presets come from `world/shared/model-kit.json`
and `world/shared/material-kit.ts`, rendered into the builder rules above. Model
detail 0 uses the low LOD; 1-3 use the high LOD. Admission counts the actual
transformed glTF primitives, including every material group. Kit scenes must stay
inside the tree-height envelope; classic substitutes bounded procedural geometry.
Runtime modules may not load assets directly or mutate injected texture sources.
Detail selects fixed
bounded recipes, never arbitrary subdivisions. Geometry size is its local bounding
box. Check transformed bounds (including rotation, lights and particles) against
world bounds before allocation and clamp behavior motion so bounds stay valid on
every update. Materializer rejects unsupported or over-budget recipes; the schema
alone cannot calculate triangulation or rotated extents. Behavior targetId must
reference a mesh node; geometryId/materialId must reference their respective arrays.
If a citizen disappears, follow/flee idles until it exists again. No entity nesting,
remote lookup or executable extension fields. Server validates before broadcast;
client independently revalidates before atomic materialization. Viewer attribution
is server-owned metadata, never trusted from model output.

Full JSON schema (keep identical to the canonical file):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:chat-builds-a-world:scene-spec:v1",
  "title": "Scene Spec v1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "version",
    "name",
    "geometries",
    "materials",
    "nodes",
    "lights",
    "emitters",
    "behaviors"
  ],
  "properties": {
    "version": {
      "const": 1
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "geometries": {
      "type": "array",
      "minItems": 1,
      "maxItems": 32,
      "items": {
        "$ref": "#/$defs/geometry"
      }
    },
    "materials": {
      "type": "array",
      "minItems": 1,
      "maxItems": 16,
      "items": {
        "$ref": "#/$defs/material"
      }
    },
    "nodes": {
      "type": "array",
      "minItems": 1,
      "maxItems": 64,
      "items": {
        "$ref": "#/$defs/node"
      }
    },
    "lights": {
      "type": "array",
      "minItems": 0,
      "maxItems": 4,
      "items": {
        "$ref": "#/$defs/light"
      }
    },
    "emitters": {
      "type": "array",
      "minItems": 0,
      "maxItems": 4,
      "items": {
        "$ref": "#/$defs/emitter"
      }
    },
    "behaviors": {
      "type": "array",
      "minItems": 0,
      "maxItems": 32,
      "items": {
        "$ref": "#/$defs/behavior"
      }
    }
  },
  "$defs": {
    "id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 48,
      "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$"
    },
    "position": {
      "type": "array",
      "minItems": 3,
      "maxItems": 3,
      "items": {
        "type": "number",
        "minimum": -64,
        "maximum": 64
      }
    },
    "geometry": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "size",
        "detail"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/id"
        },
        "kind": {
          "enum": [
            "box",
            "sphere",
            "cylinder",
            "cone",
            "torus",
            "plane",
            "crystal",
            "mushroom",
            "tree",
            "lantern",
            "bench",
            "crate",
            "barrel",
            "bridge-planks",
            "plinth",
            "campfire",
            "bucket",
            "pot",
            "flowers",
            "fern",
            "grass",
            "scanned-tree",
            "rock",
            "moss-rock",
            "shrub",
            "log",
            "ladder",
            "chair",
            "table"
          ]
        },
        "size": {
          "type": "array",
          "minItems": 3,
          "maxItems": 3,
          "items": {
            "type": "number",
            "minimum": 0.1,
            "maximum": 12
          }
        },
        "detail": {
          "type": "integer",
          "minimum": 0,
          "maximum": 3
        }
      }
    },
    "material": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "color",
        "emissive",
        "emissiveIntensity",
        "roughness",
        "metalness",
        "opacity"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/id"
        },
        "color": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}$"
        },
        "emissive": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}$"
        },
        "emissiveIntensity": {
          "type": "number",
          "minimum": 0,
          "maximum": 2
        },
        "roughness": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "metalness": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "opacity": {
          "type": "number",
          "minimum": 0.25,
          "maximum": 1
        },
        "preset": {
          "enum": [
            "wood",
            "weathered-wood",
            "stone",
            "brick",
            "iron",
            "brass",
            "copper",
            "gold",
            "paper",
            "glass",
            "canvas",
            "rope",
            "foliage",
            "water",
            "ice",
            "glow",
            "painted"
          ]
        }
      }
    },
    "node": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "geometryId",
        "materialId",
        "position",
        "rotation",
        "scale"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/id"
        },
        "geometryId": {
          "$ref": "#/$defs/id"
        },
        "materialId": {
          "$ref": "#/$defs/id"
        },
        "position": {
          "$ref": "#/$defs/position"
        },
        "rotation": {
          "type": "array",
          "minItems": 3,
          "maxItems": 3,
          "items": {
            "type": "number",
            "minimum": -3.141593,
            "maximum": 3.141593
          }
        },
        "scale": {
          "type": "array",
          "minItems": 3,
          "maxItems": 3,
          "items": {
            "type": "number",
            "minimum": 0.1,
            "maximum": 8
          }
        }
      }
    },
    "light": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "color",
        "intensity",
        "distance",
        "position"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/id"
        },
        "kind": {
          "enum": [
            "point",
            "spot"
          ]
        },
        "color": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}$"
        },
        "intensity": {
          "type": "number",
          "minimum": 0,
          "maximum": 3
        },
        "distance": {
          "type": "number",
          "minimum": 0.1,
          "maximum": 32
        },
        "position": {
          "$ref": "#/$defs/position"
        }
      }
    },
    "emitter": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "position",
        "color",
        "maxParticles",
        "rate",
        "lifetime",
        "size"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/id"
        },
        "kind": {
          "enum": [
            "sparkle",
            "mist",
            "fireflies"
          ]
        },
        "position": {
          "$ref": "#/$defs/position"
        },
        "color": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}$"
        },
        "maxParticles": {
          "type": "integer",
          "minimum": 1,
          "maximum": 128
        },
        "rate": {
          "type": "number",
          "minimum": 0,
          "maximum": 32
        },
        "lifetime": {
          "type": "number",
          "minimum": 0.1,
          "maximum": 8
        },
        "size": {
          "type": "number",
          "minimum": 0.01,
          "maximum": 0.5
        }
      }
    },
    "behavior": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "targetId",
        "speed",
        "amplitude",
        "radius"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/id"
        },
        "kind": {
          "enum": [
            "float",
            "orbit",
            "wander",
            "pulse",
            "follow-citizen",
            "flee"
          ]
        },
        "targetId": {
          "$ref": "#/$defs/id"
        },
        "speed": {
          "type": "number",
          "minimum": 0,
          "maximum": 3
        },
        "amplitude": {
          "type": "number",
          "minimum": 0,
          "maximum": 8
        },
        "radius": {
          "type": "number",
          "minimum": 0,
          "maximum": 12
        },
        "citizenId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64,
          "pattern": "^[a-zA-Z0-9_-]+$"
        }
      },
      "allOf": [
        {
          "if": {
            "properties": {
              "kind": {
                "enum": [
                  "follow-citizen",
                  "flee"
                ]
              }
            }
          },
          "then": {
            "required": [
              "citizenId"
            ],
            "properties": {
              "citizenId": {}
            }
          },
          "else": {
            "not": {
              "required": [
                "citizenId"
              ],
              "properties": {
                "citizenId": {}
              }
            }
          }
        }
      ]
    }
  }
}
```

## Runtime safety rules

- Fast lane executes data only, behind moderation, a blocklist, Twitch AutoMod,
  per-user cooldown and a global rate limit. Mod commands: `!pause`, `!skip`,
  `!clear` (remove the latest summon); authorize them using server-verified roles.
- Guard treats chat/proposals as quoted untrusted data. Reject networking, files
  outside modules, real people, personal data, offensive content, copyrighted
  games/brands and requests to alter the safety rules.
- Runtime builder can change only `world/modules/**`. Reject any diff elsewhere,
  including renames/deletions, symlinks and untracked files; resolve canonical paths
  and reject path escapes. Never let runtime edits alter engine, checks, configs,
  prompts, dependency files or this contract. Never install runtime dependencies.
- Builder runs in a fresh worktree, workspace-write sandbox, medium effort; guard
  uses read-only sandbox, low effort and JSON schema output. Construct an explicit
  minimal environment: only the Bedrock credential, dedicated CODEX_HOME and
  necessary allowlisted execution variables. Never inherit Twitch credentials.
  Do not log credentials. Twitch and Bedrock are optional external integrations. The Phase 6 guard runs a
  read-only Codex subprocess through Bedrock; the builder runs only for an accepted plan.
- Module host wraps each hook, budgets scheduling and auto-disables on failures.
  Require isolated headless checks before merge/tag, and retain the previous known
  good version for reversion. Serialize activation and persist recovery state.
- `/world` CSP starts with `default-src 'self'`; scripts/styles/assets are bundled
  locally, `connect-src 'self' blob:` for same-origin APIs, the event stream and
  embedded glTF image decoding. `wasm-unsafe-eval` permits the locked meshopt
  decoder; JavaScript eval, inline scripts, external origins and module networking
  remain forbidden.
  Twitch and token handling remain server-only. CSP does not grant module trust.
- `state/`, `.env`, `worktrees/` and node_modules are ignored. Only config.toml
  under `.codex-runtime/` is tracked. Never commit secrets or runtime credentials.
- Chat commands only; no Twitch Extensions, Affiliate Polls/Predictions or channel
  points. No third-party logos, unlicensed fonts or copyrighted audio.

## Phase 7 admission and execution guarantees

- `world/shared/limits.ts` is the shared server/browser budget contract. Summon
  admission reserves one count slot before a paid call, including in-flight work,
  then commits actual validated usage synchronously through ResourceLedger or
  releases the slot. Committed summons are evicted FIFO only as count or actual
  resource limits require. The client gives modules their own pool from
  remaining world headroom; they cannot consume the Summon pool.
- Provider schemas use the strict grammar subset; full canonical validation still
  checks uniqueness, references and bounds locally. Guard and builder errors are
  surfaced with protected environment values redacted; warning events are nonfatal.
- Runtime operations serialize. Automatic reversion aborts an active build, awaits
  its child and worktree cleanup, then restores. Metrics cannot affect ship outcome.
- Provider/builder/reviewer adapters are selected at startup. Viewer data never
  chooses a fake binary or rewrites an approved plan. All simulation/admin routes
  require simulation permission. Rate admission precedes every chat lane; rejection
  replies share per-user/global limits. Lane access is independent of citizen slots.
- The first connected world browser is the primary render reporter (overlays are
  excluded). Only primary receipts/faults affect shared state; disconnect promotes
  the next world. Render timeout is an observation metric; scenes remain FIFO-evictable.
- Production allocates no check-only cache or probe targets. Static shadows refresh
  on world allocation changes, citizens share one indexed instanced geometry,
  immutable garden meshes are baked once, and module trees audit on mutation or
  once per second. Frozen citizen lists are shared within a frame.

## Phase 7 verification corrections

- Runtime Codex is foreground (`--no-daemon`) with strict config and supported
  feature controls disabling plugin sync/prefetch, remote plugins, apps, hooks and
  skill dependency installation, plus skipped host skill discovery. Own and drain
  its complete process group even after successful exit. A late cleanup writer
  must never replace a verdict with an exception. Delete once after draining; warn
  redacted on failure. One memoized startup sweep removes homes with dead owning
  PIDs. Never delete a live invocation's home. Discovery controls are pinned in argv even without config; read config once per
  invocation. Generic process code has no Codex-home policy.
- The gate measures actual RAF frame intervals, not Playwright polling gaps. Its
  check-only trace records timestamps and CPU/render/probe work. Visibility probes
  stay outside timing slices. Isolated scheduler gaps are diagnostics; retain source,
  incremental evidence, result and a responsive screenshot under ignored state/checks/.
- Visibility uses paired normal HDR renders with/without candidate ownership,
  retaining world occlusion. A ship needs at least 4096 contrasted full-HD
  pixel-equivalents spanning at least 64x64px in two of three observations,
  including the last. Distinguish raw 192x108 probe pixels from HD equivalents.
  Aim builder geometry at a clear 96x96px silhouette. The runner benchmark freezes
  its own Chromium page and polls world/round state outside the page, then
  resumes for hot swap. Keep this orchestration out of the production renderer.

## Chat reaction contract

Only already-moderated chat may charge reactions. Match whole tokens with the
catalog aliases in `server/reactions/catalog.ts`; commands never charge meters.
Keep thresholds, windows and cooldowns named in `server/reactions/index.ts`.
There is at most one playing clip and one queued clip. A vote winner may replace
a queued chat clip; it does not interrupt playback or duplicate an active clip.
Reaction votes use `!react`, never `!vote`, and defer/cancel during idea or rollback
voting. Moderator pause freezes the reaction clock and browser playback.
Checkpoint the source state and validate it at the existing checkpoint boundary.

Clips are prerendered original Blender artwork, not generated video or emote
reproductions. Participation meters show actual distinct viewers, not rendering
progress. Keep transparent first/last frames, silent VP9 alpha WebMs, same-origin
media/CSP, and the runner's existing asset size limit. The `/capture` page stacks
the unmodified world and overlay; it supplies the normal live world connection.
Blender and ffmpeg must remain optional offline tools, outside `pnpm check`.

## Working agreements

Keep scaffolding at the repository root. Implement tiers in order and document
which guarantees are actually enforced. Run `pnpm check` for meaningful changes;
verify `/world` with `pnpm dev`. Keep README instructions reproducible from a fresh
clone and include the safety model. API keys are not needed for scaffold checks.
The external product brief is read-only, outside this repository: never edit or
copy it into the repo. This file is the implementation contract, not a brief copy.

## Phase 8 raids and playback

- Seat admission lives on CitizenRoster and is shared by chat and raids:
  desired=min(viewers,RAID_CAP=150), free slots first, then oldest citizens quiet
  for at least QUIET_MS=180000. Never evict anyone active within three minutes or
  exceed 300 citizens. Raiders have normal activity/fade/expiry, source-labelled
  names and generic entry {from,at,delay}; they are eligible after QUIET_MS.
- Both live EventSub and `/sim/eventsub` use `incomingRaid`; the simulator accepts
  only incoming raid notifications, never forged chat authority. Local simulator
  routes require SIMULATION_ALLOWED=1 when Twitch is configured. Real Gate D is
  performed by Arjun from a second account.
- The portal is one pooled base-world ring/swirl with no local lights. Its burst
  uses the shared 96-particle effects pool. Repeated raids retarget it; a single
  born/waiting delay staggers generic citizen entry (no second renderer queue).
  Recent arrival snapshots preserve its original age after reconnect.
- `/history` consumes healthy immutable version bundles in ascending order, with
  public title/requester credits. Playback is isolated from live transport,
  primary-world selection, receipts and fault/reversion endpoints. Keep the empty
  state honest; never fabricate shipped history for an empty checkout.


## Persistence rules

- Persist versioned private source state atomically. Never persist credentials in
  world checkpoints or derived views/indexes. Rebuild indexes when loading.
- Bound the maximum wait for dirty state; flush phase changes and confirmed
  receipts as required. Read-only requests and idle processes must not write.
  Validate the whole checkpoint before restoration; preserve rejected files aside.
- Never replay interrupted provider calls automatically. Verify orphan ownership
  before killing a process; leave unrelated user commits and files untouched.
- Serialize runtime work through one server owner and its operation queue. Tag a
  checked candidate before fast-forwarding master; restore through forward commits.
  Recovery must remove a reserved version tag if master never reached it.
- Keep implementation notes and completed measurements in docs/, rather than
  describing a pending integration or measurement as complete in this contract.
