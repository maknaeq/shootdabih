import * as THREE from 'three';
import {
  CONFIG, forwardFromAngles, getMap, traceShot,
  type Input, type LobbyPlayer, type MapData, type RoomState, type ScoreLine, type ServerMsg
} from '@sdb/shared';
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
  private raf = 0;
  private pingTimer = 0;
  private settings = loadSettings();
  private tmp = new THREE.Vector3();
  private disposed = false;

  constructor(private root: HTMLElement, private code: string, name: string, private leave: () => void) {
    root.append(this.canvas);
    this.renderer = new Renderer(this.canvas, this.settings);
    this.effects = new Effects(this.renderer.scene);
    this.input = new InputState(this.canvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.hud = new Hud(this.settingsPanel());
    this.lobby = lobbyView(code, () => this.conn.send({ t: 'start' }), () => this.quit());
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
    if (this.map) return;
    this.map = getMap(id);
    this.renderer.setMap(this.map);
    this.world = buildWorld(this.map);
    this.renderer.scene.add(this.world.group);
    this.predictor = new Predictor(this.map);
  }

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
        for (const p of m.players) if (p.id !== this.me && !this.avatars.has(p.id)) { const a = new Avatar(p.color, p.name); a.root.visible = false; this.avatars.set(p.id, a); this.renderer.scene.add(a.root); }
        if (!this.viewmodel && m.players.some(p => p.id === this.me)) this.viewmodel = new Viewmodel(this.renderer.camera, this.colorOf(this.me));
        const prev = this.state;
        this.state = m.state;
        this.lobby.update(m.players, m.hostId, this.me, m.state);
        if (m.state !== 'playing') this.showLobby();
        if (prev === 'ended' && m.state === 'lobby') this.lobby.update(m.players, m.hostId, this.me, m.state);
        break;
      }
      case 'start':
        this.state = 'playing'; this.endsAt = m.endsAt;
        this.lobby.root.style.display = 'none'; this.hud.root.style.display = '';
        this.hud.setDead(null);
        if (!this.input.locked) this.hud.showPrompt(true);
        break;
      case 'snapshot': {
        this.interp.push(m.time, m.players);
        const mine = m.players.find(p => p.id === this.me);
        if (mine && this.predictor) {
          if (mine.alive && this.alive) this.predictor.reconcile(mine, m.ack);
        }
        break;
      }
      case 'respawn':
        if (m.id === this.me) {
          this.alive = true;
          this.predictor?.teleport({ x: m.x, y: m.y, z: m.z }, m.yaw);
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
        this.lobby.showEnd(m.list, m.winner, this.me, this.me === this.hostId);
        this.showLobby();
        break;
      case 'pong': {
        const now = performance.now(), rtt = now - m.c, est = m.serverTime + rtt / 2 - now;
        this.clockOffset += (est - this.clockOffset) * 0.3;
        break;
      }
      case 'error': this.lobby.error(m.message); break;
    }
  }

  private showLobby() { this.hud.root.style.display = 'none'; this.lobby.root.style.display = ''; for (const a of this.avatars.values()) a.root.visible = false; }

  private lost() {
    if (this.banner) return;
    this.banner = h('div', { class: 'banner', role: 'alert' }, 'Connexion au serveur perdue.',
      h('button', { class: 'btn ghost', type: 'button', onclick: () => location.reload() }, 'Se reconnecter'));
    this.root.append(this.banner);
  }

  private quit() { this.dispose(); this.leave(); }

  private makeInput(): Input {
    const active = this.input.locked && this.alive;
    return {
      seq: ++this.seq, dt: STEP,
      fwd: active && this.input.fwd, back: active && this.input.back, left: active && this.input.left, right: active && this.input.right,
      jump: active && this.input.jump, dash: active && this.input.takeDash(),
      yaw: this.input.yaw, pitch: this.input.pitch
    };
  }

  private fire(now: number) {
    if (!this.predictor || !this.map || !this.viewmodel) return;
    if (now - this.lastFireAt < CONFIG.fireCooldown) return;
    this.lastFireAt = now;
    const renderTime = this.serverNow() - CONFIG.interpDelayMs;
    this.conn.send({ t: 'fire', seq: this.seq, yaw: this.input.yaw, pitch: this.input.pitch, renderTime });
    // effet immédiat : le serveur confirmera l'élimination
    const s = this.predictor.state;
    const eye = { x: s.pos.x, y: s.pos.y + CONFIG.eyeHeight, z: s.pos.z };
    const targets = this.players.filter(p => p.id !== this.me).map(p => ({ id: p.id, p: this.interp.sample(p.id, renderTime) }))
      .filter(t => t.p && t.p.alive).map(t => ({ id: t.id, pos: { x: t.p!.x, y: t.p!.y, z: t.p!.z } }));
    const r = traceShot(this.map, eye, forwardFromAngles(this.input.yaw, this.input.pitch), targets);
    this.viewmodel.kick();
    this.renderer.camera.updateMatrixWorld(true);
    this.effects.beam(this.viewmodel.tipWorld(this.tmp).clone(), new THREE.Vector3(r.end.x, r.end.y, r.end.z), now);
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
      if (this.outbox.length) { this.conn.send({ t: 'input', inputs: this.outbox.splice(0, 30) }); }
      if (this.input.takeFire() && this.alive && this.input.locked) this.fire(now);
      const pos = this.predictor.renderPos(dt);
      const cam = this.renderer.camera;
      cam.position.set(pos.x, pos.y + CONFIG.eyeHeight, pos.z);
      cam.rotation.set(this.input.pitch, this.input.yaw, 0);
      const s = this.predictor.state;
      const dashBoost = s.time < s.dashUntil + 0.3 || s.time < s.padUntil ? 12 : 0;
      const targetFov = this.renderer.baseFov + dashBoost;
      if (Math.abs(cam.fov - targetFov) > 0.05) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix(); }
      this.viewmodel?.setVisible(this.alive);
      this.viewmodel?.update(dt, now, Math.min(1, (now - this.lastFireAt) / CONFIG.fireCooldown), Math.min(1, Math.hypot(s.vel.x, s.vel.z) / CONFIG.runSpeed));
      const rt = this.serverNow() - CONFIG.interpDelayMs;
      for (const [id, a] of this.avatars) {
        const p = this.interp.sample(id, rt);
        a.root.visible = !!p && p.alive;
        if (p) { a.root.position.set(p.x, p.y, p.z); a.update(dt, p.speed, p.yaw); }
      }
      this.hud.update(now, Math.min(1, (now - this.lastFireAt) / CONFIG.fireCooldown), Math.max(0, s.dashReadyAt - s.time), (this.endsAt - this.serverNow()) / 1000);
    } else if (this.map) {
      // vue d'ensemble qui tourne lentement derrière la salle d'attente
      const [W, D] = this.map.def.size, R = Math.max(W, D) * 0.7, a = now * 0.06;
      const cam = this.renderer.camera;
      cam.position.set(W / 2 + Math.cos(a) * R, Math.max(W, D) * 0.45, D / 2 + Math.sin(a) * R);
      cam.lookAt(W / 2, 0, D / 2);
      this.viewmodel?.setVisible(false);
    }
    this.world?.update(now);
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
