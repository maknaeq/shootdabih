import { CONFIG, type ScoreLine } from '@sdb/shared';
import { h } from './dom';
import { scoreTable } from './lobby';

export class Hud {
  readonly root: HTMLElement;
  private feed = h('ol', { class: 'feed' });
  private score = h('b', {}, '00');
  private timer = h('div', { class: 'timer' });
  private hit = h('div', { class: 'hit' });
  private pop = h('div', { class: 'pop' }, 'Élimination');
  private cd = h('div', { class: 'cd' }, h('span', {}));
  private dash = h('em', { style: 'font-style:normal' }, 'Dash prêt');
  private dead = h('div', { class: 'dead' });
  private hitAt = -9;
  private lastDash = '';
  readonly board: HTMLElement;
  private boardBody = h('div', {});
  readonly prompt: HTMLElement;

  constructor(settings: HTMLElement) {
    this.root = h('div', { class: 'hud' },
      this.feed, h('div', { class: 'score' }, this.score, h('small', {}, `sur ${CONFIG.scoreToWin}`)), this.timer,
      h('div', { class: 'cross' }), this.hit, this.pop,
      h('div', { class: 'bottom' }, this.cd, h('div', { class: 'lbl' }, h('span', {}, 'Rayon'), this.dash)),
      this.dead);
    this.board = h('div', { class: 'overlay', style: 'display:none' }, h('div', { class: 'board' }, h('h2', {}, 'Scores'), this.boardBody));
    this.prompt = h('div', { class: 'overlay', style: 'display:none' }, h('div', { class: 'board' },
      h('h2', {}, 'Clique pour jouer'),
      h('p', { class: 'hint', style: 'margin:0' }, 'ZQSD ou WASD pour bouger, souris pour viser, clic pour tirer, Espace pour sauter, Maj ou clic droit pour le dash, Tab pour les scores, Échap pour revenir ici.'),
      settings));
  }

  kill(killer: string, victim: string, mine: boolean, now: number) {
    const li = h('li', {}, h('span', { class: mine ? 'me' : '' }, killer), h('i', {}), h('span', {}, victim));
    this.feed.prepend(li);
    while (this.feed.children.length > 4) this.feed.lastElementChild?.remove();
    setTimeout(() => li.remove(), 6000);
    if (mine) this.hitAt = now;
  }

  setDead(by: string | null) {
    this.root.classList.toggle('is-dead', by !== null);
    if (by !== null) this.dead.replaceChildren(document.createTextNode(`Éliminé par ${by}`), h('small', {}, 'Réapparition…'));
  }

  scores(list: ScoreLine[], me: string) {
    const mine = list.find(l => l.id === me);
    this.score.textContent = String(mine?.kills ?? 0).padStart(2, '0');
    this.boardBody.replaceChildren(scoreTable(list, me));
  }

  showBoard(v: boolean) { this.board.style.display = v ? 'grid' : 'none'; }
  showPrompt(v: boolean) { this.prompt.style.display = v ? 'grid' : 'none'; }

  update(now: number, charge: number, dashLeft: number, secondsLeft: number) {
    const span = this.cd.firstElementChild as HTMLElement;
    span.style.transform = `scaleX(${charge.toFixed(3)})`;
    this.cd.classList.toggle('ready', charge >= 1);
    const d = dashLeft > 0.05 ? `Dash ${dashLeft.toFixed(1).replace('.', ',')} s` : 'Dash prêt';
    if (d !== this.lastDash) { this.dash.textContent = d; this.lastDash = d; }
    const k = (now - this.hitAt) / 0.45;
    this.hit.style.opacity = k >= 0 && k < 1 ? (1 - k).toFixed(2) : '0';
    const p = (now - this.hitAt) / 0.9;
    if (p >= 0 && p < 1) { this.pop.style.opacity = (p < 0.7 ? 1 : (1 - p) / 0.3).toFixed(2); this.pop.style.transform = `translate(-50%, ${(-p * 14).toFixed(1)}px)`; }
    else this.pop.style.opacity = '0';
    const s = Math.max(0, Math.ceil(secondsLeft));
    this.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
