import { getMap, groundAt, hitsWall } from '../packages/shared/src/index';
for (const id of process.argv.slice(2)) {
  const m = getMap(id);
  m.spawns.forEach((s, i) => {
    const g = groundAt(m, s.x, s.z, s.y);
    if (Math.abs(g - s.y) > 0.15 || hitsWall(m, s.x, s.z, s.y)) {
      const hit = m.boxes.find(b => b.solid && s.x + 0.3 > b.x0 && s.x - 0.3 < b.x1 && s.z + 0.3 > b.z0 && s.z - 0.3 < b.z1 && b.y1 > s.y + 0.55 && b.y0 < s.y + 1.75);
      console.log(id, 'spawn', i, s, 'sol', g, 'mur', hit);
    }
  });
}
