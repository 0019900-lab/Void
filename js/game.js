'use strict';
/* Void platformer engine (spec v6). Units = tiles. View height = 18 tiles = 450 logical px (TS=25). */
const TS = 25, VH = 18;
const PH = { run: 11, acc: 70, dec: 90, air: .6, g: 60, fallK: 1.3, maxFall: 26, jump: 22.4, cut: .4, dj: 19, coyote: .10, buffer: .12, dashT: .18, dashV: 30, dashCD: .25, slide: 3, wjx: 12, wjy: 20, wjLock: .15, spring: 31, R: .75, invul: 1.5, respawn: .5, deadT: .42 };
const IMG = {}, META = {}, VIEW = 12.6, SHEETS = ['idle', 'sleep', 'move_left', 'move_right', 'move_up', 'move_down', 'dash', 'death', 'respawn', 'win', 'hurt'];
const loadImg = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s; });
async function loadAssets(onProg) {
  META.pf = await (await fetch('assets/img/pf_meta.json')).json();
  META.sprites = await (await fetch('assets/sprites/meta.json')).json();
  const list = [['hero', 'assets/img/hero.webp']];
  Object.keys(META.pf.sizes).filter(n => !/^w[23]_/.test(n)).forEach(n => list.push(['pf_' + n, `assets/img/pf/${n}.webp`]));
  Object.keys(META.sprites).filter(n => n.startsWith('ui_') || SHEETS.includes(n)).forEach(n => list.push(['spr_' + n, `assets/sprites/${n}.webp`]));
  [1, 2, 3].forEach(n => ['far', 'mid', 'near'].forEach(l => list.push(['bg2_w' + n + '_' + l, `assets/img/bg2/w${n}_${l}.webp`])));
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
    else if (h.type === 'piston') haz.push({ k: 'piston', x: h.x, y: h.y, w: 1.5, H: h.h || 3, per: h.period || 3.4, ph: h.phase || 0, ext: 0, warn: 0, seg: 0 });
    else if (h.type === 'saw') haz.push({ k: 'saw', x: h.x, y0: h.y, ry: h.range_y, sp: h.speed, r: h.r, cy: h.y, rot: 0 });
  });
  L.pickups.forEach(p => { if (p.type === 'crystal') crystals.push({ x: p.x, y: p.y, got: false }); });
  // moving platforms stop at the solid ground/walls on either side (no more sinking into the floor), and pause + bump at both ends
  movers.forEach(m => {
    let lo = -1e9, hi = 1e9; const y0 = m.y, y1 = m.y + m.h;
    solids.forEach(q => { if (q.type === 'mover') return; const r = q.rect(); if (r.y >= y1 - .05 || r.y + r.h <= y0 + .05) return;
      if (r.x + r.w <= m.x + .02) lo = Math.max(lo, r.x + r.w); else if (r.x >= m.x + m.w - .02) hi = Math.min(hi, r.x - m.w); });
    const a = lo > -1e8 ? lo + .06 : m.x, b = hi < 1e8 ? hi - .06 : m.x + m.mv.range; m.ox = a; m.x = a; m.range = Math.max(1, b - a); m.sp = m.mv.speed; m.bump = 0; m.hit = 0;
  });
  const below = (x, y) => { let g = null; solids.forEach(q => { if (q.type === 'mover') return; if (x >= q.x - .3 && x <= q.x + q.w + .3 && q.y >= y - .3 && (g === null || q.y < g)) g = q.y; }); return g; };
  return { L, solids, haz, springs, crystals, movers, cps: L.checkpoints.map(c => ({ x: c.x, y: c.y, on: false, t: 0, lit: 0, gy: below(c.x, c.y) })), W: L.width_tiles, exit: L.exit, world: L.world };
}

class Game {
  constructor(canvas, hooks) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.hooks = hooks; this.running = false; this.paused = false; this.input = { x: 0, keys: {}, jump: false }; this.vw = 39; this.loop = this.loop.bind(this); this.marks = {}; this.dtv = .016; this.camY = 4.5; this.ts = 450 / VIEW; this.hitstop = 0; this.q = 1; this.ema = .0167; this.acc = 0; this.qT = 0; }
  resize(S, stageW) { this._rs = [S, stageW]; const dpr = Math.min(1.5, devicePixelRatio || 1) * this.q; this.cv.width = Math.round(stageW * S * dpr); this.cv.height = Math.round(450 * S * dpr); this.cv.style.width = stageW + 'px'; this.cv.style.height = (450 * S) / S + 'px'; this.k = S * dpr; this.ts = 450 / VIEW; this.vw = stageW / this.ts; }
  start(L, opts = {}) {
    this.lv = parseLevel(L); this.ab = L.abilities; this.id = L.id; this.t = 0; this.time = 0; this.deaths = 0; this.crystalsGot = 0; this.used = {}; this.fx = []; this.parts = []; this.failed = []; this.route = []; this.cpIdx = 0; this.cpRoute = 0;
    this.marks[L.id] = []; this.cam = 0; this.camY = 5.4; this.shake = 0; this.flash = 0; this.mode = 'play'; this.started = false; this.done = false; this.cpi = -1; this.shield = this.ab.includes('shield') ? 1 : 0; this.spawnAt = { x: L.start.x, y: L.start.y };
    this.spawn(true); this.running = true; this.paused = false; this.acc = 0; this.last = performance.now(); this.qT = this.last + 2500; this.warmEyes(); requestAnimationFrame(this.loop); SFX.setWorld(L.world);
  }
  spawn(first) {
    const p = this.p = { x: this.spawnAt.x, y: this.spawnAt.y, vx: 0, vy: 0, face: 1, grounded: false, gObj: null, wall: 0, coy: 0, buf: 0, jumpHeld: false, airJump: true, dashT: 0, dashCD: 0, dashCh: 1, dashDir: 1, lock: 0, inv: PH.invul * 0, state: first ? 'alive' : 'respawn', st: 0, sx: 1, sy: 1, tilt: 0, idle: 0, air: 0, air2: 0, jcut: false, afters: [], landV: 0, shT: 0, ground: false };
    if (!first) { this.fx.push({ k: 'fx_respawn', x: p.x, y: p.y, t: 0, d: .5, s: 3 }); SFX.play('respawn'); }
    this.attempt = { start: this.cpRoute, pts: [] }; this.sampleT = 0; if (this.ab.includes('shield')) this.shield = 1;
  }
  can(a) { return this.ab.includes(a); }
  pressJump() { if (!this.running || this.paused) return; this.p.buf = PH.buffer; this.p.jumpHeld = true; this.input.jump = true; }
  releaseJump() { this.p.jumpHeld = false; this.input.jump = false; if (this.p.vy < 0 && this.p.jcut) { this.p.vy *= PH.cut; this.p.jcut = false; } }
  dash() { const p = this.p; if (!this.running || this.paused || p.state !== 'alive' || !this.can('dash') || p.dashCD > 0 || p.dashCh <= 0) return; const ax = this.axis(); p.dashDir = ax !== 0 ? Math.sign(ax) : p.face; p.face = p.dashDir; p.dashT = PH.dashT; p.dashCD = PH.dashCD + PH.dashT; p.dashCh = 0; this.used.dash = 1; SFX.play('dash'); this.shake = Math.max(this.shake, .12); for (let i = 0; i < 10; i++) this.emit(p.x - p.dashDir * (.3 + Math.random() * .8), p.y + (Math.random() - .5) * 1.1, -p.dashDir * (4 + Math.random() * 6), (Math.random() - .5) * 2, .3 + Math.random() * .2, .28, i % 2 ? '#c58bff' : '#7dfbe6'); }
  axis() { const k = this.input.keys; let a = this.input.x + ((k.ArrowRight || k.d || k.D) ? 1 : 0) - ((k.ArrowLeft || k.a || k.A) ? 1 : 0); return Math.abs(a) < .12 ? 0 : clamp(a, -1, 1); }
  emit(x, y, vx, vy, life, size, col) { if (this.parts.length < 300) this.parts.push({ x, y, vx, vy, life, max: life, size, col }); }
  burst(x, y, n, col, sp = 6, size = .3) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = Math.random() * sp; this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, .4 + Math.random() * .4, size, col); } }
  die(why) {
    const p = this.p; if (p.state !== 'alive' || p.inv > 0) return;
    if (this.shield > 0 && why !== 'pit') { this.shield = 0; p.inv = PH.invul; this.fx.push({ k: 'fx_shield_hit', x: p.x, y: p.y, t: 0, d: .45, s: 3.4 }); SFX.play('shieldBreak'); this.shake = .3; return; }
    p.state = 'dead'; p.st = 0; this.deaths++; this.marks[this.id].push({ x: p.x, y: Math.min(p.y, VH - .5), t: this.t }); this.failed.push({ start: this.attempt.start, pts: this.attempt.pts }); if (this.failed.length > 30) this.failed.shift(); this.route.length = this.attempt.start;
    this.burst(p.x, p.y, 28, '#b06bff', 9); this.shake = .35; this.flash = .08; this.flashCol = '176,107,255'; this.hitstop = .05; SFX.play(why === 'saw' ? 'sawDeath' : 'death'); this.hooks.onDeath && this.hooks.onDeath(this.deaths);
  }
  loop(now) {
    if (!this.running) return; requestAnimationFrame(this.loop); const raw = (now - this.last) / 1000, dt = clamp(raw, 0, .1); this.last = now; this.dtv = Math.min(dt, .05);
    if (!this.paused && raw < .25) { this.ema += (dt - this.ema) * .06; if (this.ema > .027 && now > this.qT && this.q > .55 && this._rs) { this.q = Math.max(.55, this.q * .82); this.qT = now + 2500; this.resize(this._rs[0], this._rs[1]); this.ema = .0167; } }
    if (!this.paused) { this.acc += dt; const H = 1 / 120; let n = 0; while (this.acc >= H && n < 10) { if (this.hitstop > 0) this.hitstop -= H; else this.update(H); this.acc -= H; n++; } if (n >= 10) this.acc = 0; } this.draw();
  }
  update(dt) {
    this.t += dt; if (this.shake > 0) this.shake = Math.max(0, this.shake - dt); if (this.flash > 0) this.flash -= dt;
    this.parts = this.parts.filter(q => { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 14 * dt; return q.life > 0; }); this.fx = this.fx.filter(f => (f.t += dt) < f.d);
    const lv = this.lv; lv.cps.forEach(c => c.t += dt); lv.springs.forEach(s => s.sq = Math.max(0, s.sq - dt * 5));
    lv.haz.forEach(h => { if (h.k === 'piston') { const W1 = .6, U = .09, HD = .6, DN = .5, RS = h.per - W1 - U - HD - DN, u = (((this.t + h.ph) % h.per) + h.per) % h.per; let e = 0, wn = 0, sg = 0;
        if (u < RS) { e = 0; sg = 0; } else if (u < RS + W1) { wn = (u - RS) / W1; e = 0; sg = 1; } else if (u < RS + W1 + U) { e = 1 - Math.pow(1 - (u - RS - W1) / U, 3); sg = 2; } else if (u < RS + W1 + U + HD) { e = 1; sg = 3; } else { const k = (u - RS - W1 - U - HD) / DN; e = 1 - k * k * (3 - 2 * k); sg = 4; }
        if (sg === 2 && h.seg !== 2) { this.burst(h.x + h.w / 2, h.y, 8, '#ffb347', 6, .25); this.shake = Math.max(this.shake, Math.abs(h.x - this.p.x) < 14 ? .14 : 0); if (Math.abs(h.x - this.p.x) < 14) SFX.play('land'); }
        if (sg === 1 && Math.abs(h.x - this.p.x) < 16 && Math.random() < dt * 20) this.emit(h.x + Math.random() * h.w, h.y - .1, (Math.random() - .5) * 1.5, -2.2, .4, .16, '#c9a96a');
        h.ext = e; h.warn = wn; h.seg = sg; }
      else if (h.k === 'saw') { h.cy = h.y0 + h.ry / 2; h.rot += dt * 11; if (Math.abs(h.x - this.p.x) < 20 && Math.random() < dt * 14) { const a = Math.random() * 6.28; this.emit(h.x + Math.cos(a) * h.r, h.cy + Math.sin(a) * h.r, Math.cos(a) * 5, Math.sin(a) * 5 - 2, .35, .22, '#ffb347'); } } else if (h.k === 'spikes' && Math.abs(h.x - this.p.x) < 20 && Math.random() < dt * 1.5 * h.w) this.emit(h.x + Math.random() * h.w, h.y + .1, (Math.random() - .5) * .6, -2.5, .8, .2, '#ff4a60'); });
    lv.movers.forEach(m => { const D = .24, T = m.range / m.sp, P = 2 * (T + D); let u = ((this.t % P) + P) % P, o; if (u < T) o = u * m.sp; else if (u < T + D) o = m.range; else if (u < 2 * T + D) o = m.range - (u - T - D) * m.sp; else o = 0;
      const atEnd = u >= T && u < T + D ? 1 : (u >= 2 * T + D || u < .001 ? 2 : 0); if (atEnd && m.hit !== atEnd) { m.hit = atEnd; m.bump = .25; const ex = m.x + (atEnd === 1 ? m.w : 0); this.burst(ex, m.y + .4, 6, '#ffd24a', 4, .22); if (Math.abs(m.x - this.p.x) < 14) SFX.play('land'); } else if (!atEnd) m.hit = 0; if (m.bump > 0) m.bump -= dt;
      const nx = m.ox + o; m.dx = nx - m.x; m.x = nx; });
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
    if (p.dashT > 0) { p.dashT -= dt; p.vx = p.dashDir * PH.dashV; p.vy = 0; if (this.t % .03 < dt) p.afters.push({ x: p.x, y: p.y, t: 0, d: p.dashDir }); }
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
    if (p.y > VH + .8) this.die('pit');
    if (p.grounded) { p.air = 0; p.air2 = 0; } else if (p.vy < 0) { p.air += dt; p.air2 = 0; } else p.air2 += dt;
    // squash recovery
    p.sx = lerp(p.sx, 1, 1 - Math.exp(-dt / .06)); p.sy = lerp(p.sy, 1, 1 - Math.exp(-dt / .06)); p.tilt = lerp(p.tilt, p.dashT > 0 ? 0 : clamp(p.vx / PH.run, -1, 1) * 6, 1 - Math.exp(-dt / .08));
    if (p.grounded && Math.abs(p.vx) > 6 && this.t % .12 < dt) this.emit(p.x - Math.sign(p.vx) * .5, p.y + .7, -p.vx * .1, -1.5, .3, .25, '#a89ad0');
    p.afters = p.afters.filter(a => (a.t += dt) < .25);
    // hazards
    const R = PH.R * .88;
    for (const h of lv.haz) {
      if (h.k === 'spikes') { const x0 = h.x + .12, w = h.w - .24, y0 = h.dir === 'down' ? h.y : h.y + .25, hh = h.dir === 'down' ? .65 : h.h - .25; if (this.circRect(p.x, p.y, R, x0, y0, w, hh)) { this.die('spikes'); break; } }
      else if (h.k === 'piston') { if (h.ext > .12) { const ph = h.ext * h.H; if (this.circRect(p.x, p.y, R, h.x + .14, h.y - ph + .12, h.w - .28, ph)) { this.die('saw'); break; } } }
      else if (h.k === 'saw') { if (Math.hypot(p.x - h.x, p.y - h.cy) < h.r * .85 + R) { this.die('saw'); break; } }
    }
    for (const s of lv.springs) if (Math.abs(p.x - s.x) < .9 && p.y + PH.R > s.y - .5 && p.y + PH.R < s.y + .5 && p.vy >= 0) { p.vy = -PH.spring; s.sq = 1; p.airJump = true; p.dashCh = 1; p.sy = 1.3; p.sx = .8; p.jcut = false; SFX.play('spring'); this.burst(s.x, s.y, 10, '#ffd24a', 6, .25); }
    for (const c of lv.crystals) if (!c.got && Math.hypot(c.x - p.x, c.y - p.y) < 1.4) { c.got = true; this.crystalsGot++; SFX.play('crystal'); this.fx.push({ k: 'fx_pickup', x: c.x, y: c.y, t: 0, d: .4, s: 2 }); this.burst(c.x, c.y, 10, '#e86ac8', 5, .25); this.hooks.onCrystal && this.hooks.onCrystal(this.crystalsGot); }
    lv.cps.forEach((c, i) => { if (!c.on && i > this.cpi && Math.hypot(c.x - p.x, c.y - p.y) < 1.8) { c.on = true; this.cpi = i; this.spawnAt = { x: c.x, y: c.y }; this.cpRoute = this.route.length; if (this.ab.includes('shield')) this.shield = 1; SFX.play('checkpoint'); this.flash = .1; this.flashCol = '79,227,245'; c.lit = 1; this.fx.push({ k: 'fx_checkpoint', x: c.x, y: c.y, t: 0, d: .6, s: 4.5 }); this.burst(c.x, c.y, 20, '#4fe3f5', 7, .3); this.hooks.onCheckpoint && this.hooks.onCheckpoint(i + 1, lv.cps.length); } });
    if (Math.hypot(lv.exit.x - p.x, lv.exit.y - p.y) < 1.8) { p.state = 'win'; p.st = 0; p.vx = p.vy = 0; SFX.play('win'); this.flash = .2; this.flashCol = '245,196,74'; this.burst(p.x, p.y, 40, '#f5c44a', 10, .35); }
  }
  circRect(cx, cy, r, x, y, w, h) { const nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h); return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r; }
  land() { const p = this.p; if (p.landV > 6) { p.sx = 1.3; p.sy = .72; if (p.landV > 16) this.shake = Math.max(this.shake, .1); SFX.play('land'); this.burst(p.x, p.y + .7, 8, '#a89ad0', 5, .25); } }
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
  camUpdate(dt) { const p = this.p, vw = this.vw, W = this.lv.W; const wy = clamp(p.y - 7.7, 2.4, 6.2); this.camY = lerp(this.camY, wy, 1 - Math.exp(-dt / .28)); let want = p.x - vw / 2 + p.face * 2.5 + clamp(p.vx * .14, -2.5, 2.5); want = W <= vw ? (W - vw) / 2 : clamp(want, 0, W - vw); this.cam = lerp(this.cam, want, 1 - Math.exp(-dt / .15)); }
  result() { const L = this.lv.L; return { time: this.time, deaths: this.deaths, attempts: this.deaths + 1, crystals: this.crystalsGot, crystalsTotal: this.lv.crystals.length, used: this.used, abilities: this.ab, level: L.id }; }
  // ---- win replay (all attempts, sped up)
  startReplay() { this.mode = 'replay'; this.rt = 0; const n = this.route.length; this.failed.forEach(f => f.fin = 0); this.rspeed = 1.5; this.rdur = n / 30 / this.rspeed; this.rwarp = 0; SFX.play('rewind'); this.hooks.onReplay && this.hooks.onReplay(this.rdur, this.failed.length); }
  updateReplay(dt) {
    this.rt += dt; this.rwarp = Math.min(1, this.rwarp + dt * 2.2); const idx = Math.min(this.route.length - 1, this.rt * 30 * this.rspeed), w = this.pt(this.route, idx);
    this.camY = lerp(this.camY, clamp(w[1] - 7.7, 2.4, 6.2), 1 - Math.exp(-dt / .3)); const want = clamp(w[0] - this.vw / 2 + 3, 0, Math.max(0, this.lv.W - this.vw)); this.cam = lerp(this.cam, want, 1 - Math.exp(-dt / .2));
    this.failed.forEach(f => { const j = idx - f.start; if (!f.fin && j >= f.pts.length - 1 && f.pts.length) { f.fin = 1; const q = f.pts[f.pts.length - 1]; this.burst(q[0], q[1], 14, '#ff7ad9', 7); this.fx.push({ k: 'fx_burst', x: q[0], y: q[1], t: 0, d: .4, s: 3 }); } });
    if (this.rt > this.rdur + .8 && !this.replayDone) { this.replayDone = true; this.hooks.onWin && this.hooks.onWin(this.result()); }
  }
  pt(arr, i) { const a = Math.max(0, Math.min(arr.length - 1, Math.floor(i))), b = Math.min(arr.length - 1, a + 1), u = clamp(i - a, 0, 1), A = arr[a] || [0, 0, 1], B = arr[b] || A; return [lerp(A[0], B[0], u), lerp(A[1], B[1], u), B[2], B[0] - A[0]]; }
  stop() { this.running = false; }
  // ---- render
  draw() {
    const c = this.ctx, lv = this.lv, p = this.p, k = this.k, W = this.cv.width / k, vw = this.vw; c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, 450);
    BG.draw(c, W, this);
    this.drawBgFx(c, W);
    const sh = this.shake > 0 ? (Math.random() - .5) * 6 : 0, sv = this.shake > 0 ? (Math.random() - .5) * 6 : 0;
    const T = this.ts; c.setTransform(k * T, 0, 0, k * T, (-this.cam * T + sh) * k, (-this.camY * T + sv) * k);
    const x0 = this.cam - 3, x1 = this.cam + vw + 3, I = n => IMG['pf_' + n]; this.vx0 = x0; this.vx1 = x1;
    // motes (mid parallax)
    c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 26; i++) { const px = ((i * 37.3 + this.cam * .7 + Math.sin(this.t * .3 + i) * 2) % (vw + 6)) - 3 + this.cam * .3, py = (i * 7.7 + this.t * (.3 + (i % 3) * .2)) % VH; c.globalAlpha = .25; c.drawImage(tint(i % 2 ? '#7dfbe6' : '#b06bff'), px + this.cam * .0 - .15, py - .15, .3, .3); } c.restore();
    // scars (death traces) - nearest 60
    const marks = (this.marks[this.id] || []).filter(m => m.x > x0 - 2 && m.x < x1 + 2).slice(-60);
    marks.forEach(m => { const im = I('fx_scar'); const a = .55 + Math.sin(this.t * 3 + m.x) * .12; this.glow(c, m.x, m.y, 2.2, '#8a3cff', .35 * a); if (im) { c.globalAlpha = a; c.drawImage(im, m.x - 1.1, m.y - 1.1, 2.2, 2.2 * im.height / im.width); c.globalAlpha = 1; } });
    // platforms
    lv.solids.forEach(s => { if (s.x + s.w < x0 || s.x > x1) return; if (s.type === 'ground') this.drawGround(c, s); else if (s.type === 'crumble') this.drawStrip(c, I('w1_crumble'), s.x, s.y + s.fy, s.w, 1.1, s.st === 1 ? Math.sin(this.t * 60) * .05 : 0, s.st === 2 ? Math.max(0, s.tm / 2) : 1); else if (s.type === 'mover') { const bq = Math.max(0, s.bump || 0) * 4; this.drawStrip(c, I('w1_moving'), s.x, s.y - .1 + bq * .08, s.w * (1 + bq * .05), s.w / 2.8 * (1 - bq * .06), 0, 1); if (bq > 0) this.glow(c, s.x + s.w / 2, s.y + .3, s.w * .8, '#ffd24a', bq * .25); } else if (s.type === 'wall') this.drawWall(c, s); });
    // hazards
    this.drawHaz(c, x0, x1, I);
    lv.springs.forEach(s => { const im = I('spring'); if (!im || s.x < x0 || s.x > x1) return; const w = 1.7, h = w * im.height / im.width * (1 - s.sq * .35); this.glow(c, s.x, s.y + .1, 1.8 + s.sq, '#ffd24a', .18 + s.sq * .3 + .06 * Math.sin(this.t * 4)); c.drawImage(im, s.x - w / 2, s.y + .5 - h, w, h); });
    lv.crystals.forEach(cr => { if (cr.got || cr.x < x0 || cr.x > x1) return; const im = I('crystal'), b = Math.sin(this.t * 2.6 + cr.x) * .22, pu = .5 + .5 * Math.sin(this.t * 5 + cr.x * 3); this.glow(c, cr.x, cr.y + b, 2.1 + pu * .4, '#e86ac8', .55); if (im) { c.save(); c.translate(cr.x, cr.y + b); c.rotate(Math.sin(this.t * 1.7 + cr.x) * .12); c.drawImage(im, -.55, -.7, 1.1, 1.4); c.restore(); } c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .35 + pu * .5; c.fillStyle = '#fff'; const sp = .12 + pu * .1; c.fillRect(cr.x + .35 - sp / 2, cr.y + b - .5, sp, sp); c.fillRect(cr.x - .45, cr.y + b + .1 - sp / 2, sp * .8, sp * .8); c.restore(); });
    lv.cps.forEach(cp => { const im = I(cp.on ? 'checkpoint_on' : 'checkpoint_off'); if (!im || cp.x < x0 - 3 || cp.x > x1 + 3) return; if (cp.lit > 0) cp.lit = Math.max(0, cp.lit - this.dtv * 1.3);
      const w = 3.1, h = w * im.height / im.width, by = (cp.gy === null || cp.gy === undefined ? cp.y + 1.3 : cp.gy) + .12, pu = .5 + .5 * Math.sin(this.t * 2.4 + cp.x), cy = by - h * .55;
      if (cp.on) { this.glow(c, cp.x, cy, 3.4 + cp.lit * 2, '#4fe3f5', .22 + pu * .1 + cp.lit * .5); }
      c.drawImage(im, cp.x - w / 2, by - h, w, h);
      if (cp.on) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .16 + pu * .1 + cp.lit * .45; c.drawImage(im, cp.x - w / 2, by - h, w, h); c.restore(); }
      if (cp.lit > 0) { const u = 1 - cp.lit; c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#9ff6ff'; c.globalAlpha = cp.lit * .8; c.lineWidth = .12; c.beginPath(); c.ellipse(cp.x, cy, 1.1 + u * 2.4, 1.2 + u * 2.6, 0, 0, 6.283); c.stroke(); c.restore(); } });
    { const e = lv.exit, im = I('exit_portal'); if (im && e.x > x0 - 3 && e.x < x1 + 3) { this.glow(c, e.x, e.y, 5, '#f5c44a', .35 + Math.sin(this.t * 3) * .1); c.drawImage(im, e.x - 1.9, e.y - 1.7, 3.8, 3.8 * im.height / im.width); } }
    // ghosts in replay
    if (this.mode === 'replay') this.drawGhosts(c);
    // fx sprites
    this.fx.forEach(f => { const im = I(f.k); if (!im) return; const u = f.t / f.d; c.save(); c.globalAlpha = 1 - u; c.globalCompositeOperation = 'lighter'; const s = f.s * (.6 + u * .6); c.translate(f.x, f.y); if (f.fl) c.scale(-1, 1); c.drawImage(im, -s / 2, -s * im.height / im.width / 2, s, s * im.height / im.width); c.restore(); });
    this.drawParts(c);
    if (this.mode === 'play') this.drawHero(c);
    c.setTransform(k, 0, 0, k, 0, 0); this.drawFront(c, W); c.setTransform(k * T, 0, 0, k * T, (-this.cam * T + sh) * k, (-this.camY * T + sv) * k);
    // overlays
    c.setTransform(k, 0, 0, k, 0, 0); if (this.flash > 0) { c.fillStyle = `rgba(${this.flashCol || '176,107,255'},${clamp(this.flash * 1.6, 0, .2)})`; c.fillRect(0, 0, W, 450); }
    if (this.mode === 'replay') { const g = c.createRadialGradient(W / 2, 225, 120, W / 2, 225, W * .6), wp = this.rwarp || 0; g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(70,20,140,${(.5 + Math.sin(this.t * 6) * .1) * wp})`); c.fillStyle = g; c.fillRect(0, 0, W, 450);
      c.save(); c.globalCompositeOperation = 'lighter'; const cx = W / 2, cy = 225; c.strokeStyle = '#b8a6ff'; c.lineCap = 'round'; for (let i = 0; i < 26; i++) { const a = i * 2.399 + this.t * .25, ph = (this.t * .9 + i * .137) % 1, r0 = 120 + ph * 330, r1 = r0 + 40 + ph * 70; c.globalAlpha = (1 - ph) * .22 * wp; c.lineWidth = 1.2 + ph * 1.5; c.beginPath(); c.moveTo(cx + Math.cos(a) * r0 * 1.5, cy + Math.sin(a) * r0 * .9); c.lineTo(cx + Math.cos(a) * r1 * 1.5, cy + Math.sin(a) * r1 * .9); c.stroke(); }
      c.restore(); }
  }
  glow(c, x, y, r, col, a) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp(a, 0, 1); c.drawImage(tint(col), x - r, y - r, r * 2, r * 2); c.restore(); }
  drawParts(c) { c.save(); c.globalCompositeOperation = 'lighter'; this.parts.forEach(q => { c.globalAlpha = clamp(q.life / q.max, 0, 1); const s = q.size * 2; c.drawImage(tint(q.col), q.x - s / 2, q.y - s / 2, s, s); }); c.restore(); }
  drawBgFx(c, W) {
    c.fillStyle = 'rgba(6,3,22,.08)'; c.fillRect(0, 0, W, 450);
    c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 4; i++) { const x = ((i * 310 - this.cam * this.ts * .22 + Math.sin(this.t * .15 + i) * 40) % (W + 500) + W + 500) % (W + 500) - 250, y = 250 + Math.sin(i * 2.3) * 70; c.globalAlpha = .3; c.drawImage(tint(i % 2 ? '#3c1e8c' : '#145a6e'), x - 230, y - 230, 460, 460); } c.restore();
  }
  drawFront(c, W) {
    const v = this.vig && this.vig.w === W ? this.vig : (this.vig = (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144; cv.w = W; const g = cv.getContext('2d'), r = g.createRadialGradient(128, 72, 40, 128, 72, 150); r.addColorStop(0, 'rgba(3,1,12,0)'); r.addColorStop(1, 'rgba(3,1,12,.62)'); g.fillStyle = r; g.fillRect(0, 0, 256, 144); return cv; })());
    c.drawImage(v, 0, 0, W, 450);
    // big out-of-focus motes passing in front (fast parallax)
    c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 7; i++) { const x = (((i * 211 - this.cam * this.ts * 1.5 + this.t * 6) % (W + 120)) + W + 120) % (W + 120) - 60, y = (i * 97 + Math.sin(this.t * .5 + i) * 30) % 450; c.globalAlpha = .1; c.drawImage(tint(i % 2 ? '#7dfbe6' : '#b06bff'), x - 22, y - 22, 44, 44); } c.restore();
  }
  drawPiston(c, h) {
    const t = this.t, w = h.w, x = h.x, gy = h.y, e = h.ext, len = e * h.H, top = gy - len, sh = h.seg === 1 ? Math.sin(t * 90) * .05 * h.warn : 0, hot = e > .05 ? 1 : h.warn;
    // housing sunk into the floor with a hazard-lit slot
    this.glow(c, x + w / 2, gy, w * 1.5 + len * .3, '#ff3b30', .12 + .35 * hot);
    c.save(); c.translate(sh, 0);
    if (len > .02) { const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#2a2147'); g.addColorStop(.3, '#8b82b8'); g.addColorStop(.55, '#cfc8f0'); g.addColorStop(1, '#2a2147'); c.fillStyle = g; c.fillRect(x + .12, top + .5, w - .24, len - .3);
      c.fillStyle = '#ffcf3a'; for (let y = gy - .45; y > top + .7; y -= .55) { c.beginPath(); c.moveTo(x + .12, y); c.lineTo(x + w - .12, y - .32); c.lineTo(x + w - .12, y - .12); c.lineTo(x + .12, y + .2); c.closePath(); c.globalAlpha = .55; c.fill(); c.globalAlpha = 1; }
      // head plate + spikes
      c.fillStyle = '#3a2d63'; c.fillRect(x - .02, top, w + .04, .55); c.fillStyle = '#ff4a60'; c.globalAlpha = .55 + .3 * Math.sin(t * 20); c.fillRect(x + .05, top + .08, w - .1, .12); c.globalAlpha = 1;
      c.fillStyle = '#e9e4ff'; for (let i = 0; i < 3; i++) { const sx = x + .1 + i * (w - .2) / 3; c.beginPath(); c.moveTo(sx, top); c.lineTo(sx + (w - .2) / 6, top - .62); c.lineTo(sx + (w - .2) / 3, top); c.closePath(); c.fill(); }
      c.strokeStyle = '#ff9a3a'; c.lineWidth = .05; c.strokeRect(x - .02, top, w + .04, .55); }
    c.restore();
    // base collar (always visible)
    c.fillStyle = '#241a44'; c.fillRect(x - .22, gy - .32, w + .44, .34); c.fillStyle = '#ffcf3a'; c.globalAlpha = .45 + .4 * hot; c.fillRect(x - .22, gy - .32, w + .44, .07); c.globalAlpha = 1;
    c.fillStyle = '#0a0618'; c.fillRect(x + .1, gy - .28, w - .2, .26);
    if (h.warn > 0) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .25 + .5 * h.warn * (.6 + .4 * Math.sin(t * 40)); c.fillStyle = '#ff3b30'; c.fillRect(x + .2, gy - .26, w - .4, .22); c.restore(); }
  }
  drawHaz(c, x0, x1, I) {
    const t = this.t;
    this.lv.haz.forEach(h => {
      if (h.k === 'piston') { if (h.x + h.w < x0 || h.x > x1) return; this.drawPiston(c, h); return; }
      if (h.k === 'spikes') {
        if (h.x + h.w < x0 || h.x > x1) return; const im = I(h.dir === 'down' ? 'spikes_down' : 'spikes_up'); if (!im) return; const pu = .5 + .5 * Math.sin(t * 3.2 + h.x * 1.7), n = Math.max(1, Math.round(h.w / 1.5)), w = h.w / n, hh = w * im.height / im.width * (h.y >= 16 ? 1.9 : 1.08);
        this.glow(c, h.x + h.w / 2, h.y + .1, h.w * .62 + 1.2, '#ff1f45', .2 + .16 * pu);
        for (let i = 0; i < n; i++) { const yy = h.dir === 'down' ? h.y - .1 : h.y + .75 - hh; c.drawImage(im, h.x + i * w - .04, yy, w * 1.06, hh); }
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .12 + .22 * pu; for (let i = 0; i < n; i++) { const yy = h.dir === 'down' ? h.y - .1 : h.y + .75 - hh; c.drawImage(im, h.x + i * w - .04, yy, w * 1.06, hh); } c.restore();
      } else {
        if (h.x < x0 || h.x > x1) return; const im = I(h.r > 1.3 ? 'saw_large' : 'saw_small'), pu = .5 + .5 * Math.sin(t * 6 + h.x);
        
        this.glow(c, h.x, h.cy, h.r * 2.1, '#ff1f45', .22 + .12 * pu);
        if (im) { const R = h.r * 1.15; [[.7, .14], [.35, .26]].forEach(([d, a]) => { c.save(); c.globalAlpha = a; c.translate(h.x, h.cy); c.rotate(h.rot - d); c.drawImage(im, -R, -R, R * 2, R * 2); c.restore(); }); c.save(); c.translate(h.x, h.cy); c.rotate(h.rot); c.drawImage(im, -R, -R, R * 2, R * 2); c.restore(); this.glow(c, h.x, h.cy, h.r * .5, '#ff5a6e', .25 + .3 * pu); }
      }
    });
  }
  drawGround(c, s) {
    this.drawGround0(c, { x: s.x, y: s.y, w: s.w, h: s.h + 8 }); const t = this.t; let seed = Math.floor(s.x * 7.3 + 11);
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // glowing rim + crystal shards growing out of the top edge (seeded per platform, so they stay put)
    c.save(); c.globalCompositeOperation = 'lighter'; const rg = c.createLinearGradient(0, s.y - .2, 0, s.y + .6);  rg.addColorStop(0, 'rgba(125,251,230,.45)'); rg.addColorStop(1, 'rgba(125,251,230,0)'); c.fillStyle = rg; c.fillRect(Math.max(s.x, this.vx0), s.y - .2, Math.min(s.x + s.w, this.vx1) - Math.max(s.x, this.vx0), .8); c.restore();
    for (let x = s.x + 1 + rnd() * 2; x < s.x + s.w - .6; x += 2.4 + rnd() * 3.6) {
      const n = 1 + Math.floor(rnd() * 3), cool = rnd() > .12; for (let i = 0; i < n; i++) { const hx = x + i * .38, h = .35 + rnd() * .75, w = .16 + rnd() * .12, lean = (rnd() - .5) * .35; if (hx < this.vx0 || hx > this.vx1) continue; const pu = .7 + .3 * Math.sin(t * 2 + hx * 2);
        c.save(); c.translate(hx, s.y + .12); c.fillStyle = cool ? '#7dfbe6' : '#8fe3ff'; c.globalAlpha = .9; c.beginPath(); c.moveTo(-w, 0); c.lineTo(lean * h, -h); c.lineTo(w, 0); c.closePath(); c.fill();
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = .35 * pu; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-w * .2, 0); c.lineTo(lean * h, -h); c.lineTo(w * .5, 0); c.closePath(); c.fill(); c.restore(); this.glow(c, hx, s.y - h * .4, .9 + h, cool ? '#4fe3f5' : '#a56bff', .16 * pu); }
    }
  }
  drawGround0(c, s) { const im = IMG.pf_w1_ground; const g = c.createLinearGradient(0, s.y, 0, s.y + s.h); g.addColorStop(0, '#2b1a55'); g.addColorStop(1, '#0d0722'); c.fillStyle = g; c.fillRect(s.x, s.y + .35, s.w, Math.max(0, s.h - .35)); const fb = IMG.pf_w1_floor_block; if (fb) { c.save(); c.beginPath(); c.rect(s.x, s.y + .9, s.w, Math.max(0, s.h - .9)); c.clip(); c.globalAlpha = .55; const bw2 = 4, bh2 = bw2 * fb.height / fb.width; const vy1 = this.camY + 450 / this.ts + 2, st = bw2 * .95, xa = Math.max(s.x, this.vx0 - bw2), xb = Math.min(s.x + s.w, this.vx1 + bw2); for (let yy = s.y + .9, r = 0; yy < s.y + s.h && yy < vy1; yy += bh2 * .8, r++) { if (yy + bh2 < this.camY - 2) continue; let xx = s.x - (r % 2) * bw2 / 2; if (xx < xa) xx += Math.floor((xa - xx) / st) * st; for (; xx < xb; xx += st) c.drawImage(fb, xx, yy, bw2, bh2); } c.globalAlpha = 1; c.fillStyle = 'rgba(10,5,30,.35)'; c.fillRect(s.x, s.y + .9, s.w, s.h); c.restore(); } c.fillStyle = 'rgba(125,251,230,.12)'; c.fillRect(s.x, s.y + .35, .08, s.h); c.fillRect(s.x + s.w - .08, s.y + .35, .08, s.h); if (im) { const h = 1.35, w = h * im.width / im.height, n = Math.ceil(s.w / w), i0 = Math.max(0, Math.floor((this.vx0 - s.x) / w)), i1 = Math.min(n, Math.ceil((this.vx1 - s.x) / w) + 1); c.save(); c.beginPath(); c.rect(s.x - .1, s.y - .6, s.w + .2, 3); c.clip(); for (let i = i0; i < i1; i++) c.drawImage(im, s.x + i * w, s.y - .3, w + .02, h); c.restore(); } }
  drawStrip(c, im, x, y, w, h, jit, a) { if (!im) return; c.save(); c.globalAlpha = a; const tw = h * im.width / im.height, n = Math.max(1, Math.round(w / tw)), ww = w / n; for (let i = 0; i < n; i++) c.drawImage(im, x + i * ww + jit, y - .1, ww + .02, h); c.restore(); }
  drawWall(c, s) { const im = IMG.pf_w1_wall; c.fillStyle = '#16093a'; c.fillRect(s.x, s.y, s.w, s.h); if (!im) return; const w = s.w + .5, h = w * im.height / im.width; c.save(); c.beginPath(); c.rect(s.x - .3, s.y, s.w + .6, s.h); c.clip(); for (let y = s.y; y < s.y + s.h; y += h * .9) c.drawImage(im, s.x - .25, y, w, h); c.restore(); this.glow(c, s.x + s.w / 2, s.y + s.h / 2, s.h * .4, '#4fe3f5', .1); }
  faceOf(p) { if (p.state === 'dead') return 'shocked'; if (p.state === 'respawn') return 'happy'; if (p.state === 'win') return 'proud'; if (p.dashT > 0) return 'determined'; if (p.wall && !p.grounded) return 'scared'; if (!p.grounded) return p.vy > 18 ? 'scared' : (p.vy < 0 ? 'happy' : 'neutral'); if (p.inv > 0) return 'hurt'; if (p.idle > 8) return 'sleepy'; if (p.idle > 0 && (this.t % 2.2) < .12) return 'blink'; return 'neutral'; }
  heroAt(c, x, y, face, sx, sy, tilt, flip, alpha) { const m = META.pf, i = FACE(face), cell = m.cell, im = IMG.hero; if (!im || i < 0) return; const S = 3.0; c.save(); c.translate(x, y - .1); c.rotate(tilt * Math.PI / 180); c.scale(sx * (flip || 1), sy); c.globalAlpha = alpha; c.drawImage(im, (i % m.cols) * cell, Math.floor(i / m.cols) * cell, cell, cell, -S / 2, -S / 2, S, S); c.restore(); }
  // ---- v0.4: animated Void (drawn sheets), eyes that look at the world, shadow, lean, trail
  sheetFrame(name, i) { const m = META.sprites[name], im = IMG['spr_' + name]; if (!im || !m) return null; i = clamp(Math.floor(i), 0, m.n - 1); return { im, sx: (i % m.cols) * m.size, sy: Math.floor(i / m.cols) * m.size, s: m.size, name, i }; }
  eyesOf(f) { // detect the two glowing eyes of a sheet frame once (cyan pixels near the middle of the cell)
    const key = f.name + f.i; if (this.eyeC && this.eyeC[key] !== undefined) return this.eyeC[key]; this.eyeC = this.eyeC || {};
    const cv = this.eyeCv || (this.eyeCv = document.createElement('canvas')); cv.width = cv.height = f.s; const g = cv.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, f.s, f.s); g.drawImage(f.im, f.sx, f.sy, f.s, f.s, 0, 0, f.s, f.s);
    const d = g.getImageData(0, 0, f.s, f.s).data, A = [{ n: 0, x: 0, y: 0 }, { n: 0, x: 0, y: 0 }], mid = f.s / 2;
    for (let y = f.s * .28 | 0; y < f.s * .75; y++) for (let x = f.s * .2 | 0; x < f.s * .8; x++) { const o = (y * f.s + x) * 4; if (d[o + 3] > 200 && d[o + 2] > 190 && d[o + 1] > 170 && d[o] < 170) { const e = A[x < mid ? 0 : 1]; e.n++; e.x += x; e.y += y; } }
    const r = A.every(e => e.n > 30) ? A.map(e => ({ x: e.x / e.n, y: e.y / e.n, r: Math.sqrt(e.n / Math.PI) * 1.1 })) : null; return this.eyeC[key] = r;
  }
  warmEyes() { if (this._warm) return; this._warm = 1; const jobs = []; ['idle', 'move_left', 'move_right', 'move_up', 'move_down'].forEach(n => { const m = META.sprites[n]; if (m) for (let i = 0; i < m.n; i++) jobs.push([n, i]); }); const run = () => { for (let k = 0; k < 6 && jobs.length; k++) { const [n, i] = jobs.shift(), f = this.sheetFrame(n, i); if (f) this.eyesOf(f); } if (jobs.length) setTimeout(run, 16); }; run(); }
  gazeTarget(p) { // what is Void looking at? returns [dx,dy] in -1..1 and a mood
    let best = null, bd = 1e9, mood = 'calm'; const look = (x, y, maxD, m) => { const d = Math.hypot(x - p.x, y - p.y); if (d < maxD && d < bd) { bd = d; best = [x, y]; mood = m; } };
    const lv = this.lv; lv.haz.forEach(h => { if (h.k === 'spikes') look(clamp(p.x, h.x, h.x + h.w), h.y, 6, 'wary'); else look(h.x, h.cy, 8, 'wary'); });
    lv.crystals.forEach(c => { if (!c.got) look(c.x, c.y, 7, 'want'); }); lv.springs.forEach(s => look(s.x, s.y, 4, 'curious'));
    lv.cps.forEach(c => { if (!c.on) look(c.x, c.y, 8, 'curious'); }); look(lv.exit.x, lv.exit.y, 12, 'want');
    if (best) { const dx = best[0] - p.x, dy = best[1] - p.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l, mood, near: bd }; }
    return { x: p.vx / PH.run * .8 + p.face * .35, y: p.grounded ? 0 : clamp(p.vy / 20, -1, 1) * .8, mood: 'calm', near: 99 };
  }
  drawEyes(c, f, S, gz, blink, alpha) {
    const E = this.eyesOf(f); if (!E) return; const k = S / f.s, px = -S / 2, py = -S / 2;
    const wide = gz.mood === 'wary' ? 1.12 : gz.mood === 'want' ? 1.06 : 1, pup = gz.mood === 'wary' ? .26 : gz.mood === 'want' ? .55 : .4;
    E.forEach(e => {
      const cx = px + e.x * k, cy = py + e.y * k, r = e.r * k * 1.06, rr = r * wide, gx = this.gzx * r * .34, gy = this.gzy * r * .3;
      c.save(); c.beginPath(); c.arc(cx, cy, r * 1.2, 0, 6.283); c.clip();
      c.globalAlpha = alpha; c.fillStyle = '#04010b'; c.fillRect(cx - r * 1.3, cy - r * 1.3, r * 2.6, r * 2.6);
      c.translate(cx + gx, cy + gy); c.scale(1, Math.max(.08, 1 - blink)); const g = c.createRadialGradient(0, -rr * .15, rr * .1, 0, 0, rr); g.addColorStop(0, '#c9fbff'); g.addColorStop(.55, '#52dff7'); g.addColorStop(1, '#168fc7');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, rr * .98, 0, 6.283); c.fill();
      c.fillStyle = 'rgba(2,10,30,.88)'; c.beginPath(); c.arc(this.gzx * rr * .18, this.gzy * rr * .16, rr * pup, 0, 6.283); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-rr * .3, -rr * .34, rr * .2, 0, 6.283); c.fill(); c.beginPath(); c.arc(rr * .28, rr * .3, rr * .09, 0, 6.283); c.fill();
      c.restore();
    });
  }
  pickAnim(p) {
    const t = this.t, sp = Math.abs(p.vx);
    if (p.state === 'respawn') return ['respawn', p.st / PH.respawn * 11.9];
    if (p.state === 'win') return ['win', p.st * 14];
    if (p.dashT > 0) return [p.dashDir > 0 ? 'move_right' : 'move_left', 4.5];
    if (p.inv > 0 && PH.invul - p.inv < .4) return ['hurt', (PH.invul - p.inv) / .4 * 11.9];
    if (!p.grounded) { if (p.vy < 0) return ['move_up', clamp(p.air * 16, 0, 11.9)]; return ['move_down', clamp(p.air2 * 14, 0, 11.9)]; }
    if (sp > 1.2) return [p.face > 0 ? 'move_right' : 'move_left', (t * (12 + sp * 1.1)) % 12];
    if (p.idle > 9) return ['sleep', t * 8];
    const m = (t * 9) % 22; return ['idle', m < 11 ? m : 22 - m];
  }
  drawHero(c) {
    const p = this.p, t = this.t;
    if (p.state === 'dead') { const u = p.st / PH.deadT, f = this.sheetFrame('death', u * 11.9); if (f) { c.save(); c.translate(p.x, p.y - .1); c.globalAlpha = 1 - Math.max(0, u - .6) * 2.5; const S = 3.4 * (1 + u * .25); c.drawImage(f.im, f.sx, f.sy, f.s, f.s, -S / 2, -S / 2, S, S); c.restore(); } return; }
    // afterimages while dashing or very fast
    p.afters.forEach(a => { const f = this.sheetFrame(a.d > 0 ? 'move_right' : 'move_left', 4); if (!f) return; c.save(); c.translate(a.x, a.y - .62); c.globalAlpha = .32 * (1 - a.t / .25); c.globalCompositeOperation = 'lighter'; c.drawImage(f.im, f.sx, f.sy, f.s, f.s, -1.7, -1.7, 3.4, 3.4); c.restore(); });
    if (p.dashT > 0) { c.save(); c.globalCompositeOperation = 'lighter'; const d = p.dashDir, L0 = 5.5, g = c.createLinearGradient(p.x, 0, p.x - d * L0, 0); g.addColorStop(0, 'rgba(197,139,255,.55)'); g.addColorStop(1, 'rgba(197,139,255,0)'); c.fillStyle = g; [[-.5, .5], [-.15, .35], [.2, .3]].forEach(([o, hh]) => { c.fillRect(Math.min(p.x, p.x - d * L0), p.y - .6 + o, L0, hh * .5); }); c.restore(); }
    // contact shadow on the ground below
    let gy = null; for (const s of this.lv.solids) { if (!s.on) continue; const r = s.rect(); if (p.x > r.x - .2 && p.x < r.x + r.w + .2 && r.y >= p.y - .3 && (gy === null || r.y < gy)) gy = r.y; }
    if (gy !== null && gy - p.y < 7) { const h = clamp(1 - (gy - p.y - .75) / 6, .15, 1); c.save(); c.globalAlpha = .55 * h; c.fillStyle = '#000'; c.beginPath(); c.ellipse(p.x, gy + .05, 1.15 * (.6 + h * .4), .22, 0, 0, 6.283); c.fill(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .18 * h; c.fillStyle = '#9b5cff'; c.beginPath(); c.ellipse(p.x, gy + .02, 1.5, .28, 0, 0, 6.283); c.fill(); c.restore(); }
    const [an, fi] = this.pickAnim(p), f = this.sheetFrame(an, fi); const gz = this.gazeTarget(p);
    this.gzx = lerp(this.gzx || 0, gz.x, 1 - Math.exp(-this.dtv / .07)); this.gzy = lerp(this.gzy || 0, gz.y, 1 - Math.exp(-this.dtv / .07));
    let sx = p.sx, sy = p.sy; if (p.dashT > 0) { sx *= 1.18; sy *= .86; }
    const bob = p.grounded ? Math.sin(t * (Math.abs(p.vx) > 1 ? 16 : 3.2)) * (Math.abs(p.vx) > 1 ? .07 : .05) : 0;
    const lean = p.wall && !p.grounded ? -p.wall * 10 : clamp(p.vx / PH.run, -1, 1) * 11 + (p.grounded ? 0 : clamp(p.vy / 25, -1, 1) * 4 * p.face);
    const alpha = p.inv > 0 ? .6 + Math.sin(t * 40) * .3 : 1, S = 3.4, wary = gz.mood === 'wary' && gz.near < 4.5;
    this.glow(c, p.x, p.y - .4, 2.7, p.dashT > 0 ? '#c58bff' : wary ? '#ff4a6a' : '#6a2fe0', p.dashT > 0 ? .4 : .28);
    c.save(); c.translate(p.x, p.y - .62 + bob); c.rotate((p.dashT > 0 ? 0 : lean) * Math.PI / 180); c.scale(sx, sy);
    c.globalAlpha = alpha;
    if (f) {
      const fr = fi - Math.floor(fi), nf = /^move_/.test(an) && !(p.dashT > 0) ? this.sheetFrame(an, /^move_(left|right)$/.test(an) ? (Math.floor(fi) + 1) % 12 : Math.min(11, Math.floor(fi) + 1)) : null; if (nf && fr > .08) { c.drawImage(f.im, f.sx, f.sy, f.s, f.s, -S / 2, -S / 2, S, S); c.globalAlpha = alpha * fr; c.drawImage(nf.im, nf.sx, nf.sy, nf.s, nf.s, -S / 2, -S / 2, S, S); c.globalAlpha = alpha; } else c.drawImage(f.im, f.sx, f.sy, f.s, f.s, -S / 2, -S / 2, S, S);
      if (an === 'idle' || an === 'move_left' || an === 'move_right' || an === 'move_up' || an === 'move_down') { const bl = (t % 3.1) < .13 ? Math.sin((t % 3.1) / .13 * Math.PI) : 0; this.drawEyes(c, f, S, gz, an === 'move_down' ? 0 : bl * .9, alpha); }
    } else this.heroAt(c, 0, 0, this.faceOf(p), 1, 1, 0, 1, alpha);
    c.restore();
    if (wary && p.grounded === false) { c.save(); c.globalAlpha = .9; c.fillStyle = '#ff4a6a'; c.font = 'bold .9px sans-serif'; c.textAlign = 'center'; c.fillText('!', p.x + .9, p.y - 1.5 + Math.sin(t * 20) * .05); c.restore(); }
    if (this.shield > 0 && this.ab.includes('shield')) { this.glow(c, p.x, p.y, 2.1, '#4fe3f5', .4); c.save(); c.strokeStyle = 'rgba(125,251,230,.7)'; c.lineWidth = .08; c.beginPath(); c.arc(p.x, p.y, 1.5, 0, 6.28); c.stroke(); c.restore(); }
  }
  drawGhosts(c) {
    const idx = this.rt * 30 * this.rspeed, cols = ['#ff7ad9', '#6fa8ff', '#b06bff', '#ffb36b'], t = this.t;
    const body = (q, flip, a, col, run) => { const f = this.sheetFrame(flip > 0 ? 'move_right' : 'move_left', (t * 14 + q[0] * 3) % 12), S = 3.1; this.glow(c, q[0], q[1] - .5, 2.8, col, .45 * a); c.save(); c.translate(q[0], q[1] - .62); c.globalAlpha = a; if (f) c.drawImage(f.im, f.sx, f.sy, f.s, f.s, -S / 2, -S / 2, S, S); c.restore(); };
    this.failed.forEach((f, i) => { const j = idx - f.start; if (j < 0 || j >= f.pts.length) return; const q = this.pt(f.pts, j), col = cols[i % 4];
      c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = col; c.lineCap = 'round'; for (let k = 0; k < 3; k++) { c.globalAlpha = .3 - k * .08; c.lineWidth = .3 - k * .08; c.beginPath(); for (let u = 0; u <= 12; u++) { const r = this.pt(f.pts, Math.max(0, j - 12 + u)); u ? c.lineTo(r[0], r[1] + Math.sin(t * 9 + u + k) * .08 * k) : c.moveTo(r[0], r[1]); } c.stroke(); } c.restore();
      c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = col; c.globalAlpha = .35; c.lineWidth = .08; const ph = (t * 1.6 + i * .37) % 1; c.beginPath(); c.ellipse(q[0], q[1], 1 + ph * 2.4, .7 + ph * 1.7, 0, 0, 6.283); c.stroke(); c.restore();
      body(q, q[3] >= 0 ? 1 : -1, .5, col); });
    const w = this.pt(this.route, idx), wd = w[3] >= -.0001 ? 1 : -1; this.glow(c, w[0], w[1], 4.2, '#f5c44a', .5);
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#f5c44a'; c.lineCap = 'round'; c.globalAlpha = .45; c.lineWidth = .35; c.beginPath(); for (let u = 0; u <= 14; u++) { const r = this.pt(this.route, Math.max(0, idx - 14 + u)); u ? c.lineTo(r[0], r[1]) : c.moveTo(r[0], r[1]); } c.stroke(); c.restore();
    body(w, wd, 1, '#f5c44a');
  }
}
