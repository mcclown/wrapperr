// Two example mock scenes: the harness's own check, and a pattern to copy (see README.md for the contract and api)

// A message in a bottle, bobbing: a cine scene, hidden until the crew's-eye shot, coming up through the stir
registerMock({
  id: "bottle", title: "Message in a bottle (example)", tier: "cine",
  card: { kicker: "Achievement · Treasure hunt", title: "A message in a bottle", facts: "3 requests watched within a day of arriving", emblem: "3<small>finds</small>" },
  off: 22, part: 0.35, stirR: 9, look: -2.5,
  build(api, it) {
    const { THREE } = api, glass = new THREE.MeshStandardMaterial({ color: 0x4f9a78, roughness: 0.08, transparent: true, opacity: 0.55, depthWrite: false });
    const body = new THREE.Group(), b = new THREE.Group();  // body bobs; b is the bottle lying along x
    const lathe = new THREE.LatheGeometry([[0, -1.6], [0.62, -1.6], [0.7, -1.4], [0.7, 0.5], [0.55, 0.9], [0.24, 1.25], [0.24, 1.9], [0.3, 1.95], [0, 1.95]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
    b.add(new THREE.Mesh(lathe, glass));
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.9 }));
    cork.position.y = 2.05; b.add(cork);
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.9, 10), new THREE.MeshStandardMaterial({ color: 0xf2e3b8, roughness: 0.8 }));
    paper.position.y = -0.4; b.add(paper);
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0xc8402e, roughness: 0.6 }));
    ribbon.rotation.x = Math.PI / 2; ribbon.position.y = -0.4; b.add(ribbon);
    b.rotation.z = Math.PI / 2 - 0.25; b.scale.setScalar(1.4);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: api.GLOW_TEX, color: 0xfff2c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glint.position.set(-0.6, 0.9, 0); glint.scale.setScalar(2.5);
    body.add(b, glint); it.group.add(body);
    it.body = body; it.head = body; it.glint = glint;
  },
  animate(api, it, dt, dd) {
    const gp = it.group.position, t = api.time, up = it.emerge ?? 1;
    gp.y = api.seaHeight(gp.x, gp.z);
    it.body.position.y = -6 * (1 - up) + Math.sin(t * 1.7) * 0.25 - 0.1;  // under the stir until the shot brings it up
    it.body.rotation.set(Math.sin(t * 1.3) * 0.18, t * 0.15, Math.sin(t * 0.9 + 1) * 0.22);
    it.glint.material.opacity = up > 0.8 ? 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.6)) ** 6 : 0;
  },
  water(api, it, dt) {
    const gp = it.group.position;
    if (!it.popped && (it.emerge ?? 1) > 0.7) {  // breaking the surface as the shot begins
      it.popped = true; api.ring(gp.x, gp.z, 0.7); api.spray(70 * api.WET, gp.x, gp.z, gp.y, 1.4, 7, 2.2);
      if (api.sfx.live() && api.shot.it === it) api.sfx.play("splash", api.sfx.bus, { rate: 1.6, gain: 0.35 });
    }
    if ((it.foamT = (it.foamT ?? 0) - dt) < 0) { it.foamT = 0.7; api.churn(gp.x + (Math.random() - 0.5) * 2, gp.z + (Math.random() - 0.5) * 2, 0.45, 2.2); }
  },
  sfx(api, it, bus) {  // a plop and a glassy clink as it knocks on the swell
    const k = api.sfx;
    return () => {
      if (Math.random() < 0.5) k.play("plop", bus, { rate: 1.2 + Math.random() * 0.3, gain: 0.35 });
      else { k.bell(bus, 0.04, 1650 + Math.random() * 300); k.note("bottle clink"); }
      return 1 + Math.random() * 1.2;
    };
  },
});

// Crates and barrels adrift: an ambient scene, sailed past with a plain card and no shot
registerMock({
  id: "flotsam", title: "Crates adrift (example)", tier: "ambient",
  card: { kicker: "Flotsam", title: "Crates adrift", facts: "Seen in passing" },
  off: 16, side: -1, range: 8,
  build(api, it) {
    const { THREE } = api;
    it.bits = [[0, 0, "crate"], [3, 4, "barrel"], [-2.5, 6, "crate"], [1.5, -4, "barrel"], [-1, 10, "crate"]].map(([x, z, kind], k) => {
      let o = kind === "barrel" ? api.model("barrel", 1.6) : null;
      if (!o) {
        o = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.4), api.mats.wood); o.add(box);
        for (const y of [-0.45, 0.45]) { const band = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 1.45), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 })); band.position.y = y; o.add(band); }
      }
      o.position.set(x, 0, z); o.rotation.y = k * 1.7; it.group.add(o);
      return { o, ph: k * 1.9 };
    });
  },
  animate(api, it) {
    const t = api.time;
    it.group.updateMatrixWorld();
    for (const b of it.bits) {  // each rides the swell where it floats
      const w = b.o.getWorldPosition(new api.THREE.Vector3());
      b.o.position.y = api.seaHeight(w.x, w.z) - it.group.position.y - 0.3 + Math.sin(t * 1.4 + b.ph) * 0.15;
      b.o.rotation.x = Math.sin(t * 1.1 + b.ph) * 0.2; b.o.rotation.z = Math.sin(t * 0.8 + b.ph * 2) * 0.2;
    }
  },
});
