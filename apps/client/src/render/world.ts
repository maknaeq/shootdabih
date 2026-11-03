import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mat, MapData } from '@sdb/shared';
import { PALETTE, flatMat } from './palette';

/** Géométrie de la map, fusionnée par matériau pour limiter les appels de dessin. */
export function buildWorld(map: MapData): { group: THREE.Group; update(t: number): void } {
  const group = new THREE.Group();
  const byMat = new Map<Mat, THREE.BufferGeometry[]>();
  const add = (mat: Mat, g: THREE.BufferGeometry) => { (byMat.get(mat) ?? byMat.set(mat, []).get(mat)!).push(g); };
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: Mat) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    add(mat, g);
  };
  for (const b of map.boxes) box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, b.mat);
  // les rampes sont dessinées en marches
  for (const r of map.ramps) {
    const len = r.axis === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
    const n = Math.max(2, Math.round(Math.abs(r.h1 - r.h0) / 0.33));
    for (let i = 0; i < n; i++) {
      const top = r.h0 + (r.h1 - r.h0) * ((i + 0.5) / n), seg = len / n;
      if (r.axis === 'x') box(r.x0 + seg * i, r.x0 + seg * (i + 1), top - 0.3, top, r.z0, r.z1, r.mat);
      else box(r.x0, r.x1, top - 0.3, top, r.z0 + seg * i, r.z0 + seg * (i + 1), r.mat);
    }
  }
  // décor sans collision
  for (const p of map.props) {
    if (p.kind === 'pine') {
      const h = p.s;
      const trunk = new THREE.CylinderGeometry(0.18, 0.26, 1.4, 6); trunk.translate(p.x, 0.7, p.z); add('trunk', trunk);
      const c1 = new THREE.ConeGeometry(h * 0.3, h * 0.55, 7); c1.rotateY(p.r); c1.translate(p.x, 1.2 + h * 0.27, p.z); add('leaf', c1);
      const c2 = new THREE.ConeGeometry(h * 0.22, h * 0.45, 7); c2.rotateY(p.r + 1); c2.translate(p.x, 1.2 + h * 0.55, p.z); add('leaf', c2);
    } else if (p.kind === 'rock') {
      const g = new THREE.IcosahedronGeometry(p.s, 0); g.rotateY(p.r); g.translate(p.x, p.y + p.s * 0.3, p.z); add('rock', g);
    }
  }
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g), false);
    geos.forEach(g => g.dispose());
    if (!merged) continue;
    merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, flatMat(PALETTE[mat]));
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  // tremplins
  const rings: Array<{ ring: THREE.Mesh; y: number }> = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf3efe6, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  for (const p of map.pads) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.22, 10), flatMat(PALETTE.pad));
    base.position.set(p.x, p.y + 0.11, p.z); base.receiveShadow = true; group.add(base);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 20), ringMat.clone());
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, p.y + 0.3, p.z); group.add(ring); rings.push({ ring, y: p.y });
  }
  // lampes : ampoule visible + lumière chaude, sans ombre
  const bulb = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  map.lamps.forEach((l, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), bulb); m.position.set(l.x, l.y, l.z); group.add(m);
    if (i < 4) { const pl = new THREE.PointLight(map.def.mood.lamp, 6, 14, 2); pl.position.set(l.x, l.y - 0.3, l.z); group.add(pl); }
  });
  return {
    group,
    update(t: number) {
      for (const r of rings) {
        const k = (t * 0.8) % 1;
        r.ring.position.y = r.y + 0.3 + k * 2.2; (r.ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9; r.ring.scale.setScalar(1 + k * 0.3);
      }
    }
  };
}
