# Gate C second follow-up

## Implementation

| Request | Status | Evidence |
| --- | --- | --- |
| 1. Enforced rules in the prompt | Done | Shared policy descriptors and denied-name lists, resource constants, ModuleHost budgets, visibility constants and candidate thresholds render one block into the builder prompt and AGENTS.md. The drift check runs in pnpm check. |
| 2. Builder self-check | Done | The generated command runs the locked static policy, API TypeScript compilation and shared resource admission. The runner independently calls the same function. CLI/function agreement, world reservation and retained allocation tests pass. |
| 3. One repair | Done | Same worktree and original deadline; exact redacted reason; independent checks repeated; overlay Retry 2/2; metrics attempts, firstReason and summed usage. Fake-CLI tests and a real candidate-gate smoke pass. |
| Live Bedrock retries | Skipped | Explicitly reserved for the user. Verification used offline providers and fake Codex binaries. |

The typing rule now gives the actual syntax restriction: a bracket index must be
a numeric literal or identifier. Compute `const j = i * 3` before `array[j]`.
The source also supplies forbidden identifiers/properties, synchronous and
top-level rules, allocation limits, frame budgets and the unchanged visibility
and FPS criteria. The example shows bounded Points with compliant buffer indexing.
Raw materials have no independent numeric cap; the prompt states that explicitly,
with shared materials and their draw-call costs. Light imports remain forbidden.

The primary world's snapshot handshake reports its allocated base reservation.
The resource context combines that with the reserved summon pool and measured
retained-module allocations. In the real retry smoke the base was 114,088
triangles; after its reservation and the summon pool, the module pool had 15,912
triangles, despite the larger individual module ceiling. Instance capacity
multiplies geometry triangles and also charges particles. Small draw ranges or
active instance counts do not hide allocation capacity. The prompt carries actual
pool/retained/available counts. Unknown base usage is labelled explicitly; the
browser gate remains authoritative.

The self-check uses a bounded, credential-free child. Generated code is instantiated
in an isolated Chromium page under same-origin CSP with WebGL disabled, rather
than being executed in Node. It uses the real ModuleHost, ResourceOwner,
ResourceLedger and Scene Spec accounting, with bounded simulated updates. It
creates no renderer and performs no FPS or visibility sampling. The builder can
run it from its worktree; the command and manifest live outside the editable tree.
The runner retains its original inventory and independently repeats all checks.

A second builder invocation is allowed only for policy, typing, resource or
candidate-gate rejection, with time reserved for independent checks under the
original deadline. Guard rejection, unsafe/outside edits, no changes, CLI failure,
timeout and cancellation do not retry. Both attempts failing retains the final
reason and does not promote. No resource or candidate threshold was lowered;
the measured and rolling-average FPS floors remain 40.

## Completed verification

Source `pnpm check`: **200/200**, strict TypeScript, generated-contract checks and
browser bundling passed. Tests cover policy/type/resource parity, base/retained
budgeting, primary-only telemetry without disk writes, repair then ship, both
attempts failing, and no retries for guard rejection, outside diffs or checker
timeouts.

`pnpm exec tsx checks/runner-retry.smoke.ts` exercised both real candidate gates
and the live activation receipt with a fake builder in a private clone:

| Measurement | Result |
| --- | --- |
| First attempt | Rejected visibility, best 0 pixel-equivalents |
| Repair | Larger visual using an unlit material; same worktree |
| Final outcome | SHIPPED v1, 2 attempts, one promotion |
| Duration | 49.42 s |
| Candidate FPS / rolling average | 45.25 / 44.72 |
| Visibility | 25,400 pixel-equivalents, 200x180px, 3 qualifying probes |
| Representative citizens | 300 |
| Reloads / errors | 0 / 0 |
| Registered worktrees after cleanup | 1 |
| Synthetic token totals | 200 input, 400 output, 600 total across attempts |

Artifacts: state/runner-retry-smoke.json and state/runner-retry-smoke.log.
Tests ran on Apple M1 Pro, Node 25.1.0 and pnpm 9.10.0.

## Verification failures retained

The first fresh-clone README run at b4e0c75 hit the unchanged 24-second candidate
watchdog. Evidence showed two qualifying visibility probes and rendered frames,
but startup/warmup left insufficient time to finish sampling. It correctly did not
retry a timeout. Evidence is in state/gatec2-first-walkthrough.json and
state/gatec2-initial-gate-timeout.json.

The first extra real-gate retry smoke exercised both attempts, then reverted its
lit-material repair at 39.5 measured FPS (rolling average 42.9). That rejection is
preserved in state/runner-retry-initial.json. The final fixture repairs with a
cheaper unlit material and passed as recorded above. The FPS floor stayed unchanged.

## Fresh-clone README walkthrough

The repeated run completed from a fresh clone of **559d8f4**, with a real install,
no copied credentials, and the world page open before pnpm sim. All commands passed:

| Command | Result | Duration |
| --- | --- | ---: |
| `git clone --no-hardlinks <source> <temporary clone>` | Clean clone | 0.46 s |
| `pnpm install --frozen-lockfile` | Installed | 1.11 s |
| `pnpm exec playwright install chromium` | Ready | 1.07 s |
| `pnpm check` | All tests, types and browser bundles passed | 32.05 s |
| `SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev` | Ready; later stopped cleanly | n/a |
| `pnpm sim` | Shipped v1 Lantern orchard for Comet04; 184 events, 104 citizens, three summons, votes [1,9,2], zero reloads | 52.53 s |
| `pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png` | 150 admitted, 254 total, 60.04 FPS | 19.55 s |
| `cp .env.example .env` | Empty assignments parse; no credentials | 0.01 s |

World FPS after the demo was 59.97 on ANGLE Metal at 1920x1080. The overlay was
transparent. History showed No versions yet before the sim and played v1 afterward.
Read-only polling caused no checkpoint writes. Browser errors: zero. Both the
walkthrough clone and the retry-smoke clone/servers were cleaned up.

Results/screenshots: state/gatec2-readme.json, state/gatec2-readme-walkthrough.log,
state/gatec2-demo.png, state/gatec2-demo-raid.png and state/gatec2-history.png.
The successful repeat does not erase the initial watchdog or FPS failures recorded
above; those acceptance boundaries remain enforced. No live Bedrock rounds ran.

## Commits

- 4266ace: shared rules rendered from enforcement sources
- 175b3fc: locked self-check and live resource context
- b4e0c75: one repair inside the original deadline
- 559d8f4: real candidate-gate repair smoke
