import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildProcedural } from './models/procedural.js';
import { loadReal } from './models/real.js';
import { MODELS, MODEL_ORDER, STAT_LABELS, SIZES, SCENES, THEMES } from './data.js';

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
// Сцена прозрачная: под ней фон с пятнами света (.backdrop)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
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

/* ---------- отражающий пол ---------- */

// Зеркало с размытием и угасанием к краям. Прозрачно там, где нечего отражать,
// поэтому фон с пятнами света остаётся виден.
const FloorShader = {
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    opacity: { value: 0.5 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec2 vPlaneUv;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vPlaneUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float opacity;
    varying vec4 vUv;
    varying vec2 vPlaneUv;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec4 sum = vec4(0.0);
      float r = 0.006 * vUv.w;
      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          sum += texture2DProj(tDiffuse, vUv + vec4(float(x) * r, float(y) * r, 0.0, 0.0));
        }
      }
      sum /= 9.0;
      float fade = 1.0 - smoothstep(0.05, 0.42, distance(vPlaneUv, vec2(0.5)));
      gl_FragColor = vec4(sum.rgb * color, sum.a * fade * opacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const floor = new Reflector(new THREE.PlaneGeometry(7, 7), {
  shader: FloorShader,
  color: 0xffffff,
  textureWidth: Math.round(window.innerWidth * Math.min(window.devicePixelRatio, 2) * 0.5),
  textureHeight: Math.round(window.innerHeight * Math.min(window.devicePixelRatio, 2) * 0.5),
});
floor.material.transparent = true;
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.6;
stage.add(floor);

// Мягкая тень под кроссовкой
function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(3.0, 1.3),
  new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false })
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.y = -0.595;
stage.add(contactShadow);

/* ---------- 3. искры при разборке ---------- */

const SPARKS = 420;
const sparkPos = new Float32Array(SPARKS * 3);
const sparkCol = new Float32Array(SPARKS * 3);
const sparkVel = new Float32Array(SPARKS * 3);
const sparkLife = new Float32Array(SPARKS);
const sparkMax = new Float32Array(SPARKS);
let sparkNext = 0;

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
  size: 0.06,
  map: makeDotTexture(),
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
sparks.frustumCulled = false;
holder.add(sparks);
const sparkColor = new THREE.Color();

function spawnSparks(n) {
  for (let i = 0; i < n; i++) {
    const k = sparkNext;
    sparkNext = (sparkNext + 1) % SPARKS;
    const x = (Math.random() * 2 - 1) * 1.0;
    const y = (Math.random() * 2 - 1) * 0.45;
    const z = (Math.random() * 2 - 1) * 0.3;
    sparkPos.set([x, y, z], k * 3);
    const len = Math.hypot(x, y, z) || 1;
    const sp = 0.6 + Math.random() * 1.4;
    sparkVel.set([(x / len) * sp, (y / len) * sp + 0.35, (z / len) * sp], k * 3);
    sparkMax[k] = 0.7 + Math.random() * 0.6;
    sparkLife[k] = sparkMax[k];
  }
}

function updateSparks(dt) {
  const drag = Math.max(0, 1 - dt * 2.2);
  for (let i = 0; i < SPARKS; i++) {
    if (sparkLife[i] <= 0) { sparkCol[i * 3] = sparkCol[i * 3 + 1] = sparkCol[i * 3 + 2] = 0; continue; }
    sparkLife[i] -= dt;
    const j = i * 3;
    sparkPos[j] += sparkVel[j] * dt;
    sparkPos[j + 1] += sparkVel[j + 1] * dt;
    sparkPos[j + 2] += sparkVel[j + 2] * dt;
    sparkVel[j] *= drag; sparkVel[j + 1] *= drag; sparkVel[j + 2] *= drag;
    const a = Math.max(0, sparkLife[i] / sparkMax[i]);
    sparkCol[j] = sparkColor.r * a;
    sparkCol[j + 1] = sparkColor.g * a;
    sparkCol[j + 2] = sparkColor.b * a;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
}

/* ---------- models ---------- */

const models = {};
for (const id of ['court', 'skate', 'trail']) models[id] = buildProcedural(id);
let current = null;

function colorsFor(id) {
  if (!state.colors[id]) state.colors[id] = { ...models[id].defaults };
  return state.colors[id];
}

// Смена модели: старая разлетается на детали и тает, новая собирается из деталей.
// swap — дополнительная разборка поверх скролла (0 — собрана, 1 — разобрана).
const onStage = new Set();

function showModel(id, instant = false) {
  const next = models[id];
  if (!next || next === current) return;
  const prev = current;
  current = next;
  next.applyColors(colorsFor(id));
  holder.add(next.root);
  onStage.add(next);
  gsap.killTweensOf(next);
  gsap.killTweensOf(next.root.scale);

  if (instant || reduceMotion) {
    if (prev) { holder.remove(prev.root); onStage.delete(prev); prev.swap = 0; }
    next.swap = 0;
    next.root.scale.setScalar(1);
    return;
  }

  if (prev) {
    gsap.killTweensOf(prev);
    gsap.to(prev, { swap: 1, duration: 0.7, ease: 'power2.in' });
    gsap.to(prev.root.scale, {
      x: 0.001, y: 0.001, z: 0.001, duration: 0.45, delay: 0.45, ease: 'power2.in',
      onComplete: () => { holder.remove(prev.root); onStage.delete(prev); prev.swap = 0; },
    });
  }

  next.swap = 1;
  next.root.scale.setScalar(0.001);
  gsap.to(next.root.scale, { x: 1, y: 1, z: 1, duration: 0.5, delay: prev ? 0.55 : 0, ease: 'power2.out' });
  gsap.to(next, { swap: 0, duration: 1.1, delay: prev ? 0.7 : 0.1, ease: 'power3.inOut' });
}

/* ---------- 1. палитра модели ---------- */

const rootStyle = document.documentElement.style;
const themeBg = new THREE.Color(THEMES.aero.bg);
const themeRim = new THREE.Color(THEMES.aero.glow[0]);
const themeAccent = new THREE.Color(THEMES.aero.accent);

function applyTheme(id, instant = false) {
  const t = THEMES[id];
  rootStyle.setProperty('--bg', t.bg);
  rootStyle.setProperty('--accent', t.accent);
  rootStyle.setProperty('--accent-ink', t.accentInk);
  t.glow.forEach((c, i) => rootStyle.setProperty(`--g${i + 1}`, c));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
  // Цвет фона и контрового света в 3D идёт вслед за CSS
  const bg = new THREE.Color(t.bg);
  const rimC = new THREE.Color(t.glow[0]);
  const acc = new THREE.Color(t.accent);
  if (instant || reduceMotion) {
    themeBg.copy(bg);
    themeRim.copy(rimC);
    themeAccent.copy(acc);
  } else {
    gsap.to(themeBg, { r: bg.r, g: bg.g, b: bg.b, duration: 1.2, ease: 'power2.out' });
    gsap.to(themeRim, { r: rimC.r, g: rimC.g, b: rimC.b, duration: 1.2, ease: 'power2.out' });
    gsap.to(themeAccent, { r: acc.r, g: acc.g, b: acc.b, duration: 0.8, ease: 'power2.out' });
  }
  setMarquee(id);
}

/* ---------- 2. бегущее название модели ---------- */

const marquee = document.getElementById('marquee');
const marqueeTrack = document.getElementById('marqueeTrack');
let marqueeX = 0;
let marqueeDir = -1;
let marqueeUnit = 1;

function setMarquee(id) {
  const name = MODELS[id].name.toUpperCase();
  const item = `<span>${name}</span><span class="marquee__dot">●</span>`;
  marqueeTrack.innerHTML = item.repeat(8);
  // Ширина одного повтора: по ней заворачиваем ленту без шва
  requestAnimationFrame(() => {
    marqueeUnit = Math.max(1, marqueeTrack.scrollWidth / 8);
  });
}

function updateMarquee(dt) {
  // Скорость скролла разгоняет ленту и затухает, направление следует за скроллом
  const v = scrollVel;
  scrollVel *= Math.max(0, 1 - dt * 4);
  if (Math.abs(v) > 30) marqueeDir = v > 0 ? -1 : 1;
  const speed = 60 + Math.min(1600, Math.abs(v) * 0.6);
  marqueeX += marqueeDir * speed * dt;
  marqueeX = ((marqueeX % marqueeUnit) + marqueeUnit) % marqueeUnit - marqueeUnit;
  marqueeTrack.style.transform = `translate3d(${marqueeX.toFixed(1)}px, 0, 0)`;
}

let scrollVel = 0;
ScrollTrigger.create({
  start: 0,
  end: 'max',
  onUpdate: (self) => { scrollVel = self.getVelocity(); },
});

/* ---------- 5. модель тянется за курсором или наклоном телефона ---------- */

const follow = { x: 0, y: 0, tx: 0, ty: 0 };
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  follow.tx = (e.clientX / window.innerWidth) * 2 - 1;
  follow.ty = (e.clientY / window.innerHeight) * 2 - 1;
});
document.addEventListener('mouseleave', () => { follow.tx = 0; follow.ty = 0; });

let beta0 = null;
function onOrient(e) {
  if (e.gamma == null || e.beta == null) return;
  if (beta0 === null) beta0 = e.beta;
  follow.tx = clamp1(e.gamma / 25);
  follow.ty = clamp1((e.beta - beta0) / 25);
}

function setupTilt() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (!coarse || reduceMotion || typeof DeviceOrientationEvent === 'undefined') return;
  // iOS спрашивает разрешение только по нажатию, поэтому там кнопка
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const btn = $('#tiltBtn');
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res === 'granted') {
          window.addEventListener('deviceorientation', onOrient);
          btn.hidden = true;
        } else {
          btn.textContent = 'Наклон не разрешён';
          btn.disabled = true;
        }
      } catch {
        btn.hidden = true;
      }
    });
  } else {
    window.addEventListener('deviceorientation', onOrient);
  }
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
  applyTheme(id);
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
  const pr = renderer.getPixelRatio() * 0.5;
  floor.getRenderTarget().setSize(Math.round(w * pr), Math.round(h * pr));
  camera.aspect = w / h;
  const needWidth = 3.0;
  const dist = needWidth / (2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * camera.aspect);
  camBase.set(0, 0.35, Math.max(6.4, dist));
  camera.updateProjectionMatrix();
  goPreset(currentPreset, true);
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
const backdrop = $('#backdrop');
let backdropScene = false;
let lastExSum = 0;
let lastMarquee = -1;
let spin = 0;

// Пятна света смещаются по мере прокрутки страницы
ScrollTrigger.create({
  start: 0,
  end: 'max',
  onUpdate: (self) => backdrop.style.setProperty('--sy', self.progress.toFixed(4)),
});
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
  // Курсор или наклон: в крупном плане почти не двигаем, чтобы не мельтешило
  const kf = Math.min(1, dt * 4);
  follow.x += (follow.tx - follow.x) * kf;
  follow.y += (follow.ty - follow.y) * kf;
  const amt = reduceMotion ? 0 : 1 - 0.85 * rig.zoomMix;
  holder.rotation.y = angleLerp(spin, rig.lockAngle, rig.lockMix) + follow.x * 0.45 * amt;
  holder.rotation.x = 0.12 + follow.y * 0.18 * amt;

  // Разборка: скролл для текущей модели плюс swap при смене моделей
  const scrollEx = rig.explode * rig.explodeMix;
  let exSum = 0;
  let exMax = 0;
  for (const m of onStage) {
    const e = Math.max(m === current ? scrollEx : 0, m.swap || 0);
    m.setExplode(e);
    exSum += e;
    exMax = Math.max(exMax, e);
  }

  // Искры: чем быстрее детали разъезжаются или съезжаются, тем больше вылетает
  const exDelta = Math.abs(exSum - lastExSum);
  lastExSum = exSum;
  if (!reduceMotion && exDelta > 0.0005) spawnSparks(Math.min(30, Math.ceil(exDelta * 500)));
  sparkColor.copy(themeAccent);
  updateSparks(dt);

  // Пол и тень: прячем, как только детали начали разъезжаться, и в сценах и крупном плане
  const z = rig.zoom * rig.zoomMix;
  const floorAmt = (1 - Math.min(1, exMax * 4)) * (1 - rig.sceneMix) * (1 - z);
  floor.material.uniforms.opacity.value = 0.8 * floorAmt;
  floor.visible = floorAmt > 0.01;
  contactShadow.material.opacity = floorAmt;
  contactShadow.visible = floorAmt > 0.01;

  if (Math.abs(rig.opacity - lastOpacity) > 0.002) {
    canvas.style.opacity = rig.opacity.toFixed(3);
    lastOpacity = rig.opacity;
  }

  const mq = rig.opacity * (1 - rig.sceneMix) * (1 - z);
  if (Math.abs(mq - lastMarquee) > 0.002) {
    marquee.style.opacity = (mq * 0.9).toFixed(3);
    lastMarquee = mq;
  }
  if (!reduceMotion) updateMarquee(dt);

  // Цвета сцены
  // В блоке сцен фон и свет берутся из сцены, вне его — из палитры модели
  const sm = rig.sceneMix;
  if (sm > 0.001) {
    backdrop.style.backgroundColor = `#${tmp.copy(themeBg).lerp(sceneCol.bg, sm).getHexString()}`;
    if (!backdropScene) { backdrop.classList.add('blobs-off'); backdropScene = true; }
  } else if (backdropScene) {
    backdrop.style.backgroundColor = '';
    backdrop.classList.remove('blobs-off');
    backdropScene = false;
  }
  key.color.copy(white).lerp(sceneCol.key, sm);
  rim.color.copy(white).lerp(themeRim, 0.45).lerp(sceneCol.rim, sm);
  fill.color.copy(white).lerp(sceneCol.fill, sm);
  rim.intensity = 1 + sm * 1.6;
  fill.intensity = 0.5 + sm * 0.6;
  pedestal.material.opacity = sm;
  pedestal.visible = sm > 0.01;
  pedestal.material.color.copy(sceneCol.pedestal);

  // Камера: от общего плана к крупному
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
  applyTheme(state.model, true);
  showModel(state.model, true);
  setupTilt();
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
