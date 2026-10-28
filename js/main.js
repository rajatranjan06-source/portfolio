import * as THREE from 'three';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover)').matches;

$('#year').textContent = new Date().getFullYear();

/* ---------------- Toast ---------------- */
const toastEl = $('#toast');
let toastT;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

/* ---------------- 4D Tesseract scene ---------------- */
const state = { planes: { xw: true, yw: true, zw: true }, manualW: 0, warp: 0, page: 0, dragX: 0, dragY: 0, scroll: 0 };
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('#hyper'), antialias: true, alpha: true });
} catch (e) { renderer = null; }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060f, 0.035);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 0, 7);

  // Glow sprite texture
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  // Tesseract data
  const verts4 = [];
  for (let i = 0; i < 16; i++) verts4.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
  const edges = [];
  for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (i < j) edges.push([i, j]); }

  const group = new THREE.Group();
  scene.add(group);

  const linePos = new Float32Array(edges.length * 6);
  const lineCol = new Float32Array(edges.length * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
  group.add(lines);

  // Thick-ish glow copy (slightly scaled) for a neon feel
  const lines2 = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending }));
  lines2.scale.setScalar(1.015);
  group.add(lines2);

  const ptPos = new Float32Array(16 * 3);
  const ptCol = new Float32Array(16 * 3);
  const ptGeo = new THREE.BufferGeometry();
  ptGeo.setAttribute('position', new THREE.BufferAttribute(ptPos, 3));
  ptGeo.setAttribute('color', new THREE.BufferAttribute(ptCol, 3));
  const pts = new THREE.Points(ptGeo, new THREE.PointsMaterial({ size: 0.45, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(pts);

  // Inner ghost polytope: a 16-cell (4D cross polytope)
  const cross4 = [];
  for (let a = 0; a < 4; a++) for (const s of [-1, 1]) { const v = [0, 0, 0, 0]; v[a] = s * 1.5; cross4.push(v); }
  const crossEdges = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (Math.floor(i / 2) !== Math.floor(j / 2)) crossEdges.push([i, j]);
  const crossPos = new Float32Array(crossEdges.length * 6);
  const crossGeo = new THREE.BufferGeometry();
  crossGeo.setAttribute('position', new THREE.BufferAttribute(crossPos, 3));
  const crossLines = new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({ color: 0x7c5cff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending }));
  group.add(crossLines);

  // Starfield
  const STARS = 2200;
  const sPos = new Float32Array(STARS * 3);
  const sCol = new Float32Array(STARS * 3);
  const palette = [new THREE.Color(0x00f0ff), new THREE.Color(0xff2bd6), new THREE.Color(0xffd166), new THREE.Color(0xffffff), new THREE.Color(0xffffff)];
  for (let i = 0; i < STARS; i++) {
    sPos[i * 3] = (Math.random() - 0.5) * 80;
    sPos[i * 3 + 1] = (Math.random() - 0.5) * 80;
    sPos[i * 3 + 2] = -Math.random() * 120 + 10;
    const c = palette[(Math.random() * palette.length) | 0];
    sCol.set([c.r, c.g, c.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.18, map: glowTex, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(stars);

  const cA = new THREE.Color(0x00f0ff), cB = new THREE.Color(0xff2bd6), tmp = new THREE.Color();

  function rot(v, a, b, t) {
    const c = Math.cos(t), s = Math.sin(t);
    const x = v[a], y = v[b];
    v[a] = x * c - y * s; v[b] = x * s + y * c;
  }
  function project(v4, out, o, dist = 3) {
    const k = 1 / (dist - v4[3]);
    out[o] = v4[0] * k * 2.2; out[o + 1] = v4[1] * k * 2.2; out[o + 2] = v4[2] * k * 2.2;
    return k;
  }

  const mouse = { x: 0, y: 0 };
  addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; });

  // drag to rotate in 4D, inside hero only
  let dragging = false, lastX = 0, lastY = 0;
  const hero = $('.hero');
  hero.addEventListener('pointerdown', e => {
    if (e.target.closest('a,button,input,.w-panel')) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  });
  addEventListener('pointerup', () => dragging = false);
  addEventListener('pointermove', e => {
    if (!dragging) return;
    state.dragX += (e.clientX - lastX) * 0.01; state.dragY += (e.clientY - lastY) * 0.01;
    lastX = e.clientX; lastY = e.clientY;
  });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    group.position.x = w > 980 ? 2.4 : 0;
    group.position.y = w > 980 ? 0.2 : 1.2;
  }
  addEventListener('resize', resize); resize();

  /* ---------- Solar system: planets fly in and out with scroll ---------- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sunLight.position.set(-6, 4, 8);
  scene.add(sunLight);

  function planetTex(base, opts = {}) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 512, 256);
    if (opts.bands) {
      for (let y = 0; y < 256; y += 2) {
        const n = Math.sin(y * 0.09) * 0.5 + Math.sin(y * 0.23 + 1) * 0.3 + Math.random() * 0.2;
        x.fillStyle = opts.bands[Math.floor(Math.abs(n) * opts.bands.length) % opts.bands.length];
        x.globalAlpha = 0.55; x.fillRect(0, y, 512, 2);
      }
      x.globalAlpha = 1;
    }
    if (opts.spots) {
      for (let i = 0; i < opts.spots.n; i++) {
        x.fillStyle = opts.spots.colors[i % opts.spots.colors.length];
        x.globalAlpha = opts.spots.alpha ?? 0.5;
        x.beginPath();
        x.ellipse(Math.random() * 512, 30 + Math.random() * 196, 8 + Math.random() * opts.spots.size, 5 + Math.random() * opts.spots.size * 0.6, Math.random() * 3, 0, Math.PI * 2);
        x.fill();
      }
      x.globalAlpha = 1;
    }
    if (opts.redSpot) { x.fillStyle = '#b5523b'; x.beginPath(); x.ellipse(330, 165, 34, 18, 0, 0, Math.PI * 2); x.fill(); }
    if (opts.caps) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 14); x.fillRect(0, 242, 512, 14); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  const BODIES = [
    { name: 'The Sun', r: 3.2, sun: true, color: '#ffb547', tex: { bands: ['#ffcf5a', '#ff9a2e', '#ffe08a'], spots: { n: 60, colors: ['#ff7a1a', '#fff1a8'], size: 20, alpha: 0.4 } } },
    { name: 'Mercury', r: 0.7, color: '#9a8f86', tex: { spots: { n: 90, colors: ['#6f665f', '#b8aea4'], size: 12 } } },
    { name: 'Venus', r: 1.15, color: '#e3bb76', tex: { bands: ['#e8c47f', '#d9a35a', '#f1d79d'] } },
    { name: 'Earth', r: 1.2, color: '#1f5fbf', moon: true, tex: { spots: { n: 45, colors: ['#2f8a3a', '#3f9e45', '#c2b280'], size: 40, alpha: 0.85 }, caps: true } },
    { name: 'Mars', r: 0.9, color: '#c1440e', tex: { spots: { n: 70, colors: ['#8a2f0a', '#e0723a'], size: 22 }, caps: true } },
    { name: 'Jupiter', r: 2.6, color: '#c99b6d', tex: { bands: ['#e3c7a2', '#b07a4f', '#f0e2c8', '#8d5a3b'], redSpot: true } },
    { name: 'Saturn', r: 2.1, color: '#e2c88f', ring: true, tex: { bands: ['#f0dba8', '#cfae6e', '#e6cf97'] } },
    { name: 'Uranus', r: 1.6, color: '#8fd9e0', tex: { bands: ['#9be3ea', '#7fcbd4'] } },
    { name: 'Neptune', r: 1.55, color: '#3a5fd9', tex: { bands: ['#4169e1', '#2c48b5', '#5b7ff0'], spots: { n: 3, colors: ['#1d2f80'], size: 18, alpha: 0.7 } } },
  ];

  const solar = new THREE.Group();
  scene.add(solar);
  const planets = BODIES.map((b, i) => {
    const holder = new THREE.Group();
    const mat = b.sun
      ? new THREE.MeshBasicMaterial({ map: planetTex(b.color, b.tex) })
      : new THREE.MeshStandardMaterial({ map: planetTex(b.color, b.tex), roughness: 0.9, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 48, 32), mat);
    mesh.rotation.z = 0.3;
    holder.add(mesh);
    // atmosphere / corona glow
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: b.color, transparent: true, opacity: b.sun ? 0.9 : 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(b.r * (b.sun ? 4.2 : 2.8));
    holder.add(glow);
    if (b.ring) {
      const rc = document.createElement('canvas'); rc.width = 256; rc.height = 4;
      const rx = rc.getContext('2d');
      for (let k = 0; k < 256; k++) { rx.fillStyle = `rgba(230,205,150,${(0.25 + 0.6 * Math.abs(Math.sin(k * 0.17))) * (k > 40 && k < 60 ? 0.15 : 1)})`; rx.fillRect(k, 0, 1, 4); }
      const ringGeo = new THREE.RingGeometry(b.r * 1.3, b.r * 2.3, 96);
      const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv;
      for (let k = 0; k < pos.count; k++) { const d = Math.hypot(pos.getX(k), pos.getY(k)); uv.setXY(k, (d - b.r * 1.3) / (b.r * 1.0), 0.5); }
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rc), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -1.2; ring.rotation.y = 0.3;
      holder.add(ring);
    }
    let moon = null;
    if (b.moon) {
      moon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 1 }));
      holder.add(moon);
    }
    holder.visible = false;
    solar.add(holder);
    return { ...b, holder, mesh, moon, side: i % 2 === 0 ? 1 : -1, at: 0.05 + i * (0.9 / (BODIES.length - 1)), spin: 0 };
  });

  const label = $('#planet-label');
  let lastPage = 0, scrollVel = 0, currentName = '';
  const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  function updatePlanets(dt, time) {
    const page = state.page;
    scrollVel += ((page - lastPage) / Math.max(dt, 0.001) - scrollVel) * 0.1;
    lastPage = page;
    const narrow = innerWidth < 760;
    let nearest = null, nearestD = 1e9;
    for (const p of planets) {
      const t = (page - p.at) / 0.14; // -1: far away, +1: flown past
      if (t < -1 || t > 1) { p.holder.visible = false; continue; }
      p.holder.visible = true;
      const k = (t + 1) / 2;
      const spread = narrow ? 2.6 : 5;
      p.holder.position.set(
        p.side * (spread + k * k * 6),
        (p.side > 0 ? 1 : -1.2) + Math.sin(time * 0.4 + p.at * 10) * 0.3 - k * 1.5,
        -48 + k * 52
      );
      const s = smooth(-1, -0.55, t) * (narrow ? 0.7 : 1);
      p.holder.scale.setScalar(Math.max(0.001, s));
      p.spin += dt * (0.15 + Math.min(Math.abs(scrollVel) * 6, 4));
      p.mesh.rotation.y = p.spin * (p.sun ? 0.3 : 1);
      if (p.moon) p.moon.position.set(Math.cos(time * 0.8) * p.r * 2, 0.3, Math.sin(time * 0.8) * p.r * 2);
      if (Math.abs(t) < nearestD) { nearestD = Math.abs(t); nearest = p; }
    }
    const name = nearest && nearestD < 0.6 ? nearest.name : '';
    if (name !== currentName && label) {
      currentName = name;
      label.classList.toggle('show', !!name);
      if (name) label.querySelector('b').textContent = name;
    }
  }

  const clock = new THREE.Clock();
  let t = 0;
  const v = [0, 0, 0, 0];
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const speed = reduced ? 0.15 : 1 + state.warp * 4;
    t += dt * speed;
    const sc = state.scroll;

    // tesseract
    for (let i = 0; i < 16; i++) {
      v[0] = verts4[i][0]; v[1] = verts4[i][1]; v[2] = verts4[i][2]; v[3] = verts4[i][3];
      if (state.planes.xw) rot(v, 0, 3, t * 0.55 + state.manualW);
      if (state.planes.yw) rot(v, 1, 3, t * 0.37 + state.dragY);
      if (state.planes.zw) rot(v, 2, 3, t * 0.29 + sc * 3);
      rot(v, 0, 2, t * 0.2 + state.dragX);
      rot(v, 1, 2, 0.4);
      const k = project(v, ptPos, i * 3);
      tmp.copy(cA).lerp(cB, (v[3] + 1.8) / 3.6);
      ptCol.set([tmp.r, tmp.g, tmp.b], i * 3);
      verts4[i].p = [ptPos[i * 3], ptPos[i * 3 + 1], ptPos[i * 3 + 2]];
      verts4[i].c = [tmp.r, tmp.g, tmp.b];
      verts4[i].k = k;
    }
    edges.forEach(([a, b], e) => {
      linePos.set(verts4[a].p, e * 6); linePos.set(verts4[b].p, e * 6 + 3);
      lineCol.set(verts4[a].c, e * 6); lineCol.set(verts4[b].c, e * 6 + 3);
    });
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.attributes.color.needsUpdate = true;
    ptGeo.attributes.position.needsUpdate = true;
    ptGeo.attributes.color.needsUpdate = true;

    // 16-cell counter-rotating
    const cp = cross4.map(c => {
      const w = c.slice();
      rot(w, 0, 3, -t * 0.4); rot(w, 1, 3, t * 0.3); rot(w, 0, 1, t * 0.1);
      const o = [0, 0, 0]; project(w, o, 0, 4); return o;
    });
    crossEdges.forEach(([a, b], e) => { crossPos.set(cp[a], e * 6); crossPos.set(cp[b], e * 6 + 3); });
    crossGeo.attributes.position.needsUpdate = true;

    const pulse = 1 + Math.sin(t * 2) * 0.03;
    group.scale.setScalar(pulse * (1 - Math.min(sc, 1) * 0.35));
    group.rotation.z = sc * 1.2;

    // stars fly toward camera, faster on warp
    const starSpeed = (2 + state.warp * 60 + sc * 6) * dt;
    for (let i = 0; i < STARS; i++) {
      const zi = i * 3 + 2;
      sPos[zi] += starSpeed;
      if (sPos[zi] > 8) sPos[zi] -= 128;
    }
    starGeo.attributes.position.needsUpdate = true;

    camera.position.x += (mouse.x * 1.4 - camera.position.x) * 0.05;
    camera.position.y += (-mouse.y * 1.0 - camera.position.y) * 0.05;
    camera.fov += ((55 + state.warp * 35) - camera.fov) * 0.08;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);

    updatePlanets(dt, t);
    state.warp *= 0.985;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
}

/* ---------------- 4D control panel ---------------- */
$('#w-slider').addEventListener('input', e => { state.manualW = e.target.value / 100; });
$$('.toggles [data-plane]').forEach(b => b.addEventListener('click', () => {
  const p = b.dataset.plane; state.planes[p] = !state.planes[p]; b.classList.toggle('active', state.planes[p]);
}));
function warp() {
  state.warp = 1;
  document.body.classList.add('warp');
  setTimeout(() => document.body.classList.remove('warp'), 1800);
}
$('#warp-btn').addEventListener('click', () => { warp(); toast('Warp drive engaged'); });

/* ---------------- Scroll: progress, active nav ---------------- */
const progress = $('#progress');
const navLinks = $$('.nav nav a');
function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = max > 0 ? scrollY / max : 0;
  progress.style.width = (p * 100) + '%';
  state.scroll = scrollY / innerHeight;
  state.page = p;
  let current = '';
  $$('main section[id]').forEach(s => { if (s.getBoundingClientRect().top < innerHeight * 0.4) current = s.id; });
  navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + current));
}
addEventListener('scroll', onScroll, { passive: true }); onScroll();

/* ---------------- Reveal + counters ---------------- */
const io = new IntersectionObserver(entries => entries.forEach(en => {
  if (!en.isIntersecting) return;
  en.target.classList.add('in');
  io.unobserve(en.target);
  const b = en.target.querySelector('[data-count]');
  if (b) {
    const end = +b.dataset.count; let n = 0;
    const iv = setInterval(() => { n++; b.textContent = n; if (n >= end) clearInterval(iv); }, 120);
  }
}), { threshold: 0.15 });
$$('.reveal').forEach(el => io.observe(el));

/* ---------------- Typed roles ---------------- */
const roles = ['Software Development Intern', 'Full-Stack Developer', 'Gen AI Application Builder', 'RAG & LLM Tinkerer', 'Creative Coder'];
const typed = $('#typed');
(async function typeLoop() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; ; i = (i + 1) % roles.length) {
    const w = roles[i];
    for (let c = 1; c <= w.length; c++) { typed.textContent = w.slice(0, c); await sleep(55); }
    await sleep(1600);
    for (let c = w.length; c >= 0; c--) { typed.textContent = w.slice(0, c); await sleep(25); }
    await sleep(250);
  }
})();

/* ---------------- Custom cursor ---------------- */
if (finePointer) {
  const cur = $('#cursor'), dot = $('#cursor-dot');
  let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
  addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; dot.style.transform = `translate(${tx}px,${ty}px) translate(-50%,-50%)`; });
  (function loop() {
    cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
    cur.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  })();
  document.addEventListener('pointerover', e => cur.classList.toggle('hover', !!e.target.closest('a,button,input,.tilt')));
}

/* ---------------- Tilt cards + magnetic buttons ---------------- */
if (finePointer && !reduced) {
  $$('.tilt').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.transition = 'transform .1s ease-out';
      el.style.transform = `perspective(900px) rotateY(${(x - 0.5) * 14}deg) rotateX(${(0.5 - y) * 14}deg) translateZ(10px)`;
      el.style.setProperty('--gx', x * 100 + '%'); el.style.setProperty('--gy', y * 100 + '%');
    });
    el.addEventListener('pointerleave', () => { el.style.transition = 'transform .5s ease'; el.style.transform = ''; });
  });
  $$('.magnetic').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px,${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
    });
    el.addEventListener('pointerleave', () => el.style.transform = '');
  });
}

/* ---------------- Project filters ---------------- */
$$('.filters .chip').forEach(btn => btn.addEventListener('click', () => {
  $$('.filters .chip').forEach(b => b.classList.toggle('active', b === btn));
  const f = btn.dataset.filter;
  $$('.project').forEach(p => p.classList.toggle('hide', f !== 'all' && !p.dataset.tags.split(' ').includes(f)));
}));

/* ---------------- Copy email ---------------- */
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { toast(text); }
}
$('#copy-email').addEventListener('click', e => copy(e.currentTarget.dataset.copy, 'Email copied to clipboard'));

/* ---------------- Game best score + teaser ---------------- */
const best = +(localStorage.getItem('hypershift-best') || 0);
$('#best-score').textContent = best;

(function teaser() {
  const c = $('#teaser'), g = c.getContext('2d');
  const cols = ['#00f0ff', '#ff2bd6', '#ffd166'];
  let w, h, t = 0, visible = false;
  const blocks = Array.from({ length: 14 }, (_, i) => ({ x: Math.random() * 4 - 2, z: i * 4 + 2, p: (Math.random() * 3) | 0, w: 0.6 + Math.random() * 1.2 }));
  function size() { const r = c.getBoundingClientRect(); w = c.width = r.width * Math.min(devicePixelRatio, 2); h = c.height = r.height * Math.min(devicePixelRatio, 2); }
  new ResizeObserver(size).observe(c); size();
  new IntersectionObserver(e => visible = e[0].isIntersecting).observe(c);
  function draw() {
    requestAnimationFrame(draw);
    if (!visible) return;
    t += 0.016;
    g.fillStyle = '#05060f'; g.fillRect(0, 0, w, h);
    const cx = w * 0.68, hy = h * 0.42, f = h * 0.9;
    const P = (x, y, z) => [cx + x * f / (z + 3), hy + (1.6 - y) * f / (z + 3)];
    g.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const z = ((i * 3 - t * 12) % 60 + 60) % 60;
      const a = P(-3, 0, z), b = P(3, 0, z);
      g.strokeStyle = `rgba(124,92,255,${0.5 - z / 130})`;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    for (const s of [-3, -1, 1, 3]) { const a = P(s, 0, 0), b = P(s, 0, 60); g.strokeStyle = 'rgba(0,240,255,.25)'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    const phase = Math.floor(t / 1.5) % 3;
    blocks.sort((a, b) => b.z - a.z).forEach(b => {
      b.z -= 0.016 * 12;
      if (b.z < -1) { b.z += 56; b.x = Math.random() * 4 - 2; b.p = (Math.random() * 3) | 0; }
      const a1 = P(b.x - b.w / 2, 1.1, b.z), a2 = P(b.x + b.w / 2, 0, b.z);
      g.globalAlpha = Math.max(0, Math.min(1, (56 - b.z) / 20));
      g.fillStyle = cols[b.p] + (b.p === phase ? 'cc' : '22');
      g.strokeStyle = cols[b.p];
      g.fillRect(a1[0], a1[1], a2[0] - a1[0], a2[1] - a1[1]);
      g.strokeRect(a1[0], a1[1], a2[0] - a1[0], a2[1] - a1[1]);
      g.globalAlpha = 1;
    });
    const p = P(Math.sin(t * 1.3) * 1.5, 0.4, 0.5);
    g.shadowColor = cols[phase]; g.shadowBlur = 25; g.fillStyle = cols[phase];
    g.beginPath(); g.arc(p[0], p[1], h * 0.03, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
  }
  draw();
})();

/* ---------------- Command palette ---------------- */
const commands = [
  { label: 'Go to About', hint: 'section', run: () => go('#about') },
  { label: 'Go to Skills', hint: 'section', run: () => go('#skills') },
  { label: 'Go to Projects', hint: 'section', run: () => go('#projects') },
  { label: 'Go to Contact', hint: 'section', run: () => go('#contact') },
  { label: 'Play Hyper Shift', hint: 'game', run: () => location.href = 'game.html' },
  { label: 'Open GitHub', hint: 'link', run: () => open('https://github.com/rajatranjan06-source', '_blank', 'noopener') },
  { label: 'Open PrepKit live demo', hint: 'project', run: () => open('https://prep-kit-eight.vercel.app', '_blank', 'noopener') },
  { label: 'Open AirDrawer live demo', hint: 'project', run: () => open('https://air-drawer-two.vercel.app', '_blank', 'noopener') },
  { label: 'Open Support Agent live demo', hint: 'project', run: () => open('https://persona-adaptive-saas-customer-support-agent.streamlit.app/', '_blank', 'noopener') },
  { label: 'Copy email address', hint: 'action', run: () => copy('Rajatranjan06@gmail.com', 'Email copied to clipboard') },
  { label: 'Send an email', hint: 'action', run: () => location.href = 'mailto:Rajatranjan06@gmail.com' },
  { label: 'Call Rajat', hint: 'action', run: () => location.href = 'tel:+916397068019' },
  { label: 'Engage warp drive', hint: 'fun', run: () => warp() },
  { label: 'Toggle rainbow mode', hint: 'fun', run: () => document.body.classList.toggle('rainbow') },
];
function go(sel) { $(sel).scrollIntoView({ behavior: 'smooth' }); }
const pal = $('#palette'), palIn = $('#palette-in'), palList = $('#palette-list');
let sel = 0, filtered = commands;
function renderPal() {
  const q = palIn.value.toLowerCase();
  filtered = commands.filter(c => c.label.toLowerCase().includes(q));
  sel = Math.min(sel, Math.max(0, filtered.length - 1));
  palList.innerHTML = '';
  filtered.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = i === sel ? 'sel' : '';
    li.innerHTML = `<span></span><small>${c.hint}</small>`;
    li.firstChild.textContent = c.label;
    li.addEventListener('click', () => runCmd(c));
    li.addEventListener('pointerenter', () => { sel = i; [...palList.children].forEach((x, j) => x.classList.toggle('sel', j === sel)); });
    palList.appendChild(li);
  });
}
function openPal() { pal.hidden = false; palIn.value = ''; sel = 0; renderPal(); palIn.focus(); }
function closePal() { pal.hidden = true; }
function runCmd(c) { closePal(); c.run(); }
$('#open-palette').addEventListener('click', openPal);
pal.addEventListener('click', e => { if (e.target === pal) closePal(); });
palIn.addEventListener('input', () => { sel = 0; renderPal(); });
palIn.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { sel = (sel + 1) % filtered.length; renderPal(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { sel = (sel - 1 + filtered.length) % filtered.length; renderPal(); e.preventDefault(); }
  if (e.key === 'Enter' && filtered[sel]) runCmd(filtered[sel]);
});

/* ---------------- Konami code + shortcuts ---------------- */
const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let kIdx = 0;
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? openPal() : closePal(); return; }
  if (e.key === 'Escape') closePal();
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  kIdx = k === konami[kIdx] ? kIdx + 1 : (k === konami[0] ? 1 : 0);
  if (kIdx === konami.length) {
    kIdx = 0; warp(); document.body.classList.add('rainbow');
    toast('Konami unlocked: hyperspace mode. Ctrl+K to turn it off.');
  }
});

