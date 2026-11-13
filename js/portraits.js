// ---------- Портреты для интерфейса: рендер настоящих 3D-моделей в маленькие картинки ----------
import * as THREE from '../lib/three.module.js';
import { makeUnit, makeBuilding, animate } from './models.js';

const S = 192, cache = {};
let R = null, scene, cam;

function init() {
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1); R.setSize(S, S, false);
  R.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a7458', 2.0));
  const d = new THREE.DirectionalLight('#fff0d0', 3.2);
  d.position.set(3, 5, 4);
  scene.add(d);
  cam = new THREE.PerspectiveCamera(28, 1, 1, 6000);
}

// kind: 'unit' | 'bld'; возвращает data-URL картинки (кэшируется)
export function portrait(kind, type, facKey) {
  const key = kind + '|' + type + '|' + facKey;
  if (cache[key]) return cache[key];
  if (!R) init();
  const fac = FACTIONS[facKey];
  const m = kind === 'unit' ? makeUnit(type, facKey, fac, 80) : makeBuilding(type, facKey, fac);
  animate(m, { kind, moving: false, swing: 0, fire: 0, aim: -0.9, id: 1 }, 0, 0);
  scene.add(m); m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const rad = Math.max(sz.x, sz.y, sz.z) * 0.6;
  const dir = (kind === 'unit' ? new THREE.Vector3(1, 0.45, 0.9) : new THREE.Vector3(0.75, 0.6, 1)).normalize();
  cam.position.copy(c).addScaledVector(dir, rad / Math.tan(14 * Math.PI / 180));
  cam.lookAt(c);
  R.render(scene, cam);
  const url = R.domElement.toDataURL('image/png');
  scene.remove(m);
  return cache[key] = url;
}
