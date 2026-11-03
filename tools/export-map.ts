import { writeFileSync } from 'node:fs';
import { getMap } from '../packages/shared/src/index';
const [id, out] = process.argv.slice(2);
const m = getMap(id);
const r = (n: number) => Math.round(n * 100) / 100;
writeFileSync(out, JSON.stringify({
  name: m.def.name, size: m.def.size, players: m.def.players, mood: m.def.mood,
  boxes: m.boxes.filter(b => !b.hidden).map(b => [r(b.x0), r(b.x1), r(b.y0), r(b.y1), r(b.z0), r(b.z1), b.mat]),
  ramps: m.ramps.map(q => [q.x0, q.x1, q.z0, q.z1, q.h0, q.h1, q.axis, q.mat]),
  props: m.props.filter(p => p.kind !== 'tuft').map(p => [p.kind, r(p.x), r(p.y), r(p.z), r(p.s), r(p.r), p.mat ?? '', p.w ?? 0, p.d ?? 0, p.h ?? 0]),
  pads: m.pads.map(p => [p.x, p.y, p.z]), pickups: m.pickups.map(p => [p.x, p.y, p.z]), spawns: m.spawns.length
}));
console.log('ok', out);
