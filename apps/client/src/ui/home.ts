import { cleanName } from '@sdb/shared';
import { MODE_LABEL } from '@sdb/shared';
import { createRoom, listRooms } from '../net/connection';
import { h, loadName, saveName, wakeText } from './dom';

/** Accueil : pseudo, créer un salon, rejoindre avec un code, ou choisir un salon en cours. */
export function homeScreen(go: (path: string) => void): HTMLElement {
  const input = h('input', { id: 'name', type: 'text', maxlength: '16', autocomplete: 'nickname', placeholder: 'Ton pseudo', value: loadName() });
  const status = h('p', { class: 'status', role: 'status' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Créer un salon');
  const codeInput = h('input', { id: 'code', type: 'text', maxlength: '6', autocomplete: 'off', placeholder: 'ABC123', style: 'text-transform:uppercase;letter-spacing:.14em;font-family:var(--display);font-size:20px' });
  const joinBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Rejoindre');
  const joinStatus = h('p', { class: 'status error', role: 'status' });
  const list = h('ul', { class: 'rooms' });
  const listStatus = h('p', { class: 'hint' }, 'Chargement des salons…');

  const nameOk = () => {
    const raw = input.value.trim();
    if (raw.length < 2) { status.className = 'status error'; status.textContent = 'Choisis un pseudo de 2 caractères au moins.'; input.focus(); return false; }
    saveName(cleanName(raw)); return true;
  };
  const join = (code: string) => { if (nameOk()) go('/s/' + code.toUpperCase()); };

  const form = h('form', { class: 'card', novalidate: true },
    h('h1', { class: 'brand' }, 'shoot', h('span', {}, 'dabih')),
    h('p', { class: 'tagline' }, 'Un rayon, un tir. Crée un salon et envoie le lien, ou rejoins tes amis.'),
    h('div', { class: 'field' }, h('label', { for: 'name' }, 'Pseudo'), input),
    btn, status,
    h('div', { class: 'field' }, h('label', { for: 'code' }, 'Rejoindre avec un code'), h('div', { class: 'row' }, h('div', { class: 'grow' }, codeInput), joinBtn)),
    joinStatus);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!nameOk()) return;
    btn.disabled = true; btn.textContent = 'Création…'; status.className = 'status'; status.textContent = '';
    try {
      const code = await createRoom(s => { status.textContent = wakeText(s); });
      go('/s/' + code);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Réessayer';
      status.className = 'status error';
      status.textContent = (err as Error).message + ' Vérifie ta connexion puis réessaie.';
    }
  });
  const tryJoin = () => {
    const c = codeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(c)) { joinStatus.textContent = 'Un code de salon fait 6 caractères, comme dans le lien : /s/ABC123.'; codeInput.focus(); return; }
    joinStatus.textContent = ''; join(c);
  };
  joinBtn.addEventListener('click', tryJoin);
  codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryJoin(); } });

  const roomsCard = h('section', { class: 'card roomscard', 'aria-labelledby': 'rooms-title' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', { id: 'rooms-title', class: 'cardtitle' }, 'Salons en cours'), h('button', { class: 'btn ghost xs', type: 'button', onclick: () => refresh() }, 'Actualiser')),
    listStatus, list);
  let timer = 0;
  async function refresh() {
    try {
      const rooms = await listRooms(s => { listStatus.textContent = wakeText(s); });
      if (!document.body.contains(list)) return;
      listStatus.textContent = rooms.length ? '' : 'Aucun salon en cours pour le moment. Crée le premier et envoie le lien à tes amis.';
      list.replaceChildren(...rooms.map(r => {
        const full = r.players >= r.max;
        const b = h('button', { class: 'btn ghost xs', type: 'button' }, full ? 'Plein' : 'Rejoindre');
        b.disabled = full;
        b.addEventListener('click', () => join(r.code));
        return h('li', {},
          h('div', { class: 'grow' },
            h('div', { class: 'rtitle' }, h('b', {}, r.host ? `Salon de ${r.host}` : r.code), h('span', { class: 'state ' + r.state }, r.state === 'playing' ? 'En partie' : r.state === 'ended' ? 'Fin de partie' : 'Salle d’attente')),
            h('div', { class: 'hint' }, `${MODE_LABEL[r.mode]} · ${r.map} · ${r.players}/${r.max} joueurs · ${r.code}`)),
          b);
      }));
    } catch (err) {
      listStatus.textContent = (err as Error).message + ' Nouvel essai dans quelques secondes.';
    }
    clearTimeout(timer);
    if (document.body.contains(list) || !list.isConnected) timer = window.setTimeout(() => { if (list.isConnected) refresh(); }, 5000);
  }
  queueMicrotask(() => { input.focus(); refresh(); });
  return h('div', { class: 'screen home' }, h('div', { class: 'homegrid' }, form, roomsCard), h('p', { class: 'version' }, 'Version ' + __BUILD__));
}

/** Pseudo demandé à qui arrive par un lien sans pseudo enregistré. */
export function nameScreen(code: string, onDone: (name: string) => void): HTMLElement {
  const input = h('input', { id: 'name', type: 'text', maxlength: '16', autocomplete: 'nickname', placeholder: 'Ton pseudo' });
  const status = h('p', { class: 'status error', role: 'status' });
  const form = h('form', { class: 'card', novalidate: true },
    h('h1', { class: 'brand' }, 'shoot', h('span', {}, 'dabih')),
    h('p', { class: 'tagline' }, `Tu rejoins le salon ${code}.`),
    h('div', { class: 'field' }, h('label', { for: 'name' }, 'Pseudo'), input),
    h('button', { class: 'btn', type: 'submit' }, 'Rejoindre'), status
  );
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (input.value.trim().length < 2) { status.textContent = 'Choisis un pseudo de 2 caractères au moins.'; input.focus(); return; }
    const n = cleanName(input.value); saveName(n); onDone(n);
  });
  queueMicrotask(() => input.focus());
  return h('div', { class: 'screen' }, form);
}

export function messageScreen(title: string, text: string, action: { label: string; run: () => void }): HTMLElement {
  return h('div', { class: 'screen' }, h('div', { class: 'card' },
    h('h1', { class: 'brand' }, 'shoot', h('span', {}, 'dabih')),
    h('h2', { style: 'margin:0;font-family:var(--display);font-size:26px;text-transform:uppercase;letter-spacing:.04em' }, title),
    h('p', { class: 'tagline' }, text),
    h('button', { class: 'btn', type: 'button', onclick: action.run }, action.label)
  ));
}
