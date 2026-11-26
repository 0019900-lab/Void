'use strict';
// Illustrated animated backgrounds: painted per-world layers (assets/img/bg2, drawn in the story art style)
// with parallax scrolling and story-themed motion on top. All layers wrap seamlessly (edge-blended tiles).
const BG = (() => {
  const TAU = Math.PI * 2;
  // world config: sky fallback, accent colors, motion kind. Matches the story: genesis well / pulse office / horizon.
  const WORLD = {
    1: { sky: ['#041b1a', '#07332e', '#0a1a2e'], a: '#7dfbe6', b: '#b06bff', kind: 'genesis', fz: 1.45, fy: .1 },
    2: { sky: ['#0b0620', '#1b0f3a', '#2b1650'], a: '#ff4d6d', b: '#59a8ff', kind: 'office', fz: 1.3, fy: 0 },
    3: { sky: ['#1a0712', '#33101f', '#4a1a14'], a: '#ffb347', b: '#ff5d73', kind: 'horizon', fz: 1.35, fy: .15 }
  };
  function rnd(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
  const hexA = (hex, a) => hex + Math.floor(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

  // draw an image layer scaled to height H, wrapped horizontally with period pw; slight overscan kills hairlines
  function drawLayer(c, img, W, H, off, alpha, yTop) {
    if (!img) return;
    const pw = img.width * H / img.height;
    const o = ((off % pw) + pw) % pw;
    c.globalAlpha = alpha;
    for (let x = -o; x < W; x += pw) c.drawImage(img, x - 1, yTop || 0, pw + 2, H);
    c.globalAlpha = 1;
  }

  function draw(c, W, game) {
    const world = game.lv.world || 1, lvl = game.id || 1, S = WORLD[world] || WORLD[1];
    const H = 450, t = game.t, camPx = game.cam * game.ts;
    const prog = Math.max(0, Math.min(1, game.cam / Math.max(1, game.lv.W - game.vw)));
    const seed = lvl * 7 + world * 31, r = rnd(seed);
    c.save();

    // 1. sky fallback (also shows while art loads)
    c.fillStyle = S.sky[1]; c.fillRect(0, 0, W, H);

    // 2. painted far scene: very slow parallax + gentle autonomous drift, slight breathing zoom
    const far = IMG['bg2_w' + world + '_far'];
    if (far) {
      const z = S.fz * (1 + Math.sin(t * .1 + seed) * .006); // per-world zoom + slow breathe
      const pw = far.width * H * z / far.height;
      const o = ((camPx * .07 + t * 2 + (seed % 97) * 13) % pw + pw) % pw;
      c.globalAlpha = .96;
      for (let x = -o; x < W; x += pw) c.drawImage(far, x - 1, -H * (z - 1) * (1 - S.fy), pw + 2, H * z);
      c.globalAlpha = 1;
    }

    // 3. story-themed animated accents (additive light)
    c.globalCompositeOperation = 'lighter';
    // travelling glow that moves deeper into the level as you advance
    const gx = W * (.8 - prog * .55), gy = 130 + Math.sin(t * .3) * 8;
    c.globalAlpha = .38; c.drawImage(tint(S.a), gx - 320, gy - 320, 640, 640); c.globalAlpha = .12; c.drawImage(tint(S.b), gx - 200, gy - 200, 400, 400); c.globalAlpha = 1;

    if (S.kind === 'genesis') {
      // swaying god-ray shafts from the cave roof
      for (let i = 0; i < 4; i++) {
        const x = (((i * 340 - camPx * .12 + 80) % (W + 300)) + W + 300) % (W + 300) - 150;
        const sw = Math.sin(t * .25 + i * 1.7) * 30, a = .05 + .035 * Math.sin(t * .6 + i * 2.1);
        c.fillStyle = hexA(i % 2 ? S.a : S.b, a);
        c.beginPath(); c.moveTo(x - 20 + sw * .3, 0); c.lineTo(x + 24 + sw * .3, 0); c.lineTo(x + 130 + sw, H); c.lineTo(x - 60 + sw, H); c.fill();
      }
      // crystal glints flashing at mid-depth spots
      for (let i = 0; i < 10; i++) {
        const px = (((r() * 1400 - camPx * .22) % (W + 60)) + W + 60) % (W + 60) - 30, py = 60 + r() * 320;
        const ph = (t * .5 + r() * 4) % 4, a = ph < .6 ? Math.sin(ph / .6 * Math.PI) * .8 : 0;
        if (a > 0) { const s = 3 + r() * 5; c.strokeStyle = hexA('#ffffff', a * .8); c.lineWidth = 1.2; c.beginPath(); c.moveTo(px - s, py); c.lineTo(px + s, py); c.moveTo(px, py - s); c.lineTo(px, py + s); c.stroke(); c.fillStyle = hexA(S.a, a * .5); c.beginPath(); c.arc(px, py, 2, 0, TAU); c.fill(); }
      }
    } else if (S.kind === 'office') {
      // red pulse lines travelling down the archive columns (the Guard's pulse gates)
      for (let i = 0; i < 5; i++) {
        const px = (((i * 260 + r() * 120 - camPx * .22) % (W + 80)) + W + 80) % (W + 80) - 40;
        const ph = (t * .35 + i * .23) % 1, py = ph * (H + 120) - 60;
        c.fillStyle = hexA(S.a, .3); c.fillRect(px, py - 50, 2.5, 100);
        c.fillStyle = hexA('#ffd7de', .5 * (1 - Math.abs(ph - .5) * 2)); c.fillRect(px - 1, py - 2, 4.5, 4);
      }
      // expanding pulse rings from the glow source
      for (let i = 0; i < 3; i++) {
        const ph = ((t * .22 + i / 3) % 1);
        c.strokeStyle = hexA(S.a, (1 - ph) * .25); c.lineWidth = 2;
        c.beginPath(); c.arc(gx, gy, 20 + ph * 230, 0, TAU); c.stroke();
      }
      // hanging lamp glows flickering gently (mid-depth)
      for (let i = 0; i < 6; i++) {
        const px = (((i * 240 + 100 + r() * 80 - camPx * .22) % (W + 60)) + W + 60) % (W + 60) - 30, py = 50 + r() * 120;
        const a = .18 + .12 * Math.sin(t * (1.1 + r()) + i * 2.3);
        c.globalAlpha = Math.min(1, a * 2); c.drawImage(tint(S.b), px - 22, py - 22, 44, 44); c.globalAlpha = 1;
      }
    } else {
      // horizon: glowing river streaks flowing sideways (the gravity river)
      for (let i = 0; i < 9; i++) {
        const sp = 50 + r() * 70, py = 240 + r() * 180, len = 60 + r() * 90;
        const px = (((r() * 1500 - camPx * .3 - t * sp) % (W + 200)) + W + 200) % (W + 200) - 100;
        c.strokeStyle = hexA(i % 2 ? S.a : S.b, .18 + .14 * Math.sin(t * 1.5 + i));
        c.lineWidth = 1.5 + r() * 1.5;
        c.beginPath(); c.moveTo(px, py + Math.sin(t * 2 + i) * 3); c.quadraticCurveTo(px + len * .5, py - 4, px + len, py + Math.sin(t * 2 + i + 1) * 3); c.stroke();
      }
      // the painted Horizon Door in the far art is the landmark; a soft golden pulse answers it
      const hx = W * (.72 - prog * .4), hy = 120;
      c.globalAlpha = .4 + .2 * Math.sin(t * 1.3); c.drawImage(tint('#fff2c8'), hx - 110, hy - 110, 220, 220); c.globalAlpha = 1;
    }

    // drifting fog bands between layers
    for (let i = 0; i < 4; i++) {
      const x = (((i * 360 - camPx * (.16 + i * .04) + t * (7 + i * 3)) % (W + 600)) + W + 600) % (W + 600) - 300;
      const y = 250 + i * 40 + Math.sin(t * .4 + i) * 12;
      c.globalAlpha = .14; c.drawImage(tint(i % 2 ? S.a : S.b), x - 280, y - 140, 560, 280); c.globalAlpha = 1;
    }
    c.globalCompositeOperation = 'source-over';

    // 4. painted silhouette layers (mid then near) with parallax
    drawLayer(c, IMG['bg2_w' + world + '_mid'], W, H, camPx * .22 + t * 3 + (seed % 53) * 29, .92, 0);
    drawLayer(c, IMG['bg2_w' + world + '_near'], W, H, camPx * .45 + t * 5 + (seed % 41) * 17, .97, 0);

    // 5. world particles in the air
    const n = 30;
    for (let i = 0; i < n; i++) {
      const bx = r() * 1400, by = r() * H, sp = .3 + r() * .8, sz = 1 + r() * 2, par = .25 + r() * .5;
      let x = (((bx - camPx * par - (S.kind === 'horizon' ? t * 40 * sp : 0)) % (W + 40)) + W + 40) % (W + 40) - 20, y;
      if (S.kind === 'genesis') y = by - t * 9 * sp;        // spores rise
      else if (S.kind === 'office') y = by + t * 12 * sp;   // data specks fall
      else y = by - t * 6 * sp + Math.sin(t + i) * 5;       // embers drift up
      y = ((y % H) + H) % H;
      const a = .3 + .28 * Math.sin(t * 2 * sp + i);
      c.globalAlpha = a; c.fillStyle = i % 2 ? S.a : S.b;
      if (S.kind === 'horizon') c.fillRect(x, y, sz * 6, sz * .7);
      else c.fillRect(x, y, sz, sz);
    }
    c.globalAlpha = 1;

    // 6. readability dim + soft vignette so platforms and Void keep contrast
    c.fillStyle = 'rgba(6,3,18,.26)'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(4,2,14,.14)'; c.fillRect(0, 0, W, 60); c.fillRect(0, H - 50, W, 50);
    c.restore();
  }
  return { draw };
})();
