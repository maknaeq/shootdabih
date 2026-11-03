import { cleanName } from '@sdb/shared';
import { createRoom } from '../net/connection';
import { h, loadName, saveName, wakeText } from './dom';

/** Accueil : un pseudo, un bouton pour créer un salon. */
export function homeScreen(go: (path: string) => void): HTMLElement {
  const input = h('input', { id: 'name', type: 'text', maxlength: '16', autocomplete: 'nickname', placeholder: 'Ton pseudo', value: loadName() });
  const status = h('p', { class: 'status', role: 'status' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Créer un salon');
  const form = h('form', { class: 'card', novalidate: true },
    h('h1', { class: 'brand' }, 'shoot', h('span', {}, 'dabih')),
    h('p', { class: 'tagline' }, 'Un rayon, un tir, premier à 25. Crée un salon et envoie le lien à tes amis.'),
    h('div', { class: 'field' }, h('label', { for: 'name' }, 'Pseudo'), input),
    btn, status
  );
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const raw = input.value.trim();
    if (raw.length < 2) { status.className = 'status error'; status.textContent = 'Choisis un pseudo de 2 caractères au moins.'; input.focus(); return; }
    saveName(cleanName(raw));
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
  queueMicrotask(() => input.focus());
  return h('div', { class: 'screen' }, form, h('p', { class: 'version' }, 'Version ' + __BUILD__));
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
