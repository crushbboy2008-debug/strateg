// ---------- Сенсорное управление (телефон и планшет, альбомная ориентация) ----------
// Мышь и клавиатура заменены жестами и кнопками на экране:
//   касание             — выбрать воина или здание; двойное касание по воину — выбрать всех таких же
//   касание земли       — приказ выбранным (по врагу — атака; у казармы — точка сбора)
//   перетаскивание      — двигать камеру; щипок двумя пальцами — масштаб
//   удержать и повести  — рамка выбора
//   постройка / прицел  — тень двигается пальцем (как тачпадом), кнопка «Построить» подтверждает
//   вселение            — слева джойстик, справа кнопки удара и способности, остальное пространство — поворот взгляда
// Код только переводит жесты в вызовы тех же функций, что и мышь; правил игры тут нет.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function initTouch(A) {
  const $ = id => document.getElementById(id);
  const cv = A.cv, pts = new Map();
  let mode = null, lp = null, pinch = null, lastTap = { t: 0, e: null }, joyId = null, jc = null, gp = { x: 0, y: 0 }; // gp — где стоит тень постройки или прицел
  const setGhost = (x, y) => { gp.x = x; gp.y = y; Input.sx = x; Input.sy = y; };
  const prevent = e => { if (e.cancelable) e.preventDefault(); };

  // ---- камера ----
  function panBy(dx, dy) { // перетащили поле на dx, dy пикселей — камера уходит в обратную сторону
    const c = UI.cam, ppu = A.pxPerUnit(c.x, c.y);
    c.x = clamp(c.x - dx / ppu, 0, WORLD.w); c.y = clamp(c.y - dy / (ppu * 0.8), 0, WORLD.h);
    A.snapCam(); // камера идёт за пальцем без отставания
  }
  function startPinch() {
    const [a, b] = [...pts.values()];
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: UI.cam.dist, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    mode = 'pinch'; clearTimeout(lp);
    if (UI.drag) UI.drag = null;
  }

  // ---- касание поля ----
  function tap(p) {
    const now = performance.now(), own = e => e.owner === G.human;
    const hit = A.pickEnt(p.x, p.y, e => own(e) && e.kind === 'unit') || A.pickEnt(p.x, p.y, own);
    if (hit) {
      if (hit.kind === 'unit' && lastTap.e === hit && now - lastTap.t < 400) { lastTap = { t: 0, e: null }; A.selectSame(hit); return; }
      lastTap = { t: now, e: hit };
      UI.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; A.finishDrag(false); // тот же выбор, что и щелчок мыши
      return;
    }
    if (UI.sel.length) { Input.sx = p.x; Input.sy = p.y; A.command(false); }
  }

  cv.addEventListener('touchstart', e => {
    prevent(e);
    if (!G.running || G.over || UI.paused) return;
    for (const t of e.changedTouches) pts.set(t.identifier, { x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now(), moved: false });
    if (G.possessed) { mode = 'look'; return; }
    if (pts.size >= 2) return startPinch();
    const p = [...pts.values()][0];
    if (UI.placing || UI.casting) { mode = 'ghost'; return; }
    mode = 'pan';
    clearTimeout(lp);
    lp = setTimeout(() => { // долгое удержание на месте — начало рамки выбора
      if (mode === 'pan' && pts.size === 1 && !p.moved) { mode = 'box'; UI.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; if (navigator.vibrate) navigator.vibrate(12); }
    }, 380);
  }, { passive: false });

  cv.addEventListener('touchmove', e => {
    prevent(e);
    for (const t of e.changedTouches) {
      const p = pts.get(t.identifier);
      if (!p) continue;
      const dx = t.clientX - p.x, dy = t.clientY - p.y;
      p.x = t.clientX; p.y = t.clientY;
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > 9) p.moved = true;
      if (mode === 'look') { Input.yaw += dx * 0.0062; Input.aim = clamp(Input.aim - dy * 0.0042, 0, 1); }
      else if (mode === 'ghost') { if (p.moved) { const [w, h] = A.size(); setGhost(clamp(gp.x + dx, 0, w), clamp(gp.y + dy, 0, h)); } }
      else if (mode === 'box') { if (UI.drag) { UI.drag.x1 = p.x; UI.drag.y1 = p.y; } }
      else if (mode === 'pan') { if (p.moved) { clearTimeout(lp); panBy(dx, dy); } }
      else if (mode === 'pinch' && pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        UI.cam.dist = clamp(pinch.z0 * pinch.d0 / d, 320, 1700);
        panBy(mx - pinch.mx, my - pinch.my); pinch.mx = mx; pinch.my = my;
      }
    }
  }, { passive: false });

  function end(e) {
    prevent(e);
    for (const t of e.changedTouches) {
      const p = pts.get(t.identifier);
      if (!p) continue;
      pts.delete(t.identifier);
      if (mode === 'box') { A.finishDrag(false); mode = null; }
      else if (mode === 'ghost') { if (!p.moved && performance.now() - p.t0 < 350) setGhost(p.x, p.y); mode = null; } // короткое касание — перенести тень в эту точку
      else if (mode === 'pan' && !p.moved) { tap(p); mode = null; }
    }
    if (!pts.size) { mode = null; pinch = null; clearTimeout(lp); }
    else if (mode === 'pinch') { mode = 'idle'; pinch = null; } // один палец остался после щипка — ждём, пока поднимут и его
  }
  cv.addEventListener('touchend', end, { passive: false });
  cv.addEventListener('touchcancel', e => { end(e); UI.drag = null; }, { passive: false });

  // ---- миникарта: касание и ведение пальцем переносит камеру ----
  const mini = $('mini');
  const miniMove = e => { prevent(e); A.miniGo(e.touches[0] || e.changedTouches[0]); };
  mini.addEventListener('touchstart', miniMove, { passive: false });
  mini.addEventListener('touchmove', miniMove, { passive: false });

  // ---- кнопки поля боя ----
  const btn = (id, fn) => { $(id).addEventListener('click', e => { e.stopPropagation(); fn(); }); };
  btn('tOk', () => { Input.sx = gp.x; Input.sy = gp.y; if (UI.placing) A.placeAt(Input.sx, Input.sy, false); else if (UI.casting) A.castAt(Input.sx, Input.sy); });
  btn('tCancel', A.cancelAll);
  btn('tAll', A.selectArmy);
  btn('tHome', A.goBase);
  btn('tAbil', () => A.castKey(false));
  btn('tPoss', () => A.possess(UI.sel.find(x => x.kind === 'unit' && !x.dead)));
  btn('tRepair', A.repairKey);

  // ---- вселение: джойстик и кнопки ----
  const joy = $('joy'), knob = $('joyK');
  function joyMove(t) {
    const dx = t.clientX - jc.x, dy = t.clientY - jc.y, l = Math.hypot(dx, dy) || 1, k = Math.min(l, jc.R * 0.62) / l, K = Input.keys, th = jc.R * 0.28;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    K.KeyW = dy < -th; K.KeyS = dy > th; K.KeyA = dx < -th; K.KeyD = dx > th;
  }
  function joyEnd() {
    joyId = null; knob.style.transform = '';
    const K = Input.keys; K.KeyW = K.KeyS = K.KeyA = K.KeyD = false;
  }
  joy.addEventListener('touchstart', e => {
    prevent(e); const t = e.changedTouches[0], r = joy.getBoundingClientRect();
    joyId = t.identifier; jc = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 }; joyMove(t);
  }, { passive: false });
  joy.addEventListener('touchmove', e => { prevent(e); for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t); }, { passive: false });
  const joyUp = e => { prevent(e); for (const t of e.changedTouches) if (t.identifier === joyId) joyEnd(); };
  joy.addEventListener('touchend', joyUp, { passive: false }); joy.addEventListener('touchcancel', joyUp, { passive: false });

  // кнопки удара и способности удерживаются, как кнопки мыши
  function hold(id, down, up) {
    const el = $(id);
    el.addEventListener('touchstart', e => { prevent(e); el.classList.add('on'); down(); }, { passive: false });
    const off = e => { prevent(e); el.classList.remove('on'); up(); };
    el.addEventListener('touchend', off, { passive: false }); el.addEventListener('touchcancel', off, { passive: false });
  }
  hold('pAtk', () => { Input.lmb = Input.lmbHit = true; }, () => { Input.lmb = false; });
  hold('pSkill', () => { Input.rmb = Input.rmbHit = true; }, () => { Input.rmb = false; });
  btn('pExit', A.unpossess);
  btn('pNext', A.possessNext);

  // ---- показ кнопок по состоянию боя (вызывается каждый кадр, DOM трогается только при смене) ----
  const cache = {};
  const show = (id, on) => { on = !!on; if (cache[id] !== on) { cache[id] = on; $(id).classList.toggle('hidden', !on); } };
  let lastGhost = false;
  function update() {
    const on = UI.touch && G.running && !G.over && !UI.paused, poss = on && !!G.possessed;
    show('tbtns', on && !poss); show('tpad', poss);
    if (!on) { if (joyId !== null) joyEnd(); return; }
    if (!poss && joyId !== null) joyEnd();
    if (poss) {
      const d = UNITS[G.possessed.type];
      show('pSkill', d.abil || d.heal);
      return;
    }
    const ghost = !!(UI.placing || UI.casting);
    if (ghost && !lastGhost) { const [w, h] = A.size(); setGhost(w / 2, h * 0.45); } // тень появляется в центре, дальше её ведёт палец
    lastGhost = ghost;
    const p = A.me(), hero = p.heroU && !p.heroU.dead, sel = UI.sel;
    const rb = sel.length === 1 && sel[0].kind === 'bld' && sel[0].build >= 1 && sel[0].hp < sel[0].maxHp;
    show('tOk', ghost); show('tCancel', ghost || sel.length);
    show('tAbil', hero); show('tPoss', sel.some(e => e.kind === 'unit' && !e.dead)); show('tRepair', rb);
    if (ghost) { const s = $('tOk').lastElementChild, t = UI.placing ? T('Построить') : T('Применить'); if (s.textContent !== t) s.textContent = t; }
  }
  return { update };
}
