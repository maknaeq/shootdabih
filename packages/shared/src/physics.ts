import { CONFIG, type Ability } from './config';
import { ceilingAt, groundAt, hitsWall, segmentBlocked } from './map/collision';
import type { MapData } from './map/types';
import type { Vec3 } from './vec';

export interface PlayerState {
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  /** Temps simulé du joueur, en secondes, avancé par stepPlayer. */
  time: number;
  dashUntil: number;
  dashReadyAt: number;
  padUntil: number;
  jumpHeld: boolean;
  airJumps: number;
  /** Sauts en l'air autorisés : capacité « saut » et bonus triple saut, fixé par le serveur. */
  airJumpsMax: number;
  ability: Ability;
  abilityReadyAt: number;
  abilityUsedAt: number;
  /** À pied ou à moto (mode course). */
  vehicle: 'foot' | 'bike';
  /** Vitesse de la moto le long de son cap (négative en marche arrière). */
  speed: number;
}

export interface Input {
  seq: number;
  dt: number;
  fwd: boolean; back: boolean; left: boolean; right: boolean;
  jump: boolean; dash: boolean; ability: boolean;
  yaw: number; pitch: number;
}

export function makePlayerState(pos: Vec3, yaw = 0, ability: Ability = 'aucune'): PlayerState {
  return {
    pos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, yaw, pitch: 0, onGround: false, time: 0, dashUntil: -1, dashReadyAt: 0, padUntil: -1,
    jumpHeld: false, airJumps: 0, airJumpsMax: ability === 'saut' ? 1 : 0, ability, abilityReadyAt: 0, abilityUsedAt: -1,
    vehicle: 'foot', speed: 0
  };
}

export function cloneState(s: PlayerState): PlayerState {
  return { ...s, pos: { ...s.pos }, vel: { ...s.vel } };
}

type Collide = Pick<MapData, 'boxes' | 'ramps' | 'pads'>;
const SUB = 1 / 120;

/** Avance l'état d'un joueur selon une entrée. Fonction pure : renvoie un nouvel état. */
export function stepPlayer(prev: PlayerState, input: Input, map: Collide): PlayerState {
  if (prev.vehicle === 'bike') return stepBike(prev, input, map);
  const s = cloneState(prev);
  s.yaw = input.yaw;
  s.pitch = Math.max(-1.5, Math.min(1.5, input.pitch));
  if (input.dash && s.time >= s.dashReadyAt) {
    s.vel.x = -Math.sin(s.yaw) * CONFIG.dashSpeed;
    s.vel.z = -Math.cos(s.yaw) * CONFIG.dashSpeed;
    s.dashUntil = s.time + CONFIG.dashTime;
    s.dashReadyAt = s.time + CONFIG.dashCooldown;
  }
  // saut en l'air : sur un nouvel appui, une fois décollé
  if (input.jump && !s.jumpHeld && !s.onGround && s.airJumps > 0) { s.vel.y = CONFIG.airJumpSpeed; s.airJumps--; }
  s.jumpHeld = input.jump;
  if (input.ability && s.time >= s.abilityReadyAt) useAbility(s, map);
  let rest = Math.min(input.dt, 0.1);
  while (rest > 1e-9) {
    const dt = Math.min(rest, SUB);
    subStep(s, input, map, dt);
    rest -= dt;
    s.time += dt;
  }
  return s;
}

function useAbility(s: PlayerState, map: Collide) {
  const eye = { x: s.pos.x, y: s.pos.y + CONFIG.eyeHeight, z: s.pos.z };
  const c = Math.cos(s.pitch);
  const f = { x: -Math.sin(s.yaw) * c, y: Math.sin(s.pitch), z: -Math.cos(s.yaw) * c };
  if (s.ability === 'grappin') {
    const far = { x: eye.x + f.x * CONFIG.grappleRange, y: eye.y + f.y * CONFIG.grappleRange, z: eye.z + f.z * CONFIG.grappleRange };
    const t = segmentBlocked(map, eye, far);
    if (t === null) { s.abilityReadyAt = s.time + 1; return; }
    s.vel = { x: f.x * CONFIG.grappleSpeed, y: f.y * CONFIG.grappleSpeed + 4, z: f.z * CONFIG.grappleSpeed };
    s.padUntil = s.time + CONFIG.grappleLock; s.onGround = false;
    s.abilityReadyAt = s.time + CONFIG.grappleCooldown; s.abilityUsedAt = s.time;
  } else if (s.ability === 'blink') {
    const hx = -Math.sin(s.yaw), hz = -Math.cos(s.yaw);
    for (let d = CONFIG.blinkDistance; d >= 1; d -= 0.5) {
      const x = s.pos.x + hx * d, z = s.pos.z + hz * d;
      if (hitsWall(map, x, z, s.pos.y)) continue;
      if (segmentBlocked(map, eye, { x, y: eye.y, z }) !== null) continue;
      s.pos.x = x; s.pos.z = z;
      s.abilityReadyAt = s.time + CONFIG.blinkCooldown; s.abilityUsedAt = s.time;
      return;
    }
    s.abilityReadyAt = s.time + 0.5;
  } else if (s.ability === 'bouclier') {
    s.abilityReadyAt = s.time + CONFIG.shieldAbilityCooldown; s.abilityUsedAt = s.time;
  }
}

function subStep(s: PlayerState, input: Input, map: Collide, dt: number) {
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
  let ix = 0, iz = 0;
  if (input.fwd) { ix += fx; iz += fz; }
  if (input.back) { ix -= fx; iz -= fz; }
  if (input.right) { ix += rx; iz += rz; }
  if (input.left) { ix -= rx; iz -= rz; }
  const il = Math.hypot(ix, iz);
  if (il > 0) { ix /= il; iz /= il; }

  const locked = s.time < s.dashUntil || s.time < s.padUntil;
  if (!locked) {
    const k = Math.min(1, (s.onGround ? CONFIG.groundAccel : CONFIG.airAccel) * dt);
    s.vel.x += (ix * CONFIG.runSpeed - s.vel.x) * k;
    s.vel.z += (iz * CONFIG.runSpeed - s.vel.z) * k;
  }
  if (input.jump && s.onGround) { s.vel.y = CONFIG.jumpSpeed; s.onGround = false; }
  s.vel.y -= CONFIG.gravity * dt;

  const nx = s.pos.x + s.vel.x * dt;
  if (!hitsWall(map, nx, s.pos.z, s.pos.y)) s.pos.x = nx; else s.vel.x = 0;
  const nz = s.pos.z + s.vel.z * dt;
  if (!hitsWall(map, s.pos.x, nz, s.pos.y)) s.pos.z = nz; else s.vel.z = 0;

  let ny = s.pos.y + s.vel.y * dt;
  if (s.vel.y > 0) {
    const c = ceilingAt(map, s.pos.x, s.pos.z, s.pos.y + CONFIG.playerHeight, ny + CONFIG.playerHeight);
    if (Number.isFinite(c)) { ny = c - CONFIG.playerHeight - 0.01; s.vel.y = 0; }
  }
  const g = groundAt(map, s.pos.x, s.pos.z, Math.max(s.pos.y, ny));
  if (ny <= g) { ny = g; s.vel.y = 0; s.onGround = true; }
  else if (s.onGround && s.vel.y <= 0 && s.pos.y - g < CONFIG.snapDown) { ny = g; s.vel.y = 0; }
  else s.onGround = false;
  s.pos.y = ny;
  if (s.onGround) s.airJumps = s.airJumpsMax;

  if (s.onGround) {
    for (const p of map.pads) {
      if (Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 1.15 && Math.abs(s.pos.y - p.y) < 0.6) {
        s.vel.x = p.vx; s.vel.y = p.vy; s.vel.z = p.vz;
        s.onGround = false; s.padUntil = s.time + CONFIG.padControlLock; s.pos.y += 0.05;
        break;
      }
    }
  }
}

/** Moto : le cap tourne avec gauche et droite, avant accélère, arrière freine puis recule, Maj donne un turbo. */
export function stepBike(prev: PlayerState, input: Input, map: Collide): PlayerState {
  const s = cloneState(prev);
  s.pitch = Math.max(-0.8, Math.min(0.8, input.pitch));
  if (input.dash && s.time >= s.dashReadyAt && s.onGround) {
    s.speed = Math.min(CONFIG.bikeMaxSpeed + CONFIG.bikeBoost, Math.max(s.speed, 0) + CONFIG.bikeBoost);
    s.dashReadyAt = s.time + CONFIG.bikeBoostCooldown; s.dashUntil = s.time + 0.6;
  }
  if (input.jump && !s.jumpHeld && s.onGround) { s.vel.y = CONFIG.bikeHop; s.onGround = false; }
  s.jumpHeld = input.jump;
  let rest = Math.min(input.dt, 0.1);
  while (rest > 1e-9) {
    const dt = Math.min(rest, SUB);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const grip = s.onGround ? 1 : 0.35;
    const rate = CONFIG.bikeTurn * Math.min(1, 0.3 + Math.abs(s.speed) / 10) * grip;
    s.yaw += steer * rate * dt * (s.speed < -0.5 ? -1 : 1);
    if (s.onGround) {
      const boosting = s.time < s.dashUntil;
      const top = CONFIG.bikeMaxSpeed + (boosting ? CONFIG.bikeBoost : 0);
      if (input.fwd) s.speed = Math.min(top, s.speed + CONFIG.bikeAccel * dt);
      else if (input.back) s.speed = s.speed > 0 ? Math.max(0, s.speed - CONFIG.bikeBrake * dt) : Math.max(-CONFIG.bikeReverse, s.speed - CONFIG.bikeAccel * 0.5 * dt);
      else s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), CONFIG.bikeCoast * dt);
      if (!boosting && s.speed > CONFIG.bikeMaxSpeed) s.speed = Math.max(CONFIG.bikeMaxSpeed, s.speed - CONFIG.bikeBrake * 0.5 * dt);
    }
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    s.vel.x = fx * s.speed; s.vel.z = fz * s.speed;
    s.vel.y -= CONFIG.gravity * dt;
    const R = CONFIG.bikeRadius;
    const nx = s.pos.x + s.vel.x * dt, nz = s.pos.z + s.vel.z * dt;
    if (!hitsWall(map, nx, nz, s.pos.y, R)) { s.pos.x = nx; s.pos.z = nz; }
    else if (!hitsWall(map, nx, s.pos.z, s.pos.y, R)) { s.pos.x = nx; s.speed *= 0.85; }
    else if (!hitsWall(map, s.pos.x, nz, s.pos.y, R)) { s.pos.z = nz; s.speed *= 0.85; }
    else s.speed *= -CONFIG.bikeBounce;
    let ny = s.pos.y + s.vel.y * dt;
    const g = groundAt(map, s.pos.x, s.pos.z, Math.max(s.pos.y, ny));
    if (ny <= g) { ny = g; s.vel.y = 0; s.onGround = true; }
    else if (s.onGround && s.vel.y <= 0 && s.pos.y - g < 0.9) { ny = g; s.vel.y = 0; }
    else s.onGround = false;
    // sortie de rampe : la vitesse verticale suit la pente pour que la moto décolle au bout
    if (s.onGround && ny > s.pos.y + 1e-4) s.vel.y = Math.max(s.vel.y, (ny - s.pos.y) / dt * 0.85);
    s.pos.y = ny;
    rest -= dt; s.time += dt;
  }
  return s;
}

export const eyeOf = (s: PlayerState): Vec3 => ({ x: s.pos.x, y: s.pos.y + CONFIG.eyeHeight, z: s.pos.z });
