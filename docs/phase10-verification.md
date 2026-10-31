# Phase 10 verification

## Completed baseline walkthrough

Codex ran the README from a fresh local clone of 662825d, with real dependency
installation (no node_modules symlink at the walkthrough root), no copied
credentials and Apple M1 Pro / ANGLE Metal. These are completed baseline results.
The final follow-up verification is recorded below when completed.

| Command / page | Result |
| --- | --- |
| `git clone --no-hardlinks <source> <temporary clone>` | Exit 0; 0.33 s |
| `git rev-parse HEAD` | Exit 0; 0.01 s |
| `pnpm install --frozen-lockfile` | Exit 0; 0.98 s |
| `pnpm exec playwright install chromium` | Exit 0; 1.08 s |
| `pnpm check` | Exit 0; 9.04 s |
| `SIMULATION_MODE=fixture SIMULATION_ALLOWED=1 pnpm dev` | Started |
| `pnpm sim` | Exit 0; 52.64 s |
| `pnpm sim:raid --viewers=150 --channel=AuroraCrew --screenshot=state/demo-raid.png` | Exit 0; 19.2 s |
| `Ctrl+C (stop dev before standalone checks)` | Exit 0 |
| `cp .env.example .env` | Exit 0; 0.01 s |
| `pnpm check:raid` | Exit 0; 19.32 s |
| `/world?overlay=1` | Ready, 1920x1080 framebuffer, zero reloads |
| `/overlay` | HTTP 200; transparent body |
| `/history` before sim | No versions yet |
| `/history` after sim | Plays v1 Lantern orchard, requested by Comet04 |

The full sim accepted 184 events, created 104 citizens and three summons, counted
votes [1,9,2] and shipped v1. Measured world FPS: 60.07. Read-only polling did not
change the checkpoint mtime. The user independently repeated the same main path
at 662825d: fixture dev startup 3s, sim 52s, raid admitted 150 to 254 citizens at
60.05 FPS, and history playback passed.

The additional standalone crash smoke failed because its nested clone inherited
v1 from the preceding demo, then tried to create another v1. This is a verification
harness regression, not a failed demo ship. It is retained in the local command
log and is fixed and rerun with the follow-ups. No new two-hour soak or live OAuth
onboarding is claimed. Device-flow flags are verified against installed CLI help.

Current test count and final command results belong in this report, rather than
being duplicated across README and operation notes.
