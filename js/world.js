// ---------- Мир: остров с пляжем и дорогами, море, небо, облака, дальние острова ----------
// Игровое поле остаётся плоским (логика не меняется), рельеф начинается за границей карты.
import * as THREE from '../lib/three.module.js';
import { Part, ICO, CN, C, DOD } from './models.js';

let W = WORLD.w, H = WORLD.h; // размер текущей карты, обновляется в buildTerrain
const PI = Math.PI;
const HORIZON = '#d3e6f3', ZENITH = '#4a8fd8', WATER_Y = -14;

// ---- шум ----
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { return vnoise(x, y) * 0.5 + vnoise(x * 2.1 + 5, y * 2.1 + 9) * 0.3 + vnoise(x * 4.3 + 17, y * 4.3 + 3) * 0.2; }
function sstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function segDist(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - a.x - dx * t, py - a.y - dy * t);
}

function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat, repeat);
  return t;
}

// ================= Небо, море, облака, острова (создаётся один раз) =================
export function createEnvironment(scene) {
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 2600, 8200);

  // купол неба с градиентом
  const R = 11000, dg = new THREE.SphereGeometry(R, 24, 14), pos = dg.attributes.position, col = [];
  const ch = new THREE.Color(HORIZON), cz = new THREE.Color(ZENITH), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(ch).lerp(cz, Math.pow(Math.max(0, pos.getY(i) / R), 0.55)); col.push(c.r, c.g, c.b); }
  dg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const dome = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -1;
  scene.add(dome);

  // море: полупрозрачная гладь с бегущей рябью, сквозь неё видно песчаное дно
  const waves = canvasTex(256, (g, s) => {
    g.fillStyle = '#e4f1f8'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * s, y = Math.random() * s, w = 20 + Math.random() * 50;
      g.strokeStyle = i % 3 ? 'rgba(255,255,255,.75)' : 'rgba(120,170,200,.45)'; g.lineWidth = 1.5 + Math.random() * 2;
      for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + w / 2, y + oy - 5, x + ox + w, y + oy); g.stroke(); }
    }
  }, 150);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: '#3d9bcb', map: waves, transparent: true, opacity: 0.8 }));
  water.rotation.x = -PI / 2; water.position.set(W / 2, WATER_Y, H / 2);
  scene.add(water);
  // морское дно за пределами рельефа, чтобы цвет воды не менялся на его границе
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: '#a69c76' }));
  bed.rotation.x = -PI / 2; bed.position.set(W / 2, -94, H / 2);
  scene.add(bed);

  // дальние острова по кругу
  const isl = new Part('islands');
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * PI * 2 + hash(i, 3) * 0.3, d = 3700 + hash(i, 7) * 1400, x = W / 2 + Math.cos(a) * d, z = H / 2 + Math.sin(a) * d;
    const r = 260 + hash(i, 11) * 300, h = 200 + hash(i, 13) * 520;
    isl.at([x, WATER_Y, z], [0, hash(i, 1) * 6, 0], p => {
      p.add(C(r * 1.15, r * 1.35, 30, 9), '#d9c88f', [0, 2, 0]).add(CN(r, h, 7), '#7f8a78', [0, h / 2, 0]).add(CN(r * 1.04, h * 0.45, 7), '#5f8f4a', [0, h * 0.225, 0])
        .add(CN(r * 0.55, h * 0.7, 6), '#8b9486', [r * 0.6, h * 0.35, r * 0.2]).add(CN(r * 0.6, h * 0.3, 6), '#5f8f4a', [r * 0.6, h * 0.15, r * 0.2])
        .add(DOD(r * 0.25), '#77797a', [-r * 1.1, 0, r * 0.5], [i, 1, 0]);
    });
  }
  const islands = isl.build();
  islands.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = false; });
  scene.add(islands);

  // облака далеко за картой, медленно кружат
  const cl = new Part('clouds');
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * PI * 2 + hash(i, 21) * 0.4, d = 5200 + hash(i, 23) * 3200, s = 220 + hash(i, 29) * 300;
    cl.at([Math.cos(a) * d, 900 + hash(i, 31) * 1500, Math.sin(a) * d], [0, a, 0], p => {
      for (let j = 0; j < 5; j++) p.add(ICO(s * (0.55 + hash(i, j) * 0.5), 1), j % 2 ? '#ffffff' : '#eef3f8', [(j - 2) * s * 0.7, hash(j, i) * s * 0.2, (hash(i + j, 5) - 0.5) * s * 0.6], [j, i, 0], [1.2, 0.45, 1]);
    });
  }
  const clouds = cl.build();
  clouds.position.set(W / 2, 0, H / 2);
  clouds.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = false; o.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }); } });
  scene.add(clouds);

  return {
    update(t, camera) {
      dome.position.set(camera.position.x, 0, camera.position.z);
      waves.offset.set(t * 0.012, t * 0.007);
      clouds.rotation.y = t * 0.004;
    },
  };
}

// ================= Рельеф карты (пересоздаётся на каждую игру) =================
const detail = canvasTex(512, (g, s) => {
  g.fillStyle = '#eeeeee'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 3200; i++) {
    const v = 205 + Math.floor(Math.random() * 50);
    g.fillStyle = `rgba(${v},${v},${v},.4)`;
    g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 7, 0, 7); g.fill();
  }
  for (let i = 0; i < 1500; i++) { g.fillStyle = 'rgba(120,120,120,.35)'; g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5); }
});
const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });

const PAL = { g1: [112, 172, 78], g2: [80, 140, 58], dry: [164, 172, 86], dirt: [146, 112, 74], road: [182, 148, 104], sand: [232, 214, 160] }, DEEP = [150, 140, 104];

// hqs — цитадели { x, y, ground } (ground — цвет земли базы фракции), map — описание карты из MAPS
export function buildTerrain(hqs, map) {
  W = WORLD.w; H = WORLD.h;
  const { g1: G1, g2: G2, dry: DRY, dirt: DIRT, road: ROAD, sand: SAND } = (map && map.pal) || PAL;
  const [ox, oy] = G.seed || [Math.random() * 100, Math.random() * 100], center = { x: W / 2, y: H / 2 };
  const segs = [];
  hqs.forEach((a, i) => {
    segs.push([a, center]);
    for (let j = i + 1; j < hqs.length; j++) if (Math.hypot(a.x - hqs[j].x, a.y - hqs[j].y) < W * 0.9) segs.push([a, hqs[j]]);
  });
  function roadDist(x, y) {
    const wx = x + (vnoise(y / 320 + ox, 3.3) - 0.5) * 150, wy = y + (vnoise(x / 320 + oy, 8.1) - 0.5) * 150;
    let d = Infinity;
    for (const s of segs) d = Math.min(d, segDist(wx, wy, s[0], s[1]));
    return d;
  }
  function outside(x, y) { return Math.hypot(Math.max(-x, x - W, 0), Math.max(-y, y - H, 0)); }
  function heightAt(x, y) {
    const d = outside(x, y);
    if (d <= 0) return 0;
    const dd = d + (fbm(x / 300 + ox + 9, y / 300 + oy) - 0.5) * 170 * sstep(0, 140, d);
    return -sstep(25, 470, dd) * 95;
  }
  function colorAt(x, y, h) {
    const n = fbm(x / 260 + ox, y / 260 + oy), n2 = fbm(x / 80 + 7 + ox, y / 80 + oy);
    let c = mix(G2, G1, sstep(0.3, 0.7, n));
    c = mix(c, DRY, sstep(0.55, 0.75, fbm(x / 430 + 31 + ox, y / 430 + oy)) * 0.65);
    const k = 0.92 + 0.16 * n2; c = [c[0] * k, c[1] * k, c[2] * k];
    for (const q of hqs) { const dq = Math.hypot(x - q.x, y - q.y) + (n2 - 0.5) * 90; if (dq < 400) { const gc = q.ground || DIRT; c = mix(c, [gc[0] * k, gc[1] * k, gc[2] * k], (1 - sstep(130, 380, dq)) * 0.88); } }
    if (segs.length) {
      const rd = roadDist(x, y) + (n2 - 0.5) * 22;
      c = mix(c, DIRT, (1 - sstep(26, 58, rd)) * 0.7);
      c = mix(c, ROAD, (1 - sstep(8, 30, rd)) * 0.9);
      c = mix(c, DIRT, (1 - sstep(60, 150, Math.hypot(x - center.x, y - center.y) + (n2 - 0.5) * 60)) * 0.75);
    }
    const e = Math.min(x, y, W - x, H - y);
    c = mix(c, SAND, e < 0 ? 1 : 1 - sstep(5, 85, e + (n2 - 0.5) * 60));
    if (h < WATER_Y) c = mix(c, DEEP, sstep(WATER_Y, -80, h) * 0.8);
    return c;
  }

  const M = 900, step = 20, nx = Math.round((W + 2 * M) / step), ny = Math.round((H + 2 * M) / step);
  const posA = new Float32Array((nx + 1) * (ny + 1) * 3), colA = new Float32Array(posA.length), uvA = new Float32Array((nx + 1) * (ny + 1) * 2), idx = [];
  const col = new THREE.Color();
  let p = 0, u = 0;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = -M + i * step, y = -M + j * step, h = heightAt(x, y), c = colorAt(x, y, h);
    col.setRGB(Math.min(1, c[0] / 255), Math.min(1, c[1] / 255), Math.min(1, c[2] / 255), THREE.SRGBColorSpace);
    posA[p] = x; posA[p + 1] = h; posA[p + 2] = y; colA[p] = col.r; colA[p + 1] = col.g; colA[p + 2] = col.b; p += 3;
    uvA[u++] = x / 190; uvA[u++] = y / 190;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c2 = a + nx + 1, d = c2 + 1;
    idx.push(a, c2, b, b, c2, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, terrainMat);
  mesh.receiveShadow = true;

  // подложка для миникарты
  const mini = document.createElement('canvas'); mini.width = mini.height = 95;
  const mg = mini.getContext('2d'), img = mg.createImageData(95, 95);
  for (let j = 0; j < 95; j++) for (let i = 0; i < 95; i++) {
    const c = colorAt((i + 0.5) / 95 * W, (j + 0.5) / 95 * H, 0), o = (j * 95 + i) * 4;
    img.data[o] = c[0] * 0.8; img.data[o + 1] = c[1] * 0.8; img.data[o + 2] = c[2] * 0.8; img.data[o + 3] = 255;
  }
  mg.putImageData(img, 0, 0);

  return { mesh, mini, roadDist, dispose() { geo.dispose(); } };
}

// Тёмное пятно утоптанной земли под зданием
const patchTex = canvasTex(128, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(105,80,52,.95)'); gr.addColorStop(0.6, 'rgba(120,92,60,.7)'); gr.addColorStop(1, 'rgba(120,92,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const patchMat = new THREE.MeshLambertMaterial({ map: patchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const patchGeo = new THREE.PlaneGeometry(1, 1);
export function groundPatch(r) {
  const m = new THREE.Mesh(patchGeo, patchMat);
  m.rotation.x = -PI / 2; m.position.y = 0.35; m.scale.setScalar(r * 3.4); m.receiveShadow = true;
  return m;
}
