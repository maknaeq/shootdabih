import type { MapDef, Mat } from '../map/types';
import type { Builder } from '../map/builder';

/**
 * Circuit des crêtes, pour la course de motos (2 à 12 joueurs). Archétype : circuit.
 * Boucle dans le sens des aiguilles d'une montre : grande ligne droite de départ, montée vers une section
 * en hauteur à +6 m, épingle, descente, tremplin, retour. Piste de 10 m, barrières des deux côtés.
 */
const W = 130, D = 70, R = 10;

function road(b: Builder, x0: number, z0: number, x1: number, z1: number, y: number, mat: Mat = 'concrete') {
  b.block(x0, z0, x1 - x0, z1 - z0, y - 1, y, mat);
}
function barrier(b: Builder, x0: number, z0: number, x1: number, z1: number, y: number) {
  b.block(x0, z0, x1 - x0, z1 - z0, y, y + 1.1, 'white');
}

export const circuit: MapDef = {
  id: 'circuit',
  name: 'Circuit des crêtes',
  size: [W, D],
  players: [2, 12],
  lobby: { x: 40, z: 10, angle: 0.15 },
  race: {
    // ligne d'arrivée, puis les checkpoints dans l'ordre du tour
    checkpoints: [
      { x0: 34, x1: 36, z0: 5, z1: 15 },
      { x0: 108, x1: 120, z0: 5, z1: 15 },
      { x0: 108, x1: 120, z0: 40, z1: 44 },
      { x0: 74, x1: 78, z0: 50, z1: 60 },
      { x0: 10, x1: 22, z0: 50, z1: 60 },
      { x0: 10, x1: 22, z0: 24, z1: 28 }
    ],
    start: { x: 30, z: 10, yaw: -Math.PI / 2 },
    gridStep: [4, 3.2]
  },
  mood: {
    sky: [0x6f9bc4, 0xd8e6ea],
    fog: 0xbfd3da, fogNear: 60, fogFar: 220,
    hemiSky: 0xdfeef5, hemiGround: 0x5a5444, hemiIntensity: 0.8,
    sun: 0xfff2dc, sunIntensity: 0.9, sunDir: [-14, 24, 10],
    lamp: 0xffd29a
  },
  build(b) {
    // terrain de base
    b.block(-20, -20, W + 40, D + 40, -2, -0.6, 'ground');
    // ligne droite de départ (sud), x 10 → 120, z 5 → 15
    road(b, 10, 5, 120, 15, 0);
    barrier(b, 22, 4.4, 108, 5, 0); barrier(b, 22, 15, 108, 15.6, 0);
    // virage 1 (sud-est) et montée vers la section haute
    barrier(b, 120, 4.4, 120.6, 20, 0); barrier(b, 108, 4.4, 120.6, 5, 0);
    road(b, 108, 15, 120, 20, 0);
    b.ramp(108, 20, 12, 18, 0, 6, 'z', 'concrete');
    b.block(108, 20, 12, 18, -2, 0, 'rock');
    barrier(b, 107.4, 15, 108, 38, 0); barrier(b, 120, 20, 120.6, 38, 0);
    // section haute : virage 2 et ligne droite ouest à +6 m, sur piliers
    road(b, 108, 38, 120, 60, 6);
    barrier(b, 120, 38, 120.6, 60.6, 6); barrier(b, 108, 60, 120.6, 60.6, 6); barrier(b, 107.4, 38, 108, 50, 6);
    road(b, 62, 50, 108, 60, 6);
    barrier(b, 62, 60, 108, 60.6, 6); barrier(b, 62, 49.4, 107.4, 50, 6);
    for (let x = 66; x <= 116; x += 10) { b.block(x, 51.5, 1.4, 1.4, -1, 5, 'concrete'); b.block(x, 57, 1.4, 1.4, -1, 5, 'concrete'); }
    b.block(110, 40, 1.4, 1.4, -1, 5, 'concrete'); b.block(116, 46, 1.4, 1.4, -1, 5, 'concrete');
    // descente vers l'ouest
    b.ramp(44, 50, 18, 10, 0, 6, 'x', 'concrete');
    b.block(44, 50, 18, 10, -2, 0, 'rock');
    barrier(b, 44, 60, 62, 60.6, 0); barrier(b, 44, 49.4, 62, 50, 0);
    road(b, 10, 50, 44, 60, 0);
    barrier(b, 22, 49.4, 44, 50, 0); barrier(b, 10, 60, 44, 60.6, 0); barrier(b, 9.4, 38, 10, 60.6, 0);
    // virage 3 (nord-ouest) et retour vers le sud avec un tremplin
    road(b, 10, 15, 22, 50, 0);
    barrier(b, 9.4, 4.4, 10, 38, 0); barrier(b, 22, 15.6, 22.6, 49.4, 0); barrier(b, 9.4, 4.4, 22, 5, 0);
    b.ramp(10, 30, 12, 6, 2.2, 0, 'z', 'orange');
    b.block(10, 30, 12, 6, -1, 0, 'concrete');
    // ligne d'arrivée en damier
    for (let i = 0; i < 10; i++) b.deco(34 + (i % 2), 5 + i, 1, 1, 0, 0.02, i % 2 ? 'white' : 'dark');
    for (let i = 0; i < 10; i++) b.deco(35 - (i % 2), 5 + i, 1, 1, 0, 0.02, i % 2 ? 'dark' : 'white');
    // portique de départ
    b.block(33.6, 3.4, 0.6, 0.6, 0, 6, 'dark'); b.block(33.6, 16, 0.6, 0.6, 0, 6, 'dark'); b.deco(33.6, 3.4, 0.6, 13.2, 6, 7, 'orange');

    // tremplins de secours : remontent sur la section haute si on tombe en dessous
    b.pad(85, 45, 0, 18, 6);

    // décor : prairie, sapins, rochers, montagnes
    let s = 9;
    const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const onTrack = (x: number, z: number) => (z > 2 && z < 18 && x > 7 && x < 123) || (x > 105 && x < 123 && z > 2 && z < 63) || (z > 47 && z < 63 && x > 7 && x < 123) || (x > 7 && x < 25 && z > 2 && z < 63);
    for (let i = 0; i < 160; i++) {
      const x = -15 + r() * (W + 30), z = -15 + r() * (D + 30);
      if (onTrack(x, z)) continue;
      b.prop({ kind: r() < 0.8 ? 'pine' : 'rock', x, y: -0.6, z, s: r() < 0.8 ? 5 + r() * 7 : 1 + r() * 2, r: r() * 6 });
    }
    for (let i = 0; i < 300; i++) { const x = r() * W, z = r() * D; if (!onTrack(x, z)) b.prop({ kind: 'tuft', x, y: -0.6, z, s: 0.3 + r() * 0.4, r: r() * 6 }); }
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2 + r() * 0.2, Rr = 190 + r() * 60; b.prop({ kind: 'mountain', x: W / 2 + Math.cos(a) * Rr, y: -2, z: D / 2 + Math.sin(a) * Rr, s: 45 + r() * 40, r: r() * 6 }); }
    // spawns : grille de départ (le serveur place les motos ; ces points servent de secours)
    for (let i = 0; i < 12; i++) b.spawn(30 - Math.floor(i / 3) * 4, 0, 6.5 + (i % 3) * 3);
    b.lamp(35, 6.5, 10);
    void R;
  }
};
