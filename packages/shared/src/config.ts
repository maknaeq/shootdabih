/** Réglages de jeu partagés par le client et le serveur. Toutes les valeurs sont des points de départ à ajuster. */
export const CONFIG = {
  tickRate: 60,
  snapshotRate: 30,
  runSpeed: 9,
  jumpSpeed: 9.5,
  gravity: 22,
  groundAccel: 14,
  airAccel: 3.5,
  dashSpeed: 18,
  dashTime: 0.22,
  dashCooldown: 2,
  padControlLock: 0.5,
  fireCooldown: 1.2,
  respawnDelay: 1,
  scoreToWin: 25,
  matchMaxSeconds: 600,
  maxPlayers: 12,
  minPlayersToStart: 2,
  playerRadius: 0.3,
  playerHeight: 1.75,
  eyeHeight: 1.6,
  stepHeight: 0.55,
  snapDown: 0.6,
  hitRadius: 0.45,
  hitHeight: 1.85,
  maxRewindMs: 200,
  interpDelayMs: 150,
  killPlaneY: -25,
  emptyRoomTtlMs: 5 * 60 * 1000
} as const;

export type Config = typeof CONFIG;

/** Couleurs de parka attribuées aux joueurs, dans l'ordre d'arrivée. L'orange du décor n'y figure pas. */
export const PARKA_COLORS = [
  0x3fa39a, 0xe8c23a, 0x5b8cff, 0xd9534f, 0x9b6bd6, 0x6cbf5a,
  0xf2f0ea, 0x2f4256, 0xe67fb0, 0x8fd3f0, 0xb08a5a, 0x7a7f86
] as const;
