// ---------- 3D-отрисовка (Three.js), камера, ввод и интерфейс ----------
import * as THREE from '../lib/three.module.js';
import { createEnvironment, buildTerrain, groundPatch } from './world.js';
import { makeBaseDeco } from './basedeco.js';
import { makeUnit, makeBuilding, makeObstacles, makeDecor, makeBaseWalls, makeProp, makeProj, animate, loadSkinned, loadStyles, SKINNED_UNITS, LIT, FLASH } from './models.js';
import { createEffects } from './effects.js';
import { portrait } from './portraits.js';
import { initTouch } from './touch.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), ov = $('ov'), octx = ov.getContext('2d'), mini = $('mini'), mctx = mini.getContext('2d');
let VW = 1, VH = 1;

const UI = { sel: [], placing: null, drag: null, paused: false, locked: false, cam: { x: 0, y: 0, dist: 900, zoom: 1 },
  menu: { faction: 'legion', bots: 2, diff: 'normal', map: 'island' },
  net: { on: false, busy: false, msg: '', code: '', coop: false } };
window.UI = UI;
UI.shake = 0;
UI.camp = { on: false, sel: 0, saved: null }; // режим «Кампания»: выбранная миссия и сохранённый выбор из меню одиночной игры
// Прошлый выбор в меню и счётчик побед — из хранилища площадки (проверяем, что значения ещё существуют)
{
  const pr = Store.get('profile'), l = pr && pr.last;
  if (l) {
    if (FACTIONS[l.faction]) UI.menu.faction = l.faction;
    if (MAPS[l.map]) UI.menu.map = l.map;
    if (DIFF[l.diff]) UI.menu.diff = l.diff;
    if (l.bots >= 1 && l.bots <= 3) UI.menu.bots = l.bots | 0;
  }
}
const profile = () => Store.get('profile') || { wins: 0, matches: 0, last: null };

// Значки улучшений нарисованы векторно (emoji в интерфейсе площадка не принимает): цвет берётся из текста кнопки
const SVG = b => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" stroke-linejoin="miter">${b}</svg>`;
const UPICON = {
  atk: SVG('<path d="M13.4 2.6 6.6 9.4"/><path d="M4.6 7.4l4 4"/><path d="M6.6 9.4 3.2 12.8"/>'),                    // меч
  arm: SVG('<path d="M8 1.8 13.2 3.6V8c0 2.8-2.2 4.8-5.2 6.1C5 12.8 2.8 10.8 2.8 8V3.6z" fill="currentColor" stroke="none"/>'), // щит
  eco: SVG('<path d="M3 13.2 10.6 5.6"/><path d="M5.2 3.6C8.4 2 12 3.2 13.6 6.8"/>'),                              // кирка
  fort: SVG('<path d="M3 14V6h2V4h2v2h2V4h2v2h2v8z" fill="currentColor" stroke="none"/>'),                          // башня
};
// Гаечный ключ над чинящимся зданием рисуется на холсте линиями
function drawWrench(g, x, y) {
  g.save(); g.translate(x, y); g.rotate(-0.8); g.lineCap = 'round';
  for (const [w, c] of [[5, 'rgba(0,0,0,.8)'], [2.6, '#fff']]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(-6, 6); g.lineTo(2, -2); g.stroke(); g.beginPath(); g.arc(4.2, -4.2, 3.6, 0.9, 5.4); g.stroke(); }
  g.restore();
}

// ================= Сцена =================
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9cdea');
scene.fog = new THREE.Fog('#a9cdea', 1800, 5200);
const camera = new THREE.PerspectiveCamera(45, 1, 5, 26000);
const hemi = new THREE.HemisphereLight('#dcecff', '#7a8452', 1.5);
scene.add(hemi);
const fill = new THREE.DirectionalLight('#bcd4ff', 0.55);
fill.position.set(-400, 500, -600);
scene.add(fill);
const sun = new THREE.DirectionalLight('#ffe6bd', 3.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 100; sun.shadow.camera.far = 4000;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 1.5;
scene.add(sun, sun.target);

const env = createEnvironment(scene);
let terrain = null;
function setTerrain(hqs) {
  if (terrain) { scene.remove(terrain.mesh); terrain.dispose(); }
  terrain = buildTerrain(hqs, G.map);
  scene.add(terrain.mesh);
  env.mood(G.map.mood); // небо, туман, вода и светлячки под настроение карты
  const s = G.map.sun || ['#ffe6bd', 3.3], h = G.map.hemi || ['#dcecff', '#7a8452', 1.5]; // свет под настроение карты
  sun.color.set(s[0]); sun.intensity = s[1]; hemi.color.set(h[0]); hemi.groundColor.set(h[1]); hemi.intensity = h[2];
}

// ---- кэш геометрий и материалов ----
const GC = {}, MC = {};
function geo(kind, ...a) {
  const k = kind + a.join(',');
  if (GC[k]) return GC[k];
  let g;
  switch (kind) {
    case 'box': g = new THREE.BoxGeometry(...a); break;
    case 'cyl': g = new THREE.CylinderGeometry(...a); break;
    case 'sph': g = new THREE.SphereGeometry(a[0], 12, 9); break;
    case 'cone': g = new THREE.ConeGeometry(...a); break;
    case 'tor': g = new THREE.TorusGeometry(...a); break;
    case 'ring': g = new THREE.RingGeometry(...a); break;
    case 'dod': g = new THREE.DodecahedronGeometry(a[0], 0); break;
    case 'oct': g = new THREE.OctahedronGeometry(a[0], 0); break;
  }
  return GC[k] = g;
}
const ringMatSel = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
const ringMatHero = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });

function addRing(g, r) {
  const ring = new THREE.Mesh(geo('ring', r * 1.2, r * 1.42, 28), ringMatSel);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 1.2; ring.visible = false;
  ring.renderOrder = 11; // кольцо выбора рисуется после напольного оформления баз, иначе оно прячется под ним
  g.add(ring); g.userData.ring = ring;
}

// ================= Модели (сами модели — в models.js) =================
function wrap(e, model, ringR) {
  const g = new THREE.Group(), b = new THREE.Group();
  b.add(model); g.add(b);
  g.userData.body = b; g.userData.model = model; g.userData.rot = -(e.face || 0);
  addRing(g, ringR);
  return g;
}
function buildUnit(u) { const p = G.players[u.owner]; return wrap(u, makeUnit(u.type, p.faction, p.fac, UNITS[u.type].speed), u.r); }
function buildBld(e) { const p = G.players[e.owner], g = wrap(e, makeBuilding(e.type, p.faction, p.fac), e.r * 0.95); g.add(groundPatch(e.r)); return g; }

let natureGroups = [], propMeshes = [];
// bases — где стоят цитадели: [{ x, y, fac, f }]; в бою это игроки, в меню — одна показная база
function buildObstacles(bases = G.players.map(p => ({ x: p.hq.x, y: p.hq.y, fac: p.faction, f: p.fac }))) {
  for (const g of natureGroups) { scene.remove(g); g.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
  for (const m of propMeshes) scene.remove(m.g);
  const avoid = G.obstacles.concat(bases.map(b => ({ x: b.x, y: b.y, r: 78 })), G.props.filter(q => q.r).map(q => ({ x: q.x, y: q.y, r: q.r + 6 })));
  natureGroups = [makeObstacles(G.obstacles, G.map), makeDecor(WORLD.w, WORLD.h, avoid, G.map),
    makeBaseWalls(bases, WORLD.w, WORLD.h), // крепостные стены за базами — только украшение
    makeBaseDeco(bases)]; // оформление базы: площадка и декор у каждой фракции свои (только картинка, в расчёт игры не входит)
  scene.add(...natureGroups);
  // убранство баз: отдельные модели, чтобы их можно было убрать при застройке
  propMeshes = G.props.map(q => {
    const g = makeProp(q.type, q.fac, FACTIONS[q.fac]);
    g.position.set(q.x, 0, q.y); g.rotation.y = Math.PI / 2 - q.face;
    scene.add(g);
    return { g, q };
  });
}
function syncProps(t, dt) {
  for (const m of propMeshes) {
    if (m.q.dead) m.g.visible = false;
    else if (m.q.kind === 'unit' || m.g.userData.anim.length) animate(m.g, m.q, t, dt);
  }
}
// Фон меню: база выбранной фракции на выбранной карте — цитадель, постройки, отряд у ворот и стена за спиной.
// Это только картинка: в симуляцию ничего не попадает, модели лежат рядом с убранством и убираются вместе с ним.
let menuBase = null;
function previewMap() {
  const map = G.map = MAPS[UI.menu.map], W = WORLD.w = WORLD.h = map.size;
  Object.assign(G, { running: false, ents: [], units: [], blds: [], projs: [], fx: [], parts: [], obstacles: [], props: [], players: [], nextId: 1 });
  G.seed = G.seed || [Math.random() * 100, Math.random() * 100];
  const fk = UI.menu.faction, f = FACTIONS[fk];
  // база в том углу (или у той стороны), где солнце освещает её со стороны камеры
  const x = map.lay === 'cross' ? W / 2 : 480, y = 480, a = Math.atan2(W / 2 - y, W / 2 - x);
  menuBase = { x, y, a };
  baseDecor({ faction: fk, idx: 0 }, x, y, a);
  for (let tries = 0; G.obstacles.length < map.obst && tries < 9000; tries++) {
    const o = { x: rand(80, W - 80), y: rand(80, W - 80), r: rand(22, 44), tree: Math.random() < map.treeP, seed: Math.random() };
    if (o.tree) o.kind = map.trees[Math.floor(Math.random() * map.trees.length)]; else { o.kind = 'rock'; o.r *= map.rockMul || 1; }
    if (Math.hypot(o.x - x, o.y - y) < 540 || G.obstacles.some(q => dist(o, q) < o.r + q.r + (map.gap || 90))) continue;
    G.obstacles.push(o);
  }
  clearScene(); setTerrain([{ x, y, ground: BASE_GROUND[fk] }]);
  G.obstacles = G.obstacles.filter(o => terrain.roadDist(o.x, o.y) > o.r + 48);
  const at = (b, d) => [x + Math.cos(a + b) * d, y + Math.sin(a + b) * d];
  const blds = [['hq', 0, 0], ['barracks', 1.32, 205], ['mine', -1.32, 205], [f.tower, -0.72, 285]].map(([t, b, d]) => ({ t, p: at(b, d), r: BUILDINGS[t].r }));
  for (const q of G.props) if (q.r && blds.some(b => Math.hypot(q.x - b.p[0], q.y - b.p[1]) < b.r + q.r + 14)) q.dead = true;
  buildObstacles([{ x, y, fac: fk, f }]);
  const put = (g, p, rot, q) => { g.position.set(p[0], g.position.y, p[1]); g.rotation.y = rot; scene.add(g); propMeshes.push({ g, q }); };
  for (const b of blds) {
    put(makeBuilding(b.t, fk, f), b.p, Math.PI / 2 - a, { kind: 'bld', id: 1, fire: 0, aim: a, dead: false });
    const patch = groundPatch(b.r); patch.userData.anim = [];
    patch.position.set(b.p[0], 0.35, b.p[1]); scene.add(patch); propMeshes.push({ g: patch, q: { dead: false } });
  }
  // отряд перед воротами: герой впереди, воины в ряд за ним
  const row = [[f.hero, 150, 0], ...[-1.5, -0.5, 0.5, 1.5].map((k, i) => [f.units[i % 2], 108, k * 0.3])];
  row.forEach(([t, d, b], i) => put(makeUnit(t, fk, f, UNITS[t].speed), at(b, d), -a, { kind: 'unit', id: i + 2, type: t, swing: 0, moving: false, fire: 0, dead: false }));
  drawMapPrev();
}
// Картинка карты в меню: вид сверху и места четырёх баз
function drawMapPrev() {
  const cv = $('mapPrev'), g = cv.getContext('2d'), s = cv.width, m = 480 / WORLD.w * s;
  g.drawImage(terrain.mini, 0, 0, s, s);
  const spots = G.map.lay === 'cross' ? [[s / 2, s - m], [s / 2, m], [m, s / 2], [s - m, s / 2]] : [[m, s - m], [s - m, m], [m, m], [s - m, s - m]];
  for (const [x, y] of spots) {
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
    g.fillStyle = '#17171b'; g.fillRect(-9, -9, 18, 18);
    g.fillStyle = '#f0dfae'; g.fillRect(-6, -6, 12, 12);
    g.restore();
  }
}

// ================= Синхронизация сцены с симуляцией =================
const entMesh = new Map(), projMesh = new Map(), dying = [];
let frameId = 0;

function clearScene() {
  for (const m of entMesh.values()) scene.remove(m);
  for (const m of projMesh.values()) scene.remove(m);
  for (const d of dying) scene.remove(d.g);
  entMesh.clear(); projMesh.clear(); dying.length = 0;
  for (const s of stains) { scene.remove(s.m); s.m.material.dispose(); }
  stains.length = 0;
  effects.clear();
}

function syncEnts(t, dt) {
  const sel = new Set(UI.sel);
  for (const e of G.ents) {
    if (e.dead) continue;
    let g = entMesh.get(e);
    if (!g) { g = e.kind === 'unit' ? buildUnit(e) : buildBld(e); scene.add(g); entMesh.set(e, g); }
    g.userData.seen = frameId;
    g.position.set(e.x, 0, e.y);
    g.visible = !fogHides(e); // туман войны: чужое вне обзора не рисуем
    const ud = g.userData, hero = e === G.possessed;
    ud.ring.visible = hero || sel.has(e);
    ud.ring.material = hero ? ringMatHero : ringMatSel;
    const fo = e.flash > 0, fl = fo ? 1.05 : 1;
    if (fo !== !!ud.flashOn) { // вспышка при попадании: на мгновение подсвечиваем модель белым
      ud.flashOn = fo;
      ud.model.traverse(o => {
        if (!o.isMesh) return;
        if (o.material === LIT || o.material === FLASH) o.material = fo ? FLASH : LIT;
        else if (o.userData.matFlash) o.material = fo ? o.userData.matFlash : o.userData.matBase; // модель с текстурой
      });
    }
    if (e.kind === 'unit') {
      const want = -e.face;
      if (hero) ud.rot = want;
      else { const d = ((want - ud.rot + Math.PI) % TAU + TAU) % TAU - Math.PI; ud.rot += d * Math.min(1, dt * 14); }
      ud.body.rotation.y = ud.rot;
      animate(ud.model, e, t, dt);
      ud.body.position.y = e.fly ? Math.sin(t * 3 + e.id) * 3 : Math.abs(Math.sin(ud.model.userData.ph)) * ud.model.userData.mv * e.r * 0.1;
      ud.body.scale.setScalar(fl);
    } else {
      ud.body.scale.set(fl, (0.25 + 0.75 * e.build) * fl, fl);
      animate(ud.model, e, t, dt);
    }
  }
  for (const [e, g] of entMesh) if (g.userData.seen !== frameId) { entMesh.delete(e); g.userData.ring.visible = false; dying.push({ g, e, t: 0, side: Math.random() < 0.5 ? 1 : -1 }); }
}

function syncProjs(t) {
  for (const p of G.projs) {
    let m = projMesh.get(p);
    if (!m) { m = makeProj(p.kind); scene.add(m); projMesh.set(p, m); }
    m.userData.seen = frameId;
    m.position.set(p.x, p.h, p.y);
    m.visible = !Fog.on || fogSees(p.x, p.y);
    m.rotation.y = -p.ang;
    if (p.kind === 'axe') m.rotation.z = -t * 16;
  }
  for (const [p, m] of projMesh) if (m.userData.seen !== frameId) { scene.remove(m); projMesh.delete(p); }
}

const effects = createEffects(scene, renderer, camera, (x, y) => Fog.on && !fogSees(x, y));
window.fogBlocks = (x, y) => Fog.on && !fogSees(x, y);

// Убитые не исчезают мгновенно: воины падают, техника остаётся остовом, здания оседают
const wreckMat = new THREE.MeshLambertMaterial({ color: '#2a2826', flatShading: true });
function updateDying(dt) {
  for (let i = dying.length - 1; i >= 0; i--) {
    const d = dying[i], g = d.g, b = g.userData.body, e = d.e;
    d.t += dt;
    let end = 1.5;
    if (e.kind === 'bld') {
      end = 1.6;
      const k = d.t / end;
      b.position.set((Math.random() - 0.5) * 4 * (1 - k), -g.userData.model.userData.h * k * k, (Math.random() - 0.5) * 4 * (1 - k));
      b.rotation.z = k * 0.12 * d.side;
    } else if (e.type === 'tank') {
      end = 6;
      if (!d.init) { d.init = true; g.traverse(o => { if (o.isMesh) o.material = wreckMat; }); }
      if (Math.random() < dt * 9) { G.evDepth++; smoke(e.x, e.y, 22, 1, 10, '#3a3835', 6); G.evDepth--; }
      if (d.t > 5) b.position.y = -(d.t - 5) * 32;
    } else if (e.type === 'drone') {
      end = 0.8;
      b.position.y = -Math.min(22, d.t * d.t * 130); b.rotation.z = d.t * 6 * d.side;
    } else {
      deathFall(d, g, b, e);
      end = d.end;
    }
    if (d.t >= end) { scene.remove(g); dying.splice(i, 1); }
  }
  for (let i = stains.length - 1; i >= 0; i--) { // тёмные пятна на земле медленно тают
    const s = stains[i]; s.t += dt;
    const k = s.t / s.life;
    s.m.material.opacity = s.o * Math.min(1, s.t * 4) * (1 - k * k);
    if (k >= 1) { scene.remove(s.m); s.m.material.dispose(); stains.splice(i, 1); }
  }
}

// Падение воина: короткий отброс от удара, заваливание на бок (в сторону экрана, а не к камере — иначе кажется, что он сжимается),
// отскок от земли, облачко пыли, затем тело лежит и уходит в землю. Тяжёлые падают медленнее.
const stains = [], stainGeo = new THREE.CircleGeometry(1, 16), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const MACHINE = { drone: 1, tank: 1, commander: 1, golem: 1 };
function deathFall(d, g, b, e) {
  const ud = g.userData, R = Math.max(6, e.r), ts = Math.min(1.25, Math.max(1, R / 14));
  if (!d.init) {
    d.init = true;
    const a = e.hitAng !== undefined ? e.hitAng : Math.random() * TAU, hx = Math.cos(a), hz = Math.sin(a), s = hx >= 0 ? 1 : -1;
    let dx = hx + s * 0.9, dz = hz * 0.5; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; // направление падения
    d.dx = dx; d.dz = dz;
    d.end = 0.9 * ts; d.sink = 0.55 * ts; // упал, чуть полежал и быстро ушёл в землю: поле не засоряется
    if (g.visible && stains.length < 70) {
      const m = new THREE.Mesh(stainGeo, new THREE.MeshBasicMaterial({ color: MACHINE[e.type] ? '#0b0b0b' : '#2a100c', transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(e.x + dx * R * 0.9, 0.7, e.y + dz * R * 0.9); m.scale.set(R * 1.15, R * 0.8, 1); m.renderOrder = 8;
      m.rotation.z = Math.atan2(dz, dx); scene.add(m);
      stains.push({ m, t: 0, life: 5, o: MACHINE[e.type] ? 0.55 : 0.4 });
    }
  }
  const t = d.t / ts, hit = 0.1, fall = 0.3, land = hit + fall;
  let th, slide;
  if (t < hit) { const k = t / hit; th = -0.16 * k; slide = 0.25 * k; }            // удар: корпус откидывает назад
  else if (t < land) { const k = (t - hit) / fall; th = -0.16 + (Math.PI / 2 + 0.16) * k * k; slide = 0.25 + 0.5 * k; } // падение ускоряется
  else {
    const k = Math.min(1, (t - land) / 0.22);
    th = Math.PI / 2 - 0.11 * Math.sin(k * Math.PI); slide = 0.75 + 0.25 * Math.min(1, (t - land) / 0.5); // отскок и затухающее скольжение
    if (!d.landed) {
      d.landed = true;
      if (!e.fly) { G.evDepth++; dust(e.x + d.dx * R, e.y + d.dz * R, 3, R * 0.55); G.evDepth--; }
    }
  }
  const lift = Math.sin(Math.min(1, t / land) * Math.PI) * R * 0.25 + (th > 1 ? R * 0.28 : 0); // прыжок в начале и тело над землёй
  _ax.set(d.dz, 0, -d.dx);
  _qa.setFromAxisAngle(_ax, th); _qb.setFromAxisAngle(_up, ud.rot);
  b.quaternion.copy(_qa).multiply(_qb);
  b.position.set(d.dx * slide * R * 1.5, lift, d.dz * slide * R * 1.5);
  if (d.t > d.sink) b.position.y -= (d.t - d.sink) * R * 4.8;
}

// ---- вспомогательные маркеры: призрак постройки, зона башни, прицел, точка сбора ----
function flat(geom, color, opacity) {
  const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
  m.renderOrder = 10; // маркеры рисуются после напольного оформления баз: прозрачные слои без записи глубины иначе сортируются по расстоянию и оформление закрывает маркер
  return m;
}
const ghost = flat(new THREE.CircleGeometry(1, 32), '#5dff7a', 0.45);
ghost.material.depthTest = false; // место будущей постройки видно всегда — и поверх оформления земли, и из-за стен
const rangeRing = flat(new THREE.RingGeometry(0.985, 1, 72), '#ffffff', 0.8);
const minRing = flat(new THREE.RingGeometry(0.96, 1, 48), '#ff6a6a', 0.8);
const zoneDisc = flat(new THREE.CircleGeometry(1, 72), '#ffffff', 0.08);
const reticle = flat(new THREE.RingGeometry(0.85, 1, 40), '#ffd24a', 0.9);
const rallyMark = flat(new THREE.RingGeometry(0.5, 1, 4), '#7dff9a', 0.9);
const abilMark = flat(new THREE.RingGeometry(0.93, 1, 64), '#ff8a2a', 0.95), abilDisc = flat(new THREE.CircleGeometry(1, 48), '#ff8a2a', 0.16);
const abilArea = a => a.key === 'rockets' ? a.spread + a.r : a.r; // радиус поражения способности

// ================= Туман войны и разметка зоны стройки =================
// Оба слоя — плоскости над землёй с картинкой, которую рисуем на canvas: левый верхний угол картинки = начало карты.
function groundLayer(res, y, opacity, order = 9) { // order — порядок рисования: слой разметки и туман идут после оформления баз
  const cv = document.createElement('canvas'); cv.width = cv.height = res;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.visible = false; m.renderOrder = order; scene.add(m);
  return { cv, g: cv.getContext('2d'), tex, m };
}
// Туман войны — только в сетевой игре: чужих воинов не видно, пока рядом нет своего воина или здания (союзники делятся обзором).
// Это правило показа, а не симуляции: бой считается как раньше, скрытое просто не рисуется и не выбирается мышью.
// Чужие здания остаются на виду после того, как их однажды увидели; цитадели видны всегда.
const VIS_UNIT = 520, VIS_BLD = 620, FOG_PAD = 400; // обзор воина и здания; запас тумана за краем карты
const Fog = { on: false, force: false, t: 0, vis: new WeakSet(), known: new WeakSet(), src: [], layer: groundLayer(256, 2.2, 1, 12) };
const fogHides = e => Fog.on && !Fog.vis.has(e) && e.team !== G.players[G.human].team;
function fogSees(x, y) {
  for (const s of Fog.src) { const R = s.kind === 'unit' ? VIS_UNIT : VIS_BLD, dx = s.x - x, dy = s.y - y; if (dx * dx + dy * dy < R * R) return true; }
  return false;
}
function fogUpdate(dt) {
  // после поражения (цитадель пала) или конца боя туман снимается: видно всю карту
  const me0 = G.players[G.human], on = G.running && (!!G.net || Fog.force) && !!me0 && me0.alive && !G.over;
  if (on !== Fog.on) { Fog.on = on; Fog.t = 0; Fog.layer.m.visible = on; if (on) { Fog.vis = new WeakSet(); Fog.known = new WeakSet(); } }
  if (!on || (Fog.t -= dt) > 0) return;
  Fog.t = 0.15;
  const my = G.players[G.human].team, src = Fog.src = [];
  for (const e of G.ents) if (!e.dead && e.team === my) src.push(e);
  for (const e of G.ents) {
    if (e.dead || e.team === my) continue;
    let v = false;
    for (const s of src) { const R = (s.kind === 'unit' ? VIS_UNIT : VIS_BLD) + e.r, dx = s.x - e.x, dy = s.y - e.y; if (dx * dx + dy * dy < R * R) { v = true; break; } }
    if (e.kind === 'bld') { if (v || e.type === 'hq') Fog.known.add(e); v = Fog.known.has(e); }
    if (v) Fog.vis.add(e); else Fog.vis.delete(e);
  }
  const { g, cv, tex, m } = Fog.layer, S = cv.width, span = WORLD.w + 2 * FOG_PAD, k = S / span;
  m.scale.set(span, span, 1); m.position.set(WORLD.w / 2, 2.2, WORLD.h / 2);
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, S, S); g.fillStyle = 'rgba(6, 8, 12, .52)'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'destination-out';
  for (const s of src) {
    const R = (s.kind === 'unit' ? VIS_UNIT : VIS_BLD) * k, x = (s.x + FOG_PAD) * k, y = (s.y + FOG_PAD) * k, gr = g.createRadialGradient(x, y, R * 0.78, x, y, R);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
  }
  tex.needsUpdate = true;
}
// Разметка «где можно строить», пока выбрана постройка: светлая граница по краю зоны и лёгкая заливка внутри.
// Зона — как в canPlace: центр здания должен лежать не дальше BUILD_RADIUS от края любого своего достроенного здания;
// вырезаны места, где новое здание встало бы слишком близко к уже стоящему.
const Zone = { key: '', layer: groundLayer(1024, 0.9, 0.9), tmp: document.createElement('canvas') };
Zone.tmp.width = Zone.tmp.height = 1024;
function zoneUpdate() {
  const p = G.players[G.human], show = G.running && !!p && !!UI.placing && !G.possessed, { g, cv, tex, m } = Zone.layer;
  m.visible = show;
  if (!show) return;
  const blds = G.ents.filter(e => e.kind === 'bld' && !e.dead), mine = blds.filter(e => e.owner === p.idx && e.build >= 1);
  const key = UI.placing + '|' + WORLD.w + '|' + blds.map(e => e.id).join(',') + '|' + mine.length;
  if (key === Zone.key) return;
  Zone.key = key;
  const S = cv.width, k = S / WORLD.w, r = BUILDINGS[UI.placing].r, t = Zone.tmp.getContext('2d'), line = Math.max(2, 7 * k);
  const circles = (c, list, rad) => { for (const e of list) { c.beginPath(); c.arc(e.x * k, e.y * k, Math.max(0, rad(e)) * k, 0, 7); c.fill(); } };
  m.scale.set(WORLD.w, WORLD.h, 1); m.position.set(WORLD.w / 2, 0.9, WORLD.h / 2);
  // заливка: объединение кругов одним тоном
  t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, S, S); t.fillStyle = '#f6eeee'; circles(t, mine, e => BUILD_RADIUS + e.r);
  // граница: то же объединение минус оно же, сжатое на толщину линии — остаётся только внешний контур
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, S, S); g.fillStyle = '#f6eeee'; circles(g, mine, e => BUILD_RADIUS + e.r);
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; circles(g, mine, e => BUILD_RADIUS + e.r - line / k);
  g.globalCompositeOperation = 'destination-over'; g.globalAlpha = 0.13; g.drawImage(Zone.tmp, 0, 0); g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out'; circles(g, blds, e => e.r + r + 34);
  const m30 = (r + 30) * k; // у самого края карты строить нельзя
  g.fillRect(0, 0, S, m30); g.fillRect(0, S - m30, S, m30); g.fillRect(0, 0, m30, S); g.fillRect(S - m30, 0, m30, S);
  g.globalCompositeOperation = 'source-over';
  tex.needsUpdate = true;
}

function syncMarkers() {
  const me = G.players[G.human];
  ghost.visible = rangeRing.visible = minRing.visible = zoneDisc.visible = reticle.visible = rallyMark.visible = abilMark.visible = abilDisc.visible = false;
  zoneUpdate();
  if (!G.running || !me) return;
  let zone = null;
  if (UI.placing && !G.possessed) {
    const d = BUILDINGS[UI.placing], ok = !canPlace(me, UI.placing, Input.wx, Input.wy) && me.gold >= buildCost(me, UI.placing);
    ghost.visible = true; ghost.position.set(Input.wx, 1.5, Input.wy); ghost.scale.setScalar(d.r);
    ghost.material.color.set(ok ? '#5dff7a' : '#ff5d5d');
    if (d.range) zone = { x: Input.wx, y: Input.wy, d };
  } else if (UI.casting && !G.possessed) { // выбор точки для способности героя: круг дальности и область удара под курсором
    const h = me.heroU;
    if (!h || h.dead) UI.casting = false;
    else {
      const a = UNITS[h.type].abil, dx = Input.wx - h.x, dy = Input.wy - h.y, l = Math.hypot(dx, dy) || 1, k = Math.min(1, (a.range + h.r) / l);
      zone = { x: h.x, y: h.y, d: { range: a.range, r: h.r } };
      abilMark.visible = abilDisc.visible = true;
      abilMark.position.set(h.x + dx * k, 1.6, h.y + dy * k); abilDisc.position.set(h.x + dx * k, 1.4, h.y + dy * k);
      abilMark.scale.setScalar(abilArea(a)); abilDisc.scale.setScalar(abilArea(a));
      abilMark.material.opacity = h.acd > 0 ? 0.35 : 0.95;
    }
  } else if (UI.sel.length === 1 && UI.sel[0].kind === 'bld') {
    const b = UI.sel[0], d = BUILDINGS[b.type];
    if (d.range) zone = { x: b.x, y: b.y, d };
    if (b.type === 'barracks') { rallyMark.visible = true; rallyMark.position.set(b.rally.x, 1.5, b.rally.y); rallyMark.scale.setScalar(12); }
  }
  if (zone) {
    const R = zone.d.range + zone.d.r;
    rangeRing.visible = zoneDisc.visible = true;
    rangeRing.position.set(zone.x, 1.2, zone.y); rangeRing.scale.setScalar(R);
    zoneDisc.position.set(zone.x, 1.0, zone.y); zoneDisc.scale.setScalar(R);
    if (zone.d.minRange) { minRing.visible = true; minRing.position.set(zone.x, 1.3, zone.y); minRing.scale.setScalar(zone.d.minRange + zone.d.r); }
  }
  const u = G.possessed;
  if (u) {
    const d = UNITS[u.type];
    if (d.proj) {
      const ad = d.splash ? (u.r + 40) + (d.range - 40) * Input.aim : d.range + u.r;
      reticle.visible = true;
      reticle.position.set(u.x + Math.cos(u.face) * ad, 1.5, u.y + Math.sin(u.face) * ad);
      reticle.scale.setScalar(d.splash || 9);
    }
    if (d.abil && d.abil.range) { // куда ляжет способность: дальность меняется колесом или наклоном взгляда
      const ad = abilDist(u, d, Input.aim), ax = u.x + Math.cos(u.face) * ad, ay = u.y + Math.sin(u.face) * ad;
      abilMark.visible = abilDisc.visible = true;
      abilMark.position.set(ax, 1.6, ay); abilDisc.position.set(ax, 1.4, ay);
      abilMark.scale.setScalar(abilArea(d.abil)); abilDisc.scale.setScalar(abilArea(d.abil));
      abilMark.material.opacity = u.acd > 0 ? 0.3 : 0.95; abilDisc.visible = u.acd <= 0;
    }
  }
}

// ================= Камера =================
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
let camSnap = true;
function updateCamera(dt) {
  const c = UI.cam, u = G.possessed;
  if (u) {
    // Свободный обзор: взгляд вверх-вниз (Input.aim) поднимает и опускает камеру и сдвигает точку, куда она смотрит.
    // При aim 0.7 вид прежний; ниже — камера выше и смотрит под ноги, выше — ниже и смотрит к горизонту.
    const f = Input.yaw, D = 74 + u.r * 3, H = (54 + u.r * 2.2 + (u.fly ? 30 : 0)) * (1 + (0.7 - Input.aim) * 0.9), L = 90 + (Input.aim - 0.7) * 130;
    wantPos.set(u.x - Math.cos(f) * D, H, u.y - Math.sin(f) * D);
    wantLook.set(u.x + Math.cos(f) * L, (u.fly ? 26 : 0) - 4, u.y + Math.sin(f) * L);
    c.x = u.x; c.y = u.y;
  } else {
    const p = 0.92; // наклон RTS-камеры
    if (G.running) { wantPos.set(c.x, c.dist * Math.sin(p), c.y + c.dist * Math.cos(p)); wantLook.set(c.x, 0, c.y); }
    else if (menuBase) { // в меню камера стоит перед базой и медленно покачивается из стороны в сторону
      const b = menuBase, a = b.a + Math.sin(performance.now() * 0.00011) * 0.2;
      wantPos.set(b.x + Math.cos(a) * 640, 300, b.y + Math.sin(a) * 640); wantLook.set(b.x + Math.cos(b.a) * 40, -30, b.y + Math.sin(b.a) * 40);
    }
  }
  const k = camSnap ? 1 : 1 - Math.exp(-dt * (u ? 16 : 12));
  camSnap = false;
  camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
  camera.position.copy(camPos); camera.lookAt(camLook);
  if (UI.shake > 0.05) { // тряска от взрывов и ударов
    const a = UI.shake * (u ? 0.7 : c.dist / 900);
    camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a;
    UI.shake *= Math.exp(-dt * 9);
  }
  c.zoom = 900 / c.dist;
  const box = u ? 500 : Math.max(500, Math.min(1500, c.dist * 1.1));
  const sc = sun.shadow.camera;
  if (sc.right !== box) { sc.left = -box; sc.right = box; sc.top = box; sc.bottom = -box; sc.updateProjectionMatrix(); }
  sun.target.position.set(camLook.x, 0, camLook.z - (u ? 0 : c.dist * 0.15));
  sun.position.set(sun.target.position.x + 720, 900, sun.target.position.z + 330);
}
function camInput(dt) {
  const k = Input.keys, c = UI.cam;
  if (G.possessed) {
    // Поворот: Q/E (стрелки заняты — ими воин ходит); взгляд выше-ниже — мышь или колесо
    Input.yaw += ((k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0)) * 2.4 * dt;
    // Если мышь не захвачена (так бывает во встроенных окнах), камеру ведёт положение курсора: у края экрана — поворот, выше и ниже центра — взгляд вверх и вниз
    if (document.pointerLockElement !== cv && !UI.paused && !UI.touch) {
      const nx = (Input.sx - VW / 2) / (VW / 2), ny = (Input.sy - VH * 0.45) / (VH / 2), dz = 0.14, f = v => Math.abs(v) < dz ? 0 : Math.sign(v) * (Math.abs(v) - dz) / (1 - dz);
      Input.yaw += f(nx) * 2.6 * dt;
      Input.aim = Math.max(0, Math.min(1, Input.aim - f(ny) * 0.9 * dt));
    }
    return;
  }
  const sp = c.dist * 1.1 * dt;
  c.x += ((k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0)) * sp;
  c.y += ((k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0)) * sp;
  c.x = Math.max(0, Math.min(WORLD.w, c.x)); c.y = Math.max(0, Math.min(WORLD.h, c.y));
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), gplane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3(), prj = new THREE.Vector3();
function groundAt(sx, sy) {
  ndc.set(sx / VW * 2 - 1, -(sy / VH) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(gplane, hitV) ? { x: hitV.x, y: hitV.z } : null;
}
function toScreen(x, h, y) {
  prj.set(x, h, y).project(camera);
  if (prj.z > 1 || prj.z < -1) return null;
  return { x: (prj.x + 1) / 2 * VW, y: (1 - prj.y) / 2 * VH };
}
function pxPerUnit(x, y) {
  const d = Math.hypot(camera.position.x - x, camera.position.y, camera.position.z - y);
  return VH / (2 * Math.tan(camera.fov * Math.PI / 360) * d);
}
function entTop(e) {
  const g = entMesh.get(e), h = g ? g.userData.model.userData.h : e.r * 2.6;
  return e.kind === 'unit' ? h : h * (0.25 + 0.75 * e.build);
}
function pickEnt(sx, sy, filter) {
  let best = null, bd = Infinity;
  for (const e of G.ents) {
    if (e.dead || !filter(e) || fogHides(e)) continue;
    const s = toScreen(e.x, entTop(e) * 0.45, e.y);
    if (!s) continue;
    const pr = e.r * pxPerUnit(e.x, e.y) * 1.3 + (UI.touch ? 22 : 8), d = Math.hypot(s.x - sx, s.y - sy); // пальцем попасть труднее, чем курсором
    if (d < pr && d < bd) { bd = d; best = e; }
  }
  return best;
}

// ================= Оверлей: полоски здоровья, рамка выделения =================
function drawOverlay() {
  octx.clearRect(0, 0, VW, VH);
  if (!G.running) return;
  const sel = new Set(UI.sel);
  for (const e of G.ents) {
    if (e.dead || fogHides(e)) continue;
    const constructing = e.kind === 'bld' && e.build < 1, training = e.kind === 'bld' && e.queue.length && e.owner === G.human;
    const isHero = e.kind === 'unit' && UNITS[e.type].hero;
    if (e.hp >= e.maxHp && !sel.has(e) && !constructing && !training && e !== G.possessed && !isHero) continue;
    const s = toScreen(e.x, entTop(e) + 6, e.y);
    if (!s || s.x < -40 || s.x > VW + 40 || s.y < -20 || s.y > VH + 20) continue;
    const w = e.kind === 'unit' ? 30 : 58, hgt = e.kind === 'unit' ? 4 : 6, x = s.x - w / 2;
    octx.fillStyle = 'rgba(0,0,0,.65)'; octx.fillRect(x - 1, s.y - 1, w + 2, hgt + 2);
    octx.fillStyle = G.players[e.owner].fac.color; octx.fillRect(x, s.y, w * Math.max(0, e.hp / e.maxHp), hgt);
    if (isHero) { // герой: золотая рамка полоски и уровень
      octx.strokeStyle = '#ffd24a'; octx.lineWidth = 1; octx.strokeRect(x - 1.5, s.y - 1.5, w + 3, hgt + 3);
      octx.font = 'bold 12px "Russo One", "Segoe UI", sans-serif'; octx.textAlign = 'center'; octx.lineWidth = 3; octx.strokeStyle = 'rgba(0,0,0,.8)';
      const txt = '★ ' + G.players[e.owner].heroLvl;
      octx.strokeText(txt, s.x, s.y - 5); octx.fillStyle = '#ffd24a'; octx.fillText(txt, s.x, s.y - 5);
    }
    if (e.kind === 'bld' && e.repair) drawWrench(octx, s.x + w / 2 + 12, s.y + 4);
    if (constructing || training) {
      const k = constructing ? e.build : e.trainT / UNITS[e.queue[0]].time;
      octx.fillStyle = 'rgba(0,0,0,.65)'; octx.fillRect(x - 1, s.y + hgt + 2, w + 2, 5);
      octx.fillStyle = '#ffd24a'; octx.fillRect(x, s.y + hgt + 3, w * k, 3);
    }
  }
  for (const f of G.fx) { // цифры урона вселённого воина
    if (f.type !== 'num' || f.pid !== G.human) continue;
    const k = f.life / f.max, p = toScreen(f.x, f.h + (1 - k) * 28, f.y);
    if (!p) continue;
    octx.globalAlpha = Math.min(1, k * 2); octx.font = 'bold 19px "Russo One", "Segoe UI", sans-serif'; octx.textAlign = 'center';
    octx.lineWidth = 4; octx.strokeStyle = 'rgba(0,0,0,.8)'; octx.strokeText(f.text, p.x, p.y);
    octx.fillStyle = '#ffe066'; octx.fillText(f.text, p.x, p.y); octx.globalAlpha = 1;
  }
  const d = UI.drag;
  if (d && (Math.abs(d.x1 - d.x0) > 4 || Math.abs(d.y1 - d.y0) > 4)) {
    octx.strokeStyle = '#b9ffb0'; octx.lineWidth = 1.5; octx.fillStyle = 'rgba(140,255,130,.12)';
    octx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0); octx.strokeRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
  }
  drawTutMarkers();
}

function drawMini() {
  const S = mini.width, k = S / WORLD.w;
  mctx.imageSmoothingEnabled = true; mctx.drawImage(terrain.mini, 0, 0, S, S);
  mctx.fillStyle = 'rgba(20,50,20,.75)';
  for (const o of G.obstacles) mctx.fillRect(o.x * k - 1.5, o.y * k - 1.5, 3, 3);
  if (Fog.on) { const fc = Fog.layer.cv, q = fc.width / (WORLD.w + 2 * FOG_PAD); mctx.drawImage(fc, FOG_PAD * q, FOG_PAD * q, WORLD.w * q, WORLD.w * q, 0, 0, S, S); } // туман и на миникарте
  for (const e of G.ents) {
    if (e.dead || fogHides(e)) continue;
    mctx.fillStyle = G.players[e.owner].fac.color;
    const hero = e.kind === 'unit' && UNITS[e.type].hero;
    const s = e.kind === 'bld' ? (e.type === 'hq' ? 9 : 5) : hero ? 5 : 2.5;
    mctx.fillRect(e.x * k - s / 2, e.y * k - s / 2, s, s);
    if (hero) { mctx.strokeStyle = '#ffd24a'; mctx.lineWidth = 1; mctx.strokeRect(e.x * k - s / 2 - 0.5, e.y * k - s / 2 - 0.5, s + 1, s + 1); }
  }
  const al = me().alarm;
  if (al && G.time - al.t < 3) { // место атаки на миникарте
    mctx.strokeStyle = '#ff5050'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(al.x * k, al.y * k, 5 + (G.time * 3 % 1) * 10, 0, 7); mctx.stroke();
  }
  const cs = [groundAt(0, 0), groundAt(VW, 0), groundAt(VW, VH), groundAt(0, VH)];
  if (cs.every(Boolean)) {
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.2; mctx.beginPath();
    cs.forEach((c, i) => i ? mctx.lineTo(c.x * k, c.y * k) : mctx.moveTo(c.x * k, c.y * k));
    mctx.closePath(); mctx.stroke();
  }
}

// ================= Интерфейс =================
let toastT = 0;
function toast(msg, good) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), good ? 2600 : 1600); if (!good) Sfx.play('err'); }
function me() { return G.players[G.human]; }
// Приказ игрока: в одиночной игре и у хоста выполняется сразу, у клиента уходит хосту
function act(m) {
  if (G.net === 'client') { Net.send(m); return ''; }
  return execCmd(me(), m);
}
const COIN = '<i class="ico coin"></i>';
const fmtTime = s => Math.floor(s / 60) + ':' + String(Math.floor(s) % 60).padStart(2, '0');

// ---- режимы меню: одиночная игра, кампания, сеть ----
// В кампании фракция и карта задаются миссией; выбор одиночной игры запоминаем и возвращаем при выходе из кампании
function applyMission() { const m = Camp.M[UI.camp.sel]; UI.menu.faction = m.faction; UI.menu.map = m.map; }
function switchMode(k) {
  const C = UI.camp, N = UI.net, was = C.on ? 'camp' : N.on ? 'net' : 'single';
  if (k === was) return;
  if (was === 'camp') Object.assign(UI.menu, C.saved);
  if (was === 'net') Net.leave();
  N.on = k === 'net'; C.on = k === 'camp'; N.msg = ''; N.busy = false;
  if (k === 'camp') {
    C.saved = { ...UI.menu };
    const first = Camp.M.findIndex((m, i) => Camp.unlocked(i) && !Camp.stars(i)); // первая непройденная миссия
    C.sel = first < 0 ? 0 : first; applyMission();
  }
  UI.menu.bots = Math.max(1, UI.menu.bots);
  buildMenu(); previewMap();
}

// ---- сетевая игра: комната в меню ----
function menuSay(text) { UI.net.msg = text; UI.net.busy = false; buildMenu(); if (G.running) toast(text); }
// Изменить настройку партии; хост рассылает её всем в комнате
function menuSet(key, v) {
  if (Net.role === 'client') { if (key === 'faction') Net.send({ t: 'fac', faction: v }); return; }
  if (UI.menu[key] === v) return;
  UI.menu[key] = v;
  if (Net.role === 'host') Net.setLobby({ [key]: v });
  buildMenu();
  if ((key === 'map' || key === 'faction') && !G.running) previewMap();
}
Net.on.lobby = () => {
  const L = Net.lobby, M = UI.menu, N = UI.net, mapWas = M.map, facWas = M.faction;
  N.busy = false; N.msg = '';
  if (Net.role === 'client') { M.map = L.map; M.diff = L.diff; N.coop = L.coop; if (L.slots[Net.you]) M.faction = L.slots[Net.you].faction; }
  else M.faction = L.slots[0].faction;
  M.bots = L.bots;
  buildMenu();
  if ((M.map !== mapWas || M.faction !== facWas) && !G.running) previewMap();
};
Net.on.start = m => startGame(m);
Net.on.end = () => { if (G.net === 'client' && G.running) { G.over = G.over || 'ended'; toMenu(); UI.net.msg = T('Хост завершил бой'); buildMenu(); } };
Net.on.closed = text => { if (G.net === 'client' && G.running) { G.over = G.over || 'ended'; toMenu(); } menuSay(text); };
Net.on.msg = text => toast(text);
Net.on.error = text => menuSay(text);
function hostRoom() {
  const N = UI.net;
  N.busy = true; N.msg = ''; buildMenu();
  Net.host(UI.menu.faction).then(() => { N.busy = false; Net.setLobby({ map: UI.menu.map, diff: UI.menu.diff, bots: Math.min(UI.menu.bots, 3), coop: N.coop }); }).catch(e => menuSay(e.message));
}
function joinRoom() {
  const N = UI.net, code = N.code.trim().toUpperCase();
  if (code.length !== 8) return menuSay(T('Введите код комнаты из 8 символов'));
  N.busy = true; N.msg = ''; buildMenu();
  Net.join(code).catch(e => menuSay(e.message));
}
function buildNetBox() {
  const N = UI.net, L = Net.lobby, box = $('netBox'), host = Net.role === 'host';
  box.classList.toggle('hidden', !N.on);
  if (!N.on) return;
  if (!L) {
    box.innerHTML = T`<div class="netRow"><button id="hostBtn" class="plain">Создать комнату</button><span class="or">или</span>
      <input id="codeIn" maxlength="8" placeholder="Код комнаты" autocomplete="off" spellcheck="false"><button id="joinBtn" class="plain">Войти</button></div>
      <div class="netMsg">${N.busy ? T('Подключение…') : N.msg || T('Один игрок создаёт комнату и сообщает код остальным. В комнате до 4 игроков.')}</div>`;
    const inp = $('codeIn');
    inp.value = N.code; inp.oninput = () => { N.code = inp.value; };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') joinRoom(); };
    $('hostBtn').onclick = hostRoom; $('joinBtn').onclick = joinRoom;
    $('hostBtn').disabled = $('joinBtn').disabled = N.busy;
    return;
  }
  const you = host ? 0 : Net.you;
  box.innerHTML = T`<div class="netRow"><span class="roomCode">Комната <b>${Net.code}</b></span><button id="copyBtn" class="plain">Скопировать код</button><button id="leaveBtn" class="plain">Выйти из комнаты</button></div>
    <div class="slots">${L.slots.map((s, i) => `<span class="slot" style="--c:${FACTIONS[s.faction].color}">${FACTIONS[s.faction].name}${i === you ? T(' · вы') : ''}${i === 0 ? T(' · хост') : ''}</span>`).join('')}</div>
    <div id="coopBtns" class="seg${host ? '' : ' ro'}"></div>
    <div class="netMsg">${N.msg || (host ? T('Сообщите код остальным. Каждый выбирает свою фракцию, вы — карту, сложность и ботов.') : T('Выберите фракцию. Карту и остальное настраивает хост.'))}</div>`;
  for (const [v, label] of [[false, T('Каждый за себя')], [true, T('Вместе против ботов')]]) {
    const b = document.createElement('button');
    b.textContent = label; if (L.coop === v) b.className = 'sel';
    b.onclick = () => { N.coop = v; Net.setLobby({ coop: v }); };
    $('coopBtns').appendChild(b);
  }
  $('copyBtn').onclick = () => { try { navigator.clipboard.writeText(Net.code).then(() => menuSay(T('Код скопирован')), () => menuSay(T('Не удалось скопировать — перепишите код вручную'))); } catch (e) { menuSay(T('Не удалось скопировать — перепишите код вручную')); } };
  $('leaveBtn').onclick = () => { Net.leave(); N.msg = ''; buildMenu(); };
}

function buildMenu() {
  const N = UI.net, L = Net.lobby, isClient = Net.role === 'client', you = Net.role === 'host' ? 0 : Net.you;
  const modes = $('modeBtns');
  modes.innerHTML = '';
  // Сетевой режим показываем, только если площадка его поддерживает (нужен токен Bridge Multiplayer в конфиге)
  const C = UI.camp, cur = C.on ? 'camp' : N.on ? 'net' : 'single';
  const modeList = [['single', T('Одиночная игра')], ['camp', T('Кампания')]];
  if (Plat.multiplayer) modeList.push(['net', T('Сетевая игра')]);
  for (const [k, label] of modeList) {
    const b = document.createElement('button');
    b.textContent = label; if (cur === k) b.className = 'sel';
    b.onclick = () => switchMode(k);
    modes.appendChild(b);
  }
  // в кампании вместо выбора фракции, карты и ботов — список миссий
  $('facPane').classList.toggle('hidden', C.on); $('mapPane').classList.toggle('hidden', C.on); $('oppPane').classList.toggle('hidden', C.on);
  $('campBox').classList.toggle('hidden', !C.on);
  buildNetBox();
  for (const id of ['mapCards', 'diffBtns', 'botBtns']) $(id).classList.toggle('ro', isClient);
  const sb = $('startBtn');
  sb.disabled = (N.on && (!L || isClient)) || (C.on && !Camp.unlocked(C.sel));
  sb.textContent = !N.on || (L && !isClient) ? T('В бой') : L ? T('Ждём, пока хост начнёт бой') : T('Сначала создайте комнату или войдите');
  if (C.on) {
    const cl = $('campList'); cl.innerHTML = '';
    Camp.M.forEach((m, i) => {
      const open = Camp.unlocked(i), st = Camp.stars(i), d = document.createElement('div');
      d.className = 'ms' + (C.sel === i ? ' sel' : '') + (open ? '' : ' lock');
      d.innerHTML = `<span class="n">${i + 1}</span><span class="mt"><b>${m.title}</b><small>${open ? FACTIONS[m.faction].name + ' · ' + MAPS[m.map].name : T('Закрыто')}</small></span><span class="stars">${'★'.repeat(st)}<em>${'★'.repeat(3 - st)}</em></span>`;
      if (open) d.onclick = () => { C.sel = i; applyMission(); buildMenu(); previewMap(); };
      cl.appendChild(d);
    });
  }
  const fc = $('facCards');
  fc.innerHTML = '';
  for (const k in FACTIONS) {
    const f = FACTIONS[k], d = document.createElement('div');
    const taken = !!L && L.slots.some((q, i) => i !== you && q.faction === k);
    d.className = 'fac' + (UI.menu.faction === k ? ' sel' : '') + (taken ? ' taken' : '');
    d.style.setProperty('--c', f.color);
    d.innerHTML = T`<img src="${portrait('bld', 'hq', k)}" alt=""><span><b>${f.name}</b><small>Герой — ${UNITS[f.hero].name}</small></span>`;
    if (taken) d.insertAdjacentHTML('beforeend', T('<span class="takenTag">занято</span>'));
    else d.onclick = () => menuSet('faction', k);
    fc.appendChild(d);
  }
  // подпись к базе на фоне: выбранная фракция, её девиз и войско
  const fk = UI.menu.faction, sf = FACTIONS[fk], info = $('facInfo');
  const fig = (kind, t, name, tag, cls) => `<figure${cls ? ` class="${cls}"` : ''}><img src="${portrait(kind, t, fk)}" alt=""><figcaption>${name}<i>${tag}</i></figcaption></figure>`;
  info.style.setProperty('--c', sf.color);
  const cm = C.on ? Camp.M[C.sel] : null;
  const brief = cm ? `<div class="brief"><b>${cm.title}</b><p>${cm.brief}</p><p class="goal">${T('Цель')}: ${cm.goal}</p><ul class="starRules">${Camp.starRules(cm).map((t, i) => `<li class="${Camp.stars(C.sel) > i ? 'on' : ''}"><i>★</i>${t}</li>`).join('')}</ul></div>` : `<p>${sf.motto}</p>`;
  info.innerHTML = `<h2>${sf.name}</h2>${brief}<div class="roster">${fig('unit', sf.hero, UNITS[sf.hero].name, T('герой'), 'hero')}
    ${sf.units.map(u => fig('unit', u, UNITS[u].name, T('воин'))).join('')}${fig('bld', sf.tower, BUILDINGS[sf.tower].name, T('башня'))}</div><div class="udesc"></div>`;
  // Короткое описание под рядом: наведите на воина, героя или башню (по умолчанию — герой)
  const stat = d => `${d.hp ? T('Здоровье ') + d.hp : T('Прочность ') + d.hp}` + (d.dmg ? T` · урон ${d.dmg}` : '') + (d.range ? ` · ${d.proj || d.atk ? T('дальность ') + d.range : T('ближний бой')}` : '');
  const desc = [UNITS[sf.hero], ...sf.units.map(u => UNITS[u]), BUILDINGS[sf.tower]].map((d, i, arr) => {
    const hero = i === 0, tower = i === arr.length - 1;
    const st = tower ? T`Прочность ${d.hp} · урон ${d.dmg} · зона ${d.range}` : T`Здоровье ${d.hp} · урон ${d.dmg} · ${d.proj ? T('дальность ') + d.range : T('ближний бой')} · ${d.cost} зол.`;
    return `<b>${d.name}</b><span>${st}</span>${d.info}${hero ? T`<em>Способность «${d.abil.name}»: ${d.abil.info}</em>` : ''}`;
  });
  const box = info.querySelector('.udesc'), figs = [...info.querySelectorAll('.roster figure')];
  const show = i => { box.innerHTML = desc[i]; figs.forEach((f, j) => f.classList.toggle('on', j === i)); };
  figs.forEach((f, i) => { f.onmouseenter = () => show(i); f.onclick = () => show(i); });
  show(0);
  const mc = $('mapCards'), sizeName = m => m.size < 3000 ? T('Малая') : m.size < 4000 ? T('Средняя') : T('Большая');
  mc.innerHTML = '';
  for (const k in MAPS) {
    const m = MAPS[k], b = document.createElement('button');
    b.className = 'mapc' + (UI.menu.map === k ? ' sel' : '');
    b.innerHTML = `<b>${m.name}</b><small>${sizeName(m)}</small>`;
    b.onclick = () => menuSet('map', k);
    mc.appendChild(b);
  }
  const sm = MAPS[UI.menu.map];
  $('mapInfo').innerHTML = T`<b>${sm.name}</b><p>${sm.info}</p><small>${sizeName(sm)} · базы ${sm.lay === 'cross' ? T('у середин сторон') : T('по углам')}</small>`;
  const seg = (el, opts, key) => {
    el.innerHTML = '';
    for (const [v, label] of opts) {
      const b = document.createElement('button');
      b.textContent = label; if (UI.menu[key] === v) b.className = 'sel';
      b.onclick = () => menuSet(key, v);
      el.appendChild(b);
    }
  };
  const botMax = L ? 4 - L.slots.length : 3, botOpts = [];
  for (let i = L ? 0 : 1; i <= botMax; i++) botOpts.push([i, i === 0 ? T('Без ботов') : i === 1 ? T('1 бот') : i + T(' бота')]);
  seg($('botBtns'), botOpts, 'bots');
  seg($('diffBtns'), Object.keys(DIFF).map(k => [k, DIFF[k].name]), 'diff');
}

// ---- всплывающие подсказки ----
const tipEl = $('tip');
function showTip(el, html) {
  if (UI.touch) return; // на экране без курсора подсказки по наведению не нужны (после касания они бы «залипали»)
  tipEl.innerHTML = html; tipEl.classList.remove('hidden');
  const r = el.getBoundingClientRect(), w = tipEl.offsetWidth;
  tipEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  tipEl.style.bottom = (window.innerHeight - r.top + 10) + 'px';
}
function hideTip() { tipEl.classList.add('hidden'); }
function unitTip(t) {
  const d = UNITS[t];
  return T`<b>${d.name}</b><div class="tc">${COIN}${d.cost} · обучение ${d.time} с</div>
    <div class="ts">Здоровье ${d.hp} · Урон ${d.dmg} · ${d.proj ? T('Дальность ') + d.range : T('Ближний бой')} · Скорость ${d.speed}</div><p>${d.info}</p>`;
}
function bldTip(t) {
  const d = BUILDINGS[t];
  return T`<b>${d.name}</b><div class="tc">${COIN}${buildCost(me(), t)} · стройка ${d.time} с${d.tower ? T(' · построено ') + countB(me(), t) + T(' из ') + maxTowers(me()) : ''}</div>
    <div class="ts">Прочность ${d.hp}${d.dmg ? T` · Урон ${d.dmg} · Зона ${d.range}` : ''}</div><p>${d.info}</p>`;
}

function heroTip() {
  const p = me(), d = UNITS[p.fac.hero], a = d.abil, alive = p.heroU && !p.heroU.dead;
  return T`<b>${d.name} <span class="lv">★ ${p.heroLvl}</span></b><div class="tc">${alive ? T('В строю · клик — выбрать') : COIN + heroCost(p) + (p.heroDeaths ? T(' · возрождение ') : T(' · призыв ')) + d.time + T(' с') + (G.time < p.heroBack ? T(' · доступен через ') + Math.ceil(p.heroBack - G.time) + T(' с') : '')}</div>
    <div class="ts">Здоровье ${unitMaxHp(p, p.fac.hero)} · Урон ${Math.round(d.dmg * (1 + 0.15 * p.up.atk) * (1 + HERO_DMG * (p.heroLvl - 1)))} · ${d.proj ? T('Дальность ') + d.range : T('Ближний бой')}</div>
    <p>${d.info}</p><p><b>${a.name}</b> (раз в ${a.cd} с). ${a.info}</p><p>Клавиша <b>V</b> — применить способность (метеор и ракеты — затем клик по цели). <b>Shift+V</b> — разрешить или запретить герою применять её самому.</p><p>Набирает опыт в боях рядом с собой, до ${HERO_MAX}-го уровня. Уровень сохраняется после гибели, но вернуть павшего героя можно не сразу: от ${heroDelay(1)} с на 1-м уровне до ${heroDelay(HERO_MAX)} с на ${HERO_MAX}-м.</p>`;
}
function upTip(k) {
  const p = me(), d = UPGRADES[k], lvl = p.up[k], max = lvl >= d.cost.length;
  return `<b>${d.name} <span class="lv">${lvl} / ${d.cost.length}</span></b><div class="tc">${max ? T('Максимальный уровень') : COIN + d.cost[lvl] + T(' · исследование ') + d.time[lvl] + T(' с')}</div><p>${d.info}</p>`;
}
function hireHero() {
  const p = me(), h = p.heroU;
  if (h && !h.dead) { UI.sel = [h]; UI.cam.x = h.x; UI.cam.y = h.y; hudT = 0; return; }
  const why = act({ c: 'hero' });
  if (why) toast(why);
}
// Способность героя в режиме стратегии: V — применить (дальнобойная — выбрать точку кликом), Shift+V — вкл/выкл самостоятельное применение
function castKey(toggleAuto) {
  const p = me(), h = p.heroU;
  if (toggleAuto) { const why = act({ c: 'auto' }); if (why) toast(why); hudT = 0; return; }
  if (!h || h.dead) return toast(T('Героя нет в строю'));
  const a = UNITS[h.type].abil;
  if (h.acd > 0) return toast(a.name + T(': ещё ') + Math.ceil(h.acd) + T(' с'));
  if (a.range) { UI.casting = !UI.casting; UI.placing = null; return; }
  const why = act({ c: 'cast', x: h.x, y: h.y });
  if (why) toast(why);
}
function research(k) { const why = act({ c: 'research', key: k }); if (why) toast(why); }
// Починка: выбранное здание — переключить, без выбора — чинить всё повреждённое
function repairKey() {
  const b = UI.sel.length === 1 && UI.sel[0].kind === 'bld' ? UI.sel[0] : null;
  hudT = 0;
  const why = act(b ? { c: 'repair', b: b.id } : { c: 'repairAll' });
  if (why) toast(why);
}

let buildDefs = [], trainEls = [], buildEls = [], heroEl = null, upEls = {};
function buildHud() {
  const p = me(), fk = p.faction;
  document.documentElement.style.setProperty('--fac', p.fac.color);
  buildDefs = ['mine', 'barracks', p.fac.tower];
  const mk = (parent, hk, img, name, tipFn, fn) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.innerHTML = `<img src="${img}" alt=""><span class="hk">${hk}</span><span class="q"></span><span class="nm">${name}</span><span class="cs">${COIN}<em></em></span><span class="prog"><i></i></span>`;
    b.onclick = fn; b.onmouseenter = () => showTip(b, tipFn()); b.onmouseleave = hideTip;
    parent.appendChild(b);
    return b;
  };
  $('buildBtns').innerHTML = ''; $('trainBtns').innerHTML = '';
  buildEls = buildDefs.map((t, i) => mk($('buildBtns'), 'ZXC'[i], portrait('bld', t, fk), BUILDINGS[t].name, () => bldTip(t), () => startPlacing(t)));
  trainEls = p.fac.units.map((t, i) => mk($('trainBtns'), i + 1, portrait('unit', t, fk), UNITS[t].name, () => unitTip(t), () => train(i)));
  $('heroBox').innerHTML = ''; $('upBtns').innerHTML = '';
  heroEl = mk($('heroBox'), '4', portrait('unit', p.fac.hero, fk), UNITS[p.fac.hero].name, heroTip, hireHero);
  heroEl.classList.add('heroBtn');
  upEls = {};
  Object.keys(UPGRADES).forEach((k, i) => {
    const d = UPGRADES[k], b = document.createElement('button');
    b.className = 'up';
    b.innerHTML = `<span class="ui">${UPICON[k]}</span><span class="un">${d.name}</span><span class="pips">${d.cost.map(() => '<i></i>').join('')}</span><span class="cs">${COIN}<em></em></span><span class="prog"><i></i></span>`;
    b.onclick = () => research(k); b.onmouseenter = () => showTip(b, upTip(k) + T`<div class="ts">Клавиша ${'RTYU'[i]}</div>`); b.onmouseleave = hideTip;
    $('upBtns').appendChild(b); upEls[k] = b;
  });
  $('foes').innerHTML = G.players.filter(q => q.idx !== G.human).map(q => `<div class="foe" id="foe${q.idx}" style="--c:${q.fac.color}" title="${q.team === p.team ? T('Союзник') : T('Противник')}">${q.team === p.team ? '<i class="ally"></i>' : ''}${q.fac.name}<div class="fhp"><i></i></div></div>`).join('');
}

function startPlacing(t) { if (G.possessed) return; UI.casting = false; UI.placing = UI.placing === t ? null : t; }
function train(i) {
  const b = UI.sel.length === 1 && UI.sel[0].type === 'barracks' ? UI.sel[0] : null;
  const why = act({ c: 'train', slot: i, b: b ? b.id : 0 });
  if (why) toast(why);
}

function selHtml() {
  const fk = me().faction, us = UI.sel.filter(e => e.kind === 'unit');
  const hpBar = e => `<div class="bar"><div style="width:${Math.max(0, e.hp / e.maxHp * 100).toFixed(0)}%"></div></div>`;
  if (us.length === 1) {
    const u = us[0], d = UNITS[u.type], p = me();
    const lv = d.hero ? ` <span class="lv">★ ${p.heroLvl}</span>` : '';
    const extra = d.hero ? T`<div class="desc"><b>${d.abil.name}</b> <kbd>V</kbd>: ${u.acd > 0 ? T('через ') + Math.ceil(u.acd) + T(' с') : T('готово')} · сам: ${p.autoCast ? T('да') : T('нет')} · ${p.heroLvl >= HERO_MAX ? T('максимальный уровень') : T('опыт ') + Math.floor(p.heroXp) + ' / ' + heroNeed(p.heroLvl)}</div>` : `<div class="desc">${d.info}</div>`;
    return T`<div class="selRow"><img class="pt" src="${portrait('unit', u.type, fk)}" alt=""><div style="flex:1"><b>${d.name}${lv}</b>${hpBar(u)}
      <div class="st">${Math.ceil(u.hp)} / ${u.maxHp} · урон ${Math.round(d.dmg * dmgMul(u))} · ${d.proj ? T('дальность ') + d.range : T('ближний бой')}</div></div></div>${extra}`;
  }
  if (us.length > 1) {
    const c = {};
    for (const u of us) c[u.type] = (c[u.type] || 0) + 1;
    return T`<b>Отряд: ${us.length}</b><div class="chips">${Object.keys(c).map(t => `<div class="chip" title="${UNITS[t].name}"><img src="${portrait('unit', t, fk)}" alt=""><span>${c[t]}</span></div>`).join('')}</div>`;
  }
  if (UI.sel.length === 1) {
    const b = UI.sel[0], d = BUILDINGS[b.type];
    let h = `<div class="selRow"><img class="pt" src="${portrait('bld', b.type, fk)}" alt=""><div style="flex:1"><b>${d.name}</b>${hpBar(b)}
      <div class="st">${Math.ceil(b.hp)} / ${b.maxHp}${b.build < 1 ? T(' · строится ') + Math.floor(b.build * 100) + '%' : ''}${b.repair ? (G.time - b.hitT > REPAIR_PAUSE ? T(' · чинится') : T(' · починка ждёт: здание под ударом')) : ''}</div></div></div>`;
    const rs = b.type === 'hq' && me().research;
    if (b.type === 'hq' && (b.queue.length || rs)) h += `<div class="desc">${b.queue.length ? T('Призыв героя: ') + Math.floor(b.trainT / UNITS[b.queue[0]].time * 100) + '%' : ''}${b.queue.length && rs ? ' · ' : ''}${rs ? UPGRADES[rs.key].name + ': ' + Math.floor(rs.t / rs.time * 100) + '%' : ''}</div>`;
    else if (b.type === 'barracks') h += `<div class="queue">${b.queue.map(t => `<img src="${portrait('unit', t, fk)}" alt="">`).join('') || T('<span class="st">Очередь пуста · ПКМ — точка сбора</span>')}</div>`;
    else h += `<div class="desc">${d.info}</div>`;
    return h;
  }
  return T('<div class="empty">Никого. Выделите воинов рамкой или кликните по зданию.</div>');
}

let hudT = 0, lastSel = '';
function hudTick(dt) {
  hudT -= dt;
  if (hudT > 0 || !G.running) return;
  hudT = 0.1;
  const p = me(), hero = G.possessed, fk = p.faction;
  $('gold').textContent = Math.floor(p.gold);
  $('inc').textContent = '+' + p.income.toFixed(0) + T('/с');
  $('pop').textContent = popOf(p) + ' / ' + POP_CAP;
  $('clock').textContent = fmtTime(G.time) + (G.time > SIEGE_START ? T(' · осада ×') + siegeMul(G.time).toFixed(1) : '');
  for (const q of G.players) if (q.idx !== G.human) {
    const el = $('foe' + q.idx);
    el.classList.toggle('dead', !q.alive);
    el.querySelector('i').style.width = Math.max(0, q.hq.hp / q.hq.maxHp * 100) + '%';
  }
  buildEls.forEach((el, i) => {
    const t = buildDefs[i], c = buildCost(p, t);
    el.querySelector('em').textContent = c;
    // !! обязательно: у шахты и казармы поля tower нет, а toggle с undefined просто переключает класс на каждом тике — кнопка мигала
    el.classList.toggle('off', p.gold < c || !!(BUILDINGS[t].tower && countB(p, t) >= maxTowers(p)));
    el.classList.toggle('active', UI.placing === t);
  });
  const queued = {}, prog = {};
  let hasBarracks = false;
  for (const b of G.blds) {
    if (b.owner !== G.human || b.type !== 'barracks' || b.dead) continue;
    if (b.build >= 1) hasBarracks = true;
    b.queue.forEach((t, i) => { queued[t] = (queued[t] || 0) + 1; if (!i) prog[t] = Math.max(prog[t] || 0, b.trainT / UNITS[t].time); });
  }
  $('trainGroup').classList.toggle('none', !hasBarracks);
  trainEls.forEach((el, i) => {
    const t = p.fac.units[i];
    el.querySelector('em').textContent = UNITS[t].cost;
    el.querySelector('.q').textContent = queued[t] ? '×' + queued[t] : '';
    el.querySelector('.prog i').style.width = ((prog[t] || 0) * 100) + '%';
    el.classList.toggle('off', p.gold < UNITS[t].cost || !hasBarracks);
  });
  const hu = p.heroU && !p.heroU.dead ? p.heroU : null, hq = p.hq, hc = heroCost(p);
  heroEl.querySelector('em').textContent = hc;
  const hw = !hu && G.time < p.heroBack ? Math.ceil(p.heroBack - G.time) : 0;
  heroEl.querySelector('.q').textContent = hw ? hw + T(' с') : hu || p.heroDeaths ? '★' + p.heroLvl : '';
  heroEl.querySelector('.prog i').style.width = (hu ? hu.hp / hu.maxHp : hq.queue.length ? hq.trainT / UNITS[hq.queue[0]].time : 0) * 100 + '%';
  heroEl.classList.toggle('have', !!hu);
  heroEl.classList.toggle('off', !hu && !hq.queue.length && (p.gold < hc || hw > 0));
  for (const k in upEls) {
    const el = upEls[k], d = UPGRADES[k], lvl = p.up[k], max = lvl >= d.cost.length, busy = p.research && p.research.key === k;
    el.querySelectorAll('.pips i').forEach((pi, i) => pi.classList.toggle('on', i < lvl));
    el.querySelector('em').textContent = max ? '' : d.cost[lvl];
    el.querySelector('.prog i').style.width = (busy ? p.research.t / p.research.time * 100 : 0) + '%';
    el.classList.toggle('max', max); el.classList.toggle('busy', !!busy);
    el.classList.toggle('off', !max && !busy && (p.gold < d.cost[lvl] || !!p.research));
  }
  $('bottom').classList.toggle('hidden', !!hero);
  $('possessHud').classList.toggle('hidden', !hero);
  $('cross').classList.toggle('hidden', !hero);
  if (hero) {
    const d = UNITS[hero.type], src = portrait('unit', hero.type, fk), img = $('pImg');
    if (img.dataset.t !== hero.type) { img.src = src; img.dataset.t = hero.type; }
    $('pName').textContent = d.hero ? d.name + ' · ★ ' + p.heroLvl : d.name;
    $('pInfo').textContent = d.abil ? T('ПКМ или Пробел — ') + d.abil.name + ': ' + (hero.acd > 0 ? T('через ') + Math.ceil(hero.acd) + T(' с') : T('готово')) + (d.abil.range ? T(' · колесо — дальность') : '') : d.info;
    $('pAb').classList.toggle('hidden', !d.abil);
    $('pHp').style.width = Math.max(0, hero.hp / hero.maxHp * 100) + '%';
    hideTip();
  }
  const html = selHtml();
  if (html !== lastSel) { $('selInfo').innerHTML = html; lastSel = html; }
  $('possessBtn').classList.toggle('hidden', !UI.sel.some(e => e.kind === 'unit'));
  const rb = UI.sel.length === 1 && UI.sel[0].kind === 'bld' && UI.sel[0].build >= 1 && UI.sel[0].hp < UI.sel[0].maxHp ? UI.sel[0] : null, rBtn = $('repairBtn');
  rBtn.classList.toggle('hidden', !rb);
  if (rb) {
    const txt = rb.repair ? T('Остановить починку') : T`Починить ${COIN}${repairCost(rb)}`;
    if (rBtn.dataset.t !== txt) { rBtn.dataset.t = txt; rBtn.innerHTML = txt + ' <kbd>G</kbd>'; }
  }
  // предупреждение об атаке базы
  const al = p.alarm;
  if (al && G.time - al.t < 0.5 && G.time - UI.lastAlert > 9) { UI.lastAlert = G.time; Sfx.play('alarm'); }
  $('alert').classList.toggle('hidden', G.time - UI.lastAlert > 4 || !!hero);
}

// ---- вселение ----
function lock() { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* без захвата мыши: поворот Q/E или перетаскиванием */ } }
function setPoss(u) { // сменить воина под управлением (null — выйти); у клиента об этом узнаёт хост
  if (G.net === 'client') { G.possessed = u; Net.send({ c: 'possess', id: u ? u.id : 0, yaw: Input.yaw }); }
  else setPossess(me(), u);
}
function possess(u) {
  if (!u || u.dead || u.owner !== G.human || u.kind !== 'unit') return;
  Input.yaw = u.face; Input.aim = 0.7; Input.lmb = Input.rmb = false;
  setPoss(u);
  UI.sel = [u]; UI.placing = null; UI.drag = null; UI.locked = false; hudT = 0;
  Input.sx = VW / 2; Input.sy = VH * 0.45; // курсор в центре — камера стоит ровно
  if (!UI.touch) lock();
  setTimeout(() => { if (!UI.touch && G.possessed === u && document.pointerLockElement !== cv) toast(T('Мышь не захвачена: поворот — курсором у краёв экрана или клавишами Q и E'), true); }, 500);
}
function unpossess() {
  setPoss(null);
  UI.locked = false; Input.lmb = Input.rmb = false; hudT = 0;
  if (document.pointerLockElement) document.exitPointerLock();
}
function possessNext() {
  const cur = G.possessed;
  let best = null, bd = Infinity;
  for (const u of G.units) {
    if (u.owner !== G.human || u.dead || u === cur) continue;
    const d = cur ? dist(u, cur) : Math.hypot(u.x - UI.cam.x, u.y - UI.cam.y);
    if (d < bd) { bd = d; best = u; }
  }
  if (!best) return toast(T('Нет других воинов'));
  const yaw = Input.yaw;
  setPoss(best); UI.sel = [best]; hudT = 0;
  if (!cur) possess(best); else Input.yaw = yaw;
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === cv) UI.locked = true;
  else if (UI.locked && G.possessed && !UI.paused) unpossess();
  else UI.locked = false;
});

// ---- приказы ----
function command(plain) {
  const pos = groundAt(Input.sx, Input.sy);
  if (!pos) return;
  const us = UI.sel.filter(e => e.kind === 'unit' && !e.dead);
  if (!us.length) {
    const b = UI.sel[0];
    if (b && b.type === 'barracks') { b.rally = { x: pos.x, y: pos.y }; act({ c: 'rally', b: b.id, x: pos.x, y: pos.y }); localFx({ type: 'ping', x: pos.x, y: pos.y, r: 30, life: 0.5, color: '#7dff9a' }); }
    return;
  }
  const myTeam = me().team, target = plain ? null : pickEnt(Input.sx, Input.sy, e => e.team !== myTeam);
  const why = act({ c: 'order', ids: us.map(u => u.id), x: pos.x, y: pos.y, tid: target ? target.id : 0, plain: !!plain });
  if (why) return toast(why);
  localFx(target ? { type: 'ping', x: target.x, y: target.y, r: target.r + 14, life: 0.5, color: '#ff5d5d' } : { type: 'ping', x: pos.x, y: pos.y, r: 26, life: 0.5, color: plain ? '#8ac6ff' : '#7dff9a' });
}

function finishDrag(shift) {
  const d = UI.drag; UI.drag = null;
  if (!d) return;
  const own = e => e.owner === G.human;
  let picked = [];
  if (Math.abs(d.x1 - d.x0) > 6 || Math.abs(d.y1 - d.y0) > 6) {
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    for (const u of G.units) {
      if (u.owner !== G.human || u.dead) continue;
      const s = toScreen(u.x, u.r, u.y);
      if (s && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) picked.push(u);
    }
  } else {
    const e = pickEnt(d.x1, d.y1, e => own(e) && e.kind === 'unit') || pickEnt(d.x1, d.y1, own);
    if (e) picked = [e];
  }
  if (shift && picked.length && picked[0].kind === 'unit') UI.sel = [...new Set(UI.sel.filter(e => e.kind === 'unit').concat(picked))];
  else UI.sel = picked;
  hudT = 0;
}

// Общие действия мыши, клавиатуры и сенсорных кнопок
function castAt(sx, sy) { // применить способность героя в точку экрана
  const pos = groundAt(sx, sy);
  if (!pos) return;
  const why = act({ c: 'cast', x: pos.x, y: pos.y });
  if (why) toast(why);
  UI.casting = false;
}
function placeAt(sx, sy, keep) { // поставить выбранное здание в точку экрана (keep — не сбрасывать выбор, чтобы ставить подряд)
  const pos = groundAt(sx, sy);
  if (!pos) return;
  const p = me(), t = UI.placing; // клиент сам проверяет место, чтобы не ждать ответа хоста
  const pre = G.net === 'client' ? (p.gold < buildCost(p, t) ? T('Недостаточно золота') : canPlace(p, t, pos.x, pos.y)) : '';
  const why = pre || act({ c: 'build', type: t, x: pos.x, y: pos.y });
  if (why) toast(why); else if (!keep) UI.placing = null;
}
function selectSame(u) { // двойной щелчок по воину: выделить всех своих воинов того же вида
  UI.sel = G.units.filter(x => x.owner === G.human && !x.dead && x.type === u.type); hudT = 0;
}
function selectArmy() { if (!G.possessed) { UI.sel = G.units.filter(u => u.owner === G.human && !u.dead); hudT = 0; } }
function goBase() { if (!G.possessed) { const al = me().alarm, to = al && G.time - al.t < 10 ? al : me().hq; UI.cam.x = to.x; UI.cam.y = to.y; } }
function cancelAll() { if (G.possessed) unpossess(); else if (UI.casting) UI.casting = false; else if (UI.placing) UI.placing = null; else if (UI.sel.length) UI.sel = []; }

// ---- события ----
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  if (!G.running || G.over) return;
  Input.sx = e.clientX; Input.sy = e.clientY;
  if (G.possessed) {
    if (e.button === 0) Input.lmb = Input.lmbHit = true;
    if (e.button === 2) Input.rmb = Input.rmbHit = true;
    if (document.pointerLockElement !== cv) lock();
    return;
  }
  if (e.button === 0) {
    if (UI.casting) return castAt(e.clientX, e.clientY);
    if (UI.placing) return placeAt(e.clientX, e.clientY, e.shiftKey);
    UI.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
  } else if (e.button === 2) {
    if (UI.casting) UI.casting = false; else if (UI.placing) UI.placing = null; else command(e.ctrlKey);
  }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) { Input.lmb = false; if (UI.drag) finishDrag(e.shiftKey); }
  if (e.button === 2) Input.rmb = false;
});
window.addEventListener('mousemove', e => {
  Input.sx = e.clientX; Input.sy = e.clientY;
  if (UI.drag) { UI.drag.x1 = e.clientX; UI.drag.y1 = e.clientY; }
  if (G.possessed && (document.pointerLockElement === cv || e.buttons)) {
    Input.yaw += e.movementX * 0.0032;
    Input.aim = Math.max(0, Math.min(1, Input.aim - e.movementY * 0.003));
  }
});
cv.addEventListener('dblclick', e => {
  if (!G.running || G.over || G.possessed) return;
  const u = pickEnt(e.clientX, e.clientY, x => x.owner === G.human && x.kind === 'unit');
  if (u) selectSame(u);
});
window.addEventListener('wheel', e => {
  if (!G.running) return;
  if (G.possessed) Input.aim = Math.max(0, Math.min(1, Input.aim - Math.sign(e.deltaY) * 0.1));
  else UI.cam.dist = Math.max(320, Math.min(1700, UI.cam.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
}, { passive: true });

window.addEventListener('keydown', e => {
  if (settingsOpen()) return; // пока открыты настройки, игре клавиши не нужны (закрываются кнопкой «Готово»)
  Input.keys[e.code] = true;
  if (!G.running || G.over) return;
  if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (UI.paused) { if (['KeyP', 'KeyH'].includes(e.code)) setPause(false); return; }
  switch (e.code) {
    case 'KeyZ': startPlacing(buildDefs[0]); break;
    case 'KeyX': startPlacing(buildDefs[1]); break;
    case 'KeyC': startPlacing(buildDefs[2]); break;
    case 'Digit1': train(0); break;
    case 'Digit2': train(1); break;
    case 'Digit3': train(2); break;
    case 'Digit4': if (!G.possessed) hireHero(); break;
    case 'KeyR': if (!G.possessed) research('atk'); break;
    case 'KeyT': if (!G.possessed) research('arm'); break;
    case 'KeyY': if (!G.possessed) research('eco'); break;
    case 'KeyU': if (!G.possessed) research('fort'); break;
    case 'KeyG': if (!G.possessed) repairKey(); break;
    case 'KeyV': if (!G.possessed) castKey(e.shiftKey); break;
    case 'KeyF':
      if (G.possessed) unpossess();
      else { const u = UI.sel.find(x => x.kind === 'unit' && !x.dead); if (u) possess(u); else toast(T('Сначала выберите воина')); }
      break;
    case 'Tab': if (G.possessed) possessNext(); break;
    // Esc площадка запрещает (браузер держит его для выхода из полного экрана): отмена — Backspace, пауза — P или H
    case 'Backspace': case 'Delete': cancelAll(); break;
    case 'KeyE': selectArmy(); break;
    case 'Space': goBase(); break;
    case 'KeyP': case 'KeyH': setPause(true); break;
  }
});
window.addEventListener('keyup', e => { Input.keys[e.code] = false; });
window.addEventListener('blur', () => { Input.keys = {}; Input.lmb = Input.rmb = false; });

let miniDown = false;
function miniGo(e) {
  const r = mini.getBoundingClientRect();
  UI.cam.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * WORLD.w;
  UI.cam.y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * WORLD.h;
}
mini.addEventListener('mousedown', e => { miniDown = true; miniGo(e); });
window.addEventListener('mousemove', e => { if (miniDown) miniGo(e); });
window.addEventListener('mouseup', () => { miniDown = false; });
// Сенсорный режим: включается на устройствах с экраном-указателем (телефон, планшет), по первому касанию или параметром ?touch=1 (для проверки на компьютере)
function setTouch(on) {
  if (UI.touch === on) return;
  UI.touch = on; document.documentElement.classList.toggle('touch', on); resize();
}
const Touch = initTouch({ cv, size: () => [VW, VH], me, pxPerUnit, pickEnt, command, finishDrag, possess, unpossess, possessNext, castKey, repairKey, placeAt, castAt, selectArmy, selectSame, goBase, cancelAll, miniGo,
  snapCam: () => { camSnap = true; } });
if (matchMedia('(pointer: coarse)').matches || Plat.mobile || /[?&]touch\b/.test(location.search)) setTouch(true);
window.addEventListener('touchstart', () => setTouch(true), { passive: true });
$('possessBtn').onclick = () => possess(UI.sel.find(x => x.kind === 'unit' && !x.dead));
$('repairBtn').onclick = repairKey;

const SCREENS = ['menu', 'end', 'pauseMenu'];
// init — стартовое сообщение от хоста (только у клиента сетевой игры)
function startGame(init) {
  if (UI.touch && Plat.id === 'mock' && document.fullscreenEnabled && !document.fullscreenElement) { // вне площадки на телефоне — на весь экран и в альбомную ориентацию (на площадке этим занимается она)
    document.documentElement.requestFullscreen().then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
  }
  Sfx.init(); Music.start(); Music.setMode('match');
  const client = !!init && init.t === 'start';
  let cfg = null;
  if (client) Net.clientInit(init);
  else {
    if (Net.role === 'client') return;
    if (Net.role === 'host') {
      cfg = Net.makeCfg();
      if (cfg.players.length < 2) return menuSay(T('Нужен хотя бы один соперник: второй игрок или бот'));
    } else if (UI.camp.on) {
      if (!Camp.unlocked(UI.camp.sel)) return;
      cfg = Camp.cfg(Camp.M[UI.camp.sel]);
    } else {
      const others = Object.keys(FACTIONS).filter(f => f !== UI.menu.faction).sort(() => Math.random() - 0.5);
      cfg = { map: UI.menu.map, diff: UI.menu.diff, human: 0, players: [UI.menu.faction, ...others.slice(0, UI.menu.bots)].map((f, i) => ({ faction: f, bot: i > 0, team: i })) };
    }
    newGame(cfg);
    if (!UI.camp.on) Store.set('profile', { ...profile(), last: { ...UI.menu } }); // запоминаем выбор в меню (миссии свои, их не запоминаем)
  }
  Plat.level('level_started');
  setTerrain(G.players.map(p => ({ x: p.hq.x, y: p.hq.y, ground: BASE_GROUND[p.faction] })));
  if (!client) G.obstacles = G.obstacles.filter(o => terrain.roadDist(o.x, o.y) > o.r + 48 && Math.hypot(o.x - WORLD.w / 2, o.y - WORLD.h / 2) > 190);
  clearScene(); buildObstacles();
  if (G.net === 'host') Net.begin(cfg);
  if (document.pointerLockElement) document.exitPointerLock();
  UI.sel = []; UI.placing = null; UI.casting = false; UI.drag = null; UI.paused = false; UI.lastAlert = -99;
  UI.cam.x = me().hq.x; UI.cam.y = me().hq.y; UI.cam.dist = 900; camSnap = true;
  buildHud(); tutBegin();
  for (const id of SCREENS) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  hudT = 0; lastSel = '';
}

// ================= Цели миссии и обучение =================
// Над полем боя висит табличка: в обучающих миссиях — текущий шаг (с подсветкой нужной кнопки), потом — цель миссии.
// Условия шагов лежат в campaign.js; тут они проверяются четыре раза в секунду. Шаг можно пропустить кнопкой, а при бездействии в нём ничего не ломается.
const Tut = { el: $('tut'), m: null, steps: null, step: null, i: 0, hi: [], t: 0 };
function tutBegin() {
  const m = Tut.m = G.mission && !G.net ? G.mission : null;
  Tut.steps = m && m.steps ? m.steps : null; Tut.i = 0; Tut.t = 0; Tut.step = null; Camp.mem = {};
  Tut.el.classList.toggle('hidden', !m);
  if (!m) $('tutPt').classList.add('hidden');
  $('tutSkip').classList.toggle('hidden', !Tut.steps);
  if (m) tutRender();
}
// Подсказки в основном картинками: значки клавиш и мыши в табличке, мигающая кнопка со стрелкой над ней, кольца и стрелки на самом поле боя
const MOUSE = (l, r, w) => `<svg class="ico-m" viewBox="0 0 24 32"><rect x="3" y="2" width="18" height="28" rx="9" fill="#14171b" stroke="#cfd5db" stroke-width="1.6"/>`
  + (l ? '<path class="hl" d="M12 2.8a8.2 8.2 0 0 0-8.2 8.2v2.4H12z"/>' : '') + (r ? '<path class="hl" d="M12 2.8a8.2 8.2 0 0 1 8.2 8.2v2.4H12z"/>' : '') + (w ? '<rect class="hl" x="10" y="5" width="4" height="7" rx="2"/>' : '')
  + '<path d="M12 2.5v11M3 13.4h18" stroke="#cfd5db" stroke-width="1.2" fill="none"/></svg>';
// Значки обучения для сенсорного экрана: клавиши и мышь заменяются касаниями
function touchIcons(list) {
  const out = [];
  for (const n of list) {
    const m = n === 'wasd' ? 'joy' : n === 'wheel' ? 'pinch' : n === 'box' ? 'drag' : n === 'edge' ? null : (n === 'lmb' || n === 'rmb' || n.startsWith('k:')) ? 'tap' : n;
    if (m && out[out.length - 1] !== m) out.push(m);
  }
  return out;
}
const FINGER = '<circle class="fg" cx="12" cy="12" r="6"/>';
function tutIcon(n) {
  if (n.startsWith('k:')) return `<kbd class="kc">${n.slice(2)}</kbd>`;
  switch (n) {
    case 'tap': return `<svg class="ico-b" viewBox="0 0 40 30"><circle class="ring" cx="20" cy="15" r="11"/>${FINGER.replace('cx="12" cy="12"', 'cx="20" cy="15"')}</svg>`;
    case 'drag': return `<svg class="ico-b" viewBox="0 0 40 30"><path class="hl" d="M7 15h26M12 10l-5 5 5 5M28 10l5 5-5 5"/><circle class="fg" cx="20" cy="15" r="5"/></svg>`;
    case 'pinch': return `<svg class="ico-b" viewBox="0 0 40 30"><path class="hl" d="M6 24 15 15M34 6 25 15M10 15h5v5M30 15h-5v-5"/><circle class="fg" cx="12" cy="21" r="4"/><circle class="fg" cx="28" cy="9" r="4"/></svg>`;
    case 'joy': return `<svg class="ico-b" viewBox="0 0 40 30"><circle cx="20" cy="15" r="12" fill="none" stroke="#cfd5db" stroke-width="1.6"/><circle class="fg" cx="24" cy="12" r="5"/><path class="hl" d="M20 3v4M20 23v4M8 15h4M28 15h4"/></svg>`;
    case 'wasd': return '<span class="kw"><kbd class="kc">W</kbd><kbd class="kc">A</kbd><kbd class="kc">S</kbd><kbd class="kc">D</kbd></span>';
    case 'lmb': return MOUSE(1, 0, 0);
    case 'rmb': return MOUSE(0, 1, 0);
    case 'wheel': return MOUSE(0, 0, 1);
    case 'box': return '<svg class="ico-b" viewBox="0 0 40 30"><rect class="dash" x="4" y="4" width="26" height="18" fill="rgba(140,255,130,.15)" stroke="#b9ffb0" stroke-width="1.6"/><path d="M26 16l12 5-5 1.5L31 28z" fill="#fff" stroke="#000" stroke-width="1"/></svg>';
    case 'edge': return '<svg class="ico-b" viewBox="0 0 40 30"><rect x="2" y="3" width="36" height="24" fill="none" stroke="#cfd5db" stroke-width="1.6"/><path class="hl" d="M30 15h7M34 11l4 4-4 4"/></svg>';
    case 'wait': return '<i class="ico clock wait"></i>';
    default: return `<i class="sep">›</i>`; // '→'
  }
}
function tutRender() {
  const m = Tut.m, el = Tut.el, s = Tut.steps && Tut.steps[Tut.i];
  for (const e of Tut.hi) e.classList.remove('tutHi');
  Tut.hi = []; Tut.step = s || null;
  if (s) {
    if (s.init) s.init();
    s.t0 = G.time;
    el.querySelector('.tk').textContent = T`${m.title} · шаг ${Tut.i + 1} из ${Tut.steps.length}`;
    el.querySelector('.ti').innerHTML = (UI.touch ? s.ti || touchIcons(s.icons || []) : s.icons || []).map(tutIcon).join('');
    el.querySelector('.tx').innerHTML = s.text;
    el.querySelector('.tb i').style.width = Tut.i / Tut.steps.length * 100 + '%';
    const hiSel = UI.touch && s.hiT ? s.hiT : s.hi; // на телефоне вместо клавиши подсвечивается сенсорная кнопка
    if (hiSel) for (const e of document.querySelectorAll(hiSel)) { e.classList.add('tutHi'); Tut.hi.push(e); }
  } else {
    el.querySelector('.tk').textContent = m.title;
    el.querySelector('.ti').innerHTML = '';
    el.querySelector('.tx').textContent = m.goal;
    el.querySelector('.tb i').style.width = '100%';
    $('tutSkip').classList.add('hidden');
  }
  tutPoint();
}
// Стрелка над подсвеченной кнопкой (или группой кнопок)
function tutPoint() {
  const pt = $('tutPt'), els = Tut.hi.filter(e => e.offsetParent !== null);
  if (!els.length) { pt.classList.add('hidden'); return; }
  let l = 1e9, r = -1e9, t = 1e9;
  for (const e of els) { const b = e.getBoundingClientRect(); l = Math.min(l, b.left); r = Math.max(r, b.right); t = Math.min(t, b.top); }
  pt.style.left = (l + r) / 2 - 14 + 'px'; pt.style.top = t - 44 + 'px'; pt.classList.remove('hidden');
}
// Кольца и стрелки на поле боя: рисуются в оверлее каждый кадр. Метки отдаёт шаг (поле at); за экраном — стрелка у края в нужную сторону.
function tutChevron(x, y, a, col, pulse) {
  octx.save(); octx.translate(x, y); octx.rotate(a); octx.scale(1 + 0.15 * pulse, 1 + 0.15 * pulse);
  octx.fillStyle = `rgb(${col})`; octx.strokeStyle = '#000'; octx.lineWidth = 2.5; octx.lineJoin = 'round';
  octx.beginPath(); octx.moveTo(15, 0); octx.lineTo(-10, -13); octx.lineTo(-4, 0); octx.lineTo(-10, 13); octx.closePath(); octx.stroke(); octx.fill();
  octx.restore();
}
function tutKeycap(x, y, key) {
  octx.save(); octx.fillStyle = '#2a2f36'; octx.strokeStyle = '#ffd866'; octx.lineWidth = 2;
  octx.beginPath(); octx.roundRect(x - 14, y - 14, 28, 28, 5); octx.fill(); octx.stroke();
  octx.fillStyle = '#fff'; octx.font = 'bold 16px "Russo One", sans-serif'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText(key, x, y + 1);
  octx.restore();
}
function drawTutMarkers() {
  const s = Tut.m && Tut.steps && Tut.steps[Tut.i];
  if (!s || !G.running || G.over || UI.paused) return;
  const t = performance.now() / 1000, pulse = (Math.sin(t * 4) + 1) / 2, bob = Math.sin(t * 6) * 5;
  if (s.edges && !UI.touch) for (const [x, y, a] of [[VW / 2, 92, -Math.PI / 2], [VW / 2, VH - 34, Math.PI / 2], [34, VH / 2, Math.PI], [VW - 34, VH / 2, 0]]) tutChevron(x, y, a, '255,214,90', pulse);
  const edge = [];
  for (const o of s.at ? s.at() : []) {
    const col = o.kind === 'enemy' ? '255,93,93' : '255,214,90', c = toScreen(o.x, 0, o.y);
    if (!c || c.x < 24 || c.x > VW - 24 || c.y < 70 || c.y > VH - 24) { // метка за экраном — стрелка у края в её сторону
      const c0 = toScreen(UI.cam.x, 0, UI.cam.y), dx = o.x - UI.cam.x, dy = o.y - UI.cam.y, l = Math.hypot(dx, dy) || 1, c1 = toScreen(UI.cam.x + dx / l * 150, 0, UI.cam.y + dy / l * 150);
      if (!c0 || !c1) continue;
      let vx = c1.x - c0.x, vy = c1.y - c0.y; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
      const mx = VW / 2 - 46, my = VH / 2 - 84, k = Math.min(vx ? mx / Math.abs(vx) : 1e9, vy ? my / Math.abs(vy) : 1e9);
      const ex = VW / 2 + vx * k, ey = VH / 2 + vy * k;
      if (!edge.some(q => Math.hypot(q[0] - ex, q[1] - ey) < 40)) { edge.push([ex, ey]); tutChevron(ex, ey, Math.atan2(vy, vx), col, pulse); } // одна стрелка на группу меток
      continue;
    }
    const R = Math.max(28, o.r * pxPerUnit(o.x, o.y));
    octx.save(); octx.translate(c.x, c.y); octx.scale(1, 0.55);
    octx.setLineDash(o.kind === 'spot' ? [9, 7] : []); octx.lineDashOffset = -t * 24;
    octx.fillStyle = `rgba(${col},${0.16 + 0.12 * pulse})`; octx.strokeStyle = `rgba(${col},${0.85 + 0.15 * pulse})`; octx.lineWidth = 4.5;
    octx.beginPath(); octx.arc(0, 0, R * (1 + 0.07 * pulse), 0, 6.2832); octx.fill(); octx.stroke();
    if (o.kind === 'enemy') { octx.beginPath(); octx.arc(0, 0, R * 0.62, 0, 6.2832); octx.stroke(); }
    octx.restore();
    const top = toScreen(o.x, o.h || 40, o.y), ay = (top ? top.y : c.y - 60) - 18 + bob;
    octx.fillStyle = `rgb(${col})`; octx.strokeStyle = '#000'; octx.lineWidth = 2.5; octx.lineJoin = 'round';
    octx.beginPath(); octx.moveTo(c.x - 11, ay - 20); octx.lineTo(c.x + 11, ay - 20); octx.lineTo(c.x, ay); octx.closePath(); octx.stroke(); octx.fill();
    if (o.key) tutKeycap(c.x, ay - 38, o.key);
  }
}
function tutTick(dt) {
  const m = Tut.m;
  if (!m || !G.running || G.over) return;
  Tut.t -= dt;
  if (Tut.t > 0) return;
  Tut.t = 0.25;
  const s = Tut.steps && Tut.steps[Tut.i];
  if (s) {
    if (s.done() || (s.auto && G.time - s.t0 > s.auto)) { Sfx.play('ready'); if (++Tut.i >= Tut.steps.length) Tut.steps = null; tutRender(); }
    else tutPoint(); // кнопки могли сдвинуться (окно изменили) — стрелка следует за ними
  }
  if (m.type === 'survive' && !Tut.steps) Tut.el.querySelector('.tx').textContent = m.goal + ' ' + T('Осталось') + ' ' + fmtTime(Math.max(0, m.surviveT - G.time));
}
$('tutSkip').onclick = () => { Tut.steps = null; tutRender(); };
function toMenu() {
  if (Net.role === 'host') Net.finish(); // бой окончен для всех, комната остаётся
  else if (Net.role === 'client' && G.running && !G.over) { Net.leave(); UI.net.msg = T('Вы вышли из комнаты'); } // уход посреди боя — выход из комнаты
  G.running = false; UI.paused = false; Music.setMode('menu'); Tut.m = null; $('tutPt').classList.add('hidden');
  previewMap(); buildMenu();
  if (document.pointerLockElement) document.exitPointerLock();
  for (const id of SCREENS) $(id).classList.add('hidden');
  $('hud').classList.add('hidden'); $('menu').classList.remove('hidden');
}
function setPause(v) {
  if (!G.running || G.over) return;
  UI.paused = v;
  $('pauseMenu').classList.toggle('hidden', !v);
  $('restartBtn').classList.toggle('hidden', G.net === 'client');
  $('pauseNet').classList.toggle('hidden', !G.net);
  if (v && document.pointerLockElement) document.exitPointerLock();
  hideTip();
}
// Реклама — в естественных паузах: когда игрок ушёл с экрана итога (новый бой или меню). Когда именно показывать, решает сам Bridge.
$('startBtn').onclick = () => startGame(); $('restartBtn').onclick = () => startGame();
$('againBtn').onclick = () => { Plat.showAd('match_end'); startGame(); };
$('endMenuBtn').onclick = () => { Plat.showAd('match_end'); toMenu(); }; $('quitBtn').onclick = toMenu;
$('nextBtn').onclick = () => { Plat.showAd('match_end'); UI.camp.sel = Math.min(Camp.M.length - 1, UI.camp.sel + 1); applyMission(); startGame(); };
$('resumeBtn').onclick = () => setPause(false);
$('pauseBtn').onclick = $('helpBtn').onclick = () => setPause(true);
// Кнопка звука одна на все места (в бою, в меню, в паузе): состояние общее и запоминается
function syncSnd() {
  $('soundBtn').classList.toggle('mute', !Sfx.on);
  for (const id of ['menuSnd', 'pauseSnd']) $(id).textContent = Sfx.on ? T('Звук: вкл') : T('Звук: выкл');
}
function toggleSound() { Sfx.init(); Sfx.setOn(!Sfx.on); syncSnd(); }
$('soundBtn').onclick = $('menuSnd').onclick = $('pauseSnd').onclick = toggleSound;
syncSnd();
// Скрытая или свёрнутая вкладка — тишина (требование площадки), при возвращении звук продолжается
document.addEventListener('visibilitychange', () => Sfx.setHold('hidden', document.hidden));
if (document.hidden) Sfx.setHold('hidden', true);
// Настройки громкости: общая, эффекты, музыка (музыки пока нет, но её ползунок уже сохраняется). Открываются из меню и из паузы.
const VOLS = [['volMaster', 'master'], ['volFx', 'fx'], ['volMusic', 'music']];
const settingsOpen = () => !$('settings').classList.contains('hidden');
function syncVols() { for (const [id, k] of VOLS) { const v = Math.round(Sfx.vols[k] * 100); $(id).value = v; $(id).style.setProperty('--p', v + '%'); $(id + 'V').textContent = v + '%'; } }
function openSettings() { Sfx.init(); syncVols(); $('settings').classList.remove('hidden'); }
function closeSettings() { $('settings').classList.add('hidden'); }
for (const [id, k] of VOLS) {
  $(id).oninput = () => { Sfx.setVol(k, $(id).value / 100); syncVols(); };
  $(id).onchange = () => { if (k !== 'music') { Sfx.init(); Sfx.lastK = {}; Sfx.play('hit'); } }; // отпустили ползунок — короткий образец звука
}
$('menuSet').onclick = $('pauseSet').onclick = openSettings; $('setClose').onclick = closeSettings;
// Звук интерфейса: клик по кнопкам и карточкам меню; первый клик заодно включает звук (браузер требует жеста)
document.addEventListener('pointerdown', e => {
  Sfx.init(); Music.start();
  if (e.target.closest && e.target.closest('button, #facCards > *, #mapCards > *, .seg > *, .tabs > *')) Sfx.play('click');
}, true);

function showEnd() {
  if (document.pointerLockElement) document.exitPointerLock();
  G.possessed = null;
  const win = G.over === 'victory', mp = me(), foes = G.players.filter(q => q.team !== mp.team), sum = k => foes.reduce((a, q) => a + q[k], 0);
  const st = { killed: sum('lost'), lost: mp.lost, razed: sum('bl') };
  Sfx.play(win ? 'win' : 'lose');
  Plat.level(win ? 'level_completed' : 'level_failed');
  const pr = profile(); Store.set('profile', { ...pr, matches: pr.matches + 1, wins: pr.wins + (win ? 1 : 0) });
  $('againBtn').classList.toggle('hidden', G.net === 'client');
  $('end').classList.toggle('win', win); $('end').classList.toggle('lose', !win);
  $('endTitle').textContent = win ? T('ПОБЕДА') : T('ПОРАЖЕНИЕ');
  $('endSub').textContent = win ? T('Все вражеские цитадели разрушены.') : T('Ваша цитадель пала.') + (G.net === 'client' ? T(' Новый бой начнёт хост.') : '');
  $('endStats').innerHTML = [[fmtTime(G.time), T('время боя')], [st.killed, T('врагов пало')], [st.lost, T('воинов потеряно')], [st.razed, T('зданий разрушено')]]
    .map(r => `<div><b>${r[0]}</b><span>${r[1]}</span></div>`).join('');
  // Миссия кампании: звёзды, сохранение прогресса и кнопка следующей миссии
  const ms = G.mission, idx = ms ? Camp.M.indexOf(ms) : -1;
  $('nextBtn').classList.add('hidden');
  if (ms && idx >= 0) {
    const stars = win ? Camp.earned(ms, G.time, st.lost) : 0, prev = Camp.done();
    if (win && (prev[ms.id] || 0) < stars) Store.set('profile', { ...profile(), camp: { ...prev, [ms.id]: stars } });
    $('endTitle').textContent = win ? T('МИССИЯ ВЫПОЛНЕНА') : T('МИССИЯ ПРОВАЛЕНА');
    const last = idx === Camp.M.length - 1;
    $('endSub').textContent = win ? (last ? T('Кампания пройдена! Вы разгромили всех врагов.') : ms.title) : ms.title + ' · ' + T('Попробуйте ещё раз.');
    if (win) $('endStats').insertAdjacentHTML('afterbegin', `<div class="endStars"><b>${'★'.repeat(stars)}<em>${'★'.repeat(3 - stars)}</em></b><span>${T('звёзд')}</span></div>`);
    $('nextBtn').classList.toggle('hidden', !win || last);
  }
  $('end').classList.remove('hidden');
}

function resize() {
  VW = window.innerWidth; VH = window.innerHeight;
  document.documentElement.classList.toggle('compact', VH <= 560); // низкий экран (телефон): панели боя ужимаются
  renderer.setPixelRatio(Math.min(UI.touch ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.setSize(VW, VH, false);
  camera.aspect = VW / VH; camera.updateProjectionMatrix();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ov.width = VW * dpr; ov.height = VH * dpr; octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

// Если вкладка хоста скрыта, браузер останавливает кадры — тогда бой считается по таймеру, чтобы у остальных он не замирал
let bgLast = performance.now();
setInterval(() => {
  const now = performance.now();
  if (document.hidden && G.net === 'host' && G.running) {
    let left = Math.min(1.2, (now - bgLast) / 1000);
    while (left > 0 && !G.over) { const d = Math.min(0.05, left); update(d); left -= d; }
    Net.hostTick(1);
  }
  bgLast = now;
}, 100);

// ================= Главный цикл =================
let last = 0, shownEnd = false;
const hurtEl = $('hurt'), pCdEl = $('pCd'), crossEl = $('cross');
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts; frameId++;
  // В сетевой игре пауза не останавливает бой: хост считает дальше, клиент продолжает получать снимки
  if (G.running && (G.net ? true : !G.over && !UI.paused && !Plat.frozen)) {
    if (!UI.paused && !G.over) camInput(dt);
    if (G.net === 'client') Net.step(dt); else if (!G.over) update(dt);
    if (G.net === 'host') Net.hostTick(dt);
    if (G.notes.length) toast(G.notes.pop(), true), G.notes.length = 0;
    if (G.possessLost) { G.possessLost = false; UI.locked = false; if (document.pointerLockElement) document.exitPointerLock(); toast(T('Ваш воин пал')); hudT = 0; }
    if (!G.over) shownEnd = false;
  }
  if (G.running && G.over && !shownEnd) { shownEnd = true; showEnd(); }
  fogUpdate(dt);
  if (!UI.paused) tutTick(dt);
  UI.sel = UI.sel.filter(e => !e.dead && !fogHides(e));
  if (G.shakes && G.shakes.length) {
    const reach = G.possessed ? 520 : UI.cam.dist * 1.1;
    for (const sh of G.shakes) UI.shake = Math.max(UI.shake, sh.amp * Math.max(0, 1 - Math.hypot(sh.x - camLook.x, sh.y - camLook.z) / reach));
    G.shakes.length = 0;
  }
  if (G.possessed) { const cdMax = UNITS[G.possessed.type].cd, k = Math.max(0, Math.min(1, 1 - G.possessed.cd / cdMax)); pCdEl.style.width = k * 100 + '%'; crossEl.classList.toggle('wait', k < 1); }
  hurtEl.style.opacity = G.possessed ? Math.max(0, 1 - (G.time - G.heroHit) / 0.45) * 0.75 : 0;
  updateCamera(dt);
  const w = groundAt(Input.sx, Input.sy);
  if (w) { Input.wx = w.x; Input.wy = w.y; }
  const t = ts / 1000;
  env.update(t, camera);
  syncEnts(t, dt); syncProps(t, dt); updateDying(dt); syncProjs(t); effects.sync(); syncMarkers();
  renderer.render(scene, camera);
  drawOverlay();
  if (G.running && frameId % 4 === 0) drawMini();
  hudTick(dt);
  Touch.update();
}

// Фон меню: пустая карта с медленным облётом
UI.cam.x = WORLD.w / 2; UI.cam.y = WORLD.h / 2; UI.cam.dist = 1500;
window.GameDebug = { THREE, scene, camera, renderer, possess, unpossess, groundAt, toScreen, entMesh, Fog }; // Fog.force = true включает туман и в одиночной игре (для проверки)
// Готовые модели со скелетом; если файл не загрузился, воин останется прежним, собранным из фигур
await loadStyles().catch(e => console.warn('Манеры движения не загружены:', e.message));
await Promise.all(SKINNED_UNITS.map(t => loadSkinned(t).catch(e => console.warn('Модель не загружена:', t, e.message))));
previewMap();
buildMenu();
resize();
requestAnimationFrame(frame);
requestAnimationFrame(() => requestAnimationFrame(() => Plat.ready())); // меню нарисовано, игрок может нажимать — говорим площадке «игра готова»
