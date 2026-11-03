import type { MapDef } from '../map/types';

/**
 * Relais forestier, pour 4 à 8 joueurs.
 * Une rivière à -3 m coupe la map d'est en ouest. Au nord, la cabane du relais sur pilotis (+5 m, toit à +9 m),
 * des plateformes dans les arbres et une tour radio. Au sud, un camp avec un mirador et une grande terrasse.
 * Une passerelle à +5 m traverse la rivière entre la cabane et la terrasse.
 */
export const relais: MapDef = {
  id: 'relais',
  name: 'Relais forestier',
  size: [52, 48],
  players: [4, 8],
  lobby: { x: 28, z: 31.2, angle: Math.PI - 0.25 },
  mood: {
    sky: [0x6f8790, 0xb3c2ba],
    fog: 0x9aaba5, fogNear: 35, fogFar: 115,
    hemiSky: 0xcfe0dc, hemiGround: 0x4a4436, hemiIntensity: 0.72,
    sun: 0xfff4e0, sunIntensity: 0.75, sunDir: [-10, 20, 8],
    lamp: 0xffd29a
  },
  build(b) {
    const W = 52, D = 48;
    // sol et rivière
    b.block(0, 0, W, 21, -4, 0, 'ground');
    b.block(0, 27, W, 21, -4, 0, 'ground');
    b.block(0, 21, W, 6, -4, -3, 'rock');
    b.deco(0, 21, W, 6, -3, -2.6, 'water');
    b.walls(W, D, 10, 'rock');
    b.ramp(8, 21, 3, 3, 0, -3, 'z', 'rock');
    b.ramp(40, 24, 3, 3, -3, 0, 'z', 'rock');
    b.slab(14, 21, 4, 6, 0, 'plank');
    b.slab(44, 21, 4, 6, 0, 'plank');
    b.block(22, 23, 2, 1.4, -3, -1.6, 'rock'); b.block(31, 22, 1.6, 2, -3, -1.8, 'rock');

    const post = (x: number, z: number, y0: number, y1: number) => b.block(x - 0.2, z - 0.2, 0.4, 0.4, y0, y1, 'trunk');
    const rail = (x: number, z: number, w: number, d: number, y: number) => b.block(x, z, w, d, y, y + 1, 'trunk');

    // cabane du relais sur pilotis
    b.slab(18, 6, 16, 10, 5, 'plank');
    for (const [x, z] of [[18.5, 6.5], [33.5, 6.5], [18.5, 15.5], [33.5, 15.5], [26, 6.5], [26, 15.5]] as const) post(x, z, 0, 4.6);
    b.room(20, 7, 12, 8, 5, 8.6, 'cabin', [['s', 3, 1.6], ['s', 8, 1.6], ['w', 3, 1.6], ['n', 5, 2, 1.2, 1]]);
    b.slab(19.6, 6.6, 12.8, 8.8, 9, 'roof');
    rail(19.6, 6.6, 12.8, 0.2, 9); rail(19.6, 6.6, 0.2, 8.8, 9);
    b.ramp(14, 6, 4, 10, 0, 5, 'z', 'plank');
    b.ramp(32, 8, 2, 6, 5, 9, 'z', 'plank');
    b.block(22, 10, 2, 1, 5, 6.2, 'plank'); b.block(28, 12, 1.4, 1.4, 5, 6.4, 'cont2');
    // plateformes dans les arbres, reliées à la cabane
    b.slab(2, 2, 6, 6, 5, 'plank'); b.slab(3, 11, 7, 6, 5, 'plank');
    b.slab(4.5, 8, 2, 3, 5, 'plank');
    b.slab(10, 13, 8, 2, 5, 'plank');
    b.block(4.5, 4.5, 1, 1, 0, 8, 'trunk'); b.block(6, 13.5, 1, 1, 0, 8, 'trunk');
    b.ramp(2, 17, 3, 4, 5, 2, 'z', 'plank'); b.block(1.5, 20.5, 4, 0.5, 0, 2, 'trunk');
    b.ramp(9, 2, 4, 3, 5, 0, 'x', 'plank');
    // tour radio à l'est : plateforme +5, nid +10
    b.slab(42, 11, 8, 8, 5, 'grate');
    for (const [x, z] of [[42.3, 11.3], [49.7, 11.3], [42.3, 18.7], [49.7, 18.7]] as const) post(x, z, 0, 9.6);
    b.ramp(38, 11, 4, 8, 0, 5, 'x', 'grate');
    b.slab(44, 13, 4, 4, 10, 'grate');
    rail(44, 13, 4, 0.2, 10); rail(47.8, 13, 0.2, 4, 10);
    b.block(45.6, 14.6, 0.3, 0.3, 10, 15, 'metal');
    b.room(38, 2, 9, 6, 0, 3, 'cabin', [['s', 2, 2.2], ['w', 2, 2]]);
    b.slab(37.8, 1.8, 9.4, 6.4, 3.4, 'roof');
    // abris au sol, au nord
    b.block(4, 21 - 2.6, 6, 1.2, 0, 1.2, 'trunk'); b.block(4.6, 21 - 2.6, 5, 1.2, 1.2, 2.2, 'trunk');
    b.block(36, 17, 1.4, 1.4, 0, 1.4, 'plank'); b.block(10, 6, 1.6, 1.6, 0, 1.6, 'plank'); b.block(23, 2, 3, 1.4, 0, 2.6, 'cont1');
    b.block(30, 18, 2.4, 1.2, 0, 1.3, 'rock');

    // passerelle au-dessus de la rivière et terrasse au sud
    b.slab(24, 16, 3, 18, 5, 'plank');
    rail(23.8, 18, 0.2, 14, 5); rail(27, 18, 0.2, 14, 5);
    post(24.3, 29, 0, 4.6); post(26.7, 29, 0, 4.6); post(24.3, 19, 0, 4.6); post(26.7, 19, 0, 4.6);
    b.slab(16, 34, 16, 10, 5, 'plank');
    for (const [x, z] of [[16.5, 34.5], [31.5, 34.5], [16.5, 43.5], [31.5, 43.5], [24, 43.5]] as const) post(x, z, 0, 4.6);
    b.ramp(32, 36, 6, 4, 5, 0, 'x', 'plank');
    b.block(19, 37, 2, 4, 5, 7.6, 'cabin'); b.block(27, 39, 3, 1.2, 5, 6.3, 'plank');
    rail(16, 43.8, 16, 0.2, 5);
    // mirador au sud-ouest
    b.slab(4, 30, 6, 6, 5, 'plank');
    for (const [x, z] of [[4.3, 30.3], [9.7, 30.3], [4.3, 35.7], [9.7, 35.7]] as const) post(x, z, 0, 4.6);
    b.ramp(10, 31, 6, 3, 5, 0, 'x', 'plank');
    b.slab(4, 30, 6, 6, 8.6, 'roof');
    for (const [x, z] of [[4.3, 30.3], [9.7, 30.3], [4.3, 35.7], [9.7, 35.7]] as const) post(x, z, 5, 8.2);
    // camp du sud : tentes, pick-up, rochers, feu
    b.room(38, 37, 7, 6, 0, 2.4, 'tent', [['w', 2, 2.6, 2.4]]);
    b.prop({ kind: 'roof', x: 41.5, y: 2.4, z: 40, s: 1, r: Math.PI / 2, mat: 'tent', w: 6.4, d: 7.4, h: 1.4 });
    b.room(42, 29, 6, 5, 0, 2.4, 'tent', [['w', 1.5, 2, 2.4]]);
    b.prop({ kind: 'roof', x: 45, y: 2.4, z: 31.5, s: 1, r: Math.PI / 2, mat: 'tent', w: 5.4, d: 6.4, h: 1.3 });
    b.hiddenBlock(10, 40, 2, 4.4, 0, 1.4); b.hiddenBlock(10.3, 40.66, 1.4, 3.08, 1.4, 2.1);
    b.prop({ kind: 'car', x: 11, y: 0, z: 42.2, s: 1, r: 0, mat: 'cont3', w: 2, d: 4.4 });
    b.block(34, 30, 2.4, 2.4, 0, 2, 'rock'); b.block(6, 41, 2, 2, 0, 1.6, 'rock'); b.block(46, 43, 2.6, 2, 0, 2.2, 'rock');
    b.block(36, 33, 1.4, 1.4, 0, 1.4, 'plank');
    b.block(40.3, 34.5, 1.2, 1.2, 0, 0.35, 'rock');
    b.prop({ kind: 'fire', x: 40.9, y: 0.35, z: 35.1, s: 1, r: 0 });

    // abris supplémentaires : rochers dans la rivière, conteneurs, tas de bois, passerelles
    b.block(18, 22, 1.6, 2, -3, -0.4, 'rock'); b.block(29, 24.5, 2, 1.5, -3, -0.6, 'rock'); b.block(37, 21.5, 1.5, 2, -3, -0.5, 'rock'); b.block(48.5, 23, 1.5, 2.5, -3, -0.4, 'rock');
    b.block(34, 13, 2, 4, 0, 2.6, 'cont3'); b.block(12, 9, 4, 2, 0, 2.6, 'cont1'); b.block(17, 28, 4, 2, 0, 2.6, 'cont2');
    b.block(26, 45, 2, 2, 0, 2, 'rock'); b.block(34, 41, 2.4, 1.2, 0, 1.6, 'trunk'); b.block(46, 2, 2, 2, 3.4, 4.8, 'plank');
    b.slab(34, 6, 10, 2.5, 5, 'plank'); b.slab(44, 8.5, 2.5, 2.5, 5, 'plank');
    b.slab(10, 35, 6, 2, 5, 'plank');
    b.room(2, 38, 6, 7, 0, 3, 'cabin', [['e', 2, 2.2]]); b.slab(1.8, 37.8, 6.4, 7.4, 3.4, 'roof');
    b.block(30, 3, 2, 2, 0, 2.2, 'plank'); b.block(14, 44, 3, 1.2, 0, 1.4, 'trunk');

    // sapins dans l'aire de jeu : vrais obstacles
    for (const [x, z] of [[12, 4], [36, 8.5], [16, 19], [40, 19.5], [50.5, 6], [32.5, 1.5], [13, 29], [43, 46.5], [8, 28.5], [49.5, 39], [1.5, 29], [36, 46], [21, 31], [47, 27.5]] as const) {
      b.block(x - 0.4, z - 0.4, 0.8, 0.8, 0, 7, 'trunk');
      b.prop({ kind: 'pine', x, y: 0, z, s: 7 + ((x * 7 + z * 3) % 3), r: x });
    }

    b.block(21, 8, 1.4, 1.4, 0, 1.4, 'plank'); b.block(30, 13, 1.2, 2.4, 0, 2.2, 'cont1'); b.block(24.5, 12, 2.4, 1.2, 0, 2.2, 'cont2');
    b.block(22.5, 35.5, 1.2, 1.2, 5, 6.6, 'cont3'); b.block(29, 41, 1.4, 1.4, 5, 6.4, 'plank'); b.block(16.2, 38.5, 3, 0.3, 5, 7, 'cabin');
    b.block(7.6, 18.1, 0.8, 0.8, 0, 7, 'trunk'); b.prop({ kind: 'pine', x: 8, y: 0, z: 18.5, s: 8, r: 2 });
    b.block(20, 40, 2, 2, 0, 2.6, 'cont1'); b.block(26, 36, 2.4, 1.2, 0, 2.2, 'plank'); b.block(29.5, 38.5, 1.2, 2.4, 0, 2.6, 'cont2');
    // barrières le long des berges
    for (const [x, z, w] of [[19, 19.6, 4], [33, 19.6, 4], [2, 27.1, 5], [28, 27.1, 5], [46, 27.1, 5]] as const) b.block(x, z, w, 0.3, 0, 1.9, 'plank');

    // tremplins
    b.pad(30, 18, 0, 15, -3.5);
    b.pad(22, 30, 0, 15, 3.5);
    b.pad(43.5, 17.5, 0, 15.5, -2);
    b.pad(13, 33, -3.5, 15, 0);

    // objets à ramasser
    b.pickup(26, 11); b.pickup(5, 5); b.pickup(46, 15); b.pickup(24, 39); b.pickup(7, 33); b.pickup(28, 24); b.pickup(41, 22.5);

    b.lamp(26, 4.4, 10.5); b.lamp(24, 4.4, 38); b.lamp(42.5, 4.4, 15); b.lamp(7, 4.4, 33);

    // spawns : sol nord et sud, rivière, plateformes, toit, nid
    for (const [x, y, z] of [
      [3, 0, 10], [12, 0, 18], [44, 0, 9], [35, 0, 3], [30, 0, 30], [3, 0, 45], [48, 0, 36], [20, 0, 46],
      [4, -3, 23], [36, -3, 25],
      [22, 5, 13], [6, 5, 2], [28, 5, 41], [7, 5, 33], [45, 5, 17],
      [27, 9, 9], [45, 10, 15]
    ] as const) b.spawn(x, y, z);

    // forêt autour, herbes, montagnes
    let s = 21;
    const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 110; i++) {
      const side = i % 4, t = r();
      const x = side === 0 ? -3 - r() * 22 : side === 1 ? W + 3 + r() * 22 : t * (W + 34) - 17;
      const z = side === 2 ? -3 - r() * 22 : side === 3 ? D + 3 + r() * 22 : t * (D + 34) - 17;
      b.prop({ kind: 'pine', x, y: 0, z, s: 6 + r() * 7, r: r() * 6 });
    }
    for (const [x, z] of [[4.5, 4.5], [6, 13.5]] as const) b.prop({ kind: 'pine', x: x + 0.5, y: 6, z: z + 0.5, s: 6, r: 0 });
    for (let i = 0; i < 170; i++) b.prop({ kind: 'tuft', x: 1 + r() * (W - 2), y: 0, z: r() < 0.5 ? 1 + r() * 19 : 28 + r() * 19, s: 0.25 + r() * 0.35, r: r() * 6 });
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + r() * 0.3, R = 130 + r() * 40; b.prop({ kind: 'mountain', x: W / 2 + Math.cos(a) * R, y: -2, z: D / 2 + Math.sin(a) * R, s: 32 + r() * 30, r: r() * 6 }); }
  }
};
