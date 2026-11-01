# Visual foundation verification

P21 is closed in [its verification report](p21-verification.md). No Bedrock calls
or pushes are part of this visual pass.

## Baseline

Source `1d0aa32`, Apple M1 Pro, Chromium ANGLE/Metal, 1920x1080, 150 raiders,
fixed home camera using reduced motion. Terrain/garden/raid seeds are unchanged.
Day, dusk and night are fixed phases. The comparison uses the same viewport and
CSS coordinates for the full images and native 1:1 edge/citizen crops.

```sh
node --import tsx checks/visual-foundation.ts before 1d0aa32
```

Files: `state/visual/before-{day,dusk,night}.png`,
`state/visual/before-edge-crop.png`, `state/visual/before-citizens-crop.png`.
Raw timing: `state/visual/before-metrics.json`.

| Source | Day FPS | Dusk FPS | Night FPS |
| --- | ---: | ---: | ---: |
| Before | 59.78 | 59.97 | 59.97 |

These screenshots are comparison observations, not the deterministic capture
contract. The frame-exact mode is tested separately with fresh-page PNG hashes.
