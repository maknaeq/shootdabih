import type { Vec3 } from '../vec';

/** Matériaux de la palette diorama plat. Le client associe une couleur à chacun. */
export type Mat =
  | 'ground' | 'dirt' | 'snow' | 'rock' | 'wood' | 'plank' | 'metal' | 'grate' | 'concrete'
  | 'tent' | 'tentDark' | 'cont1' | 'cont2' | 'cont3' | 'cabin' | 'roof' | 'trunk' | 'leaf'
  | 'orange' | 'white' | 'dark' | 'glass' | 'tire' | 'pad';

export interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; mat: Mat; solid: boolean }
export interface Ramp { x0: number; x1: number; z0: number; z1: number; h0: number; h1: number; axis: 'x' | 'z'; mat: Mat }
export interface Pad { x: number; y: number; z: number; vx: number; vy: number; vz: number }
export interface Lamp { x: number; y: number; z: number }
/** Décor sans collision (arbres lointains, cônes de sapin…), dessiné par le client. */
export interface Prop { kind: 'pine' | 'rock' | 'cone' | 'car'; x: number; y: number; z: number; s: number; r: number; mat?: Mat }

export interface Mood {
  sky: [number, number];
  fog: number; fogNear: number; fogFar: number;
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  sun: number; sunIntensity: number; sunDir: [number, number, number];
  lamp: number;
}

export interface MapDef {
  id: string;
  name: string;
  size: [number, number];
  players: [number, number];
  mood: Mood;
  build(b: import('./builder').Builder): void;
}

export interface MapData {
  def: MapDef;
  boxes: Box[];
  ramps: Ramp[];
  pads: Pad[];
  spawns: Vec3[];
  lamps: Lamp[];
  props: Prop[];
  /** Emplacements des bonus au sol. */
  pickups: Vec3[];
}
