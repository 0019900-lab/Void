'use strict';
/* Void platformer engine (spec v6). Units = tiles. View height = 18 tiles = 450 logical px (TS=25). */
const TS = 25, VH = 18;
const PH = { run: 11, acc: 70, dec: 90, air: .6, g: 60, fallK: 1.3, maxFall: 26, jump: 22.4, cut: .4, dj: 19, coyote: .10, buffer: .12, dashT: .18, dashV: 30, dashCD: .25, slide: 3, wjx: 12, wjy: 20, wjLock: .15, spring: 31, R: .75, invul: 1.5, respawn: .5, deadT: .42 };
const IMG = {}, META = {};
const loadImg = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s; });
async function loadAssets(onProg) {
  META.pf = await (await fetch('assets/img/pf_meta.json')).json();
  META.sprites = await (await fetch('assets/sprites/meta.json')).json();
  const list = [['hero', 'assets/img/hero.webp']];
  Object.keys(META.pf.sizes).filter(n => !/^w[23]_/.test(n)).forEach(n => list.push(['pf_' + n, `assets/img/pf/${n}.webp`]));
  Object.keys(META.sprites).filter(n => n.startsWith('ui_') || n === 'idle').forEach(n => list.push(['spr_' + n, `assets/sprites/${n}.webp`]));
  [1, 2, 3].forEach(n => list.push(['bg' + n, `assets/img/bg/bg${n}.webp`]));
  let d = 0; await Promise.all(list.map(async ([k, s]) => { IMG[k] = await loadImg(s); onProg && onProg(++d / list.length); }));
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const pingpong = (t, r) => { const m = t % (2 * r); return m < r ? m : 2 * r - m; };
const glowCv = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#fff'); r.addColorStop(.35, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c; })();
const tc = {}; const tint = col => tc[col] || (tc[col] = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(glowCv, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, 64, 64); return c; })());
const FACE = n => META.pf.faces.indexOf(n);

function parseLevel(L) {
  const solids = [], haz = [], springs = [], crystals = [], movers = [];
  L.platforms.forEach(p => solids.push({ x: p.x, y: p.y, w: p.w, h: p.h, type: p.type, on: true, st: 0, tm: 0, fy: 0, rect() { return { x: this.x, y: this.y + this.fy, w: this.w, h: this.h }; } }));
  L.hazards.forEach(h => {
    if (h.type === 'mover') { const s = { x: h.x, y: h.y, w: h.w, h: .8, type: 'mover', on: true, mv: h, ox: h.x, dx: 0, fy: 0, rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; } }; solids.push(s); movers.push(s); }
    else if (h.type === 'wall') solids.push({ x: h.x, y: h.y, w: h.w, h: h.h, type: 'wall', on: true, cling: true, fy: 0, rect() { return this; } });
    else if (h.type === 'spring') springs.push({ x: h.x, y: h.y, sq: 0 });
    else if (h.type === 'spikes') haz.push({ k: 'spikes', x: h.x, y: h.y, w: h.w, h: .9, dir: h.dir || 'up' });
    else if (h.type === 'saw') haz.push({ k: 'saw', x: h.x, y0: h.y, ry: h.range_y, sp: h.speed, r: h.r, cy: h.y, rot: 0 });
  });
  L.pickups.forEach(p => { if (p.type === 'crystal') crystals.push({ x: p.x, y: p.y, got: false }); });
  return { L, solids, haz, springs, crystals, movers, cps: L.checkpoints.map(c => ({ x: c.x, y: c.y, on: false, t: 0 })), W: L.width_tiles, exit: L.exit, world: L.world };
}

class Game {
  constructor(canvas, hooks) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.hooks = hooks; this.running = false; this.paused = false; this.input = { x: 0, keys: {}, jump: false }; this.vw = 39; this.loop = this.loop.bind(this); this.marks = {}; }
  resize(S, stageW) { const dpr = Math.min(2, devicePixelRatio || 1); this.cv.width = Math.round(stageW * S * dpr); this.cv.height = Math.round(450 * S * dpr); this.cv.style.width = stageW + 'px'; this.k = S * dpr; this.vw = stageW / TS; }
  start(L, opts = {}) {
    this.lv = parseLevel(L); this.ab = L.abilities; this.id = L.id; this.t = 0; this.time = 0; this.deaths = 0; this.crystalsGot = 0; this.used = {}; this.fx = []; this.parts = []; this.failed = []; this.route = []; this.cpIdx = 0; this.cpRoute = 0;
    this.marks[L.id] = []; this.cam = 0; this.shake = 0; this.flash = 0; this.mode = 'play'; this.started = false; this.done = false; this.cpi = -1; this.shield = this.ab.includes('shield') ? 1 : 0; this.spawnAt = { x: L.start.x, y: L.start.y };
    this.spawn(true); this.running = true; this.paused = false; this.last = performance.now(); requestAnimationFrame(this.loop); SFX.setWorld(L.world);
  }
  spawn(first) {
    const p = this.p = { x: this.spawnAt.x, y: this.spawnAt.y, vx: 0, vy: 0, face: 1, grounded: false, gObj: null, wall: 0, coy: 0, buf: 0, jumpHeld: false, airJump: true, dashT: 0, dashCD: 0, dashCh: 1, dashDir: 1, lock: 0, inv: PH.invul * 0, state: first ? 'alive' : 'respawn', st: 0, sx: 1, sy: 1, tilt: 0, idle: 0, jcut: false, afters: [], landV: 0, shT: 0, ground: false };
    if (!first) { this.fx.push({ k: 'fx_respawn', x: p.x, y: p.y, t: 0, d: .5, s: 3 }); SFX.play('respawn'); }
    this.attempt = { start: this.cpRoute, pts: [] }; this.sampleT = 0; if (this.ab.includes('shield')) this.shield = 1;
  }
  can(a) { return this.ab.includes(a); }
  pressJump() { if (!this.running || this.paused) return; this.p.buf = PH.buffer; this.p.jumpHeld = true; this.input.jump = true; }
  releaseJump() { this.p.jumpHeld = false; this.input.jump = false; if (this.p.vy < 0 && this.p.jcut) { this.p.vy *= PH.cut; this.p.jcut = false; } }
  dash() { const p = this.p; if (!this.running || this.paused || p.state !== 'alive' || !this.can('dash') || p.dashCD > 0 || p.dashCh <= 0) return; const ax = this.axis(); p.dashDir = ax !== 0 ? Math.sign(ax) : p.face; p.face = p.dashDir; p.dashT = PH.dashT; p.dashCD = PH.dashCD + PH.dashT; p.dashCh = 0; this.used.dash = 1; SFX.play('dash'); this.shake = Math.max(this.shake, .15); this.fx.push({ k: 'fx_dash', x: p.x - p.dashDir * 1.6, y: p.y, t: 0, d: .3, s: 3.2, fl: p.dashDir < 0 }); }
  axis() { const k = this.input.keys; let a = this.input.x + ((k.ArrowRight || k.d || k.D) ? 1 : 0) - ((k.ArrowLeft || k.a || k.A) ? 1 : 0); return Math.abs(a) < .12 ? 0 : clamp(a, -1, 1); }
  emit(x, y, vx, vy, life, size, col) { if (this.parts.length < 300) this.parts.push({ x, y, vx, vy, life, max: life, size, col }); }
  burst(x, y, n, col, sp = 6, size = .3) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = Math.random() * sp; this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, .4 + Math.random() * .4, size, col); } }
  die(why) {
    const p = this.p; if (p.state !== 'alive' || p.inv > 0) return;
    if (this.shield > 0 && why !== 'pit') { this.shield = 0; p.inv = PH.invul; this.fx.push({ k: 'fx_shield_hit', x: p.x, y: p.y, t: 0, d: .45, s: 3.4 }); SFX.play('shieldBreak'); this.shake = .3; return; }
    p.state = 'dead'; p.st = 0; this.deaths++; this.marks[this.id].push({ x: p.x, y: Math.min(p.y, VH - .5), t: this.t }); this.failed.push({ start: this.attempt.start, pts: this.attempt.pts }); if (this.failed.length > 30) this.failed.shift(); this.route.length = this.attempt.start;
    this.burst(p.x, p.y, 28, '#b06bff', 9); this.shake = .35; this.flash = .12; SFX.play(why === 'saw' ? 'sawDeath' : 'death'); this.hooks.onDeath && this.hooks.onDeath(this.deaths);
  }
  loop(now) { if (!this.running) return; requestAnimationFrame(this.loop); const dt = Math.min(.033, (now - this.last) / 1000); this.last = now; if (!this.paused) this.update(dt); this.draw(); }
  update(dt) {
    this.t += dt; if (this.shake > 0) this.shake = Math.max(0, this.shake - dt); if (this.flash > 0) this.flash -= dt;
    this.parts = this.parts.filter(q => { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 14 * dt; return q.life > 0; }); this.fx = this.fx.filter(f => (f.t += dt) < f.d);
    const lv = this.lv; lv.cps.forEach(c => c.t += dt); lv.springs.forEach(s => s.sq = Math.max(0, s.sq - dt * 5));
    lv.haz.forEach(h => { if (h.k === 'saw') { h.cy = h.y0 + pingpong(this.t * h.sp, h.ry); h.rot += dt * 8; } });
    lv.movers.forEach(m => { const nx = m.ox + pingpong(this.t * m.mv.speed, m.mv.range); m.dx = nx - m.x; m.x = nx; });
    lv.solids.forEach(s => { if (s.type !== 'crumble') return; if (s.st === 1) { s.tm -= dt; if (s.tm <= 0) { s.st = 2; s.tm = 2; s.on = false; } } else if (s.st === 2) { s.fy += 25 * dt; s.tm -= dt; if (s.tm <= 0) { s.st = 0; s.on = true; s.fy = 0; } } });
    if (this.mode === 'replay') return this.updateReplay(dt);
    const p = this.p; p.st += dt;
    if (p.state === 'dead') { if (p.st > PH.deadT) { this.spawn(); } this.camUpdate(dt); return; }
    if (p.state === 'respawn') { p.sx = p.sy = clamp(p.st / PH.respawn, 0, 1); if (p.st > PH.respawn) { p.state = 'alive'; p.sx = p.sy = 1; } }
    if (p.state === 'win') { this.camUpdate(dt); if (p.st > 1.1 && !this.done) { this.done = true; this.startReplay(); } return; }
    if (this.started) this.time += dt;
    this.physics(dt); this.camUpdate(dt);
    // sampling for the attempt log (30 Hz)
    this.sampleT += dt; while (this.sampleT >= 1 / 30) { this.sampleT -= 1 / 30; const s = [p.x, p.y, p.face]; this.attempt.pts.push(s); this.route.push(s); }
  }
  physics(dt) {
    const p = this.p, lv = this.lv, ax = this.axis(); if (ax !== 0) { this.started = true; p.idle = 0; if (p.lock <= 0) p.face = Math.sign(ax); } else p.idle += dt; if (this.input.jump) this.started = true;
    ['coy', 'buf', 'lock', 'inv', 'dashCD'].forEach(k => { if (p[k] > 0) p[k] -= dt; });
    // carry on moving platform
    if (p.gObj && p.gObj.dx) p.x += p.gObj.dx;
    // horizontal
    if (p.dashT > 0) { p.dashT -= dt; p.vx = p.dashDir * PH.dashV; p.vy = 0; if (this.t % .03 < dt) p.afters.push({ x: p.x, y: p.y, t: 0 }); }
    else {
      if (p.lock <= 0) { const tgt = ax * PH.run, ctrl = p.grounded ? 1 : PH.air; const a = (ax === 0 ? PH.dec : (Math.sign(tgt) === Math.sign(p.vx) || p.vx === 0 ? PH.acc : PH.dec)) * ctrl; p.vx += clamp(tgt - p.vx, -a * dt, a * dt); }
      p.vy += PH.g * (p.vy > 0 ? PH.fallK : 1) * dt; if (p.vy > PH.maxFall) p.vy = PH.maxFall;
      if (this.can('wall') && p.wall && !p.grounded && p.vy > PH.slide && ax !== 0 && Math.sign(ax) === p.wall) { p.vy = PH.slide; if (this.t % .06 < dt) this.emit(p.x + p.wall * .7, p.y, 0, 1, .3, .2, '#7dfbe6'); }
    }
    // jump
    if (p.buf > 0) {
      if (p.grounded || p.coy > 0) { p.vy = -PH.jump; p.coy = 0; p.buf = 0; p.jcut = true; p.sx = .8; p.sy = 1.2; this.used.jump = 1; SFX.play('jump'); this.burst(p.x, p.y + .7, 6, '#b8a6ff', 4, .25); p.grounded = false; }
      else if (this.can('wall') && p.wall && !p.grounded) { p.vx = -p.wall * PH.wjx; p.vy = -PH.wjy; p.lock = PH.wjLock; p.face = -p.wall; p.buf = 0; p.jcut = true; p.airJump = true; p.dashCh = 1; SFX.play('wallj'); this.burst(p.x + p.wall * .7, p.y, 10, '#7dfbe6', 6, .25); this.used.wall = 1; }
      else if (this.can('double_jump') && p.airJump) { p.vy = -PH.dj; p.airJump = false; p.buf = 0; p.jcut = false; p.sx = .65; this.fx.push({ k: 'fx_double_jump', x: p.x, y: p.y + .6, t: 0, d: .4, s: 2.8 }); SFX.play('djump'); this.used.double_jump = 1; }
    }
    // integrate with substeps + collisions
    const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy) * dt / .25)), h = dt / steps; p.wall = 0; let ground = null, wasG = p.grounded; p.grounded = false;
    for (let i = 0; i < steps; i++) { p.x += p.vx * h; p.y += p.vy * h; const c = this.resolve(p); if (c.ground) ground = c.ground; if (c.wall) p.wall = c.wall; }
    p.gObj = ground; if (ground) { p.grounded = true; p.coy = PH.coy; p.airJump = true; p.dashCh = 1; if (ground.type === 'crumble' && ground.st === 0) { ground.st = 1; ground.tm = .4; } if (!wasG) this.land(); }
    p.x = Math.max(PH.R, p.x);
    if (p.y > VH + 2) this.die('pit');
    // squash recovery
    p.sx = lerp(p.sx, 1, 1 - Math.exp(-dt / .06)); p.sy = lerp(p.sy, 1, 1 - Math.exp(-dt / .06)); p.tilt = lerp(p.tilt, p.dashT > 0 ? 0 : clamp(p.vx / PH.run, -1, 1) * 6, 1 - Math.exp(-dt / .08));
    if (p.grounded && Math.abs(p.vx) > 6 && this.t % .12 < dt) this.emit(p.x - Math.sign(p.vx) * .5, p.y + .7, -p.vx * .1, -1.5, .3, .25, '#a89ad0');
    p.afters = p.afters.filter(a => (a.t += dt) < .25);
    // hazards
    const R = PH.R * .88;
    for (const h of lv.haz) {
      if (h.k === 'spikes') { const x0 = h.x + .12, w = h.w - .24, y0 = h.dir === 'down' ? h.y : h.y + .25, hh = h.dir === 'down' ? .65 : h.h - .25; if (this.circRect(p.x, p.y, R, x0, y0, w, hh)) { this.die('spikes'); break; } }
      else if (h.k === 'saw') { if (Math.hypot(p.x - h.x, p.y - h.cy) < h.r * .85 + R) { this.die('saw'); break; } }
    }
    for (const s of lv.springs) if (Math.abs(p.x - s.x) < .9 && p.y + PH.R > s.y - .5 && p.y + PH.R < s.y + .5 && p.vy >= 0) { p.vy = -PH.spring; s.sq = 1; p.airJump = true; p.dashCh = 1; p.sy = 1.3; p.sx = .8; p.jcut = false; SFX.play('spring'); this.burst(s.x, s.y, 10, '#ffd24a', 6, .25); }
    for (const c of lv.crystals) if (!c.got && Math.hypot(c.x - p.x, c.y - p.y) < 1.4) { c.got = true; this.crystalsGot++; SFX.play('crystal'); this.fx.push({ k: 'fx_pickup', x: c.x, y: c.y, t: 0, d: .4, s: 2 }); this.burst(c.x, c.y, 10, '#e86ac8', 5, .25); this.hooks.onCrystal && this.hooks.onCrystal(this.crystalsGot); }
    lv.cps.forEach((c, i) => { if (!c.on && i > this.cpi && Math.hypot(c.x - p.x, c.y - p.y) < 1.8) { c.on = true; this.cpi = i; this.spawnAt = { x: c.x, y: c.y }; this.cpRoute = this.route.length; if (this.ab.includes('shield')) this.shield = 1; SFX.play('checkpoint'); this.flash = .15; this.fx.push({ k: 'fx_checkpoint', x: c.x, y: c.y, t: 0, d: .6, s: 4.5 }); this.burst(c.x, c.y, 20, '#4fe3f5', 7, .3); this.hooks.onCheckpoint && this.hooks.onCheckpoint(i + 1, lv.cps.length); } });
    if (Math.hypot(lv.exit.x - p.x, lv.exit.y - p.y) < 1.8) { p.state = 'win'; p.st = 0; p.vx = p.vy = 0; SFX.play('win'); this.flash = .35; this.burst(p.x, p.y, 40, '#f5c44a', 10, .35); }
  }
  circRect(cx, cy, r, x, y, w, h) { const nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h); return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r; }
  land() { const p = this.p; if (p.landV > 6) { p.sx = 1.25; p.sy = .75; SFX.play('land'); this.burst(p.x, p.y + .7, 8, '#a89ad0', 5, .25); } }
  resolve(p) {
    const R = PH.R, out = { ground: null, wall: 0 }; p.landV = Math.max(p.landV * .9, p.vy);
    for (const s of this.lv.solids) {
      if (!s.on) continue; const r = s.rect(); if (Math.abs(p.x - (r.x + r.w / 2)) > r.w / 2 + 2) continue;
      const nx = clamp(p.x, r.x, r.x + r.w), ny = clamp(p.y, r.y, r.y + r.h); let dx = p.x - nx, dy = p.y - ny, d2 = dx * dx + dy * dy; if (d2 >= R * R) continue;
      if (d2 < 1e-6) { const l = p.x - r.x, rr = r.x + r.w - p.x, t = p.y - r.y, b = r.y + r.h - p.y, m = Math.min(l, rr, t, b); if (m === t) { p.y = r.y - R; dx = 0; dy = -1; } else if (m === b) { p.y = r.y + r.h + R; dx = 0; dy = 1; } else if (m === l) { p.x = r.x - R; dx = -1; dy = 0; } else { p.x = r.x + r.w + R; dx = 1; dy = 0; } }
      else { const d = Math.sqrt(d2); dx /= d; dy /= d; p.x = nx + dx * R; p.y = ny + dy * R; }
      if (dy < -.6) { out.ground = s; if (p.vy > 0) p.vy = 0; } else if (dy > .6) { if (p.vy < 0) p.vy = 0; }
      else if (Math.abs(dx) > .6) { if (p.vx * dx < 0) p.vx = 0; if (s.cling) out.wall = dx > 0 ? -1 : 1; }
    }
    return out;
  }
  camUpdate(dt) { const p = this.p, vw = this.vw, W = this.lv.W; let want = p.x - vw / 2 + p.face * 3; want = W <= vw ? (W - vw) / 2 : clamp(want, 0, W - vw); this.cam = lerp(this.cam, want, 1 - Math.exp(-dt / .15)); }
  result() { const L = this.lv.L; return { time: this.time, deaths: this.deaths, attempts: this.deaths + 1, crystals: this.crystalsGot, crystalsTotal: this.lv.crystals.length, used: this.used, abilities: this.ab, level: L.id }; }
  // ---- win replay (all attempts, sped up)
  startReplay() { this.mode = 'replay'; this.rt = 0; const n = this.route.length; this.rspeed = Math.max(2, n / 30 / 18); this.rdur = n / 30 / this.rspeed; SFX.play('rewind'); this.hooks.onReplay && this.hooks.onReplay(this.rdur, this.failed.length); }
  updateReplay(dt) {
    this.rt += dt; const idx = Math.min(this.route.length - 1, Math.floor(this.rt * 30 * this.rspeed)); const w = this.route[idx] || [0, 0, 1];
    const want = clamp(w[0] - this.vw / 2 + 3, 0, Math.max(0, this.lv.W - this.vw)); this.cam = lerp(this.cam, want, 1 - Math.exp(-dt / .2));
    if (this.rt > this.rdur + .8 && !this.replayDone) { this.replayDone = true; this.hooks.onWin && this.hooks.onWin(this.result()); }
  }
  stop() { this.running = false; }
  // ---- render
  draw() {
    const c = this.ctx, lv = this.lv, p = this.p, k = this.k, W = this.cv.width / k, vw = this.vw; c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, 450);
    const bg = IMG['bg' + lv.world]; if (bg) { const sc = 1.15, bh = 450 * sc, bw = bh * 16 / 9; for (let x = -((this.cam * TS * .08) % bw) - 20; x < W; x += bw) c.drawImage(bg, x, -(bh - 450) / 2, bw + 1, bh); }
    c.fillStyle = 'rgba(8,4,24,.42)'; c.fillRect(0, 0, W, 450);
    const sh = this.shake > 0 ? (Math.random() - .5) * 6 : 0, sv = this.shake > 0 ? (Math.random() - .5) * 6 : 0;
    c.setTransform(k * TS, 0, 0, k * TS, (-this.cam * TS + sh) * k, sv * k);
    const x0 = this.cam - 3, x1 = this.cam + vw + 3, I = n => IMG['pf_' + n];
    // motes (mid parallax)
    c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 26; i++) { const px = ((i * 37.3 + this.cam * .7 + Math.sin(this.t * .3 + i) * 2) % (vw + 6)) - 3 + this.cam * .3, py = (i * 7.7 + this.t * (.3 + (i % 3) * .2)) % VH; c.globalAlpha = .25; c.drawImage(tint(i % 2 ? '#7dfbe6' : '#b06bff'), px + this.cam * .0 - .15, py - .15, .3, .3); } c.restore();
    // scars (death traces) - nearest 60
    const marks = (this.marks[this.id] || []).filter(m => m.x > x0 - 2 && m.x < x1 + 2).slice(-60);
    marks.forEach(m => { const im = I('fx_scar'); const a = .55 + Math.sin(this.t * 3 + m.x) * .12; this.glow(c, m.x, m.y, 2.2, '#8a3cff', .35 * a); if (im) { c.globalAlpha = a; c.drawImage(im, m.x - 1.1, m.y - 1.1, 2.2, 2.2 * im.height / im.width); c.globalAlpha = 1; } });
    // platforms
    lv.solids.forEach(s => { if (s.x + s.w < x0 || s.x > x1) return; if (s.type === 'ground') this.drawGround(c, s); else if (s.type === 'crumble') this.drawStrip(c, I('w1_crumble'), s.x, s.y + s.fy, s.w, 1.1, s.st === 1 ? Math.sin(this.t * 60) * .05 : 0, s.st === 2 ? Math.max(0, s.tm / 2) : 1); else if (s.type === 'mover') this.drawStrip(c, I('w1_moving'), s.x, s.y - .1, s.w, s.w / 2.8, 0, 1); else if (s.type === 'wall') this.drawWall(c, s); });
    // hazards
    lv.haz.forEach(h => { if (h.k === 'spikes') { if (h.x + h.w < x0 || h.x > x1) return; const im = I(h.dir === 'down' ? 'spikes_down' : 'spikes_up'); if (!im) return; const n = Math.max(1, Math.round(h.w / 1.5)), w = h.w / n; this.glow(c, h.x + h.w / 2, h.y + .5, h.w * .6, '#ff2e48', .12); for (let i = 0; i < n; i++) c.drawImage(im, h.x + i * w, h.y - .15, w + .02, w * im.height / im.width); } else { if (h.x < x0 || h.x > x1) return; const im = I(h.r > 1.3 ? 'saw_large' : 'saw_small'); this.glow(c, h.x, h.cy, h.r * 1.8, '#ff2e48', .25); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(h.x - .04, h.y0, .08, h.ry); if (im) { c.save(); c.translate(h.x, h.cy); c.rotate(h.rot); c.drawImage(im, -h.r * 1.15, -h.r * 1.15, h.r * 2.3, h.r * 2.3); c.restore(); } } });
    lv.springs.forEach(s => { const im = I('spring'); if (!im || s.x < x0 || s.x > x1) return; const w = 1.5, h = w * im.height / im.width * (1 - s.sq * .35); c.drawImage(im, s.x - w / 2, s.y + .5 - h, w, h); });
    lv.crystals.forEach(cr => { if (cr.got || cr.x < x0 || cr.x > x1) return; const im = I('crystal'), b = Math.sin(this.t * 3 + cr.x) * .15; this.glow(c, cr.x, cr.y + b, 1.6, '#e86ac8', .5); if (im) c.drawImage(im, cr.x - .4, cr.y + b - .5, .8, 1); });
    lv.cps.forEach(cp => { const im = I(cp.on ? 'checkpoint_on' : 'checkpoint_off'); if (!im || cp.x < x0 - 2 || cp.x > x1 + 2) return; if (cp.on) this.glow(c, cp.x, cp.y, 3, '#4fe3f5', .35); c.save(); c.translate(cp.x, cp.y); c.rotate(cp.on ? this.t * .5 : 0); c.drawImage(im, -1.3, -1.3, 2.6, 2.6 * im.height / im.width); c.restore(); });
    { const e = lv.exit, im = I('exit_portal'); if (im && e.x > x0 - 3 && e.x < x1 + 3) { this.glow(c, e.x, e.y, 5, '#f5c44a', .35 + Math.sin(this.t * 3) * .1); c.drawImage(im, e.x - 1.9, e.y - 1.7, 3.8, 3.8 * im.height / im.width); } }
    // ghosts in replay
    if (this.mode === 'replay') this.drawGhosts(c);
    // fx sprites
    this.fx.forEach(f => { const im = I(f.k); if (!im) return; const u = f.t / f.d; c.save(); c.globalAlpha = 1 - u; c.globalCompositeOperation = 'lighter'; const s = f.s * (.6 + u * .6); c.translate(f.x, f.y); if (f.fl) c.scale(-1, 1); c.drawImage(im, -s / 2, -s * im.height / im.width / 2, s, s * im.height / im.width); c.restore(); });
    this.drawParts(c);
    if (this.mode === 'play') this.drawHero(c);
    // overlays
    c.setTransform(k, 0, 0, k, 0, 0); if (this.flash > 0) { c.fillStyle = `rgba(255,255,255,${clamp(this.flash * 2, 0, .45)})`; c.fillRect(0, 0, W, 450); }
    if (this.mode === 'replay') { const g = c.createRadialGradient(W / 2, 225, 120, W / 2, 225, W * .6); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(60,20,120,${.55 + Math.sin(this.t * 6) * .1})`); c.fillStyle = g; c.fillRect(0, 0, W, 450); }
  }
  glow(c, x, y, r, col, a) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp(a, 0, 1); c.drawImage(tint(col), x - r, y - r, r * 2, r * 2); c.restore(); }
  drawParts(c) { c.save(); c.globalCompositeOperation = 'lighter'; this.parts.forEach(q => { c.globalAlpha = clamp(q.life / q.max, 0, 1); const s = q.size * 2; c.drawImage(tint(q.col), q.x - s / 2, q.y - s / 2, s, s); }); c.restore(); }
  drawGround(c, s) { const im = IMG.pf_w1_ground; const g = c.createLinearGradient(0, s.y, 0, s.y + s.h); g.addColorStop(0, '#2b1a55'); g.addColorStop(1, '#0d0722'); c.fillStyle = g; c.fillRect(s.x, s.y + .35, s.w, Math.max(0, s.h - .35)); c.fillStyle = 'rgba(125,251,230,.12)'; c.fillRect(s.x, s.y + .35, .08, s.h); c.fillRect(s.x + s.w - .08, s.y + .35, .08, s.h); if (im) { const h = 1.35, w = h * im.width / im.height, n = Math.ceil(s.w / w); c.save(); c.beginPath(); c.rect(s.x - .1, s.y - .6, s.w + .2, 3); c.clip(); for (let i = 0; i < n; i++) c.drawImage(im, s.x + i * w, s.y - .3, w + .02, h); c.restore(); } }
  drawStrip(c, im, x, y, w, h, jit, a) { if (!im) return; c.save(); c.globalAlpha = a; const tw = h * im.width / im.height, n = Math.max(1, Math.round(w / tw)), ww = w / n; for (let i = 0; i < n; i++) c.drawImage(im, x + i * ww + jit, y - .1, ww + .02, h); c.restore(); }
  drawWall(c, s) { const im = IMG.pf_w1_wall; c.fillStyle = '#16093a'; c.fillRect(s.x, s.y, s.w, s.h); if (!im) return; const w = s.w + .5, h = w * im.height / im.width; c.save(); c.beginPath(); c.rect(s.x - .3, s.y, s.w + .6, s.h); c.clip(); for (let y = s.y; y < s.y + s.h; y += h * .9) c.drawImage(im, s.x - .25, y, w, h); c.restore(); this.glow(c, s.x + s.w / 2, s.y + s.h / 2, s.h * .4, '#4fe3f5', .1); }
  faceOf(p) { if (p.state === 'dead') return 'shocked'; if (p.state === 'respawn') return 'happy'; if (p.state === 'win') return 'proud'; if (p.dashT > 0) return 'determined'; if (p.wall && !p.grounded) return 'scared'; if (!p.grounded) return p.vy > 18 ? 'scared' : (p.vy < 0 ? 'happy' : 'neutral'); if (p.inv > 0) return 'hurt'; if (p.idle > 8) return 'sleepy'; if (p.idle > 0 && (this.t % 2.2) < .12) return 'blink'; return 'neutral'; }
  heroAt(c, x, y, face, sx, sy, tilt, flip, alpha) { const m = META.pf, i = FACE(face), cell = m.cell, im = IMG.hero; if (!im || i < 0) return; const S = 2.2; c.save(); c.translate(x, y - .1); c.rotate(tilt * Math.PI / 180); c.scale(sx * (flip || 1), sy); c.globalAlpha = alpha; c.drawImage(im, (i % m.cols) * cell, Math.floor(i / m.cols) * cell, cell, cell, -S / 2, -S / 2, S, S); c.restore(); }
  drawHero(c) {
    const p = this.p; if (p.state === 'dead') { const u = p.st / PH.deadT; if (u < .5) this.heroAt(c, p.x, p.y, 'shocked', 1 + u, 1 - u, 0, 1, 1 - u * 1.5); return; }
    p.afters.forEach(a => this.heroAt(c, a.x, a.y, 'determined', 1.2, .85, 0, p.dashDir, .35 * (1 - a.t / .25)));
    let sx = p.sx, sy = p.sy; const br = Math.sin(this.t * (p.grounded && Math.abs(p.vx) > 1 ? 13.8 : 3.8)) * (p.grounded && Math.abs(p.vx) > 1 ? .06 : .03); if (p.grounded) sy *= 1 + br; if (!p.grounded && p.vy < -2) { sx *= .92; sy *= 1.12; } if (p.dashT > 0) { sx = 1.35; sy = .8; } if (p.wall && !p.grounded) { }
    const alpha = p.inv > 0 ? .55 + Math.sin(this.t * 40) * .3 : 1; this.glow(c, p.x, p.y, 2.4, p.dashT > 0 ? '#c58bff' : '#6a2fe0', .3);
    this.heroAt(c, p.x, p.y, this.faceOf(p), sx, sy, p.wall && !p.grounded ? -p.wall * 8 : p.tilt, 1, alpha);
    if (this.shield > 0 && this.ab.includes('shield')) { this.glow(c, p.x, p.y, 1.9, '#4fe3f5', .4); c.save(); c.strokeStyle = 'rgba(125,251,230,.7)'; c.lineWidth = .08; c.beginPath(); c.arc(p.x, p.y, 1.35, 0, 6.28); c.stroke(); c.restore(); }
  }
  drawGhosts(c) {
    const idx = Math.floor(this.rt * 30 * this.rspeed), cols = ['#ff7ad9', '#6fa8ff', '#b06bff']; this.failed.forEach((f, i) => { const j = idx - f.start; if (j < 0 || j >= f.pts.length) return; const q = f.pts[j], col = cols[i % 3]; c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = col; c.globalAlpha = .35; c.lineWidth = .18; c.beginPath(); for (let t = Math.max(0, j - 10); t <= j; t++) { const r = f.pts[t]; t === Math.max(0, j - 10) ? c.moveTo(r[0], r[1]) : c.lineTo(r[0], r[1]); } c.stroke(); c.restore(); this.glow(c, q[0], q[1], 2.2, col, .5); this.heroAt(c, q[0], q[1], 'scared', 1, 1, 0, q[2], .38); });
    const w = this.route[Math.min(idx, this.route.length - 1)] || [0, 0, 1]; this.glow(c, w[0], w[1], 3.2, '#f5c44a', .6); this.heroAt(c, w[0], w[1], 'proud', 1, 1, 0, w[2], 1);
  }
}
