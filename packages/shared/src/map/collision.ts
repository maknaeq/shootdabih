import { CONFIG } from '../config';
import type { Vec3 } from '../vec';
import type { MapData } from './types';

type Collidable = Pick<MapData, 'boxes' | 'ramps'>;

/** Plus haute surface praticable (bloc plein ou rampe) sous maxY au point (x, z). -Infinity s'il n'y a rien. */
export function surfaceAt(map: Collidable, x: number, z: number, maxY: number): number {
  let best = -Infinity;
  for (const b of map.boxes) {
    if (b.solid && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 <= maxY && b.y1 > best) best = b.y1;
  }
  for (const r of map.ramps) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
      const t = r.axis === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0);
      const h = r.h0 + (r.h1 - r.h0) * t;
      if (h <= maxY && h > best) best = h;
    }
  }
  return best;
}

const OFFS: ReadonlyArray<[number, number]> = [[0, 0], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [-0.25, -0.25]];

/** Sol sous les pieds d'un joueur à la hauteur y, en tolérant une marche de stepHeight. */
export function groundAt(map: Collidable, x: number, z: number, y: number): number {
  let g = -Infinity;
  for (const [ox, oz] of OFFS) g = Math.max(g, surfaceAt(map, x + ox, z + oz, y + CONFIG.stepHeight));
  return g;
}

/** Vrai si un bloc plein chevauche le corps du joueur (au-dessus de la marche franchissable). */
export function hitsWall(map: Collidable, x: number, z: number, y: number, r: number = CONFIG.playerRadius): boolean {
  for (const b of map.boxes) {
    if (b.solid && x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.y1 > y + CONFIG.stepHeight && b.y0 < y + CONFIG.playerHeight) return true;
  }
  return false;
}

/** Bas du premier bloc rencontré par la tête entre headFrom et headTo. Infinity s'il n'y en a pas. */
export function ceilingAt(map: Collidable, x: number, z: number, headFrom: number, headTo: number): number {
  const r = CONFIG.playerRadius;
  let c = Infinity;
  for (const b of map.boxes) {
    if (b.solid && x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.y0 >= headFrom - 0.05 && b.y0 < headTo) c = Math.min(c, b.y0);
  }
  return c;
}

/** Fraction t ∈ [0, 1] du segment a → b où il touche un bloc plein, ou null s'il passe librement. */
export function segmentBlocked(map: Collidable, a: Vec3, b: Vec3): number | null {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  let best: number | null = null;
  for (const box of map.boxes) {
    if (!box.solid) continue;
    let t0 = 0, t1 = 1, ok = true;
    const axes: Array<[number, number, number, number]> = [[a.x, dx, box.x0, box.x1], [a.y, dy, box.y0, box.y1], [a.z, dz, box.z0, box.z1]];
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) { ok = false; break; } continue; }
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && (best === null || t0 < best)) best = t0;
  }
  return best;
}
