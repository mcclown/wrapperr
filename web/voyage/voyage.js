import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";

const $ = id => document.getElementById(id);

// The voyage document (voyage.v1, see CONTRACT.md): set on the page by a static export, or else fetched from
// Wrapperr for the signed-in Plex user (?user=<id> with an admin login: that user's voyage)
const D = window.VOYAGE || await loadVoyage();
window.VOYAGE = D;  // for the mock scenes
async function loadVoyage() {
  const q = new URLSearchParams(location.search), user = q.get("user");
  const cookie = name => {
    const c = document.cookie.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="));
    return c ? decodeURIComponent(c.slice(name.length + 1)) : "";
  };
  const admin = user !== null && /^\d+$/.test(user);
  const url = new URL(admin ? `../api/get/users/${user}/voyage` : "../api/get/voyage", location.href);
  let reply, why = "Couldn't reach the server.";
  try {
    reply = await fetch(url, { method: "POST", headers: { Authorization: cookie(admin ? "wrapperr-admin" : "wrapperr-user") } });
    if (reply.ok) return await reply.json();
    why = (await reply.json().catch(() => ({}))).error || `The server answered ${reply.status}.`;
  } catch (e) { /* offline */ }
  // No voyage: the intro card says why, and leads back to the front page instead of setting sail
  $("intro_name").textContent = "…";
  $("intro_text").textContent = reply && reply.status === 401 ? "Sign in on the front page to set sail." : why;
  const back = Object.assign(document.createElement("a"), { className: "go", href: new URL("../", location.href).href, textContent: "Back to the front page" });
  $("set_sail").replaceWith(back);
  throw new Error("No voyage: " + why);
}
// News lighthouses: the models in models/lighthouses (the page rotates through them)
const LIGHTHOUSES = ["durvesh121-sand-island.glb", "kristenlee-slate-rocks.glb", "maverickfx-rock.glb", "murriarty-rock-island.glb"];
// Mock mode (?mock=<id> or #mock-<id>): a made-up sighting from mock/scenes-*.js sailed through the real pipeline, for
// trying out new scenes before their data exists (see mock/README.md). Without it nothing below changes.
const MOCK = (() => {
  const q = new URLSearchParams(location.search), h = location.hash.match(/^#mock-(.+)$/);
  return { id: q.get("mock") || (h && decodeURIComponent(h[1])), day: q.get("day"), next: (q.get("next") || "").split(",").filter(Boolean), auto: q.has("auto") };
})();
const MOCKS = new Map(), MOCK_FILES = ["scenes-example.js", "scenes-creatures.js", "scenes-seerr.js", "scenes-end.js"];
let mockLoad = null;
if (MOCK.id) {
  window.registerMock = m => { MOCKS.set(m.id, m); };
  mockLoad = Promise.all(MOCK_FILES.map(f => import(`./mock/${f}`).catch(e => { if (!/fetch|Failed to load|404/i.test(String(e))) console.warn(`mock/${f}`, e); })));
}

// ---- Dates ----------------------------------------------------------------------
const [fy, fm, fd] = D.first.split("-").map(Number);
const dayDate = d => new Date(Date.UTC(fy, fm - 1, fd + Math.floor(d)));
const fmtDate = (d, o = { day: "numeric", month: "long" }) => dayDate(d).toLocaleDateString("en-AU", { timeZone: "UTC", ...o });
const short = d => fmtDate(d, { day: "numeric", month: "short" });
const plural = (n, w) => `${n.toLocaleString("en-AU")} ${w}${n === 1 ? "" : "s"}`;

// ---- Setup and quality -----------------------------------------------------------
const touch = matchMedia("(pointer: coarse)").matches, narrow = innerWidth < 700;
const lite = touch || narrow;
if (touch) $("how").textContent = "Drag to look around; tap the sea to pause.";
if (document.fullscreenEnabled) document.documentElement.classList.add("can-fs");
$("fs").addEventListener("click", () => {
  (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
});
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = $("sea");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: "high-performance" });
} catch (e) {
  $("error").hidden = false;
  $("error").textContent = "This voyage needs WebGL, which this browser could not start.";
  throw e;
}
let pixelRatio = Math.min(devicePixelRatio, lite ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2600);
scene.fog = new THREE.Fog(0x9fb4c0, 160, 1100);
const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x2a3a44, 1.4);
const sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
scene.add(hemi, sun, sun.target);

// ---- The course ------------------------------------------------------------------
const DAY = 9;  // world units of sea per day
const LAST = D.lastDay + 1;
const SECONDS = 150;  // a full voyage at 1x
const courseX = d => 30 * Math.sin(d * 0.045) + 12 * Math.sin(d * 0.13 + 1);
const course = d => new THREE.Vector3(courseX(d), 0, -d * DAY);
function frame(d) {  // position, forward and starboard (right) unit vectors on the course
  const p = course(d), q = course(d + 0.05);
  const fwd = q.sub(p).normalize();
  return { p, fwd, right: new THREE.Vector3(-fwd.z, 0, fwd.x) };
}

// ---- Weather from the weekly viewing ---------------------------------------------
let voyage, weeks, lo, hi;
function setWeather(v) {
  weeks = v.weeks;
  const hrs = weeks.map(w => w[0]).filter(h => h > 0).sort((a, b) => a - b);
  lo = hrs[Math.floor(hrs.length * 0.1)] || 0; hi = hrs[hrs.length - 1] || 1;
}
// Smoothly between week centres; 0 = flat calm, 1 = the person's busiest week
function weather(d) {
  const x = Math.max(0, Math.min(weeks.length - 1, d / 7 - 0.5));
  const i = Math.floor(x), f = x - i, j = Math.min(weeks.length - 1, i + 1);
  const s = f * f * (3 - 2 * f);
  const h = weeks[i][0] * (1 - s) + weeks[j][0] * s, night = weeks[i][1] * (1 - s) + weeks[j][1] * s;
  const storm = Math.pow(Math.max(0, Math.min(1, (h - lo) / Math.max(1, hi - lo))), 1.3);
  return { storm, night, hours: weeks[Math.min(weeks.length - 1, Math.floor(d / 7))][0] };
}
const BEAUFORT = ["Calm", "Light air", "Light breeze", "Gentle breeze", "Moderate breeze", "Fresh breeze", "Strong breeze", "Near gale", "Gale", "Strong gale", "Storm"];

// ---- Waves (the same Gerstner sum on the GPU and the CPU) -------------------------
const WAVES = [[1, 0.25, 70, 1.0], [0.7, -0.6, 37, 0.55], [-0.3, 1, 21, 0.32], [0.9, 0.8, 11, 0.16], [0.2, -1, 14, 0.12], [-0.8, -0.3, 8, 0.07]].map(([x, z, L, A]) => {
  const n = Math.hypot(x, z); return [x / n, z / n, L, A];
});
const sea = { amp: 0.5, steep: 0.4, time: 0 };
function seaHeight(x, z) {
  let y = 0;
  for (const [dx, dz, L, A] of WAVES) {
    const k = 2 * Math.PI / L, c = Math.sqrt(9.8 / k);
    y += A * sea.amp * Math.sin(k * (dx * x + dz * z) - k * c * sea.time);
  }
  return y * calmAt(x, z);
}
// Islands calm the sea around them: over a shelf SHELF wide the swell dies down to a share of itself (floor),
// so even a storm's crests lap at the beach rather than rolling over it. isles: every island, islet and rock
// ({ x, z, r, floor }); isleNear: the ISLE_N nearest the camera, which the water shader is given each frame.
const SHELF = 26, ISLE_N = lite ? 8 : 16, SEA_MAX = WAVES.reduce((s, w) => s + w[3], 0);  // SEA_MAX * sea.amp: the highest a crest can be
let isles = [], isleNear = [];
function calmAt(x, z) {
  let m = 1;
  for (const s of isleNear) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r + SHELF) m = Math.min(m, s.floor + (1 - s.floor) * THREE.MathUtils.smoothstep(d, s.r * 1.05, s.r + SHELF));
  }
  return m;
}
function isle(obj, r, floor = 0.08) { let o = obj; while (o.parent) o = o.parent; o.updateMatrixWorld(true); const p = obj.getWorldPosition(new THREE.Vector3()); isles.push({ x: p.x, z: p.z, r, floor, obj }); }
function nearIsles(at) {
  isleNear = isles.map(s => [s, Math.hypot(s.x - at.x, s.z - at.z) - s.r]).sort((a, b) => a[1] - b[1]).slice(0, ISLE_N).map(a => a[0]);
  waterMat.uniforms.uIsle.value.forEach((v, k) => { const s = isleNear[k]; if (s) v.set(s.x, s.z, s.r, s.floor); else v.set(1e6, 1e6, 0, 1); });
}

const SEG = lite ? 160 : 288, SIZE = 1500;
const CHURN_N = lite ? 12 : 32;  // foam spots the serpent and the kraken leave in the water (uChurn)
const WAKE_N = 10, WAKE_STEP = 0.75;  // points along the wake, and days of course between them (about 60 units in all; the course bends gently enough)
const waterGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2);
const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    uW: { value: WAVES.map(w => new THREE.Vector4(...w)) }, uAmp: { value: 0.5 }, uSteep: { value: 0.4 }, uTime: { value: 0 },
    uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
    uFogNear: { value: 160 }, uFogFar: { value: 1100 }, uFoam: { value: 0 }, uStorm: { value: 0 }, uGlow: { value: new THREE.Color() },
    uMound: { value: new THREE.Vector4(0, 0, 0, 9) },  // x, z, height, radius: the water heaving around a breaching whale
    uSplash: { value: new THREE.Vector4(0, 0, 99, 0) },  // x, z, seconds since, strength: rings from where it hit the water
    uDolph: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 99, 0)) },  // the same, small, for the last few dolphin entries
    uStir: { value: new THREE.Vector4(0, 0, 0, 10) },  // x, z, amount, radius: the water stirring over something about to come up
    uIsle: { value: Array.from({ length: ISLE_N }, () => new THREE.Vector4(1e6, 1e6, 0, 1)) },
    uChurn: { value: Array.from({ length: CHURN_N }, () => new THREE.Vector4(0, 0, 99, 0)) },  // x, z, seconds since, strength: where a coil or tentacle broke the surface
    uChurnR: { value: new Array(CHURN_N).fill(1) },  // and how big each one is  // x, z, radius, floor: the nearest islands, calming the sea (calmAt)
    uPath: { value: Array.from({ length: WAKE_N }, () => new THREE.Vector4()) },  // the course just sailed: x, z, distance back from the bow
    uShip: { value: new THREE.Vector4(0, 0, 0, -1) },  // x, z, and the forward direction
    uWake: { value: new THREE.Vector4() },  // how fast she is going (0 stopped, 1 full sail), and how bright the foam is
  },
  vertexShader: `
    uniform vec4 uW[6], uMound, uIsle[${ISLE_N}]; uniform float uAmp, uSteep, uTime;
    varying vec3 vPos; varying vec3 vN; varying float vH; varying vec2 vW;
    void main() {
      vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
      vec3 p = w; vec3 n = vec3(0.0, 1.0, 0.0);
      float calm = 1.0;  // as calmAt: the swell dying down over the shelf round each island
      for (int i = 0; i < ${ISLE_N}; i++) calm = min(calm, mix(uIsle[i].w, 1.0, smoothstep(uIsle[i].z * 1.05, uIsle[i].z + ${SHELF}.0, distance(w.xz, uIsle[i].xy))));
      for (int i = 0; i < 6; i++) {
        vec2 d = uW[i].xy; float L = uW[i].z, A = uW[i].w * uAmp * calm;
        float k = 6.2831853 / L, c = sqrt(9.8 / k), f = k * dot(d, w.xz) - k * c * uTime;
        float Q = uSteep / (k * uW[i].w * uAmp * 6.0 + 0.0001);  // from the open-sea height, so the calm shelf sways less as well as heaving less
        p.x += Q * A * d.x * cos(f); p.z += Q * A * d.y * cos(f); p.y += A * sin(f);
        n.x -= d.x * k * A * cos(f); n.z -= d.y * k * A * cos(f); n.y -= Q * k * A * sin(f);
      }
      vec2 md = w.xz - uMound.xy;
      float mound = uMound.z * exp(-dot(md, md) / (uMound.w * uMound.w));
      p.y += mound; n.xz += md * (2.0 / (uMound.w * uMound.w)) * mound;
      vPos = p; vN = normalize(n); vH = p.y / max(uAmp * 2.0, 0.001); vW = w.xz;  // the wake is pinned to the undisplaced sea, so it rides the waves with the ship
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  // Stylised water: ripples drawn per pixel (too fine for the mesh), soft colour bands, see-through
  // crests, glitter where ripples catch the sun, and foam that drifts in cells and gathers on crests.
  fragmentShader: `
    uniform vec3 uDeep, uShallow, uSky, uHorizon, uSunDir, uSunCol, uFog, uGlow;
    uniform float uFogNear, uFogFar, uFoam, uStorm, uTime;
    uniform vec4 uSplash, uDolph[4], uStir, uIsle[${ISLE_N}], uChurn[${CHURN_N}], uPath[${WAKE_N}], uShip, uWake; uniform float uChurnR[${CHURN_N}];
    varying vec3 vPos; varying vec3 vN; varying float vH; varying vec2 vW;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
    // Foam that breaks up as it thins: solid where p is 1, then patches, then nothing
    float erode(float p, float n) { return smoothstep(n * 0.9, n * 0.9 + 0.12, p); }
    vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
    // Distance to the nearest edge between drifting cells: small along the foam lines
    float cells(vec2 p) {
      vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y)), o = hash2(i + g);
        o = 0.5 + 0.45 * sin(uTime * 0.5 + 6.2831 * o);
        float d = length(g + o - f);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
      return d2 - d1;
    }
    // Slopes of a handful of short waves, for the ripple normal
    vec2 ripples(vec2 p) {
      vec2 g = vec2(0.0);
      const int N = 7;  // phones too: fewer looked like a regular grid
      for (int i = 0; i < N; i++) {
        float a = float(i) * 2.399 + 0.6, k = 1.9 + float(i) * 0.83;  // golden-angle directions, wavelengths about 3 to 0.8 units
        vec2 d = vec2(cos(a), sin(a));
        g += d * cos(dot(d, p) * k - uTime * sqrt(9.8 * k) + float(i) * 1.7) * (0.55 / (1.0 + float(i) * 0.35));
      }
      return g;
    }
    void main() {
      vec3 v = normalize(cameraPosition - vPos);
      float dist = length(cameraPosition - vPos);
      float near = 1.0 - smoothstep(40.0, 360.0, dist);  // detail fades out with distance, before it can shimmer
      vec2 g = ripples(vPos.xz) * near;
      // Rings spreading from a whale's splash, with foam on their crests and a churned patch in the middle
      vec2 so = vPos.xz - uSplash.xy; float sr = length(so), age = uSplash.z;
      float senv = uSplash.w * smoothstep(age * 7.0 + 4.0, age * 7.0 - 3.0, sr) * exp(-age * 0.45) / (1.0 + sr * 0.04);
      float sph = sr * 1.1 - age * 8.0;
      g += so / max(sr, 0.001) * cos(sph) * senv * 2.2;
      float churn = senv * smoothstep(0.35, 0.95, sin(sph)) * 0.7 + uSplash.w * exp(-age * 0.7) * (1.0 - smoothstep(2.0, 7.0 + age * 2.5, sr));
      for (int i = 0; i < 4; i++) {  // and where each dolphin went back in: a white patch and a ring or two, gone in a few seconds
        vec2 o = vPos.xz - uDolph[i].xy; float r = length(o), ag = uDolph[i].z, e = uDolph[i].w * exp(-ag * 0.9);
        if (e < 0.01 || r > 12.0) continue;
        float ring = smoothstep(ag * 3.5 + 1.8, ag * 3.5 - 0.6, r) * e, ph = r * 2.6 - ag * 9.0;
        g += o / max(r, 0.001) * cos(ph) * ring * 0.8;
        churn += ring * smoothstep(0.5, 0.95, sin(ph)) * 0.5 + e * (1.0 - smoothstep(0.4, 1.3 + ag * 1.4, r)) * 0.85;
      }
      for (int i = 0; i < ${CHURN_N}; i++) {  // the serpent's coils and the kraken's tentacles: churned foam where each broke the surface, rings spreading from it
        vec2 o = vPos.xz - uChurn[i].xy; float r = length(o), ag = uChurn[i].z, R = uChurnR[i], e = uChurn[i].w * exp(-ag * 0.8);
        float front = R * 0.6 + ag * R * 1.4;
        if (e < 0.01 || r > front + R * 0.6) continue;
        float ring = smoothstep(front + R * 0.6, front - R * 0.4, r) * e, ph = r / R * 5.0 - ag * 7.0;
        g += o / max(r, 0.001) * cos(ph) * ring * 0.9;
        churn += ring * smoothstep(0.55, 0.95, sin(ph)) * (0.2 + 0.4 * noise(vPos.xz * 0.7 + ag * 3.0)) + e * (1.0 - smoothstep(R * 0.3, R * (0.9 + ag * 0.5), r)) * (0.45 + 0.55 * noise(vPos.xz * 1.3 + uTime * 0.6));  // rings broken up as they spread
      }
      // Something coming up from below: a dark shape under the surface, the water turning over it, foam and bubbles breaking
      vec2 qo = vPos.xz - uStir.xy; float qr = length(qo) / uStir.w, qa = uStir.z * (1.0 - smoothstep(0.4, 1.0, qr)), shade = 0.0;
      if (qa > 0.0) {
        float sw = sin(atan(qo.y, qo.x) * 3.0 + qr * 8.0 - uTime * 1.8);  // three slow arms of a swirl
        g += vec2(-qo.y, qo.x) / max(length(qo), 0.001) * sw * qa * 1.6;
        churn += qa * smoothstep(0.7, 0.98, sw) * smoothstep(0.2, 0.6, qr) * 0.55 + qa * step(0.93, hash(floor(vPos.xz * 0.9) + floor(uTime * 4.0))) * (1.0 - smoothstep(0.15, 0.45, length(fract(vPos.xz * 0.9) - 0.5))) * (1.0 - qr) * 0.9;
        shade = uStir.z * (1.0 - smoothstep(0.2, 0.9, qr + noise(vPos.xz * 0.3 + uTime * 0.1) * 0.25));
      }
      // Over the shelf round an island: paler shallow water, and ragged surf lapping in towards the beach
      float shoal = 0.0;
      for (int i = 0; i < ${ISLE_N}; i++) {
        float ir = uIsle[i].z, id = distance(vPos.xz, uIsle[i].xy);
        if (ir <= 0.0 || id > ir + ${SHELF}.0) continue;
        shoal = max(shoal, (1.0 - smoothstep(ir * 1.05, ir + ${(SHELF * 0.7).toFixed(1)}, id)) * (1.0 - uIsle[i].w));
        float surf = (1.0 - smoothstep(ir * 0.95, ir * 1.25 + 1.5, id)) * (0.55 + 0.45 * sin(id * 1.3 + uTime * 1.6)) * (0.55 + uStorm * 0.45);
        churn += erode(surf, noise(vPos.xz * 0.9 + uTime * vec2(0.3, -0.2)) * 0.8 + 0.1) * 0.8;
      }
      // The ship's wake, measured from the course she has just sailed: s back from the bow, d out to the side.
      // A V of broken foam spreading from the bow, churned water astern, foam hugging the hull, and paler
      // aerated water inside the V. Faster and rougher seas make it wider and brighter.
      float wake = 0.0, airy = 0.0;
      vec2 sp = vW - uShip.xy, hf = vec2(dot(sp, uShip.zw), dot(sp, vec2(-uShip.w, uShip.z)));  // ahead, to starboard
      if (hf.x > -75.0 && hf.x < 12.0 && abs(hf.y) < 4.0 + (9.0 - hf.x) * 0.48 + 0.0035 * hf.x * hf.x) {  // only inside the V
        float best = 1e9, s = 0.0; vec2 side = vec2(0.0, 1.0);
        for (int i = 0; i < ${WAKE_N - 1}; i++) {
          vec2 a = uPath[i].xy, ab = uPath[i + 1].xy - a, ap = vW - a;
          float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
          vec2 q = ap - ab * t; float dd = dot(q, q);
          if (dd < best) { best = dd; s = mix(uPath[i].z, uPath[i + 1].z, t); side = q; }
        }
        float d = sqrt(best), spd = uWake.x, rough = 0.75 + uStorm * 0.7;
        vec2 ov = side / max(d, 0.001);
        float nz = noise(vW * 0.55 + uTime * vec2(0.13, -0.09)) * 0.6 + noise(vW * 1.7 - uTime * 0.2) * 0.4;
        // Kelvin arms, about 19 degrees out from the course, with a bow wave where they leave the stem
        float arm = 1.0 + s * 0.34 + 1.4 * smoothstep(0.0, 9.0, s), aw = (0.35 + s * 0.045) * rough;
        float fade = exp(-s / (20.0 + 20.0 * spd)) * (0.35 + 0.65 * spd), bow = exp(-s / 5.0) * spd;
        float ridge = 1.0 - smoothstep(0.0, aw, abs(d - arm));
        // and fainter feathers inside the V, slanting back from each arm
        float inside = clamp(1.0 - (arm - d) / (arm * 0.7), 0.0, 1.0) * step(d, arm);
        float feather = (1.0 - smoothstep(0.08, 0.2, abs(fract((arm - d) / 2.2 - s / 7.0) - 0.5))) * inside * inside * smoothstep(4.0, 10.0, s);
        float pa = max(ridge, feather * 0.6) * fade * (1.0 + bow * 0.6);
        wake = erode(pa, nz);
        airy += ridge * fade * 0.25;
        g -= ov * sign(d - arm) * ridge * fade * 1.5;  // a lit ridge along each arm
        // Churned wash astern of the transom, boiling as it goes
        float st = s - 16.0, cw = (2.4 + max(st, 0.0) * 0.1) * (0.8 + uStorm * 0.4);
        float wash = (1.0 - smoothstep(cw * 0.3, cw, d)) * smoothstep(-3.0, 1.0, st) * exp(-max(st, 0.0) / (10.0 + 16.0 * spd)) * (0.3 + 0.7 * spd);
        if (wash > 0.0) wake = max(wake, erode(wash * 0.95, noise(vW * 1.3 + vec2(uTime * 1.1, -uTime * 0.7)) * 0.7 + nz * 0.3));
        // where it thins, it frays into the same drifting foam lines as the open sea, finer
        float fray = max(smoothstep(0.04, 0.4, pa) * 0.6, smoothstep(0.03, 0.3, wash));
        if (fray > 0.0) wake = max(wake, fray * (1.0 - smoothstep(0.02, 0.09, cells(vW * 0.3 + uTime * vec2(0.05, 0.03)))));
        // Foam along the waterline, thicker the faster she goes
        float r = length(vec2((hf.x - 0.3) / 8.6, hf.y / 2.9));
        wake = max(wake, erode(1.0 - smoothstep(1.0, 1.12 + spd * 0.12 + uStorm * 0.1, r), nz));
        airy += (1.0 - smoothstep(arm * 0.5, arm, d)) * fade * 0.5 + wash * 0.5;
      }
      vec3 n =normalize(vN + vec3(-g.x, 0.0, -g.y) * (0.22 + uStorm * 0.18));

      // Body colour in soft bands, lighter towards the crests and where the surface faces the sun
      float lit = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
      float band = mix(floor(lit * 4.0) / 4.0, lit, 0.3);
      vec3 body = mix(uDeep, uShallow, clamp(vH * 0.5 + 0.08 + band * 0.38, 0.0, 1.0));
      // See-through crests: light from behind a wave tints it turquoise
      vec2 toSun = normalize(uSunDir.xz + 1e-4), away = normalize(-v.xz + 1e-4);
      float sss = smoothstep(0.2, 0.95, vH) * (0.35 + 0.65 * max(dot(away, toSun), 0.0));
      body += uGlow * sss * 0.45;
      body = mix(body, uShallow + uGlow * 0.3, airy * 0.35);  // aerated water in the wake
      body = mix(body, uShallow * 1.1 + uGlow * 0.25, shoal * 0.45);  // and over the shallows

      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
      vec3 r = reflect(-v, n);
      vec3 sky = mix(uHorizon, uSky, clamp(pow(max(r.y, 0.0), 0.5), 0.0, 1.0));
      vec3 col = mix(body, sky, fres * 0.5);
      col = mix(col, uDeep * 0.3, shade * 0.7);  // over the reflection too, so the shape still reads from low down

      // Sun: a soft path, and glitter that flickers on the ripples
      float sd = max(dot(r, uSunDir), 0.0);
      col += uSunCol * (pow(sd, 90.0) * 0.35 + pow(sd, 400.0) * 1.2);
      float glint = smoothstep(0.55, 1.0, pow(sd, 260.0)) * step(0.55, hash(floor(vPos.xz * 1.5) + floor(uTime * 8.0)));
      col += uSunCol * glint * 3.0 * near;

      // Foam: drifting lines everywhere, thicker in storms, and caps on the crests
      float e = cells(vPos.xz * 0.075 + vec2(uTime * 0.04, uTime * 0.015) + g * 0.05);
      float lines = (1.0 - smoothstep(0.02, 0.05 + uStorm * 0.02, e)) * (0.2 + uStorm * 0.12) * (1.0 - smoothstep(80.0, 520.0, dist));
      float caps = smoothstep(0.62 - uStorm * 0.22, 1.0, vH + (g.x + g.y) * 0.08) * uFoam;
      col = mix(col, vec3(0.93, 0.96, 0.97), clamp(lines + caps + churn + wake * uWake.y, 0.0, 1.0));

      float fog = smoothstep(uFogNear, uFogFar, dist);
      gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.frustumCulled = false;
scene.add(water);

// ---- Sky: gradient, sun, drifting clouds and stars ------------------------------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  uniforms: { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() },
              uSunCol: { value: new THREE.Color() }, uCloud: { value: 0 }, uCloudCol: { value: new THREE.Color() }, uNight: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform vec3 uZenith, uHorizon, uSunDir, uSunCol, uCloudCol; uniform float uCloud, uNight, uTime; varying vec3 vDir;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
    vec4 hash4(vec3 p) { vec4 q = fract(p.xyzx * vec4(0.1031, 0.1030, 0.0973, 0.1099)); q += dot(q, q.wzxy + 33.33); return fract((q.xxyz + q.yzzw) * q.zywx); }
    // One layer of stars on a cube map of directions (so no rows and no stretching): at most one per cell, jittered inside it,
    // a soft round point a pixel or two wide. Most are faint, a few bright; bluish to warm white; twinkling, harder low down
    vec3 stars(vec3 d, float pxd, float n, float dens, float big, float h) {
      vec3 a = abs(d); float m = max(a.x, max(a.y, a.z));
      vec2 uv = (a.x >= m ? d.yz : a.y >= m ? d.xz : d.xy) / m * n;
      float face = a.x >= m ? sign(d.x) : a.y >= m ? 2.0 + sign(d.y) : 5.0 + sign(d.z);
      vec2 cell = floor(uv); vec4 r = hash4(vec3(cell, face * 131.0 + n)), r2 = hash4(vec3(cell + 17.0, face * 71.0 - n));
      if (r.w > dens) return vec3(0.0);
      float px = pxd * n / m, b = pow(r.z, 7.0);  // cell units per pixel; brightness, heavy on faint
      float rad = (0.42 + big * b + 0.18 * r2.x) * px, dist = length(fract(uv) - (0.22 + 0.56 * r.xy));
      float tw = 1.0 - mix(0.55, 0.12, smoothstep(0.05, 0.5, h)) * (0.5 + 0.5 * sin(uTime * (2.0 + 5.0 * r2.y) + r2.z * 40.0));
      vec3 tint = r2.w < 0.3 ? vec3(0.72, 0.84, 1.0) : r2.w > 0.85 ? vec3(1.0, 0.86, 0.68) : vec3(0.95, 0.96, 1.0);
      return tint * exp(-dist * dist / (rad * rad)) * (0.07 + 1.5 * b) * tw;
    }
    void main() {
      vec3 d = normalize(vDir); float h = d.y, pxd = length(fwidth(d));  // pixel size, outside any branch
      vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
      if (h < 0.0) col = uHorizon * 0.9;
      float sd = max(dot(d, uSunDir), 0.0);
      col += uSunCol * (pow(sd, 1200.0) * 6.0 + pow(sd, 18.0) * 0.35) * (1.0 - uCloud * 0.8);
      if (h > 0.0) {
        vec2 uv = d.xz / (h + 0.12) * 1.4 + vec2(uTime * 0.01, uTime * 0.004);
        float c = smoothstep(0.62 - uCloud * 0.42, 1.0, fbm(uv)) * smoothstep(0.0, 0.18, h);
        col = mix(col, uCloudCol * (0.8 + 0.4 * fbm(uv * 2.0)), c);
        float sg = smoothstep(0.05, 0.3, h) * uNight * (1.0 - c);
        if (sg > 0.001) {
          // A faint Milky Way: a tilted band of mottled haze, thicker with small stars
          vec3 bn = normalize(vec3(0.35, 0.55, 0.76)); float bd = dot(d, bn), band = exp(-bd * bd / 0.025);
          float haze = band * smoothstep(0.35, 0.85, fbm(vec2(dot(d, vec3(0.8, 0.0, -0.37)), dot(d, cross(bn, vec3(0.8, 0.0, -0.37)))) * 5.0 + 3.0));
          col += sg * (vec3(0.55, 0.6, 0.75) * haze * 0.1 + stars(d, pxd, 120.0, 0.18 + 0.45 * band, 0.3, h) + stars(d, pxd, 46.0, 0.4, 0.7, h));
        }
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat);
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

// Palettes: golden afternoon, gale, and night; mixed by storm and the late-night share
const P = {
  fair:  { zenith: 0x3d7fb8, horizon: 0xf3cf9a, deep: 0x08466a, shallow: 0x2496a8, sun: 0xffd9a0, cloud: 0xfff1de, fog: 0xe9cfa6, glow: 0x6fe6d2 },
  storm: { zenith: 0x37424c, horizon: 0x7b8790, deep: 0x16262e, shallow: 0x3f5d66, sun: 0x9aa4ab, cloud: 0x59636b, fog: 0x6f7b83, glow: 0x4f8f86 },
  night: { zenith: 0x060c1a, horizon: 0x24324a, deep: 0x040d16, shallow: 0x0d2a3a, sun: 0xa9c4ff, cloud: 0x2a3446, fog: 0x1a2436, glow: 0x123a44 },
};
const C = {};
for (const [k, p] of Object.entries(P)) C[k] = Object.fromEntries(Object.entries(p).map(([n, v]) => [n, new THREE.Color(v)]));
const mix3 = (key, storm, night, out) => out.copy(C.fair[key]).lerp(C.storm[key], storm).lerp(C.night[key], night);
const FLASH = new THREE.Color(0xdfe6ff), WHITE = new THREE.Color(0xffffff);

// ---- Rain for the stormiest weeks -------------------------------------------------
const RAIN = lite ? 700 : 1600;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN * 6);
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xc8d4dc, transparent: true, opacity: 0 }));
rain.frustumCulled = false;
const drops = Array.from({ length: RAIN }, () => [Math.random() * 120 - 60, Math.random() * 60, Math.random() * 120 - 60]);
scene.add(rain);

// ---- Models: Kenney's Pirate Kit and Quaternius' animals, both CC0 (see models/CREDITS.md) ----
// Anything that fails to load falls back to the simple shapes drawn in code.
const MODELS = {};
const KENNEY = ["ship-pirate-large", "ship-large", "ship-ghost", "ship-wreck", "patch-sand-foliage", "palm-detailed-bend", "palm-detailed-straight",
  "tower-complete-large", "rocks-sand-a", "rocks-a", "barrel", "chest", "patch-sand", "flag-pirate-high-pennant", "flag-high-pennant"];
async function loadModels() {
  const gltf = new GLTFLoader(), fbx = new FBXLoader();
  const jobs = KENNEY.map(n => gltf.loadAsync(`models/kenney/${n}.glb`).then(g => { MODELS[n] = g.scene; }));
  // The animals come in their own units and facing; scale them to a set length here
  const animal = (file, name, length) => fbx.loadAsync(file).then(o => {
    const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    o.userData.scale = length / Math.max(size.x, size.y, size.z);
    MODELS[name] = o;
  });
  jobs.push(animal("models/quaternius/Whale.fbx", "whale", 18));
  // glTF models from Poly Pizza, sized here: by their longest side, or by height for the lighthouses
  const sized = (file, name, length, byHeight = false) => gltf.loadAsync(file).then(g => {
    const o = g.scene, drop = [];
    if (byHeight) o.traverse(m => {
      if (!m.isMesh) return;
      if (/^(water|sea|sand)/i.test(m.material?.name || "") || /^(water|sea|sand)_/i.test(m.name)) drop.push(m);  // their own sea and seabed
      else if (m.material) m.material.metalness = 0;  // some come fully metallic, which renders black without reflections
    });
    // Their own sea marks the waterline: remember its top before it goes, so the model sits at the same depth in ours
    const sea = drop.filter(m => /^(water|sea)/i.test(m.material?.name || "") || /^(water|sea)_/i.test(m.name));
    if (sea.length) { o.updateMatrixWorld(true); o.userData.waterline = Math.max(...sea.map(m => new THREE.Box3().setFromObject(m).max.y)); }
    drop.forEach(m => m.removeFromParent());
    const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    o.userData.scale = length / (byHeight ? size.y : Math.max(size.x, size.y, size.z));
    o.animations = g.animations;
    MODELS[name] = o;
  });
  jobs.push(sized("models/polypizza/tentacle.glb", "tentacle", 17));
  jobs.push(sized("models/quaternius/Dolphin.glb", "dolphin", 4.6));  // rigged, with a swim cycle
  for (const f of LIGHTHOUSES) jobs.push(sized(`models/lighthouses/${f}`, `lighthouse:${f}`, LIGHTHOUSE_HEIGHT[f] || 26, true));
  await Promise.allSettled(jobs);
  // The sea animals are smoothed and repainted: a dark back fading to a pale belly, with a wet sheen
  if (MODELS.whale) organic(MODELS.whale, 0x33506a, 0xc9d1d4);
  if (MODELS.dolphin) {
    organic(MODELS.dolphin, 0x3d5262, 0xdde3e6);
    // Turn it to face -z like the ship, from where its head is against its tail
    const o = MODELS.dolphin, head = o.getObjectByName("Head"), tail = o.getObjectByName("Tail");
    if (head && tail) {
      const d = head.getWorldPosition(new THREE.Vector3()).sub(tail.getWorldPosition(new THREE.Vector3()));
      o.userData.yaw = Math.PI - Math.atan2(d.x, d.z);
    }
  }
  const results = await Promise.allSettled(jobs);
  const failed = results.filter(x => x.status === "rejected");
  if (failed.length) console.warn(`${failed.length} models did not load; simple shapes stand in`, failed[0].reason);
}
// Heights for the news lighthouses (models/lighthouses), by file; anything else is 26 tall
const LIGHTHOUSE_HEIGHT = { "durvesh121-sand-island.glb": 30, "murriarty-rock-island.glb": 34, "kristenlee-slate-rocks.glb": 30 };
// How far each sits below the waterline, as a share of its height (islands with a rounded underside sink further)
const LIGHTHOUSE_SINK = { "durvesh121-sand-island.glb": 0.28 };
// A copy that shares the original's geometry and textures (so clearing the world must not dispose them)
function model(name, scale = 1) {
  const src = MODELS[name];
  if (!src) return null;
  const o = src.userData.scale ? SkeletonUtils.clone(src) : src.clone(true);
  o.traverse(c => { c.userData.shared = true; });
  o.scale.setScalar(scale * (src.userData.scale || 1));
  return o;
}
// Low-poly animals made to read as smooth, wet skin. Normals are averaged over every face that meets at a
// point, then each triangle is split in four with its new points bowed out along those normals (Phong
// tessellation), twice, so the outline rounds off. Skin weights are blended into the new points, so the
// rig still drives them. Each vertex is coloured from dark on the back to pale underneath.
const ORGANIC = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.28 });
function organic(root, back, belly) {
  root.updateMatrixWorld(true);
  const meshes = []; root.traverse(m => { if (m.isMesh) meshes.push(m); });
  const key = v => `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
  const sums = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nm = new THREE.Matrix3();
  const world = m => { const p = m.geometry.attributes.position; return i => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); };
  // Add each face's normal (weighted by its area) to the points at its corners, in the bind pose
  for (const m of meshes) {
    const g = m.geometry, at = world(m), idx = g.index, n = idx ? idx.count : g.attributes.position.count;
    for (let i = 0; i < n; i += 3) {
      const [pa, pb, pc] = [0, 1, 2].map(k => at(idx ? idx.getX(i + k) : i + k));
      const fn = a.subVectors(pc, pb).cross(b.subVectors(pa, pb));
      for (const p of [pa, pb, pc]) { const s = sums.get(key(p)); if (s) s.add(fn); else sums.set(key(p), fn.clone()); }
    }
  }
  // Write them back in each mesh's own space (a sliver with no area keeps its own), then round off the shape
  for (const m of meshes) {
    const g = m.geometry, at = world(m), nrm = g.attributes.normal;
    nm.getNormalMatrix(m.matrixWorld).invert();
    for (let i = 0; i < nrm.count; i++) {
      const s = sums.get(key(at(i)));
      if (s && s.lengthSq() > 1e-12) nrm.setXYZ(i, ...c.copy(s).applyMatrix3(nm).normalize().toArray());
    }
    m.geometry = phongSplit(phongSplit(g));
  }
  // Colour by height on the body and which way each point faces
  const box = new THREE.Box3();
  for (const m of meshes) { const at = world(m); for (let i = 0; i < m.geometry.attributes.position.count; i++) box.expandByPoint(at(i)); }
  const cb = new THREE.Color(back), cl = new THREE.Color(belly), col = new THREE.Color();
  for (const m of meshes) {
    const g = m.geometry, at = world(m), nrm = g.attributes.normal, cnt = nrm.count, colors = new Float32Array(cnt * 3);
    nm.getNormalMatrix(m.matrixWorld);
    for (let i = 0; i < cnt; i++) {
      c.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
      const h = (at(i).y - box.min.y) / (box.max.y - box.min.y || 1);
      const t = THREE.MathUtils.smoothstep(0.45 * c.y + 0.9 * (h - 0.42), -0.25, 0.2);  // 0 pale belly, 1 dark back
      col.copy(cl).lerp(cb, t);
      colors.set([col.r, col.g, col.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    m.material = ORGANIC;
  }
}
// One round of Phong tessellation: every triangle becomes four. A new point on an edge starts at its middle and
// is pulled towards the planes the two ends face, so it rises off a curved surface; matching edges match exactly.
function phongSplit(src, bow = 0.75) {
  const g = src.index ? src.toNonIndexed() : src, A = g.attributes, names = Object.keys(A), n = A.position.count;
  const get = (k, i) => { const t = A[k], v = [t.getX(i)]; if (t.itemSize > 1) v.push(t.getY(i)); if (t.itemSize > 2) v.push(t.getZ(i)); if (t.itemSize > 3) v.push(t.getW(i)); return v; };
  const corner = i => Object.fromEntries(names.map(k => [k, get(k, i)]));
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), na = new THREE.Vector3(), nb = new THREE.Vector3(), mid = new THREE.Vector3(), q = new THREE.Vector3();
  const edge = (i, j) => {
    const v = {};
    for (const k of names) { const x = get(k, i), y = get(k, j); v[k] = x.map((e, c) => (e + y[c]) / 2); }
    pa.fromBufferAttribute(A.position, i); pb.fromBufferAttribute(A.position, j);
    na.fromBufferAttribute(A.normal, i); nb.fromBufferAttribute(A.normal, j);
    mid.addVectors(pa, pb).multiplyScalar(0.5);
    const da = q.subVectors(mid, pa).dot(na), db = q.subVectors(mid, pb).dot(nb);
    q.copy(mid).addScaledVector(na, -da).add(mid).addScaledVector(nb, -db).multiplyScalar(0.5);
    v.position = mid.lerp(q, bow).toArray();
    const nn = na.clone().add(nb); v.normal = (nn.lengthSq() > 1e-8 ? nn.normalize() : na).toArray();
    if (A.skinIndex && A.skinWeight) {  // the bones of both ends, strongest four kept
      const w = new Map(), si = [get("skinIndex", i), get("skinIndex", j)], sw = [get("skinWeight", i), get("skinWeight", j)];
      for (let e = 0; e < 2; e++) si[e].forEach((b, c) => w.set(b, (w.get(b) || 0) + sw[e][c] / 2));
      const top = [...w].sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, 4), sum = top.reduce((s, x) => s + x[1], 0) || 1;
      while (top.length < 4) top.push([0, 0]);
      v.skinIndex = top.map(x => x[0]); v.skinWeight = top.map(x => x[1] / sum);
    }
    return v;
  };
  const out = Object.fromEntries(names.map(k => [k, new (k === "skinIndex" ? Uint16Array : Float32Array)(n * 4 * A[k].itemSize)]));
  let w = 0;
  const put = v => { for (const k of names) out[k].set(v[k], w * A[k].itemSize); w++; };
  for (let i = 0; i < n; i += 3) {
    const [v0, v1, v2] = [i, i + 1, i + 2].map(corner), m01 = edge(i, i + 1), m12 = edge(i + 1, i + 2), m20 = edge(i + 2, i);
    for (const v of [v0, m01, m20, m01, v1, m12, m20, m12, v2, m01, m12, m20]) put(v);
  }
  const geo = new THREE.BufferGeometry();
  for (const k of names) geo.setAttribute(k, new THREE.BufferAttribute(out[k], A[k].itemSize));
  for (const gr of g.groups) geo.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
  return geo;
}
const mixers = [];

// ---- The ship (bow towards -z) ---------------------------------------------------
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const FLAG = -2.1;  // turns the flag (which runs along +x from the mast) aft and to port
const ship = new THREE.Group();
{
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e1d0f, roughness: 0.9 });
  const hullGeo = new THREE.BoxGeometry(5, 2.6, 16, 4, 2, 8);
  const pos = hullGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const bow = Math.max(0, -z / 8), stern = Math.max(0, z / 8);
    const taper = (1 - bow * bow * 0.95) * (1 - stern * 0.25) * (y < 0 ? 0.55 + 0.45 * (y + 1.3) / 1.3 : 1);
    pos.setX(i, x * taper);
    pos.setY(i, y + bow * bow * 1.4 + stern * stern * 1.2);
  }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, wood); hull.position.y = 0.4;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 13), dark); deck.position.set(0, 1.6, 0.4);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.8, 3.4), wood); cabin.position.set(0, 2.4, 5.6);
  ship.add(hull, deck, cabin);
  const sailTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#efe0bd"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,90,50,0.25)"; g.lineWidth = 2;
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = "#2b1d0e"; g.font = "bold 120px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("☠", w / 2, h / 2 + 6);
  });
  const sailMat = new THREE.MeshStandardMaterial({ map: sailTex, side: THREE.DoubleSide, roughness: 1 });
  // The wind is on the starboard beam: the sails fill forward and to port, and the flag streams aft
  // and to port in the wind the ship feels as it moves
  const BRACE = 0.4;
  const mast = (z, height, sails) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, height, 8), dark); m.position.set(0, 1.6 + height / 2, z); ship.add(m);
    sails.forEach(([y, w, h]) => {
      const g = new THREE.PlaneGeometry(w, h, 8, 4), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2), yy = p.getY(i) / (h / 2); p.setZ(i, -(1 - x * x) * (1 - yy * yy * 0.4) * 1.1); }
      g.computeVertexNormals();
      // Yard and sail turn together about the mast, braced round for the wind; the sail fills forward (-z)
      const brace = new THREE.Group(); brace.position.set(0, 1.6 + y, z); brace.rotation.y = BRACE; ship.add(brace);
      const s = new THREE.Mesh(g, sailMat); brace.add(s);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, w + 0.6, 6), dark); yard.rotation.z = Math.PI / 2; yard.position.y = h / 2; brace.add(yard);
    });
  };
  mast(-3.2, 13, [[5, 6.5, 4.4], [10, 5, 3]]);
  mast(2.2, 10, [[4.5, 5.5, 3.6]]);
  const flagTex = canvasTexture(128, 80, (g, w, h) => {
    g.fillStyle = "#111"; g.fillRect(0, 0, w, h); g.fillStyle = "#eee"; g.font = "64px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("☠", w / 2, h / 2 + 4);
  });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 8, 1), new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }));
  flag.geometry.translate(1.2, 0, 0);
  flag.position.set(0, 1.6 + 13.6, -3.2); flag.rotation.y = FLAG;
  ship.userData.flag = flag; ship.add(flag);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc46b }));
  lantern.position.set(0, 3.6, 7.4); ship.userData.lantern = lantern; ship.add(lantern);
}
scene.add(ship);
function rigShip() {
  const m = model("ship-pirate-large", 1.3);
  if (!m) return;
  ship.clear();  // the Kenney galleon replaces the ship drawn in code
  m.position.y = -1.3;
  m.rotation.y = Math.PI;  // Kenney's bow points to +z; ours sails towards -z
  ship.add(m);
  rigHelm(m);
  ship.userData.sails = []; ship.userData.flags = [];
  m.traverse(o => {
    if (o.name.startsWith("sail")) ship.userData.sails.push(o);
    if (o.name.startsWith("flag")) ship.userData.flags.push(o);
  });
  ship.userData.flag = null;
}

// ---- Labels and textures ----------------------------------------------------------
function label(text, { size = 64, color = "#f6ead0", font = "Pirata One", width = 1024 } = {}) {
  const tex = canvasTexture(width, size * 1.6, (g, w, h) => {
    g.font = `${size}px "${font}", Georgia, serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,0.75)"; g.shadowBlur = 12; g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(width / size * 2.2, 3.5, 1);
  return s;
}
const loader = new THREE.TextureLoader();
const texCache = new Map();
let pending = 0;
function imageTexture(file, fallbackText) {
  if (!file) return placeholder(fallbackText);
  if (texCache.has(file)) return texCache.get(file);
  pending++; updateLoading();
  const done = () => { pending--; updateLoading(); };
  const t = loader.load(`${D.imageBase}${file}`, done, undefined, () => { done(); retryImage(t, file, 1); });
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(file, t);
  return t;
}
// A poster or backdrop not downloaded yet (the poster cache fetches them in the background) is tried again
function retryImage(t, file, attempt) {
  if (attempt > 6) return;
  setTimeout(() => loader.load(`${D.imageBase}${file}?r=${attempt}`, img => { t.image = img.image; t.needsUpdate = true; }, undefined,
    () => retryImage(t, file, attempt + 1)), 1500 * attempt);
}
function placeholder(text) {
  return canvasTexture(256, 384, (g, w, h) => {
    g.fillStyle = "#e9d6ab"; g.fillRect(0, 0, w, h); g.strokeStyle = "#8a6a3a"; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = "#2b1d0e"; g.font = "28px 'IM Fell English', Georgia, serif"; g.textAlign = "center";
    let line = "", y = 150;
    for (const word of text.split(" ")) { if (g.measureText(line + word).width > w - 50) { g.fillText(line, w / 2, y); y += 34; line = ""; } line += word + " "; }
    g.fillText(line, w / 2, y);
  });
}
function updateLoading() { $("loading").textContent = pending > 0 ? `Unfurling ${pending} sails…` : ""; }

// ---- Foam rings where islands, buoys, towers and wrecks meet the water ----------------------------
const ringTex = canvasTexture(256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 340; i++) {
    const a = Math.random() * Math.PI * 2, rr = w * (0.3 + Math.random() * 0.17), x = w / 2 + Math.cos(a) * rr, y = h / 2 + Math.sin(a) * rr;
    const size = 3 + Math.random() * 9, grd = g.createRadialGradient(x, y, 0, x, y, size);
    grd.addColorStop(0, `rgba(255,255,255,${0.35 + Math.random() * 0.5})`); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, size, 0, Math.PI * 2); g.fill();
  }
});
const ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
let rings = [];  // rings on things that do not bob themselves, kept on the surface each frame
function foamRing(radius, follow = true) {
  const m = new THREE.Mesh(ringGeo, ringMat);
  m.userData.shared = true;  // shared geometry: never disposed with the world
  m.scale.set(radius * 2.4, 1, radius * 2.4);
  m.rotation.y = Math.random() * 6.3;
  if (follow) rings.push(m);
  return m;
}

// ---- Things along the route ----------------------------------------------------------
const world = new THREE.Group();
scene.add(world);
const KIND = { politics: 0xd9a441, world: 0xc8553d, science: 0x6fb7c9, sport: 0x7fb069, culture: 0xc38dd1 };
const KIND_NAME = { politics: "Politics", world: "World", science: "Science", sport: "Sport", culture: "Culture" };
let markers = [], beacons = [], boards = [], lazyAt = -1e9;
const ISLANDS = lite ? 8 : 12, BUOYS = lite ? 36 : 60;

const mats = {
  sand: new THREE.MeshStandardMaterial({ color: 0xd8c18a, roughness: 1 }),
  green: new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 1, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: 0x6d6255, roughness: 1, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4a2f18, roughness: 0.9 }),
  frame: new THREE.MeshStandardMaterial({ color: 0xc8963e, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }),
  buoyRed: new THREE.MeshStandardMaterial({ color: 0xb03a2e, roughness: 0.6 }),
  buoyWhite: new THREE.MeshStandardMaterial({ color: 0xf0eadc, roughness: 0.6 }),
  palm: new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 1, side: THREE.DoubleSide }),
};

function palm(h) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 6), mats.wood); trunk.position.y = h / 2; trunk.rotation.z = 0.12; g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.1), mats.palm);
    leaf.position.set(Math.cos(i) * 1.6, h, Math.sin(i) * 1.6); leaf.rotation.set(-0.6, -i, 0.3); g.add(leaf);
  }
  return g;
}
// Artwork is only fetched as the ship nears it, so a phone does not download the whole year up front
const BLANK = canvasTexture(4, 4, (g, w, h) => { g.fillStyle = "#e9d6ab"; g.fillRect(0, 0, w, h); });
BLANK.userData.keep = true;
let lazy = [];
function artMaterial(file, name, day) {
  const mat = new THREE.MeshBasicMaterial({ map: file ? BLANK : placeholder(name), toneMapped: false });
  if (file) lazy.push({ mat, file, day });
  return mat;
}
function loadNearby(day) {
  if (!lazy.length) return;
  lazy = lazy.filter(l => {
    if (l.day < day - 15 || l.day > day + 80) return true;
    l.mat.map = imageTexture(l.file); l.mat.needsUpdate = true;
    return false;
  });
}
function posterBoard(title, w, day) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 1.5), artMaterial(title.poster, title.name, day));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, w * 1.5 + 0.5), mats.frame); back.position.z = -0.05;
  const g = new THREE.Group(); g.add(back, m);
  return g;
}

function clearWorld() {
  world.traverse(o => {
    if (!o.isMesh || o.userData.shared) return;  // sprites and models share geometry, so only our own meshes are disposed
    o.geometry.dispose();
    if (o.material.map?.isCanvasTexture && !o.material.map.userData.keep) o.material.map.dispose();
  });
  world.clear(); markers = []; beacons = []; boards = []; lazy = []; lazyAt = -1e9; creatures = []; rings = []; isles = []; isleNear = [];
  creatureMixers.length = 0;
}

// The backdrop as a great banner between two posts, and the poster on a flagpole
function island_extras(g, t, m, side, scale, r, day) {
  g.add(foamRing(r * 1.05));
  const bw = 34 * scale, bh = bw * 9 / 16;
  const banner = new THREE.Group();
  const art = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), artMaterial(t.art, t.name, day));
  const border = new THREE.Mesh(new THREE.PlaneGeometry(bw + 1.2, bh + 1.2), mats.frame); border.position.z = -0.1;
  art.position.y = border.position.y = bh / 2 + 6;
  [-1, 1].forEach(s => { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, bh + 7, 6), mats.wood); post.position.set(s * (bw / 2 + 0.8), (bh + 7) / 2, -0.2); banner.add(post); });
  banner.add(border, art);
  g.add(banner);
  boards.push(banner);
  const px = -side * r * 0.62, pz = r * 0.35;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 16, 6), mats.wood); pole.position.set(px, 8, pz); g.add(pole);
  const poster = posterBoard(t, 5.5 * scale, day); poster.position.set(px, 16 + 4 * scale, pz); g.add(poster);
  boards.push(poster);
}

// Kenney's sand patches are thin once scaled down small: stretched up k times so they stand clear of a storm's crests
// over the calm shelf (calmAt), as the bigger islands do; what stands on them is then stood on the ground at (x, z)
const groundRay = new THREE.Raycaster();
function deepen(sand, k) { sand.scale.y *= k; sand.updateMatrixWorld(true); }
function groundAt(sand, x, z) { groundRay.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0)); const h = groundRay.intersectObject(sand, true)[0]; return h ? h.point.y - 0.05 : 0.3; }
function buildWorld(v) {
  clearWorld();
  const islandSet = new Set(v.marks.filter(m => D.titles[m.t].art).slice(0, ISLANDS).map(m => m.t));
  const marks = v.marks.slice(0, BUOYS).sort((a, b) => a.peak - b.peak);
  const maxH = v.marks[0]?.hours || 1;
  // Lanes keep markers apart: each side remembers the last day used at each distance out
  const lanes = { "-1": [], "1": [] };
  const place = (day, side, base, gap, minDays) => {
    const l = lanes[side];
    for (let i = 0; i < 4; i++) if (!(l[i] > day - minDays)) { l[i] = day; return base + i * gap; }
    l[0] = day; return base;
  };
  // Anything that would stand in the frame of the line's shot (it looks back from well ahead) is moved further out
  const lineAt = v.creatures.filter(c => c.kind === "line").map(c => frame((c.at ?? c.day) + 0.5));
  const aside = (day, side, off) => {  // the shot sees up to ~45° either side from 62 ahead; a little more width, to 300 back
    const { p, right } = frame(day), at = new THREE.Vector3();
    for (const f of lineAt) for (let k = 0; k < 30; k++) {
      at.copy(p).addScaledVector(right, side * off).sub(f.p);
      const back = -at.dot(f.fwd), across = Math.abs(at.dot(f.right));
      if (back < -66 || back > 300 || across > (back + 62) * 1.05 + 30) break;
      off += 20;
    }
    return off;
  };
  marks.forEach((m, i) => {
    const t = D.titles[m.t], island = islandSet.has(m.t);
    const side = i % 2 ? 1 : -1;
    const day = m.peak + 0.5;
    let off = place(day, side, island ? 70 : 22, island ? 40 : 13, island ? 6 : 2.2);
    off = aside(day, side, off);
    const { p, right } = frame(day);
    const g = new THREE.Group(); g.position.copy(p).addScaledVector(right, side * off);
    const scale = 0.75 + 0.9 * Math.sqrt(m.hours / maxH);
    if (island && MODELS["patch-sand-foliage"]) {
      const r = 16 * scale;
      const sand = model("patch-sand-foliage", r / 3.4); sand.position.y = -0.4; sand.rotation.y = side * 0.5; g.add(sand); sand.updateMatrixWorld(true);
      [["palm-detailed-bend", 0.3, 0.25, 2.4], ["palm-detailed-straight", -0.25, 0.05, 2.2], ["palm-detailed-bend", 0.05, -0.35, 2.0]].forEach(([n, x, z, k], j) => {
        const o = model(n, k * scale); o.position.set(x * r * side, groundAt(sand, x * r * side, z * r), z * r); o.rotation.y = j * 2.1 + side; g.add(o);
      });
      const rocks = model("rocks-sand-a", 2 * scale); rocks.position.set(-0.5 * r * side, groundAt(sand, -0.5 * r * side, -0.25 * r) - 0.3, -0.25 * r); g.add(rocks);
      const chest = model("chest", 1.8 * scale); chest.position.set(0.12 * r * side, groundAt(sand, 0.12 * r * side, 0.3 * r), 0.3 * r); chest.rotation.y = -side * 0.6; g.add(chest);
      island_extras(g, t, m, side, scale, r, day); isle(g, r);
    } else if (island) {
      const r = 16 * scale;
      const mound = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.sand); mound.scale.y = 0.22; mound.position.y = -0.8;
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.55, 1), mats.green); hill.scale.y = 0.5; hill.position.set(r * 0.25 * side, 0.6, r * 0.2);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.22, 0), mats.rock); rock.position.set(-r * 0.4 * side, 0.6, -r * 0.35);
      g.add(mound, hill, rock);
      for (let k = 0; k < 3; k++) { const pt = palm(5 + k * 1.5); pt.position.set((k - 1) * r * 0.3, 0, r * 0.45 - k * 2); g.add(pt); }
      island_extras(g, t, m, side, scale, r, day); isle(g, r);
    } else if (MODELS.barrel) {
      const barrel = model("barrel", 1.7); barrel.position.y = -0.5;
      const ring = foamRing(2.2, false); ring.position.y = 0.75; g.add(ring);  // the buoy bobs, and its ring with it
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4, 5), mats.wood); pole.position.y = 3.2;
      const w = 4.2 * scale, poster = posterBoard(t, w, day); poster.position.y = 5 + w * 0.75;
      g.add(barrel, pole, poster);
      boards.push(poster);
      g.userData.bob = true;
    } else {
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.6, 10), mats.buoyRed);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.8, 10), mats.buoyWhite); b2.position.y = 1.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4, 5), mats.wood); pole.position.y = 3.4;
      const w = 4.2 * scale, poster = posterBoard(t, w, day); poster.position.y = 5.2 + w * 0.75;
      g.add(b1, b2, pole, poster);
      boards.push(poster);
      g.userData.bob = true;
    }
    world.add(g);
    markers.push({ m, t, day, group: g, island, side });
  });

  // Each month's name floats over the course
  for (let d = 0; d < LAST; d++) {
    if (dayDate(d).getUTCDate() !== 1) continue;
    const { p } = frame(d);
    const name = label(fmtDate(d, { month: "long" }).toUpperCase(), { size: 80, color: "#f2c76b" });
    name.position.copy(p); name.position.y = 15; world.add(name);
  }

  // Lighthouses for the world's news
  D.events.forEach((e, i) => {
    const side = i % 2 ? -1 : 1, day = e.day + 0.5;
    const { p, right } = frame(day);
    const g = new THREE.Group(); g.position.copy(p).addScaledVector(right, side * aside(day, side, 70));  // out past the creatures
    const color = KIND[e.kind] || 0xf2c76b;
    const stripes = canvasTexture(64, 256, (c, w, h) => { for (let y = 0; y < h; y += 64) { c.fillStyle = "#f2ece0"; c.fillRect(0, y, w, 32); c.fillStyle = "#" + color.toString(16).padStart(6, "0"); c.fillRect(0, y + 32, w, 32); } });
    const pool = LIGHTHOUSES.map(f => `lighthouse:${f}`).filter(n => MODELS[n]);
    if (pool.length) {
      const m = model(pool[i % pool.length]);
      // Stand it on the water: its footprint centred, its base a little under the surface
      m.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3());
      const f = pool[i % pool.length].slice(11);
      const wl = m.userData.waterline;
      m.position.set(-c.x, wl !== undefined ? -wl * m.scale.y - 0.3 : -box.min.y - 1.5 - (LIGHTHOUSE_SINK[f] || 0) * (box.max.y - box.min.y), -c.z);
      m.rotation.y = 0;
      const lantern = lanternOf(m);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      lamp.position.copy(lantern);
      const beamGeo = new THREE.ConeGeometry(3.5, 45, 16, 1, true); beamGeo.translate(0, -22.5, 0);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.rotation.z = Math.PI / 2;
      const spin = new THREE.Group(); spin.position.copy(lantern); spin.add(beam);
      g.add(m, lamp, spin, foamRing(9)); isle(g, 9);
      world.add(g);
      beacons.push({ e, day, group: g, spin, lamp, color: new THREE.Color(color) });
      return;
    }
    const kit = model("tower-complete-large", 1.9), rocks = model("rocks-a", 2.4);
    const top = kit ? 19.6 : 21;
    const base = rocks || new THREE.Mesh(new THREE.CylinderGeometry(5, 6.5, 3, 10), mats.rock); base.position.y = rocks ? -1 : 0.5;
    const tower = kit || new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 18, 12), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.7 }));
    tower.position.y = kit ? 0 : 11;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), new THREE.MeshBasicMaterial({ color })); lamp.position.y = top;
    const cap = kit ? new THREE.Group() : new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 10), mats.wood); cap.position.y = 23.4;
    const beamGeo = new THREE.ConeGeometry(3.5, 45, 16, 1, true); beamGeo.translate(0, -22.5, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.rotation.z = Math.PI / 2;
    const spin = new THREE.Group(); spin.position.y = top; spin.add(beam);
    g.add(base, tower, lamp, cap, spin, foamRing(6.5)); isle(g, 6.5);
    world.add(g);
    beacons.push({ e, day, group: g, spin, lamp, color: new THREE.Color(color) });
  });
}

// Where a lighthouse's lantern is: the middle of the band just under its top (above the spire)
function lanternOf(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), h = box.max.y - box.min.y, v = new THREE.Vector3();
  const lo = box.max.y - h * 0.24, hi = box.max.y - h * 0.08, sum = new THREE.Vector3(); let n = 0;
  obj.traverse(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
      if (v.y > lo && v.y < hi) { sum.add(v); n++; }
    }
  });
  return n ? sum.divideScalar(n) : new THREE.Vector3(0, box.max.y - h * 0.15, 0);
}

// ---- Dolphins (built in code): a grey-blue body, pale belly, beak, dorsal fin and flukes, facing -z like the ship
const DOLPHIN = { back: new THREE.MeshStandardMaterial({ color: 0x5f7486, roughness: 0.35 }), belly: new THREE.MeshStandardMaterial({ color: 0xc9d3d9, roughness: 0.4 }) };
const DOLPHIN_GEO = {
  body: new THREE.SphereGeometry(1, 12, 8).scale(0.42, 0.42, 1.5), belly: new THREE.SphereGeometry(1, 10, 6).scale(0.34, 0.3, 1.25),
  beak: new THREE.ConeGeometry(0.13, 0.5, 6).rotateX(-Math.PI / 2), fin: new THREE.ConeGeometry(0.28, 0.6, 4).scale(0.25, 1, 1),
  fluke: new THREE.BoxGeometry(1.1, 0.06, 0.35),
};
function makeDolphin() {
  // Quaternius' rigged dolphin swimming its own clip; the code-built one below if it didn't load
  if (MODELS.dolphin) {
    const g = new THREE.Group(), m = model("dolphin");
    m.rotation.y = MODELS.dolphin.userData.yaw || 0; g.add(m);
    const mx = new THREE.AnimationMixer(m), clip = MODELS.dolphin.animations?.[0];
    const swim = clip && mx.clipAction(clip).play();
    mx.setTime(Math.random() * 2); creatureMixers.push(mx);
    return { g, swim };
  }
  const g = new THREE.Group(), body = new THREE.Mesh(DOLPHIN_GEO.body, DOLPHIN.back), belly = new THREE.Mesh(DOLPHIN_GEO.belly, DOLPHIN.belly);
  belly.position.y = -0.13;
  const beak = new THREE.Mesh(DOLPHIN_GEO.beak, DOLPHIN.back); beak.position.set(0, -0.06, -1.6);
  const fin = new THREE.Mesh(DOLPHIN_GEO.fin, DOLPHIN.back); fin.position.set(0, 0.5, 0.1); fin.rotation.x = 0.5;
  const fluke = new THREE.Group(); fluke.position.z = 1.4;
  const tail = new THREE.Mesh(DOLPHIN_GEO.fluke, DOLPHIN.back); tail.position.z = 0.25; fluke.add(tail);
  g.add(body, belly, beak, fin, fluke);
  g.scale.setScalar(1.6);
  return { g, fluke };
}
const GLOW_TEX = canvasTexture(128, 128, (g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.25, "rgba(255,255,255,0.45)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
});
// Signal-flag bunting: a strip of the code flags drawn once, then flags hung along sagging lines
const SIGNAL = [  // each flag as bands: [direction, colours], "h" stacked top to bottom, "v" side by side
  ["v", ["#f4f1e8", "#2a4fa3"]], ["h", ["#d8b425", "#2a4fa3", "#d8b425"]], ["h", ["#2a4fa3", "#c8302c"]], ["v", ["#f4f1e8", "#c8302c"]],
  ["v", ["#2a4fa3", "#f4f1e8", "#2a4fa3"]], ["v", ["#d8b425", "#2a4fa3"]], ["v", ["#c8302c", "#f4f1e8", "#2a4fa3"]], ["h", ["#c8302c", "#f4f1e8", "#c8302c"]],
  ["v", ["#d8b425", "#2a4fa3", "#d8b425", "#2a4fa3", "#d8b425", "#2a4fa3"]], ["h", ["#2a4fa3", "#f4f1e8", "#c8302c", "#f4f1e8", "#2a4fa3"]],
  ["x", ["#2a4fa3", "#f4f1e8"]], ["d", ["#c8302c", "#d8b425"]],
];
const SIGNAL_TEX = canvasTexture(64 * SIGNAL.length, 64, (g, w, h) => {
  SIGNAL.forEach(([dir, cs], i) => {
    const x0 = i * 64;
    if (dir === "x") { g.fillStyle = cs[0]; g.fillRect(x0, 0, 64, 64); g.fillStyle = cs[1]; g.fillRect(x0 + 16, 16, 32, 32); }  // a square in the middle
    else if (dir === "d") { g.fillStyle = cs[0]; g.fillRect(x0, 0, 64, 64); g.fillStyle = cs[1]; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + 64, 64); g.lineTo(x0 + 64, 0); g.fill(); }  // halved on the diagonal
    else cs.forEach((c, k) => { g.fillStyle = c; dir === "h" ? g.fillRect(x0, k * 64 / cs.length, 64, 64 / cs.length + 1) : g.fillRect(x0 + k * 64 / cs.length, 0, 64 / cs.length + 1, 64); });
  });
});
const signalMat = new THREE.MeshStandardMaterial({ map: SIGNAL_TEX, side: THREE.DoubleSide, roughness: 0.8 });
// A line from a to b sagging by "sag" in the middle, with a flag every "gap"; returns the rope and the flags
function bunting(a, b, sag, gap, size = 1.3, clear = 0) {  // clear: leave the middle bare, for a banner
  const at = u => new THREE.Vector3().lerpVectors(a, b, u).setY(a.y + (b.y - a.y) * u - sag * 4 * u * (1 - u));
  const pts = Array.from({ length: 17 }, (_, k) => at(k / 16));
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 4), mats.wood);
  const n = Math.max(1, Math.floor(a.distanceTo(b) / gap)), flags = [];
  const along = b.clone().sub(a).setY(0).normalize(), out = new THREE.Vector3(-along.z, 0, along.x);
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n, p = at(u), q = at(u + 0.5 / n / 2);
    if (Math.abs(u - 0.5) < clear) continue;
    flags.push({ p, t: q.sub(p).normalize(), out, tile: (k * 5 + Math.abs(Math.round(a.x))) % SIGNAL.length, ph: k * 0.7 + a.x });
  }
  return { rope, flags, size };
}
// All the flags in one mesh, each a hanging square in three rows of vertices so it can ripple
function buntingMesh(lines) {
  const flags = lines.flatMap(l => l.flags.map(f => ({ ...f, size: l.size })));
  const pos = new Float32Array(flags.length * 9 * 3), uv = new Float32Array(flags.length * 9 * 2), idx = [];
  flags.forEach((f, i) => {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) uv.set([(f.tile + c / 2) / SIGNAL.length, 1 - r / 2], (i * 9 + r * 3 + c) * 2);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { const v = i * 9 + r * 3 + c; idx.push(v, v + 3, v + 1, v + 1, v + 3, v + 4); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, signalMat); m.frustumCulled = false;
  m.userData.flags = flags;
  flutter(m, 0, 0);
  return m;
}
// Each flag hangs from its top edge and streams out on the wind, the lower rows swinging further
function flutter(m, t, wind) {
  const pos = m.geometry.attributes.position, v = new THREE.Vector3();
  m.userData.flags.forEach((f, i) => {
    for (let r = 0; r < 3; r++) {
      const down = r / 2 * f.size, swing = Math.sin(t * (3 + wind * 4) + f.ph - r * 0.8) * (0.25 + wind * 0.4) * r / 2 * f.size + 0.15 * r * f.size;
      for (let c = 0; c < 3; c++) {
        v.copy(f.p).addScaledVector(f.t, (c / 2 - 0.5) * f.size).addScaledVector(f.out, swing);
        v.y -= down * Math.cos(swing / f.size);
        pos.setXYZ(i * 9 + r * 3 + c, v.x, v.y, v.z);
      }
    }
  });
  pos.needsUpdate = true;
  m.geometry.computeVertexNormals();
}
// A cloth banner with the hours on it, readable from both sides
function hoursBanner(text, w) {
  const tex = canvasTexture(512, 160, (g, cw, ch) => {
    g.fillStyle = "#f3e6c4"; g.fillRect(0, 0, cw, ch); g.strokeStyle = "#a8322c"; g.lineWidth = 14; g.strokeRect(7, 7, cw - 14, ch - 14);
    g.font = `92px "Pirata One", Georgia, serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#2b1d0e"; g.fillText(text, cw / 2, ch / 2 + 4);
  });
  const geo = new THREE.PlaneGeometry(w, w * 160 / 512).translate(0, -w * 80 / 512, 0), mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const g = new THREE.Group(), front = new THREE.Mesh(geo, mat), back = new THREE.Mesh(geo, mat);
  back.rotation.y = Math.PI; g.add(front, back);
  return g;
}
// A gun salute: the ship's guns on one side fire in turn, each a flash and a rolling puff of smoke
const PUFF = new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xe9e4da, transparent: true, depthWrite: false });
const GUN_FLASH = new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffb347, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
let salvo = [];
function salute(side, size = 1) {  // size: bigger smoke for a camera further off
  [-5, -2.4, 0.2, 2.8, 5.4].forEach((z, k) => salvo.push({ at: k * 0.3, side, z, age: -1, puffs: [], size }));
}
function updateSalute(dt) {
  for (const g of salvo) {
    g.at -= dt;
    if (g.at > 0) continue;
    if (g.age < 0) {  // fire: a flash and a few puffs pushed out from the port
      g.age = 0; sfx.gun(g.side);
      const port = ship.localToWorld(new THREE.Vector3(g.side * 2.4, 1.6, g.z)), out = ship.localToWorld(new THREE.Vector3(g.side * 10, 1.6, g.z)).sub(port).normalize();
      const flash = new THREE.Sprite(GUN_FLASH.clone()); flash.position.copy(port); flash.scale.setScalar(3 * g.size); scene.add(flash); g.flash = flash;
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Sprite(PUFF.clone()); m.position.copy(port); scene.add(m);
        if (g.size > 1) m.material.color.setHex(0x9a958e);  // greyer, to stand out against a bright sea from further off
        g.puffs.push({ m, v: out.clone().multiplyScalar((6 + k * 3) * g.size).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5)), s: (1.8 + k * 0.5) * g.size });
      }
    }
    g.age += dt;
    if (g.flash) { g.flash.material.opacity = Math.max(0, 1 - g.age / 0.18); if (g.age > 0.18) { scene.remove(g.flash); g.flash.material.dispose(); g.flash = null; } }
    for (const p of g.puffs) {
      p.m.position.addScaledVector(p.v, dt); p.v.multiplyScalar(Math.pow(0.35, dt)); p.v.y += dt * 0.6;
      p.m.scale.setScalar(p.s * (1 + g.age * 1.4)); p.m.material.opacity = (g.size > 1 ? 0.9 : 0.6) * Math.max(0, 1 - g.age / 2.2);
    }
  }
  salvo = salvo.filter(g => {
    if (g.age < 2.2) return true;
    g.puffs.forEach(p => { scene.remove(p.m); p.m.material.dispose(); });
    return false;
  });
}

// ---- Here be monsters: creatures that stand for things in the year --------------------------------
let creatures = [];
const creatureMixers = [];
// How each is shown. "cine": the crew's-eye shot and a gilded card (one-off events and achievements);
// "loud": a highlighted card only, for the ones that can come often
const TIER = { kraken: "cine", serpent: "cine", whale: "cine", chart: "cine", line: "cine", winds: "cine", twin: "cine", wreck: "loud", ghost: "loud" };
const tierOf = c => c.tier || TIER[c.kind];  // the build makes the first wreck and first ghost ship "cine"
const SIGHTING = {
  kraken: { kicker: "The kraken stirs", facts: c => `${c.n} episodes in one day · ${fmtDate(c.day)}` },
  serpent: { kicker: "A sea serpent", facts: c => `${c.n} days in a row · from ${short(c.day)}` },
  whale: { kicker: "Achievement · Leviathan", facts: c => `Every episode, start to finish: ${Math.min(c.n, c.of)} of ${c.of} · finished ${short(c.day)}` },
  chart: { kicker: "Achievement · First to chart it", facts: c => `First on YarrFlix to watch it, ${short(c.day)} · ${plural(c.n, "crew")} followed` },
  line: { kicker: "Achievement · Crossing the line", name: c => `${c.n.toLocaleString("en-AU")} hours at sea`, emblem: c => `${c.n.toLocaleString("en-AU")}<small>hours</small>`,
    facts: c => `Passed ${c.n.toLocaleString("en-AU")} hours on ${short(c.day)} · a salute from the guns` },
  winds: { kicker: "Achievement · Trade winds", name: c => `${c.n} days running`, emblem: c => `${c.n}<small>days</small>`,
    facts: c => `Something watched every day, ${short(c.from)} – ${short(c.day)} · dolphins at the bow` },
  wreck: { kicker: "A wreck", facts: c => `Last watched ${short(c.day)} · ${plural(c.n, "play")} of ${c.of} episodes in Plex` },
  ghost: { kicker: "A ghost ship", facts: c => `Nobody else on YarrFlix watched it · ${c.n.toLocaleString("en-AU")} h` },
  twin: { kicker: "Your viewing twin", name: c => c.user, facts: c => `${plural(c.n, "title")} in common, most of all ${D.titles[c.t].name} · a dipped flag in passing` },
};
const TWIN_CROSS = 7;
const TWIN_FLAG = new THREE.MeshStandardMaterial({ color: 0xd8423a, emissive: 0x5a1410, roughness: 0.6, side: THREE.DoubleSide });  // seconds (slowed with the crew's-eye shot) for the twin's ship to cross the bow and sail off
// Tentacles bend in the vertex shader; uRise lifts them out of the sea
function tentacle(phase, rise, clock) {
  const geo = new THREE.CylinderGeometry(0.18, 1.3, 16, 8, 32).translate(0, 8, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a3557, roughness: 0.5 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTime: clock, uPhase: { value: phase }, uRise: rise });
    sh.vertexShader = "uniform float uTime, uPhase, uRise;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      float h = clamp(position.y / 16.0, 0.0, 1.0);
      transformed.x += sin(h * 3.2 + uTime * 1.7 + uPhase) * h * h * 5.0;
      transformed.z += cos(h * 2.6 + uTime * 1.3 + uPhase) * h * h * 2.5;
      transformed.y = transformed.y * uRise - (1.0 - uRise) * 6.0;`);
  };
  return new THREE.Mesh(geo, mat);
}
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
// The sea serpent: a single scaled body rebuilt along a swimming spine each frame, with a reared
// head (horns, frill, an opening jaw), gold spines down its back and a tail fluke.
const SR = lite ? 72 : 120, SS = lite ? 10 : 14;  // rings along the body, sides around it
const serpentSkin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 });
const serpentGold = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.45, metalness: 0.3 });
const serpentBack = new THREE.MeshStandardMaterial({ color: 0x1f6b5a, roughness: 0.35, metalness: 0.1 });
const serpentBelly = new THREE.MeshStandardMaterial({ color: 0xe3c784, roughness: 0.5 });
const toothMat = new THREE.MeshStandardMaterial({ color: 0xf6f0de, roughness: 0.4 });
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
function serpentRadius(s) {  // neck, a thick chest, a long taper to the tail
  return s < 0.14 ? 1.1 + (s / 0.14) * 0.8 : 0.22 + 1.68 * Math.pow(1 - (s - 0.14) / 0.86, 0.85);
}
function makeSerpent(length) {
  const pos = new Float32Array((SR + 1) * (SS + 1) * 3), col = new Float32Array((SR + 1) * (SS + 1) * 3), idx = [];
  for (let i = 0; i < SR; i++) for (let j = 0; j < SS; j++) {
    const a = i * (SS + 1) + j, b = a + SS + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const back = new THREE.Color(0x1f6b5a), belly = new THREE.Color(0xe3c784), band = new THREE.Color(0x123f36), c = new THREE.Color();
  for (let i = 0; i <= SR; i++) for (let j = 0; j <= SS; j++) {
    const up = Math.cos(j / SS * Math.PI * 2);  // 1 along the top
    c.copy(belly).lerp(back, THREE.MathUtils.smoothstep(up, -0.55, 0.15));
    if (Math.sin(i / SR * length * 0.45) > 0.55 && up > -0.3) c.lerp(band, 0.6);  // dark bands across the back
    col.set([c.r, c.g, c.b], (i * (SS + 1) + j) * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const body = new THREE.Mesh(geo, serpentSkin); body.frustumCulled = false;

  // The head is built facing -z (forward), with +y up
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), serpentBack); skull.scale.set(1.45, 1.15, 2.2); skull.position.z = -0.6;
  const snout = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), serpentBack); snout.scale.set(0.95, 0.7, 1.6); snout.position.set(0, -0.1, -2.6);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.55, -0.6);
  const jawBone = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), serpentBelly);
  jawBone.scale.set(1.1, 0.6, 3.0); jawBone.position.z = -1.6; jaw.add(jawBone);
  for (let k = 0; k < 6; k++) {  // teeth along the jaw
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 5), toothMat);
    const side = k % 2 ? 1 : -1; tooth.position.set(side * (0.75 - k * 0.07), 0.15, -1.1 - k * 0.5); jaw.add(tooth);
  }
  head.add(skull, snout, jaw);
  [-1, 1].forEach(sd => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8), eyeMat); eye.position.set(sd * 1.05, 0.55, -1.5);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.1), pupilMat); pupil.position.set(sd * 0.3, 0, -0.12); eye.add(pupil);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.6, 7), serpentGold);
    horn.position.set(sd * 0.75, 1.2, 0.4); horn.rotation.set(1.05, 0, -sd * 0.35);
    head.add(eye, horn);
  });
  for (let k = 0; k < 5; k++) {  // a frill fanned behind the head
    const a = (k - 2) * 0.42, spine = new THREE.Mesh(new THREE.ConeGeometry(0.14, 2.2, 5), serpentGold);
    spine.position.set(Math.sin(a) * 1.3, 0.5 + Math.cos(a) * 0.9, 1.2); spine.rotation.set(0.9, 0, -a); head.add(spine);
  }
  // Spines down the back and a fluke on the tail
  const spikes = [];
  for (let k = 0; k < 16; k++) {
    const holder = new THREE.Group(), cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.5, 6), serpentGold);
    cone.position.y = 0.6; cone.rotation.x = 0.55; holder.add(cone); spikes.push(holder);
  }
  const fluke = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 4), serpentGold); fluke.scale.set(1, 1, 0.18);
  const flukeHolder = new THREE.Group(); fluke.rotation.x = Math.PI / 2; fluke.position.z = 1.4; flukeHolder.add(fluke);
  return { body, geo, pos, head, jaw, spikes, fluke: flukeHolder, length };
}
// Spine point s (0 = head, 1 = tail) in the creature's own frame; the head rears out of the sea
function spineAt(sp, s, t, out) {
  const u = s * sp.length;
  return out.set(Math.sin(u * 0.11 - t * 1.5) * 2.6 * (0.35 + s),
    Math.sin(u * 0.17 - t * 2.0) * 2.4 - 1.4 + THREE.MathUtils.smoothstep(0.16 - s, 0, 0.16) * 7.5 + Math.sin(t * 1.1) * 0.4 * (1 - s),
    u - sp.length * 0.3);
}
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _tan = new THREE.Vector3(), _side = new THREE.Vector3(), _up = new THREE.Vector3(),
  _m = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
function frameAt(sp, s, t) {  // position, and the ring's side and up directions, at s along the spine
  spineAt(sp, s, t, _p); spineAt(sp, Math.min(1, s + 0.004), t, _q);
  _tan.subVectors(_q, _p).normalize();
  _side.crossVectors(_tan, UP).normalize(); _up.crossVectors(_side, _tan).normalize();
}
function poseSerpent(sp, t) {
  const pos = sp.pos;
  for (let i = 0; i <= SR; i++) {
    const s = i / SR, rad = serpentRadius(s);
    frameAt(sp, s, t);
    for (let j = 0; j <= SS; j++) {
      const a = j / SS * Math.PI * 2, cu = Math.cos(a) * rad, cs = Math.sin(a) * rad;
      pos.set([_p.x + _up.x * cu + _side.x * cs, _p.y + _up.y * cu + _side.y * cs, _p.z + _up.z * cu + _side.z * cs], (i * (SS + 1) + j) * 3);
    }
  }
  sp.geo.attributes.position.needsUpdate = true;
  sp.geo.computeVertexNormals();
  const place = (obj, s, lift) => {  // stand obj on the spine at s: its -z along the swim, +y up
    frameAt(sp, s, t);
    obj.position.copy(_p).addScaledVector(_up, lift);
    _m.makeBasis(_side.clone().negate(), _up, _tan); obj.quaternion.setFromRotationMatrix(_m);
  };
  place(sp.head, 0, 0.2);
  sp.head.position.addScaledVector(_tan, -0.6);
  sp.jaw.rotation.x = 0.12 + 0.32 * Math.max(0, Math.sin(t * 1.3));
  sp.spikes.forEach((k, i) => place(k, 0.1 + i * 0.045, serpentRadius(0.1 + i * 0.045) * 0.85));
  place(sp.fluke, 1, 0);
}

function buildCreatures(v) {
  v.creatures.forEach((c, i) => {
    const day = (c.at ?? c.day) + 0.5, { p, right, fwd } = frame(day);
    const side = c.mock ? c.mock.side ?? 1 : c.kind === "kraken" ? 1 : c.kind === "serpent" ? -1 : (i % 2 ? 1 : -1);
    const off = c.mock ? c.mock.off ?? 36 : { kraken: 40, serpent: 30, whale: 36, wreck: 44, ghost: 30, chart: 42, line: 0, winds: 0, twin: 0 }[c.kind];
    const g = new THREE.Group(); g.position.copy(p).addScaledVector(right, side * off);
    g.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    const it = { c, day, group: g, kind: c.kind, side };
    if (c.mock) {
      it.mock = c.mock; c.mock.build(mockApi, it);  // mock mode: the scene builds into the group, already placed and facing along the course
    } else if (c.kind === "kraken" && MODELS.tentacle) {
      // Just tentacles: the body stays hidden below. "head" is only the point the crew look at.
      it.rise = { value: 0 }; it.clock = { value: 0 };
      const hg = new THREE.Group(); g.add(hg); it.head = hg;
      const clips = MODELS.tentacle.animations, clip = k => clips.find(a => a.name.includes(k));
      it.tentacles = [];
      for (let k = 0; k < 6; k++) {
        const a = (k + 0.5) / 6 * Math.PI * 2, t = model("tentacle"), holder = new THREE.Group();
        holder.position.set(Math.cos(a) * 10, 0, Math.sin(a) * 10);
        t.rotation.y = -side * Math.PI / 2 + (Math.random() - 0.5) * 1.0;  // curling towards the ship
        holder.add(t); g.add(holder);
        const mx = new THREE.AnimationMixer(t);
        const acts = Object.fromEntries(["Idle", "Attack2", "Attack", "Poke"].map(n => [n, clip(`_${n}|`) && mx.clipAction(clip(`_${n}|`))]));
        acts.Idle?.play(); mx.setTime(Math.random() * 3);
        for (const n of ["Attack2", "Attack", "Poke"]) acts[n]?.setLoop(THREE.LoopOnce, 1);
        mx.addEventListener("finished", () => { acts.Idle?.reset().fadeIn(0.35).play(); });
        creatureMixers.push(mx);
        it.tentacles.push({ holder, acts, mx, phase: k * 1.3, next: 1 + Math.random() * 4, bones: ["Tentacle4", "Tentacle8", "Tentacle12", "Tentacle15_end"].map(n => t.getObjectByName(n)).filter(Boolean) });
      }
      g.scale.setScalar(1.5);
    } else if (c.kind === "kraken") {
      it.rise = { value: 0 }; it.clock = { value: 0 };
      const head = new THREE.Mesh(new THREE.SphereGeometry(6, 20, 14), new THREE.MeshStandardMaterial({ color: 0x7a2c4c, roughness: 0.45 }));
      head.scale.set(1, 0.85, 1.1);
      [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), eyeMat); e.position.set(s * 2.4, 2.2, 5.2); head.add(e); });
      g.add(head); it.head = head;
      g.scale.setScalar(1.5);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, t = tentacle(k * 1.7, it.rise, it.clock);
        t.position.set(Math.cos(a) * 9, -1, Math.sin(a) * 9); t.rotation.y = -a; g.add(t); (it.bases ||= []).push(t);
      }
    } else if (c.kind === "serpent") {
      it.serpent = makeSerpent(34 + Math.min(30, c.n * 1.5));  // a longer streak makes a longer serpent
      g.add(it.serpent.body, it.serpent.head, it.serpent.fluke, ...it.serpent.spikes);
      g.scale.setScalar(1.25);
    } else if (c.kind === "whale") {
      const w = model("whale");
      if (!w) return;
      g.add(w); it.body = w;
      if (MODELS.whale.animations?.length) { const mx = new THREE.AnimationMixer(w); mx.clipAction(MODELS.whale.animations[0]).setLoop(THREE.LoopPingPong).play(); creatureMixers.push(mx); }  // its tail keys stop short of the clip's end, so a plain loop snaps
    } else if (c.kind === "wreck") {
      const w = model("ship-wreck", 1.4);
      if (!w) return;
      w.rotation.set(0.12, side * 0.9, side * 0.32); w.position.y = -2.2; g.add(w, foamRing(10)); isle(g, 9, 0.4);  // awash, but not swamped
    } else if (c.kind === "chart") {
      // A new island, just charted: bare sand, the crew's flag planted in it and a chest of gold
      const r = 10;
      const sand = model("patch-sand", r / 3.4) || new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.2, 1), mats.sand);
      sand.position.y = -0.4; deepen(sand, 2.5); const lift = groundAt(sand, side * 1.5, 1.5) - 0.5;  // how far the chest (and its glow) went up from 0.5
      g.add(sand, foamRing(r * 0.95));
      const flag = model("flag-pirate-high-pennant");
      if (flag) { flag.scale.multiplyScalar(11 / new THREE.Box3().setFromObject(flag).getSize(new THREE.Vector3()).y); flag.position.set(-side * 2.5, groundAt(sand, -side * 2.5, -1.5), -1.5); g.add(flag); }
      const chest = model("chest", 3); if (chest) { chest.position.set(side * 1.5, groundAt(sand, side * 1.5, 1.5), 1.5); chest.rotation.y = -side * 0.7; g.add(chest); }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffcf5a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(side * 1.5, 2.2 + lift, 1.5); glow.scale.setScalar(7); g.add(glow);
      const n = 40, pos = new Float32Array(n * 3), sp = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffe08a, size: 0.35, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3)); sp.position.copy(glow.position); g.add(sp);
      const hg = new THREE.Group(); hg.position.set(0, 3 + lift, 0); g.add(hg);
      it.head = hg; it.glow = glow; it.sparks = sp; isle(g, r);  // after standing things on the sand: isle() moves it into the world
    } else if (c.kind === "line") {
      // Two islets either side of the course, a chain of flagged buoys out from each to the gap the ship
      // sails through, and a line of signal flags strung high between them with the hours hung in the middle
      const lines = [], X = 27, top = 21;
      for (const sd of [-1, 1]) {
        const islet = new THREE.Group(); islet.position.set(sd * X, 0, 0); islet.rotation.y = sd * 0.8;
        const sand = model(sd === side ? "patch-sand-foliage" : "patch-sand", 7.5 / 3.4) || new THREE.Mesh(new THREE.SphereGeometry(7.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.2, 1), mats.sand);
        sand.position.y = -0.4; deepen(sand, 2.5); islet.add(sand, foamRing(7.2));
        const rocks = model("rocks-sand-a", 1.7); if (rocks) { rocks.position.set(3.5, groundAt(sand, 3.5, 2.5) - 0.3, 2.5); islet.add(rocks); }
        const tree = model(sd === side ? "palm-detailed-bend" : "palm-detailed-straight", 2.2); if (tree) { tree.position.set(-2.5, groundAt(sand, -2.5, -2), -2); islet.add(tree); }
        g.add(islet); isle(islet, 7.5);
        // A tall mast on the inner shore carries the high line, with a pennant on top
        const mx = sd * (X - 5);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, top + 1, 6), mats.wood); mast.position.set(mx, (top + 1) / 2 - 0.5, 0); g.add(mast);
        const flag = model("flag-high-pennant");
        if (flag) { flag.scale.multiplyScalar(5 / new THREE.Box3().setFromObject(flag).getSize(new THREE.Vector3()).y); flag.position.set(mx, top - 0.5, 0); g.add(flag); }
        // Buoys out from the shore to the gap, each with a short pole, and flags strung low along them
        let prev = new THREE.Vector3(mx, 4.2, 0);
        for (const bx of [16.5, 12.5, 8.5]) {
          const b = new THREE.Group(); b.position.set(sd * bx, 0, 0);
          const barrel = model("barrel", bx === 8.5 ? 1.9 : 1.5); if (barrel) { barrel.position.y = -0.5; b.add(barrel); }
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 5), mats.wood); pole.position.y = 2.6; b.add(pole, foamRing(1.8, false));
          g.add(b);
          const tip = new THREE.Vector3(sd * bx, 4.3, 0);
          lines.push(bunting(prev, tip, 0.6, 1.25, 0.9)); prev = tip;
        }
        if (sd === side) { it.head = new THREE.Group(); it.head.position.set(0, 9, 0); g.add(it.head); }
      }
      lines.push(bunting(new THREE.Vector3(-(X - 5), top - 1, 0), new THREE.Vector3(X - 5, top - 1, 0), 3.2, 1.7, 1.5, 0.17));
      lines.forEach(l => g.add(l.rope));
      it.flags = buntingMesh(lines); g.add(it.flags);
      const banner = hoursBanner(`${c.n.toLocaleString("en-AU")} HOURS`, 13); banner.position.set(0, top - 4.2, 0); g.add(banner); it.banner = banner;
    } else if (c.kind === "winds") {
      // A pod of dolphins escorting the bow; the group follows the ship
      it.pod = [];
      [[-2, -1], [1.5, 1], [-0.5, 3], [2.5, 4.5], [0.5, 6]].forEach(([out, ahead], k) => {  // in a loose wedge, the leaders furthest out
        const d = makeDolphin();
        d.g.position.set(side * out, 0, -ahead);
        g.add(d.g); it.pod.push({ ...d, ph: k * 0.37, rate: 0.36 + k * 0.03, x: d.g.position.x, z: d.g.position.z });
      });
      it.head = new THREE.Group(); it.head.position.z = -2.5; g.add(it.head);
    } else if (c.kind === "ghost") {
      const w = model("ship-ghost", 1.3);
      if (!w) return;
      w.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        Object.assign(o.material, { transparent: true, opacity: 0.5, depthWrite: false });
        o.material.emissive = new THREE.Color(0x5fffc4); o.material.emissiveIntensity = 0.35;
      });
      // Kenney's bow is +z, so unturned it sails towards us
      w.position.y = -1.3; g.add(w); it.body = w;
    } else if (c.kind === "twin") {
      // The twin's ship: Kenney's merchant galleon, white sails, bow (+z) turned to cross from the crew's side to the other
      const w = model("ship-large", 1.5);
      if (!w) return;
      w.position.y = -1.3; w.rotation.y = -side * Math.PI / 2; g.add(w, foamRing(7, false)); it.body = w;
      it.flags = [];
      w.traverse(o => { if (o.name.startsWith("flag")) { o.material = TWIN_FLAG; it.flags.push({ o, y: o.position.y }); } });  // bright colours, so the dip shows
      // A bank of haze gathering where it will appear, for it to sail out of; in the world, as the twin itself follows the ship
      it.haze = new THREE.Group(); it.haze.visible = false; world.add(it.haze);
      for (let k = 0; k < 20; k++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, transparent: true, depthWrite: false, opacity: 0 }));
        m.position.set((Math.random() - 0.5) * 34, 3 + Math.random() * 10, (Math.random() - 0.5) * 16); m.scale.setScalar(24 + Math.random() * 14);
        it.haze.add(m);
      }
    }
    world.add(g);
    creatures.push(it);
  });
}
// Kept hidden (below, silent, no splashes) until their crew's-eye shot begins; with reduced motion there are no such shots
const SURPRISE = new Set(["whale", "serpent", "kraken", "winds", "twin"]);
const surprise = it => SURPRISE.has(it.kind) || (!!it.mock && tierOf(it.c) === "cine" && it.mock.hidden !== false);
const unseen = it => surprise(it) && !it.seen && !reduced;
// Coming up, so a surprise doesn't just appear: from LEAD days before its crew's-eye shot (about 50 out, a little more
// than the shot frames it at) the water stirs over it, in the second half of that it starts up, just short of breaking the
// surface (PART of the way), and once the shot begins it comes the rest of the way up in about a second.
// A surprise that never gets its shot stays down. it.stir is the build-up, it.emerge how far up it is.
const LEAD = 2, PART = { whale: 0.3, serpent: 0.3, kraken: 0.3, winds: 0.45, twin: 0 };
function emergence(it, dt) {
  if (!unseen(it)) {
    it.emerge = (it.emerge ?? 1) + (1 - (it.emerge ?? 1)) * (1 - Math.pow(0.03, dt));
    if (it.kind !== "twin" || it.u > 0.18) it.stir = Math.max(0, (it.stir ?? 0) - dt / 1.5);  // the twin's haze holds until it is out of it
    return;
  }
  const ahead = it.day - day, pre = ahead > 0.2 && tierOf(it.c) === "cine" ? THREE.MathUtils.clamp((1.6 + LEAD - ahead) / LEAD, 0, 1) : 0;
  const stir = THREE.MathUtils.smoothstep(pre, 0, 0.5), up = (it.mock ? it.mock.part ?? 0.3 : PART[it.kind]) * THREE.MathUtils.smoothstep(pre, 0.5, 1);
  // Day by day, so a seek lands it in place; one passed by without its shot sinks back rather than vanishing
  const sink = it.emerge === undefined || jumped ? 1 : dt / 1.5;
  it.stir = Math.max(stir, (it.stir ?? 0) - sink); it.emerge = Math.max(up, (it.emerge ?? 0) - sink);
  if (it.stir > 0.05 && !it.stirred && playing) { it.stirred = true; sfx.stir(it); }
}
// The twin's haze sits where the twin waits, off the bow on the crew's side, thick enough to hide it until it sails out
function twinHaze(it) {
  const a = it.stir ?? 0;
  it.haze.visible = a > 0.01;
  if (!it.haze.visible) return;
  const f = frame(day);
  it.haze.position.copy(ship.position).addScaledVector(f.right, it.side * it.lane.hx).addScaledVector(f.fwd, it.lane.hz);  // over the twin and the first of its course
  it.haze.rotation.y = Math.atan2(-f.fwd.x, -f.fwd.z);
  it.haze.children.forEach(m => { m.material.color.copy(scene.fog.color).lerp(HAZE, 0.35); m.material.opacity = a * 0.95; });
}
const HAZE = new THREE.Color(0xffffff);
// Passing ships keep to open water, never sailing out of an island or into one. Once everything is built, the twin's
// crossing and each ghost ship's run are laid along the lane (of those tried, the least changed first) whose whole visible
// length stays clear of every island, islet, rock and lighthouse (isles), buoy and the Halloween raft by the ship's
// half-length and a little more, with the twin's haze bank clear too; failing that, the lane that comes least close.
// The twin's lane: the side it starts from, how far out (X), how far ahead it crosses and how it angles (F, drift);
// the ghost's: side, how far out.
const HAZE_R = 10, ROOM = 4;  // the haze bank's own room; a ship's room beyond its half-length
function shoals() {
  const s = isles.map(({ x, z, r }) => ({ x, z, r }));
  for (const o of world.children) if (o.userData.bob) s.push({ x: o.position.x, z: o.position.z, r: 3.5 });  // a buoy and its poster board
  for (const e of eggs) if (e.isle && e.group && !isles.some(i => i.obj === e.group)) s.push({ x: e.group.position.x, z: e.group.position.z, r: 3.5 });  // the raft
  return s;
}
const roomAt = (sh, x, z) => { let m = 1e9; for (const o of sh) m = Math.min(m, Math.hypot(x - o.x, z - o.z) - o.r); return m; };
function halfLength(it) {  // along its keel, whichever way it is turned in its group
  const r = it.group.rotation.y; it.group.rotation.y = 0; it.group.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(it.body).getSize(new THREE.Vector3()); it.group.rotation.y = r; it.group.updateMatrixWorld(true);
  return Math.max(b.x, b.z) / 2;
}
// Where the ship is through the twin's crossing (u from 0 to 1), as tick() sails her at each speed from the cut to its
// crew's-eye shot: the shot's slow motion and her slowing past cine creatures, and whether the camera is still on the
// twin (the shot and the glide back out of it), after which only what the chase shot sees counts. Reduced motion: by day.
function twinDays(it) {
  if (reduced) return [Array.from({ length: 41 }, (_, k) => [k / 40, frame(it.day - 2.1 + 2.4 * k / 40), false])];
  return [0.5, 1, 2].map(sp => {
    const out = []; let d = it.day - 1.6, u = 0, mo = 1, t = 0, k = 0;
    while (u < 1) {
      mo += ((t < 7.5 ? 0.4 : 1) - mo) * (1 - Math.pow(0.02, 1 / 30)); t += 1 / 30;
      let slow = 1;
      for (const c of creatures) if (tierOf(c.c) === "cine") slow = Math.min(slow, 0.35 + 0.65 * THREE.MathUtils.smoothstep(Math.abs(c.day - d - 0.3), 0.3, 1.6));
      d += mo / 30 * sp * daysPerSecond * slow; u = Math.min(1, u + mo / 30 / TWIN_CROSS);
      if (k++ % 6 === 0 || u === 1) out.push([u, frame(d), t < 7.5 + 2.2]);
    }
    return out;
  });
}
const inChase = (x, z) => {  // within the chase shot's view (SHOTS.chase: from 28 aft and 13 to starboard, at 26 ahead and 2 to port), wide screens and all
  const ax = 54, az = -15, bx = z + 28, bz = x - 13;
  return (ax * bx + az * bz) / Math.hypot(ax, az) / Math.hypot(bx, bz) > Math.cos(THREE.MathUtils.degToRad(50));
};
function steerPast() {
  const shore = shoals(), best = (lanes, room) => {  // the first fully clear lane in order, or else the roomiest (of those clear at 1x, if any are)
    lanes.forEach(l => { l.room = room(l); });
    const ok = lanes.filter(l => (l.room1 ?? l.room) >= 0);
    return lanes.find(l => l.room >= 0) || (ok.length ? ok : lanes).reduce((a, b) => b.room > a.room ? b : a);
  };
  for (const it of creatures) {
    if (!it.body || (it.kind !== "twin" && it.kind !== "ghost")) continue;
    const half = halfLength(it), lanes = [], o = frame(it.day).p, sh = shore.filter(s => Math.hypot(s.x - o.x, s.z - o.z) < 320);  // all it could come near
    if (it.kind === "twin") {
      const runs = twinDays(it), haze = [];  // the haze, while it is thick enough to see (a quarter on): from early in its gathering until it thins after the twin is out
      for (let d = it.day - 1.6 - LEAD * 0.84; d < it.day - 1.6; d += 0.25) haze.push(frame(d));
      for (const run of runs) for (const [u, f] of run) if (u < 0.35) haze.push(f);
      for (const side of [it.side, -it.side]) for (const X of [44, 32, 56, 68]) for (const F of [38, 46, 30, 54, 62, 70, 24, 80]) for (const drift of [-6, 8, -20, 22, -34, -48, 36, -62])
        lanes.push({ side, X, F, drift, cost: (side !== it.side) * 1.5 + Math.abs(X - 44) / 10 + Math.abs(F - 38) / 8 + Math.abs(drift + 6) / 14 });
      lanes.sort((a, b) => a.cost - b.cost);
      const l = best(lanes, l => {
        const { side, X, F, drift } = l;
        let m = 1e9, m1 = 1e9;
        runs.forEach((run, k) => {
          for (const [u, { p, fwd, right }, held] of run) {
            const x = side * (X - u * 170), z = F + drift * u;
            m = Math.min(m, Math.hypot(Math.max(0, Math.abs(x) - half), Math.max(0, Math.abs(z) - 11)) - 14);  // and well clear of our own bow (11 from her middle), for the crew's shot
            if (!held && !inChase(x, z)) continue;  // off the edge of the screen: sailing on out of view
            const q = roomAt(sh, p.x + right.x * x + fwd.x * z, p.z + right.z * x + fwd.z * z) - half - ROOM;
            m = Math.min(m, q); if (k === runs.length >> 1) m1 = Math.min(m1, q);  // the 1x run (reduced motion's only one): the speed most sail at
          }
        });
        // The bank is wide enough to hide the twin anywhere in its middle: it sits wherever round the twin has most room
        let hm = -1e9;
        for (const [dx, dz] of [[-4, -3], [6, 0], [-12, -3], [-4, 6], [6, -8]]) {
          let h = 1e9;
          for (const { p, fwd, right } of haze) h = Math.min(h, roomAt(sh, p.x + right.x * side * (X + dx) + fwd.x * (F + dz), p.z + right.z * side * (X + dx) + fwd.z * (F + dz)) - HAZE_R);
          if (h > hm) { hm = h; l.hx = X + dx; l.hz = F + dz; }
        }
        l.room1 = Math.min(m1, hm);
        return Math.min(m, hm);
      });
      it.side = l.side; it.body.rotation.y = -l.side * Math.PI / 2; it.lane = l;
    } else {
      // The ghost runs straight along the course's heading at its day, from 0.6 * 6 days ahead to as far behind
      const { p, fwd, right } = frame(it.day), run = 6 * DAY * 0.6;
      for (const side of [it.side, -it.side]) for (const off of [30, 38, 24, 46, 54, 62])
        lanes.push({ side, off, cost: (side !== it.side) * 1.5 + Math.abs(off - 30) / 8 });
      lanes.sort((a, b) => a.cost - b.cost);
      const l = best(lanes, ({ side, off }) => {
        let m = 1e9;
        for (let a = -run; a <= run; a += 2) m = Math.min(m, roomAt(sh, p.x + right.x * side * off + fwd.x * a, p.z + right.z * side * off + fwd.z * a) - half - ROOM);
        return m;
      });
      it.side = l.side; it.lane = l; it.group.position.copy(p).addScaledVector(right, l.side * l.off);
    }
    it.clear = half + ROOM;  // for checks
  }
}
function animateCreatures(dt) {
  let stirred = null;
  for (const it of creatures) {
    const dd = day - (it.day - 0.5);
    const near = Math.abs(dd) < (it.mock ? it.mock.range ?? 25 : it.kind === "wreck" ? 130 : it.kind === "winds" ? 3.5 : 25);
    if (surprise(it) && !reduced) emergence(it, dt);
    if (it.stir > 0.01 && (!stirred || it.stir > stirred.stir)) stirred = it;
    // The surprises stay out of sight until the crew are watching for them, apart from coming up just before
    it.group.visible = near && (!unseen(it) || it.emerge > 0.01);
    if (it.haze) twinHaze(it);
    if (!it.group.visible) continue;
    const gp = it.group.position;
    if (it.mock) {  // mock mode: the scene moves itself, and disturbs the water once it is out
      it.mock.animate?.(mockApi, it, dt, dd);
      if (!unseen(it)) it.mock.water?.(mockApi, it, dt, dd);
    } else if (it.kind === "kraken") {
      // Up from two days before, down after; held up while the crew are watching it, then sinking smoothly
      const held = (shot.name === "crew" && shot.it === it) || crewOut?.it === it;
      const goal = held ? 1 : unseen(it) ? it.emerge : THREE.MathUtils.smoothstep(4 - Math.abs(dd + 1), 0, 2.5);
      it.riseNow = it.riseNow === undefined || unseen(it) ? goal : it.riseNow + (goal - it.riseNow) * (1 - Math.pow(0.25, dt));  // rising, not snapping, at the cut
      const rise = it.riseNow;
      it.rise.value = rise; it.clock.value = time;
      if (it.tentacles) {
        it.head.position.y = -14 + rise * 20;
        for (const tt of it.tentacles) {
          tt.holder.position.y = -19 * (1 - rise) - 1 + Math.sin(time * 0.9 + tt.phase) * 0.4;
          // Now and then a tentacle lashes, pokes or strikes, then goes back to swaying
          if (rise > 0.6 && (tt.next -= dt) < 0) {
            tt.next = 2.5 + Math.random() * 4;
            const n = ["Attack2", "Attack", "Poke"][Math.floor(Math.random() * 3)], act = tt.acts[n];
            if (act) { tt.acts.Idle?.fadeOut(0.25); act.reset().fadeIn(0.25).play(); }
          }
        }
      } else it.head.position.y = -9 + rise * 7.5 + Math.sin(time * 1.3) * 0.6;
      gp.y = seaHeight(gp.x, gp.z) * 0.5;
      if (!unseen(it) && rise > 0.05) krakenWater(it, rise, dt);
    } else if (it.kind === "serpent") {
      poseSerpent(it.serpent, time);
      gp.y = seaHeight(gp.x, gp.z) * 0.6 - (1 - (it.emerge ?? 1)) * 13;  // coming up: at its part-way only the horns break the surface
      if (!unseen(it)) serpentWater(it, dt);
    } else if (it.kind === "whale" && it.body) {
      // Breach every nine seconds, otherwise cruising with its back out. Each part hands over smoothly:
      // it sinks and tips its nose up, launches, falls nose-first, then levels off and comes back up.
      const cycle = ((time + (it.phase ?? it.day * 1.7)) % 9) / 9, sm = THREE.MathUtils.smootherstep;
      let y = -2.4, rot = 0, mound = 0;
      if (cycle > 0.88) { const q = sm(cycle, 0.88, 1); y -= 1.5 * q; rot = -0.7 * q; mound = 1.2 * q; }
      else if (cycle < 0.3) { const u = cycle / 0.3; y = -3.9 + Math.sin(u * Math.PI) * 10.5; rot = -0.7 * Math.cos(u * Math.PI); mound = 1.2 * Math.max(0, 1 - u / 0.2); }
      else if (cycle < 0.45) { const r2 = (cycle - 0.3) / 0.15; y = -3.9 - 8.25 * (1 - (1 - r2) * (1 - r2)); rot = 0.7; }  // dives on, slowing (its speed matches the fall)
      else if (cycle < 0.6) { y = -12.15; rot = 0.7 * (1 - sm(cycle, 0.45, 0.6)); }  // levels off out of sight
      else if (cycle < 0.72) y = -12.15 + 9.75 * sm(cycle, 0.6, 0.72);  // and comes back up to cruise
      if (cycle >= 0.3 && cycle < 0.5) {
        const r2 = (cycle - 0.3) / 0.2;
        mound = r2 < 0.5 ? -1.8 * Math.sin(r2 * 2 * Math.PI) : 0.8 * Math.sin((r2 * 2 - 1) * Math.PI);  // a hollow, then the rebound
      }
      if (unseen(it)) { y = -16 + 35 * it.emerge; rot = 0; }  // still coming up under the surface, to just below it; the shot's breach is its first time out
      it.body.position.y = y; it.body.rotation.x = rot;
      gp.y = seaHeight(gp.x, gp.z);
      if (unseen(it)) { waterMat.uniforms.uMound.value.set(gp.x, gp.z, it.emerge * 2, 9); moundSet = true; }  // the sea heaving over it
      else if (Math.abs(dd) < 6) whaleWater(it, cycle, mound, y);
    } else if (it.kind === "ghost" && it.body) {
      // It sails towards the ship and slips past
      const along = THREE.MathUtils.clamp(-dd, -6, 6) * DAY * 0.6;
      it.body.position.z = -along;
      it.body.position.y = -1.3 + Math.sin(time * 0.9) * 0.6;
    } else if (it.kind === "wreck") {
      gp.y = seaHeight(gp.x, gp.z) * 0.4;
    } else if (it.kind === "chart") {
      gp.y = seaHeight(gp.x, gp.z) * 0.3;
      it.glow.material.opacity = 0.55 + 0.25 * Math.sin(time * 2.3);
      const pos = it.sparks.geometry.attributes.position;  // gold motes drifting up from the chest
      for (let k = 0; k < pos.count; k++) {
        const u = (time * 0.35 + k / pos.count) % 1, a = k * 2.4;
        pos.setXYZ(k, Math.cos(a) * (0.6 + u * 1.6), u * 6, Math.sin(a) * (0.6 + u * 1.6));
      }
      pos.needsUpdate = true;
    } else if (it.kind === "line") {
      gp.y = seaHeight(gp.x, gp.z) * 0.3;
      flutter(it.flags, time, weather(day).storm);
      it.banner.rotation.x = Math.sin(time * 1.6) * 0.08;
      // The guns fire a salute as the ship comes up to the line, while the crew are looking out that way
      if (it.lastDd !== undefined && it.lastDd < 0.15 && dd >= 0.15 && !jumped) salute(it.side, 2.4);
      it.lastDd = dd;
    } else if (it.kind === "twin" && it.body) {
      // Out ahead on the crew's side, it crosses the bow and sails off the other way. The clock is its own,
      // so it keeps sailing when the ship slows for it (and stops when paused); a jump puts it where it would be
      if (it.u === undefined) it.u = reduced ? THREE.MathUtils.clamp((dd + 1.6) / 2.4, 0, 1) : 0;  // after waiting in the haze for its shot, crossing from the start
      else if (dd < -1.6) it.u = 0;
      else if (playing) it.u = Math.min(1, it.u + dt / TWIN_CROSS);
      it.group.visible = it.u > 0 && it.u < 1;
      const f = frame(day), x = it.side * (it.lane.X - it.u * 170);
      gp.copy(ship.position).addScaledVector(f.right, x).addScaledVector(f.fwd, it.lane.F + it.lane.drift * it.u);  // along the lane steerPast() chose
      gp.y = seaHeight(gp.x, gp.z) * 0.6;
      it.group.rotation.y = Math.atan2(-f.fwd.x, -f.fwd.z);
      it.body.rotation.z = Math.sin(time * 0.8) * 0.04;
      // Dipping its colours to us as it comes across: down to half-mast and back up
      const dip = Math.sin(Math.PI * THREE.MathUtils.clamp((it.u - 0.1) / 0.35, 0, 1));
      it.flags.forEach((fl, k) => { fl.o.position.y = fl.y - dip * 2.2; fl.o.rotation.y = Math.sin(time * 3.5 + k * 1.3) * 0.2; });
    } else if (it.kind === "winds") {
      // Alongside the bow on the crew's side, arriving and leaving below the surface
      const f = frame(day), here = Math.min(it.emerge ?? 1, THREE.MathUtils.smoothstep(3.5 - Math.abs(dd), 0, 1.5));  // part-way, a fin breaks the surface at the top of a leap
      gp.copy(ship.position).addScaledVector(f.right, it.side * 14).addScaledVector(f.fwd, 7);  // off the bow, out past the edge of the sails as seen from the deck
      gp.y = seaHeight(gp.x, gp.z) - (1 - here) * 6;
      it.group.rotation.y = Math.atan2(-f.fwd.x, -f.fwd.z);
      if (!it.vel) { it.vel = new THREE.Vector3(); it.lastGp = gp.clone(); }  // how fast the pod is going, for the spray it throws
      it.vel.subVectors(gp, it.lastGp).divideScalar(Math.max(dt, 1e-3)).setY(0); it.lastGp.copy(gp); if (jumped || it.vel.lengthSq() > 2500) it.vel.set(0, 0, 0);
      for (const d of it.pod) {
        // Each leaps in turn: up nose first, arcing over and in again, then a stretch just under the surface
        const u = (time * d.rate + d.ph) % 1, leap = u < 0.42 ? u / 0.42 : -1;
        d.g.position.set(d.x + Math.sin(time * 0.5 + d.ph * 5) * 0.8, leap >= 0 ? -0.9 + Math.sin(leap * Math.PI) * 3.4 : -0.85, d.z + Math.sin(time * 0.7 + d.ph * 3) * 1.5);
        d.g.rotation.x = leap >= 0 ? Math.cos(leap * Math.PI) * 0.85 : 0;  // positive is nose up
        if (d.swim) d.swim.timeScale = leap >= 0 ? 0.5 + 0.5 * leap : 1.8;  // beating hard under water, easing off in the air
        else d.fluke.rotation.x = Math.sin(time * (leap >= 0 ? 4 : 9) + d.ph * 6) * 0.35;
        if (here > 0.8 && Math.abs(dd) < 3) dolphinWater(it, d, u);
        d.prevU = u;
      }
    }
  }
  // The one stirring most turns the water over it, with bubbles breaking now and then
  const q = waterMat.uniforms.uStir.value;
  if (stirred && stirred.kind !== "twin") {
    const f = frame(day), at = stirred.kind !== "winds" ? stirred.group.position  // the pod's spot alongside, where it will be
      : tmp2.copy(ship.position).addScaledVector(f.right, stirred.side * 14).addScaledVector(f.fwd, 9.5);
    q.set(at.x, at.z, stirred.stir, stirred.mock ? stirred.mock.stirR ?? 18 : { whale: 18, serpent: 20, kraken: 22, winds: 9 }[stirred.kind]);
    if (Math.random() < stirred.stir * dt * 12) emitWhale(3, at.x, at.z, seaHeight(at.x, at.z), q.w * 0.5, 2.5, 0.4);
  } else q.z = 0;
  updateSalute(dt);
  for (const mx of creatureMixers) mx.update(dt);
  for (const mx of mixers) mx.update(dt);
  const near = creatures.filter(it => it.kind === "whale" && it.group.visible && it.splashT !== undefined && Math.abs(day - it.day) < 6)
    .sort((a, b) => b.splashT - a.splashT)[0];
  if (near) waterMat.uniforms.uSplash.value.set(near.group.position.x, near.group.position.z, time - near.splashT, near.splashS);
  else if (mockRing && time - mockRing.t < 12) waterMat.uniforms.uSplash.value.set(mockRing.x, mockRing.z, time - mockRing.t, mockRing.s);  // api.ring()
  else waterMat.uniforms.uSplash.value.w = 0;
  if (!moundSet) waterMat.uniforms.uMound.value.z = 0;
  moundSet = false;
  updateWhaleSpray(dt);
}

// ---- Whale splashes: droplets thrown up as it launches and lands, and water streaming off it ----
const WSPRAY = lite ? 240 : 520;
const wPos = new Float32Array(WSPRAY * 3).fill(-1e4), wCol = new Float32Array(WSPRAY * 4);
const wGeo = new THREE.BufferGeometry();
wGeo.setAttribute("position", new THREE.BufferAttribute(wPos, 3));
wGeo.setAttribute("color", new THREE.BufferAttribute(wCol, 4));
let whaleSpray = null, wNext = 0, moundSet = false, mockRing = null;
const wDrops = Array.from({ length: WSPRAY }, () => ({ life: 0, max: 1, floor: 0, v: new THREE.Vector3(), p: new THREE.Vector3() }));
function emitWhale(n, cx, cz, base, radius, up, out, top = base) {
  for (let k = 0; k < n; k++) {
    const d = wDrops[wNext]; wNext = (wNext + 1) % WSPRAY;
    const a = Math.random() * 6.283, rr = radius * Math.sqrt(Math.random());
    d.p.set(cx + Math.cos(a) * rr, base + Math.random() * (top - base), cz + Math.sin(a) * rr);
    const o = out * (0.4 + Math.random() * 0.9);
    d.v.set(Math.cos(a) * o, up * (0.45 + Math.random() * 0.75), Math.sin(a) * o);
    d.floor = base - 0.5; d.max = d.life = 1.2 + Math.random() * 1.3;
  }
}
function whaleWater(it, cycle, mound, y) {
  const gp = it.group.position, prev = it.prevCycle ?? cycle;
  const crossed = a => (prev <= cycle ? prev < a && cycle >= a : prev < a || cycle >= a);
  if (crossed(0.03)) { it.splashT = time; it.splashS = 0.7; emitWhale(140, gp.x, gp.z, gp.y, 5, 12, 4.5); sfx.whale(it, false); }   // breaking the surface
  if (crossed(0.255)) { it.splashT = time; it.splashS = 1; emitWhale(260, gp.x, gp.z, gp.y, 7, 16, 7); sfx.whale(it, true); }  // the landing
  const dtc = Math.max(0, cycle - prev) * 9;  // seconds of cycle this frame
  if (cycle > 0.03 && cycle < 0.13) emitWhale(Math.round(dtc * 160), gp.x, gp.z, gp.y, 3, 2, 2.5, gp.y + y + 2);  // streaming off its flanks
  if (cycle > 0.255 && cycle < 0.33) emitWhale(Math.round(dtc * 110), gp.x, gp.z, gp.y, 6, 7, 3);
  it.prevCycle = cycle;
  waterMat.uniforms.uMound.value.set(gp.x, gp.z, mound, 9); moundSet = true;
}

// ---- The serpent's and the kraken's water: churned foam and rings where they break the surface (uChurn, a ring of
// CHURN_N spots shared by both), spray and droplets off them from the whale's pool, the kraken's heave (uMound) ----
const CHURN = Array.from({ length: CHURN_N }, () => ({ x: 0, z: 0, t: -99, s: 0, r: 1 }));
let churnNext = 0;
function churnAt(x, z, s, r) { Object.assign(CHURN[churnNext], { x, z, t: time, s, r }); churnNext = (churnNext + 1) % CHURN_N; }
const WET = lite ? 0.5 : 1;  // fewer droplets on phones
// Water running off something lifting clear: from p, falling back to the sea
function dripFrom(n, p, sea, spread) {
  for (let k = 0; k < n * WET; k++) {
    const d = wDrops[wNext]; wNext = (wNext + 1) % WSPRAY;
    d.p.set(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, p.z + (Math.random() - 0.5) * spread);
    d.v.set((Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6);
    d.floor = sea - 0.5; d.max = d.life = 0.7 + Math.random() * 0.8;
  }
}
// The serpent: down its spine, wherever the body passes through the surface a coil is arching out or plunging back.
// Each throws spray (more the faster it is moving there) and leaves foam that rings out, so the swim leaves a churned
// trail; water runs off the coils as they lift. Its neck crashing down, and the surge as it comes up, splash big.
const SPINE_N = 28;
function serpentWater(it, dt) {
  const sp = it.serpent, g = it.group, ws = g.scale.x;
  if (dt <= 0 || camera.position.distanceTo(g.position) > 260) return;
  g.updateMatrixWorld();
  const was = jumped ? [] : it.waterD || [], pts = [];
  for (let k = 0; k <= SPINE_N; k++) {
    const s = k / SPINE_N, p = spineAt(sp, s, time, new THREE.Vector3()).applyMatrix4(g.matrixWorld), sea = seaHeight(p.x, p.z);
    pts.push({ s, p, sea, d: p.y - sea, rad: serpentRadius(s) * ws, vy: was.length ? (p.y - sea - was[k]) / dt : 0 });
  }
  it.waterD = pts.map(q => q.d);
  if (!it.surged && (it.emerge ?? 1) > 0.55) {  // up out of the sea as its shot begins
    it.surged = true;
    const n = pts[Math.round(SPINE_N * 0.16)];
    if ((it.emerge ?? 1) < 0.95) { churnAt(n.p.x, n.p.z, 1, 6); emitWhale(Math.round(180 * WET), n.p.x, n.p.z, n.sea, 5, 13, 5); sfx.serpent(it, true); }
  }
  it.churnT = (it.churnT ?? 0) - dt;
  const mark = it.churnT <= 0; if (mark) it.churnT = 0.45;
  for (let k = 1; k <= SPINE_N; k++) {
    const a = pts[k - 1], b = pts[k];
    if (b.d > 0 && b.d < b.rad * 2.2 && b.vy > 1.5 && Math.random() < dt * 1.2) dripFrom(1, tmp2.copy(b.p).setY(b.p.y + b.rad * 0.8), b.sea, b.rad);  // running off a coil as it lifts
    if ((a.d > 0) === (b.d > 0)) continue;
    const f = a.d / (a.d - b.d), x = a.p.x + (b.p.x - a.p.x) * f, z = a.p.z + (b.p.z - a.p.z) * f, sea = a.sea + (b.sea - a.sea) * f, rad = a.rad + (b.rad - a.rad) * f;
    const vy = (a.vy + b.vy) / 2, hard = Math.min(1, Math.abs(vy) / 6);
    if (Math.random() < dt * (3 + hard * 10)) emitWhale(Math.round((2 + hard * 6 * rad) * WET), x, z, sea, rad, 3 + hard * 6, 1.2 + hard * 2.5);
    if (mark) { churnAt(x, z, 0.55 + hard * 0.3, 1.2 + rad * 1.3); sfx.serpent(it, false); }
    if (a.s < 0.3 && vy < -4 && time > (it.crashT ?? 0)) {  // the neck crashing down
      it.crashT = time + 1.6;
      churnAt(x, z, 1, 3.5 + rad); emitWhale(Math.round(90 * WET), x, z, sea, rad * 1.4, 10, 4.5); sfx.serpent(it, true);
    }
  }
}
// The kraken: the sea heaving and churning over the body below, foam and ripples ringing each tentacle where it comes up
// through the surface, water pouring off a tentacle as it lifts out, and a heavy splash wherever one slaps down
const kAt = new THREE.Vector3();
function krakenWater(it, rise, dt) {
  const gp = it.group.position, up = THREE.MathUtils.smoothstep(rise, 0.15, 0.6);
  if (dt <= 0 || camera.position.distanceTo(gp) > 280) return;
  if (!moundSet) { waterMat.uniforms.uMound.value.set(gp.x, gp.z, up * (0.55 + 0.3 * Math.sin(time * 0.9) + 0.15 * Math.sin(time * 2.3 + 1)), 11); moundSet = true; }
  it.churnT = (it.churnT ?? 0) - dt;
  const mark = it.churnT <= 0; if (mark) it.churnT = 0.5;
  if (mark) { const a = Math.random() * 6.283, r = Math.random() * 5; churnAt(gp.x + Math.cos(a) * r, gp.z + Math.sin(a) * r, 0.5 * up, 6 + Math.random() * 3); }
  if (Math.random() < dt * 6 * up * WET) emitWhale(3, gp.x, gp.z, seaHeight(gp.x, gp.z), 8, 2.5, 0.8);  // bubbling up in the middle
  const bases = it.tentacles ? it.tentacles.map(t => t.holder) : it.bases || [];
  it.baseT ||= bases.map((b, k) => k / bases.length);
  bases.forEach((b, k) => {
    b.getWorldPosition(kAt); const sea = seaHeight(kAt.x, kAt.z);
    if ((it.baseT[k] -= dt) < 0) { it.baseT[k] = 1; churnAt(kAt.x, kAt.z, 0.9 * up, 3.2); }
    if (Math.random() < dt * 3 * up * WET) emitWhale(2, kAt.x, kAt.z, sea, 1.5, 2.5, 1.2);
  });
  if (it.tentacles) for (const tt of it.tentacles) tt.bones.forEach((bn, j) => {
    bn.getWorldPosition(kAt);
    const sea = seaHeight(kAt.x, kAt.z), d = kAt.y - sea, prev = jumped ? null : tt.wasD?.[j];
    (tt.wasD ||= [])[j] = d;
    if (prev === undefined || prev === null) return;
    const vy = (d - prev) / dt;
    if (j === tt.bones.length - 1) {  // the tip: a strike brought down hard and low slaps the water under the tentacle
      if (vy < -20) tt.strike = Math.max(tt.strike || 0, -vy);
      else if (tt.strike && vy > -5) {
        if (d < 10 && time > (tt.slapT ?? 0)) {
          tt.slapT = time + 0.6;
          const big = Math.min(1, tt.strike / 60), w = tt.bones[tt.bones.length - 2].getWorldPosition(tmp2), ws = seaHeight(w.x, w.z);
          churnAt(w.x, w.z, 0.8 + big * 0.2, 2.5 + big * 3); emitWhale(Math.round((50 + big * 90) * WET), w.x, w.z, ws, 1.5 + big * 2, 7 + big * 7, 2.5 + big * 3);
          sfx.kraken(it, true, big);
        }
        tt.strike = 0;
      }
    }
    if (prev <= 0 && d > 0 && vy > 4 && time > (tt.liftT ?? 0)) {  // tearing up out of it
      tt.liftT = time + 0.8;
      churnAt(kAt.x, kAt.z, 0.6, 2); emitWhale(Math.round(25 * WET), kAt.x, kAt.z, sea, 1.2, 5, 1.5);
      sfx.kraken(it, false, Math.min(1, vy / 15));
    } else if (d > 0 && Math.random() < dt * (vy > 3 ? 14 : 2)) dripFrom(vy > 3 ? 3 : 1, kAt, sea, 0.8);  // pouring off it as it lifts, dripping as it sways
  });
}
function updateWhaleSpray(dt) {
  if (!whaleSpray) {
    whaleSpray = new THREE.Points(wGeo, new THREE.PointsMaterial({ size: 1.6, map: sprayTex, vertexColors: true, transparent: true, depthWrite: false }));
    whaleSpray.frustumCulled = false; scene.add(whaleSpray);
  }
  wDrops.forEach((d, i) => {
    if (d.life > 0) { d.life -= dt; d.v.y -= 15 * dt; d.p.addScaledVector(d.v, dt); if (d.p.y < d.floor && d.v.y < 0) d.life = 0; }
    if (d.life <= 0) { wCol[i * 4 + 3] = 0; return; }
    wPos.set([d.p.x, d.p.y, d.p.z], i * 3);
    wCol.set([0.92, 0.97, 1, Math.min(1, d.life / d.max * 1.6) * 0.9], i * 4);
  });
  wGeo.attributes.position.needsUpdate = wGeo.attributes.color.needsUpdate = true;
  const u = waterMat.uniforms;
  CHURN.forEach((q, k) => { u.uChurn.value[k].set(q.x, q.z, time - q.t, q.s); u.uChurnR.value[k] = q.r; });
  updateDolphinSpray(dt);
}

// ---- Dolphin splashes: the whale's, scaled down, as each one breaks the surface (0.036 of its cycle) and goes back in (0.384) ----
const DSPRAY = lite ? 120 : 240;
const dPos = new Float32Array(DSPRAY * 3).fill(-1e4), dCol = new Float32Array(DSPRAY * 4);
const dGeo = new THREE.BufferGeometry();
dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
dGeo.setAttribute("color", new THREE.BufferAttribute(dCol, 4));
let dolphinSpray = null, dNext = 0, dFoamNext = 0;
const dDrops = Array.from({ length: DSPRAY }, () => ({ life: 0, max: 1, floor: 0, v: new THREE.Vector3(), p: new THREE.Vector3() }));
const dFoam = Array.from({ length: 4 }, () => ({ x: 0, z: 0, t: -99, s: 0 })), dAt = new THREE.Vector3(), dCarry = new THREE.Vector3();
function emitDolphin(n, at, sea, radius, up, out, carry) {
  for (let k = 0; k < n; k++) {
    const d = dDrops[dNext]; dNext = (dNext + 1) % DSPRAY;
    const a = Math.random() * 6.283, rr = radius * Math.sqrt(Math.random()), o = out * (0.4 + Math.random() * 0.9);
    d.p.set(at.x + Math.cos(a) * rr, sea + Math.random() * 0.3, at.z + Math.sin(a) * rr);
    d.v.set(Math.cos(a) * o, up * (0.45 + Math.random() * 0.75), Math.sin(a) * o).add(carry);  // keeping up with the pod
    d.floor = sea - 0.3; d.max = d.life = 0.7 + Math.random() * 0.7;
  }
}
function dolphinWater(it, d, u) {
  const prev = d.prevU ?? u, crossed = a => (prev <= u ? prev < a && u >= a : prev < a || u >= a);
  const out = crossed(0.036), back = crossed(0.384);
  if (!out && !back) return;
  d.g.getWorldPosition(dAt);
  const sea = seaHeight(dAt.x, dAt.z);
  dCarry.copy(it.vel).multiplyScalar(0.8);
  if (out) emitDolphin(24, dAt, sea, 0.5, 5, 1.1, dCarry);  // breaking the surface, nose first
  else {
    emitDolphin(40, dAt, sea, 0.8, 6.5, 1.8, dCarry);  // the re-entry, with a white patch left behind it
    Object.assign(dFoam[dFoamNext], { x: dAt.x, z: dAt.z, t: time, s: 0.9 }); dFoamNext = (dFoamNext + 1) % 4;
  }
  sfx.dolphin(it, back);
}
function updateDolphinSpray(dt) {
  if (!dolphinSpray) {
    dolphinSpray = new THREE.Points(dGeo, new THREE.PointsMaterial({ size: 0.9, map: sprayTex, vertexColors: true, transparent: true, depthWrite: false }));
    dolphinSpray.frustumCulled = false; scene.add(dolphinSpray);
  }
  dDrops.forEach((d, i) => {
    if (d.life > 0) { d.life -= dt; d.v.y -= 15 * dt; d.p.addScaledVector(d.v, dt); if (d.p.y < d.floor && d.v.y < 0) d.life = 0; }
    if (d.life <= 0) { dCol[i * 4 + 3] = 0; return; }
    dPos.set([d.p.x, d.p.y, d.p.z], i * 3);
    dCol.set([0.92, 0.97, 1, Math.min(1, d.life / d.max * 1.6) * 0.85], i * 4);
  });
  dGeo.attributes.position.needsUpdate = dGeo.attributes.color.needsUpdate = true;
  waterMat.uniforms.uDolph.value.forEach((v, k) => { const q = dFoam[k]; v.set(q.x, q.z, time - q.t, q.s); });
}

// Gulls, built in the Kenney kit's low-poly style. They flap in bursts and glide in between,
// keeping pace with the ship as they wheel around it, and bank into their turns.
const gullMat = color => new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, side: THREE.DoubleSide });
const GULL = { white: gullMat(0xf4f1ea), grey: gullMat(0x9ba6b0), black: gullMat(0x24272c), beak: gullMat(0xf0b030) };
function panel(len, root, tip, sweep) {  // a flat tapered panel out along +x, leading edge forwards (+z)
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, root / 2, len, 0, sweep + tip / 2, len, 0, sweep - tip / 2, 0, 0, -root / 2], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  return g;
}
const GULL_GEO = { inner: panel(0.42, 0.34, 0.28, -0.04), outer: panel(0.3, 0.28, 0.16, -0.1), tip: panel(0.16, 0.16, 0.02, -0.1),
  tail: panel(0.22, 0.1, 0.22, 0), body: new THREE.SphereGeometry(0.12, 8, 6), head: new THREE.SphereGeometry(0.085, 8, 6), beak: new THREE.ConeGeometry(0.025, 0.12, 5) };
function makeGull() {  // faces +z, about 1.8 across the wings
  const g = new THREE.Group();
  const body = new THREE.Mesh(GULL_GEO.body, GULL.white); body.scale.set(1, 0.9, 3);
  const head = new THREE.Mesh(GULL_GEO.head, GULL.white); head.position.set(0, 0.06, 0.36);
  const beak = new THREE.Mesh(GULL_GEO.beak, GULL.beak); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.05, 0.47);
  const tail = new THREE.Mesh(GULL_GEO.tail, GULL.white); tail.rotation.y = Math.PI / 2; tail.position.z = -0.3;
  g.add(body, head, beak, tail);
  // Each wing is a shoulder, elbow and black wingtip; the left one is the right mirrored
  const wings = [-1, 1].map(sd => {
    const shoulder = new THREE.Group(), elbow = new THREE.Group(), wrist = new THREE.Group();
    shoulder.position.set(sd * 0.08, 0.05, 0.06); shoulder.scale.x = sd;
    elbow.position.set(0.42, 0, -0.04); wrist.position.set(0.3, 0, -0.1);
    shoulder.add(new THREE.Mesh(GULL_GEO.inner, GULL.grey), elbow);
    elbow.add(new THREE.Mesh(GULL_GEO.outer, GULL.grey), wrist);
    wrist.add(new THREE.Mesh(GULL_GEO.tip, GULL.black));
    g.add(shoulder);
    return { sd, shoulder, elbow };
  });
  return { g, wings };
}
const gulls = [];
function addGulls() {
  for (let k = 0; k < 4; k++) {
    const { g, wings } = makeGull();
    g.scale.setScalar(0.85);
    scene.add(g);
    gulls.push({ g, wings, k, ang: k * 1.6, turn: k % 2 ? 1 : -1, ph: k, amt: 0, timer: k * 0.7, flapping: true,
      prev: new THREE.Vector3(), head: new THREE.Vector3(0, 0, 1), vel: new THREE.Vector3(), aim: new THREE.Vector3(), yaw: 0, bank: 0, fresh: true });
  }
}
function flapGull(gl, dt) {
  gl.timer -= dt;
  if (gl.timer < 0) { gl.flapping = !gl.flapping; gl.timer = gl.flapping ? 1 + Math.random() * 1.5 : 1.5 + Math.random() * 3; }
  gl.amt += ((gl.flapping ? 1 : 0) - gl.amt) * (1 - Math.pow(0.02, dt));
  gl.ph += dt * Math.PI * 2 * 2.4;
  // Flapping: the whole wing beats, the outer half trailing; gliding: held in a shallow M
  const up = THREE.MathUtils.lerp(0.1, 0.12 + 0.6 * Math.sin(gl.ph), gl.amt);
  const fold = THREE.MathUtils.lerp(-0.22, 0.35 * Math.sin(gl.ph - 0.8), gl.amt);
  for (const w of gl.wings) { w.shoulder.rotation.z = w.sd * up; w.elbow.rotation.z = fold; }
}
function animateGulls(dt, fwd) {
  for (const gl of gulls) {
    const k = gl.k, p = gl.g.position;
    gl.ang += dt * gl.turn * (0.3 + k * 0.05);
    const rad = 13 + k * 4 + Math.sin(time * 0.11 + k * 1.3) * 5;
    p.copy(ship.position).addScaledVector(fwd, 6 + Math.sin(time * 0.07 + k) * 8);
    p.x += Math.cos(gl.ang) * rad; p.z += Math.sin(gl.ang) * rad;
    p.y = ship.position.y + 13 + k * 2.5 + Math.sin(time * 0.5 + k * 2) * 2;
    // Face the way it is actually flying (the ship's speed plus its own circling)
    gl.vel.subVectors(p, gl.prev); gl.prev.copy(p);
    if (gl.fresh || gl.vel.lengthSq() > 400) { gl.fresh = false; gl.vel.copy(fwd); }  // first frame, or the ship jumped
    if (gl.vel.lengthSq() > 1e-8) gl.head.lerp(gl.vel.normalize(), 1 - Math.pow(0.02, dt)).normalize();
    const yaw = Math.atan2(gl.head.x, gl.head.z), dy = Math.atan2(Math.sin(yaw - gl.yaw), Math.cos(yaw - gl.yaw));
    gl.yaw = yaw;
    gl.bank += (THREE.MathUtils.clamp(-dy / Math.max(dt, 1e-3) * 0.5, -0.8, 0.8) - gl.bank) * (1 - Math.pow(0.1, dt));
    gl.g.lookAt(gl.aim.copy(p).add(gl.head)); gl.g.rotateZ(gl.bank);
    flapGull(gl, dt);
  }
}

// ---- Easter eggs: scenery moments on fixed dates (events_2026.json "eggs"), apart from the news ----
// Each shows only if the voyage reaches its date. No cards: just the scenery and a small line under the date.
let eggs = [];
const eggMat = color => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
const EGG = { grass: eggMat(0x76b04f), grassDark: eggMat(0x4f8a3a), snow: eggMat(0xf3f6fa), fir: eggMat(0x1f4d34), bark: eggMat(0x4a2f18),
  rock: eggMat(0x8a8178), petal: eggMat(0xfff4c2), bloom: eggMat(0xf2c94c), white: eggMat(0xf6f3ee), pink: eggMat(0xe9a3a8), dark: new THREE.MeshBasicMaterial({ color: 0x1a1410 }),
  star: new THREE.MeshBasicMaterial({ color: 0xffd76a }), stem: eggMat(0x4b5a24), coat: eggMat(0x2f7d34), hat: eggMat(0x1e5c26), skin: eggMat(0xf0c4a0),
  beard: eggMat(0xc8601e), black: eggMat(0x1c1a18), gold: new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0x6a4a00, metalness: 0.8, roughness: 0.3, flatShading: true }) };
const BUNNY = [0x9a7b5c, 0xbfa88a, 0x7d6a5a, 0xe9e2d6, 0xa88f72].map(eggMat);
// Painted eggs: pastel bands and dots, made once and kept when the world is cleared
const PAINTED = [["#f6b5c5", "#fff3b0"], ["#a8d8f0", "#ffffff"], ["#c7e6a3", "#f6b5c5"], ["#f9d38c", "#a8d8f0"]].map(([a, b]) => {
  const t = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b;
    g.fillRect(0, 22, w, 8); g.fillRect(0, 40, w, 4);
    for (let x = 4; x < w; x += 12) { g.beginPath(); g.arc(x, 12, 3, 0, Math.PI * 2); g.arc(x + 6, 52, 3, 0, Math.PI * 2); g.fill(); }
  });
  t.userData.keep = true;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
});
function makeRabbit(fur) {  // faces -z, about 1.4 long; "body" is what squashes and stretches as it hops
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), fur); torso.scale.set(0.9, 0.85, 1.25); torso.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), fur); head.position.set(0, 0.85, -0.55);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), EGG.white); tail.position.set(0, 0.55, 0.62);
  body.add(torso, head, tail);
  [-1, 1].forEach(sd => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), fur); ear.scale.set(0.09, 0.36, 0.05); ear.position.set(sd * 0.13, 1.25, -0.48); ear.rotation.set(0.25, 0, sd * 0.18);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), EGG.pink); inner.scale.set(0.05, 0.27, 0.03); inner.position.set(sd * 0.13, 1.25, -0.52); inner.rotation.copy(ear.rotation);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), EGG.dark); eye.position.set(sd * 0.22, 0.92, -0.72);
    body.add(ear, inner, eye);
  });
  return { g, body };
}
function fir(h) {  // three snowy tiers on a stub of trunk
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, h * 0.2, 6), EGG.bark); trunk.position.y = h * 0.1; g.add(trunk);
  for (let k = 0; k < 3; k++) {
    const r = h * (0.36 - k * 0.09), y = h * (0.18 + k * 0.24), th = h * 0.42;
    const tier = new THREE.Mesh(new THREE.ConeGeometry(r, th, 7), EGG.fir); tier.position.y = y + th / 2;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.62, th * 0.42, 7), EGG.snow); cap.position.y = y + th * 0.79;
    g.add(tier, cap);
  }
  return g;
}
// A clear spot for an islet near day d: a side and distance out with no title, lighthouse or creature nearby
function clearSpot(d, r, offs = [34, 46, 28, 58]) {
  const busy = [...markers.map(k => ({ day: k.day, g: k.group, r: k.island ? 30 : 4 })), ...beacons.map(b => ({ day: b.day, g: b.group, r: 12 })),
    ...creatures.map(it => ({ day: it.day, g: it.group, r: 16 }))];
  for (const off of offs) for (const side of [1, -1]) {
    const ok = busy.every(o => {
      if (Math.abs(o.day - d) > 4) return true;
      const f = frame(o.day), lat = tmpEgg.subVectors(o.g.position, f.p).dot(f.right);
      return Math.hypot(lat - side * off, (o.day - d) * DAY) > r + o.r;
    });
    if (ok) return { side, off };
  }
  return { side: 1, off: offs[1] };
}
const tmpEgg = new THREE.Vector3();
function buildEgg(e, forced = false) {
  const it = { e, kind: e.kind, day: e.day + 0.5, note: e.note, forced };
  if (e.kind === "easter" || e.kind === "stpatrick" || e.kind === "christmas") {
    const r = 9, { side, off } = clearSpot(it.day, r + 2), { p, right, fwd } = frame(it.day);
    const g = new THREE.Group(); g.position.copy(p).addScaledVector(right, side * off); g.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    const winter = e.kind === "christmas";
    const shore = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), winter ? EGG.rock : mats.sand); shore.scale.y = 0.16; shore.position.y = -0.7;
    const top = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), winter ? EGG.snow : EGG.grass); top.scale.y = 0.26; top.position.y = -0.5;
    g.add(shore, top, foamRing(r * 1.15)); isle(g, r * 1.12);
    const ground = (x, z) => -0.5 + 0.26 * Math.sqrt(Math.max(0, r * r - x * x - z * z));  // the dome's height at (x, z)
    it.ground = ground; it.r = r; it.side = side; it.group = g; it.isle = true;
    if (e.kind === "easter") {
      // Rabbits hopping about, a few painted eggs in the grass, bushes and flowers
      it.rabbits = [];
      for (let k = 0; k < 6; k++) {
        const { g: rb, body } = makeRabbit(BUNNY[k % BUNNY.length]);
        rb.scale.setScalar(2.1 + (k % 3) * 0.2);
        const a = k * 1.05, d = r * (0.25 + (k % 3) * 0.17), x = Math.cos(a) * d, z = Math.sin(a) * d;
        rb.position.set(x, ground(x, z), z); rb.rotation.y = Math.random() * 6.3; g.add(rb);
        it.rabbits.push({ g: rb, body, from: new THREE.Vector3(x, 0, z), to: new THREE.Vector3(x, 0, z), u: 1, rest: Math.random() * 1.5, hops: 0 });
      }
      for (let k = 0; k < 7; k++) {
        const egg = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 8), PAINTED[k % PAINTED.length]);
        const a = k * 0.9 + 0.4, d = r * (0.3 + (k % 4) * 0.15), x = Math.cos(a) * d, z = Math.sin(a) * d;
        egg.scale.set(1, 1.35, 1); egg.position.set(x, ground(x, z) + 0.7, z); egg.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6); g.add(egg);
      }
      for (let k = 0; k < 4; k++) {
        const a = k * 1.7 + 2.2, d = r * 0.72, x = Math.cos(a) * d, z = Math.sin(a) * d;
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 + (k % 2) * 0.4, 0), EGG.grassDark); bush.scale.y = 0.7; bush.position.set(x, ground(x, z) + 0.4, z); g.add(bush);
      }
      for (let k = 0; k < 18; k++) {
        const a = k * 2.39, d = r * Math.sqrt((k + 0.5) / 18) * 0.85, x = Math.cos(a) * d, z = Math.sin(a) * d;
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), k % 3 ? EGG.petal : EGG.bloom); fl.position.set(x, ground(x, z) + 0.12, z); g.add(fl);
      }
    } else if (e.kind === "stpatrick") {
      // A leprechaun dancing a jig by his pot of gold, a rainbow ending in it, and shamrocks in the grass
      const toCourse = -side, pot = new THREE.Vector3(toCourse * 1.2, 0, -1.5);
      pot.y = ground(pot.x, pot.z);
      const kettle = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.68), EGG.black);
      kettle.position.copy(pot).y += 0.75; g.add(kettle);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 6, 14), EGG.black); rim.rotation.x = Math.PI / 2; rim.position.copy(pot).y += 1.3; g.add(rim);
      for (let k = 0; k < 14; k++) {  // a heap of coins
        const a = k * 2.39, d = 0.75 * Math.sqrt((k + 0.5) / 14), coin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 10), EGG.gold);
        coin.position.set(pot.x + Math.cos(a) * d, pot.y + 1.35 + (1 - d) * 0.35, pot.z + Math.sin(a) * d); coin.rotation.set(Math.random() - 0.5, 0, Math.random() - 0.5); g.add(coin);
      }
      const shine = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffd25a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      shine.position.copy(pot).y += 1.7; shine.scale.setScalar(3.2); shine.userData.ph = 1; g.add(shine);
      it.lanterns = [shine];
      // The rainbow: thin bands from red (outside) to violet, one foot in the pot and the other out to sea beyond the islet
      const R = 17, bands = [0xe8473b, 0xf08a2c, 0xf2d33a, 0x5cbf4a, 0x3f8fd8, 0x5b4fc4, 0x9a52c2];
      bands.forEach((c, k) => {
        const band = new THREE.Mesh(new THREE.TorusGeometry(R - k * 0.42, 0.22, 4, 48, Math.PI),
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.38, depthWrite: false, fog: false }));
        band.position.set(pot.x - toCourse * (R - k * 0.42), pot.y + 1.2, pot.z); g.add(band);
      });
      const lep = makeLeprechaun(); lep.g.scale.setScalar(2.1);
      const at = new THREE.Vector3(toCourse * 3.6, 0, 1.2);
      lep.g.position.set(at.x, ground(at.x, at.z), at.z); lep.g.rotation.y = Math.atan2(toCourse * 0.6, 1); g.add(lep.g);  // faces aft and in: the ship coming up
      it.lep = { ...lep, base: lep.g.position.y };
      for (let k = 0; k < 16; k++) {
        const a = k * 2.39 + 1, d = r * Math.sqrt((k + 0.5) / 16) * 0.8, x = Math.cos(a) * d, z = Math.sin(a) * d;
        const clover = shamrock(); clover.position.set(x, ground(x, z) + 0.05, z); clover.rotation.y = a; g.add(clover);
      }
      for (let k = 0; k < 3; k++) {
        const a = k * 1.9 + 0.6, d = r * 0.7, x = Math.cos(a) * d, z = Math.sin(a) * d;
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), EGG.grassDark); bush.scale.y = 0.7; bush.position.set(x, ground(x, z) + 0.4, z); g.add(bush);
      }
    } else {
      // A ring of snowy firs, the tallest with a star, and lanterns glowing among them
      [[0, 0, 9], [3.4, 2.2, 6.5], [-3.6, 1.6, 6], [1.2, -3.8, 5.5], [-2, -3, 4.8], [5, -1.4, 4.2], [-5.2, -1.2, 4.4]].forEach(([x, z, h]) => {
        const t = fir(h); t.position.set(x, ground(x, z) - 0.2, z); t.rotation.y = x * 1.3; g.add(t);
      });
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), EGG.star); star.scale.y = 1.3; star.position.set(0, ground(0, 0) + 9.3, 0); g.add(star);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffd98a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.copy(star.position); glow.scale.setScalar(4.5); g.add(glow);
      it.star = star; it.lanterns = [glow];
      [[2, 3.6], [-1.8, 3.4], [4, 0.8], [-4.4, 1.2], [0.4, 5.4], [3.4, -3.6], [-3.4, -3.8]].forEach(([x, z], k) => {
        const y = ground(x, z), post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 5), EGG.bark); post.position.set(x, y + 0.8, z);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), new THREE.MeshBasicMaterial({ color: 0xffc46b })); lamp.position.set(x, y + 1.85, z);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.position.copy(lamp.position); halo.scale.setScalar(2.6); halo.userData.ph = k * 1.9;
        g.add(post, lamp, halo); it.lanterns.push(halo);
      });
    }
    world.add(g);
  } else if (e.kind === "valentine") {
    // Just an islet that happens to be heart-shaped, with a palm and some scrub: there for those who look
    const r = 10, { side, off } = clearSpot(it.day, r + 2), { p, right, fwd } = frame(it.day);
    const g = new THREE.Group(); g.position.copy(p).addScaledVector(right, side * off); g.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    const slab = (size, depth, mat, y) => {
      const geo = new THREE.ExtrudeGeometry(HEART, { depth, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2, curveSegments: 18 });
      geo.rotateX(-Math.PI / 2).scale(size, 1, size);  // lying flat, its point aft
      const m = new THREE.Mesh(geo, mat); m.position.y = y; m.rotation.y = -side * Math.PI / 2;  // point towards the course
      return m;
    };
    g.add(slab(r, 1, mats.sand, -0.5), slab(r * 0.8, 1, EGG.grass, -0.25), foamRing(r * 1.2)); isle(g, r * 1.1);
    const tree = model("palm-detailed-bend", 2.4); if (tree) { tree.position.set(side * 2.5, 0.4, -3); g.add(tree); }
    for (let k = 0; k < 3; k++) {
      const x = side * (k - 1) * 3, z = 2 + (k % 2) * 2;
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + (k % 2) * 0.3, 0), EGG.grassDark); bush.scale.y = 0.6; bush.position.set(x, 0.6, z); g.add(bush);
    }
    it.r = r; it.side = side; it.group = g; it.isle = true;
    world.add(g);
  } else if (e.kind === "halloween") {
    // A buoy carrying three jack-o'-lanterns, close to the course; any ghost ship near the day gets green lanterns
    const { side, off } = clearSpot(it.day, 4, [22, 30, 38]), { p, right, fwd } = frame(it.day);
    const g = new THREE.Group(); g.position.copy(p).addScaledVector(right, side * off); g.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    const raft = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.1, 0.8, 10), mats.wood); raft.position.y = 0.1;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.4, 5), mats.wood); pole.position.y = 2.6;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), new THREE.MeshBasicMaterial({ color: 0x9dff7a })); lamp.position.y = 5;
    g.add(raft, pole, lamp, foamRing(3.2, false));
    it.lanterns = [];
    [[-1.3, 0.7, 1.15], [1.35, 0.5, 1], [0.1, -1.4, 0.9]].forEach(([x, z, sc], k) => {
      const pk = makePumpkin(), face = Math.atan2(-side * 0.6, 1) + (k - 1) * 0.3;  // faces aft and in a little: towards the ship coming up
      pk.scale.setScalar(sc); pk.position.set(x, 0.5 + 0.85 * sc, z); pk.rotation.y = face; g.add(pk);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xff9a2e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(pk.position).add(tmpEgg.set(Math.sin(face), 0, Math.cos(face)).multiplyScalar(0.9 * sc)); halo.scale.setScalar(2.6 * sc); halo.userData.ph = k * 2.1; g.add(halo); it.lanterns.push(halo);
    });
    const green = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0x7dff6a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    green.position.copy(lamp.position); green.scale.setScalar(3); green.userData.ph = 5; g.add(green); it.lanterns.push(green);
    it.side = side; it.group = g; it.isle = true; it.bob = true;
    world.add(g);
    for (const c of creatures) if (c.kind === "ghost" && c.body && Math.abs(c.day - it.day) <= 10) ghostLanterns(c, it);
  }
  eggs.push(it);
  return it;
}
// A heart about 2 across, point down (-y), for Valentine's Day
const HEART = new THREE.Shape();
HEART.moveTo(0, -1); HEART.bezierCurveTo(0.45, -0.55, 1.1, -0.15, 1.05, 0.38); HEART.bezierCurveTo(1.0, 0.92, 0.32, 1.05, 0, 0.58);
HEART.bezierCurveTo(-0.32, 1.05, -1.0, 0.92, -1.05, 0.38); HEART.bezierCurveTo(-1.1, -0.15, -0.45, -0.55, 0, -1);
// A leprechaun about 1.7 tall, facing +z: green coat and hat, ginger beard, buckled belt and hat band.
// "body" turns with the dance; legs and arms swing from the hip and shoulder.
function makeLeprechaun() {
  const g = new THREE.Group(), body = new THREE.Group(); body.position.y = 0.55; g.add(body);
  const legs = [-1, 1].map(sd => {
    const hip = new THREE.Group(); hip.position.set(sd * 0.13, 0.55, 0); g.add(hip);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.45, 6), EGG.hat); leg.position.y = -0.23; hip.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), EGG.black); shoe.position.set(0, -0.48, 0.06); hip.add(shoe);
    return hip;
  });
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.6, 10), EGG.coat); coat.position.y = 0.3; body.add(coat);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.09, 10), EGG.black); belt.position.y = 0.16; body.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.03), EGG.gold); buckle.position.set(0, 0.16, 0.31); body.add(buckle);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), EGG.skin); head.position.y = 0.78; body.add(head);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), EGG.beard);
  beard.scale.set(1.05, 1.3, 0.9); beard.position.set(0, 0.76, 0.05); body.add(beard);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), EGG.skin); nose.position.set(0, 0.8, 0.2); body.add(nose);
  for (const sd of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), EGG.dark); eye.position.set(sd * 0.07, 0.86, 0.18); body.add(eye); }
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 14), EGG.hat); brim.position.y = 0.95; body.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.42, 12), EGG.hat); crown.position.y = 1.17; body.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.245, 0.08, 12), EGG.black); band.position.y = 1.02; body.add(band);
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.03), EGG.gold); clasp.position.set(0, 1.02, 0.24); body.add(clasp);
  const arms = [-1, 1].map(sd => {
    const shoulder = new THREE.Group(); shoulder.position.set(sd * 0.27, 0.52, 0); body.add(shoulder);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.42, 6), EGG.coat); arm.position.y = -0.21; shoulder.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), EGG.skin); hand.position.y = -0.44; shoulder.add(hand);
    return shoulder;
  });
  return { g, body, legs, arms };
}
// ---- The captain at the helm: built like the leprechaun, standing on the quarterdeck with both hands on the wheel ----
const CAPN = { coat: eggMat(0x8e2323), trim: EGG.gold, hat: eggMat(0x1b1714), beard: eggMat(0x4a2c18), shirt: eggMat(0xeee6d4), breeches: eggMat(0xd8c9a3), wood: eggMat(0x6b4423), brass: EGG.gold };
const HELM_AT = [0, 4.3, 4.95], CAPN_AT = [0, 3.25, 5.65];  // the wheel's hub and the captain's feet, in the ship's frame (the quarterdeck is at 3.25)
let helm = null;
function makeCaptain() {
  const M = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const g = new THREE.Group(), body = new THREE.Group(); body.position.y = 0.95; g.add(body);
  for (const sd of [-1, 1]) {  // cream breeches into tall black boots
    const hip = new THREE.Group(); hip.position.set(sd * 0.15, 0.95, 0); g.add(hip);
    M(new THREE.CylinderGeometry(0.12, 0.11, 0.5, 7), CAPN.breeches, 0, -0.25, 0, hip);
    M(new THREE.CylinderGeometry(0.13, 0.12, 0.52, 7), EGG.black, 0, -0.68, 0, hip);
    M(new THREE.BoxGeometry(0.2, 0.1, 0.36), EGG.black, 0, -0.9, 0.07, hip);
  }
  // A long red coat with gold trim down the front, round the hem and at the cuffs; a white shirt and a belt with a gold buckle
  const coat = M(new THREE.CylinderGeometry(0.28, 0.42, 1.25, 10), CAPN.coat, 0, 0.1, 0, body);
  M(new THREE.CylinderGeometry(0.425, 0.425, 0.06, 10), CAPN.trim, 0, -0.5, 0, body);
  for (const sd of [-1, 1]) { const t = M(new THREE.BoxGeometry(0.05, 1.22, 0.03), CAPN.trim, sd * 0.07, 0.1, 0.355, body); t.rotation.x = -0.11; }
  M(new THREE.BoxGeometry(0.1, 0.32, 0.04), CAPN.shirt, 0, 0.55, 0.3, body).rotation.x = -0.11;
  M(new THREE.CylinderGeometry(0.335, 0.345, 0.1, 10), EGG.black, 0, 0.12, 0, body);
  M(new THREE.BoxGeometry(0.14, 0.12, 0.03), CAPN.trim, 0, 0.12, 0.35, body);
  const head = new THREE.Group(); head.position.y = 0.78; body.add(head);
  M(new THREE.SphereGeometry(0.21, 10, 8), EGG.skin, 0, 0.17, 0, head);
  const beard = M(new THREE.SphereGeometry(0.21, 10, 8, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44), CAPN.beard, 0, 0.13, 0.04, head); beard.scale.set(1.04, 1.3, 0.95);
  M(new THREE.SphereGeometry(0.05, 6, 4), EGG.skin, 0, 0.19, 0.21, head);
  M(new THREE.SphereGeometry(0.025, 5, 4), EGG.dark, -0.075, 0.25, 0.185, head);
  M(new THREE.BoxGeometry(0.1, 0.08, 0.03), EGG.black, 0.075, 0.25, 0.19, head);  // the eyepatch, on its strap
  M(new THREE.CylinderGeometry(0.214, 0.214, 0.025, 12, 1, true), EGG.black, 0, 0.25, 0, head).rotation.z = 0.35;
  // The tricorn: a three-cornered brim edged in gold, its sides turned up, one corner forward, over a round crown
  M(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 3), CAPN.hat, 0, 0.36, 0, head);
  M(new THREE.CylinderGeometry(0.455, 0.455, 0.025, 3), CAPN.trim, 0, 0.35, 0, head);
  const up = M(new THREE.CylinderGeometry(0.47, 0.43, 0.16, 3, 1, true), CAPN.hat, 0, 0.44, 0, head); up.material = CAPN.hat.clone(); up.material.side = THREE.DoubleSide;
  M(new THREE.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), CAPN.hat, 0, 0.36, 0, head).scale.y = 0.9;
  const arms = [-1, 1].map(sd => {  // aimed at the wheel each frame; the arm's -y runs from the shoulder to the hand
    const shoulder = new THREE.Group(); shoulder.position.set(sd * 0.33, 0.68, 0); body.add(shoulder);
    M(new THREE.CylinderGeometry(0.075, 0.065, 0.6, 6), CAPN.coat, 0, -0.3, 0, shoulder);
    M(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 6), CAPN.trim, 0, -0.57, 0, shoulder);
    M(new THREE.SphereGeometry(0.07, 6, 4), EGG.skin, 0, -0.65, 0, shoulder);
    return shoulder;
  });
  return { g, body, coat, head, arms };
}
// A ship's wheel: eight spokes running out past the rim to handles, on a post down to the deck. It turns about z
function makeWheel() {
  const g = new THREE.Group(), wheel = new THREE.Group(); g.add(wheel);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 6, 24), CAPN.wood));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), CAPN.brass); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2, spoke = new THREE.Group(); spoke.rotation.z = a; wheel.add(spoke);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.72, 5), CAPN.wood); s.position.y = 0.36; spoke.add(s);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.16, 6), CAPN.wood); h.position.y = 0.8; spoke.add(h);
  }
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, HELM_AT[1] - CAPN_AT[1], 0.2), CAPN.wood); post.position.set(0, -(HELM_AT[1] - CAPN_AT[1]) / 2, -0.14); g.add(post);
  return { g, wheel };
}
function rigHelm(m) {
  // Kenney's little wheel is part of the hull mesh, so fold its points away and put one that turns in its place
  ship.updateMatrixWorld(true);
  const toShip = new THREE.Matrix4(), v = new THREE.Vector3(), box = new THREE.Box3(new THREE.Vector3(-0.56, 3.28, 4.68), new THREE.Vector3(0.56, 4.33, 5.12));
  m.traverse(o => {
    if (!o.isMesh || /sail|flag/.test(o.name)) return;
    toShip.copy(ship.matrixWorld).invert().multiply(o.matrixWorld);
    const geo = o.geometry.clone(), p = geo.attributes.position, into = box.getCenter(new THREE.Vector3()).applyMatrix4(toShip.clone().invert());
    let n = 0;
    for (let i = 0; i < p.count; i++) if (box.containsPoint(v.fromBufferAttribute(p, i).applyMatrix4(toShip))) { p.setXYZ(i, into.x, into.y, into.z); n++; }
    if (n) { o.geometry = geo; o.userData.shared = false; }
  });
  const w = makeWheel(), c = makeCaptain();
  w.g.position.set(...HELM_AT); c.g.position.set(...CAPN_AT); c.g.rotation.y = Math.PI;  // facing forward, over the wheel
  ship.add(w.g, c.g);
  helm = { ...c, wheel: w.wheel, turn: 0, glance: 0, look: 0, next: 4 };
}
// Each frame: the wheel follows the bends coming up and the swell, the hands stay on it, and the captain
// breathes, shifts weight and now and then glances round
const AHEAD = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0), GRIP = new THREE.Vector3();
function steer(dt, fwd) {
  if (!helm) return;
  AHEAD.copy(frame(day + 0.4).fwd);
  const bend = Math.atan2(fwd.x * AHEAD.z - fwd.z * AHEAD.x, fwd.dot(AHEAD));
  const goal = THREE.MathUtils.clamp(-bend * 4, -0.5, 0.5) + 0.08 * Math.sin(time * 0.45);
  helm.turn += (goal - helm.turn) * (1 - Math.pow(0.4, dt));
  helm.wheel.rotation.z = helm.turn;
  const { body, coat, head } = helm, b = Math.sin(time * 1.6), sway = Math.sin(time * 0.3);
  coat.scale.set(1 + b * 0.015, 1, 1 + b * 0.015); body.position.set(sway * 0.03, 0.95 + b * 0.006, 0); body.rotation.z = -sway * 0.025 - helm.turn * 0.04;
  if (!reduced && (helm.next -= dt) < 0) {  // a look over one shoulder or out to sea, then back to the course
    helm.look = helm.look ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
    helm.next = helm.look ? 1.5 + Math.random() : 6 + Math.random() * 7;
  }
  helm.glance += (helm.look - helm.glance) * (1 - Math.pow(0.08, dt));
  head.rotation.set(0.12, helm.glance, 0);  // eyes down on the wheel, between glances
  ship.updateMatrixWorld(); helm.g.updateMatrixWorld();
  helm.arms.forEach((sh, k) => {  // each hand to its own handle on the rim, at ten and two
    const a = Math.PI / 2 + (k ? 0.85 : -0.85);  // the first arm is on the captain's right, the ship's starboard
    helm.wheel.localToWorld(GRIP.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.06));
    body.worldToLocal(GRIP).sub(sh.position).normalize();
    sh.quaternion.setFromUnitVectors(DOWN, GRIP);
  });
}
// A shamrock: three round leaves on a short stem, about 0.6 across
const LEAF_GEO = new THREE.SphereGeometry(0.15, 6, 4);
function shamrock() {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const leaf = new THREE.Mesh(LEAF_GEO, EGG.grassDark), a = k * Math.PI * 2 / 3;
    leaf.scale.set(1, 0.3, 1); leaf.position.set(Math.cos(a) * 0.15, 0.18, Math.sin(a) * 0.15); g.add(leaf);
  }
  g.scale.setScalar(1.6);
  return g;
}
// Jack-o'-lanterns: a ribbed orange skin, and a carved face that glows (its emissive map), facing +z
const PUMPKIN_TEX = canvasTexture(256, 128, (g, w, h) => {
  g.fillStyle = "#e07a1f"; g.fillRect(0, 0, w, h); g.strokeStyle = "rgba(120,50,10,0.45)"; g.lineWidth = 4;
  for (let x = 0; x < w; x += 21) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
});
const PUMPKIN_FACE = canvasTexture(256, 128, (g, w, h) => {
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff";
  const cx = w * 0.25;  // u = 0.25 is +z on a sphere
  for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(cx + sd * 9, 52); g.lineTo(cx + sd * 25, 52); g.lineTo(cx + sd * 17, 36); g.fill(); }
  g.beginPath(); g.moveTo(cx - 26, 70); g.lineTo(cx + 26, 70); g.lineTo(cx + 20, 84); g.lineTo(cx + 10, 78); g.lineTo(cx, 86); g.lineTo(cx - 10, 78); g.lineTo(cx - 20, 84); g.fill();
});
PUMPKIN_TEX.userData.keep = PUMPKIN_FACE.userData.keep = true;
const PUMPKIN = new THREE.MeshStandardMaterial({ map: PUMPKIN_TEX, emissive: 0xffb04a, emissiveMap: PUMPKIN_FACE, emissiveIntensity: 2.2, roughness: 0.7 });
function makePumpkin() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), PUMPKIN); body.scale.set(1.15, 0.85, 1.15);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.45, 5), EGG.stem); stem.position.y = 0.95; stem.rotation.z = 0.2;
  g.add(body, stem);
  return g;
}
// Green lanterns hung at a ghost ship's bow, stern and masthead for Halloween
const GHOST_LAMP = new THREE.MeshBasicMaterial({ color: 0xb6ffb0 });
function ghostLanterns(c, egg) {
  c.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(c.body), mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const long = size.z > size.x ? "z" : "x";
  for (const [along, up] of [[-0.42, 0.45], [0.42, 0.45], [0, 0.95]]) {
    const at = mid.clone(); at[long] += along * size[long]; at.y = box.min.y + up * size.y;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0x6dff8a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    c.body.worldToLocal(halo.position.copy(at)); halo.scale.setScalar(7 / c.body.scale.x); halo.userData.ph = along * 7 + up;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), GHOST_LAMP); lamp.position.copy(halo.position); lamp.scale.setScalar(1 / c.body.scale.x);
    c.body.add(halo, lamp); egg.lanterns.push(halo);
  }
}
function buildEggs() {
  eggs = [];
  for (const e of D.eggs || []) if (e.day <= D.lastDay) buildEgg(e);
}

// The Spanish imperial eagle: dark brown, white shoulders, a pale head and a yellow hooked bill; faces +z
// like the gulls, about 3 across the wings before scaling, with fingered primaries
const EAGLE = { brown: gullMat(0x5a3a22), body: gullMat(0x664328), white: gullMat(0xf6f2ea), head: gullMat(0xe6d3a8), beak: gullMat(0xf0c030), tail: gullMat(0x6e6155) };
function makeEagle() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), EAGLE.body); body.scale.set(1, 0.9, 2.8);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), EAGLE.head); head.position.set(0, 0.07, 0.56);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), EAGLE.beak); beak.rotation.x = Math.PI / 2 + 0.35; beak.position.set(0, 0.02, 0.7);
  const tail = new THREE.Mesh(panel(0.36, 0.18, 0.34, 0), EAGLE.tail); tail.rotation.y = Math.PI / 2; tail.position.z = -0.48;
  g.add(body, head, beak, tail);
  const wings = [-1, 1].map(sd => {
    const shoulder = new THREE.Group(), elbow = new THREE.Group(), wrist = new THREE.Group();
    shoulder.position.set(sd * 0.14, 0.06, 0.08); shoulder.scale.x = sd;
    elbow.position.set(0.62, 0, -0.02); wrist.position.set(0.5, 0, -0.06);
    const patch = new THREE.Mesh(panel(0.24, 0.16, 0.1, 0), EAGLE.white); patch.position.set(0, 0.012, 0.16);  // the white shoulder
    shoulder.add(new THREE.Mesh(panel(0.62, 0.5, 0.46, -0.02), EAGLE.brown), patch, elbow);
    elbow.add(new THREE.Mesh(panel(0.5, 0.46, 0.34, -0.06), EAGLE.brown), wrist);
    for (let k = 0; k < 5; k++) {  // splayed primaries
      const f = new THREE.Mesh(panel(0.34 - k * 0.02, 0.08, 0.025, -0.03), EAGLE.brown);
      f.position.set(0, 0, 0.12 - k * 0.07); f.rotation.y = -0.1 + k * 0.16; wrist.add(f);
    }
    g.add(shoulder);
    return { sd, shoulder, elbow, wrist };
  });
  return { g, wings };
}
// The swoop is drawn in the camera's frame when it starts ([right, up, back]), carried along with the ship:
// in high from one side, down across the view side-on just over the sea ahead, then up and away the other side
const SWOOP = [[-46, 18, -62], [-18, 5, -28], [0, 1.4, -16], [16, 2.6, -19], [46, 11, -40]].map(a => new THREE.Vector3(...a));
const swoopCurve = new THREE.CatmullRomCurve3(SWOOP, false, "centripetal");
const SWOOP_SECONDS = 4.6;
let eagle = null, swoop = null;
function launchEagle() {
  if (!eagle) { eagle = makeEagle(); eagle.g.scale.setScalar(2.4); eagle.g.visible = false; scene.add(eagle.g); }
  const flip = (Math.random() < 0.5 ? -1 : 1) * Math.min(1, camera.aspect * 1.3);  // from the left or the right; narrower on a phone
  camera.updateMatrixWorld();
  swoop = { t: 0, flip, basis: new THREE.Matrix4().extractRotation(camera.matrixWorld), from: camera.position.clone(), ship: ship.position.clone(),
    head: new THREE.Vector3(), yaw: null, bank: 0, ph: 0 };
  eagle.g.visible = true;
}
const swoopP = new THREE.Vector3(), swoopT = new THREE.Vector3();
function flyEagle(dt) {
  if (!swoop) return;
  if (!swoop.hold) swoop.t += dt / SWOOP_SECONDS;  // held only by the checks' hook
  if (swoop.t >= 1) { swoop = null; eagle.g.visible = false; return; }
  const u = swoop.t, at = (v, out) => out.set(v.x * swoop.flip, v.y, v.z).applyMatrix4(swoop.basis);
  at(swoopCurve.getPointAt(u, swoopP), swoopP); at(swoopCurve.getTangentAt(u, swoopT), swoopT);
  eagle.g.position.copy(swoop.from).add(swoopP).add(tmpEgg.subVectors(ship.position, swoop.ship));
  const yaw = Math.atan2(swoopT.x, swoopT.z), dy = swoop.yaw === null ? 0 : Math.atan2(Math.sin(yaw - swoop.yaw), Math.cos(yaw - swoop.yaw));
  swoop.yaw = yaw;
  swoop.bank += (THREE.MathUtils.clamp(-dy / Math.max(dt, 1e-3) * 0.5, -0.5, 0.5) - swoop.bank) * (1 - Math.pow(0.05, dt));
  eagle.g.lookAt(tmpEgg.copy(eagle.g.position).add(swoopT)); eagle.g.rotateZ(swoop.bank);
  // Heavy beats coming in, wings half-folded through the dive, then beating away
  const tuck = 0.3 * THREE.MathUtils.smoothstep(u, 0.15, 0.3) * (1 - THREE.MathUtils.smoothstep(u, 0.45, 0.6));
  swoop.ph += dt * Math.PI * 2 * 1.7;
  const up = THREE.MathUtils.lerp(0.1 + 0.55 * Math.sin(swoop.ph), 0.3, tuck), fold = THREE.MathUtils.lerp(0.3 * Math.sin(swoop.ph - 0.9), -0.5, tuck);
  for (const w of eagle.wings) { w.shoulder.rotation.z = w.sd * up; w.shoulder.rotation.y = w.sd * tuck * 0.6; w.elbow.rotation.z = fold; w.wrist.rotation.y = -tuck * 0.5; }
}

// Snow flurries around the camera over Christmas
const SNOW = lite ? 500 : 1100;
const snowPos = new Float32Array(SNOW * 3), flakes = Array.from({ length: SNOW }, () => [Math.random() * 120 - 60, Math.random() * 60, Math.random() * 120 - 60, 2 + Math.random() * 2.5, Math.random() * 6.3]);
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: GLOW_TEX, color: 0xffffff, size: 0.8, transparent: true, opacity: 0, depthWrite: false }));
snow.frustumCulled = false; snow.visible = false; scene.add(snow);
function updateSnow(dt, amt) {
  snow.visible = amt > 0.01; snow.material.opacity = amt * 0.95;
  if (!snow.visible) return;
  for (let i = 0; i < SNOW; i++) {
    const f = flakes[i];
    f[1] -= dt * f[3]; f[0] += Math.sin(time * 0.8 + f[4]) * dt * 1.2 - dt * 1.5;
    if (f[1] < -5) { f[0] = Math.random() * 120 - 60; f[1] = 55; f[2] = Math.random() * 120 - 60; }
    snowPos.set([camera.position.x + f[0], camera.position.y + f[1] - 22, camera.position.z + f[2]], i * 3);
  }
  snowGeo.attributes.position.needsUpdate = true;
}

// Artemis II: a rocket climbing from beyond the horizon on a point of fire, leaving a curving trail of smoke
const TRAIL = 420, ROCKET_SECONDS = 10;
const trailPos = new Float32Array(TRAIL * 3).fill(-1e4), trailCol = new Float32Array(TRAIL * 4);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3)); trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 4));
const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ map: GLOW_TEX, size: 16, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
trail.frustumCulled = false; trail.visible = false; scene.add(trail);
const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
flame.visible = false; scene.add(flame);
const puffs = Array.from({ length: TRAIL }, () => ({ life: 0, max: 1, p: new THREE.Vector3() }));
let rocket = null, puffNext = 0;
function launchRocket() {
  const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();  // out on the horizon wherever the camera looks
  const side = new THREE.Vector3(-f.z, 0, f.x), lean = Math.random() < 0.5 ? -1 : 1;
  rocket = { t: 0, base: camera.position.clone().addScaledVector(f, 640).addScaledVector(side, -lean * 90).setY(-10), side: side.multiplyScalar(lean), emit: 0 };
  trail.visible = flame.visible = true;
}
function flyRocket(dt) {
  if (!trail.visible) return;
  let alive = false;
  puffs.forEach((q, i) => {  // the smoke drifts a little and thins out
    if (q.life > 0) { q.life -= dt; q.p.x += dt * 1.5; q.p.y += dt * 0.6; alive = true; }
    trailPos.set([q.p.x, q.p.y, q.p.z], i * 3);
    const k = Math.max(0, q.life / q.max);
    trailCol.set([0.95, 0.93, 0.9, k * 0.85], i * 4);
  });
  trailGeo.attributes.position.needsUpdate = trailGeo.attributes.color.needsUpdate = true;
  if (rocket) {
    if (!rocket.hold) rocket.t += dt / ROCKET_SECONDS;
    const u = Math.min(1, rocket.t), tip = rocket.base.clone().setY(rocket.base.y + 380 * Math.pow(u, 1.6)).addScaledVector(rocket.side, 120 * u * u);  // up, then over downrange
    flame.position.copy(tip); flame.scale.setScalar(24 + Math.sin(time * 40) * 4); flame.material.opacity = 1 - THREE.MathUtils.smoothstep(u, 0.85, 1);
    for (rocket.emit += dt * 45; rocket.emit > 1; rocket.emit--) {
      const q = puffs[puffNext]; puffNext = (puffNext + 1) % TRAIL;
      q.p.copy(tip).add(tmpEgg.set(Math.random() - 0.5, -2 - Math.random() * 2, Math.random() - 0.5)); q.max = q.life = 7 + Math.random() * 2;
    }
    alive = true;
    if (rocket.t >= 1) { rocket = null; flame.visible = false; }
  }
  if (!alive) trail.visible = false;
}

// The total eclipse of 12 August: the light drains away, the moon covers the sun leaving a ring and its corona,
// then the light comes back. The camera turns to the sun for it.
const ECLIPSE_SECONDS = 8;
const MOON_TEX = canvasTexture(128, 128, (g, w, h) => { g.fillStyle = "#fff"; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); g.fill(); });
const CORONA_TEX = canvasTexture(256, 256, (g, w, h) => {
  const c = w / 2, grd = g.createRadialGradient(c, c, 0, c, c, c);
  grd.addColorStop(0, "rgba(255,255,255,0)"); grd.addColorStop(0.2, "rgba(255,255,255,0)"); grd.addColorStop(0.235, "rgba(255,255,255,1)");
  grd.addColorStop(0.3, "rgba(255,246,225,0.55)"); grd.addColorStop(0.5, "rgba(255,240,215,0.16)"); grd.addColorStop(1, "rgba(255,240,215,0)");
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "lighter";  // faint streamers
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2 + Math.random() * 0.3, len = c * (0.55 + Math.random() * 0.4);
    const lg = g.createLinearGradient(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len);
    lg.addColorStop(0, "rgba(255,245,225,0)"); lg.addColorStop(0.4, "rgba(255,245,225,0.12)"); lg.addColorStop(1, "rgba(255,245,225,0)");
    g.strokeStyle = lg; g.lineWidth = 9; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len); g.stroke();
  }
});
const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: MOON_TEX, color: 0x161b24, transparent: true, depthWrite: false, depthTest: false, fog: false }));
const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: CORONA_TEX, color: 0xfff4dc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
corona.renderOrder = 1; moon.renderOrder = 2;  // the moon over its corona moon.visible = corona.visible = false;
scene.add(corona, moon);
let eclipse = null;
const eclipseAim = new THREE.Vector3();
function launchEclipse() {
  const { fwd, right } = frame(day);  // where the sun is, in the ship's frame, for the shot
  eclipseAim.set(sunDir.dot(fwd), sunDir.dot(right), sunDir.y).multiplyScalar(120);
  eclipse = { t: 0 };
  if (!reduced) setShot("eclipse", ECLIPSE_SECONDS * 0.95);
}
function updateEclipse(dt) {
  moon.visible = corona.visible = !!eclipse;
  if (!eclipse) return;
  if (!eclipse.hold) eclipse.t += dt / ECLIPSE_SECONDS;
  const t = eclipse.t, k = THREE.MathUtils.smoothstep(t, 0.05, 0.38) * (1 - THREE.MathUtils.smoothstep(t, 0.7, 0.95));  // how dark
  // The moon slides over the sun from one side and off the other
  const slide = (THREE.MathUtils.smoothstep(t, 0.6, 1) - 1 + THREE.MathUtils.smoothstep(t, 0, 0.4)) * 130;
  const at = tmpEgg.copy(camera.position).addScaledVector(sunDir, 1500);
  const across = new THREE.Vector3().crossVectors(sunDir, UP).normalize();
  moon.position.copy(at).addScaledVector(across, slide); moon.scale.setScalar(112);
  moon.material.opacity = THREE.MathUtils.smoothstep(t, 0, 0.1) * (1 - THREE.MathUtils.smoothstep(t, 0.9, 1));
  corona.position.copy(at); corona.scale.setScalar(480); corona.material.opacity = THREE.MathUtils.smoothstep(k, 0.8, 1);
  // Dim the light this frame (the frame loop sets it afresh each frame)
  sun.intensity *= 1 - 0.92 * k; hemi.intensity *= 1 - 0.6 * k; renderer.toneMappingExposure *= 1 - 0.3 * k;
  const sk = skyMat.uniforms, wu = waterMat.uniforms;
  sk.uZenith.value.multiplyScalar(1 - 0.72 * k); sk.uHorizon.value.multiplyScalar(1 - 0.5 * k); sk.uSunCol.value.multiplyScalar(1 - 0.97 * k); sk.uCloudCol.value.multiplyScalar(1 - 0.6 * k);
  wu.uSky.value.multiplyScalar(1 - 0.72 * k); wu.uHorizon.value.multiplyScalar(1 - 0.5 * k); wu.uSunCol.value.multiplyScalar(1 - 0.97 * k); wu.uFog.value.multiplyScalar(1 - 0.5 * k);
  wu.uDeep.value.multiplyScalar(1 - 0.4 * k); wu.uShallow.value.multiplyScalar(1 - 0.4 * k); scene.fog.color.multiplyScalar(1 - 0.5 * k);
  if (t >= 1) { eclipse = null; calmUntil = time + 8; }
}
let calmUntil = 0;  // until then the weather changes slowly (after the eclipse)

// New Year's Day: fireworks bursting over the horizon as the voyage sets off
const FW = lite ? 900 : 1600;
const fwPos = new Float32Array(FW * 3).fill(-1e4), fwCol = new Float32Array(FW * 4);
const fwGeo = new THREE.BufferGeometry();
fwGeo.setAttribute("position", new THREE.BufferAttribute(fwPos, 3)); fwGeo.setAttribute("color", new THREE.BufferAttribute(fwCol, 4));
const fireworks = new THREE.Points(fwGeo, new THREE.PointsMaterial({ map: GLOW_TEX, size: 7, vertexColors: true, transparent: true, depthWrite: false, fog: false }));  // not additive: it's daytime, and the colours would wash out
fireworks.frustumCulled = false; fireworks.visible = false; scene.add(fireworks);
const sparks = Array.from({ length: FW }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() }));
const FW_COLOURS = [0xffc21a, 0xff3b3b, 0x2fb8ff, 0x52e04a, 0xff4fd0, 0xff7a1a].map(c => new THREE.Color(c));
let fwBursts = [], fwNext = 0;
function launchFireworks() {
  const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
  const side = new THREE.Vector3(-f.z, 0, f.x);
  fwBursts = Array.from({ length: 11 }, (_, k) => ({ at: k * 0.5 + Math.random() * 0.3, f, side }));
  fireworks.visible = true;
}
const fireworksOn = () => fireworks.visible;
function updateFireworks(dt) {
  if (!fireworks.visible) return;
  for (const b of fwBursts) {
    if ((b.at -= dt) > 0 || b.done) continue;
    b.done = true;
    const centre = camera.position.clone().addScaledVector(b.f, 240 + Math.random() * 60).addScaledVector(b.side, (Math.random() - 0.5) * 240);
    centre.y = 70 + Math.random() * 70;
    const c1 = FW_COLOURS[Math.floor(Math.random() * FW_COLOURS.length)], c2 = FW_COLOURS[Math.floor(Math.random() * FW_COLOURS.length)];
    for (let k = 0; k < 150; k++) {  // a sphere of sparks, two colours
      const q = sparks[fwNext]; fwNext = (fwNext + 1) % FW;
      q.p.copy(centre); q.v.randomDirection().multiplyScalar(34 + Math.random() * 8); q.c.copy(k % 3 ? c1 : c2); q.max = q.life = 1.6 + Math.random() * 0.8;
    }
  }
  fwBursts = fwBursts.filter(b => !b.done);
  let alive = fwBursts.length > 0;
  sparks.forEach((q, i) => {
    if (q.life > 0) { q.life -= dt; q.v.multiplyScalar(Math.pow(0.35, dt)); q.v.y -= 7 * dt; q.p.addScaledVector(q.v, dt); alive = true; }
    fwPos.set([q.p.x, q.p.y, q.p.z], i * 3);
    const k = Math.max(0, q.life / q.max);
    fwCol.set([q.c.r, q.c.g, q.c.b, k > 0 ? Math.min(1, k * 1.6) * (0.75 + 0.25 * Math.sin(time * 30 + i)) : 0], i * 4);
  });
  fwGeo.attributes.position.needsUpdate = fwGeo.attributes.color.needsUpdate = true;
  if (!alive) fireworks.visible = false;
}

// Moments in the sky rather than places on the sea; one at a time, each waiting for a crew's-eye shot to finish
const MOMENT = { eagle: () => launchEagle(), rocket: () => launchRocket(), eclipse: () => launchEclipse() };
let eggDay = null, due = null, momentNote = null, fwFired = false;
function animateEggs(dt, realDt) {
  const held = shot.name === "crew" || crewOut;
  let note = null, snowAmt = 0;
  for (const it of eggs) {
    const dd = day - (it.day - 0.5);
    if (MOMENT[it.kind]) {
      // Once, as the ship sails into the day (not when the timeline jumps over it)
      if (eggDay !== null && Math.abs(day - eggDay) < 1 && eggDay < it.e.day + 0.3 && day >= it.e.day + 0.3) due = { kind: it.kind, until: it.e.day + 8, note: it.note };
      continue;
    }
    if (it.kind === "fireworks") {
      // New Year's Day: as the voyage sets off (and again if it starts over)
      if (playing && day < 1.2 && !fwFired) { fwFired = true; launchFireworks(); }
      if (day > 3) fwFired = false;
      if (fireworksOn()) note = it.note;
      continue;
    }
    const near = Math.abs(dd) < 130;
    it.group.visible = near;
    if (!near) continue;
    if (dd >= 0 && dd < 2.5) note = it.note;  // from the day itself
    const gp = it.group.position;
    gp.y = it.bob ? seaHeight(gp.x, gp.z) - 0.3 : seaHeight(gp.x, gp.z) * 0.3;
    if (it.rabbits && Math.abs(dd) < 25) for (const rb of it.rabbits) {
      // A hop to somewhere nearby on the grass, then a pause to look about
      if (rb.u >= 1) {
        rb.rest -= dt;
        if (rb.rest < 0) {
          rb.from.copy(rb.g.position); rb.u = 0; rb.hops = rb.hops > 0 ? rb.hops - 1 : 1 + Math.floor(Math.random() * 3);
          const a = Math.random() * 6.3, step = 1.4 + Math.random() * 1.4;
          rb.to.set(rb.from.x + Math.cos(a) * step, 0, rb.from.z + Math.sin(a) * step);
          if (Math.hypot(rb.to.x, rb.to.z) > it.r * 0.72) rb.to.set(rb.from.x - Math.cos(a) * step, 0, rb.from.z - Math.sin(a) * step);  // turn back from the beach
          rb.g.rotation.y = Math.atan2(-(rb.to.x - rb.from.x), -(rb.to.z - rb.from.z));
        }
      } else {
        rb.u = Math.min(1, rb.u + dt / 0.42);
        rb.g.position.lerpVectors(rb.from, rb.to, rb.u);
        rb.g.position.y = it.ground(rb.g.position.x, rb.g.position.z) + Math.sin(rb.u * Math.PI) * 1.2;
        rb.body.rotation.x = Math.cos(rb.u * Math.PI) * 0.35;  // nose up leaving, nose down landing
        rb.body.scale.set(1, 1 + Math.sin(rb.u * Math.PI) * 0.15, 1);
        if (rb.u >= 1) { rb.body.rotation.x = 0; rb.body.scale.set(1, 1, 1); rb.rest = rb.hops ? 0.12 : 0.6 + Math.random() * 1.8; }
      }
    }
    if (it.lep && Math.abs(dd) < 25) {
      // A jig: a hop on each beat, legs kicking in turn, arms up and swinging; every few bars a heel click
      const L = it.lep, beat = time * 5.2, click = Math.floor(beat / 8) % 3 === 2 && beat % 8 > 6;
      L.g.position.y = L.base + Math.abs(Math.sin(beat * Math.PI / 2)) * (click ? 0.95 : 0.4);
      L.legs.forEach((leg, k) => { leg.rotation.x = click ? 0 : Math.sin(beat * Math.PI / 2 + k * Math.PI) * 0.6; leg.rotation.z = click ? (k ? 0.45 : -0.45) : 0; });
      L.arms.forEach((arm, k) => { arm.rotation.z = (k ? 1 : -1) * (2.3 + Math.sin(beat * Math.PI / 2 + k) * 0.35); });
      L.body.rotation.y = Math.sin(beat * Math.PI / 4) * 0.3;
    }
    if (it.lanterns) for (const l of it.lanterns) if (l.userData.ph !== undefined) l.material.opacity = 0.75 + 0.25 * Math.sin(time * 7 + l.userData.ph) * Math.sin(time * 3.1 + l.userData.ph * 2);
    if (it.star) {
      it.star.rotation.y = time * 0.6;
      snowAmt = Math.max(snowAmt, THREE.MathUtils.smoothstep(2.5 - Math.abs(dd - 0.5), 0, 1.2));
    }
  }
  eggDay = day;
  // A moment waits for a crew's-eye shot to finish (for up to a week of voyage), then plays
  if (due && day > due.until) due = null;
  if (swoop && shot.name === "crew") { swoop = null; eagle.g.visible = false; }  // a crew's-eye cut ends a swoop already in flight
  if (due && !held && (playing || due.force) && !swoop && !rocket && !eclipse) { momentNote = due.note; MOMENT[due.kind](); due = null; }
  if (swoop || rocket || eclipse) note = momentNote;
  flyEagle(realDt); flyRocket(realDt); updateEclipse(realDt); updateFireworks(realDt);
  updateSnow(dt, snowAmt);
  if (note !== lastEggNote) {
    lastEggNote = note;
    if (note) $("egg_note").textContent = note;
    $("egg_note").classList.toggle("show", !!note);
  }
}
let lastEggNote = null;
// For checks: an egg of this kind just ahead of the ship, whatever the date (the eagle swoops at once)
function forceEgg(kind) {
  const src = (D.eggs || []).find(e => e.kind === kind) || { kind };
  if (MOMENT[kind]) return due = { kind, until: day + 30, note: src.note, force: true };
  if (kind === "fireworks") return launchFireworks();
  return buildEgg({ ...src, day: Math.floor(day) + 1 }, true);
}

// ---- The voyage (one per account) ---------------------------------------------------
let lastCaption = null, lastEvent = null;
function useVoyage(i) {
  voyage = D.voyages[i];
  setWeather(voyage);
  buildWorld(voyage);
  buildCreatures(voyage);
  buildEggs();
  steerPast();  // with every island, buoy and egg islet in place
  drawSpark(voyage);
  $("who_name").textContent = $("intro_name").textContent = voyage.label;
  $("intro_sub").textContent = `${fmtDate(0)} – ${fmtDate(D.lastDay, { day: "numeric", month: "long", year: "numeric" })}`;
  $("intro_text").textContent = `${plural(Math.round(voyage.hours), "hour")} at sea across ${plural(voyage.days, "day")}, ${plural(voyage.marks.length, "port")} of call.`;
  lastCaption = lastEvent = undefined;
  $("caption").classList.remove("show");
}

// ---- Timeline: month ticks, event pips, and the week's viewing faintly behind -----------
function drawSpark(v) {
  // Hours each week, at the week's middle day, scaled to the busiest week; an area from the baseline
  const top = Math.max(1, ...v.weeks.map(w => w[0]));
  const pts = v.weeks.map((w, i) => [Math.min(1000, ((i * 7 + 3.5) / LAST) * 1000), 100 - (w[0] / top) * 100]);
  $("spark").setAttribute("d", `M0,100 L0,${pts[0][1]} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + ` L1000,${pts[pts.length - 1][1]} L1000,100 Z`);
}
const scrub = $("scrub");
scrub.max = D.lastDay + 0.95;
for (let d = 0; d < LAST; d++) if (dayDate(d).getUTCDate() === 1) {
  const s = document.createElement("span"); s.style.left = `${(d / LAST) * 100}%`; s.textContent = fmtDate(d, { month: "short" }); $("ticks").append(s);
}
D.events.forEach(e => {
  const i = document.createElement("i"); i.style.left = `${(e.day / LAST) * 100}%`; i.style.background = `var(--${e.kind})`; i.title = e.headline; $("pips").append(i);
});
$("legend").innerHTML = Object.entries(KIND_NAME).map(([k, n]) => `<span><i style="background:var(--${k})"></i>${n}</span>`).join("");

// ---- Playback ------------------------------------------------------------------------
let day = 0, playing = false, speed = reduced ? 0.5 : 1, finished = false;
const daysPerSecond = LAST / SECONDS;
function setPlaying(on) {
  playing = on;
  $("play").textContent = on ? "❚❚ Pause" : "▶ Sail";
  $("play").setAttribute("aria-pressed", on);
}
// Music: the theme starts with "Set sail" (browsers only allow sound after a tap) and loops
// Music is optional and none ships with Wrapperr: it plays if the server has one (the voyage_music setting, a file
// in config/voyage/), and otherwise the voyage sails with its sound effects only. An export can set VOYAGE_MUSIC.
const MUSIC_URL = window.VOYAGE_MUSIC ?? "audio/music";
const music = MUSIC_URL && (await fetch(MUSIC_URL, { method: "HEAD" }).then(r => r.ok, () => false)) ? new Audio(MUSIC_URL) : null;
if (music) { music.loop = true; music.preload = "auto"; music.volume = 0.8; }
let musicOn = true;
function playMusic() {
  if (!music || !musicOn) return;
  music.play().then(() => { $("sound").hidden = false; }).catch(() => { $("sound").hidden = false; musicOn = false; showSound(); });
}
function showSound() { $("sound").textContent = musicOn ? "♪ Sound on" : "♪ Sound off"; $("sound").setAttribute("aria-pressed", musicOn); }
$("sound").addEventListener("click", () => {
  musicOn = !musicOn; showSound();
  if (musicOn) playMusic(); else music?.pause();
});
let musicHeld = false;
document.addEventListener("visibilitychange", () => {
  if (!music) return;
  if (document.hidden) { musicHeld = !music.paused; music.pause(); }
  else if (musicHeld && musicOn) { musicHeld = false; music.play().catch(() => {}); }
});
addEventListener("pagehide", () => music?.pause());

// ---- Sounds of the sea in the crew's-eye shots ----------------------------------------------------
// Each crew shot gets its own little soundscape under the music (which ducks a little meanwhile), faded in
// and out with the shot. A few are recordings in audio/sfx (see models/CREDITS.md); the rest are made here
// with WebAudio. The guns and thunder sound whenever they happen. Nothing plays before the first tap,
// with the sound switched off, while paused or with the page hidden.
const sfx = (() => {
  let ac = null, out, bus = null, scene = null, noise, owned = [];  // owned: the scene's endless sources, stopped when it ends
  const bufs = {}, log = [], FILES = ["cannon", "splash", "plop", "gulls", "roar", "creaks", "thunder"];
  const note = what => { log.push({ at: +(ac ? ac.currentTime : 0).toFixed(2), day: +day.toFixed(2), what }); if (log.length > 200) log.shift(); };
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC(); out = ac.createGain(); out.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noise.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      FILES.forEach(n => fetch(`audio/sfx/${n}.mp3`).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(b => { bufs[n] = b; }).catch(() => {}));
      $("sound").hidden = false;
    }
    if (ac.state === "suspended" && musicOn && !document.hidden) ac.resume().catch(() => {});
  }
  addEventListener("pointerdown", unlock, true); addEventListener("keydown", unlock, true);
  // The sound switch and a hidden page stop everything
  const hush = () => { if (!ac) return; if (musicOn && !document.hidden) ac.resume().catch(() => {}); else ac.suspend().catch(() => {}); };
  $("sound").addEventListener("click", hush); document.addEventListener("visibilitychange", hush);
  const now = () => ac.currentTime;
  // A gain that swells to v over a and dies away over r: the envelope for every made-up sound
  function env(dest, v, a, r, at = now()) {
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + r);
    g.connect(dest); return g;
  }
  const osc = (type, f, dest, at, len) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at); o.connect(dest); o.start(at); o.stop(at + len); return o; };
  function filt(type, f, q, dest) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; }
  function hiss(dest, at = now(), len = 1e4) { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.loopStart = Math.random(); s.connect(dest); s.start(at, Math.random() * 1.5); s.stop(at + len); if (len > 99) owned.push(s); return s; }
  function play(name, dest, { rate = 1, gain = 1, at = now(), loop = false } = {}) {
    if (!bufs[name]) return null;
    const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = bufs[name]; s.playbackRate.value = rate; s.loop = loop;
    g.gain.value = gain; s.connect(g); g.connect(dest); s.start(at); if (loop) owned.push(s); note(name); return s;
  }
  // A slow LFO onto any AudioParam
  function wobble(param, hz, depth) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = hz; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); owned.push(o); return o; }
  // An echo, for the open sea and the spooky ones
  function echo(dest, time, fb, wet) {
    const inp = ac.createGain(), d = ac.createDelay(2), f = ac.createGain(), w = ac.createGain(), lp = filt("lowpass", 2200, 0.5, f);
    d.delayTime.value = time; f.gain.value = fb; w.gain.value = wet;
    inp.connect(dest); inp.connect(d); d.connect(lp); f.connect(d); d.connect(w); w.connect(dest); return inp;
  }

  // Waves washing along the hull, under every crew shot
  function sea(dest) { const g = ac.createGain(); g.gain.value = 0.1; wobble(g.gain, 0.13, 0.06); hiss(filt("lowpass", 520, 0.4, g)); g.connect(dest); }
  // Each soundscape: set-up once, then a timer that fires its next sound
  const MAKE = {
    // Long low moans that bend up and fall away, with an underwater echo; the splashes come from the breach itself
    whale: d => { const e = echo(d, 0.42, 0.45, 0.5); return () => {
      const at = now(), len = 2.4 + Math.random() * 1.6, f0 = 150 + Math.random() * 90;
      const g = env(filt("lowpass", 900, 0.7, e), 0.28, len * 0.35, len * 0.65, at), o = osc("sine", f0, g, at, len + 0.1), o2 = osc("triangle", f0 * 2.01, env(g, 0.25, 0.3, len), at, len + 0.1);
      [o, o2].forEach((x, k) => { x.frequency.linearRampToValueAtTime(f0 * (k + 1) * (1.6 + Math.random() * 0.6), at + len * 0.45); x.frequency.linearRampToValueAtTime(f0 * (k + 1) * 0.8, at + len); });
      wobble(o.frequency, 5, 4); note("whale song"); return 3.5 + Math.random() * 2.5; }; },
    // Whistles that rise and dip, quick trains of clicks, and the plop of each one diving back in
    winds: d => () => {
      const at = now(), r = Math.random();
      if (r < 0.45) {
        const len = 0.35 + Math.random() * 0.4, f0 = 2600 + Math.random() * 1400, o = osc("sine", f0, env(d, 0.05, 0.05, len), at, len + 0.1);
        o.frequency.exponentialRampToValueAtTime(f0 * 1.7, at + len * 0.6); o.frequency.exponentialRampToValueAtTime(f0 * 1.2, at + len); wobble(o.frequency, 14, 90); note("dolphin whistle");
      } else if (r < 0.75) {
        const hp = filt("highpass", 2400, 0.7, d), n = 10 + Math.floor(Math.random() * 14), gap = 0.012 + Math.random() * 0.02;
        for (let k = 0; k < n; k++) hiss(env(hp, 0.25, 0.001, 0.006, at + k * gap), at + k * gap, 0.02);
        note("dolphin clicks");
      } else play("plop", d, { rate: 0.85 + Math.random() * 0.4, gain: 0.5 });
      return 0.5 + Math.random() * 1.1;
    },
    // A deep rumble under everything with the sea churning over it, bubbles breaking around the tentacles and one long roar
    kraken: d => {
      const g = ac.createGain(); g.gain.value = 0.55; wobble(g.gain, 0.2, 0.2); hiss(filt("lowpass", 90, 0.8, g)); g.connect(d);
      const c = ac.createGain(); c.gain.value = 0.3; wobble(c.gain, 0.35, 0.18); const bp = filt("bandpass", 260, 0.7, c); wobble(bp.frequency, 0.12, 90); hiss(bp); c.connect(d);
      osc("sine", 41, env(d, 0.18, 1.5, 9), now(), 11);
      let roared = false;
      return () => {
        if (!roared) { roared = true; play("roar", d, { rate: 0.8, gain: 0.7, at: now() + 0.8 }); return 1.2; }
        const at = now(), n = 2 + Math.floor(Math.random() * 5);
        for (let k = 0; k < n; k++) {
          const t = at + Math.random() * 0.5, f = 220 + Math.random() * 280, o = osc("sine", f, env(d, 0.08, 0.005, 0.07, t), t, 0.1);
          o.frequency.exponentialRampToValueAtTime(f * 3, t + 0.06);
        }
        note("bubbles"); return 0.4 + Math.random() * 0.8;
      };
    },
    // Water rushing off its coils, and a hiss now and then
    serpent: d => {
      const g = ac.createGain(); g.gain.value = 0.25; wobble(g.gain, 0.3, 0.15); hiss(filt("bandpass", 700, 0.6, g)); g.connect(d);
      return () => { const len = 1 + Math.random(); hiss(env(filt("bandpass", 5200, 1.2, d), 0.12, 0.25, len), now(), len + 0.4); note("hiss"); return 2.4 + Math.random() * 2; };
    },
    // Gulls over the new island, and a glitter of chimes over the chest of gold
    chart: d => { let k = 0; return () => {
      if (k++ % 3 === 0) { play("gulls", d, { rate: 0.95 + Math.random() * 0.12, gain: 0.45 }); return 1.4; }
      const at = now(), scale = [1568, 1760, 2093, 2349, 2637, 3136];
      for (let j = 0; j < 5; j++) { const t = at + j * 0.07 + Math.random() * 0.03; osc("sine", scale[Math.floor(Math.random() * scale.length)], env(d, 0.05, 0.004, 0.9, t), t, 1); }
      note("sparkle"); return 1.6 + Math.random() * 1.4; }; },
    // Just the sea and the guns (the salute sounds by itself)
    line: () => () => 99,
    // Old timbers groaning and a ship's bell tolling in the swell
    wreck: d => { play("creaks", d, { gain: 0.6, loop: true }); return () => { bell(d, 0.22, 494); note("ship's bell"); return 3 + Math.random() * 2; }; },
    // A thin wind with a whistle in it, faint chimes, and creaking for the dead ship
    ghost: d => {
      const e = echo(d, 0.6, 0.55, 0.6);
      [380, 610].forEach((f, k) => { const g = ac.createGain(); g.gain.value = 0.18; wobble(g.gain, 0.17 + k * 0.06, 0.12); const b = filt("bandpass", f, 9, g); wobble(b.frequency, 0.09 + k * 0.05, f * 0.4); hiss(b); g.connect(e); });
      play("creaks", d, { gain: 0.3, loop: true, rate: 0.85 });
      return () => {
        const at = now();
        [1175, 1245, 1661, 1865].sort(() => Math.random() - 0.5).slice(0, 2).forEach((f, j) => osc("sine", f, env(e, 0.04, 0.01, 2.5, at + j * 0.4), at + j * 0.4, 3));
        note("chimes"); return 2.5 + Math.random() * 2;
      };
    },
  };
  // A bell: a strike and a set of out-of-tune partials that ring on and fade at different rates
  function bell(d, v, f, at = now()) {
    const lp = filt("lowpass", 3000, 0.5, d);
    [[0.5, 1, 4], [1, 1, 3], [1.19, 0.5, 2.2], [1.5, 0.35, 1.8], [2, 0.3, 1.4], [2.74, 0.15, 0.9], [3.76, 0.1, 0.6]]
      .forEach(([m, a, r]) => osc("sine", f * m, env(lp, v * a, 0.003, r, at), at, r + 0.1));
  }

  function begin(it) {
    const make = it.mock ? d => it.mock.sfx ? it.mock.sfx(mockApi, it, d) : () => 99 : MAKE[it.kind];
    if (!ac || !make) return;
    end(0.3);
    bus = ac.createGain(); bus.gain.setValueAtTime(0.0001, now()); bus.gain.exponentialRampToValueAtTime(1, now() + 1.2);
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (pan) { pan.pan.value = (it.side || 0) * 0.35; pan.connect(out); bus.connect(pan); } else bus.connect(out);
    sea(bus);
    const next = make(bus);
    scene = { it, bus, next, at: now() + 0.6, held: 1 };
    note(`begin ${it.kind}`);
  }
  // Fade out and let it go; every source the scene made dies with its bus
  function end(fade = 1.5) {
    if (!scene) return;
    const { bus: b } = scene, t = now(), mine = owned; owned = [];
    b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(Math.max(0.0001, b.gain.value), t); b.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => { mine.forEach(s => { try { s.stop(); } catch (e) {} }); b.disconnect(); }, fade * 1000 + 200);
    note(`end ${scene.it.kind}`); scene = null;
  }
  let duck = 1;
  function update(dt) {
    // The music sits back a little through a crew shot
    duck += ((scene ? 0.6 : 1) - duck) * (1 - Math.pow(0.1, dt));
    if (music) music.volume = 0.8 * duck;
    if (!scene || ac.state !== "running") return;
    const held = playing ? 1 : 0;  // paused: the scene fades but keeps its place
    if (held !== scene.held) { scene.held = held; scene.bus.gain.setTargetAtTime(held ? 1 : 0.0001, now(), 0.3); }
    if (held && now() >= scene.at) scene.at = now() + scene.next();
  }
  const live = () => ac && ac.state === "running";
  return {
    unlock, begin, end, update, log,
    // For mock scenes (mockApi.sfx): the same helpers the soundscapes use; only call them once live() is true
    kit: { play, hiss, filt, env, bell, osc, wobble, echo, note, now: () => now(), live: () => live(), get ac() { return ac; }, get out() { return out; }, get bus() { return scene?.bus; } },
    // The whale breaking the surface and landing again, while the crew are watching it
    whale(it, big) {
      if (!live() || scene?.it !== it) return;
      play("splash", scene.bus, { rate: big ? 0.8 : 1.15, gain: big ? 1 : 0.55 });
      if (!big) { hiss(env(filt("bandpass", 900, 0.7, scene.bus), 0.25, 0.08, 1.2), now(), 1.5); note("whale blow"); }
    },
    // A dolphin leaving or re-entering the water, while the crew are watching the pod; no closer than a third of a second apart
    dolphin(it, back) {
      if (!live() || scene?.it !== it || now() < (scene.splashAt || 0)) return;
      scene.splashAt = now() + 0.35;
      play("splash", scene.bus, { rate: (back ? 1.5 : 1.8) + Math.random() * 0.3, gain: back ? 0.22 : 0.12 });
    },
    // The serpent's coils breaking the surface: a wash now and then, and a heavy splash as it surges up or its neck crashes down
    serpent(it, big) {
      if (!live() || scene?.it !== it) return;
      const t = now();
      if (big) {
        if (t < (scene.bigAt || 0)) return; scene.bigAt = t + 1.2;
        play("splash", scene.bus, { rate: 0.7 + Math.random() * 0.1, gain: 0.85 }); hiss(env(filt("bandpass", 650, 0.6, scene.bus), 0.3, 0.12, 1.6, t), t, 2); note("serpent crash");
        return;
      }
      if (t < (scene.splashAt || 0)) return; scene.splashAt = t + 0.5 + Math.random() * 0.4;
      play("splash", scene.bus, { rate: 1.25 + Math.random() * 0.35, gain: 0.16 + Math.random() * 0.1 });
    },
    // A tentacle slapping down onto the water (low, with a thump and a wash after it), or tearing up out of it with water pouring off
    kraken(it, slap, k) {
      if (!live() || scene?.it !== it) return;
      const t = now();
      if (t < (scene.splashAt || 0)) return; scene.splashAt = t + (slap ? 0.3 : 0.5);
      if (slap) {
        play("splash", scene.bus, { rate: 0.62 + Math.random() * 0.15, gain: 0.6 + k * 0.4 });
        const o = osc("sine", 70, env(scene.bus, 0.35 * (0.5 + k), 0.005, 0.45, t), t, 0.5); o.frequency.exponentialRampToValueAtTime(34, t + 0.4);
        hiss(env(filt("lowpass", 900, 0.5, scene.bus), 0.2, 0.05, 1.4, t), t, 1.6); note("kraken slap");
      } else {
        play("splash", scene.bus, { rate: 1.05 + Math.random() * 0.2, gain: 0.25 }); hiss(env(filt("bandpass", 1400, 0.8, scene.bus), 0.08, 0.2, 1.1, t), t, 1.4); note("kraken pour");
      }
    },
    // Something coming up, before its shot: a low rumble and a few bubbles from the water, or a muffled bell from the twin's haze
    stir(it) {
      if (!live()) return;
      const p = ac.createStereoPanner ? ac.createStereoPanner() : out; if (p !== out) { p.pan.value = (it.side || 0) * 0.35; p.connect(out); }
      const at = now();
      if (it.kind === "twin") { bell(filt("lowpass", 900, 0.5, p), 0.07, 523, at); bell(filt("lowpass", 900, 0.5, p), 0.05, 523, at + 1.6); note("bell in the haze"); return; }
      hiss(env(filt("lowpass", 110, 0.9, p), 0.35, 1.2, 2.2, at), at, 3.6); osc("sine", 38, env(p, 0.12, 1.2, 2.2, at), at, 3.6);
      for (let k = 0; k < 7; k++) {
        const t = at + 0.6 + Math.random() * 2.2, f = 180 + Math.random() * 220, o = osc("sine", f, env(p, 0.04, 0.005, 0.07, t), t, 0.1);
        o.frequency.exponentialRampToValueAtTime(f * 3, t + 0.06);
      }
      note(`stir ${it.kind}`);
    },
    // One of the salute's guns
    gun(side) {
      if (!live()) return;
      const p = ac.createStereoPanner ? ac.createStereoPanner() : out; if (p !== out) { p.pan.value = side * 0.4; p.connect(out); }
      play("cannon", p, { rate: 0.92 + Math.random() * 0.12, gain: 0.8 });
    },
    // Thunder rolls in a moment after the flash, the further off the later
    thunder() { if (live()) play("thunder", out, { at: now() + 0.4 + Math.random() * 1.4, rate: 0.85 + Math.random() * 0.25, gain: 0.75 }); },
  };
})();
function start() {
  $("intro").hidden = true; $("end").hidden = true;
  if (day >= D.lastDay + 0.9) { day = 0; finished = false; jump(); }
  setPlaying(true);
  if (day < 0.5 && !reduced) setShot("hero", 4);
}
$("play").addEventListener("click", () => playing ? setPlaying(false) : start());
$("speeds").addEventListener("click", ev => {
  const b = ev.target.closest("button"); if (!b) return;
  speed = +b.dataset.speed;
  $("speeds").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
});
if (reduced) $("speeds").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x.dataset.speed === "0.5"));
let scrubbing = false;  // only while a finger or the mouse is down on it; a click leaves it focused
scrub.addEventListener("pointerdown", () => { scrubbing = true; });
addEventListener("pointerup", () => { scrubbing = false; });
addEventListener("pointercancel", () => { scrubbing = false; });
scrub.addEventListener("input", () => { jump(); day = +scrub.value; finished = false; $("end").hidden = true; $("intro").hidden = true; });
addEventListener("keydown", ev => {
  if (ev.code !== "Space" || ev.target instanceof HTMLSelectElement || ev.target instanceof HTMLButtonElement) return;
  ev.preventDefault(); playing ? setPlaying(false) : start();
});
$("set_sail").addEventListener("click", () => { start(); if (music) { music.currentTime = 0; playMusic(); } });
$("again").addEventListener("click", () => { day = 0; finished = false; start(); if (music) { music.currentTime = 0; playMusic(); } });

// Look around by dragging; it eases back when let go
const look = { yaw: 0, pitch: 0, dragging: false, x: 0, y: 0 };
canvas.addEventListener("pointerdown", ev => { look.dragging = true; look.x = look.x0 = ev.clientX; look.y = look.y0 = ev.clientY; look.t0 = performance.now(); canvas.setPointerCapture(ev.pointerId); });
canvas.addEventListener("pointermove", ev => {
  if (!look.dragging) return;
  look.yaw = Math.max(-2.6, Math.min(2.6, look.yaw - (ev.clientX - look.x) * 0.006));
  look.pitch = Math.max(-0.3, Math.min(0.6, look.pitch + (ev.clientY - look.y) * 0.004));
  look.x = ev.clientX; look.y = ev.clientY;
});
const endDrag = () => look.dragging = false;
// A quick tap on the sea pauses or resumes
canvas.addEventListener("pointerup", ev => {
  endDrag();
  if (performance.now() - look.t0 < 300 && Math.hypot(ev.clientX - look.x0, ev.clientY - look.y0) < 8 && $("intro").hidden && $("end").hidden) playing ? setPlaying(false) : start();
}); canvas.addEventListener("pointercancel", endDrag);

// ---- HUD ------------------------------------------------------------------------------
function updateHud(w) {
  $("date").textContent = fmtDate(day, { weekday: "short", day: "numeric", month: "long" });
  const force = Math.round(w.storm * 10);
  $("sea_state").innerHTML = `This week <b>${w.hours.toLocaleString("en-AU", { maximumFractionDigits: 1 })} h</b> watched · Force ${force}, ${BEAUFORT[force].toLowerCase()}`;
  if (!scrubbing) scrub.value = day;

  // The title the ship is passing
  let best = null;
  for (const k of markers) {
    if (!k.t) continue;
    const dd = Math.abs(k.day - day - 0.6);
    if (dd < (k.island ? 2.4 : 1.2) && (!best || dd < best.dd)) best = { ...k, dd };
  }
  let seen = null;
  for (const it of creatures) { const dd = Math.abs(it.day - day - 0.6); if (dd < 2.2 && !unseen(it) && !(it.mock && !it.mock.card) && (!seen || dd < seen.dd)) seen = { it, dd }; }  // no card for a surprise before its shot
  const crew = shot.name === "crew" && shot.it;
  if (crew) seen = { it: shot.it, dd: 0 };  // through a crew's-eye shot, the card holds its creature
  // Once up, the card stays up and holds the last title until the next one; only its content changes
  const key = seen ? seen.it : best ? best.t : null;
  if (key !== null && key !== lastCaption) {
    lastCaption = key;
    const box = $("caption"), fill = () => showHighlight(seen, best);
    clearTimeout(swapTimer);
    if (!box.classList.contains("show")) { fill(); box.classList.add("show"); box.classList.remove("swap"); }
    else { box.classList.add("swap"); swapTimer = setTimeout(() => { fill(); box.classList.remove("swap"); }, 170); }
  }
  // The news, from just before the day to three days after
  const ev = crew ? null : D.events.find(e => day >= e.day - 0.6 && day <= e.day + 3.2) || null;  // news waits for the shot to end
  if (ev !== lastEvent) {
    lastEvent = ev;
    $("event").classList.toggle("show", !!ev);
    if (ev) {
      const kind = /^[a-z]+$/.test(ev.kind) ? ev.kind : "world";  // from the admin-edited events file: it goes in a style
      $("event_kicker").innerHTML = `<span class="kind" style="background:var(--${kind})"></span>${KIND_NAME[kind] || "News"} · ${fmtDate(ev.day)}`;
      $("event_head").textContent = ev.headline;
      $("event_blurb").textContent = ev.blurb;
    }
  }
}
let swapTimer = 0;
const tier = name => { $("caption").classList.toggle("loud", name === "loud"); $("caption").classList.toggle("feat", name === "cine"); };
function showHighlight(seen, best) {
  {
    if (seen?.it.mock) mockCard(seen.it);
    else if (seen) {
      const c = seen.it.c, t = c.t === null ? null : D.titles[c.t], k = SIGHTING[c.kind];
      tier(tierOf(c));
      $("cap_kicker").textContent = k.kicker;
      $("cap_emblem").hidden = !!t; $("cap_img").hidden = !t;
      if (t) {
        $("cap_img").src = t.poster ? `${D.imageBase}${t.poster}` : "";
        $("cap_img").style.visibility = t.poster ? "" : "hidden";
        $("cap_name").textContent = k.name ? k.name(c) : t.name + (t.type === "movie" && t.year ? ` (${t.year})` : "");  // the twin's card names the viewer
      } else {
        $("cap_emblem").innerHTML = k.emblem(c);
        $("cap_name").textContent = k.name(c);
      }
      $("cap_facts").textContent = k.facts(c);
    } else if (best) {
      const { m, t } = best;
      tier(null); $("cap_emblem").hidden = true; $("cap_img").hidden = false;
      $("cap_kicker").textContent = best.island ? "Landfall" : "Port of call";
      $("cap_img").src = t.poster ? `${D.imageBase}${t.poster}` : "";
      $("cap_img").style.visibility = t.poster ? "" : "hidden";
      $("cap_name").textContent = t.name + (t.type === "movie" && t.year ? ` (${t.year})` : "");
      const unit = t.type === "movie" ? "viewing" : "episode";
      $("cap_facts").textContent = `${m.hours.toLocaleString("en-AU")} h · ${plural(m.plays, unit)} · ` +
        (m.first === m.last ? short(m.first) : `${short(m.first)} – ${short(m.last)}`) +
        (t.type !== "movie" && m.bestDay > 1 ? ` · ${m.bestDay} in a day on ${short(m.bestAt)}` : "");
    }
  }
}

// A mock's card: { kicker, title, facts, poster?, emblem? }, each a string or (it) => string; a poster (a URL or img/...)
// takes the place of the emblem
function mockCard(it) {
  const k = it.mock.card, v = x => typeof x === "function" ? x(it) : x ?? "";
  tier(tierOf(it.c));
  $("cap_kicker").textContent = v(k.kicker);
  $("cap_emblem").hidden = !!k.poster; $("cap_img").hidden = !k.poster;
  if (k.poster) { $("cap_img").src = v(k.poster); $("cap_img").style.visibility = ""; }
  else $("cap_emblem").innerHTML = v(k.emblem) || "&#9875;&#xFE0E;";
  $("cap_name").textContent = v(k.title);
  $("cap_facts").textContent = v(k.facts);
}
function sightingsText(cs) {
  const names = { kraken: ["kraken", "krakens"], serpent: ["sea serpent", "sea serpents"], whale: ["leviathan", "leviathans"], chart: ["island charted first", "islands charted first"],
    line: ["line crossed", "lines crossed"], winds: ["pod of dolphins", "pods of dolphins"], twin: ["viewing twin", "viewing twins"], wreck: ["wreck", "wrecks"], ghost: ["ghost ship", "ghost ships"] };
  const n = {};
  for (const c of cs) n[c.kind] = (n[c.kind] || 0) + 1;
  return Object.keys(names).filter(k => n[k]).map(k => `${n[k]} ${names[k][n[k] > 1 ? 1 : 0]}`).join(", ");
}
function showLog() {
  const v = voyage, name = m => D.titles[m.t].name;
  const wk = v.weeks.map((w, i) => [w[0], i]).sort((a, b) => b[0] - a[0])[0];
  const shows = v.marks.filter(m => D.titles[m.t].type !== "movie"), film = v.marks.find(m => D.titles[m.t].type === "movie");
  const binge = [...shows].sort((a, b) => b.bestDay - a.bestDay)[0], twin = v.creatures.find(c => c.kind === "twin");
  const rows = [
    ["Hours at sea", `${Math.round(v.hours).toLocaleString("en-AU")} hours over ${plural(v.days, "day")}`],
    shows[0] && ["Flagship show", `${name(shows[0])}, ${shows[0].hours.toLocaleString("en-AU")} h`],
    film && ["Top film", `${name(film)}, ${film.hours.toLocaleString("en-AU")} h`],
    ["Stormiest week", `week of ${short(wk[1] * 7)}, ${wk[0].toLocaleString("en-AU")} h`],
    binge && ["Longest binge", `${binge.bestDay} episodes of ${name(binge)} on ${short(binge.bestAt)}`],
    ["Ports of call", `${plural(v.marks.length, "title")} along the route`],
    twin && ["Viewing twin", `${twin.user}, ${plural(twin.n, "title")} in common`],
    v.creatures.length && ["Sightings", sightingsText(v.creatures)],
  ].filter(Boolean);
  const em = mockOn?.m.endScreen?.(mockApi, rows), out = em?.rows ?? rows;  // mock mode: the end screen's own title and rows
  $("end_title").textContent = em?.title ?? `${v.label}'s 2026`;
  $("log").innerHTML = out.map(() => "<dt></dt><dd></dd>").join("");
  $("log").querySelectorAll("dt").forEach((dt, i) => dt.textContent = out[i][0]);
  $("log").querySelectorAll("dd").forEach((dd, i) => dd.textContent = out[i][1]);
  $("end").hidden = false;
}

// ---- The wake: drawn by the water shader from the course just sailed (see uPath) -------------
let wakeSpeed = 0;  // eases towards how fast she is actually sailing, so the wake settles when she stops
function updateWake(realDt, night, sailing, fwd) {
  wakeSpeed += (sailing - wakeSpeed) * (1 - Math.exp(-realDt / 1.5));
  const u = waterMat.uniforms, bowDay = day + 8.6 / DAY;  // the stem is about 8.6 units ahead of the ship's middle
  let s = 0, last = null;
  for (let i = 0; i < WAKE_N; i++) {
    const c = course(bowDay - i * WAKE_STEP);
    if (last) s += Math.hypot(c.x - last.x, c.z - last.z);
    u.uPath.value[i].set(c.x, c.z, s, 0);
    last = c;
  }
  const p = course(day);
  u.uShip.value.set(p.x, p.z, fwd.x, fwd.z);
  u.uWake.value.set(wakeSpeed, 0.95 - night * 0.3, 0, 0);
}

// ---- Bow spray: a steady spray while sailing, and bursts when the bow slams into a wave -------
const SPRAY = lite ? 160 : 320;
const sprayPos = new Float32Array(SPRAY * 3).fill(-1e4), sprayCol = new Float32Array(SPRAY * 4);
const sprayGeo = new THREE.BufferGeometry();
sprayGeo.setAttribute("position", new THREE.BufferAttribute(sprayPos, 3));
sprayGeo.setAttribute("color", new THREE.BufferAttribute(sprayCol, 4));
const sprayTex = canvasTexture(64, 64, (g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.5, "rgba(255,255,255,0.5)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
});
const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ size: 0.9, map: sprayTex, vertexColors: true, transparent: true, depthWrite: false }));
spray.frustumCulled = false;
scene.add(spray);
const drops2 = Array.from({ length: SPRAY }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), p: new THREE.Vector3() }));
let sprayNext = 0, sprayDue = 0, lastBow = null;
function emitSpray(n, at, fwd, right, storm, shipSpeed) {
  for (let k = 0; k < n; k++) {
    const d = drops2[sprayNext]; sprayNext = (sprayNext + 1) % SPRAY;
    const sgn = Math.random() < 0.5 ? -1 : 1, power = 1 + storm * 1.2;
    d.p.copy(at).addScaledVector(right, sgn * (0.6 + Math.random() * 1.2));
    d.v.copy(right).multiplyScalar(sgn * (2 + Math.random() * 4) * power).addScaledVector(fwd, shipSpeed * (0.5 + Math.random() * 0.3));
    d.v.y = (2.5 + Math.random() * 4.5) * power;
    d.max = d.life = 0.6 + Math.random() * 0.7;
  }
}
function updateSpray(dt, bowAt, fwd, right, storm) {
  const shipSpeed = playing ? daysPerSecond * speed * DAY : 0;
  if (playing) {
    sprayDue += dt * (8 + storm * 80) * wakeSpeed;  // less while she slows to pass a creature
    const n = Math.floor(sprayDue); sprayDue -= n;
    if (n) emitSpray(n, bowAt, fwd, right, storm, shipSpeed);
    if (lastBow !== null && (bowAt.y - lastBow) / Math.max(dt, 1e-3) < -2.2 && storm > 0.25) emitSpray(Math.round(14 + storm * 30), bowAt, fwd, right, storm, shipSpeed);
  }
  lastBow = bowAt.y;
  drops2.forEach((d, i) => {
    if (d.life <= 0) { sprayCol[i * 4 + 3] = 0; return; }
    d.life -= dt; d.v.y -= 16 * dt; d.p.addScaledVector(d.v, dt);
    sprayPos.set([d.p.x, d.p.y, d.p.z], i * 3);
    sprayCol.set([1, 1, 1, Math.max(0, d.life / d.max) * 0.85], i * 4);
  });
  sprayGeo.attributes.position.needsUpdate = sprayGeo.attributes.color.needsUpdate = true;
}
function clearSpray() { drops2.forEach(d => { d.life = 0; }); wDrops.forEach(d => { d.life = 0; }); CHURN.forEach(q => { q.s = 0; }); lastBow = null; }

// ---- The director: which shot the camera holds ----------------------------------------------
// Shots are [camera, target] offsets in the ship's frame: [ahead, to starboard, up]. A side shot's
// "s" is the side the subject is on (+1 starboard), and the camera goes to the other side.
const SHOTS = {
  chase: tall => tall ? [[-50, 12, 24], [60, 0, 2]] : [[-28, 13, 10], [26, -2, 5]],
  hero: tall => tall ? [[46, 10, 12], [-6, 0, 6]] : [[30, 10, 5], [-4, 0, 6]],
  side: (tall, s) => tall ? [[-8, -s * 44, 14], [10, s * 22, 4]] : [[-2, -s * 30, 7], [8, s * 22, 4]],
  low: tall => tall ? [[-34, 10, 3], [30, 0, 7]] : [[-18, 8, 2.2], [24, 0, 7]],
  // ahead and across from a creature, looking back past the ship at it
  crew: tall => SHOTS.chase(tall),  // the camera is placed on deck instead; this keeps the chase shot ready to cut back to
  // behind the ship, looking up towards the sun for the eclipse
  eclipse: tall => [tall ? [-36, 8, 12] : [-24, 10, 6], eclipseAim.toArray()],
};
let shot = { name: "chase", until: 0, s: 1 }, featured = new Set(), lastSpecial = -99, lastMonth = null, jumped = true;
let sailed = 0, slowmo = 1;  // seconds spent sailing (the director's clock), and the slow-motion factor
// Crew's eye: as each creature appears, cut to a sailor at the rail and slow the world down
const CREW = [1.6, 5.6, 9.4];  // a sailor on the quarterdeck, by the guns: [out to the creature's side, eye height, aft], in the ship's frame
const CREW_BOW = [0.8, 4.4, -8.5];  // for a ship crossing ahead: a sailor up at the bow, clear of our own sails
const crewAt = it => it?.mock?.crew ?? (it?.kind === "twin" ? CREW_BOW : CREW);
const crewEye = new THREE.Vector3(), crewLook = new THREE.Vector3(), shipUp = new THREE.Vector3();
function crewShot(it) {
  setShot("crew", 7.5, it.side); shot.it = it; it.seen = true; jumped = true; crewOut = null;
  if (it.kind === "whale") it.phase = 8.7 - (time % 9);  // breach just after the cut
  it.mock?.onShot?.(mockApi, it);
  $("letterbox").classList.add("on"); document.body.classList.add("cine");
  sfx.begin(it);
}
// Leaving the shot, the camera cranes up and back from the deck to the chase position rather than
// cutting, so the light on the creature and the sea turns gradually as the view swings towards the sun
let crewOut = null;
function endCrew(glide = true) {
  if (shot.name !== "crew") return;
  crewOut = glide ? { t: 0, s: shot.s, it: shot.it, up: camera.up.clone() } : null;
  if (!glide) camera.up.set(0, 1, 0);
  jumped = true; $("letterbox").classList.remove("on"); document.body.classList.remove("cine");
  sfx.end(glide ? 1.8 : 0.4);
  setShot("chase");
}
// Lens flare: a warm glow on the sun and a line of ghosts across the lens
const flareTex = stops => canvasTexture(128, 128, (g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  stops.forEach(([at, c]) => grd.addColorStop(at, c)); g.fillStyle = grd; g.fillRect(0, 0, w, h);
});
const FLARE_GLOW = flareTex([[0, "rgba(255,255,255,1)"], [0.12, "rgba(255,244,214,0.75)"], [0.4, "rgba(255,214,150,0.18)"], [1, "rgba(255,200,120,0)"]]);
const FLARE_DISC = flareTex([[0, "rgba(255,255,255,0.22)"], [0.75, "rgba(255,255,255,0.14)"], [1, "rgba(255,255,255,0)"]]);
const FLARE_RING = flareTex([[0, "rgba(255,255,255,0)"], [0.72, "rgba(255,255,255,0)"], [0.86, "rgba(255,255,255,0.3)"], [1, "rgba(255,255,255,0)"]]);
const lensflare = new Lensflare();
const flareEls = [[FLARE_GLOW, 560, 0, 0xffe2b0], [FLARE_DISC, 60, 0.5, 0x9fd8ff], [FLARE_RING, 150, 0.65, 0xffd28a],
  [FLARE_DISC, 110, 0.82, 0xb8f5d0], [FLARE_DISC, 46, 1, 0xffc2a0], [FLARE_RING, 240, 1.25, 0xa8c8ff]]
  .map(([t, size, at, c]) => { const e = new LensflareElement(t, size, at, new THREE.Color(c)); e.base = new THREE.Color(c); lensflare.addElement(e); return e; });
lensflare.visible = false;
scene.add(lensflare);
let flareAmt = 0;
// The line's own shot, in the islets' frame: ahead of them on the crew's side, low, framing the gap
function lineView(it, tall, eye, at) {
  it.group.updateMatrixWorld();
  const k = THREE.MathUtils.smoothstep(day - it.day, -1.7, 0.4);  // easing in as the ship comes through
  it.group.localToWorld(eye.set(it.side * (tall ? 2 : 8), 3.2, -(tall ? 76 - 14 * k : 62 - 16 * k)));
  eye.y = Math.max(eye.y, seaHeight(eye.x, eye.z) + 2);
  it.group.localToWorld(at.set(tall ? 0 : it.side * 2, tall ? 11 : 13, 0));
}
function subject(it, out) {  // where the sailor looks
  const o = it.head || it.serpent?.head || it.body;
  if (o) o.getWorldPosition(out); else out.copy(it.group.position);
  if (it.kind === "whale" || it.kind === "ghost") out.y += 2;
  out.y = Math.max(out.y, it.group.position.y + 2);  // never stare into the water after something that has dived
  if (it.kind === "winds") out.y -= 3;  // the pod is close and low: look down at it, clear of the rail
  if (it.mock?.look) out.y += it.mock.look;
  return out;
}
let peek = null;
const camLocal = new THREE.Vector3(), tgtLocal = new THREE.Vector3(), goalCam = new THREE.Vector3(), goalTgt = new THREE.Vector3();
function setShot(name, seconds = 0, s = 1) {
  shot = { name, until: sailed + seconds, s };
  if (name !== "chase") lastSpecial = sailed + seconds;
}
function direct(w) {
  if (reduced) { shot.name = "chase"; return; }
  if (!playing) return;
  // A creature coming up gets the crew's-eye shot
  // Highlighted-only ones (later wrecks and ghost ships) are sailed past with just their card
  const c = creatures.find(it => !featured.has(it) && tierOf(it.c) === "cine" && it.day - day > 0.2 && it.day - day < 1.6);
  if (sailed < shot.until && !(c && unseen(c) && ["hero", "side", "low"].includes(shot.name))) return;  // a hidden surprise cuts in, or it would be sailed past unseen
  endCrew();
  if (c) { featured.add(c); return crewShot(c); }
  // A new month: turn to face the ship as it sails into it
  const m = dayDate(day).getUTCMonth();
  if (lastMonth !== null && m !== lastMonth) { lastMonth = m; return setShot("hero", 3.5); }
  lastMonth = m;
  if (sailed - lastSpecial < 8) return setShot("chase");
  if (w.storm > 0.8) return setShot("low", 4.5);  // down among the waves in a gale
  const isl = markers.find(k => k.island && !featured.has(k) && k.day - day > 0.3 && k.day - day < 1.2);
  if (isl) { featured.add(isl); return setShot("side", 4, isl.side); }
  setShot("chase");
}
function jump() { endCrew(false); crewOut = null; camera.up.set(0, 1, 0); jumped = true; featured.clear(); creatures.forEach(it => { it.seen = it.stirred = false; it.prevCycle = it.u = it.riseNow = it.emerge = it.stir = it.surged = undefined; }); lastMonth = null; setShot("chase"); clearSpray(); wakeSpeed = playing ? 1 : 0; }

// ---- Frame loop ----------------------------------------------------------------------
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(), sunDir = new THREE.Vector3();
const cols = Object.fromEntries(Object.keys(P.fair).map(k => [k, new THREE.Color()]));
let clock = performance.now() / 1000, time = 0, flash = 0, firstFrame = true;
const wSmooth = { storm: 0, night: 0 };

// ---- Forked lightning in the stormiest weeks: a jagged bolt with branches, out on the horizon ----
const boltCore = new THREE.MeshBasicMaterial({ color: 0xf4f7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
const boltGlow = new THREE.MeshBasicMaterial({ color: 0x8fa8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
const bolts = [new THREE.Mesh(new THREE.BufferGeometry(), boltGlow), new THREE.Mesh(new THREE.BufferGeometry(), boltCore)];
bolts.forEach(b => { b.frustumCulled = false; b.visible = false; scene.add(b); });
let boltLife = 0;
function strike() {
  sfx.thunder();
  const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
  f.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.1);  // somewhere in view
  const side = new THREE.Vector3(-f.z, 0, f.x);  // ribbons run across the view, so they face the camera
  const base = camera.position.clone().addScaledVector(f, 240 + Math.random() * 220); base.y = 0;
  const top = base.clone().addScaledVector(side, (Math.random() - 0.5) * 90); top.y = 230 + Math.random() * 60;
  const segs = [];  // [from, to, width]
  const fork = (from, dir, len, width, depth) => {
    let a = from.clone(); const n = Math.max(3, Math.round(len / 11));
    for (let i = 0; i < n; i++) {
      const b = a.clone().addScaledVector(dir, len / n).addScaledVector(side, (Math.random() - 0.5) * 13);
      b.y += (Math.random() - 0.5) * 4;
      segs.push([a, b, width * (1 - 0.5 * i / n)]);
      if (depth < 2 && Math.random() < 0.22) {
        const d = dir.clone().addScaledVector(side, (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7)).normalize();
        fork(b, d, len * (0.2 + Math.random() * 0.25), width * 0.5, depth + 1);
      }
      a = b;
    }
  };
  const down = base.clone().sub(top), len = down.length();
  fork(top, down.normalize(), len, 0.9, 0);
  bolts.forEach((m, k) => {
    const pos = [], grow = k ? 1 : 4;
    for (const [a, b, w0] of segs) {
      const w = w0 * grow, ax = side.x * w, az = side.z * w;
      pos.push(a.x - ax, a.y, a.z - az, a.x + ax, a.y, a.z + az, b.x + ax, b.y, b.z + az,
               a.x - ax, a.y, a.z - az, b.x + ax, b.y, b.z + az, b.x - ax, b.y, b.z - az);
    }
    m.geometry.dispose();
    m.geometry = new THREE.BufferGeometry(); m.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    m.visible = true;
  });
  boltLife = 1;
}
function updateBolt(dt) {
  if (boltLife <= 0) return;
  boltLife -= dt * 2.6;
  const on = boltLife > 0 ? Math.min(1, boltLife * 1.6) * (0.65 + 0.35 * Math.sin(boltLife * 38)) : 0;  // flickers as it fades
  boltCore.opacity = on; boltGlow.opacity = on * 0.35;
  if (boltLife <= 0) bolts.forEach(b => { b.visible = false; });
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 72 : 55; camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
// Captions sit just above the controls, however tall they wrap
new ResizeObserver(([e]) => document.documentElement.style.setProperty("--controls-h", `${e.target.offsetHeight}px`)).observe($("controls"));

// Adaptive resolution: while sailing, drop the pixel ratio if frames are slow
const perf = { frames: 0, since: 0 };
function adapt(now) {
  if (!playing || document.hidden) { perf.frames = 0; perf.since = now; return; }
  perf.frames++;
  if (now - perf.since < 2) return;
  const fps = perf.frames / (now - perf.since);
  perf.frames = 0; perf.since = now;
  if (fps < 30 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio * 0.8); renderer.setPixelRatio(pixelRatio); resize(); }
}
function tick() {
  const now = performance.now() / 1000, realDt = Math.min(0.05, now - clock); clock = now;
  if (playing) sailed += realDt;
  slowmo += ((shot.name === "crew" ? 0.4 : 1) - slowmo) * (1 - Math.pow(0.02, realDt));
  const dt = realDt * slowmo; time += dt;
  sfx.update(realDt);
  adapt(now);
  if (Math.abs(day - lazyAt) > 2) { lazyAt = day; loadNearby(day); }
  let sailing = 0;  // how fast she is going, for the wake (1 = full sail at 1x)
  if (playing) {
    // Slow down while passing a creature, so there is time to see it
    let slow = 1;
    for (const it of creatures) if (tierOf(it.c) === "cine") slow = Math.min(slow, 0.35 + 0.65 * THREE.MathUtils.smoothstep(Math.abs(it.day - day - 0.3), 0.3, 1.6));
    day += dt * speed * daysPerSecond * (reduced ? 1 : slow);
    sailing = Math.min(1.3, speed * (reduced ? 1 : slow));
    if (day >= D.lastDay + 0.95) { day = D.lastDay + 0.95; setPlaying(false); if (!finished) { finished = true; showLog(); } }
  }
  const wt = weather(day);
  if (jumped || firstFrame) { wSmooth.storm = wt.storm; wSmooth.night = wt.night; }
  else {
    // Held through the eclipse (the sun and sky stay put while the camera looks up at them), and slow to change during
    // and just after a crew's-eye shot or the eclipse, so a sharp change of week doesn't swing the sun as the camera pans back
    const k = eclipse ? 0 : 1 - Math.exp(-realDt / (shot.name === "crew" || crewOut || time < calmUntil ? 5 : 0.6));
    wSmooth.storm += (wt.storm - wSmooth.storm) * k; wSmooth.night += (wt.night - wSmooth.night) * k;
  }
  const w = { ...wt, storm: wSmooth.storm, night: wSmooth.night };
  const night = Math.min(1, Math.max(0, (w.night - 0.15) * 2.2)) * 0.85;
  sea.amp = 0.35 + w.storm * 1.9; sea.steep = 0.25 + w.storm * 0.55; sea.time = time;

  nearIsles(camera.position);  // the islands calming the sea, before anything rides it
  // The ship on the course, riding the swell
  const { p, fwd, right } = frame(day);
  const bow = p.clone().addScaledVector(fwd, 7), stern = p.clone().addScaledVector(fwd, -7);
  const port = p.clone().addScaledVector(right, -2.5), star = p.clone().addScaledVector(right, 2.5);
  const hb = seaHeight(bow.x, bow.z), hs = seaHeight(stern.x, stern.z), hp = seaHeight(port.x, port.z), hst = seaHeight(star.x, star.z);
  ship.position.set(p.x, (hb + hs + hp + hst) / 4 - 0.4, p.z);
  ship.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
  ship.rotateX(Math.atan2(hb - hs, 14) * 0.9);
  ship.rotateZ(Math.atan2(hp - hst, 5) * 0.8);
  if (ship.userData.flag) {
    ship.userData.flag.rotation.y = FLAG + Math.sin(time * (2 + w.storm * 6)) * (0.15 + w.storm * 0.3);
    ship.userData.lantern.material.color.setHex(night > 0.3 ? 0xffc46b : 0x8a6a3a);
  } else {  // the Kenney galleon: sails breathe with the wind, flags flutter
    ship.userData.sails.forEach((o, k) => { o.scale.z = 1 + 0.06 * Math.sin(time * (1.2 + w.storm * 2) + k) + w.storm * 0.12; });
    ship.userData.flags.forEach((o, k) => { o.rotation.y = Math.sin(time * (3 + w.storm * 6) + k * 1.3) * (0.18 + w.storm * 0.3); });
  }
  steer(dt, fwd);

  // The director picks a shot; the camera glides to it in the ship's own frame, so it never cuts
  // through the ship. Dragging turns the whole shot around the ship and eases back when let go.
  direct(w);
  if (!look.dragging) { look.yaw *= Math.pow(0.3, realDt); look.pitch *= Math.pow(0.3, realDt); }
  const tall = camera.aspect < 1;  // portrait: higher and looking further ahead, so the ship does not hide the route
  const [gc, gt] = SHOTS[shot.name](tall, shot.s);
  goalCam.set(...gc); goalTgt.set(...gt);
  goalCam.z += w.storm * 3 + look.pitch * 20;  // .z is "up" in [ahead, starboard, up]
  if (jumped || firstFrame) { camLocal.copy(goalCam); tgtLocal.copy(goalTgt); }
  else {
    const k = 1 - Math.pow(0.3, realDt); camLocal.lerp(goalCam, k); tgtLocal.lerp(goalTgt, k);
    const flat = Math.hypot(camLocal.x, camLocal.y);  // gliding between shots, keep clear of the rigging
    if (flat < 24) { camLocal.x *= 24 / Math.max(flat, 0.01); camLocal.y *= 24 / Math.max(flat, 0.01); }
  }
  const cut = jumped;
  jumped = firstFrame = false;
  const cy = Math.cos(look.yaw), sy = Math.sin(look.yaw);
  const toWorld = (l, out) => {  // [ahead, starboard, up], turned by the drag
    const a = l.x * cy + l.y * sy, b = -l.x * sy + l.y * cy;
    return out.copy(ship.position).addScaledVector(fwd, a).addScaledVector(right, b).setY(ship.position.y + l.z);
  };
  toWorld(camLocal, camPos);
  camPos.y = Math.max(camPos.y, seaHeight(camPos.x, camPos.z) + 2) + (reduced ? 0 : Math.sin(time * 0.7) * 0.4 * (1 + w.storm));
  camera.position.copy(camPos);
  toWorld(tgtLocal, camTarget);
  if (shot.name === "crew" && shot.it?.kind === "line") {
    // Crossing the line: low on the water ahead of the islets, looking back as the ship sails between them
    lineView(shot.it, tall, crewEye, camTarget);
    camera.position.copy(crewEye); camera.up.set(0, 1, 0);
    crewLook.copy(camTarget).sub(crewEye).applyAxisAngle(camera.up, look.yaw).add(crewEye); camTarget.copy(crewLook);
    camTarget.y += look.pitch * 20;
  } else if (shot.name === "crew" && shot.it) {
    // On deck at the rail, rocking with the ship, eyes on the creature (dragging still looks around)
    ship.updateMatrixWorld();
    const cw = crewAt(shot.it); ship.localToWorld(crewEye.set(shot.s * cw[0], cw[1], cw[2]));
    camera.position.copy(crewEye);
    subject(shot.it, camTarget);
    if (cut) crewLook.copy(camTarget); else crewLook.lerp(camTarget, 1 - Math.pow(0.05, realDt));
    camTarget.copy(crewLook).sub(crewEye).applyAxisAngle(camera.up.set(0, 1, 0), look.yaw).add(crewEye);
    camTarget.y += 4 + look.pitch * 20;  // look a little over it, so it sits below the caption card
    shipUp.set(0, 1, 0).applyQuaternion(ship.quaternion);
    camera.up.lerp(shipUp, 0.6).normalize();
  } else if (crewOut) {
    crewOut.t = Math.min(1, crewOut.t + realDt / 2.2);
    const e = THREE.MathUtils.smootherstep(crewOut.t, 0, 1);
    ship.updateMatrixWorld();
    if (crewOut.it?.kind === "line") lineView(crewOut.it, tall, crewEye, tmp);
    else { const cw = crewAt(crewOut.it); ship.localToWorld(crewEye.set(crewOut.s * cw[0], cw[1], cw[2])); }
    camera.position.lerpVectors(crewEye, camPos, e);
    camTarget.lerpVectors(crewLook, camTarget, e);
    camera.up.copy(crewOut.up).lerp(shipUp.set(0, 1, 0), e).normalize();
    if (crewOut.t >= 1) crewOut = null;
  }
  if (peek) { ship.updateMatrixWorld(); ship.localToWorld(camera.position.set(...peek[0])); ship.localToWorld(camTarget.set(...peek[1])); camera.up.set(0, 1, 0); }  // a test hook's fixed view
  camera.lookAt(camTarget);

  // Foam behind and around the hull, spray at the bow
  updateWake(realDt, night, sailing, fwd);
  const bowAt = p.clone().addScaledVector(fwd, 8.6); bowAt.y = hb + 0.8;
  updateSpray(dt, bowAt, fwd, right, w.storm);

  // Water and sky travel with the ship
  const step = SIZE / SEG;
  water.position.set(Math.round(p.x / step) * step, 0, Math.round(p.z / step) * step);
  sky.position.copy(camera.position);
  for (const k of Object.keys(cols)) mix3(k, w.storm, night, cols[k]);
  sunDir.set(-0.55, 0.3 - night * 0.2, -0.8).normalize();
  // Lightning in the stormiest weeks
  if (w.storm > 0.82 && Math.random() < dt * (w.storm - 0.8) * 3.5) { flash = 1; strike(); }
  updateBolt(dt);
  flash *= Math.pow(0.02, dt);
  if (flash > 0.01) { cols.zenith.lerp(FLASH, flash * 0.6); cols.horizon.lerp(FLASH, flash * 0.5); cols.cloud.lerp(WHITE, flash * 0.7); }
  const fogFar = 1100 - w.storm * 600 - night * 300;
  const u = waterMat.uniforms;
  u.uAmp.value = sea.amp; u.uSteep.value = sea.steep; u.uTime.value = time;
  u.uDeep.value.copy(cols.deep); u.uShallow.value.copy(cols.shallow); u.uSky.value.copy(cols.zenith); u.uHorizon.value.copy(cols.horizon);
  u.uSunDir.value.copy(sunDir); u.uSunCol.value.copy(cols.sun).multiplyScalar(1 - w.storm * 0.85); u.uFog.value.copy(cols.fog);
  u.uFoam.value = 0.15 + w.storm * 0.85; u.uFogNear.value = fogFar * 0.15; u.uFogFar.value = fogFar;
  u.uStorm.value = w.storm; u.uGlow.value.copy(cols.glow);
  scene.fog.color.copy(cols.fog); scene.fog.near = fogFar * 0.15; scene.fog.far = fogFar;
  const s = skyMat.uniforms;
  s.uZenith.value.copy(cols.zenith); s.uHorizon.value.copy(cols.horizon); s.uSunDir.value.copy(sunDir); s.uSunCol.value.copy(cols.sun);
  s.uCloud.value = 0.15 + w.storm * 0.85; s.uCloudCol.value.copy(cols.cloud); s.uNight.value = night; s.uTime.value = time;
  sun.position.copy(ship.position).addScaledVector(sunDir, 200); sun.target.position.copy(ship.position);
  // Lens flare only in the crew's-eye shots, and only while the sun is out
  const sunny = (1 - THREE.MathUtils.smoothstep(w.storm, 0.35, 0.7)) * (1 - THREE.MathUtils.smoothstep(night, 0.2, 0.5));
  flareAmt += ((shot.name === "crew" ? sunny : 0) - flareAmt) * (1 - Math.pow(0.05, realDt));
  lensflare.visible = flareAmt > 0.01;
  if (lensflare.visible) {
    lensflare.position.copy(camera.position).addScaledVector(sunDir, 1500);
    for (const e of flareEls) e.color.copy(e.base).multiplyScalar(flareAmt);
  }
  sun.color.copy(cols.sun); sun.intensity = 2.4 * (1 - w.storm * 0.55) * (1 - night * 0.7) + flash * 3;
  hemi.color.copy(cols.zenith).lerp(WHITE, 0.5); hemi.groundColor.copy(cols.deep);
  hemi.intensity = 1.3 * (1 - night * 0.5) + flash * 2;
  renderer.toneMappingExposure = 1.0 - night * 0.25;

  // Rain around the camera
  const rainAmt = Math.max(0, (w.storm - 0.65) / 0.35);
  rain.visible = rainAmt > 0;
  rain.material.opacity = rainAmt * 0.45;
  if (rainAmt > 0) {
    for (let i = 0; i < RAIN; i++) {
      const dr = drops[i];
      dr[1] -= dt * 70; dr[0] -= dt * 12;
      if (dr[1] < -5) { dr[0] = Math.random() * 120 - 60; dr[1] = 50 + Math.random() * 10; dr[2] = Math.random() * 120 - 60; }
      const x = camera.position.x + dr[0], y = camera.position.y + dr[1] - 20, z = camera.position.z + dr[2];
      rainPos.set([x, y, z, x + 0.3, y + 2.2, z], i * 6);
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // Buoys bob, boards turn to the camera, lighthouses sweep; far things are hidden
  for (const k of markers) {
    const near = Math.abs(k.day - day) < 130;
    k.group.visible = near;
    if (near && k.group.userData.bob) k.group.position.y = seaHeight(k.group.position.x, k.group.position.z) - 0.6;
  }
  for (const b of boards) {
    if (!b.parent.visible) continue;
    b.getWorldPosition(tmp2);
    b.visible = tmp2.distanceTo(camera.position) > 14;  // on bends the camera can swing through a buoy's poster
    b.rotation.y = Math.atan2(camera.position.x - tmp2.x, camera.position.z - tmp2.z);
  }
  for (const ring of rings) {
    if (!ring.parent?.visible) continue;
    ring.getWorldPosition(tmp2);
    ring.position.y = seaHeight(tmp2.x, tmp2.z) - ring.parent.position.y + 0.25;
  }
  for (const b of beacons) {
    const near = Math.abs(b.day - day) < 140;
    b.group.visible = near;
    if (near) { b.spin.rotation.y = time * 0.9; b.lamp.material.color.copy(b.color).multiplyScalar(1.2 + Math.sin(time * 4) * 0.2); }
  }
  animateCreatures(dt);
  if (mockOn) mockTick();
  animateGulls(dt, fwd);
  animateEggs(dt, realDt);
  updateHud(w);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Month labels are drawn on canvases, so wait (briefly) for the display font
// and for the models (anything still missing after 20 seconds falls back to shapes drawn in code)
// ---- Mock mode: what a scene gets (documented in mock/README.md), and the made-up sighting it plays as ----
const mockApi = {
  THREE, scene, world, ship, camera, frame, DAY, lite, reduced, model, MODELS, mats, EGG, eggMat, PAINTED, BUNNY, GLOW_TEX, canvasTexture,
  makeLeprechaun, makeCaptain, makeRabbit, makeDolphin, fir, foamRing, isle, deepen, ground: groundAt, seaHeight, weather: () => weather(day),
  mixers: creatureMixers, unseen, tierOf, CREW, CREW_BOW,
  spray: emitWhale, drip: dripFrom, churn: churnAt, WET, water: waterMat.uniforms,
  ring: (x, z, s = 1) => { mockRing = { x, z, s, t: time }; },  // a splash's rings and foam (uSplash), unless a whale is splashing
  mound: (x, z, h, r = 9) => { waterMat.uniforms.uMound.value.set(x, z, h, r); moundSet = true; },  // the sea heaving over it, this frame
  sfx: sfx.kit, $,
  get time() { return time; }, get day() { return day; }, get playing() { return playing; }, get jumped() { return jumped; },
  get shot() { return { name: shot.name, it: shot.it, out: crewOut?.it }; }, get voyage() { return voyage; },
};
let mockOn = null;  // { m, c, start }
// A calm, daytime week to sail the mock into: the least stormy (and least late-night) run of 7 days, clear of the start
// and of a new month (whose turn-to-face shot would come just before the mock's)
function calmStart(v) {
  setWeather(v);
  let best = 20, score = 1e9;
  for (let d = 14; d < D.lastDay - 12; d++) {
    let sc = 0;
    if ([1, 2, 3, 4, 5, 6].some(k => dayDate(d + k).getUTCDate() === 1)) continue;
    for (let k = 0; k <= 6; k++) { const w = weather(d + k); sc = Math.max(sc, w.storm + 2 * Math.max(0, w.night - 0.12)); }
    if (sc < score - 0.02) { score = sc; best = d; }
  }
  return best;
}
async function mockInject() {
  const m = MOCKS.get(MOCK.id);
  if (!m) { $("error").hidden = false; $("error").textContent = `No mock "${MOCK.id}". Registered: ${[...MOCKS.keys()].join(", ") || "none"}`; return; }
  const v = D.voyages[0], start = MOCK.day !== null ? +MOCK.day : m.tier === "end" ? D.lastDay - 3 : calmStart(v), at = start + (m.ahead ?? 4);
  // Its own models, if it brings any: { name: "models/…glb" or [path, longest side] }
  const gltf = new GLTFLoader();
  await Promise.allSettled(Object.entries(m.assets || {}).map(([name, a]) => {
    const [file, len] = Array.isArray(a) ? a : [a, 0];
    return gltf.loadAsync(file).then(g => {
      const o = g.scene; o.animations = g.animations;
      if (len) o.userData.scale = len / Math.max(...new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).toArray());
      MODELS[name] = o;
    });
  }));
  // Nothing real in its way: other sightings and the date-based eggs within ten days of it stand aside
  v.creatures = v.creatures.filter(c => Math.abs((c.at ?? c.day) - at) > 10);
  D.eggs = (D.eggs || []).filter(e => Math.abs(e.day - at) > 10);
  const c = { kind: "mock", id: m.id, day: at, t: null, n: 0, tier: m.tier === "end" ? "ambient" : m.tier, mock: m };
  if (m.tier !== "end") v.creatures.push(c);
  mockOn = { m, c, start };
  $("intro_text").textContent = `Mockup: ${m.title}`;
}
// After the shot (or the end screen), on to the next in a sequence (?next=a,b,…)
function mockTick() {
  if (!MOCK.next.length || mockOn.left) return;
  const done = mockOn.m.tier === "end" ? !$("end").hidden && performance.now() - (mockOn.endAt ??= performance.now()) > 6000 : day > mockOn.c.day + 1.2 && !crewOut && shot.name !== "crew";
  if (done) { mockOn.left = true; location.search = `?mock=${encodeURIComponent(MOCK.next[0])}&next=${MOCK.next.slice(1).map(encodeURIComponent).join(",")}&auto`; }
}
function mockGo(id) {  // for checks: to just before its crew's-eye shot (an end screen: straight to it)
  if (id !== undefined && id !== MOCK.id) { location.search = `?mock=${encodeURIComponent(id)}`; return "loading"; }
  if (!mockOn) return null;
  $("intro").hidden = true;
  if (mockOn.m.tier === "end") { jump(); day = D.lastDay + 0.95; setPlaying(false); finished = true; showLog(); return "end"; }
  jump(); day = mockOn.c.day + 0.5 - 1.62; start();
  return "shot";
}

$("set_sail").disabled = true; $("set_sail").textContent = "Rigging the ship…";
await Promise.all([
  Promise.race([document.fonts.load('80px "Pirata One"'), new Promise(res => setTimeout(res, 2500))]).catch(() => {}),
  Promise.race([loadModels(), new Promise(res => setTimeout(res, 20000))]),
  mockLoad,
]);
if (MOCK.id) await mockInject();
$("set_sail").disabled = false; $("set_sail").textContent = "Set sail";
rigShip();
addGulls();
useVoyage(0);
if (mockOn) { day = mockOn.start; jump(); if (MOCK.auto) start(); }
resize();
requestAnimationFrame(tick);
// Hooks for screenshots and checks
window.__voyage = { seek: d => { jump(); day = d; }, creatures: () => creatures, salvo: () => salvo.map(g => [g.at.toFixed(2), g.age.toFixed(2), g.puffs.length, g.puffs[0] ? g.puffs[0].m.material.opacity.toFixed(2) : -1].join("/")).join(" "), camera, shot: () => shot.name, crew: CREW, ship, strike: () => { flash = 1; strike(); }, cine: () => true,  /* always on now */ state: () => ({ day, playing, pending, pixelRatio, lazy: lazy.length, models: Object.keys(MODELS).length, creatures: creatures.length }), start, pause: () => setPlaying(false), look, sfx: () => sfx.log, sun: () => sunDir.y, weather: () => ({ now: weather(day), smooth: { ...wSmooth } }),
  peek: (eye, at) => { peek = eye ? [eye, at] : null; },
  isles: at => {  // for checks: each island with what it is and its day, and the calm round them as seen from at
    if (at) nearIsles(at);
    const of = s => [...markers.map(k => [k, "port"]), ...beacons.map(k => [k, "lighthouse"]), ...creatures.map(k => [k, k.kind]), ...eggs.map(k => [k, k.kind])].find(([k]) => k.group === s.obj || k.group === s.obj.parent);
    return { isles: isles.map(s => { const k = of(s); return { ...s, what: k?.[1], day: k?.[0].day }; }), calm: calmAt, seaMax: SEA_MAX };
  },  // hold the camera at [x, y, z] in the ship's frame, looking at another
  shoals,  // what passing ships keep clear of (steerPast)
  mock: mockGo, mocks: () => [...MOCKS.keys()],  // mock mode (mock/README.md)
  egg: forceEgg, eggs: () => eggs.map(e => ({ kind: e.kind, day: e.day, side: e.side, forced: e.forced, pos: e.group?.position.toArray() })), moment: t => {
    const m = swoop || rocket || eclipse;
    if (m && t !== undefined) Object.assign(m, { t, hold: true });
    return m && { kind: swoop ? "eagle" : rocket ? "rocket" : "eclipse", t: m.t };
  } };
