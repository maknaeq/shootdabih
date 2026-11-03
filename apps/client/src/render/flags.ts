import * as THREE from 'three';
import { TEAM_COLORS, type FlagState } from '@sdb/shared';
import { flatMat } from './palette';

function iconTexture(color: number): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(12,24,23,.75)'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.fillRect(22, 16, 3, 32); g.beginPath(); g.moveTo(25, 16); g.lineTo(46, 23); g.lineTo(25, 31); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

interface FlagView { root: THREE.Group; cloth: THREE.Mesh; icon: THREE.Sprite; base: THREE.Mesh; state: FlagState | null }

/** Drapeaux de la capture : mât, toile qui flotte, socle à la base, icône visible à travers les murs. */
export class Flags {
  readonly group = new THREE.Group();
  private views: FlagView[] = [];

  constructor(bases: Array<{ x: number; y: number; z: number }>) {
    bases.forEach((b, team) => {
      const color = TEAM_COLORS[team];
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 0.18, 12), flatMat(color));
      base.position.set(b.x, b.y + 0.09, b.z); base.receiveShadow = true; this.group.add(base);
      const root = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), flatMat(0xf3efe6, false)); pole.position.y = 1.2; root.add(pole);
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 0, fog: false }));
      cloth.position.set(0.47, 2.05, 0); root.add(cloth);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(color), depthTest: false, transparent: true, fog: false, sizeAttenuation: false }));
      icon.scale.set(0.045, 0.045, 1); icon.position.y = 3.1; icon.renderOrder = 20; root.add(icon);
      root.traverse(o => { o.castShadow = true; });
      this.group.add(root);
      this.views.push({ root, cloth, icon, base, state: null });
    });
  }

  set(list: FlagState[]) { for (const f of list) { const v = this.views[f.team]; if (v) v.state = f; } }

  /** carrierPos : où dessiner un drapeau porté (dans le dos du porteur). */
  update(t: number, carrierPos: (id: string) => THREE.Vector3 | null) {
    for (const v of this.views) {
      const s = v.state;
      if (!s) { v.root.visible = false; continue; }
      v.root.visible = true;
      const carried = s.carrier ? carrierPos(s.carrier) : null;
      if (carried) { v.root.position.copy(carried); v.root.position.y += 0.6; v.root.scale.setScalar(0.7); }
      else { v.root.position.set(s.x, s.y, s.z); v.root.scale.setScalar(1); }
      v.cloth.rotation.y = Math.sin(t * 3 + v.base.position.x) * 0.25;
      v.cloth.scale.x = 1 + Math.sin(t * 5) * 0.04;
    }
  }
}
