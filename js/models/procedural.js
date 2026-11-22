import * as THREE from 'three';
import { normalize, makeExplode } from './common.js';

// Процедурные кроссовки. Каждая деталь — силуэт в плоскости XY (вид сбоку),
// выдавленный по Z (ширина). Нос смотрит в +X.

function roundRect(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

// start: [x, y]; curves: [[cx, cy, x, y], ...] — квадратичные сегменты по часовой
function outline(start, bottomTo, curves) {
  const s = new THREE.Shape();
  s.moveTo(start[0], start[1]);
  s.lineTo(bottomTo[0], bottomTo[1]);
  for (const [cx, cy, x, y] of curves) s.quadraticCurveTo(cx, cy, x, y);
  return s;
}

function slab(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 4,
    curveSegments: 28,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Сужает верх по ширине к колодке.
function taper(geo, y0, y1, amount) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    pos.setZ(i, pos.getZ(i) * (1 - amount * t));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function laces(xs, ys, z) {
  const curve = new THREE.CatmullRomCurve3(
    xs.map((x, i) => new THREE.Vector3(x, ys[i], i % 2 === 0 ? -z : z))
  );
  return new THREE.TubeGeometry(curve, 72, 0.03, 10, false);
}

const std = (hex, roughness = 0.7) => new THREE.MeshStandardMaterial({ color: hex, roughness });

/* ---------- описания моделей ---------- */

const SPECS = {
  court: {
    defaults: { upper: '#f4f1ea', sole: '#f4f1ea', laces: '#1c1c1e' },
    accent: '#ff5a1f',
    outsole: [-1.06, 0.0, 1.22, 0.1, 0.05],
    midsole: [[-1.04, 0.1, 1.2, 0.42, 0.08]],
    insole: [-0.92, 0.42, 1.0, 0.5, 0.04],
    width: 0.46,
    upper: {
      y0: 0.5, y1: 1.45, taper: 0.32,
      start: [-1.0, 0.5], bottom: [1.0, 0.5],
      curves: [
        [1.16, 0.52, 1.15, 0.64],
        [1.08, 0.78, 0.8, 0.82],
        [0.45, 0.92, 0.2, 1.0],
        [0.0, 1.1, -0.15, 1.32],
        [-0.3, 1.4, -0.55, 1.36],
        [-0.85, 1.4, -1.0, 1.42],
        [-1.15, 1.2, -1.08, 0.8],
        [-1.1, 0.56, -1.0, 0.5],
      ],
    },
    tongue: [-0.36, 1.0, 0.04, 1.48, 0.12],
    tab: [-1.17, 1.16, -1.0, 1.5, 0.05],
    laces: { xs: [-0.1, 0.1, 0.3, 0.5, 0.68], ys: [1.24, 1.08, 1.0, 0.93, 0.88], z: 0.17 },
    strap: true,
  },
  skate: {
    defaults: { upper: '#1c1c1e', sole: '#f4f1ea', laces: '#f4f1ea' },
    accent: '#8a8378',
    outsole: [-1.08, 0.0, 1.24, 0.08, 0.04],
    midsole: [[-1.06, 0.08, 1.22, 0.38, 0.06]],
    insole: [-0.92, 0.38, 1.02, 0.45, 0.04],
    width: 0.5,
    upper: {
      y0: 0.45, y1: 0.98, taper: 0.26,
      start: [-1.0, 0.45], bottom: [1.05, 0.45],
      curves: [
        [1.2, 0.47, 1.18, 0.6],
        [1.12, 0.72, 0.85, 0.75],
        [0.5, 0.8, 0.2, 0.84],
        [0.0, 0.86, -0.15, 0.97],
        [-0.3, 0.9, -0.5, 0.88],
        [-0.8, 0.9, -0.95, 0.98],
        [-1.12, 0.98, -1.1, 0.75],
        [-1.1, 0.52, -1.0, 0.45],
      ],
    },
    tongue: [-0.46, 0.8, 0.0, 1.06, 0.1],
    tab: [-1.15, 0.74, -1.0, 0.99, 0.05],
    laces: { xs: [-0.16, 0.04, 0.24, 0.44, 0.62], ys: [1.0, 0.91, 0.87, 0.83, 0.8], z: 0.18 },
    toecap: [0.58, 0.43, 1.2, 0.72, 0.15],
  },
  trail: {
    defaults: { upper: '#9fae97', sole: '#1c1c1e', laces: '#ff5a1f' },
    accent: '#e9c46a',
    outsole: [-1.06, 0.0, 1.22, 0.14, 0.06],
    midsole: [[-1.04, 0.14, 1.2, 0.34, 0.08], [-1.02, 0.34, 1.18, 0.52, 0.08]],
    insole: [-0.92, 0.52, 1.0, 0.6, 0.04],
    width: 0.48,
    upper: {
      y0: 0.58, y1: 1.24, taper: 0.3,
      start: [-1.0, 0.58], bottom: [1.0, 0.58],
      curves: [
        [1.18, 0.6, 1.17, 0.74],
        [1.08, 0.9, 0.8, 0.92],
        [0.45, 1.0, 0.2, 1.06],
        [0.0, 1.1, -0.15, 1.22],
        [-0.3, 1.12, -0.5, 1.12],
        [-0.78, 1.12, -0.92, 1.26],
        [-1.1, 1.26, -1.12, 0.97],
        [-1.12, 0.68, -1.0, 0.58],
      ],
    },
    tongue: [-0.43, 1.0, 0.02, 1.34, 0.12],
    tab: [-1.17, 1.02, -1.0, 1.28, 0.05],
    laces: { xs: [-0.12, 0.08, 0.28, 0.48, 0.66], ys: [1.24, 1.13, 1.07, 1.02, 0.97], z: 0.17 },
    toecap: [0.72, 0.52, 1.24, 0.82, 0.14],
    lugs: true,
  },
};

/* ---------- сборка ---------- */

export function buildProcedural(id) {
  const spec = SPECS[id];
  const inner = new THREE.Group();
  const parts = [];

  const mats = {
    upper: std(spec.defaults.upper, 0.65),
    sole: std(spec.defaults.sole, 0.55),
    laces: std(spec.defaults.laces, 0.8),
    outsole: std('#1c1c1e', 0.9),
    insole: std('#3a2f2a', 0.9),
    tongue: std('#1c1c1e', 0.7),
    accent: std(spec.accent, 0.6),
    accentB: std(id === 'trail' ? spec.accent : spec.defaults.sole, 0.55),
  };

  const add = (obj, step, offset, extraBase) => {
    inner.add(obj);
    parts.push({ obj, base: obj.position.clone().add(extraBase || new THREE.Vector3()), offset: new THREE.Vector3(...offset), step });
    return obj;
  };
  const mesh = (geo, mat) => new THREE.Mesh(geo, mat);

  // Шаг 3: подошва
  const outsole = new THREE.Group();
  outsole.add(mesh(slab(roundRect(...spec.outsole), spec.width + 0.08, 0.02), mats.outsole));
  if (spec.lugs) {
    const lug = new THREE.BoxGeometry(0.12, 0.06, 0.1);
    const xs = [];
    for (let x = -0.92; x <= 1.08; x += 0.18) xs.push(x);
    const zs = [-0.2, 0, 0.2];
    const inst = new THREE.InstancedMesh(lug, mats.outsole, xs.length * zs.length);
    const m = new THREE.Matrix4();
    let n = 0;
    xs.forEach((x, i) => zs.forEach((z) => {
      m.makeTranslation(x, -0.03, z + (i % 2 ? 0.05 : -0.05));
      inst.setMatrixAt(n++, m);
    }));
    outsole.add(inst);
  }
  add(outsole, 3, [0, -0.75, 0]);

  spec.midsole.forEach((r, i) => {
    const mat = i === 0 ? mats.sole : mats.accentB;
    add(mesh(slab(roundRect(...r), spec.width + 0.02, 0.05), mat), 3, [0, i === 0 ? -0.42 : -0.18, 0]);
  });

  // Шаг 2: стелька
  add(mesh(slab(roundRect(...spec.insole), spec.width - 0.06, 0.02), mats.insole), 2, [0, 0.2, 0.8]);

  // Шаг 1: верх и детали на нём
  const u = spec.upper;
  const upperGeo = taper(slab(outline(u.start, u.bottom, u.curves), spec.width - 0.06, 0.13), u.y0, u.y1, u.taper);
  const upperOffset = [0, 0.35, -0.6];
  add(mesh(upperGeo, mats.upper), 1, upperOffset);
  add(mesh(slab(roundRect(...spec.tab), 0.22, 0.02), mats.accent), 1, [upperOffset[0] - 0.4, upperOffset[1], upperOffset[2]]);
  if (spec.toecap) {
    const cap = taper(slab(roundRect(...spec.toecap), spec.width - 0.02, 0.06), spec.toecap[1], spec.toecap[3], 0.15);
    add(mesh(cap, id === 'trail' ? mats.outsole : mats.accent), 1, [upperOffset[0] + 0.45, upperOffset[1], upperOffset[2]]);
  }

  // Шаг 0: шнуровка, язычок, ремешок
  add(mesh(slab(roundRect(...spec.tongue), 0.26, 0.03), mats.tongue), 0, [0.05, 0.65, 0]);
  add(mesh(laces(spec.laces.xs, spec.laces.ys, spec.laces.z), mats.laces), 0, [0, 0.9, 0.1]);
  if (spec.strap) {
    const strap = mesh(slab(roundRect(-0.6, 1.12, -0.36, 1.28, 0.06), spec.width + 0.04, 0.02), mats.accent);
    add(strap, 0, [0, 0.85, 0]);
  }

  const { root } = normalize(inner);
  return {
    id,
    root,
    setExplode: makeExplode(parts),
    defaults: { ...spec.defaults },
    slots: ['upper', 'sole', 'laces'],
    applyColors(colors) {
      for (const slot of this.slots) if (colors[slot]) mats[slot].color.set(colors[slot]);
      if (id !== 'trail') mats.accentB.color.set(colors.sole || spec.defaults.sole);
    },
  };
}
