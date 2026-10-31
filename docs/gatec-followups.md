# Gate C follow-up verification

## Findings and changes

The fireflies/petals failures exposed an undocumented import allowlist. The policy
used a fixed set while both runtime prompts said only "vetted" imports. The
canonical list now lives in server/runner/imports.ts and drives policy, guard and
builder prompts, and the generated AGENTS.md block. pnpm check rejects a stale
block. Points, PointsMaterial, BufferGeometry, BufferAttribute,
Float32BufferAttribute and InstancedMesh are allowed. Renderer, shader, network,
DOM and other denied capabilities remain rejected.

Raw Points reserve their position-buffer capacity even with a tiny index/draw
range. InstancedMesh reserves allocated instance capacity as particles and
multiplies geometry triangles by that capacity, even if its active count is lower.
Both charge nodes and draws. Module/global particle and frame limits are unchanged.

The retained round-6.log reports a completed 94.6-second builder with no edits,
261,519 input tokens and 1,357 output tokens. Its guard metric explicitly required
one instanced mesh with up to 256 drops, contradicting the old import policy.
That contradiction is fixed. The old ephemeral runtime home and final builder
message were not retained, and server.log has only startup lines, so the precise
reason it stopped without writing cannot be recovered from those artifacts.
The builder now receives an explicit entrypoint delivery requirement, the full
import list and instructions to use the available API without broad repo/test
exploration. Future no-edit reverts include its final explanation, or explicitly
state that none was provided. Bounded public summaries, readable events, command
counts and usage are retained under state/builds/, with secrets redacted and no
reasoning, raw commands or stderr. A fake no-edit CLI verifies this failure path.

The rainbow rejection remained correct: an unapproved file appeared in the tree
after initial audit. Worktrees now live in private per-run directories in
os.tmpdir(), outside the iCloud-synced checkout. Recovery/removal validate the
repository hash, version, canonical path, symlinks and Git registration. Legacy
recorded paths remain recoverable. Diff rejection is unchanged. Unit and crash
tests exercise cleanup without resetting or stashing the session checkout.

## Verification

No live Bedrock rounds were run. All provider/CLI calls in verification used
offline fixtures. Tests run on Apple M1 Pro, Node 25.1.0 and pnpm 9.10.0.

- `pnpm check`: 193/193 tests; strict TypeScript, import-doc drift check and browser
  bundles passed in the source checkout and fresh clone.
- `pnpm exec tsx checks/particles.smoke.ts`: passed policy, API compilation and the
  independent Chromium/SwiftShader candidate gate with 300 citizens. Measured
  42.42 FPS, rolling average 47.06 FPS, 25,100 contrasted full-HD pixel-equivalents,
  three qualifying visibility probes, and no module/console errors. The gate keeps
  its existing reduced framebuffer and full-HD visibility thresholds.
- The particle fixture uses all six newly admitted classes. Adding the still-banned
  WebGLRenderer import rejects the same source before compilation or execution.
- Unit tests reject oversized Points buffers despite small index/draw ranges,
  oversized allocated instance capacity despite small active counts, and global
  particle overflow. Temporary-path tests reject wrong owners/versions and symlinks.

The literal README walkthrough ran in a clean clone of **88d8eaf**, with an actual
pnpm installation, no copied credentials, and `/world?overlay=1` open before the
simulator. All commands exited successfully:

| Command | Result | Duration |
| --- | --- | ---: |
| `git clone --no-hardlinks <source> <temporary clone>` | Clean clone | 0.46 s |
| `pnpm install --frozen-lockfile` | Installed | 1.07 s |
| `pnpm exec playwright install chromium` | Ready | 0.85 s |
| `pnpm check` | Tests, types and bundles passed | 10.79 s |
| `SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev` | Ready; stopped cleanly after browser checks | n/a |
| `pnpm sim` | v1 Lantern orchard for Comet04; 184 events, 104 citizens, three summons, votes [1,9,2], zero reloads | 50.59 s |
| `pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png` | 150 admitted, 254 total, 59.98 FPS | 19.22 s |
| `cp .env.example .env` | Empty assignments parse, no credentials | 0.01 s |
| `pnpm check:raid` | 300 total, including 150 raiders; 59.98 FPS; no errors | 19.36 s |
| `pnpm exec tsx checks/hardening.smoke.ts` | Both SIGKILL recovery paths and corrupt checkpoint passed | 38.87 s |
| `pnpm sim:soak --seconds=10 --interval=900 --sample=2 --output=state/soak-smoke.json` | Complete; no errors or worktree leaks | 74.43 s |

World rendering after the demo measured 59.98 FPS on ANGLE Metal. The overlay was
transparent; fresh history showed No versions yet, then played v1 with one module.
Idle polling caused no checkpoint writes. A build-phase SIGKILL killed the orphan
on restart, discarded its temporary candidate, retained v1 and left one registered
main worktree. The corrupt checkpoint was preserved with its field-level rejection
reason; the roster started fresh and v1 remained available.

The short soak sampled 60.37 and 59.91 FPS with 300 citizens, 940 DOM elements,
zero errors and one main worktree. This verifies the harness, not a new long soak.
Temporary clones and servers were cleaned up. No demo regression was observed.
Ignored evidence: state/gatec-readme.json, state/gatec-recovery.json,
state/gatec-raid.json, state/gatec-soak.json and state/particle-gate.json. Candidate
evidence, including its framebuffer profile, remains under state/checks/.

## Review disposition

| Item | Status | Evidence / limit |
| --- | --- | --- |
| 1. Import contract and particles | Done | One manifest, generated/checkable docs, both prompts, capacity accounting, policy and real gate fixture. |
| 2. No module changes | Done | Retained evidence reviewed; incompatible guard requirement fixed; explicit file delivery and redacted no-output diagnostics tested. Historical builder intent cannot be recovered because its transcript was not retained. |
| 3. Synced worktrees | Done | Private temporary worktrees, validated recovery/removal and unchanged outside-file rejection; path and crash tests. |

No implementation items skipped. Live retries of the failed viewer ideas are left
to the user as requested.

Implementation commits: 8987ae9 (imports/particles), 5fba32e (delivery/diagnostics),
88d8eaf (temporary worktrees).
