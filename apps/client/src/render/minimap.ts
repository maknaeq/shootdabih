import type { MapData } from '@sdb/shared';

export interface MiniDot { x: number; z: number; color: string; kind: 'mate' | 'enemy' | 'flag' | 'pickup' }

/**
 * Mini-map tournante centrée sur le joueur (le haut = là où il regarde), 30 m de rayon.
 * On voit les murs de son étage, les coéquipiers, les ennemis qui viennent de tirer, les drapeaux et les objets.
 */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private size = 176;
  private range = 30;
  private last = 0;

  constructor(private map: MapData) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.canvas.height = this.size * dpr;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(dpr, dpr);
  }

  setMap(map: MapData) { this.map = map; }

  draw(now: number, me: { x: number; y: number; z: number; yaw: number }, dots: MiniDot[]) {
    if (now - this.last < 0.05) return;
    this.last = now;
    const g = this.g, S = this.size, k = S / 2 / this.range;
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(12,24,23,.78)'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.rotate(me.yaw);
    // ce qui est sous les pieds (sol de l'étage) puis les murs à hauteur d'homme
    for (const b of this.map.boxes) {
      if (!b.solid || b.hidden) continue;
      if (b.x1 < me.x - this.range || b.x0 > me.x + this.range || b.z1 < me.z - this.range || b.z0 > me.z + this.range) continue;
      const wall = b.y0 < me.y + 1.7 && b.y1 > me.y + 0.6;
      const floor = !wall && b.y1 <= me.y + 0.6 && b.y1 > me.y - 1.5;
      if (!wall && !floor) continue;
      g.fillStyle = wall ? 'rgba(243,239,230,.55)' : 'rgba(243,239,230,.08)';
      g.fillRect((b.x0 - me.x) * k, (b.z0 - me.z) * k, Math.max(1, (b.x1 - b.x0) * k), Math.max(1, (b.z1 - b.z0) * k));
    }
    for (const d of dots) {
      const x = (d.x - me.x) * k, z = (d.z - me.z) * k;
      if (Math.hypot(x, z) > S / 2 - 4) continue;
      g.fillStyle = d.color;
      if (d.kind === 'flag') { g.save(); g.translate(x, z); g.rotate(-me.yaw); g.fillRect(-1, -7, 2, 12); g.beginPath(); g.moveTo(1, -7); g.lineTo(8, -4); g.lineTo(1, -1); g.fill(); g.restore(); }
      else if (d.kind === 'pickup') { g.fillRect(x - 2.5, z - 2.5, 5, 5); }
      else { g.beginPath(); g.arc(x, z, d.kind === 'enemy' ? 4.5 : 4, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
    // soi : flèche au centre, pointe vers le haut
    g.fillStyle = '#e8843e';
    g.beginPath(); g.moveTo(S / 2, S / 2 - 8); g.lineTo(S / 2 + 6, S / 2 + 6); g.lineTo(S / 2, S / 2 + 3); g.lineTo(S / 2 - 6, S / 2 + 6); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(243,239,230,.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.stroke();
  }
}
