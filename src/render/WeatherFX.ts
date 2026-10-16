// Efectos visuales del clima: lluvia (gotas en trazos), nieve (copos), capa de nieve sobre el césped y luz más
// apagada. Las partículas viven en una caja alrededor de la cámara y se desplazan con el viento.
import * as THREE from 'three';
import type { Weather } from '../sim/Weather';
import { PITCH_LENGTH, PITCH_WIDTH } from '../config/constants';

const BOX = { w: 70, h: 32, d: 70 };

export class WeatherFX {
  readonly group = new THREE.Group();
  private pos: Float32Array | null = null;
  private obj: THREE.LineSegments | THREE.Points | null = null;
  private count = 0;
  private readonly wind: THREE.Vector3;
  private disposables: { dispose(): void }[] = [];

  constructor(readonly kind: Weather, wind: { x: number; z: number }, quality: 'low' | 'medium' | 'high') {
    this.wind = new THREE.Vector3(wind.x, 0, wind.z);
    const n = { low: 0.4, medium: 0.7, high: 1 }[quality];
    if (kind === 'rain') {
      this.count = Math.round(3200 * n);
      this.pos = new Float32Array(this.count * 6);
      for (let i = 0; i < this.count; i++) this.seed(i, Math.random() * BOX.h);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xaab8cc, transparent: true, opacity: 0.38, depthWrite: false });
      this.obj = new THREE.LineSegments(g, mat);
      this.disposables.push(g, mat);
    } else if (kind === 'snow') {
      this.count = Math.round(2600 * n);
      this.pos = new Float32Array(this.count * 3);
      for (let i = 0; i < this.count; i++) this.seed(i, Math.random() * BOX.h);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.11, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
      this.obj = new THREE.Points(g, mat);
      this.disposables.push(g, mat);
      // capa de nieve sobre el césped (manchas, deja ver las líneas)
      const tex = snowTexture();
      const cover = new THREE.Mesh(
        new THREE.PlaneGeometry(PITCH_LENGTH + 10, PITCH_WIDTH + 8).rotateX(-Math.PI / 2),
        new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      cover.position.y = 0.015;
      cover.renderOrder = 1;
      this.group.add(cover);
      this.disposables.push(cover.geometry, cover.material as THREE.Material, tex);
    }
    if (this.obj) {
      this.obj.frustumCulled = false;
      this.group.add(this.obj);
    }
  }

  /** Coloca una partícula en la caja (coordenadas relativas a la cámara se suman en update). */
  private seed(i: number, y: number) {
    const p = this.pos!;
    const x = (Math.random() - 0.5) * BOX.w;
    const z = (Math.random() - 0.5) * BOX.d;
    if (this.kind === 'rain') {
      p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x; p[i * 6 + 4] = y + 0.55; p[i * 6 + 5] = z;
    } else {
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    }
  }

  update(dt: number, camera: THREE.Camera, time: number) {
    if (!this.obj || !this.pos) return;
    // la caja sigue a la cámara (en el plano)
    this.obj.position.set(camera.position.x, 0, camera.position.z);
    const p = this.pos;
    const rain = this.kind === 'rain';
    const fall = rain ? 22 : 1.6;
    const wx = this.wind.x * (rain ? 0.8 : 1);
    const wz = this.wind.z * (rain ? 0.8 : 1);
    const stride = rain ? 6 : 3;
    for (let i = 0; i < this.count; i++) {
      const o = i * stride;
      const sway = rain ? 0 : Math.sin(time * 1.3 + i) * 0.4;
      p[o] += (wx + sway) * dt;
      p[o + 1] -= fall * dt;
      p[o + 2] += wz * dt;
      if (rain) {
        // el trazo se inclina con el viento
        p[o + 3] = p[o] - wx * 0.03;
        p[o + 4] = p[o + 1] + 0.55;
        p[o + 5] = p[o + 2] - wz * 0.03;
      }
      if (p[o + 1] < 0) this.seed(i, BOX.h);
      else if (Math.abs(p[o]) > BOX.w / 2 || Math.abs(p[o + 2]) > BOX.d / 2) this.seed(i, Math.random() * BOX.h);
    }
    (this.obj.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

function snowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0)';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 256;
    const r = 4 + Math.random() * 22;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(248,250,255,0.9)');
    grd.addColorStop(1, 'rgba(248,250,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
