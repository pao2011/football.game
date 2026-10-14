import { Vector3 } from 'three';
import { AIR_DRAG, groundPassSpeed, loftedSpeed, MAGNUS } from './Ball';
import { BALL_RADIUS, GRAVITY } from '../config/constants';
import { clamp } from '../util/math';

// Utilidades para calcular velocidades de golpeo. Comunes a la IA y al jugador humano,
// de modo que ambos usan exactamente la misma física (sin ventajas ocultas).

const _d = new Vector3();

/** Pase raso hacia `target` que llega con una velocidad razonable. */
export function groundPassVelocity(from: Vector3, target: Vector3, powerBias = 0): Vector3 {
  _d.set(target.x - from.x, 0, target.z - from.z);
  const dist = Math.max(_d.length(), 0.5);
  const arrive = clamp(5 + dist * 0.16 + powerBias * 4, 3.5, 13);
  const speed = clamp(groundPassSpeed(dist, arrive), 4, 30);
  return _d.normalize().multiplyScalar(speed);
}

/** Balón elevado que cae aproximadamente en `target`. */
export function loftedVelocity(from: Vector3, target: Vector3, elevationDeg: number): Vector3 {
  _d.set(target.x - from.x, 0, target.z - from.z);
  const dist = Math.max(_d.length(), 2);
  const { speed } = loftedSpeed(dist, elevationDeg);
  const el = (elevationDeg * Math.PI) / 180;
  _d.normalize();
  return new Vector3(_d.x * Math.cos(el) * speed, Math.sin(el) * speed, _d.z * Math.cos(el) * speed);
}

/**
 * Velocidad para un disparo de rapidez `speed` que pase por el punto `target` (x, y, z).
 * Busca la elevación por bisección simulando arrastre y gravedad.
 */
export function aimedShotVelocity(from: Vector3, target: Vector3, speed: number): Vector3 {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const horiz = Math.hypot(dx, dz);
  const ty = target.y;
  let lo = -0.15;
  let hi = 0.7;
  for (let i = 0; i < 16; i++) {
    const el = (lo + hi) / 2;
    const y = heightAtDistance(speed, el, horiz, from.y);
    if (y < ty) lo = el; else hi = el;
  }
  const el = (lo + hi) / 2;
  const hx = dx / horiz;
  const hz = dz / horiz;
  return new Vector3(hx * Math.cos(el) * speed, Math.sin(el) * speed, hz * Math.cos(el) * speed);
}

function heightAtDistance(speed: number, el: number, dist: number, y0: number) {
  let vx = Math.cos(el) * speed;
  let vy = Math.sin(el) * speed;
  let x = 0;
  let y = Math.max(y0, BALL_RADIUS);
  const dt = 1 / 120;
  for (let t = 0; t < 4 && x < dist; t += dt) {
    const s = Math.hypot(vx, vy);
    vx += -AIR_DRAG * s * vx * dt;
    vy += (-GRAVITY - AIR_DRAG * s * vy) * dt;
    x += vx * dt;
    y += vy * dt;
    if (y < BALL_RADIUS) {
      // rebote simplificado: suficiente para la puntería rasa
      y = BALL_RADIUS;
      vy = Math.abs(vy) * 0.55;
      vx *= 0.84;
    }
  }
  return y;
}

/**
 * Tiro con efecto (rosca): devuelve velocidad y giro para que el balón curve hacia `target`.
 * curveSign: +1 curva hacia la izquierda del tirador, -1 hacia la derecha.
 */
export function curledShot(from: Vector3, target: Vector3, speed: number, curveSign: number, spinRate = 55) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const horiz = Math.hypot(dx, dz);
  const t = horiz / (speed * 0.9);
  // aceleración lateral por Magnus ≈ MAGNUS * ω * v
  const aLat = MAGNUS * spinRate * speed;
  const offset = clamp(0.5 * aLat * t * t, 0, 5);
  // Vector lateral: izquierda del tirador mirando al objetivo = (dz, -dx)/|d|
  const lx = dz / horiz;
  const lz = -dx / horiz;
  const aim = new Vector3(target.x - lx * offset * curveSign, target.y, target.z - lz * offset * curveSign);
  const velocity = aimedShotVelocity(from, aim, speed);
  // ω vertical: ω × v apunta a la izquierda cuando ω = +y y v hacia delante
  // (y × f = izquierda en coordenadas derechas). curveSign=+1 → ω.y > 0
  const spin = new Vector3(0, spinRate * curveSign, 0);
  return { velocity, spin };
}

/** Desviación aleatoria de un golpeo según su calidad. */
export function applyKickError(v: Vector3, angleStd: number, powerStd: number, liftStd: number, gauss: () => number) {
  const speed = v.length();
  if (speed < 0.01) return v;
  const yaw = gauss() * angleStd;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const x = v.x * c + v.z * s;
  const z = -v.x * s + v.z * c;
  v.x = x;
  v.z = z;
  v.multiplyScalar(1 + gauss() * powerStd);
  v.y += gauss() * liftStd * speed;
  return v;
}

/**
 * Balón elevado que pasa por `target` (x, y, z) en su fase descendente con una elevación dada:
 * vaselinas por encima del arquero. Busca la velocidad por bisección simulando arrastre y gravedad.
 */
export function loftToPoint(from: Vector3, target: Vector3, elevationDeg: number): Vector3 {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const horiz = Math.max(0.5, Math.hypot(dx, dz));
  const el = (elevationDeg * Math.PI) / 180;
  let lo = 4;
  let hi = 40;
  for (let i = 0; i < 18; i++) {
    const sp = (lo + hi) / 2;
    const y = heightAtDistance(sp, el, horiz, from.y);
    // poca velocidad: el balón cae antes (altura < objetivo al llegar) → más velocidad
    if (y < target.y) lo = sp; else hi = sp;
  }
  const sp = (lo + hi) / 2;
  return new Vector3((dx / horiz) * Math.cos(el) * sp, Math.sin(el) * sp, (dz / horiz) * Math.cos(el) * sp);
}
