import { makePlayerState, stepPlayer, type Input, type MapData, type NetPlayer, type PlayerState, type Vec3 } from '@sdb/shared';

/** Prédiction du joueur local : on applique ses entrées tout de suite, puis on se recale sur le serveur. */
export class Predictor {
  state: PlayerState;
  private pending: Input[] = [];
  /** Écart visuel restant après un recalage, résorbé en douceur pour éviter les sauts d'image. */
  private offset: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private map: MapData) { this.state = makePlayerState({ x: 0, y: 0, z: 0 }); }

  apply(input: Input) {
    this.state = stepPlayer(this.state, input, this.map);
    this.pending.push(input);
    if (this.pending.length > 240) this.pending.shift();
  }

  reconcile(server: NetPlayer, ack: number) {
    const before = { ...this.state.pos };
    let s: PlayerState = {
      pos: { x: server.x, y: server.y, z: server.z }, vel: { x: server.vx, y: server.vy, z: server.vz },
      yaw: this.state.yaw, pitch: this.state.pitch, onGround: server.onGround, time: server.time,
      dashUntil: server.dashUntil, dashReadyAt: server.dashReadyAt, padUntil: server.padUntil
    };
    this.pending = this.pending.filter(i => i.seq > ack);
    for (const i of this.pending) s = stepPlayer(s, i, this.map);
    const err = Math.hypot(s.pos.x - before.x, s.pos.y - before.y, s.pos.z - before.z);
    if (err < 2) { this.offset.x += before.x - s.pos.x; this.offset.y += before.y - s.pos.y; this.offset.z += before.z - s.pos.z; }
    else this.offset = { x: 0, y: 0, z: 0 };
    s.yaw = this.state.yaw; s.pitch = this.state.pitch;
    this.state = s;
  }

  teleport(pos: Vec3, yaw: number) {
    const time = this.state.time;
    this.state = makePlayerState(pos, yaw); this.state.time = time; this.state.dashReadyAt = time;
    this.pending = []; this.offset = { x: 0, y: 0, z: 0 };
  }

  /** Position à afficher : état prédit + écart résiduel qui s'estompe. */
  renderPos(dt: number): Vec3 {
    const k = Math.exp(-dt * 12);
    this.offset.x *= k; this.offset.y *= k; this.offset.z *= k;
    return { x: this.state.pos.x + this.offset.x, y: this.state.pos.y + this.offset.y, z: this.state.pos.z + this.offset.z };
  }
}
