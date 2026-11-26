'use strict';
// Void "pet" for the UI screens: real sprite clips + hand-posed expressions + spring motion.
// Used by the menu (full interaction), the level map (walks to the node you pick), result, pause and achievements.
const PetSprites = () => (typeof META !== 'undefined' && META.sprites) || null;
const clamp01 = v => Math.max(0, Math.min(1, v)), cl = (v, a, b) => Math.max(a, Math.min(b, v));

class Pet {
  // el: container div (positioned by CSS, sized by CSS width/height). opts: {size, follow}
  constructor(el, opts = {}) {
    this.el = el; this.opts = opts; this.size = opts.size || el.clientWidth || 200;
    el.innerHTML = '<div class="pb"><div class="pl pB"></div><div class="pl pA"></div></div>';
    this.body = el.firstChild; this.A = this.body.querySelector('.pA'); this.B = this.body.querySelector('.pB');
    this.t = 0; this.last = 0; this.sprKey = ''; this.keyB = '';
    this.mode = 'idle'; this.clip = null; this.pose = null; this.steps = []; this.stepT = 0; this.stepCur = null;
    this.x = 0; this.y = 0; this.vy = 0; this.sx = 1; this.sy = 1; this.vsx = 0; this.vsy = 0; this.rot = 0; this.vrot = 0; this.wob = 0;
    this.px = 0; this.py = 0; this.lx = 0; this.ly = 0; this.fade = 1; this.flip = 1; this.scale = 1;
    this.base = 0; this.idleT = 0; this.sleeping = false; this.moveTween = null; this.alive = true; this.shift = 0;
    this.tx = 0; this.ty = 0; this.onStepEnd = null; this.hold = false; this.holdT = 0;
    this.run = this.run.bind(this); requestAnimationFrame(this.run);
  }
  // ---- drawing ----
  paint(layer, name, i) {
    const m = PetSprites()[name], s = this.size, st = layer.style;
    st.backgroundImage = `url(assets/sprites/${name}.webp)`; st.backgroundSize = `${m.cols * s}px ${Math.ceil(m.n / m.cols) * s}px`;
    st.backgroundPosition = `${-(i % m.cols) * s}px ${-Math.floor(i / m.cols) * s}px`;
  }
  show(name, i, soft) {
    const key = name + ':' + i; if (key === this.sprKey) return;
    if (soft && this.sprKey) { const [n, f] = this.sprKey.split(':'); this.paint(this.B, n, +f); this.B.style.opacity = 1; this.fade = 0; }
    else { this.B.style.opacity = 0; this.fade = 1; }
    this.paint(this.A, name, i); this.A.style.opacity = soft && this.sprKey ? 0 : 1; this.sprKey = key;
  }
  // ---- control ----
  idle() { this.mode = 'idle'; this.clip = null; this.pose = null; this.steps = []; this.stepCur = null; this.sleeping = false; this.idleT = 0; }
  // a sequence of steps: {pose:[name,i]} or {clip:[name,from,to,fps]}, dur seconds, hop (px/s up), sq (squash amount), shake, sfx, dx
  react(steps, done) { this.mode = 'react'; this.steps = steps.slice(); this.stepCur = null; this.stepT = 0; this.sleeping = false; this.onStepEnd = done || null; this.nextStep(); }
  nextStep() {
    const s = this.steps.shift(); if (!s) { const d = this.onStepEnd; this.onStepEnd = null; this.stepCur = null; this.mode = 'idle'; this.idleT = 0; d && d(); return; }
    this.stepCur = s; this.stepT = 0; if (s.hop) this.hop(s.hop); if (s.sq) this.squash(s.sq); if (s.shake) this.wob = s.shake; if (s.sfx && window.SFX) SFX.play(s.sfx);
  }
  hop(v) { if (this.y > -2) this.vy = -v; }
  squash(a) { this.vsx += a * 3.2; this.vsy -= a * 3.2; }
  sleep() { this.mode = 'sleep'; this.sleeping = true; this.clipT = 0; }
  walkTo(x, y, dur, cb) { const dx = x - this.tx; this.moveTween = { x0: this.tx, y0: this.ty, x1: x, y1: y, t: 0, dur, cb, dir: dx >= 0 ? 'right' : 'left' }; }
  look(px, py) { this.px = px; this.py = py; }
  // ---- loop ----
  visible() { return this.el.offsetParent !== null; }
  run(now) {
    requestAnimationFrame(this.run); const dt = Math.min(.05, (now - this.last) / 1000 || .016); this.last = now;
    if (!this.visible()) { this.wasHidden = true; return; } if (this.wasHidden) { this.wasHidden = false; this.onShow && this.onShow(); }
    this.t += dt; const M = PetSprites(); if (!M) return;
    // crossfade
    if (this.fade < 1) { this.fade = Math.min(1, this.fade + dt / .13); this.A.style.opacity = this.fade; this.B.style.opacity = 1 - this.fade; if (this.fade >= 1) this.B.style.opacity = 0; }
    // what to draw
    let frame = null;
    if (this.moveTween) { const m = this.moveTween; m.t += dt; const k = clamp01(m.t / m.dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; this.tx = m.x0 + (m.x1 - m.x0) * e; this.ty = m.y0 + (m.y1 - m.y0) * e - Math.sin(k * Math.PI) * 14;
      const mv = M['move_' + m.dir], i = Math.floor(m.t * mv.fps) % mv.n; frame = ['move_' + m.dir, i, false]; this.rot = (m.dir === 'right' ? 1 : -1) * 7 * Math.sin(k * Math.PI);
      if (k >= 1) { const cb = m.cb; this.moveTween = null; this.squash(.12); cb && cb(); } }
    else if (this.mode === 'react' && this.stepCur) {
      const s = this.stepCur; this.stepT += dt;
      if (s.pose) frame = [s.pose[0], s.pose[1], true];
      else { const c = s.clip, mm = M[c[0]], fps = c[3] || mm.fps, n = c[2] - c[1] + 1, f = Math.floor(this.stepT * fps), i = s.loop ? c[1] + f % n : Math.min(c[2], c[1] + f); frame = [c[0], i, false]; }
      if (s.shake || this.wob) { this.wob = Math.max(0, (this.wob || s.shake) - dt * 5); this.rot += Math.sin(this.t * 38) * this.wob * 2.2; }
      if (s.dx) this.tx += s.dx * dt; if (s.zoom) this.scale += s.zoom * dt;
      if (this.stepT >= s.dur) this.nextStep();
    } else if (this.mode === 'sleep') { this.clipT = (this.clipT || 0) + dt; const m = M.sleep, i = Math.floor(this.clipT * m.fps) % m.n; frame = ['sleep', i, false]; }
    else { this.idleT += dt; const m = M.idle; let i = Math.floor(this.t * m.fps) % (2 * m.n - 2); i = i < m.n ? i : 2 * m.n - 2 - i; frame = ['idle', i, false]; }
    if (frame) { const pn = this.sprKey.split(':')[0], soft = frame[2] || (pn && frame[0] !== pn); this.show(frame[0], frame[1], soft); }
    this.lastMode = this.mode;
    // physics: hop / gravity
    this.vy += 1500 * dt; this.y += this.vy * dt; if (this.y > 0) { if (this.vy > 260) this.squash(Math.min(.2, this.vy / 3000)); this.y = 0; this.vy = 0; }
    // springs
    const k = 190, d = 13; this.vsx += ((1 - this.sx) * k - this.vsx * d) * dt; this.vsy += ((1 - this.sy) * k - this.vsy * d) * dt; this.sx += this.vsx * dt; this.sy += this.vsy * dt;
    this.vrot += ((0 - this.rot) * 120 - this.vrot * 11) * dt; this.rot += this.vrot * dt;
    // lean toward pointer + float
    const fol = this.opts.follow && !this.sleeping && !this.moveTween ? 1 : 0; this.lx += (this.px * 9 * fol - this.lx) * Math.min(1, dt * 6); this.ly += (this.py * 5 * fol - this.ly) * Math.min(1, dt * 6);
    const bob = Math.sin(this.t * 1.9) * (this.sleeping ? 2 : 4) + (this.sleeping ? 8 : 0), br = this.sleeping ? Math.sin(this.t * 1.1) * .025 : 0;
    const sc = this.scale * (this.opts.zoomIn ? 1 : 1);
    this.body.style.transform = `translate3d(${(this.tx + this.lx).toFixed(1)}px,${(this.ty + this.y + bob + this.ly).toFixed(1)}px,0) rotate(${(this.rot + this.lx * .5 + Math.sin(this.t * 1.1) * 1.2).toFixed(2)}deg) scale(${(this.sx * sc * (1 + br)).toFixed(3)},${(this.sy * sc * (1 - br)).toFixed(3)})`;
    if (this.opts.onFrame) this.opts.onFrame(this);
  }
}
