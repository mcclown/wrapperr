# Model credits

| Models | Creator | Licence | Source |
|---|---|---|---|
| `kenney/*` (ships incl. `ship-large` for the viewing twin, ghost ship, wreck, islands, palms, rocks, towers, barrels, chest, flags) | Kenney (www.kenney.nl), Pirate Kit 2.1 | CC0 1.0 (credit appreciated, not required) | https://kenney.nl/assets/pirate-kit |
| `quaternius/Whale.fbx` | Quaternius, "5 low poly animals" | CC0 1.0 | https://opengameart.org/node/66795 |
| `quaternius/Dolphin.glb` (rigged, swim clip) | Quaternius, "Dolphin" | CC0 1.0 | https://poly.pizza/m/3LzFgI3GLO |
| `polypizza/tentacle.glb` (kraken tentacles, animated) | Quaternius, "Tentacle" | CC0 1.0 | https://poly.pizza/m/BR1vpIvvvv |
| `lighthouses/maverickfx-rock.glb` | MaverickFX, "Light House" | CC0 1.0 | https://poly.pizza/m/KRebJXIRb8 |
| `lighthouses/durvesh121-sand-island.glb` | Durvesh121, "low poly island with light house" | **CC-BY 4.0: credit required** | https://sketchfab.com/3d-models/low-poly-island-with-light-house-180421c7421e458a84de2f7f545afc6b |
| `lighthouses/murriarty-rock-island.glb` | Murriarty, "Low-poly Lighthouse" | **CC-BY 4.0: credit required** | https://sketchfab.com/3d-models/low-poly-lighthouse-1a3a243e153343eeb50cadca536b4e59 |
| `lighthouses/kristenlee-slate-rocks.glb` | kristenlee, "Low Poly Lighthouse Scene" | **CC-BY 4.0: credit required** | https://sketchfab.com/3d-models/low-poly-lighthouse-scene-7cbc357ed5ce44a1bf723c13b9b212d1 |

The Sketchfab models were converted from glTF to GLB with gltf-pipeline. Their own sea, water and seabed meshes are hidden when the page loads them.

Credit lines for the end of the voyage (CC-BY 4.0): "low poly island with light house" by Durvesh121; "Low-poly Lighthouse" by Murriarty; "Low Poly Lighthouse Scene" by kristenlee.

The sea serpent, the gulls, the gun-salute smoke and the easter eggs (the imperial eagle, rabbits and painted eggs, the heart islet, jack-o'-lanterns, fireworks, the rocket and its smoke, the eclipse's moon and corona, the Christmas firs, lanterns and snow) are generated in code (no model). The dolphins fall back to a code-built pod if their model is missing. The kraken falls back to a code-built one if its models are missing.

# Sound credits

Sound effects live in `audio/sfx/` (mono mp3, trimmed and loudness-matched with ffmpeg). No background music ships with
Wrapperr: an admin can name an audio file of their own in `config/voyage/` with the "Voyage music" setting
(`voyage_music`), and without one the voyage sails with these sound effects only.

| File | Used for | Creator | Licence | Source |
|---|---|---|---|---|
| `cannon.mp3` | each gun of the line-crossing salute | Thimras, "Cannon fire" | CC0 1.0 | https://opengameart.org/content/cannon-fire |
| `splash.mp3` | the whale breaking the surface and landing ("cannon miss": a ball into the sea) | Thimras, "Battle at sea" | CC0 1.0 | https://opengameart.org/content/battle-at-sea |
| `plop.mp3` | dolphins diving back in | qubodup, "6 Short water splashes" (from pdsounds.org) | CC0 1.0 | https://opengameart.org/content/6-short-water-splashes |
| `gulls.mp3` | gulls over a newly charted island | Rango Mango, "Solo Seagull Sound Effects" (Ambient 1 + 2) | CC0 1.0 | https://opengameart.org/content/solo-seagull-sound-effects |
| `roar.mp3` | the kraken (played slowed, deeper) | trazzz123, "CC0 Deep Monster Roar" | CC0 1.0 | https://opengameart.org/content/cc0-deep-monster-roar |
| `creaks.mp3` | the first wreck, and faintly the first ghost ship | JC Sounds, "Pirate Pack Vol 1" (amb_deck_creaks) | **CC-BY 4.0: credit required** | https://opengameart.org/node/180582 |
| `thunder.mp3` | thunder after each lightning strike | JC Sounds, "Pirate Pack Vol 1" (amb_sea_storm_thunder_layer) | **CC-BY 4.0: credit required** | https://opengameart.org/node/180582 |

Credit line for the end of the voyage (CC-BY 4.0): sound effects from "Pirate Pack Vol 1" by JC Sounds.

Made in code with WebAudio (no file): the sea washing along the hull, whale song and the whale's blow, dolphin whistles and clicks, the kraken's rumble and bubbles, the serpent's hiss and rushing water, the chart's sparkle chimes, the ship's bell on the wreck, and the ghost ship's wind and chimes.

# Code and fonts

| What | Where | Creator | Licence | Source |
|---|---|---|---|---|
| three.js 0.170.0 (core, GLTFLoader, FBXLoader, SkeletonUtils, Lensflare and what they import) | `vendor/three/` | three.js authors | MIT (`vendor/three/LICENSE`) | npm `three@0.170.0` |
| IM Fell English (regular and italic) | `fonts/` | Igino Marini | SIL Open Font License 1.1 (`fonts/OFL-IMFellEnglish.txt`) | Google Fonts |
| Pirata One | `fonts/` | Rodrigo Fuenzalida, Nicolas Massi | SIL Open Font License 1.1 (`fonts/OFL-PirataOne.txt`) | Google Fonts |

They are served from Wrapperr itself, so the page loads nothing from other sites.
