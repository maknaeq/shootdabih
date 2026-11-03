import * as THREE from 'three';
import type { Mat } from '@sdb/shared';

/** Palette diorama plat : un aplat par matériau. */
export const PALETTE: Record<Mat, number> = {
  ground: 0x6e6655, dirt: 0x5e5646, snow: 0xe8ece8, rock: 0x5f5b55, wood: 0x8a6a4a, plank: 0x9a7a55,
  metal: 0x7d8482, grate: 0x5f6668, concrete: 0x8a8c86, tent: 0xd9a43a, tentDark: 0x2a2620,
  cont1: 0x4e6873, cont2: 0xa8553e, cont3: 0x5f7d5a, cabin: 0x7a5a42, roof: 0x3a3330, trunk: 0x4a3a30,
  leaf: 0x2e4a43, orange: 0xe8843e, white: 0xf3efe6, dark: 0x262a2b, glass: 0x1c2628, tire: 0x1f1d1c, pad: 0xe8843e
};

const cache = new Map<string, THREE.MeshPhongMaterial>();
/** Matériau à facettes, partagé. fog = false pour les personnages, qui doivent rester lisibles. */
export function flatMat(color: number, fog = true): THREE.MeshPhongMaterial {
  const key = color + ':' + fog;
  let m = cache.get(key);
  if (!m) { m = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 0, specular: 0x000000, fog }); cache.set(key, m); }
  return m;
}
