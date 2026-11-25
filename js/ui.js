'use strict';
const $ = id => document.getElementById(id);
const WORLD = ['', 'بئر التكوين', 'ممر النبض', 'نهر الجاذبية'];
const AB_INFO = { dash: ['اندفاع', 'dash'], swallow: ['بلع', 'swallow'], shield: ['درع', 'shield'], time: ['تمدد الزمن', 'time_dilation'], phase: ['طيف', 'phase'], burst: ['انفجار الكتلة', 'mass_burst'] };
const ACH = [
  ['first', 'أول باب', 'أنهي أي مرحلة'], ['flawless', 'من غير خدش', 'أنهي مرحلة من غير ما تموت'], ['employee', 'موظف الشهر', 'أنهي نهر الجاذبية (مرحلة ١٠)'],
  ['hungry', 'جعان بجد', 'ابلع كل المادة في المرحلة'], ['clean', 'نظيف', 'أنهي مرحلة من غير ولا قدرة'], ['pro', 'محترف القدرات', 'استخدم كل قدرة مرة في مرحلة واحدة'],
  ['fast', 'سريع', 'وقت ذهبي في مرحلة'], ['mass', 'كتلة بتعدّي', 'عدّي ٣ فتحات ضيقة من غير موت'], ['echo', 'صاحب الأصداء', '٥٠ موتة في الجلسة'], ['walker', 'مشّاي الأفق', 'أنهي المراحل ١٢ كلها'],
];
let LV = [], STORY = {}, game, S = 1, cur = 1, sessionDeaths = 0;
const Save = {
  d: { lv: {}, ach: {}, snd: true, seen: {}, ab: {} },
  load() { try { Object.assign(this.d, JSON.parse(localStorage.getItem('void_save_v1') || '{}')); } catch (e) {} },
  save() { try { localStorage.setItem('void_save_v1', JSON.stringify(this.d)); } catch (e) {} },
  unlocked(n) { return n === 1 || !!this.d.lv[n - 1]; },
  crystals() { return Object.values(this.d.lv).reduce((a, b) => a + (b.cr || 0), 0); },
};
const fmt = t => t.toFixed(1);
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('on')); $(id).classList.add('on'); }
function overlay(id, on) { $(id).classList.toggle('on', on); }
function fit() { const s = Math.min(innerWidth / 800, innerHeight / 450); S = s; const st = $('stage'); st.style.transform = `scale(${s})`; st.style.marginLeft = -400 * s + 'px'; st.style.marginTop = -225 * s + 'px'; if (game) game.resize(s); }
addEventListener('resize', fit); fit();

/* ---------- DOM sprite (menu Void) ---------- */
class DSprite {
  constructor(el, size) { this.el = el; this.size = size; this.q = null; this.base = null; this.t = 0; this.last = 0; this.run = this.run.bind(this); requestAnimationFrame(this.run); }
  set(name, i) { const m = META.sprites[name], s = this.size; this.el.style.backgroundImage = `url(assets/sprites/${name}.webp)`; this.el.style.backgroundSize = `${m.cols * s}px ${Math.ceil(m.n / m.cols) * s}px`; this.el.style.backgroundPosition = `${-(i % m.cols) * s}px ${-Math.floor(i / m.cols) * s}px`; }
  play(name, from = 0, to = null, done) { this.q = { name, from, to: to === null ? META.sprites[name].n - 1 : to, t: 0, done }; }
  run(now) { requestAnimationFrame(this.run); const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (this.q) { const q = this.q, m = META.sprites[q.name]; q.t += dt; const i = q.from + Math.floor(q.t * m.fps); if (i > q.to) { this.q = null; q.done && q.done(); } else this.set(q.name, i); }
    else { const m = META.sprites.idle; let i = Math.floor(this.t * m.fps) % (2 * m.n - 2); i = i < m.n ? i : 2 * m.n - 2 - i; this.set('idle', i); } }
}
/* ---------- menu Void interaction (per doc: taps 1,3 poke; 4-7 spin; 8+ huff then forgive; 10s idle = life) ---------- */
let mv, taps = 0, tapTimer = 0, idleTimer = 0;
function menuTap() {
  SFX.init(); taps++; clearTimeout(tapTimer); tapTimer = setTimeout(() => taps = 0, 3000); resetIdle();
  if (taps === 1 || taps === 3) { mv.play('ui_tap_poke', 0, 11); SFX.play(taps === 1 ? 'chirp' : 'giggle'); }
  else if (taps === 2) { mv.play('ui_tap_poke', 0, 11); SFX.play('chirp'); }
  else if (taps <= 7) { mv.play('ui_tap_spam', 0, 5); SFX.play('dizzy'); }
  else if (taps === 8) { mv.play('ui_tap_spam', 6, 11); SFX.play('huff'); }
  else { mv.play('ui_tap_spam', 6, 11); SFX.play('happy'); taps = 0; }
}
function resetIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if ($('menu').classList.contains('on') && !mv.q) { mv.play('ui_idle_alive', 0, 11); SFX.play('yawn'); } resetIdle(); }, 10000); }

/* ---------- level select ---------- */
const NX = i => 120 + i * 190 + Math.floor(i / 4) * 40, NY = i => 235 + Math.sin(i * 1.15) * 105;
function buildMap() {
  const map = $('map'); map.querySelectorAll('.node,.wl,#mapbg').forEach(e => e.remove());
  const total = NX(11) + 150; $('mapsvg').setAttribute('width', total); $('mapsvg').setAttribute('viewBox', `0 0 ${total} 450`);
  const bgw = document.createElement('div'); bgw.id = 'mapbg'; bgw.style.width = total + 'px';
  for (let w = 1; w <= 3; w++) { const d = document.createElement('div'); d.style.width = total / 3 + 'px'; d.style.backgroundImage = `url(assets/img/bg/bg${w}.webp)`; bgw.appendChild(d); }
  map.insertBefore(bgw, map.firstChild);
  let path = ''; LV.forEach((L, i) => { path += (i ? 'L' : 'M') + NX(i) + ' ' + NY(i) + ' '; });
  $('mapsvg').innerHTML = `<path d="${path}" fill="none" stroke="#f5c44a" stroke-width="10" stroke-linecap="round" opacity=".18"/><path d="${path}" fill="none" stroke="#ffd98a" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>`;
  [1, 2, 3].forEach(w => { const e = document.createElement('div'); e.className = 'wl'; e.style.left = (w - 1) * total / 3 + 'px'; e.style.width = total / 3 + 'px'; e.textContent = `العالم ${w} · ${WORLD[w]}`; map.appendChild(e); });
  let next = 1; LV.forEach(L => { if (Save.d.lv[L.n]) next = Math.min(12, L.n + 1); });
  LV.forEach((L, i) => {
    const b = document.createElement('button'), un = Save.unlocked(L.n), r = Save.d.lv[L.n]; b.className = 'node' + (un ? '' : ' lock') + (L.n === next && un ? ' cur' : '');
    b.style.left = NX(i) + 'px'; b.style.top = NY(i) + 'px'; b.innerHTML = `<img class="o" src="assets/img/ui/dash_button.webp" alt=""><b>${L.n}</b>` + (r ? `<div class="st">${[1, 2, 3].map(s => `<img class="${s <= r.stars ? '' : 'off'}" src="assets/img/ui/star.webp" alt="">`).join('')}</div>` : '');
    b.onclick = () => { SFX.play('click'); openSheet(L); }; map.appendChild(b);
  });
  $('menuCr').textContent = Save.crystals();
  setTimeout(() => { map.scrollLeft = Math.max(0, NX(next - 1) - 400); }, 30);
}
function openSheet(L) {
  const un = Save.unlocked(L.n), r = Save.d.lv[L.n]; cur = L.n; $('shT').textContent = `${L.n}. ${L.title}`; $('shW').textContent = `العالم ${L.world}: ${WORLD[L.world]} — ${L.new}`;
  $('shS').innerHTML = [1, 2, 3].map(s => `<img class="${r && s <= r.stars ? '' : 'off'}" src="assets/img/ui/star.webp" alt="">`).join('');
  $('shB').textContent = r ? `أحسن وقت: ${fmt(r.best)} ث · موتات: ${r.deaths}` : (un ? 'لسه ما لعبتهاش' : 'خلّص المرحلة اللي قبلها الأول');
  $('shG').textContent = `ذهبي ${L.gold}ث · فضي ${L.silver}ث · برونزي ${L.bronze}ث`; $('shGo').style.display = un ? 'block' : 'none'; $('sheet').classList.add('on');
}
$('map').addEventListener('pointerdown', e => { if (e.target.id === 'map' || e.target.closest('#mapbg')) $('sheet').classList.remove('on'); });

/* ---------- story ---------- */
let stP = 0, stL = 0, stFlat = [], stCB = null;
function playStory(n, cb) {
  const panels = STORY[n]; if (!panels) return cb(); stCB = cb; stP = 0; stL = 0; show('story'); renderStory(n);
  $('stSkip').onclick = e => { e.stopPropagation(); endStory(n); };
  $('story').onpointerdown = () => { SFX.play('click'); const lines = STORY[n][stP]; if (stL < lines.length - 1) stL++; else { stP++; stL = 0; if (stP >= STORY[n].length) return endStory(n); } renderStory(n); };
}
function renderStory(n) {
  const l = STORY[n][stP][stL], im = $('stImg'); im.style.animation = 'none'; im.offsetWidth; im.style.animation = ''; im.src = `assets/img/story/level${String(n).padStart(2, '0')}_panel${stP + 1}.webp`;
  $('stBox').className = l.who; $('stWho').textContent = l.name; $('stTxt').textContent = l.t; $('stDots').innerHTML = STORY[n].map((_, i) => `<i class="${i <= stP ? 'on' : ''}"></i>`).join('');
  SFX.play(l.who === 'void' ? 'chirp' : 'click');
}
function endStory(n) { $('story').onpointerdown = null; Save.d.seen[n] = 1; Save.save(); const cb = stCB; stCB = null; cb && cb(); }

/* ---------- gameplay glue ---------- */
let curL, abList, toastT, tutT, ctrlKeys = {};
function abilitiesFor(n) { return Object.keys(ABILITY_LEVEL).filter(a => n >= ABILITY_LEVEL[a]); }
function buildAbs(list) {
  const box = $('abs'); box.innerHTML = '';
  const pos = { dash: [18, 14, 112], swallow: [140, 14, 80], shield: [22, 136, 64], time: [94, 120, 64], phase: [166, 100, 64], burst: [236, 20, 64] };
  const keys = { dash: 'Space', swallow: 'E', shield: 'Q', time: 'R', phase: 'F', burst: 'B' };
  list.forEach(a => { const [r, b, s] = pos[a], el = document.createElement('button'); el.dataset.a = a; el.style.cssText = `right:${r}px;bottom:${b}px;width:${s}px;height:${s}px`;
    const src = a === 'dash' ? 'ui/dash_button' : a === 'swallow' ? 'ui/swallow_button' : 'icons/' + AB_INFO[a][1];
    el.innerHTML = `<img src="assets/img/${src}.webp" alt=""><div class="cd"></div><span class="k">${keys[a]}</span>`;
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); SFX.init(); game.use(a); }); box.appendChild(el); });
}
function toast(html, ms = 2200) { const t = $('toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
function tutor(txt, ms = 4000) { const t = $('tutor'); t.textContent = txt; t.classList.add('on'); clearTimeout(tutT); tutT = setTimeout(() => t.classList.remove('on'), ms); }
function startLevel(n) {
  cur = n; curL = LV[n - 1]; abList = abilitiesFor(n); show('hud'); overlay('pause', false); overlay('result', false); buildAbs(abList); game.resize(S);
  $('hDeaths').textContent = 0; $('hCr').textContent = 0; $('hTime').textContent = '0.0'; $('progI').style.width = '0';
  game.start(curL, abList); SFX.init();
  const fresh = abList.filter(a => ABILITY_LEVEL[a] === n && n > 1);
  if (fresh.length) setTimeout(() => { const a = fresh[0]; toast(`<img src="assets/img/icons/${AB_INFO[a][1]}.webp" alt="">قدرة جديدة: ${AB_INFO[a][0]}`, 3200); SFX.play('toast'); }, 600);
  if (n === 1) tutor('اسحب بصباعك في الشمال للحركة · ابلع المادة الدهبية · اندفع في الفتحات الضيقة', 6500);
  else if (n === 2) tutor('الفتحة الضيقة مش بتعدّي الكتلة الكبيرة — اندفع الأول', 4500);
}
function play(n) { const go = () => startLevel(n); if (STORY[n] && !Save.d.seen[n]) playStory(n, go); else go(); }
function pause(on) { if (!game.running || game.done || game.p.state === 'win') return; game.paused = on; overlay('pause', on); }
function finish(r) {
  const L = curL, medal = r.time <= L.gold ? 3 : r.time <= L.silver ? 2 : 1, prev = Save.d.lv[L.n], fresh = [];
  const rec = prev || { stars: 0, best: 1e9, deaths: 0, cr: 0 }; rec.stars = Math.max(rec.stars, medal); rec.best = Math.min(rec.best, r.time); rec.deaths = prev ? Math.min(prev.deaths, r.deaths) : r.deaths; rec.cr = Math.max(rec.cr, r.crystals); Save.d.lv[L.n] = rec;
  sessionDeaths += r.deaths; const u = r.stats.used, A = Save.d.ach, grant = k => { if (!A[k]) { A[k] = 1; fresh.push(ACH.find(x => x[0] === k)[1]); } };
  grant('first'); if (!r.deaths) grant('flawless'); if (L.n === 10) grant('employee'); if (r.matter && r.stats.swallowed >= r.matter) grant('hungry');
  if (!Object.keys(u).length) grant('clean'); if (abList.length >= 4 && abList.every(a => u[a])) grant('pro'); if (r.time <= L.gold) grant('fast'); if (r.stats.maxNarrowRun >= 3) grant('mass');
  if (sessionDeaths >= 50) grant('echo'); if (LV.every(l => Save.d.lv[l.n])) grant('walker'); Save.save();
  overlay('result', true); $('rT').textContent = medal === 3 ? 'ممتاز! 🏆' : 'عدّيت!';
  $('rStars').innerHTML = [1, 2, 3].map(s => `<img class="${s <= medal ? '' : 'off'}" src="assets/img/ui/star.webp" alt="">`).join('');
  [...$('rStars').children].forEach((im, i) => setTimeout(() => { im.classList.add('on'); if (i < medal) SFX.play('star', i); }, 350 + i * 330));
  $('rTime').textContent = `الوقت: ${fmt(r.time)} ث (ذهبي ${L.gold} · فضي ${L.silver})`; $('rInfo').textContent = `موتات: ${r.deaths} · كريستال: ${r.crystals}/${r.crystalsTotal}`;
  $('rAch').textContent = fresh.length ? '🏅 إنجاز جديد: ' + fresh.join('، ') : ''; $('rNext').style.display = L.n < 12 ? 'block' : 'none';
}
function toMap() { game.running = false; buildMap(); show('levels'); $('sheet').classList.remove('on'); }

/* ---------- input ---------- */
let joyId = null, jb = { x: 0, y: 0 };
function stagePt(e) { const r = $('stage').getBoundingClientRect(); return [(e.clientX - r.left) / S, (e.clientY - r.top) / S]; }
$('hud').parentElement.addEventListener('pointerdown', e => {
  if (!$('hud').classList.contains('on') || joyId !== null || game.paused) return; const [x, y] = stagePt(e); if (x > 400 || e.target.closest('button')) return;
  joyId = e.pointerId; jb = { x, y }; const j = $('joy'); j.style.left = x + 'px'; j.style.top = y + 'px'; j.style.display = 'block'; $('knob').style.transform = 'none'; SFX.init();
});
addEventListener('pointermove', e => { if (e.pointerId !== joyId) return; const [x, y] = stagePt(e); let dx = x - jb.x, dy = y - jb.y; const R = 60, dead = R * .1, d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; } const m = Math.hypot(dx, dy); $('knob').style.transform = `translate(${dx}px,${dy}px)`;
  if (m < dead) { game.input.x = game.input.y = 0; } else { const s = (m - dead) / (R - dead); game.input.x = dx / m * s; game.input.y = dy / m * s; } });
const endJoy = e => { if (e.pointerId !== joyId) return; joyId = null; game.input.x = game.input.y = 0; $('joy').style.display = 'none'; };
addEventListener('pointerup', endJoy); addEventListener('pointercancel', endJoy);
const KEYMAP = { ' ': 'dash', e: 'swallow', E: 'swallow', Shift: 'swallow', q: 'shield', Q: 'shield', r: 'time', R: 'time', f: 'phase', F: 'phase', b: 'burst', B: 'burst' };
addEventListener('keydown', e => { if (!game || !$('hud').classList.contains('on')) return; if (e.key === 'Escape' || e.key === 'p') return pause(!game.paused); game.input.keys[e.key] = true; const a = KEYMAP[e.key]; if (a && !e.repeat) { e.preventDefault(); game.use(a); } });
addEventListener('keyup', e => { game && delete game.input.keys[e.key]; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
addEventListener('contextmenu', e => e.preventDefault());

/* HUD refresh */
setInterval(() => {
  if (!game || !game.running || !$('hud').classList.contains('on')) return;
  $('hTime').textContent = fmt(game.time); $('progI').style.width = Math.min(100, game.p.x / game.lv.len * 100) + '%';
  const cds = { dash: .52, swallow: .8, shield: .5, time: 12, phase: 15, burst: 10 };
  $('abs').querySelectorAll('button').forEach(b => { const a = b.dataset.a; let p = Math.max(0, game.cd[a] / cds[a]) * 100; if (a === 'shield') p = game.shieldCharge > 0 && !game.p.shield ? 0 : 100; b.querySelector('.cd').style.setProperty('--p', p + '%'); b.classList.toggle('dis', a === 'burst' && !game.p.big); });
  const d = $('abs').querySelector('[data-a=dash]'); d && d.classList.toggle('hint', game.hint === 1);
}, 80);

/* ---------- boot ---------- */
async function boot() {
  Save.load(); SFX.setOn(Save.d.snd !== false);
  [LV, STORY] = await Promise.all([fetch('data/levels.json').then(r => r.json()), fetch('data/story.json').then(r => r.json())]);
  await loadAssets(p => $('loadbar').style.width = p * 100 + '%');
  game = new Game($('cv'), {
    onDeath: n => { $('hDeaths').textContent = n; }, onCrystal: n => { $('hCr').textContent = n; }, onWin: finish,
    onCheckpoint: (a, b) => toast(`نقطة رجوع ${a}/${b}`, 1200),
    onToast: k => { if (k === 'big') tutor('كبرت! الفتحة الضيقة مش هتعدّيك — اندفع عشان تفرّغ الكتلة', 3500); else if (k === 'gold') tutor('المادة الدهبية بتسد الفتحة — قرّب واضغط بلع', 3000); else if (k === 'needmass') toast('لازم تبقى كتلة (ابلع الأول)', 1500); },
  });
  fit(); mv = new DSprite($('menuVoid'), 210); mv.set('idle', 0);
  $('tap').textContent = 'المس للبدء'; $('tap').className = 'rdy';
  $('splash').onpointerdown = () => { $('splash').onpointerdown = null; SFX.init(); show('menu'); resetIdle(); };
  $('menuVoid').addEventListener('pointerdown', menuTap);
  $('bPlay').onclick = () => { SFX.play('click'); buildMap(); show('levels'); };
  $('bAch').onclick = () => { SFX.play('click'); $('achList').innerHTML = ACH.map(a => `<div class="ai ${Save.d.ach[a[0]] ? '' : 'lock'}"><img src="assets/img/ui/achievement_medal.webp" alt=""><div><b>${a[1]}</b><span>${a[2]}</span></div></div>`).join(''); show('ach'); };
  $('achBack').onclick = () => show('menu'); $('lvBack').onclick = () => { SFX.play('click'); show('menu'); };
  $('bSnd').onclick = () => { const on = SFX.toggle(); Save.d.snd = on; Save.save(); $('bSnd').style.opacity = on ? 1 : .4; SFX.play('click'); };
  $('shGo').onclick = () => { SFX.play('click'); $('sheet').classList.remove('on'); play(cur); };
  $('bPause').onclick = () => pause(true); $('pResume').onclick = () => pause(false);
  $('pRestart').onclick = () => { overlay('pause', false); startLevel(cur); }; $('pMap').onclick = toMap;
  $('rNext').onclick = () => play(cur + 1); $('rRetry').onclick = () => startLevel(cur); $('rMap').onclick = toMap;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
