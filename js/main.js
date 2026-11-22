import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { loadGltfModel } from './models/gltf.js?v=9';
import { createScenes } from './scenes.js?v=9';
import { loadReal } from './models/real.js?v=9';
import { MODELS, MODEL_ORDER, SCENES, THEMES, T } from './data.js?v=9';

// Корень сайта: английская версия лежит в en/, а модели — в корне
const ROOT = new URL('../', import.meta.url);

gsap.registerPlugin(ScrollTrigger);

/* GitHub Pages разрешает браузеру держать страницу ~10 минут, телефоны держат и дольше.
   Сверяем свою метку ?v= с копией на сервере и один раз перезагружаемся, если там новее.
   При новом релизе метку ?v= нужно поднять во всех файлах сразу. */
(async () => {
  try {
    const mine = (document.querySelector('script[src*="main.js"]')?.src.match(/[?&]v=(\d+)/) || [])[1];
    const html = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const live = (html.match(/main\.js\?v=(\d+)/) || [])[1];
    if (mine && live && Number(live) > Number(mine) && sessionStorage.getItem('orbit-reloaded') !== live) {
      sessionStorage.setItem('orbit-reloaded', live);
      location.reload();
    }
  } catch { /* нет сети или хранилища: оставляем страницу как есть */ }
})();

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?debug читаем сразу: ниже адрес перезаписывается параметрами модели и сцены
const DEBUG = new URLSearchParams(location.search).has('debug');
const isMobile = () => window.innerWidth < 760;
const $ = (s) => document.querySelector(s);

/* ---------- плавная прокрутка ---------- */

// Lenis сглаживает скролл. Ограничиваем, насколько страница может «убежать» вперёд
// за один жест, и гасим разгон после свайпа: одним махом всё не пролистать.
const MAX_AHEAD = 0.5; // доля высоты экрана
let lenis = null;
if (!reduceMotion && window.Lenis) {
  lenis = new window.Lenis({
    lerp: 0.07,
    wheelMultiplier: 0.7,
    syncTouch: true,
    syncTouchLerp: 0.06,
    touchMultiplier: 0.9,
    touchInertiaMultiplier: 18,
    virtualScroll(e) {
      if (e.event.type === 'touchend') {
        // После свайпа страница докатывается не дальше чем на ~0,9 экрана
        const vMax = (innerHeight * 0.9) / lenis.options.touchInertiaMultiplier;
        lenis.velocity = Math.max(-vMax, Math.min(vMax, lenis.velocity));
        return true;
      }
      const cap = innerHeight * MAX_AHEAD;
      const ahead = lenis.targetScroll - lenis.animatedScroll;
      const room = e.deltaY > 0 ? cap - ahead : -cap - ahead;
      e.deltaY = e.deltaY > 0 ? Math.max(0, Math.min(e.deltaY, room)) : Math.min(0, Math.max(e.deltaY, room));
      return true;
    },
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function scrollToEl(el) {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
}

// Переключатель языка уносит с собой выбранную модель и сцену
document.querySelector('.lang')?.addEventListener('click', (e) => {
  e.preventDefault();
  location.href = e.currentTarget.getAttribute('href') + location.search;
});

// Ссылки меню тоже едут плавно
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const el = document.querySelector(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    scrollToEl(el);
  });
});

/* ---------- state ---------- */

const state = {
  model: MODEL_ORDER[0],
  scene: 'city',
};

/* ---------- renderer and scene ---------- */

const canvas = $('#canvas');
// Сцена прозрачная: под ней фон с пятнами света (.backdrop)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
// Разрешение рендера: на ретине 1.5 вместо 2–3 почти не видно, а работы втрое меньше.
// Дальше оно подстраивается под реальную скорость (adaptQuality ниже).
const MAX_DPR = Math.min(window.devicePixelRatio, window.innerWidth < 760 ? 1.5 : 1.75);
let dpr = MAX_DPR;
renderer.setPixelRatio(dpr);
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

// Постаменты, фон и свет блока сцен — в js/scenes.js
const FLOOR_Y = -0.6; // уровень пола: на нём стоят кроссовки, отражение и постаменты
const scenes = createScenes({ stage, floorY: FLOOR_Y, backdrop: document.getElementById('backdrop'), reduceMotion });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Тени пересчитываем только пока блок сцен на экране
renderer.shadowMap.autoUpdate = false;

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
floor.position.y = FLOOR_Y;
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
contactShadow.position.y = FLOOR_Y + 0.004;
stage.add(contactShadow);

/* ---------- блик курсора на полу ---------- */

// Светящаяся точка висит над полом там, куда указывает курсор: зеркальный пол
// её отражает, а пятно и слабый свет под ней подсвечивают кроссовку.
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const glowTex = makeGlowTexture();
const cursorOrb = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
}));
cursorOrb.scale.setScalar(0.32);
const cursorPool = new THREE.Mesh(
  new THREE.PlaneGeometry(1.4, 1.4),
  new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
);
cursorPool.rotation.x = -Math.PI / 2;
const cursorLight = new THREE.PointLight(0xffffff, 0, 2.2, 1.6);
stage.add(cursorOrb, cursorPool, cursorLight);

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const floorPlane = new THREE.Plane();
const hitWorld = new THREE.Vector3();
let pointerActive = false;
let cursorAmt = 0;

window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  pointerActive = true;
});
document.addEventListener('mouseleave', () => { pointerActive = false; });

function updateCursorGlow(dt, floorAmt) {
  let target = 0;
  if (pointerActive && !reduceMotion && floorAmt > 0.05) {
    // Плоскость пола в мировых координатах (сцена не наклонена, нормаль — вверх)
    floor.updateMatrixWorld();
    floorPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3().setFromMatrixPosition(floor.matrixWorld));
    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.ray.intersectPlane(floorPlane, hitWorld)) {
      const local = stage.worldToLocal(hitWorld.clone());
      const r = Math.hypot(local.x, local.z);
      if (r < 2.6) {
        target = floorAmt * (1 - Math.max(0, (r - 1.6) / 1.0));
        cursorOrb.position.set(local.x, FLOOR_Y + 0.1, local.z);
        cursorPool.position.set(local.x, FLOOR_Y + 0.006, local.z);
        cursorLight.position.set(local.x, FLOOR_Y + 0.35, local.z);
      }
    }
  }
  cursorAmt += (target - cursorAmt) * Math.min(1, dt * 8);
  const on = cursorAmt > 0.01;
  cursorOrb.visible = cursorPool.visible = on;
  cursorOrb.material.opacity = cursorAmt;
  cursorPool.material.opacity = cursorAmt * 0.45;
  cursorLight.intensity = cursorAmt * 1.6;
  cursorOrb.material.color.copy(themeAccent);
  cursorPool.material.color.copy(themeAccent);
  cursorLight.color.copy(themeAccent);
}

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

let sparksUntil = 0;
let sparksClear = true;

function spawnSparks(n) {
  sparksUntil = performance.now() + 1500;
  sparksClear = false;
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
  // Пока искр нет, буферы не трогаем
  if (sparksClear) return;
  if (performance.now() > sparksUntil) {
    sparkLife.fill(0);
    sparkCol.fill(0);
    sparkGeo.attributes.color.needsUpdate = true;
    sparksClear = true;
    return;
  }
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

// Модели грузятся по мере надобности: сначала открытая, остальные в фоне.
const models = {};
const loading = {};
let current = null;

// Подстройка под конкретный файл: что выбросить, как повернуть.
// Заполняется после осмотра скачанных моделей.
const TUNING = {
  jordan1: { rotate: [0, Math.PI / 2, 0] },
  nb997: { rotate: [0, Math.PI / 2, 0] },
  // Скан из одного куска: выравниваем и режем по высоте на слои
  xultra: { autoAlign: true, slice: [[0.1, 'sole'], [0.27, 'sole'], [0.8, 'upper'], [1, 'top']] },
  pegasus36: { rotate: [0, Math.PI / 2, 0] },
};

function loadModel(id, onProgress) {
  if (models[id]) return Promise.resolve(models[id]);
  if (!loading[id]) {
    const m = MODELS[id];
    const url = new URL(`${m.file}?v=9`, ROOT).href;
    loading[id] = (id === 'aero' ? loadReal(url, onProgress) : loadGltfModel(id, url, TUNING[id], onProgress))
      .then((model) => {
        seat(model);
        // Шейдеры модели собираем в фоне, пока её не показали: смена модели без фриза
        renderer.compileAsync?.(model.root, camera, scene).catch(() => {});
        // И текстуры заливаем в видеопамять заранее, иначе первый кадр с моделью подвисает
        warmTextures(model.root);
        models[id] = model;
        renderPicker();
        renderCompare();
        return model;
      })
      .catch((err) => {
        console.warn(`Модель ${id} не загрузилась`, err);
        loading[id] = null;
        return null;
      });
  }
  return loading[id];
}

const colorsFor = (id) => models[id]?.defaults || {};

const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
// Текстуры заливаем по одной за кадр, чтобы не было одного длинного кадра
async function warmTextures(root) {
  const list = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const k of TEX_SLOTS) if (m[k]) list.add(m[k]);
    }
  });
  for (const t of list) {
    await new Promise((r) => requestAnimationFrame(() => r()));
    renderer.initTexture(t);
  }
}

// Ставим модель подошвой на пол: модели разной высоты, центр у всех в нуле.
function seat(model) {
  model.setExplode(0);
  model.root.position.set(0, 0, 0);
  model.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.root);
  model.root.position.y = FLOOR_Y + 0.035 - box.min.y;
  // Кроссовка отбрасывает тень на постамент в сценах
  model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
          btn.textContent = T.tiltDenied;
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

/* ---------- вращение пальцем или мышью ---------- */

// Горизонтальный жест на первом экране и в сценах крутит кроссовку,
// вертикальный остаётся прокруткой. После отпускания вращение докатывается.
let dragVel = 0;
let dragging = null;
const dragHint = $('#dragHint');

function bindDrag(el) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('button, a, input, .picker, .panel')) return;
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), decided: false, horiz: false };
    dragVel = 0;
  });
}
['#hero', '#scenes'].forEach((s) => bindDrag($(s)));

window.addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== dragging.id) return;
  const dx = e.clientX - dragging.x;
  const dy = e.clientY - dragging.y;
  if (!dragging.decided && Math.hypot(dx, dy) > 8) {
    dragging.decided = true;
    dragging.horiz = Math.abs(dx) > Math.abs(dy) * 1.2;
    if (dragging.horiz) { document.body.classList.add('is-dragging'); dragHint?.classList.add('is-gone'); }
  }
  if (!dragging.horiz) return;
  const now = performance.now();
  const d = dx * 0.011;
  spin += d;
  dragVel = (d / Math.max(8, now - dragging.t)) * 16;
  dragging.x = e.clientX;
  dragging.y = e.clientY;
  dragging.t = now;
});
const endDrag = (e) => {
  if (!dragging || (e.pointerId !== undefined && e.pointerId !== dragging.id)) return;
  dragging = null;
  document.body.classList.remove('is-dragging');
};
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

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
    case 'hero': return { ...base, x: m ? 0 : 0.95, y: m ? -0.45 : -0.1, scale: m ? 0.92 : 1.05 };
    case 'explode': return { ...base, x: m ? 0 : -0.8, y: m ? 0.5 : 0, scale: m ? 0.72 : 0.95, explodeMix: 1, lockMix: 1, lockAngle: -0.55 };
    case 'dim': return { ...base, x: 0, y: m ? 0.6 : 0.2, scale: 0.8, opacity: 0.16 };
    case 'closeup': return { ...base, x: 0, y: m ? 0.15 : 0, scale: 1, zoomMix: 1, lockMix: 1, lockAngle: 0 };
    // На телефоне постамент стоит на линии горизонта фона, панель — ниже
    case 'scenes': return { ...base, x: m ? 0 : 0.85, y: m ? 0.75 : 0.15, scale: m ? 0.72 : 0.95, sceneMix: 1 };
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
  scenes.setScene(id, instant);
  renderScenes();
  if (save) saveURL();
}

/* ---------- UI: 1. выбор модели ---------- */

const pad = (n) => String(n).padStart(2, '0');

async function selectModel(id) {
  if (!MODELS[id] || id === state.model) return;
  state.model = id;
  applyTheme(id);
  renderAll();
  saveURL();
  const model = await loadModel(id);
  if (model && state.model === id) showModel(id);
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
    b.innerHTML = `<span class="pick__tag">${m.brand}</span><span class="pick__name">${m.name}</span><span class="pick__price">${m.year}</span>`;
    b.addEventListener('click', () => selectModel(id));
    el.appendChild(b);
  }
  const m = MODELS[state.model];
  $('#heroBrand').textContent = `${m.brand} · ${m.year}`;
  $('#heroName').textContent = m.name;
  $('#heroTagline').textContent = m.tagline;
  $('#topCount').textContent = `${pad(MODEL_ORDER.indexOf(state.model) + 1)} / ${pad(MODEL_ORDER.length)}`;
}

/* ---------- UI: 3. паспорт моделей ---------- */

function renderCompare() {
  const grid = $('#compareGrid');
  grid.innerHTML = '';
  for (const id of MODEL_ORDER) {
    const m = MODELS[id];
    const st = models[id]?.partsCount;
    const card = document.createElement('article');
    card.className = `card${id === state.model ? ' is-current' : ''}`;
    card.tabIndex = 0;
    card.setAttribute('aria-label', `${m.brand} ${m.name}, ${T.show}`);
    const rows = [
      [T.passport.brand, m.brand],
      [T.passport.year, m.year],
      [T.passport.type, m.category],
      [T.passport.parts, st ?? '…'],
      [T.passport.author, m.credit.author.split(' (')[0]],
    ].map(([k, v]) => `<div class="stat__row"><span>${k}</span><b>${v}</b></div>`).join('');
    card.innerHTML = `<h3>${m.name}</h3><p class="card__price">${m.tagline}</p>${rows}`;
    const pick = () => { selectModel(id); scrollToEl($('#hero')); };
    card.addEventListener('click', pick);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    grid.appendChild(card);
  }
}

function renderCredits() {
  $('#credits').innerHTML = MODEL_ORDER.map((id) => {
    const c = MODELS[id].credit;
    return `<li><a href="${c.url}" target="_blank" rel="noopener">${c.title}</a> — ${c.author}</li>`;
  }).join('');
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

function renderAll() {
  renderPicker();
  renderCompare();
  renderMaterial();
  renderScenes();
}

/* ---------- URL: модель и сцена в ссылке ---------- */

function saveURL() {
  const p = new URLSearchParams();
  p.set('m', state.model);
  if (state.scene !== 'city') p.set('sc', state.scene);
  history.replaceState(null, '', `?${p}${location.hash}`);
}

function readURL() {
  const p = new URLSearchParams(location.search);
  const m = p.get('m');
  if (m && MODELS[m]) state.model = m;
  const sc = p.get('sc');
  if (sc && SCENES[sc]) state.scene = sc;
}

/* ---------- подписи деталей ---------- */

const calloutsEl = $('#callouts');
const calloutSvg = $('#calloutLines');
const SVGNS = 'http://www.w3.org/2000/svg';
const callouts = ['top', 'upper', 'inner', 'sole'].map((type) => {
  const label = document.createElement('div');
  label.className = 'callout';
  label.style.opacity = '0';
  calloutsEl.appendChild(label);
  const line = document.createElementNS(SVGNS, 'line');
  const dot = document.createElementNS(SVGNS, 'circle');
  dot.setAttribute('r', '3.5');
  line.style.opacity = dot.style.opacity = '0';
  calloutSvg.append(line, dot);
  return { type, label, line, dot, shown: 0, text: '' };
});
const anchorV = new THREE.Vector3();
const centerV = new THREE.Vector3();

// Подпись появляется, когда её деталь отъехала, и уводится линией от центра модели
let calloutsIdle = true;
function updateCallouts(scrollEx) {
  // Вне блока разбора и когда всё скрыто — ничего не считаем и не трогаем DOM
  if (rig.explodeMix < 0.005 && calloutsIdle) return;
  calloutsIdle = callouts.every((c) => c.shown < 0.01) && rig.explodeMix < 0.005;
  const model = current;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const anchors = model?.anchors || [];
  const labels = MODELS[state.model]?.labels || {};
  centerV.setFromMatrixPosition(holder.matrixWorld).project(camera);
  const cx = ((centerV.x + 1) / 2) * W;
  const cy = ((1 - centerV.y) / 2) * H;
  const dist = isMobile() ? 50 : 105;

  for (const c of callouts) {
    const a = anchors.find((x) => x.type === c.type);
    let target = 0;
    if (a && labels[c.type] && (model.swap || 0) < 0.01) {
      const x = scrollEx * 4 - a.step;
      target = Math.min(1, Math.max(0, (x - 0.35) / 0.4)) * rig.explodeMix * rig.opacity;
    }
    c.shown += (target - c.shown) * 0.2;
    if (c.shown < 0.01) {
      if (c.label.style.opacity !== '0') c.label.style.opacity = c.line.style.opacity = c.dot.style.opacity = '0';
      continue;
    }
    anchorV.copy(a.center);
    a.obj.localToWorld(anchorV);
    anchorV.project(camera);
    const px = ((anchorV.x + 1) / 2) * W;
    const py = ((1 - anchorV.y) / 2) * H;
    let dx = px - cx;
    let dy = py - cy;
    const len = Math.hypot(dx, dy);
    if (len < 6) { dx = -1; dy = 0; } else { dx /= len; dy /= len; }

    const text = labels[c.type];
    if (c.text !== text) { c.label.textContent = text; c.text = text; }
    const lw = c.label.offsetWidth;
    const lh = c.label.offsetHeight;
    const lx = px + dx * dist;
    const ly = py + dy * dist * 0.75;
    let bx = dx < 0 ? lx - lw : lx;
    let by = ly - lh / 2;
    bx = Math.min(W - lw - 8, Math.max(8, bx));
    by = Math.min(H - lh - 8, Math.max(64, by));
    c.label.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
    const o = c.shown.toFixed(3);
    c.label.style.opacity = c.line.style.opacity = c.dot.style.opacity = o;
    const ex = dx < 0 ? bx + lw : bx;
    const ey = by + lh / 2;
    c.line.setAttribute('x1', px.toFixed(1));
    c.line.setAttribute('y1', py.toFixed(1));
    c.line.setAttribute('x2', ex.toFixed(1));
    c.line.setAttribute('y2', ey.toFixed(1));
    c.dot.setAttribute('cx', px.toFixed(1));
    c.dot.setAttribute('cy', py.toFixed(1));
  }
}

/* ---------- resize and loop ---------- */

const camBase = new THREE.Vector3();
const camPos = new THREE.Vector3();
const lookBase = new THREE.Vector3(0, 0.05, 0);
const look = new THREE.Vector3();
const closeOffset = new THREE.Vector3(0.45, 0.25, 2.1);
const closeLook = new THREE.Vector3(0.35, 0.05, 0);

function resize() {
  // На узком экране крупный план отъезжает и смотрит выше, чтобы кроссовка
  // была над текстом, а не под ним
  if (window.innerWidth < 760) { closeOffset.set(0.2, -0.12, 3.0); closeLook.set(0.15, -0.42, 0); }
  else { closeOffset.set(0.45, 0.25, 2.1); closeLook.set(0.35, 0.05, 0); }
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

// Адаптивное разрешение: если кадр стабильно дольше ~22 мс, снижаем плотность
// пикселей шагами по 0.25 (до 1), если устройство справляется с запасом — возвращаем.
let qAcc = 0;
let qFrames = 0;
function setRenderSize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  const pr = dpr * 0.5;
  floor.getRenderTarget().setSize(Math.round(w * pr), Math.round(h * pr));
}
function adaptQuality(ms) {
  if (ms > 250) return; // вкладка была в фоне
  qAcc += ms;
  qFrames++;
  if (qFrames < 90) return;
  const avg = qAcc / qFrames;
  qAcc = 0;
  qFrames = 0;
  if (avg > 22 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); setRenderSize(); }
  else if (avg < 13 && dpr < MAX_DPR) { dpr = Math.min(MAX_DPR, dpr + 0.25); setRenderSize(); }
}

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
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  adaptQuality(raw * 1000);
  if (!reduceMotion && !dragging) spin += dt * 0.35;
  // Докат после жеста
  if (!dragging && Math.abs(dragVel) > 0.0001) {
    spin += dragVel * dt * 60;
    dragVel *= Math.pow(0.9, dt * 60);
  }

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
  // На постаменте и у пола наклон меньше, чтобы носок не уходил в поверхность
  holder.rotation.x = 0.05 + follow.y * 0.12 * amt * (1 - rig.sceneMix * 0.8);

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
  updateCursorGlow(dt, floorAmt);

  // intro.v — проявление сцены после загрузки (0 → 1)
  const co = rig.opacity * intro.v;
  if (Math.abs(co - lastOpacity) > 0.002) {
    canvas.style.opacity = co.toFixed(3);
    lastOpacity = co;
  }

  const mq = rig.opacity * (1 - rig.sceneMix) * (1 - z) * intro.v;
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
  // Свой свет у каждой сцены: общий свет приглушаем, чтобы он не забивал её
  const { wc, wg, wt } = scenes.update(sm, performance.now() / 1000);
  if (sm > 0.01) renderer.shadowMap.needsUpdate = true;
  key.intensity = 2 - wc * 1.2 - wg * 1.5 - wt * 1.1;
  rim.intensity = 1 + sm * 1.2;
  fill.intensity = 0.5 - wg * 0.35 - wt * 0.2;

  // Камера: от общего плана к крупному
  camPos.copy(stage.position).add(closeOffset);
  camera.position.copy(camBase).lerp(camPos, z);
  look.copy(stage.position).add(closeLook);
  camera.lookAt(look.lerp(lookBase, 1 - z));

  renderer.render(scene, camera);
  updateCallouts(scrollEx);
}

/* ---------- start ---------- */

readURL();
resize();
setScene(state.scene, true, false);

const loaderEl = $('#loader');

/* ---------- вход после загрузки ---------- */

// Экран загрузки растворяется в темноте, из неё проступает фон со светом,
// кроссовка собирается из деталей, затем по очереди выезжают тексты и карточки.
const intro = { v: 0 };

function runIntro() {
  const textEls = [...document.querySelectorAll('.hero__text > *:not([hidden])')];
  // Ленту анимируем целиком: карточки внутри перерисовываются, когда догружаются модели
  const cards = [$('#picker')];
  const chrome = [$('.top'), $('#dragHint')].filter(Boolean);
  const bd = $('#backdrop');

  if (reduceMotion) {
    intro.v = 1;
    loaderEl.classList.add('is-done');
    loadRest();
    return;
  }

  // CSS-переход экрана загрузки отключаем: прозрачностью теперь управляет таймлайн
  loaderEl.style.transition = 'none';
  // Стартовое состояние: всё в темноте, кроссовка разобрана
  gsap.set(bd, { opacity: 0 });
  gsap.set([...textEls, ...cards], { opacity: 0, y: 26 });
  gsap.set(chrome, { opacity: 0 });
  if (current) {
    current.swap = 1;
    current.root.scale.setScalar(0.9);
  }

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.to(loaderEl, { opacity: 0, duration: 0.7, ease: 'power2.inOut', onComplete: () => loaderEl.classList.add('is-done') }, 0)
    .to(bd, { opacity: 1, duration: 1.4, ease: 'power2.out' }, 0.15)
    .to(intro, { v: 1, duration: 1.1, ease: 'power2.out' }, 0.35);
  if (current) {
    tl.to(current, { swap: 0, duration: 1.6, ease: 'power3.inOut' }, 0.35)
      .to(current.root.scale, { x: 1, y: 1, z: 1, duration: 1.6, ease: 'power3.out' }, 0.35);
  }
  tl.to(chrome, { opacity: 1, duration: 0.8 }, 0.7)
    .to(textEls, { opacity: 1, y: 0, duration: 0.9, stagger: 0.09 }, 0.75)
    .to(cards, { opacity: 1, y: 0, duration: 0.8, stagger: 0.07 }, 1.05)
    // Убираем инлайновые стили, чтобы дальше всё работало как обычно
    .add(() => gsap.set([...textEls, ...cards, ...chrome, bd], { clearProps: 'opacity,transform' }))
    .add(loadRest, '+=0.3');
}
const loaderBar = $('#loaderBar');

function start() {
  applyTheme(state.model, true);
  showModel(state.model, true);
  setupTilt();
  renderAll();
  renderCredits();
  saveURL();
  // Прогрев: шейдеры всего, что появится позже (постаменты сцен, тени), собираем
  // сейчас, под экраном загрузки, а не в момент первого показа
  // Одной компиляции мало: ещё нужны шейдеры теней и загрузка текстур в видеопамять,
  // поэтому делаем одну настоящую отрисовку со всеми постаментами и тенями.
  const restore = scenes.prepareWarmup();
  try {
    renderer.compile(scene, camera);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  } catch { /* не критично */ }
  restore();
  renderer.setAnimationLoop(frame);
  // Прогрев занимает пару сотен миллисекунд: стартуем вход через два кадра,
  // чтобы эта пауза не съела начало анимации
  requestAnimationFrame(() => requestAnimationFrame(runIntro));
  // Для замеров и тестов: ?debug в адресе открывает доступ к прокрутке и кадрам
  if (DEBUG) window.__orbit = { lenis, renderer, frame };
  ScrollTrigger.refresh();
}

// Остальные модели догружаем в фоне по очереди, когда вход закончился:
// загрузка текстур в видеопамять во время анимации давала рывки
function loadRest() {
  MODEL_ORDER.filter((id) => id !== state.model).reduce((p, id) => p.then(() => loadModel(id)), Promise.resolve());
}

loadModel(state.model, (p) => { loaderBar.style.width = `${Math.round(p * 100)}%`; })
  .then(async (m) => {
    // Если файла нет (ещё не скачан), открываем первую модель, которая загрузится
    if (!m) {
      for (const id of MODEL_ORDER) {
        if (await loadModel(id)) { state.model = id; break; }
      }
    }
  })
  .finally(start);
