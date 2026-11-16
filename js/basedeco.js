// Оформление баз: у каждой фракции свой замысел.
//   Легион — мощёные дорожки на земляном дворе; Орда — рваное становище с костяной дорогой и тотемами;
//   Чародеи — лунный сад со спиралью из камней и парящими кристаллами; Механисты — бетонная площадка с забором и вышками.
// Это только картинка и модели: в расчёт игры (G.props, препятствия, постройка) ничего не попадает — воины проходят сквозь,
// ставить здания можно как обычно, а мышь по этим моделям не кликает.
import * as THREE from '../lib/three.module.js';
import { Part } from './models.js';

const S = 512, c = 256, T = Math.PI * 2, R0 = 250, PLANE = 660, PI2 = Math.PI / 2;
// Одинаковый «случайный» вид у всех игроков: генератор засеивается фракцией и местом базы
let st = 1;
const rng = () => { st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seed = n => { st = (n * 2654435761) | 0 || 1; };
const rnd = (a, b) => a + rng() * (b - a), pick = a => a[Math.floor(rng() * a.length)];
const hs = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hs(xi, yi), b = hs(xi + 1, yi), c2 = hs(xi, yi + 1), d = hs(xi + 1, yi + 1); return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v; };
const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 2.1 + 5, y * 2.1 + 9) * 0.3 + vn(x * 4.3 + 17, y * 4.3 + 3) * 0.2;
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const GREENS = ['#4a6b36', '#58793f', '#3f5c30', '#667f45'], BONE = '#e6dfc9', WOODD = '#4b3322';

// ---------- кисти для рисования на холсте ----------
function canvas() { const cv = document.createElement('canvas'); cv.width = cv.height = S; return [cv, cv.getContext('2d')]; }
function disc(g, col, r = R0, x = c, y = c) { g.beginPath(); g.arc(x, y, r, 0, T); g.fillStyle = col; g.fill(); }
function speck(g, n, cols, rmin, rmax, Rm = R0 - 4, al = 1) {
  for (let i = 0; i < n; i++) { const a = rnd(0, T), d = Math.sqrt(rng()) * Rm, r = rnd(rmin, rmax); g.globalAlpha = al * rnd(0.4, 1); g.fillStyle = pick(cols); g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, T); g.fill(); }
  g.globalAlpha = 1;
}
function dots(g, n, cols, rmin, rmax, d0, d1, al = 1, cx = c, cy = c) {
  for (let i = 0; i < n; i++) { const a = rnd(0, T), d = rnd(d0, d1); g.globalAlpha = al * rnd(0.5, 1); g.fillStyle = pick(cols); g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rnd(rmin, rmax), 0, T); g.fill(); }
  g.globalAlpha = 1;
}
function strokes(g, n, col, l0, l1, d0, d1, lw = 1.6) {
  g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
  for (let i = 0; i < n; i++) { const a = rnd(0, T), d = rnd(d0, d1), x = c + Math.cos(a) * d, y = c + Math.sin(a) * d, r = rnd(0, T), l = rnd(l0, l1); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(r) * l, y + Math.sin(r) * l); g.stroke(); }
}
function tufts(g, n, rmin, rmax, cols = GREENS) {
  g.lineCap = 'round'; g.lineWidth = 1.7;
  for (let i = 0; i < n; i++) { const a = rnd(0, T), d = rnd(rmin, rmax), x = c + Math.cos(a) * d, y = c + Math.sin(a) * d; g.strokeStyle = pick(cols);
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + k * 2 - 3, y); g.lineTo(x + k * 3 - 4.5 + rnd(-2, 2), y - rnd(5, 11)); g.stroke(); } }
}
function pebble(g, x, y, rx, ry, rot, fill, stroke) {
  g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, T); g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.3; g.stroke(); } g.restore();
}
function slab(g, x, y, w, h, rot, fill, jit = 2.2, line = 'rgba(38,32,24,.6)') {
  const j = () => rnd(-jit, jit); g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath(); g.moveTo(-w / 2 + j(), -h / 2 + j()); g.lineTo(j(), -h / 2 + j()); g.lineTo(w / 2 + j(), -h / 2 + j()); g.lineTo(w / 2 + j(), h / 2 + j()); g.lineTo(j(), h / 2 + j()); g.lineTo(-w / 2 + j(), h / 2 + j()); g.closePath();
  g.fillStyle = fill; g.fill(); g.strokeStyle = line; g.lineWidth = 1.6; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-w / 2 + 3, -h / 2 + 2.5); g.lineTo(w / 2 - 3, -h / 2 + 2.5); g.stroke(); g.restore();
}
// рваный мягкий край: inner..outer — где начинается и кончается прозрачность, rag — неровность
function edge(g, inner, outer, rag) {
  const img = g.getImageData(0, 0, S, S), d = img.data, off = rnd(0, 50);
  for (let by = 0; by < S; by += 2) for (let bx = 0; bx < S; bx += 2) {
    const r = Math.hypot(bx + 1 - c, by + 1 - c) / R0, n = fbm(bx / 40 + off, by / 40 + off * 0.7), a = Math.min(1 - sm(inner, outer, r + (n - 0.5) * rag), 1 - sm(0.88, 0.99, r)); // второе слагаемое — чтобы у границы круга не оставалось прямого среза
    for (let k = 0; k < 4; k++) d[((by + (k >> 1)) * S + bx + (k & 1)) * 4 + 3] *= a;
  }
  g.putImageData(img, 0, 0);
}

// ---------- Легион: земляной двор и мощёные дорожки (кольцо вокруг цитадели и лучи к краям) ----------
function drawLegion() {
  const [cv, g] = canvas(); disc(g, '#a09478'); speck(g, 2200, ['#948870', '#aa9f84', '#887c64'], 2, 7);
  const tone = () => pick(['#bab3a1', '#aaa391', '#c2bcab', '#9f9887']);
  for (const rr of [104, 120, 136]) { const n = Math.floor(T * rr / 19); for (let i = 0; i < n; i++) { const a = i / n * T; slab(g, c + Math.cos(a) * rr, c + Math.sin(a) * rr, rnd(15, 19), 13, a + PI2, tone()); } }
  for (let k = 0; k < 4; k++) { const a = k * PI2; for (let d = 150; d < 236; d += 17) for (const o of [-11, 0, 11]) {
    const x = c + Math.cos(a) * d - Math.sin(a) * o, y = c + Math.sin(a) * d + Math.cos(a) * o; slab(g, x + rnd(-1.5, 1.5), y + rnd(-1.5, 1.5), 16, 11, a + rnd(-0.08, 0.08), tone()); } }
  speck(g, 220, GREENS, 1.5, 4, 240, 0.8); tufts(g, 110, 60, 246); edge(g, 0.66, 0.97, 0.4); return cv;
}

// ---------- Орда: становище. Рваное пятно, костяная дорога, арена-яма, кострища; арка из рёбер, пара тотемов, редкие колья ----------
function drawHorde() {
  const [cv, g] = canvas(); disc(g, '#46372b'); speck(g, 2600, ['#3a2d24', '#53433a', '#5d4b3d', '#2e231d'], 2, 9);
  dots(g, 14, ['#2a201a'], 12, 34, 30, 225, 0.4); dots(g, 4, ['#4a1f1a'], 10, 24, 60, 220, 0.35);
  const road = x => Math.sin(x / 38) * 15;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); for (let x = 252; x > 36; x -= 6) { x === 252 ? g.moveTo(c + x, c + road(x)) : g.lineTo(c + x, c + road(x)); } g.strokeStyle = '#5f4a38'; g.lineWidth = 42; g.stroke(); g.strokeStyle = '#7a6148'; g.lineWidth = 30; g.stroke();
  for (let i = 0; i < 70; i++) { const x = rnd(40, 250), y = road(x) + rnd(-15, 15), r = rnd(0, T), l = rnd(5, 10); g.strokeStyle = BONE; g.lineWidth = rnd(1.5, 2.6); g.beginPath(); g.moveTo(c + x, c + y); g.lineTo(c + x + Math.cos(r) * l, c + y + Math.sin(r) * l); g.stroke(); }
  for (let x = 230; x > 70; x -= 56) for (const s of [-1, 1]) { const y = road(x) + s * 25; pebble(g, c + x, c + y, 4.5, 4.2, 0, BONE, 'rgba(20,12,8,.6)'); g.fillStyle = '#1c1c22'; g.fillRect(c + x - 2.5, c + y - 1.5, 1.8, 2.4); g.fillRect(c + x + 0.8, c + y - 1.5, 1.8, 2.4); }
  const ax = c + 140, ay = c - 105; // арена-яма
  disc(g, '#8a7152', 54, ax, ay); disc(g, '#9a8160', 44, ax, ay);
  for (let i = 0; i < 28; i++) { const a = i / 28 * T; g.strokeStyle = BONE; g.lineWidth = 2.6; g.beginPath(); g.moveTo(ax + Math.cos(a) * 49, ay + Math.sin(a) * 49); g.lineTo(ax + Math.cos(a + 0.12) * 56, ay + Math.sin(a + 0.12) * 56); g.stroke(); }
  for (const [a, d] of [[2.45, 175], [3.14, 215], [3.85, 175]]) { const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d; disc(g, 'rgba(22,16,12,.85)', 28, x, y); disc(g, '#120d0a', 16, x, y); dots(g, 12, ['#e2742a', '#f0a040'], 1.2, 2.2, 0, 11, 0.8, x, y); }
  strokes(g, 20, '#e0d9c0', 5, 11, 60, 240, 2); dots(g, 16, ['#e2742a'], 1, 2, 40, 240, 0.6);
  edge(g, 0.5, 0.97, 0.8); return cv;
}
const flame = (p, x, y, z, k = 1) => p.glow(new THREE.ConeGeometry(5 * k, 14 * k, 6), '#ff8a1e', [x, y + 7 * k, z]).glow(new THREE.ConeGeometry(3 * k, 9 * k, 5), '#ffd24a', [x + k, y + 5 * k, z + 0.6 * k]);
const skull = (p, x, y, z, s = 1) => p.add(new THREE.SphereGeometry(4.6 * s, 7, 6), BONE, [x, y, z], [0, 0, 0], [1, 1.1, 0.95])
  .add(new THREE.BoxGeometry(1, 1.6 * s, 1.7 * s), '#1c1c22', [x + 4 * s, y + 0.5 * s, z + 1.8 * s]).add(new THREE.BoxGeometry(1, 1.6 * s, 1.7 * s), '#1c1c22', [x + 4 * s, y + 0.5 * s, z - 1.8 * s])
  .add(new THREE.ConeGeometry(1.2 * s, 6 * s, 5), '#ece5cf', [x, y + 3 * s, z + 5.2 * s], [0.9, 0, 0]).add(new THREE.ConeGeometry(1.2 * s, 6 * s, 5), '#ece5cf', [x, y + 3 * s, z - 5.2 * s], [-0.9, 0, 0]);
function buildHorde(grp) {
  const p = new Part('model'), cyl = (a, b, h, n = 5) => new THREE.CylinderGeometry(a, b, h, n);
  p.add(new THREE.TorusGeometry(46, 4.4, 6, 18, Math.PI), BONE, [258, 0, 0], [0, PI2, 0]); skull(p, 258, 49, 0, 1.6);
  for (const s of [-1, 1]) { p.add(new THREE.ConeGeometry(4.6, 14, 5), BONE, [258, 6, s * 46]).add(cyl(2.4, 3, 32), WOODD, [250, 16, s * 66]); flame(p, 250, 32, s * 66, 0.8); }
  for (const [b, d, h] of [[2.7, 292, 50], [3.6, 292, 46]]) { // два тотема сзади
    const x = Math.cos(b) * d, z = Math.sin(b) * d; p.add(cyl(3, 3.9, h, 6), WOODD, [x, h / 2, z]); for (let k = 0; k < 3; k++) skull(p, x + 2, h * (0.4 + k * 0.2), z, 0.9);
    p.add(new THREE.BoxGeometry(0.7, 18, 12), '#9a2a22', [x - 1, h - 6, z + 8]).add(new THREE.ConeGeometry(2.8, 8, 5), BONE, [x, h + 3, z]);
  }
  { const x = Math.cos(Math.PI) * 235, z = 0; p.add(cyl(7, 5, 6, 8), '#2b2622', [x, 3, z]); flame(p, x, 5, z, 1.1); } // одно кострище с огнём
  for (const mid of [2.45, 3.14, 3.83]) for (let i = 0; i < 9; i++) { // три невысокие кучки кольев по заднему краю
    const b = mid + rnd(-0.22, 0.22), d = 300 + rnd(-8, 12), x = Math.cos(b) * d, z = Math.sin(b) * d, h = rnd(12, 24), col = pick(['#5e4028', '#4b3322', '#6a4a2e']);
    p.add(cyl(2.2, 2.8, h), col, [x, h / 2, z], [Math.sin(b) * 0.2, rnd(0, 3), -Math.cos(b) * 0.2]).add(new THREE.ConeGeometry(2.3, 7, 5), col, [x + Math.cos(b) * 1.5, h + 3, z + Math.sin(b) * 1.5]);
  }
  grp.add(p.build());
}

// ---------- Чародеи: лунный сад. Светлые линии силы, пруды, спираль камней-ступеней; парящие кристаллы, пара обелисков, кольцо-портал ----------
function drawArcane() {
  const [cv, g] = canvas(); disc(g, '#2d2a4e'); speck(g, 3300, ['#34305a', '#25213f', '#3b3763', '#2d3d54'], 2, 9);
  dots(g, 40, ['#2f4f58', '#38636a', '#2a474e'], 8, 26, 30, 235, 0.45); dots(g, 60, ['#6fe8d8', '#b48cff', '#9ad6ff'], 1, 2.2, 30, 242, 0.7);
  g.lineCap = 'round';
  for (let k = 0; k < 3; k++) { const a = k / 3 * T + 0.5; g.beginPath(); g.moveTo(c + rnd(-30, 30), c + rnd(-30, 30)); g.bezierCurveTo(c + Math.cos(a + 0.9) * 110, c + Math.sin(a + 0.9) * 110, c + Math.cos(a - 0.7) * 170, c + Math.sin(a - 0.7) * 170, c + Math.cos(a) * 245, c + Math.sin(a) * 245);
    g.strokeStyle = 'rgba(150,120,255,.32)'; g.lineWidth = 3.5; g.shadowColor = '#9d7bff'; g.shadowBlur = 8; g.stroke(); g.shadowBlur = 0; g.strokeStyle = 'rgba(225,212,255,.55)'; g.lineWidth = 1; g.stroke(); }
  for (const [x, y, rx, ry, rot] of [[-120, 95, 44, 27, 0.3], [120, 140, 34, 21, 0.8]]) { g.save(); g.translate(c + x, c + y); g.rotate(rot); g.beginPath(); g.ellipse(0, 0, rx + 5, ry + 5, 0, 0, T); g.fillStyle = 'rgba(160,190,230,.3)'; g.fill(); g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, T); g.fillStyle = '#16385a'; g.fill();
    g.fillStyle = '#245a86'; g.beginPath(); g.ellipse(-rx * 0.2, -ry * 0.2, rx * 0.6, ry * 0.5, 0, 0, T); g.fill(); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(rnd(-rx * 0.7, rx * 0.7), rnd(-ry * 0.6, ry * 0.6), 1.8, 1.8); } g.restore(); }
  const n = 24; for (let i = 0; i <= n; i++) { const s = i / n, r = 240 - 178 * s, a = 5.4 * s, x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
    pebble(g, x, y, rnd(8, 10.5), rnd(6.5, 8.5), rnd(0, T), pick(['#d8d2eb', '#c7c1de', '#e3def2']), 'rgba(28,22,60,.75)'); }
  edge(g, 0.56, 0.97, 0.65); return cv;
}
function buildArcane(grp) {
  const p = new Part('model'), oct = r => new THREE.OctahedronGeometry(r, 0), box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  p.add(new THREE.TorusGeometry(40, 3.4, 6, 20), '#d9d3ec', [256, 42, 0], [0, PI2, 0]).glow(new THREE.TorusGeometry(35, 0.9, 5, 20), '#9d7bff', [256, 42, 0], [0, PI2, 0]).add(box(10, 6, 14), '#cfc9e0', [256, 3, 40]).add(box(10, 6, 14), '#cfc9e0', [256, 3, -40]);
  for (let i = 0; i < 6; i++) { const b = 0.9 + i / 5 * (T - 1.8), d = rnd(270, 300), x = Math.cos(b) * d, z = Math.sin(b) * d, y = rnd(36, 78), s = rnd(3.6, 5.2); // парящие кристаллы — только по бокам и сзади
    p.glow(oct(s), pick(['#b48cff', '#8fd0ff', '#d4c0ff']), [x, y, z], [rnd(-0.3, 0.3), rnd(0, 3), rnd(-0.3, 0.3)], [1, 2.3, 1]).glow(oct(s * 0.4), '#ffffff', [x, y, z], [0, 0, 0], [1, 2.3, 1]); }
  for (const b of [2.6, 3.7]) { const d = 292, x = Math.cos(b) * d, z = Math.sin(b) * d; p.add(new THREE.CylinderGeometry(3.2, 6, 5, 6), '#cfc9e0', [x, 2.5, z]).add(new THREE.CylinderGeometry(2.2, 4.2, 42, 4), '#bdb6d3', [x, 25, z], [0, Math.PI / 4, 0]).add(new THREE.ConeGeometry(3, 8, 4), '#e2ddf0', [x, 50, z], [0, Math.PI / 4, 0])
    .glow(box(1.2, 7, 0.6), '#b48cff', [x + 3.4, 22, z]).glow(box(1.2, 5, 0.6), '#b48cff', [x + 3, 33, z]); }
  for (const [x, z] of [[-80, 150], [150, 120]]) for (let k = 0; k < 3; k++) p.glow(oct(rnd(2.2, 3.6)), pick(['#b48cff', '#8fd0ff']), [x + rnd(-8, 8), rnd(4, 8), z + rnd(-8, 8)], [rnd(-0.4, 0.4), rnd(0, 3), rnd(-0.4, 0.4)], [1, 1.9, 1]);
  grp.add(p.build());
}

// ---------- Механисты: бетонная площадка. Квадрат со срезанными углами, разметка, кабель-каналы; забор с воротами, вышки, контейнеры ----------
function drawMech() {
  const [cv, g] = canvas(), H = 200, ch = 26, pad = () => { g.beginPath(); g.moveTo(c - H + ch, c - H); g.lineTo(c + H - ch, c - H); g.lineTo(c + H, c - H + ch); g.lineTo(c + H, c + H - ch); g.lineTo(c + H - ch, c + H); g.lineTo(c - H + ch, c + H); g.lineTo(c - H, c + H - ch); g.lineTo(c - H, c - H + ch); g.closePath(); };
  pad(); g.fillStyle = '#7a7d83'; g.fill(); g.save(); pad(); g.clip();
  speck(g, 4200, ['#70737a', '#84878d', '#66696f', '#8e9197'], 1, 3.6, 300);
  g.strokeStyle = 'rgba(24,26,30,.55)'; g.lineWidth = 2; for (let i = -200; i <= 200; i += 50) { g.beginPath(); g.moveTo(c + i, c - H); g.lineTo(c + i, c + H); g.moveTo(c - H, c + i); g.lineTo(c + H, c + i); g.stroke(); }
  g.strokeStyle = 'rgba(235,235,235,.72)'; g.lineWidth = 3; for (const yy of [-135, -68, 0, 68, 135]) g.strokeRect(c - H + 12, c + yy - 30, 78, 60);
  g.fillStyle = 'rgba(235,235,235,.8)'; g.beginPath(); g.moveTo(c + 135, c - 14); g.lineTo(c + 100, c - 14); g.lineTo(c + 100, c - 30); g.lineTo(c + 62, c); g.lineTo(c + 100, c + 30); g.lineTo(c + 100, c + 14); g.lineTo(c + 135, c + 14); g.closePath(); g.fill();
  for (const pts of [[[-H, -110], [-60, -110], [-60, -40]], [[-H, 120], [-30, 120], [-30, 50]]]) { g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(c + q[0], c + q[1]) : g.moveTo(c + q[0], c + q[1])); g.strokeStyle = '#2b2e33'; g.lineWidth = 12; g.lineJoin = 'round'; g.stroke(); g.setLineDash([10, 10]); g.strokeStyle = '#d9ac20'; g.lineWidth = 2; g.stroke(); g.setLineDash([]); }
  for (const [x, y] of [[90, 90], [-100, -60], [110, -120]]) { disc(g, '#2a2d31', 14, c + x, c + y); disc(g, '#3a3e44', 10, c + x, c + y); g.strokeStyle = '#1a1c1f'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(c + x - 8, c + y); g.lineTo(c + x + 8, c + y); g.moveTo(c + x, c + y - 8); g.lineTo(c + x, c + y + 8); g.stroke(); }
  dots(g, 12, ['#1b1d21'], 8, 22, 30, 190, 0.35); strokes(g, 8, 'rgba(10,10,12,.7)', 25, 60, 20, 180, 1.6);
  g.restore(); g.save(); pad(); g.clip(); g.beginPath(); g.rect(c - H, c - H, 2 * H, 2 * H); g.rect(c - H + 13, c - H + 13, 2 * H - 26, 2 * H - 26); g.clip('evenodd'); // кайма из косых полос
  for (let i = -520; i < 520; i += 28) { g.fillStyle = (i / 28) % 2 ? '#1c1d20' : '#e6b020'; g.beginPath(); g.moveTo(c + i, c - 260); g.lineTo(c + i + 14, c - 260); g.lineTo(c + i + 14 + 520, c + 260); g.lineTo(c + i + 520, c + 260); g.closePath(); g.fill(); }
  g.restore(); g.fillStyle = '#7a7d83'; g.fillRect(c + H - 16, c - 48, 20, 96); g.strokeStyle = 'rgba(24,26,30,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(c + H - 16, c - 48); g.lineTo(c + H - 16, c + 48); g.stroke(); // проём для въезда
  speck(g, 60, ['#5b6b3a', '#6a7a45'], 1.5, 3.5, 300, 0.8);
  return cv;
}
function buildMech(grp) {
  const p = new Part('model'), H = 262, cyl = (a, b, h, n = 6) => new THREE.CylinderGeometry(a, b, h, n), box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const tower = (x, z) => p.add(cyl(2.2, 3.4, 64), '#3a3f46', [x, 32, z]).add(box(7, 4, 7), '#2b2f36', [x, 1, z]).add(box(24, 3.4, 9), '#2b2f36', [x, 66, z])
    .glow(box(7, 2.4, 2.4), '#eaf6ff', [x - 7, 63.6, z + 5.2]).glow(box(7, 2.4, 2.4), '#eaf6ff', [x, 63.6, z + 5.2]).glow(box(7, 2.4, 2.4), '#eaf6ff', [x + 7, 63.6, z + 5.2]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tower(sx * H, sz * H);
  const post = (x, z) => p.add(cyl(1.2, 1.5, 18, 5), '#4b5159', [x, 9, z]);
  const rail = (x0, z0, x1, z1) => { const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, l = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0); for (const y of [17, 9]) p.add(box(l, 0.9, 0.8), '#6d747d', [mx, y, mz], [0, ry, 0]); };
  const side = (x0, z0, x1, z1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 36)); for (let i = 0; i <= n; i++) post(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n); rail(x0, z0, x1, z1); };
  side(-H, -H, -H, H); side(-H, -H, H, -H); side(-H, H, H, H); side(H, -H, H, -50); side(H, 50, H, H);
  for (const s of [-1, 1]) p.add(cyl(2, 2.4, 30), '#e6b020', [H, 15, s * 50]).add(box(5, 3, 5), '#2b2f36', [H, 31, s * 50]);
  p.add(box(3, 2.6, 46), '#e6b020', [H, 24, 20]).add(box(3.2, 2.7, 6), '#23262b', [H, 24, 40]).add(box(3.2, 2.7, 6), '#23262b', [H, 24, 2]);
  for (const [x, y, z, col] of [[-205, 0, -190, '#d6a21f'], [-205, 14, -190, '#59616b'], [-205, 0, -165, '#8a4b2c'], [-150, 0, -200, '#3b5f86'], [-210, 0, 175, '#59616b'], [-210, 14, 175, '#d6a21f'], [-160, 0, 205, '#8a4b2c']])
    p.add(box(46, 14, 18), col, [x, y + 7, z], [0, y ? 0.04 : 0, 0]).add(box(47, 1.2, 19), '#2a2d31', [x, y + 14.2, z]);
  p.add(cyl(3.6, 3.6, 170, 8), '#7d848d', [-60, 4, 232], [0, 0, PI2]); for (const x of [-130, -60, 10]) p.add(box(4, 6, 10), '#3a3f46', [x, 2, 232]); p.add(cyl(3.6, 3.6, 28, 8), '#7d848d', [24, 15, 232]);
  p.add(cyl(0.8, 1.2, 96, 4), '#8b929b', [-H - 14, 48, H + 10]).glow(new THREE.SphereGeometry(2, 6, 5), '#ff4030', [-H - 14, 97, H + 10]);
  // сетка забора — тонкая полупрозрачная плоскость (отдельным материалом), чтобы сквозь неё было видно
  const wire = new THREE.MeshBasicMaterial({ color: '#9aa3ad', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const panel = (x0, z0, x1, z1) => { const l = Math.hypot(x1 - x0, z1 - z0), m = new THREE.Mesh(new THREE.PlaneGeometry(l, 10), wire); m.position.set((x0 + x1) / 2, 13, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); grp.add(m); };
  panel(-H, -H, -H, H); panel(-H, -H, H, -H); panel(-H, H, H, H); panel(H, -H, H, -50); panel(H, 50, H, H);
  grp.add(p.build());
}

const DEFS = { legion: { draw: drawLegion }, horde: { draw: drawHorde, build: buildHorde }, arcane: { draw: drawArcane, build: buildArcane }, mech: { draw: drawMech, build: buildMech } };
const FSEED = { legion: 11, horde: 23, arcane: 37, mech: 51 }, texCache = {}, matCache = {};

// bases — [{ x, y, fac }]. Направление «вперёд» — к центру карты; всё рисуется в системе, где вперёд = +x.
export function makeBaseDeco(bases) {
  const root = new THREE.Group();
  for (const b of bases) {
    const def = DEFS[b.fac]; if (!def) continue;
    if (!texCache[b.fac]) { seed(FSEED[b.fac]); const t = new THREE.CanvasTexture(def.draw()); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache[b.fac] = t; }
    const mat = matCache[b.fac] || (matCache[b.fac] = new THREE.MeshLambertMaterial({ map: texCache[b.fac], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    const a = Math.atan2(WORLD.h / 2 - b.y, WORLD.w / 2 - b.x), grp = new THREE.Group();
    grp.position.set(b.x, 0, b.y); grp.rotation.y = -a;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.rotation.x = -Math.PI / 2; m.position.y = 0.25; m.scale.setScalar(PLANE); m.receiveShadow = true; grp.add(m);
    if (def.build) { seed(FSEED[b.fac] * 7 + Math.round(b.x + b.y)); def.build(grp); }
    root.add(grp);
  }
  return root;
}
