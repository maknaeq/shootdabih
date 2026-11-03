import './ui/style.css';
import { checkRoom } from './net/connection';
import { Session } from './game/session';
import { homeScreen, messageScreen, nameScreen } from './ui/home';
import { h, loadName, wakeText } from './ui/dom';
import { loadModels } from './render/models';

const models = loadModels();

const app = document.getElementById('app')!;
let session: Session | null = null;

function go(path: string) { history.pushState(null, '', path); route(); }
window.addEventListener('popstate', route);

async function route() {
  session?.dispose(); session = null;
  app.replaceChildren();
  const m = location.pathname.match(/^\/s\/([A-Za-z0-9]{6})\/?$/);
  if (!m) { app.append(homeScreen(go)); return; }
  const code = m[1].toUpperCase();
  const name = loadName();
  if (name.length < 2) { app.append(nameScreen(code, () => route())); return; }
  const status = h('p', { class: 'status', role: 'status' }, 'Connexion au salon…');
  app.append(h('div', { class: 'screen' }, h('div', { class: 'card' }, h('h1', { class: 'brand' }, 'shoot', h('span', {}, 'dabih')), status)));
  try {
    const r = await checkRoom(code, s => { status.textContent = wakeText(s); });
    if (!r.ok) {
      app.replaceChildren(messageScreen('Salon introuvable', `Le salon ${code} n'existe plus : il se ferme 5 minutes après le départ du dernier joueur. Crée-en un nouveau.`, { label: 'Créer un salon', run: () => go('/') }));
      return;
    }
  } catch (err) {
    app.replaceChildren(messageScreen('Serveur injoignable', (err as Error).message + ' Réessaie dans un instant.', { label: 'Réessayer', run: () => route() }));
    return;
  }
  await models;
  app.replaceChildren();
  session = new Session(app, code, name, () => go('/'));
  if (new URLSearchParams(location.search).has('test')) (window as unknown as { __sdb: Session }).__sdb = session;
}

route();
