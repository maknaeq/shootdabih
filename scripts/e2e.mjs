// Test de bout en bout : serveur + client, deux navigateurs qui jouent ensemble.
// Usage : node scripts/e2e.mjs [dossier-captures]
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const SERVER_PORT = 8788;
const BASE = process.env.BASE ?? `http://localhost:${SERVER_PORT}`;
const shots = process.argv[2] ?? '.';
const procs = [];
let browser;
const run = (cmd, args, env) => { const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; };
const waitFor = async (url, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.status < 500) return; } catch {} await sleep(300); } throw new Error('Pas de réponse : ' + url); };
const check = (ok, msg) => { if (!ok) throw new Error('ÉCHEC : ' + msg); console.log('ok  ' + msg); };

try {
  // le serveur sert aussi le client compilé (pnpm --filter @sdb/client build avant)
  if (!process.env.BASE) {
    run('apps/server/node_modules/.bin/tsx', ['apps/server/src/index.ts'], { PORT: String(SERVER_PORT), STATIC_DIR: process.cwd() + '/apps/client/dist' });
    await waitFor(`${BASE}/health`);
  }

  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async name => {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
    const settings = JSON.stringify({ shadows: process.env.SHADOWS === '1', resolution: process.env.SHADOWS === '1' ? 1 : 0.5, fov: 85, sensitivity: 1 });
    await ctx.addInitScript(([n, st]) => { localStorage.setItem('sdb-name', n); localStorage.setItem('sdb-settings', st); }, [name, settings]);
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log(`[${name}] erreur page :`, e.message));
    return page;
  };
  const a = await open('Alice'), b = await open('Bob');

  await a.goto(`${BASE}/`);
  await a.getByRole('button', { name: 'Créer un salon' }).click();
  await a.waitForURL(/\/s\/[A-Z0-9]{6}$/, { timeout: 20000 });
  const roomUrl = a.url();
  check(/\/s\/[A-Z0-9]{6}$/.test(roomUrl), 'création du salon et lien ' + roomUrl.split('/').pop());
  await a.goto(roomUrl + '?test');
  await b.goto(roomUrl + '?test');
  await a.locator('.tag3d').nth(1).waitFor({ state: 'attached', timeout: 15000 });
  check((await a.locator('.tag3d').count()) === 2, "l'hôte voit 2 joueurs dans la salle d'attente");
  check(await b.getByText('En attente que Alice lance la partie').isVisible(), "l'invité attend l'hôte");
  check(!(await b.getByRole('button', { name: 'Changer la map et les réglages' }).isVisible()), "l'invité ne voit pas les réglages");
  await a.screenshot({ path: `${shots}/e2e-lobby.png` });

  if (process.env.MODE === 'ctf') {
    await a.getByRole('button', { name: 'Changer la map et les réglages' }).click();
    await a.getByRole('button', { name: 'Capture du drapeau' }).click();
    await sleep(400);
    await a.getByRole('button', { name: 'Fermer' }).click();
    await sleep(300);
    check((await b.locator('.lb-summary').innerText()).includes('Capture du drapeau'), "l'invité voit le mode choisi par l'hôte");
  }
  await a.getByRole('button', { name: 'Lancer la partie' }).click();
  await sleep(1500);
  const state = p => p.evaluate(() => { const s = window.__sdb; return { state: s.state, alive: s.alive, pos: s.predictor?.state.pos }; });
  const sa = await state(a), sb = await state(b);
  check(sa.state === 'playing' && sb.state === 'playing' && sa.alive && sb.alive, 'la partie démarre et les deux joueurs apparaissent');
  await b.evaluate(() => window.__sdb.hud.showPrompt(false)); await sleep(800);
  await b.screenshot({ path: `${shots}/e2e-depart.png` });

  const t0 = await a.evaluate(() => window.__sdb.predictor.state.time); await sleep(1000); const t1 = await a.evaluate(() => window.__sdb.predictor.state.time);
  console.log(`info : ${(t1 - t0).toFixed(2)} s simulées par seconde réelle chez Alice (navigateur de test sans carte graphique)`);
  if (process.env.MODE === 'ctf') {
    const t = await b.evaluate(() => ({ bar: getComputedStyle(document.querySelector('.hud .teambar')).display !== 'none', flags: window.__sdb.flagState.length, teams: window.__sdb.players.map(p => p.team) }));
    check(t.bar && t.flags === 2 && t.teams[0] !== t.teams[1] && t.teams.every(x => x >= 0), `capture du drapeau : barre des équipes, 2 drapeaux, équipes ${t.teams.join(' et ')}`);
    await b.screenshot({ path: `${shots}/e2e-ctf.png` });
  }
  // Alice avance pendant 1 s
  await a.evaluate(() => { const s = window.__sdb; s.input.forced = true; s.input.keys.add('KeyW'); s.hud.showPrompt(false); });
  await b.evaluate(() => { const s = window.__sdb; s.input.forced = true; s.hud.showPrompt(false); });
  const seenBefore = await b.evaluate(() => { const s = window.__sdb; const id = s.players.find(p => p.id !== s.me).id; return s.interp.sample(id, s.serverNow() - 100); });
  await sleep(1000);
  await a.evaluate(() => window.__sdb.input.keys.delete('KeyW'));
  await sleep(400);
  const aAfter = await state(a);
  const moved = Math.hypot(aAfter.pos.x - sa.pos.x, aAfter.pos.z - sa.pos.z);
  check(moved > 0.5, `Alice s'est déplacée de ${moved.toFixed(1)} m (prédiction locale)`);
  const seenAfter = await b.evaluate(() => { const s = window.__sdb; const id = s.players.find(p => p.id !== s.me).id; return s.interp.sample(id, s.serverNow() - 100); });
  const seenMove = Math.hypot(seenAfter.x - seenBefore.x, seenAfter.z - seenBefore.z);
  const gap = Math.hypot(seenAfter.x - aAfter.pos.x, seenAfter.z - aAfter.pos.z);
  check(seenMove > 0.5 && gap < 1.5, `Bob voit Alice bouger (${seenMove.toFixed(1)} m, écart ${gap.toFixed(2)} m avec sa position réelle)`);

  // Alice tire : Bob reçoit le rayon
  await b.evaluate(() => { const s = window.__sdb; s.__shots = 0; const orig = s.onMessage.bind(s); s.onMessage = m => { if (m.t === 'shot') s.__shots++; orig(m); }; s.conn.onMessage = m => s.onMessage(m); });
  await a.evaluate(() => window.__sdb.fire(performance.now() / 1000));
  await sleep(500);
  check((await b.evaluate(() => window.__sdb.__shots)) === 1, 'le tir d’Alice arrive chez Bob');
  await a.screenshot({ path: `${shots}/e2e-jeu.png` });

  // HUD : mini-map, armes, killfeed ; puis la killcam chez Bob (élimination simulée côté client)
  const hud = await b.evaluate(() => ({ map: !!document.querySelector('.hud .minimap'), weapons: document.querySelectorAll('.hud .weapons .w').length }));
  check(hud.map && hud.weapons === 4, `mini-map affichée et ${hud.weapons} armes dans le HUD`);
  await b.evaluate(() => { const s = window.__sdb; const other = s.players.find(p => p.id !== s.me).id; s.onMessage({ t: 'kill', killer: other, victim: s.me, weapon: 'rayon', dist: 14, streak: 3 }); });
  await sleep(900);
  const kc = await b.evaluate(() => ({ on: !!window.__sdb.killcam, feed: document.querySelector('.hud .feed li')?.textContent ?? '' }));
  check(kc.on && kc.feed.includes('14 m'), `killcam lancée et killfeed précis (« ${kc.feed} »)`);
  await b.screenshot({ path: `${shots}/e2e-killcam.png` });

  await browser.close();
  console.log('\nTout est bon.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  for (const p of procs) p.kill();
  process.exit(process.exitCode ?? 0);
}
