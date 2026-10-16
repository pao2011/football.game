import * as THREE from 'three';
import { BALL_RADIUS } from '../config/constants';

/** Textura procedural del balón: paneles con un diseño original (sin marcas). */
function makeBallTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, w, h);
  // Paneles curvos estilo balón moderno (proyección equirectangular)
  const colors = ['#1a2a6c', '#e8b400', '#1a2a6c'];
  for (let i = 0; i < 6; i++) {
    const cx = (i / 6) * w + w / 12;
    const cy = i % 2 === 0 ? h * 0.32 : h * 0.68;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = colors[i % colors.length];
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + (i % 2 ? Math.PI / 5 : 0);
      const r = 26;
      g.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    // estela curva
    g.strokeStyle = '#c8102e';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 0, 44, -0.6, 1.4);
    g.stroke();
    g.restore();
  }
  // costuras
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.moveTo((i / 12) * w, 0);
    g.bezierCurveTo((i / 12) * w + 20, h * 0.3, (i / 12) * w - 20, h * 0.7, (i / 12) * w, h);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class BallModel {
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  private readonly quat = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();

  constructor() {
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 32, 20);
    const mat = new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.45, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    // sombra de contacto (ayuda a leer la altura del balón)
    const sg = new THREE.CircleGeometry(BALL_RADIUS * 1.3, 20);
    sg.rotateX(-Math.PI / 2);
    const sm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
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
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.06, 0.35 - h * 0.05);
  }
}
