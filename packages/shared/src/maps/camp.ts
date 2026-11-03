import type { MapDef, Mat } from '../map/types';

/**
 * Camp de base, version provisoire de l'étape 1.
 * Une clairière au centre, entourée d'un anneau de passerelles à +5 m (on circule dessous comme dessus),
 * deux tours à +10 m dans les coins nord-est et sud-ouest. Abris au sol : voitures, conteneurs, tente, caisses.
 */
export const camp: MapDef = {
  id: 'camp',
  name: 'Camp de base',
  size: [48, 44],
  players: [2, 8],
  mood: {
    sky: [0x14282a, 0x3a554b],
    fog: 0x24403b, fogNear: 30, fogFar: 95,
    hemiSky: 0x8fb3a8, hemiGround: 0x2a2620, hemiIntensity: 0.6,
    sun: 0xfff1dc, sunIntensity: 0.85, sunDir: [10, 18, 6],
    lamp: 0xffc27a
  },
  build(b) {
    const W = 48, D = 44;
    b.block(0, 0, W, D, -1, 0, 'ground');
    b.walls(W, D, 8, 'rock');

    // anneau de passerelles à +5 m
    b.slab(2, 3, 44, 4, 5, 'plank');
    b.slab(2, 37, 44, 4, 5, 'plank');
    b.slab(2, 7, 4, 30, 5, 'plank');
    b.slab(42, 7, 4, 30, 5, 'plank');
    // poteaux sous l'anneau, côté clairière
    for (let x = 6; x <= 42; x += 6) { b.block(x - 0.25, 6.5, 0.5, 0.5, 0, 4.6, 'trunk'); b.block(x - 0.25, 37, 0.5, 0.5, 0, 4.6, 'trunk'); }
    for (let z = 13; z <= 31; z += 6) { b.block(5.5, z - 0.25, 0.5, 0.5, 0, 4.6, 'trunk'); b.block(42, z - 0.25, 0.5, 0.5, 0, 4.6, 'trunk'); }
    // garde-corps bas côté clairière, avec des passages
    const rail = (x: number, z: number, w: number, d: number) => b.block(x, z, w, d, 5, 6, 'trunk');
    rail(6, 6.8, 8, 0.2); rail(18, 6.8, 10, 0.2); rail(34, 6.8, 8, 0.2);
    rail(6, 37, 6, 0.2); rail(20, 37, 8, 0.2); rail(34, 37, 8, 0.2);
    rail(5.8, 18, 0.2, 10); rail(42, 10, 0.2, 8); rail(42, 22, 0.2, 6);

    // rampes du sol vers l'anneau
    b.ramp(6, 12, 8, 3, 5, 0, 'x', 'plank');
    b.ramp(34, 30, 8, 3, 0, 5, 'x', 'plank');
    b.ramp(30, 7, 3, 8, 5, 0, 'z', 'plank');
    b.ramp(14, 29, 3, 8, 0, 5, 'z', 'plank');

    // tours à +10 m et leurs rampes depuis l'anneau
    b.slab(38, 0, 8, 7, 10, 'plank');
    b.ramp(30, 3, 8, 4, 5, 10, 'x', 'plank');
    b.slab(2, 37, 8, 7, 10, 'plank');
    b.ramp(10, 37, 8, 4, 10, 5, 'x', 'plank');
    for (const [x, z] of [[38, 0], [45.6, 0], [2, 43.6], [9.6, 43.6]] as const) b.block(x, z, 0.4, 0.4, 5, 9.6, 'trunk');
    rail(38, 6.8, 8, 0.2); b.block(38, 0, 0.2, 7, 10, 11, 'trunk');
    rail(2, 37, 8, 0.2); b.block(9.8, 37, 0.2, 7, 10, 11, 'trunk');
    b.block(42, 1, 3, 3, 10, 12.4, 'cabin');
    b.block(3, 40, 3, 3, 10, 12.4, 'cabin');

    // conteneurs sous l'anneau
    const cont = (x: number, z: number, w: number, d: number, y0: number, m: Mat) => b.block(x, z, w, d, y0, y0 + 2.6, m);
    cont(8, 3.4, 6, 2.4, 0, 'cont1'); cont(35, 3.4, 6, 2.4, 0, 'cont2');
    cont(2.4, 27, 2.4, 6, 0, 'cont3'); cont(43.2, 9, 2.4, 6, 0, 'cont1');
    cont(30, 38.2, 6, 2.4, 0, 'cont2'); cont(12, 38.2, 6, 2.4, 0, 'cont1');

    // clairière : tente, voitures, conteneur avec marche, caisses, feu de camp
    b.room(27, 23, 9, 8, 0, 2.4, 'tent', [['w', 2, 4, 2.4]]);
    b.deco(27, 23, 9, 8, 2.4, 3.4, 'tent');
    const car = (x: number, z: number, w: number, d: number, m: Mat) => {
      b.block(x, z, w, d, 0, 1.4, m);
      const cx = x + w * 0.15, cz = z + d * 0.15;
      b.block(cx, cz, w * 0.7, d * 0.7, 1.4, 2.1, m);
    };
    car(10, 24, 2, 4.4, 'orange'); car(21, 12, 4.4, 2, 'cont3'); car(36, 15, 2, 4.4, 'orange');
    cont(17, 18, 2.4, 6, 0, 'cont2'); cont(9, 16, 6, 2.4, 0, 'cont3'); cont(7, 33, 6, 2.4, 0, 'cont2'); cont(36, 34, 6, 2.4, 0, 'cont1');
    b.block(29, 14, 4, 3, 0, 3, 'cabin'); b.deco(28.8, 13.8, 4.4, 3.4, 3, 3.3, 'roof'); b.block(17, 24, 2.4, 1.6, 0, 1.3, 'plank');
    b.block(31, 11, 1.4, 1.4, 0, 1.4, 'plank'); b.block(32.6, 11.2, 1, 1, 0, 1, 'plank');
    b.block(9, 31, 1.4, 1.4, 0, 1.4, 'plank'); b.block(24, 31, 1.6, 1.6, 0, 1.6, 'plank');
    b.block(22.7, 21.2, 1.6, 1.6, 0, 0.4, 'rock');
    b.block(20.5, 20, 0.6, 4, 0, 0.6, 'trunk'); b.block(25.3, 20, 0.6, 4, 0, 0.6, 'trunk');

    // pont nord-sud au-dessus de la clairière, avec une plateforme au milieu
    b.slab(22, 7, 4, 30, 5, 'plank');
    b.slab(18, 19, 12, 6, 5, 'plank');
    b.block(18.5, 20, 2.5, 4, 5, 7.6, 'cabin'); b.block(27, 20, 2.5, 4, 5, 7.6, 'cabin');
    rail(21.8, 9, 0.2, 9); rail(26, 9, 0.2, 9); rail(21.8, 26, 0.2, 9); rail(26, 26, 0.2, 9);
    for (const [x, z] of [[22, 12], [25.6, 12], [22, 31], [25.6, 31], [18, 19], [29.6, 24.6]] as const) b.block(x, z, 0.4, 0.4, 0, 4.6, 'trunk');
    // cabanons sur l'anneau et caisses dans les couloirs du dessous, pour couper les longues vues
    for (const [x, z] of [[12, 3], [16, 5], [36, 39], [40, 37], [2, 16], [4, 24], [42, 20], [44, 32]] as const) b.block(x, z, 2, 2, 5, 7.6, 'cabin');
    for (const [x, z] of [[18, 3.5], [22, 38.5], [2.5, 12], [43.5, 30]] as const) b.block(x, z, 2, 2, 0, 2.6, 'plank');

    // tremplins de la clairière vers l'anneau
    b.pad(16, 10, 0, 15, -3.5);
    b.pad(20, 33, 0, 15, 3.5);
    b.pad(38.5, 22, 3.5, 15, 0);

    // bonus : deux au sol, un sur l'anneau, un sur la plateforme centrale
    b.pickup(14, 21); b.pickup(34, 27); b.pickup(44, 6); b.pickup(24, 22);

    b.lamp(12, 4.4, 7.5); b.lamp(36, 4.4, 7.5); b.lamp(12, 4.4, 36.5); b.lamp(36, 4.4, 36.5);

    // spawns : sol, dessous de l'anneau, anneau, tours
    for (const [x, y, z] of [
      [8, 0, 22], [39, 0, 19], [24, 0, 8], [23, 0, 35],
      [3, 0, 21], [44, 0, 23], [24, 0, 4],
      [3, 5, 19], [44, 5, 27], [20, 5, 4], [27, 5, 39],
      [41, 10, 3], [6, 10, 40]
    ] as const) b.spawn(x, y, z);

    // forêt autour
    let s = 7;
    const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 90; i++) {
      const side = i % 4, t = r();
      const x = side === 0 ? -3 - r() * 18 : side === 1 ? W + 3 + r() * 18 : t * (W + 30) - 15;
      const z = side === 2 ? -3 - r() * 18 : side === 3 ? D + 3 + r() * 18 : t * (D + 30) - 15;
      if ((side === 0 || side === 1) && (z < -15 || z > D + 15)) continue;
      b.prop({ kind: 'pine', x, y: 0, z, s: 5 + r() * 6, r: r() * 6 });
    }
    for (let i = 0; i < 10; i++) b.prop({ kind: 'rock', x: r() * W, y: 0, z: r() < 0.5 ? -2 - r() * 6 : D + 2 + r() * 6, s: 0.8 + r() * 1.6, r: r() * 6 });
  }
};
