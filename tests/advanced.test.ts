import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { HALF_LENGTH, SIM_DT } from '../src/config/constants';
import { Input } from '../src/input/Input';
import { HumanController } from '../src/control/HumanController';
import { updateTeamTactics } from '../src/ai/TeamAI';

// Esquema avanzado (PlayStation → teclado): R1 = Shift · L1 = Q · L2 = Ctrl · R2 = E · ✕ = S · ○ = D · □ = A · △ = W ·
// R3 = R · stick derecho = input.rsFlick (simulado).

function setup(opts: { attack?: boolean } = {}) {
  const m = makeMatch({ seed: 9 });
  m.simulate(1);
  m.phase = 'play';
  const team = m.teams[0];
  team.attackDir = 1;
  m.teams[1].attackDir = -1;
  team.human = true;
  const input = new Input();
  // cámara de transmisión: derecha de la pantalla = +x, arriba = −z
  const hc = new HumanController(input, { right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, -1) }, {
    autoSwitch: false, passAssist: 1, powerBarTime: 1, showAimAssist: true, assist: false,
  });
  m.controllers[0] = hc;
  for (const q of m.active) q.pos.set(-40, 0, 36);
  m.teams[1].players[3].pos.set(40, 0, 25);
  m.teams[1].goalkeeper!.pos.set(52, 0, 0);
  const p = team.players[9];
  p.pos.set(0, 0, 0);
  p.facing = Math.PI / 2;
  p.clearAction();
  const A = team.players[8];
  A.pos.set(18, 0, 0);
  const B = team.players[7];
  B.pos.set(4, 0, -16);
  if (opts.attack !== false) {
    m.ball.reset(0.5, 0);
    m.owner = p;
  }
  team.controlled = p;
  let flick: { x: number; y: number } | null = null;
  const kicks: { kind: string; speed: number; vy: number; spin: number; target?: string; err: number; low?: boolean; power?: boolean }[] = [];
  const orig = m.requestKick.bind(m);
  m.requestKick = (pl, req) => {
    if (pl.team === 0) kicks.push({ kind: req.kind, speed: req.velocity.length(), vy: req.velocity.y, spin: req.spin.length(), target: req.targetId, err: req.errorScale, low: req.style?.low, power: req.style?.power });
    return orig(pl, req);
  };
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      input.poll(SIM_DT);
      if (flick) { input.rsFlick = flick; flick = null; }
      m.step();
      m.events.length = 0;
    }
  };
  const tap = (code: string, frames = 4) => { input.setKey(code, true); step(frames); input.setKey(code, false); step(1); };
  const rs = (x: number, y: number) => { flick = { x, y }; step(1); };
  return { m, team, input, hc, p, A, B, step, tap, rs, kicks };
}

describe('Árbitro', () => {
  it('sigue el juego, en una falta dura amonesta con amarilla (gesto y cámara) y la reanudación espera', () => {
    const { m } = setup();
    const ref = m.referee;
    for (let i = 0; i < 120; i++) m.step(SIM_DT);
    expect(Math.hypot(ref.pos.x - m.ball.pos.x, ref.pos.z - m.ball.pos.z)).toBeLessThan(25);
    const off = m.teams[1].players[5];
    const vic = m.teams[0].players[9];
    m.phase = 'play';
    vic.pos.set(10, 0, 5);
    off.pos.set(9.4, 0, 5);
    off.facing = vic.facing = Math.PI / 2; // por detrás
    off.vel.set(8, 0, 0);
    m.ball.reset(14, 5); // lejos del balón: falta grave
    m.owner = null;
    const events: string[] = [];
    (m as unknown as { foul: (a: unknown, b: unknown, c: boolean) => void }).foul(off, vic, true);
    for (const e of m.events) events.push(e.type + ':' + (e.kind ?? ''));
    m.events.length = 0;
    expect(events.some((e) => e.startsWith('card:'))).toBe(true);
    expect(ref.gesture?.kind).toBe('card');
    expect(ref.cardColor).not.toBeNull();
    let sawCard = false;
    let restartAt = -1;
    const t0 = m.time;
    for (let i = 0; i < 60 * 6; i++) {
      m.step(SIM_DT);
      m.events.length = 0;
      if (ref.anim.state === 'ref_card') sawCard = true;
      if (restartAt < 0 && m.restart?.stage === 'setup') restartAt = m.time - t0;
    }
    expect(sawCard).toBe(true);
    expect(restartAt).toBeGreaterThan(3);
  });

  it('falta algo dura: aviso verbal; si reincide, amarilla', () => {
    const { m } = setup();
    const off = m.teams[1].players[5];
    const vic = m.teams[0].players[9];
    const foul = (m as unknown as { foul: (a: unknown, b: unknown, c: boolean) => void }).foul.bind(m);
    const once = () => {
      m.phase = 'play';
      vic.pos.set(10, 0, 5);
      off.pos.set(9.4, 0, 5);
      off.facing = vic.facing = Math.PI / 2;
      off.vel.set(4, 0, 0);
      m.ball.reset(10.5, 5);
      m.events.length = 0;
      foul(off, vic, false); // por detrás, sin barrida, cerca del balón: severidad media
      return m.events.map((e) => e.type);
    };
    const first = once();
    expect(first).toContain('warning');
    expect(m.referee.gesture?.kind).toBe('warn');
    const second = once();
    expect(second).toContain('card');
    expect(off.yellowCards).toBe(1);
  });
});

describe('Stick derecho (mando)', () => {
  it('sin balón: cambia al compañero en esa dirección', () => {
    const s = setup({ attack: false });
    s.m.ball.reset(-30, 30);
    s.m.owner = s.m.teams[1].players[9];
    s.m.teams[1].players[9].pos.set(-30, 0, 30);
    s.rs(0, 1); // arriba en pantalla = −z: hacia B (4, −16)
    expect(s.team.controlled).toBe(s.B);
    s.rs(1, 0); // derecha = +x: hacia A
    expect(s.team.controlled).toBe(s.A);
  });

  it('R3 + stick derecho coloca al arquero', () => {
    const s = setup({ attack: false });
    s.m.owner = s.m.teams[1].players[9];
    s.input.setKey('KeyR', true);
    s.rs(0, -1);
    s.input.setKey('KeyR', false);
    expect(s.team.gkManualUntil).toBeGreaterThan(s.m.time);
    expect(s.team.gkManual.z).toBeGreaterThan(1);
  });

  it('R1 + ✕ y luego stick derecho: el pasador corre en esa dirección (pared avanzada)', () => {
    const s = setup();
    s.input.setKey('ShiftLeft', true);
    s.tap('KeyS', 3);
    s.input.setKey('ShiftLeft', false);
    s.step(3);
    expect(s.team.controlled).toBe(s.A);
    s.rs(0, 1);
    expect(s.p.forcedRunUntil).toBeGreaterThan(s.m.time);
    expect(s.p.forcedRunTarget.z).toBeLessThan(-8);
  });

  it('R1 + stick derecho antes de recibir: primer toque orientado', () => {
    const s = setup();
    s.tap('KeyS', 3);
    s.step(3);
    s.input.setKey('ShiftLeft', true);
    s.rs(0, 1); // hacia −z
    s.input.setKey('ShiftLeft', false);
    expect(s.A.firstTouchUntil).toBeGreaterThan(s.m.time);
    for (let i = 0; i < 200 && s.m.owner !== s.A; i++) s.step(1);
    expect(s.m.owner).toBe(s.A);
    s.step(1);
    expect(s.m.ball.vel.z).toBeLessThan(-2);
  });

  it('R2 + doble toque del stick derecho: autopase largo en carrera', () => {
    const s = setup();
    s.input.setKey('KeyE', true);
    s.input.setKey('ArrowRight', true);
    s.step(20);
    s.rs(1, 0);
    s.step(2);
    s.rs(1, 0);
    s.step(25);
    s.input.setKey('KeyE', false);
    s.input.setKey('ArrowRight', false);
    const k = s.kicks.find((x) => x.kind === 'pass' && x.target === s.p.id);
    expect(k).toBeTruthy();
    expect(s.p.action.kind === 'skill').toBe(false);
  });
});

describe('Pases avanzados', () => {
  it('R1 + △ = pase al hueco potente (más rápido)', () => {
    const a = setup();
    a.tap('KeyW', 6);
    a.step(2);
    const b = setup();
    b.input.setKey('ShiftLeft', true);
    b.tap('KeyW', 6);
    b.input.setKey('ShiftLeft', false);
    b.step(2);
    expect(b.kicks[0].speed).toBeGreaterThan(a.kicks[0].speed * 1.15);
  });

  it('L2 + ✕ = pase con rosca; L2 + R1 + ✕ = vaselina corta', () => {
    const a = setup();
    a.m.teams[1].players[5].pos.set(9, 0, 0.8); // rival tapando la línea
    a.input.setKey('ControlLeft', true);
    a.tap('KeyS', 6);
    a.input.setKey('ControlLeft', false);
    a.step(2);
    expect(a.kicks[0].kind).toBe('pass');
    expect(a.kicks[0].spin).toBeGreaterThan(10);
    const b = setup();
    b.input.setKey('ControlLeft', true);
    b.input.setKey('ShiftLeft', true);
    b.tap('KeyS', 6);
    b.input.setKey('ControlLeft', false);
    b.input.setKey('ShiftLeft', false);
    b.step(2);
    expect(b.kicks[0].kind).toBe('lob');
    expect(b.kicks[0].vy).toBeGreaterThan(5);
  });

  it('L1 + ✕ = pared: el pasador corre al espacio y la devolución va para él', () => {
    const s = setup();
    s.input.setKey('KeyQ', true);
    s.tap('KeyS', 3);
    s.input.setKey('KeyQ', false);
    s.step(2);
    expect(s.p.forcedRunUntil).toBeGreaterThan(s.m.time);
    updateTeamTactics(s.m, s.team);
    expect(s.p.duty).toBe('run');
    for (let i = 0; i < 200 && s.m.owner !== s.A; i++) s.step(1);
    expect(s.m.owner).toBe(s.A);
    s.tap('KeyS', 3);
    s.step(2);
    expect(s.kicks.pop()!.target).toBe(s.p.id);
  });

  it('R1 tocado solo con el balón: un compañero viene a pedirla en corto', () => {
    const s = setup();
    s.tap('ShiftLeft', 3);
    const q = s.team.active.find((x) => x.forcedRunUntil > s.m.time);
    expect(q).toBeTruthy();
    expect(Math.hypot(q!.forcedRunTarget.x - s.p.pos.x, q!.forcedRunTarget.z - s.p.pos.z)).toBeLessThan(Math.hypot(q!.pos.x - s.p.pos.x, q!.pos.z - s.p.pos.z));
    expect(s.kicks.length).toBe(0);
  });

  it('L1 + R1 cancela el pase que se está armando', () => {
    const s = setup();
    s.tap('KeyS', 2);
    expect(s.p.action.kind).toBe('kick');
    s.input.setKey('KeyQ', true);
    s.input.setKey('ShiftLeft', true);
    s.step(1);
    s.input.setKey('KeyQ', false);
    s.input.setKey('ShiftLeft', false);
    expect(s.p.action.kind).not.toBe('kick');
    expect(s.m.owner).toBe(s.p);
  });
});

describe('Tiros y centros avanzados', () => {
  function shooter() {
    const s = setup();
    s.p.pos.set(HALF_LENGTH - 18, 0, 0);
    s.m.ball.reset(HALF_LENGTH - 17.5, 0);
    s.m.owner = s.p;
    return s;
  }

  it('finalización perfecta: segundo toque de ○ justo antes del impacto (mucho más preciso)', () => {
    const s = shooter();
    s.input.setKey('KeyD', true);
    s.step(30);
    s.input.setKey('KeyD', false);
    s.step(1);
    const a = s.p.action;
    expect(a.kind).toBe('kick');
    const err0 = a.kick!.errorScale;
    while (a.contactAt - a.time > 0.06) s.step(1);
    s.input.setKey('KeyD', true);
    s.step(1);
    s.input.setKey('KeyD', false);
    expect(a.kick!.errorScale).toBeLessThan(err0 * 0.5);
    expect(s.hc.timedShotAt).toBeGreaterThan(0);
  });

  it('L1 + R1 + ○ con pulsación muy breve: tiro raso potente', () => {
    const s = shooter();
    s.input.setKey('KeyQ', true);
    s.input.setKey('ShiftLeft', true);
    s.tap('KeyD', 3);
    s.input.setKey('KeyQ', false);
    s.input.setKey('ShiftLeft', false);
    s.step(2);
    const k = s.kicks.pop()!;
    expect(k.power).toBe(true);
    expect(k.low).toBe(true);
  });

  function crosser() {
    const s = setup();
    s.p.pos.set(HALF_LENGTH - 9, 0, 24);
    s.m.ball.reset(HALF_LENGTH - 8.5, 24);
    s.m.owner = s.p;
    s.A.pos.set(HALF_LENGTH - 12, 0, 2);
    s.B.pos.set(HALF_LENGTH - 15, 0, -4);
    return s;
  }
  const cross = (mods: string[]) => {
    const s = crosser();
    for (const k of mods) s.input.setKey(k, true);
    s.tap('KeyA', 8);
    for (const k of mods) s.input.setKey(k, false);
    s.step(25);
    return s.kicks.find((k) => k.kind === 'cross')!;
  };

  it('□ normal · R1 + □ raso potente · L1 + □ bombeado alto', () => {
    const normal = cross([]);
    const ground = cross(['ShiftLeft']);
    const high = cross(['KeyQ']);
    expect(normal).toBeTruthy();
    expect(ground.vy).toBeLessThan(1);
    expect(ground.speed).toBeGreaterThan(18);
    expect(high.vy).toBeGreaterThan(normal.vy);
  });

  it('L1 + R1 + □: centro al segundo palo', () => {
    const s = crosser();
    s.input.setKey('KeyQ', true);
    s.input.setKey('ShiftLeft', true);
    s.tap('KeyA', 8);
    s.input.setKey('KeyQ', false);
    s.input.setKey('ShiftLeft', false);
    s.step(25);
    expect(s.kicks.some((k) => k.kind === 'cross')).toBe(true);
    // el balón va hacia el lado contrario (segundo palo, z < 0)
    let crossed = false;
    for (let i = 0; i < 180 && !crossed; i++) { s.step(1); if (s.m.ball.pos.z < 0) crossed = true; }
    expect(crossed).toBe(true);
  });

  it('L2 + □: centro anticipado con rosca desde tres cuartos', () => {
    const s = setup();
    s.p.pos.set(HALF_LENGTH - 40, 0, 14);
    s.m.ball.reset(HALF_LENGTH - 39.5, 14);
    s.m.owner = s.p;
    s.input.setKey('ControlLeft', true);
    s.tap('KeyA', 8);
    s.input.setKey('ControlLeft', false);
    s.step(25);
    const k = s.kicks.find((x) => x.kind === 'cross');
    expect(k).toBeTruthy();
    expect(k!.spin).toBeGreaterThan(25);
  });
});

describe('Regates y conducción', () => {
  it('L2 mantenido con el balón: protege con el cuerpo (lento y más difícil de robar)', () => {
    const s = setup();
    s.input.setKey('ControlLeft', true);
    s.input.setKey('ArrowRight', true);
    s.step(60);
    expect(s.p.shielding).toBe(true);
    expect(Math.hypot(s.p.vel.x, s.p.vel.z)).toBeLessThan(2.8);
    s.input.setKey('ControlLeft', false);
    s.input.setKey('ArrowRight', false);
  });

  it('R1 mantenido + stick: conducción de precisión (balón pegado, algo más lenta)', () => {
    const s = setup();
    s.input.setKey('ShiftLeft', true);
    s.input.setKey('ArrowRight', true);
    s.step(60);
    expect(s.p.precision).toBe(true);
    const d = Math.hypot(s.m.ball.pos.x - s.p.pos.x, s.m.ball.pos.z - s.p.pos.z);
    expect(d).toBeLessThan(1.0);
    s.input.setKey('ShiftLeft', false);
    s.input.setKey('ArrowRight', false);
  });

  it('L1 mantenido antes de recibir: deja pasar el balón', () => {
    const s = setup();
    s.tap('KeyS', 3);
    s.step(3);
    expect(s.team.controlled).toBe(s.A);
    s.input.setKey('KeyQ', true);
    s.step(150);
    s.input.setKey('KeyQ', false);
    expect(s.m.owner === s.A).toBe(false);
  });
});

describe('Defensa y arquero', () => {
  function defense() {
    const s = setup({ attack: false });
    const c = s.m.teams[1].players[9];
    c.pos.set(-10, 0, 0);
    c.clearAction();
    s.m.ball.reset(-10.5, 0);
    s.m.owner = c;
    s.p.pos.set(-4, 0, 0);
    s.p.facing = -Math.PI / 2;
    return { ...s, c };
  }

  it('✕ mantenido cerca del portador: contiene por delante (sin entrar)', () => {
    const s = defense();
    s.p.pos.set(-15, 0, 0); // entre el portador y nuestro arco
    s.input.setKey('KeyS', true);
    s.step(40);
    s.input.setKey('KeyS', false);
    const d = Math.hypot(s.p.pos.x - s.c.pos.x, s.p.pos.z - s.c.pos.z);
    expect(d).toBeGreaterThan(1);
    expect(d).toBeLessThan(3.5);
    expect(s.p.action.kind).not.toBe('tackle');
  });

  it('□ mantenido: barrida al soltar, con más alcance cuanto más se mantiene', () => {
    const a = defense();
    a.tap('KeyA', 2);
    const v1 = Math.hypot(a.p.vel.x, a.p.vel.z);
    expect(a.p.action.kind).toBe('slide');
    const b = defense();
    b.tap('KeyA', 36);
    const v2 = Math.hypot(b.p.vel.x, b.p.vel.z);
    expect(b.p.action.kind).toBe('slide');
    expect(v2).toBeGreaterThan(v1);
  });

  it('R1 doble toque y mantener: presión de equipo', () => {
    const s = defense();
    s.tap('ShiftLeft', 2);
    s.input.setKey('ShiftLeft', true);
    s.step(5);
    expect(s.team.teamPressUntil).toBeGreaterThan(s.m.time);
    s.input.setKey('ShiftLeft', false);
  });

  it('△ doble toque: el arquero se queda en la línea; mantener: sale', () => {
    const s = defense();
    s.tap('KeyW', 2);
    s.tap('KeyW', 2);
    expect(s.team.gkHoldLineUntil).toBeGreaterThan(s.m.time);
    s.input.setKey('KeyW', true);
    s.step(20);
    s.input.setKey('KeyW', false);
    expect(s.team.gkRushUntil).toBeGreaterThan(s.m.time - 0.1);
  });

  it('carga con el hombro: pulsar ✕ corriendo pegado al portador', () => {
    const s = defense();
    s.p.pos.set(-10, 0, 0.9);
    s.p.vel.set(-6, 0, 0);
    s.c.vel.set(-6, 0, 0);
    let tries = 0;
    let won = false;
    for (let i = 0; i < 40 && !won; i++) {
      s.p.pos.set(s.c.pos.x, 0, s.c.pos.z + 0.9);
      s.p.vel.set(-6, 0, 0);
      s.p.stunnedUntil = 0;
      won = s.m.shoulderChallenge(s.p, s.c);
      tries++;
      if (!won) { s.m.owner = s.c; s.c.stunnedUntil = 0; }
    }
    expect(won).toBe(true);
    expect(tries).toBeLessThan(40);
  });

  it('arquero con el balón en las manos: △ tocado lo suelta al suelo para jugarlo', () => {
    const s = setup({ attack: false });
    const gk = s.team.goalkeeper!;
    gk.pos.set(-50, 0, 0);
    s.m.gkHolding = gk;
    s.m.ball.held = true;
    s.team.controlled = gk;
    s.tap('KeyW', 3);
    expect(s.m.gkHolding).toBeNull();
    expect(s.m.owner).toBe(gk);
    expect(s.m.ball.held).toBe(false);
  });
});

describe('Combinaciones de dos botones a la vez', () => {
  const both = (s: ReturnType<typeof setup>, k1: string, k2: string, frames = 6) => {
    s.input.setKey(k1, true);
    s.input.setKey(k2, true);
    s.step(frames);
    s.input.setKey(k1, false);
    s.input.setKey(k2, false);
    s.step(3);
  };

  it('△ + □ (W + A): centro filtrado al espacio para el que llega', () => {
    const s = setup();
    s.p.pos.set(HALF_LENGTH - 30, 0, 18);
    s.m.ball.reset(HALF_LENGTH - 29.5, 18);
    s.m.owner = s.p;
    s.A.pos.set(HALF_LENGTH - 22, 0, 2);
    both(s, 'KeyW', 'KeyA');
    const k = s.kicks.pop()!;
    expect(k.kind).toBe('cross');
    expect(k.target).toBe(s.A.id);
    expect(k.vy).toBeGreaterThan(3);
    // el destino está por delante del receptor, hacia el arco
    expect(s.A.forcedRunTarget.x).toBeGreaterThan(s.A.pos.x + 2);
  });

  it('✕ + △ (S + W): pase filtrado raso entre los dos centrales', () => {
    const s = setup();
    const d1 = s.m.teams[1].players[2];
    const d2 = s.m.teams[1].players[3];
    d1.pos.set(24, 0, -4);
    d2.pos.set(24, 0, 4);
    both(s, 'KeyS', 'KeyW');
    const k = s.kicks.pop()!;
    expect(k.kind).toBe('through');
    expect(k.vy).toBeLessThan(1);
    expect(Math.abs(s.A.forcedRunTarget.z)).toBeLessThan(3); // por el hueco entre los dos
    expect(s.A.forcedRunTarget.x).toBeGreaterThan(24);
  });

  it('✕ + □ (S + A): pase bombeado al pie', () => {
    const s = setup();
    both(s, 'KeyS', 'KeyA');
    const k = s.kicks.pop()!;
    expect(k.kind).toBe('lob');
    expect(k.target).toBe(s.A.id);
    expect(k.vy).toBeGreaterThan(6);
  });

  it('pulsados uno después de otro (no a la vez) no hacen la combinación', () => {
    const s = setup();
    s.tap('KeyS', 3);
    s.step(2);
    expect(s.kicks[0].kind).toBe('pass');
  });

  it('○ + ✕ (D + S): amago', () => {
    const s = setup();
    both(s, 'KeyD', 'KeyS', 2);
    expect(s.p.action.kind).toBe('skill');
    expect(s.kicks.length).toBe(0);
  });
});
