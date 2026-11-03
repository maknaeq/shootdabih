import { CONFIG, type LobbyPlayer, type RoomState, type ScoreLine } from '@sdb/shared';
import { h, hex } from './dom';

export interface LobbyView {
  root: HTMLElement;
  update(players: LobbyPlayer[], hostId: string, me: string, state: RoomState): void;
  showEnd(list: ScoreLine[], winner: string | null, me: string, isHost: boolean): void;
  error(msg: string): void;
}

/** Salle d'attente : code et lien du salon, joueurs présents, lancement par l'hôte. Sert aussi d'écran de fin. */
export function lobbyView(code: string, onStart: () => void, onLeave: () => void): LobbyView {
  const url = `${location.origin}/s/${code}`;
  const copyBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Copier le lien');
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); copyBtn.textContent = 'Lien copié'; }
    catch { copyBtn.textContent = 'Sélectionne le lien'; linkEl.focus(); getSelection()?.selectAllChildren(linkEl); }
    setTimeout(() => { copyBtn.textContent = 'Copier le lien'; }, 2000);
  });
  const linkEl = h('div', { class: 'link grow', tabindex: '0' }, url);
  const list = h('ul', { class: 'players' });
  const startBtn = h('button', { class: 'btn', type: 'button', onclick: onStart }, 'Lancer la partie');
  const waiting = h('p', { class: 'hint' });
  const status = h('p', { class: 'status error', role: 'status' });
  const endBox = h('div', { style: 'display:none;flex-direction:column;gap:10px' });
  const card = h('div', { class: 'card', style: 'width:min(480px,100%)' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'hint' }, 'Salon'), h('div', { class: 'code' }, code)),
      h('button', { class: 'btn ghost', type: 'button', onclick: onLeave }, 'Quitter')),
    endBox,
    h('div', { class: 'row' }, linkEl, copyBtn),
    list, startBtn, waiting, status
  );
  const root = h('div', { class: 'screen' }, card);
  return {
    root,
    update(players, hostId, me, state) {
      list.replaceChildren(...players.map(p => h('li', {},
        h('span', { class: 'dot', style: `background:${hex(p.color)}` }),
        h('span', {}, p.name + (p.id === me ? ' (toi)' : '')),
        p.id === hostId ? h('span', { class: 'badge host' }, 'Hôte') : null)));
      const isHost = me === hostId, enough = players.length >= CONFIG.minPlayersToStart;
      startBtn.style.display = isHost ? '' : 'none';
      startBtn.disabled = !enough;
      startBtn.textContent = state === 'ended' ? 'Rejouer' : 'Lancer la partie';
      const host = players.find(p => p.id === hostId);
      waiting.textContent = !enough ? 'Envoie le lien à tes amis : il faut au moins 2 joueurs pour lancer.'
        : isHost ? `${players.length} joueurs prêts. Tu peux lancer quand tu veux.`
        : `En attente que ${host?.name ?? "l'hôte"} lance la partie.`;
      if (state === 'lobby') endBox.style.display = 'none';
    },
    showEnd(rows, winner, me, isHost) {
      const w = rows.find(r => r.id === winner);
      endBox.style.display = 'flex';
      endBox.replaceChildren(
        h('h2', { style: 'margin:0;font-family:var(--display);font-size:30px;text-transform:uppercase;letter-spacing:.04em' }, w ? (w.id === me ? 'Victoire !' : `Victoire de ${w.name}`) : 'Fin de la partie'),
        scoreTable(rows, me),
        h('p', { class: 'hint' }, isHost ? 'Relance quand tout le monde est prêt.' : "L'hôte peut relancer une partie.")
      );
    },
    error(msg) { status.textContent = msg; setTimeout(() => { if (status.textContent === msg) status.textContent = ''; }, 4000); }
  };
}

export function scoreTable(rows: ScoreLine[], me: string): HTMLElement {
  return h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Joueur'), h('th', { class: 'num' }, 'Élim.'), h('th', { class: 'num' }, 'Morts'))),
    h('tbody', {}, ...rows.map((r, i) => h('tr', { class: r.id === me ? 'me' : '' },
      h('td', {}, String(i + 1)),
      h('td', {}, h('span', { class: 'dot', style: `display:inline-block;vertical-align:-2px;margin-right:8px;background:${hex(r.color)}` }), r.name),
      h('td', { class: 'num' }, String(r.kills)), h('td', { class: 'num' }, String(r.deaths))))));
}
