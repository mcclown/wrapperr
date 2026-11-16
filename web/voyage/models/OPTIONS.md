# YarrFlix Voyage: model options for the new achievement scenes

These are options only. Nothing has been downloaded or added.

**How each entry was checked (2026-10-16):** I opened every URL below.
- **Poly Pizza:** title, author (`Username`), licence, `Animated` flag and `Tris` come from the model page's own data.
- **Sketchfab:** name, author, licence, downloadability, animation count and face count come from the model's API record (`api.sketchfab.com/v3/models/<uid>`), and the viewer page answered.
- **Kenney / Quaternius sites:** read from the asset page.
- **Licence labels:** Sketchfab's "CC Attribution" is CC-BY 4.0. Google Poly models on Poly Pizza are CC-BY 3.0, credited as "Poly by Google".
- **Formats:** Poly Pizza offers GLB/glTF + FBX. Sketchfab offers glTF/GLB conversion on download, as with the existing lighthouse models.
- **Poly counts:** `tris=0` on Poly Pizza means no count was published, not zero.

Every Sketchfab option below is marked downloadable (`isDownloadable: true`).

---

## 1. Trade winds: a pod of dolphins leaping alongside the ship

| # | Model | Author | Licence | Animated | Poly | Fit |
|---|---|---|---|---|---|---|
| **1a ★** | [Dolphin - animated - marine mammals series](https://sketchfab.com/3d-models/dolphin-animated-marine-mammals-series-f4abb460956240f98b7a6f19cc3037a1) | nolanfa | CC-BY 4.0 | **Yes**, 2 animation tracks. The description lists swim, accelerate, "jumps out of the water", "jumps with a splash", turns, breathe and idle. | 738 faces | Low-poly with a real leap clip. Clone it 4–6 times and offset the clip phase to make a pod. |
| 1b | [Low Poly Dolphin](https://sketchfab.com/3d-models/low-poly-dolphin-3a7112396c7642df9201094a9b3634b0) | mano1creative | CC-BY 4.0 | Yes (swim cycle only) | 172 faces | Very cheap and faceted, which suits Kenney. The leap would be a code-driven arc over the swim cycle. |
| 1c | [Game-Ready dolphin (Swimming)](https://sketchfab.com/3d-models/game-ready-dolphin-swimming-b621ec8894734bc79c04338edff3cd0d) | Allie2k | CC-BY 4.0 | Yes (swimming) | 1,416 faces | Smoother, a little less stylised. Swim clip only, so the leap is in code. |
| 1d | [Dolphin](https://poly.pizza/m/3LzFgI3GLO) | Quaternius | CC0 1.0 | No | 440 tris | Same family as the Whale already in use, and no credit needed. Static, so the leap and tail bob are code-driven. |

**Recommended: 1a (nolanfa).** It is the only option with a built-in leap and splash. Its sibling [Beluga - animated](https://sketchfab.com/3d-models/beluga-animated-marine-mammals-series-c0e89812d4c54d1383ff9751168293b2) (nolanfa, CC-BY 4.0, 4 anims, 629 faces) uses the same rig if you want variety later. The fallback is 1d if you want to stay CC0.

Credit line (1a): "Dolphin - animated - marine mammals series" by nolanfa, CC-BY 4.0.

---

## 2. First to chart it: a small new island with a planted flag and a treasure chest

### Treasure chest (better than the Kenney `chest.glb` already used)

| # | Model | Author | Licence | Animated | Poly | Fit |
|---|---|---|---|---|---|---|
| **2a ★** | [Chest with Gold](https://poly.pizza/m/haqf9qoiOG) | Quaternius | CC0 1.0 | No | 22,512 tris | Open lid heaped with gold, the "treasure found" look. It is heavy for a prop but it is a single hero object. |
| 2b | [Chest](https://poly.pizza/m/eEcIqgJzJ1) (tag: Treasure) | Quaternius | CC0 1.0 | **Yes** (page data `Animated: true`; I assume a lid-open clip, check in the viewer) | 7,406 tris | Could open on arrival. It is the same family as 2a. |
| 2c | [Chest Open](https://poly.pizza/m/8kjEXzHC0S) | Quaternius | CC0 1.0 | No | 2,914 tris | A lighter open chest, if 2a is too heavy. |
| 2d | [Low Poly Treasure Chest Set](https://sketchfab.com/3d-models/low-poly-treasure-chest-set-8531db503d434c5fb2a52b9e9dd64858) | fongoose | CC-BY 4.0 | Yes (1 anim) | 384 faces | Very low-poly set of open and closed chests. The author notes the FBX export is rough. |

Also seen but not preferred: [Ocean Chest](https://poly.pizza/m/u26ZhjApbs) (Quaternius, CC0, 10,582 tris) and [Low poly treasure chest](https://sketchfab.com/3d-models/low-poly-treasure-chest-ca63751326084866b8df9a6b4c196b3d) (cattleya, CC-BY 4.0, 392 faces, hand-painted texture, closed lid).

### Small island / sandbar

| # | Model | Author | Licence | Animated | Poly | Fit |
|---|---|---|---|---|---|---|
| **2e ★** | Kenney `patch-sand.glb` / `patch-sand-foliage.glb` (already in `models/kenney/`) | Kenney | CC0 1.0 | No | — | Already downloaded and an exact style match. A bare sandbar reads as "newly charted". |
| 2f | [Island](https://poly.pizza/m/fG9iP5afr7U) (#beach) | Poly by Google | CC-BY 3.0 | No | 952 tris | A small beach island ready to use. |
| 2g | [Empty Island](https://poly.pizza/m/f-xl-C5VBuo) | Cheryl Fong | CC-BY 3.0 | No | 282 tris | Described as an "Empty Island base", so it's a blank canvas for flag and chest. |
| 2h | [Island](https://poly.pizza/m/C03O8OQq6O) | J-Toastie | CC-BY 3.0 | No | 84 tris | A tiny, ultra-minimal islet. |

### Flag (optional; Kenney `flag-pirate-high-pennant` is already used)

| # | Model | Author | Licence | Animated | Poly | Fit |
|---|---|---|---|---|---|---|
| 2i | [Flag](https://poly.pizza/m/FuOkF3WBrx) | Quaternius | CC0 1.0 | No | not shown | A plain planted flag on a pole. It matches the 2a chest family. |
| 2j | [Goal Flag](https://poly.pizza/m/onAi7dx56P) | Quaternius | CC0 1.0 | No | 186 tris | A pennant-on-pole "claimed" marker. |

**Recommended: 2e island + 2a chest (or 2b if you want the lid to open) + the existing Kenney pirate pennant.** All of these are CC0, so no new credit lines are needed.

---

## 3. Crossing the line: a milestone marker the ship sails through, plus a cannon salute

### Marker: buoys / floats

| # | Model | Author | Licence | Animated | Poly | Fit |
|---|---|---|---|---|---|---|
| **3a ★** | [Red Marine Navigation Buoy (Game Ready)](https://sketchfab.com/3d-models/red-marine-navigation-buoy-game-ready-519c88ea6d464e29988515af989a96e6) + [Green Marine Navigation Buoy](https://sketchfab.com/3d-models/green-marine-navigation-buoy-game-ready-d2ae0034c70d4334a4bcbdd8605efe92) | muyayaconcept | CC-BY 4.0 | No | 1,294 faces each | Stylised low-poly. A red/green pair makes a "gate" to sail through. A code-drawn rope of floats can join them. |
| 3b | [Inflatable Buoy](https://sketchfab.com/3d-models/inflatable-buoy-281e203b2b3a4461ba2661c82cd75a44) | ApprenticeRaccoon | CC-BY 4.0 | No | 800 faces | A round float. Repeat it along a line for a "rope of floats". |
| 3c | [Beacon](https://poly.pizza/m/21ZcU9kfuL8) | sugamo | CC-BY 3.0 | No | 762 tris | A single marker post, if you'd rather mark it with one beacon than a gate. |
| 3d | [Life preserver](https://poly.pizza/m/7n1vrlFN0GH) | Poly by Google | CC-BY 3.0 | No | 1,552 tris | Ring floats strung on a rope. A playful alternative. |

### Neptune / trident

I found no usable low-poly Neptune *figure*. The Poly Pizza "Neptune" results are all the planet, and the Sketchfab Poseidon/Neptune statues are photoscans of 25k–1.6M faces. Tridents are the practical option, for example mounted on a buoy or rising from the sea:

| # | Model | Author | Licence | Animated | Poly | Fit |
|---|---|---|---|---|---|---|
| **3e ★** | [Poseidon's Fury (FREE DOWNLOAD)](https://sketchfab.com/3d-models/poseidons-fury-free-download-fa6d31ebd0904f00b3660362811c807a) | NZFawkes | CC-BY 4.0 | No | 192 faces | An explicitly Poseidon trident, very low-poly. Scale it up so it rises from the water at the line. |
| 3f | [Trident](https://poly.pizza/m/fephtx6tRg) | MiniPoly | CC0 1.0 | No | 452 tris | The CC0 option. Note the author labels it "Trident (Trishul)", so the shape may read as a trishul rather than Neptune's. |
| 3g | [Trident](https://poly.pizza/m/6InWFmvjYZS) | Poly by Google | CC-BY 3.0 | No | 124 tris | Minimal, but it is tagged "devil/satan", so it may read as a pitchfork. |

### Bunting

The only downloadable CC-BY bunting I found is [Colorful Festival Bunting Banner](https://sketchfab.com/3d-models/colorful-festival-bunting-banner-f8f0f6dcad85423bbbf2249bdd18bad7) (nadiya69, CC-BY 4.0, not animated, 26,976 faces). That is heavy for what it is. **Recommendation: build the bunting in code** (coloured triangles on a catenary between the 3a buoys), as with the gulls and serpent.

### Cannon salute

| # | Model | Author | Licence | Animated | Poly | Fit |
|---|---|---|---|---|---|---|
| **3h ★** | [Cannon](https://poly.pizza/m/J15vlPVvKK) | Quaternius | CC0 1.0 | No | 2,362 tris | Published Nov 2023, in step with the Quaternius Pirate Kit. A ship's cannon in the low-poly house style. |
| 3i | [Short Cannon](https://poly.pizza/m/Jzj8dz4Cj0) / [Cannon](https://poly.pizza/m/qIAvoaawib) | Quaternius | CC0 1.0 | No | 462 / 1,508 tris | Lighter variants. |
| 3j | [Cannon](https://poly.pizza/m/o452gXvkqD) | Kenney | CC0 1.0 | No | not shown | Kenney style, an exact match to the ships. It is probably from the Pirate Kit already in use (not confirmed from the page). |
| **3k ★** | [Smoke](https://poly.pizza/m/RReLSfPo1Q) | Quaternius | CC0 1.0 | No | 1,216 tris | A white low-poly smoke puff. Scale and fade it in code at the muzzle. |
| 3l | [Smoke Particles](https://kenney.nl/assets/smoke-particles) | Kenney | CC0 | n/a (2D sprites, 70 files) | — | Billboard sprites, if you'd rather use a particle puff than a mesh. |

**Recommended: 3a buoy gate + 3e trident + bunting built in code; 3h cannon (or 3j if it's already in the Kenney kit) + 3k smoke.**

Credit lines: "Red/Green Marine Navigation Buoy (Game Ready)" by muyayaconcept, CC-BY 4.0; "Poseidon's Fury" by NZFawkes, CC-BY 4.0.

---

## Optional: future achievements

| Creature | Model | Author | Licence | Animated | Poly | Fit |
|---|---|---|---|---|---|---|
| **Narwhal ★** | [Narwhal - animated](https://sketchfab.com/3d-models/narwhal-animated-509282b5e29d40c9aee278676e5fd3af) | nolanfa | CC-BY 4.0 | **Yes** (12 anims, incl. jump) | 588 faces | Same rig as the 1a dolphin. The author calls it an "astral creatures" variant, so check the texture. |
| Narwhal | [Narwhal](https://poly.pizza/m/9nvsRtWPsHv) | Poly by Google | CC-BY 3.0 | No | 560 tris | Static fallback. |
| **Sea turtle ★** | [Loggerhead Turtle](https://sketchfab.com/3d-models/loggerhead-turtle-42aaed2a8085424b9aeaa3f3394eeb3a) | ra_in_coat | CC-BY 4.0 | Yes (1 anim) | 3,664 faces | Animated swim. |
| Sea turtle | [Loggerhead Sea Turtle (low poly)](https://sketchfab.com/3d-models/loggerhead-sea-turtle-low-poly-1100941c4eb540b091b2917156dc7df2) | chei_ucsd | CC-BY 4.0 | No | 988 faces | Static, faceted. |
| Sea turtle | [Turtle](https://poly.pizza/m/c6n73UnGEP4) | Poly by Google | CC-BY 3.0 | No | 536 tris | Cheapest option. |
| **Jellyfish ★** | [Jellyfish](https://sketchfab.com/3d-models/jellyfish-5786a1af801b411497128c127a90305c) | NZFawkes | CC-BY 4.0 | Yes (1 anim) | 636 faces | Pulsing low-poly jelly. Same author as 3e. |
| Jellyfish | [low-poly? jellyfish](https://sketchfab.com/3d-models/low-poly-jellyfish-9dd7cfb4fb30436d82454e3d472d28b3) | n- | CC-BY 4.0 | Yes (1 anim) | 966 faces | Animated alternative. |
| Jellyfish | [Jellyfish](https://poly.pizza/m/5PxIqPamrag) | Poly by Google | CC-BY 3.0 | No | 432 tris | Static. |
| **Clam with pearl ★** | [Clam with pearl (Low poly)](https://sketchfab.com/3d-models/clam-with-pearl-low-poly-c02011f2f50f4131a9c5977de85b5aa0) | RasenDan | CC-BY 4.0 | No | 2,020 faces | Exactly the brief: an open clam with a pearl. |
| Clam | [Mussel Open](https://poly.pizza/m/eWHAc3Pq8z) | Kenney | CC0 1.0 | No | 90 tris | Kenney style. Add a code sphere for the pearl. |
| Clam | [Clam](https://poly.pizza/m/65ObbG0O7Ze) | Poly by Google | CC-BY 3.0 | No | 644 tris | Static. |
| Albatross | none found | — | — | — | — | No low-poly albatross under CC0/CC-BY. Sketchfab "albatross" returns aircraft. Use a large gull instead: |
| ↳ gull ★ | [Low-Poly Seagull (with Animation & Rigged)](https://sketchfab.com/3d-models/low-poly-seagull-with-animation-rigged-985024328902444c8270c0f09acc897e) | simonaskLDE | CC-BY 4.0 | Yes (1 anim) | 580 faces | Scale it up and grey the wingtips for an "albatross". |
| ↳ gull | [Seagulls animated](https://sketchfab.com/3d-models/seagulls-animated-73aed843190a4dfda55f2b65cc0f8d63) | deathcow | CC-BY 4.0 | Yes (1 anim) | 808 faces | Popular animated gulls. |
| ↳ gull | [Flying gull](https://poly.pizza/m/eMNhHDZakYp) | Poly by Google | CC-BY 3.0 | No | 410 tris | Static wings-out pose. |

---

## CC-BY credit lines if the recommended picks are used

- "Dolphin - animated - marine mammals series" by nolanfa (Sketchfab), CC-BY 4.0
- "Red Marine Navigation Buoy (Game Ready)" and "Green Marine Navigation Buoy (Game Ready)" by muyayaconcept (Sketchfab), CC-BY 4.0
- "Poseidon's Fury" by NZFawkes (Sketchfab), CC-BY 4.0
- Any Poly by Google model: "<title>" by Poly by Google (via Poly Pizza), CC-BY 3.0

The Quaternius and Kenney picks (2a/2b chest, island patch, cannon, smoke) are CC0. Credit is appreciated but not required.

## Caveats

- Animation clip names for the Sketchfab models come from the authors' descriptions. The API only gives a count, so confirm the clips in the GLB after download.
- The `Animated: true` flag on 2b is from Poly Pizza's page data. I haven't confirmed what the clip does.
- 2a at 22.5k tris is the heaviest pick. Use 2c (2.9k) if frame rate matters.
