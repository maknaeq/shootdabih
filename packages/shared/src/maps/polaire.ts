import type { MapDef, Mat } from '../map/types';
import type { Builder, Opening } from '../map/builder';

/**
 * Station polaire, pour 4 à 10 joueurs. Archétype : intérieur. Modules et couloirs, peu de ciel.
 * Symétrique d'ouest en est (miroir) pour la capture du drapeau : une base dans chaque module d'extrémité.
 * Trois chemins entre les bases : la cour enneigée au sol, les passerelles vitrées à +4,5 m,
 * et le tunnel technique à −3 m qui passe sous le hall central.
 */
const W = 60, D = 40;

/** Construit un élément et son miroir d'ouest en est. */
function sym(b: Builder, f: (m: Mirror) => void) { f(direct); f(mirrored); }
interface Mirror {
  block(x: number, z: number, w: number, d: number, y0: number, y1: number, mat: Mat): void;
  slab(x: number, z: number, w: number, d: number, y: number, mat: Mat): void;
  ramp(x: number, z: number, w: number, d: number, h0: number, h1: number, axis: 'x' | 'z', mat: Mat): void;
  room(x: number, z: number, w: number, d: number, y0: number, y1: number, mat: Mat, ops: Opening[]): void;
  spawn(x: number, y: number, z: number): void;
  pickup(x: number, z: number): void;
  pad(x: number, z: number, vx: number, vy: number, vz: number): void;
  lamp(x: number, y: number, z: number): void;
  floor(x: number, z: number, w: number, d: number, y: number, mat: Mat, holes: Array<[number, number, number, number]>): void;
}
let B: Builder;
const direct: Mirror = {
  block: (...a) => B.block(...a), slab: (...a) => B.slab(...a), ramp: (...a) => B.ramp(...a), room: (...a) => B.room(...a),
  spawn: (...a) => B.spawn(...a), pickup: (...a) => B.pickup(...a), pad: (...a) => B.pad(...a), lamp: (...a) => B.lamp(...a), floor: (...a) => B.floor(...a)
};
const flipSide = (s: Opening[0]): Opening[0] => (s === 'w' ? 'e' : s === 'e' ? 'w' : s);
const mirrored: Mirror = {
  block: (x, z, w, d, y0, y1, m) => B.block(W - x - w, z, w, d, y0, y1, m),
  slab: (x, z, w, d, y, m) => B.slab(W - x - w, z, w, d, y, m),
  ramp: (x, z, w, d, h0, h1, ax, m) => ax === 'x' ? B.ramp(W - x - w, z, w, d, h1, h0, ax, m) : B.ramp(W - x - w, z, w, d, h0, h1, ax, m),
  room: (x, z, w, d, y0, y1, m, ops) => B.room(W - x - w, z, w, d, y0, y1, m, ops.map(o => {
    const side = flipSide(o[0]);
    const off = o[0] === 'n' || o[0] === 's' ? w - o[1] - o[2] : o[1];
    return [side, off, o[2], o[3], o[4]] as Opening;
  })),
  spawn: (x, y, z) => B.spawn(W - x - 1, y, z),
  pickup: (x, z) => B.pickup(W - x, z),
  pad: (x, z, vx, vy, vz) => B.pad(W - x, z, -vx, vy, vz),
  lamp: (x, y, z) => B.lamp(W - x, y, z),
  floor: (x, z, w, d, y, m, holes) => B.floor(W - x - w, z, w, d, y, m, holes.map(h => [W - h[0] - h[2], h[1], h[2], h[3]] as [number, number, number, number]))
};

export const polaire: MapDef = {
  id: 'polaire',
  name: 'Station polaire',
  size: [W, D],
  players: [4, 10],
  lobby: { x: 26, z: 33.5, angle: Math.PI / 2 },
  ctf: { bases: [{ x: 6.5, z: 25 }, { x: 53.5, z: 25 }] },
  mood: {
    sky: [0x0b1a2e, 0x2b4a6a],
    fog: 0x1d3550, fogNear: 28, fogFar: 95,
    hemiSky: 0x9fc3e8, hemiGround: 0x2a3040, hemiIntensity: 0.75,
    sun: 0xcfe0ff, sunIntensity: 0.6, sunDir: [-6, 20, -10],
    lamp: 0xffb36a
  },
  build(b) {
    B = b;
    // sous-sol plein, avec le tunnel technique à −3 m (z 18 à 22, x 6 à 54)
    b.block(0, 0, W, 18, -4, -0.4, 'rock'); b.block(0, 22, W, 18, -4, -0.4, 'rock');
    b.block(0, 18, 6, 4, -4, -0.4, 'rock'); b.block(54, 18, 6, 4, -4, -0.4, 'rock');
    b.block(6, 18, 48, 4, -4, -3, 'concrete');
    // sol enneigé, percé aux escaliers du tunnel
    b.floor(0, 0, W, D, 0, 'snow', [[8, 18, 5, 4], [47, 18, 5, 4], [26, 18, 8, 4]]);
    b.walls(W, D, 7, 'rock');

    // tunnel : escaliers, tuyaux, caisses
    b.ramp(26, 18, 4, 4, 0, -3, 'x', 'grate'); b.ramp(30, 18, 4, 4, -3, 0, 'x', 'grate');
    sym(b, m => {
      m.ramp(8, 18, 5, 4, -3, 0, 'x', 'grate');
      m.block(15, 18, 1.4, 1.2, -3, -1.6, 'cont1'); m.block(20, 20.8, 1.6, 1.2, -3, -1.4, 'metal');
      m.block(6, 18, 48 / 2 - 6, 0.4, -1.4, -0.8, 'orange');
    });

    sym(b, m => {
      // module de base : deux niveaux, le drapeau au rez-de-chaussée
      m.room(2, 12, 12, 16, 0, 9, 'white', [['e', 5, 3], ['e', 11, 3], ['n', 7, 3], ['s', 2, 3], ['e', 2, 2.5, 3, 4.5], ['s', 8, 3, 1.4, 5.6]]);
      m.floor(2.5, 12.5, 11, 15, 4.5, 'metal', [[3, 13, 3, 8]]);
      m.ramp(3, 13, 3, 8, 0, 4.5, 'z', 'grate');
      m.slab(1.6, 11.6, 12.8, 16.8, 9.4, 'roof');
      m.block(9, 24, 3, 1.2, 0, 1.6, 'cont2'); m.block(3, 22, 1.2, 1.2, 0, 2.2, 'metal');
      m.block(9.5, 14, 3, 2, 4.5, 6, 'cont1'); m.block(3, 24, 2.4, 1, 4.5, 5.7, 'metal');
      m.lamp(8, 4.3, 20);
      // passerelle vitrée vers le hall central, à +4,5 m
      m.slab(14, 14, 10, 2.5, 4.5, 'grate');
      m.block(14, 13.8, 10, 0.2, 4.5, 5.6, 'metal'); m.block(14, 16.5, 10, 0.2, 4.5, 5.6, 'metal');
      m.block(18.8, 14, 0.4, 2.5, 0, 4.1, 'metal');
      // modules de stockage dans la cour, toits praticables
      m.room(16, 2, 6, 5, 0, 3, 'white', [['s', 1, 2], ['e', 1.5, 2]]); m.slab(15.8, 1.8, 6.4, 5.4, 3.4, 'roof');
      m.ramp(16, 7, 3, 4, 3.4, 0, 'z', 'grate');
      m.room(16, 33, 6, 5, 0, 3, 'white', [['n', 3, 2], ['e', 1.5, 2]]); m.slab(15.8, 32.8, 6.4, 5.4, 3.4, 'roof');
      m.ramp(19, 29, 3, 4, 0, 3.4, 'z', 'grate');
      // abris dans la neige
      m.block(16, 21, 1.4, 4, 0, 1.8, 'snow'); m.block(19, 12.5, 2.4, 1.2, 0, 2.6, 'cont3');
      m.block(21.5, 26, 1.2, 2.4, 0, 2.6, 'cont2'); m.block(5, 4, 2.4, 2.4, 0, 2, 'rock'); m.block(5, 33, 3, 2, 0, 1.8, 'rock');
      m.block(10, 8, 1.4, 1.4, 0, 1.4, 'cont1'); m.block(11, 31, 2, 1.2, 0, 1.6, 'snow');
      // antenne et tremplin vers le toit de stockage
      m.block(9.6, 2.6, 0.3, 0.3, 0, 6, 'metal');
      m.pad(14, 9.5, 2.5, 13, -2.5);
      // objets à ramasser et spawns
      m.pickup(8, 15); m.pickup(19, 4.5); m.pickup(17, 20); m.pickup(19, 15.25);
      for (const [x, y, z] of [[4, 0, 26], [11, 0, 13], [10, 4.5, 25], [8, 4.5, 16], [16, -3, 21], [8, 0, 7], [12, 0, 35], [18, 3.4, 4], [18, 3.4, 35]] as const) m.spawn(x, y, z);
    });

    // hall central : deux niveaux autour d'un atrium, accès au tunnel au milieu
    b.room(24, 10, 12, 20, 0, 9, 'white', [['w', 7, 3], ['w', 14, 3], ['e', 7, 3], ['e', 14, 3], ['n', 4.5, 3], ['s', 4.5, 3], ['w', 4, 2.5, 3, 4.5], ['e', 4, 2.5, 3, 4.5]]);
    b.floor(24.5, 10.5, 11, 19, 4.5, 'grate', [[27.5, 15, 5, 10], [25, 11, 2, 6], [33, 11, 2, 6]]);
    b.ramp(25, 11, 2, 6, 0, 4.5, 'z', 'grate'); b.ramp(33, 11, 2, 6, 0, 4.5, 'z', 'grate');
    b.slab(23.6, 9.6, 12.8, 20.8, 9.4, 'roof');
    b.block(27.3, 14.8, 5.4, 0.2, 4.5, 5.5, 'metal'); b.block(27.3, 25, 5.4, 0.2, 4.5, 5.5, 'metal');
    b.block(28.5, 26, 3, 1.4, 0, 2.2, 'cont1'); b.block(25, 21.5, 1.2, 2.4, 0, 2.4, 'metal'); b.block(33.8, 21.5, 1.2, 2.4, 0, 2.4, 'metal');
    b.block(29, 27.5, 2, 1.2, 4.5, 5.9, 'cont3');
    b.lamp(30, 8.6, 20); b.lamp(30, 4.3, 27);
    b.pickup(30, 12.5); b.pickup(30, 20); b.pickup(30, 34); b.pickup(30, 5);
    for (const [x, y, z] of [[29, 0, 28], [25, 4.5, 27], [34, 4.5, 27]] as const) b.spawn(x, y, z);
    // cour centrale nord et sud
    b.block(27, 2, 6, 2.4, 0, 2.6, 'cont2'); b.block(28.5, 36, 3, 2, 0, 2.2, 'snow');

    // décor : montagnes enneigées, quelques sapins, neige
    let s = 5;
    const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + r() * 0.3, R = 110 + r() * 40; b.prop({ kind: 'mountain', x: W / 2 + Math.cos(a) * R, y: -2, z: D / 2 + Math.sin(a) * R, s: 34 + r() * 30, r: r() * 6 }); }
    for (let i = 0; i < 40; i++) { const side = i % 2; b.prop({ kind: 'pine', x: r() * W, y: 0, z: side ? -4 - r() * 18 : D + 4 + r() * 18, s: 4 + r() * 5, r: r() * 6 }); }
    for (let i = 0; i < 12; i++) b.prop({ kind: 'rock', x: r() < 0.5 ? -3 - r() * 10 : W + 3 + r() * 10, y: 0, z: r() * D, s: 1 + r() * 2, r: r() * 6 });
  }
};
