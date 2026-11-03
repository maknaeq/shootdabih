import { describe, expect, it } from 'vitest';
import {
  CONFIG, buildMap, chooseSpawn, decodeClient, forwardFromAngles, getMap, groundAt, hitsWall, makePlayerState,
  measureMap, rayCapsule, segmentBlocked, stepPlayer, surfaceAt, traceShot, type Input, type MapDef, type PlayerState
} from '../src/index';

const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const mood = { sky: [0, 0] as [number, number], fog: 0, fogNear: 1, fogFar: 2, hemiSky: 0, hemiGround: 0, hemiIntensity: 1, sun: 0, sunIntensity: 1, sunDir: [0, 1, 0] as [number, number, number], lamp: 0 };
const def = (build: MapDef['build'], size: [number, number] = [40, 40]): MapDef => ({ id: 't', name: 't', size, players: [2, 8], mood, build });

// sol 40×40, un mur en x 10..11, une rampe de 0 à 2 sur x 20..24, une dalle à 3 m en z 30..34
const test = buildMap(def(b => {
  b.block(0, 0, 40, 40, -1, 0, 'ground');
  b.block(10, 0, 1, 40, 0, 4, 'rock');
  b.ramp(20, 10, 4, 4, 0, 2, 'x', 'plank');
  b.block(24, 10, 4, 4, 0, 2, 'plank');
  b.slab(12, 30, 10, 4, 3, 'plank');
  b.pad(15, 5, 0, 15, 0);
}));

const input = (over: Partial<Input> = {}): Input => ({ seq: 0, dt: 1 / 60, fwd: false, back: false, left: false, right: false, jump: false, dash: false, yaw: 0, pitch: 0, ...over });
const run = (s: PlayerState, seconds: number, over: Partial<Input> = {}, map = test) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) s = stepPlayer(s, input({ seq: i, ...over }), map);
  return s;
};

describe('vecteurs', () => {
  it('regard selon les angles', () => {
    const f0 = forwardFromAngles(0, 0); near(f0.x, 0); near(f0.z, -1);
    const f1 = forwardFromAngles(Math.PI / 2, 0); near(f1.x, -1); near(f1.z, 0);
    const f2 = forwardFromAngles(0, Math.PI / 2); near(f2.y, 1);
  });
});

describe('construction de map', () => {
  it('plancher percé : tout est couvert sauf la trémie', () => {
    const m = buildMap(def(b => b.floor(0, 0, 10, 10, 5, 'plank', [[3, 3, 4, 2]])));
    const area = m.boxes.reduce((a, x) => a + (x.x1 - x.x0) * (x.z1 - x.z0), 0);
    near(area, 100 - 8);
    expect(surfaceAt(m, 5, 4, 10)).toBe(-Infinity);
    expect(surfaceAt(m, 1, 1, 10)).toBe(5);
  });
  it('pièce avec porte : linteau au-dessus de la porte', () => {
    const m = buildMap(def(b => b.room(0, 0, 10, 10, 0, 5, 'cabin', [['n', 2, 2]])));
    expect(m.boxes.some(x => x.x0 === 2 && x.x1 === 4 && x.y0 === 3 && x.y1 === 5)).toBe(true);
    expect(m.boxes.some(x => x.x0 === 2 && x.x1 === 4 && x.y0 === 0)).toBe(false);
  });
  it('tremplin posé sur le sol existant', () => {
    expect(test.pads[0].y).toBe(0);
  });
});

describe('collisions', () => {
  it('sol, rampe, marche', () => {
    expect(groundAt(test, 5, 5, 0)).toBe(0);
    near(surfaceAt(test, 22, 12, 10), 1, 1e-9);
    expect(groundAt(test, 26, 12, 0)).toBe(0); // bloc de 2 m trop haut pour une marche
    expect(groundAt(test, 26, 12, 1.8)).toBe(2);
  });
  it('mur bloquant, passage sous la dalle', () => {
    expect(hitsWall(test, 10.5, 5, 0)).toBe(true);
    expect(hitsWall(test, 15, 32, 0)).toBe(false);
  });
  it('segment bloqué par le mur', () => {
    const t = segmentBlocked(test, { x: 5, y: 1, z: 5 }, { x: 15, y: 1, z: 5 });
    expect(t).not.toBeNull(); near(t!, 0.5, 1e-9);
    expect(segmentBlocked(test, { x: 2, y: 1, z: 5 }, { x: 8, y: 1, z: 5 })).toBeNull();
  });
});

describe('physique', () => {
  it('chute et arrêt au sol', () => {
    const s = run(makePlayerState({ x: 5, y: 3, z: 5 }), 1.5);
    near(s.pos.y, 0, 1e-6); expect(s.onGround).toBe(true);
  });
  it('saut d’environ 2 m', () => {
    let s = run(makePlayerState({ x: 5, y: 0, z: 5 }), 0.2);
    let top = 0;
    s = stepPlayer(s, input({ jump: true }), test);
    for (let i = 0; i < 90; i++) { s = stepPlayer(s, input(), test); top = Math.max(top, s.pos.y); }
    expect(top).toBeGreaterThan(1.8); expect(top).toBeLessThan(2.3);
  });
  it('course à 9 m/s', () => {
    const s = run(makePlayerState({ x: 3, y: 0, z: 38 }, Math.PI), 1, { fwd: true });
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeGreaterThan(8.5);
  });
  it('dash puis recharge de 2 s', () => {
    let s = run(makePlayerState({ x: 3, y: 0, z: 38 }, Math.PI), 0.3);
    s = stepPlayer(s, input({ dash: true, yaw: Math.PI }), test);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeGreaterThan(17);
    const ready = s.dashReadyAt;
    near(ready - (s.time - 1 / 60), CONFIG.dashCooldown, 1e-6);
    s = run(s, 0.5, { yaw: Math.PI });
    const v = Math.hypot(s.vel.x, s.vel.z);
    s = stepPlayer(s, input({ dash: true, yaw: Math.PI }), test);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeLessThanOrEqual(Math.max(v, CONFIG.runSpeed) + 0.5);
  });
  it('le mur arrête le joueur', () => {
    const s = run(makePlayerState({ x: 5, y: 0, z: 5 }, -Math.PI / 2), 2, { fwd: true, yaw: -Math.PI / 2 });
    expect(s.pos.x).toBeLessThan(10 - CONFIG.playerRadius + 0.01);
  });
  it('tremplin', () => {
    const s = run(makePlayerState({ x: 15, y: 0.05, z: 5 }), 0.3);
    expect(s.pos.y).toBeGreaterThan(1);
  });
  it('montée de rampe', () => {
    const s = run(makePlayerState({ x: 18, y: 0, z: 12 }, -Math.PI / 2), 1.2, { fwd: true, yaw: -Math.PI / 2 });
    expect(s.pos.x).toBeGreaterThan(24); near(s.pos.y, 2, 0.05);
  });
});

describe('tir', () => {
  it('cylindre touché en face, raté à côté', () => {
    const d = rayCapsule({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -10 }, 0.45, 1.85);
    near(d!, 9.55, 1e-6);
    expect(rayCapsule({ x: 2, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -10 }, 0.45, 1.85)).toBeNull();
  });
  it('le mur protège, le plus proche est touché', () => {
    const o = { x: 5, y: 1.6, z: 5 }, dir = { x: 1, y: 0, z: 0 };
    expect(traceShot(test, o, dir, [{ id: 'b', pos: { x: 15, y: 0, z: 5 } }]).hitId).toBeNull();
    const r = traceShot(test, o, dir, [{ id: 'far', pos: { x: 9, y: 0, z: 5 } }, { id: 'near', pos: { x: 7, y: 0, z: 5 } }]);
    expect(r.hitId).toBe('near');
  });
});

describe('règle de spawn', () => {
  const m = buildMap(def(b => {
    b.block(0, 0, 40, 40, -1, 0, 'ground');
    b.spawn(1, 0, 1); b.spawn(38, 0, 38); b.spawn(1, 0, 38); b.spawn(38, 0, 1);
  }));
  const rand = () => 0.5;
  it('jamais à moins de 8 m d’un ennemi', () => {
    for (let i = 0; i < 4; i++) {
      const e = m.spawns[i];
      const k = chooseSpawn(m, [{ x: e.x + 1, y: 0, z: e.z }], [], 100, rand);
      expect(k).not.toBe(i);
    }
  });
  it('tous écartés : le plus éloigné', () => {
    const k = chooseSpawn(m, [{ x: 20, y: 0, z: 20 }, ...m.spawns.slice(0, 3)], [], 100, () => 0);
    expect(k).toBe(3);
  });
  it('un spawn tout juste utilisé est déconseillé', () => {
    const k = chooseSpawn(m, [], [99, -1e9, -1e9, -1e9], 100, () => 0.99);
    expect(k).not.toBe(0);
  });
});

describe('protocole', () => {
  it('refuse un message mal formé', () => {
    expect(decodeClient('pas du json')).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'input', inputs: [{ seq: 1 }] }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'fire', seq: 1, yaw: 0, pitch: 0, renderTime: 10 }))?.t).toBe('fire');
  });
});

describe('Camp de base', () => {
  const camp = getMap('camp');
  it('chaque spawn est sur un sol et pas dans un mur', () => {
    camp.spawns.forEach(s => {
      expect(Math.abs(groundAt(camp, s.x, s.z, s.y) - s.y)).toBeLessThan(0.15);
      expect(hitsWall(camp, s.x, s.z, s.y)).toBe(false);
    });
  });
  it('chaque tremplin a un sol', () => { camp.pads.forEach(p => expect(Number.isFinite(p.y)).toBe(true)); });
  it('respecte les règles de densité', () => {
    const m = measureMap(camp);
    expect(m.medianSight).toBeLessThanOrEqual(9);
    expect(m.p90Sight).toBeLessThanOrEqual(36);
    expect(m.multiLevel).toBeGreaterThanOrEqual(0.3);
  });
});
