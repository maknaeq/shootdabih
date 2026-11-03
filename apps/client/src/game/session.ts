import * as THREE from 'three';
import {
  CONFIG, DEFAULT_SETTINGS, STREAKS, TEAM_COLORS, TEAM_NAMES, surfaceAt, type FlagState, type RaceLine, forwardFromAngles, getMap, groundAt, traceShot, unpackPlayer,
  type Ability, type Input, type LobbyPlayer, type MapData, type NetPlayer, type RoomSettings, type RoomState, type ScoreLine, type ServerMsg
} from '@sdb/shared';
import { Pickups, PICKUP_STYLE } from '../render/pickups';
import { Flags } from '../render/flags';
import { ABILITY_LABEL } from '../ui/lobby';
import { Connection } from '../net/connection';
import { Renderer, loadSettings, saveSettings } from '../render/renderer';
import { buildWorld } from '../render/world';
import { Avatar } from '../render/avatar';
import { Viewmodel } from '../render/viewmodel';
import { Effects } from '../render/effects';
import { InputState } from './input';
import { Predictor } from './predict';
import { Interpolator } from './interp';
import { Hud } from '../ui/hud';
import { lobbyView, type LobbyView } from '../ui/lobby';
import { h } from '../ui/dom';

const STEP = 1 / CONFIG.tickRate;

/** Une partie dans un salon : relie le réseau, les entrées, la prédiction et le rendu. */
export class Session {
  private conn: Connection;
  private canvas = h('canvas', { class: 'view' });
  private renderer: Renderer;
  private input: InputState;
  private hud: Hud;
  private lobby: LobbyView;
  private banner: HTMLElement | null = null;
  private map: MapData | null = null;
  private world: ReturnType<typeof buildWorld> | null = null;
  private predictor: Predictor | null = null;
  private viewmodel: Viewmodel | null = null;
  private effects: Effects;
  private interp = new Interpolator();
  private avatars = new Map<string, Avatar>();
  private players: LobbyPlayer[] = [];
  private scoresList: ScoreLine[] = [];
  private me = '';
  private hostId = '';
  private state: RoomState = 'lobby';
  private alive = false;
  private seq = 0;
  private outbox: Input[] = [];
  private acc = 0;
  private last = performance.now();
  private clockOffset = 0;
  private endsAt = 0;
  private lastFireAt = -1e9;
  private lastSend = 0;
  private raf = 0;
  private pingTimer = 0;
  private settings = loadSettings();
  private tmp = new THREE.Vector3();
  private disposed = false;
  private roomSettings: RoomSettings = { ...DEFAULT_SETTINGS };
  private pickups: Pickups | null = null;
  private myNet: NetPlayer | null = null;
  private looks = new Map<string, string>();
  private meAvatar: Avatar | null = null;
  private faces = new Map<string, string>();
  private flags: Flags | null = null;
  private flagState: FlagState[] = [];
  private teamScore: [number, number] = [0, 0];
  private carriers = new Set<string>();
  private race: { startAt: number; laps: number; list: RaceLine[] } | null = null;
  private lookOff = 0;
  private lastInputYaw = 0;
  private gates: Array<{ group: THREE.Group; mat: THREE.MeshBasicMaterial }> = [];
  private gateGroup: THREE.Group | null = null;

  constructor(private root: HTMLElement, private code: string, name: string, private leave: () => void) {
    root.append(this.canvas);
    this.renderer = new Renderer(this.canvas, this.settings);
    this.effects = new Effects(this.renderer.scene);
    this.input = new InputState(this.canvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.hud = new Hud(this.settingsPanel());
    this.lobby = lobbyView(code, {
      start: () => this.conn.send({ t: 'start' }),
      leave: () => this.quit(),
      customize: l => this.conn.send({ t: 'customize', color: l.color, hat: l.hat }),
      settings: s => this.conn.send({ t: 'settings', settings: s }),
      face: d => this.conn.send({ t: 'face', data: d })
    });
    root.append(this.hud.root, this.hud.board, this.hud.prompt, this.lobby.root);
    this.hud.root.style.display = 'none';
    this.input.onTab = down => { if (this.state === 'playing') this.hud.showBoard(down); };
    this.input.onLockChange = locked => this.hud.showPrompt(this.state === 'playing' && !locked);
    this.conn = new Connection(code, name);
    this.conn.onMessage = m => this.onMessage(m);
    this.conn.onClose = unexpected => { if (unexpected && !this.disposed) this.lost(); };
    this.pingTimer = window.setInterval(() => this.conn.send({ t: 'ping', c: performance.now() }), 2000);
    this.raf = requestAnimationFrame(t => this.frame(t));
  }

  private serverNow() { return performance.now() + this.clockOffset; }

  private settingsPanel(): HTMLElement {
    const s = this.settings;
    const range = (label: string, min: number, max: number, step: number, value: number, set: (v: number) => void, fmt: (v: number) => string) => {
      const out = h('span', { style: 'color:var(--muted);min-width:44px;text-align:right' }, fmt(value));
      const r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      r.addEventListener('input', () => { const v = Number(r.value); out.textContent = fmt(v); set(v); this.applySettings(); });
      return h('label', { class: 'setting' }, h('span', { class: 'grow' }, label), r, out);
    };
    const shadows = h('input', { type: 'checkbox', 'aria-label': 'Ombres' });
    shadows.checked = s.shadows;
    shadows.addEventListener('change', () => { s.shadows = shadows.checked; this.applySettings(); });
    const btn = h('button', { class: 'btn', type: 'button', onclick: () => this.input.lock() }, 'Reprendre');
    return h('div', { class: 'paused-actions' },
      range('Sensibilité de la souris', 0.2, 3, 0.05, s.sensitivity, v => { s.sensitivity = v; }, v => v.toFixed(2).replace('.', ',')),
      range('Champ de vision', 70, 110, 1, s.fov, v => { s.fov = v; }, v => v + '°'),
      range('Résolution', 0.5, 1, 0.05, s.resolution, v => { s.resolution = v; }, v => Math.round(v * 100) + ' %'),
      h('label', { class: 'setting' }, h('span', { class: 'grow' }, 'Ombres (à couper sur un vieux PC)'), shadows),
      btn,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => this.quit() }, 'Quitter le salon'));
  }

  private applySettings() { this.input.sensitivity = this.settings.sensitivity; this.renderer.apply(this.settings); saveSettings(this.settings); }

  private loadMap(id: string) {
    if (this.map && this.map.def.id === id) return;
    if (this.world) this.renderer.scene.remove(this.world.group);
    if (this.pickups) this.renderer.scene.remove(this.pickups.group);
    this.map = getMap(id);
    this.renderer.setMap(this.map);
    this.world = buildWorld(this.map);
    this.renderer.scene.add(this.world.group);
    this.pickups = new Pickups(this.map);
    this.renderer.scene.add(this.pickups.group);
    if (this.flags) { this.renderer.scene.remove(this.flags.group); this.flags = null; }
    if (this.gateGroup) { this.renderer.scene.remove(this.gateGroup); this.gateGroup = null; this.gates = []; }
    if (this.map.def.race) {
      const m = this.map, g = new THREE.Group();
      m.def.race!.checkpoints.forEach((c, i) => {
        if (i === 0) return;
        const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, top = surfaceAt(m, cx, cz, 50), y = Number.isFinite(top) ? top : 0;
        const across = (c.x1 - c.x0) > (c.z1 - c.z0) ? 'x' : 'z', span = across === 'x' ? c.x1 - c.x0 : c.z1 - c.z0;
        const mat = new THREE.MeshBasicMaterial({ color: 0xe8843e, transparent: true, opacity: 0.85, fog: false });
        const gate = new THREE.Group();
        for (const sgn of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), mat); post.position.set(across === 'x' ? sgn * span / 2 : 0, 2, across === 'z' ? sgn * span / 2 : 0); gate.add(post); }
        const banner = new THREE.Mesh(new THREE.BoxGeometry(across === 'x' ? span : 0.2, 0.5, across === 'z' ? span : 0.2), mat); banner.position.y = 4; gate.add(banner);
        gate.position.set(cx, y, cz); g.add(gate); this.gates[i] = { group: gate, mat };
      });
      this.renderer.scene.add(g); this.gateGroup = g;
    }
    if (this.map.def.ctf) {
      const m = this.map;
      this.flags = new Flags(m.def.ctf!.bases.map(b => { const top = surfaceAt(m, b.x, b.z, 1e6); return { x: b.x, y: Number.isFinite(top) ? top : 0, z: b.z }; }));
      this.flags.group.visible = false;
      this.renderer.scene.add(this.flags.group);
    }
    if (this.predictor) this.predictor.setMap(this.map); else this.predictor = new Predictor(this.map);
  }

  private myAbility(): Ability { return 'aucune'; }

  private colorOf(id: string) { return this.players.find(p => p.id === id)?.color ?? 0xf3efe6; }
  private nameOf(id: string) { return this.players.find(p => p.id === id)?.name ?? '?'; }

  private onMessage(m: ServerMsg) {
    switch (m.t) {
      case 'welcome':
        this.me = m.you; this.hostId = m.hostId; this.clockOffset = m.serverTime - performance.now();
        this.loadMap(m.mapId);
        break;
      case 'lobby': {
        this.players = m.players; this.hostId = m.hostId;
        for (const [id, a] of this.avatars) if (!m.players.some(p => p.id === id)) { this.renderer.scene.remove(a.root); a.dispose(); this.avatars.delete(id); this.interp.remove(id); }
        this.roomSettings = m.settings;
        const prevState = this.state;
        this.state = m.state;
        for (const p of m.players) {
          if (p.id === this.me) continue;
          let a = this.avatars.get(p.id);
          if (!a) { a = new Avatar(p.color, p.name, p.hat); a.root.visible = false; this.avatars.set(p.id, a); this.renderer.scene.add(a.root); const f = this.faces.get(p.id); if (f) a.setFace(f); }
          const shown = this.isCtf() && p.team >= 0 ? TEAM_COLORS[p.team] : p.color;
          const look = shown + ':' + p.hat;
          if (this.looks.get(p.id) !== look) { a.setColor(shown); a.setHat(p.hat); this.looks.set(p.id, look); }
        }
        const mine = m.players.find(p => p.id === this.me);
        if (mine) {
          if (!this.meAvatar) { this.meAvatar = new Avatar(mine.color, 'Toi', mine.hat); this.renderer.scene.add(this.meAvatar.root); const f = this.faces.get(this.me); if (f) this.meAvatar.setFace(f); }
          this.meAvatar.setColor(mine.color); this.meAvatar.setHat(mine.hat);
          const shownMine = this.isCtf() && mine.team >= 0 ? TEAM_COLORS[mine.team] : mine.color;
          const look = String(shownMine);
          if (this.looks.get(this.me) !== look) { this.viewmodel?.group.removeFromParent(); this.viewmodel = new Viewmodel(this.renderer.camera, shownMine); this.looks.set(this.me, look); }
        }
        const prev = prevState;
        this.lobby.update(m.players, m.hostId, this.me, m.state, m.settings);
        if (m.state !== 'playing') this.showLobby();
        if (m.state === 'playing') this.refreshTeams();
        void prev;
        break;
      }
      case 'start':
        this.state = 'playing'; this.endsAt = m.endsAt; this.roomSettings = m.settings;
        this.loadMap(m.mapId);
        this.hud.setGoal(m.settings.mode === 'ctf' ? 0 : m.settings.scoreToWin);
        this.teamScore = [0, 0]; this.flagState = []; this.carriers.clear(); this.race = null;
        if (this.flags) this.flags.group.visible = m.settings.mode === 'ctf';
        this.refreshTeams();
        this.lobby.root.style.display = 'none'; this.hud.root.style.display = '';
        this.hud.setDead(null);
        if (!this.input.locked) this.hud.showPrompt(true);
        break;
      case 'snapshot': {
        const others = m.o.map(unpackPlayer);
        this.interp.push(m.time, others);
        const mine = m.me;
        if (mine) this.myNet = mine;
        if (mine && this.predictor) {
          if (mine.alive && this.alive) this.predictor.reconcile(mine, m.ack);
        }
        for (const p of others) this.avatars.get(p.id)?.setShield(p.shield);
        break;
      }
      case 'respawn':
        if (m.id === this.me) {
          this.alive = true;
          this.predictor?.teleport({ x: m.x, y: m.y, z: m.z }, m.yaw, this.myAbility(), this.isCourse() ? 'bike' : 'foot');
          this.lookOff = 0;
          this.input.yaw = m.yaw; this.input.pitch = 0;
          this.hud.setDead(null);
        } else this.interp.reset(m.id);
        break;
      case 'shot':
        if (m.by !== this.me) this.effects.beam(new THREE.Vector3(...m.from), new THREE.Vector3(...m.to), performance.now() / 1000);
        break;
      case 'kill': {
        const now = performance.now() / 1000;
        this.hud.kill(this.nameOf(m.killer), this.nameOf(m.victim), m.killer === this.me, now);
        const at = m.victim === this.me && this.predictor ? this.predictor.state.pos : this.interp.sample(m.victim, this.serverNow() - CONFIG.interpDelayMs);
        if (at) this.effects.burst(new THREE.Vector3(at.x, at.y + 1.1, at.z), this.colorOf(m.victim), now);
        if (m.victim === this.me) { this.alive = false; this.hud.setDead(this.nameOf(m.killer)); }
        const a = this.avatars.get(m.victim); if (a) a.root.visible = false;
        break;
      }
      case 'scores': this.scoresList = m.list; this.hud.scores(m.list, this.me); break;
      case 'matchEnd':
        this.state = 'ended'; this.alive = false;
        this.input.unlock(); this.hud.showBoard(false); this.hud.showPrompt(false);
        this.lobby.showEnd(m.list, m.winner, this.me, this.me === this.hostId, m.winnerTeam, m.teamScores);
        this.hud.teams(false);
        this.showLobby();
        break;
      case 'pong': {
        const now = performance.now(), rtt = now - m.c, est = m.serverTime + rtt / 2 - now;
        this.clockOffset += (est - this.clockOffset) * 0.3;
        break;
      }
      case 'pickups': this.pickups?.set(m.list); break;
      case 'flags':
        this.flagState = m.flags; this.teamScore = m.score;
        this.carriers = new Set(m.flags.map(f => f.carrier).filter((x): x is string => !!x));
        this.flags?.set(m.flags); this.refreshTeams();
        break;
      case 'flagEvent':
        if (m.team === -1) { const pl = this.players.find(p => p.id === m.by); this.hud.announce(m.by === this.me ? 'Arrivée !' : `${pl?.name ?? '?'} passe la ligne`, '', performance.now() / 1000); break; }
        this.onFlagEvent(m.kind, m.team, m.by); break;
      case 'race': this.race = { startAt: m.startAt, laps: m.laps, list: m.list }; break;
      case 'pickup':
        if (m.by === this.me) this.hud.announce(PICKUP_STYLE[m.kind].label, PICKUP_STYLE[m.kind].ability ? 'Capacité : touche E, pendant 30 s' : 'Bonus ramassé', performance.now() / 1000);
        else this.hud.note(`${this.nameOf(m.by)} prend ${PICKUP_STYLE[m.kind].label}`);
        break;
      case 'streak':
        if (m.id === this.me) this.hud.announce(STREAKS[m.n] ?? 'Série', `${m.n} éliminations sans mourir`, performance.now() / 1000);
        else this.hud.note(`${this.nameOf(m.id)} : ${STREAKS[m.n] ?? 'série'}`);
        break;
      case 'shutdown':
        if (m.killer === this.me) this.hud.announce('Fin de série', `Tu arrêtes ${this.nameOf(m.victim)} à ${m.n}`, performance.now() / 1000);
        else this.hud.note(`${this.nameOf(m.killer)} arrête la série de ${this.nameOf(m.victim)}`);
        break;
      case 'shieldHit':
        if (m.id === this.me) this.hud.announce('Bouclier', 'Il vient de te sauver', performance.now() / 1000);
        else if (m.by === this.me) this.hud.note(`Bouclier de ${this.nameOf(m.id)}`);
        break;
      case 'face':
        this.faces.set(m.id, m.data);
        if (m.id === this.me) this.meAvatar?.setFace(m.data); else this.avatars.get(m.id)?.setFace(m.data);
        break;
      case 'error': this.lobby.error(m.message); break;
    }
  }

  private showLobby() { this.hud.root.style.display = 'none'; this.lobby.root.style.display = ''; }

  private lost() {
    if (this.banner) return;
    this.banner = h('div', { class: 'banner', role: 'alert' }, 'Connexion au serveur perdue.',
      h('button', { class: 'btn ghost', type: 'button', onclick: () => location.reload() }, 'Se reconnecter'));
    this.root.append(this.banner);
  }

  private quit() { this.dispose(); this.leave(); }

  private isCourse() { return this.roomSettings.mode === 'course' && this.state !== 'lobby'; }

  /** Direction du tir et de la caméra : à pied le regard, à moto le cap de la moto plus le coup d'œil à la souris. */
  private aim(): { yaw: number; pitch: number } {
    if (this.isCourse() && this.predictor) return { yaw: this.predictor.state.yaw + this.lookOff, pitch: Math.max(-0.6, Math.min(0.5, this.input.pitch)) };
    return { yaw: this.input.yaw, pitch: this.input.pitch };
  }

  private makeInput(): Input {
    const countdown = this.isCourse() && (!this.race || this.serverNow() < this.race.startAt);
    const active = this.input.locked && this.alive && !countdown;
    return {
      seq: ++this.seq, dt: STEP,
      fwd: active && this.input.fwd, back: active && this.input.back, left: active && this.input.left, right: active && this.input.right,
      jump: active && this.input.jump, dash: active && this.input.takeDash(), ability: active && this.input.takeAbility(),
      yaw: this.input.yaw, pitch: this.input.pitch
    };
  }

  private fire(now: number) {
    if (!this.predictor || !this.map || !this.viewmodel) return;
    if (now - this.lastFireAt < this.fireCooldown()) return;
    this.lastFireAt = now;
    const renderTime = this.serverNow() - CONFIG.interpDelayMs;
    const aim = this.aim();
    this.conn.send({ t: 'fire', seq: this.seq, yaw: aim.yaw, pitch: aim.pitch, renderTime });
    // effet immédiat : le serveur confirmera l'élimination
    const s = this.predictor.state;
    const eye = { x: s.pos.x, y: s.pos.y + CONFIG.eyeHeight, z: s.pos.z };
    const targets = this.players.filter(p => p.id !== this.me).map(p => ({ id: p.id, p: this.interp.sample(p.id, renderTime) }))
      .filter(t => t.p && t.p.alive).map(t => ({ id: t.id, pos: { x: t.p!.x, y: t.p!.y, z: t.p!.z } }));
    const r = traceShot(this.map, eye, forwardFromAngles(aim.yaw, aim.pitch), targets);
    this.viewmodel.kick();
    this.renderer.camera.updateMatrixWorld(true);
    const from = this.isCourse() ? new THREE.Vector3(eye.x, eye.y - 0.3, eye.z) : this.viewmodel.tipWorld(this.tmp).clone();
    this.effects.beam(from, new THREE.Vector3(r.end.x, r.end.y, r.end.z), now);
  }

  private isCtf() { return this.roomSettings.mode === 'ctf' && this.state !== 'lobby'; }
  private myTeam() { return this.players.find(p => p.id === this.me)?.team ?? -1; }

  private refreshTeams() {
    if (!this.isCtf()) { this.hud.teams(false); return; }
    const status = [0, 1].map(t => {
      const f = this.flagState.find(x => x.team === t);
      if (!f) return '';
      if (f.carrier) return f.carrier === this.me ? 'porté par toi' : `porté par ${this.nameOf(f.carrier)}`;
      return f.atHome ? 'à la base' : 'au sol';
    }) as [string, string];
    this.hud.teams(true, this.teamScore, status, this.myTeam(), this.roomSettings.captures);
    this.hud.carrying(this.carriers.has(this.me));
  }

  private onFlagEvent(kind: 'take' | 'drop' | 'return' | 'capture', team: number, by: string | null) {
    const now = performance.now() / 1000, mine = this.myTeam(), who = by ? (by === this.me ? 'Tu' : this.nameOf(by)) : '';
    const flag = team === mine ? 'ton drapeau' : `le drapeau des ${TEAM_NAMES[team]}`;
    if (kind === 'take') {
      if (by === this.me) this.hud.announce('Drapeau pris !', 'Ramène-le à ta base', now);
      else if (team === mine) this.hud.announce('Drapeau volé', `${who} a pris ton drapeau`, now);
      else this.hud.note(`${who} prend ${flag}`);
    } else if (kind === 'drop') this.hud.note(`${who === 'Tu' ? 'Tu lâches' : who + ' lâche'} ${flag}`);
    else if (kind === 'return') this.hud.note(by ? `${who === 'Tu' ? 'Tu ramènes' : who + ' ramène'} ${flag} à la base` : `${flag[0].toUpperCase() + flag.slice(1)} revient à la base`);
    else if (kind === 'capture') {
      const scorer = by ? this.players.find(p => p.id === by)?.team ?? -1 : -1;
      this.hud.announce(scorer === mine ? 'Point pour ton équipe !' : `Les ${TEAM_NAMES[scorer] ?? ''} marquent`, by ? `${who === 'Tu' ? 'Tu as' : who + ' a'} ramené le drapeau` : '', now);
    }
  }

  private hudRace(s: { pos: { x: number; z: number }; yaw: number; speed: number }) {
    const race = this.race, def = this.map?.def.race;
    if (!race || !def) { this.hud.race({ rank: 0, total: this.players.length, lap: 0, laps: this.roomSettings.laps, speed: 0, countdown: 3, arrow: 0, done: false, time: null }); return; }
    const mine = race.list.find(l => l.id === this.me);
    const next = def.checkpoints[mine?.nextCp ?? 1];
    const cx = (next.x0 + next.x1) / 2, cz = (next.z0 + next.z1) / 2;
    const want = Math.atan2(-(cx - s.pos.x), -(cz - s.pos.z));
    let arrow = want - (s.yaw + this.lookOff); arrow = Math.atan2(Math.sin(arrow), Math.cos(arrow));
    this.gates.forEach((g, i) => { if (g) { const on = i === (mine?.nextCp ?? 1); g.mat.color.set(on ? 0xf3efe6 : 0xe8843e); g.mat.opacity = on ? 1 : 0.55; } });
    this.hud.race({
      rank: mine?.rank ?? 0, total: race.list.length, lap: Math.min(race.laps, (mine?.lap ?? 0) + 1), laps: race.laps,
      speed: Math.abs(s.speed) * 3.6, countdown: (race.startAt - this.serverNow()) / 1000, arrow, done: !!mine?.done, time: mine?.time ?? null
    });
  }

  private fireCooldown() {
    const over = this.myNet && this.myNet.overchargeUntil > this.serverNow();
    return CONFIG.fireCooldown * (over ? CONFIG.overchargeFactor : 1);
  }

  private hudBuffs() {
    const n = this.myNet, sn = this.serverNow();
    const list: Array<[string, number, string]> = [];
    if (n && n.alive) {
      if (n.overchargeUntil > sn) list.push([PICKUP_STYLE.overcharge.label, (n.overchargeUntil - sn) / 1000, '#f3c84a']);
      if (n.pierceUntil > sn) list.push([PICKUP_STYLE.pierce.label, (n.pierceUntil - sn) / 1000, '#7fd6ff']);
      if (n.shield) list.push(['Protégé', 0, '#f3efe6']);
    }
    this.hud.buffs(list, !!(n && n.alive && n.shield));
  }

  /** Salle d'attente : tous les persos debout en rang dans la map, la caméra qui oscille doucement devant eux. */
  private lobbyScene(dt: number, now: number) {
    const L = this.map!.def.lobby, cam = this.renderer.camera;
    const ids = this.players.map(p => p.id);
    const n = ids.length, gap = 1.45, a = L.angle;
    const rx = Math.cos(a), rz = -Math.sin(a);
    ids.forEach((id, i) => {
      const av = id === this.me ? this.meAvatar : this.avatars.get(id);
      if (!av) return;
      const off = (i - (n - 1) / 2) * gap, back = Math.abs(i - (n - 1) / 2) * 0.35;
      av.root.visible = true;
      av.root.position.set(L.x + rx * off - Math.sin(a) * back, 0, L.z + rz * off - Math.cos(a) * back);
      av.root.position.y = this.lobbyGround(av.root.position.x, av.root.position.z);
      av.update(dt, 0, a - Math.PI, 0);
    });
    const sw = Math.sin(now * 0.25) * 0.25, R = 10 + Math.max(0, n - 4) * 0.9;
    cam.position.set(L.x + Math.sin(a + sw) * R, 4.4 + Math.max(0, n - 4) * 0.25, L.z + Math.cos(a + sw) * R);
    cam.lookAt(L.x, 1.5, L.z);
    if (Math.abs(cam.fov - this.renderer.baseFov * 0.8) > 0.1) { cam.fov = this.renderer.baseFov * 0.8; cam.updateProjectionMatrix(); }
    this.viewmodel?.setVisible(false);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, v = new THREE.Vector3();
    this.lobby.tags(ids.map(id => {
      const av = id === this.me ? this.meAvatar : this.avatars.get(id);
      if (!av) return { id, x: 0, y: 0, visible: false };
      v.set(av.root.position.x, av.root.position.y + 2.45, av.root.position.z).project(cam);
      return { id, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, visible: v.z < 1 };
    }));
  }

  private lobbyGround(x: number, z: number) {
    if (!this.map) return 0;
    const g = groundAt(this.map, x, z, 0.5);
    return Number.isFinite(g) ? g : 0;
  }

  private frame(t: number) {
    if (this.disposed) return;
    const dt = Math.min(0.1, (t - this.last) / 1000); this.last = t;
    const now = t / 1000;
    const playing = this.state === 'playing' && this.predictor;
    if (playing && this.predictor) {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        if (this.alive) { const i = this.makeInput(); this.predictor.apply(i); this.outbox.push(i); }
      }
      if (this.outbox.length >= 2 || (this.outbox.length && now - this.lastSend > 0.05)) { this.conn.send({ t: 'input', inputs: this.outbox.splice(0, 30) }); this.lastSend = now; }
      if (this.input.takeFire() && this.alive && this.input.locked) this.fire(now);
      const pos = this.predictor.renderPos(dt);
      const cam = this.renderer.camera;
      const s = this.predictor.state;
      if (this.isCourse()) {
        // coup d'œil à la souris autour du cap, qui revient doucement dans l'axe
        this.lookOff = Math.max(-1.1, Math.min(1.1, this.lookOff + (this.input.yaw - this.lastInputYaw)));
        this.lookOff *= Math.exp(-dt * 1.2);
        const camYaw = s.yaw + this.lookOff, fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
        cam.position.set(pos.x - fx * 6.2, pos.y + 2.7, pos.z - fz * 6.2);
        cam.lookAt(pos.x + fx * 5, pos.y + 1.3 + Math.sin(this.aim().pitch) * 4, pos.z + fz * 5);
        if (this.meAvatar) { this.meAvatar.setVehicle(true); this.meAvatar.root.visible = this.alive; this.meAvatar.root.position.set(pos.x, pos.y, pos.z); this.meAvatar.update(dt, s.speed, s.yaw, 0); }
      } else {
        cam.position.set(pos.x, pos.y + CONFIG.eyeHeight, pos.z);
        cam.rotation.set(this.input.pitch, this.input.yaw, 0);
        this.meAvatar?.setVehicle(false);
      }
      this.lastInputYaw = this.input.yaw;
      const dashBoost = s.time < s.dashUntil + 0.3 || s.time < s.padUntil ? 12 : 0;
      const targetFov = this.renderer.baseFov + dashBoost;
      if (Math.abs(cam.fov - targetFov) > 0.05) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix(); }
      this.viewmodel?.setVisible(this.alive && !this.isCourse());
      this.viewmodel?.update(dt, now, Math.min(1, (now - this.lastFireAt) / this.fireCooldown()), Math.min(1, Math.hypot(s.vel.x, s.vel.z) / CONFIG.runSpeed));
      const rt = this.serverNow() - CONFIG.interpDelayMs;
      for (const [id, a] of this.avatars) {
        const p = this.interp.sample(id, rt);
        a.root.visible = !!p && p.alive;
        a.setVehicle(this.isCourse());
        if (p) { a.root.position.set(p.x, p.y, p.z); a.update(dt, p.speed, p.yaw, p.pitch); }
      }
      this.hud.update(now, Math.min(1, (now - this.lastFireAt) / this.fireCooldown()), Math.max(0, s.dashReadyAt - s.time), this.endsAt ? (this.endsAt - this.serverNow()) / 1000 : Infinity);
      this.hudBuffs();
      if (this.isCourse()) this.hudRace(s); else this.hud.race(null);
      const ab = s.ability, left = this.myNet ? (this.myNet.abilityUntil - this.serverNow()) / 1000 : 0;
      this.hud.ability(ab === 'aucune' ? '' : ABILITY_LABEL[ab].name, ab === 'saut' ? 0 : Math.max(0, s.abilityReadyAt - s.time), left, ab === 'saut');
    } else if (this.map) {
      this.lobbyScene(dt, now);
    }
    if (this.meAvatar && !(playing && this.isCourse())) { this.meAvatar.root.visible = !playing && !!this.map; if (!playing) this.meAvatar.setVehicle(false); }
    this.world?.update(now);
    this.pickups?.update(now);
    if (this.flags && this.flags.group.visible) {
      const tmp = new THREE.Vector3();
      this.flags.update(now, id => {
        if (id === this.me && this.predictor) { const p = this.predictor.state.pos; return tmp.set(p.x, p.y, p.z); }
        const a = this.avatars.get(id);
        return a ? tmp.copy(a.root.position) : null;
      });
    }
    this.effects.update(now);
    this.renderer.render();
    this.raf = requestAnimationFrame(x => this.frame(x));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf); clearInterval(this.pingTimer);
    this.conn.close(); this.input.dispose(); this.renderer.dispose();
    this.root.replaceChildren();
  }
}
