import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { CONFIG, anglesTo, makePlayerState, type ServerMsg } from '@sdb/shared';
import { Room } from '../src/room';
import { startServer } from '../src/http';

function setup() {
  let t = 1000;
  const clock = { now: () => t };
  const room = new Room('TEST01', 'camp', clock, () => 0.5);
  const inbox: Record<string, ServerMsg[]> = { a: [], b: [] };
  const a = room.addPlayer('Alice', m => inbox.a.push(m))!;
  const b = room.addPlayer('Bob', m => inbox.b.push(m))!;
  const advance = (ms: number) => { const steps = Math.round(ms / (1000 / 60)); for (let i = 0; i < steps; i++) { t += 1000 / 60; room.tick(); } };
  // place A et B face à face au sol de la clairière, sans obstacle entre eux
  const place = () => {
    const pa = room.players.get(a)!, pb = room.players.get(b)!;
    pa.state = makePlayerState({ x: 9, y: 0, z: 21 }); pb.state = makePlayerState({ x: 15, y: 0, z: 21 });
    pa.history = [{ t, pos: { ...pa.state.pos } }]; pb.history = [{ t, pos: { ...pb.state.pos } }];
  };
  const aimAtB = () => {
    const pa = room.players.get(a)!, pb = room.players.get(b)!;
    return anglesTo({ ...pa.state.pos, y: pa.state.pos.y + CONFIG.eyeHeight }, { ...pb.state.pos, y: pb.state.pos.y + 1 });
  };
  return { room, inbox, a, b, advance, place, aimAtB, now: () => t };
}

describe('salon', () => {
  it('le premier arrivé est hôte, il faut 2 joueurs, seul l’hôte lance', () => {
    const { room, inbox, a, b } = setup();
    expect(room.hostId).toBe(a);
    room.handle(b, { t: 'start' });
    expect(room.state).toBe('lobby');
    expect(inbox.b.some(m => m.t === 'error')).toBe(true);
    room.handle(a, { t: 'start' });
    expect(room.state).toBe('playing');
  });

  it('un tir en face élimine, puis réapparition après 1 s', () => {
    const { room, inbox, a, b, advance, place, aimAtB, now } = setup();
    room.handle(a, { t: 'start' });
    advance(50); place();
    const { yaw, pitch } = aimAtB();
    room.handle(a, { t: 'fire', seq: 1, yaw, pitch, renderTime: now() });
    expect(inbox.b.some(m => m.t === 'kill' && m.victim === b && m.killer === a)).toBe(true);
    expect(room.players.get(b)!.alive).toBe(false);
    expect(room.scores()[0]).toMatchObject({ id: a, kills: 1 });
    advance(500); expect(room.players.get(b)!.alive).toBe(false);
    advance(600); expect(room.players.get(b)!.alive).toBe(true);
  });

  it('pas de tir pendant la recharge', () => {
    const { room, inbox, a, advance, place, aimAtB, now } = setup();
    room.handle(a, { t: 'start' });
    advance(50); place();
    const { yaw, pitch } = aimAtB();
    room.handle(a, { t: 'fire', seq: 1, yaw: yaw + 1, pitch, renderTime: now() }); // tir raté
    room.handle(a, { t: 'fire', seq: 2, yaw, pitch, renderTime: now() });          // trop tôt
    expect(inbox.a.filter(m => m.t === 'shot').length).toBe(1);
    expect(inbox.a.some(m => m.t === 'kill')).toBe(false);
  });

  it('25 éliminations terminent la partie', () => {
    const { room, inbox, a, advance, place, aimAtB, now } = setup();
    room.handle(a, { t: 'start' });
    for (let i = 0; i < CONFIG.scoreToWin; i++) {
      advance(1300); place();
      const { yaw, pitch } = aimAtB();
      room.handle(a, { t: 'fire', seq: i, yaw, pitch, renderTime: now() });
    }
    expect(room.state).toBe('ended');
    const end = inbox.a.find(m => m.t === 'matchEnd');
    expect(end && end.t === 'matchEnd' && end.winner).toBe(a);
  });

  it('les entrées font bouger le joueur et sont confirmées', () => {
    const { room, inbox, a, advance } = setup();
    room.handle(a, { t: 'start' });
    advance(50);
    const before = { ...room.players.get(a)!.state.pos };
    const yaw = room.players.get(a)!.state.yaw;
    const inputs = Array.from({ length: 30 }, (_, i) => ({ seq: i + 1, dt: 1 / 60, fwd: true, back: false, left: false, right: false, jump: false, dash: false, yaw, pitch: 0 }));
    room.handle(a, { t: 'input', inputs });
    advance(100);
    const after = room.players.get(a)!.state.pos;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1);
    const snap = [...inbox.a].reverse().find(m => m.t === 'snapshot');
    expect(snap && snap.t === 'snapshot' && snap.ack).toBe(30);
  });
});

describe('serveur', () => {
  it('création de salon et connexion de deux joueurs', async () => {
    const srv = await startServer(0);
    try {
      const base = `http://localhost:${srv.port()}`;
      const { code } = await (await fetch(base + '/rooms', { method: 'POST' })).json() as { code: string };
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
      const join = (name: string) => new Promise<{ ws: WebSocket; msgs: ServerMsg[] }>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${srv.port()}/ws?room=${code}`);
        const msgs: ServerMsg[] = [];
        ws.on('message', d => msgs.push(JSON.parse(d.toString())));
        ws.on('open', () => { ws.send(JSON.stringify({ t: 'join', name })); setTimeout(() => resolve({ ws, msgs }), 150); });
        ws.on('error', reject);
      });
      const c1 = await join('Alice'), c2 = await join('Bob');
      await new Promise(r => setTimeout(r, 100));
      expect(c1.msgs[0].t).toBe('welcome');
      const lastLobby = [...c1.msgs].reverse().find(m => m.t === 'lobby');
      expect(lastLobby && lastLobby.t === 'lobby' && lastLobby.players.length).toBe(2);
      c1.ws.close(); c2.ws.close();
      const bad = await fetch(base + '/rooms/ZZZZZZ');
      expect(bad.status).toBe(404);
    } finally { await srv.close(); }
  });
});
