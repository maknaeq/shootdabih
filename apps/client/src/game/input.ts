/** Clavier et souris. Les touches sont lues par position (event.code), donc ZQSD en AZERTY = WASD en QWERTY. */
export class InputState {
  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  private keys = new Set<string>();
  private firePressed = false;
  private dashPressed = false;
  private abilityPressed = false;
  private jumpHeld = false;
  private meleePressed = false;
  /** Arme demandée : 0 à 3 pour une touche, ou +1/-1 pour la molette ; null si rien. */
  private weaponReq: { slot?: number; step?: number } | null = null;
  onTab: (down: boolean) => void = () => {};
  onLockChange: (locked: boolean) => void = () => {};
  private abort = new AbortController();

  constructor(private target: HTMLElement) {
    const o = { signal: this.abort.signal };
    window.addEventListener('keydown', e => {
      if (e.code === 'Tab') { e.preventDefault(); this.onTab(true); return; }
      if (!this.locked) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) this.dashPressed = true;
      if (!e.repeat && (e.code === 'KeyE' || e.code === 'KeyF')) this.abilityPressed = true;
      if (!e.repeat && e.code === 'KeyV') this.meleePressed = true;
      const digit = /^Digit([1-4])$/.exec(e.code);
      if (digit && !e.repeat) this.weaponReq = { slot: Number(digit[1]) - 1 };
      this.keys.add(e.code);
    }, o);
    window.addEventListener('keyup', e => { if (e.code === 'Tab') { this.onTab(false); return; } this.keys.delete(e.code); }, o);
    window.addEventListener('blur', () => this.keys.clear(), o);
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      const k = 0.0022 * this.sensitivity;
      this.yaw -= e.movementX * k;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * k));
    }, o);
    target.addEventListener('mousedown', e => {
      if (!this.locked) { this.lock(); return; }
      if (e.button === 0) this.firePressed = true;
      if (e.button === 2) this.dashPressed = true;
    }, o);
    target.addEventListener('contextmenu', e => e.preventDefault(), o);
    target.addEventListener('wheel', e => { if (this.locked && Math.abs(e.deltaY) > 0) this.weaponReq = { step: e.deltaY > 0 ? 1 : -1 }; }, { ...o, passive: true });
    document.addEventListener('pointerlockchange', () => { if (!this.locked) this.keys.clear(); this.onLockChange(this.locked); }, o);
  }

  /** Pour les tests automatisés : se comporte comme si la souris était capturée. */
  forced = false;
  get locked() { return this.forced || document.pointerLockElement === this.target; }
  lock() {
    try {
      const p = this.target.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => { /* refus du navigateur : on reste hors jeu */ });
    } catch { /* idem */ }
  }
  unlock() { if (this.locked) document.exitPointerLock(); }

  has(...codes: string[]) { return codes.some(c => this.keys.has(c)); }
  get fwd() { return this.has('KeyW', 'ArrowUp'); }
  get back() { return this.has('KeyS', 'ArrowDown'); }
  get left() { return this.has('KeyA', 'ArrowLeft'); }
  get right() { return this.has('KeyD', 'ArrowRight'); }
  get jump() { this.jumpHeld = this.has('Space'); return this.jumpHeld; }
  /** Lu une seule fois : renvoie vrai si le joueur a demandé un tir depuis la dernière lecture. */
  takeFire() { const f = this.firePressed; this.firePressed = false; return f; }
  takeDash() { const d = this.dashPressed; this.dashPressed = false; return d; }
  takeAbility() { const a = this.abilityPressed; this.abilityPressed = false; return a; }
  takeMelee() { const m = this.meleePressed; this.meleePressed = false; return m; }
  takeWeapon() { const w = this.weaponReq; this.weaponReq = null; return w; }

  dispose() { this.abort.abort(); this.unlock(); }
}
