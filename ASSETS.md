# World asset provenance

Powered by [Poly Haven](https://polyhaven.com). Prepared with `pnpm assets:fetch`; runtime pages fetch only committed same-origin data. [Poly Haven license](https://polyhaven.com/license), [ambientCG license](https://docs.ambientcg.com/license/): CC0 1.0.

All source models are simplified, meshopt-compressed glTF with 1K WebP textures and a second LOD. Materials use 1K WebP color, OpenGL normals and packed AO/roughness/metalness. The terrain packs four sets into a padded 2K atlas. The sky is 2K HDR; photographic cloud cutouts are derived as 1K alpha WebP. Only data files survive the offline conversion. Raw sources and ZIPs stay in ignored state/. Collection assets select one named variant before simplification. Tree canopies and grass preserve the source scan coverage as offline-baked alpha cards; only continuous woody geometry is decimated for the tree LODs. Rebuilding these two assets also requires Blender (BLENDER_BIN may override it). No source scripts, Blender files or executable extensions are copied.

Compressed world outputs: 43,235,305 bytes. All committed asset sources and media: 59,443,090 bytes; limit 120,000,000. Manifest records exact download URLs, checksums and per-file sizes in [manifest.json](assets/world/manifest.json).

| Name | Type | Source | License | Bytes | Outputs |
| --- | --- | --- | --- | ---: | --- |
| basalt | texture | [dark_rock](https://polyhaven.com/a/dark_rock) | CC0-1.0 | 789,590 | [basalt-color.webp](assets/world/basalt-color.webp), [basalt-normal.webp](assets/world/basalt-normal.webp), [basalt-arm.webp](assets/world/basalt-arm.webp) |
| moss | texture | [mossy_rock](https://polyhaven.com/a/mossy_rock) | CC0-1.0 | 1,330,194 | [moss-color.webp](assets/world/moss-color.webp), [moss-normal.webp](assets/world/moss-normal.webp), [moss-arm.webp](assets/world/moss-arm.webp) |
| grass | texture | [grass_ground](https://polyhaven.com/a/grass_ground) | CC0-1.0 | 1,414,290 | [grass-color.webp](assets/world/grass-color.webp), [grass-normal.webp](assets/world/grass-normal.webp), [grass-arm.webp](assets/world/grass-arm.webp) |
| forest | texture | [forest_floor](https://polyhaven.com/a/forest_floor) | CC0-1.0 | 1,646,850 | [forest-color.webp](assets/world/forest-color.webp), [forest-normal.webp](assets/world/forest-normal.webp), [forest-arm.webp](assets/world/forest-arm.webp) |
| wood | texture | [brown_planks_03](https://polyhaven.com/a/brown_planks_03) | CC0-1.0 | 735,944 | [wood-color.webp](assets/world/wood-color.webp), [wood-normal.webp](assets/world/wood-normal.webp), [wood-arm.webp](assets/world/wood-arm.webp) |
| bark | texture | [bark_brown_02](https://polyhaven.com/a/bark_brown_02) | CC0-1.0 | 1,181,460 | [bark-color.webp](assets/world/bark-color.webp), [bark-normal.webp](assets/world/bark-normal.webp), [bark-arm.webp](assets/world/bark-arm.webp) |
| brick | texture | [Bricks056](https://ambientcg.com/a/Bricks056) | CC0-1.0 | 977,708 | [brick-color.webp](assets/world/brick-color.webp), [brick-normal.webp](assets/world/brick-normal.webp), [brick-arm.webp](assets/world/brick-arm.webp) |
| canvas | texture | [Fabric026](https://ambientcg.com/a/Fabric026) | CC0-1.0 | 1,070,868 | [canvas-color.webp](assets/world/canvas-color.webp), [canvas-normal.webp](assets/world/canvas-normal.webp), [canvas-arm.webp](assets/world/canvas-arm.webp) |
| lantern | model | [wooden_lantern_01](https://polyhaven.com/a/wooden_lantern_01) | CC0-1.0 | 1,660,580 | [lantern.glb](assets/world/lantern.glb), [lantern-lod.glb](assets/world/lantern-lod.glb) |
| bench | model | [painted_wooden_bench](https://polyhaven.com/a/painted_wooden_bench) | CC0-1.0 | 1,006,044 | [bench.glb](assets/world/bench.glb), [bench-lod.glb](assets/world/bench-lod.glb) |
| crate | model | [wooden_crate_01](https://polyhaven.com/a/wooden_crate_01) | CC0-1.0 | 1,089,940 | [crate.glb](assets/world/crate.glb), [crate-lod.glb](assets/world/crate-lod.glb) |
| barrel | model | [barrel_03](https://polyhaven.com/a/barrel_03) | CC0-1.0 | 920,780 | [barrel.glb](assets/world/barrel.glb), [barrel-lod.glb](assets/world/barrel-lod.glb) |
| bridge-planks | model | [modular_wooden_pier](https://polyhaven.com/a/modular_wooden_pier) | CC0-1.0 | 1,717,544 | [bridge-planks.glb](assets/world/bridge-planks.glb), [bridge-planks-lod.glb](assets/world/bridge-planks-lod.glb) |
| plinth | model | [folding_wooden_stool](https://polyhaven.com/a/folding_wooden_stool) | CC0-1.0 | 1,162,588 | [plinth.glb](assets/world/plinth.glb), [plinth-lod.glb](assets/world/plinth-lod.glb) |
| campfire | model | [stone_fire_pit](https://polyhaven.com/a/stone_fire_pit) | CC0-1.0 | 1,591,184 | [campfire.glb](assets/world/campfire.glb), [campfire-lod.glb](assets/world/campfire-lod.glb) |
| bucket | model | [wooden_bucket_01](https://polyhaven.com/a/wooden_bucket_01) | CC0-1.0 | 1,126,060 | [bucket.glb](assets/world/bucket.glb), [bucket-lod.glb](assets/world/bucket-lod.glb) |
| pot | model | [planter_pot_clay](https://polyhaven.com/a/planter_pot_clay) | CC0-1.0 | 780,404 | [pot.glb](assets/world/pot.glb), [pot-lod.glb](assets/world/pot-lod.glb) |
| flowers | model | [flower_ursinia](https://polyhaven.com/a/flower_ursinia) | CC0-1.0 | 643,896 | [flowers.glb](assets/world/flowers.glb), [flowers-lod.glb](assets/world/flowers-lod.glb) |
| fern | model | [fern_02](https://polyhaven.com/a/fern_02) | CC0-1.0 | 459,644 | [fern.glb](assets/world/fern.glb), [fern-lod.glb](assets/world/fern-lod.glb) |
| rock | model | [rock_09](https://polyhaven.com/a/rock_09) | CC0-1.0 | 923,640 | [rock.glb](assets/world/rock.glb), [rock-lod.glb](assets/world/rock-lod.glb) |
| moss-rock | model | [rock_moss_set_01](https://polyhaven.com/a/rock_moss_set_01) | CC0-1.0 | 897,536 | [moss-rock.glb](assets/world/moss-rock.glb), [moss-rock-lod.glb](assets/world/moss-rock-lod.glb) |
| shrub | model | [shrub_01](https://polyhaven.com/a/shrub_01) | CC0-1.0 | 844,020 | [shrub.glb](assets/world/shrub.glb), [shrub-lod.glb](assets/world/shrub-lod.glb) |
| log | model | [tree_stump_01](https://polyhaven.com/a/tree_stump_01) | CC0-1.0 | 2,109,728 | [log.glb](assets/world/log.glb), [log-lod.glb](assets/world/log-lod.glb) |
| ladder | model | [wooden_ladder](https://polyhaven.com/a/wooden_ladder) | CC0-1.0 | 1,494,504 | [ladder.glb](assets/world/ladder.glb), [ladder-lod.glb](assets/world/ladder-lod.glb) |
| chair | model | [painted_wooden_chair_01](https://polyhaven.com/a/painted_wooden_chair_01) | CC0-1.0 | 647,788 | [chair.glb](assets/world/chair.glb), [chair-lod.glb](assets/world/chair-lod.glb) |
| table | model | [small_wooden_table_01](https://polyhaven.com/a/small_wooden_table_01) | CC0-1.0 | 478,516 | [table.glb](assets/world/table.glb), [table-lod.glb](assets/world/table-lod.glb) |
| ground | atlas | [dark_rock](https://polyhaven.com/a/dark_rock) | CC0-1.0 | 4,129,696 | [ground-color.webp](assets/world/ground-color.webp), [ground-normal.webp](assets/world/ground-normal.webp), [ground-arm.webp](assets/world/ground-arm.webp) |
| sky | hdri | [kloofendal_48d_partly_cloudy_puresky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | CC0-1.0 | 5,451,493 | [sky.hdr](assets/world/sky.hdr) |
| grass | model | [grass_medium_01](https://polyhaven.com/a/grass_medium_01) | CC0-1.0 | 422,984 | [grass.glb](assets/world/grass.glb), [grass-lod.glb](assets/world/grass-lod.glb) |
| scanned-tree | model | [island_tree_01](https://polyhaven.com/a/island_tree_01) | CC0-1.0 | 4,319,204 | [scanned-tree.glb](assets/world/scanned-tree.glb), [scanned-tree-lod.glb](assets/world/scanned-tree-lod.glb) |
| clouds | image | [cloud_layers](https://polyhaven.com/a/cloud_layers) | CC0-1.0 | 210,628 | [clouds.webp](assets/world/clouds.webp) |

Kit names refer to these sources, not exact replicas of missing props: bridge-planks uses a modular pier, plinth a wooden stool, campfire a stone fire pit, log a stump. No trademarked props or third-party emote likenesses are included.
