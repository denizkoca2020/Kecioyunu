/* Keçi Oyunu — şehir sürümü.
   three.js r128 (vendor/) + GLTF modeller (assets/). Şehir, araçlar ve keçi kodla üretilir. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const loadingText = $("loadingText");
  if (!window.THREE || !THREE.GLTFLoader) { loadingText.textContent = "3B motor yüklenemedi. Sayfayı yenile."; return; }
  const T = THREE;

  // ================= Yardımcılar =================
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  let best = store.get("keci-sehir-rekor", 0);
  let soundOn = store.get("keci3d-ses", true);
  const isTouch = matchMedia("(pointer: coarse)").matches;

  // ================= Ses =================
  let ac = null;
  function audio() {
    if (!soundOn) return null;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), gn = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    const a = audio(); if (!a) return;
    const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain();
    s.buffer = buf; f.type = "lowpass"; f.frequency.value = freq; gn.gain.value = vol;
    s.connect(f).connect(gn).connect(a.destination); s.start();
  }
  const sfx = {
    jump() { tone("sine", 300, 620, 0.16, 0.12); },
    dash() { noise(0.18, 0.12, 900); },
    bleat() {
      const a = audio(); if (!a) return;
      const t = a.currentTime, o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), gn = a.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(rand(400, 470), t); o.frequency.linearRampToValueAtTime(350, t + 0.45);
      lfo.frequency.value = 27; lg.gain.value = 28; lfo.connect(lg).connect(o.frequency);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.07, t + 0.03); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
      o.connect(gn).connect(a.destination); o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5);
    },
    thud() { tone("triangle", 190, 45, 0.2, 0.32); noise(0.12, 0.2, 500); },
    crash() { noise(0.45, 0.35, 2500); tone("square", 140, 60, 0.3, 0.08); },
    alarm() { for (let i = 0; i < 6; i++) tone("square", i % 2 ? 900 : 700, i % 2 ? 900 : 700, 0.14, 0.05, i * 0.16); },
    honk() { tone("sawtooth", 380, 370, 0.35, 0.06); tone("sawtooth", 470, 460, 0.35, 0.05); },
    bark() { tone("square", 520, 260, 0.09, 0.07); tone("square", 520, 240, 0.09, 0.07, 0.15); },
    flap() { noise(0.35, 0.12, 1800); },
    hurt() { tone("square", 320, 80, 0.4, 0.1); },
    yum() { tone("sine", 520, 520, 0.08, 0.12); tone("sine", 780, 780, 0.12, 0.12, 0.08); },
    heart() { tone("sine", 520, 520, 0.08, 0.12); tone("sine", 660, 660, 0.08, 0.12, 0.08); tone("sine", 880, 880, 0.16, 0.12, 0.16); },
  };

  // ================= Renderer, sahne, ışık =================
  const canvas = $("scene");
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.physicallyCorrectLights = false;

  const scene = new T.Scene();
  const FOG = 0xc9d8e2;
  scene.fog = new T.Fog(FOG, 60, 175);
  const camera = new T.PerspectiveCamera(58, 1, 0.1, 400);

  const hemi = new T.HemisphereLight(0xdfeeff, 0x6f6658, 0.3);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff1dc, 1.25);
  const SUN_DIR = new T.Vector3(0.55, 0.75, -0.38).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Fiziksel gökyüzü bir kez küp dokuya çizilir
  (function makeSky() {
    const skyScene = new T.Scene();
    const sky = new T.Sky(); sky.scale.setScalar(1000); skyScene.add(sky);
    const u = sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85;
    u.sunPosition.value.copy(SUN_DIR).multiplyScalar(1000);
    const rt = new T.WebGLCubeRenderTarget(512, { encoding: T.sRGBEncoding, generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter });
    const cc = new T.CubeCamera(1, 2000, rt);
    const tm = renderer.toneMapping; renderer.toneMapping = T.ACESFilmicToneMapping;
    cc.update(renderer, skyScene);
    renderer.toneMapping = tm;
    scene.background = rt.texture;
  })();

  // ================= Prosedürel dokular =================
  function cv(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
  function tex(c, srgb = true, rep = true) {
    const t = new T.CanvasTexture(c);
    if (srgb) t.encoding = T.sRGBEncoding;
    if (rep) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  function speckle(x, w, h, n, colors, r = rng(1), size = [1, 3]) {
    for (let i = 0; i < n; i++) { x.fillStyle = colors[Math.floor(r() * colors.length)]; const s = size[0] + r() * (size[1] - size[0]); x.fillRect(r() * w, r() * h, s, s); }
  }
  function asphaltTex() {
    const [c, x] = cv(512, 512), r = rng(3);
    x.fillStyle = "#4a4b4e"; x.fillRect(0, 0, 512, 512);
    speckle(x, 512, 512, 26000, ["#3d3e41", "#55565a", "#5e5f63", "#434447", "#6a6b6e"], r, [1, 2.5]);
    x.strokeStyle = "rgba(30,30,32,0.55)"; x.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) { x.beginPath(); let px = r() * 512, py = r() * 512; x.moveTo(px, py); for (let k = 0; k < 7; k++) { px += (r() - 0.5) * 50; py += (r() - 0.5) * 50; x.lineTo(px, py); } x.stroke(); }
    for (let i = 0; i < 6; i++) { x.fillStyle = "rgba(25,25,28,0.25)"; x.beginPath(); x.ellipse(r() * 512, r() * 512, 20 + r() * 50, 10 + r() * 30, r() * 3, 0, 7); x.fill(); }
    const t = tex(c); return t;
  }
  function paverTex() { // kilit taşı
    const [c, x] = cv(256, 256), r = rng(5);
    x.fillStyle = "#8d8780"; x.fillRect(0, 0, 256, 256);
    const bw = 32, bh = 16;
    for (let row = 0; row < 16; row++) for (let col = -1; col < 9; col++) {
      const off = row % 2 ? bw / 2 : 0, px = col * bw + off, py = row * bh;
      const tone = 150 + Math.floor(r() * 40), red = r() < 0.12;
      x.fillStyle = red ? `rgb(${tone + 10},${tone - 40},${tone - 50})` : `rgb(${tone},${tone - 4},${tone - 10})`;
      x.fillRect(px + 1, py + 1, bw - 2, bh - 2);
    }
    speckle(x, 256, 256, 3000, ["rgba(0,0,0,0.08)", "rgba(255,255,255,0.08)"], r);
    return tex(c);
  }
  function grassTex() {
    const [c, x] = cv(256, 256), r = rng(9);
    x.fillStyle = "#5d7f3a"; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) { x.fillStyle = r() < 0.5 ? "rgba(80,112,46,0.7)" : "rgba(120,150,70,0.6)"; x.fillRect(r() * 256, r() * 256, 1.5, 3 + r() * 4); }
    return tex(c);
  }
  function roofTex() {
    const [c, x] = cv(128, 128), r = rng(11);
    x.fillStyle = "#6c6964"; x.fillRect(0, 0, 128, 128);
    speckle(x, 128, 128, 4000, ["#5d5a55", "#7a7671", "#85817b"], r);
    return tex(c);
  }
  function concreteTex() {
    const [c, x] = cv(128, 128), r = rng(13);
    x.fillStyle = "#b9b4ab"; x.fillRect(0, 0, 128, 128);
    speckle(x, 128, 128, 3000, ["#aaa59c", "#c6c1b8", "#a19c93"], r);
    return tex(c);
  }

  // Cephe: bir doku = 1 pencere aralığı (3 m) x 1 kat (3 m). Renk ve pürüzlülük haritası birlikte çizilir.
  const FACADES = [
    { wall: "#e9dfcc", trim: "#ffffff", balcony: true },
    { wall: "#d8a98a", trim: "#f4ece0", balcony: false, brick: true },
    { wall: "#c9cdd0", trim: "#f2f2f2", balcony: true },
    { wall: "#ecd9a6", trim: "#fffaf0", balcony: true },
    { wall: "#b9cfd8", trim: "#ffffff", balcony: false },
    { wall: "#f1ede6", trim: "#8f8a84", balcony: true, shutters: true },
    { wall: "#a7b49a", trim: "#f4f1ea", balcony: false },
    { wall: "#dcc3c0", trim: "#ffffff", balcony: true },
  ];
  function facadeMaterial(f, seed) {
    const S = 256, [c, x] = cv(S, S), [rc, rx] = cv(S, S), r = rng(seed);
    x.fillStyle = f.wall; x.fillRect(0, 0, S, S);
    rx.fillStyle = "#e0e0e0"; rx.fillRect(0, 0, S, S);
    if (f.brick) {
      for (let row = 0; row < 32; row++) for (let col = -1; col < 9; col++) {
        const off = row % 2 ? 16 : 0, tone = r() * 30 - 15;
        x.fillStyle = `rgb(${190 + tone},${120 + tone},${95 + tone})`; x.fillRect(col * 32 + off + 1, row * 8 + 1, 30, 6);
      }
    } else speckle(x, S, S, 2500, ["rgba(0,0,0,0.05)", "rgba(255,255,255,0.07)"], r);
    // kat çizgisi
    x.fillStyle = "rgba(0,0,0,0.12)"; x.fillRect(0, S - 6, S, 6);
    x.fillStyle = f.trim; x.fillRect(0, S - 14, S, 8);
    // pencere
    const wx = 70, wy = 46, ww = 116, wh = 140;
    x.fillStyle = f.trim; x.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
    const g = x.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, "#5a6e7c"); g.addColorStop(0.45, "#2d3a44"); g.addColorStop(1, "#1d252c");
    x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
    // perde
    if (r() < 0.7) { x.fillStyle = pick(["rgba(240,232,214,0.75)", "rgba(220,200,170,0.7)", "rgba(200,210,220,0.7)"]); x.fillRect(wx + 4, wy + 4, 30, wh - 8); x.fillRect(wx + ww - 34, wy + 4, 30, wh - 8); }
    x.fillStyle = f.trim; x.fillRect(wx + ww / 2 - 4, wy, 8, wh); x.fillRect(wx, wy + 50, ww, 6);
    rx.fillStyle = "#1c1c1c"; rx.fillRect(wx, wy, ww, wh);
    rx.fillStyle = "#8a8a8a"; rx.fillRect(wx + ww / 2 - 4, wy, 8, wh); rx.fillRect(wx, wy + 50, ww, 6);
    // denizlik
    x.fillStyle = "rgba(0,0,0,0.25)"; x.fillRect(wx - 12, wy + wh + 8, ww + 24, 5);
    x.fillStyle = f.trim; x.fillRect(wx - 12, wy + wh + 2, ww + 24, 7);
    if (f.shutters) { x.fillStyle = "#5f7a5a"; x.fillRect(wx - 36, wy - 6, 26, wh + 12); x.fillRect(wx + ww + 10, wy - 6, 26, wh + 12); }
    if (f.balcony) { // balkon korkuluğu (Türk apartmanı)
      x.fillStyle = "rgba(0,0,0,0.18)"; x.fillRect(30, wy + wh - 20, S - 60, 50);
      x.fillStyle = "#3b3b3b"; x.fillRect(30, wy + wh - 30, S - 60, 5);
      for (let i = 0; i <= 18; i++) x.fillRect(30 + i * ((S - 64) / 18), wy + wh - 30, 3, 56);
      x.fillStyle = f.trim; x.fillRect(24, wy + wh + 24, S - 48, 10);
      rx.fillStyle = "#6a6a6a"; rx.fillRect(30, wy + wh - 30, S - 60, 60);
      if (r() < 0.5) { x.fillStyle = pick(["#c0392b", "#d35400", "#7d3c98"]); for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(44 + i * 30, wy + wh - 34, 7, 0, 7); x.fill(); } } // saksı çiçekleri
      if (r() < 0.4) { x.fillStyle = "#dfe6ea"; x.fillRect(200, wy + 10, 22, 26); x.fillStyle = "#9aa3a8"; x.beginPath(); x.arc(211, wy + 23, 7, 0, 7); x.fill(); } // klima
    }
    return new T.MeshStandardMaterial({ map: tex(c), roughnessMap: tex(rc, false), roughness: 1, metalness: 0.05 });
  }
  const SHOPS = [
    ["BAKKAL", "#1f6f50", "#2e8b57"], ["FIRIN", "#8a3b12", "#d35400"], ["ECZANE", "#b0102a", "#c0392b"],
    ["BERBER", "#1d3f72", "#2c5aa0"], ["KASAP", "#7a1d1d", "#a93226"], ["ÇAY OCAĞI", "#5a3a1a", "#8e5b2a"],
    ["KUAFÖR", "#6a2c70", "#8e44ad"], ["EMLAK", "#2c3e50", "#34495e"], ["BÜFE", "#b9770e", "#d4ac0d"],
    ["KIRTASİYE", "#16676e", "#1abc9c"], ["LOKANTA", "#7b241c", "#c0392b"], ["MANAV", "#3d6b1f", "#58a32c"],
  ];
  function shopMaterial(s, seed) {
    const W = 512, H = 360, [c, x] = cv(W, H), [rc, rx] = cv(W, H), r = rng(seed);
    x.fillStyle = "#cfc8bc"; x.fillRect(0, 0, W, H); rx.fillStyle = "#d8d8d8"; rx.fillRect(0, 0, W, H);
    // tabela
    x.fillStyle = s[1]; x.fillRect(12, 14, W - 24, 70);
    x.fillStyle = "#fff"; x.font = "bold 44px 'Arial Narrow', Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(s[0], W / 2, 51);
    rx.fillStyle = "#606060"; rx.fillRect(12, 14, W - 24, 70);
    // tente
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? s[2] : "#f4f1ea"; x.beginPath(); x.moveTo(12 + i * 30.5, 90); x.lineTo(12 + (i + 1) * 30.5, 90); x.lineTo(12 + (i + 1) * 30.5 + 3, 128); x.lineTo(12 + i * 30.5 + 3, 128); x.fill(); }
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? s[2] : "#f4f1ea"; x.beginPath(); x.arc(27 + i * 30.5, 128, 15, 0, Math.PI); x.fill(); }
    // vitrin
    const gx = 24, gy = 150, gw = 330, gh = 196;
    x.fillStyle = "#3a3a3a"; x.fillRect(gx - 6, gy - 6, gw + 12, gh + 12);
    const g = x.createLinearGradient(gx, gy, gx + gw, gy + gh); g.addColorStop(0, "#43525c"); g.addColorStop(0.5, "#2a3238"); g.addColorStop(1, "#3c4850");
    x.fillStyle = g; x.fillRect(gx, gy, gw, gh);
    for (let k = 0; k < 3; k++) { x.fillStyle = "rgba(255,230,180,0.25)"; x.fillRect(gx + 10, gy + 40 + k * 50, gw - 20, 6); for (let i = 0; i < 12; i++) { x.fillStyle = `hsla(${r() * 360},50%,60%,0.6)`; x.fillRect(gx + 16 + i * 26, gy + 20 + k * 50, 16, 20); } }
    rx.fillStyle = "#151515"; rx.fillRect(gx, gy, gw, gh);
    // kapı
    const dx = 380, dw = 104;
    x.fillStyle = "#3a3a3a"; x.fillRect(dx - 6, gy - 6, dw + 12, gh + 12);
    x.fillStyle = "#2f3a40"; x.fillRect(dx, gy, dw, gh); x.fillStyle = "#c9c9c9"; x.fillRect(dx + 80, gy + 90, 6, 30);
    rx.fillStyle = "#202020"; rx.fillRect(dx, gy, dw, gh);
    return new T.MeshStandardMaterial({ map: tex(c), roughnessMap: tex(rc, false), roughness: 1, metalness: 0.05 });
  }

  // ================= Malzemeler =================
  const MAT = {
    asphalt: new T.MeshStandardMaterial({ map: asphaltTex(), roughness: 0.92, metalness: 0 }),
    paver: new T.MeshStandardMaterial({ map: paverTex(), roughness: 0.85 }),
    grass: new T.MeshStandardMaterial({ map: grassTex(), roughness: 1 }),
    roof: new T.MeshStandardMaterial({ map: roofTex(), roughness: 0.95 }),
    concrete: new T.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9 }),
    curb: new T.MeshStandardMaterial({ color: 0xbdb8b0, roughness: 0.8 }),
    white: new T.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }),
    yellow: new T.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 }),
    metal: new T.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.45, metalness: 0.7 }),
    steel: new T.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9 }),
    darkMetal: new T.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.5, metalness: 0.6 }),
    wood: new T.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 }),
    bark: new T.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }),
    leaf: new T.MeshStandardMaterial({ color: 0x4f7d32, roughness: 0.9 }),
    leaf2: new T.MeshStandardMaterial({ color: 0x3f6b2a, roughness: 0.9 }),
    soil: new T.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }),
    lampGlass: new T.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0x6a5c3a, roughness: 0.3 }),
    red: new T.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 }),
    green: new T.MeshStandardMaterial({ color: 0x2f7d4a, roughness: 0.6 }),
    glass: new T.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.45 }),
    stone: new T.MeshStandardMaterial({ color: 0xa89d8c, roughness: 0.85 }),
    water: new T.MeshStandardMaterial({ color: 0x4f86a0, roughness: 0.05, metalness: 0.3 }),
    lightRed: new T.MeshStandardMaterial({ color: 0xff3b2a, emissive: 0xaa1a10, roughness: 0.3 }),
    lightGreen: new T.MeshStandardMaterial({ color: 0x40ff7a, emissive: 0x0c8a3a, roughness: 0.3 }),
    lightOff: new T.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3 }),
    awning: new T.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 }),
    clock: null,
  };
  MAT.plaza = new T.MeshStandardMaterial({ map: paverTex(), color: 0xc9b9a0, roughness: 0.85 });
  MAT.facades = FACADES.map((f, i) => facadeMaterial(f, 100 + i));
  MAT.shops = SHOPS.map((s, i) => shopMaterial(s, 200 + i));
  MAT.clock = (() => {
    const [c, x] = cv(256, 256);
    x.fillStyle = "#f4efe2"; x.beginPath(); x.arc(128, 128, 120, 0, 7); x.fill();
    x.strokeStyle = "#2b1d14"; x.lineWidth = 8; x.stroke();
    x.fillStyle = "#2b1d14"; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.fillRect(128 + Math.sin(a) * 96 - 4, 128 - Math.cos(a) * 96 - 10, 8, 20); }
    x.lineCap = "round"; x.lineWidth = 9; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + 50, 128 - 30); x.stroke();
    x.lineWidth = 6; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 - 10, 128 - 84); x.stroke();
    return new T.MeshStandardMaterial({ map: tex(c, true, false), roughness: 0.4 });
  })();

  // Ortam ışığı: gerçek şehir fotoğrafından HDR (yansımalar için). Mat yüzeylerde kısık tutulur.
  function tuneEnv(m, v) { if (m && m.isMeshStandardMaterial) m.envMapIntensity = v; }
  for (const k2 in MAT) { const m = MAT[k2]; if (Array.isArray(m)) m.forEach((x) => tuneEnv(x, 0.45)); else tuneEnv(m, 0.4); }
  tuneEnv(MAT.glass, 1); tuneEnv(MAT.water, 1); tuneEnv(MAT.steel, 1);
  const pmrem = new T.PMREMGenerator(renderer);

  // ================= Geometri yardımcıları =================
  const GEO = {
    box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(1, 1, 1, 16), cyl8: new T.CylinderGeometry(1, 1, 1, 8),
    sphere: new T.SphereGeometry(1, 20, 14), ico: new T.IcosahedronGeometry(1, 1), cone: new T.ConeGeometry(1, 1, 16),
  };
  function boxUV(w, h, d, tu, tv) { // dokuyu metre cinsinden döşer
    const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);
      const su = face < 2 ? d : w, sv = face === 2 || face === 3 ? d : h;
      uv.setXY(i, uv.getX(i) * su / tu, uv.getY(i) * sv / tv);
    }
    return g;
  }
  function planeUV(w, d, tu, tv) {
    const g = new T.PlaneGeometry(w, d), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tu, uv.getY(i) * d / tv);
    g.rotateX(-Math.PI / 2);
    return g;
  }

  // Parça başına statik geometri birleştirici (çizim çağrısı sayısını düşürür)
  class Batch {
    constructor() { this.buckets = new Map(); }
    add(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0, shadow = true) {
      const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));
      this.addMatrix(geo, mat, m, shadow);
    }
    addMatrix(geo, mat, m, shadow = true) {
      const key = mat.uuid + (shadow ? "s" : "n");
      if (!this.buckets.has(key)) this.buckets.set(key, { mat, shadow, geos: [] });
      let g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(m);
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
      this.buckets.get(key).geos.push(g);
    }
    build(parent) {
      for (const b of this.buckets.values()) {
        const merged = T.BufferGeometryUtils.mergeBufferGeometries(b.geos, false);
        for (const g of b.geos) g.dispose();
        if (!merged) continue;
        const mesh = new T.Mesh(merged, b.mat);
        mesh.castShadow = b.shadow; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
        parent.add(mesh);
      }
    }
  }

  // ================= Şehir yerleşimi =================
  // Hücre = 64 m. Yollar x = k*64 ve z = k*64 çizgileri boyunca, 12 m genişlikte.
  const CELL = 64, ROAD = 6, WALK = 4, CURB = 0.15;
  const LANE = 2.2, PARK_LANE = 4.6;
  const VIEW = 2;
  const chunks = new Map();
  const key = (cx, cz) => cx + "," + cz;
  function cellType(cx, cz) {
    if (Math.abs(cx) <= 0 && Math.abs(cz) <= 0) return "square"; // başlangıç meydanı
    const r = rng((cx * 92837111) ^ (cz * 689287499) ^ 42)();
    if (r < 0.1) return "park";
    if (r < 0.15) return "square";
    return "block";
  }
  function groundY(x, z) {
    const lx = x - Math.floor(x / CELL) * CELL, lz = z - Math.floor(z / CELL) * CELL;
    return lx > ROAD && lx < CELL - ROAD && lz > ROAD && lz < CELL - ROAD ? CURB : 0;
  }

  // Yaprak kartları: alfa testli, gerçekçi taç
  const leafMats = [0, 1].map((v) => {
    const [c, x] = cv(256, 256), r = rng(31 + v);
    for (let i = 0; i < 420; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 110, px = 128 + Math.cos(a) * d, py = 128 + Math.sin(a) * d * 0.9;
      const l = 10 + r() * 9, hue = v ? 95 + r() * 20 : 80 + r() * 25, lit = 22 + r() * 22 + (py < 128 ? 6 : 0);
      x.save(); x.translate(px, py); x.rotate(r() * Math.PI * 2);
      x.fillStyle = `hsl(${hue},${40 + r() * 20}%,${lit}%)`;
      x.beginPath(); x.ellipse(0, 0, l, l * 0.45, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = `hsla(${hue},30%,${lit - 10}%,0.6)`; x.lineWidth = 1; x.beginPath(); x.moveTo(-l, 0); x.lineTo(l, 0); x.stroke();
      x.restore();
    }
    const t = tex(c, true, false);
    return new T.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.85, envMapIntensity: 0.35 });
  });
  const leafCore = new T.MeshStandardMaterial({ color: 0x1f3314, roughness: 1, envMapIntensity: 0.3 });
  const cardGeo = new T.PlaneGeometry(1.7, 1.7);
  const trunkGeo = new T.CylinderGeometry(0.1, 0.19, 1, 8); trunkGeo.translate(0, 0.5, 0);
  const branchGeo = new T.CylinderGeometry(0.04, 0.08, 1, 6); branchGeo.translate(0, 0.5, 0);
  const _o = new T.Object3D();
  function addTree(b, cols, x, z, r, big) {
    // kaldırım ağaçları yüksekten budanmış: taç kameranın üstünde kalır
    const h = big ? 3.4 + r() * 1.2 : 4.0 + r() * 0.8;
    const scale = big ? 1.25 + r() * 0.4 : 0.85 + r() * 0.2;
    b.add(trunkGeo, MAT.bark, x, CURB, z, scale, h * 1.05, scale, r() * 6);
    for (let i = 0; i < 4; i++) b.add(branchGeo, MAT.bark, x, CURB + h * 0.85, z, scale, 1.2 * scale, scale, r() * 6, 0.5 + r() * 0.4, 0);
    const lm = leafMats[r() < 0.5 ? 0 : 1];
    const cy = CURB + h + 1.0 * scale, rx = 1.5 * scale, ry = 1.15 * scale;
    b.add(GEO.ico, leafCore, x, cy, z, rx * 0.6, ry * 0.55, rx * 0.6, 0, 0, 0, true);
    const n = big ? 34 : 24;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, e = (r() - 0.3) * Math.PI * 0.85, rr2 = 0.65 + r() * 0.4;
      const nx = Math.cos(a) * Math.cos(e), ny = Math.sin(e), nz = Math.sin(a) * Math.cos(e);
      _o.position.set(x + nx * rx * rr2, cy + ny * ry * rr2, z + nz * rx * rr2);
      _o.lookAt(x + nx * rx * 3, cy + ny * ry * 3, z + nz * rx * 3); // kart dışarı bakar
      _o.rotateZ(r() * Math.PI * 2);
      const sc = scale * (0.75 + r() * 0.4); _o.scale.set(sc, sc, sc); _o.updateMatrix();
      b.addMatrix(cardGeo, lm, _o.matrix.clone(), true);
    }
    cols.push({ x, z, r: 0.3, solid: true });
  }
  function addLamp(b, cols, x, z, ang) {
    b.add(GEO.cyl8, MAT.darkMetal, x, 3, z, 0.08, 6, 0.08);
    b.add(GEO.cyl8, MAT.darkMetal, x, 0.4, z, 0.14, 0.8, 0.14);
    const ax = Math.sin(ang), az = Math.cos(ang);
    b.add(GEO.box, MAT.darkMetal, x + ax * 0.7, 5.95, z + az * 0.7, 0.08, 0.08, 1.4, ang);
    b.add(GEO.box, MAT.darkMetal, x + ax * 1.35, 5.85, z + az * 1.35, 0.35, 0.14, 0.6, ang);
    b.add(GEO.box, MAT.lampGlass, x + ax * 1.35, 5.76, z + az * 1.35, 0.28, 0.04, 0.5, ang, 0, 0, false);
    cols.push({ x, z, r: 0.22, solid: true });
  }
  function addBench(b, cols, x, z, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    b.add(GEO.box, MAT.wood, x, 0.48, z, 1.8, 0.06, 0.45, ang);
    b.add(GEO.box, MAT.wood, x - s * 0.22, 0.78, z - c * 0.22, 1.8, 0.4, 0.05, ang, -0.15);
    for (const k of [-0.75, 0.75]) b.add(GEO.box, MAT.darkMetal, x + c * k, 0.25, z - s * k, 0.06, 0.5, 0.45, ang);
    cols.push({ x, z, r: 0.8, solid: true });
  }
  function addBin(b, cols, x, z) {
    b.add(GEO.cyl, MAT.green, x, 0.45, z, 0.28, 0.9, 0.28);
    b.add(GEO.cyl, MAT.darkMetal, x, 0.92, z, 0.3, 0.06, 0.3);
    cols.push({ x, z, r: 0.35, h: 0.95, hurt: true, label: "Çöp kutusuna çarptın!" });
  }
  function addBollard(b, cols, x, z) {
    b.add(GEO.cyl8, MAT.darkMetal, x, 0.45, z, 0.09, 0.9, 0.09);
    b.add(GEO.sphere, MAT.darkMetal, x, 0.92, z, 0.11, 0.11, 0.11);
    cols.push({ x, z, r: 0.2, h: 0.95, hurt: true, label: "Babaya çarptın!" });
  }
  function addBarrier(b, cols, x, z, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    for (const k of [-0.9, 0.9]) b.add(GEO.box, MAT.white, x + c * k, 0.45, z - s * k, 0.08, 0.9, 0.5, ang);
    b.add(GEO.box, MAT.red, x, 0.8, z, 2.0, 0.22, 0.06, ang);
    b.add(GEO.box, MAT.white, x, 0.5, z, 2.0, 0.22, 0.06, ang);
    for (const k of [-0.6, 0, 0.6]) cols.push({ x: x + c * k, z: z - s * k, r: 0.45, h: 1.0, hurt: true, label: "Bariyere takıldın!" });
  }
  function addTrafficLight(b, cols, x, z, ang) {
    b.add(GEO.cyl8, MAT.darkMetal, x, 1.8, z, 0.07, 3.6, 0.07);
    const ax = Math.sin(ang), az = Math.cos(ang);
    b.add(GEO.box, MAT.darkMetal, x + ax * 0.12, 3.2, z + az * 0.12, 0.32, 0.9, 0.22, ang);
    const on = Math.random() < 0.5;
    b.add(GEO.sphere, on ? MAT.lightRed : MAT.lightOff, x + ax * 0.24, 3.48, z + az * 0.24, 0.09, 0.09, 0.05, ang, 0, 0, false);
    b.add(GEO.sphere, MAT.lightOff, x + ax * 0.24, 3.2, z + az * 0.24, 0.09, 0.09, 0.05, ang, 0, 0, false);
    b.add(GEO.sphere, on ? MAT.lightOff : MAT.lightGreen, x + ax * 0.24, 2.92, z + az * 0.24, 0.09, 0.09, 0.05, ang, 0, 0, false);
    cols.push({ x, z, r: 0.2, solid: true });
  }
  function addBusStop(b, cols, x, z, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    b.add(GEO.box, MAT.darkMetal, x, 2.5, z, 3.6, 0.1, 1.5, ang);
    for (const k of [-1.7, 1.7]) b.add(GEO.box, MAT.darkMetal, x + c * k - s * -0.6, 1.25, z - s * k - c * -0.6, 0.08, 2.5, 0.08, ang);
    b.add(GEO.box, MAT.glass, x + s * 0.65, 1.3, z + c * 0.65, 3.4, 2.1, 0.03, ang, 0, 0, false);
    b.add(GEO.box, MAT.wood, x + s * 0.35, 0.48, z + c * 0.35, 2.4, 0.06, 0.4, ang);
    cols.push({ x: x + c * 1.2, z: z - s * 1.2, r: 0.5, solid: true }, { x: x - c * 1.2, z: z + s * 1.2, r: 0.5, solid: true }, { x, z, r: 0.5, solid: true });
  }
  function addSimitCart(b, cols, x, z, ang) { // simit arabası
    b.add(GEO.box, MAT.red, x, 0.95, z, 1.3, 0.7, 0.7, ang);
    b.add(GEO.box, MAT.glass, x, 1.6, z, 1.2, 0.6, 0.6, ang, 0, 0, false);
    b.add(GEO.box, MAT.white, x, 1.95, z, 1.4, 0.06, 0.8, ang);
    const c = Math.cos(ang), s = Math.sin(ang);
    for (const k of [-0.45, 0.45]) b.add(GEO.cyl, MAT.darkMetal, x + c * k, 0.3, z - s * k, 0.3, 0.06, 0.3, ang, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) b.add(torusGeo, MAT.simit, x + c * (-0.4 + (i % 3) * 0.4), 1.42 + Math.floor(i / 3) * 0.2, z - s * (-0.4 + (i % 3) * 0.4), 0.9, 0.9, 0.9, ang, Math.PI / 2);
    cols.push({ x, z, r: 0.85, solid: true });
  }
  const torusGeo = new T.TorusGeometry(0.13, 0.045, 8, 18);
  MAT.simit = new T.MeshStandardMaterial({ color: 0xa8662c, roughness: 0.75 });
  function addParkedCar(b, cols, x, z, ang) {
    const v = carProto(pick(["sedan", "hatch", "sedan", "taxi"]), pick(CAR_COLORS));
    v.updateMatrixWorld(true);
    const base = new T.Matrix4().compose(new T.Vector3(x, 0, z), new T.Quaternion().setFromEuler(new T.Euler(0, ang, 0)), new T.Vector3(1, 1, 1));
    v.traverse((o) => { if (o.isMesh) b.addMatrix(o.geometry, o.material, base.clone().multiply(o.matrixWorld), true); });
    const c = Math.cos(ang), s = Math.sin(ang);
    for (const k of [-1.4, 0, 1.4]) cols.push({ x: x + s * k, z: z + c * k, r: 1.05, solid: true, car: true });
  }

  function addBuildingRow(b, cols, r, x0, z0, x1, z1) { // dikdörtgen arsayı binalarla doldurur
    const w = x1 - x0, d = z1 - z0;
    const floors = 3 + Math.floor(r() * 7);
    const H = 4.2 + floors * 3;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const facade = MAT.facades[Math.floor(r() * MAT.facades.length)];
    const shop = MAT.shops[Math.floor(r() * MAT.shops.length)];
    b.add(boxUV(w, 4.2, d, 6, 4.2), shop, cx, 2.1 + CURB, cz);
    b.add(boxUV(w - 0.3, H - 4.2, d - 0.3, 3, 3), facade, cx, 4.2 + (H - 4.2) / 2 + CURB, cz);
    // kat silmesi ve çatı parapeti
    b.add(GEO.box, MAT.concrete, cx, 4.3 + CURB, cz, w + 0.2, 0.25, d + 0.2);
    b.add(GEO.box, MAT.concrete, cx, H + 0.25 + CURB, cz, w, 0.5, d);
    b.add(GEO.box, MAT.roof, cx, H + 0.52 + CURB, cz, w - 0.6, 0.06, d - 0.6, 0, 0, 0, false);
    // çatı: su deposu, klima, çanak anten (Türk çatısı)
    const top = H + 0.55 + CURB;
    if (r() < 0.8) { const tx = cx + (r() - 0.5) * (w - 3), tz = cz + (r() - 0.5) * (d - 3); b.add(GEO.cyl, MAT.steel, tx, top + 0.6, tz, 0.6, 1.1, 0.6, 0, 0, Math.PI / 2); b.add(GEO.box, MAT.darkMetal, tx, top + 0.15, tz, 1.2, 0.3, 0.8); }
    for (let i = 0; i < 1 + Math.floor(r() * 3); i++) { const tx = cx + (r() - 0.5) * (w - 2), tz = cz + (r() - 0.5) * (d - 2); b.add(GEO.cyl, MAT.white, tx, top + 0.35, tz, 0.45, 0.06, 0.45, r() * 6, 1.0); b.add(GEO.cyl8, MAT.darkMetal, tx, top + 0.15, tz, 0.03, 0.3, 0.03); }
    if (r() < 0.6) { const tx = cx + (r() - 0.5) * (w - 2), tz = cz + (r() - 0.5) * (d - 2); b.add(GEO.box, MAT.white, tx, top + 0.3, tz, 0.9, 0.6, 0.5); }
    if (r() < 0.4) b.add(GEO.box, MAT.concrete, cx + w * 0.25, top + 1.2, cz, 2.2, 2.4, 2.2); // asansör dairesi
    cols.push({ box: true, x0, x1, z0, z1, h: H + 1, solid: true });
  }

  function loadChunk(cx, cz) {
    const r = rng((cx * 73856093) ^ (cz * 19349663) ^ 7654321);
    const group = new T.Group(), b = new Batch(), cols = [];
    const ox = cx * CELL, oz = cz * CELL, type = cellType(cx, cz);
    const bx0 = ox + ROAD, bx1 = ox + CELL - ROAD, bz0 = oz + ROAD, bz1 = oz + CELL - ROAD, bw = bx1 - bx0;
    const ix0 = bx0 + WALK, ix1 = bx1 - WALK, iz0 = bz0 + WALK, iz1 = bz1 - WALK;

    // --- yollar (bu hücre: batı kenarı + güney kenarı + köşedeki kavşak)
    const markZ = (x, z0, z1) => { // x sabit, z boyunca
      b.add(GEO.box, MAT.yellow, x - 0.12, 0.012, (z0 + z1) / 2, 0.12, 0.02, z1 - z0, 0, 0, 0, false);
      b.add(GEO.box, MAT.yellow, x + 0.12, 0.012, (z0 + z1) / 2, 0.12, 0.02, z1 - z0, 0, 0, 0, false);
      for (let z = z0 + 1; z < z1 - 2; z += 6) for (const s of [-1, 1]) b.add(GEO.box, MAT.white, x + s * (LANE + 1.2), 0.012, z + 1.5, 0.12, 0.02, 3, 0, 0, 0, false);
    };
    const markX = (z, x0, x1) => {
      b.add(GEO.box, MAT.yellow, (x0 + x1) / 2, 0.012, z - 0.12, x1 - x0, 0.02, 0.12, 0, 0, 0, false);
      b.add(GEO.box, MAT.yellow, (x0 + x1) / 2, 0.012, z + 0.12, x1 - x0, 0.02, 0.12, 0, 0, 0, false);
      for (let x = x0 + 1; x < x1 - 2; x += 6) for (const s of [-1, 1]) b.add(GEO.box, MAT.white, x + 1.5, 0.012, z + s * (LANE + 1.2), 3, 0.02, 0.12, 0, 0, 0, false);
    };
    markZ(ox, oz + ROAD + 4, oz + CELL - ROAD - 4);
    markX(oz, ox + ROAD + 4, ox + CELL - ROAD - 4);
    // yaya geçitleri (zebra) kavşağın dört kolunda
    const zebra = (x, z, alongX) => { for (let i = -5; i <= 5; i++) b.add(GEO.box, MAT.white, alongX ? x + i * 1.0 : x, 0.013, alongX ? z : z + i * 1.0, alongX ? 0.5 : 3, 0.02, alongX ? 3 : 0.5, 0, 0, 0, false); };
    zebra(ox, oz + ROAD + 1.8, true); zebra(ox, oz - ROAD - 1.8, true);
    zebra(ox + ROAD + 1.8, oz, false); zebra(ox - ROAD - 1.8, oz, false);

    // --- kaldırım / zemin levhası
    const slabMat = type === "park" ? MAT.grass : MAT.paver;
    b.add(planeUV(bw, bw, 2, 2), MAT.paver, (bx0 + bx1) / 2, CURB, (bz0 + bz1) / 2, 1, 1, 1, 0, 0, 0, false);
    if (type === "park") b.add(planeUV(bw - WALK * 2, bw - WALK * 2, 3, 3), MAT.grass, (bx0 + bx1) / 2, CURB + 0.01, (bz0 + bz1) / 2, 1, 1, 1, 0, 0, 0, false);
    // bordür
    const cm = (bx0 + bx1) / 2;
    b.add(GEO.box, MAT.curb, cm, CURB / 2, bz0, bw, CURB, 0.3, 0, 0, 0, false);
    b.add(GEO.box, MAT.curb, cm, CURB / 2, bz1, bw, CURB, 0.3, 0, 0, 0, false);
    b.add(GEO.box, MAT.curb, bx0, CURB / 2, cm - ox + oz, 0.3, CURB, bw, 0, 0, 0, false);
    b.add(GEO.box, MAT.curb, bx1, CURB / 2, cm - ox + oz, 0.3, CURB, bw, 0, 0, 0, false);
    void slabMat;

    // --- kaldırım donatıları: lamba, ağaç, bank, çöp, baba
    const edges = [
      { a: [bx0 + 1, bz0 + 0.8], b: [bx1 - 1, bz0 + 0.8], face: Math.PI },       // güney (yola bakan -z)
      { a: [bx0 + 1, bz1 - 0.8], b: [bx1 - 1, bz1 - 0.8], face: 0 },
      { a: [bx0 + 0.8, bz0 + 1], b: [bx0 + 0.8, bz1 - 1], face: -Math.PI / 2 },
      { a: [bx1 - 0.8, bz0 + 1], b: [bx1 - 0.8, bz1 - 1], face: Math.PI / 2 },
    ];
    for (const e of edges) {
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      for (let s = 6; s < len - 4; s += 14) {
        const t = s / len, x = e.a[0] + (e.b[0] - e.a[0]) * t, z = e.a[1] + (e.b[1] - e.a[1]) * t;
        addLamp(b, cols, x, z, e.face);
        const t2 = (s + 7) / len;
        if (t2 < 0.95) {
          const x2 = e.a[0] + (e.b[0] - e.a[0]) * t2, z2 = e.a[1] + (e.b[1] - e.a[1]) * t2;
          const roll = r();
          if (roll < 0.35) { addTree(b, cols, x2, z2, r, false); b.add(GEO.box, MAT.soil, x2, CURB + 0.01, z2, 1.2, 0.02, 1.2, 0, 0, 0, false); }
          else if (roll < 0.58) addBin(b, cols, x2, z2);
          else if (roll < 0.68) addBollard(b, cols, x2, z2);
          else if (roll < 0.74) addBarrier(b, cols, x2, z2, e.face + Math.PI / 2);
        }
      }
    }
    addTrafficLight(b, cols, bx0 + 0.5, bz0 + 0.5, Math.PI * 1.25);
    addTrafficLight(b, cols, bx1 - 0.5, bz1 - 0.5, Math.PI * 0.25);
    if (r() < 0.5) addBusStop(b, cols, bx0 + 2.2, cm - ox + oz + 10, Math.PI / 2 * 3 + Math.PI);
    // park edilmiş arabalar (park şeridi)
    for (let s = oz + ROAD + 10; s < oz + CELL - ROAD - 8; s += 6.5) if (r() < 0.3) addParkedCar(b, cols, ox + PARK_LANE, s, Math.PI);
    for (let s = ox + ROAD + 10; s < ox + CELL - ROAD - 8; s += 6.5) if (r() < 0.3) addParkedCar(b, cols, s, oz + PARK_LANE, Math.PI / 2);

    // --- iç kısım
    const spawns = { pigeons: [] };
    if (type === "block") {
      const nx = 2 + Math.floor(r() * 2), nz = 2 + Math.floor(r() * 2);
      const lw = (ix1 - ix0) / nx, ld = (iz1 - iz0) / nz;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue; // ortadaki avlu
        addBuildingRow(b, cols, r, ix0 + i * lw + 0.05, iz0 + j * ld + 0.05, ix0 + (i + 1) * lw - 0.05, iz0 + (j + 1) * ld - 0.05);
      }
      if (r() < 0.35) addSimitCart(b, cols, bx0 + 2.4, oz + 30, 0);
    } else if (type === "park") {
      for (let i = 0; i < 14; i++) { const x = ix0 + 3 + r() * (ix1 - ix0 - 6), z = iz0 + 3 + r() * (iz1 - iz0 - 6); if (Math.hypot(x - cm, z - (cm - ox + oz)) > 7) addTree(b, cols, x, z, r, true); }
      const pz = cm - ox + oz;
      // çeşme
      b.add(GEO.cyl, MAT.stone, cm, CURB + 0.3, pz, 3.2, 0.6, 3.2);
      b.add(GEO.cyl, MAT.water, cm, CURB + 0.58, pz, 2.9, 0.04, 2.9, 0, 0, 0, false);
      b.add(GEO.cyl, MAT.stone, cm, CURB + 1.1, pz, 0.35, 1.6, 0.35);
      b.add(GEO.cyl, MAT.stone, cm, CURB + 1.9, pz, 1.0, 0.2, 1.0);
      cols.push({ x: cm, z: pz, r: 3.3, solid: true });
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; addBench(b, cols, cm + Math.sin(a) * 6, pz + Math.cos(a) * 6, a + Math.PI); }
      spawns.pigeons.push([cm + 5, pz - 4], [cm - 5, pz + 5]);
      if (r() < 0.6) addSimitCart(b, cols, cm + 9, pz - 9, 0.6);
    } else { // meydan: saat kulesi
      const pz = cm - ox + oz;
      b.add(planeUV(ix1 - ix0, iz1 - iz0, 3, 3), MAT.plaza, cm, CURB + 0.01, pz, 1, 1, 1, 0, 0, 0, false);
      b.add(GEO.box, MAT.stone, cm, CURB + 0.4, pz, 4.4, 0.8, 4.4);
      b.add(GEO.box, MAT.stone, cm, CURB + 7, pz, 3, 13, 3);
      b.add(GEO.box, MAT.concrete, cm, CURB + 13.6, pz, 3.4, 0.4, 3.4);
      for (const [dx, dz, ry] of [[0, 1.52, 0], [0, -1.52, Math.PI], [1.52, 0, Math.PI / 2], [-1.52, 0, -Math.PI / 2]]) {
        const g = new T.CircleGeometry(1.1, 32);
        b.add(g, MAT.clock, cm + dx, CURB + 11.5, pz + dz, 1, 1, 1, ry, 0, 0, false);
      }
      b.add(GEO.cone, MAT.red, cm, CURB + 15.4, pz, 2.4, 3.2, 2.4, Math.PI / 4);
      b.add(GEO.cyl8, MAT.darkMetal, cm, CURB + 17.4, pz, 0.04, 1.2, 0.04);
      cols.push({ x: cm, z: pz, r: 2.6, solid: true });
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; addBench(b, cols, cm + Math.sin(a) * 9, pz + Math.cos(a) * 9, a + Math.PI); }
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2; addTree(b, cols, cm + Math.sin(a) * 15, pz + Math.cos(a) * 15, r, true); }
      spawns.pigeons.push([cm + 5, pz + 4], [cm - 4, pz - 5], [cm + 3, pz - 6]);
    }
    b.build(group);
    scene.add(group);
    chunks.set(key(cx, cz), { group, cols, cx, cz, type, spawns, pigeonsDone: false });
  }
  function unloadChunk(k, c) {
    scene.remove(c.group);
    c.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    chunks.delete(k);
  }
  let chunkQueue = [];
  function updateChunks(px, pz, all) {
    const ccx = Math.floor(px / CELL), ccz = Math.floor(pz / CELL);
    chunkQueue = [];
    for (let dx = -VIEW; dx <= VIEW; dx++) for (let dz = -VIEW; dz <= VIEW; dz++) {
      if (!chunks.has(key(ccx + dx, ccz + dz))) chunkQueue.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
    }
    chunkQueue.sort((a, b2) => a[2] - b2[2]);
    // kare başına bir parça kurarak takılmayı önle
    const n = all ? chunkQueue.length : Math.min(1, chunkQueue.length);
    for (let i = 0; i < n; i++) loadChunk(chunkQueue[i][0], chunkQueue[i][1]);
    for (const [k, c] of chunks) if (Math.abs(c.cx - ccx) > VIEW + 1 || Math.abs(c.cz - ccz) > VIEW + 1) unloadChunk(k, c);
  }
  function collidersNear(x, z) {
    const out = [], ccx = Math.floor(x / CELL), ccz = Math.floor(z / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = chunks.get(key(ccx + dx, ccz + dz)); if (c) for (const col of c.cols) out.push(col);
    }
    return out;
  }
  function pushOut(p, rad, onlySolid = true) {
    let hit = false;
    for (const c of collidersNear(p.x, p.z)) {
      if (onlySolid && !c.solid) continue;
      if (c.box) {
        if (p.x > c.x0 - rad && p.x < c.x1 + rad && p.z > c.z0 - rad && p.z < c.z1 + rad) {
          const dl = p.x - (c.x0 - rad), dr = c.x1 + rad - p.x, dn = p.z - (c.z0 - rad), df = c.z1 + rad - p.z;
          const m = Math.min(dl, dr, dn, df);
          if (m === dl) p.x = c.x0 - rad; else if (m === dr) p.x = c.x1 + rad; else if (m === dn) p.z = c.z0 - rad; else p.z = c.z1 + rad;
          hit = true;
        }
      } else {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + rad;
        if (d < min && d > 0.0001) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; hit = true; }
      }
    }
    return hit;
  }
  function blockedAt(x, z, rad) {
    for (const c of collidersNear(x, z)) {
      if (!c.solid && !c.hurt) continue;
      if (c.box) { if (x > c.x0 - rad && x < c.x1 + rad && z > c.z0 - rad && z < c.z1 + rad) return true; }
      else if (Math.hypot(x - c.x, z - c.z) < c.r + rad) return true;
    }
    return false;
  }

  // ================= Araçlar (prosedürel) =================
  const CAR_COLORS = [0xe8e8e8, 0x1a1a1a, 0x8c949a, 0x9c1c1c, 0x1f3b73, 0xc7c2b8, 0x2e4a3a, 0x5a5f66, 0xffffff];
  const paintCache = new Map();
  function paint(color) {
    if (!paintCache.has(color)) paintCache.set(color, new T.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }));
    return paintCache.get(color);
  }
  const CARMAT = {
    glass: new T.MeshPhysicalMaterial({ color: 0x1b242b, metalness: 0.2, roughness: 0.05, clearcoat: 1 }),
    tire: new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, envMapIntensity: 0.3 }),
    rim: new T.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.95, roughness: 0.25 }),
    chrome: new T.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.15 }),
    trim: new T.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6, envMapIntensity: 0.5 }),
    head: new T.MeshStandardMaterial({ color: 0xf6f6f0, emissive: 0x555550, roughness: 0.1 }),
    tail: new T.MeshStandardMaterial({ color: 0x8a0d0d, emissive: 0x3a0505, roughness: 0.2 }),
    tailOn: new T.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2010, roughness: 0.2 }),
    hazard: new T.MeshStandardMaterial({ color: 0xffa020, emissive: 0xff8000, roughness: 0.2 }),
    plate: (() => { const [c, x] = cv(256, 56); x.fillStyle = "#f4f4f4"; x.fillRect(0, 0, 256, 56); x.fillStyle = "#1d4fa0"; x.fillRect(0, 0, 30, 56); x.fillStyle = "#fff"; x.font = "bold 18px Arial"; x.fillText("TR", 3, 36); x.fillStyle = "#111"; x.font = "bold 34px 'Arial Narrow', Arial"; x.fillText("34 KÇ 0" + Math.floor(Math.random() * 90 + 10), 40, 40); return new T.MeshStandardMaterial({ map: tex(c, true, false), roughness: 0.4 }); })(),
    taxiSign: (() => { const [c, x] = cv(256, 64); x.fillStyle = "#151515"; x.fillRect(0, 0, 256, 64); x.fillStyle = "#ffd21f"; x.font = "bold 44px Arial"; x.textAlign = "center"; x.fillText("TAKSİ", 128, 48); return new T.MeshStandardMaterial({ map: tex(c, true, false), emissive: 0x332a00, roughness: 0.4 }); })(),
    busSide: null,
  };
  function sideShape(profile) { const s = new T.Shape(); s.moveTo(profile[0][0], profile[0][1]); for (let i = 1; i < profile.length; i++) s.lineTo(profile[i][0], profile[i][1]); return s; }
  // Profil: (z boyunca uzunluk, y yükseklik). Araç +z yönüne bakar.
  const PROFILES = {
    sedan: { L: 4.6, W: 1.8,
      body: [[-2.3, 0.32], [2.3, 0.32], [2.33, 0.62], [2.22, 0.84], [1.2, 0.97], [-1.7, 1.0], [-2.28, 0.96], [-2.33, 0.62]],
      cabin: [[1.18, 0.96], [0.6, 1.4], [-0.95, 1.42], [-1.68, 0.99]],
      roof: [[0.62, 1.38], [0.58, 1.46], [-0.95, 1.48], [-1.0, 1.4]] },
    hatch: { L: 4.0, W: 1.75,
      body: [[-2.0, 0.32], [2.0, 0.32], [2.03, 0.62], [1.92, 0.86], [1.0, 1.0], [-1.95, 1.04], [-2.03, 0.62]],
      cabin: [[0.98, 0.99], [0.42, 1.44], [-1.72, 1.46], [-1.94, 1.03]],
      roof: [[0.44, 1.42], [0.4, 1.5], [-1.72, 1.52], [-1.78, 1.44]] },
  };
  const wheelGeo = new T.CylinderGeometry(0.34, 0.34, 0.24, 20); wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new T.CylinderGeometry(0.22, 0.22, 0.25, 12); rimGeo.rotateZ(Math.PI / 2);
  const protoCache = new Map();
  function extrudeProfile(points, width, bevel) {
    const g = new T.ExtrudeGeometry(sideShape(points), { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1, curveSegments: 4 });
    g.translate(0, 0, -width / 2);
    g.rotateY(-Math.PI / 2); // şekil x'i -> dünya z
    return g;
  }
  function buildCar(kind, color) {
    const P = PROFILES[kind === "taxi" ? "sedan" : kind];
    const root = new T.Group(), body = new T.Group(); root.add(body);
    const paintMat = paint(kind === "taxi" ? 0xf5c518 : color);
    const shell = new T.Mesh(extrudeProfile(P.body, P.W - 0.16, 0.08), paintMat); body.add(shell);
    const cabin = new T.Mesh(extrudeProfile(P.cabin, P.W - 0.36, 0.05), CARMAT.glass); body.add(cabin);
    const roof = new T.Mesh(extrudeProfile(P.roof, P.W - 0.3, 0.04), paintMat); body.add(roof);
    // kapı direkleri
    const pil = (z0, y0, z1, y1) => { const m = new T.Mesh(GEO.box, paintMat); const len = Math.hypot(z1 - z0, y1 - y0); m.scale.set(P.W - 0.3, len, 0.07); m.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2); m.rotation.x = Math.atan2(z1 - z0, y1 - y0); body.add(m); };
    pil(P.cabin[0][0] - 0.05, P.cabin[0][1], P.cabin[1][0], P.cabin[1][1] + 0.04);
    pil((P.cabin[0][0] + P.cabin[3][0]) / 2 + 0.1, P.cabin[0][1], (P.cabin[0][0] + P.cabin[3][0]) / 2 + 0.05, P.cabin[1][1] + 0.04);
    pil(P.cabin[3][0] + 0.05, P.cabin[3][1], P.cabin[2][0], P.cabin[2][1] + 0.04);
    for (const s2 of [-1, 1]) { const h = new T.Mesh(GEO.box, CARMAT.trim); h.scale.set(0.02, 0.03, 0.18); h.position.set(s2 * (P.W / 2 + 0.02), 0.86, 0.15); body.add(h); const h2 = h.clone(); h2.position.z = -0.95; body.add(h2); } // kapı kolları
    // tamponlar ve detaylar
    const bump = (z) => { const m = new T.Mesh(GEO.box, CARMAT.trim); m.scale.set(P.W - 0.05, 0.18, 0.18); m.position.set(0, 0.42, z); body.add(m); };
    bump(P.L / 2 + 0.02); bump(-P.L / 2 - 0.02);
    for (const s of [-1, 1]) {
      const h = new T.Mesh(GEO.box, CARMAT.head); h.scale.set(0.42, 0.12, 0.06); h.position.set(s * 0.6, 0.72, P.L / 2 + 0.05); body.add(h);
      const t = new T.Mesh(GEO.box, CARMAT.tail); t.scale.set(0.4, 0.14, 0.06); t.position.set(s * 0.6, 0.78, -P.L / 2 - 0.05); body.add(t); t.userData.tail = true;
      const mir = new T.Mesh(GEO.box, paintMat); mir.scale.set(0.2, 0.1, 0.08); mir.position.set(s * (P.W / 2 + 0.05), 1.0, 0.75); body.add(mir);
      const strip = new T.Mesh(GEO.box, CARMAT.trim); strip.scale.set(0.03, 0.06, P.L * 0.55); strip.position.set(s * (P.W / 2), 0.55, 0); body.add(strip);
    }
    const grille = new T.Mesh(GEO.box, CARMAT.trim); grille.scale.set(0.8, 0.14, 0.04); grille.position.set(0, 0.6, P.L / 2 + 0.06); body.add(grille);
    for (const z of [P.L / 2 + 0.12, -P.L / 2 - 0.12]) { const pl = new T.Mesh(new T.PlaneGeometry(0.52, 0.11), CARMAT.plate); pl.position.set(0, 0.42, z); if (z < 0) pl.rotation.y = Math.PI; body.add(pl); }
    if (kind === "taxi") {
      const sign = new T.Mesh(GEO.box, CARMAT.taxiSign); sign.scale.set(0.7, 0.2, 0.3); sign.position.set(0, 1.58, -0.1); body.add(sign);
      const ch = new T.Mesh(GEO.box, CARMAT.trim); ch.scale.set(0.04, 0.12, P.L * 0.5); ch.position.set(P.W / 2 + 0.01, 0.62, 0); body.add(ch);
    }
    const wheels = [];
    const wz = P.L / 2 - 0.82;
    for (const [sx, sz] of [[-1, wz], [1, wz], [-1, -wz], [1, -wz]]) {
      const w = new T.Group(); w.position.set(sx * (P.W / 2 - 0.12), 0.34, sz);
      w.add(new T.Mesh(wheelGeo, CARMAT.tire)); const rim = new T.Mesh(rimGeo, CARMAT.rim); rim.position.x = sx * 0.01; w.add(rim);
      root.add(w); wheels.push(w);
    }
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { root, body, wheels, L: P.L, W: P.W, H: 1.5 };
  }
  function buildBus() {
    const root = new T.Group(), body = new T.Group(); root.add(body);
    const L = 12, W = 2.5, H = 3.1;
    const shell = new T.Mesh(new T.BoxGeometry(W, H - 0.4, L, 1, 1, 1), paint(0x2a73b8)); shell.position.y = 0.4 + (H - 0.4) / 2; body.add(shell);
    const white = new T.Mesh(GEO.box, paint(0xf2f2f2)); white.scale.set(W + 0.02, 0.9, L + 0.02); white.position.y = 0.85; body.add(white);
    const winband = new T.Mesh(GEO.box, CARMAT.glass); winband.scale.set(W + 0.04, 1.2, L - 1.2); winband.position.set(0, 2.15, -0.3); body.add(winband);
    const front = new T.Mesh(GEO.box, CARMAT.glass); front.scale.set(W - 0.2, 1.6, 0.05); front.position.set(0, 2.0, L / 2 + 0.01); body.add(front);
    const sign = new T.Mesh(new T.PlaneGeometry(1.8, 0.3), (() => { const [c, x] = cv(256, 44); x.fillStyle = "#111"; x.fillRect(0, 0, 256, 44); x.fillStyle = "#ffb000"; x.font = "bold 30px Arial"; x.textAlign = "center"; x.fillText("500T TAKSİM", 128, 33); return new T.MeshStandardMaterial({ map: tex(c, true, false), emissive: 0x332200 }); })());
    sign.position.set(0, 2.95, L / 2 + 0.03); body.add(sign);
    for (const s of [-1, 1]) { const h = new T.Mesh(GEO.box, CARMAT.head); h.scale.set(0.35, 0.15, 0.05); h.position.set(s * 0.85, 0.75, L / 2 + 0.02); body.add(h); const t = new T.Mesh(GEO.box, CARMAT.tail); t.scale.set(0.25, 0.4, 0.05); t.position.set(s * 1.0, 1.0, -L / 2 - 0.02); t.userData.tail = true; body.add(t); }
    const wheels = [];
    for (const [sx, sz] of [[-1, 3.8], [1, 3.8], [-1, -3.4], [1, -3.4]]) {
      const w = new T.Group(); w.position.set(sx * (W / 2 - 0.2), 0.5, sz); w.scale.setScalar(1.45);
      w.add(new T.Mesh(wheelGeo, CARMAT.tire)); w.add(new T.Mesh(rimGeo, CARMAT.rim)); root.add(w); wheels.push(w);
    }
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { root, body, wheels, L, W, H };
  }
  function carProto(kind, color) { // statik park arabaları için önbellekli
    const k = kind + color;
    if (!protoCache.has(k)) protoCache.set(k, buildCar(kind, color).root);
    return protoCache.get(k);
  }

  // ================= Keçi (prosedürel, detaylı) =================
  function furTexture() {
    const [c, x] = cv(256, 256), r = rng(21);
    x.fillStyle = "#f3eee4"; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const px = r() * 256, py = r() * 256, len = 6 + r() * 14, a = Math.PI / 2 + (r() - 0.5) * 0.6;
      x.strokeStyle = r() < 0.5 ? "rgba(200,190,170,0.5)" : "rgba(255,255,255,0.7)"; x.lineWidth = 1 + r() * 1.5;
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * len * 0.5 + (r() - 0.5) * 6, py + Math.sin(a) * len * 0.5, px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
    }
    return tex(c);
  }
  function hornTexture() {
    const [c, x] = cv(64, 256);
    for (let i = 0; i < 256; i += 4) { const t = 110 + Math.sin(i * 0.4) * 18 + i * 0.2; x.fillStyle = `rgb(${t + 30},${t + 10},${t - 20})`; x.fillRect(0, i, 64, 4); }
    return tex(c);
  }
  function taperedTube(curve, segs, radius, tipScale, mat) {
    const g = new T.TubeGeometry(curve, segs, radius, 10, false), pos = g.attributes.position;
    for (let i = 0; i <= segs; i++) {
      const p = curve.getPointAt(i / segs), s = 1 - (1 - tipScale) * (i / segs);
      for (let j = 0; j <= 10; j++) { const k = i * 11 + j; pos.setXYZ(k, p.x + (pos.getX(k) - p.x) * s, p.y + (pos.getY(k) - p.y) * s, p.z + (pos.getZ(k) - p.z) * s); }
    }
    g.computeVertexNormals();
    return new T.Mesh(g, mat);
  }
  function buildGoat() {
    const fur = new T.MeshStandardMaterial({ map: furTexture(), roughness: 0.95, color: 0xf4efe6, envMapIntensity: 0.5 });
    const furShade = new T.MeshStandardMaterial({ map: fur.map, roughness: 1, color: 0xd6cab4, envMapIntensity: 0.5 });
    const horn = new T.MeshStandardMaterial({ map: hornTexture(), roughness: 0.55 });
    const hoof = new T.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6 });
    const nose = new T.MeshStandardMaterial({ color: 0x8a6d68, roughness: 0.5 });
    const eyeM = new T.MeshPhysicalMaterial({ color: 0xc9902b, roughness: 0.05, clearcoat: 1 });
    const pupil = new T.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1 });
    const root = new T.Group(), body = new T.Group(); root.add(body);
    const mesh = (geo, m, sx, sy, sz, x, y, z) => { const o = new T.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; return o; };
    // gövde: göğüs öne dolgun, karın sarkık
    const torsoG = new T.SphereGeometry(1, 32, 24), tp = torsoG.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      let x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
      if (z > 0.3) y += (z - 0.3) * 0.35;           // göğüs yukarı
      if (y < 0) y *= 1 + 0.18 * (1 - Math.abs(z));  // karın
      x *= 1 - 0.12 * Math.max(0, y);                // sırt daralır
      tp.setXYZ(i, x, y, z);
    }
    torsoG.computeVertexNormals();
    body.add(mesh(torsoG, fur, 0.36, 0.36, 0.72, 0, 0.98, 0));
    // Ankara keçisi uzun tüy perçemleri (yumuşak, sarkık)
    const lockG = new T.CylinderGeometry(0.035, 0.012, 1, 6); lockG.translate(0, -0.5, 0);
    const lr = rng(5);
    for (let i = 0; i < 90; i++) {
      const a = lr() * Math.PI * 2, z = Math.cos(a) * 0.6, x = Math.sin(a) * 0.27;
      const l = mesh(lockG, lr() < 0.7 ? fur : furShade, 1 + lr() * 0.6, 0.12 + lr() * 0.16, 1 + lr() * 0.6, x, 0.8 + lr() * 0.06, z);
      l.rotation.set((lr() - 0.5) * 0.3, lr() * 6, Math.sin(a) * 0.25 + (lr() - 0.5) * 0.2); body.add(l);
    }
    // kuyruk
    const tail = new T.Group(); tail.position.set(0, 1.18, -0.68);
    const tg = new T.ConeGeometry(0.06, 0.22, 8); const tm = new T.Mesh(tg, fur); tm.position.y = 0.1; tm.castShadow = true; tail.add(tm);
    tail.rotation.x = -0.5; body.add(tail);
    // bacaklar (diz eklemli)
    const upperG = new T.CylinderGeometry(0.075, 0.055, 0.36, 10); upperG.translate(0, -0.18, 0);
    const lowerG = new T.CylinderGeometry(0.045, 0.038, 0.36, 10); lowerG.translate(0, -0.18, 0);
    const hoofG = new T.CylinderGeometry(0.042, 0.055, 0.08, 10);
    const legs = [];
    for (const [lx, lz, front] of [[-0.17, 0.44, 1], [0.17, 0.44, 1], [-0.17, -0.46, 0], [0.17, -0.46, 0]]) {
      const hip = new T.Group(); hip.position.set(lx, 0.8, lz);
      const up = new T.Mesh(upperG, fur); up.castShadow = true; hip.add(up);
      const knee = new T.Group(); knee.position.y = -0.36; hip.add(knee);
      const lo = new T.Mesh(lowerG, furShade); lo.castShadow = true; knee.add(lo);
      const hf = new T.Mesh(hoofG, hoof); hf.position.y = -0.38; hf.castShadow = true; knee.add(hf);
      body.add(hip); legs.push({ hip, knee, front });
    }
    // boyun
    const neck = new T.Group(); neck.position.set(0, 1.12, 0.5);
    const neckG = new T.CylinderGeometry(0.13, 0.2, 0.55, 14); neckG.translate(0, 0.27, 0);
    const nm = new T.Mesh(neckG, fur); nm.castShadow = true; nm.rotation.x = 0.55; neck.add(nm);
    // kafa
    const head = new T.Group(); head.position.set(0, 0.45, 0.3); neck.add(head);
    const skullG = new T.SphereGeometry(1, 24, 18), sp = skullG.attributes.position;
    for (let i = 0; i < sp.count; i++) { const z = sp.getZ(i); if (z > 0) { sp.setX(i, sp.getX(i) * (1 - z * 0.35)); sp.setY(i, sp.getY(i) * (1 - z * 0.25) - z * 0.15); } }
    skullG.computeVertexNormals();
    head.add(mesh(skullG, fur, 0.15, 0.16, 0.3, 0, 0, 0.08));
    head.add(mesh(GEO.sphere, nose, 0.075, 0.06, 0.05, 0, -0.07, 0.36));
    for (const s of [-1, 1]) {
      head.add(mesh(GEO.sphere, pupil, 0.012, 0.01, 0.01, s * 0.03, -0.06, 0.4));
      const eye = mesh(GEO.sphere, eyeM, 0.035, 0.035, 0.035, s * 0.115, 0.05, 0.13); head.add(eye);
      const pp = mesh(GEO.box, pupil, 0.012, 0.012, 0.04, s * 0.142, 0.05, 0.135); pp.rotation.y = s * 0.6; head.add(pp); // yatay keçi gözbebeği
      const ear = mesh(GEO.sphere, furShade, 0.16, 0.04, 0.065, s * 0.2, 0.02, -0.02); ear.rotation.set(0, s * 0.3, s * -0.5); head.add(ear);
      // sarmal boynuz
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12, a = t * Math.PI * 1.4; pts.push(new T.Vector3(s * (0.06 + t * 0.32 + Math.sin(a) * 0.05), 0.12 + Math.sin(a) * 0.16 * (1 - t * 0.3), -0.02 - t * 0.28 + Math.cos(a) * 0.08 - 0.08)); }
      const hm = taperedTube(new T.CatmullRomCurve3(pts), 24, 0.05, 0.2, horn); hm.castShadow = true; head.add(hm);
    }
    // sakal
    const beardG = new T.ConeGeometry(0.06, 0.24, 8); beardG.rotateX(Math.PI);
    const beard = mesh(beardG, furShade, 1, 1, 1, 0, -0.2, 0.26); beard.rotation.x = 0.25; head.add(beard);
    body.add(neck);
    return { root, body, legs, neck, head, tail };
  }

  // ================= GLTF modeller =================
  const bar = $("loadBar");
  const gltfLoader = new T.GLTFLoader();
  const MODELS = {
    woman: { url: "assets/Michelle.glb", height: 1.68 },
    guard: { url: "assets/Soldier.glb", height: 1.85 },
    fox: { url: "assets/Fox.glb", height: 0.62 },
    stork: { url: "assets/Stork.glb", span: 2.0 },
    parrot: { url: "assets/Parrot.glb", span: 0.6 },
    truck: { url: "assets/CesiumMilkTruck.glb", length: 6.2 },
  };
  const protos = {};
  function measure(obj) { obj.updateMatrixWorld(true); return new T.Box3().setFromObject(obj); }
  // Dosyalar sunucudan ya da (yayın sürümünde) sayfaya gömülü base64 olarak okunur
  let loadedCount = 0;
  const totalFiles = Object.keys(MODELS).length + 1;
  function getBuffer(url) {
    const done = (b) => { loadedCount++; bar.style.transform = `scaleX(${loadedCount / totalFiles})`; return b; };
    const embed = window.KECI_EMBED && window.KECI_EMBED[url];
    if (embed) {
      return new Promise((res) => setTimeout(() => {
        const bin = atob(embed), u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        res(done(u8.buffer));
      }, 0));
    }
    return fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); }).then(done);
  }
  function loadModels() {
    return Promise.all(Object.entries(MODELS).map(([name, def]) => getBuffer(def.url).then((buf) => new Promise((res, rej) => {
      gltfLoader.parse(buf, "", (gl) => {
        const holder = new T.Group(); holder.add(gl.scene);
        const box = measure(gl.scene), size = box.getSize(new T.Vector3());
        let s = 1;
        // İnsanlar: boyu iskeletten ölç (deri kutusu güvenilmez)
        let boneTop = -Infinity, boneBot = Infinity;
        if (def.height) gl.scene.traverse((o) => { if (o.isBone) { const y = o.getWorldPosition(new T.Vector3()).y; boneTop = Math.max(boneTop, y); boneBot = Math.min(boneBot, y); } });
        if (def.height && isFinite(boneTop) && boneTop - boneBot > 1e-4) s = def.height / ((boneTop - boneBot) * 1.04);
        else if (def.height) s = def.height / size.y;
        if (def.span) s = def.span / Math.max(size.x, size.z);
        if (def.length) s = def.length / Math.max(size.x, size.z);
        gl.scene.scale.multiplyScalar(s);
        let minY = measure(gl.scene).min.y;
        if (def.height && isFinite(boneBot)) { minY = Infinity; gl.scene.updateMatrixWorld(true); gl.scene.traverse((o) => { if (o.isBone) minY = Math.min(minY, o.getWorldPosition(new T.Vector3()).y); }); }
        gl.scene.position.y -= minY; // ayaklar yerde
        const b2 = measure(gl.scene);
        gl.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
        protos[name] = { scene: holder, clips: gl.animations, size: b2.getSize(new T.Vector3()) };
        res();
      }, () => rej(new Error(def.url)));
    }))));
  }
  // Bekçinin (Mixamo) yürüme/koşma/durma hareketleri diğer insanlara aktarılır.
  // İskeletlerin dinlenme duruşları farklı olduğu için dünya uzayında fark yöntemiyle aktarılır.
  const boneKey = (n) => n.replace(/^mixamorig[:_]?/i, "").toLowerCase();
  function retarget(targetProto, sourceProto, clips, restClip, tgtRestClip) {
    const src = T.SkeletonUtils.clone(sourceProto.scene), tgt = T.SkeletonUtils.clone(targetProto.scene);
    if (tgtRestClip) { const tm = new T.AnimationMixer(tgt); tm.clipAction(tgtRestClip).play(); tm.setTime(0); }
    const srcBones = {}, tgtBones = [];
    src.traverse((o) => { if (o.isBone) srcBones[boneKey(o.name)] = o; });
    tgt.traverse((o) => { if (o.isBone) tgtBones.push(o); });
    tgt.updateMatrixWorld(true);
    const q = () => new T.Quaternion();
    const tgtRest = new Map(), tgtRestLocal = new Map();
    for (const b of tgtBones) { tgtRest.set(b, b.getWorldQuaternion(q())); tgtRestLocal.set(b, b.quaternion.clone()); }
    const parentStatic = new Map();
    for (const b of tgtBones) if (!b.parent.isBone) parentStatic.set(b, b.parent.getWorldQuaternion(q()));
    const mixer = new T.AnimationMixer(src);
    const pose = (clip, t) => { mixer.stopAllAction(); const a = mixer.clipAction(clip); a.play(); mixer.setTime(t); src.updateMatrixWorld(true); };
    if (restClip) pose(restClip, 0); else src.updateMatrixWorld(true);
    const srcRest = {};
    for (const k in srcBones) srcRest[k] = srcBones[k].getWorldQuaternion(q());
    // İki model zıt yönlere bakıyorsa hareket farkı Y ekseninde 180° çevrilir
    const armDir = (bones, find) => { const a = find("leftarm"), f = find("leftforearm"); return a && f ? f.getWorldPosition(new T.Vector3()).sub(a.getWorldPosition(new T.Vector3())).x : 1; };
    const sx = armDir(srcBones, (n) => srcBones[n]);
    const tgtByKey = {}; for (const b of tgtBones) tgtByKey[boneKey(b.name)] = b;
    const tx = armDir(tgtByKey, (n) => tgtByKey[n]);
    const flip = Math.sign(sx) !== Math.sign(tx) ? new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI) : null;
    const flipInv = flip ? flip.clone().invert() : null;
    const out = [];
    for (const clip of clips) {
      const fps = 30, n = Math.max(2, Math.round(clip.duration * fps) + 1), times = [], vals = new Map();
      for (const b of tgtBones) vals.set(b, []);
      for (let i = 0; i < n; i++) {
        const t = Math.min(clip.duration, i / fps); times.push(t);
        pose(clip, t);
        const world = new Map();
        for (const b of tgtBones) { // ebeveyn önce gelir
          const pw = b.parent.isBone ? world.get(b.parent) : parentStatic.get(b);
          const sb = srcBones[boneKey(b.name)];
          let w;
          if (sb) { let d = sb.getWorldQuaternion(q()).multiply(srcRest[boneKey(b.name)].clone().invert()); if (flip) d = flip.clone().multiply(d).multiply(flipInv); w = d.multiply(tgtRest.get(b)); }
          else w = pw.clone().multiply(tgtRestLocal.get(b));
          world.set(b, w);
          const local = pw.clone().invert().multiply(w);
          vals.get(b).push(local.x, local.y, local.z, local.w);
        }
      }
      const tracks = tgtBones.map((b) => new T.QuaternionKeyframeTrack(b.name + ".quaternion", times, vals.get(b)));
      out.push(new T.AnimationClip(clip.name, clip.duration, tracks));
    }
    mixer.stopAllAction();
    return out;
  }
  function shareLocomotion() {
    const src = protos.guard.clips.filter((c) => /^(idle|walk|run)$/i.test(c.name));
    const rest = protos.guard.clips.find((c) => /tpose/i.test(c.name));
    const wRest = protos.woman.clips.find((c) => /tpose/i.test(c.name));
    protos.woman.clips = protos.woman.clips.filter((c) => !/tpose/i.test(c.name)).concat(retarget(protos.woman, protos.guard, src, rest, wRest));
    void rest;
  }
  function loadEnv() {
    return getBuffer("assets/pedestrian_overpass_1k.hdr").then((buf) => {
      const d = new T.RGBELoader().setDataType(T.UnsignedByteType).parse(buf);
      const t = new T.DataTexture(d.data, d.width, d.height, d.format, d.type);
      t.encoding = T.RGBEEncoding; t.minFilter = t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.flipY = true; t.needsUpdate = true;
      scene.environment = pmrem.fromEquirectangular(t).texture; t.dispose();
    }).catch(() => {});
  }
  function instance(name, tint) {
    const p = protos[name];
    const root = T.SkeletonUtils.clone(p.scene);
    if (tint) root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      const t = typeof tint === "function" ? tint(o.material) : tint;
      if (t !== undefined && t !== null) o.material.color.set(t);
    });
    const mixer = new T.AnimationMixer(root), actions = {};
    for (const c of p.clips) actions[(c.name || "anim").toLowerCase()] = mixer.clipAction(c);
    return { root, mixer, actions, current: null };
  }
  function play(inst, name, timeScale = 1, fade = 0.25) {
    const a = inst.actions[name]; if (!a) return;
    a.timeScale = timeScale;
    if (inst.current === a) return;
    a.reset().play();
    if (inst.current) inst.current.crossFadeTo(a, fade, false);
    inst.current = a;
  }

  // ================= Oyun durumu =================
  const KINDS = {
    yaya:   { pts: 10, hp: 1, walk: 1.4, flee: 4.6 },
    kosucu: { pts: 20, hp: 1, walk: 3.6, flee: 5.2 },
    dansci: { pts: 15, hp: 1, walk: 1.4, flee: 4.4 },
    bekci:  { pts: 40, hp: 2, model: "guard", walk: 1.3, chase: 5.6 },
  };
  const VEH = {
    sedan: { pts: 25 }, hatch: { pts: 25 }, taxi: { pts: 30 }, bus: { pts: 60 }, truck: { pts: 45 },
  };
  const DASH = 0.38, DASH_CD = 0.55, GRAV = 22;
  let mode = "loading", g = null, goat = null, shadowBlob = null;
  let camYaw = 0;
  const camPos = new T.Vector3(0, 5, -8), camLook = new T.Vector3();

  function clearDynamic() {
    if (!g) return;
    for (const list of [g.people, g.vehicles, g.animals, g.pickups, g.birds]) for (const o of list) scene.remove(o.root || o.m.root);
    for (const s of g.fx) scene.remove(s.mesh);
  }
  function newGame() {
    clearDynamic();
    g = {
      t: 0, score: 0, lives: 3, energy: 100, combo: 0, comboT: 0, hits: 0, carHits: 0, dist: 0, inv: 0, shake: 0,
      goat: { x: 32, z: 20.5, y: CURB, vy: 0, yaw: Math.PI, speed: 0, dashT: 0, cd: 0, stun: 0, phase: 0, jumps: 0, slow: 0 },
      people: [], vehicles: [], animals: [], pickups: [], birds: [], fx: [], spawnT: 0, honkT: 0,
    };
    camYaw = 0;
    for (const c of chunks.values()) c.pigeonsDone = false;
    for (let i = 0; i < 10; i++) spawnPerson(true);
    for (let i = 0; i < 6; i++) spawnVehicle(true);
    for (let i = 0; i < 3; i++) spawnAnimal(true);
    for (let i = 0; i < 3; i++) spawnBird();
    for (let i = 0; i < 4; i++) spawnPickup("simit");
  }

  // --- kaldırım rotası: blok etrafında dikdörtgen
  function sidewalkPoint(cx, cz, s, inset) {
    const a = CELL * cx + ROAD + inset, b0 = CELL * cz + ROAD + inset, len = CELL - 2 * (ROAD + inset);
    s = ((s % (4 * len)) + 4 * len) % (4 * len);
    if (s < len) return [a + s, b0, 0];
    if (s < 2 * len) return [a + len, b0 + (s - len), 1];
    if (s < 3 * len) return [a + len - (s - 2 * len), b0 + len, 2];
    return [a, b0 + len - (s - 3 * len), 3];
  }
  function randomCellNear(minD, maxD) {
    const go = g.goat;
    for (let i = 0; i < 10; i++) {
      const a = go.yaw + rand(-1.8, 1.8), d = rand(minD, maxD);
      const x = go.x + Math.sin(a) * d, z = go.z + Math.cos(a) * d;
      return [Math.floor(x / CELL), Math.floor(z / CELL), x, z];
    }
  }
  function spawnPerson(initial) {
    const r = Math.random(), t = g.t;
    const bek = t < 12 ? 0 : Math.min(0.3, 0.12 + t / 500);
    const kind = r < bek ? "bekci" : r < bek + 0.2 ? "kosucu" : "yaya";
    const [cx, cz] = randomCellNear(initial ? 8 : 40, initial ? 45 : 70);
    const inset = rand(1.6, 3.2), s = rand(0, 400), dir = Math.random() < 0.5 ? 1 : -1;
    const [x, z] = sidewalkPoint(cx, cz, s, inset);
    if (blockedAt(x, z, 0.4)) return;
    if (Math.hypot(x - g.goat.x, z - g.goat.z) < 7) return;
    const model = kind === "bekci" ? "guard" : "woman";
    const tint = model === "guard" ? 0x8f9fca : pick([null, null, 0xf2e6da, 0xdfe6f2, 0xe8f0e0, 0xf0e0e0]);
    const inst = instance(model, tint);
    inst.root.position.set(x, CURB, z);
    scene.add(inst.root);
    play(inst, kind === "kosucu" ? "run" : "walk", 1);
    if (inst.current) inst.current.time = Math.random() * 2;
    g.people.push({ kind, model, inst, root: inst.root, x, z, y: CURB, cx, cz, s, inset, dir, hp: KINDS[kind].hp, mode: "path",
      flying: false, vx: 0, vy: 0, vz: 0, spin: new T.Vector3(), fade: 1, flash: 0, bounced: 0, hitCd: 0, calm: 0, yaw: 0 });
  }
  function spawnVehicle(initial) {
    const go = g.goat;
    const axis = Math.random() < 0.5 ? "x" : "z";
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lineIdx = Math.round((axis === "z" ? go.x : go.z) / CELL) + Math.floor(rand(-1, 2));
    const along0 = axis === "z" ? go.z : go.x;
    const along = along0 + (Math.random() < 0.7 ? 1 : -1) * rand(initial ? 30 : 55, initial ? 90 : 110);
    const lat = lineIdx * CELL + (axis === "z" ? -dir : dir) * LANE;
    const roll = Math.random();
    const kind = roll < 0.08 ? "bus" : roll < 0.16 ? "truck" : roll < 0.38 ? "taxi" : roll < 0.7 ? "sedan" : "hatch";
    let v;
    if (kind === "bus") v = buildBus();
    else if (kind === "truck") { const p = protos.truck; const root = T.SkeletonUtils.clone(p.scene); const mixer = new T.AnimationMixer(root); if (p.clips[0]) mixer.clipAction(p.clips[0]).play(); v = { root, body: root, wheels: [], L: p.size.z > p.size.x ? p.size.z : p.size.x, W: 2.3, H: 2.8, mixer }; }
    else v = buildCar(kind, pick(CAR_COLORS));
    const x = axis === "z" ? lat : along, z = axis === "z" ? along : lat;
    // aynı şeritte yakın araç varsa kurma
    for (const o of g.vehicles) if (Math.hypot(o.x - x, o.z - z) < 14) return;
    if (Math.hypot(x - go.x, z - go.z) < 25) return;
    v.root.position.set(x, 0, z);
    const yaw = axis === "z" ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    v.root.rotation.y = yaw + (kind === "truck" ? truckYaw : 0);
    scene.add(v.root);
    const cruise = kind === "bus" ? rand(7, 9) : kind === "truck" ? rand(8, 10) : rand(10, 14);
    g.vehicles.push(Object.assign(v, { kind, axis, dir, lat, along, x, z, yaw, speed: cruise, cruise, state: "drive", wreckT: 0, hop: 0, hopV: 0, tilt: 0, latOff: 0, yawOff: 0, hitCd: 0, honked: 0 }));
  }
  let truckYaw = 0;
  function spawnAnimal(initial) {
    const kind = Math.random() < 0.6 ? "kopek" : "kedi";
    const [cx, cz] = randomCellNear(initial ? 10 : 35, initial ? 40 : 65);
    const [x, z] = sidewalkPoint(cx, cz, rand(0, 400), rand(1.5, 3));
    if (blockedAt(x, z, 0.4)) return;
    const inst = instance("fox", kind === "kopek" ? pick([0xe8d2b0, 0xbfa58a, 0xf2efe8, 0x8a7a6a]) : pick([0x9a9a9a, 0x6a6a6a, 0xd0b090]));
    if (kind === "kedi") inst.root.scale.setScalar(0.55);
    inst.root.position.set(x, CURB, z); scene.add(inst.root);
    play(inst, "survey");
    g.animals.push({ kind, inst, root: inst.root, x, z, y: CURB, yaw: rand(0, 6.28), state: "idle", t: rand(1, 4), barkT: 0 });
  }
  function spawnPigeons(cx0, cz0) {
    const inst0 = protos.parrot; if (!inst0) return;
    for (const c of chunks.values()) {
      if (c.pigeonsDone || !c.spawns.pigeons.length) continue;
      const dist = Math.hypot((c.cx + 0.5) * CELL - cx0, (c.cz + 0.5) * CELL - cz0);
      if (dist > 110) continue;
      c.pigeonsDone = true;
      if (c.type === "square" && protos.woman) spawnDancer((c.cx + 0.5) * CELL + 6, (c.cz + 0.5) * CELL - 6);
      for (const [px, pz] of c.spawns.pigeons) for (let i = 0; i < 6; i++) {
        const inst = instance("parrot", (m) => { m.vertexColors = false; m.needsUpdate = true; return pick([0x8a8d96, 0x9a9da6, 0x777a82, 0xa0a4ab]); });
        const x = px + rand(-2, 2), z = pz + rand(-2, 2);
        inst.root.position.set(x, CURB, z); inst.root.rotation.y = rand(0, 6.28); scene.add(inst.root);
        play(inst, Object.keys(inst.actions)[0], 0); // yerdeyken kanat kapalı
        g.birds.push({ kind: "guvercin", inst, root: inst.root, x, z, y: CURB + 0.05, vx: 0, vy: 0, vz: 0, state: "ground", t: rand(0, 5), chunk: key(c.cx, c.cz) });
      }
    }
  }
  function spawnDancer(x, z) {
    const inst = instance("woman", pick([null, 0xf2e0f0, 0xe0f0ff]));
    inst.root.position.set(x, CURB, z); scene.add(inst.root);
    play(inst, "sambadance", 1);
    g.people.push({ kind: "dansci", model: "woman", inst, root: inst.root, x, z, y: CURB, cx: 0, cz: 0, s: 0, inset: 2, dir: 1, hp: 1, mode: "path",
      flying: false, vx: 0, vy: 0, vz: 0, spin: new T.Vector3(), fade: 1, flash: 0, bounced: 0, hitCd: 0, calm: 0, yaw: rand(0, 6.28) });
  }
  function spawnBird() {
    const inst = instance("stork");
    const go = g.goat, a = rand(0, 6.28);
    inst.root.position.set(go.x + Math.sin(a) * 40, rand(22, 32), go.z + Math.cos(a) * 40); scene.add(inst.root);
    play(inst, Object.keys(inst.actions)[0], 1);
    g.birds.push({ kind: "leylek", inst, root: inst.root, cx: go.x, cz: go.z, a, r: rand(25, 45), y: inst.root.position.y, w: rand(0.15, 0.25) * (Math.random() < 0.5 ? 1 : -1) });
  }
  const simitGeo = new T.TorusGeometry(0.22, 0.08, 12, 28);
  const sesame = new T.MeshStandardMaterial({ color: 0xf2e2b0, roughness: 0.6 });
  function spawnPickup(type) {
    const [cx, cz] = randomCellNear(15, 55);
    const [x, z] = sidewalkPoint(cx, cz, rand(0, 400), rand(1.5, 3));
    if (blockedAt(x, z, 0.6)) return;
    const root = new T.Group(), spin = new T.Group(); root.add(spin);
    if (type === "simit") {
      const m = new T.Mesh(simitGeo, MAT.simit); m.castShadow = true; spin.add(m);
      for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, s = new T.Mesh(GEO.sphere, sesame); s.scale.set(0.018, 0.012, 0.012); s.position.set(Math.cos(a) * 0.22, Math.sin(a) * 0.22, (i % 2 ? 1 : -1) * 0.06); spin.add(s); }
    } else {
      const ap = new T.Mesh(GEO.sphere, new T.MeshPhysicalMaterial({ color: 0xc0201a, roughness: 0.25, clearcoat: 0.6 })); ap.scale.set(0.2, 0.19, 0.2); ap.castShadow = true; spin.add(ap);
      const st = new T.Mesh(GEO.cyl8, MAT.bark); st.scale.set(0.015, 0.1, 0.015); st.position.y = 0.22; spin.add(st);
      const lf = new T.Mesh(GEO.sphere, MAT.leaf); lf.scale.set(0.07, 0.015, 0.04); lf.position.set(0.05, 0.24, 0); spin.add(lf);
    }
    const ring = new T.Mesh(new T.RingGeometry(0.5, 0.62, 32), new T.MeshBasicMaterial({ color: type === "simit" ? 0xffd27a : 0xff6a5a, transparent: true, opacity: 0.6, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; root.add(ring);
    root.position.set(x, CURB, z); scene.add(root);
    g.pickups.push({ type, root, spin, x, z, t: rand(0, 6) });
  }

  // ================= Efektler =================
  const popLayer = $("popups"), pops = [];
  function popText(x, y, z, text, color, size = 34) {
    const el = document.createElement("div");
    el.className = "pop"; el.textContent = text; el.style.color = color; el.style.fontSize = size + "px";
    popLayer.appendChild(el); pops.push({ el, pos: new T.Vector3(x, y, z), t: 0 });
  }
  const tmpV = new T.Vector3();
  function updatePops(dt) {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt; p.pos.y += dt * 1.4;
      if (p.t > 1.1) { p.el.remove(); pops.splice(i, 1); continue; }
      tmpV.copy(p.pos).project(camera);
      if (tmpV.z > 1) { p.el.style.opacity = 0; continue; }
      const sx = (tmpV.x * 0.5 + 0.5) * w, sy = (-tmpV.y * 0.5 + 0.5) * h, s = 1 + Math.max(0, 0.15 - p.t) * 3;
      p.el.style.opacity = String(1 - Math.max(0, p.t - 0.7) / 0.4);
      p.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${s})`;
    }
  }
  const starGeo = new T.OctahedronGeometry(0.1, 0), dustGeo = new T.SphereGeometry(0.18, 6, 5), glassGeo = new T.TetrahedronGeometry(0.08, 0);
  function burst(x, y, z, n, kind) {
    for (let i = 0; i < n; i++) {
      const color = kind === "star" ? (i % 2 ? 0xffd23f : 0xffffff) : kind === "glass" ? 0xcfe6f0 : 0xb8ad9c;
      const mesh = new T.Mesh(kind === "star" ? starGeo : kind === "glass" ? glassGeo : dustGeo, new T.MeshBasicMaterial({ color, transparent: true }));
      mesh.position.set(x, y, z); scene.add(mesh);
      const a = rand(0, 6.28), s = kind === "dust" ? rand(0.5, 2) : rand(3, 7);
      g.fx.push({ mesh, vx: Math.cos(a) * s, vy: kind === "dust" ? rand(0.5, 1.5) : rand(2, 6), vz: Math.sin(a) * s, t: 0, life: kind === "dust" ? 0.5 : 0.7, grav: kind === "dust" ? 2 : 14 });
    }
  }
  function updateFx(dt) {
    for (let i = g.fx.length - 1; i >= 0; i--) {
      const f = g.fx[i]; f.t += dt;
      if (f.t >= f.life) { scene.remove(f.mesh); f.mesh.material.dispose(); g.fx.splice(i, 1); continue; }
      f.vy -= f.grav * dt; f.mesh.position.x += f.vx * dt; f.mesh.position.y += f.vy * dt; f.mesh.position.z += f.vz * dt;
      f.mesh.rotation.y += dt * 8; f.mesh.material.opacity = 1 - f.t / f.life;
    }
  }
  const flashEl = $("flash");
  function hurtFlash() { flashEl.style.transition = "none"; flashEl.style.opacity = "0.35"; requestAnimationFrame(() => { flashEl.style.transition = ""; flashEl.style.opacity = "0"; }); }

  // ================= Kurallar =================
  function addCombo(base, x, y, z, word, energy) {
    g.combo++; g.comboT = 3;
    const mult = Math.min(5, Math.max(1, g.combo)), pts = base * mult;
    g.score += pts; g.energy = Math.min(100, g.energy + energy);
    popText(x, y, z, "+" + pts, "#d6402b", 40);
    popText(x, y + 0.9, z, word, "#2b1d14", 30);
  }
  function damage(reason) {
    if (g.inv > 0 || mode !== "play") return;
    g.lives--; g.inv = 1.6; g.combo = 0; g.shake = 0.5; sfx.hurt(); hurtFlash();
    popText(g.goat.x, g.goat.y + 2.6, g.goat.z, reason, "#2b1d14", 30);
    if (g.lives <= 0) gameOver("Keçi pes etti!");
  }
  function knockPerson(p, from, chain) {
    if (p.flying) return;
    if (p.hp > 1 && !chain) {
      p.hp--; p.flash = 0.3; p.hitCd = 0.45;
      const dx = p.x - from.x, dz = p.z - from.z, d = Math.hypot(dx, dz) || 1;
      p.x += (dx / d) * 2.2; p.z += (dz / d) * 2.2;
      g.score += 5; sfx.thud(); g.shake = 0.25;
      popText(p.x, 3, p.z, "+5 · bir daha!", "#2b1d14", 28);
      return;
    }
    p.flying = true; g.hits++;
    const go = g.goat;
    let dx = p.x - from.x, dz = p.z - from.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const fx = Math.sin(go.yaw), fz = Math.cos(go.yaw);
    const bx = chain ? dx : dx * 0.4 + fx * 0.6, bz = chain ? dz : dz * 0.4 + fz * 0.6, pw = rand(11, 15);
    p.vx = bx * pw; p.vz = bz * pw; p.vy = rand(8, 11);
    p.spin.set(rand(-8, 8), rand(-5, 5), rand(-8, 8));
    if (p.inst.current) p.inst.current.timeScale = 0.2;
    g.shake = 0.3; sfx.thud(); if (Math.random() < 0.65) sfx.bleat();
    burst(p.x, 1.3, p.z, 12, "star");
    addCombo(KINDS[p.kind].pts, p.x, 2.8, p.z, chain ? "Zincir!" : pick(["TOS!", "BAM!", "Meee!", "Uçtu!", "Güm!", "Gitti!"]), p.kind === "bekci" ? 28 : 14);
  }
  function knockVehicle(v) {
    if (v.state === "wreck") return;
    v.state = "wreck"; v.wreckT = 4; v.speed = 0; v.hopV = 3.5; g.carHits++;
    const go = g.goat;
    const side = Math.sign((v.x - go.x) * Math.cos(v.yaw) - (v.z - go.z) * Math.sin(v.yaw)) || 1;
    v.latPush = side * (v.kind === "bus" ? 0.6 : 1.4); v.yawOff = side * rand(0.25, 0.5) * (v.kind === "bus" ? 0.3 : 1);
    sfx.crash(); setTimeout(() => sfx.alarm(), 250);
    g.shake = 0.5;
    burst(v.x, 1.0, v.z, 14, "glass");
    addCombo(VEH[v.kind].pts, v.x, 3.2, v.z, v.kind === "bus" ? "Otobüs bile!" : pick(["KÜT!", "Kaporta!", "Hasar!", "Ezik!"]), 12);
  }

  // ================= Girdi =================
  const input = { jx: 0, jy: 0 }, keys = {};
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const joyEl = $("joy"), knobEl = $("knob"), touchEl = $("touch"), JOY_R = 62;
  function joyHome() { joyEl.style.left = `calc(110px + env(safe-area-inset-left, 0px))`; joyEl.style.top = `${window.innerHeight - 120}px`; knobEl.style.transform = "translate(0px, 0px)"; joyEl.classList.add("idle"); }
  touchEl.addEventListener("pointerdown", (ev) => {
    ev.preventDefault(); audio();
    if (mode !== "play") return;
    if (ev.clientX < window.innerWidth * 0.55 && joy.id === null) {
      joy.id = ev.pointerId; joy.ox = ev.clientX; joy.oy = ev.clientY; joy.x = joy.y = 0;
      joyEl.style.left = joy.ox + "px"; joyEl.style.top = joy.oy + "px"; joyEl.classList.remove("idle");
      try { touchEl.setPointerCapture(ev.pointerId); } catch (e) {}
    } else if (ev.clientX >= window.innerWidth * 0.55) headbutt();
  });
  touchEl.addEventListener("pointermove", (ev) => {
    if (ev.pointerId !== joy.id) return;
    let dx = ev.clientX - joy.ox, dy = ev.clientY - joy.oy; const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
    joy.x = dx / JOY_R; joy.y = -dy / JOY_R; knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const joyEnd = (ev) => { if (ev.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; joyHome(); };
  touchEl.addEventListener("pointerup", joyEnd); touchEl.addEventListener("pointercancel", joyEnd);
  function padPress(el, fn) {
    el.addEventListener("pointerdown", (ev) => { ev.preventDefault(); ev.stopPropagation(); audio(); el.classList.add("down"); if (mode === "play") fn(); });
    const up = () => el.classList.remove("down");
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("pointerleave", up);
  }
  padPress($("tosPad"), () => headbutt()); padPress($("jumpPad"), () => jump());
  window.addEventListener("keydown", (ev) => {
    keys[ev.code] = true; if (ev.repeat) return;
    if (mode === "play") {
      if (ev.code === "Space") { ev.preventDefault(); jump(); }
      else if (["KeyJ", "KeyX", "Enter", "ShiftLeft"].includes(ev.code)) { ev.preventDefault(); headbutt(); }
      else if (ev.code === "Escape" || ev.code === "KeyP") pause();
    } else if (mode === "pause" && (ev.code === "Escape" || ev.code === "KeyP")) resume();
  });
  window.addEventListener("keyup", (ev) => { keys[ev.code] = false; });
  function readInput() {
    let kx = 0, ky = 0;
    if (keys.ArrowLeft || keys.KeyA) kx -= 1; if (keys.ArrowRight || keys.KeyD) kx += 1;
    if (keys.ArrowUp || keys.KeyW) ky += 1; if (keys.ArrowDown || keys.KeyS) ky -= 1;
    input.jx = clamp(joy.x + kx, -1, 1); input.jy = clamp(joy.y + ky, -1, 1);
  }
  function jump() { const go = g.goat; if (go.jumps < 2 && go.stun <= 0) { go.vy = go.jumps === 0 ? 8.5 : 7; go.jumps++; sfx.jump(); if (go.jumps === 1) burst(go.x, go.y + 0.1, go.z, 6, "dust"); } }
  function headbutt() { const go = g.goat; if (go.cd <= 0 && go.stun <= 0) { go.dashT = DASH; go.cd = DASH_CD; sfx.dash(); } }

  // ================= Güncelleme =================
  function update(dt) {
    g.t += dt; readInput();
    const go = g.goat;
    go.cd = Math.max(0, go.cd - dt); go.dashT = Math.max(0, go.dashT - dt); go.stun = Math.max(0, go.stun - dt); go.slow = Math.max(0, go.slow - dt);
    g.inv = Math.max(0, g.inv - dt); g.shake = Math.max(0, g.shake - dt);
    if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) g.combo = 0; }

    // --- keçi hareketi
    go.yaw -= input.jx * (go.dashT > 0 ? 1.2 : 2.5) * dt;
    const base = 6.5 + Math.min(g.t * 0.035, 4.5);
    let sp = base * (input.jy >= 0 ? 1 + 0.55 * input.jy : 1 + 0.7 * input.jy);
    if (go.slow > 0) sp *= 0.55;
    if (go.dashT > 0) sp += 6 + 10 * (go.dashT / DASH);
    if (go.stun > 0) sp = -3 * (go.stun / 0.45);
    go.speed += (sp - go.speed) * damp(go.dashT > 0 ? 30 : 8, dt);
    const fx = Math.sin(go.yaw), fz = Math.cos(go.yaw);
    go.x += fx * go.speed * dt; go.z += fz * go.speed * dt;
    g.dist += Math.max(0, go.speed) * dt;
    const gy = groundY(go.x, go.z);
    go.vy -= GRAV * dt; go.y += go.vy * dt;
    if (go.y <= gy) { if (go.vy < -6) burst(go.x, gy + 0.1, go.z, 4, "dust"); go.y = gy; go.vy = 0; go.jumps = 0; }

    // --- engeller
    if (pushOut(go, 0.5) && go.dashT > 0) { go.dashT = 0; g.shake = 0.2; }
    for (const c of collidersNear(go.x, go.z)) {
      if (!c.hurt) continue;
      const d = Math.hypot(go.x - c.x, go.z - c.z);
      if (d < c.r + 0.45 && go.y - groundY(c.x, c.z) < c.h - 0.1) {
        if (g.inv <= 0) { damage(c.label); go.stun = 0.45; go.speed = -3; go.dashT = 0; }
        const dd = d || 1; go.x = c.x + ((go.x - c.x) / dd) * (c.r + 0.45); go.z = c.z + ((go.z - c.z) / dd) * (c.r + 0.45);
      }
    }
    if (mode !== "play") return;

    updatePeople(dt, go, fx, fz);
    if (mode !== "play") return;
    updateVehicles(dt, go, fx, fz);
    if (mode !== "play") return;
    updateAnimals(dt, go);
    updateBirds(dt, go);

    // --- toplanabilirler
    for (let i = g.pickups.length - 1; i >= 0; i--) {
      const pk = g.pickups[i]; pk.t += dt;
      pk.spin.rotation.y += dt * 2; pk.spin.position.y = 0.7 + Math.sin(pk.t * 3) * 0.12;
      const d = Math.hypot(go.x - pk.x, go.z - pk.z);
      if (d < 1.4 && go.y < 2) {
        if (pk.type === "simit") { g.energy = Math.min(100, g.energy + 35); g.score += 5; sfx.yum(); popText(pk.x, 2, pk.z, "Simit! +Enerji", "#8e5b2a", 30); }
        else { g.lives = Math.min(3, g.lives + 1); sfx.heart(); popText(pk.x, 2, pk.z, "+1 can", "#d6402b", 32); }
        scene.remove(pk.root); g.pickups.splice(i, 1); continue;
      }
      if (d > 110) { scene.remove(pk.root); g.pickups.splice(i, 1); }
    }

    // --- enerji
    g.energy -= (3 + Math.min(g.t * 0.012, 3)) * dt;
    if (g.energy <= 0) { g.energy = 0; gameOver("Keçinin enerjisi bitti!"); return; }

    // --- nüfus
    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      g.spawnT = 0.4;
      if (g.people.filter((p) => !p.flying).length < Math.min(22, 14 + Math.floor(g.t / 30))) spawnPerson(false);
      if (g.vehicles.length < 12) spawnVehicle(false);
      if (g.animals.length < 5) spawnAnimal(false);
      if (g.pickups.filter((p) => p.type === "simit").length < 4) spawnPickup("simit");
      if (g.lives < 3 && !g.pickups.some((p) => p.type === "elma") && Math.random() < 0.06) spawnPickup("elma");
      spawnPigeons(go.x, go.z);
    }
    updateFx(dt);
    syncHud();
  }

  function updatePeople(dt, go, fx, fz) {
    for (let i = g.people.length - 1; i >= 0; i--) {
      const p = g.people[i], k = KINDS[p.kind];
      p.flash = Math.max(0, p.flash - dt); p.hitCd = Math.max(0, p.hitCd - dt);
      p.inst.mixer.update(dt);
      if (p.flying) {
        p.vy -= GRAV * 0.75 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.root.rotation.x += p.spin.x * dt; p.root.rotation.z += p.spin.z * dt; p.root.rotation.y += p.spin.y * dt;
        const gy = groundY(p.x, p.z);
        if (blockedAt(p.x, p.z, 0.3) && p.y < 12) { p.vx *= -0.3; p.vz *= -0.3; pushOut(p, 0.35); }
        if (p.y <= gy && p.vy < 0) {
          p.y = gy;
          if (p.bounced < 1) { p.vy = -p.vy * 0.3; p.vx *= 0.5; p.vz *= 0.5; p.bounced++; burst(p.x, gy + 0.1, p.z, 5, "dust"); }
          else { p.vx = p.vz = p.vy = 0; p.spin.set(0, 0, 0); p.root.rotation.set(-Math.PI / 2, p.root.rotation.y, 0); p.root.position.y = gy + 0.15; p.fade -= dt * 0.7; }
        }
        if (p.y > gy + 0.2 && Math.hypot(p.vx, p.vz) > 4) for (const q of g.people) if (q !== p && !q.flying && Math.hypot(q.x - p.x, q.z - p.z) < 1.2 && Math.abs(q.y - p.y) < 2) knockPerson(q, p, true);
        if (p.fade <= 0) { scene.remove(p.root); g.people.splice(i, 1); continue; }
        if (p.fade < 1) p.root.scale.setScalar(Math.max(0.01, p.fade));
        p.root.position.set(p.x, p.fade < 1 ? p.y + 0.15 : p.y, p.z);
        continue;
      }
      const dx = go.x - p.x, dz = go.z - p.z, d = Math.hypot(dx, dz) || 0.01;
      let vx = 0, vz = 0, spd = 0, anim = null, ts = 1;
      if (p.kind === "bekci" && d < 32) {
        p.mode = "chase"; spd = k.chase + Math.min(g.t * 0.01, 1.5); vx = dx / d; vz = dz / d; anim = "run"; ts = 1.1;
      } else if (p.kind !== "bekci" && d < 9) {
        p.mode = "flee"; p.calm = 3; spd = k.flee; vx = -dx / d; vz = -dz / d; anim = "run"; ts = 1;
      } else if (p.mode === "flee" || p.mode === "free" || p.mode === "chase") {
        p.calm -= dt; p.mode = "free";
        if (p.calm <= 0 || !p.wyaw) { p.wyaw = rand(0, 6.28); p.calm = rand(2, 4); }
        spd = k.walk; vx = Math.sin(p.wyaw); vz = Math.cos(p.wyaw); anim = p.kind === "kosucu" ? "run" : "walk"; ts = 1;
      } else if (p.kind === "dansci") {
        vx = dx / d; vz = dz / d; spd = 0;
      } else { // kaldırımda yürüyüş
        p.s += p.dir * k.walk * dt;
        const [nx, nz] = sidewalkPoint(p.cx, p.cz, p.s, p.inset);
        vx = nx - p.x; vz = nz - p.z; const l = Math.hypot(vx, vz) || 1; vx /= l; vz /= l; spd = 0;
        if (!blockedAt(nx, nz, 0.35)) { p.x = nx; p.z = nz; } else { p.inset = p.inset > 2.4 ? 1.6 : 3.2; }
        anim = p.kind === "kosucu" ? "run" : "walk"; ts = 1;
        if (Math.hypot(p.x - go.x, p.z - go.z) > 95) { scene.remove(p.root); g.people.splice(i, 1); continue; }
      }
      if (spd > 0) {
        const ox = p.x, oz = p.z;
        p.x += vx * spd * dt; p.z += vz * spd * dt;
        if (pushOut(p, 0.35) && p.mode === "free") p.wyaw = rand(0, 6.28);
        if (Math.hypot(p.x - ox, p.z - oz) < spd * dt * 0.2 && p.mode === "flee") { p.x += vz * spd * dt; p.z -= vx * spd * dt; }
      }
      if (p.kind === "dansci" && p.mode === "path") { anim = "sambadance"; ts = 1; }
      if (!anim) anim = spd > 3 ? "run" : "walk";
      play(p.inst, p.inst.actions[anim] ? anim : "walk", anim === "run" && p.mode === "flee" ? 1.15 : ts > 2 ? 1 : ts);
      if (vx || vz) p.yaw += angDiff(p.yaw, Math.atan2(vx, vz)) * damp(10, dt);
      p.root.rotation.y = p.yaw + MODEL_YAW[p.model];
      p.y = groundY(p.x, p.z);
      p.root.position.set(p.x, p.y, p.z);
      p.root.visible = !(p.flash > 0 && Math.floor(p.flash * 20) % 2 === 0);

      if (d < 1.9 && Math.abs(go.y - p.y) < 1.4 && p.hitCd <= 0) {
        const front = (fx * -dx + fz * -dz) / d;
        if (go.dashT > 0 && front > 0.1) knockPerson(p, go, false);
        else if (d < 1.0) {
          if (p.kind === "bekci") { damage("Bekçi yakaladı!"); p.hitCd = 1; go.speed = -4; }
          else { p.x -= (dx / d) * 0.5; p.z -= (dz / d) * 0.5; }
        }
        if (mode !== "play") return;
      }
      if (d > 95) { scene.remove(p.root); g.people.splice(i, 1); }
    }
  }

  function updateVehicles(dt, go, fx, fz) {
    g.honkT = Math.max(0, g.honkT - dt);
    for (let i = g.vehicles.length - 1; i >= 0; i--) {
      const v = g.vehicles[i];
      v.hitCd = Math.max(0, v.hitCd - dt);
      if (v.mixer) v.mixer.update(dt * (v.speed / 10));
      const ax = v.axis === "x" ? v.dir : 0, az = v.axis === "z" ? v.dir : 0; // yön vektörü
      if (v.state === "wreck") {
        v.wreckT -= dt; v.speed = 0;
        v.latOff += (v.latPush - v.latOff) * damp(8, dt);
        v.hopV -= GRAV * dt; v.hop = Math.max(0, v.hop + v.hopV * dt);
        if (v.wreckT <= 0) { v.state = "drive"; v.latPush = 0; v.yawOff = 0; v.speed = 2; }
      } else {
        // önünde keçi / insan / araç varsa fren
        let target = v.cruise;
        const rel = (px, pz) => [(px - v.x) * ax + (pz - v.z) * az, Math.abs((px - v.x) * az - (pz - v.z) * ax)];
        const [ga, gl] = rel(go.x, go.z);
        if (ga > 0 && ga < 14 && gl < 2.2) { target = Math.min(target, Math.max(0, (ga - 3.5) * 1.2)); if (g.honkT <= 0 && v.honked <= 0) { sfx.honk(); g.honkT = 1.5; v.honked = 4; } }
        for (const p of g.people) { if (p.flying) continue; const [pa, pl] = rel(p.x, p.z); if (pa > 0 && pa < 10 && pl < 1.8) target = Math.min(target, Math.max(0, (pa - 3) * 1.3)); }
        for (const o of g.vehicles) {
          if (o === v) continue;
          const [oa, ol] = rel(o.x, o.z);
          const same = o.axis === v.axis && o.dir === v.dir && Math.abs(o.lat - v.lat) < 1;
          if (same && oa > 0 && oa < (o.L + v.L) / 2 + 6) target = Math.min(target, o.speed * 0.9, Math.max(0, oa - (o.L + v.L) / 2 - 2));
          else if (!same && o.axis !== v.axis && v.waitT < 3 && oa > 0 && oa < v.L / 2 + 7 && ol < (o.L + v.W) / 2 + 0.5) target = Math.min(target, Math.max(0, oa - v.L / 2 - 2.5));
        }
        v.waitT = v.speed < 0.5 ? (v.waitT || 0) + dt : 0;
        v.honked = Math.max(0, (v.honked || 0) - dt);
        v.speed += (target - v.speed) * damp(target < v.speed ? 4 : 1.2, dt);
        v.latOff += (0 - v.latOff) * damp(1.5, dt); v.yawOff += (0 - v.yawOff) * damp(2, dt);
        v.hop = 0;
      }
      v.along += v.speed * dt * v.dir;
      const lat = v.lat + v.latOff;
      v.x = v.axis === "z" ? lat : v.along; v.z = v.axis === "z" ? v.along : lat;
      v.root.position.set(v.x, v.hop, v.z);
      v.root.rotation.y = v.yaw + v.yawOff + (v.kind === "truck" ? truckYaw : 0);
      for (const w of v.wheels) w.children.forEach((c) => { c.rotation.x += v.speed * dt / 0.34; });
      // fren lambası ve dörtlüler
      const braking = v.state === "wreck" ? Math.floor(v.wreckT * 3) % 2 === 0 : v.speed < v.cruise * 0.6;
      if (v.body && v.body.children) v.body.children.forEach((c) => { if (c.userData.tail) c.material = v.state === "wreck" ? (braking ? CARMAT.hazard : CARMAT.tail) : braking ? CARMAT.tailOn : CARMAT.tail; });

      // keçi ile çarpışma (araç yerel koordinatı)
      const rx = go.x - v.x, rz = go.z - v.z;
      const c = Math.cos(v.yaw + v.yawOff), s = Math.sin(v.yaw + v.yawOff);
      const la = rx * s + rz * c, ll = rx * c - rz * s;
      if (Math.abs(la) < v.L / 2 + 0.45 && Math.abs(ll) < v.W / 2 + 0.45 && go.y < v.H + v.hop) {
        const toCar = ((v.x - go.x) * fx + (v.z - go.z) * fz) / (Math.hypot(v.x - go.x, v.z - go.z) || 1);
        if (go.dashT > 0 && toCar > 0 && v.hitCd <= 0) { knockVehicle(v); v.hitCd = 1.2; go.dashT = 0; go.speed = -2; }
        else if (v.state !== "wreck" && v.speed > 2.5 && g.inv <= 0) { damage("Araba çarptı!"); go.stun = 0.5; go.x += ax * 2.5; go.z += az * 2.5; }
        // dışarı it
        const pushL = (v.W / 2 + 0.46 - Math.abs(ll)), pushA = (v.L / 2 + 0.46 - Math.abs(la));
        if (pushL < pushA) { const sgn = Math.sign(ll) || 1; go.x += c * pushL * sgn; go.z -= s * pushL * sgn; }
        else { const sgn = Math.sign(la) || 1; go.x += s * pushA * sgn; go.z += c * pushA * sgn; }
        if (mode !== "play") return;
      }
      if (Math.hypot(v.x - go.x, v.z - go.z) > 150) { scene.remove(v.root); g.vehicles.splice(i, 1); }
    }
  }

  function updateAnimals(dt, go) {
    for (let i = g.animals.length - 1; i >= 0; i--) {
      const a = g.animals[i];
      a.inst.mixer.update(dt);
      const dx = go.x - a.x, dz = go.z - a.z, d = Math.hypot(dx, dz) || 0.01;
      let vx = 0, vz = 0, spd = 0, anim = "survey", ts = 1;
      a.barkT = Math.max(0, a.barkT - dt);
      if (a.kind === "kopek" && d < 16 && d > 1.6) { // köpek keçiyi kovalar ve havlar
        spd = 6.2; vx = dx / d; vz = dz / d; anim = "run";
        if (a.barkT <= 0) { sfx.bark(); a.barkT = rand(1.2, 2.2); popText(a.x, 1.4, a.z, "Hav hav!", "#2b1d14", 24); }
      } else if (a.kind === "kopek" && d <= 1.6) {
        anim = "survey"; if (go.slow <= 0 && go.dashT <= 0) { go.slow = 0.8; popText(go.x, 2.2, go.z, "Köpek yavaşlattı", "#2b1d14", 22); }
        if (go.dashT > 0) { a.x -= dx / d * 3; a.z -= dz / d * 3; popText(a.x, 1.4, a.z, "Kaçtı!", "#2b1d14", 22); }
      } else if (a.kind === "kedi" && d < 7) { spd = 7; vx = -dx / d; vz = -dz / d; anim = "run"; }
      else {
        a.t -= dt; if (a.t <= 0) { a.t = rand(2, 5); a.state = Math.random() < 0.5 ? "idle" : "walk"; a.wyaw = rand(0, 6.28); }
        if (a.state === "walk") { spd = 1.3; vx = Math.sin(a.wyaw); vz = Math.cos(a.wyaw); anim = "walk"; }
      }
      if (spd) { a.x += vx * spd * dt; a.z += vz * spd * dt; if (pushOut(a, 0.3)) a.wyaw = rand(0, 6.28); a.yaw += angDiff(a.yaw, Math.atan2(vx, vz)) * damp(10, dt); }
      play(a.inst, anim, ts);
      a.y = groundY(a.x, a.z);
      a.root.position.set(a.x, a.y, a.z); a.root.rotation.y = a.yaw + MODEL_YAW.fox;
      if (d > 100) { scene.remove(a.root); g.animals.splice(i, 1); }
    }
  }

  function updateBirds(dt, go) {
    for (let i = g.birds.length - 1; i >= 0; i--) {
      const b = g.birds[i];
      b.inst.mixer.update(dt);
      if (b.kind === "leylek") {
        b.a += b.w * dt;
        if (Math.hypot(b.cx - go.x, b.cz - go.z) > 60) { b.cx += (go.x - b.cx) * dt * 0.2; b.cz += (go.z - b.cz) * dt * 0.2; }
        const x = b.cx + Math.sin(b.a) * b.r, z = b.cz + Math.cos(b.a) * b.r;
        b.root.position.set(x, b.y + Math.sin(b.a * 3) * 0.8, z);
        b.root.rotation.y = b.a + (b.w > 0 ? Math.PI / 2 : -Math.PI / 2) + MODEL_YAW.bird;
        continue;
      }
      // güvercin
      const d = Math.hypot(go.x - b.x, go.z - b.z);
      if (b.state === "ground") {
        b.t -= dt;
        if (b.t <= 0) { b.t = rand(0.5, 2); b.root.rotation.y += rand(-1, 1); }
        b.root.position.y = b.y + Math.abs(Math.sin(g.t * 6 + b.x)) * 0.02;
        if (d < 6 || (go.dashT > 0 && d < 10)) {
          b.state = "fly"; if (b.inst.current) b.inst.current.timeScale = 1.6;
          const a = Math.atan2(b.x - go.x, b.z - go.z) + rand(-0.6, 0.6);
          b.vx = Math.sin(a) * rand(4, 7); b.vz = Math.cos(a) * rand(4, 7); b.vy = rand(4, 6);
          b.root.rotation.y = a + MODEL_YAW.bird;
          if (Math.random() < 0.4) sfx.flap();
          if (!b.scored) { b.scored = true; g.score += 1; }
        }
      } else {
        b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt; b.vy = Math.max(1.5, b.vy - dt * 1.5);
        b.root.position.set(b.x, b.y, b.z);
        if (b.y > 40) { scene.remove(b.root); g.birds.splice(i, 1); continue; }
      }
      if (d > 140) { scene.remove(b.root); g.birds.splice(i, 1); const c = chunks.get(b.chunk); if (c) c.pigeonsDone = false; }
    }
    if (g.birds.filter((b) => b.kind === "leylek").length < 3) spawnBird();
  }

  // Modellerin ön yönü (+z'ye göre)
  const MODEL_YAW = { woman: 0, man: 0, guard: Math.PI, fox: 0, bird: 0 };

  function animateGoat(dt) {
    const go = g.goat;
    goat.root.position.set(go.x, go.y, go.z);
    goat.root.rotation.y = go.yaw;
    const sp = Math.abs(go.speed), air = go.y - groundY(go.x, go.z) > 0.05;
    go.phase += dt * (2 + sp * 1.25);
    const amp = air ? 0 : Math.min(0.75, sp * 0.07), s = Math.sin(go.phase);
    goat.legs.forEach((L, i) => {
      const ph = i === 0 || i === 3 ? 0 : Math.PI;
      const sw = Math.sin(go.phase + ph);
      L.hip.rotation.x = air ? (L.front ? -0.7 : 0.7) : sw * amp;
      L.knee.rotation.x = air ? (L.front ? 1.1 : -0.6) : (L.front ? Math.max(0, -sw) * amp * 1.4 : -Math.max(0, sw) * amp * 1.2);
    });
    goat.body.position.y = air ? 0 : Math.abs(Math.cos(go.phase)) * Math.min(0.1, sp * 0.01);
    const dashing = go.dashT > 0;
    goat.neck.rotation.x += ((dashing ? 1.1 : 0.05 + s * 0.03) - goat.neck.rotation.x) * damp(dashing ? 30 : 10, dt);
    goat.head.rotation.x += ((dashing ? 0.45 : 0) - goat.head.rotation.x) * damp(20, dt);
    goat.body.rotation.x += ((air ? -0.15 : dashing ? 0.12 : 0) - goat.body.rotation.x) * damp(10, dt);
    goat.tail.rotation.x = -0.5 + Math.sin(go.phase * 2) * 0.35;
    goat.root.visible = !(g.inv > 0 && Math.floor(g.inv * 12) % 2 === 0);
    shadowBlob.position.set(go.x, groundY(go.x, go.z) + 0.02, go.z);
    shadowBlob.scale.setScalar(Math.max(0.4, 1 - (go.y - groundY(go.x, go.z)) * 0.15));
  }

  // Kamera: binaların içine girmemek için çarpışmalı takip kamerası
  function rayBoxT(ox, oz, dx, dz, c) {
    let tmin = 0, tmax = 1;
    for (const [o, d, lo, hi] of [[ox, dx, c.x0, c.x1], [oz, dz, c.z0, c.z1]]) {
      if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) return 1; continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d; if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return 1;
    }
    return tmin;
  }
  function updateCamera(dt, menu) {
    const go = g.goat;
    if (menu) {
      camYaw += dt * 0.15;
      camPos.set(go.x + Math.sin(camYaw) * 5.2, go.y + 1.9, go.z + Math.cos(camYaw) * 5.2);
      camLook.set(go.x - 1.6 * Math.cos(camYaw), go.y + 1.1, go.z + 1.6 * Math.sin(camYaw));
      camera.position.copy(camPos);
    } else {
      camYaw += angDiff(camYaw, go.yaw) * damp(4, dt);
      const back = 7.4, up = 4.0;
      let tx = go.x - Math.sin(camYaw) * back, tz = go.z - Math.cos(camYaw) * back;
      let tmin = 1;
      for (const c of collidersNear(go.x, go.z)) if (c.box) tmin = Math.min(tmin, rayBoxT(go.x, go.z, tx - go.x, tz - go.z, c));
      if (tmin < 1) { const t = Math.max(0.22, tmin - 0.06); tx = go.x + (tx - go.x) * t; tz = go.z + (tz - go.z) * t; }
      camPos.x += (tx - camPos.x) * damp(tmin < 1 ? 20 : 10, dt); camPos.z += (tz - camPos.z) * damp(tmin < 1 ? 20 : 10, dt);
      camPos.y += (go.y + up + (tmin < 1 ? 1.2 : 0) - camPos.y) * damp(6, dt);
      camLook.set(go.x + Math.sin(camYaw) * 4, go.y + 1.2, go.z + Math.cos(camYaw) * 4);
      camera.position.copy(camPos);
      if (g.shake > 0) { const s = g.shake * 0.5; camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); }
      const fovT = baseFov + Math.min(12, Math.max(0, go.speed - 7) * 0.8);
      camera.fov += (fovT - camera.fov) * damp(4, dt); camera.updateProjectionMatrix();
    }
    camera.lookAt(camLook);
    sun.position.set(go.x + SUN_DIR.x * 80, SUN_DIR.y * 80, go.z + SUN_DIR.z * 80); sun.target.position.set(go.x, 0, go.z);
    ground.position.set(Math.round(go.x / 8) * 8, 0, Math.round(go.z / 8) * 8);
  }

  // ================= HUD =================
  const ui = { hud: $("hud"), score: $("score"), mult: $("mult"), hearts: $("hearts"), energy: $("energy"), energyBar: $("energyBar"), hits: $("hits"), tosRing: $("tosRing"), pads: $("pads"), joy: $("joy") };
  let lastHud = "";
  function syncHud() {
    const mult = Math.min(5, g.combo), e = Math.round(g.energy), hitsTotal = g.hits + g.carHits;
    const k = g.score + "|" + mult + "|" + g.lives + "|" + e + "|" + hitsTotal;
    if (k !== lastHud) {
      lastHud = k;
      ui.score.textContent = g.score; ui.hits.textContent = hitsTotal;
      ui.hearts.textContent = "♥".repeat(Math.max(0, g.lives)) + "♡".repeat(Math.max(0, 3 - g.lives));
      ui.mult.hidden = mult < 2; ui.mult.textContent = "x" + mult;
      ui.energy.style.transform = `scaleX(${e / 100})`; ui.energyBar.classList.toggle("low", e < 25);
    }
    ui.tosRing.setAttribute("stroke-dashoffset", String(Math.round((g.goat.cd / DASH_CD) * 100)));
    drawMinimap();
  }
  const mm = $("minimap"), mx = mm.getContext("2d");
  function drawMinimap() {
    const S = mm.width, R = S / 2, range = 60, k = R / range, go = g.goat;
    mx.clearRect(0, 0, S, S);
    mx.save(); mx.beginPath(); mx.arc(R, R, R, 0, Math.PI * 2); mx.clip();
    mx.fillStyle = "#5c5e62"; mx.fillRect(0, 0, S, S);
    const c = Math.cos(go.yaw), s = Math.sin(go.yaw);
    const toMap = (x, z) => { const dx = x - go.x, dz = z - go.z; return [R - (dx * c - dz * s) * k, R - (dx * s + dz * c) * k]; };
    mx.lineJoin = "round";
    for (const ch of chunks.values()) {
      const x0 = ch.cx * CELL + ROAD, z0 = ch.cz * CELL + ROAD, x1 = x0 + CELL - 2 * ROAD, z1 = z0 + CELL - 2 * ROAD;
      if (Math.hypot((x0 + x1) / 2 - go.x, (z0 + z1) / 2 - go.z) > range + 50) continue;
      const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => toMap(x, z));
      mx.fillStyle = ch.type === "park" ? "#6f9a4a" : ch.type === "square" ? "#cdbfa6" : "#a9a39a";
      mx.beginPath(); corners.forEach(([px, py], i) => (i ? mx.lineTo(px, py) : mx.moveTo(px, py))); mx.closePath(); mx.fill();
      for (const col of ch.cols) if (col.box) {
        const pts = [[col.x0, col.z0], [col.x1, col.z0], [col.x1, col.z1], [col.x0, col.z1]].map(([x, z]) => toMap(x, z));
        mx.fillStyle = "#e9dfcc"; mx.strokeStyle = "rgba(43,29,20,0.35)"; mx.lineWidth = 1.5;
        mx.beginPath(); pts.forEach(([px, py], i) => (i ? mx.lineTo(px, py) : mx.moveTo(px, py))); mx.closePath(); mx.fill(); mx.stroke();
      }
    }
    for (const v of g.vehicles) {
      const [px, py] = toMap(v.x, v.z); mx.save(); mx.translate(px, py); mx.rotate(-(v.yaw - go.yaw));
      mx.fillStyle = v.kind === "taxi" ? "#f5c518" : v.kind === "bus" ? "#2a73b8" : "#f4f4f4"; mx.fillRect(-v.W * k / 2 - 1, -v.L * k / 2, v.W * k + 2, v.L * k); mx.restore();
    }
    for (const pk of g.pickups) { const [px, py] = toMap(pk.x, pk.z); mx.fillStyle = pk.type === "simit" ? "#a8662c" : "#d6402b"; mx.beginPath(); mx.arc(px, py, 6, 0, 7); mx.fill(); }
    for (const p of g.people) {
      if (p.flying) continue;
      const [px, py] = toMap(p.x, p.z);
      mx.fillStyle = p.kind === "bekci" ? "#1b2a55" : p.kind === "kosucu" ? "#e67e22" : "#3498db";
      mx.strokeStyle = "#fff"; mx.lineWidth = 2; mx.beginPath(); mx.arc(px, py, p.kind === "bekci" ? 8 : 6, 0, 7); mx.fill(); mx.stroke();
    }
    mx.restore();
    mx.fillStyle = "#fff6e3"; mx.strokeStyle = "#2b1d14"; mx.lineWidth = 3;
    mx.beginPath(); mx.moveTo(R, R - 16); mx.lineTo(R + 11, R + 11); mx.lineTo(R, R + 5); mx.lineTo(R - 11, R + 11); mx.closePath(); mx.fill(); mx.stroke();
  }

  // ================= Ekranlar =================
  const screens = { loading: $("loading"), menu: $("menu"), how: $("how"), paused: $("paused"), over: $("over") };
  function only(name) { for (const k2 in screens) screens[k2].hidden = k2 !== name; }
  function setPlayUi(on) { ui.hud.hidden = !on; ui.pads.hidden = !on; ui.joy.hidden = !on; if (on) joyHome(); }
  function refreshSoundLabels() { const t = "Ses: " + (soundOn ? "Açık" : "Kapalı"); $("soundBtn").textContent = t; $("pauseSoundBtn").textContent = t; }
  function toggleSound() { soundOn = !soundOn; store.set("keci3d-ses", soundOn); refreshSoundLabels(); if (soundOn) sfx.bleat(); }
  function toMenu() {
    mode = "menu"; newGame(); setPlayUi(false); only("menu"); $("menuBest").textContent = best;
    for (const p of pops) p.el.remove(); pops.length = 0;
  }
  function start() {
    audio(); newGame(); lastHud = "";
    const go = g.goat; camYaw = go.yaw; camPos.set(go.x, go.y + 4, go.z - 7.4);
    mode = "play"; only(null); setPlayUi(true); syncHud(); sfx.bleat();
  }
  function gameOver(title) {
    if (mode !== "play") return;
    mode = "over";
    const isBest = g.score > best;
    if (isBest) { best = g.score; store.set("keci-sehir-rekor", best); }
    $("overTitle").textContent = title; $("finalScore").textContent = g.score; $("bestScore").textContent = best;
    $("overLine").textContent = `${g.hits} kişiyi ve ${g.carHits} aracı tosladın, ${Math.round(g.dist)} metre koştun.`;
    $("newBest").hidden = !(isBest && g.score > 0);
    ui.pads.hidden = true; ui.joy.hidden = true;
    setTimeout(() => { if (mode === "over") { only("over"); $("againBtn").focus({ preventScroll: true }); } }, 900);
  }
  function pause() { if (mode === "play") { mode = "pause"; only("paused"); } }
  function resume() { if (mode === "pause") { mode = "play"; only(null); } }
  $("playBtn").addEventListener("click", start); $("againBtn").addEventListener("click", start);
  $("howBtn").addEventListener("click", () => only("how")); $("howClose").addEventListener("click", () => only("menu"));
  $("soundBtn").addEventListener("click", toggleSound); $("pauseSoundBtn").addEventListener("click", toggleSound);
  $("resumeBtn").addEventListener("click", resume); $("quitBtn").addEventListener("click", toMenu); $("overMenuBtn").addEventListener("click", toMenu);
  $("pauseBtn").addEventListener("click", pause); $("pauseBtn").addEventListener("pointerdown", (ev) => ev.stopPropagation());
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  document.addEventListener("gesturestart", (ev) => ev.preventDefault());
  document.addEventListener("touchmove", (ev) => ev.preventDefault(), { passive: false });
  document.addEventListener("dblclick", (ev) => ev.preventDefault());

  let baseFov = 58;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; baseFov = w / h < 1 ? 72 : 58; camera.fov = baseFov; camera.updateProjectionMatrix();
    if (joy.id === null) joyHome();
  }
  window.addEventListener("resize", resize);

  // ================= Zemin =================
  const ground = new T.Mesh(planeUV(480, 480, 8, 8), MAT.asphalt);
  ground.receiveShadow = true; scene.add(ground);

  // ================= Döngü =================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === "play") update(dt);
    else if (mode === "over") {
      updateFx(dt);
      for (const p of g.people) if (p.flying) { p.inst.mixer.update(dt); p.vy -= GRAV * 0.75 * dt; p.x += p.vx * dt; p.y = Math.max(groundY(p.x, p.z), p.y + p.vy * dt); p.z += p.vz * dt; p.root.position.set(p.x, p.y, p.z); }
    } else if (mode === "menu") {
      for (const p of g.people) { p.inst.mixer.update(dt); }
      for (const b of g.birds) b.inst.mixer.update(dt);
      for (const a of g.animals) a.inst.mixer.update(dt);
    }
    if (mode !== "pause") {
      animateGoat(dt);
      updateCamera(dt, mode === "menu");
      updateChunks(g.goat.x, g.goat.z, false);
      updatePops(dt);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // ================= Başlat =================
  resize(); refreshSoundLabels();
  goat = buildGoat(); goat.root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(goat.root);
  shadowBlob = new T.Mesh(new T.CircleGeometry(0.7, 20), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  shadowBlob.rotation.x = -Math.PI / 2; scene.add(shadowBlob);
  Promise.all([loadModels(), loadEnv()]).then(() => {
    shareLocomotion();
    loadingText.textContent = "Şehir kuruluyor…";
    setTimeout(() => {
      updateChunks(32, 20.5, true);
      toMenu();
      if (location.hash === "#test") window.__k = { get g() { return g; }, headbutt, jump, spawnPerson, spawnVehicle, knockVehicle, MODEL_YAW, camera, scene, renderer, start, protos };
      requestAnimationFrame((t) => { last = t; frame(t); });
    }, 30);
  }).catch((e) => { loadingText.textContent = "Bir dosya yüklenemedi (" + e.message + "). Sayfayı yenile."; console.error(e); });
})();
