# Realism rollout verification

Source baseline: `b15dd74` (P22). No live Bedrock calls or pushes.
The saved land height function, coast, paths, landmark coordinates and module
anchors are unchanged. The classic switch remains the live escape hatch.

## Asset sources

The offline pipeline uses Poly Haven's public API and ambientCG's direct ZIP
endpoint. Powered by [Poly Haven](https://polyhaven.com). Both asset providers
license their data as CC0: [Poly Haven](https://polyhaven.com/license),
[ambientCG](https://docs.ambientcg.com/license/). Per-asset sources, transforms,
compressed sizes and hashes are in [ASSETS.md](../ASSETS.md) and its manifest.

The glTF meshopt decoder uses WebAssembly. CSP permits `wasm-unsafe-eval` only,
not JavaScript eval, and same-page blob image/buffer decoding; it grants no
external network origins. Models and maps are finite committed data. Only
manifest-listed filenames are served by `/world-assets/`; no path-based disk
lookup or remote asset proxy is exposed. Runtime builders still cannot fetch,
import asset files, modify the engine or install dependencies.

## Step 1: committed data and loading

Prepared 29 CC0 inputs: eight surface sets, twenty named models with LODs, and a
2K HDR sky. Asset payload/source total at preparation: 55,011,338 bytes, below
120,000,000. Models use meshopt glTF and 1K WebP; each surface has color, OpenGL
normal and packed AO/roughness/metalness maps. No downloaded code is retained.

The first hardware cold load took 1.12 seconds. With 150 raiders the day/dusk/night
measurements were 60.10/59.75/59.84 FPS. Images/metrics:
`state/visual/realism-step1-*`.

The software gate passes cheap and rejects expensive, both idle and with six
parallel CPU load workers (`state/asset-cache/step1-gate-final.log`). Cheap gate
latency: 30.770/34.120 seconds. Expensive fixtures reject on three 2ms overruns.
A first loaded run missed the initial rAF-polled readiness timeout; readiness now
polls state on a timer. A later run reached the last measurement slice at the
old 35s deadline. The cold-asset-aware checker reserve is now 45s, drawn from the
same 180s build deadline. Relative cost, visibility, scale, hook budgets and
sustained-collapse thresholds are unchanged. Base assets preload once; additional
kit props resolve before a synchronous spawnSpec-capable module factory runs.

A first unit run overlapped texture compression and hit three existing real-time
fixture deadlines. The isolated rerun passed all 246 unit tests. Browser history
waits now account for asynchronous asset initialization instead of reading an
undefined stats object. The final `pnpm check` passed 246/246, browser bundles, all fourteen alpha
media/playback cases and the history smoke. Whole-command log:
`state/asset-cache/step1-check-final.log`. No test or runtime timing threshold was widened to address those
unit fixtures.
