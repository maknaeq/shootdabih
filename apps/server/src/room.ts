import {
  CONFIG, PARKA_COLORS, chooseSpawn, cleanName, eyeOf, forwardFromAngles, getMap, makePlayerState, openYaw, stepPlayer, traceShot,
  type ClientMsg, type Input, type LobbyPlayer, type MapData, type NetPlayer, type PlayerState, type RoomState, type ScoreLine, type ServerMsg, type Vec3
} from '@sdb/shared';

export interface Clock { now(): number }
export const realClock: Clock = { now: () => performance.now() };

interface Player {
  id: string;
  name: string;
  color: number;
  send(m: ServerMsg): void;
  state: PlayerState;
  alive: boolean;
  respawnAt: number;
  kills: number;
  deaths: number;
  streak: number;
  bestStreak: number;
  lastFireAt: number;
  queue: Input[];
  ack: number;
  history: Array<{ t: number; pos: Vec3 }>;
}

const HISTORY_MS = 1000;
const END_SCREEN_MS = 8000;

export class Room {
  readonly players = new Map<string, Player>();
  hostId: string | null = null;
  state: RoomState = 'lobby';
  emptySince: number;
  private map: MapData;
  private endsAt = 0;
  private endedAt = 0;
  private lastSnapshot = 0;
  private lastUsed: number[] = [];
  private nextId = 1;

  constructor(readonly code: string, readonly mapId: string, private clock: Clock = realClock, private rand: () => number = Math.random) {
    this.map = getMap(mapId);
    this.emptySince = clock.now();
  }

  get size() { return this.players.size; }

  addPlayer(rawName: string, send: (m: ServerMsg) => void): string | null {
    if (this.players.size >= CONFIG.maxPlayers) { send({ t: 'error', message: 'Le salon est plein (12 joueurs).' }); return null; }
    const id = 'p' + this.nextId++;
    const used = new Set([...this.players.values()].map(p => p.color));
    const color = PARKA_COLORS.find(c => !used.has(c)) ?? PARKA_COLORS[0];
    const p: Player = {
      id, name: cleanName(rawName), color, send, state: makePlayerState({ x: 0, y: 0, z: 0 }), alive: false, respawnAt: 0,
      kills: 0, deaths: 0, streak: 0, bestStreak: 0, lastFireAt: -1e9, queue: [], ack: -1, history: []
    };
    this.players.set(id, p);
    if (!this.hostId) this.hostId = id;
    send({ t: 'welcome', you: id, room: this.code, mapId: this.mapId, hostId: this.hostId, serverTime: this.clock.now() });
    this.broadcastLobby();
    if (this.state === 'playing') {
      send({ t: 'start', mapId: this.mapId, endsAt: this.endsAt });
      p.respawnAt = this.clock.now();
      send({ t: 'scores', list: this.scores() });
    }
    return id;
  }

  removePlayer(id: string) {
    if (!this.players.delete(id)) return;
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null;
    if (this.players.size === 0) { this.emptySince = this.clock.now(); this.state = 'lobby'; return; }
    if (this.state === 'playing' && this.players.size < 2) this.endMatch();
    this.broadcastLobby();
    if (this.state === 'playing') this.broadcast({ t: 'scores', list: this.scores() });
  }

  handle(id: string, msg: ClientMsg) {
    const p = this.players.get(id);
    if (!p) return;
    switch (msg.t) {
      case 'start': this.start(id); break;
      case 'input':
        if (this.state !== 'playing') { if (msg.inputs.length) p.ack = msg.inputs[msg.inputs.length - 1].seq; break; }
        for (const i of msg.inputs) if (i.seq > p.ack && p.queue.length < 60) p.queue.push(i);
        break;
      case 'fire': this.fire(p, msg.yaw, msg.pitch, msg.renderTime); break;
      case 'ping': p.send({ t: 'pong', c: msg.c, serverTime: this.clock.now() }); break;
      case 'join': break;
    }
  }

  start(byId: string) {
    const p = this.players.get(byId);
    if (!p) return;
    if (byId !== this.hostId) { p.send({ t: 'error', message: "Seul l'hôte peut lancer la partie." }); return; }
    if (this.state === 'playing') return;
    if (this.players.size < CONFIG.minPlayersToStart) { p.send({ t: 'error', message: 'Il faut au moins 2 joueurs.' }); return; }
    const now = this.clock.now();
    this.state = 'playing';
    this.endsAt = now + CONFIG.matchMaxSeconds * 1000;
    this.lastUsed = [];
    for (const q of this.players.values()) {
      q.kills = 0; q.deaths = 0; q.streak = 0; q.bestStreak = 0; q.alive = false; q.respawnAt = now; q.lastFireAt = -1e9; q.queue = []; q.history = [];
    }
    this.broadcastLobby();
    this.broadcast({ t: 'start', mapId: this.mapId, endsAt: this.endsAt });
    for (const q of this.players.values()) this.respawn(q, now);
    this.broadcast({ t: 'scores', list: this.scores() });
  }

  tick() {
    const now = this.clock.now();
    if (this.state === 'playing') {
      for (const p of this.players.values()) {
        if (!p.alive) {
          if (p.queue.length) { p.ack = p.queue[p.queue.length - 1].seq; p.queue = []; }
          if (now >= p.respawnAt) this.respawn(p, now);
          continue;
        }
        for (const i of p.queue) { p.state = stepPlayer(p.state, i, this.map); p.ack = i.seq; }
        p.queue = [];
        if (p.state.pos.y < CONFIG.killPlaneY) this.respawn(p, now);
        p.history.push({ t: now, pos: { ...p.state.pos } });
        while (p.history.length && p.history[0].t < now - HISTORY_MS) p.history.shift();
      }
      if (now >= this.endsAt) this.endMatch();
      if (now - this.lastSnapshot >= 1000 / CONFIG.snapshotRate - 1) { this.lastSnapshot = now; this.sendSnapshots(now); }
    } else if (this.state === 'ended' && now - this.endedAt >= END_SCREEN_MS) {
      this.state = 'lobby';
      this.broadcastLobby();
    }
  }

  private respawn(p: Player, now: number) {
    const enemies = [...this.players.values()].filter(q => q !== p && q.alive).map(q => q.state.pos);
    const k = chooseSpawn(this.map, enemies, this.lastUsed, now / 1000, this.rand);
    this.lastUsed[k] = now / 1000;
    const s = this.map.spawns[k];
    const yaw = openYaw(this.map, s);
    const time = p.state.time;
    p.state = makePlayerState(s, yaw);
    p.state.time = time;
    p.state.dashReadyAt = time;
    p.alive = true;
    p.history = [{ t: now, pos: { ...s } }];
    this.broadcast({ t: 'respawn', id: p.id, x: s.x, y: s.y, z: s.z, yaw });
  }

  private posAt(p: Player, t: number): Vec3 {
    const h = p.history;
    if (!h.length) return p.state.pos;
    if (t <= h[0].t) return h[0].pos;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].t <= t) {
        const a = h[i], b = h[i + 1];
        if (!b) return a.pos;
        const k = (t - a.t) / (b.t - a.t || 1);
        return { x: a.pos.x + (b.pos.x - a.pos.x) * k, y: a.pos.y + (b.pos.y - a.pos.y) * k, z: a.pos.z + (b.pos.z - a.pos.z) * k };
      }
    }
    return p.state.pos;
  }

  private fire(p: Player, yaw: number, pitch: number, renderTime: number) {
    if (this.state !== 'playing' || !p.alive) return;
    const now = this.clock.now();
    if (now - p.lastFireAt < CONFIG.fireCooldown * 1000 - 60) return;
    p.lastFireAt = now;
    const rewindTo = Math.max(now - CONFIG.maxRewindMs - CONFIG.interpDelayMs, Math.min(now, renderTime));
    const targets = [...this.players.values()].filter(q => q !== p && q.alive).map(q => ({ id: q.id, pos: this.posAt(q, rewindTo) }));
    const origin = eyeOf(p.state);
    const r = traceShot(this.map, origin, forwardFromAngles(yaw, pitch), targets);
    this.broadcast({ t: 'shot', by: p.id, from: [origin.x, origin.y, origin.z], to: [r.end.x, r.end.y, r.end.z] });
    if (!r.hitId) return;
    const v = this.players.get(r.hitId)!;
    v.alive = false; v.respawnAt = now + CONFIG.respawnDelay * 1000; v.deaths++; v.streak = 0;
    p.kills++; p.streak++; p.bestStreak = Math.max(p.bestStreak, p.streak);
    this.broadcast({ t: 'kill', killer: p.id, victim: v.id });
    this.broadcast({ t: 'scores', list: this.scores() });
    if (p.kills >= CONFIG.scoreToWin) this.endMatch();
  }

  private endMatch() {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.endedAt = this.clock.now();
    const list = this.scores();
    const winner = list.length && list[0].kills > 0 ? list[0].id : null;
    this.broadcast({ t: 'matchEnd', winner, list });
    this.broadcastLobby();
  }

  scores(): ScoreLine[] {
    return [...this.players.values()]
      .map(p => ({ id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  /** Données utiles au calcul des points (étape 3). */
  stats(id: string) { const p = this.players.get(id); return p ? { kills: p.kills, deaths: p.deaths, bestStreak: p.bestStreak } : null; }

  private sendSnapshots(now: number) {
    const players: NetPlayer[] = [...this.players.values()].map(p => ({
      id: p.id, x: p.state.pos.x, y: p.state.pos.y, z: p.state.pos.z, yaw: p.state.yaw, pitch: p.state.pitch, alive: p.alive,
      vx: p.state.vel.x, vy: p.state.vel.y, vz: p.state.vel.z, dashReadyAt: p.state.dashReadyAt, dashUntil: p.state.dashUntil,
      padUntil: p.state.padUntil, onGround: p.state.onGround, time: p.state.time
    }));
    for (const p of this.players.values()) p.send({ t: 'snapshot', time: now, ack: p.ack, players });
  }

  private lobbyPlayers(): LobbyPlayer[] { return [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color })); }
  private broadcastLobby() { this.broadcast({ t: 'lobby', players: this.lobbyPlayers(), hostId: this.hostId ?? '', state: this.state }); }
  private broadcast(m: ServerMsg) { for (const p of this.players.values()) p.send(m); }
}
