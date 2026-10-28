/* HYPER SHIFT: a 4D phase-shifting runner. */
(() => {
  'use strict';
  const cv = document.getElementById('game');
  const g = cv.getContext('2d');
  const $ = id => document.getElementById(id);
  const COLORS = ['#00f0ff', '#ff2bd6', '#ffd166'];
  const RGB = [[0, 240, 255], [255, 43, 214], [255, 209, 102]];
  const BEST_KEY = 'hypershift-best';

  let W = 0, H = 0, DPR = 1, f = 1, hy = 0;
  const CAM_Y = 2.3, CAM_Z = -5, Z_FAR = 70, HALF = 3;

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    f = Math.min(H * 0.9, W * 0.78);
    hy = H * 0.36;
  }
  addEventListener('resize', resize); resize();

  const P = (x, y, z) => { const d = z - CAM_Z; return [W / 2 + x * f / d, hy + (CAM_Y - y) * f / d]; };

  /* ---------- state ---------- */
  let mode = 'menu'; // menu | play | pause | dead | over
  let px, pvx, phase, objs, parts, pops, dist, nextSpawn, time, speed, score, combo, comboT, flash, shake, deadT, shiftCount;
  let best = +(localStorage.getItem(BEST_KEY) || 0);
  $('best').textContent = best;

  function reset() {
    px = 0; pvx = 0; phase = 0; objs = []; parts = []; pops = [];
    dist = 0; nextSpawn = 25; time = 0; speed = 16; score = 0; combo = 1; comboT = 0;
    flash = 0; shake = 0; deadT = 0; shiftCount = 0;
    setPhaseUI();
  }
  reset();

  /* ---------- stars (screen space warp) ---------- */
  const stars = Array.from({ length: 160 }, () => newStar(true));
  function newStar(rand) {
    const a = Math.random() * Math.PI * 2;
    return { a, r: rand ? Math.random() * 1 : 0.02, s: 0.2 + Math.random() * 0.8 };
  }

  /* ---------- spawning ---------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = n => (Math.random() * n) | 0;
  const other = p => (p + 1 + ri(2)) % 3;
  function block(x, w, p, h = 1.4, z = Z_FAR) { objs.push({ t: 'b', x, w, h, z, d: 0.7, p, passed: false }); }
  function orbLine(x, z) { for (let i = 0; i < 3; i++) objs.push({ t: 'o', x, y: 0.6, z: z + i * 1.6, got: false }); }

  function spawn() {
    const lvl = Math.min(time / 20, 4);
    const r = Math.random();
    const p = ri(3);
    if (r < 0.3 - lvl * 0.04) {
      const n = 1 + ri(2);
      for (let i = 0; i < n; i++) block(rnd(-2.2, 2.2), rnd(1, 1.8), ri(3));
    } else if (r < 0.5) {
      block(0, HALF * 2 + 0.4, p, 1.6);
    } else if (r < 0.68) {
      const gc = rnd(-1.9, 1.9), gw = 1.9 - lvl * 0.1;
      const l = gc - gw / 2, rr = gc + gw / 2;
      block((-HALF - 0.2 + l) / 2, l + HALF + 0.2, p, 1.6);
      block((rr + HALF + 0.2) / 2, HALF + 0.2 - rr, p, 1.6);
    } else if (r < 0.84) {
      const a = p, b = other(p);
      block(-HALF / 2 - 0.1, HALF + 0.2, a, 1.6);
      block(HALF / 2 + 0.1, HALF + 0.2, b, 1.6);
    } else {
      const order = [0, 1, 2].sort(() => Math.random() - 0.5);
      [-2, 0, 2].forEach((x, i) => block(x, 2.02, order[i], 1.6));
    }
    if (Math.random() < 0.55) orbLine(rnd(-2.3, 2.3), Z_FAR + 5);
  }

  /* ---------- input ---------- */
  const keys = {};
  function shift(to) {
    if (mode !== 'play') return;
    const np = to === undefined ? (phase + 1) % 3 : to;
    if (np === phase) return;
    phase = np; flash = 1; shiftCount++;
    setPhaseUI();
    burst(W / 2 + px * f / (0 - CAM_Z), hy + (CAM_Y - 0.5) * f / (0 - CAM_Z), COLORS[phase], 14, 3);
  }
  function setPhaseUI() {
    document.querySelectorAll('.ph').forEach(b => b.classList.toggle('active', +b.dataset.p === phase));
  }
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (mode === 'play') {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') shift();
      if (e.code === 'Digit1' || e.code === 'KeyJ') shift(0);
      if (e.code === 'Digit2' || e.code === 'KeyK') shift(1);
      if (e.code === 'Digit3' || e.code === 'KeyL') shift(2);
      if (e.code === 'KeyP' || e.code === 'Escape') pause();
    } else if (mode === 'pause') {
      if (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Space') resume();
    } else if ((mode === 'menu' || mode === 'over') && (e.code === 'Enter' || e.code === 'Space')) {
      start();
    }
  });
  addEventListener('keyup', e => keys[e.code] = false);

  let touch = null;
  cv.addEventListener('pointerdown', e => {
    if (mode !== 'play') return;
    touch = { x: e.clientX, y: e.clientY, px, t: performance.now(), moved: false };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!touch) return;
    const dx = e.clientX - touch.x;
    if (Math.abs(dx) > 8) touch.moved = true;
    px = Math.max(-HALF + 0.3, Math.min(HALF - 0.3, touch.px + dx / Math.min(W, 700) * 9));
  });
  cv.addEventListener('pointerup', () => {
    if (touch && !touch.moved && performance.now() - touch.t < 300) shift();
    touch = null;
  });
  document.querySelectorAll('.ph').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); shift(+b.dataset.p); }));

  $('start').onclick = start;
  $('restart').onclick = start;
  $('resume').onclick = resume;
  $('pause-btn').onclick = () => mode === 'play' ? pause() : mode === 'pause' && resume();
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pause(); });

  function start() {
    reset(); mode = 'play';
    $('menu').hidden = true; $('over').hidden = true; $('paused').hidden = true;
  }
  function pause() { mode = 'pause'; $('paused').hidden = false; }
  function resume() { mode = 'play'; $('paused').hidden = true; last = performance.now(); }

  function die() {
    mode = 'dead'; deadT = 0; shake = 1;
    const [sx, sy] = P(px, 0.5, 0);
    burst(sx, sy, COLORS[phase], 60, 8);
    burst(sx, sy, '#ffffff', 30, 5);
    const final = Math.floor(score);
    const isBest = final > best;
    if (isBest) { best = final; localStorage.setItem(BEST_KEY, best); }
    $('best').textContent = best;
    $('final').textContent = final;
    $('over-title').textContent = isBest ? 'NEW RECORD' : 'GAME OVER';
    $('best-line').textContent = isBest ? 'You beat your best score. It now shows on the portfolio too.' : `Best: ${best}  |  Dimension shifts: ${shiftCount}`;
    $('brag').href = `mailto:Rajatranjan06@gmail.com?subject=${encodeURIComponent('I scored ' + final + ' in Hyper Shift')}`;
  }

  /* ---------- particles / popups ---------- */
  function burst(x, y, color, n, pow) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * pow * 60 + 30;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color, size: rnd(1.5, 4) });
    }
  }
  function pop(text, color) { pops.push({ text, color, life: 1 }); }

  /* ---------- tesseract player ---------- */
  const V4 = [];
  for (let i = 0; i < 16; i++) V4.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
  const E4 = [];
  for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (i < j) E4.push([i, j]); }
  function drawTesseract(cx, cy, size, t, color) {
    const pts = V4.map(v0 => {
      const v = v0.slice();
      const r = (a, b, th) => { const c = Math.cos(th), s = Math.sin(th), x = v[a], y = v[b]; v[a] = x * c - y * s; v[b] = x * s + y * c; };
      r(0, 3, t * 1.3); r(1, 3, t * 0.9); r(0, 2, t * 0.7); r(1, 2, 0.5);
      const k4 = 1 / (3 - v[3]); const x3 = v[0] * k4, y3 = v[1] * k4, z3 = v[2] * k4;
      const k3 = 1 / (2.5 - z3);
      return [cx + x3 * k3 * size, cy + y3 * k3 * size];
    });
    g.strokeStyle = color; g.lineWidth = 1.6;
    g.shadowColor = color; g.shadowBlur = 18;
    g.beginPath();
    for (const [a, b] of E4) { g.moveTo(pts[a][0], pts[a][1]); g.lineTo(pts[b][0], pts[b][1]); }
    g.stroke();
    g.shadowBlur = 0;
  }

  /* ---------- update ---------- */
  function update(dt) {
    time += dt;
    speed = Math.min(44, 16 + time * 0.45);
    const dz = speed * dt;
    dist += dz;
    score += dz * 0.5 * (1 + (combo - 1) * 0.25);

    // movement
    const dir = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    if (dir) pvx += (dir * 11 - pvx) * Math.min(1, dt * 14);
    else pvx *= Math.pow(0.0005, dt);
    if (!touch) px += pvx * dt;
    px = Math.max(-HALF + 0.3, Math.min(HALF - 0.3, px));

    if (dist >= nextSpawn) { spawn(); nextSpawn = dist + Math.max(10, 22 - time * 0.25); }

    for (const o of objs) {
      o.z -= dz;
      if (o.t === 'b') {
        const overX = Math.abs(px - o.x) < o.w / 2 + 0.28;
        const overZ = o.z < 0.3 && o.z + o.d > -0.3;
        if (overX && overZ) {
          if (o.p === phase) { die(); return; }
          o.inside = true;
        }
        if (!o.passed && o.z + o.d < -0.3) {
          o.passed = true;
          if (o.inside) {
            combo = Math.min(8, combo + 1); comboT = 3;
            score += 15 * combo;
            pop('PHASED +' + 15 * combo, COLORS[o.p]);
          }
        }
      } else if (!o.got && Math.abs(o.z) < 0.6 && Math.abs(px - o.x) < 0.6) {
        o.got = true;
        combo = Math.min(8, combo + 1); comboT = 3;
        score += 25 * combo;
        const [sx, sy] = P(o.x, o.y, o.z);
        burst(sx, sy, '#ffffff', 12, 2.5);
        pop('+' + 25 * combo, '#ffffff');
      }
    }
    objs = objs.filter(o => o.z > -3.5 && !(o.t === 'o' && o.got));

    if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 1; }

    // engine trail
    const [sx, sy] = P(px, 0.5, 0);
    if (Math.random() < 0.9) parts.push({ x: sx + rnd(-6, 6), y: sy + 10, vx: rnd(-20, 20), vy: rnd(40, 120), life: 0.6, color: COLORS[phase], size: rnd(1, 3) });
  }

  /* ---------- render ---------- */
  function rgba(i, a) { const c = RGB[i]; return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

  function render(dt) {
    g.save();
    if (shake > 0) { g.translate(rnd(-1, 1) * shake * 14, rnd(-1, 1) * shake * 14); shake = Math.max(0, shake - dt * 1.5); }

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05060f');
    bg.addColorStop(0.36, rgba(phase, 0.14));
    bg.addColorStop(1, '#05060f');
    g.fillStyle = '#05060f'; g.fillRect(-20, -20, W + 40, H + 40);
    g.fillStyle = bg; g.fillRect(-20, -20, W + 40, H + 40);

    // warp stars
    const vs = mode === 'play' ? speed / 16 : 0.6;
    const maxR = Math.hypot(W, H) / 2;
    for (const s of stars) {
      const r0 = s.r;
      s.r += s.r * dt * 1.2 * vs * s.s + dt * 0.02;
      if (s.r > 1) Object.assign(s, newStar(false));
      const x0 = W / 2 + Math.cos(s.a) * r0 * maxR, y0 = hy + Math.sin(s.a) * r0 * maxR;
      const x1 = W / 2 + Math.cos(s.a) * s.r * maxR, y1 = hy + Math.sin(s.a) * s.r * maxR;
      g.strokeStyle = `rgba(255,255,255,${Math.min(1, s.r * 1.5) * 0.7})`;
      g.lineWidth = s.s * 1.5;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }

    // tunnel grid: floor + ceiling
    const off = dist % 3;
    g.lineWidth = 1;
    for (const y of [0, 4.2]) {
      for (let k = 0; k < 24; k++) {
        const z = k * 3 - off;
        if (z < -2) continue;
        const a = P(-HALF, y, z), b = P(HALF, y, z);
        g.strokeStyle = rgba(phase, Math.max(0, 0.55 - z / Z_FAR * 0.6));
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
      for (let x = -HALF; x <= HALF; x += 1) {
        const a = P(x, y, -2), b = P(x, y, Z_FAR);
        g.strokeStyle = rgba(phase, x === -HALF || x === HALF ? 0.6 : 0.18);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
    }
    // side walls verticals
    for (let k = 0; k < 24; k++) {
      const z = k * 3 - off;
      if (z < -2) continue;
      g.strokeStyle = rgba(phase, Math.max(0, 0.3 - z / Z_FAR * 0.35));
      for (const x of [-HALF, HALF]) { const a = P(x, 0, z), b = P(x, 4.2, z); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    }

    // objects far to near
    const sorted = objs.slice().sort((a, b) => b.z - a.z);
    for (const o of sorted) {
      const fade = Math.max(0, Math.min(1, (Z_FAR + 6 - o.z) / 18));
      if (o.t === 'b') {
        const solid = o.p === phase;
        const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, z0 = Math.max(o.z, -2.5), z1 = o.z + o.d;
        if (z1 < -2.5) continue;
        const n0 = P(x0, o.h, z0), n1 = P(x1, o.h, z0), n2 = P(x1, 0, z0);
        const f0 = P(x0, o.h, z1), f1 = P(x1, o.h, z1);
        g.globalAlpha = fade;
        // top face
        g.fillStyle = rgba(o.p, solid ? 0.55 : 0.06);
        g.beginPath(); g.moveTo(n0[0], n0[1]); g.lineTo(n1[0], n1[1]); g.lineTo(f1[0], f1[1]); g.lineTo(f0[0], f0[1]); g.closePath(); g.fill();
        // front face
        g.fillStyle = rgba(o.p, solid ? 0.82 : 0.09);
        g.fillRect(n0[0], n0[1], n2[0] - n0[0], n2[1] - n0[1]);
        g.strokeStyle = rgba(o.p, solid ? 1 : 0.4);
        g.lineWidth = solid ? 2 : 1;
        if (!solid) g.setLineDash([6, 6]);
        g.strokeRect(n0[0], n0[1], n2[0] - n0[0], n2[1] - n0[1]);
        g.setLineDash([]);
        if (solid) {
          // danger stripes
          g.strokeStyle = 'rgba(5,6,15,.35)'; g.lineWidth = Math.max(1, (n2[1] - n0[1]) * 0.08);
          g.beginPath();
          const midY = (n0[1] + n2[1]) / 2;
          g.moveTo(n0[0], midY); g.lineTo(n2[0], midY); g.stroke();
        }
        g.globalAlpha = 1;
      } else {
        const [sx, sy] = P(o.x, o.y + Math.sin(time * 5 + o.z) * 0.1, o.z);
        const r = 0.22 * f / (o.z - CAM_Z);
        g.globalAlpha = fade;
        g.fillStyle = '#ffffff'; g.shadowColor = '#ffffff'; g.shadowBlur = 14;
        g.beginPath();
        g.moveTo(sx, sy - r); g.lineTo(sx + r * 0.7, sy); g.lineTo(sx, sy + r); g.lineTo(sx - r * 0.7, sy); g.closePath(); g.fill();
        g.shadowBlur = 0; g.globalAlpha = 1;
      }
    }

    // player
    if (mode !== 'dead' && mode !== 'over') {
      const [sx, sy] = P(px, 0.5, 0);
      const sz = 0.75 * f / (0 - CAM_Z);
      const [shx, shy] = P(px, 0, 0);
      g.fillStyle = rgba(phase, 0.25);
      g.beginPath(); g.ellipse(shx, shy, sz * 0.5, sz * 0.12, 0, 0, Math.PI * 2); g.fill();
      drawTesseract(sx, sy, sz, time * 2 + performance.now() / 1000, COLORS[phase]);
    }

    // particles
    for (const p of parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; p.life -= dt * 1.4;
      if (p.life <= 0) continue;
      g.globalAlpha = p.life; g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
    parts = parts.filter(p => p.life > 0);

    g.restore();

    // phase flash
    if (flash > 0) {
      g.fillStyle = rgba(phase, flash * 0.25); g.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - dt * 4);
    }
    // popups
    g.textAlign = 'center'; g.font = '700 18px ui-monospace, Menlo, monospace';
    pops.forEach((p, i) => {
      p.life -= dt * 0.9;
      g.globalAlpha = Math.max(0, p.life); g.fillStyle = p.color;
      g.fillText(p.text, W / 2, H * 0.55 - (1 - p.life) * 60 - i * 4);
    });
    g.globalAlpha = 1;
    pops = pops.filter(p => p.life > 0);
  }

  /* ---------- loop ---------- */
  let last = performance.now();
  const scoreEl = $('score'), comboEl = $('combo');
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'play') update(dt);
    else if (mode === 'menu') { dist += 8 * dt; time += dt; }
    else if (mode === 'dead') {
      deadT += dt;
      if (deadT > 1) { mode = 'over'; $('over').hidden = false; }
    }
    if (mode !== 'pause') render(dt);
    scoreEl.textContent = Math.floor(score);
    comboEl.textContent = 'x' + combo;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
