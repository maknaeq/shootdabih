import * as THREE from 'three';
import type { MapData, PickupKind, PickupState } from '@sdb/shared';
import { flatMat } from './palette';

export const PICKUP_STYLE: Record<PickupKind, { label: string; color: number }> = {
  overcharge: { label: 'Surcharge', color: 0xf3c84a },
  pierce: { label: 'Rayon perçant', color: 0x7fd6ff },
  jumps: { label: 'Triple saut', color: 0x9fd6a0 },
  shield: { label: 'Bouclier', color: 0xf3efe6 }
};

function icon(kind: PickupKind): THREE.Object3D {
  const mat = new THREE.MeshPhongMaterial({ color: PICKUP_STYLE[kind].color, flatShading: true, shininess: 0, emissive: PICKUP_STYLE[kind].color, emissiveIntensity: 0.35, fog: false });
  const g = new THREE.Group();
  if (kind === 'overcharge') g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat));
  if (kind === 'pierce') { const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 6), mat); c.rotation.z = Math.PI / 2; g.add(c); }
  if (kind === 'jumps') for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 6), mat); c.position.y = -0.25 + i * 0.25; g.add(c); }
  if (kind === 'shield') g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), mat));
  return g;
}

/** Bonus au sol : socle, objet qui tourne et flotte, masqué quand il a été ramassé. */
export class Pickups {
  readonly group = new THREE.Group();
  private spots: Array<{ base: THREE.Mesh; holder: THREE.Group; kind: PickupKind | null; y: number }> = [];

  constructor(map: MapData) {
    for (const p of map.pickups) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.15, 8), flatMat(0x262a2b));
      base.position.set(p.x, p.y + 0.08, p.z); base.receiveShadow = true;
      const holder = new THREE.Group(); holder.position.set(p.x, p.y + 1.1, p.z);
      this.group.add(base, holder);
      this.spots.push({ base, holder, kind: null, y: p.y + 1.1 });
    }
  }

  set(list: PickupState[]) {
    for (const s of list) {
      const spot = this.spots[s.i];
      if (!spot) continue;
      if (spot.kind !== s.kind) { spot.holder.clear(); spot.holder.add(icon(s.kind)); spot.kind = s.kind; }
      spot.holder.visible = s.active;
    }
  }

  update(t: number) {
    this.spots.forEach((s, i) => { s.holder.rotation.y = t * 1.6 + i; s.holder.position.y = s.y + Math.sin(t * 2 + i) * 0.12; });
  }
}
