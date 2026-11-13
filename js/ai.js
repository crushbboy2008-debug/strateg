'use strict';
// ---------- ИИ ботов: экономика, оборона, волны атак ----------
function botUpdate(p, dt) {
  const ai = p.ai;
  ai.t -= dt;
  if (ai.t > 0) return;
  ai.t = G.diff.tick;

  const mine = G.units.filter(u => u.owner === p.idx && !u.dead);
  const myB = G.blds.filter(b => b.owner === p.idx && !b.dead);
  const cnt = { mine: 0, barracks: 0, tower: 0 };
  for (const b of myB) { if (b.type === 'mine') cnt.mine++; else if (b.type === 'barracks') cnt.barracks++; else if (BUILDINGS[b.type].tower) cnt.tower++; }

  // --- Строительство ---
  const t = G.time;
  let want = null;
  if (!cnt.barracks) want = 'barracks';
  else if (cnt.mine < Math.min(2 + Math.floor(t / 50), 7)) want = 'mine';
  else if (cnt.tower < Math.min(1 + Math.floor(t / 80), 5)) want = p.fac.tower;
  else if (cnt.barracks < Math.min(1 + Math.floor(t / 140), 3)) want = 'barracks';
  // Герой важнее новых построек: как только есть казарма и пара шахт, бот копит на него
  const needHero = !p.heroU && !p.hq.queue.length && t > 45 && cnt.barracks && cnt.mine >= 2;
  const upKey = ['eco', 'atk', 'arm'].sort((a, b) => p.up[a] - p.up[b])[0];
  const needUp = !needHero && !p.research && p.up[upKey] < UPGRADES[upKey].cost.length && t > 110 + 75 * (p.up.atk + p.up.arm + p.up.eco);
  if (needHero || needUp) want = null;
  if (want && p.gold >= buildCost(p, want)) {
    const s = botSpot(p, want);
    if (s) tryBuild(p, want, s.x, s.y);
  }

  // --- Обучение войск ---
  let reserve = want ? buildCost(p, want) * (want === 'mine' && cnt.mine < 3 ? 1 : 0.4) : 0; // на первые шахты копим полностью

  // --- Герой и улучшения: бот копит на них, придерживая обучение войск ---
  if (needHero) {
    if (queueHero(p)) reserve = Math.max(reserve, heroCost(p));
  } else if (needUp && startResearch(p, upKey)) reserve = Math.max(reserve, upCost(p, upKey));
  for (const b of myB) {
    if (b.type !== 'barracks' || b.build < 1 || b.queue.length >= 2) continue;
    const r = Math.random(), slot = r < 0.45 ? 0 : r < 0.8 ? 1 : 2;
    if (p.gold - UNITS[p.fac.units[slot]].cost >= reserve) queueUnit(p, slot, b);
  }

  // --- Починка: когда бой утих, бот чинит побитые здания ---
  for (const b of myB) if (!b.repair && b.build >= 1 && b.hp < b.maxHp * 0.7 && p.gold > 120) b.repair = true;

  // --- Оборона: свободные воины бегут туда, где бьют здания ---
  const home = mine.filter(u => !u.wave);
  if (p.alarm && G.time - p.alarm.t < 4) {
    for (const u of home) if (!u.tgt && Math.hypot(u.x - p.alarm.x, u.y - p.alarm.y) > 120) orderUnit(u, 'amove', p.alarm.x + rand(-40, 40), p.alarm.y + rand(-40, 40));
  }

  // --- Атака волнами ---
  const foes = G.players.filter(q => q.alive && q.team !== p.team);
  if (!foes.length) return;
  if (home.length >= ai.wave) {
    foes.sort((a, b) => dist(a.hq, p.hq) - dist(b.hq, p.hq));
    const foe = Math.random() < 0.7 ? foes[0] : foes[Math.floor(Math.random() * foes.length)];
    home.forEach((u, i) => {
      u.wave = true;
      const a = i * 2.4, rr = 16 * Math.sqrt(i);
      orderUnit(u, 'amove', foe.hq.x + Math.cos(a) * rr, foe.hq.y + Math.sin(a) * rr);
    });
    ai.wave = Math.min(ai.wave + 2, 22);
  }
  // Воины волны, оставшиеся без дела, идут добивать ближайшее вражеское здание
  for (const u of mine) {
    if (!u.wave || u.tgt || u.order.type !== 'idle') continue;
    let best = null, bd = Infinity;
    for (const b of G.blds) {
      if (b.team === p.team || b.dead) continue;
      const d = dist(u, b);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) orderUnit(u, 'amove', best.x, best.y);
  }
}

function botSpot(p, type) {
  const hq = p.hq, ca = Math.atan2(WORLD.h / 2 - hq.y, WORLD.w / 2 - hq.x);
  for (let i = 0; i < 40; i++) {
    let a, d;
    if (type === 'mine') { a = ca + Math.PI + rand(-1.5, 1.5); d = rand(100, 250); }
    else if (type === 'barracks') { a = ca + rand(-2.2, 2.2); d = rand(120, 270); }
    else { a = ca + rand(-1.3, 1.3); d = rand(150, 320); }
    const x = hq.x + Math.cos(a) * d, y = hq.y + Math.sin(a) * d;
    if (!canPlace(p, type, x, y)) return { x, y };
  }
  return null;
}
