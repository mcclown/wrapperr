# Voyage mockups

```js
/* ---- The contract --------------------------------------------------------------------------------------------
 * Each mock/scenes-*.js is an ES module the page imports in mock mode (?mock=<id>, or #mock-<id>). The page loads
 * scenes-example.js, scenes-creatures.js, scenes-seerr.js and scenes-end.js; a missing file is skipped. A file calls
 * the global registerMock() once per scene:
 *
 * registerMock({
 *   id: "bottle",                     // unique; the URL is ../?mock=bottle
 *   title: "Message in a bottle",     // for the gallery (mock/index.html)
 *   tier: "cine" | "loud" | "ambient" | "end",
 *       // cine: hidden until its crew's-eye shot, the stir and rumble before it, rises as the shot begins, gilded card
 *       // loud: always visible, sailed past at full speed, highlighted card, no camera change
 *       // ambient: seen in passing, plain card (or none), no shot, no slowing
 *       // end: no sighting; the voyage starts 3 days from its end and endScreen() fills the captain's log
 *   card: { kicker, title, facts, emblem?, poster? },  // strings, or (it) => string. emblem is HTML for the dark box
 *       // ("3<small>finds</small>"); poster (a URL or img/…) replaces it. No card: no caption. Counts, never names.
 *   build(api, it),                   // once, before sailing: add things to it.group (already placed `off` out on
 *       // `side`, turned so -z is the ship's heading). Set it.head (an Object3D) for the crew to look at.
 *   animate(api, it, dt, dd),         // every frame while within `range` days; dt is world seconds (slowed in the
 *       // shot), dd = voyage day - its day (negative before). Position things, ride the swell (api.seaHeight).
 *   water?(api, it, dt, dd),          // every frame once it is out (never while hidden before its shot): splashes,
 *       // foam, rings, spray
 *   sfx?(api, it, bus),               // cine only, when its shot begins: set up any endless sounds on bus, then return
 *       // a function that plays the next sound and returns seconds until it should be called again
 *   endScreen?(api, rows),            // end tier (any tier, really) when the log shows: rows is [[label, text], …];
 *       // return { title?, rows? } to replace them
 *   onShot?(api, it),                 // optional: the moment its crew's-eye shot begins
 *   // Optional placement and framing:
 *   ahead: 4,      // days from the harness's calm start day to its day
 *   side: 1,       // 1 starboard, -1 port
 *   off: 36,       // units out from the course (a day is 9 units along it)
 *   range: 25,     // days either side within which it is shown and animated
 *   part: 0.3,     // how far up (it.emerge) it comes in the build-up before its shot
 *   stirR: 18,     // radius of the stirred water over it in the build-up
 *   hidden: true,  // false: a cine mock that is visible from afar (like the charted island)
 *   crew: [1.6, 5.6, 9.4],  // the sailor's eye in the ship's frame [out to its side, up, aft]; api.CREW / api.CREW_BOW
 *   look: 0,       // added to the height the crew look at (the page already looks 4 over it.head)
 *   assets: { name: "models/…glb" | ["models/…glb", longestSide] },  // loaded before build(); then api.model(name)
 * });
 *
 * `it`: { c (its sighting), day (its day + 0.5), group, side, kind: "mock", mock (the registration),
 *   seen (its shot has begun), stir (0-1 build-up, drives the stirred water), emerge (0 → part before the shot, → 1 as
 *   it begins; undefined = fully up) } plus anything the scene keeps on it.
 *
 * ---- api ----------------------------------------------------------------------------------------------------
 * THREE, scene, world (the course's group), ship, camera, frame(d) → { p, fwd, right }, DAY (units per day),
 * lite (phone), reduced (reduced motion)
 * model(name, scale?) a shared copy of a loaded model (Kenney: "barrel", "chest", "ship-large", "palm-detailed-bend",
 *   "patch-sand", "rocks-sand-a", "flag-pirate-high-pennant", …; "whale", "dolphin", "tentacle"; or your assets);
 *   MODELS (the originals, .animations)
 * Materials and builders: mats (wood, sand, …), EGG (grass, snow, gold, skin, coat, …), eggMat(color), PAINTED,
 *   BUNNY, GLOW_TEX, canvasTexture(w, h, draw), makeLeprechaun(), makeCaptain(), makeRabbit(fur), makeDolphin(),
 *   fir(h), foamRing(r, follow?)
 * Ground: isle(obj, r, floor?) registers an island (calms the sea round it), deepen(sand, k), ground(sand, x, z) the
 *   height of the sand under x, z; seaHeight(x, z) the swell; weather() → { storm, night, hours }
 * Water: spray(n, x, z, base, radius, up, out, top?) droplets from the whale's pool; drip(n, p, seaY, spread) water
 *   running off; churn(x, z, strength, radius) a foam spot that rings out (uChurn); ring(x, z, strength) a splash's
 *   rings and foam (uSplash); mound(x, z, height, radius) the sea heaving (uMound, this frame); WET (0.5 on phones);
 *   water (the shader's uniforms). The build-up stir (uStir) is automatic.
 * Sound (api.sfx; call only when api.sfx.live()): play(name, dest, { rate, gain, at, loop }) for audio/sfx/<name>.mp3
 *   (cannon, splash, plop, gulls, roar, creaks, thunder), hiss(dest, at?, len?) noise, filt(type, f, q, dest),
 *   env(dest, v, attack, release, at?) a gain envelope, bell(dest, v, f, at?), osc(type, f, dest, at, len),
 *   wobble(param, hz, depth), echo(dest, time, fb, wet), note(text) logs it (__voyage.sfx()), now(), ac, out,
 *   bus (the running shot's bus)
 * Framing: CREW, CREW_BOW (the sailor positions)
 * Time: time (world seconds), day, playing, jumped (the timeline was just jumped), shot → { name, it, out }
 * Also: mixers (push an AnimationMixer and the page updates it), unseen(it), tierOf(c), $ (getElementById), voyage
 * ------------------------------------------------------------------------------------------------------------- */
```

## Running one

Open the voyage (`/voyage/`, signed in) with `?mock=<id>`, or `/voyage/mock/` for the gallery. A mock sails
through the signed-in user's own voyage. `&day=<n>` picks the start day (the sighting is `ahead` days
later); otherwise it is the calmest daytime week clear of a month change. Real sightings and egg islets within ten
days of it stand aside. The gallery's "All, one after another" link chains them (`&next=a,b,…&auto`).

Headless (GPU flags as in NOTES.md):

```js
await page.goto(`${base}/?mock=bottle`);
await page.waitForFunction(() => window.__voyage && !document.getElementById("set_sail").disabled);
await page.evaluate(() => __voyage.mock("bottle"));  // to 1.6 days before it and sailing: the shot cuts in at once
// (an end mock: straight to the captain's log). Or click #set_sail to sail the whole build-up from the start day.
```

`__voyage.mocks()` lists the registered ids, `__voyage.creatures().find(c => c.mock)` is the sighting (`stir`,
`emerge`, `seen`), `__voyage.shot()` is `"crew"` during its shot and `__voyage.sfx()` logs its sounds.

`scenes-example.js` has a cine example (a bottle bobbing up through the stir, with a ring and spray as it breaks the
surface, foam round it and its own sounds) and an ambient one (crates and barrels adrift).
