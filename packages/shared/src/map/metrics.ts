import { CONFIG } from '../config';
import { segmentBlocked, surfaceAt } from './collision';
import type { MapData } from './types';

export interface MapMetrics {
  /** Distance médiane avant un mur, à hauteur d'yeux, en mètres. */
  medianSight: number;
  /** 90e centile de cette distance. */
  p90Sight: number;
  /** Part de la surface au sol qui a au moins deux niveaux praticables espacés de 3 m ou plus. */
  multiLevel: number;
  samples: number;
}

/** Points où un joueur peut se tenir : dessus de bloc ou de rampe avec 1,8 m libre au-dessus. */
export function walkablePoints(map: MapData, step = 1): Array<{ x: number; y: number; z: number }> {
  const [W, D] = map.def.size;
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (let x = step / 2; x < W; x += step) for (let z = step / 2; z < D; z += step) {
    const tops = new Set<number>();
    for (const b of map.boxes) if (b.solid && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) tops.add(b.y1);
    const rampTop = surfaceAt({ boxes: [], ramps: map.ramps }, x, z, 1e6);
    if (Number.isFinite(rampTop)) tops.add(rampTop);
    for (const y of tops) {
      const blocked = map.boxes.some(b => b.solid && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 > y + 0.05 && b.y0 < y + CONFIG.playerHeight);
      if (!blocked) out.push({ x, y, z });
    }
  }
  return out;
}

export function measureMap(map: MapData, sampleCount = 400, seed = 1): MapMetrics {
  const pts = walkablePoints(map);
  const [W, D] = map.def.size;
  let s = seed;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const sample = pts.length <= sampleCount ? pts : Array.from({ length: sampleCount }, () => pts[Math.floor(rand() * pts.length)]);
  const L: number[] = [];
  const MAX = 90;
  for (const p of sample) {
    const eye = { x: p.x, y: p.y + CONFIG.eyeHeight, z: p.z };
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const far = { x: eye.x + Math.cos(a) * MAX, y: eye.y, z: eye.z + Math.sin(a) * MAX };
      const t = segmentBlocked(map, eye, far);
      let d = t === null ? MAX : t * MAX;
      // bord de la map
      const tx = Math.cos(a) > 0 ? (W - eye.x) / Math.cos(a) : Math.cos(a) < 0 ? -eye.x / Math.cos(a) : Infinity;
      const tz = Math.sin(a) > 0 ? (D - eye.z) / Math.sin(a) : Math.sin(a) < 0 ? -eye.z / Math.sin(a) : Infinity;
      d = Math.min(d, tx, tz);
      L.push(d);
    }
  }
  L.sort((a, b) => a - b);
  const q = (p: number) => L[Math.floor(p * (L.length - 1))] ?? 0;
  const cols = new Map<string, number[]>();
  for (const p of pts) { const k = Math.floor(p.x) + ',' + Math.floor(p.z); (cols.get(k) ?? cols.set(k, []).get(k)!).push(p.y); }
  let multi = 0;
  for (const ys of cols.values()) {
    ys.sort((a, b) => a - b);
    let n = 1;
    for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] >= 3) n++;
    if (n >= 2) multi++;
  }
  return { medianSight: q(0.5), p90Sight: q(0.9), multiLevel: cols.size ? multi / cols.size : 0, samples: L.length };
}
