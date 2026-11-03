import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface Models { avatar: THREE.Object3D; viewmodel: THREE.Object3D; bike: THREE.Object3D | null }
export let MODELS: Models | null = null;

/** Convertit les matériaux du glTF en aplats à facettes, comme le reste du décor. */
function flatten(root: THREE.Object3D) {
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshStandardMaterial;
    const name = src.name;
    m.material = name === 'Glow'
      ? new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, name })
      : new THREE.MeshPhongMaterial({ color: src.color.clone(), flatShading: true, shininess: 0, specular: 0x000000, fog: false, name });
    m.castShadow = true;
  });
}

/** Charge le modèle de l'explorateur. En cas d'échec, le jeu garde les persos en formes simples. */
export async function loadModels(timeoutMs = 8000): Promise<Models | null> {
  if (MODELS) return MODELS;
  try {
    const gltf = await Promise.race([
      new GLTFLoader().loadAsync('/models/explorer.glb'),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), timeoutMs))
    ]);
    const avatar = gltf.scene.getObjectByName('Explorer');
    const viewmodel = gltf.scene.getObjectByName('Viewmodel');
    if (!avatar || !viewmodel) return null;
    const bike = gltf.scene.getObjectByName('Bike') ?? null;
    flatten(avatar); flatten(viewmodel); if (bike) flatten(bike);
    MODELS = { avatar, viewmodel, bike };
    return MODELS;
  } catch {
    return null;
  }
}

/** Copie un modèle avec son propre matériau de parka, pour pouvoir le recolorer. */
export function cloneWithParka(src: THREE.Object3D): { root: THREE.Object3D; parka: THREE.MeshPhongMaterial } {
  const root = src.clone(true);
  let parka: THREE.MeshPhongMaterial | null = null;
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.Material).name === 'Parka') {
      if (!parka) parka = (m.material as THREE.MeshPhongMaterial).clone();
      m.material = parka;
    }
  });
  return { root, parka: parka ?? new THREE.MeshPhongMaterial() };
}
