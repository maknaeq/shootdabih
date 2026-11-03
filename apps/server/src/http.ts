import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
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

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json', '.ico': 'image/x-icon' };

/** Sert le client compilé (dossier dist) : fichiers existants, sinon index.html pour les routes du site. */
async function serveStatic(dir: string, req: IncomingMessage, res: ServerResponse) {
  let path: string;
  try { path = decodeURIComponent((req.url ?? '/').split('?')[0]); } catch { res.writeHead(400).end(); return; }
  let file = normalize(join(dir, path));
  if (!file.startsWith(normalize(dir))) { res.writeHead(403).end(); return; }
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(dir, 'index.html'); }
  try {
    const body = await readFile(file);
    const long = file.includes(`${'/'}assets${'/'}`);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': long ? 'public, max-age=31536000, immutable' : 'no-cache' }).end(body);
  } catch { res.writeHead(404).end(); }
}

export function startServer(port: number, allowedOrigins: string[] = ['*'], staticDir?: string): Promise<GameServer> {
  const rooms = new Rooms();
  const http = createServer((req, res) => {
    try { handle(req, res); } catch (err) { console.error('requête en erreur', err); if (!res.headersSent) res.writeHead(500).end(); }
  });
  const handle = (req: IncomingMessage, res: ServerResponse) => {
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
    if (staticDir && req.method === 'GET') { serveStatic(staticDir, req, res).catch(() => { if (!res.headersSent) res.writeHead(500).end(); }); return; }
    res.writeHead(404).end();
  };

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
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
      try {
        const msg = decodeClient(data.toString());
        if (!msg) return;
        if (!id) { if (msg.t === 'join') id = room.addPlayer(msg.name, send); if (!id) ws.close(); return; }
        room.handle(id, msg);
      } catch (err) { console.error('message en erreur', err); }
    });
    ws.on('error', () => { /* connexion coupée côté client */ });
    ws.on('close', () => { if (id) room.removePlayer(id); });
  }

  const timer = setInterval(() => { try { rooms.tick(); } catch (err) { console.error('pas de jeu en erreur', err); } }, 1000 / CONFIG.tickRate);

  return new Promise(resolve => {
    http.listen(port, () => resolve({
      http, rooms,
      port: () => { const a = http.address(); return typeof a === 'object' && a ? a.port : port; },
      close: () => new Promise<void>(done => { clearInterval(timer); for (const c of wss.clients) c.terminate(); wss.close(); http.close(() => done()); })
    }));
  });
}
