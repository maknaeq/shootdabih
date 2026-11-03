import { CONFIG } from '@sdb/shared';
import { Room, realClock, type Clock } from './room';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class Rooms {
  private rooms = new Map<string, Room>();
  constructor(private clock: Clock = realClock, private rand: () => number = Math.random) {}

  create(mapId = 'camp'): Room {
    let code = '';
    do { code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(this.rand() * ALPHABET.length)]).join(''); } while (this.rooms.has(code));
    const room = new Room(code, mapId, this.clock, this.rand);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined { return this.rooms.get(code.toUpperCase()); }
  get count() { return this.rooms.size; }

  tick() {
    const now = this.clock.now();
    for (const [code, r] of this.rooms) {
      if (r.size === 0) { if (now - r.emptySince > CONFIG.emptyRoomTtlMs) this.rooms.delete(code); continue; }
      r.tick();
    }
  }
}
