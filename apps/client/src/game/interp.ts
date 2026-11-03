import type { NetPlayer } from '@sdb/shared';

interface Sample { t: number; p: NetPlayer }

/** Garde les derniers états des autres joueurs et les affiche avec un léger retard, sans à-coups. */
export class Interpolator {
  private buf = new Map<string, Sample[]>();

  push(serverTime: number, players: NetPlayer[]) {
    for (const p of players) {
      const list = this.buf.get(p.id) ?? this.buf.set(p.id, []).get(p.id)!;
      list.push({ t: serverTime, p });
      while (list.length > 40) list.shift();
    }
  }

  /** Après une réapparition, on oublie l'ancien trajet pour ne pas glisser à travers la map. */
  reset(id: string) { this.buf.delete(id); }
  remove(id: string) { this.buf.delete(id); }

  sample(id: string, t: number): (NetPlayer & { speed: number }) | null {
    const list = this.buf.get(id);
    if (!list || !list.length) return null;
    if (t <= list[0].t) return { ...list[0].p, speed: 0 };
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].t <= t) {
        const a = list[i], b = list[i + 1];
        if (!b) {
          const ahead = Math.min(0.15, Math.max(0, (t - a.t) / 1000));
          return { ...a.p, x: a.p.x + a.p.vx * ahead, z: a.p.z + a.p.vz * ahead, speed: Math.hypot(a.p.vx, a.p.vz) };
        }
        const k = (t - a.t) / (b.t - a.t || 1);
        let dy = b.p.yaw - a.p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        return {
          ...b.p,
          x: a.p.x + (b.p.x - a.p.x) * k, y: a.p.y + (b.p.y - a.p.y) * k, z: a.p.z + (b.p.z - a.p.z) * k,
          yaw: a.p.yaw + dy * k, pitch: a.p.pitch + (b.p.pitch - a.p.pitch) * k,
          alive: k < 0.5 ? a.p.alive : b.p.alive,
          speed: Math.hypot(b.p.vx, b.p.vz)
        };
      }
    }
    return { ...list[list.length - 1].p, speed: 0 };
  }
}
