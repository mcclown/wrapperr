// Seerr request scenes: rewards for asking the server for a title (see README.md for the contract and api).
// Placeholder data: the posters (and their titles) are borrowed from the voyage's own, and every count is made up.

const V = window.VOYAGE, OWN = (V?.titles || []).filter(t => t.poster).map(t => [V.imageBase + t.poster, t.name]);
const borrow = i => OWN.length ? OWN[i % OWN.length] : [null, "A requested title"];
const POSTER = { martian: borrow(0), spidey: borrow(1), knight: borrow(2), housemaid: borrow(3), wolves: borrow(4) };
const LABELS = Array.from({ length: 10 }, (_, i) => borrow(i)[0]);
const DECK = 1.45, QDECK = 3.25;  // the main and quarter decks' heights in the ship's frame
const QD_SLOT = s => [s * 1.72, QDECK, 8.0];  // the quarterdeck's aft corner: where the chase shot sees a crate on deck

// ---- Shared pieces ------------------------------------------------------------------------------------------------
const texs = new Map();
function posterTex(api, url) {
  if (!url) return null;
  if (!texs.has(url)) { const t = new api.THREE.TextureLoader().load(url); t.colorSpace = api.THREE.SRGBColorSpace; t.anisotropy = 4; texs.set(url, t); }
  return texs.get(url);
}
const mtl = new Map();
function mat(api, key, make) { if (!mtl.has(key)) mtl.set(key, make(api.THREE)); return mtl.get(key); }
const ROPE = api => mat(api, "rope", T => new T.MeshStandardMaterial({ color: 0x9b7b4c, roughness: 1 }));
const IRON = api => mat(api, "iron", T => new T.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.55, metalness: 0.6 }));
const GOLD = api => mat(api, "gold", T => new T.MeshStandardMaterial({ color: 0xe8b33c, roughness: 0.3, metalness: 0.8, emissive: 0x6a4300, emissiveIntensity: 0.4 }));
const glow = (api, color, size, op = 0) => {
  const T = api.THREE, s = new T.Sprite(new T.SpriteMaterial({ map: api.GLOW_TEX, color, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size); return s;
};
const ease = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// A clock in real seconds that stops while paused, so a scene's choreography keeps to the crew's-eye shot (7.5 s)
function tick(api, it) {
  const n = performance.now() / 1000, d = Math.min(0.1, n - (it.lastN ?? n)); it.lastN = n;
  if (api.playing && it.T !== undefined) it.T += d;
  return d;
}

// The ship's frame, flat (no tilt): its position, heading and the yaw to face along it
function shipFrame(api) { const f = api.frame(api.day); return { p: api.ship.position, fwd: f.fwd, right: f.right, yaw: Math.atan2(-f.fwd.x, -f.fwd.z) }; }
// Hold the group at a point in the ship's frame [x out to starboard, z aft], on the sea, heading with the ship.
// Its local x and z are then the ship's, offset by the anchor, and y is the world's
function follow(api, it, x, z) {
  const f = shipFrame(api);
  it.group.position.set(f.p.x + f.right.x * x - f.fwd.x * z, 0, f.p.z + f.right.z * x - f.fwd.z * z);
  it.group.rotation.set(0, f.yaw, 0); it.group.updateMatrixWorld();
  it.ax = x; it.az = z;
}
// A point in the ship's own (tilting) frame, in the group's
function fromShip(api, it, v) { api.ship.updateMatrixWorld(); api.ship.localToWorld(v); return it.group.worldToLocal(v); }
const tmpW = { v: null };
function seaAt(api, it, x, z) {
  const v = tmpW.v ??= new api.THREE.Vector3();
  v.set(x, 0, z); it.group.localToWorld(v); return api.seaHeight(v.x, v.z);
}
function worldOf(api, o) { return o.getWorldPosition(tmpW.w ??= new api.THREE.Vector3()); }

// Things kept on the ship (cargo, a delivered crate, the chest) are shown only while the scene's group is, by a
// stand-in "mixer" that the page updates every frame
function onShip(api, it) {
  const g = new api.THREE.Group(); api.ship.add(g);
  api.mixers.push({ update() { g.visible = it.group.visible; } });
  return g;
}

// A rope of short segments between a and b (group-local), sagging by sag
function rope(api, parent, n = 8) {
  const T = api.THREE, segs = [];
  for (let k = 0; k < n; k++) { const m = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 1, 4), ROPE(api)); parent.add(m); segs.push(m); }
  const a = new T.Vector3(), b = new T.Vector3(), up = new T.Vector3(0, 1, 0), d = new T.Vector3();
  const at = (p, q, s, t, out) => out.lerpVectors(p, q, t).setY(lerp(p.y, q.y, t) - s * 4 * t * (1 - t));
  return {
    segs,
    set(p, q, sag = 0) {
      for (let k = 0; k < n; k++) {
        at(p, q, sag, k / n, a); at(p, q, sag, (k + 1) / n, b);
        const m = segs[k]; m.visible = true; m.position.lerpVectors(a, b, 0.5);
        const len = d.subVectors(b, a).length(); m.scale.set(1, Math.max(0.001, len), 1);
        m.quaternion.setFromUnitVectors(up, d.normalize());
      }
    },
    hide() { segs.forEach(m => { m.visible = false; }); },
  };
}

// A crate size across (a little less tall), standing on y = 0: pale planks and dark iron, so it shows against the
// deck, with poster labels on its top and aft side
function crate(api, size, poster, { top = true, side = true, lashed = false, sealed = false } = {}) {
  const T = api.THREE, g = new T.Group(), hh = size * 0.85;
  const plank = mat(api, "plank", T => new T.MeshStandardMaterial({ color: 0xcf9f5c, roughness: 0.85 }));
  const box = new T.Group(); g.userData.h = hh;
  const m = new T.Mesh(new T.BoxGeometry(size, hh, size), plank); m.position.y = hh / 2; box.add(m);
  for (const y of [0.1, 0.9]) { const band = new T.Mesh(new T.BoxGeometry(size * 1.03, hh * 0.09, size * 1.03), IRON(api)); band.position.y = hh * y; box.add(band); }
  for (const x of [-1, 1]) for (const z of [-1, 1]) { const post = new T.Mesh(new T.BoxGeometry(size * 0.09, hh * 1.01, size * 0.09), mat(api, "plankDark", T => new T.MeshStandardMaterial({ color: 0x8a5e30, roughness: 0.9 }))); post.position.set(x * size * 0.48, hh / 2, z * size * 0.48); box.add(post); }
  g.add(box);
  const h = g.userData.h;
  if (poster) {
    const m = mat(api, "poster:" + poster, () => new T.MeshStandardMaterial({ map: posterTex(api, poster), roughness: 0.85 }));
    if (side) { const p = new T.Mesh(new T.PlaneGeometry(size * 0.46, size * 0.69), m); p.position.set(0, h * 0.5, size / 2 + 0.02); g.add(p); }
    if (top) { const p = new T.Mesh(new T.PlaneGeometry(size * 0.46, size * 0.69), m); p.rotation.x = -Math.PI / 2; p.position.set(0, h + 0.02, 0); g.add(p); }
  }
  if (lashed || sealed) {  // two bands of rope round it
    for (const x of [-0.3, 0.3]) {
      const r = new T.Mesh(new T.BoxGeometry(size * 0.06, h * 1.03, size * 1.04), ROPE(api)); r.position.set(x * size, h / 2, 0); g.add(r);
      const t = new T.Mesh(new T.BoxGeometry(size * 0.06, 0.02, size * 1.04), ROPE(api)); t.position.set(x * size, h + 0.015, 0); g.add(t);
    }
  }
  if (sealed) {  // a red wax seal where the ropes cross the front
    const s = new T.Mesh(new T.CylinderGeometry(size * 0.11, size * 0.12, 0.05, 12), mat(api, "wax", T => new T.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.45 })));
    s.rotation.x = Math.PI / 2; s.position.set(size * 0.3, h * 0.5, size / 2 + 0.04); g.add(s);
  }
  return g;
}

// A rowing boat, bow to -z, with oars, rowers in coloured shirts, a lantern on a pole at the stern and a flag at the bow
const BOATS = [0x2f6d9a, 0xb2452f, 0x3f8a52, 0xd9b45a, 0x6b4a8a, 0x2a8a8a];
function rowboat(api, len, colour, { rowers = 2, lantern = true, flag = null } = {}) {
  const T = api.THREE, g = new T.Group(), w = len * 0.36, h = len * 0.17;
  const geo = new T.BoxGeometry(w, h, len, 2, 3, 10), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), e = Math.abs(z) / (len / 2), yy = y / h + 0.5;
    const taper = (1 - e * e * (z < 0 ? 0.92 : 0.55)) * (0.42 + 0.58 * yy);
    p.setX(i, x * taper); p.setY(i, y + e * e * h * (0.45 + (1 - yy) * 0.35));
  }
  geo.computeVertexNormals();
  const paint = new T.MeshStandardMaterial({ color: colour, roughness: 0.75 }), inside = mat(api, "boatIn", T => new T.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 }));
  const hull = new T.Mesh(geo, [paint, paint, inside, paint, paint, paint]); hull.position.y = h * 0.2; g.add(hull);
  const b = { g, oars: [], rowers: [], len, w, h, top: h * 0.7 };
  const shirts = [0xe8e0d0, 0xc8402e, 0x2f4f7a, 0x7a5a2e];
  for (let r = 0; r < rowers; r++) {
    const z = (r - (rowers - 1) / 2) * len * 0.3;
    const seat = new T.Mesh(new T.BoxGeometry(w * 0.9, 0.08, 0.3), api.mats.wood); seat.position.set(0, h * 0.45, z); g.add(seat);
    b.rowers.push(sailor(api, shirts[(r + Math.round(colour % 7)) % shirts.length], g, z, h * 0.5));
    for (const sd of [1, -1]) {
      const pivot = new T.Group(); pivot.position.set(sd * w * 0.48, h * 0.75, z - 0.25); g.add(pivot);
      const oar = new T.Group(); pivot.add(oar);
      const L = len * 0.62, shaft = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, L, 5), api.mats.wood);
      shaft.rotation.z = Math.PI / 2; shaft.position.x = sd * (L / 2 - 0.5); oar.add(shaft);
      const blade = new T.Mesh(new T.BoxGeometry(0.5, 0.05, 0.2), api.mats.wood); blade.position.x = sd * (L - 0.6); oar.add(blade);
      b.oars.push({ pivot, sd, blade });
    }
  }
  if (lantern) {
    const pole = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 1.5, 5), api.mats.wood); pole.position.set(0, h * 0.7 + 0.75, len * 0.42); g.add(pole);
    const lamp = new T.Mesh(new T.BoxGeometry(0.22, 0.3, 0.22), mat(api, "lamp", T => new T.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb43c, emissiveIntensity: 1.4 })));
    lamp.position.set(0, h * 0.7 + 1.5, len * 0.42); g.add(lamp);
    const gl = glow(api, 0xffc060, 1.6, 0.8); gl.position.copy(lamp.position); g.add(gl);
    b.lamp = lamp; b.glow = gl;
  }
  if (flag !== null) {
    const pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.3, 5), api.mats.wood); pole.position.set(0, h * 0.7 + 0.6, -len * 0.42); g.add(pole);
    const fg = new T.PlaneGeometry(0.7, 0.42, 4, 1); fg.translate(0.35, 0, 0);
    const f = new T.Mesh(fg, new T.MeshStandardMaterial({ color: flag, side: T.DoubleSide, roughness: 0.9 })); f.position.set(0, h * 0.7 + 1.05, -len * 0.42); g.add(f);
    b.flag = f;
  }
  return b;
}
// A small figure sitting at an oar, facing aft (+z), or standing up to cheer
function sailor(api, shirt, parent, z, y) {
  const T = api.THREE, s = new T.Group(); s.position.set(0, y, z); parent.add(s);
  const body = new T.Group(); s.add(body);
  const torso = new T.Mesh(new T.CylinderGeometry(0.2, 0.25, 0.62, 7), new T.MeshStandardMaterial({ color: shirt, roughness: 0.85 })); torso.position.y = 0.35; body.add(torso);
  const head = new T.Mesh(new T.SphereGeometry(0.17, 10, 8), api.EGG.skin); head.position.y = 0.82; body.add(head);
  const cap = new T.Mesh(new T.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(api, "cap", T => new T.MeshStandardMaterial({ color: 0x8a2a22, roughness: 0.9 }))); cap.position.y = 0.86; body.add(cap);
  const arms = [1, -1].map(sd => {
    const a = new T.Group(); a.position.set(sd * 0.24, 0.58, 0); body.add(a);
    const m = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.55, 5), torso.material); m.position.y = -0.27; a.add(m);
    return a;
  });
  return { s, body, arms };
}
// One stroke: phase 0-1, the blades in the water for the first half. Returns the blade tips that just went in
function row(api, b, phase, power = 1, cheer = 0) {
  const drive = phase < 0.5, u = drive ? phase / 0.5 : (phase - 0.5) / 0.5;
  const sweep = power * (drive ? lerp(0.55, -0.45, u) : lerp(-0.45, 0.55, u)), lift = power > 0.05 ? (drive ? -0.1 : 0.32 * Math.sin(u * Math.PI)) : 0.5;
  for (const o of b.oars) o.pivot.rotation.set(0, o.sd * sweep, o.sd * lift);
  for (const r of b.rowers) {
    r.body.rotation.x = power * (drive ? lerp(-0.35, 0.35, u) : lerp(0.35, -0.35, u)) * (1 - cheer);
    r.s.position.y = b.h * 0.5 + cheer * 0.2;
    r.arms.forEach((a, k) => { a.rotation.x = lerp(-1.3 + r.body.rotation.x * 0.5, Math.PI - 0.25 + Math.sin(api.time * 9 + k) * 0.25 * cheer, cheer); a.rotation.z = (k ? -1 : 1) * cheer * 0.3; });
  }
  return drive && u < 0.12 ? b.oars : null;
}
// A boat riding the sea at group-local (x, z), heading yaw (0 = along the ship)
function ride(api, it, b, x, z, yaw, extra = 0) {
  const y = seaAt(api, it, x, z), yf = seaAt(api, it, x - Math.sin(yaw) * b.len * 0.4, z - Math.cos(yaw) * b.len * 0.4);
  b.g.position.set(x, y - b.h * 0.25 + extra, z);
  b.g.rotation.set((yf - y) * 0.6 + Math.sin(api.time * 1.3 + x) * 0.04, yaw, Math.sin(api.time * 1.1 + z) * 0.06);
}
// Oar strokes ripple the water; a boat under way leaves a little foam behind it
function boatWater(api, it, b, speed, dt) {
  b.foamT = (b.foamT ?? Math.random()) - dt;
  if (speed > 0.5 && b.foamT < 0) {
    b.foamT = 0.35 / Math.max(api.WET, 0.5);
    const p = b.g.localToWorld((tmpW.f ??= new api.THREE.Vector3()).set(0, 0, b.len * 0.55));
    api.churn(p.x, p.z, 0.25, 1.1);
  }
}
function oarRipples(api, oars, k) {
  if (!oars) return;
  for (const o of oars) {
    if (o.dipped === k) continue;
    o.dipped = k;
    const p = worldOf(api, o.blade);
    if (Math.random() < api.WET + 0.2) api.churn(p.x, p.z, 0.16, 0.7);
  }
}

// ---- Sound helpers (call only once api.sfx.live()) ---------------------------------------------------------------
const live = api => api.sfx.live() && api.playing && !api.reduced;
function oarSplash(k, dest, v = 0.05) {
  k.hiss(k.env(k.filt("bandpass", 700 + Math.random() * 300, 0.9, dest), v, 0.03, 0.28), k.now(), 0.4);
  if (Math.random() < 0.4) k.play("plop", dest, { rate: 0.7 + Math.random() * 0.3, gain: v * 2.5 });
}
function cheer(k, dest, n = 7, v = 0.035) {  // a ragged "hooray" from a few throats, rising then falling
  const at = k.now(), f = k.filt("bandpass", 1050, 0.9, dest), f2 = k.filt("bandpass", 2300, 1.2, dest);
  for (let i = 0; i < n; i++) {
    const t0 = at + Math.random() * 0.35, len = 0.55 + Math.random() * 0.5, base = 150 + Math.random() * 170;
    const g = k.env(f, v, 0.07, len, t0), g2 = k.env(f2, v * 0.5, 0.07, len, t0);
    const o = k.osc("sawtooth", base, g, t0, len + 0.2); o.connect(g2);
    o.frequency.linearRampToValueAtTime(base * 1.45, t0 + 0.2); o.frequency.linearRampToValueAtTime(base * 1.15, t0 + len);
  }
  k.hiss(k.env(k.filt("bandpass", 1600, 0.6, dest), v * 1.2, 0.12, 1.2, at), at, 1.6);
  k.note("cheer");
}
function chime(k, dest, notes, v = 0.05, gap = 0.12) { notes.forEach((f, i) => k.bell(dest, v, f, k.now() + i * gap)); k.note("chime"); }
const PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349];

// ---- 1. Treasure hunt: a chest hauled aboard and opened ---------------------------------------------------------
function chest(api) {
  const T = api.THREE, g = new T.Group(), W = 1.5, H = 0.8, D = 0.95;
  const wood = mat(api, "chestWood", T => new T.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.8 }));
  const base = new T.Mesh(new T.BoxGeometry(W, H, D), wood); base.position.y = H / 2; g.add(base);
  for (const x of [-0.55, 0, 0.55]) { const band = new T.Mesh(new T.BoxGeometry(0.1, H + 0.02, D + 0.02), GOLD(api)); band.position.set(x * W, H / 2, 0); g.add(band); }
  const heap = new T.Mesh(new T.BoxGeometry(W * 0.92, 0.1, D * 0.9), mat(api, "heap", T => new T.MeshStandardMaterial({ color: 0xffd25a, emissive: 0xffa520, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.6 })));
  heap.position.y = H - 0.08; g.add(heap);
  const hinge = new T.Group(); hinge.position.set(0, H, -D / 2); g.add(hinge);
  const lidGeo = new T.CylinderGeometry(D / 2, D / 2, W, 14, 1, false, 0, Math.PI); lidGeo.rotateZ(Math.PI / 2); lidGeo.rotateX(Math.PI / 2);
  const lid = new T.Mesh(lidGeo, wood); lid.position.z = D / 2; lid.rotation.x = -Math.PI / 2; hinge.add(lid);
  for (const x of [-0.55, 0.55]) { const b = new T.Mesh(new T.TorusGeometry(D / 2 + 0.01, 0.05, 4, 14, Math.PI), GOLD(api)); b.rotation.y = Math.PI / 2; b.position.set(x * W, 0, D / 2); hinge.add(b); }
  const lock = new T.Mesh(new T.BoxGeometry(0.24, 0.3, 0.06), GOLD(api)); lock.position.set(0, H - 0.05, D / 2 + 0.03); g.add(lock);
  const ring = new T.Mesh(new T.TorusGeometry(0.16, 0.035, 5, 10), IRON(api)); ring.position.set(0, H + D / 2 + 0.12, 0); hinge.add(ring); ring.position.set(0, D / 2 + 0.1, D / 2);
  const shine = glow(api, 0xffc850, 4.5); shine.position.y = H + 0.3; g.add(shine);
  return { g, hinge, shine, ring, H };
}
function grapnel(api) {
  const T = api.THREE, g = new T.Group();
  const shank = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.7, 5), IRON(api)); g.add(shank);
  for (let k = 0; k < 3; k++) {
    const t = new T.Mesh(new T.TorusGeometry(0.22, 0.04, 4, 8, Math.PI * 0.6), IRON(api));
    t.rotation.set(0, k * Math.PI * 2 / 3, Math.PI * 1.1); t.position.y = -0.2; g.add(t);
  }
  return g;
}
registerMock({
  id: "treasure-hunt", title: "Treasure hunt (Seerr)", tier: "cine",
  card: { kicker: "Achievement · Treasure hunt", title: POSTER.martian[1], facts: "Requested 2 Mar · arrived 9 Mar · watched that same evening", poster: POSTER.martian[0] },
  off: 11, part: 0.4, stirR: 7, look: -4, crew: [2.1, 5.7, 6.2],
  build(api, it) {
    const T = api.THREE, s = it.side;
    it.c3 = chest(api); it.c3.g.scale.setScalar(1.2); it.group.add(it.c3.g);
    it.hook = grapnel(api); it.hook.visible = false; it.group.add(it.hook);
    it.line = rope(api, it.group, 14); it.line.hide();
    it.head = new T.Object3D(); it.group.add(it.head);
    // The poster rises out of the gold, glowing
    const pm = new T.MeshBasicMaterial({ map: posterTex(api, POSTER.martian[0]), transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false });
    it.poster = new T.Mesh(new T.PlaneGeometry(0.9, 1.35), pm); it.group.add(it.poster);
    it.posterGlow = glow(api, 0xffd27a, 3.2); it.group.add(it.posterGlow);
    it.coins = Array.from({ length: api.lite ? 6 : 12 }, () => {
      const c = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.03, 10), GOLD(api)); c.visible = false; it.group.add(c);
      return { c, v: new T.Vector3(), p: new T.Vector3(), r: Math.random() * 10 };
    });
    if (!api.lite) { it.light = new T.PointLight(0xffb84a, 0, 9, 1.6); it.group.add(it.light); }
    it.pts = { hand: new T.Vector3(), hull: new T.Vector3(), rail: new T.Vector3(), deck: new T.Vector3(), c: new T.Vector3() };
    it.s = s; it.q = new T.Quaternion(); it.up = new T.Vector3(0, 1, 0);
  },
  onShot(api, it) { it.T = 0; },
  animate(api, it, dt, dd) {
    tick(api, it);
    follow(api, it, it.s * 11, -2.5);
    const s = it.s, t = api.time, up = it.emerge ?? 1, T = it.T ?? -1, c = it.c3, P = it.pts;
    // Where things are this frame: the hauler's hand at the rail, the hull below it, over the rail, on the deck
    fromShip(api, it, P.hand.set(s * 2.4, 3.3, 0.6)); fromShip(api, it, P.rail.set(s * 2.3, 4.2, 0.4)); fromShip(api, it, P.deck.set(s * 1.1, DECK, 0.4));
    P.hull.set(s * 3.9 - it.ax, 0, 0.5 - it.az);
    const float = (x, z) => seaAt(api, it, x, z) - 0.45 + Math.sin(t * 1.7) * 0.12;
    let pos = P.c, yaw = -s * Math.PI / 2 + Math.sin(t * 0.6) * 0.2, tilt = Math.sin(t * 1.3) * 0.12;
    if (T < 1.2) {  // bobbing, under the stir until the shot brings it up
      pos.set(0, float(0, 0) - 3.2 * (1 - up), 0);
    } else if (T < 3.6) {  // hauled in, hand over hand, in tugs
      const u = ease(1.2, 3.6, T), tug = Math.max(0, Math.sin((T - 1.2) * 9)) * 0.05;
      const k = Math.min(1, u + tug);
      pos.set(lerp(0, P.hull.x, k), 0, lerp(0, P.hull.z, k)); pos.y = float(pos.x, pos.z) + 0.1;
      yaw = lerp(-s * Math.PI / 2, -s * Math.PI / 2 * 0.6, u); tilt = -s * 0.15 * Math.sin(T * 9);
    } else if (T < 5.0) {  // up the side, over the rail and down on the deck
      const u = ease(3.6, 4.5, T), v = ease(4.5, 5.0, T);
      const a = pos.set(P.hull.x, float(P.hull.x, P.hull.z), P.hull.z).lerp(P.rail, u);
      a.lerp(P.deck, v); yaw = lerp(-s * Math.PI / 2 * 0.6, 0.25 * s, ease(3.6, 5.0, T)); tilt = Math.sin(T * 5) * 0.12 * (1 - v);
    } else { pos.copy(P.deck); yaw = 0.25 * s; tilt = 0; }
    c.g.position.copy(pos); c.g.rotation.set(tilt * 0.6, yaw, tilt);
    if (T >= 5) c.g.quaternion.copy(it.group.quaternion).invert().multiply(api.ship.quaternion).multiply(it.q.setFromAxisAngle(it.up, yaw));  // on the deck, rocking with the ship
    // The grapnel thrown from the rail, catching the chest's ring, and the rope hauled taut
    const ringAt = c.ring.getWorldPosition(new api.THREE.Vector3()); it.group.worldToLocal(ringAt);
    if (T >= 0.5 && T < 5.0) {
      it.hook.visible = true;
      const u = ease(0.5, 1.2, T);
      if (u < 1) { it.hook.position.lerpVectors(P.hand, ringAt, u); it.hook.position.y += 3.5 * Math.sin(u * Math.PI); it.hook.rotation.set(T * 9, 0, T * 7); }
      else { it.hook.position.copy(ringAt); it.hook.rotation.set(Math.PI, 0, 0); }
      it.line.set(P.hand, it.hook.position, u < 1 ? 0.4 : T < 3.6 ? 0.25 * (1 - Math.max(0, Math.sin((T - 1.2) * 9))) : 0.02);
    } else { it.hook.visible = false; it.line.hide(); }
    // Open: the lid swings back, gold light spills out, coins jump and the poster rises out of it
    const open = ease(5.3, 5.9, T), shine = T < 0 ? 0 : open * (0.85 + 0.15 * Math.sin(t * 5));
    c.hinge.rotation.x = -1.95 * open;
    c.shine.material.opacity = shine * 0.9; c.shine.scale.setScalar(3 + 2.5 * open);
    if (it.light) { it.light.position.copy(c.g.position).y += 1.2; it.light.intensity = shine * 14; }
    const rise = ease(5.4, 6.3, T) * (T > 9.5 ? Math.max(0, 1 - (T - 9.5) / 1.5) : 1);
    it.poster.material.opacity = rise; it.poster.visible = rise > 0.01;
    it.poster.position.copy(c.g.position); it.poster.position.y += 0.9 + rise * 1.5 + Math.sin(t * 1.4) * 0.06;
    it.poster.quaternion.copy(it.group.quaternion).invert().multiply(api.camera.quaternion);  // facing the crew
    it.posterGlow.position.copy(it.poster.position); it.posterGlow.material.opacity = rise * 0.6; it.posterGlow.scale.setScalar(2.6 + Math.sin(t * 3) * 0.2);
    if (T >= 5.4 && !it.burst) {
      it.burst = true;
      for (const k of it.coins) { k.c.visible = true; k.p.copy(c.g.position).y += c.H; k.v.set((Math.random() - 0.5) * 2.2, 3 + Math.random() * 2.5, (Math.random() - 0.5) * 2.2); }
    }
    const rdt = Math.min(0.05, dt / 0.4);
    for (const k of it.coins) if (k.c.visible) {
      k.v.y -= 9 * rdt; k.p.addScaledVector(k.v, rdt);
      if (k.p.y < P.deck.y + 0.03) { k.p.y = P.deck.y + 0.03; k.v.multiplyScalar(0.3); k.v.y = Math.abs(k.v.y) * 0.4; }
      k.c.position.copy(k.p); k.c.rotation.set(T * 6 + k.r, k.r, T * 4);
    }
    // The crew watch the chest, then the gold
    it.head.position.copy(c.g.position); it.head.position.y += T < 5 ? 0.5 : 1.0 + rise * 1.7;
    it.head.position.y = Math.max(it.head.position.y, 2.05);
  },
  water(api, it, dt) {
    const T = it.T ?? 0, p = worldOf(api, it.c3.g);
    if (!it.popped && (it.emerge ?? 1) > 0.75) {
      it.popped = true; api.ring(p.x, p.z, 0.6); api.spray(50 * api.WET, p.x, p.z, api.seaHeight(p.x, p.z), 1.2, 5, 1.8);
      if (live(api) && api.sfx.bus) api.sfx.play("splash", api.sfx.bus, { rate: 1.4, gain: 0.35 });
    }
    it.foamT = (it.foamT ?? 0) - dt;
    if (T < 3.6 && it.foamT < 0) {
      const hauled = T > 1.2;
      it.foamT = hauled ? 0.16 : 0.6;
      api.churn(p.x, p.z, hauled ? 0.5 : 0.35, hauled ? 1.6 : 2);
      if (hauled && Math.random() < 0.6 * api.WET + 0.2) api.spray(6 * api.WET + 2, p.x, p.z, api.seaHeight(p.x, p.z), 0.8, 2.2, 1.2);
    }
    if (T > 3.6 && T < 4.6) { it.dripT = (it.dripT ?? 0) - dt; if (it.dripT < 0) { it.dripT = 0.08; api.drip(4, p, api.seaHeight(p.x, p.z), 0.6); } }
    if (T > 1.2 && !it.caught) { it.caught = true; if (live(api) && api.sfx.bus) { api.sfx.bell(api.sfx.bus, 0.05, 820); api.sfx.note("grapnel clink"); } }
    if (T > 3.6 && !it.lifted) { it.lifted = true; if (live(api) && api.sfx.bus) api.sfx.play("creaks", api.sfx.bus, { rate: 1.1, gain: 0.5 }); }
    if (T > 5.0 && !it.landed) { it.landed = true; if (live(api) && api.sfx.bus) { const k = api.sfx; k.osc("sine", 90, k.env(k.bus, 0.25, 0.005, 0.25), k.now(), 0.3); k.note("thump"); } }
    if (T > 5.3 && !it.opened) { it.opened = true; if (live(api) && api.sfx.bus) { chime(api.sfx, api.sfx.bus, [784, 988, 1175, 1568, 1976], 0.06, 0.1); api.sfx.hiss(api.sfx.env(api.sfx.filt("highpass", 5000, 0.5, api.sfx.bus), 0.03, 0.4, 1.6), api.sfx.now(), 2.2); } }
  },
  sfx(api, it, bus) {  // the rope creaking and the sea slapping on the chest
    const k = api.sfx;
    return () => {
      const T = it.T ?? 0;
      if (T > 1.2 && T < 3.6) { k.play("creaks", bus, { rate: 1.3 + Math.random() * 0.3, gain: 0.25 }); oarSplash(k, bus, 0.06); return 0.5; }
      if (T < 1.2) { k.play("plop", bus, { rate: 1 + Math.random() * 0.3, gain: 0.3 }); return 0.8; }
      return 1.5;
    };
  },
});

// ---- 2. Shared the spoils: longboats come alongside and crates are lowered to them -------------------------------
// Five longboats row in off the quarter, each to its own berth a little off our side (a loose, staggered line, fenders
// out), surging on each stroke and coasting into place. A cargo boom on the rail over each berth hoists a crate off the
// deck, swings it out and lowers it into the boat's sheets, one boat after another, and the boat dips under it. Each
// crew cheers as theirs lands; then all toss oars in salute and peel away, rowing off as we sail on.
const SPOILS = { crews: 5, hours: 62 };
const SP_LEN = 3.2, SP_CRATE = 0.55;
// Each boat's berth in the ship's frame [out, aft] (its middle), clear of the bow wave's foam, and where its crate goes:
// the stern sheets (+1) or, for the two aft, under the quarter and astern, the bow sheets (-1)
const SP_BERTH = [[4.75, -2.4, 1], [5.15, 1.4, 1], [4.6, 5.2, 1], [4.6, 9.0, -1], [3.9, 12.8, -1]];
// The choreography, in seconds of the crew's-eye shot (7.5 s; the camera then cranes out to the chase view)
const SP_T = {
  arrive: i => 1.4 + i * 0.22,          // in at the berth
  crate: i => 1.6 + i * 0.38,           // its crate starts up off the deck: 0.3 s hoist, 0.4 s swing out, 0.6 s down
  salute: i => 5.3 + i * 0.07,          // oars tossed upright
  away: i => 5.85 + i * 0.1,            // oars down and pulling away
  loose: 6.7,                           // the boats stop keeping pace: we sail on and they fall astern
};
const SP_HOIST = 0.3, SP_SWING = 0.4, SP_DOWN = 0.6, SP_LAND = SP_HOIST + SP_SWING + SP_DOWN;
// The rail over a point along the hull, in the ship's frame: the forecastle's, the waist's, the quarterdeck's
const spRail = z => z < -3.2 ? { x: 2.4, y: 3.0, z: Math.max(z, -4.6) } : z < 4.6 ? { x: 2.6, y: 2.35, z } : z < 8.6 ? { x: 2.55, y: 4.1, z } : { x: 2.0, y: 4.2, z: 8.9 };
// A stroke, phase 0-1: the catch (blades drop in), the drive (the pull: blades sweep aft, the rower leans back), the
// extraction (blades out and feathered flat), the recovery (swinging forward again) and squaring the blades for the next
const spStroke = ph => {
  const sm = (a, b) => ease(a, b, ph);
  const sweep = ph < 0.47 ? lerp(0.62, -0.5, sm(0.06, 0.45)) : lerp(-0.5, 0.62, sm(0.5, 0.9));
  const lift = ph < 0.07 ? lerp(0.14, -0.26, sm(0, 0.07)) : ph < 0.44 ? -0.26 : ph < 0.52 ? lerp(-0.26, 0.16, sm(0.44, 0.52)) : lerp(0.16, 0.14, sm(0.52, 1));
  const feather = ph < 0.44 ? 0 : ph < 0.53 ? sm(0.44, 0.53) : 1 - sm(0.86, 0.98);
  const lean = ph < 0.47 ? lerp(0.32, -0.3, sm(0.04, 0.42)) : lerp(-0.3, 0.32, sm(0.5, 0.85));  // + toward the stern (the rower's forward)
  const reach = ph < 0.47 ? lerp(1, 0, sm(0.25, 0.47)) : sm(0.47, 0.62);  // arms out straight (1) or drawn in to the chest (0)
  return { sweep, lift, feather: feather * Math.PI / 2, lean, reach };
};
// The boat's speed through the water over a stroke: quickest late in the drive, slowest as the blades catch
const spSurge = ph => Math.sin(2 * Math.PI * (ph - 0.12));
let spFoam;
function spFoamTex(api) {  // a soft white V of foam, its point at the top edge, fading down its length
  return spFoam ??= api.canvasTexture(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineCap = "round";
    for (const [lw, a] of [[10, 0.18], [5, 0.4], [2, 0.75]]) {
      g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = lw;
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(w / 2, 4); g.quadraticCurveTo(w / 2 + sd * w * 0.12, h * 0.35, w / 2 + sd * w * 0.44, h - 4); g.stroke(); }
    }
    const fade = g.createLinearGradient(0, 0, 0, h); fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, "rgba(0,0,0,1)");
    g.globalCompositeOperation = "destination-out"; g.fillStyle = fade; g.fillRect(0, 0, w, h);
  });
}
function spFoamPlane(api, w, l) {
  const T = api.THREE, geo = new T.PlaneGeometry(w, l).rotateX(-Math.PI / 2); geo.translate(0, 0, l / 2);  // from z = 0 back to l
  return new T.Mesh(geo, new T.MeshBasicMaterial({ map: spFoamTex(api), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
}
// A longboat for the spoils: the rowing boat's hull and flag, two thwarts with a rower and a pair of oars each (the
// oarlocks a little aft of the thwart, the blades squared to pull), a lantern hung from a crook at the stern, fenders
// over the side that will lie against our hull, and a bow wave and wake
function spBoat(api, i, s) {
  const T = api.THREE, b = rowboat(api, SP_LEN, BOATS[i % BOATS.length], { rowers: 0, lantern: false, flag: [0xc8402e, 0xf2e3b8, 0x2f6d9a, 0xe8b33c, 0x3f8a52][i % 5] });
  const { g, len, w, h } = b, shirts = [0xe8e0d0, 0xc8402e, 0x2f4f7a, 0x7a5a2e, 0x3f6a3a];
  b.oars = []; b.rowers = [];
  for (const [r, z] of [-0.42, 0.42].entries()) {
    const seat = new T.Mesh(new T.BoxGeometry(w * 0.86, 0.07, 0.26), api.mats.wood); seat.position.set(0, h * 0.42, z); g.add(seat);
    const sl = sailor(api, shirts[(i * 2 + r) % shirts.length], g, z, h * 0.46); sl.s.scale.setScalar(0.92); b.rowers.push(sl);
    for (const sd of [1, -1]) {
      const pivot = new T.Group(); pivot.position.set(sd * w * 0.47, h * 0.74, z + 0.3); g.add(pivot);
      const oar = new T.Group(); pivot.add(oar);
      const L = 2.3, inb = 0.55, shaft = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, L, 5), api.mats.wood);
      shaft.rotation.z = Math.PI / 2; shaft.position.x = sd * (L / 2 - inb); oar.add(shaft);
      const blade = new T.Mesh(new T.BoxGeometry(0.46, 0.17, 0.035), api.mats.wood); blade.position.x = sd * (L - inb - 0.2); oar.add(blade);
      b.oars.push({ pivot, oar, sd, blade, r });
    }
  }
  // The lantern swings from a crook on the stern pole
  const pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.3, 5), api.mats.wood); pole.position.set(0, h * 0.7 + 0.65, len * 0.43); g.add(pole);
  const arm = new T.Mesh(new T.BoxGeometry(0.04, 0.04, 0.32), api.mats.wood); arm.position.set(0, h * 0.7 + 1.28, len * 0.43 - 0.14); g.add(arm);
  b.lampP = new T.Group(); b.lampP.position.set(0, h * 0.7 + 1.26, len * 0.43 - 0.28); g.add(b.lampP);
  const lamp = new T.Mesh(new T.BoxGeometry(0.17, 0.24, 0.17), mat(api, "lamp", T => new T.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb43c, emissiveIntensity: 1.4 })));
  lamp.position.y = -0.17; b.lampP.add(lamp);
  b.glow = glow(api, 0xffc060, 1.3, 0.8); b.glow.position.y = -0.17; b.lampP.add(b.glow);
  // Fenders: short dark bolsters hung over the side that lies against us
  const fm = mat(api, "fender", T => new T.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.95 }));
  b.fenders = [-0.75, 0.55].map(z => { const f = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.28, 6), fm); f.position.set(-s * (w * 0.5 + 0.03), h * 0.5, z); g.add(f); return f; });
  // Bow wave and wake: soft Vs of foam on the water, as bright as she is quick
  b.bowW = spFoamPlane(api, 1.5, 1.3); b.bowW.position.set(0, h * 0.25 + 0.03, -len * 0.5); g.add(b.bowW);
  b.wake = spFoamPlane(api, 1.7, 3.4); b.wake.position.set(0, h * 0.25 + 0.03, len * 0.42); g.add(b.wake);
  // A cap to wave: in the bow rower's hand while the crew cheers
  b.hat = new T.Mesh(new T.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(api, "cap", T => new T.MeshStandardMaterial({ color: 0x8a2a22, roughness: 0.9 })));
  b.hat.rotation.x = Math.PI; b.hat.position.y = -0.62; b.hat.visible = false; b.rowers[0].arms[0].add(b.hat);
  b.rowers[0].cap = b.rowers[0].body.children[2];
  return b;
}
// A cargo boom on our rail: a spar from a heel on the rail up and out to a block over the berth, swinging on the heel
function spBoom(api, parent, base, R, H) {
  const T = api.THREE, g = new T.Group(); g.position.set(base.x, base.y, base.z); parent.add(g);
  const len = Math.hypot(R, H), spar = new T.Mesh(new T.CylinderGeometry(0.05, 0.07, len, 6), api.mats.wood);
  spar.position.set(R / 2, H / 2, 0); spar.rotation.z = -Math.atan2(R, H); g.add(spar);
  const block = new T.Mesh(new T.BoxGeometry(0.16, 0.22, 0.12), IRON(api)); block.position.set(R, H - 0.1, 0); g.add(block);
  const heel = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 0.25, 8), IRON(api)); g.add(heel);
  return g;
}
registerMock({
  id: "shared-spoils", title: "Shared the spoils (Seerr)", tier: "cine", hidden: false,
  card: { kicker: "Achievement · Shared the spoils", title: POSTER.spidey[1], facts: `${SPOILS.crews} crews enjoyed your haul · ${SPOILS.hours} h between them`, poster: POSTER.spidey[0] },
  off: 6, crew: [12.5, 5.2, -6.5], look: -4.6,
  build(api, it) {
    const T = api.THREE, s = it.side;
    it.s = s; it.head = new T.Object3D(); it.group.add(it.head);
    it.deck = onShip(api, it);
    it.boats = SP_BERTH.map(([bx, bz, end], i) => {
      const b = spBoat(api, i, s);
      b.x = s * bx; b.z = bz; b.end = end;
      b.from = { x: b.x + s * (3.4 + (i % 2) * 0.5), z: bz + 4.8 + (i % 3) * 0.4 };  // rowing in from out on the quarter
      b.rate = 0.95 + ((i * 0.37) % 0.2); b.ph0 = (i * 0.29) % 1;  // each crew a little out of time with the others
      b.dipY = 0; b.dipV = 0; b.pitchK = 0;
      b.g.visible = false; it.group.add(b.g);
      // Its crate, on our deck under the boom until it is hoisted, and the boom over the rail
      const cz = bz + end * 0.95, rail = spRail(cz), out = new T.Vector2(b.x - s * rail.x, cz - rail.z);
      b.cz = end * 0.95; b.R = out.length(); b.H = Math.max(2.1, b.R * 0.75);
      b.azOut = Math.atan2(-out.y, out.x * 1);  // the boom's swing: rotation.y that points it at the berth
      b.azIn = b.azOut + s * 2.2;  // and stowed inboard, over the deck
      b.boom = spBoom(api, it.deck, { x: s * rail.x, y: rail.y, z: rail.z }, b.R, b.H); b.boom.rotation.y = b.azIn; b.boom.visible = false;
      b.rail = rail;
      b.cargo = crate(api, SP_CRATE, LABELS[(i + 1) % LABELS.length], { lashed: true }); b.cargo.visible = false; it.group.add(b.cargo);
      b.line = rope(api, it.group, 6); b.line.hide();
      b.hook = new T.Mesh(new T.BoxGeometry(0.08, 0.12, 0.08), IRON(api)); b.hook.visible = false; it.group.add(b.hook);
      b.cheerAt = SP_T.crate(i) + SP_LAND + 0.12 + ((i * 0.53) % 0.3); b.cheerTo = 5.1 + ((i * 0.41) % 0.2);
      return b;
    });
    it.tmp = new T.Vector3(); it.tmp2 = new T.Vector3(); it.tmp3 = new T.Vector3();
  },
  onShot(api, it) {
    it.T = 0;
    it.boats.forEach(b => { b.g.visible = b.cargo.visible = b.boom.visible = true; });
  },
  animate(api, it, dt, dd) {
    const rdt = tick(api, it);
    if (it.T === undefined && api.reduced && dd > -1.2) this.onShot(api, it);
    const T = it.T ?? -1, s = it.s, THREE = api.THREE;
    if (T < SP_T.loose || it.ax === undefined) follow(api, it, s * 6, 0);  // keeping pace with the ship until they cast off
    if (T < 0) { it.head.position.set(s * 4.6 - it.ax, 2.1, 1.5 - it.az); return; }
    // The crew's eye: on the boats rowing in, then the boom and boats as the crates go down, then out after them
    // (on a tall screen, nearer the bow, so the nearest boats stay in the narrower view)
    const tall = api.camera.aspect < 1, hx = lerp(lerp(s * 6.6, s * (tall ? 5.0 : 4.4), ease(0.5, 2.0, T)), s * 7.2, ease(5.6, 7.2, T));
    const hz = lerp(lerp(tall ? -0.5 : 4.0, tall ? -2.6 : 2.6, ease(0.5, 2.0, T)), tall ? -1.0 : 3.0, ease(5.6, 7.2, T));
    if (T < SP_T.loose) it.head.position.set(hx - it.ax, 1.6, hz - it.az);
    it.boats.forEach((b, i) => {
      const tx = b.x - it.ax, tz = b.z - it.az, ta = SP_T.arrive(i), away = T - SP_T.away(i);
      // Rowing in on a curve that straightens to lie alongside: each pull surges her on, and she coasts the last of the
      // way in with the oars easy. The surge is a ripple on her clock (zero overall, so she still arrives on time)
      const rowIn = 1 - ease(ta - 0.55, ta - 0.2, T), f = b.rate;
      const ph = (T * f + b.ph0) % 1;
      const tau = T - rowIn * 0.42 / (2 * Math.PI * f) * (Math.cos(2 * Math.PI * (b.ph0 - 0.12)) - Math.cos(2 * Math.PI * (T * f + b.ph0 - 0.12)));
      const u = Math.min(1, Math.max(0, tau / ta)), p = 1 - Math.pow(1 - u, 1.7);
      const P0x = b.from.x - it.ax, P0z = b.from.z - it.az, P1x = lerp(P0x, tx, 0.55), P1z = tz + 4.6, P2x = tx, P2z = tz + 2.4;
      const bz3 = (a, b1, c, d, q) => { const r = 1 - q; return r * r * r * a + 3 * r * r * q * b1 + 3 * r * q * q * c + q * q * q * d; };
      let x = bz3(P0x, P1x, P2x, tx, p), z = bz3(P0z, P1z, P2z, tz, p);
      const dx = bz3(P0x, P1x, P2x, tx, Math.min(1, p + 0.01)) - bz3(P0x, P1x, P2x, tx, Math.max(0, p - 0.01));
      const dz = bz3(P0z, P1z, P2z, tz, Math.min(1, p + 0.01)) - bz3(P0z, P1z, P2z, tz, Math.max(0, p - 0.01));
      let yaw = p < 0.999 ? Math.atan2(-dx, -dz) : 0;
      let speed = p < 1 ? 1.7 * Math.pow(1 - u, 0.7) * (1 + 0.42 * spSurge(ph) * rowIn) : 0;
      // Lying alongside: a slow surge and sheer at the berth
      if (p >= 1) { x += s * Math.sin(T * 1.3 + i) * 0.06; z += Math.sin(T * 0.9 + i * 2) * 0.12; yaw = s * Math.sin(T * 0.8 + i) * 0.03; }
      // Away: a shove off from the side, then pulling out and forward of her berth while we sail on past
      let pull = 0;
      if (away > 0) {
        const turn = ease(0, 1.2, away), run = Math.max(0, away - 0.25);
        const d = 0.25 * Math.min(away, 0.25) + run * 1.5 + run * run * 0.3;
        yaw = lerp(yaw, -s * 1.2, turn);
        x += s * (d * 0.93 + 0.35 * ease(0, 0.4, away)); z += run * run * 0.35 - d * 0.2;
        pull = ease(0.2, 0.6, away); speed = Math.max(speed, pull * (1 + 0.4 * spSurge(ph)));
      }
      // Riding the swell, rocking more with the crew on their feet, and dipping under the crate as it lands
      const cheering = ease(b.cheerAt, b.cheerAt + 0.3, T) * (1 - ease(b.cheerTo, b.cheerTo + 0.35, T));
      b.dipV += (-b.dipY * 70 - b.dipV * 5.5) * rdt; b.dipY += b.dipV * rdt;
      b.pitchK += (-b.pitchK * 6) * rdt;
      const y = seaAt(api, it, x, z), yb = seaAt(api, it, x - Math.sin(yaw) * 1.3, z - Math.cos(yaw) * 1.3), ys = seaAt(api, it, x + Math.cos(yaw) * 0.7, z - Math.sin(yaw) * 0.7);
      const roll = (ys - y) * 0.5 + Math.sin(T * 1.6 + i) * (0.035 + cheering * 0.07) + Math.sin(T * 5.3 + i) * cheering * 0.025;
      const pitch = (yb - y) * 0.5 + Math.sin(T * 1.25 + x) * 0.025 - speed * 0.04 - b.dipY * 0.6 * b.end;
      b.g.position.set(x, y + b.dipY + Math.sin(T * 3 + i) * cheering * 0.02, z);
      b.g.rotation.set(pitch, yaw, roll);
      b.speed = speed;
      b.bowW.material.opacity = Math.min(1, speed * 0.85) * 0.85; b.wake.material.opacity = Math.min(1, speed * 0.8) * 0.7;
      b.bowW.scale.set(0.8 + speed * 0.25, 1, 0.7 + speed * 0.3); b.wake.scale.set(1, 1, 0.5 + speed * 0.4);
      // The oars: pulling while she comes in and goes; easy (just clear of the water) as she runs in; at the berth the
      // inboard pair laid along the gunwale and the outboard pair holding water with an easy paddle; tossed in salute
      const easy = ease(ta - 0.55, ta - 0.2, T) * (1 - pull), berth = ease(ta - 0.15, ta + 0.35, T) * (1 - pull);
      const salute = ease(SP_T.salute(i), SP_T.salute(i) + 0.3, T) * (1 - ease(SP_T.away(i) - 0.15, SP_T.away(i) + 0.15, T));
      const hold = spStroke((T * 0.55 + b.ph0) % 1);
      b.fenders.forEach(m => { m.visible = T > ta - 0.6 && away < 0.3; });  // put out as she comes alongside, in as she leaves
      const st = spStroke(ph);
      b.dip = null;
      for (const o of b.oars) {
        const inb = o.sd === -s;  // the side against our hull (the boat lies parallel, so her x is ours)
        let sweep = lerp(st.sweep, 0.05, easy), lift = lerp(st.lift, 0.12, easy), feather = lerp(st.feather, Math.PI / 2, easy), slide = 0;
        if (berth > 0) {
          const bs = inb ? -Math.PI / 2 + 0.05 : hold.sweep * 0.35, bl = inb ? 0.02 : lerp(0.1, hold.lift, 0.5), bf = inb ? Math.PI / 2 : hold.feather;
          sweep = lerp(sweep, bs, berth); lift = lerp(lift, bl, berth); feather = lerp(feather, bf, berth); slide = inb ? -0.6 * berth : 0;
        }
        if (salute > 0) { sweep = lerp(sweep, 0, salute); lift = lerp(lift, 1.45, salute); feather = lerp(feather, 0, salute); slide = lerp(slide, 0.2, salute); }
        o.pivot.rotation.set(0, o.sd * sweep, o.sd * lift); o.oar.rotation.x = feather; o.oar.position.x = o.sd * slide;
      }
      // Blades going in: a dimple and a few drops where each dips (one side at a time, to spare the foam)
      const rowing = Math.max(rowIn * (p < 1 ? 1 : 0), pull);
      if (rowing > 0.5) {
        const k = Math.floor(T * f + b.ph0);
        if (ph > 0.07 && ph < 0.3 && b.dipK !== k) { b.dipK = k; b.dip = b.oars.filter(o => o.r === k % 2 && (!api.lite || o.sd === s)); }
      }
      // The rowers: leaning into each stroke; sitting easy at the berth (the stroke reaching up to guide the crate
      // down); up on their feet waving as their crate lands, a cap or two in the air; seated, holding the tossed oars
      b.rowers.forEach((r, k) => {
        const lag = k * 0.11, ch = ease(b.cheerAt + lag, b.cheerAt + lag + 0.25, T) * (1 - ease(b.cheerTo + lag, b.cheerTo + lag + 0.3, T));
        const work = Math.max(rowing, 1 - berth) * (1 - salute);
        const guide = k === (b.end > 0 ? 1 : 0) ? ease(SP_T.crate(i) + 0.75, SP_T.crate(i) + 1.0, T) * (1 - ease(SP_T.crate(i) + SP_LAND, SP_T.crate(i) + SP_LAND + 0.25, T)) : 0;
        const lean = lerp(0.05 * Math.sin(T * 1.2 + i + k), st.lean, work * (1 - easy * 0.7));
        const reachA = -lerp(0.8, 1.45, st.reach);
        const bounce = Math.abs(Math.sin(T * (7.5 + k + i * 0.3) + k * 1.7));
        r.s.position.y = b.h * 0.46 + ch * (0.28 + bounce * 0.07);
        r.body.rotation.set(lean * (1 - ch) - ch * 0.12, ch * Math.sin(T * 2.2 + k) * 0.3, ch * Math.sin(T * 3.1 + k * 2 + i) * 0.12);
        const restA = lerp(-0.25, reachA, work), saluteA = -1.25;
        r.arms.forEach((a, n) => {
          const wave = Math.PI - 0.35 + Math.sin(T * (8.5 + n * 1.3 + k * 0.7) + n * 2.1 + i) * 0.45;
          const up = n === 0 || ((T * 0.9 + k + i) % 2 < 1.3);  // the second arm comes and goes
          let ax = lerp(restA, saluteA, salute);
          ax = lerp(ax, -2.6 * b.end, guide);
          ax = lerp(ax, up ? wave : -0.3, ch);
          a.rotation.x = ax; a.rotation.z = (n ? -1 : 1) * (0.06 + ch * (0.35 + 0.15 * Math.sin(T * 6 + n)));
        });
        if (k === 0 && i % 2 === 0) { const waving = ch > 0.5; b.hat.visible = waving; r.cap.visible = !waving; }
      });
      // The lantern swings against the roll and pitch; the flag streams and flutters
      b.lampP.rotation.set(-pitch * 1.6 + Math.sin(T * 2.4 + i) * 0.08 * (1 + cheering * 2), 0, -roll * 1.6 + Math.sin(T * 2.1 + i * 1.7) * 0.1 * (1 + cheering * 2));
      b.glow.material.opacity = 0.62 + 0.18 * Math.sin(api.time * 7 + i);
      if (b.flag) b.flag.rotation.y = Math.sin(T * 5 + i) * 0.25 + 0.5 + Math.sin(T * 11 + i) * 0.08;
      b.g.updateMatrix();
      this.crate(api, it, b, i, T, rdt);
    });
  },
  // A crate's trip: hoisted off our deck under the boom, swung out over the rail, lowered into the boat, which dips
  // under it as it settles; then the hook goes back up and the boom swings in
  crate(api, it, b, i, T, rdt) {
    const t = T - SP_T.crate(i), s = it.s, v = it.tmp, w = it.tmp2;
    const swing = ease(SP_HOIST, SP_HOIST + SP_SWING, t), back = ease(SP_LAND + 0.25, SP_LAND + 0.9, t);
    b.boom.rotation.y = lerp(lerp(b.azIn, b.azOut, swing), b.azIn, back);
    if (b.cargo.parent === b.g) {  // in the boat: just a settling bump, and the empty hook going home
      b.settle = (b.settle ?? 0) + rdt;
      const k = Math.exp(-b.settle * 7);
      b.cargo.position.set(0, b.top + Math.abs(Math.sin(b.settle * 16)) * 0.05 * k, b.cz); b.cargo.rotation.set(Math.sin(b.settle * 13) * 0.05 * k, 0.04 * b.end, 0);
      if (t < SP_LAND + 0.9) {
        const head = this.head(api, it, b, v), up = ease(SP_LAND + 0.1, SP_LAND + 0.7, t);
        const hook = w.copy(this.spot(b, it.tmp3)).lerp(it.tmp3.copy(head).setY(head.y - 0.35), up);
        b.hook.position.copy(hook); b.hook.visible = true; b.line.set(head, hook, 0.15 * (1 - up));
      } else { b.hook.visible = false; b.line.hide(); }
      return;
    }
    const head = this.head(api, it, b, v);
    if (t < 0) {  // waiting on our deck under the stowed boom
      fromShip(api, it, w.set(s * b.rail.x + Math.cos(b.azIn) * b.R, b.rail.y - 0.9, b.rail.z - Math.sin(b.azIn) * b.R));
      b.cargo.position.copy(w); b.cargo.rotation.set(0, 0.1 * i, 0); b.line.hide(); b.hook.visible = false;
      return;
    }
    // Up off the deck to dangle under the block, out over the side, then down into the boat, slowing at the last
    const deck = fromShip(api, it, w.set(s * b.rail.x + Math.cos(b.azIn) * b.R, b.rail.y - 0.9, b.rail.z - Math.sin(b.azIn) * b.R));
    const hang = 0.95 + b.cargo.userData.h, p = b.cargo.position;
    const spot = this.spot(b, it.tmp3);
    const hoist = ease(0, SP_HOIST, t), down = ease(SP_HOIST + SP_SWING - 0.05, SP_LAND, t);
    if (t < SP_HOIST) p.copy(deck).lerp(w.copy(head).setY(head.y - hang), hoist);
    else {
      p.copy(head); p.y -= hang;
      p.lerp(spot, Math.pow(down, 0.8)); p.x = lerp(head.x, spot.x, down * down); p.z = lerp(head.z, spot.z, down * down);
    }
    // swinging a little as the boom stops and starts
    const sw = Math.sin(t * 9) * 0.16 * Math.sin(Math.PI * Math.min(1, t / (SP_HOIST + SP_SWING + 0.3)));
    b.cargo.rotation.set(sw * 0.6, Math.sin(t * 3.5) * 0.25 * (1 - down) + lerp(0, b.g.rotation.y, down), sw);
    b.line.set(head, w.copy(p).setY(p.y + b.cargo.userData.h), 0.02);
    b.hook.visible = true; b.hook.position.copy(p).setY(p.y + b.cargo.userData.h + 0.06);
    if (t >= SP_LAND) {  // landed: it rides with the boat from here
      b.g.add(b.cargo); b.settle = 0; b.dipV -= 0.9; b.landed = true; b.thud = true;
      b.cargo.position.set(0, b.top, b.cz);
    }
  },
  head(api, it, b, out) {  // the boom's block, in the group's frame
    const s = it.s, a = b.boom.rotation.y;
    return fromShip(api, it, out.set(s * b.rail.x + Math.cos(a) * b.R, b.rail.y + b.H - 0.22, b.rail.z - Math.sin(a) * b.R));
  },
  spot(b, out) { return out.set(0, b.top, b.cz).applyMatrix4(b.g.matrix); },  // the boat's sheets, in the group's frame
  water(api, it, dt) {
    if (it.T === undefined) return;
    const T = it.T, k = api.sfx, on = live(api) && k.bus;
    it.boats.forEach((b, i) => {
      if (b.dip) {
        for (const o of b.dip) {
          const p = worldOf(api, o.blade), sea = api.seaHeight(p.x, p.z);
          api.churn(p.x, p.z, 0.16, 0.55);
          if (!api.lite) api.spray(3, p.x, p.z, sea, 0.15, 1.3, 0.35);
        }
        if (on && i < 3 && (T < 2.4 || T > 5.85)) oarSplash(k, k.bus, T > 5.85 ? 0.022 : 0.03);
        b.dip = null;
      }
      if (b.speed > 0.6 && !api.lite) {  // a little foam churned at the stern while she is quick
        b.foamT = (b.foamT ?? (i * 0.07)) - dt;
        if (b.foamT < 0) { b.foamT = 0.7; const p = b.g.localToWorld(it.tmp.set(0, 0, b.len * 0.55)); api.churn(p.x, p.z, 0.14, 0.8); }
      }
      if (!b.creaked && T > SP_T.crate(i)) { b.creaked = true; if (on) k.play("creaks", k.bus, { rate: 1.25 + i * 0.07 + Math.random() * 0.15, gain: 0.22 }); }
      if (b.thud) {
        b.thud = false; const p = worldOf(api, b.cargo); api.churn(p.x, p.z, 0.3, 1.2);
        if (on) { k.play("plop", k.bus, { rate: 0.6, gain: 0.3 }); k.osc("sine", 105 + i * 6, k.env(k.bus, 0.15, 0.005, 0.18), k.now(), 0.22); }
      }
    });
    if (T > 4.45 && !it.cheered) { it.cheered = true; if (on) { cheer(k, k.bus, 10, 0.04); chime(k, k.bus, [659, 784, 1047], 0.04, 0.14); } }
    if (T > 2.95 && !it.hurrah) { it.hurrah = true; if (on) cheer(k, k.bus, 3, 0.022); }  // the first crew, as theirs lands
  },
  sfx(api, it, bus) {  // the boats creaking and the sea slapping their sides while they lie alongside
    const k = api.sfx;
    return () => {
      const T = it.T ?? 0;
      if (T > 1.8 && T < 5.9 && Math.random() < 0.5) k.hiss(k.env(k.filt("lowpass", 420, 0.7, bus), 0.025, 0.06, 0.35), k.now(), 0.5);
      return 0.45 + Math.random() * 0.3;
    };
  },
});

// ---- 3. Flagship of the armada: a trail of lanterns in our wake, and a fleet following it ---------------------------
// (alternatives considered: a lighthouse we lit with ships converging on it; ships falling in behind one by one)
const TRAIL = { rank: "3rd", crews: 14 };
function lanternBuoy(api) {
  const T = api.THREE, g = new T.Group();
  const flt = new T.Mesh(new T.CylinderGeometry(0.45, 0.35, 0.6, 10), mat(api, "buoyRed", T => new T.MeshStandardMaterial({ color: 0xb8352a, roughness: 0.7 })));
  flt.position.y = 0.1; g.add(flt);
  const band = new T.Mesh(new T.CylinderGeometry(0.46, 0.44, 0.15, 10), mat(api, "buoyWhite", T => new T.MeshStandardMaterial({ color: 0xf2e9d6, roughness: 0.7 }))); band.position.y = 0.25; g.add(band);
  const pole = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.3, 5), IRON(api)); pole.position.y = 1.0; g.add(pole);
  const lit = new T.MeshStandardMaterial({ color: 0x6b5a3a, emissive: 0xffb040, emissiveIntensity: 0, roughness: 0.5 });
  const lamp = new T.Mesh(new T.BoxGeometry(0.3, 0.38, 0.3), lit); lamp.position.y = 1.75; g.add(lamp);
  const cap = new T.Mesh(new T.ConeGeometry(0.26, 0.2, 4), IRON(api)); cap.position.y = 2.03; cap.rotation.y = Math.PI / 4; g.add(cap);
  const gl = glow(api, 0xffc060, 3.2); gl.position.y = 1.75; g.add(gl);
  return { g, lit, gl, on: 0 };
}
registerMock({
  id: "flagship", title: "Flagship of the armada (Seerr)", tier: "cine", hidden: false,
  card: { kicker: "Achievement · Flagship of the armada", title: POSTER.knight[1], facts: `Your request became the server's ${TRAIL.rank} most-watched · ${TRAIL.crews} crews followed in your wake`, poster: POSTER.knight[0] },
  off: 4, crew: [2.4, 7.2, 9.0], look: -4,
  build(api, it) {
    const T = api.THREE;
    it.s = it.side; it.head = new T.Object3D(); it.group.add(it.head);
    it.trail = Array.from({ length: api.lite ? 9 : 13 }, () => { const b = lanternBuoy(api); b.g.visible = false; it.group.add(b.g); return b; });
    const kinds = ["ship-large", "ship-pirate-large", "ship-large", "ship-large", "ship-pirate-large", "ship-large", "ship-large"];
    it.fleet = kinds.slice(0, api.lite ? 4 : 7).map((name, j) => {
      const g = new T.Group(), sc = 0.75 + (j % 3) * 0.08, m = api.model(name, sc);
      if (m) { m.position.y = -1.0 * sc; m.rotation.y = Math.PI; g.add(m); }
      else { const h = new T.Mesh(new T.BoxGeometry(3, 2, 10), api.mats.wood); h.position.y = 0.3; g.add(h); }
      const gl = glow(api, 0xffc060, 4.5); gl.position.set(0, 3.2 * sc / 0.8, -9.5 * sc); g.add(gl);  // a lantern at the bow
      g.visible = false; it.group.add(g);
      return { g, gl, back: 28 + j * 10, lat: (j % 2 ? 1 : -1) * (6 + j * 3.4), sc, on: 0, w: new T.Vector3(), yaw: 0 };
    });
    it.v = new T.Vector3();
  },
  onShot(api, it) {
    it.T = 0;
    // Lay the trail along the course just sailed, alternately either side of the wake
    it.trail.forEach((b, k) => {
      const f = api.frame(api.day - 0.25 - k * 0.6);
      b.w = f.p.clone().addScaledVector(f.right, (k % 2 ? 1 : -1) * (1.6 + k * 0.12));
      b.g.visible = true; b.on = 0;
    });
    it.fleet.forEach(f => { f.g.visible = true; });
  },
  animate(api, it, dt, dd) {
    tick(api, it);
    if (it.T === undefined && api.reduced && dd > -1.2) this.onShot(api, it);
    follow(api, it, it.s * 3, 24);
    const T = it.T ?? -1, t = api.time;
    it.head.position.set(-it.s * 2, 2.6, 14);
    if (T < 0) return;
    // Lanterns along the trail, worldly fixed, lit one after another from our stern outwards
    it.trail.forEach((b, k) => {
      const l = it.group.worldToLocal(it.v.copy(b.w));
      b.g.position.set(l.x, seaAt(api, it, l.x, l.z) - 0.25 + Math.sin(t * 1.8 + k) * 0.08, l.z);
      b.g.rotation.set(Math.sin(t * 1.4 + k) * 0.12, 0, Math.cos(t * 1.2 + k * 2) * 0.12);
      const on = ease(0.4 + k * 0.3, 0.7 + k * 0.3, T); if (on > 0.05 && b.on <= 0.05) b.chime = true; b.on = on;
      b.lit.emissiveIntensity = on * 2.2; b.gl.material.opacity = on * (0.75 + 0.15 * Math.sin(t * 6 + k));
    });
    // The fleet, in a loose V along our course, keeping pace; each lantern lit as the trail reaches it. Later they fall astern
    const reach = 0.4 + (T - 0.4) / 0.3 * 0.6 * 9;  // how far back the lit trail has got, in units
    const keep = T < 10;
    it.fleet.forEach((f, j) => {
      if (keep) {
        const fr = api.frame(api.day - f.back / 9);
        f.w.copy(fr.p).addScaledVector(fr.right, f.lat + Math.sin(t * 0.3 + j) * 0.8); f.yaw = Math.atan2(-fr.fwd.x, -fr.fwd.z);
      } else f.w.add(it.v.set(-Math.sin(f.yaw), 0, -Math.cos(f.yaw)).multiplyScalar(dt * 1.5));
      const l = it.group.worldToLocal(it.v.copy(f.w)), y = seaAt(api, it, l.x, l.z);
      f.g.position.set(l.x, y - 0.4 * f.sc + 0.4, l.z);
      const yl = f.yaw - it.group.rotation.y, fz = seaAt(api, it, l.x - Math.sin(yl) * 6, l.z - Math.cos(yl) * 6);
      f.g.rotation.set((fz - y) * 0.08 + Math.sin(t + j) * 0.02, yl, Math.sin(t * 0.8 + j * 2) * 0.05);
      const on = ease(f.back * 0.9, f.back * 0.9 + 6, reach); if (on > 0.05 && f.on <= 0.05) f.bell = true; f.on = on;
      f.gl.material.opacity = on * (0.8 + 0.15 * Math.sin(t * 5 + j));
    });
  },
  water(api, it, dt) {
    if (it.T === undefined) return;
    const k = api.sfx, ok = live(api) && k.bus;
    it.trail.forEach((b, i) => {
      if (b.chime) { b.chime = false; if (ok) { k.bell(k.bus, 0.045, PENTA[i % PENTA.length]); k.note("lantern chime"); } }
      b.foamT = (b.foamT ?? Math.random() * 2) - dt;
      if (b.foamT < 0) { b.foamT = 1.6 + Math.random(); const p = worldOf(api, b.g); if (Math.random() < api.WET + 0.3) api.churn(p.x, p.z, 0.2, 1.1); }
    });
    it.fleet.forEach((f, j) => {
      if (f.bell) { f.bell = false; if (ok) { k.bell(k.bus, 0.03, 330 + j * 22); k.note("fleet bell"); } }
      f.foamT = (f.foamT ?? Math.random()) - dt;
      if (f.foamT < 0) {  // a bow wave and a wash astern
        f.foamT = 0.45 / Math.max(api.WET, 0.5);
        const p = f.g.localToWorld(it.v.set(0, 0, -8 * f.sc)); api.churn(p.x, p.z, 0.35, 2.2);
        const q = f.g.localToWorld(it.v.set(0, 0, 8 * f.sc)); api.churn(q.x, q.z, 0.3, 2.6);
      }
    });
    if (!it.dropped && it.T > 0.2) {  // a fresh lantern goes over the stern with a splash
      it.dropped = true;
      const f = api.frame(api.day), p = api.ship.position.clone().addScaledVector(f.fwd, -9.5);
      api.ring(p.x, p.z, 0.5); api.spray(30 * api.WET, p.x, p.z, api.seaHeight(p.x, p.z), 0.8, 4, 1.2);
      if (ok) k.play("splash", k.bus, { rate: 1.5, gain: 0.25 });
    }
  },
  sfx(api, it, bus) {  // a far-off creak of timbers and the swish of the fleet's bows
    const k = api.sfx;
    return () => {
      k.hiss(k.env(k.filt("lowpass", 500, 0.6, bus), 0.05, 0.8, 1.6), k.now(), 2.6);
      if (Math.random() < 0.5) k.play("creaks", bus, { rate: 0.8 + Math.random() * 0.2, gain: 0.18 });
      return 1.4 + Math.random();
    };
  },
});

// ---- 4. Supply boat: a tender rows out with the day's delivery and it is swung aboard ----------------------------
// Played on its own clock from the moment it comes into view (about 5 s), keeping pace with the ship
function supplyStart(api, it, dd) { if (it.T === undefined && dd > -1.4 && dd < 4) it.T = 0; }
registerMock({
  id: "supply-boat", title: "Supply boat (Seerr)", tier: "loud",
  card: { kicker: "Supply boat", title: `Delivered: ${POSTER.housemaid[1]}`, facts: "Your request arrived in Plex today", poster: POSTER.housemaid[0] },
  off: 6, side: 1, range: 12,
  build(api, it) {
    const T = api.THREE;
    it.s = it.side;
    it.boat = rowboat(api, 5.2, 0x2f6d9a, { rowers: 2, flag: 0xe8b33c });
    it.group.add(it.boat.g);
    it.box = crate(api, 1.0, POSTER.housemaid[0], { lashed: true }); it.group.add(it.box);
    it.line = rope(api, it.group, 6); it.line.hide();
    it.deck = onShip(api, it);
    it.v = new T.Vector3(); it.w = new T.Vector3();
  },
  animate(api, it, dt, dd) {
    tick(api, it); supplyStart(api, it, dd);
    const s = it.s, T = it.T ?? -1, t = api.time, b = it.boat;
    if (T < 6.5) follow(api, it, s * 8, -2);
    if (T < 0) { b.g.visible = it.box.visible = false; return; }
    b.g.visible = true;
    // Out from a way off to starboard, alongside the waist, then away astern
    const come = ease(0, 2.0, T), go = ease(3.7, 6.5, T);
    const fx = s * 34 - it.ax, fz = -16 - it.az, ax = s * 4.6 - it.ax, az = 5.4 - it.az;
    const x = lerp(fx, ax, come) + s * go * 10, z = lerp(fz, az, Math.pow(come, 0.7)) + go * 14;
    const yaw = lerp(Math.atan2(-(ax - fx), -(az - fz)), 0, ease(0.5, 1, come)) + s * go * 0.9;
    ride(api, it, b, x, z, yaw);
    b.ph = (b.ph ?? 0) + dt * (come < 1 || go > 0 ? 2.6 : 0.6); b.ph %= 1;
    const dip = row(api, b, b.ph, come < 1 || go > 0 ? 1 : 0.1);
    oarRipples(api, dip, Math.floor(T * 2.5));
    b.speed = come < 1 || go > 0 ? 1 : 0;
    if (b.glow) b.glow.material.opacity = 0.6;
    if (b.flag) b.flag.rotation.y = Math.sin(t * 4) * 0.3 + 0.4;
    // The crate: in the boat, then up on a line from the yardarm, in over the rail and down on the deck, where it stays
    const lift = ease(2.1, 3.0, T), swing = ease(3.0, 3.7, T);
    const yard = fromShip(api, it, it.v.set(s * 2.5, 9.0, 6.4));
    if (swing < 1) {
      const p = it.box.position.copy(b.g.position); p.y += b.top;
      const up = it.w.copy(yard); up.y -= 3.4;
      p.lerp(up, lift);
      const onDeck = fromShip(api, it, new api.THREE.Vector3(...QD_SLOT(s)));
      p.lerp(onDeck, swing); p.y += Math.sin(swing * Math.PI) * 0.8;
      it.box.rotation.set(Math.sin(T * 4) * 0.12 * lift * (1 - swing), yaw * (1 - lift) + Math.sin(T * 2) * 0.3 * lift * (1 - swing), Math.sin(T * 5) * 0.1 * lift * (1 - swing));
      it.box.visible = true;
      if (lift > 0) it.line.set(yard, it.w.copy(p).setY(p.y + it.box.userData.h), 0); else it.line.hide();
    } else if (it.box.parent !== it.deck) {  // landed: it rides with the ship from here
      it.line.hide(); it.deck.add(it.box); it.box.position.set(...QD_SLOT(s)); it.box.rotation.set(0, 0.15, 0); it.landed = true;
    }
  },
  water(api, it, dt) {
    if (it.T === undefined) return;
    const b = it.boat, k = api.sfx, T = it.T;
    boatWater(api, it, b, b.speed, dt);
    // Sounds outside a crew shot: quiet, straight to the speakers
    if (!live(api)) return;
    it.oarT = (it.oarT ?? 0) - dt;
    if (b.speed && it.oarT < 0) { it.oarT = 0.4; oarSplash(k, k.out, 0.025); }
    if (T > 2.1 && !it.creak) { it.creak = true; k.play("creaks", k.out, { rate: 1.25, gain: 0.25 }); }
    if (T > 3.7 && !it.ding) { it.ding = true; chime(k, k.out, [1047, 1319, 1568], 0.03, 0.11); }
  },
});

// ---- 5. Cargo hold: a crate on deck for each request delivered this year -----------------------------------------
// Stacked against the bulwarks of the main deck, forward of the quarterdeck, so the captain and the crew-shot
// cameras (aft, on the quarterdeck, and at the bow) stay clear
const HOLD = [[1.72, 8.0, 0, QDECK], [-1.72, 8.0, 0, QDECK], [1.72, 7.0, 0, QDECK], [-1.72, 7.0, 0, QDECK]];  // [x, z, level, deck] in the ship's frame, in order
for (const lv of [0, 1, 2]) for (const z of [-3.4, -2.3, 2.5, 3.4, -1.2]) for (const x of [1.35, -1.35]) HOLD.push([x - Math.sign(x) * lv * 0.06, z, lv, DECK]);
function cargoHold(n) {
  return {
    id: `cargo-hold-${n}`, title: `Cargo hold, ${n} crates (Seerr)`, tier: "ambient", range: 400, off: 10,
    card: { kicker: "Cargo hold", title: `${n} requests delivered`, facts: "A crate on deck for every title you asked for this year" },
    build(api, it) {
      const T = api.THREE, deck = onShip(api, it), size = 0.95;
      HOLD.slice(0, n).forEach(([x, z, lv, dy], i) => {
        const poster = i % 3 === 0 ? LABELS[i % LABELS.length] : null;
        const c = crate(api, size, poster, { top: lv === 2 || (n <= 10), side: true, lashed: false });
        c.position.set(x, dy + lv * (c.userData.h + 0.01), z); c.rotation.y = Math.sin(i * 7.1) * 0.06;
        deck.add(c);
      });
      // Lashings over each stack, from the deck up and over
      const stacks = new Map();
      HOLD.slice(0, n).forEach(([x, z, lv, dy]) => { const k = `${x}:${z}:${dy}`; stacks.set(k, Math.max(stacks.get(k) ?? 0, lv + 1)); });
      for (const [k, h] of stacks) {
        const [x, z, DECK] = k.split(":").map(Number), sx = Math.sign(x), top = h * 0.82;
        for (const dz of [-0.26, 0.26]) {
          const side = new T.Mesh(new T.BoxGeometry(0.04, top, 0.04), ROPE(api)); side.position.set(x - sx * 0.48, DECK + top / 2, z + dz); deck.add(side);
          const lid = new T.Mesh(new T.BoxGeometry(0.98, 0.04, 0.04), ROPE(api)); lid.position.set(x, DECK + top + 0.02, z + dz); deck.add(lid);
        }
      }
    },
    animate() {},
  };
}
for (const n of [2, 10, 30]) registerMock(cargoHold(n));

// ---- 6. Sealed crate: a delivered request never opened, drifting past with a gull aboard --------------------------
function gull(api) {
  const T = api.THREE, g = new T.Group(), white = mat(api, "gullW", T => new T.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.8 }));
  const grey = mat(api, "gullG", T => new T.MeshStandardMaterial({ color: 0x8f97a0, roughness: 0.8 })), yellow = mat(api, "gullY", T => new T.MeshStandardMaterial({ color: 0xf0b429, roughness: 0.6 }));
  const body = new T.Mesh(new T.SphereGeometry(0.3, 12, 9), white); body.scale.set(0.8, 0.8, 1.35); body.position.y = 0.42; g.add(body);
  const head = new T.Group(); head.position.set(0, 0.78, -0.3); g.add(head);
  head.add(new T.Mesh(new T.SphereGeometry(0.17, 10, 8), white));
  const beak = new T.Mesh(new T.ConeGeometry(0.05, 0.24, 6), yellow); beak.rotation.x = -Math.PI / 2; beak.position.set(0, -0.03, -0.24); head.add(beak);
  for (const sd of [1, -1]) { const e = new T.Mesh(new T.SphereGeometry(0.025, 6, 4), IRON(api)); e.position.set(sd * 0.11, 0.04, -0.1); head.add(e); }
  const wings = [1, -1].map(sd => {
    const w = new T.Group(); w.position.set(sd * 0.2, 0.55, -0.05); g.add(w);
    const m = new T.Mesh(new T.BoxGeometry(0.75, 0.04, 0.42), grey); m.position.x = sd * 0.37; w.add(m);
    const tip = new T.Mesh(new T.BoxGeometry(0.3, 0.035, 0.3), IRON(api)); tip.position.x = sd * 0.85; w.add(tip);
    return { w, sd };
  });
  const tail = new T.Mesh(new T.BoxGeometry(0.22, 0.04, 0.3), grey); tail.position.set(0, 0.45, 0.45); tail.rotation.x = 0.3; g.add(tail);
  for (const sd of [1, -1]) { const l = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.22, 4), mat(api, "gullL", T => new T.MeshStandardMaterial({ color: 0xe0803a }))); l.position.set(sd * 0.09, 0.1, 0); g.add(l); }
  return { g, head, wings };
}
registerMock({
  id: "sealed-crate", title: "Sealed crate (Seerr)", tier: "ambient",
  card: { kicker: "Flotsam · Still sealed", title: POSTER.wolves[1], facts: "Your request came in a few weeks back · no rush, it'll keep", poster: POSTER.wolves[0] },
  off: 9, side: 1, range: 8,
  build(api, it) {
    const T = api.THREE;
    it.box = crate(api, 1.8, POSTER.wolves[0], { sealed: true, top: false }); it.group.add(it.box);
    it.box.rotation.y = -0.5 * it.side;  // its label turned towards the course and the ship coming up
    it.bird = gull(api); it.bird.g.scale.setScalar(1.5); it.bird.g.position.y = it.box.userData.h; it.bird.g.rotation.y = 2.4; it.box.add(it.bird.g);
    it.flapAt = 3;
  },
  animate(api, it, dt) {
    const gp = it.group.position, t = api.time, b = it.bird;
    gp.y = api.seaHeight(gp.x, gp.z);
    it.box.position.y = -0.4 + Math.sin(t * 1.5) * 0.12;
    it.box.rotation.x = Math.sin(t * 1.1) * 0.1; it.box.rotation.z = Math.sin(t * 0.9 + 1) * 0.12;
    // The gull looks about, and now and then stretches its wings and settles again
    b.head.rotation.y = Math.sin(t * 0.7) * 0.9 + (Math.sin(t * 0.23) > 0.6 ? 0.8 : 0);
    b.head.rotation.x = Math.max(0, Math.sin(t * 0.5 + 2)) * 0.4;
    it.flapAt -= dt;
    const f = it.flapAt < 0 ? Math.min(1, -it.flapAt / 1.4) : 0, open = f > 0 ? Math.sin(f * Math.PI) : 0;
    if (it.flapAt < -1.4) it.flapAt = 4 + Math.random() * 4;
    for (const w of b.wings) { w.w.rotation.z = w.sd * (open * (0.5 + 0.6 * Math.sin(t * 16))); w.w.rotation.y = w.sd * -0.15 * (1 - open); }
    b.g.position.y = it.box.userData.h + open * 0.12;
  },
  water(api, it, dt) {
    it.foamT = (it.foamT ?? 0) - dt;
    if (it.foamT < 0) { it.foamT = 0.9; const p = it.group.position; api.churn(p.x + (Math.random() - 0.5) * 1.5, p.z + (Math.random() - 0.5) * 1.5, 0.3, 1.8); }
  },
});
