import { CONFIG } from './config';
import { segmentBlocked } from './map/collision';
import type { MapData } from './map/types';
import { add, scale, type Vec3 } from './vec';

export const SHOT_RANGE = 200;

/** Distance le long du rayon (dir normalisée) jusqu'au cylindre vertical [base, base + height], ou null. */
export function rayCapsule(origin: Vec3, dir: Vec3, base: Vec3, radius: number, height: number): number | null {
  // intervalle où le rayon est dans le cylindre infini
  const ox = origin.x - base.x, oz = origin.z - base.z;
  const a = dir.x * dir.x + dir.z * dir.z, c = ox * ox + oz * oz - radius * radius;
  let tin: number, tout: number;
  if (a < 1e-12) {
    if (c > 0) return null;
    tin = -Infinity; tout = Infinity;
  } else {
    const b = 2 * (ox * dir.x + oz * dir.z), disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    tin = (-b - sq) / (2 * a); tout = (-b + sq) / (2 * a);
  }
  // intervalle où le rayon est entre le bas et le haut
  let ylo: number, yhi: number;
  if (Math.abs(dir.y) < 1e-12) {
    if (origin.y < base.y || origin.y > base.y + height) return null;
    ylo = -Infinity; yhi = Infinity;
  } else {
    const t1 = (base.y - origin.y) / dir.y, t2 = (base.y + height - origin.y) / dir.y;
    ylo = Math.min(t1, t2); yhi = Math.max(t1, t2);
  }
  const t0 = Math.max(tin, ylo, 0), t1 = Math.min(tout, yhi);
  return t0 <= t1 ? t0 : null;
}

export interface ShotTarget { id: string; pos: Vec3 }
export interface ShotResult { hitId: string | null; end: Vec3; distance: number }

/** Rayon perçant : tous les joueurs touchés avant le premier mur, du plus proche au plus loin. */
export function traceShotAll(map: Pick<MapData, 'boxes'>, origin: Vec3, dir: Vec3, targets: ShotTarget[]): { hits: string[]; end: Vec3 } {
  const far = add(origin, scale(dir, SHOT_RANGE));
  const wallT = segmentBlocked({ boxes: map.boxes, ramps: [] }, origin, far);
  const maxD = wallT === null ? SHOT_RANGE : wallT * SHOT_RANGE;
  const hits = targets.map(t => ({ id: t.id, d: rayCapsule(origin, dir, t.pos, CONFIG.hitRadius, CONFIG.hitHeight) }))
    .filter((h): h is { id: string; d: number } => h.d !== null && h.d < maxD).sort((a, b) => a.d - b.d).map(h => h.id);
  return { hits, end: add(origin, scale(dir, maxD)) };
}

/** Trace le rayon : renvoie le joueur le plus proche touché avant le premier mur. */
export function traceShot(map: Pick<MapData, 'boxes'>, origin: Vec3, dir: Vec3, targets: ShotTarget[]): ShotResult {
  const far = add(origin, scale(dir, SHOT_RANGE));
  const wallT = segmentBlocked({ boxes: map.boxes, ramps: [] }, origin, far);
  let maxD = wallT === null ? SHOT_RANGE : wallT * SHOT_RANGE;
  let hitId: string | null = null;
  for (const t of targets) {
    const d = rayCapsule(origin, dir, t.pos, CONFIG.hitRadius, CONFIG.hitHeight);
    if (d !== null && d < maxD) { maxD = d; hitId = t.id; }
  }
  return { hitId, end: add(origin, scale(dir, maxD)), distance: maxD };
}
