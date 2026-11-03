import {
  CAPTURE_CHOICES, CONFIG, GAME_MODES, HATS, LAP_CHOICES, MAP_DEFS, MODE_LABEL, PARKA_COLORS, SCORE_CHOICES, TEAM_NAMES, TIME_CHOICES, mapSupports,
  type Ability, type Hat, type LobbyPlayer, type RoomSettings, type RoomState, type ScoreLine
} from '@sdb/shared';
import { h, hex } from './dom';

export const HAT_LABEL: Record<Hat, string> = { aucun: 'Rien', bonnet: 'Bonnet', casquette: 'Casquette', chapka: 'Chapka', casque: 'Casque' };
export const ABILITY_LABEL: Record<Ability, { name: string }> = {
  grappin: { name: 'Grappin' }, blink: { name: 'Saut éclair' }, saut: { name: 'Double saut' }, bouclier: { name: 'Bouclier' }, aucune: { name: '' }
};

export interface Loadout { color: number; hat: Hat }
export function loadLoadout(): Partial<Loadout> { try { return JSON.parse(localStorage.getItem('sdb-loadout') ?? '{}'); } catch { return {}; } }
function saveLoadout(l: Loadout) { try { localStorage.setItem('sdb-loadout', JSON.stringify(l)); } catch { /* stockage indisponible */ } }

export interface TagPos { id: string; x: number; y: number; visible: boolean }

export interface LobbyView {
  root: HTMLElement;
  update(players: LobbyPlayer[], hostId: string, me: string, state: RoomState, settings: RoomSettings): void;
  showEnd(list: ScoreLine[], winner: string | null, me: string, isHost: boolean, winnerTeam?: number, teamScores?: [number, number]): void;
  error(msg: string): void;
  /** Place les étiquettes de nom au-dessus des persos (coordonnées écran). */
  tags(list: TagPos[]): void;
}

interface Handlers {
  start(): void; leave(): void;
  customize(l: Loadout): void;
  settings(s: RoomSettings): void;
  face(dataUrl: string): void;
}

function seg<T extends string | number | boolean>(items: ReadonlyArray<{ v: T; label: string; disabled?: boolean }>, current: T, onPick: (v: T) => void) {
  return h('div', { class: 'chips', role: 'group' }, ...items.map(it => {
    const b = h('button', { type: 'button', class: 'chip-btn' + (it.v === current ? ' on' : ''), 'aria-pressed': String(it.v === current) }, it.label);
    b.disabled = !!it.disabled;
    b.addEventListener('click', () => onPick(it.v));
    return b;
  }));
}

/**
 * Salle d'attente « plateau » : la map en fond avec les persos debout, le nom de chacun au-dessus de lui,
 * le salon en haut à gauche, la map en haut à droite, la personnalisation au centre en bas, Lancer en bas à droite.
 * Les réglages de partie ne sont visibles que pour l'hôte, dans un panneau qui glisse depuis la droite.
 */
export function lobbyView(code: string, on: Handlers): LobbyView {
  const url = `${location.origin}/s/${code}`;
  const tagLayer = h('div', { class: 'lb-tags', 'aria-hidden': 'true' });
  const copyBtn = h('button', { class: 'btn ghost xs', type: 'button' }, 'Copier le lien');
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); copyBtn.textContent = 'Lien copié'; }
    catch { copyBtn.textContent = url; }
    setTimeout(() => { copyBtn.textContent = 'Copier le lien'; }, 2500);
  });
  const count = h('span', { class: 'hint' });
  const tl = h('div', { class: 'lb-corner lb-tl' },
    h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Salon'), h('b', { class: 'code sm' }, code)),
    h('div', { class: 'row' }, copyBtn, h('button', { class: 'btn ghost xs', type: 'button', onclick: on.leave }, 'Quitter')),
    count);
  const mapName = h('div', { class: 'lb-mapname' });
  const summary = h('div', { class: 'lb-summary' });
  const settingsBtn = h('button', { class: 'btn ghost xs', type: 'button' }, 'Changer la map et les réglages');
  const tr = h('div', { class: 'lb-corner lb-tr' }, mapName, summary, settingsBtn);
  const status = h('p', { class: 'status error lb-status', role: 'status' });
  const startBtn = h('button', { class: 'btn big', type: 'button', onclick: on.start }, 'Lancer la partie');
  const waitPill = h('span', { class: 'lb-wait' });
  const br = h('div', { class: 'lb-corner lb-br' }, status, startBtn, waitPill);

  // personnalisation
  const tabs = ['parka', 'tete', 'photo'] as const;
  const tabLabels: Record<typeof tabs[number], string> = { parka: 'Parka', tete: 'Tête', photo: 'Ma tête' };
  let tab: typeof tabs[number] = 'parka';
  const tabBar = h('div', { class: 'seg3', role: 'tablist' });
  const body = h('div', { class: 'ctab-body' });
  const dock = h('div', { class: 'lb-dock' }, tabBar, body);

  // panneau des réglages (hôte)
  const sheetBody = h('div', { class: 'col' });
  const sheet = h('aside', { class: 'lb-sheet', 'aria-label': 'Réglages de la partie' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Réglages'), h('button', { class: 'btn ghost xs', type: 'button', onclick: () => sheet.classList.remove('open') }, 'Fermer')),
    sheetBody);
  settingsBtn.addEventListener('click', () => sheet.classList.toggle('open'));

  const endBox = h('div', { class: 'lb-end', style: 'display:none' });
  const root = h('div', { class: 'lb' }, tagLayer, tl, tr, endBox, dock, br, sheet);

  const saved = loadLoadout();
  const loadout: Loadout = { color: saved.color ?? -1, hat: saved.hat ?? 'bonnet' };
  let sentInitial = false;
  let players: LobbyPlayer[] = [], me = '', hostId = '';
  const tagEls = new Map<string, HTMLElement>();

  // webcam
  let stream: MediaStream | null = null;
  const video = h('video', { class: 'lb-video', autoplay: true, playsinline: true, muted: true });
  function stopCam() { stream?.getTracks().forEach(t => t.stop()); stream = null; }
  async function startCam(msg: HTMLElement) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
      video.srcObject = stream; renderBody();
    } catch {
      msg.textContent = 'Caméra refusée ou indisponible. Autorise-la dans ton navigateur puis réessaie.';
    }
  }
  function snap() {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d')!;
    const vw = video.videoWidth || 320, vh = video.videoHeight || 240, side = Math.min(vw, vh) * 0.8;
    g.translate(96, 0); g.scale(-1, 1);
    g.drawImage(video, (vw - side) / 2, (vh - side) / 2 - vh * 0.05, side, side, 0, 0, 96, 96);
    const data = c.toDataURL('image/jpeg', 0.7);
    stopCam();
    try { localStorage.setItem('sdb-face', data); } catch { /* stockage indisponible */ }
    on.face(data); renderBody();
  }

  function pick(l: Partial<Loadout>) { Object.assign(loadout, l); saveLoadout(loadout); on.customize({ ...loadout }); }

  function renderTabs() {
    tabBar.replaceChildren(...tabs.map(t => {
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(t === tab) }, tabLabels[t]);
      b.addEventListener('click', () => { tab = t; if (t !== 'photo') stopCam(); renderTabs(); renderBody(); });
      return b;
    }));
  }

  function renderBody() {
    const mine = players.find(p => p.id === me);
    if (!mine) { body.replaceChildren(); return; }
    if (tab === 'parka') {
      const taken = new Set(players.filter(p => p.id !== me).map(p => p.color));
      body.replaceChildren(h('div', { class: 'swatches', role: 'group', 'aria-label': 'Couleur de parka' }, ...PARKA_COLORS.map(c => {
        const b = h('button', { type: 'button', class: 'swatch' + (c === mine.color ? ' on' : ''), style: `background:${hex(c)}`, 'aria-label': 'Couleur ' + hex(c), 'aria-pressed': String(c === mine.color) });
        b.disabled = taken.has(c);
        if (b.disabled) b.title = 'Déjà prise';
        b.addEventListener('click', () => pick({ color: c, hat: mine.hat }));
        return b;
      })));
    } else if (tab === 'tete') {
      body.replaceChildren(seg(HATS.map(v => ({ v, label: HAT_LABEL[v] })), mine.hat, v => pick({ color: mine.color, hat: v })));
    } else {
      const msg = h('span', { class: 'hint' }, 'Ta photo n’est envoyée qu’aux joueurs de ce salon et n’est gardée nulle part.');
      const hasFace = (() => { try { return !!localStorage.getItem('sdb-face'); } catch { return false; } })();
      if (stream) {
        body.replaceChildren(h('div', { class: 'row' }, video,
          h('button', { class: 'btn', type: 'button', onclick: snap }, 'Prendre la photo'),
          h('button', { class: 'btn ghost xs', type: 'button', onclick: () => { stopCam(); renderBody(); } }, 'Annuler')));
      } else {
        body.replaceChildren(h('div', { class: 'row', style: 'flex-wrap:wrap' },
          h('button', { class: 'btn ghost xs', type: 'button', onclick: () => startCam(msg) }, hasFace ? 'Reprendre une photo' : 'Mettre ma tête avec la webcam'),
          hasFace ? h('button', { class: 'btn ghost xs', type: 'button', onclick: () => { try { localStorage.removeItem('sdb-face'); } catch { /* idem */ } on.face(''); renderBody(); } }, 'Enlever ma photo') : '',
          msg));
      }
    }
  }

  function renderSettings(s: RoomSettings) {
    const goalOf = (x: RoomSettings) => x.mode === 'dm' ? x.scoreToWin : x.mode === 'ctf' ? x.captures : 1;
    const set = (patch: Partial<RoomSettings>) => {
      const next = { ...s, ...patch };
      if (next.mapId !== 'auto' && (!MAP_DEFS[next.mapId] || !mapSupports(MAP_DEFS[next.mapId], next.mode))) next.mapId = 'auto';
      if (goalOf(next) === 0 && next.timeLimitMin === 0) next.timeLimitMin = 10;
      on.settings(next);
    };
    const maps = h('div', { class: 'lb-maps' },
      ...[{ id: 'auto', name: 'Auto', meta: 'Selon le nombre de joueurs' }, ...Object.values(MAP_DEFS).filter(d => mapSupports(d, s.mode)).map(d => ({ id: d.id, name: d.name, meta: `${d.size[0]} × ${d.size[1]} m · ${d.players[0]} à ${d.players[1]}` }))].map(m => {
        const b = h('button', { type: 'button', class: 'mapcard' + (m.id === s.mapId ? ' on' : ''), 'aria-pressed': String(m.id === s.mapId) }, h('b', {}, m.name), h('span', {}, m.meta));
        b.addEventListener('click', () => set({ mapId: m.id }));
        return b;
      }));
    const goal = s.mode === 'dm'
      ? seg(SCORE_CHOICES.map(v => ({ v: v as number, label: v ? `${v} élim.` : 'Illimité' })), s.scoreToWin, v => set({ scoreToWin: v }))
      : s.mode === 'ctf'
        ? seg(CAPTURE_CHOICES.map(v => ({ v: v as number, label: v ? `${v} drapeau${v > 1 ? 'x' : ''}` : 'Illimité' })), s.captures, v => set({ captures: v }))
        : seg(LAP_CHOICES.map(v => ({ v: v as number, label: `${v} tour${v > 1 ? 's' : ''}` })), s.laps, v => set({ laps: v }));
    sheetBody.replaceChildren(
      h('div', { class: 'hint' }, 'Mode de jeu'), seg(GAME_MODES.map(v => ({ v, label: MODE_LABEL[v], disabled: !Object.values(MAP_DEFS).some(d => mapSupports(d, v)) })), s.mode, v => set({ mode: v })),
      h('div', { class: 'hint' }, 'Map'), maps,
      h('div', { class: 'hint' }, 'Objectif'), goal,
      h('div', { class: 'hint' }, 'Temps limite'), seg(TIME_CHOICES.map(v => ({ v: v as number, label: v ? `${v} min` : 'Sans limite', disabled: v === 0 && goalOf(s) === 0 })), s.timeLimitMin, v => set({ timeLimitMin: v })),
      s.mode === 'course' ? h('div', { class: 'hint' }, 'Rayons pendant la course') : '', s.mode === 'course' ? seg([{ v: true, label: 'Oui, ils font chuter' }, { v: false, label: 'Non' }], s.raceWeapons, v => set({ raceWeapons: v })) : '',
      h('div', { class: 'hint' }, 'Capacités à ramasser sur la map'), seg([{ v: true, label: 'Oui' }, { v: false, label: 'Non' }], s.abilities, v => set({ abilities: v })),
      h('div', { class: 'hint' }, 'Bonus au sol'), seg([{ v: true, label: 'Oui' }, { v: false, label: 'Non' }], s.pickups, v => set({ pickups: v })),
      s.scoreToWin === 0 ? h('p', { class: 'hint' }, 'Éliminations illimitées : la partie s’arrête à la fin du temps.') : '');
  }

  renderTabs();
  return {
    root,
    update(list, host, myId, state, settings) {
      players = list; me = myId; hostId = host;
      if (!sentInitial && list.some(p => p.id === me)) {
        sentInitial = true;
        const mine = list.find(p => p.id === me)!;
        const free = PARKA_COLORS.includes(loadout.color as typeof PARKA_COLORS[number]) && !list.some(p => p.id !== me && p.color === loadout.color);
        const want: Loadout = { color: free ? loadout.color : mine.color, hat: loadout.hat };
        if (want.color !== mine.color || want.hat !== mine.hat) on.customize(want);
        try { const f = localStorage.getItem('sdb-face'); if (f) on.face(f); } catch { /* stockage indisponible */ }
      }
      const isHost = me === hostId, enough = list.length >= CONFIG.minPlayersToStart;
      count.textContent = `${list.length} joueur${list.length > 1 ? 's' : ''} sur ${CONFIG.maxPlayers}`;
      const def = settings.mapId === 'auto' ? null : MAP_DEFS[settings.mapId];
      mapName.textContent = def ? def.name : 'Map auto';
      summary.replaceChildren(...[
        MODE_LABEL[settings.mode],
        def ? `${def.players[0]} à ${def.players[1]} joueurs` : 'Selon le nombre de joueurs',
        settings.mode === 'dm' ? (settings.scoreToWin ? `${settings.scoreToWin} éliminations` : 'Éliminations illimitées')
          : settings.mode === 'ctf' ? (settings.captures ? `${settings.captures} drapeau${settings.captures > 1 ? 'x' : ''}` : 'Drapeaux illimités') : `${settings.laps} tour${settings.laps > 1 ? 's' : ''}`,
        settings.timeLimitMin ? `${settings.timeLimitMin} min` : 'Sans limite',
        settings.abilities ? 'Capacités sur la map' : 'Sans capacités',
        settings.pickups ? 'Bonus au sol' : 'Sans bonus'
      ].map(t => h('span', {}, t)));
      settingsBtn.style.display = isHost ? '' : 'none';
      if (!isHost) sheet.classList.remove('open');
      startBtn.style.display = isHost ? '' : 'none';
      startBtn.disabled = !enough;
      startBtn.textContent = state === 'ended' ? 'Rejouer' : 'Lancer la partie';
      const hostName = list.find(p => p.id === hostId)?.name ?? "l'hôte";
      waitPill.textContent = !enough ? 'Envoie le lien : il faut au moins 2 joueurs' : isHost ? '' : `En attente que ${hostName} lance la partie`;
      waitPill.style.display = waitPill.textContent ? '' : 'none';
      if (state === 'lobby') endBox.style.display = 'none';
      renderBody();
      if (isHost) renderSettings(settings);
      // étiquettes
      for (const [id, el] of tagEls) if (!list.some(p => p.id === id)) { el.remove(); tagEls.delete(id); }
      for (const p of list) {
        let el = tagEls.get(p.id);
        if (!el) { el = h('div', { class: 'tag3d' }); tagLayer.append(el); tagEls.set(p.id, el); }
        el.className = 'tag3d' + (p.id === me ? ' me' : '');
        el.style.setProperty('--c', hex(p.color));
        el.replaceChildren(...[p.id === hostId ? h('span', { class: 'crown' }, 'Hôte') : null, h('b', {}, p.id === me ? 'Toi' : p.name), h('span', {}, HAT_LABEL[p.hat])].filter((x): x is HTMLElement => !!x));
      }
    },
    showEnd(rows, winner, myId, isHost, winnerTeam, teamScores) {
      const w = rows.find(r => r.id === winner);
      const myTeam = rows.find(r => r.id === myId)?.team ?? -1;
      const title = winnerTeam !== undefined
        ? (winnerTeam < 0 ? `Égalité ${teamScores?.[0] ?? 0} à ${teamScores?.[1] ?? 0}` : `${winnerTeam === myTeam ? 'Victoire' : 'Défaite'} : les ${TEAM_NAMES[winnerTeam]} gagnent ${teamScores?.[winnerTeam] ?? 0} à ${teamScores?.[1 - winnerTeam] ?? 0}`)
        : w ? (w.id === myId ? 'Victoire !' : `Victoire de ${w.name}`) : 'Fin de la partie';
      endBox.style.display = '';
      endBox.replaceChildren(
        h('h2', {}, title),
        scoreTable(rows, myId),
        h('p', { class: 'hint' }, isHost ? 'Relance quand tout le monde est prêt.' : "L'hôte peut relancer une partie."));
    },
    error(msg) { status.textContent = msg; setTimeout(() => { if (status.textContent === msg) status.textContent = ''; }, 4000); },
    tags(list) {
      for (const t of list) {
        const el = tagEls.get(t.id);
        if (!el) continue;
        el.style.display = t.visible ? '' : 'none';
        el.style.left = t.x.toFixed(1) + 'px'; el.style.top = t.y.toFixed(1) + 'px';
      }
    }
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
