import * as THREE from 'three';
import type { Hat } from '@sdb/shared';
import { flatMat } from './palette';
import { MODELS, cloneWithParka } from './models';

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
  private legL: THREE.Object3D; private legR: THREE.Object3D;
  private armR: THREE.Object3D | null = null;
  private hats: Partial<Record<Hat, THREE.Object3D>> | null = null;
  private phase = 0;
  private strikeT = 0;
  /** Pose forcée pendant une exécution : 'none', 'attack' (penché, bras en avant) ou 'fall' (s'effondre). */
  private pose: { kind: 'none' | 'attack' | 'fall'; t: number } = { kind: 'none', t: 0 };
  private hatGroup = new THREE.Group();
  private bubble: THREE.Mesh;
  private parkaMat: THREE.MeshPhongMaterial;

  constructor(color: number, name: string, hat: Hat = 'bonnet') {
    if (MODELS) {
      const { root, parka } = cloneWithParka(MODELS.avatar);
      parka.color.set(color);
      this.parkaMat = parka;
      this.body.add(root);
      this.legL = root.getObjectByName('LegL') ?? new THREE.Object3D();
      this.legR = root.getObjectByName('LegR') ?? new THREE.Object3D();
      this.armR = root.getObjectByName('ArmR') ?? null;
      this.hats = { bonnet: root.getObjectByName('Hat_bonnet'), casquette: root.getObjectByName('Hat_casquette'), chapka: root.getObjectByName('Hat_chapka'), casque: root.getObjectByName('Hat_casque') };
      this.setHat(hat);
      this.root.add(this.body);
      const tag = nameSprite(name); tag.position.y = 2.5; this.root.add(tag);
      this.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), new THREE.MeshBasicMaterial({ color: 0xf3efe6, transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
      this.bubble.position.y = 1.1; this.bubble.visible = false; this.root.add(this.bubble);
      return;
    }
    const parka = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 0, specular: 0, fog: false }); this.parkaMat = parka;
    const fur = flatMat(FUR, false), face = flatMat(FACE, false);
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
    this.body.add(this.hatGroup);
    this.setHat(hat);
    this.root.add(this.body);
    this.root.add(nameSprite(name));
    this.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), new THREE.MeshBasicMaterial({ color: 0xf3efe6, transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
    this.bubble.position.y = 1.05; this.bubble.visible = false; this.root.add(this.bubble);
  }

  setColor(c: number) { this.parkaMat.color.set(c); }

  private facePlane: THREE.Mesh | null = null;
  private faceParts: THREE.Object3D[] = [];
  /** Photo du joueur à la place du visage (rognée en disque) ; chaîne vide pour revenir au visage dessiné. */
  setFace(dataUrl: string) {
    if (!this.faceParts.length) this.root.traverse(o => { if (/^(Eye|Nose)/.test(o.name)) this.faceParts.push(o); });
    if (this.facePlane) { this.facePlane.removeFromParent(); ((this.facePlane.material as THREE.MeshBasicMaterial).map)?.dispose(); this.facePlane = null; }
    this.faceParts.forEach(o => { o.visible = !dataUrl; });
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d')!;
      g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.clip(); g.drawImage(img, 0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ map: tex, fog: false, transparent: true }));
      plane.position.set(0, 1.7, 0.352);
      this.body.add(plane); this.facePlane = plane;
    };
    img.src = dataUrl;
  }
  setShield(on: boolean) { this.bubble.visible = on; }

  setHat(hat: Hat) {
    if (this.hats) { for (const [k, o] of Object.entries(this.hats)) if (o) o.visible = k === hat; return; }
    this.hatGroup.clear();
    const m = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, flatMat(color, false)); o.position.set(x, y, z); o.castShadow = true; this.hatGroup.add(o); return o; };
    if (hat === 'bonnet') { m(new THREE.CylinderGeometry(0.3, 0.36, 0.26, 8), 0xd9534f, 0, 1.9, -0.02); m(new THREE.IcosahedronGeometry(0.1, 0), 0xf3efe6, 0, 2.08, -0.02); }
    if (hat === 'casquette') { m(new THREE.CylinderGeometry(0.33, 0.37, 0.16, 8), 0x2f4256, 0, 1.93, -0.02); m(new THREE.BoxGeometry(0.4, 0.05, 0.3), 0x2f4256, 0, 1.88, 0.3); }
    if (hat === 'chapka') { m(new THREE.CylinderGeometry(0.38, 0.4, 0.3, 8), 0x7a5a42, 0, 1.92, -0.02); m(new THREE.BoxGeometry(0.12, 0.3, 0.26), 0xcfc6b6, -0.38, 1.7, 0); m(new THREE.BoxGeometry(0.12, 0.3, 0.26), 0xcfc6b6, 0.38, 1.7, 0); }
    if (hat === 'casque') { const g = new THREE.SphereGeometry(0.4, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); m(g, 0xe8c23a, 0, 1.76, -0.02); m(new THREE.BoxGeometry(0.12, 0.08, 0.1), 0xf3efe6, 0, 2.02, 0.3); }
  }

  /** Coup de crosse vu par les autres. */
  strike() { this.strikeT = 1; }
  setPose(kind: 'none' | 'attack' | 'fall') { this.pose = { kind, t: 0 }; if (kind === 'none') { this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0); } }

  /** speed : vitesse horizontale, pour animer la marche. */
  update(dt: number, speed: number, yaw: number, pitch = 0) {
    this.root.rotation.y = yaw + Math.PI;
    this.strikeT = Math.max(0, this.strikeT - dt / 0.35);
    const sw = Math.sin(this.strikeT * Math.PI);
    if (this.armR) { this.armR.rotation.x = -pitch * 0.8 - sw * 1.1; this.armR.rotation.y = sw * 0.6; }
    if (this.pose.kind !== 'none') {
      this.pose.t += dt;
      const t = this.pose.t;
      if (this.pose.kind === 'fall') {
        // genoux puis chute en avant
        const k = Math.min(1, t / 0.8), e = k * k * (3 - 2 * k);
        this.body.rotation.x = e * 1.45; this.body.position.y = -e * 0.35;
      } else {
        const k = Math.min(1, t / 0.25);
        this.body.rotation.x = 0.25 * k;
        const hit = Math.max(0, Math.sin(Math.min(1, t / 0.6) * Math.PI * 2));
        if (this.armR) this.armR.rotation.x = -1.2 * k - hit * 0.6;
      }
      this.legL.rotation.x = this.legR.rotation.x = 0;
      return;
    }
    this.phase += dt * Math.min(speed, 12) * 1.3;
    const k = Math.min(1, speed / 6);
    this.legL.rotation.x = Math.sin(this.phase) * 0.6 * k;
    this.legR.rotation.x = -Math.sin(this.phase) * 0.6 * k;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * k;
  }

  dispose() { this.root.traverse(o => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); }); }
}
