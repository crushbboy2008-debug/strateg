// ---------- Процедурные low-poly модели: воины, здания, природа, снаряды ----------
// Каждая модель собирается из примитивов и склеивается в несколько мешей (по одному на подвижную часть),
// шаблон строится один раз на пару «тип + фракция», дальше клонируется.
import * as THREE from '../lib/three.module.js';

const PI = Math.PI, TAU = PI * 2;
const LAYX = [0, 0, -PI / 2]; // положить цилиндр/конус вдоль +X (верх смотрит вперёд)
const LAYZ = [PI / 2, 0, 0];  // вдоль +Z

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const S = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const DM = (r, w = 10) => new THREE.SphereGeometry(r, w, 5, 0, TAU, 0, PI / 2);
const CN = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const T = (r, t, rs = 5, ts = 14, arc = TAU) => new THREE.TorusGeometry(r, t, rs, ts, arc);
const ICO = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const DOD = r => new THREE.DodecahedronGeometry(r, 0);
const OCT = r => new THREE.OctahedronGeometry(r, 0);
function PR(w, h, d) { // треугольная призма: сечение в XY, длина вдоль Z
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

const LIT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });
const FLASH = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.3 });

const STEEL = '#c9d1da', DSTEEL = '#7d8794', GOLD = '#e2b84a', WOOD = '#7a5230', DWOOD = '#4f3620', LEATHER = '#8a5a33', SKIN = '#e6bd98',
  ORC = '#6f9a4a', BONE = '#ece5cf', STONE = '#a7a59c', DSTONE = '#7f7d76', DARK = '#2b2f36', HIDE = '#b08d5b', FIRE = '#ff8a1e', FIRE2 = '#ffd24a', EYE = '#1c1c22';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();
function compose(p, r, s) {
  _p.set(p[0], p[1], p[2]); _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
  return _m.compose(_p, _q, _s);
}
const Z3 = [0, 0, 0];

class Part {
  constructor(name) { this.name = name; this.buf = [[], []]; this.gbuf = [[], []]; this.kids = []; this.pos = Z3; this.rot = Z3; this.stack = [new THREE.Matrix4()]; }
  _add(buf, geom, color, p = Z3, r = Z3, s = 1) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const m = compose(p, r, s).premultiply(this.stack[this.stack.length - 1]);
    _c.set(color);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      _v.fromBufferAttribute(a, i).applyMatrix4(m);
      buf[0].push(_v.x, _v.y, _v.z); buf[1].push(_c.r, _c.g, _c.b);
    }
    return this;
  }
  add(geom, color, p, r, s) { return this._add(this.buf, geom, color, p, r, s); }
  glow(geom, color, p, r, s) { return this._add(this.gbuf, geom, color, p, r, s); }
  at(p, r, fn, s = 1) { // всё, что добавлено внутри fn, получает этот сдвиг/поворот
    this.stack.push(compose(p, r, s).clone().premultiply(this.stack[this.stack.length - 1]));
    fn(this); this.stack.pop();
    return this;
  }
  kid(name, p, r) { const k = new Part(name); k.pos = p || Z3; k.rot = r || Z3; this.kids.push(k); return k; }
  build() {
    const g = new THREE.Group();
    g.name = this.name; g.position.set(...this.pos); g.rotation.set(...this.rot);
    for (const [buf, mat] of [[this.buf, LIT], [this.gbuf, GLOW]]) {
      if (!buf[0].length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf[0], 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(buf[1], 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mesh.receiveShadow = mat === LIT;
      g.add(mesh);
    }
    for (const k of this.kids) g.add(k.build());
    return g;
  }
}

// ================= Гуманоид =================
const HAND = [0, -8.8, 0];
function human(o = {}) {
  const skin = o.skin || SKIN, top = o.top || '#888', sleeve = o.sleeve || top, bulk = o.bulk || 1, arm = o.arm || 1;
  const root = new Part('model'), anim = [];
  if (o.robe) {
    root.add(C(3.3, 6.6, 11.5, 10), o.robe, [0, 5.75, 0]).add(C(6.7, 6.9, 1.3, 10), o.trim || top, [0, 0.9, 0]);
  } else for (const s of [1, -1]) {
    const leg = root.kid(s > 0 ? 'legR' : 'legL', [0, 10, s * 2.3 * bulk]);
    leg.add(C(1.9 * bulk, 1.5, 7.4, 6), o.legs || '#4a3b2c', [0, -3.6, 0]).add(B(4.6, 3, 3.3), o.boots || '#2e241b', [0.7, -8.5, 0]);
    anim.push({ n: leg.name, k: 'limb', base: 0, walk: s * 0.8, atk: 0 });
  }
  const torso = root.kid('torso', [0, 10, 0]);
  torso.at([0, 4.9, 0], Z3, t => t.add(C(4.7 * bulk, 3.7 * bulk, 9.6, 8), top), [0.72, 1, 1]);
  if (!o.bare) torso.at([0, 0.9, 0], Z3, t => t.add(C(3.9 * bulk, 3.9 * bulk, 1.4, 8), o.belt || DWOOD), [0.75, 1, 1]);
  torso.add(C(1.3, 1.5, 1.6, 6), skin, [0, 10.2, 0]);
  const head = torso.kid('head', [0, 13.7, 0]);
  head.add(S(3.5, 9, 7), skin, Z3, Z3, [1, 1.05, 1]).add(B(0.5, 1, 0.9), EYE, [3.25, 0.3, 1.3]).add(B(0.5, 1, 0.9), EYE, [3.25, 0.3, -1.3]);
  const arms = {};
  for (const s of [1, -1]) {
    const n = s > 0 ? 'armR' : 'armL';
    const a = arms[n] = torso.kid(n, [0, 9.1, s * (5.2 * bulk + 0.6)]);
    a.add(S(2.0 * arm, 7, 5), o.shoulder || sleeve).add(C(1.5 * arm, 1.25 * arm, 8, 6), o.bareArms ? skin : sleeve, [0, -4.3, 0]).add(S(1.5 * arm, 6, 5), skin, HAND);
    anim.push({ n, k: 'limb', base: 0.12, walk: -s * 0.55, atk: 0 });
  }
  return { root, torso, head, armR: arms.armR, armL: arms.armL, anim };
}
function pose(H, n, o) { Object.assign(H.anim.find(a => a.n === n), o); }

// ---- оружие (рукоять в начале координат, длина вдоль +X) ----
function sword(p, len) {
  p.add(C(0.55, 0.55, 3.2, 6), LEATHER, [0.2, 0, 0], LAYX).add(S(0.8, 6, 4), GOLD, [-1.6, 0, 0]).add(B(0.9, 0.8, 4.6), GOLD, [2, 0, 0])
    .add(B(len, 0.45, 1.8), STEEL, [2.4 + len / 2, 0, 0]).add(CN(0.9, 2.4, 4), STEEL, [2.4 + len + 1.1, 0, 0], LAYX, [1, 1, 0.3]);
}
function shield(p, f) {
  p.add(B(1, 10.5, 8), STEEL).add(B(1.2, 9.3, 6.8), f.color, [0.1, 0, 0]).add(B(1.35, 9.3, 1.1), '#f4f1e6', [0.1, 0, 0]).add(B(1.35, 1.1, 6.8), '#f4f1e6', [0.1, 1, 0]).add(S(1.3, 6, 4), GOLD, [0.8, 1, 0]);
}
function axe(p, len = 9, big = 1) {
  p.add(C(0.45, 0.45, len, 5), WOOD, [len / 2 - 1.5, 0, 0], LAYX).add(B(3 * big, 4.6 * big, 0.7), DSTEEL, [len - 2.4, -1.6 * big, 0])
    .add(B(3.9 * big, 1.1, 0.5), '#eef2f6', [len - 2.4, -4.2 * big, 0]).add(CN(0.7, 2, 4), DSTEEL, [len - 2.4, 1.6, 0]);
}
function tusks(head, sz = 1) {
  head.add(CN(0.4 * sz, 1.5 * sz, 4), BONE, [2.9, -1.7, 1.2]).add(CN(0.4 * sz, 1.5 * sz, 4), BONE, [2.9, -1.7, -1.2])
    .add(CN(0.8, 2.6, 4), ORC, [0, 0.6, 3.7], [1.1, 0, 0]).add(CN(0.8, 2.6, 4), ORC, [0, 0.6, -3.7], [-1.1, 0, 0])
    .add(B(0.6, 0.6, 3.6), EYE, [3.2, 1.2, 0]);
}

// ================= Воины =================
const U = {
  // ---------- Легион ----------
  swordsman(f) {
    const H = human({ top: f.color, sleeve: '#8e97a3', shoulder: STEEL, legs: '#566070', boots: DSTEEL });
    H.torso.add(B(1.3, 6.6, 7.4), STEEL, [2.75, 5.7, 0]).add(B(0.5, 2.6, 2.6), GOLD, [3.5, 6.2, 0]).add(B(0.7, 10.5, 8.2), f.dark, [-3.3, 4.4, 0], [0, 0, -0.1]);
    H.head.add(DM(3.95), STEEL, [0, 0.2, 0]).add(B(0.7, 2.8, 0.9), STEEL, [3.75, -0.2, 0]).add(B(1, 3, 0.6), STEEL, [1.6, -1.2, 3.5]).add(B(1, 3, 0.6), STEEL, [1.6, -1.2, -3.5])
      .add(B(5.6, 2.3, 0.9), f.color, [-0.4, 4.6, 0]);
    H.armL.at([2.3, -5.2, -0.8], Z3, p => shield(p, f));
    H.armR.at(HAND, Z3, p => sword(p, 13));
    pose(H, 'armR', { base: 0.4, atk: 1.9 }); pose(H, 'armL', { base: 0.55, walk: 0.15 });
    return { root: H.root, anim: H.anim, scale: 1.04 };
  },
  archer(f) {
    const H = human({ top: f.color, shoulder: LEATHER, legs: '#5b4a35' });
    H.torso.add(B(1, 7, 7.4), LEATHER, [2.7, 5.5, 0]).add(B(1, 7, 7.4), LEATHER, [-2.7, 5.5, 0])
      .add(C(1.5, 1.3, 8, 6), LEATHER, [-3.6, 7, 1.5], [0.3, 0, 0.25]);
    for (const dz of [-0.5, 0.4, 1.1]) H.torso.add(C(0.2, 0.2, 3, 4), WOOD, [-4.6, 11.6, 1.6 + dz], [0.3, 0, 0.25]).add(B(0.9, 1.2, 0.2), '#f4f1e6', [-4.9, 12.8, 1.9 + dz], [0.3, 0, 0.25]);
    H.head.add(S(3.95, 9, 7), f.dark, [-0.8, 0.5, 0]).add(CN(2.4, 4.6, 6), f.dark, [-3.4, 2.2, 0], [0, 0, 1.2]);
    H.armL.at([0, -1.3, 0], Z3, p => p.add(T(7.5, 0.45, 5, 12, PI), WOOD, Z3, [0, 0, PI]).add(B(15, 0.16, 0.16), '#e9e4d4').add(B(1, 1.4, 1), LEATHER, [0, -7.5, 0]));
    pose(H, 'armL', { base: 1.45, walk: 0.08 }); pose(H, 'armR', { base: 0.95, walk: 0.25, atk: -0.6 });
    return { root: H.root, anim: H.anim, scale: 0.98 };
  },
  knight(f) {
    const root = new Part('model'), anim = [], HC = '#8a6444', HD = '#3d2a1c';
    root.add(B(15, 7, 6.4), HC, [0, 12.5, 0]).add(B(6, 7.8, 6.8), HC, [5.6, 12.8, 0]).add(B(5.4, 7.4, 6.6), HC, [-5.6, 12.9, 0])
      .add(B(10.4, 5.2, 7), f.color, [-0.5, 13.3, 0]).add(B(10.6, 1, 7.2), GOLD, [-0.5, 10.9, 0])
      .add(B(4, 9.5, 4), HC, [8.6, 17.6, 0], [0, 0, -0.55]).add(B(6.6, 3.6, 3.4), HC, [12.6, 21.2, 0], [0, 0, -0.5]).add(B(4.4, 0.9, 3.7), STEEL, [12.2, 22.9, 0], [0, 0, -0.5])
      .add(CN(0.6, 1.8, 4), HC, [10.4, 23.9, 1.1]).add(CN(0.6, 1.8, 4), HC, [10.4, 23.9, -1.1])
      .add(B(1.4, 9, 1.2), HD, [6.9, 18.9, 0], [0, 0, -0.55]).add(B(1.6, 7.8, 1.6), HD, [-8.6, 11.3, 0], [0, 0, -0.35])
      .add(B(0.5, 0.9, 0.5), EYE, [13.4, 21.6, 1.75]).add(B(0.5, 0.9, 0.5), EYE, [13.4, 21.6, -1.75]);
    [[5.6, 2.2, 1], [5.6, -2.2, -1], [-5.8, 2.2, -1], [-5.8, -2.2, 1]].forEach(([x, z, sg], i) => {
      const leg = root.kid('h' + i, [x, 9.5, z]);
      leg.add(B(2, 8, 2), HC, [0, -4, 0]).add(B(2.4, 1.8, 2.4), HD, [0, -8.6, 0]);
      anim.push({ n: 'h' + i, k: 'limb', base: 0, walk: sg * 0.7, atk: 0 });
    });
    const H = human({ top: STEEL, sleeve: '#8e97a3', shoulder: STEEL, legs: '#566070', boots: DSTEEL });
    H.root.name = 'rider'; H.root.pos = [-1.5, 7.2, 0];
    H.root.kids[0].rot = [-0.4, 0, 1.0]; H.root.kids[1].rot = [0.4, 0, 1.0];
    root.kids.push(H.root);
    H.torso.add(B(0.8, 7, 5), f.color, [2.9, 5, 0]).add(B(0.5, 2.4, 2.4), GOLD, [3.4, 6, 0]).add(B(0.7, 11, 8.4), f.dark, [-3.3, 4, 0], [0, 0, -0.25]);
    H.head.add(C(3.9, 3.9, 6.2, 8), STEEL, [0, 0.4, 0]).add(B(0.6, 0.9, 5.4), EYE, [3.7, 0.5, 0]).add(CN(1.5, 6.5, 6), f.color, [-1.2, 5.6, 0], [0, 0, 0.5]);
    H.armL.at([2.3, -5.2, -0.8], Z3, p => shield(p, f));
    H.armR.at(HAND, [0, 0, -0.5], p => p.add(C(0.45, 0.65, 30, 6), '#e8e2d0', [9, 0, 0], LAYX).add(CN(0.9, 3.4, 6), STEEL, [25.6, 0, 0], LAYX)
      .add(CN(2.2, 2.6, 8), GOLD, [1.8, 0, 0], LAYX).add(B(5, 3, 0.25), f.color, [20, -1.9, 0]));
    for (const a of H.anim) if (a.n.startsWith('arm')) anim.push({ ...a, walk: 0 });
    pose({ anim }, 'armR', { base: 0.5 }); pose({ anim }, 'armL', { base: 0.6 });
    anim.push({ n: 'armR', k: 'kick', amp: -5 });
    return { root, anim, scale: 1 };
  },
  // ---------- Орда ----------
  berserker(f) {
    const H = human({ skin: ORC, top: ORC, bare: true, bareArms: true, bulk: 1.12, arm: 1.2, legs: '#5a4632' });
    H.torso.at([0, 0.4, 0], Z3, t => t.add(C(4.5, 5.4, 3.8, 8), f.color), [0.78, 1, 1]);
    H.torso.add(B(0.6, 11.5, 2), LEATHER, [3.1, 5.4, 0], [0.7, 0, 0]).add(S(1.1, 6, 4), BONE, [3.4, 0.8, 0]).add(B(0.4, 1.2, 5.4), f.color, [3.6, 7.2, 0]);
    H.head.add(B(5.8, 2.8, 0.9), f.color, [-0.5, 3.7, 0]);
    tusks(H.head);
    H.armR.at(HAND, Z3, p => axe(p, 9.5)); H.armL.at(HAND, Z3, p => axe(p, 9.5));
    pose(H, 'armR', { base: 0.45, atk: 1.9 }); pose(H, 'armL', { base: 0.45, atk: 1.9, lag: true });
    return { root: H.root, anim: H.anim, scale: 1.0 };
  },
  axethrower(f) {
    const H = human({ skin: ORC, top: LEATHER, sleeve: ORC, bareArms: true, shoulder: f.color, legs: '#5a4632' });
    H.torso.add(B(0.5, 11.5, 2.2), f.color, [3.0, 5.4, 0], [-0.7, 0, 0])
      .at([-3.4, 3.5, 1.6], [0.3, 0, PI / 2], p => axe(p, 7, 0.8)).at([-3.4, 3.5, -1.6], [-0.3, 0, PI / 2], p => axe(p, 7, 0.8));
    H.head.add(C(3.65, 3.65, 1.5, 8), f.color, [0, 1.9, 0]).add(B(2.6, 1, 0.5), f.color, [-4.4, 1.2, 0.6], [0, 0, 0.5]).add(B(2.6, 1, 0.5), f.color, [-4.2, 0.6, -0.5], [0, 0, 0.9]);
    tusks(H.head);
    H.armR.at(HAND, Z3, p => axe(p, 8.5));
    pose(H, 'armR', { base: 0.5, atk: 2.3 }); pose(H, 'armL', { base: 0.2 });
    return { root: H.root, anim: H.anim, scale: 1.0 };
  },
  ogre(f) {
    const OG = '#8fae62';
    const H = human({ skin: OG, top: OG, bare: true, bareArms: true, bulk: 1.35, arm: 1.7, legs: '#6b563c', boots: '#3d3024' });
    H.torso.add(S(5.8, 9, 7), OG, [1.3, 3.6, 0], Z3, [1, 1, 1.25]).add(B(1, 5.5, 7), f.color, [4.6, -0.6, 0]).add(B(1, 5.5, 7), f.color, [-4.2, -0.6, 0])
      .at([0, 1.6, 0], Z3, t => t.add(C(6.3, 6.3, 1.6, 8), DWOOD), [0.9, 1, 1]).add(S(1.5, 6, 5), BONE, [5.9, 1.6, 0])
      .add(S(3.6, 7, 5), DSTEEL, [0, 9.8, -7.6]).add(CN(0.9, 3.4, 5), BONE, [0, 13, -7.6]).add(CN(0.9, 3.4, 5), BONE, [0, 11.4, -10.4], [-1.2, 0, 0]).add(CN(0.9, 3.4, 5), BONE, [2.6, 11.6, -8], [0, 0, -0.9]);
    H.head.add(B(3.4, 1.6, 4.6), OG, [1.6, -2.4, 0]).add(CN(0.7, 2.4, 4), BONE, [3.0, -1.2, 1.8]).add(CN(0.7, 2.4, 4), BONE, [3.0, -1.2, -1.8])
      .add(CN(0.9, 3.2, 5), BONE, [1, 4.4, 0], [0, 0, -0.3]).add(B(0.6, 0.6, 3.8), EYE, [3.2, 1.3, 0]);
    H.armR.at(HAND, Z3, p => {
      p.add(C(2.7, 1.1, 16, 7), WOOD, [6.5, 0, 0], LAYX).add(C(2.5, 2.5, 1, 7), DSTEEL, [9, 0, 0], LAYX).add(C(2.85, 2.85, 1, 7), DSTEEL, [13, 0, 0], LAYX);
      for (let i = 0; i < 6; i++) p.add(CN(0.6, 2.4, 4), BONE, [11 + (i % 2) * 2.4, Math.cos(i * 1.05) * 2.9, Math.sin(i * 1.05) * 2.9], [i * 1.05, 0, 0]);
    });
    pose(H, 'armR', { base: 0.45, atk: 2.0 }); pose(H, 'armL', { base: 0.3 });
    return { root: H.root, anim: H.anim, scale: 1.62 };
  },
  // ---------- Чародеи ----------
  golem(f) {
    const root = new Part('model'), anim = [], ST = '#918e89', ST2 = '#6f6c69', GL = f.color;
    for (const s of [1, -1]) {
      const leg = root.kid(s > 0 ? 'legR' : 'legL', [0, 9, s * 3.6]);
      leg.add(B(4.4, 9, 4.4), ST, [0, -4.5, 0]).add(B(5.6, 2.2, 5), ST2, [0.6, -8, 0]).glow(B(4.6, 0.8, 4.6), GL, [0, -3, 0]);
      anim.push({ n: leg.name, k: 'limb', base: 0, walk: s * 0.55, atk: 0 });
    }
    const t = root.kid('torso', [0, 9, 0]);
    t.add(B(6, 3.5, 9), ST2, [0, 1.5, 0]).add(B(8.5, 9.5, 12.5), ST, [0.3, 8, 0], [0, 0, -0.08]).add(B(6, 4.5, 5.5), ST2, [0, 12.2, 8.2]).add(B(6, 4.5, 5.5), ST2, [0, 12.2, -8.2])
      .add(B(1, 6, 1.2), ST2, [4.7, 8.4, 2.6]).add(B(1, 6, 1.2), ST2, [4.7, 8.4, -2.6]).add(B(1, 1.2, 6.4), ST2, [4.7, 11.6, 0]).add(B(1, 1.2, 6.4), ST2, [4.7, 5.2, 0])
      .add(OCT(1.5), GL, [1.5, 15.6, 6.5], [0, 0, -0.3], [1, 1.7, 1]).add(OCT(1.2), GL, [-1.6, 15, -9.4], [0.3, 0, 0], [1, 1.6, 1])
      .glow(OCT(2.3), GL, [4.6, 8.4, 0]).glow(OCT(1.9), GL, [-1, 16, 8.6], Z3, [1, 1.8, 1]).glow(OCT(1.7), GL, [0.6, 15.6, -7.6], [0, 0, 0.2], [1, 1.8, 1]);
    t.kid('head', [1, 14.8, 0]).add(B(4.6, 3.8, 5), ST2).add(B(4.9, 1.2, 5.3), ST, [0, 2, 0]).glow(B(0.5, 0.9, 3.4), GL, [2.4, 0.1, 0]);
    for (const s of [1, -1]) {
      const n = s > 0 ? 'armR' : 'armL', a = t.kid(n, [0, 11.5, s * 9.2]);
      a.add(B(3.4, 6, 3.4), ST, [0, -3.5, 0]).add(B(4.8, 7, 4.8), ST2, [0, -9.5, 0]).add(B(5.2, 3.6, 5.2), ST, [0.2, -14, 0]).glow(B(5, 0.8, 5), GL, [0, -6.6, 0]);
      anim.push({ n, k: 'limb', base: 0.1, walk: -s * 0.35, atk: s > 0 ? 1.7 : 0 });
    }
    return { root, anim, scale: 1.25 };
  },
  pyromancer(f) {
    const H = human({ robe: f.color, trim: f.dark, top: f.color, belt: GOLD });
    for (const a of [H.armR, H.armL]) a.add(C(1.3, 2.7, 6, 6), f.dark, [0, -5.6, 0]);
    H.torso.add(C(2.4, 3.4, 1.6, 8), f.dark, [0, 9.6, 0]);
    H.head.add(CN(2, 4.4, 5), '#d9d4c8', [2.2, -3.2, 0], [0, 0, PI + 0.25]).add(C(5.8, 5.8, 0.6, 10), f.dark, [0, 2.4, 0]).add(CN(3.6, 8.5, 8), f.dark, [-0.7, 6.8, 0], [0, 0, 0.22])
      .add(C(3.5, 3.7, 1, 8), GOLD, [-0.1, 3.2, 0]);
    H.armR.kid('orb', [1.2, -11.4, 0]).glow(ICO(2.3), FIRE).glow(ICO(1.4), FIRE2, [0, 0.4, 0]).glow(CN(1.3, 3.4, 5), FIRE, [0, 2.6, 0]);
    H.armL.at(HAND, [0, 0, -0.45], p => p.add(C(0.45, 0.45, 26, 5), DWOOD, [0, 3, 0]).add(CN(1.4, 2.6, 4), GOLD, [0, 16.2, 0], [PI, 0, 0]).glow(OCT(1.5), FIRE, [0, 18.6, 0], Z3, [1, 1.5, 1]));
    pose(H, 'armR', { base: 1.1, walk: 0.12, atk: 0.9 }); pose(H, 'armL', { base: 0.45, walk: 0.1 });
    H.anim.push({ n: 'orb', k: 'flick' });
    return { root: H.root, anim: H.anim, scale: 1.0 };
  },
  priest(f) {
    const W = '#eef0f4';
    const H = human({ robe: W, trim: GOLD, top: W, belt: f.color });
    H.torso.add(C(2.2, 6.4, 4.6, 8), f.color, [0, 7.8, 0]).add(B(0.4, 9, 1.4), f.color, [3.5, 2.2, 1.5]).add(B(0.4, 9, 1.4), f.color, [3.5, 2.2, -1.5])
      .add(B(0.5, 1.2, 1.6), GOLD, [3.6, -2, 1.5]).add(B(0.5, 1.2, 1.6), GOLD, [3.6, -2, -1.5]);
    H.head.add(S(3.7, 8, 6), f.dark, [-1.4, -0.4, 0]).glow(T(3.3, 0.35, 5, 16), '#ffe066', [0, 5.4, 0], [PI / 2, 0, 0]);
    H.armR.at(HAND, [0, 0, -0.45], p => p.add(C(0.45, 0.45, 28, 5), GOLD, [0, 4, 0]).glow(T(2.4, 0.4, 5, 12), '#ffe066', [0, 20.6, 0], [0, PI / 2, 0]).glow(S(1.2, 6, 5), '#fff6c8', [0, 20.6, 0]));
    H.armL.glow(OCT(1), '#aef5c8', [1.6, -10.4, 0]);
    pose(H, 'armR', { base: 0.45, walk: 0.1, atk: 0.7 }); pose(H, 'armL', { base: 0.9, walk: 0.15 });
    return { root: H.root, anim: H.anim, scale: 0.98 };
  },
  // ---------- Механисты ----------
  drone(f) {
    const root = new Part('model'), anim = [], fl = root.kid('fly', [0, 30, 0]);
    fl.add(S(5, 9, 6), DARK, Z3, Z3, [1.25, 0.6, 1]).at(Z3, Z3, p => p.add(C(5.15, 5.15, 0.9, 9), f.color), [1.25, 1, 1]).add(B(5, 1.6, 0.6), f.color, [-2, 3, 0])
      .add(C(1.7, 1.7, 1, 8), DSTEEL, [5.6, -0.3, 0], LAYX).glow(S(1.4, 6, 5), '#ff4030', [6, -0.3, 0])
      .add(B(2.4, 1.6, 2), DSTEEL, [2.5, -2.6, 0]).add(C(0.5, 0.5, 6.5, 5), STEEL, [5, -2.8, 0], LAYX)
      .add(B(9, 0.5, 0.6), DSTEEL, [0, -4.4, 2.6]).add(B(9, 0.5, 0.6), DSTEEL, [0, -4.4, -2.6])
      .add(B(0.5, 2, 0.5), DSTEEL, [2.5, -3.4, 2.6]).add(B(0.5, 2, 0.5), DSTEEL, [2.5, -3.4, -2.6]).add(B(0.5, 2, 0.5), DSTEEL, [-2.5, -3.4, 2.6]).add(B(0.5, 2, 0.5), DSTEEL, [-2.5, -3.4, -2.6])
      .add(C(0.15, 0.15, 5, 4), DSTEEL, [-3.5, 4, 0]).glow(S(0.5, 5, 4), '#ff4030', [-3.5, 6.6, 0]);
    let i = 0;
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      fl.add(B(9, 0.8, 1.2), DSTEEL, [sx * 4.6, 0.4, sz * 4.6], [0, Math.atan2(-sz, sx), 0]).add(C(1.3, 1.3, 2.2, 6), DARK, [sx * 8.6, 1.2, sz * 8.6]);
      const n = 'rot' + i++;
      fl.kid(n, [sx * 8.6, 2.6, sz * 8.6]).add(B(8.5, 0.2, 1), '#dfe5ec').add(B(1, 0.2, 8.5), '#dfe5ec').add(C(0.6, 0.6, 0.6, 6), f.color);
      anim.push({ n, k: 'spin', speed: 42 * sx * sz });
    }
    return { root, anim, scale: 0.72 };
  },
  sniper(f) {
    const COAT = '#4d5a4a';
    const H = human({ top: COAT, shoulder: f.color, legs: '#3c4238', boots: DARK });
    H.torso.add(B(1, 6.5, 8), COAT, [-2.7, -2.4, 0], [0, 0, -0.15]).add(B(0.8, 5.5, 3.4), COAT, [2.6, -2, 2.3], [0, 0, 0.1]).add(B(0.8, 5.5, 3.4), COAT, [2.6, -2, -2.3], [0, 0, 0.1])
      .add(C(2.3, 2.8, 2.2, 8), f.color, [0, 9.7, 0]).add(B(1, 6, 2.2), f.color, [-3.2, 7, -1.5], [0, 0, 0.15])
      .add(B(3.2, 6.4, 6.2), '#5d4a35', [-4.4, 5.8, 0]).add(B(3.4, 1, 6.4), f.color, [-4.4, 7.6, 0]).add(C(0.15, 0.15, 8, 4), DSTEEL, [-5, 12.6, 2.2]);
    H.head.add(DM(3.8), '#3c4238', [0, 0.5, 0]).add(B(3.2, 0.5, 5.2), '#3c4238', [3.6, 0.9, 0]).add(B(0.9, 1.5, 6.6), DARK, [3.0, 0.3, 0])
      .glow(B(0.4, 1, 1.5), '#7ef0ff', [3.55, 0.3, 1.5]).glow(B(0.4, 1, 1.5), '#7ef0ff', [3.55, 0.3, -1.5]);
    H.armR.at(HAND, [0, 0, -1.4], p => p.add(B(5.5, 1.8, 1), WOOD, [-3, -0.4, 0]).add(B(8.5, 1.4, 1.2), DARK, [3.5, 0, 0]).add(C(0.36, 0.36, 17, 6), DSTEEL, [15.5, 0.2, 0], LAYX)
      .add(C(0.65, 0.65, 2.4, 6), DARK, [23.5, 0.2, 0], LAYX).add(C(0.75, 0.75, 5.5, 6), DARK, [3.5, 1.7, 0], LAYX).glow(C(0.6, 0.6, 0.3, 6), '#7ef0ff', [6.4, 1.7, 0], LAYX)
      .add(B(0.3, 4, 0.3), DSTEEL, [12, -2, 0.9], [0.3, 0, 0]).add(B(0.3, 4, 0.3), DSTEEL, [12, -2, -0.9], [-0.3, 0, 0]));
    pose(H, 'armR', { base: 1.4, walk: 0.06, atk: 0.22 }); pose(H, 'armL', { base: 1.25, walk: 0.06, atk: 0.15 });
    return { root: H.root, anim: H.anim, scale: 0.98 };
  },
  tank(f) {
    const root = new Part('model'), TR = '#23262b', WH = '#4a4f57';
    for (const s of [1, -1]) {
      root.add(B(40, 7, 6.5), TR, [0, 4.5, s * 12]).add(C(3.5, 3.5, 6.5, 8), TR, [20, 4.5, s * 12], LAYZ).add(C(3.5, 3.5, 6.5, 8), TR, [-20, 4.5, s * 12], LAYZ)
        .add(B(43, 1, 8), f.dark, [0, 8.7, s * 12]);
      for (let x = -15; x <= 15; x += 7.5) root.add(C(2.7, 2.7, 7, 8), WH, [x, 3.5, s * 12.2], LAYZ);
      root.glow(S(1.2, 6, 5), '#fff2b0', [20.4, 9.6, s * 6.5]).add(C(0.9, 0.9, 7, 6), DSTEEL, [-19.5, 12.5, s * 5], LAYX);
    }
    root.add(B(37, 6.5, 18), f.dark, [0, 8.6, 0]).add(B(11, 5, 17.8), f.dark, [16.2, 9.6, 0], [0, 0, -0.5]).add(B(11, 2.4, 15), DARK, [-12.5, 12.6, 0])
      .add(B(2.4, 6.7, 18.3), f.color, [-4, 8.6, 0]).add(B(2, 3, 3.4), DSTEEL, [19.2, 6.4, 0]);
    const tu = root.kid('turret', [-1, 11.9, 0]);
    tu.at([0, 3, 0], Z3, p => p.add(C(8.5, 10, 6, 8), f.color), [1.15, 1, 1]).add(B(7.5, 4.6, 11), f.color, [-9.5, 3, 0]).add(B(7.7, 1, 11.2), f.dark, [-9.5, 5, 0])
      .add(C(3, 3, 1.3, 8), DARK, [-2, 6.5, 2.6]).add(B(1, 1.6, 1), DARK, [0, 7.4, -3.5]).add(C(0.3, 0.3, 5, 5), DARK, [2.6, 7.6, -3.5], LAYX)
      .add(C(0.14, 0.14, 13, 4), DSTEEL, [-11, 11.5, -4]).glow(S(0.5, 5, 4), '#ff4030', [-11, 18, -4]);
    tu.kid('barrel', [8, 3.2, 0]).add(B(4.4, 4.6, 5.6), DSTEEL).add(C(1.25, 1.5, 22, 8), DARK, [13, 0, 0], LAYX).add(C(2, 2, 3.6, 8), DARK, [24.2, 0, 0], LAYX).add(C(1.6, 1.6, 1.2, 8), f.color, [8, 0, 0], LAYX);
    return { root, anim: [{ n: 'barrel', k: 'kick', amp: 4.5 }, { n: 'turret', k: 'kick', amp: 1.2 }], scale: 1 };
  },
  // ---------- Герои (крупнее обычных воинов, под ногами золотой круг) ----------
  paladin(f) {
    const H = human({ top: STEEL, sleeve: STEEL, shoulder: GOLD, legs: DSTEEL, boots: GOLD, belt: GOLD, bulk: 1.12, arm: 1.15 });
    H.torso.add(B(1.4, 7, 8), '#eef2f6', [3.0, 5.6, 0]).add(B(0.6, 5.4, 1.4), GOLD, [3.8, 5.6, 0]).add(B(0.6, 1.4, 4.4), GOLD, [3.8, 6.8, 0])
      .add(B(0.7, 15, 11.5), f.color, [-3.9, 2.6, 0], [0, 0, -0.16]).add(B(0.8, 1.3, 11.7), GOLD, [-5, -4.4, 0], [0, 0, -0.16]);
    H.head.add(DM(4.0), STEEL, [0, 0.2, 0]).add(B(0.7, 3.2, 1), GOLD, [3.85, -0.2, 0]).add(B(1, 3.2, 0.6), STEEL, [1.6, -1.2, 3.6]).add(B(1, 3.2, 0.6), STEEL, [1.6, -1.2, -3.6])
      .add(B(6.6, 3.2, 1), f.color, [-0.6, 5, 0]).add(B(0.5, 4.2, 2), '#f4f1e6', [-0.8, 3.4, 4.3], [-0.5, 0, 0.5]).add(B(0.5, 4.2, 2), '#f4f1e6', [-0.8, 3.4, -4.3], [0.5, 0, 0.5])
      .glow(T(3.4, 0.3, 5, 16), '#ffe066', [0, 7.4, 0], [PI / 2, 0, 0]);
    H.armL.at([2.3, -5.2, -0.8], Z3, p => shield(p, f));
    H.armR.at(HAND, Z3, p => p.add(C(0.6, 0.6, 17, 6), DWOOD, [6.5, 0, 0], LAYX).add(S(0.9, 6, 4), GOLD, [-2, 0, 0]).add(B(4.6, 8.4, 5), STEEL, [15, 0, 0]).add(B(5, 1.6, 5.4), GOLD, [15, 0, 0])
      .glow(B(4.8, 0.7, 5.2), '#ffe9a0', [15, 4.5, 0]).glow(B(4.8, 0.7, 5.2), '#ffe9a0', [15, -4.5, 0]));
    pose(H, 'armR', { base: 0.4, atk: 1.9 }); pose(H, 'armL', { base: 0.55, walk: 0.15 });
    H.root.glow(T(10, 0.45, 4, 24), GOLD, [0, 0.7, 0], [PI / 2, 0, 0]);
    return { root: H.root, anim: H.anim, scale: 1.3 };
  },
  warlord(f) {
    const SK = '#5f8a3e';
    const H = human({ skin: SK, top: SK, bare: true, bareArms: true, bulk: 1.3, arm: 1.5, legs: '#4a3a2a', boots: '#2e241b', shoulder: BONE });
    H.torso.at([0, 0.6, 0], Z3, t => t.add(C(5.4, 6.4, 4.4, 8), f.color), [0.8, 1, 1]);
    H.torso.add(B(0.7, 12.5, 2.4), LEATHER, [3.7, 5.6, 0], [0.7, 0, 0]).add(B(0.7, 12.5, 2.4), LEATHER, [3.7, 5.6, 0], [-0.7, 0, 0]).add(S(1.5, 6, 4), BONE, [4.3, 5.6, 0])
      .add(S(4.2, 7, 5), HIDE, [-2.4, 9.2, 0], Z3, [1, 0.7, 1.8])
      .add(C(0.45, 0.45, 24, 5), DWOOD, [-5, 14, 0]).add(B(0.4, 9, 7), f.color, [-5, 21, 3.8]).add(B(0.45, 1.2, 7.2), f.dark, [-5, 17, 3.8]).add(S(1.5, 6, 4), BONE, [-5, 26.8, 0]);
    H.head.add(DM(3.9), BONE, [0, 0.6, 0]).add(CN(1.1, 6, 5), BONE, [0, 3.6, 4.6], [0.9, 0, 0]).add(CN(1.1, 6, 5), BONE, [0, 3.6, -4.6], [-0.9, 0, 0]);
    tusks(H.head, 1.4);
    H.armR.at(HAND, Z3, p => {
      p.add(C(0.7, 0.7, 22, 6), DWOOD, [7, 0, 0], LAYX).add(CN(0.9, 3, 4), DSTEEL, [19.4, 0, 0], LAYX).add(B(1.8, 1.8, 1.8), f.color, [11.5, 0, 0]);
      for (const s of [1, -1]) p.add(B(5, 6.5, 0.9), DSTEEL, [15.5, s * 3.6, 0]).add(B(6.4, 1.2, 0.6), '#eef2f6', [15.5, s * 7.2, 0]);
    });
    pose(H, 'armR', { base: 0.5, atk: 2.0 }); pose(H, 'armL', { base: 0.35 });
    H.root.glow(T(10, 0.45, 4, 24), GOLD, [0, 0.7, 0], [PI / 2, 0, 0]);
    return { root: H.root, anim: H.anim, scale: 1.5 };
  },
  archmage(f) {
    const ICE = '#9fd8ff';
    const H = human({ robe: f.dark, trim: GOLD, top: f.color, belt: GOLD, shoulder: GOLD });
    for (const a of [H.armR, H.armL]) a.add(C(1.3, 3, 6.4, 6), f.color, [0, -5.6, 0]);
    H.torso.add(C(2.6, 7.2, 5, 8), '#f1ecff', [0, 7.9, 0]).add(B(0.5, 10, 2.4), GOLD, [3.5, 2, 0]).add(B(0.7, 14, 10.5), f.color, [-3.7, 2.6, 0], [0, 0, -0.14]);
    H.head.add(CN(2.6, 7.5, 5), '#eeeae0', [2, -4.2, 0], [0, 0, PI + 0.2]).add(C(6.4, 6.4, 0.6, 10), f.dark, [0, 2.4, 0]).add(CN(3.8, 11, 8), f.dark, [-0.9, 8, 0], [0, 0, 0.25])
      .add(C(3.7, 3.9, 1.1, 8), GOLD, [-0.1, 3.3, 0]).glow(OCT(1.2), ICE, [3.5, 3.4, 0]);
    H.armL.at(HAND, [0, 0, -0.45], p => p.add(C(0.5, 0.5, 30, 5), GOLD, [0, 4, 0]).add(T(2.4, 0.5, 5, 10), GOLD, [0, 20.5, 0], [0, PI / 2, 0]).glow(OCT(2.1), ICE, [0, 20.5, 0], Z3, [1, 1.6, 1]));
    H.armR.kid('orb', [1.2, -11.4, 0]).glow(ICO(2.5), ICE).glow(ICO(1.5), '#ffffff');
    const orbit = H.torso.kid('orbit', [0, 17, 0]);
    ring(3, 9, (x, z) => orbit.glow(OCT(1.3), ICE, [x, 0, z], Z3, [1, 1.7, 1]));
    pose(H, 'armR', { base: 1.1, walk: 0.12, atk: 0.9 }); pose(H, 'armL', { base: 0.45, walk: 0.1 });
    H.anim.push({ n: 'orb', k: 'flick' }, { n: 'orbit', k: 'spin', speed: 1.8 });
    H.root.glow(T(10, 0.45, 4, 24), GOLD, [0, 0.7, 0], [PI / 2, 0, 0]);
    return { root: H.root, anim: H.anim, scale: 1.25 };
  },
  commander(f) {
    const root = new Part('model'), anim = [], M1 = '#6b727c', M2 = '#3b4048', VIS = '#7ef0ff';
    for (const s of [1, -1]) {
      const leg = root.kid(s > 0 ? 'legR' : 'legL', [0, 12, s * 5]);
      leg.add(B(3.6, 3.6, 3.8), f.color).add(B(3.4, 7, 3.4), M1, [1, -3, 0], [0, 0, 0.35]).add(B(3, 7, 3), M2, [0.6, -8, 0], [0, 0, -0.3]).add(B(7, 2, 5), M1, [1.2, -11, 0]);
      anim.push({ n: leg.name, k: 'limb', base: 0, walk: s * 0.55, atk: 0 });
    }
    const t = root.kid('torso', [0, 12, 0]);
    t.add(B(8, 3, 9), M2, [0, 1, 0]).add(B(11, 9, 12), f.dark, [0.5, 7, 0]).add(B(4, 5, 9), f.color, [5.4, 7.6, 0], [0, 0, -0.25]).glow(B(0.6, 2, 7), VIS, [7.5, 8.4, 0], [0, 0, -0.25])
      .add(B(11.4, 1.2, 12.4), f.color, [0.5, 11.6, 0]).add(B(3.4, 5, 5), M2, [-6.6, 7, 0])
      .add(C(0.15, 0.15, 9, 4), DSTEEL, [-4, 16.5, 3]).glow(S(0.5, 5, 4), '#ff4030', [-4, 21.2, 3]);
    for (const s of [1, -1]) {
      t.add(B(7, 5, 5.6), M1, [-1, 14.6, s * 9.4]).add(B(7.2, 1, 5.8), f.color, [-1, 17.2, s * 9.4]);
      for (const dy of [-1.2, 1.2]) for (const dz of [-1.4, 1.4]) t.glow(C(0.8, 0.8, 0.4, 6), '#ff4030', [2.6, 14.6 + dy, s * 9.4 + dz], LAYX);
      const n = s > 0 ? 'gunR' : 'gunL', g = t.kid(n, [1, 7, s * 8.8]);
      g.add(B(5, 4, 3.6), M1).add(C(1.3, 1.3, 11, 6), M2, [7, 0, 0], LAYX).add(C(1.6, 1.6, 1.6, 6), f.color, [3, 0, 0], LAYX).add(C(1.5, 1.5, 1.4, 6), DARK, [12, 0, 0], LAYX);
      anim.push({ n, k: 'kick', amp: s > 0 ? 3 : 2 });
    }
    root.glow(T(12, 0.5, 4, 24), GOLD, [0, 0.7, 0], [PI / 2, 0, 0]);
    return { root, anim, scale: 1.2 };
  },
};

// ================= Здания =================
const KIT = {
  legion: { wall: '#c2bdaf', wall2: '#9f9a8d' },
  horde: { wall: '#85593a', wall2: '#5e4028' },
  arcane: { wall: '#ddd7ea', wall2: '#b7aecf' },
  mech: { wall: '#7d848d', wall2: '#555b63' },
};
const WIN = '#ffd98a';
function flag(p, f, x, y, z, h = 14, w = 8) {
  p.add(C(0.4, 0.4, h, 5), DWOOD, [x, y + h / 2, z]).add(B(w, w * 0.55, 0.3), f.color, [x + w / 2 + 0.3, y + h - w * 0.32, z]).add(S(0.8, 5, 4), GOLD, [x, y + h + 0.5, z]);
}
function ring(n, r, fn, start = 0) { for (let i = 0; i < n; i++) { const a = start + i / n * TAU; fn(Math.cos(a) * r, Math.sin(a) * r, a, i); } }
function flames(part, name, pos, s = 1) {
  const fl = part.kid(name, pos);
  fl.glow(CN(5 * s, 14 * s, 6), FIRE, [0, 7 * s, 0]).glow(CN(3.2 * s, 10 * s, 5), FIRE2, [1.2 * s, 5 * s, 0.8 * s]).glow(CN(3 * s, 9 * s, 5), '#ff5a1a', [-1.8 * s, 4.5 * s, -1.2 * s]);
  return { n: name, k: 'flick' };
}

const HQ = {
  legion(f, K) {
    const root = new Part('model'), anim = [];
    root.add(B(54, 3, 54), DSTONE, [0, 1.5, 0]);
    for (const [x, z, ry] of [[0, 25, 0], [0, -25, 0], [25, 0, PI / 2], [-25, 0, PI / 2]]) {
      root.add(B(50, 15, 4), K.wall, [x, 9, z], [0, ry, 0]);
      for (let i = -3; i <= 3; i++) root.at([x, 18, z], [0, ry, 0], p => p.add(B(3.4, 3, 4.4), K.wall2, [i * 6.4, 0, 0]));
    }
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      root.add(C(7.5, 8.5, 30, 8), K.wall, [sx * 26, 15, sz * 26]).add(C(8.6, 8.6, 2.4, 8), K.wall2, [sx * 26, 30, sz * 26]).add(CN(9.4, 13, 8), f.color, [sx * 26, 37.5, sz * 26])
        .add(S(1, 5, 4), GOLD, [sx * 26, 44.5, sz * 26]).glow(B(1.4, 3.6, 1.4), WIN, [sx * 26 + sx * 0.2, 22, sz * 26 + sz * 7.6]);
    }
    root.add(B(15, 21, 7), K.wall2, [0, 10.5, 26]).add(B(9, 13, 1.4), '#2a1c12', [0, 6.5, 29.2]).add(B(10.4, 1.6, 1.6), DWOOD, [0, 13.6, 29.4])
      .add(B(17, 3, 9), K.wall, [0, 22, 26]).add(B(6, 9, 0.5), f.color, [0, 17.4, 29.9]).add(B(2, 2, 0.6), GOLD, [0, 18.6, 30.1]);
    root.add(B(26, 40, 26), K.wall, [0, 20, 0]).add(B(29, 3, 29), K.wall2, [0, 41, 0]);
    ring(12, 15.5, (x, z) => root.add(B(3.6, 3.4, 3.6), K.wall2, [x * 0.92, 44, z * 0.92]), 0.26);
    root.add(CN(17, 17, 4), f.color, [0, 51, 0], [0, PI / 4, 0]);
    for (const [x, z] of [[13.2, 0], [-13.2, 0], [0, 13.2], [0, -13.2]]) for (const y of [16, 28])
      root.glow(B(x ? 0.6 : 2.6, 4.6, x ? 2.6 : 0.6), WIN, [x, y, z + (x ? 5 : 0)]).glow(B(x ? 0.6 : 2.6, 4.6, x ? 2.6 : 0.6), WIN, [x - (x ? 0 : 5), y, z - (x ? 5 : 0)]);
    flag(root, f, 0, 58, 0, 18, 11);
    flag(root, f, 9, 22, 30, 10, 6); flag(root, f, -9, 22, 30, 10, 6);
    return { root, anim };
  },
  horde(f, K) {
    const root = new Part('model'), anim = [];
    root.add(C(42, 44, 2, 12), '#6b5a40', [0, 1, 0]);
    ring(20, 39, (x, z, a, i) => {
      if (Math.abs(a - PI / 2) < 0.42) return;
      const h = 19 + (i * 7 % 5) * 1.6;
      root.add(C(2.5, 3, h, 6), i % 3 ? K.wall : K.wall2, [x, h / 2, z], [Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08]).add(CN(2.5, 5, 6), BONE, [x, h + 2.4, z]);
    });
    root.add(C(20, 23, 13, 10), K.wall, [0, 7.5, 0]).add(C(23.4, 23.4, 2, 10), f.color, [0, 12, 0]).add(CN(27, 26, 10), HIDE, [0, 27, 0]).add(CN(16, 14, 10), '#8f6f45', [0, 37.5, 0])
      .add(B(10, 12, 3), '#231710', [0, 7, 22]).add(B(13, 2, 3.6), DWOOD, [0, 13.6, 22.4])
      .add(S(3.6, 7, 6), BONE, [0, 18.4, 23.4], Z3, [1, 1.1, 0.9]).add(B(1.2, 1.4, 1), EYE, [1.4, 18.8, 26.4]).add(B(1.2, 1.4, 1), EYE, [-1.4, 18.8, 26.4])
      .add(CN(1.1, 7, 5), BONE, [4.8, 21, 23.4], [0, 0, -0.9]).add(CN(1.1, 7, 5), BONE, [-4.8, 21, 23.4], [0, 0, 0.9]);
    ring(4, 21, (x, z, a) => root.add(CN(2.6, 20, 6), BONE, [x, 36, z], [Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75]), PI / 4);
    root.add(C(1, 1, 16, 5), DWOOD, [0, 49, 0]).add(S(2.6, 6, 5), BONE, [0, 57, 0]);
    for (const s of [1, -1]) {
      root.add(C(0.7, 0.7, 34, 5), DWOOD, [s * 15, 17, 34]).add(B(0.4, 15, 7), f.color, [s * 15, 25, 30.4]).add(B(0.5, 3, 5), f.dark, [s * 15, 15.4, 30.4])
        .add(C(4.2, 3, 4, 8), DARK, [s * 28, 6, 22]).add(C(0.6, 0.6, 5, 5), DARK, [s * 28, 2.5, 22]);
      anim.push(flames(root, 'fl' + s, [s * 28, 7.5, 22], 0.7));
    }
    return { root, anim };
  },
  arcane(f, K) {
    const root = new Part('model'), anim = [];
    root.add(C(41, 44, 4, 12), K.wall2, [0, 2, 0]).add(C(33, 36, 4, 12), K.wall, [0, 6, 0]).glow(T(37.5, 0.7, 4, 36), f.color, [0, 4.3, 0], [PI / 2, 0, 0]);
    root.add(C(10, 15, 44, 8), K.wall, [0, 30, 0]).add(C(12, 12, 3, 8), K.wall2, [0, 52, 0]).add(C(6.5, 9.5, 20, 8), K.wall, [0, 63, 0]).add(C(8, 8, 2.4, 8), K.wall2, [0, 73.6, 0])
      .add(CN(8.6, 20, 8), f.color, [0, 84.6, 0]).add(B(8, 13, 2), '#2b2140', [0, 14.5, 13.6]).add(B(10.6, 1.8, 2.6), GOLD, [0, 21.6, 13.8]);
    ring(8, 11.2, (x, z, a) => { root.glow(B(1.6, 9, 1.6), f.color, [x, 36, z], [0, -a, 0]); root.glow(B(1.2, 5, 1.2), WIN, [x * 0.68, 64, z * 0.68], [0, -a, 0]); }, PI / 8);
    ring(4, 30, (x, z) => {
      root.add(C(4, 5, 26, 6), K.wall, [x, 21, z]).add(C(5.2, 5.2, 1.6, 6), K.wall2, [x, 34.6, z]).add(CN(5.4, 10, 6), f.color, [x, 40.4, z]).glow(OCT(1.9), f.color, [x, 48.6, z], Z3, [1, 1.7, 1]);
    }, PI / 4);
    root.kid('crystal', [0, 104, 0]).glow(OCT(7), f.color, Z3, Z3, [1, 1.8, 1]).glow(OCT(3.4), '#ffffff', Z3, Z3, [1, 1.8, 1]);
    root.kid('spin1', [0, 62, 0], [0.35, 0, 0]).glow(T(18, 0.8, 5, 28), f.color, Z3, [PI / 2, 0, 0]);
    root.kid('spin2', [0, 46, 0], [-0.3, 0, 0.2]).glow(T(22, 0.6, 5, 28), '#e6d4ff', Z3, [PI / 2, 0, 0]);
    anim.push({ n: 'crystal', k: 'float', amp: 3, speed: 1.6 }, { n: 'spin1', k: 'spin', speed: 0.9 }, { n: 'spin2', k: 'spin', speed: -0.6 });
    return { root, anim };
  },
  mech(f, K) {
    const root = new Part('model'), anim = [];
    root.add(C(40, 43, 3, 6), DARK, [0, 1.5, 0], [0, PI / 6, 0]).add(C(35, 40, 14, 6), K.wall, [0, 10, 0], [0, PI / 6, 0]).add(C(36, 36, 2, 6), f.color, [0, 17.6, 0], [0, PI / 6, 0])
      .add(B(36, 16, 30), K.wall2, [0, 26, -2]).add(B(38, 2, 32), DARK, [0, 35, -2]).add(B(20, 9, 18), K.wall, [-5, 40, -4]).add(B(21, 1.6, 19), f.color, [-5, 45.2, -4])
      .add(B(16, 15, 2), '#1d2025', [0, 10.5, 33.4]).add(B(18, 2, 3), f.color, [0, 19, 33.4]);
    for (let i = -3; i <= 3; i++) root.add(B(1.6, 15, 2.3), i % 2 ? '#1d2025' : f.color, [i * 2.3, 10.5, 33.5]);
    for (const x of [-12, -4, 4, 12]) root.glow(B(4.6, 3, 0.6), '#9ff3ff', [x, 28, 13.3]);
    for (const [x, z, h] of [[-12, -13, 36], [-2, -14, 28]]) {
      root.add(C(3.6, 4.6, h, 8), DARK, [x, 34 + h / 2, z]).add(C(4.2, 4.2, 2, 8), f.color, [x, 34 + h - 3, z]).add(C(4, 4, 1.6, 8), DSTEEL, [x, 35 + h, z]);
    }
    root.add(C(1.3, 1.3, 26, 6), DSTEEL, [-18.5, 14, 18], LAYZ).add(C(1.3, 1.3, 20, 6), DSTEEL, [18.5, 24, 6]).add(C(1.3, 1.3, 14, 6), DSTEEL, [18.5, 30, 10], LAYZ)
      .add(C(0.3, 0.3, 22, 4), DSTEEL, [14, 47, -14]).glow(S(1.1, 6, 5), '#ff4030', [14, 58.6, -14]);
    const dish = root.kid('spin1', [10, 36, 4]);
    dish.add(C(1, 1.4, 8, 6), DSTEEL, [0, 4, 0]).add(DM(7, 10), STEEL, [0, 12, 0], [PI + 0.9, 0, 0]).add(C(0.3, 0.3, 7, 4), DSTEEL, [0, 11.5, 2.6], [0.9, 0, 0]).glow(S(0.8, 5, 4), '#ff4030', [0, 13.6, 5.4]);
    const gear = root.kid('spin2', [-22, 22, 13.6]);
    gear.add(C(7, 7, 2.4, 12), DSTEEL, Z3, LAYZ).add(C(2.2, 2.2, 3.4, 8), f.color, Z3, LAYZ);
    ring(8, 7.6, (x, y, a) => gear.add(B(2.6, 2.6, 2.4), DSTEEL, [x, y, 0], [0, 0, a]));
    anim.push({ n: 'spin1', k: 'spin', speed: 1.1 }, { n: 'spin2', k: 'spin', speed: 0.8, axis: 'z' });
    return { root, anim };
  },
};

const BARRACKS = {
  legion(f, K) {
    const root = new Part('model');
    root.add(B(48, 3, 31), DSTONE, [0, 1.5, 0]).add(B(44, 15, 27), K.wall, [0, 10, 0]).at([0, 17.5, 0], [0, PI / 2, 0], p => p.add(PR(33, 13, 49), f.color))
      .add(B(50, 1.6, 2), f.dark, [0, 30.4, 0]).add(B(8, 11, 1.4), '#2a1c12', [0, 8, 13.6]).add(B(10, 1.6, 2), DWOOD, [0, 14, 13.8]);
    for (const x of [-21.6, -11, 11, 21.6]) root.add(B(1.6, 15, 1.6), DWOOD, [x, 10, 13.7]);
    root.add(B(44.6, 1.6, 1.6), DWOOD, [0, 17, 13.7]);
    for (const x of [-16, 16]) root.glow(B(4.4, 4.4, 0.6), WIN, [x, 10.5, 13.7]).add(B(0.4, 9, 4.6), f.color, [x, 12.5, 15.2]).add(B(0.6, 1, 5.6), GOLD, [x, 17.2, 15.2]);
    root.add(B(5, 12, 5), K.wall2, [-15, 28, -6]).add(B(6, 1.6, 6), DSTONE, [-15, 34.6, -6]);
    // тренировочный манекен и стойка с оружием
    root.add(C(0.7, 0.7, 13, 5), DWOOD, [27, 6.5, 8]).add(B(9, 1.2, 1.2), DWOOD, [27, 10, 8]).add(S(2.2, 6, 5), '#d8c27a', [27, 14, 8]).add(C(3.4, 3.4, 1, 8), f.color, [27, 9.4, 9.2], LAYZ);
    root.add(B(1, 7, 1), DWOOD, [-26, 3.5, 4]).add(B(1, 7, 1), DWOOD, [-26, 3.5, 12]).add(B(1, 1, 9), DWOOD, [-26, 6.6, 8]);
    for (const z of [5.5, 8, 10.5]) root.at([-26.4, 1, z], [0, 0, PI / 2 - 0.12], p => sword(p, 8));
    return { root, anim: [] };
  },
  horde(f, K) {
    const root = new Part('model'), anim = [];
    root.add(B(46, 12, 26), K.wall, [0, 6, 0]).at([0, 11, 0], [0, PI / 2, 0], p => p.add(PR(36, 15, 50), HIDE)).add(B(51, 1.4, 2.4), DWOOD, [0, 26, 0]);
    for (const x of [-25, 25]) root.add(CN(1.6, 16, 5), BONE, [x, 28, 3.4], [0.75, 0, 0]).add(CN(1.6, 16, 5), BONE, [x, 28, -3.4], [-0.75, 0, 0]);
    for (const x of [-17, -6, 6, 17]) root.add(C(1.5, 1.7, 13, 6), K.wall2, [x, 6.5, 13.4]).add(B(7, 5, 0.6), '#8f6f45', [x, 18.5, 12.8], [0.82, 0, 0]);
    root.add(B(9, 10, 1.6), '#231710', [0, 5, 13.2]).add(S(2.6, 7, 5), BONE, [0, 13.6, 14.4]).add(CN(0.8, 5, 5), BONE, [3.4, 15.4, 14.4], [0, 0, -0.9]).add(CN(0.8, 5, 5), BONE, [-3.4, 15.4, 14.4], [0, 0, 0.9]);
    for (const x of [-12, 12]) root.add(B(0.5, 9, 5), f.color, [x, 8, 14.6]).add(B(0.6, 2, 3), f.dark, [x, 9, 15]);
    ring(7, 1, (c, s, a, i) => root.add(CN(1.5, 7, 5), K.wall2, [-22 + i * 7.3, 3.5, -16], [-0.35, 0, 0]));
    root.add(B(1, 8, 1), DWOOD, [27, 4, 3]).add(B(1, 8, 1), DWOOD, [27, 4, 11]).add(B(1, 1, 9.4), DWOOD, [27, 7.4, 7]);
    for (const z of [4.6, 7, 9.4]) root.at([27.6, 1.2, z], [0, 0, PI / 2], p => axe(p, 8));
    root.add(C(3.4, 2.4, 3, 8), DARK, [-28, 4.5, 10]).add(C(0.5, 0.5, 4, 4), DARK, [-28, 2, 10]);
    anim.push(flames(root, 'fl', [-28, 5.6, 10], 0.55));
    return { root, anim };
  },
  arcane(f, K) {
    const root = new Part('model'), anim = [];
    root.add(B(48, 3, 32), K.wall2, [0, 1.5, 0]).add(B(42, 15, 25), K.wall, [0, 10.5, -1]).add(B(46, 2.4, 29), K.wall2, [0, 19, -1])
      .add(B(8, 11, 1.4), '#2b2140', [0, 8.5, 11.6]).add(B(10, 1.4, 2), GOLD, [0, 14.6, 11.8]);
    for (const x of [-20, -9, 9, 20]) root.add(C(1.6, 1.8, 15, 8), '#f1edf7', [x, 10.5, 14]).add(B(4.4, 1.2, 4.4), K.wall2, [x, 18, 14]);
    for (const x of [-14.5, 14.5]) { root.add(DM(8.5, 10), f.color, [x, 20, -1]).add(S(1, 5, 4), GOLD, [x, 29, -1]).glow(B(4, 6.5, 0.6), '#e6d4ff', [x, 10.5, 11.7]); }
    root.add(C(7, 7, 5, 8), K.wall, [0, 22.5, -1]).add(DM(7.4, 10), f.color, [0, 25, -1]);
    root.kid('crystal', [0, 38, -1]).glow(OCT(3), f.color, Z3, Z3, [1, 1.8, 1]);
    root.kid('spin1', [0, 3.3, 22]).glow(T(6.5, 0.45, 4, 20), f.color, Z3, [PI / 2, 0, 0]).glow(T(3.6, 0.35, 4, 5), f.color, Z3, [PI / 2, 0, 0]);
    anim.push({ n: 'crystal', k: 'float', amp: 1.5, speed: 2 }, { n: 'spin1', k: 'spin', speed: 0.7 });
    return { root, anim };
  },
  mech(f, K) {
    const root = new Part('model'), anim = [];
    root.add(B(49, 2, 31), DARK, [0, 1, 0]).add(B(45, 15, 27), K.wall, [0, 9.5, 0]).add(B(47, 2, 29), K.wall2, [0, 18, 0]).add(B(45.4, 2, 27.4), f.color, [0, 4, 0]);
    for (let i = 0; i < 4; i++) root.add(PR(10.5, 6.5, 27), f.dark, [-16.5 + i * 11, 19, 0]).glow(B(0.5, 3.4, 22), '#9ff3ff', [-19.6 + i * 11, 21.6, 0], [0, 0, -0.53]);
    root.add(B(16, 12.5, 1), '#1d2025', [-8, 7.3, 13.6]);
    for (let i = 0; i < 5; i++) root.add(B(15.6, 1, 1.3), i % 2 ? DSTEEL : f.color, [-8, 2.4 + i * 2.6, 13.7]);
    root.glow(B(7, 3, 0.6), '#9ff3ff', [13, 11, 13.7]).add(B(4.4, 8, 1), '#1d2025', [13, 5, 13.6])
      .add(C(2.6, 3.2, 20, 8), DARK, [17, 28, -8]).add(C(3.1, 3.1, 1.8, 8), f.color, [17, 35, -8])
      .add(C(1.1, 1.1, 30, 6), DSTEEL, [0, 12.5, -14.6], LAYX).add(C(1.1, 1.1, 12, 6), DSTEEL, [-14, 6.5, -14.6])
      .add(B(6, 5, 6), '#6b5a40', [28, 2.5, 8]).add(B(5, 4, 5), '#6b5a40', [28.4, 7, 7.4], [0, 0.4, 0]).add(B(6.2, 1, 6.2), f.color, [28, 3.4, 8]);
    const fan = root.kid('spin1', [-20, 12, 13.8]);
    fan.add(B(7, 1.2, 0.5), DSTEEL).add(B(1.2, 7, 0.5), DSTEEL).add(C(1, 1, 1, 6), f.color, Z3, LAYZ);
    root.add(T(4.2, 0.6, 4, 12), DARK, [-20, 12, 13.6]);
    anim.push({ n: 'spin1', k: 'spin', speed: 6, axis: 'z' });
    return { root, anim };
  },
};

function mine(f, K) {
  const root = new Part('model'), anim = [];
  const RK = '#7b6a58', RK2 = '#65574a';
  root.add(DOD(20), RK, [0, 5, -5], [0.4, 0.3, 0], [1.1, 0.75, 1]).add(DOD(11), RK2, [-14, 2, 4], [1, 0.2, 0], [1, 0.7, 1]).add(DOD(9), RK2, [15, 2, 2], [0.2, 1, 0], [1, 0.7, 1])
    .add(B(11, 10.5, 4), '#15100c', [0, 5.3, 11.4]).add(B(2, 12, 2.2), WOOD, [6.4, 6, 13.4]).add(B(2, 12, 2.2), WOOD, [-6.4, 6, 13.4]).add(B(17, 2.2, 2.6), WOOD, [0, 12.6, 13.4])
    .at([0, 13.6, 14.6], [0, PI / 2, 0], p => p.add(PR(8, 3.4, 18), f.color)).glow(S(1, 5, 4), WIN, [0, 10.4, 14.6])
    .add(B(0.5, 0.5, 14), DSTEEL, [2.4, 0.4, 20]).add(B(0.5, 0.5, 14), DSTEEL, [-2.4, 0.4, 20]);
  for (let z = 14.5; z < 27; z += 3) root.add(B(7, 0.4, 1), DWOOD, [0, 0.2, z]);
  root.add(B(7, 3.6, 5), K.wall2, [0, 3.4, 21.5]).add(B(7.4, 0.8, 5.4), f.color, [0, 5, 21.5]);
  for (const [x, z] of [[2.2, 19.8], [-2.2, 19.8], [2.2, 23.2], [-2.2, 23.2]]) root.add(C(1.1, 1.1, 0.8, 8), DARK, [x * 1.5, 1.2, z], LAYX);
  for (const [x, y, z, s] of [[0, 6, 21.5, 1.6], [-1.6, 5.8, 22.4, 1.2], [1.5, 5.8, 20.6, 1.2], [9, 12, 3, 2.4], [-10, 10.5, 1, 2], [3, 17.5, -4, 2.6], [-15, 3, 11, 1.8], [16, 2.5, 9, 1.6]])
    root.add(DOD(s), '#ffd24a', [x, y, z], [x, y, z]);
  root.add(C(0.7, 0.7, 20, 5), DWOOD, [15, 10, 14]).add(C(0.6, 0.6, 12, 5), DWOOD, [10.8, 19, 14], [0, 0, 1.25]).add(C(0.12, 0.12, 9, 4), '#e9e4d4', [5.6, 16.4, 14]).add(B(2, 2, 2), DSTEEL, [5.6, 11.6, 14]);
  flag(root, f, -4, 17, -6, 13, 8);
  return { root, anim };
}

const TOWER = {
  ballista(f, K) {
    const root = new Part('model');
    root.add(C(17.5, 19.5, 3, 8), DSTONE, [0, 1.5, 0]).add(C(14.5, 17, 26, 8), K.wall, [0, 15, 0]).add(C(15.6, 15.6, 2, 8), K.wall2, [0, 12, 0]).add(C(18.5, 15, 4.5, 8), K.wall2, [0, 29.5, 0])
      .add(B(6, 9, 1.4), '#2a1c12', [0, 6, 17.2], [-0.1, 0, 0]).add(B(5, 11, 0.5), f.color, [0, 21, 15.6], [-0.1, 0, 0]).add(B(1.8, 1.8, 0.6), GOLD, [0, 23, 15.9]);
    ring(8, 16.6, (x, z, a) => root.add(B(5.2, 4.6, 3.4), K.wall, [x, 34, z], [0, -a + PI / 2, 0]));
    ring(4, 15, (x, z, a) => root.glow(B(1.3, 3.6, 1.3), WIN, [x, 19, z], [0, -a, 0]), PI / 4);
    const h = root.kid('head', [0, 32, 0]);
    h.add(C(6.5, 7.5, 2.4, 8), DWOOD, [0, 1.2, 0]).add(B(3, 5, 3), WOOD, [0, 4.6, 0]).add(B(27, 2.4, 3), WOOD, [3, 8, 0])
      .add(B(2, 1.8, 15), WOOD, [13.4, 8, 7.4], [0, 0.38, 0]).add(B(2, 1.8, 15), WOOD, [13.4, 8, -7.4], [0, -0.38, 0])
      .add(B(0.3, 0.3, 17.4), '#e9e4d4', [3.6, 8.2, 7.6], [0, -0.82, 0]).add(B(0.3, 0.3, 17.4), '#e9e4d4', [3.6, 8.2, -7.6], [0, 0.82, 0])
      .add(C(0.55, 0.55, 22, 5), '#d8dde4', [8, 9.6, 0], LAYX).add(CN(1.3, 4, 5), STEEL, [20.6, 9.6, 0], LAYX).add(B(3, 4.4, 1), f.color, [-8, 8.6, 2.2]).add(B(3, 4.4, 1), f.color, [-8, 8.6, -2.2]);
    return { root, anim: [{ n: 'head', k: 'aim' }, { n: 'head', k: 'kick', amp: 2.5 }] };
  },
  brazier(f, K) {
    const root = new Part('model'), anim = [];
    ring(4, 1, (c, s, a) => {
      root.add(C(1.7, 2.2, 36, 6), K.wall, [c * 11.5, 17, s * 11.5], [-s * 0.25, 0, c * 0.25]).add(CN(1.7, 4, 6), BONE, [c * 6.6, 36.6, s * 6.6], [-s * 0.25, 0, c * 0.25])
        .add(B(0.4, 9, 4), f.color, [c * 15.4, 12, s * 15.4], [0, -a, 0]).add(S(1.7, 6, 5), BONE, [c * 10.6, 26.5, s * 10.6]);
    }, PI / 4);
    for (const y of [9, 20]) ring(4, 1, (c, s, a) => root.add(B(1.2, 1.4, 21 - y * 0.42), K.wall2, [c * (10 - y * 0.2), y, s * (10 - y * 0.2)], [0, -a, 0]));
    root.add(C(18, 20, 2, 8), '#6b5a40', [0, 1, 0]).add(C(10.5, 10.5, 2, 8), K.wall2, [0, 31, 0]).add(C(11.5, 6.5, 6.5, 8), DARK, [0, 35.2, 0]).add(C(12.2, 12.2, 1.2, 8), DSTEEL, [0, 38.4, 0])
      .glow(C(10, 10, 1, 8), '#ff5a1a', [0, 38.8, 0]);
    ring(8, 12, (x, z, a) => root.add(CN(0.9, 3.6, 4), BONE, [x, 40.4, z], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]));
    anim.push(flames(root, 'flame', [0, 39, 0], 1.15));
    return { root, anim };
  },
  obelisk(f, K) {
    const root = new Part('model');
    root.add(C(18.5, 20.5, 3, 8), K.wall2, [0, 1.5, 0]).add(C(14, 16, 3, 8), K.wall, [0, 4.5, 0]).glow(T(16.6, 0.5, 4, 24), f.color, [0, 3.3, 0], [PI / 2, 0, 0])
      .add(C(5, 9.5, 42, 4), K.wall, [0, 27, 0], [0, PI / 4, 0]).add(CN(5.4, 8, 4), f.color, [0, 52, 0], [0, PI / 4, 0]).add(C(10.5, 10.5, 2, 4), K.wall2, [0, 7, 0], [0, PI / 4, 0]);
    ring(4, 1, (c, s, a) => {
      root.glow(B(0.6, 26, 2), f.color, [c * 5.3, 26, s * 5.3], [0, -a, c ? -c * 0.075 : 0]).glow(B(0.6, 2, 4.4), f.color, [c * 4.3, 41, s * 4.3], [0, -a, 0]);
      root.add(OCT(2.6), f.color, [c * 14 * 0.71 - s * 14 * 0.71, 9, s * 14 * 0.71 + c * 14 * 0.71], [0.2, a, 0], [1, 1.9, 1]);
    });
    root.kid('crystal', [0, 66, 0]).glow(OCT(5), f.color, Z3, Z3, [1, 1.7, 1]).glow(OCT(2.4), '#ffffff', Z3, Z3, [1, 1.7, 1]);
    root.kid('spin1', [0, 66, 0], [0.5, 0, 0]).glow(T(10, 0.5, 5, 22), '#e6d4ff', Z3, [PI / 2, 0, 0]);
    root.kid('spin2', [0, 66, 0], [-0.5, 0, 0.4]).glow(T(12.5, 0.4, 5, 22), f.color, Z3, [PI / 2, 0, 0]);
    return { root, anim: [{ n: 'crystal', k: 'float', amp: 2.5, speed: 2 }, { n: 'crystal', k: 'pulse' }, { n: 'spin1', k: 'spin', speed: 1.6 }, { n: 'spin2', k: 'spin', speed: -1.1 }] };
  },
  mortar(f, K) {
    const root = new Part('model');
    root.add(C(20, 21.5, 3.4, 8), K.wall2, [0, 1.7, 0]).add(C(20.2, 20.2, 1, 8), f.color, [0, 3.6, 0]);
    for (const [n, y, off] of [[11, 6, 0], [11, 10.6, 0.28]]) ring(n, 16.5, (x, z, a) => {
      if (Math.abs(a - PI / 2 - off) < 0.5 + off) return;
      root.add(S(4.4, 7, 5), y > 8 ? '#a8956c' : '#b9a67c', [x, y, z], [0, -a, 0], [0.75, 0.62, 1.25]);
    }, off);
    root.add(B(7, 4.4, 6), '#6b5a40', [-6, 5.6, 22], [0, 0.3, 0]).add(B(7.2, 1, 6.2), f.color, [-6, 6.2, 22], [0, 0.3, 0]);
    for (const [x, z] of [[4, 22], [7.4, 20.6], [5.6, 25]]) root.add(C(1.3, 1.3, 5, 6), DSTEEL, [x, 5.9, z]).add(CN(1.3, 2.4, 6), f.color, [x, 9.6, z]);
    root.add(C(0.3, 0.3, 16, 4), DSTEEL, [-13, 11, -13]).glow(S(1, 5, 4), '#ff4030', [-13, 19.6, -13]);
    const h = root.kid('head', [0, 3.6, 0]);
    h.add(C(8, 9, 3, 8), DARK, [0, 1.5, 0]).add(B(3, 9, 1.6), DSTEEL, [0, 6.5, 5.6]).add(B(3, 9, 1.6), DSTEEL, [0, 6.5, -5.6]).add(C(1.2, 1.2, 13, 6), DSTEEL, [0, 9.6, 0], LAYZ);
    h.kid('tube', [0, 9.6, 0], [0, 0, -0.75]).add(C(4.3, 5.2, 18, 10), DARK, [0, 5, 0]).add(C(4.9, 4.9, 2.2, 10), f.color, [0, 13.4, 0]).add(C(5.5, 5.5, 2, 10), DSTEEL, [0, -3.4, 0]);
    return { root, anim: [{ n: 'head', k: 'aim' }, { n: 'tube', k: 'kickY', amp: 3 }] };
  },
};

// ================= Убранство баз =================
// У каждой фракции шесть видов: plaza — площадь вокруг цитадели, post — столб, gate — пара у ворот, a/b/c — утварь
const STRAW = '#d8b66a';
const PROPS = {
  legion: {
    plaza(f, K) {
      const root = new Part('model');
      ring(16, 61, (x, z, a, i) => root.add(B(21, 1.2, 9), i % 2 ? K.wall : K.wall2, [x, 0.6, z], [0, -a + PI / 2, 0]));
      ring(13, 51, (x, z, a, i) => root.add(B(21, 1, 9), i % 2 ? K.wall2 : '#b3ae9f', [x, 0.5, z], [0, -a + PI / 2, 0]), 0.2);
      ring(8, 66.5, (x, z) => root.add(C(1.6, 2, 2.4, 6), K.wall2, [x, 1.2, z]).add(S(1.1, 5, 4), GOLD, [x, 3, z]), PI / 8);
      return { root, anim: [] };
    },
    post(f) {
      const root = new Part('model');
      root.add(C(2.2, 2.8, 2.4, 6), STONE, [0, 1.2, 0]).add(C(0.6, 0.7, 34, 5), DWOOD, [0, 17, 0]).add(B(10, 0.8, 0.8), DWOOD, [0, 31, 0]).add(S(1.1, 5, 4), GOLD, [0, 34.8, 0])
        .add(B(8.4, 13, 0.4), f.color, [0, 24, 0.5]).add(B(8.4, 1.4, 0.5), GOLD, [0, 18, 0.5]).add(B(3, 3, 0.5), GOLD, [0, 25.5, 0.6], [0, 0, PI / 4]);
      return { root, anim: [] };
    },
    gate(f, K) {
      const root = new Part('model');
      root.add(B(15, 2.4, 15), K.wall2, [0, 1.2, 0]).add(B(12, 8, 12), K.wall, [0, 6.4, 0]).add(B(13.6, 1.6, 13.6), K.wall2, [0, 11.2, 0])
        .add(C(2.8, 3.6, 12, 7), STONE, [0, 18, 0]).add(B(8.4, 3, 4.4), STONE, [0, 23, 0]).add(S(2.3, 7, 5), STONE, [0, 26.6, 0]).add(CN(1.2, 3.4, 5), f.color, [0, 30, 0])
        .add(B(1, 15, 0.8), STEEL, [0, 19.5, 3.6]).add(B(5, 1, 1), GOLD, [0, 23.4, 3.6]).add(B(7, 10, 0.6), f.color, [0, 19, -3.1])
        .add(B(4.6, 5.4, 0.5), f.color, [0, 6.6, 6.2]).add(B(2, 2, 0.5), GOLD, [0, 6.8, 6.4], [0, 0, PI / 4]);
      return { root, anim: [] };
    },
    a(f) { // шатёр
      const root = new Part('model');
      root.add(CN(13, 15, 4), '#e9e4d6', [0, 7.5, 0], [0, PI / 4, 0]).add(C(9.3, 13.5, 5, 4), f.color, [0, 2.5, 0], [0, PI / 4, 0]).add(B(4.4, 6.4, 1), '#3a2c20', [0, 3.2, 8.3], [-0.55, 0, 0])
        .add(C(0.4, 0.4, 5, 4), DWOOD, [0, 16.5, 0]).add(B(4, 2.4, 0.3), f.color, [2.2, 17.6, 0]).add(S(0.7, 5, 4), GOLD, [0, 19.3, 0]);
      return { root, anim: [] };
    },
    b(f) { // чучело для тренировок и стойка с копьями
      const root = new Part('model');
      root.add(C(0.8, 0.9, 11, 5), WOOD, [0, 5.5, 0]).add(B(11, 1.1, 1.1), WOOD, [0, 9.4, 0]).add(C(2.7, 2.2, 6.4, 7), STRAW, [0, 8.2, 0]).add(S(2.1, 7, 5), STRAW, [0, 13, 0])
        .add(C(3.2, 3.2, 0.7, 10), f.color, [-4.6, 9, 1.2], LAYZ).add(S(0.8, 5, 4), GOLD, [-4.6, 9, 1.7])
        .add(B(0.9, 9, 0.9), DWOOD, [7, 4.5, -4]).add(B(0.9, 9, 0.9), DWOOD, [13, 4.5, -4]).add(B(7.4, 0.8, 0.8), DWOOD, [10, 8, -4]);
      for (let i = 0; i < 3; i++) root.add(C(0.3, 0.3, 13, 4), WOOD, [8.2 + i * 1.8, 6.5, -3.2], [0.14, 0, 0]).add(CN(0.7, 2.4, 4), STEEL, [8.2 + i * 1.8, 14, -2.3]);
      return { root, anim: [] };
    },
    c(f) { // бочки, ящик и тюк сена
      const root = new Part('model');
      for (const [x, z] of [[-4, 0], [1.6, 3.4]]) root.add(C(2.9, 2.9, 6.4, 9), WOOD, [x, 3.2, z]).add(C(3.05, 3.05, 0.7, 9), DSTEEL, [x, 1.6, z]).add(C(3.05, 3.05, 0.7, 9), DSTEEL, [x, 4.8, z]);
      root.add(B(6.4, 6.4, 6.4), '#9a7447', [3.6, 3.2, -3.6], [0, 0.3, 0]).add(B(6.8, 0.8, 6.8), DWOOD, [3.6, 6.4, -3.6], [0, 0.3, 0])
        .add(C(3.4, 3.4, 7, 9), STRAW, [-3, 3.4, -5.4], LAYX).add(B(3, 4, 0.3), f.color, [-4, 5, 3.05]);
      return { root, anim: [] };
    },
  },
  horde: {
    plaza() {
      const root = new Part('model');
      ring(14, 62, (x, z, a, i) => root.add(DOD(3 + i % 3), i % 2 ? '#5a5046' : '#6f6558', [x, 1.2, z], [i, a, 0], [1, 0.6, 1]));
      ring(9, 55, (x, z, a) => root.add(CN(1.5, 10, 5), DWOOD, [x, 4.2, z], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]).add(CN(0.7, 2.6, 5), BONE, [x + Math.cos(a) * 2.6, 8.4, z + Math.sin(a) * 2.6], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]), 0.35);
      ring(5, 50, (x, z, a, i) => root.add(S(1.7, 6, 5), BONE, [x, 1.3, z]).add(C(0.4, 0.4, 5, 4), BONE, [x + 3, 0.5, z + 1.6], [0, i, PI / 2]), 1.1);
      return { root, anim: [] };
    },
    post(f) { // шест с черепом и чашей огня
      const root = new Part('model');
      root.add(C(0.8, 1.1, 24, 5), DWOOD, [0, 12, 0], [0, 0, 0.05]).add(S(2.3, 7, 5), BONE, [0, 17, 1.6], Z3, [1, 1.1, 0.9]).add(B(0.8, 0.9, 0.6), EYE, [0.9, 17.4, 3.5]).add(B(0.8, 0.9, 0.6), EYE, [-0.9, 17.4, 3.5])
        .add(CN(0.6, 4, 5), BONE, [3, 18.6, 1.6], [0, 0, -1]).add(CN(0.6, 4, 5), BONE, [-3, 18.6, 1.6], [0, 0, 1])
        .add(B(0.4, 7, 3.6), f.color, [0, 9.4, -1.8]).add(C(2.6, 1.6, 2, 7), DARK, [-0.6, 24.6, 0]);
      return { root, anim: [flames(root, 'fl', [-0.6, 25.2, 0], 0.42)] };
    },
    gate(f, K) { // тотем
      const root = new Part('model');
      root.add(C(5.4, 6.4, 10, 7), K.wall, [0, 5, 0]).add(C(5.8, 5.4, 9, 7), f.color, [0, 14.5, 0]).add(C(5, 5.6, 8, 7), K.wall2, [0, 23, 0]).add(B(24, 3, 1.6), K.wall, [0, 22, 0]).add(B(3, 5, 1.7), f.color, [10.5, 22, 0]).add(B(3, 5, 1.7), f.color, [-10.5, 22, 0])
        .glow(B(1.6, 1.4, 0.6), FIRE2, [2, 16, 5.3]).glow(B(1.6, 1.4, 0.6), FIRE2, [-2, 16, 5.3]).add(B(5, 1.2, 0.8), EYE, [0, 12.4, 5.4]).add(CN(0.8, 3, 5), BONE, [1.8, 11, 5.6], [PI, 0, 0]).add(CN(0.8, 3, 5), BONE, [-1.8, 11, 5.6], [PI, 0, 0])
        .add(S(3.2, 7, 5), BONE, [0, 29.6, 0], Z3, [1, 1.1, 0.95]).add(B(1, 1.2, 0.8), EYE, [1.2, 30, 2.9]).add(B(1, 1.2, 0.8), EYE, [-1.2, 30, 2.9])
        .add(CN(1, 8, 5), BONE, [4.6, 32.6, 0], [0, 0, -0.8]).add(CN(1, 8, 5), BONE, [-4.6, 32.6, 0], [0, 0, 0.8]);
      return { root, anim: [] };
    },
    a(f) { // шатёр из шкур
      const root = new Part('model');
      root.add(CN(13, 17, 8), HIDE, [0, 8.5, 0]).add(CN(6.6, 8, 8), '#8f6f45', [0, 15.4, 0]).add(B(5, 7, 1.4), '#231710', [0, 3.5, 10.6], [-0.6, 0, 0]).add(C(13.2, 13.4, 1.4, 8), f.color, [0, 1.6, 0]);
      for (const a of [0.3, 2.4, 4.4]) root.add(C(0.3, 0.3, 8, 4), DWOOD, [Math.cos(a) * 1.2, 20.5, Math.sin(a) * 1.2], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]);
      root.add(CN(0.9, 6, 5), BONE, [4, 5, 10.4], [0, 0, -0.5]).add(CN(0.9, 6, 5), BONE, [-4, 5, 10.4], [0, 0, 0.5]);
      return { root, anim: [] };
    },
    b() { // костёр
      const root = new Part('model');
      ring(7, 5.6, (x, z, a, i) => root.add(DOD(1.9), i % 2 ? '#5a5046' : '#6f6558', [x, 0.9, z], [i, a, 0]));
      for (const a of [0, 1.05, 2.1]) root.add(C(0.9, 0.9, 10, 5), DWOOD, [0, 2.2, 0], [0, a, PI / 2 - 0.25]);
      root.add(C(0.4, 0.4, 13, 4), DWOOD, [9, 6.5, 0]).add(C(0.4, 0.4, 13, 4), DWOOD, [-9, 6.5, 0]).add(C(0.35, 0.35, 19, 4), DSTEEL, [0, 12, 0], [0, 0, PI / 2]).add(C(2.4, 1.8, 3, 7), DARK, [0, 10, 0]);
      return { root, anim: [flames(root, 'fl', [0, 1.6, 0], 0.75)] };
    },
    c() { // остов зверя
      const root = new Part('model');
      for (let i = 0; i < 4; i++) root.add(T(5 - i * 0.5, 0.6, 4, 8, PI), BONE, [0, 0.4, -6 + i * 3.6]);
      root.add(C(0.7, 0.7, 16, 5), BONE, [0, 5, -1], LAYZ).add(S(2.8, 7, 5), BONE, [0, 2.6, 8.6], Z3, [1, 0.9, 1.3]).add(B(0.9, 1, 0.8), EYE, [1.2, 3.2, 11.6]).add(B(0.9, 1, 0.8), EYE, [-1.2, 3.2, 11.6])
        .add(CN(0.9, 7, 5), BONE, [3.6, 5, 8], [0, 0, -0.9]).add(CN(0.9, 7, 5), BONE, [-3.6, 5, 8], [0, 0, 0.9]).add(C(0.5, 0.5, 7, 4), BONE, [6, 0.6, -4], [0, 0.6, PI / 2]);
      return { root, anim: [] };
    },
  },
  arcane: {
    plaza(f, K) {
      const root = new Part('model');
      root.glow(T(61, 0.9, 4, 44), f.color, [0, 0.9, 0], [PI / 2, 0, 0]).glow(T(52, 0.5, 4, 40), '#e6d4ff', [0, 0.8, 0], [PI / 2, 0, 0]);
      ring(8, 56.5, (x, z, a) => root.add(B(6, 1.2, 6), K.wall, [x, 0.6, z], [0, -a, 0]).glow(B(2.4, 0.3, 2.4), f.color, [x, 1.35, z], [0, -a + PI / 4, 0]), PI / 8);
      ring(8, 66, (x, z) => root.glow(OCT(1.5), '#e6d4ff', [x, 2.2, z], Z3, [1, 1.6, 1]));
      return { root, anim: [] };
    },
    post(f, K) { // колонна с парящим кристаллом
      const root = new Part('model');
      root.add(C(2.4, 2.8, 1.6, 6), K.wall2, [0, 0.8, 0]).add(C(1.3, 1.7, 15, 6), K.wall, [0, 9, 0]).add(C(2.2, 1.5, 1.6, 6), K.wall2, [0, 17, 0]).add(C(1.5, 1.5, 0.5, 6), GOLD, [0, 14, 0]);
      root.kid('orb', [0, 23, 0]).glow(OCT(2.2), f.color, Z3, Z3, [1, 1.7, 1]).glow(OCT(1), '#ffffff', Z3, Z3, [1, 1.7, 1]);
      return { root, anim: [{ n: 'orb', k: 'float', amp: 1.2, speed: 2 }] };
    },
    gate(f, K) { // обелиск с кристаллом
      const root = new Part('model');
      root.add(C(6.4, 7.4, 3, 6), K.wall2, [0, 1.5, 0]).add(C(3.6, 5.2, 30, 6), K.wall, [0, 18, 0]).add(C(4.6, 4.6, 1.6, 6), K.wall2, [0, 33.6, 0]).add(CN(4.2, 7, 6), f.color, [0, 38, 0])
        .glow(T(4.9, 0.5, 4, 14), f.color, [0, 12, 0], [PI / 2, 0, 0]).glow(T(4.3, 0.5, 4, 14), '#e6d4ff', [0, 24, 0], [PI / 2, 0, 0]);
      for (const y of [8, 17, 27]) root.glow(B(1.2, 4, 0.5), f.color, [0, y, 4.6 - y * 0.045]);
      root.kid('crystal', [0, 49, 0]).glow(OCT(3.2), f.color, Z3, Z3, [1, 1.8, 1]).glow(OCT(1.5), '#ffffff', Z3, Z3, [1, 1.8, 1]);
      return { root, anim: [{ n: 'crystal', k: 'float', amp: 1.6, speed: 1.5 }] };
    },
    a(f) { // друза кристаллов
      const root = new Part('model');
      root.add(DOD(6), '#8f89a3', [0, 1.6, 0], [1, 2, 0], [1.4, 0.5, 1.4]);
      for (const [x, z, s, rx, rz, c] of [[0, 0, 6, 0, 0, 0], [5, 2, 3.8, 0.2, -0.5, 1], [-5, 1, 4.2, -0.1, 0.5, 0], [1, -5, 3.4, -0.5, 0, 1], [-2, 5, 3, 0.55, 0.2, 0], [6, -4, 2.2, -0.3, -0.6, 1]])
        root.glow(OCT(s), c ? '#e6d4ff' : f.color, [x, s * 1.3, z], [rx, 0, rz], [0.62, 1.9, 0.62]);
      return { root, anim: [] };
    },
    b(f) { // рунный камень
      const root = new Part('model');
      root.add(B(8, 17, 3.4), '#9a94ad', [0, 8, 0], [-0.08, 0, 0.06]).add(B(6, 3, 3), '#8f89a3', [0.4, 17.4, -0.6], [-0.08, 0, 0.3]).add(DOD(3), '#8f89a3', [6, 1.4, 2], [1, 0, 2], [1, 0.6, 1]).add(DOD(2.2), '#9a94ad', [-6, 1, -2], [2, 1, 0], [1, 0.6, 1])
        .glow(B(0.9, 9, 0.4), f.color, [0, 9, 1.9], [-0.08, 0, 0.06]).glow(B(4.4, 0.9, 0.4), f.color, [0.2, 11.6, 1.75], [-0.08, 0, 0.06]).glow(B(3, 0.9, 0.4), f.color, [-0.2, 6.4, 2.15], [-0.08, 0, 0.5]);
      return { root, anim: [] };
    },
    c(f, K) { // постамент с вращающимся кольцом
      const root = new Part('model');
      root.add(C(4.6, 5.4, 2, 8), K.wall2, [0, 1, 0]).add(C(2.6, 3.6, 6, 8), K.wall, [0, 5, 0]).add(C(3.6, 2.8, 1.4, 8), K.wall2, [0, 8.7, 0]).glow(S(1.5, 7, 5), '#ffffff', [0, 14, 0]);
      root.kid('spin1', [0, 14, 0], [0.5, 0, 0.2]).glow(T(4.4, 0.45, 4, 18), f.color, Z3, [PI / 2, 0, 0]);
      root.kid('spin2', [0, 14, 0], [-0.6, 0, -0.3]).glow(T(3.2, 0.35, 4, 16), '#e6d4ff', Z3, [PI / 2, 0, 0]);
      return { root, anim: [{ n: 'spin1', k: 'spin', speed: 1.6 }, { n: 'spin2', k: 'spin', speed: -2.2 }] };
    },
  },
  mech: {
    plaza(f) {
      const root = new Part('model');
      ring(6, 57, (x, z, a, i) => {
        root.at([x, 0, z], [0, -a + PI / 2, 0], p => {
          p.add(B(60, 1.2, 13), i % 2 ? '#4a4f57' : '#565c65', [0, 0.6, 0]);
          for (let j = -2; j <= 2; j++) p.add(B(5, 1.3, 2.2), j % 2 ? DARK : '#f2c230', [j * 5, 0.62, 5]);
          p.glow(B(9, 0.4, 1.2), '#9ff3ff', [0, 1.3, -4.6]);
        });
      });
      ring(6, 66, (x, z) => root.add(C(2.4, 2.8, 3, 6), DARK, [x, 1.5, z]).add(C(1.6, 1.6, 1, 6), f.color, [x, 3.4, z]), PI / 6);
      return { root, anim: [] };
    },
    post(f) { // фонарь
      const root = new Part('model');
      root.add(C(1.9, 2.3, 1.8, 6), DARK, [0, 0.9, 0]).add(C(0.6, 0.8, 23, 6), DSTEEL, [0, 12.5, 0]).add(B(6, 0.9, 0.9), DSTEEL, [2.6, 23.6, 0]).add(B(3.2, 1.2, 2.2), DARK, [5, 23, 0])
        .glow(B(2.6, 0.6, 1.7), '#9ff3ff', [5, 22.2, 0]).add(C(0.9, 0.9, 1.4, 6), f.color, [0, 8, 0]);
      return { root, anim: [] };
    },
    gate(f) { // радиомачта
      const root = new Part('model');
      root.add(B(11, 2.4, 11), DARK, [0, 1.2, 0]).add(C(1.9, 4.6, 32, 4), DSTEEL, [0, 18, 0], [0, PI / 4, 0]).add(C(3.5, 3.9, 1.6, 4), f.color, [0, 9, 0], [0, PI / 4, 0]).add(C(2.6, 2.9, 1.4, 4), f.color, [0, 22, 0], [0, PI / 4, 0])
        .add(C(0.3, 0.3, 12, 4), DSTEEL, [0, 40, 0]).glow(S(1.1, 6, 5), '#ff4030', [0, 46.4, 0]).glow(B(2.4, 1.4, 0.5), '#9ff3ff', [0, 5, 3.9]);
      const dish = root.kid('spin1', [0, 34, 0]);
      dish.add(DM(5, 9), STEEL, [0, 2, 2.6], [PI + 1.1, 0, 0]).add(C(0.3, 0.3, 5, 4), DSTEEL, [0, 2.6, 4.4], [1.1, 0, 0]);
      return { root, anim: [{ n: 'spin1', k: 'spin', speed: 0.8 }] };
    },
    a(f, K) { // топливная цистерна
      const root = new Part('model');
      root.add(C(6.6, 6.6, 20, 10), K.wall, [0, 9, 0], LAYX).add(S(6.6, 10, 6), K.wall, [10, 9, 0], Z3, [0.5, 1, 1]).add(S(6.6, 10, 6), K.wall, [-10, 9, 0], Z3, [0.5, 1, 1])
        .add(C(6.8, 6.8, 2, 10), f.color, [5, 9, 0], LAYX).add(C(6.8, 6.8, 2, 10), f.color, [-5, 9, 0], LAYX).add(B(3, 4, 12), DARK, [6, 2, 0]).add(B(3, 4, 12), DARK, [-6, 2, 0])
        .add(C(1.6, 1.6, 2.4, 8), DSTEEL, [0, 16.4, 0]).add(C(2.2, 2.2, 0.7, 8), '#f2c230', [0, 17.9, 0]).add(C(0.8, 0.8, 9, 6), DSTEEL, [12.6, 4.5, 3]).add(C(0.8, 0.8, 4, 6), DSTEEL, [11, 9, 3], LAYX);
      return { root, anim: [] };
    },
    b(f) { // контейнеры и бочка
      const root = new Part('model');
      root.add(B(9, 8, 8), '#5c646e', [-2, 4, 0], [0, 0.2, 0]).add(B(9.4, 1, 8.4), DARK, [-2, 4, 0], [0, 0.2, 0]).add(B(6.4, 6, 6.4), f.color, [-2.6, 11, 0.4], [0, -0.25, 0]).add(B(6.8, 0.8, 6.8), DARK, [-2.6, 11, 0.4], [0, -0.25, 0])
        .add(C(2.7, 2.7, 7, 9), DARK, [6.6, 3.5, 2.6]).add(C(2.85, 2.85, 1.2, 9), '#f2c230', [6.6, 4.4, 2.6]).add(B(6, 5, 5), '#454b53', [5.4, 2.5, -4.4], [0, -0.4, 0]);
      return { root, anim: [] };
    },
    c(f, K) { // генератор
      const root = new Part('model');
      root.add(B(12, 1.6, 10), DARK, [0, 0.8, 0]).add(B(10.4, 8, 8), K.wall2, [0, 5.6, 0]).add(B(10.8, 1, 8.4), f.color, [0, 9.8, 0]).add(C(1.3, 1.6, 9, 7), DARK, [3, 14, -2]).add(C(1.7, 1.7, 1, 7), DSTEEL, [3, 18.6, -2]);
      for (const x of [-3, 0, 3]) root.glow(B(1.8, 3.6, 0.5), '#9ff3ff', [x, 5.6, 4.1]);
      const gear = root.kid('spin2', [-6.2, 5.6, 0], [0, PI / 2, 0]);
      gear.add(C(3.6, 3.6, 1.6, 10), DSTEEL, Z3, LAYZ).add(C(1.3, 1.3, 2.4, 6), f.color, Z3, LAYZ);
      ring(6, 4, (x, y, a) => gear.add(B(1.8, 1.8, 1.6), DSTEEL, [x, y, 0], [0, 0, a]));
      return { root, anim: [{ n: 'spin2', k: 'spin', speed: 2.2, axis: 'z' }] };
    },
  },
};

// ================= Шаблоны и экземпляры =================
const TPL = {};
function instance(key, build) {
  let t = TPL[key];
  if (!t) {
    const d = build(), g = d.root.build();
    g.scale.setScalar(d.scale || 1);
    g.updateMatrixWorld(true);
    t = TPL[key] = { g, anim: d.anim, h: new THREE.Box3().setFromObject(g).max.y };
  }
  const m = t.g.clone(true);
  m.userData = { h: t.h, mv: 0, ph: Math.random() * 6, rate: 9,
    anim: t.anim.map(a => { const o = m.getObjectByName(a.n); return { ...a, o, x0: o.position.x, y0: o.position.y }; }) };
  return m;
}

export function makeUnit(type, facKey, fac, speed) {
  const m = instance(type + '|' + facKey, () => U[type](fac));
  m.userData.rate = 4 + speed * 0.075;
  return m;
}
export function makeBuilding(type, facKey, fac) {
  const K = KIT[facKey];
  return instance(type + '|' + facKey, () => type === 'hq' ? HQ[facKey](fac, K) : type === 'barracks' ? BARRACKS[facKey](fac, K) : type === 'mine' ? mine(fac, K) : TOWER[type](fac, K));
}

export function makeProp(kind, facKey, fac) { return instance('prop|' + kind + '|' + facKey, () => ({ ...PROPS[facKey][kind](fac, KIT[facKey]), scale: kind === 'plaza' ? 1 : 1.25 })); }

// e — сущность симуляции; для воинов swing — фаза удара, для зданий fire — вспышка выстрела
export function animate(m, e, t, dt) {
  const st = m.userData, unit = e.kind === 'unit';
  if (unit) { st.mv += ((e.moving ? 1 : 0) - st.mv) * Math.min(1, dt * 10); if (e.moving) st.ph += dt * st.rate; }
  const s = unit ? Math.max(0, Math.min(1, e.swing / 0.25)) : Math.max(0, Math.min(1, e.fire / 0.3));
  const sw = Math.sin(s * PI), wk = Math.sin(st.ph) * st.mv;
  for (const a of st.anim) {
    const o = a.o;
    switch (a.k) {
      case 'limb': o.rotation.z = a.base + a.walk * wk + a.atk * (a.lag ? Math.sin(Math.max(0, Math.min(1, s * 1.4 - 0.4)) * PI) : sw); break;
      case 'kick': o.position.x = a.x0 - a.amp * sw; break;
      case 'kickY': o.position.y = a.y0 - a.amp * sw; break;
      case 'spin': o.rotation[a.axis || 'y'] = t * a.speed; break;
      case 'flick': { const k = 1 + Math.sin(t * 17 + e.id) * 0.12 + Math.sin(t * 29 + e.id) * 0.07 + (!unit && e.fire > 0 ? 0.5 : 0) + (unit ? sw * 0.6 : 0); o.scale.set(k, k * (1 + Math.sin(t * 23) * 0.12), k); break; }
      case 'float': o.position.y = a.y0 + Math.sin(t * a.speed + e.id) * a.amp; o.rotation.y = t * 1.2; break;
      case 'pulse': o.scale.setScalar(1 + sw * 0.5); break;
      case 'aim': o.rotation.y = -e.aim; break;
    }
  }
}

// ================= Природа =================
export function makeObstacles(list, map = {}) {
  const p = new Part('obstacles');
  const greens = map.greens || ['#2f6b2a', '#3a7a30', '#2a5f33', '#4a8a36'], snowy = map.snowy, SNOW = '#f2f6fa';
  const rock = map.rock || null;
  for (const o of list) {
    const r = o.r, k = o.seed, ry = k * 6;
    p.at([o.x, 0, o.y], [0, ry, 0], q => {
      if (o.kind === 'cactus') { // кактус в окружении камней и сухих кустов
        const cg = k < 0.5 ? '#4f8a4a' : '#5c9450', h = r * (1.5 + k);
        q.add(C(r * 0.2, r * 0.24, h, 7), cg, [0, h / 2, 0]).add(S(r * 0.2, 7, 5), cg, [0, h, 0])
          .add(C(r * 0.12, r * 0.12, r * 0.5, 6), cg, [r * 0.36, h * 0.5, 0], [0, 0, PI / 2]).add(C(r * 0.12, r * 0.13, r * 0.7, 6), cg, [r * 0.55, h * 0.5 + r * 0.3, 0]).add(S(r * 0.12, 6, 4), cg, [r * 0.55, h * 0.5 + r * 0.65, 0])
          .add(C(r * 0.11, r * 0.11, r * 0.4, 6), cg, [-r * 0.3, h * 0.66, 0], [0, 0, PI / 2]).add(C(r * 0.11, r * 0.12, r * 0.5, 6), cg, [-r * 0.46, h * 0.66 + r * 0.22, 0]).add(S(r * 0.11, 6, 4), cg, [-r * 0.46, h * 0.66 + r * 0.47, 0])
          .add(DOD(r * 0.36), '#c08a5a', [r * 0.5, r * 0.12, r * 0.55], [k, 1, 0], [1, 0.6, 1]).add(DOD(r * 0.28), '#a8744a', [-r * 0.6, r * 0.1, -r * 0.4], [2, k, 0], [1, 0.6, 1])
          .add(ICO(r * 0.3, 0), '#b7a55a', [-r * 0.45, r * 0.18, r * 0.55], [k, 0, 0], [1, 0.6, 1]).add(ICO(r * 0.24, 0), '#a89a52', [r * 0.55, r * 0.14, -r * 0.5], [0, k, 0], [1, 0.6, 1]);
      } else if (o.kind ? o.kind === 'fir' : o.tree && k < 0.55) { // ель
        const g = greens[Math.floor(k * 7) % 3];
        q.add(C(r * 0.11, r * 0.16, r * 0.7, 6), '#5d3f25', [0, r * 0.35, 0]);
        [[1.05, 1.2, 0.6], [0.82, 1.1, 1.25], [0.58, 1.0, 1.9], [0.34, 0.9, 2.5]].forEach(([rr, hh, y], i) =>
          q.add(CN(r * rr, r * hh, 7), snowy && i % 2 ? SNOW : i % 2 ? greens[3] : g, [(i % 2 ? 1 : -1) * r * 0.04, r * (y + 0.3), 0], [0, i, 0]));
        if (snowy) q.add(CN(r * 0.2, r * 0.5, 7), SNOW, [0, r * 3.35, 0]);
      } else if (o.tree) { // лиственное
        q.add(C(r * 0.13, r * 0.2, r * 1.5, 6), '#6a4a2c', [0, r * 0.75, 0]).add(C(r * 0.07, r * 0.1, r * 0.8, 5), '#6a4a2c', [r * 0.3, r * 1.3, 0], [0, 0, -0.8]);
        [[0, 2.0, 0, 0.95], [0.6, 1.7, 0.2, 0.7], [-0.55, 1.75, -0.3, 0.72], [0.1, 1.6, 0.65, 0.62], [-0.1, 2.5, -0.1, 0.6]].forEach(([x, y, z, s], i) =>
          q.add(ICO(r * s, 1), greens[(i + Math.floor(k * 9)) % 4], [r * x, r * y, r * z], [i, i * 2, 0]));
      } else { // скалы
        const c1 = rock ? rock[0] : k < 0.5 ? '#8d8f8a' : '#7c7e80', c2 = rock ? rock[1] : k < 0.5 ? '#77797a' : '#6a6c6e';
        q.add(DOD(r * 0.95), c1, [0, r * 0.3, 0], [k * 3, 0, k * 5], [1, 0.72, 1]).add(DOD(r * 0.5), c2, [r * 0.75, r * 0.15, r * 0.35], [k, 1, 0], [1, 0.7, 1])
          .add(DOD(r * 0.38), c2, [-r * 0.7, r * 0.1, -r * 0.5], [2, k, 0]).add(DOD(r * 0.45), c1, [-r * 0.15, r * 0.75, r * 0.1], [1, 2, k], [1, 0.8, 1])
          .add(S(r * 0.5, 7, 4), rock ? rock[2] : '#5d8a45', [r * 0.1, r * 0.72, -r * 0.1], Z3, [1, 0.35, 1]);
      }
    });
  }
  return p.build();
}

// Мелкий декор: трава, цветы, камешки, кусты — не мешает движению
export function makeDecor(w, h, avoid, map = {}) {
  const p = new Part('decor'), rnd = (a, b) => a + Math.random() * (b - a);
  const free = (x, y, d) => !avoid.some(a => Math.hypot(a.x - x, a.y - y) < a.r + d);
  const dc = map.decor || {}, tuft = dc.tuft || ['#4f8f3a', '#6aa84e', '#447f33'], flowers = dc.flower === null ? null : dc.flower || ['#f4e36a', '#f1f1f1', '#e88ad0', '#ff9d5c'];
  const stone = dc.stone || ['#8d8f8a', '#77797a'], bush = dc.bush || ['#3f7d33', '#4f8f3a'];
  for (let i = 0, n = Math.round(1500 * w * h / (3400 * 3400)); i < n; i++) {
    const x = rnd(10, w - 10), y = rnd(10, h - 10), t = Math.random();
    if (!free(x, y, 6)) continue;
    if (t < 0.62) { const s = rnd(0.7, 1.5); for (let j = 0; j < 3; j++) p.add(CN(1.3 * s, 6 * s, 3), tuft[(i + j) % 3], [x + (j - 1) * 2 * s, 3 * s, y + (j % 2) * 1.5], [(j - 1) * 0.25, j, (j - 1) * 0.2]); }
    else if (t < 0.8 && flowers) { p.add(C(0.2, 0.2, 4, 3), tuft[2], [x, 2, y]).add(OCT(1.3), flowers[i % 4], [x, 4.6, y]); }
    else if (t < 0.93) p.add(DOD(rnd(1.5, 4)), stone[i % 2], [x, 0.8, y], [i, i * 2, 0], [1, 0.6, 1]);
    else if (free(x, y, 16)) { const s = rnd(5, 9); p.add(ICO(s, 0), bush[0], [x, s * 0.5, y], [i, 0, 0], [1, 0.7, 1]).add(ICO(s * 0.7, 0), bush[1], [x + s * 0.7, s * 0.4, y + s * 0.3], [0, i, 0], [1, 0.7, 1]); }
  }
  const g = p.build();
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  return g;
}

// ================= Снаряды =================
const PROJ = {
  arrow: p => p.add(C(0.25, 0.25, 12, 4), '#8a6a44', Z3, LAYX).add(CN(0.7, 2.4, 4), STEEL, [7, 0, 0], LAYX).add(B(2.6, 1.6, 0.2), '#f4f1e6', [-5, 0, 0]).add(B(2.6, 0.2, 1.6), '#f4f1e6', [-5, 0, 0]),
  bolt: p => p.add(C(0.5, 0.5, 20, 5), '#d8dde4', Z3, LAYX).add(CN(1.3, 4, 5), STEEL, [12, 0, 0], LAYX).add(B(4, 2.6, 0.3), '#f4f1e6', [-8.5, 0, 0]).add(B(4, 0.3, 2.6), '#f4f1e6', [-8.5, 0, 0]),
  axe: p => p.at([-4, 0, 0], Z3, q => axe(q, 9)),
  fire: p => p.glow(ICO(5), FIRE).glow(ICO(3.2), FIRE2).glow(CN(3.4, 9, 5), FIRE, [-6, 0, 0], [0, 0, PI / 2]),
  spark: p => p.glow(OCT(3), '#fff2a0').glow(OCT(1.6), '#ffffff'),
  tracer: p => p.glow(B(30, 1, 1), '#fff2a0').glow(B(10, 1.4, 1.4), '#ffffff', [10, 0, 0]),
  shell: p => p.add(C(3, 3, 7, 7), '#2b2b2b', Z3, LAYX).add(CN(3, 5, 7), '#4a4f57', [6, 0, 0], LAYX).glow(CN(2.2, 6, 5), FIRE, [-6.5, 0, 0], [0, 0, PI / 2]),
  bullet: p => p.glow(B(6, 1.2, 1.2), '#ffe9a8'),
  arcane: p => p.glow(ICO(4), '#8fd0ff').glow(ICO(2.4), '#ffffff'),
  meteor: p => p.add(DOD(9), '#4a342a').glow(ICO(6.5), FIRE, [2.5, 4, 0]).glow(CN(7, 26, 6), FIRE, [5, 17, 0], [0, 0, -0.28]).glow(CN(4, 18, 5), FIRE2, [4, 14, 0], [0, 0, -0.28]),
};
const projTpl = {};
export function makeProj(kind) {
  const k = PROJ[kind] ? kind : 'bullet';
  if (!projTpl[k]) { const p = new Part('proj'); PROJ[k](p); projTpl[k] = p.build(); }
  return projTpl[k].clone(true);
}

export { Part, ICO, CN, C, DOD, LIT, FLASH };
