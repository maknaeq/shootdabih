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
  const extra = new Map<number, THREE.BufferGeometry[]>();
  const addColor = (c: number, g: THREE.BufferGeometry) => { (extra.get(c) ?? extra.set(c, []).get(c)!).push(g); };
  const cbox = (c: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); addColor(c, g);
  };
  const shade = (c: number, k: number) => { const col = new THREE.Color(c); col.multiplyScalar(k); return col.getHex(); };
  for (const b of map.boxes) {
    if (b.hidden) continue;
    box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, b.mat);
    // nervures des conteneurs sur les grandes faces
    if (b.mat === 'cont1' || b.mat === 'cont2' || b.mat === 'cont3') {
      const c = shade(PALETTE[b.mat], 0.82), long = (b.x1 - b.x0) > (b.z1 - b.z0);
      const len = long ? b.x1 - b.x0 : b.z1 - b.z0;
      for (let t = 0.35; t < len - 0.2; t += 0.45) {
        if (long) { cbox(c, b.x0 + t, b.x0 + t + 0.12, b.y0 + 0.15, b.y1 - 0.15, b.z0 - 0.04, b.z0); cbox(c, b.x0 + t, b.x0 + t + 0.12, b.y0 + 0.15, b.y1 - 0.15, b.z1, b.z1 + 0.04); }
        else { cbox(c, b.x0 - 0.04, b.x0, b.y0 + 0.15, b.y1 - 0.15, b.z0 + t, b.z0 + t + 0.12); cbox(c, b.x1, b.x1 + 0.04, b.y0 + 0.15, b.y1 - 0.15, b.z0 + t, b.z0 + t + 0.12); }
      }
      cbox(shade(PALETTE[b.mat], 0.7), b.x0 - 0.02, b.x1 + 0.02, b.y1 - 0.12, b.y1 + 0.02, b.z0 - 0.02, b.z1 + 0.02);
    }
  }
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
    } else if (p.kind === 'tuft') {
      for (let i = 0; i < 3; i++) { const g = new THREE.ConeGeometry(0.06 * (1 + p.s), p.s, 4); g.rotateZ((i - 1) * 0.35); g.rotateY(p.r + i); g.translate(p.x + (i - 1) * 0.08, p.y + p.s / 2, p.z); addColor(0x7d8a55, g); }
    } else if (p.kind === 'mountain') {
      const g = new THREE.ConeGeometry(p.s, p.s * 0.9, 6); g.rotateY(p.r); g.translate(p.x, p.y + p.s * 0.45, p.z); addColor(0x23383a, g);
      const cap = new THREE.ConeGeometry(p.s * 0.28, p.s * 0.26, 6); cap.rotateY(p.r); cap.translate(p.x, p.y + p.s * 0.78, p.z); addColor(0xb8c4c0, cap);
    } else if (p.kind === 'roof') {
      const w = p.w ?? 4, d = p.d ?? 4, hh = p.h ?? 1.5;
      const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, hh); shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); g.rotateY(p.r); g.translate(p.x, p.y, p.z);
      add(p.mat ?? 'tent', g);
    } else if (p.kind === 'car') {
      const body = p.mat ?? 'orange', w = 2, d = 4.4;
      const parts: Array<[number, number, number, number, number, number, number]> = [
        [PALETTE[body], -w / 2, w / 2, 0.35, 1.15, -d / 2, d / 2],
        [PALETTE[body], -w * 0.42, w * 0.42, 1.15, 1.9, -d * 0.28, d * 0.22],
        [0x1c2628, -w * 0.43, w * 0.43, 1.25, 1.8, -d * 0.29, d * 0.23],
        [shade(PALETTE[body], 0.75), -w / 2 - 0.02, w / 2 + 0.02, 0.35, 0.55, -d / 2 - 0.02, d / 2 + 0.02],
        [0xf3efe6, -w * 0.4, -w * 0.2, 0.8, 0.95, -d / 2 - 0.03, -d / 2],
        [0xf3efe6, w * 0.2, w * 0.4, 0.8, 0.95, -d / 2 - 0.03, -d / 2],
        [0x262a2b, -w * 0.45, w * 0.45, 1.9, 1.98, -d * 0.2, d * 0.15]
      ];
      const rot = new THREE.Matrix4().makeRotationY(p.r).setPosition(p.x, p.y, p.z);
      for (const [c, x0, x1, y0, y1, z0, z1] of parts) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.applyMatrix4(rot); addColor(c, g); }
      for (const [wx, wz] of [[-1, -1.35], [1, -1.35], [-1, 1.35], [1, 1.35]]) {
        const g = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 10); g.rotateZ(Math.PI / 2); g.translate(wx * 0.88, 0.38, wz); g.applyMatrix4(rot); addColor(0x1f1d1c, g);
        const hub = new THREE.CylinderGeometry(0.16, 0.16, 0.34, 8); hub.rotateZ(Math.PI / 2); hub.translate(wx * 0.88, 0.38, wz); hub.applyMatrix4(rot); addColor(0x8a8c86, hub);
      }
    }
  }
  for (const [c, geos] of extra) {
    const merged = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g), false);
    geos.forEach(g => g.dispose());
    if (!merged) continue;
    merged.computeVertexNormals();
    const far = c === 0x23383a || c === 0xb8c4c0;
    const mesh = new THREE.Mesh(merged, flatMat(c, !far)); mesh.castShadow = !far; mesh.receiveShadow = !far; group.add(mesh);
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
  // feux de camp : flammes et lumière qui vacillent
  const fires: Array<{ flames: THREE.Mesh[]; light: THREE.PointLight }> = [];
  for (const p of map.props) {
    if (p.kind !== 'fire') continue;
    const flames = [0xe8843e, 0xf3c84a, 0xfff1c0].map((c, i) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.35 - i * 0.09, 0.9 - i * 0.2, 6), new THREE.MeshBasicMaterial({ color: c, fog: false }));
      m.position.set(p.x, p.y + 0.4 - i * 0.05, p.z); group.add(m); return m;
    });
    for (let i = 0; i < 4; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), flatMat(PALETTE.trunk)); log.rotation.set(Math.PI / 2, 0, (i * Math.PI) / 4); log.position.set(p.x, p.y + 0.08, p.z); group.add(log); }
    const light = new THREE.PointLight(0xff9a4a, 10, 12, 2); light.position.set(p.x, p.y + 1, p.z); group.add(light);
    fires.push({ flames, light });
  }
  return {
    group,
    update(t: number) {
      for (const f of fires) {
        f.flames.forEach((m, i) => { const k = 1 + Math.sin(t * (9 + i * 3) + i) * 0.12 + Math.sin(t * 23 + i) * 0.05; m.scale.set(1, k, 1); m.rotation.y = t * (1 + i); });
        f.light.intensity = 9 + Math.sin(t * 13) * 1.5 + Math.sin(t * 31) * 0.8;
      }
      for (const r of rings) {
        const k = (t * 0.8) % 1;
        r.ring.position.y = r.y + 0.3 + k * 2.2; (r.ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9; r.ring.scale.setScalar(1 + k * 0.3);
      }
    }
  };
}
