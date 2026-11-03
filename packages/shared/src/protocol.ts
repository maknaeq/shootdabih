import type { Input } from './physics';
import { ABILITIES, HATS, PARKA_COLORS, SCORE_CHOICES, TIME_CHOICES, type Ability, type Hat, type PickupKind, type RoomSettings } from './config';
import { MAP_DEFS } from './maps/index';

export interface LobbyPlayer { id: string; name: string; color: number; hat: Hat; ability: Ability }
export interface ScoreLine { id: string; name: string; color: number; kills: number; deaths: number }
export interface NetPlayer {
  id: string; x: number; y: number; z: number; yaw: number; pitch: number; alive: boolean;
  vx: number; vy: number; vz: number; dashReadyAt: number; dashUntil: number; padUntil: number; onGround: boolean; time: number;
  jumpHeld: boolean; airJumps: number; airJumpsMax: number; abilityReadyAt: number; abilityUsedAt: number;
  /** Bonus actifs : fin en temps serveur (ms) ; shield = protégé contre le prochain tir. */
  overchargeUntil: number; pierceUntil: number; jumpsUntil: number; shield: boolean; streak: number;
}
export interface PickupState { i: number; kind: PickupKind; active: boolean }
export type RoomState = 'lobby' | 'playing' | 'ended';

export type ClientMsg =
  | { t: 'join'; name: string }
  | { t: 'start' }
  | { t: 'input'; inputs: Input[] }
  | { t: 'fire'; seq: number; yaw: number; pitch: number; renderTime: number }
  | { t: 'ping'; c: number }
  | { t: 'customize'; color: number; hat: Hat; ability: Ability }
  | { t: 'settings'; settings: RoomSettings };

export type ServerMsg =
  | { t: 'welcome'; you: string; room: string; mapId: string; hostId: string; serverTime: number }
  | { t: 'lobby'; players: LobbyPlayer[]; hostId: string; state: RoomState; settings: RoomSettings }
  | { t: 'start'; mapId: string; endsAt: number; settings: RoomSettings }
  | { t: 'snapshot'; time: number; ack: number; players: NetPlayer[] }
  | { t: 'shot'; by: string; from: [number, number, number]; to: [number, number, number] }
  | { t: 'kill'; killer: string; victim: string }
  | { t: 'respawn'; id: string; x: number; y: number; z: number; yaw: number }
  | { t: 'scores'; list: ScoreLine[] }
  | { t: 'matchEnd'; winner: string | null; list: ScoreLine[] }
  | { t: 'pong'; c: number; serverTime: number }
  | { t: 'streak'; id: string; n: number }
  | { t: 'shutdown'; killer: string; victim: string; n: number }
  | { t: 'pickups'; list: PickupState[] }
  | { t: 'pickup'; i: number; by: string; kind: PickupKind }
  | { t: 'shieldHit'; id: string; by: string }
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
      return isNum(o.color) && (PARKA_COLORS as readonly number[]).includes(o.color) && (HATS as readonly unknown[]).includes(o.hat) && (ABILITIES as readonly unknown[]).includes(o.ability)
        ? { t: 'customize', color: o.color, hat: o.hat as Hat, ability: o.ability as Ability } : null;
    case 'settings': {
      const s = o.settings as Record<string, unknown> | undefined;
      if (!s) return null;
      const ok = typeof s.mapId === 'string' && (s.mapId === 'auto' || s.mapId in MAP_DEFS)
        && (SCORE_CHOICES as readonly unknown[]).includes(s.scoreToWin) && (TIME_CHOICES as readonly unknown[]).includes(s.timeLimitMin)
        && isBool(s.abilities) && isBool(s.pickups) && !(s.scoreToWin === 0 && s.timeLimitMin === 0);
      return ok ? { t: 'settings', settings: { mapId: s.mapId as string, scoreToWin: s.scoreToWin as number, timeLimitMin: s.timeLimitMin as number, abilities: s.abilities as boolean, pickups: s.pickups as boolean } } : null;
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
