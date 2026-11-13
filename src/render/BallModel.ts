import * as THREE from 'three';
import { BALL_RADIUS } from '../config/constants';

/**
 * Texturas procedurales del balón (diseño original, sin marcas): 32 gajos como un balón de verdad
 * (12 pentágonos y 20 hexágonos de un icosaedro truncado), con las costuras hundidas en el relieve.
 */
function makeBallTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const w = 512;
  const h = 256;
  // centros de los gajos: vértices del icosaedro (pentágonos) y centros de sus caras (hexágonos)
  const ico = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
  const pent: THREE.Vector3[] = [];
  const hex: THREE.Vector3[] = [];
  for (let i = 0; i < ico.count; i += 3) {
    const f = new THREE.Vector3();
    for (let k = 0; k < 3; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(ico, i + k).normalize();
      f.add(v);
      if (!pent.some((p) => p.distanceToSquared(v) < 1e-6)) pent.push(v);
    }
    hex.push(f.normalize());
  }
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    return { c, g, img: g.createImageData(w, h) };
  };
  const col = mk();
  const bmp = mk();
  const d = new THREE.Vector3();
  const base = [246, 246, 242];
  const navy = [22, 34, 92];
  const gold = [232, 176, 0];
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2;
      d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      // gajo más cercano y segundo más cercano (los pentágonos son más chicos: su distancia pesa más)
      let best = 9;
      let second = 9;
      let isPent = false;
      for (const p of pent) {
        const a = Math.acos(Math.min(1, d.dot(p))) * 1.17;
        if (a < best) { second = best; best = a; isPent = true; } else if (a < second) second = a;
      }
      for (const p of hex) {
        const a = Math.acos(Math.min(1, d.dot(p)));
        if (a < best) { second = best; best = a; isPent = false; } else if (a < second) second = a;
      }
      const seam = Math.min(1, (second - best) / 0.035); // 0 en la costura, 1 dentro del gajo
      const ring = isPent && best > 0.3; // filete dorado en el borde del pentágono
      const c = isPent ? (ring ? gold : navy) : base;
      const k = 0.55 + 0.45 * seam;
      const i = (y * w + x) * 4;
      col.img.data[i] = c[0] * k;
      col.img.data[i + 1] = c[1] * k;
      col.img.data[i + 2] = c[2] * k;
      col.img.data[i + 3] = 255;
      const b = 110 + 145 * seam;
      bmp.img.data[i] = bmp.img.data[i + 1] = bmp.img.data[i + 2] = b;
      bmp.img.data[i + 3] = 255;
    }
  }
  col.g.putImageData(col.img, 0, 0);
  bmp.g.putImageData(bmp.img, 0, 0);
  const map = new THREE.CanvasTexture(col.c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(bmp.c);
  return { map, bump };
}

/** Sombra de contacto difuminada (disco con borde suave). */
function makeShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  // alphaMap lee el canal verde: blanco = opaco, negro = transparente
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.45, '#bfbfbf');
  gr.addColorStop(1, '#000000');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class BallModel {
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  private readonly quat = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();

  constructor() {
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 40, 28);
    const { map, bump } = makeBallTextures();
    const mat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.6, roughness: 0.38, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    // sombra de contacto (ayuda a leer la altura del balón)
    const sg = new THREE.CircleGeometry(BALL_RADIUS * 1.9, 20);
    sg.rotateX(-Math.PI / 2);
    const sm = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: makeShadowTexture(), transparent: true, opacity: 0.5, depthWrite: false });
    this.shadow = new THREE.Mesh(sg, sm);
    this.shadow.renderOrder = 1;
  }

  /** Tiñe el balón (p. ej. naranja en la nieve). */
  setColor(color: string) {
    (this.mesh.material as THREE.MeshStandardMaterial).color.set(color);
  }

  update(pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }, spinY: number, dt: number) {
    this.mesh.position.set(pos.x, pos.y, pos.z);
    // rodadura / giro
    const gs = Math.hypot(vel.x, vel.z);
    if (gs > 0.01) {
      this.axis.set(vel.z, 0, -vel.x).normalize();
      this.quat.setFromAxisAngle(this.axis, (gs * dt) / BALL_RADIUS);
      this.mesh.quaternion.premultiply(this.quat);
    }
    if (Math.abs(spinY) > 0.5) {
      this.quat.setFromAxisAngle(this.axis.set(0, 1, 0), spinY * dt);
      this.mesh.quaternion.premultiply(this.quat);
    }
    this.shadow.position.set(pos.x, 0.012, pos.z);
    const h = Math.max(0, pos.y - BALL_RADIUS);
    const s = 1 + h * 0.25;
    this.shadow.scale.set(s, 1, s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.5 - h * 0.07);
  }
}
