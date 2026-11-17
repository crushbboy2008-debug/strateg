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
    units: ['golem', 'pyromancer', 'priest'], tower: 'obelisk', hero: 'archmage', start: ['golem', 'golem'],
  },
  mech: {
    name: 'Механисты', color: '#f2a33a', dark: '#8a5210',
    motto: 'Техника и дальнобойность. Рои дронов, снайперы и осадные танки.',
    units: ['drone', 'sniper', 'tank'], tower: 'mortar', hero: 'commander', start: ['drone', 'drone', 'drone', 'drone', 'drone'],
  },
};

// range — дистанция атаки от края до края; proj — скорость снаряда (нет = ближний бой)
// armorR — множитель урона от снарядов; bm — множитель урона по зданиям (от 2 — осадный воин, сам идёт ломать здания)
// trample — радиус, в котором удар с разгона задевает всех врагов
const UNITS = {
  // --- Легион ---
  swordsman: { name: 'Мечник', info: 'Щит: получает на четверть меньше урона от снарядов.',
    hp: 195, speed: 85, dmg: 15, range: 8, cd: 0.9, r: 11, cost: 60, time: 5, armorR: 0.75 },
  archer: { name: 'Лучник', info: 'Меткий стрелок: бьёт издалека и больно, но хрупок.',
    hp: 80, speed: 90, dmg: 17, range: 190, cd: 1.1, r: 9, cost: 70, time: 6, proj: 440, pk: 'arrow' },
  knight: { name: 'Рыцарь', info: 'Разгон: удар после рывка наносит двойной урон всем врагам рядом. Таран: +60% урона по зданиям.',
    hp: 260, speed: 150, dmg: 22, range: 10, cd: 1.2, r: 13, cost: 135, time: 9, charge: true, trample: 34, bm: 1.6 },
  // --- Орда ---
  berserker: { name: 'Берсерк', info: 'Ярость: чем меньше здоровья, тем быстрее бьёт.',
    hp: 125, speed: 112, dmg: 13, range: 8, cd: 0.85, r: 10, cost: 50, time: 4.5, rage: true },
  axethrower: { name: 'Метатель', info: 'Мощные броски топоров на средней дистанции.',
    hp: 95, speed: 88, dmg: 24, range: 150, cd: 1.4, r: 10, cost: 65, time: 6, proj: 340, pk: 'axe' },
  ogre: { name: 'Огр', info: 'Удар по площади, тройной урон по зданиям.',
    hp: 520, speed: 60, dmg: 40, range: 10, cd: 1.8, r: 18, cost: 160, time: 12, splash: 40, bm: 3 },
  // --- Чародеи ---
  golem: { name: 'Голем', info: 'Каменный танк, сам восстанавливает здоровье. Кулаки крушат стены: +60% урона по зданиям.',
    hp: 480, speed: 64, dmg: 24, range: 9, cd: 1.3, r: 16, cost: 115, time: 9, regen: 5, bm: 1.6 },
  pyromancer: { name: 'Пиромант', info: 'Огненные шары бьют по площади.',
    hp: 95, speed: 80, dmg: 24, range: 185, cd: 1.7, r: 10, cost: 100, time: 8, proj: 300, pk: 'fire', splash: 46 },
  priest: { name: 'Жрец', info: 'Лечит раненых союзников рядом.',
    hp: 80, speed: 85, dmg: 8, range: 150, cd: 1.0, r: 9, cost: 85, time: 7, proj: 380, pk: 'spark', heal: 19 },
  // --- Механисты ---
  drone: { name: 'Дрон', info: 'Дешёвый и быстрый, летает над препятствиями.',
    hp: 60, speed: 135, dmg: 6, range: 125, cd: 0.45, r: 8, cost: 37, time: 3, proj: 520, pk: 'bullet', fly: true },
  sniper: { name: 'Снайпер', info: 'Огромная дальность и урон, медленная перезарядка.',
    hp: 65, speed: 78, dmg: 48, range: 305, cd: 2.5, r: 9, cost: 115, time: 9, proj: 950, pk: 'tracer' },
  tank: { name: 'Танк', info: 'Броня, залп по площади, урон по зданиям ×3.2.',
    hp: 520, speed: 62, dmg: 35, range: 200, cd: 2.2, r: 18, cost: 230, time: 13, proj: 380, pk: 'shell', splash: 39, bm: 3.2, armorR: 0.7 },
  // --- Герои: по одному на фракцию, призываются в цитадели, растут в уровне и владеют способностью ---
  // герой — боец против войск, а не таран: по зданиям бьёт слабее (bm 0.6), в одиночку башню не возьмёт
  paladin: { name: 'Паладин', hero: true, info: 'Герой Легиона. Молот бьёт по площади, латы на треть снижают урон от снарядов.',
    hp: 640, speed: 100, dmg: 36, range: 10, cd: 1.0, r: 14, cost: 300, time: 16, armorR: 0.65, regen: 3, splash: 32, bm: 0.6,
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
  atk: { name: 'Оружие', icon: 'atk', info: '+15% к урону всех воинов за уровень.', cost: [150, 250, 380], time: [18, 26, 34] },
  arm: { name: 'Броня', icon: 'arm', info: '+15% к здоровью всех воинов за уровень.', cost: [150, 250, 380], time: [18, 26, 34] },
  eco: { name: 'Добыча', icon: 'eco', info: '+1 золото в секунду с каждой шахты за уровень.', cost: [180, 280, 400], time: [20, 28, 36] },
  fort: { name: 'Форты', icon: 'fort', info: '+1 к лимиту оборонительных башен за уровень (было 3, станет до 6).', cost: [200, 320, 460], time: [22, 30, 38] },
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
    hp: 660, r: 22, cost: 190, time: 10, atk: 'lob', range: 410, minRange: 120, dmg: 42, cd: 2.8, proj: 260, pk: 'shell', splash: 62, tower: true },
};

const DIFF = {
  easy: { name: 'Лёгкий', income: 0.7, tick: 2.2 },
  normal: { name: 'Обычный', income: 1.0, tick: 1.4 },
  hard: { name: 'Сложный', income: 1.4, tick: 0.9 },
};

// ---------- Звук: слоёный синтез без файлов (атака + тело + хвост), у каждого звука вариации высоты ----------
// Каждый звук собирается из слоёв: тон с падающей/растущей частотой и шум через фильтр. Дальние звуки глуше и тише, слева/справа — по положению на экране.
const Sfx = {
  ctx: null, master: null, musicBus: null, nz: null, voices: 0, lastK: {}, bufs: {}, holds: {}, held: false,
  // Громкость 0..1: общая, эффекты, музыка. По умолчанию эффекты 60% (это и есть «тихо», как сейчас), общая 100%. Хранится в браузере.
  saved: (typeof Store !== 'undefined' && Store.get('settings')) || {}, // из хранилища Bridge (его загружает boot.js до запуска игры)
  vols: null,
  on: true, // кнопка «звук» игрока: включён или выключен (запоминается)
  load() { // читает сохранённые громкости и состояние кнопки звука (один раз)
    if (this.vols) return;
    const d = { master: 1, fx: 0.6, music: 0.6 };
    for (const k in d) if (typeof this.saved[k] === 'number') d[k] = Math.max(0, Math.min(1, this.saved[k]));
    this.vols = d; this.on = !this.saved.muted;
  },
  setVol(k, v) { this.load(); this.vols[k] = Math.max(0, Math.min(1, v)); this.save(); this.apply(); },
  setOn(b) { this.load(); this.on = !!b; this.save(); this.apply(); if (Music.onHold) Music.onHold(); },
  save() { if (typeof Store !== 'undefined') Store.set('settings', { ...this.vols, muted: !this.on }); },
  // Причины, по которым игра обязана молчать, независимо от кнопки игрока: платформа выключила звук, пауза платформы, реклама, вкладка скрыта.
  // Звук слышен, только когда не действует ни одна. reason: 'platform' | 'pause' | 'ad' | 'hidden'
  setHold(reason, on) {
    this.holds[reason] = !!on;
    const held = Object.values(this.holds).some(Boolean);
    if (held === this.held) return;
    this.held = held;
    if (this.ctx) { if (held) this.ctx.suspend(); else this.ctx.resume(); }
    this.apply(); if (Music.onHold) Music.onHold();
  },
  get audible() { return this.on && !this.held; },
  apply() {
    if (this.master) this.master.gain.value = 0.5 * this.vols.master * this.vols.fx;      // шина эффектов; 100% эффектов — заметно громче, чем «по умолчанию»
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.audible ? this.vols.master * this.vols.music : 0, this.ctx.currentTime, 0.15); // шина музыки (её питает Music); плавно, чтобы не щёлкало
  },
  // Звуки лежат файлами в audio/sfx (mp3). Названия файлов для каждого вида звука; если нужно несколько вариантов — выбирается случайный.
  FILE_GAIN: 2.4, // подгонка: файл (он нормирован под максимум) играет с той же громкостью, что и прежний синтез
  FILES: { hit: ['hit_1', 'hit_2', 'hit_3'], die: ['die_1', 'die_2', 'die_3'], boom: ['boom_1', 'boom_2', 'boom_3'], crumble: ['building_collapse'], build: ['build'], ready: ['ready'], err: ['error'],
    zap: ['lightning'], alarm: ['alarm'], click: ['click'], win: ['victory'], lose: ['defeat'] },
  SHOTS: { arrow: 'shot_arrow', tracer: 'shot_tracer', shell: 'shot_shell', fire: 'shot_fire', axe: 'shot_axe', bolt: 'shot_bolt', spark: 'shot_spark', arcane: 'shot_spark', bullet: 'shot_bullet' },
  fileFor(k, v) {
    const names = k === 'shot' ? [this.SHOTS[v] || 'shot_bullet'] : this.FILES[k];
    if (!names) return null;
    const b = this.bufs[names[Math.floor(Math.random() * names.length)]];
    return b || null; // файл ещё не загрузился или не нашёлся — тогда сыграет запасной синтез
  },
  loadFiles() {
    const all = new Set([...Object.values(this.FILES).flat(), ...Object.values(this.SHOTS)]);
    for (const n of all) fetch('audio/sfx/' + n + '.mp3').then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => this.ctx.decodeAudioData(b)).then(buf => { this.bufs[n] = buf; }).catch(() => {});
  },
  init() {
    this.load();
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.held) this.ctx.resume(); return; }
    try {
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master = c.createGain(); this.musicBus = c.createGain(); this.apply();
      this.master.connect(comp); this.musicBus.connect(comp); comp.connect(c.destination);
      const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.nz = buf;
      if (this.held) c.suspend();
      this.loadFiles();
    } catch (e) { this.ctx = null; }
  },
  // слой-тон: частота плавно идёт от f0 к f1 за dur секунд, громкость быстро растёт и затухает
  tone(out, t, type, f0, f1, dur, vol, delay = 0, atk = 0.004) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), s = t + delay;
    o.type = type; o.frequency.setValueAtTime(f0, s); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), s + dur);
    g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(vol, s + atk); g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    o.connect(g); g.connect(out); o.start(s); o.stop(s + dur + 0.02);
  },
  // слой-шум: белый шум через фильтр, центр которого идёт от f0 к f1
  noise(out, t, ftype, f0, f1, dur, vol, delay = 0, q = 0.8) {
    const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), s = t + delay;
    src.buffer = this.nz; f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, s); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), s + dur);
    g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(vol, s + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(s, Math.random() * 1.5); src.stop(s + dur + 0.02);
  },
  // kind — 'shot:arrow' и т.п.: после двоеточия вариант звука (вид снаряда)
  play(kind, x, y) {
    if (!this.audible || !this.ctx || !this.master) return;
    if (x !== undefined && window.fogBlocks && window.fogBlocks(x, y)) return; // звук из тумана войны не слышен
    const [k, v] = kind.split(':'), def = this.defs[k];
    if (!def) return;
    const now = performance.now();
    if (now - (this.lastK[k] || 0) < def.gap) return;
    let vol = 1, pan = 0, far = 0;
    if (x !== undefined && typeof UI !== 'undefined') {
      const z = UI.cam.zoom || 1, d = Math.hypot(x - UI.cam.x, y - UI.cam.y), R = 1300 / z;
      if (d >= R) return;
      far = d / R; vol *= Math.pow(1 - far, 1.2);
      pan = Math.max(-1, Math.min(1, (x - UI.cam.x) * z / 650)) * 0.65;
      if (vol < 0.02) return;
    }
    if (this.voices > 26 && !def.key) return; // не больше ~26 звуков разом, важные (взрывы, тревога) пропускаем всегда
    this.lastK[k] = now;
    const c = this.ctx, t = c.currentTime + 0.005, out = c.createGain(), lp = c.createBiquadFilter();
    const buf = this.fileFor(k, v); // готовый файл, если загружен; иначе запасной синтез
    out.gain.value = vol * (buf ? this.FILE_GAIN : def.v); lp.type = 'lowpass'; lp.frequency.value = 20000 * (1 - far * 0.85); lp.Q.value = 0.3;
    out.connect(lp);
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; lp.connect(p); p.connect(this.master); } else lp.connect(this.master);
    const r = 0.9 + Math.random() * 0.2; // вариация высоты: два одинаковых выстрела не звучат одинаково
    if (buf) { const s = c.createBufferSource(); s.buffer = buf; s.playbackRate.value = 0.95 + Math.random() * 0.1; s.connect(out); s.start(t); }
    else def.fn.call(this, out, t, r, v);
    this.voices++; setTimeout(() => { this.voices--; }, def.len * 1000 + 80);
  },
  defs: {
    shot: { gap: 28, v: 0.55, len: 0.35, fn(o, t, r, v) {
      if (v === 'arrow') { this.noise(o, t, 'bandpass', 2600 * r, 1200, 0.09, 0.5, 0, 1.2); this.tone(o, t, 'triangle', 720 * r, 300, 0.1, 0.35); }
      else if (v === 'tracer') { this.tone(o, t, 'sine', 190 * r, 48, 0.34, 1.6); this.noise(o, t, 'lowpass', 2000, 260, 0.32, 1.1); this.noise(o, t, 'bandpass', 1500, 700, 0.035, 0.5, 0, 0.7); }
      else if (v === 'shell') { this.tone(o, t, 'sine', 150 * r, 42, 0.32, 1); this.noise(o, t, 'lowpass', 1000, 140, 0.3, 0.9); this.noise(o, t, 'bandpass', 2400, 600, 0.06, 0.4); }
      else if (v === 'fire') { this.noise(o, t, 'bandpass', 380 * r, 1500, 0.4, 1.3, 0, 0.9); this.tone(o, t, 'sawtooth', 110 * r, 60, 0.3, 0.4); }
      else if (v === 'axe') { this.noise(o, t, 'bandpass', 500 * r, 2000, 0.22, 1.1, 0, 1.4); this.tone(o, t, 'sine', 240 * r, 420, 0.16, 0.35); }
      else if (v === 'bolt') { this.tone(o, t, 'sawtooth', 210 * r, 60, 0.16, 0.7); this.tone(o, t, 'sine', 430 * r, 140, 0.2, 0.4); this.noise(o, t, 'bandpass', 1600, 800, 0.12, 0.5); }
      else if (v === 'spark' || v === 'arcane') { this.tone(o, t, 'sine', 1100 * r, 1900, 0.14, 0.35); this.tone(o, t, 'triangle', 550 * r, 1250, 0.18, 0.28); this.noise(o, t, 'highpass', 5000, 5000, 0.05, 0.2); }
      else { this.noise(o, t, 'highpass', 3200, 3200, 0.05, 0.55); this.tone(o, t, 'square', 900 * r, 260, 0.06, 0.16); this.tone(o, t, 'sine', 200 * r, 90, 0.06, 0.3); }
    } },
    hit: { gap: 32, v: 0.7, len: 0.2, fn(o, t, r) {
      this.noise(o, t, 'lowpass', 1800, 260, 0.1, 0.8); this.tone(o, t, 'sine', 170 * r, 55, 0.12, 0.8);
      if (Math.random() < 0.5) { this.tone(o, t, 'square', 1900 * r, 1500, 0.07, 0.07, 0.005); this.tone(o, t, 'square', 2430 * r, 2100, 0.06, 0.05, 0.005); }
    } },
    die: { gap: 55, v: 0.55, len: 0.3, fn(o, t, r) { this.noise(o, t, 'lowpass', 1000, 180, 0.2, 0.7); this.tone(o, t, 'sine', 210 * r, 65, 0.22, 0.6); } },
    boom: { gap: 45, v: 1, len: 0.9, key: true, fn(o, t, r) {
      this.noise(o, t, 'lowpass', 2800, 110, 0.75, 1.1); this.tone(o, t, 'sine', 115 * r, 30, 0.7, 1.2); this.noise(o, t, 'bandpass', 3200, 900, 0.07, 0.6); this.noise(o, t, 'lowpass', 500, 70, 0.9, 0.5, 0.05);
    } },
    crumble: { gap: 120, v: 1, len: 1.5, key: true, fn(o, t, r) {
      this.noise(o, t, 'lowpass', 700, 50, 1.3, 1); this.tone(o, t, 'sine', 80 * r, 26, 1.1, 1.1);
      for (let i = 0; i < 4; i++) this.noise(o, t, 'bandpass', 900 + Math.random() * 900, 300, 0.12, 0.5, 0.12 + i * 0.17 + Math.random() * 0.08, 1.2);
    } },
    build: { gap: 70, v: 0.8, len: 0.5, fn(o, t, r) {
      for (let i = 0; i < 2; i++) { this.tone(o, t, 'triangle', 330 * r, 190, 0.09, 0.8, i * 0.16); this.noise(o, t, 'bandpass', 1900, 900, 0.05, 0.7, i * 0.16, 1.5); }
    } },
    ready: { gap: 90, v: 0.6, len: 0.6, key: true, fn(o, t) { this.tone(o, t, 'sine', 523, 523, 0.3, 0.6); this.tone(o, t, 'sine', 784, 784, 0.45, 0.6, 0.1); this.tone(o, t, 'triangle', 1568, 1568, 0.3, 0.12, 0.1); } },
    err: { gap: 120, v: 0.5, len: 0.25, fn(o, t) { this.tone(o, t, 'square', 190, 120, 0.2, 0.5); this.tone(o, t, 'square', 143, 90, 0.2, 0.4); } },
    zap: { gap: 55, v: 0.6, len: 0.3, fn(o, t, r) { this.tone(o, t, 'sawtooth', 1900 * r, 140, 0.22, 0.5); this.noise(o, t, 'bandpass', 4200, 1500, 0.18, 0.7, 0, 2); this.tone(o, t, 'square', 70 * r, 50, 0.16, 0.3); } },
    alarm: { gap: 2500, v: 0.7, len: 0.8, key: true, fn(o, t) {
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; f.connect(o);
      this.tone(f, t, 'sawtooth', 392, 392, 0.3, 0.7); this.tone(f, t, 'sawtooth', 294, 294, 0.38, 0.7, 0.3);
    } },
    click: { gap: 25, v: 0.45, len: 0.1, fn(o, t) { this.tone(o, t, 'square', 1000, 520, 0.04, 0.5); this.noise(o, t, 'highpass', 4000, 4000, 0.02, 0.4); } },
    win: { gap: 500, v: 0.8, len: 1.8, key: true, fn(o, t) { [523, 659, 784, 1047].forEach((f, i) => { this.tone(o, t, 'triangle', f, f, 0.7, 0.55, i * 0.14); this.tone(o, t, 'sine', f * 2, f * 2, 0.5, 0.12, i * 0.14); }); } },
    lose: { gap: 500, v: 0.8, len: 2, key: true, fn(o, t) {
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; f.connect(o);
      [392, 330, 262, 196].forEach((fr, i) => this.tone(f, t, 'sawtooth', fr, fr * 0.97, 0.8, 0.5, i * 0.2));
    } },
  },
};

Sfx.load();

// ---------- Музыка: сочиняется на ходу, с ритмом и мелодией, почти не повторяется ----------
// Такт за тактом: бас на сильных долях, перебор нот аккорда (арфа), мелодия короткими фразами и тихий пэд для тепла.
// В бою добавляются тихие барабаны. Раз в 6–10 тактов меняется «насыщенность»: то только бас и пэд, то + арфа, то + мелодия.
// Мелодия то повторяет прошлую фразу с поправками, то придумывает новую. Тональность медленно уходит. Всё идёт через Sfx.musicBus.
const Music = {
  running: false, mode: 'menu', timer: null, tBar: 0, bpm: 76, key: 41, chord: 'i', cur: null, left: 6, barNo: 0, level: 1, levelLeft: 6, mi: 0, motif: null,
  CH: { i: [0, 3], III: [3, 4], iv: [5, 3], v: [7, 3], VI: [8, 4], VII: [10, 4] }, // смещение корня и размер терции (3 — минор, 4 — мажор)
  NEXT: { i: ['VI', 'VII', 'iv', 'III'], VI: ['III', 'VII', 'i', 'iv'], III: ['VII', 'VI', 'iv', 'i'], VII: ['i', 'III', 'VI'], iv: ['i', 'VI', 'VII', 'v'], v: ['i', 'VI'] },
  SCALE: [0, 2, 3, 5, 7, 8, 10],
  hz: m => 440 * Math.pow(2, (m - 69) / 12),
  rnd: (a, b) => a + Math.random() * (b - a),
  pick: a => a[Math.floor(Math.random() * a.length)],
  // ---- плейлист из готовых MP3 (audio/music): треки идут вперемешку, один перетекает в другой без паузы ----
  // Каждый файл уже записан с плавным началом (2 с) и концом (6 с); следующий трек запускается за 6,5 с до конца предыдущего,
  // так что стык — это «растворение» одного в другом. Смена меню ↔ бой — перекрёстное затухание за 3 с.
  // Если файлы не загрузились, играет сочинитель на лету (startGen).
  TRACKS: { menu: ['menu_1', 'menu_2', 'menu_3'], match: ['battle_1', 'battle_2', 'battle_3'] },
  files: true, slots: null, now: null, bag: { menu: [], match: [] }, lastName: '', wantPlay: false,
  start(now) {
    if (this.running) return;
    if (!this.files) return this.startGen(now);
    const c = Sfx.ctx;
    if (!c || !Sfx.musicBus) return;
    this.running = true;
    this.slots = [0, 1].map(() => {
      const el = new Audio(); el.preload = 'auto';
      const g = c.createGain(); g.gain.value = 0; c.createMediaElementSource(el).connect(g); g.connect(Sfx.musicBus);
      const s = { el, g };
      el.onerror = () => this.fail();
      el.onended = () => { if (this.now !== s) { el.pause(); } else this.now = null; };
      return s;
    });
    this.fileNext(0.05);
    this.timer = setInterval(() => this.fileTick(), 500);
  },
  fail() { // файл не найден или не воспроизводится — переходим на сочинителя
    if (!this.files) return;
    this.files = false; clearInterval(this.timer);
    for (const s of this.slots || []) { try { s.el.pause(); s.el.removeAttribute('src'); } catch (e) {} }
    this.running = false; this.slots = null; this.now = null; this.start();
  },
  nextName() { // «мешок»: треки режима идут в случайном порядке, пока не прозвучат все; один и тот же подряд не повторяется
    const b = this.bag[this.mode];
    if (!b.length) { const l = this.TRACKS[this.mode].slice().sort(() => Math.random() - 0.5); if (l[0] === this.lastName && l.length > 1) l.push(l.shift()); b.push(...l); }
    return this.lastName = b.shift();
  },
  fileNext(fade) {
    const c = Sfx.ctx, old = this.now, s = this.slots.find(x => x !== old) || this.slots[0];
    s.el.src = 'audio/music/' + this.nextName() + '.mp3'; s.el.currentTime = 0;
    const p = s.el.play(); if (p && p.catch) p.catch(() => { this.wantPlay = true; }); // браузер без жеста не даст играть — повторим при следующем клике
    s.g.gain.cancelScheduledValues(c.currentTime); s.g.gain.setValueAtTime(fade > 0.1 ? 0.0001 : 1, c.currentTime); if (fade > 0.1) s.g.gain.linearRampToValueAtTime(1, c.currentTime + fade);
    if (old && fade > 0.1) { old.g.gain.cancelScheduledValues(c.currentTime); old.g.gain.setValueAtTime(old.g.gain.value, c.currentTime); old.g.gain.linearRampToValueAtTime(0, c.currentTime + fade); setTimeout(() => { if (this.now !== old) old.el.pause(); }, fade * 1000 + 100); }
    this.now = s;
  },
  fileTick() {
    if (!this.files || !this.slots) return;
    const s = this.now;
    if (Sfx.held) return; // на паузе платформы/рекламы/скрытой вкладки плейлист стоит
    if (this.wantPlay && s) { this.wantPlay = false; const p = s.el.play(); if (p && p.catch) p.catch(() => { this.wantPlay = true; }); }
    if (!s || (isFinite(s.el.duration) && s.el.duration > 20 && s.el.duration - s.el.currentTime < 6.5 && !this.handoff)) {
      this.handoff = true; this.fileNext(0.05); setTimeout(() => { this.handoff = false; }, 9000); // старый трек доиграет свой затухающий хвост сам
    }
  },
  startGen(now) {
    const c = Sfx.ctx;
    if (this.running || !c || !Sfx.musicBus) return;
    this.running = true;
    this.bus = c.createGain(); this.bus.gain.value = 0.7; this.bus.connect(Sfx.musicBus);
    // эхо: задержка с затухающей обратной связью и срезом верха
    this.send = c.createGain(); this.send.gain.value = 0.5;
    const dl = c.createDelay(2), fb = c.createGain(), fl = c.createBiquadFilter();
    dl.delayTime.value = 0.45; fb.gain.value = 0.38; fl.type = 'lowpass'; fl.frequency.value = 1800;
    this.send.connect(dl); dl.connect(fl); fl.connect(fb); fb.connect(dl); fl.connect(this.bus);
    this.padLp = c.createBiquadFilter(); this.padLp.type = 'lowpass'; this.padLp.frequency.value = 900; this.padLp.connect(this.bus);
    this.bpm = this.rnd(66, 80); this.key = this.pick([38, 40, 41, 43, 45]); this.chord = 'i'; this.left = 3 + Math.floor(Math.random() * 3);
    this.level = 1; this.levelLeft = 4; this.tBar = c.currentTime + (now ? 0.1 : 1.5);
    this.timer = setInterval(() => this.tick(), 400);
  },
  // платформа, реклама или скрытая вкладка заставили молчать: плейлист ставим на паузу, потом продолжаем с того же места
  onHold() {
    if (!this.running || !this.files || !this.slots) return;
    for (const s of this.slots) { if (Sfx.held) s.el.pause(); else if (s === this.now) { const p = s.el.play(); if (p && p.catch) p.catch(() => { this.wantPlay = true; }); } }
  },
  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    if (this.running && this.files && this.slots) this.fileNext(3); // меню ↔ бой: плавный переход на трек нового режима
  },
  tick() {
    const c = Sfx.ctx;
    if (!c || !this.running) return;
    const now = c.currentTime;
    if (!Sfx.audible || Sfx.vols.master * Sfx.vols.music < 0.01) { this.tBar = Math.max(this.tBar, now + 0.5); return; } // выключено — ничего не планируем
    if (this.tBar < now - 1) this.tBar = now + 0.3; // вкладку усыпляли: не наверстываем пропущенное
    while (this.tBar < now + 2.5) this.playBar(this.tBar);
  },
  // один такт (4 доли). Аккорд меняется каждые два такта
  playBar(t) {
    const match = this.mode === 'match', beat = 60 / (this.bpm * (match ? 1.08 : 1)), bar = beat * 4;
    const odd = this.barNo % 2 === 0; // первый такт пары — здесь выбираем новый аккорд
    if (odd) { this.nextChord(); this.pad(t, bar * 2 + 1.5); }
    this.barNo++;
    if (--this.levelLeft <= 0) { this.levelLeft = 6 + Math.floor(Math.random() * 5); this.level = this.pick([0, 1, 1, 2, 2]); }
    const [off, third] = this.CH[this.chord], r = this.key + off, ct = [r + 12, r + 12 + third, r + 19, r + 24, r + 24 + third, r + 31];
    // бас: корень на первую долю, иногда квинта на третью
    this.bass(r, t, 0.16, beat * 3);
    if (Math.random() < 0.55) this.bass(r + 7, t + beat * 2, 0.1, beat * 2);
    if (Math.random() < 0.25) this.bass(r, t + beat * 3.5, 0.08, beat);
    // арфа: восьмые по нотам аккорда, шаг то вверх, то вниз; на сильных долях чуть громче
    if (this.level >= 1) {
      let i = Math.floor(Math.random() * 3);
      for (let k = 0; k < 8; k++) {
        if (Math.random() < 0.18) continue;
        i = Math.max(0, Math.min(ct.length - 1, i + this.pick([1, 1, 2, -1, -1, -2, 0])));
        this.pluck(ct[i], t + k * beat * 0.5, (k % 2 ? 0.05 : 0.075) * this.rnd(0.85, 1.15));
      }
    }
    // мелодия: короткая фраза на такт, то новая, то повтор прошлой с поправками; иногда такт молчит
    if (this.level >= 2 && Math.random() < 0.72) this.melody(t, beat, ct);
    else if (this.level === 1 && Math.random() < 0.22) this.melody(t, beat, ct, true);
    // барабаны — только в бою, тихо: удар на первую долю, изредка на третью
    if (match) {
      this.drum(t, 0.3); if (Math.random() < 0.6) this.drum(t + beat * 2, 0.2); if (this.level >= 1 && Math.random() < 0.4) this.drum(t + beat * 3.5, 0.12);
    }
    this.tBar = t + bar;
  },
  nextChord() {
    if (this.cur) {
      this.chord = this.pick(this.NEXT[this.chord]);
      if (--this.left <= 0) {
        this.left = 3 + Math.floor(Math.random() * 4); this.key += this.pick([-2, 2, 5, -5, 7, -7]);
        this.key = 36 + (((this.key - 36) % 12) + 12) % 12; // тональность остаётся в одной октаве
      }
    }
    this.cur = { key: this.key, chord: this.chord };
  },
  melody(t, beat, ct, calm) {
    const pool = [];
    for (let m = 60; m <= 86; m++) if (this.SCALE.includes(((m - this.key) % 12 + 12) % 12)) pool.push(m);
    const [off, third] = this.CH[this.chord], tones = [off, off + third, off + 7].map(x => x % 12);
    let ph;
    if (this.motif && Math.random() < 0.45) { // повтор прошлой фразы: сдвиг по лестнице лада и одна нота заменена
      const sh = this.pick([0, 0, 1, -1, 2]); ph = this.motif.map(n => ({ d: n.d, s: n.s, rest: n.rest }));
      const k = Math.floor(Math.random() * ph.length); if (!ph[k].rest) ph[k].s += this.pick([-1, 1, 2]);
      ph.forEach(n => { n.s += sh; });
    } else {
      // новая фраза: длительности (в долях) подбираются на ровно 4 доли
      const fits = [[1, 1, 1, 1], [1, 0.5, 0.5, 1, 1], [1.5, 0.5, 1, 1], [2, 1, 1], [0.5, 0.5, 1, 2], [1, 1, 2], [0.5, 0.5, 0.5, 0.5, 2], [3, 1], [2, 2]];
      const durs = this.pick(fits); let s = 0;
      ph = durs.map((d, i) => { s += this.pick([-2, -1, -1, 1, 1, 2, 3, -3, 0]); return { d, s, rest: i > 0 && Math.random() < 0.18 }; });
    }
    this.motif = ph.map(n => ({ d: n.d, s: n.s, rest: n.rest }));
    let at = 0;
    for (const n of ph) {
      if (!n.rest) {
        let idx = Math.max(0, Math.min(pool.length - 1, (this.mi + n.s)));
        if (at === 0 || Math.random() < 0.4) { let best = idx, bd = 99; pool.forEach((m, i) => { if (tones.includes(((m - this.key) % 12 + 12) % 12) && Math.abs(i - idx) < bd) { bd = Math.abs(i - idx); best = i; } }); idx = best; } // сильные доли — на нотах аккорда
        this.lead(pool[idx], t + at * beat, n.d * beat * 0.95, (calm ? 0.06 : 0.09) * this.rnd(0.9, 1.1));
      }
      at += n.d;
    }
    // фраза уходит на середину диапазона, чтобы мелодия не ползла в одну сторону
    const mid = Math.floor(pool.length * 0.45), last = Math.max(0, Math.min(pool.length - 1, this.mi + ph.reduce((a, n) => a + n.s, 0)));
    this.mi = Math.round((last + mid * 2) / 3);
  },
  // ---- голоса ----
  env(g, t, v, atk, len) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + len); },
  osc(type, f, t, len, dest, v, atk, sendAmt) {
    const c = Sfx.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; this.env(g, t, v, atk, len);
    o.connect(g); g.connect(dest); if (sendAmt) { const s = c.createGain(); s.gain.value = sendAmt; g.connect(s); s.connect(this.send); }
    o.start(t); o.stop(t + len + 0.05);
  },
  pluck(m, t, v) { const f = this.hz(m); this.osc('triangle', f, t, 0.7, this.bus, v, 0.004, 0.45); this.osc('sine', f * 2, t, 0.35, this.bus, v * 0.35, 0.004, 0.3); },
  bass(m, t, v, len) { const f = this.hz(m); this.osc('sine', f, t, len, this.bus, v, 0.012, 0); this.osc('triangle', f * 2, t, len * 0.5, this.bus, v * 0.35, 0.012, 0); },
  lead(m, t, len, v) {
    const f = this.hz(m), l = Math.max(0.35, len + 0.35);
    this.osc('triangle', f, t, l, this.bus, v, 0.035, 0.5); this.osc('sine', f * 2, t, l * 0.7, this.bus, v * 0.2, 0.035, 0.4);
  },
  drum(t, v) {
    const c = Sfx.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.5);
  },
  // пэд: два такта тёплого фона из трёх нот аккорда, очень тихо — он только «склеивает» смену аккордов
  pad(t, len) {
    const c = Sfx.ctx, [off, third] = this.CH[this.chord], r = this.key + off + 12;
    for (const m of [r, r + third, r + 7]) {
      for (const det of [0.997, 1.003]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'triangle'; o.frequency.value = this.hz(m) * det;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 1.2); g.gain.setValueAtTime(0.018, t + len - 1.5); g.gain.linearRampToValueAtTime(0.0001, t + len);
        o.connect(g); g.connect(this.padLp); o.start(t); o.stop(t + len + 0.05);
      }
    }
  },
  info() { return this.cur ? 'тональность ' + this.cur.key + ', аккорд ' + this.cur.chord + ', темп ' + Math.round(this.bpm) + ', слоёв: ' + (this.level + 1) : '—'; },
};
