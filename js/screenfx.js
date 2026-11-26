'use strict';
// Animated illustrated backdrops for the main menu and the level map (same painted style as the in-level worlds).
// Menu: breathing zoom + drift on the painted hall, pulsing black hole with rotating gold accretion arcs, god-rays, spores, floor shimmer.
// Map: painted 3-world panorama (assets/img/bg2/map.webp) with per-world motion: genesis spores + gate pulse, office red pulse lines + falling data, horizon embers + door glow.
const SFX_BG = (() => {
  const TAU = Math.PI * 2, img = {};
  ['menu', 'map'].forEach(k => { const i = new Image(); i.onload = () => img[k] = i; i.src = `assets/img/bg2/${k}.webp`; });
  const $ = id => document.getElementById(id);
  const hexA = (h, a) => h + Math.floor(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  const rnd = s => () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const PAL = [{ a: '#7dfbe6', b: '#b06bff' }, { a: '#ff4d6d', b: '#b06bff' }, { a: '#ffb347', b: '#ff5d73' }];
  // particles (normalised 0..1 positions so they survive any screen size)
  const mk = (n, seed) => { const r = rnd(seed); return Array.from({ length: n }, () => ({ x: r(), y: r(), s: .4 + r() * 1.2, p: r() * TAU, v: .3 + r() })); };
  const MP = mk(70, 5), WP = mk(150, 11);
  const sizeTo = (cv) => { const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(2, r.width | 0), h = Math.max(2, r.height | 0); if (cv._w !== w || cv._h !== h) { cv.width = Math.round(w * dpr * .75); cv.height = Math.round(h * dpr * .75); cv._w = w; cv._h = h; } return [cv.width, cv.height]; };

  function drawMenu(cv, t) {
    const [W, H] = sizeTo(cv), c = cv.getContext('2d'), im = img.menu;
    c.fillStyle = '#0e0824'; c.fillRect(0, 0, W, H);
    if (!im) return;
    const z = 1.05 + Math.sin(t * .12) * .012, sc = Math.max(W / im.width, H / im.height) * z, dw = im.width * sc, dh = im.height * sc;
    const px = Math.sin(t * .09) * W * .012, py = Math.cos(t * .07) * H * .01;
    const ox = (W - dw) / 2 + px, oy = -(dh - H) * .22 + py;
    c.drawImage(im, ox, oy, dw, dh);
    const X = u => ox + u * dw, Y = v => oy + v * dh, u = Math.min(W, H * 1.8) / 800;
    c.globalCompositeOperation = 'lighter';
    // black hole: pulsing halo + rotating gold accretion arcs (hole sits upper-centre of the painting)
    const hx = X(.506), hy = Y(.225), hr = dh * .105, pl = .5 + .5 * Math.sin(t * .8);
    let g = c.createRadialGradient(hx, hy, hr * .5, hx, hy, hr * 3.2);
    g.addColorStop(0, hexA('#ffb347', .16 + .1 * pl)); g.addColorStop(.35, hexA('#b06bff', .09)); g.addColorStop(1, '#00000000');
    c.fillStyle = g; c.fillRect(hx - hr * 3.3, hy - hr * 3.3, hr * 6.6, hr * 6.6);
    c.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a0 = t * (.35 + i * .07) * (i % 2 ? -1 : 1) + i * 1.3, rr = hr * (1.05 + i * .17);
      c.strokeStyle = hexA(i % 2 ? '#ffd98a' : '#ff9a3c', .18 - i * .02 + .05 * pl); c.lineWidth = (3 - i * .35) * u;
      c.beginPath(); c.ellipse(hx, hy, rr * 1.15, rr * .85, -.35, a0, a0 + 1.5); c.stroke();
    }
    // god-rays from the arches
    for (let i = 0; i < 5; i++) {
      const bx = X(.12 + i * .19) + Math.sin(t * .22 + i * 1.7) * 28 * u, a = .05 + .035 * Math.sin(t * .55 + i * 2.1);
      const lg = c.createLinearGradient(bx, 0, bx + 90 * u, H * .85); lg.addColorStop(0, hexA('#9fffee', a)); lg.addColorStop(1, '#00000000');
      c.fillStyle = lg; c.beginPath(); c.moveTo(bx - 14 * u, 0); c.lineTo(bx + 20 * u, 0); c.lineTo(bx + 150 * u, H * .85); c.lineTo(bx + 20 * u, H * .85); c.fill();
    }
    // crystal glints
    for (let i = 0; i < 12; i++) {
      const gx = X(.08 + ((i * .37) % .84)), gy = Y(.3 + ((i * .23) % .5)), a = Math.max(0, Math.sin(t * .9 + i * 2.3)) ** 6;
      if (a < .02) continue; c.fillStyle = hexA('#ffffff', a * .9); const s = (2 + a * 5) * u;
      c.fillRect(gx - s, gy - .5 * u, s * 2, u); c.fillRect(gx - .5 * u, gy - s, u, s * 2);
    }
    // floor shimmer sweep
    const sw = ((t * .05) % 1.4 - .2) * dw + ox; const sg = c.createLinearGradient(sw - 120 * u, 0, sw + 120 * u, 0);
    sg.addColorStop(0, '#00000000'); sg.addColorStop(.5, hexA('#b6a0ff', .10)); sg.addColorStop(1, '#00000000'); c.fillStyle = sg; c.fillRect(sw - 120 * u, Y(.68), 240 * u, dh * .3);
    // rising spores
    for (const p of MP) {
      const y = ((p.y - t * .012 * p.v) % 1 + 1) % 1, x = p.x + Math.sin(t * .4 * p.v + p.p) * .012, a = (.35 + .35 * Math.sin(t * 1.3 + p.p)) * Math.sin(y * Math.PI);
      c.fillStyle = hexA(p.s > 1 ? '#ffd98a' : '#9fffee', a); c.beginPath(); c.arc(x * W, y * H, p.s * 1.4 * u, 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    const vg = c.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, 'rgba(4,2,14,.18)'); vg.addColorStop(.3, 'rgba(4,2,14,0)'); vg.addColorStop(.75, 'rgba(4,2,14,0)'); vg.addColorStop(1, 'rgba(4,2,14,.35)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
  }

  function drawMap(cv, t, sl, total) {
    const [W, H] = sizeTo(cv), c = cv.getContext('2d'), k = W / cv._w; // k: canvas px per CSS px
    c.clearRect(0, 0, W, H);
    const S = n => n * k, seg = total / 3, L = x => S(x - sl);
    c.globalCompositeOperation = 'lighter';
    // focal glows (map x, y in CSS px at 450 tall): genesis gate, office planet/pulse columns, horizon door
    const foc = [[seg * .5, 150, 0], [seg * 1.55, 130, 1], [seg * 2.55, 150, 2]];
    for (const [fx, fy, w] of foc) {
      const sx = L(fx); if (sx < -S(400) || sx > W + S(400)) continue;
      const pl = .5 + .5 * Math.sin(t * (w === 2 ? 1.1 : .7) + w);
      const g = c.createRadialGradient(sx, S(fy), 0, sx, S(fy), S(210 + 30 * pl));
      g.addColorStop(0, hexA(PAL[w].a, .20 + .12 * pl)); g.addColorStop(.5, hexA(PAL[w].b, .06)); g.addColorStop(1, '#00000000'); c.fillStyle = g; c.fillRect(sx - S(260), 0, S(520), H);
    }
    // world 1: god-rays
    for (let i = 0; i < 6; i++) {
      const bx = (i * seg / 6 + 40) * .98; const sx = L(bx) + Math.sin(t * .25 + i * 1.7) * S(20); if (sx < -S(200) || sx > W + S(200)) continue;
      const a = .04 + .03 * Math.sin(t * .5 + i * 2); const lg = c.createLinearGradient(sx, 0, sx + S(60), S(300)); lg.addColorStop(0, hexA('#9fffee', a)); lg.addColorStop(1, '#00000000');
      c.fillStyle = lg; c.beginPath(); c.moveTo(sx - S(10), 0); c.lineTo(sx + S(16), 0); c.lineTo(sx + S(90), S(300)); c.lineTo(sx + S(10), S(300)); c.fill();
    }
    // world 2: red pulses travelling down the archive columns
    for (let i = 0; i < 8; i++) {
      const cx = seg + seg * (.12 + i * .105 + (i > 3 ? .1 : 0)), sx = L(cx); if (sx < -S(50) || sx > W + S(50)) continue;
      const ph = ((t * .35 + i * .37) % 1), y = S(20 + ph * 220), g = c.createLinearGradient(sx, y - S(60), sx, y + S(6));
      g.addColorStop(0, '#00000000'); g.addColorStop(1, hexA('#ff4d6d', .45 * Math.sin(ph * Math.PI))); c.fillStyle = g; c.fillRect(sx - S(1.5), y - S(60), S(3), S(66));
    }
    // world 3: gravity river glints flowing sideways
    for (let i = 0; i < 14; i++) {
      const x = ((seg * 2 + seg * ((i * .137 + t * .01 * (1 + i % 3 * .3)) % 1)) ), sx = L(x), y = S(250 + ((i * 53) % 170) + Math.sin(t + i) * 4);
      if (sx < -S(30) || sx > W + S(30)) continue; const g = c.createLinearGradient(sx - S(26), 0, sx + S(4), 0); g.addColorStop(0, '#00000000'); g.addColorStop(1, hexA('#d08bff', .5)); c.fillStyle = g; c.fillRect(sx - S(26), y, S(30), S(1.6));
    }
    // particles with parallax; each particle's world decides its colour and motion
    for (const p of WP) {
      const wx = p.x * total, sx = L(wx + sl * .0) + 0, w = Math.min(2, Math.floor(wx / seg));
      let x = sx + Math.sin(t * .5 * p.v + p.p) * S(8), y = p.y * H;
      if (w === 0) y = ((p.y - t * .02 * p.v) % 1 + 1) % 1 * H;
      else if (w === 1) y = ((p.y + t * .05 * p.v) % 1) * H;
      else { x -= S(((t * 14 * p.v) % 60)); y = ((p.y - t * .012 * p.v) % 1 + 1) % 1 * H; }
      if (x < -S(20) || x > W + S(20)) continue;
      const a = (.3 + .4 * Math.sin(t * 1.4 + p.p)) * (w === 1 ? .8 : 1);
      c.fillStyle = hexA(w === 1 ? (p.s > 1 ? '#ff7a90' : '#59a8ff') : PAL[w][p.s > 1 ? 'a' : 'b'], Math.max(0, a));
      if (w === 1) c.fillRect(x, y, S(1.4), S(p.s * 5)); else { c.beginPath(); c.arc(x, y, S(p.s * 1.3), 0, TAU); c.fill(); }
    }
    c.globalCompositeOperation = 'source-over';
    // soft drifting fog bands
    for (let i = 0; i < 3; i++) {
      const fx = ((t * (6 + i * 3) + i * 500) % (total + 600)) - 300, sx = L(fx), g = c.createRadialGradient(sx, S(330 + i * 40), 0, sx, S(330 + i * 40), S(260));
      g.addColorStop(0, 'rgba(120,90,200,.10)'); g.addColorStop(1, 'rgba(120,90,200,0)'); c.fillStyle = g; c.fillRect(sx - S(270), S(60), S(540), H);
    }
    // readability: gentle dim so nodes and labels stay on top
    c.fillStyle = 'rgba(6,3,18,.18)'; c.fillRect(0, 0, W, H);
  }

  let raf = 0, t0 = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const t = (now - t0) / 1000, m = $('menu'), lv = $('levels');
    if (m && m.classList.contains('on')) drawMenu($('menuFx'), t);
    else if (lv && lv.classList.contains('on')) { const mp = $('map'); drawMap($('mapFx'), t, mp.scrollLeft, mp.scrollWidth); }
  }
  function start() { if (!raf) raf = requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); });
  start();
  return { img };
})();
