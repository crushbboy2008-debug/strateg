'use strict';
// ---------- Сетевая игра ----------
// Симуляцию считает только хост. Клиенты шлют ему приказы и ввод вселённого воина,
// а в ответ ~12 раз в секунду получают снимок состояния и журнал эффектов.
// Соединение — напрямую между браузерами (WebRTC через PeerJS), свой сервер не нужен.
const UT = Object.keys(UNITS), BT = Object.keys(BUILDINGS);
const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', ROOM = 'strateg-room-', SNAP_DT = 1 / 12;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const fin = v => (Number.isFinite(+v) ? +v : 0);

function netErr(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'Комната не найдена. Проверьте код';
  if (t === 'browser-incompatible') return 'На этой странице прямые соединения запрещены. Сетевая игра работает, когда игра открыта на отдельном сайте';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Нет связи с сервером соединений';
  return 'Ошибка сети' + (t ? ': ' + t : '');
}

// Библиотека соединений отбрасывает сообщения крупнее ~16 КБ, поэтому большие (старт с картой, снимки в разгар боя)
// режутся на части и собираются на той стороне. Канал надёжный и упорядоченный, части приходят подряд.
const CHUNK = 6000;
let chunkId = 0;
function netSend(c, m) {
  const s = JSON.stringify(m);
  if (s.length < CHUNK) { c.send(m); return; }
  const id = ++chunkId, n = Math.ceil(s.length / CHUNK);
  for (let i = 0; i < n; i++) c.send({ t: 'ch', id, i, n, d: s.slice(i * CHUNK, (i + 1) * CHUNK) });
}
function netRecv(c, m, handle) {
  if (!m || m.t !== 'ch') return handle(m);
  if (!c.buf || c.buf.id !== m.id) c.buf = { id: m.id, parts: [] };
  c.buf.parts[m.i] = m.d;
  if (m.i !== m.n - 1) return;
  const text = c.buf.parts.join('');
  c.buf = null;
  let o;
  try { o = JSON.parse(text); } catch (e) { return; }
  handle(o);
}

// Приказ игрока. Выполняется на хосте (и в одиночной игре). Возвращает '' или причину отказа.
function execCmd(p, m) {
  if (m.c === 'in') { // ввод вселённого воина от клиента
    const i = p.inp, k = m.k | 0;
    if (i === Input) return '';
    i.keys = { KeyW: k & 1, KeyS: k & 2, KeyA: k & 4, KeyD: k & 8, Space: k & 16 };
    i.yaw = fin(m.yaw); i.aim = Math.max(0, Math.min(1, fin(m.aim))); i.lmb = !!m.l; i.rmb = !!m.r;
    return '';
  }
  if (!p.alive) return 'Ваша цитадель пала';
  const own = (id, kind) => { for (const e of G.ents) if (e.id === id) return !e.dead && e.owner === p.idx && e.kind === kind ? e : null; return null; };
  switch (m.c) {
    case 'build': return ['mine', 'barracks', p.fac.tower].includes(m.type) ? tryBuild(p, m.type, fin(m.x), fin(m.y)) : '';
    case 'train': return queueUnit(p, Math.max(0, Math.min(2, m.slot | 0)), m.b ? own(m.b, 'bld') : null);
    case 'hero': return queueHero(p);
    case 'research': return UPGRADES[m.key] ? startResearch(p, m.key) : '';
    case 'repair': return setRepair(p, own(m.b, 'bld'));
    case 'repairAll': {
      let n = 0, busy = 0;
      for (const e of G.ents) {
        if (e.kind !== 'bld' || e.owner !== p.idx || e.dead || e.build < 1 || e.hp >= e.maxHp) continue;
        if (e.repair) busy++; else if (!setRepair(p, e, true)) n++;
      }
      if (n) { note(p, 'Начата починка зданий: ' + n); return ''; }
      return busy ? 'Здания уже чинятся' : p.gold < 5 ? 'Недостаточно золота' : 'Все здания целы';
    }
    case 'rally': { const b = own(m.b, 'bld'); if (b && b.type === 'barracks') b.rally = { x: fin(m.x), y: fin(m.y) }; return ''; }
    case 'order': {
      let target = null, i = 0;
      if (m.tid) for (const e of G.ents) if (e.id === m.tid && !e.dead && e.team !== p.team) target = e;
      const x = fin(m.x), y = fin(m.y);
      for (const id of (Array.isArray(m.ids) ? m.ids : []).slice(0, 80)) {
        const u = own(id, 'unit');
        if (!u || u.ctl) continue;
        u.wave = false;
        if (target) orderUnit(u, 'attack', target.x, target.y, target);
        else { const a = i * 2.4, rr = 15 * Math.sqrt(i); orderUnit(u, m.plain ? 'move' : 'amove', x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        i++;
      }
      return '';
    }
    case 'possess':
      setPossess(p, m.id ? own(m.id, 'unit') : null);
      if (p.poss && p.inp !== Input) { p.inp.yaw = fin(m.yaw); p.inp.lmb = p.inp.rmb = false; p.inp.keys = {}; }
      return '';
  }
  return '';
}

const Net = {
  peer: null, role: null, code: '', conns: [], hostConn: null, lobby: null, you: 0, playing: false, loading: null,
  acc: 0, inT: 0, byId: new Map(), pById: new Map(), props: new Map(),
  on: { lobby() {}, start() {}, end() {}, closed() {}, msg() {}, error() {} }, // обработчики задаёт интерфейс

  load() {
    if (window.Peer) return Promise.resolve();
    return this.loading || (this.loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = PEER_SRC; s.onload = () => res();
      s.onerror = () => { this.loading = null; rej(new Error('Не удалось загрузить сетевой модуль. Нужен интернет')); };
      document.head.appendChild(s);
    }));
  },

  leave() {
    const p = this.peer;
    this.peer = null; this.role = null; this.conns = []; this.hostConn = null; this.lobby = null; this.playing = false; this.code = '';
    if (p) { try { p.destroy(); } catch (e) { /* уже закрыт */ } }
  },

  // ---- хост ----
  async host(faction) {
    await this.load();
    this.leave();
    const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 5 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
    const peer = this.peer = new Peer(ROOM + code);
    this.role = 'host'; this.code = code;
    this.lobby = { slots: [{ id: 'host', faction }], map: 'island', diff: 'normal', bots: 1, coop: false };
    return new Promise((res, rej) => {
      let open = false;
      peer.on('open', () => { open = true; res(code); });
      peer.on('error', e => { if (!open) { if (this.peer === peer) this.leave(); rej(new Error(netErr(e))); } else if (e.type !== 'peer-unavailable') this.on.error(netErr(e)); });
      peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* повторим при следующем обрыве */ } } });
      peer.on('connection', c => this.accept(c));
    });
  },
  accept(c) {
    c.on('open', () => {
      if (this.playing || this.lobby.slots.length >= 4) { netSend(c, { t: 'closed', text: this.playing ? 'В комнате уже идёт бой' : 'Комната заполнена' }); setTimeout(() => c.close(), 500); return; }
      const free = Object.keys(FACTIONS).find(f => !this.lobby.slots.some(s => s.faction === f));
      this.lobby.slots.push({ id: c.peer, faction: free });
      c.seen = Date.now();
      this.conns.push(c);
      this.pushLobby();
    });
    c.on('data', m => netRecv(c, m, o => this.hostMsg(c, o)));
    c.on('close', () => this.drop(c, 'соединение закрыто'));
    c.on('error', () => {}); // сбой отдельного сообщения — не повод выгонять игрока; обрыв поймает проверка связи
  },
  drop(c, why) {
    const i = this.conns.indexOf(c);
    if (i < 0 || this.role !== 'host') return;
    this.conns.splice(i, 1);
    this.lobby.slots = this.lobby.slots.filter(s => s.id !== c.peer);
    if (this.playing) for (const p of G.players) if (p.conn === c) { // за ушедшего доигрывает бот
      p.conn = null; setPossess(p, null); p.bot = true;
      if (p.alive) G.notes.push(p.fac.name + ': игрок отключился (' + (why || 'вышел') + '), за него играет бот');
    }
    this.pushLobby();
  },
  setLobby(patch) {
    if (this.role !== 'host') return;
    const L = this.lobby;
    if (patch.faction && !L.slots.some((s, i) => i && s.faction === patch.faction)) L.slots[0].faction = patch.faction;
    for (const k of ['map', 'diff', 'bots', 'coop']) if (k in patch) L[k] = patch[k];
    this.pushLobby();
  },
  pushLobby() {
    const L = this.lobby;
    L.bots = Math.max(0, Math.min(L.bots, 4 - L.slots.length));
    for (const c of this.conns) if (c.open) netSend(c, { t: 'lobby', lobby: L, you: L.slots.findIndex(s => s.id === c.peer), playing: this.playing });
    this.on.lobby();
  },
  hostMsg(c, m) {
    if (!m || typeof m !== 'object') return;
    c.seen = Date.now();
    if (m.t === 'bye') { this.drop(c, 'закрыл игру'); try { c.close(); } catch (e) { /* уже закрыто */ } return; }
    if (m.t === 'fac') {
      const s = this.lobby.slots.find(q => q.id === c.peer);
      if (s && !this.playing && FACTIONS[m.faction] && !this.lobby.slots.some(q => q !== s && q.faction === m.faction)) { s.faction = m.faction; this.pushLobby(); }
    } else if (m.c && this.playing && G.running) {
      const p = G.players.find(q => q.conn === c);
      if (!p) return;
      const why = execCmd(p, m);
      if (why) netSend(c, { t: 'msg', text: why });
    }
  },
  // Состав партии по настройкам комнаты: сначала люди, потом боты
  makeCfg() {
    const L = this.lobby, humans = L.slots.map(s => s.faction), nb = Math.min(L.bots, 4 - humans.length);
    const rest = Object.keys(FACTIONS).filter(f => !humans.includes(f)).sort(() => Math.random() - 0.5).slice(0, nb), coop = L.coop && nb > 0;
    return { map: L.map, diff: L.diff, coop, net: 'host', human: 0,
      players: humans.map((f, i) => ({ faction: f, bot: false, team: coop ? 0 : i })).concat(rest.map((f, j) => ({ faction: f, bot: true, team: coop ? 1 : humans.length + j }))) };
  },
  // Вызывается после newGame: раздаёт клиентам стартовое состояние
  begin(cfg) {
    this.playing = true; this.acc = 0;
    const props = G.props.map(q => ({ id: q.id, type: q.type, fac: q.fac, owner: q.owner, x: r1(q.x), y: r1(q.y), r: q.r, face: r2(q.face) }));
    const snap = this.snap();
    this.lobby.slots.forEach((s, i) => {
      if (!i) return;
      const c = this.conns.find(q => q.peer === s.id), p = G.players[i];
      if (!c || !c.open) { p.bot = true; return; }
      p.conn = c;
      netSend(c, { t: 'start', you: i, cfg: { map: cfg.map, diff: cfg.diff, coop: cfg.coop, players: cfg.players }, seed: G.seed, obstacles: G.obstacles.map(o => ({ x: r1(o.x), y: r1(o.y), r: r1(o.r), tree: o.tree, seed: r2(o.seed), kind: o.kind })), props, snap });
    });
  },
  finish() { // хост вышел в меню: бой окончен для всех
    if (this.role !== 'host' || !this.playing) return;
    this.playing = false;
    for (const c of this.conns) if (c.open) netSend(c, { t: 'end' });
    this.pushLobby();
  },
  snap() {
    const u = [], b = [], p = [];
    for (const e of G.ents) {
      if (e.dead) continue;
      if (e.kind === 'unit') u.push([e.id, UT.indexOf(e.type), e.owner, r1(e.x), r1(e.y), Math.ceil(e.hp), e.maxHp, r2(e.face), (e.moving ? 1 : 0) | (e.flash > 0 ? 2 : 0) | (e.stun > 0 ? 4 : 0),
        e.swing > 0 ? r2(e.swing) : 0, e.acd > 0 ? r1(e.acd) : 0, e.cd > 0 ? r2(e.cd) : 0]);
      else b.push([e.id, BT.indexOf(e.type), e.owner, r1(e.x), r1(e.y), Math.ceil(e.hp), r2(e.build), e.queue.map(t => UT.indexOf(t)), r2(e.trainT), r2(e.aim), e.fire > 0 ? r2(e.fire) : 0,
        (e.repair ? 1 : 0) | (e.flash > 0 ? 2 : 0), r1(e.hitT), r1(e.rally.x), r1(e.rally.y)]);
    }
    for (const q of G.projs) p.push([q.id || (q.id = G.nextId++), q.kind, r1(q.x), r1(q.y), r1(q.h), r2(q.ang || 0), q.lob ? 1 : 0]);
    const pl = G.players.map(q => [Math.floor(q.gold), r1(q.income), q.alive ? 1 : 0, q.up.atk, q.up.arm, q.up.eco, q.research ? [q.research.key, r1(q.research.t), q.research.time] : 0,
      q.heroLvl, Math.floor(q.heroXp), q.heroDeaths, q.heroU && !q.heroU.dead ? q.heroU.id : 0, q.alarm ? [Math.round(q.alarm.x), Math.round(q.alarm.y), r1(q.alarm.t)] : 0, q.lost, q.bl, q.bot ? 1 : 0]);
    const ev = G.evq.splice(0).map(e => e.map(v => (typeof v === 'number' ? r1(v) : v)));
    return { t: 's', T: r2(G.time), u, b, p, pl, ev, dp: G.props.filter(q => q.dead).map(q => q.id), w: G.winTeam === undefined ? null : G.winTeam };
  },
  hostTick(dt) {
    this.acc += dt;
    if (this.acc < SNAP_DT) return;
    this.acc = 0;
    const s = this.snap();
    for (const p of G.players) {
      const c = p.conn;
      if (!c || !c.open) continue;
      if (p.nq.length) netSend(c, { t: 'n', n: p.nq.splice(0) });
      // Медленная связь: если прошлые снимки ещё не ушли, этот пропускаем — следующий всё равно несёт полное состояние
      const dc = c.dataChannel;
      if (dc && dc.bufferedAmount > 120000) continue;
      netSend(c, s);
    }
  },

  // ---- клиент ----
  async join(code) {
    await this.load();
    this.leave();
    const peer = this.peer = new Peer();
    this.role = 'client'; this.code = code;
    return new Promise((res, rej) => {
      let done = false;
      const fail = text => { if (done) return; done = true; if (this.peer === peer) this.leave(); rej(new Error(text)); };
      peer.on('open', () => {
        const c = this.hostConn = peer.connect(ROOM + code, { reliable: true, serialization: 'json' });
        c.on('open', () => { this.seen = Date.now(); if (!done) { done = true; res(); } });
        c.on('data', m => netRecv(c, m, o => this.clientMsg(o)));
        c.on('close', () => { if (this.peer === peer) { this.leave(); this.on.closed('Соединение с хостом потеряно'); } });
      });
      peer.on('error', e => fail(netErr(e)));
      setTimeout(() => fail('Не удалось подключиться. Проверьте код комнаты'), 15000);
    });
  },
  send(m) { const c = this.hostConn; if (c && c.open) netSend(c, m); },
  clientMsg(m) {
    if (!m || typeof m !== 'object') return;
    this.seen = Date.now();
    switch (m.t) {
      case 'lobby': this.lobby = m.lobby; this.you = m.you; this.playing = !!m.playing; this.on.lobby(); break;
      case 'start': this.playing = true; this.on.start(m); break;
      case 's': if (G.net === 'client' && G.running) this.applySnap(m); break;
      case 'n': if (G.net === 'client') for (const t of m.n) G.notes.push(t); break;
      case 'msg': this.on.msg(m.text); break;
      case 'end': this.playing = false; this.on.end(); break;
      case 'closed': { const text = m.text; this.leave(); this.on.closed(text); break; }
    }
  },
  clientInit(m) {
    const cfg = m.cfg;
    Object.assign(G, { running: true, time: 0, over: null, ents: [], units: [], blds: [], projs: [], fx: [], parts: [], players: [], possessed: null, nextId: 1,
      map: MAPS[cfg.map] || MAPS.island, diff: DIFF[cfg.diff] || DIFF.normal, human: m.you, dirty: false, shakes: [], notes: [], heroHit: -9,
      net: 'client', evq: [], evDepth: 0, winTeam: undefined, possessLost: false, seed: m.seed,
      obstacles: m.obstacles, props: m.props.map(q => ({ ...q, kind: 'prop', dead: false, fire: 0 })) });
    WORLD.w = WORLD.h = G.map.size;
    cfg.players.forEach((c, i) => G.players.push(mkPlayer(i, c)));
    this.byId = new Map(); this.pById = new Map(); this.props = new Map(G.props.map(q => [q.id, q]));
    this.inT = 0;
    this.applySnap(m.snap);
  },
  applySnap(s) {
    const byId = this.byId, seen = new Set(), flash = (e, on) => { if (on && e.flash <= 0) { e.flash = 0.12; if (e === G.possessed) G.heroHit = s.T; } };
    G.time = s.T;
    for (const a of s.u) {
      let e = byId.get(a[0]);
      if (!e) {
        const type = UT[a[1]], d = UNITS[type];
        e = { id: a[0], kind: 'unit', type, owner: a[2], team: G.players[a[2]].team, x: a[3], y: a[4], r: d.r, fly: !!d.fly, dead: false, flash: 0, swing: 0, face: a[7], order: { type: 'idle' }, queue: [] };
        byId.set(e.id, e); G.ents.push(e);
      }
      seen.add(e.id);
      e.tx = a[3]; e.ty = a[4];
      if (Math.hypot(e.tx - e.x, e.ty - e.y) > 140) { e.x = e.tx; e.y = e.ty; }
      e.hp = a[5]; e.maxHp = a[6];
      if (e !== G.possessed) e.face = a[7];
      e.moving = !!(a[8] & 1); flash(e, a[8] & 2); e.stun = a[8] & 4 ? 1 : 0;
      if (a[9] > 0 && e.swing <= 0.03) e.swing = a[9];
      e.acd = a[10]; e.cd = a[11];
    }
    for (const a of s.b) {
      let e = byId.get(a[0]);
      if (!e) {
        const type = BT[a[1]], d = BUILDINGS[type];
        e = { id: a[0], kind: 'bld', type, owner: a[2], team: G.players[a[2]].team, x: a[3], y: a[4], r: d.r, maxHp: d.hp, dead: false, flash: 0, fire: 0, queue: [], rally: { x: 0, y: 0 } };
        byId.set(e.id, e); G.ents.push(e);
        if (type === 'hq') G.players[e.owner].hq = e;
      }
      seen.add(e.id);
      e.hp = a[5]; e.build = a[6]; e.queue = a[7].map(i => UT[i]); e.trainT = a[8]; e.aim = a[9];
      if (a[10] > e.fire) e.fire = a[10];
      e.repair = !!(a[11] & 1); flash(e, a[11] & 2); e.hitT = a[12]; e.rally.x = a[13]; e.rally.y = a[14];
    }
    for (let i = G.ents.length - 1; i >= 0; i--) { const e = G.ents[i]; if (!seen.has(e.id)) { e.dead = true; e.hp = 0; byId.delete(e.id); G.ents.splice(i, 1); } }
    G.units = G.ents.filter(e => e.kind === 'unit'); G.blds = G.ents.filter(e => e.kind === 'bld');
    if (G.possessed && G.possessed.dead) { G.possessed = null; G.possessLost = true; }
    const ps = new Set();
    for (const a of s.p) {
      let p = this.pById.get(a[0]);
      if (!p) { p = { id: a[0], kind: a[1], x: a[2], y: a[3], h: a[4], lob: !!a[6], trail: 0 }; this.pById.set(p.id, p); G.projs.push(p); }
      p.tx = a[2]; p.ty = a[3]; p.th = a[4]; p.ang = a[5]; ps.add(p.id);
    }
    for (let i = G.projs.length - 1; i >= 0; i--) { const p = G.projs[i]; if (!ps.has(p.id)) { this.pById.delete(p.id); G.projs.splice(i, 1); } }
    s.pl.forEach((a, i) => {
      const p = G.players[i];
      p.gold = a[0]; p.income = a[1]; p.alive = !!a[2]; p.up.atk = a[3]; p.up.arm = a[4]; p.up.eco = a[5];
      p.research = a[6] ? { key: a[6][0], t: a[6][1], time: a[6][2] } : null;
      p.heroLvl = a[7]; p.heroXp = a[8]; p.heroDeaths = a[9]; p.heroU = byId.get(a[10]) || null;
      p.alarm = a[11] ? { x: a[11][0], y: a[11][1], t: a[11][2] } : null;
      p.lost = a[12]; p.bl = a[13]; p.bot = !!a[14];
    });
    for (const id of s.dp) { const q = this.props.get(id); if (q) q.dead = true; }
    for (const ev of s.ev) { // эффекты и звуки, случившиеся на хосте
      const n = ev[0];
      if (n === 'sfx') Sfx.play(ev[1], ev[2], ev[3]);
      else if (n === 'addFx') { if (ev[1].type !== 'num' || ev[1].pid === G.human) FXFN.addFx(ev[1]); }
      else if (FXFN[n]) FXFN[n](...ev.slice(1));
    }
    if (s.w !== null && !G.over) { G.winTeam = s.w; G.over = s.w === G.players[G.human].team ? 'victory' : 'defeat'; }
  },
  // Кадр клиента: сглаживание между снимками, местные таймеры анимаций, отправка ввода
  step(dt) {
    G.time += dt;
    const k = 1 - Math.exp(-dt * 14), kp = 1 - Math.exp(-dt * 28);
    for (const e of G.ents) {
      if (e.flash > 0) e.flash -= dt;
      if (e.kind === 'unit') {
        e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k;
        if (e.swing > 0) e.swing -= dt; if (e.acd > 0) e.acd -= dt; if (e.cd > 0) e.cd -= dt;
      } else if (e.fire > 0) e.fire -= dt;
    }
    if (G.possessed) G.possessed.face = Input.yaw;
    for (const p of G.projs) { p.x += (p.tx - p.x) * kp; p.y += (p.ty - p.y) * kp; p.h += (p.th - p.h) * kp; projTrail(p, dt); }
    updateFx(dt);
    this.inT -= dt;
    if (G.possessed && this.inT <= 0) {
      this.inT = 0.05;
      const K = Input.keys;
      this.send({ c: 'in', k: (K.KeyW || K.ArrowUp ? 1 : 0) | (K.KeyS || K.ArrowDown ? 2 : 0) | (K.KeyA || K.ArrowLeft ? 4 : 0) | (K.KeyD || K.ArrowRight ? 8 : 0) | (K.Space ? 16 : 0),
        yaw: r2(Input.yaw), aim: r2(Input.aim), l: Input.lmb || Input.lmbHit ? 1 : 0, r: Input.rmb || Input.rmbHit ? 1 : 0 });
      Input.lmbHit = Input.rmbHit = false;
    }
  },
};

// Проверка связи: браузер не сразу замечает, что вкладка собеседника закрыта, поэтому обе стороны шлют «я тут».
// Срок большой: пока у игрока строится карта, его вкладка занята и молчит несколько секунд (на слабом компьютере — дольше).
const NET_TIMEOUT = 45000;
let netTick = Date.now();
setInterval(() => {
  const now = Date.now(), stalled = now - netTick > 5000; // сами только что «висели» — чужое молчание за это время не считается
  netTick = now;
  if (Net.role === 'client' && Net.hostConn && Net.hostConn.open) {
    Net.send({ t: 'ping' });
    if (stalled) Net.seen = now;
    else if (now - Net.seen > NET_TIMEOUT) { Net.leave(); Net.on.closed('Соединение с хостом потеряно'); }
  } else if (Net.role === 'host') {
    for (const c of Net.conns.slice()) {
      if (stalled) c.seen = now;
      else if (now - c.seen > NET_TIMEOUT) { Net.drop(c, 'нет связи'); try { c.close(); } catch (e) { /* уже закрыто */ } }
      else if (c.open) netSend(c, { t: 'ping' });
    }
  }
}, 2000);// Закрывая вкладку, клиент прощается, чтобы хост сразу посадил на его место бота
window.addEventListener('pagehide', () => { if (Net.role === 'client') Net.send({ t: 'bye' }); });