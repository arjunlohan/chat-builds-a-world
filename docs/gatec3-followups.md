# Gate C builder-path corrections

## Disposition

| Request | Status | Root correction |
| --- | --- | --- |
| 1. Sandbox self-check | Done | Both launch sites use single-process node --import. The rendered builder command checks policy and TypeScript only; resource/browser admission stays with the runner. Exact command tested inside the native workspace sandbox, without a model. |
| 2. Verdict lost in cleanup | Done | A validated terminal line received before the deadline is authoritative. Checker and browser process groups are killed immediately; slow graceful cleanup cannot replace the verdict. |
| 3. Particle capacity | Done | Only module-owned instances charge particles. Built-in citizens/clouds keep their geometry reservation but do not consume module particle capacity. Full-cap admission test passes. |
| 4. Unknown base reservation | Done | Validated base usage persists in versions.json. Builds refuse to start until one is known. Standalone probes still reserve SUMMON_POOL when base data is absent. |
| 5. Retry classification | Done | Fixed active-module capacity checked before a worktree or builder starts. Gates return typed candidate/infrastructure/precondition verdicts; repairs require explicit candidate opt-in. |
| Optional emitter parity | Done | Emitters count as nodes in server usage; parity tests compare all geometry recipes with and without an emitter against the materializer's independent ledger. |
| Optional shared launch helper | Done | Candidate and resource checks share jsonWorker, including TypeScript loading, browser PID ownership, terminal verdict handling and bounded cleanup. |
| Live Bedrock rounds | Skipped | Explicit user instruction. No live provider calls were made. |

All numeric limits remain unchanged, including the 40 FPS floors, visibility
criteria, particle caps, frame budgets and 24-second candidate watchdog.

## Source evidence and sandbox proof

The retained gatec3 build summaries reported blocked tsx IPC sockets in all five
builds. The rain evidence at state/checks/4618088d-b51b-4e41-976d-bdcdba4d1cdd
had status passed while its runner metric reported the checker timeout. These
records were inspected read-only in the user's verification clone.

The native CLI's sandbox helper was used to run the exact rendered self-check:

```text
codex sandbox -P :workspace -C <candidate> -- /bin/sh -c <rendered command>
```

The rendered command uses `node --import <absolute tsx loader> <locked self-check>
<manifest> --static-only`. It exits successfully with:

```json
{"ok":true,"checks":["policy","types"],"resources":"runner-only"}
```

No socket exceptions, network access, additional writable roots or model calls
were added. The full resource command still fails in this sandbox, so the builder
is explicitly told to leave that stage to the runner rather than trying alternate
launches. Evidence: state/gatec3-sandbox.json. The sandbox test runs on macOS when
the local CLI is installed; the credential-free check suite remains usable without it.
See the official [sandbox helper reference](https://learn.chatgpt.com/docs/cli/reference#codex-sandbox)
and [built-in permission profiles](https://learn.chatgpt.com/docs/permissions).

## Automated checks

`pnpm check`: **208/208**, strict TypeScript, generated-rule checks and browser
bundles passed in the source checkout and fresh clone. No tests were skipped on
this machine. Hardware: Apple M1 Pro, Node 25.1.0, pnpm 9.10.0.

- A worker prints a final verdict and then blocks indefinitely in cleanup. Both
  passing and failing verdicts are retained, and the worker is killed before its
  timeout. Missing and late verdicts remain infrastructure failures.
- An otherwise empty world admits MODULE_CAP.particles with base citizen/cloud
  instances and the actual built-in particle pools. Oversized module instances
  remain rejected; geometry, draw and global particle accounting still apply.
- The renderer in the fresh clone reported 216 base particles, leaving 808 after
  the summon reserve, enough for one full 512-particle module. Actual base report:
  state/gatec3-budget.json.
- Persisted base reservations survive restart. Unknown reservations stop before
  a worktree or builder invocation; invalid reports do not overwrite known facts.
- The active-module cap refuses a new module before builder execution while an
  existing ID can still be replaced. Infrastructure and unclassified checker
  failures get no repair attempt. Candidate policy/type/resource defects retain
  their explicit repair classification.

## Fresh-clone README demonstration

The walkthrough ran in a fresh clone of **b599998**, with no copied credentials
and the world page open before pnpm sim. All commands and browser checks passed:

| Command | Result | Duration |
| --- | --- | ---: |
| `git clone --no-hardlinks <source> <temporary clone>` | Clean clone | 0.52 s |
| `pnpm install --frozen-lockfile` | Installed | 1.01 s |
| `pnpm exec playwright install chromium` | Ready | 1.06 s |
| `pnpm check` | All tests, types and bundles passed | 35.17 s |
| `SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev` | Ready; stopped cleanly afterward | n/a |
| `pnpm sim` | Shipped v1 Lantern orchard for Comet04; 184 events, 104 citizens, three summons, votes [1,9,2], zero reloads | 52.04 s |
| `pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png` | 150 admitted; 254 total; 59.99 FPS | 19.28 s |
| `cp .env.example .env` | Empty assignments parse; no credentials | 0.01 s |

World FPS after the demo was 59.97 at 1920x1080 on ANGLE Metal. The overlay was
transparent. History showed No versions yet before the sim and played v1 afterward.
Idle API polling caused no checkpoint writes. Browser errors: zero. Temporary
clones and servers were cleaned up. No regression was observed in this run.

Ignored evidence: state/gatec3-readme.json, state/gatec3-readme-walkthrough.log,
state/gatec3-demo.png, state/gatec3-demo-raid.png and state/gatec3-history.png.

## Commits

- c5a277a: sandbox-compatible self-check
- a11d8e9: terminal verdict ownership and shared worker launcher
- 2706a3a: module particle ownership and emitter parity
- d41a200: persisted, validated base reservations
- b599998: typed retry opt-in and fixed preconditions
