import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { CONFIG, decodeClient, encode, type ServerMsg } from '@sdb/shared';
import { Rooms } from './rooms';

export interface GameServer { http: Server; rooms: Rooms; close(): Promise<void>; port(): number }

function cors(req: IncomingMessage, res: ServerResponse, allowed: string[]) {
  const origin = req.headers.origin ?? '';
  if (allowed.includes('*') || allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function startServer(port: number, allowedOrigins: string[] = ['*']): Promise<GameServer> {
  const rooms = new Rooms();
  const http = createServer((req, res) => {
    cors(req, res, allowedOrigins);
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok'); return; }
    if (req.url === '/rooms' && req.method === 'POST') {
      const r = rooms.create();
      res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code: r.code }));
      return;
    }
    const m = req.url?.match(/^\/rooms\/([A-Za-z0-9]{6})$/);
    if (m && req.method === 'GET') {
      const r = rooms.get(m[1]);
      if (!r) { res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Salon introuvable' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code: r.code, players: r.size, state: r.state }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const room = url.pathname === '/ws' ? rooms.get(url.searchParams.get('room') ?? '') : undefined;
    if (!room) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => onSocket(ws, room));
  });

  function onSocket(ws: WebSocket, room: ReturnType<Rooms['create']>) {
    let id: string | null = null;
    const send = (m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(encode(m)); };
    ws.on('message', data => {
      const msg = decodeClient(data.toString());
      if (!msg) return;
      if (!id) { if (msg.t === 'join') id = room.addPlayer(msg.name, send); if (!id) ws.close(); return; }
      room.handle(id, msg);
    });
    ws.on('close', () => { if (id) room.removePlayer(id); });
  }

  const timer = setInterval(() => rooms.tick(), 1000 / CONFIG.tickRate);

  return new Promise(resolve => {
    http.listen(port, () => resolve({
      http, rooms,
      port: () => { const a = http.address(); return typeof a === 'object' && a ? a.port : port; },
      close: () => new Promise<void>(done => { clearInterval(timer); for (const c of wss.clients) c.terminate(); wss.close(); http.close(() => done()); })
    }));
  });
}
