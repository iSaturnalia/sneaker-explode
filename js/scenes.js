import * as THREE from 'three';

// Блок «Где носить»: у каждой сцены свой фон (HTML/SVG за прозрачной 3D-сценой),
// свой свет и свой постамент. Сцены плавно перетекают друг в друга по весам.

const IDS = ['city', 'gym', 'trail'];

/* ---------- фоны ---------- */

let seed = 3;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function skylineSvg() {
  // Два ряда домов: дальний светлее, ближний темнее, окна светятся
  let far = '';
  let near = '';
  let wins = '';
  let x = 0;
  while (x < 1600) {
    const w = 40 + rnd() * 70;
    const h = 120 + rnd() * 260;
    far += `<rect x="${x.toFixed(0)}" y="${(520 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"/>`;
    x += w + 6;
  }
  x = -20;
  while (x < 1600) {
    const w = 60 + rnd() * 110;
    const h = 80 + rnd() * 200;
    const top = 600 - h;
    near += `<rect x="${x.toFixed(0)}" y="${top.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"/>`;
    for (let wy = top + 14; wy < 590; wy += 16) {
      for (let wx = x + 8; wx < x + w - 10; wx += 13) {
        if (rnd() < 0.32) {
          const c = rnd() < 0.7 ? '#ffd9a0' : rnd() < 0.5 ? '#3ee0ff' : '#ff3ea5';
          wins += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="6" height="8" fill="${c}" opacity="${(0.35 + rnd() * 0.6).toFixed(2)}"/>`;
        }
      }
    }
    x += w + 4;
  }
  return `<svg class="sb-skyline" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice">
    <g fill="#1a1636" opacity=".85">${far}</g>
    <g fill="#0b0a1a">${near}</g>
    <g>${wins}</g>
  </svg>`;
}

function mountainsSvg() {
  // Три слоя гор и ельник на переднем плане
  const ridge = (base, amp, step, jag) => {
    let d = `M0 600 L0 ${base}`;
    for (let x = 0; x <= 1600; x += step) {
      const y = base - amp * (0.5 + 0.5 * Math.sin(x / 260 + base)) - rnd() * jag;
      d += ` L${x} ${y.toFixed(0)}`;
    }
    return `${d} L1600 600 Z`;
  };
  let trees = '';
  for (let x = -10; x < 1620; x += 18 + rnd() * 26) {
    const h = 60 + rnd() * 110;
    const w = h * 0.38;
    const b = 600;
    trees += `<path d="M${x.toFixed(0)} ${b} L${(x + w / 2).toFixed(0)} ${(b - h).toFixed(0)} L${(x + w).toFixed(0)} ${b} Z"/>`;
  }
  return `<svg class="sb-mountains" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice">
    <path d="${ridge(330, 120, 40, 40)}" fill="#3e5a46" opacity=".75"/>
    <path d="${ridge(410, 90, 30, 30)}" fill="#26402f"/>
    <path d="${ridge(480, 60, 24, 24)}" fill="#18291f"/>
    <g fill="#0d1a12">${trees}</g>
  </svg>`;
}

function hoopSvg() {
  return `<svg class="sb-hoop" viewBox="0 0 200 260">
    <rect x="20" y="10" width="160" height="110" rx="4" fill="none" stroke="#f5e6d0" stroke-width="5" opacity=".55"/>
    <rect x="70" y="55" width="60" height="45" fill="none" stroke="#f5e6d0" stroke-width="4" opacity=".55"/>
    <ellipse cx="100" cy="120" rx="34" ry="7" fill="none" stroke="#ff7a2f" stroke-width="5"/>
    <path d="M70 122 L82 180 M85 124 L92 182 M100 126 L100 184 M115 124 L108 182 M130 122 L118 180 M76 150 L124 150" stroke="#f5e6d0" stroke-width="2" opacity=".5" fill="none"/>
  </svg>`;
}

function buildBackgrounds(parent) {
  const wrap = document.createElement('div');
  wrap.className = 'scenebg';
  wrap.innerHTML = `
    <div class="sb sb-city">
      <div class="sb-city__sky"></div>
      <div class="sb-city__neon"></div>
      ${skylineSvg()}
      <div class="sb-city__rain"></div>
      <div class="sb-city__wet"></div>
    </div>
    <div class="sb sb-gym">
      <div class="sb-gym__wall"></div>
      ${hoopSvg()}
      <div class="sb-gym__floor"><div class="sb-gym__lines"></div></div>
      <div class="sb-gym__cone"></div>
    </div>
    <div class="sb sb-trail">
      <div class="sb-trail__sky"></div>
      <div class="sb-trail__sun"></div>
      ${mountainsSvg()}
      <div class="sb-trail__mist"></div>
      <div class="sb-trail__mist sb-trail__mist--2"></div>
    </div>`;
  parent.prepend(wrap);
  return Object.fromEntries(IDS.map((id) => [id, wrap.querySelector(`.sb-${id}`)]));
}

/* ---------- постаменты ---------- */

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Город: чёрный глянец и неоновые кольца
function neonStand() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.42, 1.52, 0.26, 96),
    new THREE.MeshPhysicalMaterial({ color: 0x0b0d16, roughness: 0.22, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 })
  );
  body.position.y = -0.13;
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(1.36, 1.36, 0.02, 96),
    new THREE.MeshPhysicalMaterial({ color: 0x141728, roughness: 0.35, clearcoat: 1 })
  );
  top.position.y = -0.005;
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.425, 0.02, 12, 160), new THREE.MeshBasicMaterial({ color: 0xff3ea5 }));
  ringA.rotation.x = Math.PI / 2;
  ringA.position.y = -0.012;
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.016, 12, 160), new THREE.MeshBasicMaterial({ color: 0x3ee0ff }));
  ringB.rotation.x = Math.PI / 2;
  ringB.position.y = -0.255;
  [body, top].forEach((m) => { m.receiveShadow = true; });
  g.add(body, top, ringA, ringB);
  return g;
}

// Спортзал: паркет с разметкой и металлический обод
function woodStand() {
  const g = new THREE.Group();
  const planks = (ctx, w, h, vertical) => {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const tone = 150 + Math.round(rnd() * 40);
      ctx.fillStyle = `rgb(${tone + 40},${tone - 10},${tone - 70})`;
      if (vertical) ctx.fillRect((i * w) / n, 0, w / n, h);
      else ctx.fillRect(0, (i * h) / n, w, h / n);
      ctx.strokeStyle = 'rgba(60,30,10,.35)';
      ctx.lineWidth = 2;
      if (vertical) ctx.strokeRect((i * w) / n, 0, w / n, h);
      else ctx.strokeRect(0, (i * h) / n, w, h / n);
      for (let k = 0; k < 40; k++) {
        ctx.strokeStyle = `rgba(90,50,20,${(0.05 + rnd() * 0.08).toFixed(2)})`;
        ctx.beginPath();
        if (vertical) {
          const x = (i * w) / n + rnd() * (w / n);
          ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 4, h * 0.3, x - 4, h * 0.7, x, h);
        } else {
          const y = (i * h) / n + rnd() * (h / n);
          ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + 3, w * 0.7, y - 3, w, y);
        }
        ctx.stroke();
      }
    }
  };
  const topTex = canvasTex(1024, 1024, (ctx, w, h) => {
    planks(ctx, w, h, true);
    ctx.strokeStyle = '#ff7a2f';
    ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.33, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  });
  const sideTex = canvasTex(1024, 128, (ctx, w, h) => planks(ctx, w, h, false));
  sideTex.wrapS = THREE.RepeatWrapping;
  sideTex.repeat.set(3, 1);
  const side = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.55 });
  const topM = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.38 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.48, 0.22, 96, 1, false), [side, topM, side]);
  body.position.y = -0.11;
  body.receiveShadow = true;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1.49, 0.032, 16, 160),
    new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 1, roughness: 0.25 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.005;
  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.36, 0.08, 96),
    new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.8 })
  );
  foot.position.y = -0.26;
  g.add(body, rim, foot);
  return g;
}

// Тропа: каменная плита с мхом и камешками вокруг
function rockStand() {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const moss = new THREE.Color('#4f6e3a');
  const stone = new THREE.Color('#6f716a');
  const dark = new THREE.Color('#3b3d38');
  const c = new THREE.Color();
  const noise = (x, y, z) => Math.sin(x * 5.1 + z * 3.7) * 0.5 + Math.sin(z * 7.3 - y * 4.1) * 0.3 + Math.sin(x * 11.7 + y * 9.2 + z * 8.1) * 0.2;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise(x, y, z);
    x *= 1.6 + n * 0.08;
    z *= 1.3 + n * 0.08;
    y = y * 0.34 + n * 0.04;
    // Плоский верх, чтобы кроссовка стояла ровно
    const top = 0;
    const isTop = y > top - 0.02;
    if (isTop) y = top + n * 0.004;
    pos.setXYZ(i, x, y - (isTop ? 0 : 0.02), z);
    const t = Math.min(1, Math.max(0, (y + 0.34) / 0.34));
    c.copy(dark).lerp(stone, t);
    if (isTop || (y > -0.08 && n > 0.1)) c.lerp(moss, isTop ? 0.35 + 0.4 * Math.max(0, n) : 0.6);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  rock.receiveShadow = true;
  g.add(rock);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 1.75 + rnd() * 0.35;
    const s = 0.06 + rnd() * 0.12;
    const pebble = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), new THREE.MeshStandardMaterial({ color: 0x5c5e57, roughness: 1, flatShading: true }));
    pebble.position.set(Math.cos(a) * r, -0.22 + s * 0.4, Math.sin(a) * r * 0.85);
    pebble.scale.y = 0.6;
    g.add(pebble);
  }
  return g;
}

/* ---------- свет ---------- */

function buildLights(group) {
  const L = {};
  // Город: неоновые розовый и голубой по бокам
  L.cityPink = new THREE.PointLight(0xff3ea5, 0, 6, 1.4);
  L.cityPink.position.set(-1.9, 0.6, 1.0);
  L.cityCyan = new THREE.PointLight(0x3ee0ff, 0, 6, 1.4);
  L.cityCyan.position.set(1.9, 0.4, -0.8);
  // Спортзал: тёплый прожектор сверху с тенью
  L.gymSpot = new THREE.SpotLight(0xffd7a8, 0, 9, 0.42, 0.65, 1.2);
  L.gymSpot.position.set(0.3, 4.2, 1.4);
  L.gymSpot.castShadow = true;
  L.gymSpot.shadow.mapSize.set(1024, 1024);
  L.gymSpot.shadow.bias = -0.0004;
  L.gymSpot.shadow.radius = 4;
  // Тропа: низкое закатное солнце сбоку и зелёный отсвет снизу
  L.trailSun = new THREE.DirectionalLight(0xffb36b, 0);
  L.trailSun.position.set(-4, 1.4, 2);
  L.trailSun.castShadow = true;
  L.trailSun.shadow.mapSize.set(1024, 1024);
  L.trailSun.shadow.camera.left = L.trailSun.shadow.camera.bottom = -2.5;
  L.trailSun.shadow.camera.right = L.trailSun.shadow.camera.top = 2.5;
  L.trailSun.shadow.bias = -0.0005;
  L.trailSky = new THREE.HemisphereLight(0xbfe3c4, 0x3d4a33, 0);
  Object.values(L).forEach((l) => group.add(l));
  group.add(L.gymSpot.target, L.trailSun.target);
  return L;
}

/* ---------- сборка ---------- */

export function createScenes({ stage, floorY, backdrop, reduceMotion }) {
  const weights = { city: 1, gym: 0, trail: 0 };
  const stands = { city: neonStand(), gym: woodStand(), trail: rockStand() };
  for (const s of Object.values(stands)) {
    s.position.y = floorY;
    s.visible = false;
    stage.add(s);
  }

  // Прогрев: на время компиляции показываем все постаменты, чтобы их шейдеры
  // собрались заранее, а не в момент первого появления.
  function prepareWarmup() {
    const prev = IDS.map((k) => [stands[k].visible, stands[k].scale.clone()]);
    IDS.forEach((k) => { stands[k].visible = true; stands[k].scale.set(1, 1, 1); });
    return () => IDS.forEach((k, i) => { stands[k].visible = prev[i][0]; stands[k].scale.copy(prev[i][1]); });
  }
  const lights = buildLights(stage);
  lights.gymSpot.target.position.set(0, floorY, 0);
  lights.trailSun.target.position.set(0, floorY, 0);
  const bgs = buildBackgrounds(backdrop);
  const lastOpacity = {};

  function setScene(id, instant = false) {
    for (const k of IDS) {
      const v = k === id ? 1 : 0;
      if (instant || reduceMotion) weights[k] = v;
      else gsap.to(weights, { [k]: v, duration: 0.9, ease: 'power2.inOut', overwrite: 'auto' });
    }
  }

  // sm — насколько мы внутри блока сцен (0..1)
  function update(sm, t) {
    for (const k of IDS) {
      const w = sm * weights[k];
      const e = w * w * (3 - 2 * w);
      const s = stands[k];
      s.visible = e > 0.01;
      s.scale.set(0.7 + 0.3 * e, Math.max(0.001, e), 0.7 + 0.3 * e);
      const o = e.toFixed(3);
      if (lastOpacity[k] !== o) {
        bgs[k].style.opacity = o;
        // Невидимый фон убираем из отрисовки и ставим его анимации на паузу
        bgs[k].classList.toggle('is-on', e > 0.001);
        lastOpacity[k] = o;
      }
    }
    const wc = sm * weights.city;
    const wg = sm * weights.gym;
    const wt = sm * weights.trail;
    // Неон чуть «дышит»
    const pulse = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 2.4);
    lights.cityPink.intensity = 9 * wc * pulse;
    lights.cityCyan.intensity = 7 * wc * (1.9 - pulse);
    lights.gymSpot.intensity = 70 * wg;
    lights.trailSun.intensity = 3.2 * wt;
    lights.trailSky.intensity = 1.1 * wt;
    // Свет никогда не прячем через visible: смена числа источников заставляет
    // three.js пересобрать шейдеры всех материалов, это и было фризом.
    return { wc, wg, wt };
  }

  return { setScene, update, weights, prepareWarmup };
}
