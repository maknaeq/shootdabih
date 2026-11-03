import * as THREE from 'three';
import type { MapData, PickupKind, PickupState } from '@sdb/shared';
import { flatMat } from './palette';

export const PICKUP_STYLE: Record<PickupKind, { label: string; color: number; ability?: boolean }> = {
  overcharge: { label: 'Surcharge', color: 0xf3c84a },
  pierce: { label: 'Rayon perçant', color: 0x7fd6ff },
  shield: { label: 'Armure', color: 0xf3efe6 },
  grappin: { label: 'Grappin', color: 0xe8843e, ability: true },
  blink: { label: 'Saut éclair', color: 0xc9a6ff, ability: true },
  saut: { label: 'Double saut', color: 0x9fd6a0, ability: true },
  bouclier: { label: 'Bouclier', color: 0x8fd3f0, ability: true }
};

function icon(kind: PickupKind): THREE.Object3D {
  const mat = new THREE.MeshPhongMaterial({ color: PICKUP_STYLE[kind].color, flatShading: true, shininess: 0, emissive: PICKUP_STYLE[kind].color, emissiveIntensity: 0.35, fog: false });
  const g = new THREE.Group();
  if (kind === 'overcharge') g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat));
  if (kind === 'pierce') { const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 6), mat); c.rotation.z = Math.PI / 2; g.add(c); }
  if (kind === 'shield') g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), mat));
  if (kind === 'saut') for (let i = 0; i < 2; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.34, 6), mat); c.position.y = -0.15 + i * 0.3; g.add(c); }
  if (kind === 'grappin') { const h = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.07, 6, 10, Math.PI * 1.3), mat); h.rotation.z = Math.PI * 0.85; g.add(h); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), mat); s.position.y = 0.3; g.add(s); }
  if (kind === 'blink') { const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), mat); d.scale.set(0.6, 1.2, 0.6); g.add(d); }
  if (kind === 'bouclier') { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 8), mat); d.rotation.x = Math.PI / 2; g.add(d); }
  if (PICKUP_STYLE[kind].ability) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 4, 16), new THREE.MeshBasicMaterial({ color: PICKUP_STYLE[kind].color, fog: false })); ring.rotation.x = Math.PI / 2; ring.position.y = -0.55; g.add(ring); }
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
