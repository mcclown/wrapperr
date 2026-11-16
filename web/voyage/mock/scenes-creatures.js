// Mockups of the planned achievement creatures (NOTES.md, "Achievement ideas, not built yet"): old salt, rare pearl,
// albatross, midnight watch, narwhal and longest sitting as crew's-eye surprises, and the planned rarity line on a
// highlighted card. Card numbers are placeholders; counts only, never names. Contract and api: README.md.

// ---- Shared bits ----
let V;  // scratch vectors, made on first use (THREE comes with the api)
const vs = api => (V ??= Array.from({ length: 6 }, () => new api.THREE.Vector3()));
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
// Seconds into its crew's-eye shot, as watched: the world runs at 0.4 through the shot, which lasts about 7.5 of these
const shotT = (api, it) => it.t0 === undefined ? -1 : (api.time - it.t0) / 0.4;
function settle(api, it, k = 1) {  // the group rides the swell at its centre (k of it)
  const gp = it.group.position; gp.y = api.seaHeight(gp.x, gp.z) * k; it.group.updateMatrixWorld();
}
function seaLocal(api, it, x, z) {  // the sea's height at x, z in the group's frame
  const w = it.group.localToWorld(vs(api)[0].set(x, 0, z));
  return api.seaHeight(w.x, w.z) - it.group.position.y;
}
function shipLocal(api, it, x, y, z, out) {  // a point in the ship's frame ([out to starboard, up, aft]) in the group's frame
  api.ship.updateMatrixWorld();
  return it.group.worldToLocal(api.ship.localToWorld(out.set(x, y, z)));
}
const mat = (api, color, o = {}) => new api.THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...o });
function glowSprite(api, color, size, opacity = 1) {
  const { THREE } = api, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: api.GLOW_TEX, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size); return s;
}
// The planned rarity line, under the card's facts once its card is up (the card is filled as text, so this finds it by
// its facts and adds the line; the next card replaces it). gild: the gilded treatment on a highlighted (loud) card.
function rarityLine(api, facts, line, gild) {
  const f = api.$("cap_facts");
  if (!f || f.textContent !== facts) return;
  f.textContent = "";
  const a = document.createElement("span"), b = document.createElement("span");
  a.textContent = facts;
  b.textContent = `✦ ${line}`;
  b.style.cssText = "display:block;margin-top:5px;font-size:0.86rem;letter-spacing:0.07em;font-variant:small-caps;color:#7a4b06;font-weight:bold";
  f.append(a, b);
  if (gild) api.$("caption").classList.add("feat");
}
// Splash on first breaking the surface
function breach(api, it, x, z, s, n, r, up, out) {
  const w = it.group.localToWorld(vs(api)[1].set(x, 0, z));
  api.ring(w.x, w.z, s); api.spray(n * api.WET, w.x, w.z, api.seaHeight(w.x, w.z), r, up, out);
  return w;
}
// A deep exhale: a breath of noise through a closing band, with a low thrum under it
function exhale(k, bus, v = 0.5, len = 2) {
  const at = k.now(), g = k.env(bus, v, 0.25, len, at), f = k.filt("bandpass", 900, 0.7, g);
  f.frequency.setValueAtTime(1100, at); f.frequency.exponentialRampToValueAtTime(240, at + len);
  k.hiss(f, at, len + 0.4);
  k.osc("sine", 52, k.env(bus, v * 0.5, 0.3, len * 0.8, at), at, len + 0.3);
  k.note("exhale");
}

// ---- 1. Old salt: an ancient sea turtle, barnacled and mossy, trailing weed --------------------------------------
registerMock({
  id: "old-salt", title: "Old salt (ancient sea turtle)", tier: "cine",
  card: { kicker: "Achievement · Old salt", title: "An old salt", facts: "7 films from before 1970 · the oldest from 1939", emblem: "7<small>old films</small>" },
  off: 24, part: 0.3, stirR: 12, look: -3.2,
  build(api, it) {
    const { THREE } = api, body = new THREE.Group(), t = new THREE.Group();  // body moves and pitches; t is the turtle
    // The shell: a dome painted with plates, moss and pale scars
    const shellTex = api.canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = "#5b5a3a"; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 260; k++) { g.fillStyle = `rgba(${60 + Math.random() * 50},${70 + Math.random() * 50},${30 + Math.random() * 20},0.35)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 0, 7); g.fill(); }
      g.strokeStyle = "rgba(40,34,20,0.85)"; g.lineWidth = 3;
      [[0, 0.32, 5], [0.32, 0.66, 8], [0.66, 1, 12]].forEach(([v0, v1, n], r) => {
        g.beginPath(); g.moveTo(0, v1 * h); g.lineTo(w, v1 * h); g.stroke();
        for (let k = 0; k < n; k++) { const u = (k + r * 0.5) / n * w; g.beginPath(); g.moveTo(u, v0 * h); g.lineTo(u, v1 * h); g.stroke(); }
      });
      for (let k = 0; k < 22; k++) { g.fillStyle = `rgba(${70 + Math.random() * 40},${105 + Math.random() * 40},50,0.55)`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h * 0.8, 4 + Math.random() * 12, 3 + Math.random() * 6, 0, 0, 7); g.fill(); }
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: shellTex, roughness: 0.85, flatShading: true }));
    shell.scale.set(3.6, 2.2, 5); t.add(shell);
    const under = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 6), mat(api, 0xc8b98a)); under.scale.set(3.4, 0.45, 4.8); t.add(under);
    // Barnacles and moss clumps over the shell
    const barn = mat(api, 0xd8d2c0), barnDark = mat(api, 0x6d6658), moss = mat(api, 0x4d6b2e);
    for (let k = 0; k < (api.lite ? 26 : 48); k++) {
      const a = Math.random() * Math.PI * 2, th = 0.25 + Math.random() * 1.2;  // over the dome, thickest round the back
      const n = new THREE.Vector3(Math.cos(a) * Math.sin(th), Math.cos(th), Math.sin(a) * Math.sin(th));
      const isMoss = k % 4 === 0, m = isMoss ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + Math.random() * 0.35, 0), moss)
        : new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2 + Math.random() * 0.12, 0.22 + Math.random() * 0.12, 7), Math.random() < 0.3 ? barnDark : barn);
      m.position.set(n.x * 3.6, n.y * 2.2, n.z * 5).multiplyScalar(0.99);
      m.lookAt(m.position.clone().add(n.set(n.x / 3.6, n.y / 2.2, n.z / 5)));
      m.rotateX(Math.PI / 2); if (isMoss) m.scale.y = 0.4;
      t.add(m);
    }
    // Head, neck and beak; old, heavy, wrinkled
    const skin = mat(api, 0x7d7a5c), skinPale = mat(api, 0xb3aa82), dark = new THREE.MeshBasicMaterial({ color: 0x14110c });
    const head = new THREE.Group(); head.position.set(0, 0.25, -4.8); t.add(head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 1.6, 9), skin); neck.rotation.x = Math.PI / 2; neck.position.z = -0.4; head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), skin); skull.scale.set(0.95, 0.85, 1.25); skull.position.set(0, 0.25, -1.5); head.add(skull);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), skinPale); jaw.scale.set(0.75, 0.45, 0.9); jaw.position.set(0, -0.2, -1.85); head.add(jaw);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 8), mat(api, 0x3e3a2a)); beak.rotation.x = -Math.PI / 2 - 0.35; beak.position.set(0, 0.05, -2.75); head.add(beak);
    [-1, 1].forEach(sd => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), dark); e.position.set(sd * 0.72, 0.45, -2.05); head.add(e);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 4, 0, Math.PI * 2, 0, 1.2), skinPale); lid.position.copy(e.position); lid.position.y += 0.04; head.add(lid); });
    // Flippers: long front ones that row, small back ones
    const fl = mat(api, 0x6c6a4e);
    it.flips = [[-1, -2.6, 3.2, 1], [1, -2.6, 3.2, 1], [-1, 3.6, 1.4, 0.6], [1, 3.6, 1.4, 0.6]].map(([sd, z, len, w], k) => {
      const p = new THREE.Group(); p.position.set(sd * 3.1, -0.15, z); t.add(p);
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 5), fl); f.scale.set(len, 0.16, w); f.position.x = sd * len * 0.85; f.rotation.y = sd * (k < 2 ? -0.45 : 0.6); p.add(f);
      return { p, sd, front: k < 2 };
    });
    // Weed trailing off the back of the shell
    const weedMat = new THREE.MeshStandardMaterial({ color: 0x4f6b26, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    it.weed = [];
    for (let k = 0; k < (api.lite ? 5 : 9); k++) {
      const L = 3 + Math.random() * 3.5, geo = new THREE.PlaneGeometry(0.4 + Math.random() * 0.3, L, 1, 10).rotateX(-Math.PI / 2).translate(0, 0, L / 2);
      const m = new THREE.Mesh(geo, k % 3 ? weedMat : new THREE.MeshStandardMaterial({ color: 0x8a9a3a, roughness: 0.9, side: THREE.DoubleSide }));
      const a = (k / 8 - 0.5) * 2.2, y = 1.1 + Math.random() * 0.5, r = Math.sqrt(1 - (y / 2.2) ** 2);  // from the back of the dome
      m.position.set(Math.sin(a) * 3.6 * r, y, Math.cos(a) * 5 * r);
      t.add(m); it.weed.push({ m, base: Float32Array.from(geo.attributes.position.array), L, ph: Math.random() * 6 });
    }
    t.scale.setScalar(1.9);
    body.add(t); it.group.add(body);
    it.body = body; it.turtle = t; it.headG = head; it.head = body;
  },
  onShot(api, it) { it.t0 = api.time; },
  animate(api, it, dt, dd) {
    settle(api, it);
    const T = api.time, up = it.emerge ?? 1, s = shotT(api, it), b = it.body, [p] = vs(api);
    // On a tall screen it is smaller and further out, so the whole turtle (head, flippers and shell) fits the narrow view
    const tall = THREE_clamp((1.3 - api.camera.aspect) / 0.8, 0, 1);
    it.turtle.scale.setScalar(1.9 - 0.6 * tall);
    // Surfaces beside the ship, swims along with it for a while, then dives
    let y = -12 * (1 - up) - 1.3, pitch = 0, z = 0, x = 0;
    if (s >= 0) {
      shipLocal(api, it, 0, 0, 0, p);
      it.alongZ = Math.min(it.alongZ ?? 0, p.z * 0.75 - 2);  // never backs up
      z = it.alongZ; x = -it.side * 3 * ease(s / 4) + it.side * 9 * tall;
      const dive = ease((s - 5.2) / 2);
      y -= dive * 14; pitch = -0.5 * dive + 0.12 * ease((s - 1) / 1) * (1 - ease((s - 3.6) / 1));  // a breath, then nose down
      b.visible = dive < 0.999;
    }
    b.position.set(x, y + Math.sin(T * 0.9) * 0.15, z);
    b.rotation.set(pitch + Math.sin(T * 0.7) * 0.04, it.side * 0.4, Math.sin(T * 0.6) * 0.05);  // turned a little towards the ship
    it.headG.rotation.x = 0.4 * ease((s - 1) / 1) * (1 - ease((s - 3.8) / 1)) + Math.sin(T * 0.8) * 0.05;  // lifts its head to breathe
    const stroke = T * (s >= 0 ? 1.6 : 0.9);
    for (const f of it.flips) {
      if (f.front) { f.p.rotation.z = f.sd * (0.35 * Math.sin(stroke)); f.p.rotation.y = f.sd * 0.3 * Math.cos(stroke); }
      else f.p.rotation.z = f.sd * 0.2 * Math.sin(stroke + 1.5);
    }
    for (const w of it.weed) {  // streaming and waving behind
      const pos = w.m.geometry.attributes.position, a = pos.array;
      for (let k = 0; k < pos.count; k++) {
        const bz = w.base[k * 3 + 2], u = bz / w.L;
        a[k * 3] = w.base[k * 3] + Math.sin(bz * 1.2 - T * 2.2 + w.ph) * 0.45 * u;
        a[k * 3 + 1] = w.base[k * 3 + 1] - Math.min(1, u * 3) * 1.3 + Math.sin(bz * 0.9 - T * 1.7 + w.ph) * 0.15 * u;  // over the rim, then floating
      }
      pos.needsUpdate = true;
    }
  },
  water(api, it, dt) {
    const b = it.body, s = shotT(api, it), [, , p] = vs(api);
    it.group.localToWorld(p.copy(b.position));
    if (!it.popped && (it.emerge ?? 1) > 0.75) {  // the shell breaking the surface: a swell, spray and water off it
      it.popped = true; breach(api, it, b.position.x, b.position.z, 0.8, 90, 4.5, 4, 2.2);
    }
    if (s < 0 || !b.visible) return;
    if (s < 5.5) api.mound(p.x, p.z, 0.35 + 0.25 * Math.sin(api.time * 1.3), 9);  // the swell humps over the shell
    if ((it.foamT = (it.foamT ?? 0) - dt) < 0) {  // foam washing round the shell
      it.foamT = 0.35; const a = Math.random() * 6.28;
      const w = it.group.localToWorld(vs(api)[3].set(b.position.x + Math.cos(a) * 4, 0, b.position.z + Math.sin(a) * 5.5));
      api.churn(w.x, w.z, 0.55, 2.4);
    }
    if (s < 2.5 && Math.random() < dt * 12) api.drip(6, p.clone().setY(p.y + 1.6), api.seaHeight(p.x, p.z), 5);  // pouring off it as it rises
    if (!it.breathed && s > 1.8) { it.breathed = true; it.headG.getWorldPosition(vs(api)[4]); api.spray(30 * api.WET, vs(api)[4].x, vs(api)[4].z, vs(api)[4].y - 0.2, 0.6, 3.5, 0.8); }
    if (!it.dived && s > 5.6) { it.dived = true; api.ring(p.x, p.z, 0.7); api.spray(70 * api.WET, p.x, p.z, api.seaHeight(p.x, p.z), 4, 4, 2); api.churn(p.x, p.z, 1, 5); }
  },
  sfx(api, it, bus) {  // a deep exhale as it breathes, the sea lapping on the shell, a heavy wash as it dives
    const k = api.sfx; let n = 0;
    return () => {
      n++;
      if (n === 1) { k.play("splash", bus, { rate: 0.75, gain: 0.3 }); return 0.9; }
      if (n === 2) { exhale(k, bus, 0.6, 2.6); return 2.2; }
      if (n === 4) { k.play("splash", bus, { rate: 0.6, gain: 0.55 }); k.note("turtle dives"); return 3; }
      k.play("splash", bus, { rate: 0.9 + Math.random() * 0.2, gain: 0.14 }); return 1.2 + Math.random();
    };
  },
});

// ---- 2. Rare pearl: a giant clam on a reef in the shallows, opening on a glowing pearl -----------------------------
// Clams don't float: the reef is on the sea bed and in plain sight all along (hidden: false, no rise), the closed clam
// just part of it; the surprise is it opening on the pearl in the shot
registerMock({
  id: "rare-pearl", title: "Rare pearl (giant clam)", tier: "cine",
  card: { kicker: "Achievement · Rare pearl", title: "A rare pearl", facts: "Rated 9.1 · only 2 other crews on the server saw it", emblem: "9.1<small>rating</small>" },
  off: 22, look: -3.6, hidden: false,
  build(api, it) {
    const { THREE } = api, reef = new THREE.Group(); it.group.add(reef); it.reef = reef;
    // A low sandbar with coral and rocks, on a shelf of sand going down to the sea bed
    const r = 7, sand = api.model("patch-sand", r / 3.4) || new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.2, 1), api.mats.sand);
    sand.position.y = -0.35; reef.add(sand, api.foamRing(r * 0.95));
    const shelf = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.9, 6, 20, 1, true), api.mats.sand); shelf.position.y = -3.4; reef.add(shelf);
    const coral = [0xff7f6a, 0xf2a0c8, 0xb07ad8, 0xffb347, 0x6fd6c4].map(c => mat(api, c, { roughness: 0.7 }));
    for (let k = 0; k < (api.lite ? 10 : 18); k++) {  // branching and round corals round the edge
      const a = k / 18 * Math.PI * 2 + Math.random() * 0.3, rr = r * (0.55 + Math.random() * 0.35), g = new THREE.Group(), m = coral[k % coral.length];
      if (k % 3 === 0) { const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.4, 1), m); ball.scale.y = 0.7; g.add(ball); }
      else for (let j = 0; j < 4; j++) { const br = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1 + Math.random() * 0.9, 5), m); br.position.y = 0.4; br.rotation.set((Math.random() - 0.5) * 1.1, 0, (Math.random() - 0.5) * 1.1); g.add(br); }
      g.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); reef.add(g);
    }
    [[it.side * 4, 3, 0.55, 0], [-it.side * 3.5, -4, 0.45, 2], [it.side * 1.5, -5, 0.35, 4]].forEach(([x, z, k, ry]) => {  // rocks breaking the surface round it
      const rocks = api.model("rocks-sand-a", k); if (rocks) { rocks.position.set(x, -0.1, z); rocks.rotation.y = ry; reef.add(rocks); }
    });
    // The clam: two wavy valves on a hinge at the back, a blue mantle inside, the pearl
    const valveGeo = new THREE.SphereGeometry(1, 36, 10, 0, Math.PI * 2, 0, Math.PI / 2), pv = valveGeo.attributes.position, cols = [];
    for (let k = 0; k < pv.count; k++) {
      const x = pv.getX(k), y = pv.getY(k), z = pv.getZ(k), a = Math.atan2(z, x), rib = Math.cos(a * 7);
      const rim = 1 - y; pv.setXYZ(k, x * (1 + 0.06 * rib), y + rim * rim * 0.28 * rib, z * (1 + 0.06 * rib));  // ribs, and the zigzag lip that interlocks
      const c = 0.78 + 0.16 * rib * rim; cols.push(c, c * 0.97, c * 0.9);
    }
    valveGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); valveGeo.computeVertexNormals();
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xf3ead8, vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, flatShading: true });
    const clam = new THREE.Group(); clam.position.set(-it.side * 1.5, 0.5, 0); clam.rotation.y = it.side * Math.PI / 2; clam.scale.setScalar(2.1); reef.add(clam);  // its lips to the ship
    const lower = new THREE.Mesh(valveGeo, shellMat); lower.scale.set(2.4, -1.2, 1.6); clam.add(lower);
    const hinge = new THREE.Group(); hinge.position.set(0, 0, 1.6); clam.add(hinge);
    const upper = new THREE.Mesh(valveGeo, shellMat); upper.scale.set(2.4, 1.1, 1.6); upper.position.z = -1.6; hinge.add(upper);
    const mantleTex = api.canvasTexture(128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); grd.addColorStop(0, "#1d3f8a"); grd.addColorStop(0.6, "#2aa7c9"); grd.addColorStop(1, "#7d4fc9");
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 90; k++) { g.fillStyle = Math.random() < 0.5 ? "rgba(140,255,240,0.8)" : "rgba(40,20,120,0.6)"; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 0, 7); g.fill(); }
    });
    const mantleGeo = new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2), pm = mantleGeo.attributes.position;
    for (let k = 1; k < pm.count; k++) { const a = Math.atan2(pm.getZ(k), pm.getX(k)); pm.setY(k, 0.12 * Math.cos(a * 7)); }
    const mantle = new THREE.Mesh(mantleGeo, new THREE.MeshStandardMaterial({ map: mantleTex, roughness: 0.4, emissive: 0x0c2a5a, side: THREE.DoubleSide }));
    mantle.scale.set(2.2, 1, 1.45); mantle.position.y = -0.05; clam.add(mantle);
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ color: 0xfff6f0, emissive: 0xffe6f0, emissiveIntensity: 0.2, roughness: 0.15, metalness: 0.1 }));
    pearl.position.set(0, 0.3, 0.2); clam.add(pearl);
    const glow = glowSprite(api, 0xffe9f4, 5, 0); glow.position.copy(pearl.position); clam.add(glow);
    const halo = glowSprite(api, 0xbfe8ff, 14, 0); halo.position.set(0, 1.2, 0.2); clam.add(halo);
    // Light rays slanting down through the water onto it, and glints on the sea round about
    const rayTex = api.canvasTexture(32, 128, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, "rgba(255,250,220,0)"); grd.addColorStop(0.5, "rgba(255,250,220,0.55)"); grd.addColorStop(1, "rgba(255,250,220,0.9)");
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      const sd = g.createLinearGradient(0, 0, w, 0); sd.addColorStop(0, "rgba(0,0,0,1)"); sd.addColorStop(0.5, "rgba(0,0,0,0)"); sd.addColorStop(1, "rgba(0,0,0,1)");
      g.globalCompositeOperation = "destination-out"; g.fillStyle = sd; g.fillRect(0, 0, w, h);
    });
    it.rays = [];
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + Math.random(), 16), new THREE.MeshBasicMaterial({ map: rayTex, color: 0xfff1c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const g = new THREE.Group(); g.position.copy(clam.position).y += 0.6; g.rotation.y = k / 6 * Math.PI; m.position.set((k - 2.5) * 0.7, 8, 0); m.rotation.z = (k - 2.5) * 0.09 + 0.25;
      g.add(m); reef.add(g); it.rays.push({ m, ph: Math.random() * 6 });
    }
    const n = api.lite ? 30 : 60, gp = new Float32Array(n * 3), gc = new Float32Array(n * 3);
    const glints = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: api.GLOW_TEX, size: 1.1, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glints.geometry.setAttribute("position", new THREE.BufferAttribute(gp, 3)); glints.geometry.setAttribute("color", new THREE.BufferAttribute(gc, 3));
    glints.frustumCulled = false; it.group.add(glints);
    it.glints = Array.from({ length: n }, () => ({ a: Math.random() * 6.28, r: 3 + Math.random() * 13, ph: Math.random() * 20, sp: 0.7 + Math.random() }));
    it.glintPts = glints;
    api.isle(it.group, r, 0.15);
    it.clam = clam; it.hinge = hinge; it.pearl = pearl; it.glow = glow; it.halo = halo; it.head = clam;
  },
  onShot(api, it) { it.t0 = api.time; },
  animate(api, it, dt) {
    settle(api, it, 0.15);
    const T = api.time, s = shotT(api, it);
    const open = s < 0 ? 0 : ease((s - 1.4) / 3), shine = s < 0 ? 0 : ease((s - 2.4) / 2.4);
    it.hinge.rotation.x = 0.95 * open + Math.sin(T * 1.3) * 0.03 * open;  // the front lip lifts
    const pulse = 0.75 + 0.25 * Math.sin(T * 2.2);
    it.pearl.material.emissiveIntensity = 0.2 + 1.6 * shine * pulse;
    it.glow.material.opacity = shine * (0.6 + 0.3 * pulse); it.glow.scale.setScalar(2.2 + 0.8 * pulse);
    it.halo.material.opacity = shine * 0.22;
    for (const r of it.rays) r.m.material.opacity = shine * (0.14 + 0.1 * Math.sin(T * 0.8 + r.ph));
    const gp = it.glintPts.geometry.attributes.position, gc = it.glintPts.geometry.attributes.color;
    it.glints.forEach((g, k) => {  // glints on the water round the reef, twinkling, brighter as it opens
      const x = Math.cos(g.a) * g.r, z = Math.sin(g.a) * g.r, tw = Math.max(0, Math.sin(T * g.sp * 2 + g.ph)) ** 8 * (0.25 + 0.75 * shine);
      gp.setXYZ(k, x, seaLocal(api, it, x, z) + 0.15, z); gc.setXYZ(k, tw, tw * 0.95, tw * 0.8);
      if (tw < 0.01 && Math.random() < dt) { g.a = Math.random() * 6.28; g.r = 3 + Math.random() * 13; }
    });
    gp.needsUpdate = gc.needsUpdate = true;
  },
  water(api, it, dt) {
    const gp = it.group.position;
    if ((it.foamT = (it.foamT ?? 0) - dt) < 0) { it.foamT = 1.4; const a = Math.random() * 6.28; api.churn(gp.x + Math.cos(a) * 7.2, gp.z + Math.sin(a) * 7.2, 0.16, 1.8); }  // the sea breaking gently on the bar
  },
  sfx(api, it, bus) {  // the sea on the sandbar, then a soft chime as it opens and the pearl shines
    const k = api.sfx, sp = k.echo(bus, 0.33, 0.35, 0.4); let n = 0;
    return () => {
      n++;
      if (n === 1) { k.play("splash", bus, { rate: 0.9, gain: 0.3 }); return 1.8; }
      if (n === 2) {
        const at = k.now();
        [1568, 1976, 2349, 3136].forEach((f, j) => k.osc("sine", f, k.env(sp, 0.05, 0.01, 2.8, at + j * 0.16), at + j * 0.16, 3));
        k.bell(sp, 0.05, 2637, at + 0.7); k.note("pearl chime"); return 3.2;
      }
      k.bell(sp, 0.025, [2093, 2637, 3136][n % 3]); k.note("pearl shimmer"); return 2 + Math.random() * 1.5;
    };
  },
});

// ---- 3. Albatross: a big white albatross flying round the ship: beating up into the wind, gliding down banked ---------
function makeAlbatross(api) {  // faces +z (like the gulls), about 11 across the wings
  const { THREE } = api, g = new THREE.Group();
  const white = mat(api, 0xf4f2ec, { roughness: 0.7 }), dark = mat(api, 0x2c2a2a), grey = mat(api, 0xbab6ae);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), white); body.scale.set(0.5, 0.45, 1.5); g.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.1, 1.15); g.add(head);  // turns on the neck
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), white); skull.position.set(0, 0.1, 0.3); head.add(skull);
  const brow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), dark); brow.scale.set(1.6, 0.6, 1); [-1, 1].forEach(sd => { const b = brow.clone(); b.position.set(sd * 0.3, 0.2, 0.45); head.add(b); });
  const bill = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.95, 6), mat(api, 0xf0c3a0)); bill.rotation.x = Math.PI / 2; bill.position.set(0, 0.02, 0.95); head.add(bill);
  const hook = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), mat(api, 0xe0a070)); hook.position.set(0, 0, 1.4); head.add(hook);
  const tail = new THREE.Group(); tail.position.set(0, 0.05, -1.2); g.add(tail);  // trims from its root
  const fan = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 4), grey); fan.rotation.x = -Math.PI / 2; fan.scale.set(1, 1, 0.25); fan.position.z = -0.5; tail.add(fan);
  // A long narrow wing: a flat tapering blade along +x, leading edge forward (+z)
  const blade = (len, c0, c1, sweep) => {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(len, sweep); s.lineTo(len, sweep - c1); s.lineTo(0, -c0); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.035, 0);
  };
  const wings = [-1, 1].map(sd => {
    const shoulder = new THREE.Group(), elbow = new THREE.Group(), wrist = new THREE.Group();
    shoulder.position.set(sd * 0.35, 0.15, 0.25); shoulder.scale.x = sd;
    elbow.position.set(2.2, 0, -0.05); wrist.position.set(2.0, 0, -0.25);
    shoulder.add(new THREE.Mesh(blade(2.25, 0.85, 0.7, 0), white), elbow);
    const edge = new THREE.Mesh(blade(2.2, 0.16, 0.14, -0.55), dark); edge.position.y = -0.005; shoulder.add(edge);  // dark trailing edge
    elbow.add(new THREE.Mesh(blade(2.05, 0.7, 0.55, -0.15), white), wrist);
    const e2 = new THREE.Mesh(blade(2, 0.16, 0.14, -0.7), dark); e2.position.y = -0.005; elbow.add(e2);
    wrist.add(new THREE.Mesh(blade(1.6, 0.55, 0.12, -0.35), dark));
    const tip = new THREE.Object3D(); tip.position.set(1.6, 0, -0.4); wrist.add(tip);
    g.add(shoulder);
    return { sd, shoulder, elbow, wrist, tip };
  });
  const feet = [-1, 1].map(sd => {  // tucked back under the tail; let down to brake and steer
    const p = new THREE.Group(); p.position.set(sd * 0.25, -0.35, -1.05); g.add(p);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.5), mat(api, 0xd8b8b0)); f.position.z = -0.25; p.add(f);
    return p;
  });
  // Corners of every part, to keep the lowest of them clear of the sea
  const low = [];
  g.traverse(o => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox;
    for (let k = 0; k < 8; k++) low.push([o, new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z)]);
  });
  return { g, wings, head, tail, feet, low };
}
// Its flight, in watched seconds (the shot's slow motion taken out). Heights are over the sea under it.
const ALB = { G: 10, SPAN: 6.4, FLAP: 2.9, BEAT: 1.1, TOP: 6, BOTTOM: 10, LO: 0, HI: 10.5 };
// A point on its loop round the ship ([out, aft] in the ship's frame, kept level as the ship rolls) in the group's frame
function albLoop(api, it, th, out) {
  const L = it.loop, x = it.side * (L.x - L.rx * Math.sin(th)), z = L.z + L.rz * Math.cos(th);
  return out.copy(it.shipO).addScaledVector(it.shipR, x).addScaledVector(it.shipA, z);
}
const albH = th => ALB.LO + (ALB.HI - ALB.LO) * (0.5 + 0.5 * Math.cos(th));  // high at the aft turn, low at the forward one
registerMock({
  id: "albatross", title: "Albatross (soaring round the mast)", tier: "cine",
  card: { kicker: "Achievement · Albatross", title: "The albatross", facts: "Every genre on the server: 23 of 23 · or 12 in one month", emblem: "23<small>genres</small>" },
  off: 30, part: 0.4, stirR: 7, look: -4, ahead: 4,
  build(api, it) {
    const { THREE } = api, a = makeAlbatross(api), V3 = () => new THREE.Vector3();
    a.g.scale.setScalar(1.15); it.group.add(a.g); it.bird = a;
    it.eye = new THREE.Group(); it.group.add(it.eye); it.head = it.eye;  // where the crew look: following the bird, kept on their side
    Object.assign(it, { p: V3(), v: V3(), acc: V3(), T: V3(), Tp: V3(), vT: V3(), shipO: V3(), shipR: V3(), shipA: V3(), tmp: V3(), tmp2: V3(),
      m4: new THREE.Matrix4(), slow: 1, aU: 0, aT: 0, bank: 0.3, A: 0, ph: 0, nextFlap: 3, look: [0, 0], mode: "", gap: 9 });
  },
  onShot(api, it) { it.t0 = api.time; it.aU = 0; it.gone = false; it.loop = null; },
  animate(api, it, dt) {
    settle(api, it, 0);
    const { THREE } = api, b = it.bird, g = b.g, crew = api.shot.name === "crew" && api.shot.it === it;
    // Watched time: the world runs slow (towards 0.4) through its shot
    it.slow += ((crew ? 0.4 : 1) - it.slow) * (1 - Math.pow(0.02, dt / it.slow));
    const du = Math.min(dt / it.slow, 0.1); if (du <= 0) return;
    it.aU += du; it.aT += du;
    // The ship's place and heading in the group's frame, level
    shipLocal(api, it, 0, 0, 0, it.shipO);
    shipLocal(api, it, 0, 0, 1, it.shipA).sub(it.shipO).setY(0).normalize();
    shipLocal(api, it, 1, 0, 0, it.shipR).sub(it.shipO).setY(0).normalize(); it.shipO.y = 0;  // and out to starboard
    // Clearance it needs under its body: the lower wingtip when banked, the downstroke when beating, and a little more
    const need = 0.9 + ALB.SPAN * Math.abs(Math.sin(it.bank)) + ALB.FLAP * it.A;
    const T = it.T, mode = it.t0 === undefined ? "skim" : it.gone ? "away" : "loop";
    if (mode === "loop" && !crew && it.aU > 1.5) { it.gone = true; it.goneAt = it.aU; }  // the shot is over: it leaves
    const fresh = it.mode !== mode || api.jumped || !it.started;  // a new leg, a cut or a seek
    if (mode === "skim") {
      // Before: far out over the stirred water, circling low, a wingtip almost in the sea
      const a = it.aT * 0.6;
      T.set(Math.cos(a) * 9, 0, Math.sin(a) * 9);
      T.y = seaLocal(api, it, T.x, T.z) + need + 0.3;
      it.vT.set(-Math.sin(a) * 5.4, 0, Math.cos(a) * 5.4);
    } else if (mode === "loop") {
      if (!it.loop) {  // sized to the screen: further out on a tall one, so the whole bird fits
        const tall = THREE_clamp((1.3 - api.camera.aspect) / 0.8, 0, 1), k = 1 + 0.5 * tall;
        it.loop = { x: 1.6 + 19 * k + 9 * k, z: 9.4 - 10 * k, rx: 9 * k, rz: 12 * k };  // its near leg 19 out from the crew
        let best = it.started ? 1e9 : -1; it.th = 1.9;  // join it at the nearest point (cut straight into the shot: starting up the near leg)
        for (let j = 0; j < 48 && best > 0; j++) { const th = j / 48 * Math.PI * 2, d = albLoop(api, it, th, it.tmp).setY(it.p.y).distanceToSquared(it.p); if (d < best) { best = d; it.th = th; } }
      }
      // Dynamic soaring, round the loop the other way: beating up the near leg into the wind (aft, slowing), turning at
      // the top, gliding down the far leg (forward with the ship, faster and faster), a wingtip over the sea at the bottom
      const L = it.loop, th = it.th, sp = Math.sqrt(ALB.TOP ** 2 + (ALB.BOTTOM ** 2 - ALB.TOP ** 2) * (ALB.HI - albH(th)) / (ALB.HI - ALB.LO));
      const dl = Math.hypot(L.rx * Math.cos(th), L.rz * Math.sin(th), (ALB.HI - ALB.LO) * 0.5 * Math.sin(th));
      it.th -= du * sp / dl;
      albLoop(api, it, it.th, T);
      T.y = seaLocal(api, it, T.x, T.z) + Math.max(albH(it.th), need + 0.45);
      if (fresh) it.vT.subVectors(albLoop(api, it, it.th - 0.05, it.tmp), T).setY(0).multiplyScalar(sp / dl / 0.05);  // along the loop (cut straight into the shot: already flying)
    }
    if (mode !== "away") {
      // Chasing its mark on the path, as a spring: smooth through every change of course
      if (!fresh && mode === "loop") it.vT.subVectors(T, it.Tp).divideScalar(du);
      it.Tp.copy(T);
      if (!it.started || (api.jumped && it.p.distanceTo(T) > 30)) { it.p.copy(T); it.v.copy(it.vT); it.started = true; }  // placed after a seek
      const w = 2.1;
      it.acc.subVectors(T, it.p).multiplyScalar(w * w).addScaledVector(it.tmp.subVectors(it.vT, it.v), 2 * w);
      if (it.acc.length() > 9) it.acc.setLength(9);
    } else {
      // Away: turning out and forward and climbing, leaving the ship behind
      const sp = Math.hypot(it.v.x, it.v.z), want = Math.atan2(it.side * 0.8, -0.6), yaw = Math.atan2(it.v.x, it.v.z);
      const turn = THREE_clamp(Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)), -0.6, 0.6) * du * THREE_clamp(it.gap / 3, 0.15, 1), ns = sp + (7.5 - sp) * du * 0.6;
      it.tmp.set(Math.sin(yaw + turn) * ns, it.v.y + ((it.aU - it.goneAt < 3 || it.gap < 2.5 ? 1.5 : 0.1) - it.v.y) * du, Math.cos(yaw + turn) * ns);
      it.acc.subVectors(it.tmp, it.v).divideScalar(du);
    }
    it.mode = mode;
    it.v.addScaledVector(it.acc, du); it.p.addScaledVector(it.v, du);
    // Heading along its flight (pitched with it), banked into the turn by its sideways pull
    const f = it.tmp.copy(it.v).normalize(), up = it.tmp2.set(0, 1, 0), left = vs(api)[2].crossVectors(up, f).normalize(), right = -it.acc.dot(left);
    it.bank += (THREE_clamp(Math.atan(right / ALB.G), -1.05, 1.05) - it.bank) * (1 - Math.pow(0.03, du));
    it.m4.makeBasis(left, up.crossVectors(f, left), f); g.quaternion.setFromRotationMatrix(it.m4); g.rotateZ(it.bank);
    // Beating its wings taking off, climbing and slow; otherwise gliding, with a pair of beats now and then
    const speed = it.v.length(), slow = THREE_clamp((7 - speed) / 3, 0, 1);
    let flap = mode === "skim" ? 0 : mode === "loop" ? (it.aU < 2.6 || it.v.y > 0.7 || slow > 0.6 ? 1 : 0) : it.v.y > 0.4 ? 1 : 0;
    if (mode === "skim" && (it.nextFlap -= du) < 0) { if (it.nextFlap < -1.8) it.nextFlap = 6 + Math.random() * 3; else flap = 0.7; }
    const room = (it.p.y - seaLocal(api, it, it.p.x, it.p.z) - 0.6 - 7.1 * Math.abs(Math.sin(it.bank)) - 0.4) / 3.3;
    flap = Math.min(flap, THREE_clamp(room, 0, 1));  // shallower beats low over the sea, or a glide
    if (api.reduced) flap = 0;
    it.A += (flap - it.A) * (1 - Math.pow(0.04, du));
    if (it.A < 0.01) it.ph = 0;
    const ph0 = it.ph; it.ph += du * ALB.BEAT * (it.A > 0.01 ? 1 : 0);
    const c = Math.PI * 2 * it.ph, lift = Math.sin(c), upS = Math.max(0, Math.cos(c)), dnS = Math.max(0, -Math.cos(c)), A = it.A;
    // Glide trim: small movements, the wing flexing up under load in the turns
    const load = Math.min(1, Math.abs(right) / ALB.G), T2 = it.aT;
    b.wings.forEach((wg, j) => {
      const trim = Math.sin(T2 * 1.7 + j * 2) * 0.025 + Math.sin(T2 * 0.63) * 0.02 * wg.sd;
      wg.shoulder.rotation.z = wg.sd * (0.06 + 0.05 * load + trim + A * 0.55 * lift);  // deep, full beats
      wg.shoulder.rotation.y = wg.sd * A * (0.1 * upS - 0.14 * dnS);  // forward on the downstroke
      wg.elbow.rotation.z = -0.05 + 0.04 * load + Math.sin(T2 * 2.3 + j) * 0.015 + A * (0.12 * upS + 0.06 * dnS);
      wg.elbow.rotation.y = A * 0.38 * upS;  // folding at the elbow and wrist on the upstroke
      wg.wrist.rotation.z = 0.06 + 0.1 * load + Math.sin(T2 * 2.9 + j) * 0.02 + A * (0.22 * dnS - 0.4 * upS);
      wg.wrist.rotation.y = A * 0.75 * upS;
    });
    // The body bobs against the beat; the tail and feet trim
    const bob = -0.12 * A * lift;
    b.tail.rotation.x = -0.3 * slow - 0.15 * A + Math.sin(T2 * 1.3) * 0.05 + THREE_clamp(it.v.y * -0.04, -0.15, 0.15);
    b.tail.rotation.z = it.bank * 0.3; b.tail.scale.x = 1 + 0.5 * Math.max(slow, A * 0.6);
    const brake = Math.max(mode === "loop" ? 1 - THREE_clamp(it.aU / 1.6, 0, 1) : 0, slow * 0.7);
    b.feet.forEach((ft, j) => { ft.rotation.x = -(0.08 + 1.1 * brake + Math.sin(T2 * 1.1 + j) * 0.04); ft.rotation.y = it.bank * 0.25 * (j ? 1 : -1); });
    // The head turns a little to look at the ship (at the crew)
    g.position.copy(it.p); g.position.y += bob; g.updateMatrixWorld(true);
    const lp = g.worldToLocal(it.tmp.copy(api.camera.position)), ly = Math.atan2(lp.x, lp.z), lx = Math.atan2(lp.y, Math.hypot(lp.x, lp.z));
    const lk = Math.abs(ly) < 1.9 ? 1 : 0;
    it.look[0] += (THREE_clamp(ly, -0.7, 0.7) * lk - it.look[0]) * (1 - Math.pow(0.1, du)); it.look[1] += (THREE_clamp(lx, -0.4, 0.4) * lk - it.look[1]) * (1 - Math.pow(0.1, du));
    b.head.rotation.set(-it.look[1] * 0.7, it.look[0] * 0.8, 0);
    // Never into the sea: lift it clear if any part of it (a wingtip, the beating wings) would dip below the surface
    g.updateMatrixWorld(true);
    let gap = 1e9;
    for (const [o, c0] of b.low) { const q = vs(api)[3].copy(c0).applyMatrix4(o.matrixWorld); gap = Math.min(gap, q.y - api.seaHeight(q.x, q.z)); }
    if (gap < 0.8) it.v.y = Math.max(it.v.y, (0.8 - gap) * 5);  // eased up as it nears the water, so it climbs rather than jumps
    if (gap < 0.15) { g.position.y += 0.15 - gap; it.p.y += 0.15 - gap; it.v.y = Math.max(it.v.y, 0); g.updateMatrixWorld(true); gap = 0.15; }
    it.gap = gap;
    // A soft whoosh with each downstroke, heard through its shot
    if (it.bus && A > 0.4 && crew && Math.floor(ph0 - 0.25) < Math.floor(it.ph - 0.25) && api.sfx.live()) {
      const k = api.sfx, at = k.now(), d = g.getWorldPosition(it.tmp).distanceTo(api.camera.position), v = 0.16 * A * THREE_clamp(16 / d, 0.25, 1);
      const fl = k.filt("bandpass", 300, 0.8, k.env(it.bus, v, 0.08, 0.35, at)); fl.frequency.setValueAtTime(420, at); fl.frequency.exponentialRampToValueAtTime(200, at + 0.4);
      k.hiss(fl, at, 0.5); k.note("albatross wingbeat");
    }
    // The crew's gaze follows it, a little ahead, and never across the deck
    const e = it.eye.position, sh = shipLocal(api, it, it.side * 4, 0, 0, vs(api)[4]);
    const tgt = vs(api)[5].copy(it.p).addScaledVector(it.v, 0.3); if ((tgt.x - sh.x) * -it.side > 0) tgt.x = sh.x;  // keep to the crew's side of the ship
    if (it.eyeSet && e.distanceTo(tgt) < 30) e.lerp(tgt, 1 - Math.pow(0.02, du)); else { e.copy(tgt); it.eyeSet = true; }
  },
  water(api, it, dt) {  // a wingtip slicing the water as it banks low over it
    if (it.gap > 0.8 || (it.skimT = (it.skimT ?? 0) - dt) > 0) return;
    it.skimT = 0.1;
    const tip = it.bird.wings[it.bank > 0 ? 0 : 1].tip.getWorldPosition(vs(api)[4]), sea = api.seaHeight(tip.x, tip.z);
    if (tip.y - sea < 0.9) { api.churn(tip.x, tip.z, 0.3, 1.2); api.spray(5 * api.WET, tip.x, tip.z, sea, 0.35, 1.6, 0.9); }
  },
  sfx(api, it, bus) {  // a braying call, bill clacks, wind over the wings and (from animate) a whoosh with each wingbeat
    const k = api.sfx, sp = k.echo(bus, 0.28, 0.3, 0.35);
    it.bus = bus;
    const wind = k.env(bus, 0.12, 1.5, 30); k.hiss(k.filt("bandpass", 600, 0.5, wind), k.now(), 30);
    let n = 0;
    return () => {
      n++;
      const at = k.now();
      if (n % 2) {  // "aah-aah-aaaah": a nasal brayed call, rising, the last held
        [[0, 0.22, 420, 520], [0.32, 0.22, 450, 560], [0.66, 0.6, 480, 360]].forEach(([d, len, f0, f1]) => {
          const g = k.env(k.filt("bandpass", 1200, 2.5, sp), 0.16, 0.04, len, at + d), o = k.osc("sawtooth", f0, g, at + d, len + 0.1);
          o.frequency.linearRampToValueAtTime(f1, at + d + len);
        });
        k.note("albatross call"); return 2.4 + Math.random();
      }
      for (let j = 0; j < 7; j++) k.hiss(k.env(k.filt("highpass", 2400, 0.8, bus), 0.12, 0.002, 0.03, at + j * 0.07), at + j * 0.07, 0.06);  // bill clacking
      k.note("albatross clack"); return 1.8 + Math.random();
    };
  },
});
const THREE_clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- 4. Midnight watch: the sea alight with plankton, sparks in the stir, then the bow wave and wake glowing -----------
const SEA_GLOW = 0x3cffd2;
registerMock({
  id: "midnight-watch", title: "Midnight watch (sea-glow)", tier: "cine",
  card: { kicker: "Achievement · Midnight watch", title: "The midnight watch", facts: "Finished a whole season after 2am · the last episode at 3:12am", emblem: "3:12<small>am</small>" },
  off: 9, part: 0.35, stirR: 16, look: -4, crew: [2.5, 4, 2.5],  // a sailor low at the rail amidships, looking forward along the hull
  build(api, it) {
    const { THREE } = api;
    // Always at night: the weeks round it are made late-night weeks (the sky darkens with late viewing)
    const wk = api.voyage.weeks, from = Math.max(0, Math.floor((it.day - 16) / 7)), to = Math.min(wk.length - 1, Math.ceil((it.day + 10) / 7));
    for (let i = from; i <= to; i++) wk[i][1] = 1;
    // Plankton: points of blue-green light flaring where the hull and wake disturb the water, fading behind
    const n = api.lite ? 600 : 1300, pos = new Float32Array(n * 3).fill(-1e4), col = new Float32Array(n * 3);
    const pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: api.GLOW_TEX, size: 2.3, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3)); pts.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
    pts.frustumCulled = false; it.group.add(pts);
    it.plank = { pts, life: new Float32Array(n), max: new Float32Array(n).fill(1), k: new Float32Array(n), next: 0, n, c: new THREE.Color(SEA_GLOW), hot: new THREE.Color(0xc8fff0) };
    // A soft glow under the surface where the bow cuts through, along the hull on the crew's side, and fainter down the wake
    const patch = s => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: api.GLOW_TEX, color: SEA_GLOW, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); m.scale.set(s[0], 1, s[1]); it.group.add(m); return m; };
    it.bowGlow = patch([7, 9]); it.sideGlow = patch([4, 20]); it.wakeGlow = patch([9, 26]); it.q = new THREE.Quaternion();
    it.eye = new THREE.Group(); it.group.add(it.eye); it.head = it.eye;  // the crew look down along the hull towards the bow wave
  },
  onShot(api, it) { it.t0 = api.time; },
  animate(api, it, dt) {
    settle(api, it, 0);
    const T = api.time, s = shotT(api, it), p = vs(api)[5];  // not [0]: seaLocal() uses that
    shipLocal(api, it, it.side * 8.5, 0, -14, it.eye.position);
    it.eye.position.y = seaLocal(api, it, it.eye.position.x, it.eye.position.z);
    const P = it.plank, pos = P.pts.geometry.attributes.position, col = P.pts.geometry.attributes.color;
    const on = s < 0 ? 0 : ease(s / 1.6), stir = s < 0 ? it.stir ?? 0 : 1;
    const put = (x, z, life, k) => {  // a spark at x, z in the ship's frame
      const i = P.next; P.next = (P.next + 1) % P.n;
      shipLocal(api, it, x, 0, z, p);
      pos.setXYZ(i, p.x, seaLocal(api, it, p.x, p.z) + 0.25, p.z); P.max[i] = P.life[i] = life; P.k[i] = k;
    };
    // The build-up: faint sparks winking on in the water as it stirs, round the hull and out over the stirred patch
    const faint = Math.round(dt * (api.lite ? 90 : 180) * stir * (1 - on) + Math.random() * 0.5);
    for (let k = 0; k < faint; k++) {
      if (Math.random() < 0.55) { const sd = Math.random() < 0.5 ? -1 : 1; put(sd * (2 + Math.random() * 6), -12 + Math.random() * 30, 0.6 + Math.random() * 1.2, 0.6 + Math.random() * 0.4); }
      else {
        const a = Math.random() * 6.283, r = it.mock.stirR * Math.sqrt(Math.random()), i = P.next; P.next = (P.next + 1) % P.n;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        pos.setXYZ(i, x, seaLocal(api, it, x, z) + 0.25, z); P.max[i] = P.life[i] = 0.6 + Math.random() * 1.4; P.k[i] = 0.7 + Math.random() * 0.5;
      }
    }
    // The shot: brightening and spreading along the bow wave, the waterline and the arms of the wake
    const spawn = Math.round(dt * (api.lite ? 320 : 700) * on);
    for (let k = 0; k < spawn; k++) {
      const r = Math.random(), sd = Math.random() < 0.7 ? it.side : -it.side, wide = 0.6 + 0.4 * on;
      if (r < 0.14) {  // the swirl off the stem, curling out from under the bow
        const a = Math.random() * 4, rr = 0.4 + a * 0.55;
        put(sd * Math.sin(a + T * 2) * rr * 0.7, -11.5 + Math.cos(a + T * 2) * rr * 0.6 + a * 0.6, 1.4 + Math.random() * 1.6, 1.6);
      } else if (r < 0.55) { const z = -11 + Math.random() * 7; put(sd * (0.5 + (z + 11) * 0.55 * wide + Math.random() * 1.2), z, 1 + Math.random() * 2.2, 1); }  // bow wave, flaring off the stem
      else if (r < 0.62) put(sd * (2.3 + Math.random() * 0.9), -4 + Math.random() * 14, 1 + Math.random() * 2.2, 1);  // along the waterline
      else if (r < 0.78) { const z = -8 + Math.random() * 16; put(sd * (3 + (z + 8) * 0.4 * wide + Math.random() * 1.5), z, 0.8 + Math.random() * 1.6, 0.75); }  // the bow wave spreading out from the hull
      else { const z = 10 + Math.random() * 40 * wide; put(sd * ((z - 10) * 0.34 + (Math.random() - 0.5) * 2.2), z, 1 + Math.random() * 2.2, 0.9); }  // the wake's arms
    }
    for (let i = 0; i < P.n; i++) {
      if (P.life[i] <= 0) { col.setXYZ(i, 0, 0, 0); continue; }
      P.life[i] -= dt; const u = Math.max(0, P.life[i] / P.max[i]), x = pos.getX(i), z = pos.getZ(i), K = P.k[i];
      const w = Math.min(1, (1 - u) * 8), b = w * u * u * K * (0.75 + 0.25 * Math.sin(T * 3 + x * 0.3 + z * 0.2));  // winking on, fading, gently pulsing
      const h = Math.max(0, K - 1) * u;  // the swirl's brightest sparks run whiter
      col.setXYZ(i, (P.c.r + (P.hot.r - P.c.r) * h) * b, (P.c.g + (P.hot.g - P.c.g) * h) * b, (P.c.b + (P.hot.b - P.c.b) * h) * b);
      pos.setY(i, seaLocal(api, it, x, z) + 0.25);
    }
    pos.needsUpdate = col.needsUpdate = true;
    // The glow under the bow and down the wake, swelling and pulsing as the shot goes on
    const pulse = 0.8 + 0.2 * Math.sin(T * 2.2);
    shipLocal(api, it, it.side * 1.5, 0, -9.5, it.bowGlow.position); it.bowGlow.position.y = seaLocal(api, it, it.bowGlow.position.x, it.bowGlow.position.z) + 0.15;
    shipLocal(api, it, it.side * 4.2, 0, 1, it.sideGlow.position); it.sideGlow.position.y = seaLocal(api, it, it.sideGlow.position.x, it.sideGlow.position.z) + 0.13;
    shipLocal(api, it, 0, 0, 24, it.wakeGlow.position); it.wakeGlow.position.y = seaLocal(api, it, it.wakeGlow.position.x, it.wakeGlow.position.z) + 0.12;
    api.ship.getWorldQuaternion(it.bowGlow.quaternion).premultiply(it.group.getWorldQuaternion(it.q).invert()); it.wakeGlow.quaternion.copy(it.bowGlow.quaternion); it.sideGlow.quaternion.copy(it.bowGlow.quaternion);
    it.bowGlow.material.opacity = (0.1 * stir + 0.55 * on) * pulse; it.sideGlow.material.opacity = 0.35 * on * pulse; it.wakeGlow.material.opacity = 0.25 * on * pulse;
  },
  sfx(api, it, bus) {  // a soft pulsing chord under it all, the hiss of the bow wave, and glassy notes drifting up
    const k = api.sfx, at = k.now(), pad = k.env(bus, 0.07, 2, 40, at), lp = k.filt("lowpass", 900, 0.6, pad);
    const swell = k.ac.createGain(); swell.gain.value = 0.7; swell.connect(lp); k.wobble(swell.gain, 0.42, 0.3);
    [220, 277.2, 329.6, 440].forEach(f => { const o = k.osc("sine", f, swell, at, 40); k.wobble(o.detune, 0.1 + Math.random() * 0.1, 6); });
    const wash = k.filt("bandpass", 700, 0.6, k.env(bus, 0.05, 3, 40, at)); k.wobble(wash.frequency, 0.3, 250); k.hiss(wash, at, 40);
    const sp = k.echo(bus, 0.4, 0.45, 0.5);
    return () => {
      const f = [880, 1108.7, 1318.5, 1760, 2217.5][Math.floor(Math.random() * 5)], t = k.now();
      k.osc("sine", f, k.env(sp, 0.03, 0.02, 1.8, t), t, 2); k.note("glow note");
      return 0.7 + Math.random() * 1.1;
    };
  },
});

// ---- 5. Narwhal: a small pod surfacing, the leader raising its spiral tusk to the sky with a gleam running along it -----
// Each body flexes along a spine (bend() below, every frame): a wave running back from mid-body to the flukes, which
// beat up and down, the head kept steady; flippers paddle and steer; a rear bends the front half up to the sky.
const NARWHAL_LEN = 7;
function makeNarwhal(api, tusk = true) {  // faces -z, about 7 long, centred
  const { THREE } = api, g = new THREE.Group(); g.rotation.order = "YXZ";  // heading, then pitch, then the bank
  const prof = [[0, 0.05], [0.25, 0.32], [1, 0.62], [2.2, 1.05], [3.6, 1.2], [5, 1.1], [6.1, 0.85], [6.7, 0.5], [7, 0]].map(([y, r]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(prof, 18).rotateX(-Math.PI / 2).translate(0, 0, NARWHAL_LEN / 2), pv = geo.attributes.position, cols = [];
  const dark = new THREE.Color(0x4b525a), pale = new THREE.Color(0xdfe3e2), c = new THREE.Color();
  for (let k = 0; k < pv.count; k++) {  // dark mottled back, pale spotted belly
    const y = pv.getY(k), x = pv.getX(k), z = pv.getZ(k), r = Math.hypot(x, y) || 1;
    const spot = Math.sin(x * 9.1 + z * 3.7) * Math.sin(z * 5.3 - y * 7.7) > 0.35 ? 0.35 : 0;
    c.copy(pale).lerp(dark, ease((y / r + 0.4) / 1.1)).lerp(dark, spot * (1 - ease(y / r + 0.5)));
    if (spot && y > 0) c.lerp(pale, 0.25);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const skin = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.4 });
  const body = new THREE.Mesh(geo, skin); body.frustumCulled = false; g.add(body);
  const fin = mat(api, 0x4b525a);
  const fluke = new THREE.Group(); fluke.position.z = 3.4; g.add(fluke);
  const flippers = [-1, 1].map(sd => {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4), fin); f.scale.set(1.1, 0.1, 0.5); f.position.set(sd * 0.9, 0, 0.35); f.rotation.y = sd * 0.5; fluke.add(f);
    const pivot = new THREE.Group(); pivot.position.set(sd * 0.9, -0.38, -2); g.add(pivot);  // a flipper hinged at the body
    const fl = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4), fin); fl.scale.set(0.7, 0.1, 0.3); fl.position.set(sd * 0.4, -0.08, 0); fl.rotation.y = sd * 0.4; pivot.add(fl);
    return { pivot, sd };
  });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  const eyes = [-1, 1].map(sd => { const e = eye.clone(); e.position.set(sd * 0.82, 0.1, -2.75); g.add(e); return e; });
  let t = null, gleam = null;
  if (tusk) {
    // The tusk: a long cone with a helical groove (diagonal stripes wrapped round it), out of the left of the upper lip
    const tex = api.canvasTexture(64, 256, (gg, w, h) => {
      gg.fillStyle = "#f3ead2"; gg.fillRect(0, 0, w, h); gg.strokeStyle = "#b6a47e"; gg.lineWidth = 7;
      for (let y = -h; y < h * 2; y += 22) { gg.beginPath(); gg.moveTo(0, y); gg.lineTo(w, y + 30); gg.stroke(); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 3);
    t = new THREE.Mesh(new THREE.ConeGeometry(0.17, 5.2, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -2.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.15, emissive: 0xfff4d0, emissiveIntensity: 0 }));
    t.position.set(-0.22, 0.05, -3.4); g.add(t);
    gleam = glowSprite(api, 0xfff8e0, 1.8, 0); t.add(gleam);
  }
  // A streak of white water trailing it while its back is at the surface (in the pod's frame, flat on the sea)
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ map: api.GLOW_TEX, color: 0xf2f8fa, transparent: true, opacity: 0, depthWrite: false }));
  wake.scale.set(2.2, 1, 10);
  return { g, body, base: Float32Array.from(pv.array), fluke, flippers, eyes, tusk: t, gleam, wake, beat: Math.random() * 6 };
}
// The spine's height at u (0 the snout, 1 the tail stock) in the narwhal's frame: the swimming wave, strongest aft, and
// the rear's curve (the head and front half lifted, the tail hanging)
function spineY(u, beat, amp, rear) {
  const env = 0.06 + 0.94 * ease((u - 0.2) / 0.8);
  return amp * env * Math.sin(beat - 2.4 * u) + rear * (1.5 * (1 - u) * (1 - u) - 0.5 * u * u);
}
function spineAt(u, beat, amp, rear) {  // [height, pitch] (positive pitch is nose up)
  const e = 0.02, y = spineY(u, beat, amp, rear);
  return [y, Math.atan(((spineY(u + e, beat, amp, rear) - spineY(u - e, beat, amp, rear)) / (2 * e)) / NARWHAL_LEN)];
}
function bend(n, amp, rear) {  // flex the body, then hang the flukes, flippers, eyes and tusk on the spine
  const a = n.body.geometry.attributes.position, B = n.base, L = NARWHAL_LEN;
  for (let k = 0; k < a.count; k++) {
    const x = B[k * 3], y = B[k * 3 + 1], z = B[k * 3 + 2], [c, th] = spineAt(THREE_clamp(z / L + 0.5, 0, 1), n.beat, amp, rear);
    a.setXYZ(k, x, c + y * Math.cos(th), z + y * Math.sin(th));
  }
  a.needsUpdate = true; n.body.geometry.computeVertexNormals();
  const [fy, ft] = spineAt(0.99, n.beat, amp, rear);
  n.fluke.position.y = fy; n.fluke.rotation.x = ft - amp * 1.4 * Math.cos(n.beat - 2.4 - 0.5);  // the flukes lag the stock: a beat, not a hinge
  const [py, pt] = spineAt(0.21, n.beat, amp, rear);
  for (const f of n.flippers) {  // paddling, and the outer one dipped into a turn
    f.pivot.position.y = py - 0.38; f.pivot.rotation.x = pt + 0.25 * Math.sin(n.beat * 0.5 + f.sd) + n.steer * f.sd * 0.6;
    f.pivot.rotation.z = f.sd * (-0.35 + 0.22 * Math.sin(n.beat * 0.5 + 1.2 + f.sd * 0.4));
  }
  const [ey] = spineAt(0.11, n.beat, amp, rear); for (const e of n.eyes) e.position.y = ey + 0.1;
  if (n.tusk) { const [ty, tt] = spineAt(0.01, n.beat, amp, rear); n.tusk.position.y = ty + 0.05; n.tusk.rotation.x = 0.04 - tt; }  // tt is the slope (nose up is negative), so the tusk lifts with the head
}
// Narwhal sounds, only while its shot is running
const narSfx = (api, it, f) => { if (api.sfx.live() && api.shot.it === it && api.sfx.bus) f(api.sfx, api.sfx.bus); };
registerMock({
  id: "narwhal", title: "Narwhal (the rarest achievement)", tier: "cine",
  card: { kicker: "Achievement · Narwhal", title: "The narwhal", facts: "The rarest on YarrFlix this year: Midnight watch", emblem: "1<small>crew</small>" },
  off: 26, part: 0.3, stirR: 14, look: -3,
  build(api, it) {
    const { THREE } = api;
    // [out, back, cycle phase, has a tusk]; each swims its own surfacing cycle, at its own pace
    it.pod = [[0, 0, 0.12, true], [-5, 4, 0.55, true], [4.5, 6, 0.8, true], [1.5, 10, 0.3, false]].map(([x, z, ph, tusk], k) => {
      const n = makeNarwhal(api, tusk); n.g.scale.setScalar(k === 0 ? 1.1 : k === 3 ? 0.7 : 0.95); it.group.add(n.g, n.wake);
      return { ...n, x, z, ph, k, rate: 0.36 + k * 0.035, steer: 0, lead: k === 0 };
    });
    // Sparkles drifting off the leader's tusk
    const n = api.lite ? 24 : 48, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const sp = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: api.GLOW_TEX, size: 0.7, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3)); sp.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
    sp.frustumCulled = false; it.group.add(sp);
    it.sparks = { sp, n, d: Array.from({ length: n }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() })), next: 0 };
    it.lead = it.pod[0]; it.head = it.lead.g;
  },
  onShot(api, it) { it.t0 = api.time; },
  animate(api, it, dt) {
    settle(api, it);
    const T = api.time, s = shotT(api, it), up = it.emerge ?? 1, [p, q] = vs(api), on = s < 0 ? 0 : 1;
    for (const n of it.pod) {
      // Along through the water: a steady swim in the shot, each easing ahead and dropping back on the others, weaving
      const go = Math.max(0, s) * 0.55, jz = 1.7 * Math.sin(T * 0.31 + n.ph * 9), jx = 1.3 * Math.sin(T * 0.23 + n.ph * 7);
      const vx = 1.3 * 0.23 * Math.cos(T * 0.23 + n.ph * 7), ax = -1.3 * 0.23 * 0.23 * Math.sin(T * 0.23 + n.ph * 7);
      const fwd = 1.4 * on + 0.53 * Math.cos(T * 0.31 + n.ph * 9) + 0.6;  // its speed through the water, by world second
      const yaw = -Math.atan2(vx, fwd);
      n.steer = THREE_clamp(-ax * 6, -0.5, 0.5);
      n.g.position.x = n.x + jx; n.g.position.z = n.z - go - jz;
      const sea = seaLocal(api, it, n.g.position.x, n.g.position.z);
      // Its surfacing cycle: rising nose first, the blowhole and back rolling out over the top of the arc, then the
      // back and flukes rolling under; a stretch just below, beating harder, then up again
      const c = (T * n.rate + n.ph) % 1, W = 0.48;
      let y, pitch, amp;
      if (c < W) { const v = c / W; y = -2.7 + 2.55 * Math.sin(v * Math.PI); pitch = 0.34 * Math.cos(v * Math.PI); amp = 0.16; }
      else { const v = (c - W) / (1 - W); y = -2.7 - 0.7 * Math.sin(v * Math.PI); pitch = -0.34 * Math.cos(v * Math.PI); amp = 0.3; }
      let rear = 0;
      if (n.lead && s >= 0) {
        // The leader rears up: the front half bent up out of the water, head and tusk to the sky, held, then down
        const w = ease((s - 0.4) / 1.6) * (1 - ease((s - 6.6) / 1.5)), r = ease((s - 1) / 2) * (1 - ease((s - 6.6) / 1.5));
        y += (-0.6 + r * 1.2 - y) * w; pitch += (r * 0.72 + Math.sin(T * 1.1) * 0.03 - pitch) * w; amp += (0.14 - amp) * w; rear = r;
      }
      n.g.position.y = sea + y - 3.2 * (1 - up);
      n.g.rotation.set(pitch, yaw, n.steer * 0.5 + Math.sin(T * 0.7 + n.ph * 4) * 0.04);
      n.beat += dt * (amp > 0.2 ? 6 : 4) * (0.8 + 0.25 * fwd);  // the beat quickens as it speeds up
      n.surf = c < W ? Math.sin(c / W * Math.PI) : 0;
      bend(n, amp, rear);
      // The wake streak behind it while its back is out
      n.wake.position.set(n.g.position.x + Math.sin(yaw), sea + 0.08, n.g.position.z + Math.cos(yaw)); n.wake.rotation.y = yaw;
      n.wake.material.opacity += ((n.surf > 0.55 && up > 0.9 ? 0.5 * n.g.scale.x : 0) - n.wake.material.opacity) * Math.min(1, dt * 3);
      if (n.tusk) n.tusk.material.emissiveIntensity = n.lead && s >= 0 ? 0.15 + 0.25 * ease((s - 2) / 1.5) : 0;
    }
    // A gleam running along the leader's tusk, base to tip, and sparkles thrown off its point
    const L = it.lead, gl = L.gleam, run = s < 2.2 ? -1 : ((s - 2.2) * 0.4) % 1;
    gl.material.opacity = run < 0 ? 0 : Math.sin(run * Math.PI) * 0.95;
    gl.position.set(0, 0, -5.2 * run); gl.scale.setScalar(1.2 + Math.sin(run * Math.PI) * 1.4);
    const S = it.sparks, pos = S.sp.geometry.attributes.position, col = S.sp.geometry.attributes.color;
    if (s > 2.4 && Math.random() < dt * (api.lite ? 10 : 20)) {
      const d = S.d[S.next]; S.next = (S.next + 1) % S.n;
      L.tusk.localToWorld(q.set(0, 0, -5.2 * Math.random() ** 0.4)); it.group.worldToLocal(q);
      d.p.copy(q); d.v.set((Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8); d.life = 1 + Math.random();
    }
    S.d.forEach((d, k) => {
      d.life -= dt; if (d.life <= 0) { col.setXYZ(k, 0, 0, 0); return; }
      d.p.addScaledVector(d.v, dt); const b = Math.min(1, d.life) * (0.6 + 0.4 * Math.sin(T * 20 + k));
      pos.setXYZ(k, d.p.x, d.p.y, d.p.z); col.setXYZ(k, b, b * 0.95, b * 0.8);
    });
    pos.needsUpdate = col.needsUpdate = true;
    rarityLine(api, "The rarest on YarrFlix this year: Midnight watch", "Only 1 crew on the server managed this");
  },
  water(api, it, dt) {
    const s = shotT(api, it), T = api.time, [, , p] = vs(api);
    if (!it.popped && (it.emerge ?? 1) > 0.75) { it.popped = true; const L = it.lead.g.position; breach(api, it, L.x, L.z - 2, 0.7, 80, 3, 5, 2); }
    for (const n of it.pod) {
      // The blowhole: breaking the surface (a splash and foam ring), a blow a moment later, then the flukes rolling under
      n.g.localToWorld(p.set(0, spineY(0.3, n.beat, 0.2, 0) + 1.05, -1.4)); let sea = api.seaHeight(p.x, p.z);
      const out = p.y > sea - 0.05;
      if (out && !n.out && (it.emerge ?? 1) > 0.9) {
        api.churn(p.x, p.z, 0.55, 2.4); api.spray(28 * api.WET, p.x, p.z, sea, 0.9, 4.2, 1.5); n.blowAt = T + 0.12;
        narSfx(api, it, (k, bus) => k.play("splash", bus, { rate: 1.25 + Math.random() * 0.3, gain: 0.2 * n.g.scale.x }));
      }
      if (n.blowAt && T > n.blowAt) {  // a small plume of spray
        n.blowAt = 0; api.spray(36 * api.WET, p.x, p.z, sea + 0.6, 0.22, 8.5 * n.g.scale.x, 0.6, sea + 1.4);
        narSfx(api, it, (k, bus) => exhale(k, bus, 0.22 * n.g.scale.x, 0.8));
      }
      if (!out && n.out) n.diveAt = T + 0.3;  // the flukes follow the back under
      n.out = out;
      if (n.diveAt && T > n.diveAt) {
        n.diveAt = 0; n.fluke.getWorldPosition(p); sea = api.seaHeight(p.x, p.z);
        if (p.y > sea - 1.2) {
          api.churn(p.x, p.z, 0.45, 1.8); api.spray(20 * api.WET, p.x, p.z, sea, 0.7, 3.2, 1);
          narSfx(api, it, (k, bus) => k.play("plop", bus, { rate: 0.6 + Math.random() * 0.2, gain: 0.35 }));
        }
      }
      if (n.surf > 0.5 && (n.foamT = (n.foamT ?? Math.random() * 0.4) - dt) < 0) {  // foam shed along the back as it rolls over
        n.foamT = api.lite ? 0.5 : 0.32; n.g.localToWorld(p.set(0, 0.6, 0.6)); sea = api.seaHeight(p.x, p.z);
        api.churn(p.x, p.z, 0.25, 1.5); if (Math.random() < 0.6) api.spray(6 * api.WET, p.x, p.z, sea, 0.9, 1.6, 0.8);
      }
    }
    if (s > 1.4 && s < 4 && Math.random() < dt * 10) { it.lead.tusk.getWorldPosition(p); api.drip(6, p, api.seaHeight(p.x, p.z), 1.4); }  // water pouring off the raised head
    if (!it.reared && s > 1.8) {
      it.reared = true; it.lead.g.getWorldPosition(p); api.ring(p.x, p.z, 0.6); api.spray(50 * api.WET, p.x, p.z, api.seaHeight(p.x, p.z), 2.2, 4, 1.6);
      narSfx(api, it, (k, bus) => k.play("splash", bus, { rate: 0.9, gain: 0.4 }));
    }
  },
  sfx(api, it, bus) {  // clicks and whistles under water and a shimmer as the gleam runs along the tusk (splashes and blows come with the water)
    const k = api.sfx, sp = k.echo(bus, 0.36, 0.4, 0.45); let n = 0;
    return () => {
      n++; const at = k.now();
      if (n % 3 === 0) {
        [2093, 2637, 3136, 4186].forEach((f, j) => k.osc("sine", f, k.env(sp, 0.035, 0.005, 1.4, at + j * 0.09), at + j * 0.09, 1.6));
        k.note("tusk gleam"); return 1.6;
      }
      if (Math.random() < 0.5) {  // a whistle, gliding
        const g = k.env(k.filt("bandpass", 3000, 1, sp), 0.06, 0.05, 0.6, at), o = k.osc("sine", 2200 + Math.random() * 800, g, at, 0.7);
        o.frequency.exponentialRampToValueAtTime(3800 + Math.random() * 1500, at + 0.5); k.note("narwhal whistle");
      } else {
        for (let j = 0; j < 9; j++) k.hiss(k.env(k.filt("bandpass", 3500, 2, bus), 0.08, 0.001, 0.015, at + j * 0.045), at + j * 0.045, 0.03);
        k.note("narwhal clicks");
      }
      return 0.9 + Math.random() * 0.8;
    };
  },
});

// ---- 6. Longest sitting: an ocean sunfish basking on its side at the surface, a gull come to sit on it ------------
// (Other ideas: a becalmed sea with slack sails, the crew lounging and an hourglass; a sea-clock buoy; a giant octopus.)
function makeSunfish(api) {  // the body in the xy plane (head at -z after turning), about 6 long and 9 fin to fin
  const { THREE } = api, g = new THREE.Group(), skin = mat(api, 0xa9b6bf, { roughness: 0.45, metalness: 0.15, flatShading: false }), fin = mat(api, 0x6f7a82, { flatShading: false });
  const s = new THREE.Shape(); s.absellipse(0, 0, 3, 2.6, 0, Math.PI * 2);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.45, bevelSize: 0.4, bevelSegments: 3, curveSegments: 24 }).translate(0, 0, -0.45), skin);
  g.add(body);
  // The clavus: a scalloped back edge in place of a tail
  for (let k = 0; k < 7; k++) { const a = Math.PI * (0.62 + k / 6 * 0.76), m = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), fin); m.scale.set(1, 0.85, 0.45); m.position.set(Math.cos(a) * 3.1, Math.sin(a) * 2.7, 0); g.add(m); }
  // Tall dorsal and anal fins, set back; they scull and flop
  const finShape = new THREE.Shape(); finShape.moveTo(-0.9, 0); finShape.quadraticCurveTo(-0.9, 3, -0.2, 4.2); finShape.quadraticCurveTo(0.5, 4, 0.9, 0); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1 }).translate(0, -0.3, -0.12);
  const dorsal = new THREE.Group(), anal = new THREE.Group(); dorsal.position.set(-1.2, 2.2, 0); anal.position.set(-1.2, -2.2, 0); anal.scale.y = -1;
  dorsal.add(new THREE.Mesh(finGeo, fin)); anal.add(new THREE.Mesh(finGeo, fin)); g.add(dorsal, anal);
  // Big round eyes, a little round mouth, pale blotches
  [-1, 1].forEach(sd => {
    const ring = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat(api, 0xdfe4e6)); ring.scale.z = 0.4; ring.position.set(1.7, 0.75, sd * 0.85); g.add(ring);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshBasicMaterial({ color: 0x15181a })); eye.scale.z = 0.5; eye.position.set(1.78, 0.78, sd * 0.98); g.add(eye);
    for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.25 + Math.random() * 0.35, 8), mat(api, 0xc3cbcf, { flatShading: false })); b.position.set(-2 + Math.random() * 3.6, -1.6 + Math.random() * 3, sd * 0.93); if (sd < 0) b.rotation.y = Math.PI; g.add(b); }
    const pec = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 4), fin); pec.scale.set(0.6, 1, 0.2); pec.position.set(0.9, 0.1, sd * 0.85); g.add(pec);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 6, 12), mat(api, 0x6a6460)); mouth.rotation.y = Math.PI / 2; mouth.position.set(3.15, 0.3, 0); g.add(mouth);
  const out = new THREE.Group(); g.rotation.y = Math.PI / 2; out.add(g);  // head (+x) to -z
  return { g: out, dorsal, anal };
}
function makePerchedGull(api) {  // a small gull that flies in and sits; faces -z
  const { THREE } = api, g = new THREE.Group(), white = mat(api, 0xf6f6f2), grey = mat(api, 0x9aa3ab);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), white); body.scale.set(0.32, 0.32, 0.55); body.position.y = 0.45; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), white); head.position.set(0, 0.8, -0.42); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), mat(api, 0xf2c240)); beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.78, -0.7); g.add(beak);
  [-1, 1].forEach(sd => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), new THREE.MeshBasicMaterial({ color: 0x111111 })); e.position.set(sd * 0.13, 0.85, -0.55); g.add(e);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 4), mat(api, 0xe08a3a)); leg.position.set(sd * 0.1, 0.15, 0); g.add(leg); });
  const wings = [-1, 1].map(sd => { const w = new THREE.Group(); w.position.set(sd * 0.28, 0.55, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.45), grey); m.position.x = sd * 0.5; w.add(m);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), mat(api, 0x1c1c1c)); tip.position.x = sd * 1.2; w.add(tip); g.add(w); return { w, sd }; });
  return { g, wings };
}
registerMock({
  id: "longest-sitting", title: "Longest sitting (a basking sunfish)", tier: "cine",
  card: { kicker: "Achievement · Longest sitting", title: "The longest sitting", facts: "6 h 40 m in one go, on 14 March · basking like a sunfish", emblem: "6:40<small>hours</small>" },
  off: 22, part: 0.35, stirR: 10, look: -3.2,
  build(api, it) {
    const f = makeSunfish(api); f.g.scale.setScalar(1.35); it.group.add(f.g); it.fish = f;
    const gull = makePerchedGull(api); gull.g.scale.setScalar(1.6); it.group.add(gull.g); it.gull = gull;
    it.head = f.g;
  },
  onShot(api, it) { it.t0 = api.time; },
  animate(api, it, dt) {
    settle(api, it);
    const T = api.time, s = shotT(api, it), up = it.emerge ?? 1, f = it.fish, [p] = vs(api);
    // Upright under the stir with only the fin tip showing, then up, and slowly over onto its side to bask in the sun
    const roll = s < 0 ? 0 : ease((s - 1.5) / 3.5), rise = up;
    f.g.position.y = -5.5 * (1 - rise) - 2.4 * (1 - roll) * rise + roll * 0.3 + Math.sin(T * 0.8) * 0.1;
    f.g.rotation.set(0, 0.15, -it.side * roll * 0.95 + Math.sin(T * 0.5) * 0.04);  // the near flank tipped up to the sky and the crew  // over on its side, the flank to the sky and the crew
    // The fins scull lazily, and once over the top one flops down, slapping the water now and then
    const flop = roll > 0.9 ? Math.max(0, Math.sin(T * 0.9)) ** 6 : 0;
    f.dorsal.rotation.x = Math.sin(T * (roll > 0.5 ? 0.9 : 1.8)) * 0.35 + flop * 0.5; f.anal.rotation.x = -Math.sin(T * 1.8 + 1) * 0.3 * (1 - roll);
    it.flop = flop;
    // The gull glides in and settles on its flank
    const G = it.gull, land = s < 0 ? 0 : ease((s - 4.2) / 2.5);
    f.g.updateMatrixWorld(); f.g.localToWorld(p.set(-it.side * 1.15, 0.9, 0.4)); it.group.worldToLocal(p);  // a spot on the flank
    const from = vs(api)[1].set(p.x + it.side * 14, p.y + 9, p.z + 10);
    G.g.visible = s > 3.8;
    G.g.position.copy(from).lerp(p, land); G.g.position.y += Math.sin(land * Math.PI) * 2 + (land > 0.99 ? 0.55 : 0.55 * land);
    G.g.rotation.set(0, Math.atan2(-(p.x - from.x), -(p.z - from.z)) * (1 - land) + land * (Math.PI * 0.5 * it.side), 0);
    for (const w of G.wings) { const sat = land > 0.99; w.w.rotation.z = sat ? 0 : w.sd * (0.4 * Math.sin(T * 14) + (land > 0.75 ? 0.6 : 0)); w.w.rotation.y = sat ? -w.sd * 1.4 : 0; }  // folded once down
  },
  water(api, it, dt) {
    const s = shotT(api, it), gp = it.group.position, [, , p] = vs(api);
    if (!it.popped && (it.emerge ?? 1) > 0.75) { it.popped = true; api.ring(gp.x, gp.z, 0.6); api.spray(60 * api.WET, gp.x, gp.z, gp.y, 3, 4, 1.8); }
    if (s >= 0 && s < 6) api.mound(gp.x, gp.z, 0.4 * Math.sin(Math.min(1, s / 5.5) * Math.PI), 8);  // the sea rolling over as it turns
    if ((it.foamT = (it.foamT ?? 0) - dt) < 0) { it.foamT = 0.6; const a = Math.random() * 6.28; api.churn(gp.x + Math.cos(a) * 3.5, gp.z + Math.sin(a) * 3.5, 0.3, 2); }  // lapping round it
    // A fin flopping onto the water
    if (it.flop > 0.8 && !it.slapped) {
      it.slapped = true; it.fish.dorsal.getWorldPosition(p); p.y = api.seaHeight(p.x, p.z);
      api.ring(p.x, p.z, 0.45); api.spray(30 * api.WET, p.x, p.z, p.y, 1.2, 3, 1.4); api.churn(p.x, p.z, 0.6, 2.2);
      if (api.sfx.live() && api.shot.it === it) api.sfx.play("splash", api.sfx.bus, { rate: 1.1, gain: 0.3 });
    }
    if (it.flop < 0.1) it.slapped = false;
  },
  sfx(api, it, bus) {  // the sea washing round it, contented bubbles, and the gull's cry as it lands
    const k = api.sfx; let n = 0;
    return () => {
      n++; const at = k.now();
      if (n === 5) { k.play("gulls", bus, { rate: 1.05, gain: 0.45 }); k.note("gull lands"); return 2.5; }
      if (n === 1) { k.play("splash", bus, { rate: 0.8, gain: 0.35 }); return 1.2; }
      for (let j = 0; j < 3; j++) {  // bubbles: little rising blips
        const t = at + j * (0.12 + Math.random() * 0.1), o = k.osc("sine", 260 + Math.random() * 140, k.env(bus, 0.05, 0.01, 0.12, t), t, 0.15);
        o.frequency.exponentialRampToValueAtTime(700 + Math.random() * 300, t + 0.12);
      }
      k.note("sunfish bubbles"); return 1 + Math.random() * 0.8;
    };
  },
});

// ---- 7. The rarity line on a highlighted card: a Leviathan sailed past (no shot), its card gilded and marked rare -------
const RARE_FACTS = "Every episode, start to finish: 75 of 75 · finished 14 March";
registerMock({
  id: "rarity-card", title: "Rarity line on a highlighted card", tier: "loud",
  card: { kicker: "Achievement · Leviathan", title: "Battlestar Galactica", facts: RARE_FACTS, emblem: "3<small>crews</small>" },
  off: 36, range: 8, side: -1,
  build(api, it) {
    const w = api.model("whale");
    if (!w) return;
    it.group.add(w); it.whale = w; it.head = w;
    if (api.MODELS.whale.animations?.length) { const mx = new api.THREE.AnimationMixer(w); mx.clipAction(api.MODELS.whale.animations[0]).setLoop(api.THREE.LoopPingPong).play(); api.mixers.push(mx); }
  },
  animate(api, it) {
    settle(api, it);
    if (it.whale) { const T = api.time; it.whale.position.set(0, -1.6 + Math.sin(T * 0.6) * 0.5, -Math.sin(T * 0.1) * 4); it.whale.rotation.set(Math.cos(T * 0.6) * 0.06, Math.PI, 0); }
    rarityLine(api, RARE_FACTS, "Only 3 crews on the server managed this", true);
  },
  water(api, it, dt) {
    if (!it.whale) return;
    if ((it.blowT = (it.blowT ?? 2) - dt) < 0) { it.blowT = 5; const p = it.whale.getWorldPosition(vs(api)[2]); api.spray(50 * api.WET, p.x, p.z, api.seaHeight(p.x, p.z) + 1, 0.5, 9, 0.6); api.churn(p.x, p.z, 0.5, 4); }
  },
});
