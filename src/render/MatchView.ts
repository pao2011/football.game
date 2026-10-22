import * as THREE from 'three';
import { REPLAY_SPEED, type Match, type ReplayFrame } from '../sim/Match';
import type { Player } from '../sim/Player';
import type { StadiumData } from '../data/types';
import type { AnimInfo, AnimState } from '../sim/types';
import { PlayerModel, type ModelQuality } from './player/PlayerModel';
import { BONE } from './player/rig';
import { Stadium, type GfxQuality } from './stadium/Stadium';
import { BallModel } from './BallModel';
import { CameraDirector, type CameraStyle } from './CameraDirector';
import { HALF_LENGTH } from '../config/constants';
import { WeatherFX } from './WeatherFX';

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
  /** Cooperativo: indicador del segundo humano (verde). */
  private indicator2: { group: THREE.Group; arrow: THREE.Mesh; head: THREE.Mesh } | null = null;
  private receiverRing: THREE.Mesh;
  private replayFrames: ReplayFrame[] = [];
  private replayStart = 0;
  private replayIdx = 0;
  private rosterVersion = 0;
  private replayGoalX = HALF_LENGTH;
  private lastPhase = '';
  private tmpAnim: AnimInfo = { state: 'idle', time: 0, duration: 0, speed: 0, variant: 0, foot: 1 };
  private aimLine: THREE.Line;
  excitement = 0;
  private focus = new THREE.Vector3();
  private weatherFX: WeatherFX | null = null;
  private clock = 0;

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
    // Clima: partículas, capa de nieve, luz más apagada y balón naranja en la nieve
    if (match.weather !== 'clear') {
      this.weatherFX = new WeatherFX(match.weather, match.ball.env.wind, opts.quality === 'lite' ? 'low' : opts.quality);
      this.scene.add(this.weatherFX.group);
      if (match.weather === 'rain' || match.weather === 'snow') {
        this.stadium.keyLight.intensity *= match.weather === 'rain' ? 0.6 : 0.8;
        const fog = this.scene.fog as THREE.Fog | null;
        if (fog && 'near' in fog) {
          fog.near = 40;
          fog.far = match.weather === 'rain' ? 260 : 220;
          fog.color.lerp(new THREE.Color(match.weather === 'rain' ? '#5b6672' : '#d8dee6'), 0.7);
        }
      }
      if (match.weather === 'snow') this.ball.setColor('#ff7a1a');
    }
    const mq: ModelQuality = opts.quality;
    for (const t of match.teams) for (const p of t.players) this.createModel(p);
    this.rosterVersion = match.rosterVersion;
    // Árbitro: equipación negra con detalles amarillos y una tarjeta en la mano derecha
    this.refModel = new PlayerModel({
      kit: { shirt: '#141414', shirt2: '#e6c200', pattern: 'solid', shorts: '#111111', socks: '#111111', number: '#e6c200' },
      number: 0, name: '', skinTone: 2, hairColor: '#2b1d14', hairStyle: 1, height: 1.8, isGoalkeeper: false,
    }, mq);
    this.refModel.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = opts.shadows; });
    this.refCard = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.18), new THREE.MeshBasicMaterial({ color: 0xffd400, side: THREE.DoubleSide }));
    this.refCard.position.set(0, -0.11, 0.02);
    this.refCard.visible = false;
    this.refModel.attachToBone(BONE.handR, this.refCard);
    this.models.set('referee', this.refModel);
    this.scene.add(this.refModel.root);
    this.varMonitor = makeVarMonitor();
    this.varMonitor.visible = false;
    this.scene.add(this.varMonitor);
    for (const t of match.teams) {
      if (t.human) {
        const ind = makeIndicator(t.index === 0 ? '#ffd23f' : '#3fd2ff');
        this.indicators[t.index] = ind;
        this.scene.add(ind.group);
      }
    }
    if (match.config.coop) {
      this.indicator2 = makeIndicator('#4dff7a');
      this.scene.add(this.indicator2.group);
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

  /** Activa o quita las sombras en caliente (calidad automática). */
  setShadows(on: boolean) {
    this.opts.shadows = on;
    this.renderer.shadowMap.enabled = on;
    this.stadium.keyLight.castShadow = on;
    this.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.castShadow) o.castShadow = on; });
    this.scene.traverse((o) => { const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => (x.needsUpdate = true)); });
  }

  private refModel: PlayerModel;
  private refCard: THREE.Mesh;
  /** Monitor del VAR junto a la línea de banda (aparece durante la revisión). */
  private varMonitor: THREE.Group;
  private varMonScale = 0;
  private lastFootage = false;
  private readonly varCam = new THREE.Vector3();
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
    const vr = m.varReview;
    const footage = m.phase === 'var' && vr?.stage === 'footage';
    if (footage && !this.lastFootage && vr) {
      this.replayFrames = vr.clip;
      this.replayStart = m.time;
      this.replayIdx = 0;
    }
    if (this.lastFootage && !footage) this.rosterVersion = -1;
    this.lastFootage = footage;
    if (m.phase === 'replay' && this.lastPhase !== 'replay') {
      this.replayFrames = m.replayClip.length > 1 ? m.replayClip : m.replay.slice(-30 * 6);
      this.replayStart = m.time;
      this.replayIdx = 0;
      this.replayGoalX = Math.sign(m.ball.pos.x) * HALF_LENGTH;
    }
    // al volver de la repetición se recalcula quién está en el campo
    if (this.lastPhase === 'replay' && m.phase !== 'replay') this.rosterVersion = -1;
    this.lastPhase = m.phase;

    if ((m.phase === 'replay' || footage) && this.replayFrames.length > 0) {
      this.updateReplay(dt);
    } else {
      this.updateLive(dt, receiverPreview, aimDir, aimTarget);
    }

    // Ambiente: excitación según peligro de gol
    const danger = Math.max(0, (Math.abs(m.ball.pos.x) - (HALF_LENGTH - 30)) / 30);
    const target = m.phase === 'goal' ? 1 : m.phase === 'play' ? danger * 0.8 : 0.15;
    this.excitement += (target - this.excitement) * Math.min(1, dt * (target > this.excitement ? 3 : 0.6));
    this.stadium.update(dt, this.excitement, this.camera, this.renderer.domElement.height);
    this.clock += dt;
    this.weatherFX?.update(dt, this.camera, this.clock);

    // La luz principal sigue la acción para sombras nítidas
    const b = m.ball.pos;
    this.focus.set(b.x * 0.9, 0, b.z * 0.5);
    this.stadium.focusShadow(this.focus);
  }

  private updateLive(dt: number, receiverPreview: Player | null, aimDir: THREE.Vector3 | null, aimTarget: THREE.Vector3 | null) {
    const m = this.match;
    if (m.rosterVersion !== this.rosterVersion) {
      // cambios: los que salen desaparecen del campo
      this.rosterVersion = m.rosterVersion;
      const live = new Set(m.playersAll.map((p) => p.id));
      for (const [id, model] of this.models) if (id !== 'referee' && !live.has(id)) model.root.visible = false;
    }
    for (const p of m.playersAll) {
      const model = this.models.get(p.id) ?? this.createModel(p);
      model.root.visible = !p.sentOff;
      if (p.sentOff) continue;
      model.root.position.set(p.pos.x, 0, p.pos.z);
      model.root.rotation.y = p.facing;
      model.update(p.anim, dt);
    }
    // árbitro
    const ref = m.referee;
    this.refModel.root.visible = true;
    this.refModel.root.position.set(ref.pos.x, 0, ref.pos.z);
    this.refModel.root.rotation.y = ref.facing;
    this.refModel.update(ref.anim, dt);
    this.refCard.visible = ref.anim.state === 'ref_card' && ref.anim.time > 0.12 && !!ref.cardColor;
    (this.refCard.material as THREE.MeshBasicMaterial).color.set(ref.cardColor === 'red' ? 0xe0201c : 0xffd400);
    // cámara de la amonestación: árbitro e infractor en primer plano
    const g = ref.gesture;
    this.director.cardFocus = g && (g.kind === 'card' || g.kind === 'warn') && m.phase === 'stoppage' ? { a: ref.pos, b: g.at } : null;
    // VAR: el árbitro (y el monitor cuando ya está montado) en primer plano
    const vrv = m.varReview;
    if (m.phase === 'var' && vrv) {
      const early = vrv.stage === 'call' || vrv.stage === 'tv';
      // al principio, plano del árbitro (con la mirada hacia donde mira); después, árbitro y monitor
      this.varCam.set(ref.pos.x + Math.sin(ref.facing) * 2, 0, ref.pos.z + Math.cos(ref.facing) * 2);
      this.director.cardFocus = { a: ref.pos, b: early ? this.varCam : vrv.monitor };
    }
    const monWant = m.phase === 'var' && vrv && vrv.stage !== 'call' && vrv.stage !== 'tv' ? 1 : 0;
    this.varMonScale += (monWant - this.varMonScale) * Math.min(1, dt * 5);
    this.varMonitor.visible = this.varMonScale > 0.02;
    if (vrv) { this.varMonitor.position.copy(vrv.monitor); this.varMonitor.rotation.y = 0.85; }
    this.varMonitor.scale.setScalar(Math.max(0.01, this.varMonScale));
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
    if (this.indicator2) {
      const t = m.teams[m.config.humanTeam === 1 ? 1 : 0];
      const c = t.controlled2;
      this.indicator2.group.visible = !!c && !c.sentOff && this.opts.showIndicators && m.phase !== 'replay';
      if (c) {
        this.indicator2.group.position.set(c.pos.x, 0, c.pos.z);
        this.indicator2.group.rotation.y = c.facing;
        this.indicator2.head.position.y = c.data.height + 0.55 + Math.sin(m.time * 5 + 1) * 0.05;
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
    this.refCard.visible = false;
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
    const vrw = m.varReview;
    if (m.phase === 'var' && vrw) {
      // el vídeo del VAR sigue al jugador que recibió el contacto
      const vp = f.players.find((q) => q.id === vrw.incident.victim.id);
      this.varCam.set(vp ? vp.x : bp.x, 0, vp ? vp.z : bp.z);
      this.director.updateIncident(this.varCam, t);
    } else this.director.updateReplay(bp, this.replayGoalX, t, left);
  }

  /** Modelo 3D de un jugador (los suplentes se crean al entrar). */
  private createModel(p: Player) {
    const t = this.match.teams[p.team];
    const kit = p.isGK ? t.data.gkKit : t.kit;
    const model = new PlayerModel({
      kit, number: p.data.number, name: p.data.name.split(' ').slice(-1)[0], skinTone: p.data.skinTone,
      hairColor: p.data.hairColor, hairStyle: p.data.hairStyle, height: p.data.height, isGoalkeeper: p.isGK,
    }, this.opts.quality);
    model.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = this.opts.shadows; } });
    this.models.set(p.id, model);
    this.scene.add(model.root);
    return model;
  }

  /** Modo foto: cámara libre que orbita alrededor de un punto (el partido queda congelado). */
  photo: { target: THREE.Vector3; yaw: number; pitch: number; dist: number } | null = null;

  startPhoto() {
    const c = this.camera;
    const t = this.match.ball.pos.clone();
    t.y = Math.max(0.6, t.y);
    const off = c.position.clone().sub(t);
    const d = Math.max(4, off.length());
    this.photo = { target: t, yaw: Math.atan2(off.x, off.z), pitch: Math.asin(Math.min(1, Math.max(-1, off.y / d))), dist: Math.min(60, d) };
  }

  /** Gira (dYaw, dPitch en rad), acerca (factor de zoom) o mueve el punto de mira (en el plano, relativo a la cámara). */
  photoMove(dYaw: number, dPitch: number, zoom = 1, panRight = 0, panForward = 0) {
    const p = this.photo;
    if (!p) return;
    p.yaw += dYaw;
    p.pitch = Math.min(1.45, Math.max(0.02, p.pitch + dPitch));
    p.dist = Math.min(120, Math.max(1.5, p.dist * zoom));
    if (panRight || panForward) {
      // ejes de la cámara proyectados en el césped
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      p.target.x += fz * -panRight + fx * panForward;
      p.target.z += -fx * -panRight + fz * panForward;
      p.target.x = Math.max(-75, Math.min(75, p.target.x));
      p.target.z = Math.max(-50, Math.min(50, p.target.z));
    }
  }

  stopPhoto() {
    this.photo = null;
  }

  private applyPhoto() {
    const p = this.photo!;
    const c = this.camera;
    const h = Math.cos(p.pitch) * p.dist;
    c.position.set(p.target.x + Math.sin(p.yaw) * h, Math.max(0.25, p.target.y + Math.sin(p.pitch) * p.dist), p.target.z + Math.cos(p.yaw) * h);
    c.lookAt(p.target);
  }

  /** Captura de la imagen actual como PNG (se renderiza justo antes para que el búfer tenga la imagen). */
  capture(): string {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  render() {
    if (this.photo) this.applyPhoto();
    this.renderer.render(this.scene, this.camera);
  }

  netImpact(x: number, z: number, power: number) {
    const side = x > 0 ? 1 : -1;
    this.stadium.netImpact(side as 1 | -1, new THREE.Vector3(x, this.match.ball.pos.y, z), power);
  }

  dispose() {
    for (const m of this.models.values()) m.dispose();
    this.weatherFX?.dispose();
    this.stadium.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}


/** Monitor del VAR: pie, pantalla con el rótulo "VAR" y una visera, mirando al campo. */
function makeVarMonitor(): THREE.Group {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.6, metalness: 0.3 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), dark);
  post.position.y = 0.55;
  g.add(post);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.6), dark);
  base.position.y = 0.03;
  g.add(base);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.05, 0.1), dark);
  frame.position.set(0, 1.55, 0);
  g.add(frame);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const x = c.getContext('2d')!;
  const grad = x.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, '#0b1d4a');
  grad.addColorStop(1, '#050a1f');
  x.fillStyle = grad;
  x.fillRect(0, 0, 256, 160);
  x.strokeStyle = 'rgba(116,172,223,0.5)';
  x.lineWidth = 3;
  x.strokeRect(8, 8, 240, 144);
  x.fillStyle = '#fff';
  x.font = '800 74px Montserrat, Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('VAR', 128, 78);
  x.fillStyle = '#ff4d5e';
  x.beginPath();
  x.arc(34, 30, 7, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.8)';
  x.font = '700 18px Arial, sans-serif';
  x.textAlign = 'left';
  x.fillText('EN VIVO', 48, 32);
  const tex = new THREE.CanvasTexture(c);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.98), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.set(0, 1.55, 0.06);
  g.add(screen);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.55), dark);
  hood.position.set(0, 2.12, 0.2);
  g.add(hood);
  return g;
}
