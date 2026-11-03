import * as THREE from 'three';
import { flatMat } from './palette';

const FUR = 0xcfc6b6, FACE = 0x7a5040, PANTS = 0x2f4256, BOOT = 0x262a2b, GUN = 0x4a4f52;

function nameSprite(name: string): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '700 34px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(14,22,20,.85)'; g.strokeText(name.toUpperCase(), 128, 34);
  g.fillStyle = '#f3efe6'; g.fillText(name.toUpperCase(), 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true, fog: false }));
  s.scale.set(1.6, 0.4, 1); s.position.y = 2.35;
  return s;
}

/** Personnage trapu en parka, à la couleur du joueur. Les pieds sont à l'origine, il regarde vers +z local. */
export class Avatar {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legL: THREE.Mesh; private legR: THREE.Mesh;
  private phase = 0;

  constructor(color: number, name: string) {
    const parka = flatMat(color, false), fur = flatMat(FUR, false), face = flatMat(FACE, false);
    const pants = flatMat(PANTS, false), boot = flatMat(BOOT, false), gun = flatMat(GUN, false);
    const m = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.body) => {
      const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o;
    };
    this.legL = m(new THREE.BoxGeometry(0.26, 0.55, 0.3), pants, -0.17, 0.3, 0);
    this.legR = m(new THREE.BoxGeometry(0.26, 0.55, 0.3), pants, 0.17, 0.3, 0);
    m(new THREE.BoxGeometry(0.28, 0.12, 0.36), boot, -0.17, 0.06, 0.03);
    m(new THREE.BoxGeometry(0.28, 0.12, 0.36), boot, 0.17, 0.06, 0.03);
    const torso = new THREE.CylinderGeometry(0.4, 0.46, 0.9, 7); torso.rotateY(Math.PI / 7);
    m(torso, parka, 0, 0.98, 0);
    m(new THREE.CylinderGeometry(0.47, 0.47, 0.1, 7), flatMat(0x262a2b, false), 0, 0.62, 0);
    m(new THREE.IcosahedronGeometry(0.36, 1), parka, 0, 1.62, -0.02);
    m(new THREE.TorusGeometry(0.22, 0.08, 5, 9), fur, 0, 1.6, 0.2);
    m(new THREE.BoxGeometry(0.26, 0.26, 0.1), face, 0, 1.6, 0.22);
    m(new THREE.BoxGeometry(0.22, 0.62, 0.26), parka, -0.54, 1.05, 0).rotation.z = 0.12;
    const arm = new THREE.Group(); arm.position.set(0.5, 1.25, 0); this.body.add(arm);
    m(new THREE.BoxGeometry(0.22, 0.22, 0.6), parka, 0, 0, 0.24, arm);
    m(new THREE.BoxGeometry(0.14, 0.18, 0.72), gun, 0, -0.03, 0.62, arm);
    m(new THREE.BoxGeometry(0.16, 0.06, 0.08), flatMat(0xe8843e, false), 0, 0.06, 0.92, arm);
    this.root.add(this.body);
    this.root.add(nameSprite(name));
  }

  /** speed : vitesse horizontale, pour animer la marche. */
  update(dt: number, speed: number, yaw: number) {
    this.root.rotation.y = yaw + Math.PI;
    this.phase += dt * Math.min(speed, 12) * 1.3;
    const k = Math.min(1, speed / 6);
    this.legL.rotation.x = Math.sin(this.phase) * 0.6 * k;
    this.legR.rotation.x = -Math.sin(this.phase) * 0.6 * k;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * k;
  }

  dispose() { this.root.traverse(o => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); }); }
}
