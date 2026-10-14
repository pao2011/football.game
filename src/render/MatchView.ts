import * as THREE from 'three';
import { REPLAY_SPEED, type Match, type ReplayFrame } from '../sim/Match';
import type { Player } from '../sim/Player';
import type { StadiumData } from '../data/types';
import type { AnimInfo, AnimState } from '../sim/types';
import { PlayerModel, type ModelQuality } from './player/PlayerModel';
import { Stadium, type GfxQuality } from './stadium/Stadium';
import { BallModel } from './BallModel';
import { CameraDirector, type CameraStyle } from './CameraDirector';
import { HALF_LENGTH } from '../config/constants';

export interface ViewOptions {
  quality: GfxQuality;
  shadows: boolean;
  cameraStyle: CameraStyle;
  cameraZoom: number;
  showIndicators: boolean;
}

/** Indicador del jugador controlado: anillo en el suelo + flecha de dirección. */
function makeIndicator(color: string) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.position.y = 0.02;
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.45, 3).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  arrow.position.set(0, 0.03, 1.0);
  arrow.scale.y = 0.2;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.35, 4).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }),
  );
  head.position.y = 2.45;
  head.renderOrder = 10;
  g.add(ring, arrow, head);
  return { group: g, arrow, head };
}

/** Puntos máximos del recorrido del tiro libre. */
const FK_MAX_POINTS = 200;
/** Puntos dibujados a lo largo de la trayectoria. */
const FK_DOTS = 48;

export class MatchView {
  readonly scene = new THREE.Scene();
  readonly director: CameraDirector;
  readonly stadium: Stadium;
  readonly ball = new BallModel();
  private models = new Map<string, PlayerModel>();
  private indicators: ({ group: THREE.Group; arrow: THREE.Mesh; head: THREE.Mesh } | null)[] = [null, null];
  private receiverRing: THREE.Mesh;
  private replayFrames: ReplayFrame[] = [];
  private replayStart = 0;
  private replayIdx = 0;
  private replayGoalX = HALF_LENGTH;
  private lastPhase = '';
  private tmpAnim: AnimInfo = { state: 'idle', time: 0, duration: 0, speed: 0, variant: 0, foot: 1 };
  private aimLine: THREE.Line;
  excitement = 0;
  private focus = new THREE.Vector3();

  constructor(readonly renderer: THREE.WebGLRenderer, readonly match: Match, stadiumData: StadiumData, public opts: ViewOptions) {
    const size = renderer.getSize(new THREE.Vector2());
    this.director = new CameraDirector(size.x / Math.max(1, size.y));
    this.director.style = opts.cameraStyle;
    this.director.zoom = opts.cameraZoom;
    const [t0, t1] = match.teams;
    this.stadium = new Stadium(stadiumData, opts.quality, t0.kit.shirt, t1.kit.shirt, [t0.data.name, t1.data.name]);
    this.stadium.attachTo(this.scene);
    this.scene.add(this.stadium.group);
    this.scene.add(this.ball.mesh, this.ball.shadow);
    const mq: ModelQuality = opts.quality;
    for (const t of match.teams) {
      for (const p of t.players) {
        const kit = p.isGK ? t.data.gkKit : t.kit;
        const model = new PlayerModel({
          kit, number: p.data.number, name: p.data.name.split(' ').slice(-1)[0], skinTone: p.data.skinTone,
          hairColor: p.data.hairColor, hairStyle: p.data.hairStyle, height: p.data.height, isGoalkeeper: p.isGK,
        }, mq);
        model.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = opts.shadows; } });
        this.models.set(p.id, model);
        this.scene.add(model.root);
      }
    }
    for (const t of match.teams) {
      if (t.human) {
        const ind = makeIndicator(t.index === 0 ? '#ffd23f' : '#3fd2ff');
        this.indicators[t.index] = ind;
        this.scene.add(ind.group);
      }
    }
    this.receiverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.receiverRing.visible = false;
    this.scene.add(this.receiverRing);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.aimLine = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.6 }));
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);
    // Tiro libre: recorrido previsto del balón y mira en el arco
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FK_MAX_POINTS * 3), 3));
    this.fkLine = new THREE.Line(tg, new THREE.LineDashedMaterial({ color: 0xffe14d, dashSize: 0.45, gapSize: 0.28, transparent: true, opacity: 0.95, depthTest: false }));
    this.fkLine.renderOrder = 5;
    this.fkLine.frustumCulled = false;
    this.fkLine.visible = false;
    this.scene.add(this.fkLine);
    // puntos a lo largo del recorrido (más visibles que una línea de 1 px)
    this.fkDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, depthTest: false }), FK_DOTS);
    this.fkDots.renderOrder = 6;
    this.fkDots.frustumCulled = false;
    this.fkDots.visible = false;
    this.scene.add(this.fkDots);
    this.fkReticle = new THREE.Group();
    const rmat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false });
    this.fkReticle.add(new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 32), rmat));
    this.fkReticle.add(new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), rmat));
    this.fkReticle.rotation.y = Math.PI / 2; // el anillo mira a lo largo del campo (hacia el lanzador)
    this.fkReticle.renderOrder = 6;
    this.fkReticle.visible = false;
    this.scene.add(this.fkReticle);
    renderer.shadowMap.enabled = opts.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.stadium.keyLight.castShadow = opts.shadows;
  }

  /** Tiro libre directo en curso: recorrido previsto y punto de mira (lo actualiza el bucle del partido). */
  freeKick: { path: THREE.Vector3[]; target: THREE.Vector3 } | null = null;
  private fkLine: THREE.Line;
  private fkDots: THREE.InstancedMesh;
  private readonly fkMat = new THREE.Matrix4();
  private fkReticle: THREE.Group;

  get camera() {
    return this.director.camera;
  }

  resize(w: number, h: number) {
    this.director.resize(w / Math.max(1, h));
  }

  /** Actualiza modelos y cámara para este fotograma. */
  update(dt: number, receiverPreview: Player | null, aimDir: THREE.Vector3 | null, aimTarget: THREE.Vector3 | null = null) {
    const m = this.match;
    if (m.phase === 'replay' && this.lastPhase !== 'replay') {
      this.replayFrames = m.replayClip.length > 1 ? m.replayClip : m.replay.slice(-30 * 6);
      this.replayStart = m.time;
      this.replayIdx = 0;
      this.replayGoalX = Math.sign(m.ball.pos.x) * HALF_LENGTH;
    }
    this.lastPhase = m.phase;

    if (m.phase === 'replay' && this.replayFrames.length > 0) {
      this.updateReplay(dt);
    } else {
      this.updateLive(dt, receiverPreview, aimDir, aimTarget);
    }

    // Ambiente: excitación según peligro de gol
    const danger = Math.max(0, (Math.abs(m.ball.pos.x) - (HALF_LENGTH - 30)) / 30);
    const target = m.phase === 'goal' ? 1 : m.phase === 'play' ? danger * 0.8 : 0.15;
    this.excitement += (target - this.excitement) * Math.min(1, dt * (target > this.excitement ? 3 : 0.6));
    this.stadium.update(dt, this.excitement, this.camera, this.renderer.domElement.height);

    // La luz principal sigue la acción para sombras nítidas
    const b = m.ball.pos;
    this.focus.set(b.x * 0.9, 0, b.z * 0.5);
    this.stadium.focusShadow(this.focus);
  }

  private updateLive(dt: number, receiverPreview: Player | null, aimDir: THREE.Vector3 | null, aimTarget: THREE.Vector3 | null) {
    const m = this.match;
    for (const p of m.playersAll) {
      const model = this.models.get(p.id)!;
      model.root.visible = !p.sentOff;
      if (p.sentOff) continue;
      model.root.position.set(p.pos.x, 0, p.pos.z);
      model.root.rotation.y = p.facing;
      model.update(p.anim, dt);
    }
    this.ball.update(m.ball.pos, m.ball.vel, m.ball.spin.y, dt);
    this.ball.mesh.visible = true;

    // Indicadores
    for (const t of m.teams) {
      const ind = this.indicators[t.index];
      if (!ind) continue;
      const c = t.controlled;
      ind.group.visible = !!c && !c.sentOff && this.opts.showIndicators && m.phase !== 'replay';
      if (c) {
        ind.group.position.set(c.pos.x, 0, c.pos.z);
        ind.group.rotation.y = c.facing;
        ind.head.position.y = c.data.height + 0.55 + Math.sin(m.time * 5) * 0.05;
      }
    }
    if (receiverPreview && this.opts.showIndicators) {
      this.receiverRing.visible = true;
      this.receiverRing.position.set(receiverPreview.pos.x, 0.03, receiverPreview.pos.z);
    } else {
      this.receiverRing.visible = false;
    }
    if (aimDir && this.opts.showIndicators) {
      const pos = (this.aimLine.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
      const b = m.ball.pos;
      pos.setXYZ(0, b.x, 0.05, b.z);
      if (aimTarget) pos.setXYZ(1, aimTarget.x, Math.max(0.05, aimTarget.y * 0.5), aimTarget.z);
      else pos.setXYZ(1, b.x + aimDir.x * 6, 0.05, b.z + aimDir.z * 6);
      pos.needsUpdate = true;
      this.aimLine.computeLineDistances();
      this.aimLine.visible = true;
    } else {
      this.aimLine.visible = false;
    }
    const fk = this.freeKick;
    if (fk) {
      const pos = (this.fkLine.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
      const n = Math.min(FK_MAX_POINTS - 1, fk.path.length);
      pos.setXYZ(0, m.ball.pos.x, m.ball.pos.y, m.ball.pos.z);
      for (let i = 0; i < n; i++) pos.setXYZ(i + 1, fk.path[i].x, fk.path[i].y, fk.path[i].z);
      pos.needsUpdate = true;
      this.fkLine.geometry.setDrawRange(0, n + 1);
      this.fkLine.computeLineDistances();
      this.fkLine.visible = n > 1;
      // un punto cada ~0,9 m de recorrido, desplazándose suavemente hacia el arco
      let count = 0;
      let acc = (m.time * 2.2) % 0.9;
      for (let i = 1; i < n && count < FK_DOTS; i++) {
        acc += fk.path[i].distanceTo(fk.path[i - 1]);
        if (acc >= 0.9) {
          acc -= 0.9;
          const sc = 1 - (count / FK_DOTS) * 0.35;
          this.fkMat.makeScale(sc, sc, sc).setPosition(fk.path[i]);
          this.fkDots.setMatrixAt(count++, this.fkMat);
        }
      }
      this.fkDots.count = count;
      this.fkDots.instanceMatrix.needsUpdate = true;
      this.fkDots.visible = count > 0;
      this.fkReticle.position.copy(fk.target);
      const pulse = 1 + Math.sin(m.time * 6) * 0.08;
      this.fkReticle.scale.setScalar(pulse);
      this.fkReticle.visible = true;
    } else {
      this.fkLine.visible = false;
      this.fkDots.visible = false;
      this.fkReticle.visible = false;
    }
    this.director.update(m, dt);
  }

  private updateReplay(dt: number) {
    const m = this.match;
    const t = m.time - this.replayStart;
    // reproducción a cámara lenta, siguiendo el instante grabado de cada fotograma
    const frames = this.replayFrames;
    const target = frames[0].tm + t * REPLAY_SPEED;
    let idx = this.replayIdx;
    if (idx >= frames.length || frames[idx].tm > target) idx = 0;
    while (idx < frames.length - 1 && frames[idx + 1].tm <= target) idx++;
    this.replayIdx = idx;
    const f = frames[idx];
    const seen = new Set<string>();
    for (const pf of f.players) {
      const model = this.models.get(pf.id);
      if (!model) continue;
      seen.add(pf.id);
      model.root.visible = true;
      model.root.position.set(pf.x, 0, pf.z);
      model.root.rotation.y = pf.f;
      const a = this.tmpAnim;
      a.state = pf.s as AnimState;
      a.time = pf.t;
      a.duration = pf.d;
      a.speed = pf.sp;
      a.variant = pf.v;
      a.foot = pf.ft;
      model.update(a, dt * REPLAY_SPEED);
    }
    for (const [id, model] of this.models) if (!seen.has(id)) model.root.visible = false;
    const prev = frames[Math.max(0, idx - 1)];
    const bp = new THREE.Vector3(...f.ball);
    const fdt = Math.max(1 / 60, f.tm - prev.tm);
    const vel = new THREE.Vector3((f.ball[0] - prev.ball[0]) / fdt, 0, (f.ball[2] - prev.ball[2]) / fdt);
    this.ball.update(bp, vel, 0, dt * REPLAY_SPEED);
    for (const ind of this.indicators) if (ind) ind.group.visible = false;
    this.receiverRing.visible = false;
    this.aimLine.visible = false;
    // tiempo de clip que queda: el final (el balón entrando) se ve siempre desde detrás del arco
    const left = (frames[frames.length - 1].tm - target) / REPLAY_SPEED;
    this.director.updateReplay(bp, this.replayGoalX, t, left);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  netImpact(x: number, z: number, power: number) {
    const side = x > 0 ? 1 : -1;
    this.stadium.netImpact(side as 1 | -1, new THREE.Vector3(x, this.match.ball.pos.y, z), power);
  }

  dispose() {
    for (const m of this.models.values()) m.dispose();
    this.stadium.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
