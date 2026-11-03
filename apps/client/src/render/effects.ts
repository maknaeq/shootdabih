import * as THREE from 'three';

interface Beam { group: THREE.Group; layers: THREE.Mesh[]; born: number }
interface Burst { mesh: THREE.InstancedMesh; vel: THREE.Vector3[]; spin: THREE.Vector3[]; origin: THREE.Vector3; born: number }

const BEAM_LIFE = 0.42, BURST_LIFE = 1, BURST_N = 26;
const LAYERS: Array<[number, number, number]> = [[0.025, 0xffffff, 1], [0.09, 0xff9a4a, 0.55], [0.22, 0xff9a4a, 0.15]];

/** Rayons et éclats d'élimination. */
export class Effects {
  private beams: Beam[] = [];
  private bursts: Burst[] = [];
  private tmp = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sc = new THREE.Vector3();
  private burstGeo = new THREE.TetrahedronGeometry(0.2, 0);

  constructor(private scene: THREE.Scene) {}

  beam(from: THREE.Vector3, to: THREE.Vector3, now: number) {
    const group = new THREE.Group();
    const dir = this.tmp.subVectors(to, from), len = dir.length();
    group.position.addVectors(from, to).multiplyScalar(0.5);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.scale.set(1, len, 1);
    const layers = LAYERS.map(([r, c, op]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.userData.op = op; group.add(m); return m;
    });
    this.scene.add(group);
    this.beams.push({ group, layers, born: now });
  }

  burst(at: THREE.Vector3, color: number, now: number) {
    const mesh = new THREE.InstancedMesh(this.burstGeo, new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0 }), BURST_N);
    const cols = [color, 0xf3efe6, 0xe8843e], c = new THREE.Color();
    const vel: THREE.Vector3[] = [], spin: THREE.Vector3[] = [];
    for (let i = 0; i < BURST_N; i++) {
      mesh.setColorAt(i, c.set(cols[i % 3]));
      vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2.5 + Math.random() * 3.5).add(new THREE.Vector3(0, 2.5, 0)));
      spin.push(new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    }
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.bursts.push({ mesh, vel, spin, origin: at.clone(), born: now });
  }

  update(now: number) {
    this.beams = this.beams.filter(b => {
      const k = (now - b.born) / BEAM_LIFE;
      if (k >= 1) { this.scene.remove(b.group); b.layers.forEach(l => { l.geometry.dispose(); (l.material as THREE.Material).dispose(); }); return false; }
      const f = Math.pow(1 - k, 1.3);
      b.layers.forEach(l => { (l.material as THREE.MeshBasicMaterial).opacity = l.userData.op * f; });
      b.group.scale.x = b.group.scale.z = 1 - k * 0.45;
      return true;
    });
    this.bursts = this.bursts.filter(b => {
      const t = now - b.born;
      if (t >= BURST_LIFE) { this.scene.remove(b.mesh); (b.mesh.material as THREE.Material).dispose(); b.mesh.dispose(); return false; }
      const s = Math.max(0.001, 1 - t / BURST_LIFE);
      for (let i = 0; i < BURST_N; i++) {
        this.tmp.copy(b.origin).addScaledVector(b.vel[i], t); this.tmp.y -= 4.5 * t * t;
        this.e.set(b.spin[i].x * t, b.spin[i].y * t, b.spin[i].z * t); this.q.setFromEuler(this.e);
        this.m4.compose(this.tmp, this.q, this.sc.set(s, s, s)); b.mesh.setMatrixAt(i, this.m4);
      }
      b.mesh.instanceMatrix.needsUpdate = true;
      return true;
    });
  }
}
