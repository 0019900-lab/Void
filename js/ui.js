'use strict';
const $ = id => document.getElementById(id);
const WORLD = ['', 'بئر التكوين', 'ممر النبض', 'نهر الجاذبية'], PLAYABLE = 4;
const NEWS = { double_jump: 'دابل جامب', dash: 'الاندفاع', wall: 'تسلق الحيطان', shield: 'الدرع (تلقائي)', pulse: 'بوابات النبض', swallow: 'الابتلاع', phase: 'الفيز', time: 'تباطؤ الزمن', burst: 'انفجار الكتلة' };
const ACH = [['first', 'أول باب', 'أنهي أي مرحلة'], ['flawless', 'من غير خدش', 'أنهي مرحلة من غير موت'], ['employee', 'موظف الشهر', 'أنهي المرحلة ١٠'], ['hungry', 'جعان بجد', 'اجمع كل البلورات في مرحلة'], ['clean', 'نظيف', 'أنهي مرحلة بالنط بس من غير قدرات'], ['pro', 'محترف القدرات', 'استخدم كل قدرة اتفتحت في مرحلة'], ['fast', 'سريع', 'خد الوقت الذهبي في أي مرحلة'], ['chaser', 'صايد الأرقام', 'الوقت الذهبي في ٦ مراحل'], ['echo', 'صاحب الأصداء', '٥٠ موتة في جلسة واحدة'], ['walker', 'ماشي على الأفق', 'خلّص المراحل الاتنين عشر']];
let LV = [], STORY = {}, game, S = 1, SW = 800, cur = 1, curL = null, sessionDeaths = 0;
const Save = { d: { lv: {}, ach: {}, snd: true, seen: {} },
  load() { try { Object.assign(this.d, JSON.parse(localStorage.getItem('void_save_v2') || '{}')); } catch (e) {} }, save() { try { localStorage.setItem('void_save_v2', JSON.stringify(this.d)); } catch (e) {} },
  unlocked(n) { return n === 1 || !!this.d.lv[n - 1]; }, crystals() { return Object.values(this.d.lv).reduce((a, b) => a + (b.cr || 0), 0); } };
const fmt = t => t.toFixed(1), est = L => L.width_tiles / 6.5, medals = L => [est(L) * 1.15, est(L) * 1.5, est(L) * 2.2];
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('on')); $(id).classList.add('on'); }
function overlay(id, on) { $(id).classList.toggle('on', on); }
function fit() { S = Math.min(innerHeight / 450, innerWidth / 720); SW = innerWidth / S; const st = $('stage'); st.style.width = SW + 'px'; st.style.transform = `scale(${S})`; st.style.left = '0px'; st.style.top = (innerHeight - 450 * S) / 2 + 'px'; st.style.setProperty('--m', Math.max(10, SW * .045) + 'px'); if (game) game.resize(S, SW); }
addEventListener('resize', fit); fit();

/* ---- menu Void (painted idle + tap reactions from the doc) ---- */
class DSprite {
  constructor(el, size) { this.el = el; this.size = size; this.q = null; this.t = 0; this.last = 0; this.run = this.run.bind(this); requestAnimationFrame(this.run); }
  set(name, i) { const m = META.sprites[name], s = this.size; this.el.style.backgroundImage = `url(assets/sprites/${name}.webp)`; this.el.style.backgroundSize = `${m.cols * s}px ${Math.ceil(m.n / m.cols) * s}px`; this.el.style.backgroundPosition = `${-(i % m.cols) * s}px ${-Math.floor(i / m.cols) * s}px`; }
  play(name, from, to) { this.q = { name, from, to, t: 0 }; }
  run(now) { requestAnimationFrame(this.run); const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (this.q) { const q = this.q, m = META.sprites[q.name]; q.t += dt; const i = q.from + Math.floor(q.t * m.fps); if (i > q.to) this.q = null; else this.set(q.name, i); }
    else { const m = META.sprites.idle; let i = Math.floor(this.t * m.fps) % (2 * m.n - 2); i = i < m.n ? i : 2 * m.n - 2 - i; this.set('idle', i); } }
}
let mv, taps = 0, tapTimer = 0, idleTimer = 0;
function menuTap() { SFX.init(); taps++; clearTimeout(tapTimer); tapTimer = setTimeout(() => taps = 0, 3000); resetIdle();
  if (taps <= 3) { mv.play('ui_tap_poke', 0, 11); SFX.play(taps === 2 ? 'chirp' : 'giggle'); } else if (taps <= 7) { mv.play('ui_tap_spam', 0, 5); SFX.play('dizzy'); } else { mv.play('ui_tap_spam', 6, 11); SFX.play(taps === 8 ? 'huff' : 'happy'); if (taps > 8) taps = 0; } }
function resetIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if ($('menu').classList.contains('on') && !mv.q) { mv.play('ui_idle_alive', 0, 11); SFX.play('yawn'); } resetIdle(); }, 10000); }

/* ---- level select ---- */
const NX = i => 130 + i * 175 + Math.floor(i / 4) * 50, NY = i => 235 + Math.sin(i * 1.15) * 105;
function buildMap() {
  const map = $('map'); map.querySelectorAll('.node,.wl,#mapbg').forEach(e => e.remove()); const total = Math.max(NX(11) + 150, SW);
  $('mapsvg').setAttribute('width', total); $('mapsvg').setAttribute('viewBox', `0 0 ${total} 450`);
  const bg = document.createElement('div'); bg.id = 'mapbg'; bg.style.width = total + 'px'; for (let w = 1; w <= 3; w++) { const d = document.createElement('div'); d.style.width = total / 3 + 'px'; d.style.backgroundImage = `url(assets/img/bg/bg${w}.webp)`; bg.appendChild(d); } map.insertBefore(bg, map.firstChild);
  let path = ''; LV.forEach((L, i) => path += (i ? 'L' : 'M') + NX(i) + ' ' + NY(i) + ' ');
  $('mapsvg').innerHTML = `<path d="${path}" fill="none" stroke="#f5c44a" stroke-width="10" stroke-linecap="round" opacity=".18"/><path d="${path}" fill="none" stroke="#ffd98a" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>`;
  [1, 2, 3].forEach(w => { const e = document.createElement('div'); e.className = 'wl'; e.style.left = (w - 1) * total / 3 + 'px'; e.style.width = total / 3 + 'px'; e.textContent = `العالم ${w} · ${WORLD[w]}`; map.appendChild(e); });
  let next = 1; LV.forEach(L => { if (Save.d.lv[L.id]) next = Math.min(PLAYABLE, L.id + 1); });
  LV.forEach((L, i) => { const soon = L.id > PLAYABLE, un = !soon && Save.unlocked(L.id), r = Save.d.lv[L.id], b = document.createElement('button');
    b.className = 'node' + (un ? '' : ' lock') + (L.id === next && un ? ' cur' : ''); b.style.left = NX(i) + 'px'; b.style.top = NY(i) + 'px';
    b.innerHTML = `<img class="o" src="assets/img/ui/dash_button.webp" alt=""><b>${L.id}</b>` + (r ? `<div class="st">${[1, 2, 3].map(s => `<img class="${s <= r.stars ? '' : 'off'}" src="assets/img/ui/star.webp" alt="">`).join('')}</div>` : '') + (soon ? '<small>قريباً</small>' : '');
    b.onclick = () => { SFX.play('click'); openSheet(L); }; map.appendChild(b); });
  $('menuCr').textContent = Save.crystals(); setTimeout(() => map.scrollLeft = Math.max(0, NX(next - 1) - SW / 2), 30);
}
function openSheet(L) {
  const soon = L.id > PLAYABLE, un = !soon && Save.unlocked(L.id), r = Save.d.lv[L.id], [g, s, b] = medals(L); cur = L.id;
  $('shT').textContent = `${L.id}. ${L.name}`; $('shW').textContent = `العالم ${L.world}: ${WORLD[L.world]} — جديد: ${NEWS[L.new_in_level] || L.new_in_level}`;
  $('shS').innerHTML = [1, 2, 3].map(x => `<img class="${r && x <= r.stars ? '' : 'off'}" src="assets/img/ui/star.webp" alt="">`).join('');
  $('shB').textContent = soon ? 'المرحلة دي جاية في التحديث الجاي' : r ? `أحسن وقت: ${fmt(r.best)} ث · موتات: ${r.deaths}` : (un ? `عرض ${L.width_tiles} بلاطة · ${L.checkpoints.length} نقط رجوع` : 'خلّص المرحلة اللي قبلها الأول');
  $('shG').textContent = `ذهبي ${Math.round(g)}ث · فضي ${Math.round(s)}ث · برونزي ${Math.round(b)}ث`; $('shGo').style.display = un ? 'block' : 'none'; $('sheet').classList.add('on');
}
$('map').addEventListener('pointerdown', e => { if (!e.target.closest('.node')) $('sheet').classList.remove('on'); });

/* ---- story (art covers the screen, box overlays bottom 22%, one name tag) ---- */
let stP = 0, stL = 0, stCB = null, stN = 0;
const WHO = { 'لومي': 'lumi', 'فويد': 'void', 'الحارس': 'guard' };
function playStory(n, cb) { const st = STORY[n]; if (!st) return cb(); stCB = cb; stN = n; stP = 0; stL = 0; show('story'); renderStory();
  $('stSkip').onclick = e => { e.stopPropagation(); endStory(); };
  $('story').onpointerdown = () => { SFX.play('click'); const p = STORY[n].panels[stP]; if (stL < p.lines.length - 1) stL++; else { stP++; stL = 0; if (stP >= STORY[n].panels.length) return endStory(); } renderStory(); }; }
function renderStory() { const P = STORY[stN].panels[stP], l = P.lines[stL], im = $('stImg'); im.style.animation = 'none'; im.offsetWidth; im.style.animation = ''; im.src = `assets/img/story6/${P.art.replace('.jpg', '.webp')}`;
  $('stBox').className = WHO[l.speaker] || 'guard'; $('stWho').textContent = l.speaker; $('stTxt').textContent = l.text; $('stDots').innerHTML = STORY[stN].panels.map((_, i) => `<i class="${i <= stP ? 'on' : ''}"></i>`).join(''); SFX.play(l.speaker === 'فويد' ? 'chirp' : 'click'); }
function endStory() { $('story').onpointerdown = null; Save.d.seen[stN] = 1; Save.save(); const cb = stCB; stCB = null; cb && cb(); }

/* ---- gameplay glue ---- */
let toastT, tutT;
function toast(html, ms = 2200) { const t = $('toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
function tutor(txt, ms = 5000) { const t = $('tutor'); t.textContent = txt; t.classList.add('on'); clearTimeout(tutT); tutT = setTimeout(() => t.classList.remove('on'), ms); }
function startLevel(n) {
  cur = n; curL = LV[n - 1]; show('hud'); overlay('pause', false); overlay('result', false); $('replayTag').classList.remove('on'); game.resize(S, SW);
  $('bDash').style.display = curL.abilities.includes('dash') ? 'block' : 'none'; $('hDeaths').textContent = 0; $('hCr').textContent = 0; $('hTime').textContent = '0.0'; $('progI').style.width = '0';
  game.replayDone = false; game._fin = false; game.start(curL); SFX.init();
  if (n > 1) setTimeout(() => { toast(`جديد: ${NEWS[curL.new_in_level] || curL.new_in_level}`, 2600); SFX.play('toast'); }, 500);
  if (n === 1) tutor('اسحب بصباعك في الشمال للجري · النطة الكبيرة يمين (دوس مطوّل = أعلى) · دوس تاني في الهوا = نطة تانية', 7000);
  else if (n === 2) tutor('زرار الاندفاع جنب النطة: اندفاع أفقي سريع، بيتجدد لما تنزل على الأرض', 5000);
  else if (n === 3) tutor('اسند على الحيطان وانزلق، وانط وإنت ماسك الحيطة عشان تطلع', 5500);
  else if (n === 4) tutor('الدرع تلقائي: بيستحمل ضربة واحدة وبيتشحن عند نقطة الرجوع', 5000);
}
function play(n) { const go = () => startLevel(n); if (STORY[n] && !Save.d.seen[n]) playStory(n, go); else go(); }
function pause(on) { if (!game || !game.running || game.mode !== 'play' || game.done || game.p.state === 'win') return; game.paused = on; overlay('pause', on); }
function finish(r) {
  if (game._fin) { overlay('result', true); $('replayTag').classList.remove('on'); return; } game._fin = true;
  const L = curL, [g, s] = medals(L), medal = r.time <= g ? 3 : r.time <= s ? 2 : 1, prev = Save.d.lv[L.id], fresh = [], first = !prev;
  const rec = prev || { stars: 0, best: 1e9, deaths: 0, cr: 0, gold: 0 }; rec.stars = Math.max(rec.stars, medal); rec.best = Math.min(rec.best, r.time); rec.deaths = prev ? Math.min(prev.deaths, r.deaths) : r.deaths; rec.cr = Math.max(rec.cr, r.crystals); if (medal === 3) rec.gold = 1; Save.d.lv[L.id] = rec;
  sessionDeaths += r.deaths; const A = Save.d.ach, u = r.used, grant = k => { if (!A[k]) { A[k] = 1; fresh.push(ACH.find(x => x[0] === k)[1]); } };
  grant('first'); if (!r.deaths) grant('flawless'); if (L.id === 10) grant('employee'); if (r.crystalsTotal && r.crystals >= r.crystalsTotal) grant('hungry');
  if (!u.dash && !u.wall) grant('clean'); const ex = r.abilities.filter(a => a !== 'shield'); if (ex.length && ex.every(a => u[a] || (a === 'double_jump' && u.double_jump))) grant('pro'); if (medal === 3) grant('fast');
  if (Object.values(Save.d.lv).filter(x => x.gold).length >= 6) grant('chaser'); if (sessionDeaths >= 50) grant('echo'); if (LV.every(l => Save.d.lv[l.id])) grant('walker'); Save.save();
  $('replayTag').classList.remove('on'); overlay('result', true); $('rT').textContent = medal === 3 ? 'وصلت! 🏆' : 'وصلت!';
  $('rStars').innerHTML = [1, 2, 3].map(x => `<img class="${x <= medal ? '' : 'off'}" src="assets/img/ui/star.webp" alt="">`).join(''); [...$('rStars').children].forEach((im, i) => setTimeout(() => { im.classList.add('on'); if (i < medal) SFX.play('star', i); }, 300 + i * 300));
  $('rGrid').innerHTML = `<div>الوقت<b>${fmt(r.time)} ث</b></div><div>أحسن وقت<b>${fmt(rec.best)} ث</b></div><div>الموتات<b>${r.deaths}</b></div><div>المحاولات<b>${r.attempts}</b></div><div>البلورات<b>${r.crystals} من ${r.crystalsTotal}</b></div><div>الميدالية<b>${['', 'برونزية', 'فضية', 'ذهبية'][medal]}</b></div>`;
  $('rAch').textContent = fresh.length ? '🏅 إنجاز جديد: ' + fresh.join('، ') : ''; $('rNext').style.display = L.id < PLAYABLE ? 'block' : 'none';
}
function toMap() { game.stop(); buildMap(); show('levels'); $('sheet').classList.remove('on'); }

/* ---- input: floating analog (left half, horizontal), big JUMP (right), dash ---- */
let joyId = null, jb = { x: 0, y: 0 };
const pt = e => { const r = $('stage').getBoundingClientRect(); return [(e.clientX - r.left) / S, (e.clientY - r.top) / S]; };
$('stage').addEventListener('pointerdown', e => { if (!$('hud').classList.contains('on')) return; if (game.mode === 'replay') { game.rt = game.rdur + 1; return; } if (joyId !== null || game.paused || e.target.closest('button')) return;
  const [x, y] = pt(e); if (x > SW / 2) return; joyId = e.pointerId; jb = { x, y }; const j = $('joy'); j.style.left = x + 'px'; j.style.top = y + 'px'; j.style.display = 'block'; $('knob').style.transform = 'none'; SFX.init(); });
addEventListener('pointermove', e => { if (e.pointerId !== joyId) return; const [x, y] = pt(e), R = 50; let dx = x - jb.x; const m = clamp(dx, -R, R); $('knob').style.transform = `translate(${m}px,${clamp(y - jb.y, -R, R) * .4}px)`; game.input.x = Math.abs(m) / R < .12 ? 0 : m / R; });
const endJoy = e => { if (e.pointerId !== joyId) return; joyId = null; game.input.x = 0; $('joy').style.display = 'none'; };
addEventListener('pointerup', endJoy); addEventListener('pointercancel', endJoy);
$('bJump').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); $('bJump').setPointerCapture(e.pointerId); SFX.init(); game.pressJump(); $('bJump').classList.add('dn'); });
const rj = e => { game.releaseJump(); $('bJump').classList.remove('dn'); }; $('bJump').addEventListener('pointerup', rj); $('bJump').addEventListener('pointercancel', rj);
$('bDash').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); game.dash(); });
addEventListener('keydown', e => { if (!game || !$('hud').classList.contains('on')) return; if (e.key === 'Escape' || e.key === 'p') return pause(!game.paused); game.input.keys[e.key] = true; if (e.repeat) return;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); game.pressJump(); } else if (e.key === 'Shift' || e.key === 'k' || e.key === 'K') game.dash(); });
addEventListener('keyup', e => { if (!game) return; delete game.input.keys[e.key]; if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') game.releaseJump(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); }); addEventListener('contextmenu', e => e.preventDefault());
setInterval(() => { if (!game || !game.running || !$('hud').classList.contains('on')) return; $('hTime').textContent = fmt(game.time); $('progI').style.width = Math.min(100, game.p.x / game.lv.W * 100) + '%';
  const d = $('bDash'); d.classList.toggle('dis', game.p.dashCh <= 0 || game.p.dashCD > 0); }, 80);

/* ---- boot ---- */
async function boot() {
  Save.load(); SFX.setOn(Save.d.snd !== false);
  const [lv, st] = await Promise.all([fetch('data/levels6.json').then(r => r.json()), fetch('data/story6.json').then(r => r.json())]); LV = lv; st.forEach(s => STORY[s.level] = s);
  await loadAssets(p => $('loadbar').style.width = p * 100 + '%');
  game = new Game($('cv'), { onDeath: n => { $('hDeaths').textContent = n; const e = $('hDeath'); e.classList.remove('pop'); e.offsetWidth; e.classList.add('pop'); }, onCrystal: n => { $('hCr').textContent = n; }, onWin: finish,
    onCheckpoint: (a, b) => toast(`نقطة رجوع ${a}/${b}`, 1200), onReplay: () => $('replayTag').classList.add('on') });
  fit(); mv = new DSprite($('menuVoid'), 224); mv.set('idle', 0); $('tap').textContent = 'المس للبدء'; $('tap').className = 'rdy';
  $('splash').onpointerdown = () => { $('splash').onpointerdown = null; SFX.init(); try { const d = document.documentElement; (d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : Promise.reject()).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {}); } catch (e) {} show('menu'); resetIdle(); }; $('menuVoid').addEventListener('pointerdown', menuTap);
  $('bPlay').onclick = () => { SFX.play('click'); buildMap(); show('levels'); };
  $('bAch').onclick = () => { SFX.play('click'); $('achList').innerHTML = ACH.map(a => `<div class="ai ${Save.d.ach[a[0]] ? '' : 'lock'}"><img src="assets/img/ui/achievement_medal.webp" alt=""><div><b>${a[1]}</b><span>${a[2]}</span></div></div>`).join(''); show('ach'); };
  $('achBack').onclick = () => show('menu'); $('lvBack').onclick = () => { SFX.play('click'); show('menu'); };
  $('bSnd').onclick = () => { const on = SFX.toggle(); Save.d.snd = on; Save.save(); $('bSnd').style.opacity = on ? 1 : .4; SFX.play('click'); };
  $('shGo').onclick = () => { SFX.play('click'); $('sheet').classList.remove('on'); play(cur); };
  $('bPause').onclick = () => pause(true); $('pResume').onclick = () => pause(false); $('pRestart').onclick = () => startLevel(cur); $('pMap').onclick = toMap;
  $('rNext').onclick = () => play(cur + 1); $('rRetry').onclick = () => startLevel(cur); $('rMap').onclick = toMap;
  $('rReplay').onclick = () => { overlay('result', false); game.replayDone = false; game.startReplay(); };
  if ('serviceWorker' in navigator) { const had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) location.reload(); }); navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {}); }
}
boot();
