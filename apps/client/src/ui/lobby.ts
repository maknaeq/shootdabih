import {
  ABILITIES, CONFIG, HATS, MAP_DEFS, PARKA_COLORS, SCORE_CHOICES, TIME_CHOICES,
  type Ability, type Hat, type LobbyPlayer, type RoomSettings, type RoomState, type ScoreLine
} from '@sdb/shared';
import { h, hex } from './dom';

export const HAT_LABEL: Record<Hat, string> = { aucun: 'Rien', bonnet: 'Bonnet', casquette: 'Casquette', chapka: 'Chapka', casque: 'Casque' };
export const ABILITY_LABEL: Record<Ability, { name: string; text: string }> = {
  grappin: { name: 'Grappin', text: "T'accroche à ce que tu vises, jusqu'à 32 m. Recharge 6 s." },
  blink: { name: 'Saut éclair', text: 'Te projette 8 m devant toi en un instant. Recharge 5 s.' },
  saut: { name: 'Double saut', text: 'Un saut de plus en l’air, à chaque fois.' },
  bouclier: { name: 'Bouclier', text: 'Encaisse un tir pendant 2,5 s. Recharge 10 s.' },
  aucune: { name: 'Aucune', text: '' }
};

export interface Loadout { color: number; hat: Hat; ability: Ability }
export function loadLoadout(): Partial<Loadout> { try { return JSON.parse(localStorage.getItem('sdb-loadout') ?? '{}'); } catch { return {}; } }
function saveLoadout(l: Loadout) { try { localStorage.setItem('sdb-loadout', JSON.stringify(l)); } catch { /* stockage indisponible */ } }

export interface LobbyView {
  root: HTMLElement;
  update(players: LobbyPlayer[], hostId: string, me: string, state: RoomState, settings: RoomSettings): void;
  showEnd(list: ScoreLine[], winner: string | null, me: string, isHost: boolean): void;
  error(msg: string): void;
}

interface Handlers { start(): void; leave(): void; customize(l: Loadout): void; settings(s: RoomSettings): void }

const segStyle = 'display:flex;flex-wrap:wrap;gap:6px';
function seg<T extends string | number>(items: ReadonlyArray<{ v: T; label: string; disabled?: boolean }>, current: T, onPick: (v: T) => void, enabled: boolean) {
  return h('div', { style: segStyle, role: 'group' }, ...items.map(it => {
    const b = h('button', { type: 'button', class: 'chip-btn' + (it.v === current ? ' on' : ''), 'aria-pressed': String(it.v === current) }, it.label);
    b.disabled = !enabled || !!it.disabled;
    b.addEventListener('click', () => onPick(it.v));
    return b;
  }));
}

/** Salle d'attente : lien du salon, joueurs, perso de chacun, réglages de l'hôte, lancement. Sert aussi d'écran de fin. */
export function lobbyView(code: string, on: Handlers): LobbyView {
  const url = `${location.origin}/s/${code}`;
  const linkEl = h('div', { class: 'link grow', tabindex: '0' }, url);
  const copyBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Copier le lien');
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); copyBtn.textContent = 'Lien copié'; }
    catch { copyBtn.textContent = 'Sélectionne le lien'; linkEl.focus(); getSelection()?.selectAllChildren(linkEl); }
    setTimeout(() => { copyBtn.textContent = 'Copier le lien'; }, 2000);
  });
  const list = h('ul', { class: 'players' });
  const startBtn = h('button', { class: 'btn', type: 'button', onclick: on.start }, 'Lancer la partie');
  const waiting = h('p', { class: 'hint' });
  const status = h('p', { class: 'status error', role: 'status' });
  const endBox = h('div', { style: 'display:none;flex-direction:column;gap:10px' });
  const perso = h('div', { class: 'section' });
  const rules = h('div', { class: 'section' });

  const saved = loadLoadout();
  let loadout: Loadout = { color: saved.color ?? -1, hat: saved.hat ?? 'bonnet', ability: saved.ability ?? 'saut' };
  let sentInitial = false;

  const left = h('div', { class: 'col' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'hint' }, 'Salon'), h('div', { class: 'code' }, code)),
      h('button', { class: 'btn ghost', type: 'button', onclick: on.leave }, 'Quitter')),
    endBox,
    h('div', { class: 'row' }, linkEl, copyBtn),
    list, startBtn, waiting, status);
  const right = h('div', { class: 'col' }, perso, rules);
  const card = h('div', { class: 'card wide' }, left, right);
  const root = h('div', { class: 'screen' }, card);

  function renderPerso(players: LobbyPlayer[], me: string, abilitiesOn: boolean) {
    const mine = players.find(p => p.id === me);
    if (!mine) return;
    const taken = new Set(players.filter(p => p.id !== me).map(p => p.color));
    const colors = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px', role: 'group', 'aria-label': 'Couleur de parka' }, ...PARKA_COLORS.map(c => {
      const b = h('button', { type: 'button', class: 'swatch' + (c === mine.color ? ' on' : ''), style: `background:${hex(c)}`, 'aria-label': 'Couleur ' + hex(c), 'aria-pressed': String(c === mine.color) });
      b.disabled = taken.has(c);
      if (b.disabled) b.title = 'Déjà prise';
      b.addEventListener('click', () => pick({ ...current(mine), color: c }));
      return b;
    }));
    const hats = seg(HATS.map(v => ({ v, label: HAT_LABEL[v] })), mine.hat, v => pick({ ...current(mine), hat: v }), true);
    const abilities = h('div', { class: 'abilities' }, ...ABILITIES.map(a => {
      const b = h('button', { type: 'button', class: 'ability' + (a === mine.ability ? ' on' : ''), 'aria-pressed': String(a === mine.ability) },
        h('b', {}, ABILITY_LABEL[a].name), h('span', {}, ABILITY_LABEL[a].text));
      b.disabled = !abilitiesOn;
      b.addEventListener('click', () => pick({ ...current(mine), ability: a }));
      return b;
    }));
    perso.replaceChildren(
      h('h3', {}, 'Ton perso'),
      h('div', { class: 'hint' }, 'Parka'), colors,
      h('div', { class: 'hint' }, 'Sur la tête'), hats,
      h('div', { class: 'hint' }, abilitiesOn ? 'Capacité (touche E)' : "Capacités désactivées par l'hôte"), abilities);
  }
  const current = (mine: LobbyPlayer): Loadout => ({ color: mine.color, hat: mine.hat, ability: mine.ability });
  function pick(l: Loadout) { loadout = l; saveLoadout(l); on.customize(l); }

  function renderRules(settings: RoomSettings, isHost: boolean) {
    const set = (patch: Partial<RoomSettings>) => {
      const next = { ...settings, ...patch };
      if (next.scoreToWin === 0 && next.timeLimitMin === 0) next.timeLimitMin = 10;
      on.settings(next);
    };
    const maps = [{ v: 'auto', label: 'Selon le nombre de joueurs' }, ...Object.values(MAP_DEFS).map(d => ({ v: d.id, label: d.name }))];
    rules.replaceChildren(
      h('h3', {}, isHost ? 'Réglages de la partie' : "Réglages de l'hôte"),
      h('div', { class: 'hint' }, 'Map'), seg(maps, settings.mapId, v => set({ mapId: v }), isHost),
      h('div', { class: 'hint' }, 'Objectif'), seg(SCORE_CHOICES.map(v => ({ v, label: v ? `${v} élim.` : 'Illimité' })), settings.scoreToWin as number, v => set({ scoreToWin: v }), isHost),
      h('div', { class: 'hint' }, 'Temps limite'), seg(TIME_CHOICES.map(v => ({ v, label: v ? `${v} min` : 'Sans limite', disabled: v === 0 && settings.scoreToWin === 0 })), settings.timeLimitMin as number, v => set({ timeLimitMin: v }), isHost),
      h('div', { class: 'hint' }, 'Capacités'), seg([{ v: 1, label: 'Activées' }, { v: 0, label: 'Désactivées' }], settings.abilities ? 1 : 0, v => set({ abilities: v === 1 }), isHost),
      h('div', { class: 'hint' }, 'Bonus au sol'), seg([{ v: 1, label: 'Activés' }, { v: 0, label: 'Désactivés' }], settings.pickups ? 1 : 0, v => set({ pickups: v === 1 }), isHost),
      settings.scoreToWin === 0 ? h('p', { class: 'hint' }, 'Éliminations illimitées : la partie s’arrête à la fin du temps.') : '');
  }

  return {
    root,
    update(players, hostId, me, state, settings) {
      if (!sentInitial && players.some(p => p.id === me)) {
        sentInitial = true;
        const mine = players.find(p => p.id === me)!;
        const want: Loadout = { color: PARKA_COLORS.includes(loadout.color as typeof PARKA_COLORS[number]) && !players.some(p => p.id !== me && p.color === loadout.color) ? loadout.color : mine.color, hat: loadout.hat, ability: loadout.ability };
        if (want.color !== mine.color || want.hat !== mine.hat || want.ability !== mine.ability) on.customize(want);
      }
      list.replaceChildren(...players.map(p => h('li', {},
        h('span', { class: 'dot', style: `background:${hex(p.color)}` }),
        h('span', {}, p.name + (p.id === me ? ' (toi)' : '')),
        h('span', { class: 'badge' }, HAT_LABEL[p.hat] + (settings.abilities ? ' · ' + ABILITY_LABEL[p.ability].name : '')),
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
      renderPerso(players, me, settings.abilities);
      renderRules(settings, isHost);
    },
    showEnd(rows, winner, me, isHost) {
      const w = rows.find(r => r.id === winner);
      endBox.style.display = 'flex';
      endBox.replaceChildren(
        h('h2', { style: 'margin:0;font-family:var(--display);font-size:30px;text-transform:uppercase;letter-spacing:.04em' }, w ? (w.id === me ? 'Victoire !' : `Victoire de ${w.name}`) : 'Fin de la partie'),
        scoreTable(rows, me),
        h('p', { class: 'hint' }, isHost ? 'Relance quand tout le monde est prêt.' : "L'hôte peut relancer une partie."));
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
