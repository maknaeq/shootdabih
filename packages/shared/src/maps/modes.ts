import type { GameMode } from '../config';
import type { MapDef } from '../map/types';

/** Toutes les arènes servent au chacun pour soi ; le drapeau demande deux bases. */
export function mapSupports(def: MapDef, mode: GameMode): boolean {
  return mode === 'dm' || !!def.ctf;
}
