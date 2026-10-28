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
const state = { planes: { xw: true, yw: true, zw: true }, manualW: 0, warp: 0, dragX: 0, dragY: 0, scroll: 0 };
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
  { label: 'Go to Terminal', hint: 'section', run: () => go('#terminal') },
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

/* ---------------- Terminal ---------------- */
const out = $('#term-out'), tin = $('#term-in');
const history = []; let hIdx = 0;
function print(html, cls = '') { const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = html; out.appendChild(d); out.scrollTop = out.scrollHeight; }
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cmds = {
  help: () => 'Available commands:\n  about      who is Rajat\n  skills     tech stack\n  projects   list of projects with links\n  contact    how to reach me\n  game       launch Hyper Shift\n  warp       engage warp drive\n  4d         explain the tesseract\n  clear      clear the screen\n  sudo hire rajat',
  about: () => 'Rajat Ranjan: Software Development Intern from Noida, India.\nFull-stack web apps and Generative AI applications.',
  whoami: () => 'a curious visitor in the 4th dimension',
  skills: () => 'frontend : TypeScript, JavaScript, React, Next.js, Tailwind, WebGL\nbackend  : Node.js, Python, MongoDB, REST APIs\ngen ai   : LLMs, RAG, ChromaDB, TTS, MediaPipe, Streamlit',
  projects: () => [
    ['PrepKit', 'https://prep-kit-eight.vercel.app'],
    ['Persona Support Agent', 'https://persona-adaptive-saas-customer-support-agent.streamlit.app/'],
    ['AirDrawer', 'https://air-drawer-two.vercel.app'],
    ['YouTube Shorts Bot', 'https://github.com/rajatranjan06-source/youtube-shorts-bot'],
    ['Ifeels', 'https://ifeels.vercel.app'],
    ['Dentis Website', 'https://dentis-website-omega.vercel.app'],
  ].map(([n, u]) => `  ${n.padEnd(24)}<a href="${u}" target="_blank" rel="noopener">${u.replace('https://', '')}</a>`).join('\n'),
  contact: () => 'email : <a href="mailto:Rajatranjan06@gmail.com">Rajatranjan06@gmail.com</a>\nphone : <a href="tel:+916397068019">+91 6397068019</a>\ngithub: <a href="https://github.com/rajatranjan06-source" target="_blank" rel="noopener">github.com/rajatranjan06-source</a>',
  game: () => { setTimeout(() => location.href = 'game.html', 700); return 'Loading Hyper Shift...'; },
  play: () => cmds.game(),
  warp: () => { warp(); return 'Warp drive engaged.'; },
  '4d': () => 'A tesseract has 16 vertices, 32 edges, 24 square faces and 8 cubic cells.\nThe one behind this page rotates in the XW, YW and ZW planes, then gets\nprojected from 4D into 3D, and from 3D onto your screen.',
  date: () => new Date().toString(),
  ls: () => 'about.txt  skills.json  projects/  game.html  secrets.txt',
  'cat secrets.txt': () => 'Nice try. The only secret is: ship things.',
  'sudo hire rajat': () => 'Permission granted. Opening mail client...' + (setTimeout(() => location.href = 'mailto:Rajatranjan06@gmail.com?subject=Let%27s%20work%20together', 800), ''),
  sudo: () => 'rajat is not in the sudoers file. This incident will be reported. (try: sudo hire rajat)',
  exit: () => 'There is no exit from the 4th dimension.',
};
print('Welcome to RajatOS 4.0 (hyperspace edition)\nType <span class="cmd">help</span> to get started.');
$('#term-form').addEventListener('submit', e => {
  e.preventDefault();
  const raw = tin.value.trim(); tin.value = '';
  if (!raw) return;
  history.push(raw); hIdx = history.length;
  print('<span class="cmd">$ ' + esc(raw) + '</span>');
  const key = raw.toLowerCase().replace(/\s+/g, ' ');
  if (key === 'clear') { out.innerHTML = ''; return; }
  const fn = cmds[key];
  if (fn) print(fn()); else print(`command not found: ${esc(raw)}. Type 'help'.`, 'err');
});
tin.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' && hIdx > 0) { tin.value = history[--hIdx]; e.preventDefault(); }
  if (e.key === 'ArrowDown') { hIdx = Math.min(history.length, hIdx + 1); tin.value = history[hIdx] || ''; e.preventDefault(); }
  if (e.key === 'Tab') {
    e.preventDefault();
    const m = Object.keys(cmds).filter(k => k.startsWith(tin.value.toLowerCase()));
    if (m.length === 1) tin.value = m[0];
  }
});
