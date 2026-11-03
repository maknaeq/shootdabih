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
  emptyRoomTtlMs: 5 * 60 * 1000,
  airJumpSpeed: 8.5,
  grappleRange: 32, grappleSpeed: 24, grappleLock: 0.45, grappleCooldown: 6,
  blinkDistance: 8, blinkCooldown: 5,
  shieldAbilitySeconds: 2.5, shieldAbilityCooldown: 10,
  pickupRespawn: 20, pickupRadius: 1.3,
  overchargeSeconds: 10, overchargeFactor: 0.5,
  pierceSeconds: 10, shieldBuffSeconds: 30, abilityPickupSeconds: 30
} as const;

export const HATS = ['aucun', 'bonnet', 'casquette', 'chapka', 'casque'] as const;
export type Hat = typeof HATS[number];
export const ABILITIES = ['grappin', 'blink', 'saut', 'bouclier'] as const;
/** 'aucune' : capacités désactivées par l'hôte. */
export type Ability = typeof ABILITIES[number] | 'aucune';

/** Réglages de partie choisis par l'hôte. 0 = illimité. */
export interface RoomSettings { mapId: string; scoreToWin: number; timeLimitMin: number; abilities: boolean; pickups: boolean }
export const DEFAULT_SETTINGS: RoomSettings = { mapId: 'auto', scoreToWin: 25, timeLimitMin: 10, abilities: true, pickups: true };
export const SCORE_CHOICES = [10, 25, 50, 0] as const;
export const TIME_CHOICES = [5, 10, 15, 20, 0] as const;
/** Bonus au sol : effets temporaires. */
export const BONUS_KINDS = ['overcharge', 'pierce', 'shield'] as const;
/** Les capacités se ramassent aussi sur la map, puis s'utilisent avec E. */
export const PICKUP_KINDS = ['overcharge', 'pierce', 'shield', 'grappin', 'blink', 'saut', 'bouclier'] as const;
export type PickupKind = typeof PICKUP_KINDS[number];
/** Paliers de série annoncés. */
export const STREAKS: Record<number, string> = { 3: 'Triplé', 5: 'Inarrêtable', 10: 'Légendaire', 15: 'Divin', 20: 'Hors catégorie' };

export type Config = typeof CONFIG;

/** Couleurs de parka attribuées aux joueurs, dans l'ordre d'arrivée. L'orange du décor n'y figure pas. */
export const PARKA_COLORS = [
  0x3fa39a, 0xe8c23a, 0x5b8cff, 0xd9534f, 0x9b6bd6, 0x6cbf5a,
  0xf2f0ea, 0x2f4256, 0xe67fb0, 0x8fd3f0, 0xb08a5a, 0x7a7f86
] as const;
