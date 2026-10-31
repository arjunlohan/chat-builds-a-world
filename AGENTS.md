# Chat Builds a World — engineering contract

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

Phase 2 provides the procedural world, cinematic camera, bounded module host,
frame diagnostics and offline fixtures. Citizens, Twitch, Bedrock, spec
materialization and runtime Codex calls remain disabled. No API keys are needed.
Do not present stub success as a completed integration.

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
`pnpm dev` serves local pages, `pnpm sim` emits deterministic offline chat/raid
fixtures, and `pnpm check` type-checks all stubs, tests the data contract and
bundles browser entrypoints. Restart dev after browser-source changes.
No external CDN, fonts, logos, audio or browser network calls.

- `server/twitch/`: EventSub, reconnect/dedup, tokens, moderation commands.
- `server/citizens/`: authoritative roster, activity/expiry and command routing.
- `server/summon/`: provider adapter, moderation/rate limits, schema and validator.
- `server/rounds/`: proposals, top-three votes and rollback votes.
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
is `medium`; use `codex exec` and `CODEX_HOME=.codex-runtime`. Availability,
configuration and latency will be verified when the integration is built.
`.env.example` contains names only; do not add example values or credentials.

## World Module API v1

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
- Headless candidate gate (later phase): Chromium/SwiftShader at 1920×1080, fixed
  seed and representative 300-citizen load for 15 seconds after warmup; reject
  runtime errors, median fps below 50, a frame gap above 1 second, frozen canvas
  or black frames. Use an external process timeout to catch page freezes. The
  Phase 2 smoke verifies day/night rendering and animation only; it is not the
  candidate gate. `checks/world.performance.ts` separately measures the empty
  world for 15 seconds on an identified physical GPU.

## Scene Spec v1: data only

Canonical machine-readable schema: `server/summon/scene-spec.schema.json`, JSON
Schema draft 2020-12. `parseSceneSpec` enforces schema plus byte size, ID uniqueness,
references, Y bounds and scaled dimensions. Client materializer is still a stub;
future implementations must enforce allocation/triangle/motion limits below.
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
crystal/mushroom/tree are vetted procedural implementations. Detail selects fixed
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
            "tree"
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
  Do not log credentials. No provider calls or runtime Codex subprocesses exist yet.
- Module host wraps each hook, budgets scheduling and auto-disables on failures.
  Require isolated headless checks before merge/tag, and retain the previous known
  good version for reversion. Serialize activation and persist recovery state.
- `/world` CSP starts with `default-src 'self'`; scripts/styles/assets are bundled
  locally, `connect-src 'none'`, no eval/inline scripts or network APIs. A future
  transport change needs a narrow reviewed same-origin exception, never blanket
  external access. CSP does not grant module trust.
- `state/`, `.env`, `worktrees/` and node_modules are ignored. Only config.toml
  under `.codex-runtime/` is tracked. Never commit secrets or runtime credentials.
- Chat commands only; no Twitch Extensions, Affiliate Polls/Predictions or channel
  points. No third-party logos, unlicensed fonts or copyrighted audio.

## Working agreements

Keep scaffolding at the repository root. Implement tiers in order and document
which guarantees are actually enforced. Run `pnpm check` for meaningful changes;
verify `/world` with `pnpm dev`. Keep README instructions reproducible from a fresh
clone and include the safety model. API keys are not needed for scaffold checks.
The external product brief is read-only, outside this repository: never edit or
copy it into the repo. This file is the implementation contract, not a brief copy.
