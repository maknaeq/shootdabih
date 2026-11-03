import type { GameMode } from '../config';
import type { MapDef } from '../map/types';

/** Une map de course ne sert qu'à la course ; une arène sert au chacun pour soi, et au drapeau si elle a deux bases. */
export function mapSupports(def: MapDef, mode: GameMode): boolean {
  if (mode === 'course') return !!def.race;
  if (def.race) return false;
  return mode === 'dm' || !!def.ctf;
}
