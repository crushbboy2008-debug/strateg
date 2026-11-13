// ---------- Отрисовка эффектов: частицы, взрывы, молнии, взмахи, воронки, вспышки света ----------
// Сами эффекты порождает симуляция (G.parts, G.fx), здесь они только рисуются.
import * as THREE from '../lib/three.module.js';

const PI = Math.PI, MAX = 1500;

const VERT = `
attribute float size; attribute vec4 pcolor; uniform float uScale; varying vec4 vC;
void main() { vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const FRAG = `
varying vec4 vC;
void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.3, r); if (a <= 0.0) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); }`;

function makePoints(additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = additive ? 6 : 5;
  return { pts, pos, col, size, geo, mat, n: 0 };
}

const rgbCache = {};
function rgb(hex) {
  let c = rgbCache[hex];
  if (!c) { const v = parseInt(hex.slice(1), 16); c = rgbCache[hex] = [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }
  return c;
}

const scorchTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  gr.addColorStop(0, 'rgba(20,16,12,.85)'); gr.addColorStop(0.55, 'rgba(35,28,20,.6)'); gr.addColorStop(1, 'rgba(35,28,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) { const a = Math.random() * 7, r = 20 + Math.random() * 36; g.fillStyle = 'rgba(15,12,9,.35)'; g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 3 + Math.random() * 7, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const GEO = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  ring: new THREE.RingGeometry(0.9, 1, 48),
  shock: new THREE.RingGeometry(0.72, 1, 48),
  slash: new THREE.TorusGeometry(1, 0.1, 3, 12, 2.2),
  seg: new THREE.CylinderGeometry(1, 1, 1, 5),
  plane: new THREE.PlaneGeometry(1, 1),
};
const UP = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

export function createEffects(scene, renderer, camera) {
  const normal = makePoints(false), glow = makePoints(true);
  scene.add(normal.pts, glow.pts);
  const lights = [0, 1, 2].map(() => { const l = new THREE.PointLight('#ffa040', 0, 520, 1); scene.add(l); return l; });
  const fxMesh = new Map();
  let frame = 0;

  function tmat(color, additive) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  }
  function tube(g, mat, a, b, rad) {
    _d.subVectors(b, a); const len = _d.length();
    const m = new THREE.Mesh(GEO.seg, mat);
    m.position.copy(a).addScaledVector(_d, 0.5);
    m.quaternion.setFromUnitVectors(UP, _d.normalize());
    m.scale.set(rad, len, rad);
    g.add(m);
  }
  function build(f) {
    let m, mat;
    switch (f.type) {
      case 'boom': m = new THREE.Mesh(GEO.sphere, mat = tmat(f.color, true)); m.position.set(f.x, 8, f.y); break;
      case 'ring': case 'ping': m = new THREE.Mesh(GEO.ring, mat = tmat(f.color, false)); m.rotation.x = -PI / 2; m.position.set(f.x, 2, f.y); break;
      case 'shock': m = new THREE.Mesh(GEO.shock, mat = tmat(f.color, true)); m.rotation.x = -PI / 2; m.position.set(f.x, 2.5, f.y); break;
      case 'slash': {
        m = new THREE.Group(); mat = tmat('#ffffff', true);
        const arc = new THREE.Mesh(GEO.slash, mat); arc.rotation.x = -PI / 2; m.add(arc);
        m.position.set(f.x, f.h, f.y); m.rotation.set(0, -1.1 - f.ang, (Math.random() - 0.5) * 0.7, 'YXZ');
        break;
      }
      case 'bolt': case 'beam': {
        m = new THREE.Group(); mat = tmat(f.color, true);
        const core = tmat('#ffffff', true); m.userData.core = core;
        const n = f.type === 'bolt' ? 7 : 1, h1 = f.h1 || 16, h2 = f.h2 || 16, j = f.type === 'bolt' ? 13 : 0;
        _a.set(f.x1, h1, f.y1);
        for (let i = 1; i <= n; i++) {
          const k = i / n, jj = i < n ? j : 0;
          _b.set(f.x1 + (f.x2 - f.x1) * k + (Math.random() - 0.5) * 2 * jj, h1 + (h2 - h1) * k + (Math.random() - 0.5) * 2 * jj, f.y1 + (f.y2 - f.y1) * k + (Math.random() - 0.5) * 2 * jj);
          tube(m, mat, _a, _b, f.type === 'bolt' ? 2.2 : 1.8); tube(m, core, _a, _b, 0.8);
          _a.copy(_b);
        }
        break;
      }
      case 'scorch':
        mat = new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        m = new THREE.Mesh(GEO.plane, mat); m.rotation.set(-PI / 2, 0, Math.random() * 6); m.position.set(f.x, 0.5, f.y); m.scale.setScalar(f.r * 2.6);
        break;
      default: return null;
    }
    m.userData.mat = mat;
    return m;
  }
  function drop(m) { scene.remove(m); m.userData.mat.dispose(); if (m.userData.core) m.userData.core.dispose(); }

  return {
    sync() {
      frame++;
      // ---- частицы ----
      const scale = renderer.domElement.height / (2 * Math.tan(camera.fov * PI / 360));
      normal.n = glow.n = 0;
      for (const p of G.parts) {
        const b = p.add ? glow : normal;
        if (b.n >= MAX) continue;
        const i = b.n++, c = rgb(p.color), k = p.life / p.max;
        b.pos[i * 3] = p.x; b.pos[i * 3 + 1] = p.h + 1.5; b.pos[i * 3 + 2] = p.y;
        b.col[i * 4] = c[0]; b.col[i * 4 + 1] = c[1]; b.col[i * 4 + 2] = c[2];
        b.col[i * 4 + 3] = p.add ? Math.min(1, k * 1.5) : Math.min(1, k * 2.2) * (p.grow ? 0.36 : 1);
        b.size[i] = p.size * 2;
      }
      for (const b of [normal, glow]) {
        b.geo.setDrawRange(0, b.n); b.mat.uniforms.uScale.value = scale;
        b.geo.attributes.position.needsUpdate = b.geo.attributes.pcolor.needsUpdate = b.geo.attributes.size.needsUpdate = true;
      }
      // ---- меши эффектов и вспышки света ----
      let li = 0;
      for (const l of lights) l.intensity = 0;
      for (const f of G.fx) {
        const k = f.life / f.max;
        if (f.type === 'flash') {
          if (li < lights.length) { const l = lights[li++]; l.position.set(f.x, f.h + 20, f.y); l.color.set(f.color); l.intensity = 260 * f.power * k; }
          continue;
        }
        let m = fxMesh.get(f);
        if (m === undefined) { m = build(f); fxMesh.set(f, m); if (m) scene.add(m); }
        if (!m) continue;
        m.userData.seen = frame;
        const mat = m.userData.mat;
        switch (f.type) {
          case 'boom': mat.opacity = k * 0.8; m.scale.setScalar(f.r * (0.35 + 0.75 * (1 - k))); break;
          case 'ring': mat.opacity = k; m.scale.setScalar(f.r * (1 - k * 0.5)); break;
          case 'ping': mat.opacity = k; m.scale.setScalar(f.r * (0.3 + k * 0.7)); break;
          case 'shock': mat.opacity = k * 0.7; m.scale.setScalar(f.r * (0.15 + 0.85 * Math.pow(1 - k, 0.6))); break;
          case 'slash': mat.opacity = k; m.scale.setScalar(f.r * (0.85 + 0.3 * (1 - k))); break;
          case 'scorch': mat.opacity = Math.min(1, k * 4) * 0.5; break;
          default: mat.opacity = k; if (m.userData.core) m.userData.core.opacity = k;
        }
      }
      for (const [f, m] of fxMesh) if (!m || m.userData.seen !== frame) { if (m) drop(m); fxMesh.delete(f); }
    },
    clear() { for (const m of fxMesh.values()) if (m) drop(m); fxMesh.clear(); },
  };
}
