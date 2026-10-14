import * as THREE from 'three';
import { HALF_LENGTH, HALF_WIDTH } from '../config/constants';
import type { Match } from '../sim/Match';
import { clamp, lerp } from '../util/math';

export type CameraStyle = 'broadcast' | 'tele' | 'wide';

/**
 * Director de cámara: cámara de transmisión que sigue el juego con suavizado,
 * planos de celebración, repeticiones cinematográficas y cámara de penales.
 */
export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  style: CameraStyle = 'broadcast';
  zoom = 1;
  private readonly look = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private shake = 0;
  private replayT = 0;
  private replayShot = 0;
  private introT = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.3, 900);
    this.camera.position.set(0, 30, 60);
    this.look.set(0, 0, 0);
    this.pos.copy(this.camera.position);
  }

  /** Base de la cámara para el stick: derecha y "arriba en pantalla" proyectados al suelo. */
  basis(right: THREE.Vector3, forward: THREE.Vector3) {
    this.camera.updateMatrixWorld();
    right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    right.y = 0;
    right.normalize();
    forward.set(-right.z, 0, right.x); // perpendicular: lejos de la cámara
    // asegurar que forward apunta "hacia el fondo" de la pantalla
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    if (forward.x * camDir.x + forward.z * camDir.z < 0) forward.multiplyScalar(-1);
  }

  addShake(v: number) {
    this.shake = Math.max(this.shake, v);
  }

  startIntro() {
    this.introT = 0;
  }

  update(m: Match, dt: number, focusOverride?: THREE.Vector3) {
    const ball = m.ball.pos;
    let targetLook = new THREE.Vector3();
    let targetPos = new THREE.Vector3();
    let fov = 38;
    let damp = 3.2;

    if (m.phase === 'replay') {
      this.replayT += dt;
      return; // la vista de repetición controla la cámara con updateReplay
    }
    this.replayT = 0;

    if (this.introT < 4.5 && m.phase === 'kickoff' && m.half === 1 && m.time < 6) {
      // Plano de presentación: barrido sobre el estadio
      this.introT += dt;
      const t = clamp(this.introT / 4.5, 0, 1);
      const ang = lerp(-0.9, 0, t * t * (3 - 2 * t));
      const r = lerp(95, 60, t);
      targetPos.set(Math.sin(ang) * r, lerp(45, 28, t), Math.cos(ang) * r);
      targetLook.set(0, 0, 0);
      this.camera.position.copy(targetPos);
      this.look.copy(targetLook);
      this.camera.fov = 40;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.look);
      return;
    }

    const focus = focusOverride ?? ball;
    if ((m.phase === 'shootout') || (m.restart?.type === 'penalty' && m.phase === 'stoppage')) {
      // Cámara detrás del ejecutor del penal
      const gx = m.phase === 'shootout' ? HALF_LENGTH : Math.sign(m.restart!.spot.x) * HALF_LENGTH;
      const s = Math.sign(gx);
      targetLook.set(gx, 1.2, 0);
      targetPos.set(gx - s * 24, 4.5, 0);
      fov = 34;
      damp = 6;
    } else if (m.phase === 'goal' && m.lastGoal?.scorer) {
      const sc = m.lastGoal.scorer.pos;
      targetLook.set(sc.x, 1.2, sc.z);
      targetPos.set(sc.x - Math.sign(sc.x) * 6, 3.2, sc.z + (sc.z > 0 ? -9 : 9));
      fov = 40;
      damp = 3.5;
    } else {
      // Cámara de transmisión lateral
      const style = this.style;
      // El estadio limita la distancia: la cámara va montada en la grada (|z| <= 52)
      const height = style === 'tele' ? 27 : style === 'wide' ? 33 : 19;
      const back = style === 'tele' ? 17 : style === 'wide' ? 17 : 15;
      const lookX = clamp(focus.x, -HALF_LENGTH + 8, HALF_LENGTH - 8);
      const lookZ = clamp(focus.z * 0.55, -HALF_WIDTH * 0.45, HALF_WIDTH * 0.45);
      targetLook.set(lookX, 0, lookZ);
      // la cámara se desplaza a lo largo de la banda y algo hacia el arco para dar perspectiva
      targetPos.set(lookX * 0.86, height, HALF_WIDTH + back + Math.max(-4, focus.z * 0.08));
      fov = (style === 'tele' ? 26 : style === 'wide' ? 44 : 31) / this.zoom;
      damp = 3;
    }

    const k = 1 - Math.exp(-damp * dt);
    this.look.lerp(targetLook, k);
    this.pos.lerp(targetPos, k);
    this.camera.position.copy(this.pos);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-6 * dt);
    }
    this.camera.fov = lerp(this.camera.fov, fov, k);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.look);
  }

  /** Cámara de repetición: varios planos cinematográficos alrededor del balón. */
  updateReplay(ballPos: THREE.Vector3, goalX: number, t: number) {
    const shot = Math.floor(t / 2.6) % 3;
    if (shot !== this.replayShot) this.replayShot = shot;
    const s = Math.sign(goalX) || 1;
    const look = ballPos.clone();
    look.y = Math.max(0.6, look.y);
    const pos = new THREE.Vector3();
    if (shot === 0) {
      // detrás del arco, a baja altura
      pos.set(goalX + s * 9, 2.4, ballPos.z * 0.4 + 3);
      this.camera.fov = 32;
    } else if (shot === 1) {
      // plano lateral bajo siguiendo el balón
      pos.set(ballPos.x - s * 4, 1.6, ballPos.z + 12);
      this.camera.fov = 42;
    } else {
      // cenital en órbita
      const a = t * 0.4;
      pos.set(ballPos.x + Math.cos(a) * 14, 9, ballPos.z + Math.sin(a) * 14);
      this.camera.fov = 45;
    }
    this.camera.position.lerp(pos, 0.15);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(look);
    this.look.copy(look);
    this.pos.copy(this.camera.position);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
