import * as THREE from 'three';
import type { MapData } from '@sdb/shared';

export interface GraphicsSettings { shadows: boolean; resolution: number; fov: number }

export function loadSettings(): GraphicsSettings & { sensitivity: number } {
  const d = { shadows: true, resolution: 1, fov: 85, sensitivity: 1 };
  try { return { ...d, ...JSON.parse(localStorage.getItem('sdb-settings') ?? '{}') }; } catch { return d; }
}
export function saveSettings(s: GraphicsSettings & { sensitivity: number }) { try { localStorage.setItem('sdb-settings', JSON.stringify(s)); } catch { /* stockage indisponible */ } }

function skyTexture(top: number, bottom: number): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#' + top.toString(16).padStart(6, '0')); gr.addColorStop(1, '#' + bottom.toString(16).padStart(6, '0'));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private sun = new THREE.DirectionalLight();
  private settings: GraphicsSettings;

  constructor(readonly canvas: HTMLCanvasElement, settings: GraphicsSettings) {
    this.settings = { ...settings };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(settings.fov, 16 / 9, 0.03, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.apply(settings);
  }

  setMap(map: MapData) {
    const m = map.def.mood;
    this.scene.background = skyTexture(m.sky[0], m.sky[1]);
    this.scene.fog = new THREE.Fog(m.fog, m.fogNear, m.fogFar);
    this.scene.add(new THREE.HemisphereLight(m.hemiSky, m.hemiGround, m.hemiIntensity * Math.PI));
    const [W, D] = map.def.size;
    this.sun.color.set(m.sun); this.sun.intensity = m.sunIntensity * Math.PI;
    const dir = new THREE.Vector3(...m.sunDir).normalize();
    this.sun.position.set(W / 2 + dir.x * 40, dir.y * 40, D / 2 + dir.z * 40);
    this.sun.target.position.set(W / 2, 0, D / 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const r = Math.max(W, D) * 0.75, sc = this.sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
  }

  apply(s: GraphicsSettings) {
    this.settings = { ...s };
    this.renderer.shadowMap.enabled = s.shadows;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * s.resolution);
    this.camera.fov = s.fov; this.camera.updateProjectionMatrix();
    this.scene.traverse(o => { if ((o as THREE.Mesh).material) ((o as THREE.Mesh).material as THREE.Material).needsUpdate = true; });
  }

  get baseFov() { return this.settings.fov; }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const c = this.renderer.domElement;
    if (c.width !== Math.floor(w * this.renderer.getPixelRatio()) || c.height !== Math.floor(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
  }

  render() { this.resize(); this.renderer.render(this.scene, this.camera); }
  dispose() { this.renderer.dispose(); }
}
