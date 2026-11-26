'use strict';
// Synthesised SFX + ambient music (no audio files needed). All through WebAudio.
const SFX = (() => {
  let ac = null, master, musicGain, on = true, musicOn = true, musicTimer = null, world = 1;
  const S = { get on() { return on; }, get music() { return musicOn; } };
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    ac = new C(); master = ac.createGain(); master.gain.value = on ? 0.7 : 0; master.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    startMusic();
  }
  function tone(f0, f1, dur, type = 'sine', vol = 0.3, delay = 0, dest) {
    if (!ac || !on) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, f0, f1, vol = 0.25, delay = 0) {
    if (!ac || !on) return; const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  const P = [0, 2, 4, 7, 9]; // pentatonic
  const lib = {
    jump: () => tone(380, 760, .14, 'triangle', .2),
    djump: () => { tone(560, 1100, .16, 'sine', .22); tone(840, 1500, .12, 'triangle', .1, .04); },
    land: () => noise(.08, 700, 200, .12),
    wallj: () => { tone(300, 820, .15, 'square', .08); noise(.1, 2500, 800, .12); },
    spring: () => { tone(200, 900, .25, 'sine', .3); tone(400, 1400, .2, 'triangle', .12, .05); },
    sawDeath: () => { noise(.3, 5000, 600, .3); tone(700, 90, .35, 'sawtooth', .18); },
    rewind: () => { tone(120, 1600, .9, 'sawtooth', .07); noise(.9, 400, 5000, .12); },
    click: () => tone(660, 880, .08, 'triangle', .2),
    dash: () => { noise(.16, 3000, 400, .3); tone(300, 900, .12, 'sawtooth', .08); },
    swallow: () => { tone(90, 420, .5, 'sine', .35); noise(.45, 200, 1800, .18); },
    dump: () => { tone(500, 120, .18, 'square', .1); noise(.12, 1500, 300, .2); },
    death: () => { tone(420, 60, .55, 'sawtooth', .25); noise(.35, 1800, 100, .25); },
    respawn: () => { tone(200, 800, .3, 'sine', .25); tone(400, 1200, .3, 'triangle', .12, .08); },
    checkpoint: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, .22, 'triangle', .22, i * .07)),
    crystal: () => { tone(1200, 1800, .12, 'sine', .22); tone(1800, 2400, .15, 'sine', .15, .06); },
    shield: () => { tone(300, 900, .35, 'sine', .3); tone(600, 1500, .35, 'triangle', .1, .05); },
    shieldBreak: () => { noise(.3, 4000, 500, .35); tone(900, 150, .3, 'square', .15); },
    slow: () => { tone(900, 150, .8, 'sine', .3); },
    slowEnd: () => tone(150, 700, .4, 'sine', .22),
    phase: () => { tone(500, 1400, .5, 'sine', .22); tone(520, 1480, .5, 'sine', .18, .02); },
    burst: () => { tone(120, 30, .7, 'sine', .6); noise(.6, 3000, 80, .4); },
    pulseOn: () => tone(180, 140, .12, 'sawtooth', .04),
    star: i => tone(700 + i * 180, 1000 + i * 240, .3, 'triangle', .3),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, .35, 'triangle', .25, i * .1)),
    toast: () => { tone(800, 1000, .1, 'sine', .2); tone(1200, 1500, .12, 'sine', .2, .09); },
    // Void "voice": cute chirps built from fast pitch glides
    chirp: () => { const b = 500 + Math.random() * 300; tone(b, b * 1.6, .09, 'sine', .25); tone(b * 1.6, b * 1.2, .09, 'sine', .2, .08); },
    giggle: () => [0, 1, 2].forEach(i => tone(700 + i * 90, 900 + i * 90, .07, 'sine', .22, i * .09)),
    dizzy: () => { for (let i = 0; i < 5; i++) tone(500 + (i % 2) * 220, 520 + (i % 2) * 220, .09, 'triangle', .2, i * .09); },
    huff: () => { noise(.35, 900, 300, .25); tone(260, 180, .35, 'sine', .15); },
    yawn: () => tone(500, 220, .8, 'sine', .22),
    happy: () => [0, 2, 4].forEach(i => tone(600 * Math.pow(2, P[i] / 12), 620 * Math.pow(2, P[i] / 12), .12, 'sine', .22, i * .08)),
  };
  S.play = (n, a) => { try { lib[n] && lib[n](a); } catch (e) {} };
  S.init = init;
  function startMusic() {
    if (musicTimer) return; let step = 0;
    const roots = { 0: 110, 1: 98, 2: 123.5, 3: 87.3 };
    const tick = () => {
      if (!ac || !musicOn || !on) return;
      const r = roots[world] || 110, bar = Math.floor(step / 8) % 4, prog = [0, 5, 3, 7][bar];
      if (step % 8 === 0) { // pad
        [0, 7, 12].forEach(s => tone(r * Math.pow(2, (prog + s) / 12), r * Math.pow(2, (prog + s) / 12), 2.6, 'sine', .22, 0, musicGain));
      }
      if (step % 2 === 0 || Math.random() < .3) {
        const n = P[(Math.random() * P.length) | 0] + (Math.random() < .3 ? 12 : 0);
        tone(r * 4 * Math.pow(2, (n + prog) / 12), r * 4 * Math.pow(2, (n + prog) / 12), .5, 'triangle', .1, 0, musicGain);
      }
      step++;
    };
    musicTimer = setInterval(tick, 330);
  }
  S.setWorld = w => { world = w; };
  S.toggle = () => { on = !on; if (master) master.gain.value = on ? 0.7 : 0; return on; };
  S.setOn = v => { on = v; if (master) master.gain.value = on ? 0.7 : 0; };
  return S;
})();
