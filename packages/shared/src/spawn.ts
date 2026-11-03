import { CONFIG } from './config';
import { segmentBlocked } from './map/collision';
import type { MapData } from './map/types';
import { dist, type Vec3 } from './vec';

/** Réglages de la règle de spawn validée (page « Map pool et spawns », valeurs par défaut). */
export const SPAWN_RULE = { minDist: 8, idealDist: 30, seenWeight: 1, seenRange: 40, recentSeconds: 4, recentWeight: 0.8, topK: 3 } as const;

export interface SpawnScore { index: number; ok: boolean; score: number; nearest: number; seenBy: number }

/** Note chaque spawn pour un joueur qui réapparaît. enemies : positions des pieds des adversaires vivants. */
export function scoreSpawns(map: Pick<MapData, 'boxes' | 'ramps' | 'spawns'>, enemies: Vec3[], lastUsed: number[], now: number): SpawnScore[] {
  const R = SPAWN_RULE;
  return map.spawns.map((s, index) => {
    const eyeS = { x: s.x, y: s.y + CONFIG.eyeHeight, z: s.z };
    let nearest = Infinity, seen = 0, seenBy = 0;
    for (const e of enemies) {
      const d = dist(e, s);
      if (d < nearest) nearest = d;
      if (d < R.seenRange) {
        const eyeE = { x: e.x, y: e.y + CONFIG.eyeHeight, z: e.z };
        if (segmentBlocked(map, eyeE, eyeS) === null) { seen += 1 - d / R.seenRange; seenBy++; }
      }
    }
    const since = now - (lastUsed[index] ?? -1e9);
    const recent = since < R.recentSeconds ? 1 - since / R.recentSeconds : 0;
    const distScore = enemies.length ? Math.min(nearest / R.idealDist, 1) : 1;
    const score = distScore - R.seenWeight * seen - R.recentWeight * recent;
    return { index, ok: nearest >= R.minDist, score, nearest, seenBy };
  });
}

/** Orientation au spawn : vers la plus longue vue dégagée à hauteur d'yeux (24 directions, jusqu'à 30 m). */
export function openYaw(map: Pick<MapData, 'boxes' | 'ramps'>, pos: Vec3): number {
  const eye = { x: pos.x, y: pos.y + CONFIG.eyeHeight, z: pos.z };
  let best = -1, bestYaw = 0;
  for (let k = 0; k < 24; k++) {
    const yaw = (k / 24) * Math.PI * 2;
    const far = { x: eye.x - Math.sin(yaw) * 30, y: eye.y, z: eye.z - Math.cos(yaw) * 30 };
    const t = segmentBlocked(map, eye, far);
    const d = t === null ? 30 : t * 30;
    if (d > best + 0.01) { best = d; bestYaw = yaw; }
  }
  return bestYaw;
}

/** Choisit un spawn : tirage parmi les meilleurs points valides, sinon le plus éloigné des adversaires. */
export function chooseSpawn(map: Pick<MapData, 'boxes' | 'ramps' | 'spawns'>, enemies: Vec3[], lastUsed: number[], now: number, rand: () => number): number {
  const all = scoreSpawns(map, enemies, lastUsed, now);
  let valid = all.filter(r => r.ok);
  if (!valid.length) valid = [all.reduce((a, b) => (a.nearest >= b.nearest ? a : b))];
  valid.sort((a, b) => b.score - a.score);
  const top = valid.slice(0, SPAWN_RULE.topK);
  return top[Math.min(top.length - 1, Math.floor(rand() * top.length))].index;
}
