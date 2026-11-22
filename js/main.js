import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

gsap.registerPlugin(ScrollTrigger);

/* ---------- renderer, scene, camera ---------- */

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x0f0f11, 1);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0.3, 6.8);
camera.lookAt(0, 0, 0);

const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(3, 5, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffe2c8, 0.6);
fill.position.set(-4, 2, 3);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.0);
rim.position.set(-3, 4, -4);
scene.add(rim);

/* ---------- materials ---------- */

const mat = {
  outsole: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.85 }),
  midsole: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.55 }),
  upper: new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6 }),
  insole: new THREE.MeshStandardMaterial({ color: 0x3a2f2a, roughness: 0.9 }),
  tongue: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.7 }),
  laces: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.8 }),
  tab: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.7 }),
};

/* ---------- geometry helpers ---------- */

// Силуэт в плоскости XY, затем выдавливаем по Z (ширина ботинка).
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

// Силуэт верха: носок, мыс, язык, задник.
function upperShape() {
  // Низ — по подошве, верх — от носка к заднику через провал у щиколотки.
  const s = new THREE.Shape();
  s.moveTo(-1.0, 0.44);
  s.lineTo(1.0, 0.44);
  s.quadraticCurveTo(1.14, 0.46, 1.14, 0.56);   // нос
  s.quadraticCurveTo(1.05, 0.66, 0.8, 0.7);     // носок
  s.quadraticCurveTo(0.45, 0.8, 0.2, 0.86);     // переход к союзке
  s.quadraticCurveTo(-0.05, 0.9, -0.2, 1.02);   // язык
  s.quadraticCurveTo(-0.35, 0.92, -0.5, 0.92);  // провал у щиколотки
  s.quadraticCurveTo(-0.75, 0.92, -0.9, 1.06);  // воротник
  s.quadraticCurveTo(-1.08, 1.06, -1.1, 0.8);   // задник
  s.quadraticCurveTo(-1.1, 0.55, -1.0, 0.44);
  return s;
}

// Сужаем верх по ширине, чтобы он садился на колодку.
function taperUpper(geo) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y - 0.44) / 0.55, 0, 1);
    pos.setZ(i, pos.getZ(i) * (1 - 0.3 * t));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ---------- model ---------- */

const model = new THREE.Group();
model.position.y = -0.55; // центрируем модель по вертикали
scene.add(model);

const parts = {};

function addPart(name, geometry, material, base) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(base);
  mesh.castShadow = false;
  model.add(mesh);
  parts[name] = { mesh, base: base.clone() };
  return mesh;
}

// Подошва (резина) и промежуточная подошва
addPart('outsole', slab(roundRect(-1.06, 0.0, 1.22, 0.13, 0.06), 0.56, 0.02), mat.outsole, new THREE.Vector3());
addPart('midsole', slab(roundRect(-1.02, 0.12, 1.18, 0.36, 0.1), 0.52, 0.05), mat.midsole, new THREE.Vector3());

// Стелька
addPart('insole', slab(roundRect(-0.92, 0.36, 1.0, 0.44, 0.04), 0.42, 0.02), mat.insole, new THREE.Vector3());

// Верх
const upperGeo = taperUpper(slab(upperShape(), 0.42, 0.13));
addPart('upper', upperGeo, mat.upper, new THREE.Vector3());

// Язычок
addPart('tongue', slab(roundRect(-0.66, 0.84, -0.18, 1.12, 0.1), 0.26, 0.03), mat.tongue, new THREE.Vector3());

// Задник
addPart('tab', slab(roundRect(-1.14, 0.7, -0.98, 0.98, 0.05), 0.22, 0.02), mat.tab, new THREE.Vector3());

// Шнурки: зигзаг поперёк верха
const laceCurve = new THREE.CatmullRomCurve3(
  [-0.62, -0.42, -0.22, -0.02, 0.16].map((x, i) =>
    new THREE.Vector3(x, [1.04, 1.0, 1.0, 0.92, 0.86][i], i % 2 === 0 ? -0.16 : 0.16)
  )
);
addPart('laces', new THREE.TubeGeometry(laceCurve, 64, 0.034, 10, false), mat.laces, new THREE.Vector3());

/* ---------- explode plan ---------- */

// Каждая часть уезжает в свою сторону, по очереди. Порядок совпадает с главами.
const plan = [
  { name: 'outsole', at: 0.0, to: [0.0, -0.5, 0.0] },
  { name: 'midsole', at: 0.25, to: [0.0, -0.2, 0.0] },
  { name: 'insole', at: 0.25, to: [0.0, 0.0, 0.8] },
  { name: 'upper', at: 0.5, to: [0.0, 0.5, -0.5] },
  { name: 'tab', at: 0.5, to: [-0.7, 0.45, 0.0] },
  { name: 'tongue', at: 0.75, to: [0.0, 0.5, 0.8] },
  { name: 'laces', at: 0.75, to: [0.25, 0.55, 0.9] },
];

/* ---------- timeline driven by scroll ---------- */

const chapters = document.querySelectorAll('#chapters li');
const intro = document.getElementById('intro');
const bar = document.getElementById('bar');

const tl = gsap.timeline({
  scrollTrigger: {
    trigger: '#scroll',
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.6,
  },
});

// Вступление гаснет в начале
tl.to(intro, { opacity: 0, duration: 0.08 }, 0);

// Разборка деталей
plan.forEach((p) => {
  const b = parts[p.name].base;
  tl.to(
    parts[p.name].mesh.position,
    { x: b.x + p.to[0], y: b.y + p.to[1], z: b.z + p.to[2], duration: 0.25, ease: 'power2.inOut' },
    p.at
  );
});

// Главы: каждая появляется на своём отрезке и уходит перед следующей
chapters.forEach((li, i) => {
  const start = i * 0.25;
  tl.fromTo(li, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.08 }, start + 0.02);
  if (i < chapters.length - 1) {
    tl.to(li, { opacity: 0, y: -16, duration: 0.08 }, start + 0.22);
  }
});

// Прогресс и поворот модели
tl.to(bar, { width: '100%', ease: 'none', duration: 1 }, 0);
tl.fromTo(model.rotation, { y: -0.6 }, { y: 0.5, ease: 'none', duration: 1 }, 0);
model.rotation.x = 0.15;

/* ---------- resize ---------- */

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Узкий экран: отъезжаем, чтобы модель с разобранными деталями влезла.
  const visibleWidth = 3.2;
  const distForWidth = visibleWidth / (2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * camera.aspect);
  camera.position.z = Math.max(6.8, distForWidth);
  // На широком экране сдвигаем модель влево, справа место под главы.
  model.position.x = camera.aspect > 1 ? -0.9 : 0;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

/* ---------- loop ---------- */

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  // Лёгкое покачивание, чтобы модель не стояла мёртво
  model.position.y = -0.55 + Math.sin(t * 0.9) * 0.015;
  renderer.render(scene, camera);
});
