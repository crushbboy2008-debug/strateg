'use strict';
// ---------- Симуляция (логика на плоскости x/y, отрисовка в 3D отдельно) ----------
const G = { running: false, time: 0, over: null, ents: [], units: [], blds: [], projs: [], fx: [], parts: [], obstacles: [], players: [], props: [], map: MAPS.island, possessed: null, human: 0, net: null, evq: [], evDepth: 0 };

function rand(a, b) { return a + Math.random() * (b - a); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function edgeDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r; }
function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d); }

function blankInput() { return { keys: {}, yaw: 0, aim: 0.7, lmb: false, rmb: false }; }
// c — { faction, bot, team }. inp — откуда читается управление вселённым воином (у местного игрока — общий Input)
function mkPlayer(i, c) {
  return { idx: i, faction: c.faction, fac: FACTIONS[c.faction], bot: !!c.bot, team: c.team, gold: START_GOLD, alive: true, income: 0, alarm: null, ai: { t: rand(0, 1), wave: 5 },
    up: { atk: 0, arm: 0, eco: 0 }, research: null, heroLvl: 1, heroXp: 0, heroU: null, heroDeaths: 0, lost: 0, bl: 0, autoCast: true, poss: null, inp: i === G.human ? Input : blankInput(), nq: [] };
}
// Сообщение игроку: местному — сразу на экран, удалённому — уйдёт по сети
function note(p, text) { if (p.idx === G.human) G.notes.push(text); else if (G.net === 'host' && !p.bot) p.nq.push(text); }

// cfg — { map, diff, players: [{ faction, bot, team }], human, coop, net }
function newGame(cfg) {
  Object.assign(G, { running: true, time: 0, over: null, ents: [], units: [], blds: [], projs: [], fx: [], parts: [], obstacles: [], players: [], props: [],
    map: MAPS[cfg.map] || MAPS.island, possessed: null, nextId: 1, diff: DIFF[cfg.diff] || DIFF.normal, human: cfg.human || 0, dirty: false, shakes: [], notes: [], heroHit: -9,
    net: cfg.net || null, evq: [], evDepth: 0, winTeam: undefined, possessLost: false, seed: [Math.random() * 100, Math.random() * 100] });
  const map = G.map;
  WORLD.w = WORLD.h = map.size;
  const m = 480, W = WORLD.w, H = WORLD.h;
  const spots = map.lay === 'cross' ? [[W / 2, H - m], [W / 2, m], [m, H / 2], [W - m, H / 2]] : [[m, H - m], [W - m, m], [m, m], [W - m, H - m]];
  const order = cfg.coop ? [0, 2, 3, 1] : [0, 1, 2, 3]; // в совместной игре союзники стоят на одной стороне карты
  cfg.players.forEach((c, i) => {
    const p = mkPlayer(i, c);
    G.players.push(p);
    const [x, y] = spots[order[i]];
    p.hq = spawnBuilding(i, 'hq', x, y, true);
    const a = Math.atan2(H / 2 - y, W / 2 - x);
    for (let k = 0; k < 3; k++) {
      const u = spawnUnit(i, p.fac.units[0], x + Math.cos(a + (k - 1) * 0.5) * 95, y + Math.sin(a + (k - 1) * 0.5) * 95);
      u.face = a;
    }
    baseDecor(p, x, y, a);
  });
  let tries = 0;
  while (G.obstacles.length < map.obst && tries++ < 9000) {
    const o = { x: rand(80, W - 80), y: rand(80, H - 80), r: rand(22, 44), tree: Math.random() < map.treeP, seed: Math.random() };
    if (o.tree) o.kind = map.trees[Math.floor(Math.random() * map.trees.length)]; else { o.kind = 'rock'; o.r *= map.rockMul || 1; }
    if (spots.some(s => Math.hypot(o.x - s[0], o.y - s[1]) < 540)) continue;
    if (G.obstacles.some(q => dist(o, q) < o.r + q.r + (map.gap || 90))) continue;
    G.obstacles.push(o);
  }
}

// Убранство базы: площадь под цитаделью, столбы по кругу, пара у ворот и разбросанная утварь.
// Это не здания: воины их обходят, а при постройке здания на этом месте они убираются.
function baseDecor(p, x, y, a) {
  const add = (kind, px, py, r, face) => G.props.push({ id: G.nextId++, kind: 'prop', type: kind, fac: p.faction, owner: p.idx, x: px, y: py, r, face, dead: false, fire: 0 });
  add('plaza', x, y, 0, Math.PI / 2);
  for (let k = 0; k < 4; k++) { const b = a + Math.PI / 4 + k * Math.PI / 2; add('post', x + Math.cos(b) * 73, y + Math.sin(b) * 73, 3, b); }
  for (const s of [-1, 1]) add('gate', x + Math.cos(a + s * 0.42) * 185, y + Math.sin(a + s * 0.42) * 185, 8, a);
  for (let k = 0; k < 11; k++) { const b = a + (k + 0.5) / 11 * TAU; if (angDiff(b, a) > 0.4) add('post', x + Math.cos(b) * 335, y + Math.sin(b) * 335, 3, b); }
  const kinds = ['a', 'b', 'c'], rr = { a: 13, b: 8, c: 9 };
  let n = 0, tries = 0;
  while (n < 13 && tries++ < 400) {
    const b = rand(0, TAU), d = rand(125, 300), px = x + Math.cos(b) * d, py = y + Math.sin(b) * d;
    if (angDiff(b, a) < 0.4 || px < 50 || py < 50 || px > WORLD.w - 50 || py > WORLD.h - 50) continue;
    if (G.props.some(q => q.owner === p.idx && Math.hypot(q.x - px, q.y - py) < 52)) continue;
    add(kinds[n % 3], px, py, rr[kinds[n % 3]], rand(0, TAU)); n++;
  }
}

function spawnUnit(owner, type, x, y) {
  const d = UNITS[type], hp = unitMaxHp(G.players[owner], type);
  const u = { id: G.nextId++, kind: 'unit', type, owner, team: G.players[owner].team, x, y, r: d.r, hp, maxHp: hp, acd: 0, stun: 0, dead: false, face: 0, cd: rand(0, 0.3), scan: rand(0, 0.3),
    order: { type: 'idle' }, tgt: null, healTgt: null, chargeT: 0, swing: 0, flash: 0, moving: false, arrT: 0, wave: false,
    side: Math.random() < 0.5 ? 1 : -1, gx: x, gy: y, fly: !!d.fly };
  G.ents.push(u);
  return u;
}

function spawnBuilding(owner, type, x, y, instant) {
  const d = BUILDINGS[type];
  const b = { id: G.nextId++, kind: 'bld', type, owner, team: G.players[owner].team, x, y, r: d.r, maxHp: d.hp, hp: instant ? d.hp : d.hp * 0.1, build: instant ? 1 : 0,
    dead: false, cd: 0, flash: 0, queue: [], trainT: 0, aim: 0, fire: 0, smokeT: 0, repair: false, hitT: -9 };
  for (const q of G.props) if (q.r && !q.dead && Math.hypot(q.x - x, q.y - y) < d.r + q.r + 8) { q.dead = true; dust(q.x, q.y, 3, 8); }
  const a = Math.atan2(WORLD.h / 2 - y, WORLD.w / 2 - x);
  b.rally = { x: x + Math.cos(a) * (d.r + 80), y: y + Math.sin(a) * (d.r + 80) };
  G.ents.push(b);
  return b;
}

function countB(p, type) { let n = 0; for (const e of G.ents) if (e.kind === 'bld' && e.owner === p.idx && !e.dead && e.type === type) n++; return n; }
function buildCost(p, type) { return type === 'mine' ? BUILDINGS.mine.cost + 40 * countB(p, 'mine') : BUILDINGS[type].cost; }
function popOf(p) {
  let n = 0;
  for (const e of G.ents) { if (e.owner !== p.idx || e.dead) continue; if (e.kind === 'unit') n++; else n += e.queue.length; }
  return n;
}

// Возвращает '' если можно строить, иначе причину
function canPlace(p, type, x, y) {
  const r = BUILDINGS[type].r;
  if (x < r + 30 || y < r + 30 || x > WORLD.w - r - 30 || y > WORLD.h - r - 30) return 'За границей карты';
  let near = false;
  for (const e of G.ents) {
    if (e.kind !== 'bld' || e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < e.r + r + 34) return 'Слишком близко к другому зданию';
    if (e.owner === p.idx && e.build >= 1 && d < BUILD_RADIUS + e.r) near = true;
  }
  for (const o of G.obstacles) if (Math.hypot(o.x - x, o.y - y) < o.r + r + 12) return 'Мешает препятствие';
  if (!near) return 'Стройте рядом со своими зданиями';
  if (type === 'mine' && countB(p, 'mine') >= MAX_MINES) return 'Максимум шахт: ' + MAX_MINES;
  return '';
}

function tryBuild(p, type, x, y) {
  const cost = buildCost(p, type);
  if (p.gold < cost) return 'Недостаточно золота';
  const why = canPlace(p, type, x, y);
  if (why) return why;
  p.gold -= cost;
  spawnBuilding(p.idx, type, x, y, false);
  Sfx.play('build', x, y);
  return '';
}

function queueUnit(p, slot, b) {
  const type = p.fac.units[slot], d = UNITS[type];
  if (!b || b.dead || b.type !== 'barracks' || b.build < 1) {
    b = null;
    for (const e of G.ents) if (e.kind === 'bld' && e.owner === p.idx && !e.dead && e.type === 'barracks' && e.build >= 1 && (!b || e.queue.length < b.queue.length)) b = e;
  }
  if (!b) return 'Сначала постройте казарму';
  if (b.queue.length >= 6) return 'Очередь заполнена';
  if (popOf(p) >= POP_CAP) return 'Достигнут лимит войск';
  if (p.gold < d.cost) return 'Недостаточно золота';
  p.gold -= d.cost;
  b.queue.push(type);
  return '';
}

// ---------- Починка зданий ----------
function repairCost(b) { return Math.ceil((1 - b.hp / b.maxHp) * (BUILDINGS[b.type].cost || 700) * REPAIR_COST); }
function setRepair(p, b, on) {
  if (!b || b.dead || b.kind !== 'bld' || b.owner !== p.idx) return 'Выберите своё здание';
  if (b.build < 1) return 'Здание ещё строится';
  if (on === undefined) on = !b.repair;
  if (on && b.hp >= b.maxHp) return 'Здание целое';
  if (on && p.gold < 5) return 'Недостаточно золота';
  b.repair = on;
  return '';
}

// ---------- Улучшения и герои ----------
function unitMaxHp(p, type) { const d = UNITS[type]; return Math.round(d.hp * (1 + 0.15 * p.up.arm) * (d.hero ? 1 + 0.18 * (p.heroLvl - 1) : 1)); }
function dmgMul(u) { const p = G.players[u.owner]; return (1 + 0.15 * p.up.atk) * (UNITS[u.type].hero ? 1 + 0.14 * (p.heroLvl - 1) : 1); }
function rescaleHp(p) { // после улучшения брони или нового уровня героя: запас здоровья растёт, доля сохраняется
  for (const e of G.ents) if (e.kind === 'unit' && e.owner === p.idx && !e.dead) { const m = unitMaxHp(p, e.type); e.hp = e.hp / e.maxHp * m; e.maxHp = m; }
}
function upCost(p, key) { return UPGRADES[key].cost[p.up[key]]; }
function startResearch(p, key) {
  const d = UPGRADES[key], lvl = p.up[key];
  if (p.research) return p.research.key === key ? 'Уже исследуется' : 'Сначала дождитесь конца исследования';
  if (lvl >= d.cost.length) return 'Максимальный уровень';
  if (p.gold < d.cost[lvl]) return 'Недостаточно золота';
  p.gold -= d.cost[lvl];
  p.research = { key, t: 0, time: d.time[lvl] };
  return '';
}
function updateResearch(p, dt) {
  const r = p.research;
  if (!r) return;
  r.t += dt;
  if (r.t < r.time) return;
  p.research = null; p.up[r.key]++;
  if (r.key === 'arm') rescaleHp(p);
  addFx({ type: 'shock', x: p.hq.x, y: p.hq.y, r: p.hq.r * 2.2, life: 0.6, color: '#ffe9a8' }); magic(p.hq.x, p.hq.y, 50, 14, '#ffe9a8');
  note(p, 'Улучшение «' + UPGRADES[r.key].name + '» — уровень ' + p.up[r.key]); if (p.idx === G.human) Sfx.play('ready');
}

function heroNeed(lvl) { return 110 * lvl; }
function heroCost(p) { return p.heroDeaths ? 150 + 50 * p.heroLvl : UNITS[p.fac.hero].cost; }
function queueHero(p) {
  const hq = p.hq;
  if (p.heroU && !p.heroU.dead) return 'Герой уже в строю';
  if (hq.queue.length) return 'Герой уже в пути';
  if (popOf(p) >= POP_CAP) return 'Достигнут лимит войск';
  if (p.gold < heroCost(p)) return 'Недостаточно золота';
  p.gold -= heroCost(p);
  hq.queue.push(p.fac.hero);
  return '';
}
function gainXp(h, amt) {
  const p = G.players[h.owner];
  if (p.heroLvl >= HERO_MAX) return;
  p.heroXp += amt;
  while (p.heroLvl < HERO_MAX && p.heroXp >= heroNeed(p.heroLvl)) {
    p.heroXp -= heroNeed(p.heroLvl); p.heroLvl++;
    rescaleHp(p);
    h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.35);
    addFx({ type: 'shock', x: h.x, y: h.y, r: 70, life: 0.6, color: '#ffe066' }); addFx({ type: 'ring', x: h.x, y: h.y, r: h.r + 20, life: 0.8, color: '#ffe066' });
    magic(h.x, h.y, 14, 18, '#ffe066'); addFx({ type: 'flash', x: h.x, y: h.y, h: 30, color: '#ffe066', power: 1, life: 0.35 });
    note(p, UNITS[h.type].name + ' — уровень ' + p.heroLvl); if (p.idx === G.human) Sfx.play('ready');
  }
  if (p.heroLvl >= HERO_MAX) p.heroXp = 0;
}

// Способность героя; tx, ty — точка применения (для метеора и ракет)
function castAbility(u, d, tx, ty) {
  const a = d.abil, p = G.players[u.owner], k = 1 + 0.15 * (p.heroLvl - 1);
  u.acd = a.cd; u.swing = 0.25;
  if (a.key === 'light') {
    for (const o of G.ents) {
      if (o.dead) continue;
      const dd = Math.hypot(o.x - u.x, o.y - u.y) - o.r;
      if (o.team === u.team) {
        if (o.kind === 'unit' && dd <= a.r && o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + a.heal * k); magic(o.x, o.y, 10, 6, '#ffe9a0'); addFx({ type: 'ring', x: o.x, y: o.y, r: o.r + 10, life: 0.4, color: '#ffe9a0' }); }
      } else if (dd <= a.r * 0.65) { damage(o, a.dmg * k, u, 1, false); sparks(o.x, o.y, 14, 4, '#fff2b0', 0.7); }
    }
    addFx({ type: 'shock', x: u.x, y: u.y, r: a.r, life: 0.5, color: '#fff2b0' }); addFx({ type: 'flash', x: u.x, y: u.y, h: 40, color: '#ffe9a0', power: 1.6, life: 0.4 });
    magic(u.x, u.y, 20, 20, '#fff2b0'); Sfx.play('heal', u.x, u.y);
  } else if (a.key === 'stomp') {
    for (const o of G.ents) if (o.team !== u.team && !o.dead && o.kind === 'unit' && edgeDist(u, o) <= a.r) o.stun = a.stun;
    splashDamage(u.x, u.y, a.r + u.r, a.dmg * k, u, u.owner, 1.5, false);
    dust(u.x, u.y, 16, 14); burst(u.x, u.y, 14, '#6b5a44', 1.8); addFx({ type: 'scorch', x: u.x, y: u.y, r: a.r * 0.6, life: 10 }); shake(u.x, u.y, 8);
  } else if (a.key === 'meteor') {
    G.projs.push({ fall: true, T: 0.9, t: 0.9, x: tx + 150, y: ty, gx: tx, gy: ty, h: 520, ang: 0, dmg: a.dmg * k, splash: a.r, src: u, owner: u.owner, kind: 'meteor', bm: 1.5, trail: 0 });
    addFx({ type: 'ring', x: tx, y: ty, r: a.r, life: 0.9, color: '#ff7a2a' }); addFx({ type: 'ping', x: tx, y: ty, r: a.r, life: 0.9, color: '#ff7a2a' });
    magic(u.x, u.y, 24, 12, '#ffb060'); Sfx.play('zap', u.x, u.y);
  } else if (a.key === 'rockets') {
    for (let i = 0; i < a.n; i++) {
      const ang = rand(0, TAU), rr = Math.sqrt(Math.random()) * a.spread;
      fireGround(u, { proj: rand(230, 330), pk: 'shell', splash: a.r, bm: 1.5 }, tx + Math.cos(ang) * rr, ty + Math.sin(ang) * rr, a.dmg * k, true);
    }
  }
}
// Дальность применения способности при вселении: aim 0..1 задаётся колесом мыши или наклоном взгляда
function abilDist(u, d, aim) { const a = d.abil; return a.range ? u.r + 50 + (a.range - 50) * aim : 0; }
// Решает, стоит ли герою под управлением ИИ применить способность сейчас
function heroAuto(u, d) {
  const a = d.abil;
  if (a.key === 'light') {
    let hurt = u.hp < u.maxHp * 0.5 ? 2 : 0;
    for (const o of G.units) if (o.team === u.team && !o.dead && o !== u && o.hp < o.maxHp * 0.65 && dist(u, o) <= a.r) hurt++;
    if (hurt < 2) return;
    castAbility(u, d, u.x, u.y);
  } else if (a.key === 'stomp') {
    let n = 0;
    for (const o of G.units) if (o.team !== u.team && !o.dead && edgeDist(u, o) <= a.r * 0.8) n += UNITS[o.type].hero ? 2 : 1;
    if (n >= 2 || (n && u.hp < u.maxHp * 0.5)) castAbility(u, d, u.x, u.y);
  } else {
    const t = u.tgt;
    if (!t || t.dead || edgeDist(u, t) > a.range) return;
    let n = t.kind === 'bld' || UNITS[t.type].hero ? 2 : 0;
    for (const o of G.units) if (o.team !== u.team && !o.dead && dist(o, t) <= a.r + 30) n++;
    if (n >= 2) castAbility(u, d, t.x, t.y);
  }
}

// ---------- Эффекты (только визуал: частицы, вспышки, тряска — на бой не влияют) ----------
function addFx(o) { o.max = o.life; G.fx.push(o); }
// add: 1 — светящаяся частица; grav < 0 — всплывает; grow — рост размера в секунду; drag — торможение
function part(x, y, h, vx, vy, vh, life, color, size, add, grav, grow, drag) {
  if (G.parts.length > 1400) return;
  G.parts.push({ x, y, h, vx, vy, vh, life, max: life, color, size, add: add || 0, grav: grav || 0, grow: grow || 0, drag: drag || 0 });
}
function burst(x, y, n, color, power, h) { // осколки
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(20, 90) * power; part(x, y, h || 12, Math.cos(a) * s, Math.sin(a) * s, rand(40, 140) * power, rand(0.4, 0.9), color, rand(3, 5.5), 0, 330); }
}
function sparks(x, y, h, n, color, power) {
  const p = power || 1;
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(50, 200) * p; part(x, y, h, Math.cos(a) * s, Math.sin(a) * s, rand(20, 180) * p, rand(0.2, 0.5), color, rand(1.4, 2.8), 1, 420); }
}
function smoke(x, y, h, n, size, color, spread) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(0, spread || 20);
    part(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3, h, Math.cos(a) * s, Math.sin(a) * s, rand(18, 50), rand(0.9, 1.9), color || '#4e4b47', size * rand(0.7, 1.2), 0, -8, size * 0.9, 1.5);
  }
}
function flame(x, y, h, n, size, spread) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(0, spread || 30);
    part(x, y, h, Math.cos(a) * s, Math.sin(a) * s, rand(20, 80), rand(0.25, 0.6), i % 3 ? '#ff8a1e' : '#ffd24a', size * rand(0.6, 1.1), 1, -30, size * 0.8, 2);
  }
}
function dust(x, y, n, size) { smoke(x, y, 3, n, size || 9, '#b79f78', 45); }
function magic(x, y, h, n, color) {
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(5, 40); part(x + Math.cos(a) * 8, y + Math.sin(a) * 8, h, Math.cos(a) * s, Math.sin(a) * s, rand(20, 70), rand(0.4, 0.9), color, rand(3, 6), 1, -20, 0, 1); }
}
function shake(x, y, amp) { G.shakes.push({ x, y, amp }); }
function explode(x, y, r, big) {
  flame(x, y, 8, big ? 22 : 10, r * 0.5, r * 2.2);
  smoke(x, y, 14, big ? 10 : 3, r * 0.42, '#6b6762', r * 0.9);
  sparks(x, y, 10, big ? 18 : 8, '#ffd27a', 1.2);
  burst(x, y, big ? 22 : 7, '#3a3632', big ? 2 : 1.3);
  addFx({ type: 'boom', x, y, r: r * 0.9, life: 0.3, color: '#ffb347' });
  addFx({ type: 'shock', x, y, r: r * 1.6, life: 0.4, color: '#fff1d0' });
  addFx({ type: 'flash', x, y, h: 30, color: '#ffa040', power: big ? 1.6 : 1, life: 0.3 });
  if (big || !G.fx.some(f => f.type === 'scorch' && Math.hypot(f.x - x, f.y - y) < r * 0.7)) addFx({ type: 'scorch', x, y, r: r * 1.1, life: big ? 30 : 12 });
  shake(x, y, big ? 9 : 3.5);
  Sfx.play('boom', x, y);
}
function muzzle(src, def, ang) {
  const k = def.pk, mx = src.x + Math.cos(ang) * (src.r + 8), my = src.y + Math.sin(ang) * (src.r + 8), h = src.kind === 'bld' ? 40 : (src.fly ? 24 : 16);
  if (k === 'shell') { flame(mx, my, h, 5, 9, 60); smoke(mx, my, h, 3, 10, '#6a6660', 25); addFx({ type: 'flash', x: mx, y: my, h, color: '#ffb060', power: 0.7, life: 0.15 }); shake(mx, my, 1.5); }
  else if (k === 'bullet' || k === 'tracer') sparks(mx, my, h, 3, '#ffe9a8', 0.5);
  else if (k === 'fire') flame(mx, my, h, 3, 6, 25);
  else if (k === 'spark') magic(mx, my, h, 3, '#fff2a0');
  else if (k === 'arcane') magic(mx, my, h, 4, '#9fd8ff');
}
function impactFx(kind, x, y) {
  if (kind === 'bullet' || kind === 'tracer') sparks(x, y, 14, 5, '#ffe9a8', 0.7);
  else if (kind === 'spark') magic(x, y, 14, 6, '#fff2a0');
  else if (kind === 'arcane') { magic(x, y, 14, 9, '#9fd8ff'); sparks(x, y, 14, 5, '#d8f0ff', 0.8); addFx({ type: 'flash', x, y, h: 20, color: '#7fc8ff', power: 0.6, life: 0.18 }); }
  else { sparks(x, y, 14, 3, '#ffffff', 0.5); burst(x, y, 2, '#c9b48a', 0.6); }
}
function meleeFx(u, t) {
  const a = Math.atan2(t.y - u.y, t.x - u.x), d = Math.min(u.r + 12, Math.hypot(t.x - u.x, t.y - u.y));
  const x = u.x + Math.cos(a) * d, y = u.y + Math.sin(a) * d;
  addFx({ type: 'slash', x: u.x, y: u.y, h: u.r * 1.3, ang: a, r: u.r + 12, life: 0.16 });
  sparks(x, y, u.r * 1.3, 3, t.kind === 'bld' ? '#ffd9a0' : '#ffffff', 0.5);
  if (t.kind === 'bld') burst(x, y, 2, '#9a9a94', 0.7);
}

// ---------- Урон ----------
function damage(t, amt, src, bm, ranged) {
  if (t.dead) return;
  if (t.kind === 'bld') {
    amt *= bm || 1;
    G.players[t.owner].alarm = { x: t.x, y: t.y, t: G.time };
    t.hitT = G.time;
  } else {
    if (ranged && UNITS[t.type].armorR) amt *= UNITS[t.type].armorR;
    if (t.ctl) { amt *= 0.7; if (t === G.possessed) { G.heroHit = G.time; shake(t.x, t.y, 2.5); } }
    else if (src && !src.dead && !t.tgt && t.order.type !== 'move' && src.team !== t.team) t.tgt = src;
  }
  if (src && src.ctl) { amt *= 1.5; addFx({ type: 'num', x: t.x, y: t.y, h: t.r * 2.4, text: Math.round(amt), life: 0.8, pid: src.owner }); }
  t.hp -= amt;
  t.flash = 0.12;
  if (t.hp <= 0) kill(t);
}

function splashDamage(x, y, rad, dmg, src, owner, bm, ranged) {
  for (const o of G.ents) {
    if (o.team === G.players[owner].team || o.dead) continue;
    if (Math.hypot(o.x - x, o.y - y) - o.r <= rad) damage(o, dmg, src, bm, ranged);
  }
  if (ranged) explode(x, y, rad, false);
  else {
    dust(x, y, 10, rad * 0.35); burst(x, y, 6, '#7a6a52', 1.1);
    addFx({ type: 'shock', x, y, r: rad * 1.5, life: 0.35, color: '#f4e6c0' });
    shake(x, y, 3); Sfx.play('boom', x, y);
  }
}

function kill(e) {
  if (e.dead) return;
  e.dead = true; G.dirty = true;
  const op = G.players[e.owner];
  if (e.kind === 'unit') op.lost++; else op.bl++;
  const col = G.players[e.owner].fac.color;
  const xp = e.kind === 'bld' ? (e.type === 'hq' ? 100 : 25) : UNITS[e.type].hero ? 120 : 10 + UNITS[e.type].cost * 0.2;
  for (const q of G.players) { const h = q.heroU; if (h && !h.dead && q.team !== op.team && Math.hypot(h.x - e.x, h.y - e.y) < 340) gainXp(h, xp); }
  if (e.kind === 'unit' && UNITS[e.type].hero) {
    const p = G.players[e.owner];
    p.heroU = null; p.heroDeaths++;
    addFx({ type: 'shock', x: e.x, y: e.y, r: 80, life: 0.6, color: col }); magic(e.x, e.y, 16, 16, col);
    if (p.alive) note(p, 'Герой пал. Его можно возродить в цитадели');
  }
  if (op.poss === e) { op.poss = null; if (e === G.possessed) { G.possessed = null; G.possessLost = true; } }
  if (e.kind === 'bld') {
    explode(e.x, e.y, e.r * 1.5, true);
    burst(e.x, e.y, 24, col, 2.2, 30); smoke(e.x, e.y, 30, 8, e.r * 0.7, '#5a5651', e.r);
    if (e.type === 'hq') eliminate(G.players[e.owner]);
  } else if (e.type === 'tank' || e.type === 'drone' || e.type === 'commander') explode(e.x, e.y, e.r * 1.1, false);
  else if (e.type === 'golem') { burst(e.x, e.y, 14, '#8d8a86', 1.5); magic(e.x, e.y, 16, 8, col); dust(e.x, e.y, 5, 10); }
  else { burst(e.x, e.y, 7, col, 1.1); dust(e.x, e.y, 4, 7); }
}

function eliminate(p) {
  if (!p.alive) return;
  p.alive = false;
  for (const e of G.ents) if (e.owner === p.idx && !e.dead) kill(e);
  // Партия кончается, когда осталась одна команда. В сетевой игре выбывший остаётся наблюдать.
  const teams = new Set(G.players.filter(q => q.alive).map(q => q.team)), my = G.players[G.human];
  if (teams.size <= 1) { G.winTeam = teams.size ? [...teams][0] : -1; G.over = G.winTeam === my.team ? 'victory' : 'defeat'; }
  else if (!G.net && p.idx === G.human) G.over = 'defeat';
  else if (G.net && !p.bot) note(p, 'Ваша цитадель пала. Вы наблюдаете за боем');
}

// ---------- Поиск целей ----------
function findTarget(e, range, minRange, siege) {
  let best = null, bd = Infinity;
  for (const o of G.ents) {
    if (o.team === e.team || o.dead) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y) - o.r - e.r;
    if (d > range || (minRange && d < minRange)) continue;
    const s = d + (o.kind === 'bld' && !siege ? 60 : 0);
    if (s < bd) { bd = s; best = o; }
  }
  return best;
}

function findWounded(u, range) {
  let best = null, bf = 0.95;
  for (const o of G.units) {
    if (o.team !== u.team || o.dead || o === u) continue;
    const f = o.hp / o.maxHp;
    if (f < bf && edgeDist(u, o) <= range) { bf = f; best = o; }
  }
  return best;
}

// ---------- Снаряды ----------
function fireAt(src, def, target, dmg) {
  G.projs.push({ x: src.x, y: src.y, x0: src.x, y0: src.y, speed: def.proj, dmg, splash: def.splash || 0, src, owner: src.owner, kind: def.pk, bm: def.bm || 1,
    target, gx: target.x, gy: target.y, ang: 0, lob: def.atk === 'lob', h0: src.kind === 'bld' ? 40 : 14, h: 16, trail: 0 });
  muzzle(src, def, Math.atan2(target.y - src.y, target.x - src.x));
  Sfx.play('shot', src.x, src.y);
}
function fireGround(src, def, gx, gy, dmg, lob) {
  G.projs.push({ x: src.x, y: src.y, x0: src.x, y0: src.y, speed: def.proj, dmg, splash: def.splash || 0, src, owner: src.owner, kind: def.pk, bm: def.bm || 1,
    target: null, gx, gy, ang: 0, lob, h0: src.kind === 'bld' ? 40 : 14, h: 16, trail: 0 });
  muzzle(src, def, Math.atan2(gy - src.y, gx - src.x));
  Sfx.play('shot', src.x, src.y);
}
function fireDir(src, def, ang, dmg) {
  G.projs.push({ x: src.x, y: src.y, speed: def.proj, dmg, splash: 0, src, owner: src.owner, kind: def.pk, bm: def.bm || 1,
    dir: true, vx: Math.cos(ang) * def.proj, vy: Math.sin(ang) * def.proj, life: (def.range + 60) / def.proj, ang, h0: 14, h: 16, trail: 0 });
  muzzle(src, def, ang);
  Sfx.play('shot', src.x, src.y);
}

// След снаряда: чисто визуальный, по сети не передаётся — каждый клиент рисует его сам
function projTrail(p, dt) {
  p.trail = (p.trail || 0) - dt;
  if (p.trail > 0) return;
  p.trail = 0.035;
  G.evDepth++;
  if (p.kind === 'fire') flame(p.x, p.y, p.h, 1, 6, 8);
  else if (p.kind === 'shell') smoke(p.x, p.y, p.h, 1, p.lob ? 7 : 4, '#8a8782', 4);
  else if (p.kind === 'spark') magic(p.x, p.y, p.h, 1, '#fff2a0');
  else if (p.kind === 'arcane') magic(p.x, p.y, p.h, 1, '#9fd8ff');
  else if (p.kind === 'meteor') { flame(p.x, p.y, p.h, 3, 13, 14); smoke(p.x, p.y, p.h + 8, 1, 10, '#5a5651', 6); }
  G.evDepth--;
}

function updateProjs(dt) {
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i];
    let done = false;
    if (p.fall) { // метеор: падает с неба в заранее отмеченную точку
      p.t -= dt;
      const k = Math.max(0, p.t / p.T);
      p.x = p.gx + k * 150; p.y = p.gy; p.h = 10 + k * 510;
      if (p.t <= 0) {
        splashDamage(p.gx, p.gy, p.splash, p.dmg, p.src, p.owner, p.bm, true);
        flame(p.gx, p.gy, 10, 20, p.splash * 0.5, p.splash * 2); burst(p.gx, p.gy, 18, '#3a3632', 2); smoke(p.gx, p.gy, 20, 6, p.splash * 0.4, '#5a5651', p.splash * 0.8);
        addFx({ type: 'scorch', x: p.gx, y: p.gy, r: p.splash * 1.2, life: 30 }); shake(p.gx, p.gy, 10);
        done = true;
      }
    } else if (p.dir) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      for (const o of G.ents) {
        if (o.team === G.players[p.owner].team || o.dead) continue;
        if (Math.hypot(o.x - p.x, o.y - p.y) < o.r + 6) { damage(o, p.dmg, p.src, p.bm, true); impactFx(p.kind, p.x, p.y); done = true; break; }
      }
      if (p.life <= 0) done = true;
    } else {
      if (p.target) { if (p.target.dead) p.target = null; else { p.gx = p.target.x; p.gy = p.target.y; } }
      const dx = p.gx - p.x, dy = p.gy - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= step + (p.target ? p.target.r : 0)) {
        if (p.splash) splashDamage(p.gx, p.gy, p.splash, p.dmg, p.src, p.owner, p.bm, true);
        else if (p.target) { damage(p.target, p.dmg, p.src, p.bm, true); impactFx(p.kind, p.gx, p.gy); }
        done = true;
      } else { p.x += dx / d * step; p.y += dy / d * step; }
      const total = Math.hypot(p.gx - p.x0, p.gy - p.y0) || 1, k = Math.min(1, Math.max(0, 1 - Math.hypot(p.gx - p.x, p.gy - p.y) / total));
      p.h = p.h0 + (14 - p.h0) * k + (p.lob ? Math.sin(k * Math.PI) * Math.min(220, total * 0.45) : 0);
    }
    if (!done) projTrail(p, dt);
    if (done) G.projs.splice(i, 1);
  }
}

// ---------- Воины ----------
function attackStats(u, d) {
  let dmg = d.dmg * dmgMul(u);
  if (d.charge && u.chargeT >= 1.2) { dmg *= 2.5; addFx({ type: 'shock', x: u.x, y: u.y, r: 46, life: 0.3, color: '#ffffff' }); dust(u.x, u.y, 5, 8); shake(u.x, u.y, 2); }
  u.chargeT = 0;
  u.cd = d.cd * (d.rage ? 0.45 + 0.55 * u.hp / u.maxHp : 1);
  u.swing = 0.25;
  return dmg;
}

function doAttack(u, d, t) {
  const dmg = attackStats(u, d);
  if (d.proj) fireAt(u, d, t, dmg);
  else if (d.splash) splashDamage(t.x, t.y, d.splash, dmg, u, u.owner, d.bm, false);
  else { meleeFx(u, t); damage(t, dmg, u, d.bm, false); Sfx.play('hit', u.x, u.y); }
}

function doHeal(u, d, t) {
  u.cd = d.cd; u.swing = 0.25;
  t.hp = Math.min(t.maxHp, t.hp + d.heal * (u.ctl ? 1.5 : 1));
  addFx({ type: 'beam', x1: u.x, y1: u.y, x2: t.x, y2: t.y, color: '#6ee7a0', life: 0.25 });
  magic(t.x, t.y, 10, 7, '#7dffb0'); addFx({ type: 'ring', x: t.x, y: t.y, r: t.r + 12, life: 0.4, color: '#7dffb0' });
  Sfx.play('heal', u.x, u.y);
}

function stepTo(u, d, x, y, dt) {
  const dx = x - u.x, dy = y - u.y, l = Math.hypot(dx, dy);
  if (l < 0.5) return;
  const s = Math.min(l, d.speed * dt);
  u.x += dx / l * s; u.y += dy / l * s;
  u.face = Math.atan2(dy, dx);
  u.moving = true; u.chargeT += dt; u.gx = x; u.gy = y;
  if ((d.r >= 16 || d.charge) && !d.fly && Math.random() < dt * 5) dust(u.x, u.y, 1, 7);
}

function controlPossessed(u, d, dt, Input) { // Input — управление того игрока, который вселился
  const k = Input.keys;
  u.face = Input.yaw;
  const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  if (f || s) {
    const cf = Math.cos(u.face), sf = Math.sin(u.face);
    let mx = cf * f - sf * s, my = sf * f + cf * s;
    const l = Math.hypot(mx, my), sp = d.speed * 1.2 * dt;
    mx /= l; my /= l;
    u.x += mx * sp; u.y += my * sp;
    u.moving = true; u.chargeT += dt; u.gx = u.x + mx * 200; u.gy = u.y + my * 200;
  }
  u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.015 * dt);
  if (d.abil && u.acd <= 0 && (Input.rmb || k.Space)) {
    const ad = abilDist(u, d, Input.aim);
    castAbility(u, d, u.x + Math.cos(u.face) * ad, u.y + Math.sin(u.face) * ad);
  }
  if (u.cd > 0) return;
  if (Input.rmb && d.heal) { const t = findWounded(u, d.range + 30); if (t) doHeal(u, d, t); return; }
  if (!Input.lmb) return;
  const dmg = attackStats(u, d);
  if (!d.proj) {
    const reach = d.range + 16, hits = [];
    for (const o of G.ents) {
      if (o.team === u.team || o.dead) continue;
      const ed = edgeDist(u, o);
      if (ed > reach) continue;
      if (ed > 2 && angDiff(Math.atan2(o.y - u.y, o.x - u.x), u.face) > 1.15) continue;
      hits.push([ed, o]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    if (d.splash) {
      for (const h of hits) damage(h[1], dmg, u, d.bm, false);
      addFx({ type: 'boom', x: u.x + Math.cos(u.face) * (u.r + 14), y: u.y + Math.sin(u.face) * (u.r + 14), r: d.splash, life: 0.3, color: '#ffe08a' });
    } else if (hits.length) { meleeFx(u, hits[0][1]); damage(hits[0][1], dmg, u, d.bm, false); }
    else addFx({ type: 'slash', x: u.x, y: u.y, h: u.r * 1.3, ang: u.face, r: u.r + 12, life: 0.16 });
    Sfx.play('hit', u.x, u.y);
  } else if (d.splash) {
    const ad = (u.r + 40) + (d.range - 40) * Input.aim;
    fireGround(u, d, u.x + Math.cos(u.face) * ad, u.y + Math.sin(u.face) * ad, dmg, false);
  } else fireDir(u, d, u.face, dmg);
}

function updateUnit(u, dt) {
  const d = UNITS[u.type];
  u.cd -= dt; if (u.flash > 0) u.flash -= dt; if (u.swing > 0) u.swing -= dt;
  u.moving = false;
  if (u.acd > 0) u.acd -= dt;
  if (u.stun > 0) { // оглушён: стоит на месте, над головой искры
    u.stun -= dt;
    if (Math.random() < dt * 10) part(u.x + rand(-6, 6), u.y + rand(-6, 6), u.r * 2.6, rand(-20, 20), rand(-20, 20), 10, 0.4, '#ffe066', 3, 1);
    return;
  }
  if (d.regen && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + d.regen * dt);
  if (u.ctl) { const pp = G.players[u.owner]; if (pp.poss === u) { controlPossessed(u, d, dt, pp.inp); return; } u.ctl = false; }
  if (u.tgt && u.tgt.dead) u.tgt = null;
  if (u.order.type === 'attack' && (!u.order.target || u.order.target.dead)) u.order = { type: 'idle' };
  u.scan -= dt;
  if (u.scan <= 0) {
    u.scan = 0.25 + Math.random() * 0.15;
    if (u.order.type === 'attack') u.tgt = u.order.target;
    else if (u.order.type !== 'move') {
      if (d.heal) u.healTgt = findWounded(u, d.aggro);
      const t = findTarget(u, d.aggro, 0, d.bm > 1);
      if (t) u.tgt = t; else if (u.tgt && edgeDist(u, u.tgt) > d.aggro * 1.6) u.tgt = null;
    }
    if (d.abil && u.acd <= 0 && (G.players[u.owner].bot || G.players[u.owner].autoCast)) heroAuto(u, d);
  }
  let act = u.tgt, heal = false;
  if (d.heal && u.healTgt && !u.healTgt.dead && u.healTgt.hp < u.healTgt.maxHp && u.order.type !== 'move') { act = u.healTgt; heal = true; }
  if (act) {
    if (edgeDist(u, act) <= d.range) {
      u.face = Math.atan2(act.y - u.y, act.x - u.x);
      if (u.cd <= 0) { if (heal) doHeal(u, d, act); else doAttack(u, d, act); }
    } else stepTo(u, d, act.x, act.y, dt);
  } else if (u.order.type === 'move' || u.order.type === 'amove') {
    const dd = Math.hypot(u.order.x - u.x, u.order.y - u.y);
    if (dd < 50) u.arrT += dt;
    if (dd < 8 || u.arrT > 1.6) u.order = { type: 'idle' };
    else stepTo(u, d, u.order.x, u.order.y, dt);
  }
}

function orderUnit(u, type, x, y, target) {
  u.order = { type, x, y, target }; u.arrT = 0;
  u.tgt = type === 'attack' ? target : null;
  u.scan = 0;
}

// Столкновения: здания и препятствия — круги, вдоль которых воины скользят; между собой воины мягко расталкиваются
function collide(units, solids) {
  for (const u of units) {
    if (!u.fly) {
      for (const o of solids) {
        const dx = u.x - o.x, dy = u.y - o.y, rr = u.r + o.r, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d;
        u.x += nx * (rr - d); u.y += ny * (rr - d);
        if (u.moving) {
          const gx = u.gx - u.x, gy = u.gy - u.y, gl = Math.hypot(gx, gy) || 1;
          if ((gx * nx + gy * ny) / gl < -0.2) {
            const cr = (-ny * gx + nx * gy) / gl;
            const sgn = Math.abs(cr) < 0.15 ? u.side : Math.sign(cr);
            const sp = UNITS[u.type].speed * 0.016 * 0.9;
            u.x += -ny * sgn * sp; u.y += nx * sgn * sp;
          }
        }
      }
    }
    u.x = Math.max(u.r, Math.min(WORLD.w - u.r, u.x));
    u.y = Math.max(u.r, Math.min(WORLD.h - u.r, u.y));
  }
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (a.fly !== b.fly) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      if (d < 0.01) { a.x -= 0.5; b.x += 0.5; continue; }
      const push = (rr - d) * 0.3, nx = dx / d, ny = dy / d;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    }
  }
}

// ---------- Здания ----------
function updateBuilding(b, dt) {
  const d = BUILDINGS[b.type];
  if (b.flash > 0) b.flash -= dt;
  if (b.fire > 0) b.fire -= dt;
  if (b.build < 1) {
    b.build += dt / d.time;
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * dt / d.time);
    if (Math.random() < dt * 5) { const a = rand(0, TAU); dust(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, 1, 8); }
    if (b.build >= 1) {
      b.build = 1;
      addFx({ type: 'shock', x: b.x, y: b.y, r: b.r * 1.8, life: 0.5, color: '#ffe9a8' }); sparks(b.x, b.y, b.r * 1.5, 10, '#ffe9a8', 0.8);
      if (b.owner === G.human) Sfx.play('ready', b.x, b.y);
    }
    return;
  }
  if (b.repair) { // починка: тратит золото, под обстрелом приостанавливается
    const p = G.players[b.owner], miss = 1 - b.hp / b.maxHp;
    if (miss <= 0) b.repair = false;
    else if (G.time - b.hitT > REPAIR_PAUSE) {
      const fr = Math.min(miss, REPAIR_RATE * dt), c = fr * (d.cost || 700) * REPAIR_COST;
      if (p.gold < c) { b.repair = false; note(p, 'Починка остановлена: нет золота'); }
      else {
        p.gold -= c; b.hp = Math.min(b.maxHp, b.hp + fr * b.maxHp);
        if (Math.random() < dt * 7) sparks(b.x + rand(-0.6, 0.6) * b.r, b.y + rand(-0.6, 0.6) * b.r, b.r * rand(0.4, 1.3), 3, '#ffe9a8', 0.6);
        if (b.hp >= b.maxHp) { b.repair = false; addFx({ type: 'shock', x: b.x, y: b.y, r: b.r * 1.6, life: 0.4, color: '#ffe9a8' }); if (b.owner === G.human) Sfx.play('ready', b.x, b.y); }
      }
    }
  }
  const hf = b.hp / b.maxHp;
  if (hf < 0.55) { // повреждённое здание дымит, сильно повреждённое — горит
    b.smokeT -= dt;
    if (b.smokeT <= 0) {
      b.smokeT = hf < 0.28 ? 0.12 : 0.3;
      const ox = rand(-0.4, 0.4) * b.r, oy = rand(-0.4, 0.4) * b.r;
      smoke(b.x + ox, b.y + oy, b.r * 1.3, 1, b.r * 0.4, '#45423f', 8);
      if (hf < 0.28) flame(b.x + ox, b.y + oy, b.r * 1.1, 1, b.r * 0.35, 10);
    }
  }
  if (b.queue.length) {
    b.trainT += dt;
    const ud = UNITS[b.queue[0]];
    if (b.trainT >= ud.time) {
      b.trainT = 0;
      const type = b.queue.shift(), a = Math.atan2(b.rally.y - b.y, b.rally.x - b.x);
      const u = spawnUnit(b.owner, type, b.x + Math.cos(a) * (b.r + ud.r + 3), b.y + Math.sin(a) * (b.r + ud.r + 3));
      u.face = a; dust(u.x, u.y, 3, 7);
      if (ud.hero) { // герой выходит из цитадели
        G.players[b.owner].heroU = u; u.acd = 2;
        addFx({ type: 'shock', x: u.x, y: u.y, r: 80, life: 0.6, color: '#ffe066' }); magic(u.x, u.y, 14, 20, '#ffe066');
        note(G.players[b.owner], ud.name + ' готов к бою');
      }
      orderUnit(u, 'amove', b.rally.x + rand(-30, 30), b.rally.y + rand(-30, 30));
      if (b.owner === G.human) Sfx.play('ready', b.x, b.y);
    }
  }
  if (!d.atk) return;
  b.cd -= dt;
  if (b.cd > 0) return;
  b.cd = 0.2;
  if (d.atk === 'aura') {
    let any = false;
    for (const o of G.ents) {
      if (o.team === b.team || o.dead) continue;
      if (edgeDist(b, o) <= d.range) { damage(o, d.dmg, b, 1, false); flame(o.x, o.y, 10, 3, 7, 20); any = true; }
    }
    if (any) { b.cd = d.cd; b.fire = 0.5; for (let i = 0; i < 10; i++) { const a = rand(0, TAU), rr = rand(0.4, 1) * (d.range + b.r); flame(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, 4, 1, 8, 12); } addFx({ type: 'ring', x: b.x, y: b.y, r: d.range + b.r, life: 0.4, color: '#ff7a2a' }); Sfx.play('hit', b.x, b.y); }
    return;
  }
  const t = findTarget(b, d.range, d.minRange || 0, false);
  if (!t) return;
  b.cd = d.cd; b.aim = Math.atan2(t.y - b.y, t.x - b.x); b.fire = 0.3;
  if (d.atk === 'shot') fireAt(b, d, t, d.dmg);
  else if (d.atk === 'lob') fireGround(b, d, t.x, t.y, d.dmg, true);
  else if (d.atk === 'chain') {
    let from = b, cur = t, dmg = d.dmg;
    const hit = new Set();
    for (let n = 0; n < 3 && cur; n++) {
      hit.add(cur);
      addFx({ type: 'bolt', x1: from.x, y1: from.y, h1: from === b ? 70 : 14, x2: cur.x, y2: cur.y, h2: 14, color: '#d9b8ff', life: 0.22, seed: Math.random() });
      sparks(cur.x, cur.y, 14, 5, '#d9b8ff', 0.8);
      damage(cur, dmg, b, 1, false);
      dmg *= 0.7; from = cur;
      let nb = null, nd = 120;
      for (const o of G.ents) {
        if (o.team === b.team || o.dead || hit.has(o)) continue;
        const dd = edgeDist(from, o);
        if (dd < nd) { nd = dd; nb = o; }
      }
      cur = nb;
    }
    addFx({ type: 'flash', x: t.x, y: t.y, h: 30, color: '#b070ff', power: 0.8, life: 0.2 });
    Sfx.play('zap', b.x, b.y);
  }
}

// ---------- Главный шаг ----------
function update(dt) {
  G.time += dt;
  if (G.dirty) { G.ents = G.ents.filter(e => !e.dead); G.dirty = false; }
  const units = G.units = G.ents.filter(e => e.kind === 'unit');
  const blds = G.blds = G.ents.filter(e => e.kind === 'bld');
  for (const p of G.players) {
    if (!p.alive) continue;
    let inc = 0;
    for (const b of blds) if (b.owner === p.idx && b.build >= 1 && !b.dead) inc += (BUILDINGS[b.type].income || 0) + (b.type === 'mine' ? p.up.eco : 0);
    p.income = inc * (p.bot ? G.diff.income : 1);
    p.gold += p.income * dt;
    updateResearch(p, dt);
  }
  for (const b of blds) if (!b.dead) updateBuilding(b, dt);
  for (const u of units) if (!u.dead) updateUnit(u, dt);
  collide(units.filter(u => !u.dead), blds.filter(b => !b.dead).concat(G.obstacles, G.props.filter(q => q.r && !q.dead)));
  updateProjs(dt);
  updateFx(dt);
  for (const p of G.players) if (p.bot && p.alive) botUpdate(p, dt);
}

function updateFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) { G.fx[i].life -= dt; if (G.fx[i].life <= 0) G.fx.splice(i, 1); }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt; p.vh -= p.grav * dt; p.size += p.grow * dt;
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    if (p.h < 0) { p.h = 0; p.vh = 0; p.vx *= 0.8; p.vy *= 0.8; }
    if (p.life <= 0) G.parts.splice(i, 1);
  }
}

// Вселение: у каждого игрока свой воин под прямым управлением
function setPossess(p, u) {
  const old = p.poss;
  if (old && old !== u && !old.dead) { old.ctl = false; old.order = { type: 'idle' }; old.tgt = null; }
  p.poss = null;
  if (u && !u.dead && u.kind === 'unit' && u.owner === p.idx) { p.poss = u; u.ctl = true; }
  if (p.idx === G.human) G.possessed = p.poss;
}
// Эффект только для местного игрока (метки приказов): по сети не уходит
function localFx(o) { o.max = o.life; G.fx.push(o); }

// ---------- Журнал эффектов для сети ----------
// Хост запоминает вызовы эффектов верхнего уровня и рассылает их клиентам; те проигрывают их у себя.
const FXFN = {};
for (const name of ['burst', 'sparks', 'smoke', 'flame', 'dust', 'magic', 'explode', 'impactFx', 'addFx', 'part', 'shake']) {
  const fn = FXFN[name] = window[name], leaf = name === 'addFx' || name === 'part' || name === 'shake';
  window[name] = function (...a) {
    if (G.net !== 'host') return fn(...a);
    if (!G.evDepth && G.evq.length < 500) G.evq.push(name === 'addFx' ? [name, Object.fromEntries(Object.entries(a[0]).filter(kv => typeof kv[1] !== 'object'))] : [name, ...a]);
    if (leaf) return fn(...a);
    G.evDepth++;
    try { return fn(...a); } finally { G.evDepth--; }
  };
}
{
  const play = Sfx.play;
  Sfx.play = function (kind, x, y) {
    if (G.net === 'host' && !G.evDepth && x !== undefined && G.evq.length < 500) G.evq.push(['sfx', kind, Math.round(x), Math.round(y)]);
    return play.call(this, kind, x, y);
  };
}
