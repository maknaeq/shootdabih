import type { Vec3 } from '../vec';

/** Matériaux de la palette diorama plat. Le client associe une couleur à chacun. */
export type Mat =
  | 'ground' | 'dirt' | 'snow' | 'rock' | 'wood' | 'plank' | 'metal' | 'grate' | 'concrete'
  | 'tent' | 'tentDark' | 'cont1' | 'cont2' | 'cont3' | 'cabin' | 'roof' | 'trunk' | 'leaf'
  | 'orange' | 'white' | 'dark' | 'glass' | 'tire' | 'pad' | 'water';

/** hidden : collision seule, le client dessine un modèle plus détaillé à la place (voiture…). */
export interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; mat: Mat; solid: boolean; hidden?: boolean }
export interface Ramp { x0: number; x1: number; z0: number; z1: number; h0: number; h1: number; axis: 'x' | 'z'; mat: Mat }
export interface Pad { x: number; y: number; z: number; vx: number; vy: number; vz: number }
export interface Lamp { x: number; y: number; z: number }
/** Décor sans collision (arbres lointains, cônes de sapin…), dessiné par le client. */
export interface Prop { kind: 'pine' | 'rock' | 'cone' | 'car' | 'tuft' | 'mountain' | 'fire' | 'roof'; x: number; y: number; z: number; s: number; r: number; mat?: Mat; w?: number; d?: number; h?: number }

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
  /** Où les joueurs se tiennent dans la salle d'attente : point au sol et angle de la caméra. */
  lobby: { x: number; z: number; angle: number };
  /** Capture du drapeau : emplacement des deux drapeaux (équipe 0 puis équipe 1). */
  ctf?: { bases: [{ x: number; z: number }, { x: number; z: number }] };
  /** Course : checkpoints dans l'ordre (le premier est la ligne d'arrivée) et grille de départ. */
  race?: { checkpoints: Array<{ x0: number; x1: number; z0: number; z1: number }>; start: { x: number; z: number; yaw: number }; gridStep: [number, number] };
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
