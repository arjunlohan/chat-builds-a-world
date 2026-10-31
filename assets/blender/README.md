# Chat reaction clips (prerendered)

These are original clips prerendered in Blender from scripts Codex wrote. Chat
participation triggers playback of the committed WebMs in the product overlay;
the running product does not generate these animations. Blender and ffmpeg run
offline only and are not server dependencies. The video description and write-up
should make this distinction clear. No on-screen disclosure caption is required.

All shapes, materials, lighting and motion are generated in code. There are no
downloaded models, textures, HDRIs, fonts or audio. Trigger words are chat aliases;
the artwork does not reproduce Twitch, BTTV, FFZ or 7TV emotes. W, L, GG and F
are meshes made from beams, not text objects or font files.

## Render

Install Blender (tested with 5.2.3 LTS, EEVEE) and ffmpeg with `libvpx-vp9`, then
run from the repository root:

```sh
pnpm demo:render --help
pnpm demo:render laugh --preview
pnpm demo:render laugh
pnpm demo:render
```

No name renders all 14 clips. `hype` uses the existing `cheer-burst.py` scene;
`cheer-burst` remains an accepted alias. Dog/carrot and worm are vote-only clips.
`BLENDER_BIN` overrides `blender`; `FFMPEG_BIN` overrides
`/opt/homebrew/bin/ffmpeg`. `--encode-only` reuses a verified PNG sequence.
No provider calls or downloaded assets are involved.

Full output is 1920x1080, 30 fps, RGBA, six seconds per reaction, seven seconds
for dog/carrot and worm. `--preview` is 960x540, 15 fps at the same duration.
Ignored authoring outputs live in `assets/renders/<scene>/` (or `preview/`):

- `frames/frame_0001.png` onwards: RGBA sequence.
- `<scene>.mov`: QuickTime PNG with alpha for editing.
- `render.json`: render duration and endpoint pixel measurements.
- `webm.json`: encoding settings and output size.

Full renders also write `assets/reactions/<id>.webm`, VP9 with alpha, no audio.
The encoder tries CRF 36, 42 then 48 to stay below the runner's 2 MiB per-file
inventory limit. Preview WebMs stay in the ignored preview directory.
The first and last frames must have exactly zero visible alpha; the renderer
checks saved PNGs, the encoder forces a final keyframe and checks decoded WebM
alpha, and either stage fails if an endpoint violates that rule.

## Verify playback

```sh
pnpm check:reactions
```

This loads every committed WebM in Chromium, checks transparent endpoints and
nonempty midpoints, and exercises overlay ending, clock expiry and pause/resume.
It needs Playwright Chromium, not Blender or ffmpeg, and is also part of
`pnpm check`. Neither authoring tool is needed by the checks. Open `/capture` to record the world and overlay together.

## Catalog

Aliases match whole tokens, case-insensitively. `<3` and `/s` are punctuation
aliases; phrase aliases allow whitespace. Substrings such as W inside “will”
do not count. Only the two extra clips below are vote-only.

| Reaction | Triggers | Original animation |
| --- | --- | --- |
| laugh | `lul`, `lulw`, `kekw`, `kek`, `omegalul`, `lol`, `lmao`, `lmfao`, `rofl`, `haha`, `hahaha`, `hahahaha`, `hehe` | A cream creature tumbles with floating amber laughter droplets. |
| hype | `pog`, `pogchamp`, `poggers`, `lets go`, `let's go`, `letsgo`, `lfg` | Three rounded creatures bounce through a confetti celebration. |
| love | `<3`, `❤`, `❤️`, `♥`, `♥️`, `love`, `hearts` | Rose creatures lift a ring of sculpted hearts. |
| w | `w`, `win`, `winning`, `ws` | Mint creatures hoist a golden W built from beams. |
| l | `l`, `loss`, `ls` | A lavender creature catches a wobbling geometric L. |
| gg | `gg`, `ggs`, `ggwp`, `good game` | Two cream creatures meet beneath paired geometric Gs. |
| f | `f`, `rip`, `biblethump`, `pepehands`, `respects` | A quiet creature presents a beam-built F and warm petals. |
| dance | `dinodance`, `catjam`, `dance`, `dancing`, `vibing` | Mint and peach creatures swing in a staggered dance. |
| nervous | `monkas`, `monkaw`, `nervous`, `sweating` | A trembling creature shelters under a cloud of teal droplets. |
| sleepy | `residentsleeper`, `zzz`, `zzzz`, `zzzzz`, `zzzzzz`, `sleepy`, `snooze` | A sleepy creature drifts across a crescent with small stars. |
| rage | `smorc`, `mald`, `malding`, `rage`, `raging` | A peach creature stomps, releasing soft geometric steam puffs. |
| sarcasm | `kappa`, `/s`, `surely`, `yeah right` | A tilted lavender creature balances an exaggerated seesaw of stars. |
| dog-carrot | Vote only | A dog chases a bouncing carrot in from the left and off the right. |
| worm-takeover | Vote only | A worm crawls in, grows across the frame, wiggles, shrinks and leaves. |
