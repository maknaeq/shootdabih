import { buildMap } from '../map/builder';
import type { MapData, MapDef } from '../map/types';
import { camp } from './camp';
import { polaire } from './polaire';
import { circuit } from './circuit';

export const MAP_DEFS: Record<string, MapDef> = { [camp.id]: camp, [polaire.id]: polaire, [circuit.id]: circuit };

const cache = new Map<string, MapData>();
/** Map construite (mise en cache). */
export function getMap(id: string): MapData {
  let m = cache.get(id);
  if (!m) {
    const def = MAP_DEFS[id];
    if (!def) throw new Error('Map inconnue : ' + id);
    m = buildMap(def);
    cache.set(id, m);
  }
  return m;
}
