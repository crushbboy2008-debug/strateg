// ---------- 3D-отрисовка (Three.js), камера, ввод и интерфейс ----------
import * as THREE from '../lib/three.module.js';
import { createEnvironment, buildTerrain, groundPatch } from './world.js';
import { makeUnit, makeBuilding, makeObstacles, makeDecor, makeProp, makeProj, animate, loadSkinned, loadStyles, SKINNED_UNITS, LIT, FLASH } from './models.js';
import { createEffects } from './effects.js';
import { portrait } from './portraits.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), ov = $('ov'), octx = ov.getContext('2d'), mini = $('mini'), mctx = mini.getContext('2d');
let VW = 1, VH = 1;

const UI = { sel: [], placing: null, drag: null, paused: false, locked: false, cam: { x: 0, y: 0, dist: 900, zoom: 1 },
  menu: { faction: 'legion', bots: 2, diff: 'normal', map: 'island' },
  net: { on: false, busy: false, msg: '', code: '', coop: false } };
window.UI = UI;
UI.shake = 0;

const ICON = { swordsman: '🗡️', archer: '🏹', knight: '🐎', berserker: '😡', axethrower: '🪓', ogre: '👹', golem: '🗿', pyromancer: '🔥', priest: '✨',
  drone: '🛸', sniper: '🎯', tank: '🚜', hq: '🏯', mine: '⛏️', barracks: '🏰', ballista: '🏹', brazier: '🔥', obelisk: '🔮', mortar: '💣' };

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
function buildObstacles() {
  for (const g of natureGroups) { scene.remove(g); g.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
  for (const m of propMeshes) scene.remove(m.g);
  const avoid = G.obstacles.concat(G.players.map(p => ({ x: p.hq.x, y: p.hq.y, r: 78 })), G.props.filter(q => q.r).map(q => ({ x: q.x, y: q.y, r: q.r + 6 })));
  natureGroups = [makeObstacles(G.obstacles, G.map), makeDecor(WORLD.w, WORLD.h, avoid, G.map)];
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
    else if (m.g.userData.anim.length) animate(m.g, m.q, t, dt);
  }
}
// Фон меню под выбранную карту
function previewMap() {
  G.map = MAPS[UI.menu.map]; WORLD.w = WORLD.h = G.map.size;
  Object.assign(G, { running: false, ents: [], units: [], blds: [], projs: [], fx: [], parts: [], obstacles: [], props: [], players: [] });
  clearScene(); setTerrain([]); buildObstacles();
}

// ================= Синхронизация сцены с симуляцией =================
const entMesh = new Map(), projMesh = new Map(), dying = [];
let frameId = 0;

function clearScene() {
  for (const m of entMesh.values()) scene.remove(m);
  for (const m of projMesh.values()) scene.remove(m);
  for (const d of dying) scene.remove(d.g);
  entMesh.clear(); projMesh.clear(); dying.length = 0;
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
    m.rotation.y = -p.ang;
    if (p.kind === 'axe') m.rotation.z = -t * 16;
  }
  for (const [p, m] of projMesh) if (m.userData.seen !== frameId) { scene.remove(m); projMesh.delete(p); }
}

const effects = createEffects(scene, renderer, camera);

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
    } else if (e.type === 'golem') {
      end = 1.8;
      b.scale.y = Math.max(0.22, 1 - d.t * 2.4);
      if (d.t > 1.1) b.position.y = -(d.t - 1.1) * 18;
    } else {
      const k = Math.min(1, d.t / 0.35);
      b.rotation.x = d.side * k * k * 1.5;
      if (d.t > 0.9) b.position.y = -(d.t - 0.9) * 28;
    }
    if (d.t >= end) { scene.remove(g); dying.splice(i, 1); }
  }
}

// ---- вспомогательные маркеры: призрак постройки, зона башни, прицел, точка сбора ----
function flat(geom, color, opacity) {
  const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
  return m;
}
const ghost = flat(new THREE.CircleGeometry(1, 32), '#5dff7a', 0.45);
const rangeRing = flat(new THREE.RingGeometry(0.985, 1, 72), '#ffffff', 0.8);
const minRing = flat(new THREE.RingGeometry(0.96, 1, 48), '#ff6a6a', 0.8);
const zoneDisc = flat(new THREE.CircleGeometry(1, 72), '#ffffff', 0.08);
const reticle = flat(new THREE.RingGeometry(0.85, 1, 40), '#ffd24a', 0.9);
const rallyMark = flat(new THREE.RingGeometry(0.5, 1, 4), '#7dff9a', 0.9);
const abilMark = flat(new THREE.RingGeometry(0.93, 1, 64), '#ff8a2a', 0.95), abilDisc = flat(new THREE.CircleGeometry(1, 48), '#ff8a2a', 0.16);
const abilArea = a => a.key === 'rockets' ? a.spread + a.r : a.r; // радиус поражения способности

function syncMarkers() {
  const me = G.players[G.human];
  ghost.visible = rangeRing.visible = minRing.visible = zoneDisc.visible = reticle.visible = rallyMark.visible = abilMark.visible = abilDisc.visible = false;
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
    const f = Input.yaw, D = 74 + u.r * 3, H = 54 + u.r * 2.2 + (u.fly ? 30 : 0);
    wantPos.set(u.x - Math.cos(f) * D, H, u.y - Math.sin(f) * D);
    wantLook.set(u.x + Math.cos(f) * 90, (u.fly ? 26 : 0) - 4, u.y + Math.sin(f) * 90);
    c.x = u.x; c.y = u.y;
  } else {
    const p = 0.92; // наклон RTS-камеры
    if (G.running) { wantPos.set(c.x, c.dist * Math.sin(p), c.y + c.dist * Math.cos(p)); wantLook.set(c.x, 0, c.y); }
    else { // в меню камера медленно облетает остров
      const a = performance.now() * 0.00004;
      wantPos.set(WORLD.w / 2 + Math.cos(a) * 2700, 850, WORLD.h / 2 + Math.sin(a) * 2700); wantLook.set(WORLD.w / 2, 0, WORLD.h / 2);
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
    Input.yaw += ((k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0)) * 2.4 * dt;
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
    if (e.dead || !filter(e)) continue;
    const s = toScreen(e.x, entTop(e) * 0.45, e.y);
    if (!s) continue;
    const pr = e.r * pxPerUnit(e.x, e.y) * 1.3 + 8, d = Math.hypot(s.x - sx, s.y - sy);
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
    if (e.dead) continue;
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
      octx.font = 'bold 12px "Segoe UI", sans-serif'; octx.textAlign = 'center'; octx.lineWidth = 3; octx.strokeStyle = 'rgba(0,0,0,.8)';
      const txt = '★ ' + G.players[e.owner].heroLvl;
      octx.strokeText(txt, s.x, s.y - 5); octx.fillStyle = '#ffd24a'; octx.fillText(txt, s.x, s.y - 5);
    }
    if (e.kind === 'bld' && e.repair) { octx.font = '14px "Segoe UI Emoji", sans-serif'; octx.textAlign = 'center'; octx.fillStyle = '#fff'; octx.fillText('🔧', s.x + w / 2 + 12, s.y + 8); }
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
    octx.globalAlpha = Math.min(1, k * 2); octx.font = 'bold 19px "Segoe UI", sans-serif'; octx.textAlign = 'center';
    octx.lineWidth = 4; octx.strokeStyle = 'rgba(0,0,0,.8)'; octx.strokeText(f.text, p.x, p.y);
    octx.fillStyle = '#ffe066'; octx.fillText(f.text, p.x, p.y); octx.globalAlpha = 1;
  }
  const d = UI.drag;
  if (d && (Math.abs(d.x1 - d.x0) > 4 || Math.abs(d.y1 - d.y0) > 4)) {
    octx.strokeStyle = '#b9ffb0'; octx.lineWidth = 1.5; octx.fillStyle = 'rgba(140,255,130,.12)';
    octx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0); octx.strokeRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
  }
}

function drawMini() {
  const S = mini.width, k = S / WORLD.w;
  mctx.imageSmoothingEnabled = true; mctx.drawImage(terrain.mini, 0, 0, S, S);
  mctx.fillStyle = 'rgba(20,50,20,.75)';
  for (const o of G.obstacles) mctx.fillRect(o.x * k - 1.5, o.y * k - 1.5, 3, 3);
  for (const e of G.ents) {
    if (e.dead) continue;
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

// ---- сетевая игра: комната в меню ----
function menuSay(text) { UI.net.msg = text; UI.net.busy = false; buildMenu(); if (G.running) toast(text); }
// Изменить настройку партии; хост рассылает её всем в комнате
function menuSet(key, v) {
  if (Net.role === 'client') { if (key === 'faction') Net.send({ t: 'fac', faction: v }); return; }
  if (UI.menu[key] === v) return;
  UI.menu[key] = v;
  if (Net.role === 'host') Net.setLobby({ [key]: v });
  buildMenu();
  if (key === 'map' && !G.running) previewMap();
}
Net.on.lobby = () => {
  const L = Net.lobby, M = UI.menu, N = UI.net, mapWas = M.map;
  N.busy = false; N.msg = '';
  if (Net.role === 'client') { M.map = L.map; M.diff = L.diff; N.coop = L.coop; if (L.slots[Net.you]) M.faction = L.slots[Net.you].faction; }
  else M.faction = L.slots[0].faction;
  M.bots = L.bots;
  buildMenu();
  if (M.map !== mapWas && !G.running) previewMap();
};
Net.on.start = m => startGame(m);
Net.on.end = () => { if (G.net === 'client' && G.running) { G.over = G.over || 'ended'; toMenu(); UI.net.msg = 'Хост завершил бой'; buildMenu(); } };
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
  if (code.length !== 5) return menuSay('Введите код комнаты из 5 символов');
  N.busy = true; N.msg = ''; buildMenu();
  Net.join(code).catch(e => menuSay(e.message));
}
function buildNetBox() {
  const N = UI.net, L = Net.lobby, box = $('netBox'), host = Net.role === 'host';
  box.classList.toggle('hidden', !N.on);
  if (!N.on) return;
  if (!L) {
    box.innerHTML = `<div class="netRow"><button id="hostBtn" class="plain">Создать комнату</button><span class="or">или</span>
      <input id="codeIn" maxlength="5" placeholder="Код комнаты" autocomplete="off" spellcheck="false"><button id="joinBtn" class="plain">Войти</button></div>
      <div class="netMsg">${N.busy ? 'Подключение…' : N.msg || 'Один игрок создаёт комнату и сообщает код остальным. В комнате до 4 игроков.'}</div>`;
    const inp = $('codeIn');
    inp.value = N.code; inp.oninput = () => { N.code = inp.value; };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') joinRoom(); };
    $('hostBtn').onclick = hostRoom; $('joinBtn').onclick = joinRoom;
    $('hostBtn').disabled = $('joinBtn').disabled = N.busy;
    return;
  }
  const you = host ? 0 : Net.you;
  box.innerHTML = `<div class="netRow"><span class="roomCode">Комната <b>${Net.code}</b></span><button id="copyBtn" class="plain">Скопировать код</button><button id="leaveBtn" class="plain">Выйти из комнаты</button></div>
    <div class="slots">${L.slots.map((s, i) => `<span class="slot" style="--c:${FACTIONS[s.faction].color}">${FACTIONS[s.faction].name}${i === you ? ' · вы' : ''}${i === 0 ? ' · хост' : ''}</span>`).join('')}</div>
    <div id="coopBtns" class="seg${host ? '' : ' ro'}"></div>
    <div class="netMsg">${N.msg || (host ? 'Сообщите код остальным. Каждый выбирает свою фракцию, вы — карту, сложность и ботов.' : 'Выберите фракцию. Карту и остальное настраивает хост.')}</div>`;
  for (const [v, label] of [[false, 'Каждый за себя'], [true, 'Вместе против ботов']]) {
    const b = document.createElement('button');
    b.textContent = label; if (L.coop === v) b.className = 'sel';
    b.onclick = () => { N.coop = v; Net.setLobby({ coop: v }); };
    $('coopBtns').appendChild(b);
  }
  $('copyBtn').onclick = () => { try { navigator.clipboard.writeText(Net.code).then(() => menuSay('Код скопирован'), () => menuSay('Не удалось скопировать — перепишите код вручную')); } catch (e) { menuSay('Не удалось скопировать — перепишите код вручную'); } };
  $('leaveBtn').onclick = () => { Net.leave(); N.msg = ''; buildMenu(); };
}

function buildMenu() {
  const N = UI.net, L = Net.lobby, isClient = Net.role === 'client', you = Net.role === 'host' ? 0 : Net.you;
  const modes = $('modeBtns');
  modes.innerHTML = '';
  for (const [v, label] of [[false, 'Одиночная игра'], [true, 'Сетевая игра']]) {
    const b = document.createElement('button');
    b.textContent = label; if (N.on === v) b.className = 'sel';
    b.onclick = () => { if (N.on === v) return; N.on = v; N.msg = ''; N.busy = false; if (!v) Net.leave(); UI.menu.bots = Math.max(1, UI.menu.bots); buildMenu(); };
    modes.appendChild(b);
  }
  buildNetBox();
  for (const id of ['mapCards', 'diffBtns', 'botBtns']) $(id).classList.toggle('ro', isClient);
  const sb = $('startBtn');
  sb.disabled = N.on && (!L || isClient);
  sb.textContent = !N.on || (L && !isClient) ? 'В бой' : L ? 'Ждём, пока хост начнёт бой' : 'Сначала создайте комнату или войдите';
  const fc = $('facCards');
  fc.innerHTML = '';
  for (const k in FACTIONS) {
    const f = FACTIONS[k], d = document.createElement('div');
    const taken = !!L && L.slots.some((q, i) => i !== you && q.faction === k);
    d.className = 'card' + (UI.menu.faction === k ? ' sel' : '') + (taken ? ' taken' : '');
    d.style.setProperty('--c', f.color);
    const fig = (kind, t, name) => `<figure><img src="${portrait(kind, t, k)}" alt=""><figcaption>${name}</figcaption></figure>`;
    d.innerHTML = `<img class="hqImg" src="${portrait('bld', 'hq', k)}" alt=""><h3>${f.name}</h3><p>${f.motto}</p>
      <div class="heroRow"><img src="${portrait('unit', f.hero, k)}" alt=""><div><b>${UNITS[f.hero].name}</b><span>герой · ${UNITS[f.hero].abil.name}</span></div></div>
      <div class="urow">${f.units.map(u => fig('unit', u, UNITS[u].name)).join('')}${fig('bld', f.tower, BUILDINGS[f.tower].name)}</div>`;
    if (taken) d.insertAdjacentHTML('beforeend', '<span class="takenTag">занято</span>');
    else d.onclick = () => menuSet('faction', k);
    fc.appendChild(d);
  }
  const mc = $('mapCards');
  mc.innerHTML = '';
  for (const k in MAPS) {
    const m = MAPS[k], b = document.createElement('button');
    b.className = 'mapc' + (UI.menu.map === k ? ' sel' : '');
    b.innerHTML = `<i style="background:linear-gradient(135deg, ${m.thumb[0]} 0 55%, ${m.thumb[1]} 55% 82%, ${m.thumb[2]} 82%)"></i><span><b>${m.name}</b><small>${m.info}</small></span>`;
    b.onclick = () => menuSet('map', k);
    mc.appendChild(b);
  }
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
  for (let i = L ? 0 : 1; i <= botMax; i++) botOpts.push([i, i === 0 ? 'Без ботов' : i === 1 ? '1 бот' : i + ' бота']);
  seg($('botBtns'), botOpts, 'bots');
  seg($('diffBtns'), Object.keys(DIFF).map(k => [k, DIFF[k].name]), 'diff');
}

// ---- всплывающие подсказки ----
const tipEl = $('tip');
function showTip(el, html) {
  tipEl.innerHTML = html; tipEl.classList.remove('hidden');
  const r = el.getBoundingClientRect(), w = tipEl.offsetWidth;
  tipEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  tipEl.style.bottom = (window.innerHeight - r.top + 10) + 'px';
}
function hideTip() { tipEl.classList.add('hidden'); }
function unitTip(t) {
  const d = UNITS[t];
  return `<b>${d.name}</b><div class="tc">${COIN}${d.cost} · обучение ${d.time} с</div>
    <div class="ts">Здоровье ${d.hp} · Урон ${d.dmg} · ${d.proj ? 'Дальность ' + d.range : 'Ближний бой'} · Скорость ${d.speed}</div><p>${d.info}</p>`;
}
function bldTip(t) {
  const d = BUILDINGS[t];
  return `<b>${d.name}</b><div class="tc">${COIN}${buildCost(me(), t)} · стройка ${d.time} с</div>
    <div class="ts">Прочность ${d.hp}${d.dmg ? ` · Урон ${d.dmg} · Зона ${d.range}` : ''}</div><p>${d.info}</p>`;
}

function heroTip() {
  const p = me(), d = UNITS[p.fac.hero], a = d.abil, alive = p.heroU && !p.heroU.dead;
  return `<b>${d.name} <span class="lv">★ ${p.heroLvl}</span></b><div class="tc">${alive ? 'В строю · клик — выбрать' : COIN + heroCost(p) + (p.heroDeaths ? ' · возрождение ' : ' · призыв ') + d.time + ' с'}</div>
    <div class="ts">Здоровье ${unitMaxHp(p, p.fac.hero)} · Урон ${Math.round(d.dmg * (1 + 0.15 * p.up.atk) * (1 + 0.14 * (p.heroLvl - 1)))} · ${d.proj ? 'Дальность ' + d.range : 'Ближний бой'}</div>
    <p>${d.info}</p><p><b>${a.name}</b> (раз в ${a.cd} с). ${a.info}</p><p>Клавиша <b>V</b> — применить способность (метеор и ракеты — затем клик по цели). <b>Shift+V</b> — разрешить или запретить герою применять её самому.</p><p>Набирает опыт в боях рядом с собой, до ${HERO_MAX}-го уровня. Уровень сохраняется после гибели.</p>`;
}
function upTip(k) {
  const p = me(), d = UPGRADES[k], lvl = p.up[k], max = lvl >= d.cost.length;
  return `<b>${d.name} <span class="lv">${lvl} / ${d.cost.length}</span></b><div class="tc">${max ? 'Максимальный уровень' : COIN + d.cost[lvl] + ' · исследование ' + d.time[lvl] + ' с'}</div><p>${d.info}</p>`;
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
  if (!h || h.dead) return toast('Героя нет в строю');
  const a = UNITS[h.type].abil;
  if (h.acd > 0) return toast(a.name + ': ещё ' + Math.ceil(h.acd) + ' с');
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
    b.innerHTML = `<span class="ui">${d.icon}</span><span class="un">${d.name}</span><span class="pips">${d.cost.map(() => '<i></i>').join('')}</span><span class="cs">${COIN}<em></em></span><span class="prog"><i></i></span>`;
    b.onclick = () => research(k); b.onmouseenter = () => showTip(b, upTip(k) + `<div class="ts">Клавиша ${'RTY'[i]}</div>`); b.onmouseleave = hideTip;
    $('upBtns').appendChild(b); upEls[k] = b;
  });
  $('foes').innerHTML = G.players.filter(q => q.idx !== G.human).map(q => `<div class="foe" id="foe${q.idx}" style="--c:${q.fac.color}" title="${q.team === p.team ? 'Союзник' : 'Противник'}">${q.team === p.team ? '🤝 ' : ''}${q.fac.name}<div class="fhp"><i></i></div></div>`).join('');
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
    const extra = d.hero ? `<div class="desc"><b>${d.abil.name}</b> <kbd>V</kbd>: ${u.acd > 0 ? 'через ' + Math.ceil(u.acd) + ' с' : 'готово'} · сам: ${p.autoCast ? 'да' : 'нет'} · ${p.heroLvl >= HERO_MAX ? 'максимальный уровень' : 'опыт ' + Math.floor(p.heroXp) + ' / ' + heroNeed(p.heroLvl)}</div>` : `<div class="desc">${d.info}</div>`;
    return `<div class="selRow"><img class="pt" src="${portrait('unit', u.type, fk)}" alt=""><div style="flex:1"><b>${d.name}${lv}</b>${hpBar(u)}
      <div class="st">${Math.ceil(u.hp)} / ${u.maxHp} · урон ${Math.round(d.dmg * dmgMul(u))} · ${d.proj ? 'дальность ' + d.range : 'ближний бой'}</div></div></div>${extra}`;
  }
  if (us.length > 1) {
    const c = {};
    for (const u of us) c[u.type] = (c[u.type] || 0) + 1;
    return `<b>Отряд: ${us.length}</b><div class="chips">${Object.keys(c).map(t => `<div class="chip" title="${UNITS[t].name}"><img src="${portrait('unit', t, fk)}" alt=""><span>${c[t]}</span></div>`).join('')}</div>`;
  }
  if (UI.sel.length === 1) {
    const b = UI.sel[0], d = BUILDINGS[b.type];
    let h = `<div class="selRow"><img class="pt" src="${portrait('bld', b.type, fk)}" alt=""><div style="flex:1"><b>${d.name}</b>${hpBar(b)}
      <div class="st">${Math.ceil(b.hp)} / ${b.maxHp}${b.build < 1 ? ' · строится ' + Math.floor(b.build * 100) + '%' : ''}${b.repair ? (G.time - b.hitT > REPAIR_PAUSE ? ' · чинится' : ' · починка ждёт: здание под ударом') : ''}</div></div></div>`;
    const rs = b.type === 'hq' && me().research;
    if (b.type === 'hq' && (b.queue.length || rs)) h += `<div class="desc">${b.queue.length ? 'Призыв героя: ' + Math.floor(b.trainT / UNITS[b.queue[0]].time * 100) + '%' : ''}${b.queue.length && rs ? ' · ' : ''}${rs ? UPGRADES[rs.key].name + ': ' + Math.floor(rs.t / rs.time * 100) + '%' : ''}</div>`;
    else if (b.type === 'barracks') h += `<div class="queue">${b.queue.map(t => `<img src="${portrait('unit', t, fk)}" alt="">`).join('') || '<span class="st">Очередь пуста · ПКМ — точка сбора</span>'}</div>`;
    else h += `<div class="desc">${d.info}</div>`;
    return h;
  }
  return '<div class="empty">Никого. Выделите воинов рамкой или кликните по зданию.</div>';
}

let hudT = 0, lastSel = '';
function hudTick(dt) {
  hudT -= dt;
  if (hudT > 0 || !G.running) return;
  hudT = 0.1;
  const p = me(), hero = G.possessed, fk = p.faction;
  $('gold').textContent = Math.floor(p.gold);
  $('inc').textContent = '+' + p.income.toFixed(0) + '/с';
  $('pop').textContent = popOf(p) + ' / ' + POP_CAP;
  $('clock').textContent = fmtTime(G.time);
  for (const q of G.players) if (q.idx !== G.human) {
    const el = $('foe' + q.idx);
    el.classList.toggle('dead', !q.alive);
    el.querySelector('i').style.width = Math.max(0, q.hq.hp / q.hq.maxHp * 100) + '%';
  }
  buildEls.forEach((el, i) => {
    const t = buildDefs[i], c = buildCost(p, t);
    el.querySelector('em').textContent = c;
    el.classList.toggle('off', p.gold < c);
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
  heroEl.querySelector('.q').textContent = hu || p.heroDeaths ? '★' + p.heroLvl : '';
  heroEl.querySelector('.prog i').style.width = (hu ? hu.hp / hu.maxHp : hq.queue.length ? hq.trainT / UNITS[hq.queue[0]].time : 0) * 100 + '%';
  heroEl.classList.toggle('have', !!hu);
  heroEl.classList.toggle('off', !hu && !hq.queue.length && p.gold < hc);
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
    $('pInfo').textContent = d.abil ? 'ПКМ или Пробел — ' + d.abil.name + ': ' + (hero.acd > 0 ? 'через ' + Math.ceil(hero.acd) + ' с' : 'готово') + (d.abil.range ? ' · колесо — дальность' : '') : d.info;
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
    const txt = rb.repair ? 'Остановить починку' : `Починить ${COIN}${repairCost(rb)}`;
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
  lock();
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
  if (!best) return toast('Нет других воинов');
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
    if (UI.casting) {
      const pos = groundAt(e.clientX, e.clientY);
      if (!pos) return;
      const why = act({ c: 'cast', x: pos.x, y: pos.y });
      if (why) toast(why);
      UI.casting = false;
      return;
    }
    if (UI.placing) {
      const pos = groundAt(e.clientX, e.clientY);
      if (!pos) return;
      const p = me(), t = UI.placing; // клиент сам проверяет место, чтобы не ждать ответа хоста
      const pre = G.net === 'client' ? (p.gold < buildCost(p, t) ? 'Недостаточно золота' : canPlace(p, t, pos.x, pos.y)) : '';
      const why = pre || act({ c: 'build', type: t, x: pos.x, y: pos.y });
      if (why) toast(why); else if (!e.shiftKey) UI.placing = null;
      return;
    }
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
  if (u) possess(u);
});
window.addEventListener('wheel', e => {
  if (!G.running) return;
  if (G.possessed) Input.aim = Math.max(0, Math.min(1, Input.aim - Math.sign(e.deltaY) * 0.1));
  else UI.cam.dist = Math.max(320, Math.min(1700, UI.cam.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
}, { passive: true });

window.addEventListener('keydown', e => {
  Input.keys[e.code] = true;
  if (!G.running || G.over) return;
  if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (UI.paused) { if (['KeyP', 'KeyH', 'Escape'].includes(e.code)) setPause(false); return; }
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
    case 'KeyG': if (!G.possessed) repairKey(); break;
    case 'KeyV': if (!G.possessed) castKey(e.shiftKey); break;
    case 'KeyF':
      if (G.possessed) unpossess();
      else { const u = UI.sel.find(x => x.kind === 'unit' && !x.dead); if (u) possess(u); else toast('Сначала выберите воина'); }
      break;
    case 'Tab': if (G.possessed) possessNext(); break;
    case 'Escape': if (G.possessed) unpossess(); else if (UI.casting) UI.casting = false; else if (UI.placing) UI.placing = null; else if (UI.sel.length) UI.sel = []; else setPause(true); break;
    case 'KeyE': if (!G.possessed) { UI.sel = G.units.filter(u => u.owner === G.human && !u.dead); hudT = 0; } break;
    case 'Space': if (!G.possessed) { const al = me().alarm, to = al && G.time - al.t < 10 ? al : me().hq; UI.cam.x = to.x; UI.cam.y = to.y; } break;
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
$('possessBtn').onclick = () => possess(UI.sel.find(x => x.kind === 'unit' && !x.dead));
$('repairBtn').onclick = repairKey;

const SCREENS = ['menu', 'end', 'pauseMenu'];
// init — стартовое сообщение от хоста (только у клиента сетевой игры)
function startGame(init) {
  Sfx.init();
  const client = !!init && init.t === 'start';
  let cfg = null;
  if (client) Net.clientInit(init);
  else {
    if (Net.role === 'client') return;
    if (Net.role === 'host') {
      cfg = Net.makeCfg();
      if (cfg.players.length < 2) return menuSay('Нужен хотя бы один соперник: второй игрок или бот');
    } else {
      const others = Object.keys(FACTIONS).filter(f => f !== UI.menu.faction).sort(() => Math.random() - 0.5);
      cfg = { map: UI.menu.map, diff: UI.menu.diff, human: 0, players: [UI.menu.faction, ...others.slice(0, UI.menu.bots)].map((f, i) => ({ faction: f, bot: i > 0, team: i })) };
    }
    newGame(cfg);
  }
  setTerrain(G.players.map(p => ({ x: p.hq.x, y: p.hq.y, ground: BASE_GROUND[p.faction] })));
  if (!client) G.obstacles = G.obstacles.filter(o => terrain.roadDist(o.x, o.y) > o.r + 48 && Math.hypot(o.x - WORLD.w / 2, o.y - WORLD.h / 2) > 190);
  clearScene(); buildObstacles();
  if (G.net === 'host') Net.begin(cfg);
  if (document.pointerLockElement) document.exitPointerLock();
  UI.sel = []; UI.placing = null; UI.casting = false; UI.drag = null; UI.paused = false; UI.lastAlert = -99;
  UI.cam.x = me().hq.x; UI.cam.y = me().hq.y; UI.cam.dist = 900; camSnap = true;
  buildHud();
  for (const id of SCREENS) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  hudT = 0; lastSel = '';
}
function toMenu() {
  if (Net.role === 'host') Net.finish(); // бой окончен для всех, комната остаётся
  else if (Net.role === 'client' && G.running && !G.over) { Net.leave(); UI.net.msg = 'Вы вышли из комнаты'; } // уход посреди боя — выход из комнаты
  G.running = false; UI.paused = false;
  buildMenu();
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
$('startBtn').onclick = () => startGame(); $('againBtn').onclick = () => startGame(); $('restartBtn').onclick = () => startGame();
$('endMenuBtn').onclick = toMenu; $('quitBtn').onclick = toMenu;
$('resumeBtn').onclick = () => setPause(false);
$('pauseBtn').onclick = $('helpBtn').onclick = () => setPause(true);
$('soundBtn').onclick = () => { Sfx.on = !Sfx.on; $('soundBtn').classList.toggle('mute', !Sfx.on); };

function showEnd() {
  if (document.pointerLockElement) document.exitPointerLock();
  G.possessed = null;
  const win = G.over === 'victory', mp = me(), foes = G.players.filter(q => q.team !== mp.team), sum = k => foes.reduce((a, q) => a + q[k], 0);
  const st = { killed: sum('lost'), lost: mp.lost, razed: sum('bl') };
  $('againBtn').classList.toggle('hidden', G.net === 'client');
  $('end').classList.toggle('win', win); $('end').classList.toggle('lose', !win);
  $('endTitle').textContent = win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
  $('endSub').textContent = win ? 'Все вражеские цитадели разрушены.' : 'Ваша цитадель пала.' + (G.net === 'client' ? ' Новый бой начнёт хост.' : '');
  $('endStats').innerHTML = [[fmtTime(G.time), 'время боя'], [st.killed, 'врагов пало'], [st.lost, 'воинов потеряно'], [st.razed, 'зданий разрушено']]
    .map(r => `<div><b>${r[0]}</b><span>${r[1]}</span></div>`).join('');
  $('end').classList.remove('hidden');
}

function resize() {
  VW = window.innerWidth; VH = window.innerHeight;
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
  if (G.running && (G.net ? true : !G.over && !UI.paused)) {
    if (!UI.paused && !G.over) camInput(dt);
    if (G.net === 'client') Net.step(dt); else if (!G.over) update(dt);
    if (G.net === 'host') Net.hostTick(dt);
    if (G.notes.length) toast(G.notes.pop(), true), G.notes.length = 0;
    if (G.possessLost) { G.possessLost = false; UI.locked = false; if (document.pointerLockElement) document.exitPointerLock(); toast('Ваш воин пал'); hudT = 0; }
    if (!G.over) shownEnd = false;
  }
  if (G.running && G.over && !shownEnd) { shownEnd = true; showEnd(); }
  UI.sel = UI.sel.filter(e => !e.dead);
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
}

// Фон меню: пустая карта с медленным облётом
UI.cam.x = WORLD.w / 2; UI.cam.y = WORLD.h / 2; UI.cam.dist = 1500;
window.GameDebug = { THREE, scene, camera, renderer, possess, unpossess, groundAt, toScreen, entMesh };
// Готовые модели со скелетом; если файл не загрузился, воин останется прежним, собранным из фигур
await loadStyles().catch(e => console.warn('Манеры движения не загружены:', e.message));
await Promise.all(SKINNED_UNITS.map(t => loadSkinned(t).catch(e => console.warn('Модель не загружена:', t, e.message))));
previewMap();
buildMenu();
resize();
requestAnimationFrame(frame);
