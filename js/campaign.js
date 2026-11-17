'use strict';
// ---------- Кампания: миссии с целями, обучением и звёздами ----------
// Миссия — обычный бой с особыми условиями: фракция игрока, карта, противники, стартовое золото, цель (разрушить цитадели или продержаться)
// и необязательные шаги обучения. Шаги проверяет main.js (он знает про кнопки), а условия шагов — здесь, на данных игры.
// Звёзды: 1 — победа; 2 — победа быстрее par секунд; 3 — быстро и без больших потерь (не больше lostMax воинов).
// Для миссий на выживание: 1 — продержались; 2 — потери не больше 2·lostMax; 3 — не больше lostMax.
const Camp = {
  mem: {}, // временные данные шагов обучения
  my: () => G.players[G.human],
  own: type => G.blds.filter(b => b.owner === G.human && !b.dead && (type === 'tower' ? BUILDINGS[b.type].tower : b.type === type)),
  army: () => G.units.filter(u => u.owner === G.human && !u.dead).length,

  // Видна ли точка на экране вне панелей (табличка сверху, панели внизу): метки обучения не должны прятаться под интерфейсом
  visible(x, y) {
    const s = window.GameDebug && GameDebug.toScreen(x, 0, y);
    const W = window.innerWidth, H = window.innerHeight, mx = Math.min(150, W * 0.12), mt = Math.min(230, H * 0.3), mb = Math.min(280, H * 0.36); // на телефоне поля меньше\n    return !s || (s.x > mx && s.x < W - mx && s.y > mt && s.y < H - mb);
  },
  // Подходящее место для здания рядом с цитаделью (шахты — в тылу, остальное — к врагу): годное и видное на экране; запоминается, пока годится
  spot(type) {
    const p = Camp.my(), cache = Camp.mem.spots || (Camp.mem.spots = {}), cur = cache[type];
    if (cur && !canPlace(p, type, cur.x, cur.y)) return cur;
    const hq = p.hq, ca = Math.atan2(WORLD.h / 2 - hq.y, WORLD.w / 2 - hq.x);
    let first = null;
    for (let d = 140; d <= 300; d += 30) for (let k = 0; k < 12; k++) {
      const a = (type === 'mine' ? ca + Math.PI : ca) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35, x = hq.x + Math.cos(a) * d, y = hq.y + Math.sin(a) * d;
      if (canPlace(p, type, x, y)) continue;
      if (Camp.visible(x, y)) return (cache[type] = { x, y });
      first = first || { x, y };
    }
    return first && (cache[type] = first);
  },
  // Метки на поле боя: main.js рисует вокруг них пульсирующие кольца и стрелки (kind: unit — стрелка над объектом, spot — «сюда», enemy — цель)
  mk: {
    units: () => G.units.filter(u => u.owner === G.human && !u.dead && !UNITS[u.type].hero).slice(0, 4).map(u => ({ kind: 'unit', x: u.x, y: u.y, r: 20, h: 28 })),
    walk() { // точка, куда стоит отправить воинов: немного вперёд от группы, к центру карты
      const us = G.units.filter(u => u.owner === G.human && !u.dead);
      if (!us.length) return [];
      if (!Camp.mem.walk) {
        const c = { x: us.reduce((s, u) => s + u.x, 0) / us.length, y: us.reduce((s, u) => s + u.y, 0) / us.length }, a0 = Math.atan2(WORLD.h / 2 - c.y, WORLD.w / 2 - c.x);
        let best = null;
        for (let k = 0; k < 12 && !best; k++) { // ближайшая к центру карты точка, которая видна вне панелей
          const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5, x = c.x + Math.cos(a) * 200, y = c.y + Math.sin(a) * 200;
          if (Camp.visible(x, y)) best = { x, y };
        }
        Camp.mem.walk = best || { x: c.x + Math.cos(a0) * 200, y: c.y + Math.sin(a0) * 200 };
      }
      return [{ kind: 'spot', x: Camp.mem.walk.x, y: Camp.mem.walk.y, r: 34 }];
    },
    spot(type, key) { const s = Camp.spot(type); return s ? [{ kind: 'spot', x: s.x, y: s.y, r: BUILDINGS[type].r, key }] : []; },
    ent(type) { const b = Camp.own(type)[0]; return b ? [{ kind: 'unit', x: b.x, y: b.y, r: b.r, h: 72 }] : []; },
    damaged() { const b = G.blds.find(q => q.owner === G.human && !q.dead && q.build >= 1 && q.hp < q.maxHp * 0.98); return b ? [{ kind: 'unit', x: b.x, y: b.y, r: b.r, h: 72 }] : []; },
    enemy() { const e = G.players.find(q => q.team !== Camp.my().team && q.alive && q.hq && !q.hq.dead); return e ? [{ kind: 'enemy', x: e.hq.x, y: e.hq.y, r: 70, h: 92 }] : []; },
  },

  M: [
    { id: 'first', title: T('Первые шаги'), faction: 'legion', map: 'snow', diff: 'easy', gold: 320, par: 540, lostMax: 8, type: 'destroy',
      bots: [{ faction: 'horde', idle: 300, wave: 8 }],
      brief: T('Враг ещё не готов к бою — у вас есть время освоиться. Научитесь двигать камеру, строить шахту и казарму, обучать воинов и вести их в атаку.'),
      goal: T('Разрушьте цитадель Орды.'),
      steps: [
        { text: T('Двигайте камеру'), icons: ['wasd', 'edge', 'wheel'], ti: ['drag', 'pinch'], edges: true,
          init() { Camp.mem.c0 = { x: UI.cam.x, y: UI.cam.y, d: UI.cam.dist }; },
          done: () => Math.hypot(UI.cam.x - Camp.mem.c0.x, UI.cam.y - Camp.mem.c0.y) > 220 || Math.abs(UI.cam.dist - Camp.mem.c0.d) > 120 },
        { text: T('Выделите воинов'), icons: ['box', 'lmb'], ti: ['tap'], at: () => Camp.mk.units(), done: () => UI.sel.some(e => e.kind === 'unit') },
        { text: T('Отправьте их в точку'), icons: ['rmb'], at: () => Camp.mk.walk(), done: () => G.units.some(u => u.owner === G.human && !u.dead && u.order && u.order.type !== 'idle') },
        { text: T('Постройте шахту'), icons: ['k:Z'], hi: '#buildBtns .btn:nth-child(1)', at: () => Camp.mk.spot('mine', 'Z'), done: () => Camp.own('mine').length > 0 },
        { text: T('Шахта строится…'), icons: ['wait'], at: () => Camp.mk.ent('mine'), done: () => Camp.own('mine').some(b => b.build >= 1) },
        { text: T('Постройте казарму'), icons: ['k:X'], hi: '#buildBtns .btn:nth-child(2)', at: () => Camp.mk.spot('barracks', 'X'), done: () => Camp.own('barracks').length > 0 },
        { text: T('Казарма строится…'), icons: ['wait'], at: () => Camp.mk.ent('barracks'), done: () => Camp.own('barracks').some(b => b.build >= 1) },
        { text: T('Обучите воинов'), icons: ['k:1', 'k:2', 'k:3'], hi: '#trainBtns .btn', at: () => Camp.mk.ent('barracks'), done: () => Camp.army() >= 6 },
        { text: T('Атакуйте цитадель врага'), icons: ['k:E', '→', 'rmb'], hiT: '#tAll', at: () => Camp.mk.enemy(), done: () => false },
      ] },
    { id: 'line', title: T('Держим рубеж'), faction: 'legion', map: 'island', diff: 'easy', gold: 320, par: 960, lostMax: 15, type: 'destroy',
      bots: [{ faction: 'horde', idle: 150, wave: 6 }],
      brief: T('Орда готовит налёт. Укрепите базу башнями, улучшите оружие и научитесь чинить здания, а потом отвечайте ударом на удар.'),
      goal: T('Разрушьте цитадель Орды.'),
      steps: [
        { text: T('Поставьте башню'), icons: ['k:C'], hi: '#buildBtns .btn:nth-child(3)', at: () => Camp.mk.spot(Camp.my().fac.tower, 'C'), done: () => Camp.own('tower').length > 0 },
        { text: T('Улучшите оружие'), icons: ['k:R'], hi: '#upBtns .up:nth-child(1)', done: () => !!Camp.my().research || Camp.my().up.atk > 0 },
        { text: T('Соберите армию: 8 воинов'), icons: ['k:Z', 'k:X', '→', 'k:1'], hi: '#trainBtns .btn', at: () => Camp.mk.ent('barracks'), done: () => Camp.army() >= 8 },
        { text: T('Почините здание'), icons: ['k:G'], hiT: '#tRepair', at: () => Camp.mk.damaged(), auto: 50, done: () => G.blds.some(b => b.owner === G.human && b.repair) },
        { text: T('Отбейте налёт и атакуйте'), icons: ['k:E', '→', 'rmb'], hiT: '#tAll', at: () => Camp.mk.enemy(), done: () => false },
      ] },
    { id: 'hero', title: T('Герой'), faction: 'legion', map: 'snow', diff: 'normal', gold: 380, par: 840, lostMax: 12, type: 'destroy',
      bots: [{ faction: 'mech', idle: 120, wave: 6 }],
      brief: T('У каждой фракции есть герой: он растёт в уровне, владеет способностью и может сам участвовать в бою. Попробуйте и особую возможность игры — вселение в воина.'),
      goal: T('Разрушьте цитадель Механистов.'),
      steps: [
        { text: T('Призовите героя'), icons: ['k:4'], hi: '#heroBox .btn', done: () => !!Camp.my().heroU || (Camp.my().hq.queue || []).some(t => UNITS[t] && UNITS[t].hero) },
        { text: T('Герой выходит…'), icons: ['wait'], done: () => !!Camp.my().heroU && !Camp.my().heroU.dead },
        { text: T('Способность героя'), icons: ['k:V'], hiT: '#tAbil', auto: 60, done: () => !!Camp.my().heroU && Camp.my().heroU.acd > 0 },
        { text: T('Вселитесь в воина'), icons: ['k:F'], hiT: '#tPoss', at: () => Camp.mk.units(), done: () => { if (G.possessed) Camp.mem.poss = true; return !!G.possessed; } },
        { text: T('Побегайте воином, затем выйдите'), icons: ['wasd', 'lmb', '→', 'k:F'], hiT: '#pExit', done: () => !G.possessed && Camp.mem.poss },
        { text: T('Атакуйте цитадель врага'), icons: ['k:E', '→', 'rmb'], hiT: '#tAll', at: () => Camp.mk.enemy(), done: () => false },
      ] },
    { id: 'canyon', title: T('Каньон'), faction: 'horde', map: 'canyon', diff: 'normal', gold: 320, par: 1000, lostMax: 20, type: 'destroy',
      bots: [{ faction: 'legion', idle: 60 }],
      brief: T('Теперь вы ведёте Орду: дешёвые бойцы и огры, ломающие стены. База Легиона стоит напротив, а между вами лабиринт скал.'),
      goal: T('Разрушьте цитадель Легиона.') },
    { id: 'frost', title: T('Ледяной перевал'), faction: 'arcane', map: 'snow', diff: 'easy', gold: 400, par: 1200, lostMax: 25, type: 'destroy',
      bots: [{ faction: 'mech', idle: 240, wave: 7 }, { faction: 'horde', idle: 420, wave: 7 }],
      brief: T('Чародеи медленные, но стойкие: големы держат строй, жрецы лечат, пироманты жгут толпы. Два врага на тесной карте — бейте их по очереди.'),
      goal: T('Разрушьте цитадели обоих противников.') },
    { id: 'dark', title: T('В глубине чащи'), faction: 'mech', map: 'forest', diff: 'normal', gold: 400, par: 1500, lostMax: 30, type: 'destroy',
      bots: [{ faction: 'legion', idle: 150 }, { faction: 'arcane', idle: 300 }],
      brief: T('Огромный лес, туман и два соперника. Механисты бьют издалека: снайперы и танки за стеной башен-мортир.'),
      goal: T('Разрушьте цитадели обоих противников.') },
    { id: 'night', title: T('Долгая ночь'), faction: 'horde', map: 'forest', diff: 'hard', gold: 450, lostMax: 40, type: 'survive', surviveT: 600,
      bots: [{ faction: 'legion', wave: 3 }, { faction: 'arcane', wave: 3 }],
      brief: T('Двое врагов с самого начала шлют отряды за отрядом. Разрушить их вам не обязательно — нужно устоять, пока не кончится ночь.'),
      goal: T('Продержитесь 10 минут.') },
    { id: 'final', title: T('Последний бой'), faction: 'mech', map: 'island', diff: 'hard', gold: 500, par: 1800, lostMax: 45, type: 'destroy',
      bots: [{ faction: 'legion' }, { faction: 'horde', idle: 120 }, { faction: 'arcane', idle: 240 }],
      brief: T('Все трое против вас. Используйте всё, чему научились: башни, улучшения, героя и вселение.'),
      goal: T('Разрушьте все вражеские цитадели.') },
  ],

  done() { const pr = Store.get('profile'); return (pr && pr.camp) || {}; },
  stars(i) { return this.done()[this.M[i].id] || 0; },
  unlocked(i) { return i === 0 || this.stars(i - 1) > 0; },
  // Настройки боя для newGame
  cfg(m) {
    return { map: m.map, diff: m.diff, human: 0, gold: m.gold, mission: m,
      players: [{ faction: m.faction, bot: false, team: 0 }, ...m.bots.map((b, i) => ({ faction: b.faction, bot: true, team: i + 1, idle: b.idle || 0, wave: b.wave || 5 }))] };
  },
  // Сколько звёзд заслужено в только что законченной победной миссии
  earned(m, time, lost) {
    if (m.type === 'survive') return 1 + (lost <= m.lostMax * 2 ? 1 : 0) + (lost <= m.lostMax ? 1 : 0);
    const fast = time <= m.par;
    return 1 + (fast ? 1 : 0) + (fast && lost <= m.lostMax ? 1 : 0);
  },
  starRules(m) {
    return m.type === 'survive'
      ? [T('Продержаться до конца'), T`Потерять не больше ${m.lostMax * 2} воинов`, T`Потерять не больше ${m.lostMax} воинов`]
      : [T('Победить'), T`Победить быстрее ${Math.floor(m.par / 60)}:${String(m.par % 60).padStart(2, '0')}`, T`…и потерять не больше ${m.lostMax} воинов`];
  },
};
