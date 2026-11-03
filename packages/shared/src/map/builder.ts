import type { Box, Lamp, MapData, MapDef, Mat, Pad, Prop, Ramp } from './types';
import type { Vec3 } from '../vec';
import { surfaceAt } from './collision';

/** Trémie dans un plancher : [x, z, largeur, profondeur]. */
export type Hole = [number, number, number, number];
/** Ouverture dans un mur de pièce : côté, décalage le long du mur, largeur, hauteur (3 par défaut), hauteur du bas (0 par défaut). */
export type Opening = ['n' | 's' | 'w' | 'e', number, number, number?, number?];

export interface Builder {
  block(x: number, z: number, w: number, d: number, y0: number, y1: number, mat: Mat): void;
  /** Bloc de collision invisible (le décor vient d'un prop). */
  hiddenBlock(x: number, z: number, w: number, d: number, y0: number, y1: number): void;
  /** Bloc purement décoratif, sans collision. */
  deco(x: number, z: number, w: number, d: number, y0: number, y1: number, mat: Mat): void;
  /** Dalle de 0,4 m dont le dessus est à `y`. */
  slab(x: number, z: number, w: number, d: number, y: number, mat: Mat): void;
  /** Rampe : hauteur h0 au bord bas de l'axe, h1 au bord haut. */
  ramp(x: number, z: number, w: number, d: number, h0: number, h1: number, axis: 'x' | 'z', mat: Mat): void;
  floor(x: number, z: number, w: number, d: number, y: number, mat: Mat, holes?: Hole[]): void;
  room(x: number, z: number, w: number, d: number, y0: number, y1: number, mat: Mat, openings?: Opening[]): void;
  walls(w: number, d: number, h: number, mat: Mat): void;
  /** Tremplin posé sur le sol déjà construit à cet endroit. */
  pad(x: number, z: number, vx: number, vy: number, vz: number): void;
  /** Point de spawn au centre de la case (x + 0,5 ; z + 0,5). */
  spawn(x: number, y: number, z: number): void;
  lamp(x: number, y: number, z: number): void;
  prop(p: Prop): void;
  /** Emplacement de bonus au sol, posé sur le sol existant. */
  pickup(x: number, z: number): void;
}

const WALL_T = 0.5;

export function buildMap(def: MapDef): MapData {
  const data: MapData = { def, boxes: [], ramps: [], pads: [], spawns: [], lamps: [], props: [], pickups: [] };
  const push = (x: number, z: number, w: number, d: number, y0: number, y1: number, mat: Mat, solid: boolean, hidden = false) => {
    if (w <= 0.001 || d <= 0.001 || y1 - y0 <= 0.001) return;
    const b: Box = { x0: x, x1: x + w, z0: z, z1: z + d, y0, y1, mat, solid, hidden };
    data.boxes.push(b);
  };
  const b: Builder = {
    block: (x, z, w, d, y0, y1, mat) => push(x, z, w, d, y0, y1, mat, true),
    deco: (x, z, w, d, y0, y1, mat) => push(x, z, w, d, y0, y1, mat, false),
    hiddenBlock: (x, z, w, d, y0, y1) => push(x, z, w, d, y0, y1, 'dark', true, true),
    slab: (x, z, w, d, y, mat) => push(x, z, w, d, y - 0.4, y, mat, true),
    ramp: (x, z, w, d, h0, h1, axis, mat) => { const r: Ramp = { x0: x, x1: x + w, z0: z, z1: z + d, h0, h1, axis, mat }; data.ramps.push(r); },
    floor(x, z, w, d, y, mat, holes = []) {
      const xs = new Set([x, x + w]), zs = new Set([z, z + d]);
      for (const h of holes) { xs.add(h[0]); xs.add(h[0] + h[2]); zs.add(h[1]); zs.add(h[1] + h[3]); }
      const ux = [...xs].filter(v => v >= x && v <= x + w).sort((p, q) => p - q);
      const uz = [...zs].filter(v => v >= z && v <= z + d).sort((p, q) => p - q);
      const inHole = (cx: number, cz: number) => holes.some(h => cx > h[0] && cx < h[0] + h[2] && cz > h[1] && cz < h[1] + h[3]);
      for (let j = 0; j < uz.length - 1; j++) {
        let start: number | null = null;
        for (let i = 0; i < ux.length; i++) {
          const filled = i < ux.length - 1 && !inHole((ux[i] + ux[i + 1]) / 2, (uz[j] + uz[j + 1]) / 2);
          if (filled && start === null) start = ux[i];
          if (!filled && start !== null) { b.slab(start, uz[j], ux[i] - start, uz[j + 1] - uz[j], y, mat); start = null; }
        }
      }
    },
    room(x, z, w, d, y0, y1, mat, openings = []) {
      const sides: Record<string, [number, number, number, 'x' | 'z']> = {
        n: [x, z, w, 'x'], s: [x, z + d - WALL_T, w, 'x'], w: [x, z, d, 'z'], e: [x + w - WALL_T, z, d, 'z']
      };
      for (const k of Object.keys(sides)) {
        const [sx, sz, length, ax] = sides[k];
        const list = openings.filter(o => o[0] === k).map(o => [o[1], o[1] + o[2], o[3] ?? 3, o[4] ?? 0] as const).sort((p, q) => p[0] - q[0]);
        const seg = (from: number, to: number, a: number, c: number) => {
          if (ax === 'x') b.block(sx + from, sz, to - from, WALL_T, a, c, mat); else b.block(sx, sz + from, WALL_T, to - from, a, c, mat);
        };
        let cur = 0;
        for (const o of list) { seg(cur, o[0], y0, y1); seg(o[0], o[1], y0, y0 + o[3]); seg(o[0], o[1], y0 + o[3] + o[2], y1); cur = o[1]; }
        seg(cur, length, y0, y1);
      }
    },
    walls(w, d, h, mat) {
      b.block(-1, -1, w + 2, 1, -1, h, mat); b.block(-1, d, w + 2, 1, -1, h, mat);
      b.block(-1, 0, 1, d, -1, h, mat); b.block(w, 0, 1, d, -1, h, mat);
    },
    pad(x, z, vx, vy, vz) {
      const top = surfaceAt(data, x, z, 1e6);
      const pad: Pad = { x, y: Number.isFinite(top) ? top : 0, z, vx, vy, vz };
      data.pads.push(pad);
    },
    spawn: (x, y, z) => { const s: Vec3 = { x: x + 0.5, y, z: z + 0.5 }; data.spawns.push(s); },
    lamp: (x, y, z) => { const l: Lamp = { x, y, z }; data.lamps.push(l); },
    prop: p => { data.props.push(p); },
    pickup(x, z) { const top = surfaceAt(data, x, z, 1e6); data.pickups.push({ x, y: Number.isFinite(top) ? top : 0, z }); }
  };
  def.build(b);
  return data;
}
