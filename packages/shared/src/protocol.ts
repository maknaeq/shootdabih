import type { Input } from './physics';
import { CAPTURE_CHOICES, GAME_MODES, HATS, LAP_CHOICES, PARKA_COLORS, SCORE_CHOICES, TIME_CHOICES, type Ability, type GameMode, type Hat, type PickupKind, type RoomSettings } from './config';
import { mapSupports } from './maps/modes';
import { MAP_DEFS } from './maps/index';

export interface LobbyPlayer { id: string; name: string; color: number; hat: Hat; team: number }
export interface RaceLine { id: string; lap: number; done: boolean; time: number | null; rank: number; nextCp: number }
export interface FlagState { team: number; x: number; y: number; z: number; carrier: string | null; atHome: boolean }
export interface ScoreLine { id: string; name: string; color: number; kills: number; deaths: number; team: number; captures: number }
export interface NetPlayer {
  id: string; x: number; y: number; z: number; yaw: number; pitch: number; alive: boolean;
  vx: number; vy: number; vz: number; dashReadyAt: number; dashUntil: number; padUntil: number; onGround: boolean; time: number;
  jumpHeld: boolean; airJumps: number; airJumpsMax: number; abilityReadyAt: number; abilityUsedAt: number;
  /** Bonus actifs : fin en temps serveur (ms) ; shield = protégé contre le prochain tir. */
  overchargeUntil: number; pierceUntil: number; shield: boolean; streak: number;
  /** Capacité ramassée et fin de sa durée (temps serveur, ms). */
  ability: Ability; abilityUntil: number;
  vehicle?: 'foot' | 'bike'; speed?: number;
}
export interface PickupState { i: number; kind: PickupKind; active: boolean }
/** Autre joueur dans un snapshot, en format compact : [id, x, y, z, yaw, pitch, drapeaux, vx, vz]. drapeaux : 1 vivant, 2 protégé, 4 porte le drapeau. */
export type PackedPlayer = [string, number, number, number, number, number, number, number, number];
const r2 = (n: number) => Math.round(n * 100) / 100, r3 = (n: number) => Math.round(n * 1000) / 1000, r1 = (n: number) => Math.round(n * 10) / 10;
export function packPlayer(p: NetPlayer, carrying = false): PackedPlayer {
  return [p.id, r2(p.x), r2(p.y), r2(p.z), r3(p.yaw), r3(p.pitch), (p.alive ? 1 : 0) | (p.shield ? 2 : 0) | (carrying ? 4 : 0), r1(p.vx), r1(p.vz)];
}
export function unpackPlayer(a: PackedPlayer): NetPlayer & { carrying: boolean } {
  return {
    id: a[0], x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], alive: (a[6] & 1) === 1, shield: (a[6] & 2) === 2, carrying: (a[6] & 4) === 4,
    vx: a[7], vy: 0, vz: a[8], dashReadyAt: 0, dashUntil: 0, padUntil: 0, onGround: true, time: 0, jumpHeld: false, airJumps: 0, airJumpsMax: 0,
    abilityReadyAt: 0, abilityUsedAt: 0, overchargeUntil: 0, pierceUntil: 0, streak: 0, ability: 'aucune', abilityUntil: 0
  };
}
export type RoomState = 'lobby' | 'playing' | 'ended';

export type ClientMsg =
  | { t: 'join'; name: string }
  | { t: 'start' }
  | { t: 'input'; inputs: Input[] }
  | { t: 'fire'; seq: number; yaw: number; pitch: number; renderTime: number }
  | { t: 'ping'; c: number }
  | { t: 'customize'; color: number; hat: Hat }
  | { t: 'settings'; settings: RoomSettings }
  | { t: 'face'; data: string };

export type ServerMsg =
  | { t: 'welcome'; you: string; room: string; mapId: string; hostId: string; serverTime: number }
  | { t: 'lobby'; players: LobbyPlayer[]; hostId: string; state: RoomState; settings: RoomSettings }
  | { t: 'start'; mapId: string; endsAt: number; settings: RoomSettings }
  | { t: 'snapshot'; time: number; ack: number; me: NetPlayer | null; o: PackedPlayer[] }
  | { t: 'shot'; by: string; from: [number, number, number]; to: [number, number, number] }
  | { t: 'kill'; killer: string; victim: string }
  | { t: 'respawn'; id: string; x: number; y: number; z: number; yaw: number }
  | { t: 'scores'; list: ScoreLine[] }
  | { t: 'matchEnd'; winner: string | null; list: ScoreLine[]; winnerTeam?: number; teamScores?: [number, number] }
  | { t: 'flags'; flags: FlagState[]; score: [number, number] }
  | { t: 'race'; startAt: number; laps: number; list: RaceLine[] }
  | { t: 'flagEvent'; kind: 'take' | 'drop' | 'return' | 'capture'; team: number; by: string | null }
  | { t: 'pong'; c: number; serverTime: number }
  | { t: 'streak'; id: string; n: number }
  | { t: 'shutdown'; killer: string; victim: string; n: number }
  | { t: 'pickups'; list: PickupState[] }
  | { t: 'pickup'; i: number; by: string; kind: PickupKind }
  | { t: 'shieldHit'; id: string; by: string }
  | { t: 'face'; id: string; data: string }
  | { t: 'error'; message: string };

export const encode = (m: ClientMsg | ServerMsg): string => JSON.stringify(m);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function validInput(i: unknown): i is Input {
  if (!i || typeof i !== 'object') return false;
  const o = i as Record<string, unknown>;
  return isNum(o.seq) && isNum(o.dt) && o.dt >= 0 && o.dt <= 0.1 && isNum(o.yaw) && isNum(o.pitch)
    && isBool(o.fwd) && isBool(o.back) && isBool(o.left) && isBool(o.right) && isBool(o.jump) && isBool(o.dash) && isBool(o.ability);
}

/** Décode et valide un message client. Renvoie null s'il est invalide. */
export function decodeClient(raw: string): ClientMsg | null {
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'join': return typeof o.name === 'string' ? { t: 'join', name: o.name } : null;
    case 'start': return { t: 'start' };
    case 'input': return Array.isArray(o.inputs) && o.inputs.length <= 30 && o.inputs.every(validInput) ? { t: 'input', inputs: o.inputs as Input[] } : null;
    case 'fire': return isNum(o.seq) && isNum(o.yaw) && isNum(o.pitch) && isNum(o.renderTime) ? { t: 'fire', seq: o.seq, yaw: o.yaw, pitch: o.pitch, renderTime: o.renderTime } : null;
    case 'ping': return isNum(o.c) ? { t: 'ping', c: o.c } : null;
    case 'customize':
      return isNum(o.color) && (PARKA_COLORS as readonly number[]).includes(o.color) && (HATS as readonly unknown[]).includes(o.hat)
        ? { t: 'customize', color: o.color, hat: o.hat as Hat } : null;
    case 'face': return typeof o.data === 'string' && o.data.length <= 24000 && (o.data === '' || o.data.startsWith('data:image/jpeg;base64,')) ? { t: 'face', data: o.data } : null;
    case 'settings': {
      const s = o.settings as Record<string, unknown> | undefined;
      if (!s) return null;
      const mode = s.mode as GameMode;
      const mapOk = typeof s.mapId === 'string' && (s.mapId === 'auto' || (s.mapId in MAP_DEFS && mapSupports(MAP_DEFS[s.mapId], mode)));
      const goal = mode === 'dm' ? s.scoreToWin : mode === 'ctf' ? s.captures : 1;
      const ok = (GAME_MODES as readonly unknown[]).includes(mode) && mapOk
        && (SCORE_CHOICES as readonly unknown[]).includes(s.scoreToWin) && (CAPTURE_CHOICES as readonly unknown[]).includes(s.captures) && (LAP_CHOICES as readonly unknown[]).includes(s.laps)
        && (TIME_CHOICES as readonly unknown[]).includes(s.timeLimitMin)
        && isBool(s.abilities) && isBool(s.pickups) && isBool(s.raceWeapons) && !(goal === 0 && s.timeLimitMin === 0);
      return ok ? { t: 'settings', settings: { mode, mapId: s.mapId as string, scoreToWin: s.scoreToWin as number, captures: s.captures as number, laps: s.laps as number, timeLimitMin: s.timeLimitMin as number, abilities: s.abilities as boolean, pickups: s.pickups as boolean, raceWeapons: s.raceWeapons as boolean } } : null;
    }
    default: return null;
  }
}

export const decodeServer = (raw: string): ServerMsg => JSON.parse(raw) as ServerMsg;

/** Nettoie un pseudo : 2 à 16 caractères visibles. */
export function cleanName(name: string): string {
  const n = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return n.length >= 2 ? n : 'Joueur';
}
