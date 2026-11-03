import type { Input } from './physics';

export interface LobbyPlayer { id: string; name: string; color: number }
export interface ScoreLine { id: string; name: string; color: number; kills: number; deaths: number }
export interface NetPlayer { id: string; x: number; y: number; z: number; yaw: number; pitch: number; alive: boolean; vx: number; vy: number; vz: number; dashReadyAt: number; dashUntil: number; padUntil: number; onGround: boolean; time: number }
export type RoomState = 'lobby' | 'playing' | 'ended';

export type ClientMsg =
  | { t: 'join'; name: string }
  | { t: 'start' }
  | { t: 'input'; inputs: Input[] }
  | { t: 'fire'; seq: number; yaw: number; pitch: number; renderTime: number }
  | { t: 'ping'; c: number };

export type ServerMsg =
  | { t: 'welcome'; you: string; room: string; mapId: string; hostId: string; serverTime: number }
  | { t: 'lobby'; players: LobbyPlayer[]; hostId: string; state: RoomState }
  | { t: 'start'; mapId: string; endsAt: number }
  | { t: 'snapshot'; time: number; ack: number; players: NetPlayer[] }
  | { t: 'shot'; by: string; from: [number, number, number]; to: [number, number, number] }
  | { t: 'kill'; killer: string; victim: string }
  | { t: 'respawn'; id: string; x: number; y: number; z: number; yaw: number }
  | { t: 'scores'; list: ScoreLine[] }
  | { t: 'matchEnd'; winner: string | null; list: ScoreLine[] }
  | { t: 'pong'; c: number; serverTime: number }
  | { t: 'error'; message: string };

export const encode = (m: ClientMsg | ServerMsg): string => JSON.stringify(m);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function validInput(i: unknown): i is Input {
  if (!i || typeof i !== 'object') return false;
  const o = i as Record<string, unknown>;
  return isNum(o.seq) && isNum(o.dt) && o.dt >= 0 && o.dt <= 0.1 && isNum(o.yaw) && isNum(o.pitch)
    && isBool(o.fwd) && isBool(o.back) && isBool(o.left) && isBool(o.right) && isBool(o.jump) && isBool(o.dash);
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
    default: return null;
  }
}

export const decodeServer = (raw: string): ServerMsg => JSON.parse(raw) as ServerMsg;

/** Nettoie un pseudo : 2 à 16 caractères visibles. */
export function cleanName(name: string): string {
  const n = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return n.length >= 2 ? n : 'Joueur';
}
