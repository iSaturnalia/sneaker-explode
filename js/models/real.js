import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TARGET_LENGTH, makeExplode } from './common.js?v=9';

// Реальная модель (Shopify, CC-BY 4.0). В файле один меш, но детали внутри
// не соединены между собой: делим его на «острова» и раскладываем.

function splitIslands(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  const q = Math.max(size.x, size.y, size.z) / 20000;

  // Склеиваем вершины по позиции, чтобы швы UV не рвали деталь.
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

  return [...groups.values()].map((tris) => {
    const g = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) {
      const src = geo.attributes[name];
      const n = src.itemSize;
      const arr = new Float32Array(tris.length * n);
      tris.forEach((v, i) => { for (let k = 0; k < n; k++) arr[i * n + k] = src.array[v * n + k]; });
      g.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    g.computeBoundingBox();
    return { geo: g, tris: tris.length / 3 };
  });
}

// Определяем, что это за деталь, по размеру и положению.
function classify(islands, L, W) {
  const upper = islands.reduce((a, b) => (b.tris > a.tris ? b : a));
  for (const isl of islands) {
    const s = isl.geo.boundingBox.getSize(new THREE.Vector3());
    const c = isl.geo.boundingBox.getCenter(new THREE.Vector3());
    isl.center = c;
    if (isl === upper) isl.type = 'upper';
    else if (s.x > 0.9 * L && c.y < 0) isl.type = 'sole';
    else if (Math.max(s.x, s.y, s.z) < 0.05 * L) isl.type = 'eyelet';
    else if (c.x < -0.3 * L) isl.type = 'heel';
    else if (s.z > 0.35 * W && s.x < 0.12 * L) isl.type = 'lace';
    else if (Math.abs(c.z) > 0.25 * W) isl.type = 'overlay';
    else if (s.z < 0.15 * W) isl.type = 'tongue';
    else isl.type = 'lining';
  }
}

const UPPER_OFF = new THREE.Vector3(0, 0.35, -0.6);

function plan(isl) {
  const side = Math.sign(isl.center.z) || 1;
  switch (isl.type) {
    case 'lace': return { step: 0, offset: new THREE.Vector3(0, 0.9, 0.1) };
    case 'tongue': return { step: 0, offset: new THREE.Vector3(0.05, 0.62, 0) };
    case 'upper': return { step: 1, offset: UPPER_OFF.clone() };
    case 'overlay': return { step: 1, offset: UPPER_OFF.clone().add(new THREE.Vector3(0, 0, side * 0.4)) };
    case 'eyelet': return { step: 1, offset: UPPER_OFF.clone().add(new THREE.Vector3(0, 0.12, side * 0.3)) };
    case 'heel': return { step: 1, offset: UPPER_OFF.clone().add(new THREE.Vector3(-0.45, 0, 0)) };
    case 'lining': return { step: 2, offset: new THREE.Vector3(0, 0.22, 0.8) };
    case 'sole': return { step: 3, offset: new THREE.Vector3(0, -0.65, 0) };
    default: return { step: 1, offset: UPPER_OFF.clone() };
  }
}

export async function loadReal(url, onProgress) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url, (e) => {
    if (onProgress && e.total) onProgress(e.loaded / e.total);
  });

  // Варианты материалов (KHR_materials_variants) читаем из JSON сами:
  // GLTFLoader 0.160 их не применяет.
  const json = gltf.parser.json;
  const variantNames = (json.extensions?.KHR_materials_variants?.variants || []).map((v) => v.name);
  const mappings = json.meshes[0].primitives[0].extensions?.KHR_materials_variants?.mappings || [];
  const variantMats = {};
  for (const m of mappings) {
    const mat = await gltf.parser.getDependency('material', m.material);
    for (const vi of m.variants) variantMats[variantNames[vi]] = mat;
  }

  let src = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
  const baseMat = src.material;

  // Геометрию сразу в мировые координаты и к общему размеру.
  const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
  geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  const center = geo.boundingBox.getCenter(new THREE.Vector3());
  geo.translate(-center.x, -center.y, -center.z);
  const k = TARGET_LENGTH / Math.max(size.x, size.y, size.z);
  geo.scale(k, k, k);
  const L = size.x * k;
  const W = size.z * k;

  const islands = splitIslands(geo);
  classify(islands, L, W);

  // Три материала: основной, шнурки, подошва. Шнурки и подошву можно подкрасить.
  const slotMats = { main: null, laces: null, sole: null };
  const tints = { laces: '#ffffff', sole: '#ffffff' };
  const meshesBySlot = { main: [], laces: [], sole: [] };

  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const parts = [];
  const anchors = {};

  for (const isl of islands) {
    const slot = isl.type === 'lace' ? 'laces' : isl.type === 'sole' ? 'sole' : 'main';
    const mesh = new THREE.Mesh(isl.geo, baseMat);
    meshesBySlot[slot].push(mesh);
    inner.add(mesh);
    const p = plan(isl);
    parts.push({ obj: mesh, base: new THREE.Vector3(), offset: p.offset, step: p.step });
    const aType = { lace: 'top', upper: 'upper', lining: 'inner', sole: 'sole' }[isl.type];
    if (aType && (!anchors[aType] || anchors[aType].tris < isl.tris)) {
      anchors[aType] = { obj: mesh, center: isl.center.clone(), type: aType, step: p.step, tris: isl.tris };
    }
  }

  let current = null;
  let currentMat = baseMat;

  // Белый — цвет из текстуры расцветки. Любой другой — сплошной цвет
  // поверх рельефа: умножение на тёмную текстуру цвет бы не показало.
  function tint(slot) {
    const m = slotMats[slot];
    const own = tints[slot] === '#ffffff';
    m.map = own ? currentMat.map : null;
    // Карта затенения в файле сильно темнит шнурки: для своего цвета её убираем.
    m.aoMap = own ? currentMat.aoMap : null;
    m.metalnessMap = own ? currentMat.metalnessMap : null;
    m.metalness = own ? currentMat.metalness : 0;
    m.color.set(tints[slot]);
    m.needsUpdate = true;
  }

  function setVariant(name) {
    const vm = variantMats[name] || baseMat;
    current = name;
    currentMat = vm;
    for (const slot of Object.keys(slotMats)) {
      const m = vm.clone();
      slotMats[slot]?.dispose();
      slotMats[slot] = m;
      meshesBySlot[slot].forEach((mesh) => (mesh.material = m));
      if (slot !== 'main') tint(slot);
    }
  }
  setVariant(variantNames[0]);

  return {
    id: 'aero',
    root,
    setExplode: makeExplode(parts),
    variants: variantNames,
    defaults: { variant: variantNames[0], laces: '#ffffff', sole: '#ffffff' },
    slots: ['laces', 'sole'],
    partsCount: islands.length,
    anchors: Object.values(anchors),
    applyColors(colors) {
      if (colors.variant && colors.variant !== current) setVariant(colors.variant);
      for (const slot of ['laces', 'sole']) {
        if (colors[slot] && colors[slot] !== tints[slot]) {
          tints[slot] = colors[slot];
          tint(slot);
        }
      }
    },
  };
}
