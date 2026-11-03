import { decodeServer, encode, type ClientMsg, type RoomInfo, type ServerMsg } from '@sdb/shared';

export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL as string | undefined)
  ?? (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:8787` : location.origin);
const WS_URL = SERVER_URL.replace(/^http/, 'ws');

const WAKE_LIMIT_MS = 90_000;
const RETRY_MS = 3000;

export type WakeReport = (elapsedSeconds: number) => void;

/** Appelle le serveur ; tant qu'il ne répond pas (serveur gratuit endormi), réessaie pendant 90 s. */
export async function callServer(path: string, init: RequestInit | undefined, onWaking: WakeReport): Promise<Response> {
  const start = performance.now();
  for (;;) {
    try {
      const res = await fetch(SERVER_URL + path, init);
      if (res.status >= 500 && res.status !== 501) throw new Error('serveur indisponible');
      return res;
    } catch {
      const elapsed = performance.now() - start;
      if (elapsed > WAKE_LIMIT_MS) throw new Error('Le serveur de jeu ne répond pas.');
      onWaking(Math.round(elapsed / 1000));
      await new Promise(r => setTimeout(r, RETRY_MS));
    }
  }
}

export async function createRoom(onWaking: WakeReport): Promise<string> {
  const res = await callServer('/rooms', { method: 'POST' }, onWaking);
  if (!res.ok) throw new Error('La création du salon a échoué.');
  const { code } = await res.json() as { code: string };
  return code;
}

export async function listRooms(onWaking: WakeReport): Promise<RoomInfo[]> {
  const res = await callServer('/rooms', undefined, onWaking);
  if (!res.ok) throw new Error('La liste des salons est indisponible.');
  const { rooms } = await res.json() as { rooms: RoomInfo[] };
  return rooms;
}

export type RoomCheck = { ok: true } | { ok: false; reason: 'missing' };
export async function checkRoom(code: string, onWaking: WakeReport): Promise<RoomCheck> {
  const res = await callServer('/rooms/' + encodeURIComponent(code), undefined, onWaking);
  return res.status === 404 ? { ok: false, reason: 'missing' } : { ok: true };
}

export class Connection {
  private ws: WebSocket;
  onMessage: (m: ServerMsg) => void = () => {};
  onClose: (unexpected: boolean) => void = () => {};
  private closing = false;

  constructor(code: string, name: string) {
    this.ws = new WebSocket(`${WS_URL}/ws?room=${encodeURIComponent(code)}`);
    this.ws.addEventListener('open', () => this.send({ t: 'join', name }));
    this.ws.addEventListener('message', e => this.onMessage(decodeServer(String(e.data))));
    this.ws.addEventListener('close', () => this.onClose(!this.closing));
  }

  send(m: ClientMsg) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encode(m)); }
  close() { this.closing = true; this.ws.close(); }
}
