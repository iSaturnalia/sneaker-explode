import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildProcedural } from './models/procedural.js';
import { loadReal } from './models/real.js';
import { MODELS, MODEL_ORDER, STAT_LABELS, SIZES, SCENES, BASE_BG } from './data.js';

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => window.innerWidth < 760;
const $ = (s) => document.querySelector(s);
const rub = (n) => `${n.toLocaleString('ru-RU')} ₽`;

/* ---------- state ---------- */

const state = {
  model: 'aero',
  colors: {},      // заводская расцветка каждой модели
  size: null,      // EU
  scene: 'city',
};

/* ---------- renderer and scene ---------- */

const canvas = $('#canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(3, 5, 4);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(-4, 2, 3);
const rim = new THREE.DirectionalLight(0xffffff, 1.0);
rim.position.set(-3, 4, -4);
scene.add(key, fill, rim);

// stage двигается и масштабируется между блоками, holder крутит модель
const stage = new THREE.Group();
const holder = new THREE.Group();
stage.add(holder);
scene.add(stage);

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(1.55, 1.65, 0.28, 72),
  new THREE.MeshStandardMaterial({ color: 0x1a1d2e, roughness: 0.4, transparent: true, opacity: 0 })
);
pedestal.position.y = -0.72;
stage.add(pedestal);

/* ---------- models ---------- */

const models = {};
for (const id of ['court', 'skate', 'trail']) models[id] = buildProcedural(id);
let current = null;

function colorsFor(id) {
  if (!state.colors[id]) state.colors[id] = { ...models[id].defaults };
  return state.colors[id];
}

function showModel(id, instant = false) {
  const next = models[id];
  if (!next || next === current) return;
  const prev = current;
  current = next;
  next.applyColors(colorsFor(id));
  holder.add(next.root);

  if (instant || reduceMotion) {
    if (prev) holder.remove(prev.root);
    next.root.scale.setScalar(1);
    return;
  }
  if (prev) {
    gsap.to(prev.root.scale, {
      x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in',
      onComplete: () => holder.remove(prev.root),
    });
  }
  next.root.scale.setScalar(0.001);
  gsap.to(next.root.scale, { x: 1, y: 1, z: 1, duration: 0.7, delay: prev ? 0.25 : 0, ease: 'back.out(1.6)' });
}

/* ---------- rig: положение модели и камеры по блокам ---------- */

const rig = {
  x: 0, y: 0, scale: 1, opacity: 1,
  explodeMix: 0, zoomMix: 0, lockMix: 0, lockAngle: 0, sceneMix: 0,
  explode: 0, explodeTarget: 0,
  zoom: 0, zoomTarget: 0,
};

function preset(name) {
  const m = isMobile();
  const base = { explodeMix: 0, zoomMix: 0, lockMix: 0, sceneMix: 0, opacity: 1 };
  switch (name) {
    case 'hero': return { ...base, x: m ? 0 : 0.95, y: m ? 0.55 : -0.1, scale: m ? 0.8 : 1.05 };
    case 'explode': return { ...base, x: m ? 0 : -0.8, y: m ? 0.5 : 0, scale: m ? 0.72 : 0.95, explodeMix: 1, lockMix: 1, lockAngle: -0.55 };
    case 'dim': return { ...base, x: 0, y: m ? 0.6 : 0.2, scale: 0.8, opacity: 0.16 };
    case 'closeup': return { ...base, x: 0, y: m ? 0.35 : 0, scale: 1, zoomMix: 1, lockMix: 1, lockAngle: 0 };
    case 'scenes': return { ...base, x: m ? 0 : 0.85, y: m ? 1.6 : 0.15, scale: m ? 0.72 : 0.95, sceneMix: 1 };
    case 'cart': return { ...base, x: m ? 0 : 0.85, y: m ? 1.7 : 0, scale: m ? 0.72 : 0.95 };
    default: return base;
  }
}

let currentPreset = 'hero';
function goPreset(name, instant = false) {
  currentPreset = name;
  const p = preset(name);
  if (instant || reduceMotion) gsap.set(rig, p);
  else gsap.to(rig, { ...p, duration: 1.1, ease: 'power3.inOut', overwrite: 'auto' });
}

document.querySelectorAll('[data-rig]').forEach((sec) => {
  ScrollTrigger.create({
    trigger: sec,
    start: 'top 55%',
    end: 'bottom 45%',
    onEnter: () => goPreset(sec.dataset.rig),
    onEnterBack: () => goPreset(sec.dataset.rig),
  });
});

/* ---------- 2. разбор по скроллу ---------- */

const chapters = document.querySelectorAll('#chapters li');
const explodeBar = $('#explodeBar');
let activeChapter = -1;

ScrollTrigger.create({
  trigger: '#explode',
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: (self) => {
    rig.explodeTarget = self.progress;
    explodeBar.style.width = `${(self.progress * 100).toFixed(1)}%`;
    const idx = Math.min(chapters.length - 1, Math.floor(self.progress * chapters.length));
    if (idx !== activeChapter) {
      activeChapter = idx;
      chapters.forEach((li, i) => li.classList.toggle('is-active', i === idx));
    }
  },
});
chapters[0].classList.add('is-active');

/* ---------- 5. крупный план ---------- */

ScrollTrigger.create({
  trigger: '#closeup',
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: (self) => { rig.zoomTarget = Math.min(1, self.progress / 0.6); },
});

/* ---------- 6. сцены ---------- */

const baseBg = new THREE.Color(BASE_BG);
const white = new THREE.Color(0xffffff);
const sceneCol = {
  bg: new THREE.Color(SCENES.city.bg),
  key: new THREE.Color(SCENES.city.key),
  rim: new THREE.Color(SCENES.city.rim),
  fill: new THREE.Color(SCENES.city.fill),
  pedestal: new THREE.Color(SCENES.city.pedestal),
};

function setScene(id, instant = false, save = true) {
  state.scene = id;
  const s = SCENES[id];
  for (const k of Object.keys(sceneCol)) {
    const c = new THREE.Color(s[k]);
    if (instant || reduceMotion) sceneCol[k].copy(c);
    else gsap.to(sceneCol[k], { r: c.r, g: c.g, b: c.b, duration: 0.8, ease: 'power2.out' });
  }
  renderScenes();
  if (save) saveURL();
}

/* ---------- UI: 1. выбор модели ---------- */

function selectModel(id) {
  if (!models[id]) return;
  state.model = id;
  showModel(id);
  renderAll();
  saveURL();
}

function renderPicker() {
  const el = $('#picker');
  el.innerHTML = '';
  for (const id of MODEL_ORDER) {
    const m = MODELS[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(id === state.model));
    b.disabled = !models[id];
    b.innerHTML = `<span class="pick__name">${m.name}</span><span class="pick__tag">${m.tagline}</span><span class="pick__price">${rub(m.price)}</span>`;
    b.addEventListener('click', () => selectModel(id));
    el.appendChild(b);
  }
  $('#heroName').textContent = MODELS[state.model].name;
  $('#heroTagline').textContent = MODELS[state.model].tagline;
}

/* ---------- UI: 3. сравнение ---------- */

function renderCompare() {
  const grid = $('#compareGrid');
  grid.innerHTML = '';
  for (const id of MODEL_ORDER) {
    const m = MODELS[id];
    const card = document.createElement('article');
    card.className = `card${id === state.model ? ' is-current' : ''}`;
    card.tabIndex = 0;
    card.setAttribute('aria-label', `${m.name}, выбрать`);
    const stats = Object.entries(STAT_LABELS).map(([k, s]) => {
      const v = m.stats[k];
      return `<div class="stat"><div class="stat__row"><span>${s.label}</span><b>${v} ${s.unit}</b></div>
        <div class="stat__bar"><span style="--w:${Math.round((v / s.max) * 100)}%"></span></div></div>`;
    }).join('');
    card.innerHTML = `<h3>${m.name}</h3><p class="card__price">${rub(m.price)}</p>${stats}`;
    const pick = () => selectModel(id);
    card.addEventListener('click', pick);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    grid.appendChild(card);
  }
}

ScrollTrigger.create({
  trigger: '#compare',
  start: 'top 60%',
  once: true,
  onEnter: () => $('#compare').classList.add('is-in'),
});

/* ---------- расцветка в корзине ---------- */

// Витрина без редактора: каждая модель в своей заводской расцветке.
const COLOR_NAMES = {
  '#ff5a1f': 'оранжевый', '#f4f1ea': 'молочный', '#1c1c1e': 'чёрный',
  '#9fae97': 'шалфей', '#e9c46a': 'горчичный',
};

function colorSummary() {
  const c = colorsFor(state.model);
  if (models[state.model].variants) return c.variant[0].toUpperCase() + c.variant.slice(1);
  const n = (hex) => COLOR_NAMES[hex] || hex;
  return `верх ${n(c.upper)}, подошва ${n(c.sole)}`;
}

/* ---------- UI: 5. материал ---------- */

function renderMaterial() {
  const m = MODELS[state.model].material;
  $('#materialTitle').textContent = m.title;
  $('#materialText').textContent = m.text;
}

/* ---------- UI: 6. сцены ---------- */

function renderScenes() {
  const seg = $('#sceneSeg');
  seg.innerHTML = '';
  for (const [id, s] of Object.entries(SCENES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.name;
    b.setAttribute('aria-pressed', String(id === state.scene));
    b.addEventListener('click', () => setScene(id));
    seg.appendChild(b);
  }
}

/* ---------- UI: 7. размер ---------- */

function renderSizes() {
  const grid = $('#sizeGrid');
  grid.innerHTML = '';
  for (const s of SIZES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'size__btn';
    b.setAttribute('aria-pressed', String(s.eu === state.size));
    b.setAttribute('aria-label', `EU ${s.eu}, стелька ${s.cm} см`);
    b.innerHTML = `${s.eu}<small>${s.cm} см</small>`;
    b.addEventListener('click', () => selectSize(s.eu));
    grid.appendChild(b);
  }
}

function sizeText(s) {
  return `Ваш размер: <b>EU ${s.eu}</b> · US ${s.us} · UK ${s.uk}. Длина стельки ${s.cm} см.`;
}

function selectSize(eu) {
  state.size = eu;
  const s = SIZES.find((x) => x.eu === eu);
  $('#sizeResult').innerHTML = sizeText(s);
  renderSizes();
  renderCart();
  saveURL();
}

$('#footCm').addEventListener('input', (e) => {
  const cm = parseFloat(String(e.target.value).replace(',', '.'));
  const res = $('#sizeResult');
  if (!cm || cm < 20) { res.textContent = 'Введите длину стопы от 20 до 32 см.'; return; }
  const s = SIZES.find((x) => x.cm >= cm);
  if (!s) { res.textContent = 'Больше 46-го размера у нас пока нет.'; return; }
  selectSize(s.eu);
});

/* ---------- UI: 8. корзина ---------- */

function renderCart() {
  const m = MODELS[state.model];
  $('#cartName').textContent = m.name;
  $('#cartColor').textContent = colorSummary();
  $('#cartSize').textContent = state.size ? `EU ${state.size}` : 'не выбран';
  $('#cartPrice').textContent = rub(m.price);
  $('#topPrice').textContent = rub(m.price);
}

$('#checkout').addEventListener('click', () => {
  const hint = $('#cartHint');
  if (!state.size) {
    hint.textContent = 'Сначала выберите размер.';
    $('#size').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    return;
  }
  hint.textContent = 'Готово. Это демо, заказ никуда не отправлен.';
});

function renderAll() {
  renderPicker();
  renderCompare();
  renderMaterial();
  renderScenes();
  renderSizes();
  renderCart();
}

/* ---------- URL: модель, размер и сцена в ссылке ---------- */

function saveURL() {
  const p = new URLSearchParams();
  p.set('m', state.model);
  if (state.size) p.set('sz', state.size);
  if (state.scene !== 'city') p.set('sc', state.scene);
  history.replaceState(null, '', `?${p}${location.hash}`);
}

function readURL() {
  const p = new URLSearchParams(location.search);
  const m = p.get('m');
  if (m && MODELS[m]) state.model = m;
  const sz = Number(p.get('sz'));
  if (SIZES.some((s) => s.eu === sz)) state.size = sz;
  const sc = p.get('sc');
  if (sc && SCENES[sc]) state.scene = sc;
}

/* ---------- resize and loop ---------- */

const camBase = new THREE.Vector3();
const camPos = new THREE.Vector3();
const lookBase = new THREE.Vector3(0, 0.05, 0);
const look = new THREE.Vector3();
const closeOffset = new THREE.Vector3(0.45, 0.25, 2.1);
const closeLook = new THREE.Vector3(0.35, 0.05, 0);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const needWidth = 3.0;
  const dist = needWidth / (2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * camera.aspect);
  camBase.set(0, 0.35, Math.max(6.4, dist));
  camera.updateProjectionMatrix();
  goPreset(currentPreset, true);
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
let spin = 0;
let lastOpacity = -1;
const tmp = new THREE.Color();

function angleLerp(from, to, t) {
  const d = ((from - to + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return to + d * (1 - t);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!reduceMotion) spin += dt * 0.35;

  const k = Math.min(1, dt * 6);
  rig.explode += (rig.explodeTarget - rig.explode) * k;
  rig.zoom += (rig.zoomTarget - rig.zoom) * k;

  stage.position.set(rig.x, rig.y, 0);
  stage.scale.setScalar(rig.scale);
  holder.rotation.y = angleLerp(spin, rig.lockAngle, rig.lockMix);
  holder.rotation.x = 0.12;
  if (current) current.setExplode(rig.explode * rig.explodeMix);

  if (Math.abs(rig.opacity - lastOpacity) > 0.002) {
    canvas.style.opacity = rig.opacity.toFixed(3);
    lastOpacity = rig.opacity;
  }

  // Цвета сцены
  const sm = rig.sceneMix;
  renderer.setClearColor(tmp.copy(baseBg).lerp(sceneCol.bg, sm));
  key.color.copy(white).lerp(sceneCol.key, sm);
  rim.color.copy(white).lerp(sceneCol.rim, sm);
  fill.color.copy(white).lerp(sceneCol.fill, sm);
  rim.intensity = 1 + sm * 1.6;
  fill.intensity = 0.5 + sm * 0.6;
  pedestal.material.opacity = sm;
  pedestal.visible = sm > 0.01;
  pedestal.material.color.copy(sceneCol.pedestal);

  // Камера: от общего плана к крупному
  const z = rig.zoom * rig.zoomMix;
  camPos.copy(stage.position).add(closeOffset);
  camera.position.copy(camBase).lerp(camPos, z);
  look.copy(stage.position).add(closeLook);
  camera.lookAt(look.lerp(lookBase, 1 - z));

  renderer.render(scene, camera);
}

/* ---------- start ---------- */

readURL();
resize();
setScene(state.scene, true, false);

const loaderEl = $('#loader');
const loaderBar = $('#loaderBar');

function start() {
  showModel(state.model, true);
  if (state.size) $('#sizeResult').innerHTML = sizeText(SIZES.find((s) => s.eu === state.size));
  renderAll();
  saveURL();
  loaderEl.classList.add('is-done');
  renderer.setAnimationLoop(frame);
  ScrollTrigger.refresh();
}

loadReal('assets/aero.glb', (p) => { loaderBar.style.width = `${Math.round(p * 100)}%`; })
  .then((m) => {
    models.aero = m;
    window.__parts = m.partsCount;
  })
  .catch((err) => {
    console.error('Не загрузилась модель Orbit Aero', err);
    if (state.model === 'aero') state.model = 'court';
  })
  .finally(start);
