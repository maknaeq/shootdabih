import * as THREE from 'three';
import { flatMat } from './palette';
import { MODELS, cloneWithParka } from './models';

/** Bras et arme à la première personne, attachés à la caméra. */
export class Viewmodel {
  readonly group = new THREE.Group();
  readonly tip: THREE.Object3D;
  private base = new THREE.Vector3(0.24, -0.25, -0.5);
  private recoil = 0;
  private swingT = 0;
  private coils: THREE.Object3D[] = [];

  constructor(camera: THREE.Camera, sleeveColor: number) {
    if (MODELS) {
      const { root, parka } = cloneWithParka(MODELS.viewmodel);
      parka.color.set(sleeveColor);
      root.rotation.y = Math.PI;
      root.position.set(0, 0, 0);
      this.group.add(root);
      this.tip = root.getObjectByName('VMTip') ?? root;
      root.traverse(o => { if (o.name.startsWith('VMCoil')) this.coils.push(o); });
      this.base.set(0.24, -0.23, -0.42);
      this.group.scale.setScalar(0.4);
      this.group.position.copy(this.base); this.group.rotation.y = -0.04;
      this.group.traverse(o => { o.renderOrder = 10; (o as THREE.Mesh).castShadow = false; });
      camera.add(this.group);
      return;
    }
    const m = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
      const o = new THREE.Mesh(geo, flatMat(color, false)); o.position.set(x, y, z); this.group.add(o); return o;
    };
    m(new THREE.BoxGeometry(0.2, 0.2, 0.5), sleeveColor, 0.06, -0.08, 0.2);
    m(new THREE.BoxGeometry(0.17, 0.17, 0.16), 0x302c2a, 0.04, -0.06, -0.06);
    m(new THREE.BoxGeometry(0.12, 0.14, 0.5), 0x5a6062, 0, 0.02, -0.28);
    m(new THREE.BoxGeometry(0.07, 0.16, 0.1), 0x262a2b, 0, -0.1, -0.12).rotation.x = 0.3;
    const barrel = m(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 8), 0x262a2b, 0, 0.05, -0.64); barrel.rotation.x = Math.PI / 2;
    for (const z of [-0.5, -0.62, -0.74]) { const c = m(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), 0xe8843e, 0, 0.05, z); c.rotation.x = Math.PI / 2; this.coils.push(c); }
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    this.tip.position.set(0, 0.05, -0.84); this.group.add(this.tip);
    this.group.scale.setScalar(0.46);
    this.group.position.copy(this.base); this.group.rotation.y = -0.05;
    this.group.traverse(o => { o.renderOrder = 10; });
    camera.add(this.group);
  }

  kick() { this.recoil = 1; }
  /** Coup de crosse : l'arme part en avant et sur la gauche, puis revient. */
  swing() { this.swingT = 1; }

  update(dt: number, t: number, charge: number, moving: number) {
    this.recoil *= Math.exp(-dt * 7);
    const bob = Math.sin(t * 9) * 0.004 * moving;
    this.group.position.set(this.base.x + Math.sin(t * 4.5) * 0.003 * moving, this.base.y + Math.abs(bob) - this.recoil * 0.015, this.base.z + this.recoil * 0.07);
    this.swingT = Math.max(0, this.swingT - dt / 0.4);
    const s = Math.sin((1 - this.swingT) * Math.PI) * (this.swingT > 0 ? 1 : 0);
    this.group.position.x -= s * 0.16; this.group.position.z -= s * 0.22; this.group.position.y += s * 0.04;
    this.group.rotation.x = this.recoil * 0.22 - s * 0.35;
    this.group.rotation.z = s * 0.9;
    this.tip.scale.setScalar(0.4 + charge * 0.9);
    const glow = charge >= 1 ? 1 + Math.sin(t * 8) * 0.08 : 1;
    this.coils.forEach(c => c.scale.set(glow, 1, glow));
  }

  tipWorld(out: THREE.Vector3) { return this.tip.getWorldPosition(out); }
  setVisible(v: boolean) { this.group.visible = v; }
}
