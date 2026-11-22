import * as THREE from 'three';

// Общие части для всех моделей: нормализация размера и разборка по шагам.

export const TARGET_LENGTH = 2.2;
export const STEPS = 4; // шнуровка → верх → стелька → подошва

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Центрирует содержимое и приводит длину модели к TARGET_LENGTH.
// Возвращает внешний узел, а детали остаются в inner со своими координатами.
export function normalize(inner) {
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const k = TARGET_LENGTH / Math.max(size.x, size.y, size.z);
  inner.position.set(-center.x * k, -center.y * k, -center.z * k);
  inner.scale.setScalar(k);
  const root = new THREE.Group();
  root.add(inner);
  return { root, k };
}

// parts: [{ obj, base: Vector3, offset: Vector3, step }]
// Деталь шага s разъезжается, пока t*STEPS проходит от s до s+1.
export function makeExplode(parts) {
  return (t) => {
    const x = t * STEPS;
    for (const p of parts) {
      const e = ease(THREE.MathUtils.clamp(x - p.step, 0, 1));
      p.obj.position.copy(p.base).addScaledVector(p.offset, e);
    }
  };
}
