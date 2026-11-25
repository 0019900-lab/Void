'use strict';
/* Void gameplay engine: canvas 800x450 logical, level runs left→right (path width 450). */
const W = 800, H = 450;
const CFG = {
  speed: 165, rSmall: 7, rBig: 16, dashT: .13, dashV: 540, dashCD: .52, swallowR: 100, swallowT: .55,
  timeDur: 4, timeCD: 12, timeScale: .5, phaseDur: 1.2, phaseCD: 15, burstR: 140, burstOff: 2, burstCD: 10,
  shieldMax: 10, wallT: 40, gap: 100, narrow: 28, rowSpace: 300, firstWall: 230, mineR: 16, mineAmp: 135,
  pulseOn: 1.1, current: 120, spriteK: 5.2,
};
const ABILITY_LEVEL = { dash: 1, swallow: 1, shield: 3, time: 6, phase: 9, burst: 11 };
const IMG = {}, META = {};
function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); }
async function loadAssets(onProg) {
  META.sprites = await (await fetch('assets/sprites/meta.json')).json();
  const list = [];
  Object.keys(META.sprites).forEach(n => list.push(['spr_' + n, `assets/sprites/${n}.webp`]));
  ['barrier_wall', 'checkpoint_off', 'checkpoint_on', 'exit_portal', 'gold_matter', 'gravity_current', 'pulse_gate_off', 'pulse_gate_on', 'red_mine']
    .forEach(n => list.push([n, `assets/img/levels/${n}.webp`]));
  ['crystal', 'star'].forEach(n => list.push(['ui_' + n, `assets/img/ui/${n}.webp`]));
  [1, 2, 3].forEach(n => list.push(['bg' + n, `assets/img/bg/bg${n}.webp`]));
  let d = 0;
  await Promise.all(list.map(async ([k, s]) => { IMG[k] = await loadImg(s); onProg && onProg(++d / list.length); }));
}
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function frameOf(name, t, loop, ping) {
  const m = META.sprites[name], n = m.n; let i = Math.floor(t * m.fps);
  if (loop) { if (ping) { const p = i % (2 * n - 2); i = p < n ? p : 2 * n - 2 - p; } else i %= n; } else i = Math.min(i, n - 1);
  return i;
}
function drawSprite(ctx, name, i, cx, cy, size, alpha = 1) {
  const m = META.sprites[name], img = IMG['spr_' + name]; if (!img) return;
  const sx = (i % m.cols) * m.size, sy = Math.floor(i / m.cols) * m.size;
  ctx.globalAlpha = alpha; ctx.drawImage(img, sx, sy, m.size, m.size, cx - size / 2, cy - size / 2, size, size); ctx.globalAlpha = 1;
}

/* ---------- level builder (deterministic from levels.json numbers) ---------- */
function buildLevel(L) {
  const rnd = mulberry(L.n * 7919 + 13), rows = L.rows, len = L.height, walls = [], mines = [], pulses = [], currents = [], cps = [], crystals = [];
  const wx = i => CFG.firstWall + CFG.rowSpace * i;
  const nonNarrow = [...Array(rows).keys()].filter(i => i % 3 !== 2), mrows = new Set();
  for (let k = 0; k < L.matter; k++) mrows.add(nonNarrow[Math.floor((k + .5) * nonNarrow.length / L.matter)]);
  let prev = H / 2;
  for (let i = 0; i < rows; i++) {
    const narrow = i % 3 === 2, gw = narrow ? CFG.narrow : CFG.gap, lo = gw / 2 + 34, hi = H - gw / 2 - 34;
    let gy = lo + rnd() * (hi - lo); if (Math.abs(gy - prev) < 90) gy = gy < H / 2 ? Math.min(hi, gy + 140) : Math.max(lo, gy - 140);
    prev = gy; walls.push({ x: wx(i), gy, gw, narrow, gold: mrows.has(i), alive: mrows.has(i) });
  }
  const corr = [...Array(rows - 1).keys()].map(i => i + 1); // corridor c: after wall c-1
  const pick = (arr, k) => { const out = []; for (let j = 0; j < k && arr.length; j++) { const idx = Math.floor((j + .5) * arr.length / k); out.push(arr[idx]); } return out; };
  const pc = pick(corr, L.pulses), rest = corr.filter(c => !pc.includes(c));
  const period = L.n >= 7 ? 1.6 : 2.2;
  pc.forEach((c, j) => pulses.push({ x: wx(c - 1) + 170, y0: 22, y1: H - 22, per: period, ph: (j % 2) * period / 2, on: false, off: 0 }));
  pick(rest, L.orbs).forEach((c, j) => mines.push({ x: wx(c - 1) + 105, ph: rnd() * 6.28, dir: j % 2 ? 1 : -1, y: H / 2, dead: false, spin: 0 }));
  const cn = Math.min(L.cps, corr.length), used = new Set();
  for (let k = 0; k < cn; k++) { let c = clamp(Math.round((k + 1) * rows / (cn + 1)), 1, rows - 1); while (used.has(c) && c < rows - 1) c++; used.add(c); cps.push({ x: wx(c - 1) + 225, y: H / 2, on: false }); }
  for (let c = 1; c <= (L.currents || 0); c++) { const cc = corr[Math.floor(c * corr.length / ((L.currents || 0) + 1))] || 1; currents.push({ x0: wx(cc - 1) + 55, x1: wx(cc - 1) + 255, dir: c % 2 ? 1 : -1 }); }
  for (let c = 0; c < rows; c++) crystals.push({ x: (c === 0 ? 150 : wx(c - 1) + 150), y: 60 + rnd() * 330, got: false });
  return { L, walls, mines, pulses, currents, cps, crystals, len, exit: { x: len - 90, y: H / 2 }, start: { x: 70, y: H / 2 }, world: L.world };
}

/* ---------- particles ---------- */
const glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c; })();
const tintCache = {};
function tinted(col) { if (tintCache[col]) return tintCache[col]; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(glow, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, 64, 64); return tintCache[col] = c; }

/* ---------- game ---------- */
class Game {
  constructor(canvas, hooks) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.hooks = hooks; this.running = false; this.paused = false;
    this.input = { x: 0, y: 0, keys: {} }; this.parts = []; this.shake = 0; this.flash = 0; this.last = 0;
    this.loop = this.loop.bind(this);
  }
  resize(s) { const dpr = Math.min(2, window.devicePixelRatio || 1); this.cv.width = Math.round(W * s * dpr); this.cv.height = Math.round(H * s * dpr); this.k = s * dpr; }
  start(L, abilities) {
    this.lv = buildLevel(L); this.ab = abilities; this.t = 0; this.time = 0; this.deaths = 0; this.crystals = 0; this.stats = { used: {}, swallowed: 0, narrowRun: 0, maxNarrowRun: 0 };
    this.cam = 0; this.ghosts = []; this.trace = []; this.traceT = 0; this.cp = { x: this.lv.start.x, y: this.lv.start.y, i: -1 };
    this.done = false; this.winT = 0; this.hint = 0; this.idle = 0; this.started = false;
    this.p = this.newPlayer(); this.cd = { dash: 0, swallow: 0, shield: 0, time: 0, phase: 0, burst: 0 };
    this.shieldCharge = 1; this.timeT = 0; this.burstOff = 0; this.parts = [];
    this.spawn(); this.running = true; this.paused = false; this.last = performance.now(); requestAnimationFrame(this.loop);
    SFX.setWorld(L.world);
  }
  newPlayer() { return { x: this.cp ? this.cp.x : 70, y: this.cp ? this.cp.y : H / 2, vx: 0, vy: 0, r: CFG.rSmall, big: false, dashT: 0, dx: 1, dy: 0, swT: 0, shield: false, shT: 0, inv: 0, phase: 0, state: 'alive', st: 0, clip: 'idle', ct: 0, face: 1, aniFx: null, fxT: 0, mass: 0 }; }
  spawn() { const p = this.newPlayer(); p.x = this.cp.x; p.y = this.cp.y; p.state = 'respawn'; p.st = 0; p.inv = 1.2; this.p = p; this.shieldCharge = 1; this.trace = []; this.traceT = 0; this.runT = 0; this.setClip('respawn'); }
  setClip(c) { if (this.p.clip !== c) { this.p.clip = c; this.p.ct = 0; } }
  fx(name) { this.p.aniFx = name; this.p.fxT = 0; }
  // ---- abilities
  can(a) { return this.ab.includes(a) && this.p.state === 'alive' && this.cd[a] <= 0; }
  use(a) {
    if (!this.running || this.paused || this.done) return; const p = this.p;
    if (!this.ab.includes(a) || p.state !== 'alive') return;
    if (this.cd[a] > 0) return; this.stats.used[a] = 1;
    if (a === 'dash') {
      let dx = this.input.x, dy = this.input.y, m = Math.hypot(dx, dy); if (m < .1) { dx = p.face; dy = 0; m = 1; }
      p.dx = dx / m; p.dy = dy / m; p.dashT = CFG.dashT; this.cd.dash = CFG.dashCD; SFX.play('dash');
      if (p.big) { p.big = false; this.dump(); SFX.play('dump'); }
      for (let i = 0; i < 8; i++) this.emit(p.x, p.y, -p.dx * 120 + (Math.random() - .5) * 80, -p.dy * 120 + (Math.random() - .5) * 80, .3, 6, '#c58bff');
    } else if (a === 'swallow') {
      this.cd.swallow = .8; p.swT = CFG.swallowT; SFX.play('swallow'); this.fx('swallow'); let ate = 0;
      this.lv.walls.forEach(w => { if (w.alive && Math.hypot(w.x - p.x, w.gy - p.y) < CFG.swallowR + 40) { w.alive = false; ate++; for (let i = 0; i < 18; i++) this.emit(w.x + (Math.random() - .5) * 30, w.gy + (Math.random() - .5) * 80, 0, 0, .5, 7, '#ffd24a', p); } });
      if (ate) { p.big = true; this.stats.swallowed += ate; this.hooks.onToast && this.hooks.onToast('big'); }
      for (let i = 0; i < 20; i++) { const a2 = Math.random() * 6.28; this.emit(p.x + Math.cos(a2) * CFG.swallowR, p.y + Math.sin(a2) * CFG.swallowR, 0, 0, .45, 4, '#b06bff', p); }
    } else if (a === 'shield') {
      if (this.shieldCharge <= 0 || p.shield) return; this.shieldCharge = 0; p.shield = true; p.shT = CFG.shieldMax; this.cd.shield = .5; SFX.play('shield'); this.fx('shield');
    } else if (a === 'time') {
      this.timeT = CFG.timeDur; this.cd.time = CFG.timeCD; SFX.play('slow'); this.fx('time_dilation');
    } else if (a === 'phase') {
      p.phase = CFG.phaseDur; this.cd.phase = CFG.phaseCD; SFX.play('phase'); this.fx('phase');
    } else if (a === 'burst') {
      if (!p.big) { this.hooks.onToast && this.hooks.onToast('needmass'); return; }
      this.cd.burst = CFG.burstCD; p.big = false; this.dump(); SFX.play('burst'); this.fx('mass_burst'); this.shake = 14; this.flash = .5; this.burstOff = CFG.burstOff;
      this.lv.mines.forEach(m => { if (!m.dead && Math.hypot(m.x - p.x, m.y - p.y) < CFG.burstR + 40) { m.dead = true; for (let i = 0; i < 25; i++) this.emit(m.x, m.y, (Math.random() - .5) * 400, (Math.random() - .5) * 400, .7, 6, '#ff4d5e'); } });
      for (let i = 0; i < 40; i++) { const a2 = Math.random() * 6.28, s = 200 + Math.random() * 300; this.emit(p.x, p.y, Math.cos(a2) * s, Math.sin(a2) * s, .7, 7, '#f5c44a'); }
    }
    this.hooks.onUse && this.hooks.onUse(a);
  }
  dump() { for (let i = 0; i < 16; i++) this.emit(this.p.x, this.p.y, (Math.random() - .5) * 260, (Math.random() - .5) * 260, .6, 7, '#ffd24a'); }
  emit(x, y, vx, vy, life, size, col, target) { if (this.parts.length > 400) return; this.parts.push({ x, y, vx, vy, life, max: life, size, col, target }); }
  // ---- damage
  hit(kind) {
    const p = this.p; if (p.state !== 'alive' || p.inv > 0) return;
    if (p.shield) {
      p.shield = false; p.shT = 0; p.inv = 1; SFX.play('shieldBreak'); this.shake = 8; this.fx('shield'); p.fxT = 6 / 12; this.setClip('hurt');
      if (kind && kind.wall) { p.x = kind.wall.x - CFG.wallT / 2 - p.r - 10; p.vx = 0; }
      else if (kind && kind.pulse) { p.x = kind.pulse.x - 30; }
      else { p.vx = -200; }
      for (let i = 0; i < 25; i++) this.emit(p.x, p.y, (Math.random() - .5) * 350, (Math.random() - .5) * 350, .5, 5, '#5be6ff'); return;
    }
    p.state = 'dead'; p.st = 0; this.deaths++; this.stats.maxNarrowRun = Math.max(this.stats.maxNarrowRun, this.stats.narrowRun); this.stats.narrowRun = 0; this.setClip('death'); SFX.play('death'); this.shake = 12; this.flash = .25;
    if (this.trace.length > 4) { this.ghosts.push({ pts: this.trace.slice(), t: 0 }); if (this.ghosts.length > (this.lv.L.n === 6 ? 8 : 4)) this.ghosts.shift(); }
    for (let i = 0; i < 30; i++) this.emit(p.x, p.y, (Math.random() - .5) * 400, (Math.random() - .5) * 400, .8, 6, '#b06bff');
    this.hooks.onDeath && this.hooks.onDeath(this.deaths);
  }
  // ---- loop
  loop(now) {
    if (!this.running) return; requestAnimationFrame(this.loop);
    let dt = Math.min(.033, (now - this.last) / 1000); this.last = now; if (this.paused) { this.draw(); return; }
    this.update(dt); this.draw();
  }
  update(dt) {
    const p = this.p, lv = this.lv, I = this.input, k = I.keys;
    let ix = I.x + ((k.ArrowRight || k.d || k.D) ? 1 : 0) - ((k.ArrowLeft || k.a || k.A) ? 1 : 0), iy = I.y + ((k.ArrowDown || k.s || k.S) ? 1 : 0) - ((k.ArrowUp || k.w || k.W) ? 1 : 0);
    const mm = Math.hypot(ix, iy); if (mm > 1) { ix /= mm; iy /= mm; }
    this.t += dt; if (this.shake > 0) this.shake = Math.max(0, this.shake - 40 * dt); if (this.flash > 0) this.flash -= dt;
    for (const a in this.cd) if (this.cd[a] > 0) this.cd[a] -= dt;
    if (this.timeT > 0) { this.timeT -= dt; if (this.timeT <= 0) { SFX.play('slowEnd'); p.aniFx = null; } }
    if (this.burstOff > 0) this.burstOff -= dt;
    const ts = this.timeT > 0 ? CFG.timeScale : 1, wdt = dt * ts;
    // hazards animate (time-scaled)
    lv.mines.forEach(m => { m.spin += wdt * 3; m.ph += wdt * (CFG.mineAmp ? 90 / CFG.mineAmp : 1) * m.dir; m.y = H / 2 + Math.sin(m.ph) * CFG.mineAmp; });
    lv.pulses.forEach(g => { g.ph += wdt; const was = g.on; g.on = (g.ph % g.per) < g.per / 2 && this.burstOff <= 0; if (g.on && !was && Math.abs(g.x - p.x) < 400) SFX.play('pulseOn'); });
    // ghosts
    this.ghosts.forEach(g => g.t += dt);
    if (p.state === 'dead') { p.st += dt; p.ct += dt; if (p.st > .9) { this.spawn(); SFX.play('respawn'); } this.stepParts(dt); return; }
    if (p.state === 'respawn') { p.st += dt; p.ct += dt; if (p.st > .5) { p.state = 'alive'; this.setClip('idle'); } }
    if (p.state === 'win') { this.winT += dt; p.ct += dt; this.stepParts(dt); if (this.winT > 1.7 && !this.done) { this.done = true; this.hooks.onWin && this.hooks.onWin(this.result()); } return; }
    if (this.started) this.time += dt;
    // movement
    const target = CFG.speed * (p.big ? .92 : 1); let tvx = ix * target, tvy = iy * target;
    if (mm > .05) { this.started = true; this.idle = 0; if (Math.abs(ix) > .2) p.face = ix > 0 ? 1 : -1; } else this.idle += dt;
    if (p.dashT > 0) { p.dashT -= dt; p.vx = p.dx * CFG.dashV; p.vy = p.dy * CFG.dashV; }
    else { const a = Math.min(1, 14 * dt); p.vx += (tvx - p.vx) * a; p.vy += (tvy - p.vy) * a;
      lv.currents.forEach(c => { if (p.x > c.x0 && p.x < c.x1) p.vy += c.dir * CFG.current * 1.6 * dt * 6 * 0.35 * 3; }); }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.y = clamp(p.y, p.r, H - p.r); p.x = Math.max(p.r, p.x);
    const rt = p.big ? CFG.rBig : CFG.rSmall; p.r += (rt - p.r) * Math.min(1, 12 * dt);
    if (p.swT > 0) p.swT -= dt; if (p.inv > 0) p.inv -= dt; if (p.shT > 0) { p.shT -= dt; if (p.shT <= 0) p.shield = false; }
    if (p.phase > 0) { p.phase -= dt; if (p.phase <= 0) { p.aniFx = null; this.checkInside(); } }
    p.fxT += dt; p.ct += dt;
    // trace & ghost record
    this.traceT += dt; this.runT += dt; if (this.traceT > .1) { this.traceT = 0; this.trace.push([p.x, p.y]); }
    // collisions
    const hr = p.r * .92, phasing = p.phase > 0;
    for (const w of lv.walls) {
      if (Math.abs(w.x - p.x) > 70) continue; const x0 = w.x - CFG.wallT / 2, x1 = w.x + CFG.wallT / 2, gt = w.gy - w.gw / 2, gb = w.gy + w.gw / 2;
      if (w.alive) { // gold block is solid, not deadly
        const c = this.push(p, x0, gt, x1, gb, hr); if (c) { p.vx *= .2; if (!p.hintd) { p.hintd = 1; this.hooks.onToast && this.hooks.onToast('gold'); } }
      }
      if (!phasing && (this.circRect(p.x, p.y, hr, x0, 0, x1, gt) || this.circRect(p.x, p.y, hr, x0, gb, x1, H))) { this.hit({ wall: w }); }
      if (p.x > x1 + 4 && !w.passed) { w.passed = true; if (w.narrow) this.stats.narrowRun++; }
    }
    for (const m of lv.mines) if (!m.dead && !phasing && Math.hypot(m.x - p.x, m.y - p.y) < CFG.mineR + hr - 2) this.hit({ mine: m });
    for (const g of lv.pulses) if (g.on && !phasing && Math.abs(g.x - p.x) < hr + 3) this.hit({ pulse: g });
    for (const c of lv.cps) if (!c.on && Math.hypot(c.x - p.x, c.y - p.y) < 34) { c.on = true; this.cp = { x: c.x, y: c.y, i: lv.cps.indexOf(c) }; this.shieldCharge = 1; SFX.play('checkpoint'); this.flash = .2; this.fx('shield'); p.aniFx = null; this.hooks.onCheckpoint && this.hooks.onCheckpoint(this.cp.i + 1, lv.cps.length);
      for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28; this.emit(c.x, c.y, Math.cos(a) * 160, Math.sin(a) * 160, .7, 6, '#4fe3f5'); } }
    for (const c of lv.crystals) if (!c.got && Math.hypot(c.x - p.x, c.y - p.y) < 26) { c.got = true; this.crystals++; SFX.play('crystal'); for (let i = 0; i < 10; i++) this.emit(c.x, c.y, (Math.random() - .5) * 200, (Math.random() - .5) * 200, .5, 5, '#e86ac8'); this.hooks.onCrystal && this.hooks.onCrystal(this.crystals); }
    if (Math.hypot(lv.exit.x - p.x, lv.exit.y - p.y) < 42) { p.state = 'win'; this.winT = 0; this.setClip('win'); SFX.play('win'); this.flash = .4; this.stats.maxNarrowRun = Math.max(this.stats.maxNarrowRun, this.stats.narrowRun); for (let i = 0; i < 50; i++) { const a = Math.random() * 6.28, s = 100 + Math.random() * 300; this.emit(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, 1, 6, ['#f5c44a', '#b06bff', '#4fe3f5'][i % 3]); } }
    // narrow-gap warning while big
    if (p.big) { const nw = lv.walls.find(w => w.narrow && w.x > p.x && w.x - p.x < 230); this.hint = nw ? 1 : 0; } else this.hint = 0;
    // clip choice
    if (p.state === 'alive' && p.clip !== 'hurt') { const sp = Math.hypot(p.vx, p.vy); const c = p.dashT > 0 ? 'dash' : p.big ? 'heavy' : sp > 25 ? 'move' : this.idle > 8 ? 'sleep' : 'idle'; this.setClip(c); }
    else if (p.clip === 'hurt' && p.ct > 1) this.setClip('idle');
    // trail
    if (this.t % .04 < dt && (p.dashT > 0 || Math.hypot(p.vx, p.vy) > 60)) this.emit(p.x - p.vx * .02, p.y - p.vy * .02, 0, 0, p.dashT > 0 ? .35 : .25, p.big ? 10 : 6, p.big ? '#ffd24a' : '#9a5cff');
    // camera
    const want = clamp(p.x - 260, 0, lv.len - W); this.cam += (want - this.cam) * Math.min(1, 8 * dt);
    this.stepParts(dt);
  }
  checkInside() { const p = this.p; if (p.phase > 0) return; const hr = p.r * .92;
    for (const w of this.lv.walls) { if (Math.abs(w.x - p.x) > 60) continue; const x0 = w.x - CFG.wallT / 2, x1 = w.x + CFG.wallT / 2, gt = w.gy - w.gw / 2, gb = w.gy + w.gw / 2;
      if (this.circRect(p.x, p.y, hr, x0, 0, x1, gt) || this.circRect(p.x, p.y, hr, x0, gb, x1, H)) { p.inv = 0; this.hit({ wall: w }); return; } }
    for (const m of this.lv.mines) if (!m.dead && Math.hypot(m.x - p.x, m.y - p.y) < CFG.mineR + hr) { p.inv = 0; this.hit({ mine: m }); return; } }
  circRect(cx, cy, r, x0, y0, x1, y1) { const nx = clamp(cx, x0, x1), ny = clamp(cy, y0, y1); return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r; }
  push(p, x0, y0, x1, y1, r) { const nx = clamp(p.x, x0, x1), ny = clamp(p.y, y0, y1); let dx = p.x - nx, dy = p.y - ny, d = Math.hypot(dx, dy);
    if (d >= r) return false; if (d === 0) { dx = -1; dy = 0; d = 1; } p.x = nx + dx / d * r; p.y = ny + dy / d * r; return true; }
  stepParts(dt) { const p = this.p; this.parts = this.parts.filter(q => { q.life -= dt; if (q.life <= 0) return false;
    if (q.target) { const dx = q.target.x - q.x, dy = q.target.y - q.y, d = Math.hypot(dx, dy) || 1; q.vx += dx / d * 900 * dt; q.vy += dy / d * 900 * dt; q.vx *= .94; q.vy *= .94; if (d < 12) return false; }
    q.x += q.vx * dt; q.y += q.vy * dt; return true; }); }
  result() { return { time: this.time, deaths: this.deaths, crystals: this.crystals, crystalsTotal: this.lv.crystals.length, stats: this.stats, matter: this.lv.L.matter }; }
  // ---- render
  draw() {
    const c = this.ctx, lv = this.lv, p = this.p, k = this.k; c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, H);
    const sx = this.shake ? (Math.random() - .5) * this.shake : 0, sy = this.shake ? (Math.random() - .5) * this.shake : 0;
    const bg = IMG['bg' + lv.world]; if (bg) { const sc = 1.25, bw = W * sc, bh = H * sc, off = -(this.cam * .12) % bw; c.drawImage(bg, off - (bw - W) / 2 - 20, -(bh - H) / 2, bw, bh); c.drawImage(bg, off + bw - (bw - W) / 2 - 20, -(bh - H) / 2, bw, bh); }
    c.fillStyle = 'rgba(8,4,24,.35)'; c.fillRect(0, 0, W, H);
    c.save(); c.translate(-this.cam + sx, sy); const vx0 = this.cam - 80, vx1 = this.cam + W + 80;
    // currents
    const cur = IMG.gravity_current; lv.currents.forEach(cu => { c.save(); c.globalAlpha = .55; c.fillStyle = 'rgba(160,90,255,.12)'; c.fillRect(cu.x0, 0, cu.x1 - cu.x0, H);
      for (let y = -((this.t * 80 * cu.dir) % 100); y < H + 100; y += 100) { if (cur) { c.save(); c.translate((cu.x0 + cu.x1) / 2, y); c.rotate(cu.dir > 0 ? Math.PI / 2 : -Math.PI / 2); c.drawImage(cur, -70, -37, 140, 74); c.restore(); } } c.restore(); });
    // checkpoints
    lv.cps.forEach(cp => { const im = IMG[cp.on ? 'checkpoint_on' : 'checkpoint_off']; if (im && cp.x > vx0 && cp.x < vx1) { const s = 64 + (cp.on ? Math.sin(this.t * 4) * 3 : 0); c.drawImage(im, cp.x - s / 2, cp.y - s / 2, s, s * im.height / im.width); } });
    // exit
    if (IMG.exit_portal && lv.exit.x < vx1) { c.save(); c.translate(lv.exit.x, lv.exit.y); c.rotate(this.t * .8); c.drawImage(IMG.exit_portal, -48, -48, 96, 96); c.restore(); this.glowAt(c, lv.exit.x, lv.exit.y, 110, '#f5c44a', .35 + Math.sin(this.t * 3) * .1); }
    // crystals
    lv.crystals.forEach(cr => { if (cr.got || cr.x < vx0 || cr.x > vx1) return; const im = IMG.ui_crystal, bob = Math.sin(this.t * 3 + cr.x) * 3; this.glowAt(c, cr.x, cr.y + bob, 34, '#e86ac8', .5); if (im) c.drawImage(im, cr.x - 9, cr.y + bob - 15, 18, 30); });
    // pulse gates
    lv.pulses.forEach(g => { if (g.x < vx0 || g.x > vx1) return; const im = IMG[g.on ? 'pulse_gate_on' : 'pulse_gate_off']; if (!im) return; c.save(); c.translate(g.x, H / 2); c.rotate(Math.PI / 2); c.drawImage(im, -(H - 20) / 2, -22, H - 20, 44); c.restore(); if (g.on) this.glowAt(c, g.x, H / 2, 140, '#ff4d5e', .22); });
    // walls
    const bw = IMG.barrier_wall, gm = IMG.gold_matter;
    lv.walls.forEach(w => { if (w.x < vx0 || w.x > vx1) return; const gt = w.gy - w.gw / 2, gb = w.gy + w.gw / 2; this.wallSeg(c, bw, w.x, 0, gt); this.wallSeg(c, bw, w.x, gb, H);
      if (w.alive && gm) { this.glowAt(c, w.x, w.gy, 90, '#ffb800', .4 + Math.sin(this.t * 3 + w.x) * .1); const s = Math.max(w.gw + 12, 56); c.drawImage(gm, w.x - s / 2, w.gy - s * .44, s, s * gm.height / gm.width); } });
    // mines
    lv.mines.forEach(m => { if (m.dead || m.x < vx0 || m.x > vx1) return; this.glowAt(c, m.x, m.y, 60, '#ff2e48', .4); if (IMG.red_mine) { c.save(); c.translate(m.x, m.y); c.rotate(m.spin); c.drawImage(IMG.red_mine, -24, -24, 48, 48); c.restore(); } });
    // ghosts (previous attempts)
    this.ghosts.forEach(g => { const i = Math.floor(g.t / .1); if (i < g.pts.length) { const q = g.pts[i]; drawSprite(c, 'idle', frameOf('idle', this.t, true, true), q[0], q[1], CFG.rSmall * CFG.spriteK * 1.4, .28); } });
    // particles behind
    this.drawParts(c);
    // Void
    this.drawVoid(c);
    c.restore();
    // vignette/flash
    if (this.flash > 0) { c.fillStyle = `rgba(255,255,255,${clamp(this.flash, 0, .5)})`; c.fillRect(0, 0, W, H); }
    if (this.timeT > 0) { c.fillStyle = 'rgba(60,200,255,.07)'; c.fillRect(0, 0, W, H); }
    if (p.phase > 0) { c.fillStyle = 'rgba(160,120,255,.08)'; c.fillRect(0, 0, W, H); }
  }
  wallSeg(c, img, x, y0, y1) { const len = y1 - y0; if (len <= 1) return; const T = 56, tl = 112; c.save(); c.beginPath(); c.rect(x - T / 2, y0, T, len); c.clip();
    c.fillStyle = '#2a0a16'; c.fillRect(x - CFG.wallT / 2, y0, CFG.wallT, len); this.glowAt(c, x, (y0 + y1) / 2, Math.max(60, len * .6), '#ff2e48', .12);
    if (img) for (let y = y0 - ((y0 === 0) ? (tl - (len % tl)) % tl : 0); y < y1; y += tl) { c.save(); c.translate(x, y + tl / 2); c.rotate(Math.PI / 2); c.drawImage(img, -tl / 2, -T / 2, tl, T); c.restore(); }
    c.restore(); }
  glowAt(c, x, y, r, col, a) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp(a, 0, 1); c.drawImage(tinted(col), x - r, y - r, r * 2, r * 2); c.restore(); }
  drawParts(c) { c.save(); c.globalCompositeOperation = 'lighter'; this.parts.forEach(q => { c.globalAlpha = clamp(q.life / q.max, 0, 1); const s = q.size * 2.4; c.drawImage(tinted(q.col), q.x - s, q.y - s, s * 2, s * 2); }); c.restore(); }
  drawVoid(c) {
    const p = this.p; if (p.state === 'win' && this.winT > 1.2) return;
    const base = p.r * CFG.spriteK * (p.state === 'dead' ? 1 : 1); let name = p.clip, i, alpha = 1;
    if (p.state === 'alive' && p.inv > 0 && p.clip !== 'hurt') alpha = .55 + Math.sin(this.t * 30) * .25;
    // ability body overrides
    const fx = p.aniFx; let useFx = null;
    if (fx && p.state === 'alive') {
      const m = META.sprites['fx_' + fx], t = p.fxT;
      if (fx === 'shield') { if (p.shield) useFx = [2 + Math.floor(t * 8) % 2]; else if (t < 1) useFx = [Math.min(11, 6 + Math.floor(t * 12))]; }
      else if (fx === 'time_dilation') { if (this.timeT > 0) useFx = [t < .35 ? Math.floor(t * 12) : 2 + Math.floor(t * 10) % 4]; else if (t < 3) { } }
      else if (fx === 'phase') { if (p.phase > 0) useFx = [t < .3 ? Math.floor(t * 12) : 2 + Math.floor(t * 10) % 5]; }
      else { const f = Math.floor(t * 20); if (f < m.n) useFx = [f]; }
      if (fx === 'shield' || fx === 'time_dilation' || fx === 'phase') { if (useFx === null && fx !== 'shield') p.aniFx = null; }
    }
    if (useFx) { drawSprite(c, 'fx_' + fx, useFx[0], p.x, p.y, base * (fx === 'time_dilation' ? 1.2 : 1.05), alpha); }
    else { const m = META.sprites[name]; const ping = m.loop; i = frameOf(name, p.ct, m.loop, ping); drawSprite(c, name, i, p.x, p.y, base, alpha); }
    if (p.swT > 0) { c.save(); c.globalAlpha = .5; c.strokeStyle = '#b06bff'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, CFG.swallowR * (p.swT / CFG.swallowT), 0, 6.28); c.stroke(); c.restore(); }
    if (p.shield) this.glowAt(c, p.x, p.y, 44, '#4fe3f5', .45);
    if (p.big) this.glowAt(c, p.x, p.y, 56, '#ffb800', .3);
  }
}
