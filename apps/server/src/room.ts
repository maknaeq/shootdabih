import {
  ABILITIES, BONUS_KINDS, CONFIG, DEFAULT_SETTINGS, FLAG_RETURN_SECONDS, MAP_DEFS, PARKA_COLORS, PICKUP_KINDS, STREAKS,
  dist, mapSupports, surfaceAt, type FlagState,
  chooseSpawn, cleanName, packPlayer, eyeOf, forwardFromAngles, getMap, makePlayerState, openYaw, stepPlayer, traceShotAll,
  type Ability, type ClientMsg, type Hat, type Input, type LobbyPlayer, type MapData, type NetPlayer, type PickupKind, type PickupState,
  type PlayerState, type RoomSettings, type RoomState, type ScoreLine, type ServerMsg, type Vec3
} from '@sdb/shared';

export interface Clock { now(): number }
export const realClock: Clock = { now: () => performance.now() };

interface Player {
  id: string;
  name: string;
  color: number;
  hat: Hat;
  /** Capacité ramassée sur la map, valable jusqu'à abilityUntil ou la mort. */
  ability: Ability;
  abilityUntil: number;
  face: string;
  team: number;
  captures: number;
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
  overchargeUntil: number;
  pierceUntil: number;
  shieldBuffUntil: number;
  shieldAbilityUntil: number;
  lastAbilityUse: number;
}

interface PickupSpot { pos: Vec3; kind: PickupKind; active: boolean; respawnAt: number }
interface Flag { team: number; home: Vec3; pos: Vec3; carrier: string | null; atHome: boolean; dropAt: number }

const HISTORY_MS = 1000;
/** Arrondit les nombres d'un état au millième : la précision suffit et le message est bien plus court. */
const roundAll = <T extends object>(o: T): T => { const r = { ...o } as Record<string, unknown>; for (const k in r) if (typeof r[k] === 'number') r[k] = Math.round((r[k] as number) * 1000) / 1000; return r as T; };
const END_SCREEN_MS = 8000;

export class Room {
  readonly players = new Map<string, Player>();
  hostId: string | null = null;
  state: RoomState = 'lobby';
  settings: RoomSettings = { ...DEFAULT_SETTINGS };
  emptySince: number;
  mapId: string;
  private map: MapData;
  private endsAt = 0;
  private endedAt = 0;
  private lastSnapshot = 0;
  private lastUsed: number[] = [];
  private pickups: PickupSpot[] = [];
  private flags: Flag[] = [];
  private teamScore: [number, number] = [0, 0];


  private get ctf() { return this.state === 'playing' && this.settings.mode === 'ctf'; }
  /** Vrai si a et b peuvent se tirer dessus : toujours en chacun pour soi, seulement entre équipes au drapeau. */
  private enemies(a: Player, b: Player) { return a !== b && (this.settings.mode !== 'ctf' || a.team !== b.team); }
  private nextId = 1;
  private lastMapId = '';

  constructor(readonly code: string, mapId: string, private clock: Clock = realClock, private rand: () => number = Math.random) {
    this.mapId = mapId;
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
      id, name: cleanName(rawName), color, hat: 'bonnet', ability: 'aucune', abilityUntil: 0, face: '', team: 0, captures: 0, send, state: makePlayerState({ x: 0, y: 0, z: 0 }), alive: false, respawnAt: 0,
      kills: 0, deaths: 0, streak: 0, bestStreak: 0, lastFireAt: -1e9, queue: [], ack: -1, history: [],
      overchargeUntil: 0, pierceUntil: 0, shieldBuffUntil: 0, shieldAbilityUntil: 0, lastAbilityUse: -1
    };
    this.players.set(id, p);
    if (!this.hostId) this.hostId = id;
    send({ t: 'welcome', you: id, room: this.code, mapId: this.mapId, hostId: this.hostId, serverTime: this.clock.now() });
    this.broadcastLobby();
    for (const q of this.players.values()) if (q !== p && q.face) send({ t: 'face', id: q.id, data: q.face });
    if (this.state === 'playing') {
      send({ t: 'start', mapId: this.mapId, endsAt: this.endsAt, settings: this.settings });
      send({ t: 'pickups', list: this.pickupList() });
      if (this.settings.mode === 'ctf') { const n0 = [...this.players.values()].filter(q => q !== p && q.team === 0).length; p.team = n0 <= this.players.size - 1 - n0 ? 0 : 1; this.broadcastLobby(); send({ t: 'flags', flags: this.flagList(), score: this.teamScore }); }
      p.respawnAt = this.clock.now();
      send({ t: 'scores', list: this.scores() });
    }
    return id;
  }

  removePlayer(id: string) {
    const leaving = this.players.get(id);
    if (leaving) this.dropFlagOf(leaving);
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
      case 'customize': {
        const taken = [...this.players.values()].some(q => q !== p && q.color === msg.color);
        if (!taken) p.color = msg.color;
        p.hat = msg.hat;
        this.broadcastLobby();
        break;
      }
      case 'settings':
        if (id !== this.hostId) { p.send({ t: 'error', message: "Seul l'hôte peut changer les réglages." }); break; }
        if (this.state === 'playing') break;
        this.settings = msg.settings;
        this.broadcastLobby();
        break;
      case 'face':
        p.face = msg.data;
        this.broadcast({ t: 'face', id: p.id, data: p.face });
        break;
      case 'join': break;
    }
  }

  private chooseMap(): string {
    if (this.settings.mapId !== 'auto' && MAP_DEFS[this.settings.mapId] && mapSupports(MAP_DEFS[this.settings.mapId], this.settings.mode)) return this.settings.mapId;
    const n = this.players.size;
    const ok = Object.values(MAP_DEFS).filter(d => mapSupports(d, this.settings.mode));
    const fits = ok.filter(d => n >= d.players[0] && n <= d.players[1]).map(d => d.id);
    const pool = fits.length ? fits : ok.map(d => d.id);
    const fresh = pool.filter(id => id !== this.lastMapId);
    const list = fresh.length ? fresh : pool;
    return list[Math.floor(this.rand() * list.length)];
  }

  start(byId: string) {
    const p = this.players.get(byId);
    if (!p) return;
    if (byId !== this.hostId) { p.send({ t: 'error', message: "Seul l'hôte peut lancer la partie." }); return; }
    if (this.state === 'playing') return;
    if (this.players.size < CONFIG.minPlayersToStart) { p.send({ t: 'error', message: 'Il faut au moins 2 joueurs.' }); return; }
    const now = this.clock.now();
    this.mapId = this.chooseMap(); this.lastMapId = this.mapId;
    this.map = getMap(this.mapId);
    this.state = 'playing';
    this.endsAt = this.settings.timeLimitMin > 0 ? now + this.settings.timeLimitMin * 60_000 : 0;
    this.lastUsed = [];
    const kinds = this.allowedKinds();
    this.pickups = kinds.length ? this.map.pickups.map((pos, i) => ({ pos, kind: kinds[i % kinds.length], active: true, respawnAt: 0 })) : [];
    this.teamScore = [0, 0];
    this.flags = [];
    if (this.settings.mode === 'ctf' && this.map.def.ctf) {
      [...this.players.values()].sort(() => this.rand() - 0.5).forEach((q, i) => { q.team = i % 2; });
      this.flags = this.map.def.ctf.bases.map((b, team) => {
        const top = surfaceAt(this.map, b.x, b.z, 1e6);
        const home = { x: b.x, y: Number.isFinite(top) ? top : 0, z: b.z };
        return { team, home, pos: { ...home }, carrier: null, atHome: true, dropAt: 0 };
      });
    }
    for (const q of this.players.values()) {
      q.captures = 0;
      q.kills = 0; q.deaths = 0; q.streak = 0; q.bestStreak = 0; q.alive = false; q.respawnAt = now; q.lastFireAt = -1e9; q.queue = []; q.history = [];
      q.overchargeUntil = 0; q.pierceUntil = 0; q.shieldBuffUntil = 0; q.shieldAbilityUntil = 0; q.ability = 'aucune'; q.abilityUntil = 0;
    }
    this.broadcastLobby();
    this.broadcast({ t: 'start', mapId: this.mapId, endsAt: this.endsAt, settings: this.settings });
    this.broadcast({ t: 'pickups', list: this.pickupList() });
    if (this.flags.length) this.broadcastFlags();
    for (const q of this.players.values()) this.respawn(q, now);
    this.broadcast({ t: 'scores', list: this.scores() });
  }

  /** Objets qui peuvent apparaître selon les réglages de l'hôte. */
  private allowedKinds(): PickupKind[] {
    return PICKUP_KINDS.filter(k => (BONUS_KINDS as readonly string[]).includes(k) ? this.settings.pickups : this.settings.abilities);
  }

  private effectiveAbility(p: Player): Ability { return this.clock.now() < p.abilityUntil ? p.ability : 'aucune'; }

  /** Recalcule ce qui dépend de la capacité ramassée : sauts en l'air autorisés. */
  private applyLoadout(p: Player) {
    const ab = this.effectiveAbility(p);
    if (ab !== p.state.ability) { p.state.ability = ab; if (ab === 'aucune') { p.ability = 'aucune'; p.abilityUntil = 0; } }
    p.state.airJumpsMax = ab === 'saut' ? 1 : 0;
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
        this.applyLoadout(p);
        // une entrée par pas en régime normal, un peu plus pour rattraper un retard : le mouvement reste régulier
        const n = Math.min(p.queue.length, p.queue.length > 8 ? 4 : p.queue.length > 3 ? 2 : 1);
        for (const i of p.queue.splice(0, n)) { p.state = stepPlayer(p.state, i, this.map); p.ack = i.seq; }
        if (p.state.abilityUsedAt !== p.lastAbilityUse) {
          p.lastAbilityUse = p.state.abilityUsedAt;
          if (p.state.ability === 'bouclier') p.shieldAbilityUntil = now + CONFIG.shieldAbilitySeconds * 1000;
        }
        if (p.state.pos.y < CONFIG.killPlaneY) this.respawn(p, now);
        p.history.push({ t: now, pos: { ...p.state.pos } });
        while (p.history.length && p.history[0].t < now - HISTORY_MS) p.history.shift();
        this.collectPickups(p, now);
      }
      this.pickups.forEach((s, i) => {
        if (!s.active && now >= s.respawnAt) {
          const kinds = this.allowedKinds();
          s.active = true; s.kind = kinds[(kinds.indexOf(s.kind) + 1 + i) % kinds.length] ?? s.kind;
          this.broadcast({ t: 'pickups', list: this.pickupList() });
        }
      });
      if (this.ctf) this.ctfTick(now);
      if (this.endsAt && now >= this.endsAt) this.endMatch();
      if (now - this.lastSnapshot >= 1000 / CONFIG.snapshotRate - 1) { this.lastSnapshot = now; this.sendSnapshots(now); }
    } else if (this.state === 'ended' && now - this.endedAt >= END_SCREEN_MS) {
      this.state = 'lobby';
      this.broadcastLobby();
    }
  }

  private collectPickups(p: Player, now: number) {
    this.pickups.forEach((s, i) => {
      if (!s.active) return;
      const d = Math.hypot(p.state.pos.x - s.pos.x, p.state.pos.z - s.pos.z);
      if (d > CONFIG.pickupRadius || Math.abs(p.state.pos.y - s.pos.y) > 1.5) return;
      s.active = false; s.respawnAt = now + CONFIG.pickupRespawn * 1000;
      if (s.kind === 'overcharge') p.overchargeUntil = now + CONFIG.overchargeSeconds * 1000;
      if (s.kind === 'pierce') p.pierceUntil = now + CONFIG.pierceSeconds * 1000;
      if (s.kind === 'shield') p.shieldBuffUntil = now + CONFIG.shieldBuffSeconds * 1000;
      if ((ABILITIES as readonly string[]).includes(s.kind)) {
        p.ability = s.kind as Ability; p.abilityUntil = now + CONFIG.abilityPickupSeconds * 1000;
        p.state.ability = 'aucune'; this.applyLoadout(p);
        p.state.abilityReadyAt = p.state.time; p.state.airJumps = p.state.airJumpsMax;
      }
      this.broadcast({ t: 'pickup', i, by: p.id, kind: s.kind });
      this.broadcast({ t: 'pickups', list: this.pickupList() });
    });
  }

  private flagList(): FlagState[] { return this.flags.map(f => ({ team: f.team, x: f.pos.x, y: f.pos.y, z: f.pos.z, carrier: f.carrier, atHome: f.atHome })); }
  private broadcastFlags() { this.broadcast({ t: 'flags', flags: this.flagList(), score: this.teamScore }); }

  private dropFlagOf(p: Player) {
    for (const f of this.flags) if (f.carrier === p.id) {
      f.carrier = null; f.atHome = false; f.dropAt = this.clock.now();
      const top = surfaceAt(this.map, p.state.pos.x, p.state.pos.z, p.state.pos.y + 0.6);
      f.pos = { x: p.state.pos.x, y: Number.isFinite(top) ? top : p.state.pos.y, z: p.state.pos.z };
      if (f.pos.y < CONFIG.killPlaneY + 5) { f.pos = { ...f.home }; f.atHome = true; }
      this.broadcast({ t: 'flagEvent', kind: 'drop', team: f.team, by: p.id });
      this.broadcastFlags();
    }
  }

  /** Capture du drapeau : prise, retour, capture, et retour automatique d'un drapeau tombé. */
  private ctfTick(now: number) {
    let changed = false;
    for (const f of this.flags) {
      if (f.carrier) {
        const c = this.players.get(f.carrier);
        if (!c || !c.alive) { if (c) this.dropFlagOf(c); else { f.carrier = null; f.pos = { ...f.home }; f.atHome = true; changed = true; } continue; }
        f.pos = { ...c.state.pos };
        const own = this.flags[c.team];
        if (own && own.atHome && dist(c.state.pos, own.home) < 1.6) {
          this.teamScore[c.team]++; c.captures++;
          f.carrier = null; f.pos = { ...f.home }; f.atHome = true; changed = true;
          this.broadcast({ t: 'flagEvent', kind: 'capture', team: c.team, by: c.id });
          this.broadcast({ t: 'scores', list: this.scores() });
          if (this.settings.captures > 0 && this.teamScore[c.team] >= this.settings.captures) { this.broadcastFlags(); this.endMatch(); return; }
        }
        continue;
      }
      if (!f.atHome && now - f.dropAt > FLAG_RETURN_SECONDS * 1000) {
        f.pos = { ...f.home }; f.atHome = true; changed = true;
        this.broadcast({ t: 'flagEvent', kind: 'return', team: f.team, by: null });
      }
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const dx = p.state.pos.x - f.pos.x, dz = p.state.pos.z - f.pos.z;
        if (Math.hypot(dx, dz) > 1.4 || Math.abs(p.state.pos.y - f.pos.y) > 1.8) continue;
        if (p.team !== f.team) {
          f.carrier = p.id; f.atHome = false; changed = true;
          this.broadcast({ t: 'flagEvent', kind: 'take', team: f.team, by: p.id });
        } else if (!f.atHome) {
          f.pos = { ...f.home }; f.atHome = true; changed = true;
          this.broadcast({ t: 'flagEvent', kind: 'return', team: f.team, by: p.id });
        }
        break;
      }
    }
    if (changed) this.broadcastFlags();
  }

  private pickupList(): PickupState[] { return this.pickups.map((s, i) => ({ i, kind: s.kind, active: s.active })); }

  private respawn(p: Player, now: number) {
    const enemies = [...this.players.values()].filter(q => this.enemies(p, q) && q.alive).map(q => q.state.pos);
    const bases = this.ctf && this.map.def.ctf ? this.map.def.ctf.bases : null;
    const allowed = bases ? (i: number) => { const s = this.map.spawns[i], own = bases[p.team], other = bases[1 - p.team]; return Math.hypot(s.x - own.x, s.z - own.z) < Math.hypot(s.x - other.x, s.z - other.z); } : undefined;
    const k = chooseSpawn(this.map, enemies, this.lastUsed, now / 1000, this.rand, allowed);
    this.lastUsed[k] = now / 1000;
    const s = this.map.spawns[k];
    const yaw = openYaw(this.map, s);
    const time = p.state.time;
    p.ability = 'aucune'; p.abilityUntil = 0;
    p.state = makePlayerState(s, yaw, 'aucune');
    p.state.time = time; p.state.dashReadyAt = time; p.state.abilityReadyAt = time;
    p.lastAbilityUse = p.state.abilityUsedAt;
    p.overchargeUntil = 0; p.pierceUntil = 0; p.shieldBuffUntil = 0; p.shieldAbilityUntil = 0;
    this.applyLoadout(p);
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

  private fireCooldownMs(p: Player, now: number) { return CONFIG.fireCooldown * 1000 * (now < p.overchargeUntil ? CONFIG.overchargeFactor : 1); }

  private fire(p: Player, yaw: number, pitch: number, renderTime: number) {
    if (this.state !== 'playing' || !p.alive) return;
    const now = this.clock.now();
    if (now - p.lastFireAt < this.fireCooldownMs(p, now) - 60) return;
    p.lastFireAt = now;
    const rewindTo = Math.max(now - CONFIG.maxRewindMs - CONFIG.interpDelayMs, Math.min(now, renderTime));
    const targets = [...this.players.values()].filter(q => this.enemies(p, q) && q.alive).map(q => ({ id: q.id, pos: this.posAt(q, rewindTo) }));
    const origin = eyeOf(p.state);
    const r = traceShotAll(this.map, origin, forwardFromAngles(yaw, pitch), targets);
    const pierce = now < p.pierceUntil;
    const hits = pierce ? r.hits : r.hits.slice(0, 1);
    const end = !pierce && hits.length ? targets.find(t => t.id === hits[0])!.pos : null;
    const to = end ? { x: end.x, y: end.y + 1.1, z: end.z } : r.end;
    this.broadcast({ t: 'shot', by: p.id, from: [origin.x, origin.y, origin.z], to: [to.x, to.y, to.z] });
    let killed = false;
    for (const id of hits) {
      const v = this.players.get(id)!;
      if (now < v.shieldAbilityUntil) { v.shieldAbilityUntil = 0; this.broadcast({ t: 'shieldHit', id: v.id, by: p.id }); continue; }
      if (now < v.shieldBuffUntil) { v.shieldBuffUntil = 0; this.broadcast({ t: 'shieldHit', id: v.id, by: p.id }); continue; }
      this.kill(p, v, now);
      killed = true;
    }
    if (killed) {
      this.broadcast({ t: 'scores', list: this.scores() });
      if (this.settings.mode === 'dm' && this.settings.scoreToWin > 0 && p.kills >= this.settings.scoreToWin) this.endMatch();
    }
  }

  private kill(p: Player, v: Player, now: number) {
    const victimStreak = v.streak;
    this.dropFlagOf(v);
    v.alive = false; v.respawnAt = now + CONFIG.respawnDelay * 1000; v.deaths++; v.streak = 0;
    p.kills++; p.streak++; p.bestStreak = Math.max(p.bestStreak, p.streak);
    this.broadcast({ t: 'kill', killer: p.id, victim: v.id });
    if (STREAKS[p.streak]) this.broadcast({ t: 'streak', id: p.id, n: p.streak });
    if (victimStreak >= 3) this.broadcast({ t: 'shutdown', killer: p.id, victim: v.id, n: victimStreak });
  }

  private endMatch() {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.endedAt = this.clock.now();
    const list = this.scores();
    if (this.settings.mode === 'ctf') {
      const [a, b2] = this.teamScore, winnerTeam = a === b2 ? -1 : a > b2 ? 0 : 1;
      this.broadcast({ t: 'matchEnd', winner: null, list, winnerTeam, teamScores: [...this.teamScore] as [number, number] });
    } else {
      const winner = list.length && list[0].kills > 0 ? list[0].id : null;
      this.broadcast({ t: 'matchEnd', winner, list });
    }
    for (const f of this.flags) { f.carrier = null; f.pos = { ...f.home }; f.atHome = true; }
    this.broadcastLobby();
  }

  scores(): ScoreLine[] {
    return [...this.players.values()]
      .map(p => ({ id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths, team: p.team, captures: p.captures }))
      .sort((a, b) => b.captures - a.captures || b.kills - a.kills || a.deaths - b.deaths);
  }

  /** Données utiles au calcul des points (étape 3). */
  stats(id: string) { const p = this.players.get(id); return p ? { kills: p.kills, deaths: p.deaths, bestStreak: p.bestStreak } : null; }

  private sendSnapshots(now: number) {
    const players: NetPlayer[] = [...this.players.values()].map(p => ({
      id: p.id, x: p.state.pos.x, y: p.state.pos.y, z: p.state.pos.z, yaw: p.state.yaw, pitch: p.state.pitch, alive: p.alive,
      vx: p.state.vel.x, vy: p.state.vel.y, vz: p.state.vel.z, dashReadyAt: p.state.dashReadyAt, dashUntil: p.state.dashUntil,
      padUntil: p.state.padUntil, onGround: p.state.onGround, time: p.state.time,
      jumpHeld: p.state.jumpHeld, airJumps: p.state.airJumps, airJumpsMax: p.state.airJumpsMax,
      abilityReadyAt: p.state.abilityReadyAt, abilityUsedAt: p.state.abilityUsedAt,
      overchargeUntil: p.overchargeUntil, pierceUntil: p.pierceUntil,
      shield: now < p.shieldBuffUntil || now < p.shieldAbilityUntil, streak: p.streak,
      ability: p.state.ability, abilityUntil: p.abilityUntil
    }));
    const carriers = new Set(this.flags.map(f => f.carrier).filter(Boolean));
    const packed = players.map(n => packPlayer(n, carriers.has(n.id)));
    let i = 0;
    for (const p of this.players.values()) {
      const me = roundAll(players[i++]);
      p.send({ t: 'snapshot', time: now, ack: p.ack, me, o: packed.filter(x => x[0] !== p.id) });
    }
  }

  private lobbyPlayers(): LobbyPlayer[] { return [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, hat: p.hat, team: this.settings.mode === 'ctf' && this.state !== 'lobby' ? p.team : -1 })); }
  private broadcastLobby() { this.broadcast({ t: 'lobby', players: this.lobbyPlayers(), hostId: this.hostId ?? '', state: this.state, settings: this.settings }); }
  private broadcast(m: ServerMsg) { for (const p of this.players.values()) p.send(m); }
}

export { ABILITIES };
