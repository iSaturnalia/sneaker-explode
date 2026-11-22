import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TARGET_LENGTH, makeExplode } from './common.js?v=9';

// Универсальная загрузка модели со Sketchfab: берём все меши, переводим в общие
// координаты, делим каждый меш на несвязанные «острова» и раскладываем их
// по слоям: шнуровка → верх → подкладка → подошва.
//
// cfg (у каждой модели свой, см. TUNING в main.js):
//   drop(name)    — отбросить меш по имени узла (коробка, вторая кроссовка)
//   keep(box)     — оставить остров по его габаритам (для моделей, где пара — один меш)
//   rotate        — [x, y, z] поворот, чтобы нос смотрел в +X, а подошва вниз
//   minPart       — доля треугольников, ниже которой остров приклеивается к соседу

function splitIslands(geo) {
  if (!geo.index) {
    const n = geo.attributes.position.count;
    geo.setIndex([...Array(n).keys()]);
  }
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  const q = Math.max(size.x, size.y, size.z) / 20000 || 1e-6;

  const keyOf = new Map();
  const canon = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) / q)},${Math.round(pos.getY(i) / q)},${Math.round(pos.getZ(i) / q)}`;
    let id = keyOf.get(k);
    if (id === undefined) { id = keyOf.size; keyOf.set(k, id); }
    canon[i] = id;
  }
  const parent = new Int32Array(keyOf.size).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(canon[idx[t]]);
    const b = find(canon[idx[t + 1]]);
    parent[a] = b;
    parent[find(canon[idx[t + 2]])] = find(b);
  }

  const groups = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(canon[idx[t]]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  return [...groups.values()];
}

// Новый BufferGeometry из выбранных треугольников исходного
function subGeometry(geo, tris) {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const src = geo.attributes[name];
    const n = src.itemSize;
    const arr = new src.array.constructor(tris.length * n);
    for (let i = 0; i < tris.length; i++) {
      for (let k = 0; k < n; k++) arr[i * n + k] = src.getComponent ? src.getComponent(tris[i], k) : src.array[tris[i] * n + k];
    }
    g.setAttribute(name, new THREE.BufferAttribute(arr, n, src.normalized));
  }
  g.computeBoundingBox();
  return g;
}

// Отдаём кадр браузеру между тяжёлыми шагами: модели догружаются в фоне,
// и разбор на детали не должен останавливать анимацию на 100+ мс
const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function loadGltfModel(id, url, cfg = {}, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, (e) => {
    if (onProgress && e.total) onProgress(e.loaded / e.total);
  });

  gltf.scene.updateMatrixWorld(true);
  const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(cfg.rotate || [0, 0, 0])));

  // 1. Все меши → геометрия в мировых координатах + материал
  const pieces = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const name = `${o.name} ${o.parent?.name || ''}`;
    if (cfg.drop && cfg.drop(name)) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(rot);
    pieces.push({ geo, material: o.material, name });
  });

  // 1b. Автовыравнивание: главная ось следа (по X/Z) поворачивается вдоль X
  if (cfg.autoAlign) {
    let n = 0, mx = 0, mz = 0, cxx = 0, czz = 0, cxz = 0;
    for (const p of pieces) {
      const a = p.geo.attributes.position;
      for (let i = 0; i < a.count; i += 7) { mx += a.getX(i); mz += a.getZ(i); n++; }
    }
    mx /= n; mz /= n;
    for (const p of pieces) {
      const a = p.geo.attributes.position;
      for (let i = 0; i < a.count; i += 7) {
        const dx = a.getX(i) - mx, dz = a.getZ(i) - mz;
        cxx += dx * dx; czz += dz * dz; cxz += dx * dz;
      }
    }
    const angle = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    const r = new THREE.Matrix4().makeRotationY(angle);
    pieces.forEach((p) => p.geo.applyMatrix4(r));
  }

  // 2. Общие габариты и нормализация: длина TARGET_LENGTH, центр в нуле
  const box = new THREE.Box3();
  pieces.forEach((p) => { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); });

  // 3. Острова
  let parts = [];
  for (const p of pieces) {
    await yieldFrame();
    for (const tris of splitIslands(p.geo)) {
      const g = subGeometry(p.geo, tris);
      parts.push({ geo: g, material: p.material, tris: tris.length / 3, box: g.boundingBox.clone() });
    }
  }
  if (cfg.keep) {
    parts = parts.filter((p) => cfg.keep(p.box, box));
    box.makeEmpty();
    parts.forEach((p) => box.union(p.box));
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const k = TARGET_LENGTH / Math.max(size.x, size.z);
  for (const p of parts) {
    p.geo.translate(-center.x, -center.y, -center.z);
    p.geo.scale(k, k, k);
    if (!p.geo.attributes.normal) p.geo.computeVertexNormals();
    p.geo.computeBoundingBox();
    p.box = p.geo.boundingBox.clone();
    p.center = p.box.getCenter(new THREE.Vector3());
    p.size = p.box.getSize(new THREE.Vector3());
  }
  const L = size.x * k;
  const H = size.y * k;
  const W = size.z * k;

  // 3b. Скан — один цельный кусок: режем его по высоте на слои
  //     (подошва, промежуточная, верх, воротник), иначе разбирать нечего.
  if (cfg.slice && parts.length) {
    const src = parts.sort((a, b) => b.tris - a.tris)[0];
    const pos = src.geo.attributes.position;
    const bands = cfg.slice; // [[до relY, тип], ...]
    const buckets = bands.map(() => []);
    for (let t = 0; t < pos.count; t += 3) {
      const y = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
      const rel = (y + H / 2) / H;
      const bi = bands.findIndex(([lim]) => rel <= lim);
      buckets[bi === -1 ? bands.length - 1 : bi].push(t, t + 1, t + 2);
    }
    parts = buckets.filter((b) => b.length).map((tris, i) => {
      const g = subGeometry(src.geo, tris);
      const box2 = g.boundingBox.clone();
      return {
        geo: g, material: src.material, tris: tris.length / 3, forceType: bands[i][1],
        box: box2, center: box2.getCenter(new THREE.Vector3()), size: box2.getSize(new THREE.Vector3()),
      };
    });
  }

  // 4. Мелкие острова (строчки, логотипы) приклеиваем к самому подходящему крупному
  const totalTris = parts.reduce((a, p) => a + p.tris, 0);
  const minTris = totalTris * (cfg.minPart ?? 0.004);
  const big = parts.filter((p) => p.tris >= minTris).sort((a, b) => b.tris - a.tris);
  const small = parts.filter((p) => p.tris < minTris);
  for (const s of small) {
    let host = null;
    let best = Infinity;
    for (const b of big) {
      const grown = b.box.clone().expandByScalar(0.02);
      const d = grown.containsPoint(s.center) ? 0 : b.box.distanceToPoint(s.center) + 1;
      const score = d * 1000 + b.size.length();
      if (score < best) { best = score; host = b; }
    }
    (host.children ||= []).push(s);
  }

  // 5. Слой каждой крупной детали: шнуровка / верх / подкладка / подошва
  const minY = -H / 2;
  for (const p of big) {
    const relY = (p.center.y - minY) / H;
    const long = p.size.x / L;
    if (p.forceType) p.type = p.forceType;
    else if (relY < 0.3 && long > 0.55) p.type = 'sole';
    else if (relY > 0.55 && Math.max(p.size.x, p.size.z) < 0.45 * L && Math.abs(p.center.z) < 0.25 * W) p.type = 'top';
    else if (long < 0.85 && Math.abs(p.center.z) < 0.18 * W && p.size.z < 0.75 * W && relY > 0.25) p.type = 'inner';
    else p.type = 'upper';
  }
  // Самая крупная деталь — всегда верх (если это не подошва)
  if (big[0] && big[0].type !== 'sole' && !big[0].forceType) big[0].type = 'upper';

  // Подошвы раскладываем стопкой: нижняя уезжает дальше всех
  const soles = big.filter((p) => p.type === 'sole').sort((a, b) => a.center.y - b.center.y);
  soles.forEach((p, i) => { p.soleRank = soles.length - 1 - i; });

  const UP = new THREE.Vector3(0, 0.38, -0.62);
  const group = new THREE.Group();
  const explodeParts = [];
  const anchors = {};

  for (const p of big) {
    const obj = new THREE.Group();
    obj.add(new THREE.Mesh(p.geo, p.material));
    for (const c of p.children || []) obj.add(new THREE.Mesh(c.geo, c.material));
    group.add(obj);

    // Разлёт: базовое направление слоя плюс немного «от центра»
    const radial = new THREE.Vector3(p.center.x * 0.25, 0, p.center.z * 0.9);
    let step;
    let off;
    switch (p.type) {
      case 'top': step = 0; off = new THREE.Vector3(0.05, 0.75, 0).add(radial); break;
      case 'inner': step = 2; off = new THREE.Vector3(0, 0.22, 0.8); break;
      case 'sole': step = 3; off = new THREE.Vector3(0, -0.3 - 0.28 * (p.soleRank + 1), 0); break;
      default: {
        step = 1;
        off = UP.clone().add(radial);
      }
    }
    explodeParts.push({ obj, base: new THREE.Vector3(), offset: off, step });
    // Якорь подписи: самая крупная деталь каждого слоя
    if (!anchors[p.type] || anchors[p.type].tris < p.tris) {
      anchors[p.type] = { obj, center: p.center.clone(), type: p.type, step, tris: p.tris };
    }
  }

  const root = new THREE.Group();
  root.add(group);

  const counts = {};
  big.forEach((p) => { counts[p.type] = (counts[p.type] || 0) + 1; });

  return {
    id,
    root,
    setExplode: makeExplode(explodeParts),
    defaults: {},
    slots: [],
    partsCount: big.length,
    anchors: Object.values(anchors),
    stats: { parts: big.length, islands: parts.length, tris: totalTris, counts },
    applyColors() {},
  };
}
