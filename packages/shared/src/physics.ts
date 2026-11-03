import { CONFIG } from './config';
import { ceilingAt, groundAt, hitsWall } from './map/collision';
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
}

export interface Input {
  seq: number;
  dt: number;
  fwd: boolean; back: boolean; left: boolean; right: boolean;
  jump: boolean; dash: boolean;
  yaw: number; pitch: number;
}

export function makePlayerState(pos: Vec3, yaw = 0): PlayerState {
  return { pos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, yaw, pitch: 0, onGround: false, time: 0, dashUntil: -1, dashReadyAt: 0, padUntil: -1 };
}

export function cloneState(s: PlayerState): PlayerState {
  return { ...s, pos: { ...s.pos }, vel: { ...s.vel } };
}

const SUB = 1 / 120;

/** Avance l'état d'un joueur selon une entrée. Fonction pure : renvoie un nouvel état. */
export function stepPlayer(prev: PlayerState, input: Input, map: Pick<MapData, 'boxes' | 'ramps' | 'pads'>): PlayerState {
  const s = cloneState(prev);
  s.yaw = input.yaw;
  s.pitch = Math.max(-1.5, Math.min(1.5, input.pitch));
  // Le dash se déclenche une fois au début du pas.
  if (input.dash && s.time >= s.dashReadyAt) {
    s.vel.x = -Math.sin(s.yaw) * CONFIG.dashSpeed;
    s.vel.z = -Math.cos(s.yaw) * CONFIG.dashSpeed;
    s.dashUntil = s.time + CONFIG.dashTime;
    s.dashReadyAt = s.time + CONFIG.dashCooldown;
  }
  let rest = Math.min(input.dt, 0.1);
  while (rest > 1e-9) {
    const dt = Math.min(rest, SUB);
    subStep(s, input, map, dt);
    rest -= dt;
    s.time += dt;
  }
  return s;
}

function subStep(s: PlayerState, input: Input, map: Pick<MapData, 'boxes' | 'ramps' | 'pads'>, dt: number) {
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

export const eyeOf = (s: PlayerState): Vec3 => ({ x: s.pos.x, y: s.pos.y + CONFIG.eyeHeight, z: s.pos.z });
