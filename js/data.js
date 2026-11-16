'use strict';
// ---------- Константы и данные игры ----------
const TAU = Math.PI * 2;
const WORLD = { w: 3400, h: 3400 };
const POP_CAP = 50;   // места в войске: дешёвый воин занимает 1 место, дорогой (от 100 золота) и герой — 2
const BUILD_RADIUS = 300;
const START_GOLD = 320;
const MAX_MINES = 8;
const MAX_TOWERS = 3;        // оборонительных башен на игрока; каждая следующая дороже на TOWER_STEP
const TOWER_STEP = 40;
// Осадный час: с этой секунды матча здания получают всё больше урона (+SIEGE_RATE за минуту), чтобы бой не тянулся вечно
const SIEGE_START = 600, SIEGE_RATE = 0.25, SIEGE_MAX = 3;
function siegeMul(t) { return Math.min(SIEGE_MAX, 1 + Math.max(0, t - SIEGE_START) / 60 * SIEGE_RATE); }
// Павший герой возвращается не сразу: чем выше уровень, тем дольше
function heroDelay(lvl) { return 20 + 12 * lvl; }
// Починка: доля цены здания за полный ремонт, доля прочности в секунду, пауза после попадания
const REPAIR_COST = 0.5, REPAIR_RATE = 0.05, REPAIR_PAUSE = 3;
// Здания крепкие: обычные удары наносят им лишь часть урона, ломать их — дело осадных воинов (у них большой bm)
const BLD_ARMOR = 0.55;
// Рост героя за уровень: здоровье и урон
const HERO_HP = 0.13, HERO_DMG = 0.10;
// Здания бьют героев сильнее и пробивают их броню: герой в одиночку базу не берёт
const BLD_VS_HERO = 1.4;
// Лечение: окно, в котором целители на одной цели мешают друг другу, и сила убывания (2 жреца ≈ ×1.33, 3 ≈ ×1.5)
const HEAL_WINDOW = 1.2, HEAL_STACK = 0.5;
// Вселённый воин восстанавливает здоровье, только если его не били столько секунд
const POSS_REGEN_PAUSE = 4;

// Карты. size — сторона квадрата; lay — расстановка баз (corner — по углам, cross — у середин сторон);
// pal — цвета земли; trees — виды деревьев; rock — цвета скал [камень, тёмный камень, шапка]
const MAPS = {
  island: { name: 'Зелёный остров', info: 'Луга и рощи, базы по углам. Классика.', size: 3400, lay: 'corner', obst: 46, treeP: 0.6, trees: ['fir', 'leaf'],
    thumb: ['#70ac4e', '#508c3a', '#e8d6a0'] },
  canyon: { name: 'Пустынный каньон', info: 'Базы напротив друг друга, между ними лабиринт скал.', size: 3400, lay: 'cross', obst: 80, treeP: 0.25, rockMul: 1.35, trees: ['cactus'],
    pal: { g1: [224, 192, 130], g2: [206, 168, 108], dry: [190, 150, 96], dirt: [176, 130, 86], road: [150, 110, 76], sand: [238, 218, 166] },
    rock: ['#c08a5a', '#a8744a', '#d9b77c'],
    decor: { tuft: ['#b7a55a', '#c9b56a', '#9c8a4a'], flower: null, stone: ['#c08a5a', '#a8744a'], bush: ['#a89a52', '#b7a55a'] },
    sun: ['#ffdca0', 3.6], hemi: ['#ffeccf', '#a08050', 1.5], thumb: ['#e0c082', '#c08a5a', '#eedaa6'] },
  snow: { name: 'Снежный перевал', info: 'Маленькая карта: враги рядом, бой начинается сразу.', size: 2800, lay: 'corner', obst: 30, treeP: 0.7, trees: ['fir'], snowy: true,
    pal: { g1: [238, 242, 246], g2: [214, 223, 232], dry: [200, 211, 216], dirt: [150, 141, 132], road: [170, 160, 148], sand: [226, 233, 240] },
    rock: ['#8e939a', '#757a82', '#f4f7fb'],
    decor: { tuft: ['#dfe8ee', '#c9d6de', '#8aa08f'], flower: null, stone: ['#8e939a', '#f4f7fb'], bush: ['#e6edf2', '#cfdbe3'] },
    sun: ['#fff4e6', 3.0], hemi: ['#e8f2ff', '#b8c4d0', 1.7], thumb: ['#eef2f6', '#c2ced8', '#8e939a'] },
  // Сумрачный болотный лес: только оформление (свет, туман, земля с чёрными лужами, мёртвые деревья, грибы, светлячки) — размеры и правила те же
  forest: { name: 'Тёмная чаща', info: 'Огромный сумрачный лес: болота, туман и мёртвые деревья. Долгая партия.', size: 4200, lay: 'corner', obst: 240, gap: 52, treeP: 0.9, trees: ['fir', 'dead', 'fir', 'dead', 'leaf'],
    pal: { g1: [88, 118, 66], g2: [54, 86, 54], dry: [112, 106, 62], dirt: [102, 78, 54], road: [150, 124, 90], sand: [122, 114, 80] }, bog: [38, 64, 62],
    greens: ['#1b3d33', '#234a39', '#16322a', '#2c5842'], rock: ['#5a645f', '#454e4a', '#4c7a3e'],
    decor: { tuft: ['#2f5a3a', '#3b6b40', '#27493a'], flower: null, mush: ['#21d6a0', '#8a5cff', '#6fe83a'], stone: ['#5a645f', '#454e4a'], bush: ['#21402f', '#2a5238'] },
    mood: { horizon: '#6f8d84', zenith: '#22343a', fog: [900, 4200], water: '#2c4a43', bed: '#4a4e3c', cloud: '#6a7c7c', fireflies: 420 },
    sun: ['#b9d6d8', 3.1], hemi: ['#9dbcc4', '#3a4a2c', 1.6], thumb: ['#4a6e48', '#234a39', '#7a7a52'] },
};
// Цвет утоптанной земли на базе каждой фракции
const BASE_GROUND = { legion: [178, 168, 148], horde: [106, 72, 52], arcane: [158, 146, 186], mech: [100, 103, 108] };

// Состояние ввода (заполняется в ui.js, читается симуляцией для управления вселённым воином)
const Input = { keys: {}, sx: 0, sy: 0, wx: 0, wy: 0, lmb: false, rmb: false, inside: false };

const FACTIONS = {
  legion: {
    name: 'Легион', color: '#4f8ff7', dark: '#1d3f8f',
    motto: 'Дисциплина и сталь. Крепкая пехота, меткие лучники и таранный удар кавалерии.',
    units: ['swordsman', 'archer', 'knight'], tower: 'ballista', hero: 'paladin',
  },
  horde: {
    name: 'Орда', color: '#e5484d', dark: '#7d1d20',
    motto: 'Ярость и напор. Дешёвые бойцы звереют в бою, а огры ломают стены.',
    units: ['berserker', 'axethrower', 'ogre'], tower: 'brazier', hero: 'warlord',
  },
  arcane: {
    name: 'Чародеи', color: '#a66bf2', dark: '#4c2590',
    motto: 'Магия и выносливость. Големы держат строй, пироманты жгут толпы, жрецы лечат.',
    units: ['golem', 'pyromancer', 'priest'], tower: 'obelisk', hero: 'archmage',
  },
  mech: {
    name: 'Механисты', color: '#f2a33a', dark: '#8a5210',
    motto: 'Техника и дальнобойность. Рои дронов, снайперы и осадные танки.',
    units: ['drone', 'sniper', 'tank'], tower: 'mortar', hero: 'commander',
  },
};

// range — дистанция атаки от края до края; proj — скорость снаряда (нет = ближний бой)
// armorR — множитель урона от снарядов; bm — множитель урона по зданиям (от 2 — осадный воин, сам идёт ломать здания)
// trample — радиус, в котором удар с разгона задевает всех врагов
const UNITS = {
  // --- Легион ---
  swordsman: { name: 'Мечник', info: 'Щит: получает вдвое меньше урона от снарядов.',
    hp: 180, speed: 85, dmg: 14, range: 8, cd: 0.9, r: 11, cost: 60, time: 5, armorR: 0.5 },
  archer: { name: 'Лучник', info: 'Меткий стрелок: бьёт издалека и больно, но хрупок.',
    hp: 80, speed: 90, dmg: 16, range: 190, cd: 1.1, r: 9, cost: 70, time: 6, proj: 440, pk: 'arrow' },
  knight: { name: 'Рыцарь', info: 'Разгон: удар после рывка наносит двойной урон всем врагам рядом. Таран: +60% урона по зданиям.',
    hp: 260, speed: 150, dmg: 22, range: 10, cd: 1.2, r: 13, cost: 145, time: 9, charge: true, trample: 34, bm: 1.6 },
  // --- Орда ---
  berserker: { name: 'Берсерк', info: 'Ярость: чем меньше здоровья, тем быстрее бьёт.',
    hp: 125, speed: 105, dmg: 13, range: 8, cd: 0.85, r: 10, cost: 50, time: 4.5, rage: true },
  axethrower: { name: 'Метатель', info: 'Мощные броски топоров на средней дистанции.',
    hp: 85, speed: 88, dmg: 24, range: 135, cd: 1.4, r: 10, cost: 65, time: 6, proj: 340, pk: 'axe' },
  ogre: { name: 'Огр', info: 'Удар по площади, тройной урон по зданиям.',
    hp: 520, speed: 60, dmg: 40, range: 10, cd: 1.8, r: 18, cost: 160, time: 12, splash: 40, bm: 3 },
  // --- Чародеи ---
  golem: { name: 'Голем', info: 'Каменный танк, сам восстанавливает здоровье. Кулаки крушат стены: +60% урона по зданиям.',
    hp: 470, speed: 64, dmg: 24, range: 9, cd: 1.3, r: 16, cost: 130, time: 9, regen: 5, bm: 1.6 },
  pyromancer: { name: 'Пиромант', info: 'Огненные шары бьют по площади.',
    hp: 85, speed: 80, dmg: 23, range: 185, cd: 1.7, r: 10, cost: 110, time: 8, proj: 300, pk: 'fire', splash: 46 },
  priest: { name: 'Жрец', info: 'Лечит раненых союзников рядом.',
    hp: 80, speed: 85, dmg: 8, range: 150, cd: 1.0, r: 9, cost: 90, time: 7, proj: 380, pk: 'spark', heal: 19 },
  // --- Механисты ---
  drone: { name: 'Дрон', info: 'Дешёвый и быстрый, летает над препятствиями.',
    hp: 48, speed: 135, dmg: 6, range: 110, cd: 0.45, r: 8, cost: 35, time: 3, proj: 520, pk: 'bullet', fly: true },
  sniper: { name: 'Снайпер', info: 'Огромная дальность и урон, медленная перезарядка.',
    hp: 65, speed: 78, dmg: 55, range: 330, cd: 2.4, r: 9, cost: 120, time: 9, proj: 950, pk: 'tracer' },
  tank: { name: 'Танк', info: 'Броня, залп по площади, урон по зданиям ×3.2.',
    hp: 480, speed: 62, dmg: 38, range: 200, cd: 2.2, r: 18, cost: 220, time: 13, proj: 380, pk: 'shell', splash: 42, bm: 3.2, armorR: 0.7 },
  // --- Герои: по одному на фракцию, призываются в цитадели, растут в уровне и владеют способностью ---
  // герой — боец против войск, а не таран: по зданиям бьёт слабее (bm 0.6), в одиночку башню не возьмёт
  paladin: { name: 'Паладин', hero: true, info: 'Герой Легиона. Молот бьёт по площади, латы вдвое снижают урон от снарядов.',
    hp: 640, speed: 100, dmg: 36, range: 10, cd: 1.0, r: 14, cost: 300, time: 16, armorR: 0.5, regen: 3, splash: 32, bm: 0.6,
    abil: { key: 'light', name: 'Святой свет', info: 'Лечит союзников вокруг и обжигает врагов рядом.', cd: 14, r: 170, heal: 110, dmg: 45 } },
  warlord: { name: 'Вождь', hero: true, info: 'Герой Орды. Бьёт по площади и звереет, теряя здоровье.',
    hp: 780, speed: 95, dmg: 44, range: 11, cd: 1.3, r: 16, cost: 300, time: 16, splash: 36, rage: true, regen: 3, bm: 0.6,
    abil: { key: 'stomp', name: 'Удар оземь', info: 'Ранит всех врагов вокруг и оглушает воинов на 2 секунды.', cd: 12, r: 120, dmg: 70, stun: 2 } },
  archmage: { name: 'Архимаг', hero: true, info: 'Герой Чародеев. Мощные чародейские заряды издалека.',
    hp: 400, speed: 88, dmg: 38, range: 215, cd: 1.4, r: 11, cost: 300, time: 16, proj: 420, pk: 'arcane', regen: 2, bm: 0.6,
    abil: { key: 'meteor', name: 'Метеор', info: 'Обрушивает метеор: огромный урон по площади.', cd: 15, r: 95, dmg: 170, range: 330 } },
  commander: { name: 'Командор', hero: true, info: 'Герой Механистов. Шагающая машина со скорострельными пушками.',
    hp: 700, speed: 82, dmg: 20, range: 185, cd: 0.5, r: 16, cost: 300, time: 16, proj: 620, pk: 'bullet', armorR: 0.7, regen: 2, bm: 0.6,
    abil: { key: 'rockets', name: 'Ракетный залп', info: 'Шесть ракет накрывают площадь.', cd: 14, r: 46, dmg: 48, n: 6, spread: 75, range: 300 } },
};
const HERO_MAX = 5;

// Улучшения исследуются в цитадели по одному, действуют на всю армию игрока
const UPGRADES = {
  atk: { name: 'Оружие', icon: '⚔', info: '+15% к урону всех воинов за уровень.', cost: [150, 250, 380], time: [18, 26, 34] },
  arm: { name: 'Броня', icon: '🛡', info: '+15% к здоровью всех воинов за уровень.', cost: [150, 250, 380], time: [18, 26, 34] },
  eco: { name: 'Добыча', icon: '⛏', info: '+1 золото в секунду с каждой шахты за уровень.', cost: [180, 280, 400], time: [20, 28, 36] },
  fort: { name: 'Форты', icon: '🏰', info: '+1 к лимиту оборонительных башен за уровень (было 3, станет до 6).', cost: [200, 320, 460], time: [22, 30, 38] },
};
function maxTowers(p) { return MAX_TOWERS + ((p.up && p.up.fort) || 0); }
for (const k in UNITS) { const u = UNITS[k]; u.aggro = Math.max(u.range + 70, 230); u.pop = u.hero || u.cost >= 100 ? 2 : 1; if (u.pop > 1 && !u.hero) u.info += ' Занимает 2 места в войске.'; }

// atk: shot — одиночный выстрел, aura — жжёт всех в зоне, chain — цепная молния, lob — навесной залп (есть мёртвая зона)
const BUILDINGS = {
  hq: { name: 'Цитадель', info: 'Главное здание. Потеряешь — проиграл.',
    hp: 3000, r: 46, cost: 0, time: 0, income: 6, atk: 'shot', range: 230, dmg: 22, cd: 0.9, proj: 520, pk: 'bullet' },
  mine: { name: 'Шахта', info: '+3 золота в секунду.',
    hp: 420, r: 26, cost: 150, time: 8, income: 3 },
  barracks: { name: 'Казарма', info: 'Обучает воинов.',
    hp: 950, r: 34, cost: 220, time: 12 },
  ballista: { name: 'Баллиста', info: 'Дальний точный выстрел по одной цели.',
    hp: 760, r: 22, cost: 170, time: 10, atk: 'shot', range: 300, dmg: 48, cd: 1.3, proj: 640, pk: 'bolt', tower: true },
  brazier: { name: 'Жаровня', info: 'Жжёт всех врагов в малой зоне вокруг себя.',
    hp: 900, r: 22, cost: 160, time: 10, atk: 'aura', range: 150, dmg: 16, cd: 0.6, tower: true },
  obelisk: { name: 'Обелиск', info: 'Цепная молния перескакивает на 3 цели.',
    hp: 640, r: 22, cost: 180, time: 10, atk: 'chain', range: 240, dmg: 30, cd: 1.2, tower: true },
  mortar: { name: 'Мортира', info: 'Навесной залп по площади на огромную дальность. Вблизи не стреляет.',
    hp: 660, r: 22, cost: 190, time: 10, atk: 'lob', range: 430, minRange: 120, dmg: 46, cd: 2.8, proj: 260, pk: 'shell', splash: 62, tower: true },
};

const DIFF = {
  easy: { name: 'Лёгкий', income: 0.7, tick: 2.2 },
  normal: { name: 'Обычный', income: 1.0, tick: 1.4 },
  hard: { name: 'Сложный', income: 1.4, tick: 0.9 },
};

// ---------- Звук (простые синтезированные эффекты) ----------
const Sfx = {
  ctx: null, last: 0, on: true,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.on = false; } } },
  play(kind, x, y) {
    if (!this.on || !this.ctx) return;
    const now = performance.now();
    if (now - this.last < 45) return;
    let vol = 0.05;
    if (x !== undefined && typeof UI !== 'undefined') {
      const d = Math.hypot(x - UI.cam.x, y - UI.cam.y);
      vol *= Math.max(0, 1 - d / (900 / UI.cam.zoom));
      if (vol <= 0.002) return;
    }
    this.last = now;
    const P = { shot: [520, 0.06, 'square'], hit: [160, 0.07, 'sawtooth'], boom: [70, 0.35, 'sawtooth'], zap: [900, 0.12, 'square'],
      build: [330, 0.15, 'triangle'], ready: [660, 0.12, 'triangle'], err: [120, 0.15, 'square'], heal: [780, 0.15, 'sine'], alarm: [520, 0.35, 'square'] }[kind];
    if (!P) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = P[2]; o.frequency.setValueAtTime(P[0], t); o.frequency.exponentialRampToValueAtTime(P[0] * 0.5, t + P[1]);
    g.gain.setValueAtTime(vol * (kind === 'boom' ? 2.5 : 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[1]);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + P[1]);
  },
};
