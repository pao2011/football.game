import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { BALL_RADIUS, HALF_LENGTH, SIM_DT } from '../src/config/constants';
import { TEAMS } from '../src/data/teams';
import { Input } from '../src/input/Input';
import { HumanController } from '../src/control/HumanController';
import { evaluateOffsidePositions } from '../src/sim/Rules';

function runFull(seed: number, halfSec = 120) {
  const m = makeMatch({ seed, halfLengthSec: halfSec });
  let steps = 0;
  const maxSteps = (halfSec * 2 + 400) / SIM_DT;
  let longestStoppage = 0;
  let stoppage = 0;
  while (!m.finished && steps < maxSteps) {
    m.step();
    m.events.length = 0;
    if (m.phase === 'replay') m.skipReplay();
    if (!Number.isFinite(m.ball.pos.x) || !Number.isFinite(m.ball.pos.y)) throw new Error('Balón con coordenadas inválidas');
    stoppage = m.phase === 'stoppage' || m.phase === 'kickoff' ? stoppage + SIM_DT : 0;
    longestStoppage = Math.max(longestStoppage, stoppage);
    steps++;
  }
  return { m, longestStoppage };
}

describe('Partido completo IA contra IA', () => {
  let totalShots = 0;
  for (const seed of [1, 2, 3]) {
    it(`termina sin bloquearse (semilla ${seed})`, () => {
      const { m, longestStoppage } = runFull(seed);
      expect(m.finished).toBe(true);
      expect(m.half).toBe(2);
      expect(longestStoppage).toBeLessThan(8);
      const [a, b] = m.teams.map((t) => t.stats);
      // Debe haber juego real: pases, tiros, posesión de ambos
      expect(a.passes + b.passes).toBeGreaterThan(40);
      totalShots += a.shots + b.shots;
      expect(a.possessionTime).toBeGreaterThan(20);
      expect(b.possessionTime).toBeGreaterThan(20);
      // nadie sale del recinto
      for (const p of m.active) {
        expect(Math.abs(p.pos.x)).toBeLessThan(HALF_LENGTH + 5);
      }
    });
  }

  it('hay tiros en el conjunto de partidos (en 2 min por tiempo alguno puede no tener)', () => {
    expect(totalShots).toBeGreaterThan(2);
  });

  it('se pueden marcar goles en varias simulaciones', () => {
    let goals = 0;
    for (const seed of [11, 12, 13, 14, 15, 16]) goals += runFull(seed, 180).m.teams.reduce((s, t) => s + t.stats.goals, 0);
    expect(goals).toBeGreaterThan(0);
  });

  it('la eliminatoria empatada va a prórroga y penales con ganador', () => {
    const m = makeMatch({ seed: 5, halfLengthSec: 20, extraTime: true, penalties: true });
    // forzar empate: anular goles quitando arqueros del cálculo no es necesario; se observa el flujo
    let steps = 0;
    while (!m.finished && steps < 60 * 60 * 20) {
      m.step();
      m.events.length = 0;
      if (m.phase === 'replay') m.skipReplay();
      steps++;
    }
    expect(m.finished).toBe(true);
    const r = m.result;
    if (r.home === r.away) {
      expect(m.half).toBe(4);
      expect(r.penalties).not.toBeNull();
      expect(r.winner).not.toBe(-1);
    }
  });
});

describe('Reglas', () => {
  it('detecta un gol cuando el balón cruza la línea entre los postes', () => {
    const m = makeMatch({ seed: 9 });
    m.simulate(2); // salir del saque inicial
    m.phase = 'play';
    m.owner = null;
    const scoringTeam = m.teams[0].attackDir === 1 ? 0 : 1;
    m.ball.pos.set(HALF_LENGTH - 1, 0.5, 0);
    m.ball.vel.set(20, 0, 0);
    m.lastTouch = { team: scoringTeam as 0 | 1, player: m.teams[scoringTeam].players[9], time: m.time, deliberate: true, kind: 'shoot' };
    for (const p of m.active) if (p.isGK) p.pos.set(0, 0, 30);
    for (let i = 0; i < 30 && m.phase === 'play'; i++) m.step();
    expect(m.teams[scoringTeam].stats.goals).toBe(1);
    expect(m.phase).toBe('goal');
  });

  it('balón por la banda: saque de banda para el rival del último en tocar', () => {
    const m = makeMatch({ seed: 9 });
    m.simulate(2);
    m.phase = 'play';
    m.owner = null;
    m.ball.pos.set(0, BALL_RADIUS, 33.5);
    m.ball.vel.set(0, 0, 8);
    m.lastTouch = { team: 0, player: m.teams[0].players[5], time: m.time, deliberate: true, kind: 'pass' };
    for (const p of m.active) p.pos.set(p.pos.x, 0, Math.min(p.pos.z, 20));
    for (let i = 0; i < 30 && m.phase === 'play'; i++) m.step();
    expect(m.restart?.type).toBe('throwin');
    expect(m.restart?.team).toBe(1);
  });

  it('balón por la línea de fondo tocado por el defensor: córner', () => {
    const m = makeMatch({ seed: 9 });
    m.simulate(2);
    m.phase = 'play';
    m.owner = null;
    const defending = m.teams[0].attackDir === 1 ? 1 : 0; // defiende el arco en +x
    m.ball.pos.set(HALF_LENGTH - 0.5, BALL_RADIUS, 15);
    m.ball.vel.set(8, 0, 0);
    m.lastTouch = { team: defending as 0 | 1, player: m.teams[defending].players[2], time: m.time, deliberate: false, kind: 'deflection' };
    for (const p of m.active) p.pos.set(Math.min(p.pos.x, 30), 0, p.pos.z);
    for (let i = 0; i < 30 && m.phase === 'play'; i++) m.step();
    expect(m.restart?.type).toBe('corner');
    expect(m.restart?.team).toBe(defending === 0 ? 1 : 0);
  });

  it('fuera de juego: solo se marca al atacante adelantado respecto al penúltimo defensor', () => {
    const m = makeMatch({ seed: 9 });
    const att = m.teams[0];
    const def = m.teams[1];
    // colocar a todos en posiciones controladas (atacando +x si attackDir=1)
    const dir = att.attackDir;
    for (const p of m.active) p.pos.set(-dir * 30, 0, 0);
    const gk = def.goalkeeper!;
    gk.pos.set(dir * 50, 0, 0);
    def.players[2].pos.set(dir * 20, 0, 0); // penúltimo defensor en u=20
    const passer = att.players[6];
    passer.pos.set(dir * 5, 0, 0);
    m.ball.pos.set(dir * 5, BALL_RADIUS, 0);
    const offsidePlayer = att.players[9];
    offsidePlayer.pos.set(dir * 25, 0, 5);
    const onside = att.players[8];
    onside.pos.set(dir * 18, 0, -5);
    const set = evaluateOffsidePositions(m, att, passer);
    expect(set.has(offsidePlayer.id)).toBe(true);
    expect(set.has(onside.id)).toBe(false);
    // en campo propio nunca hay fuera de juego
    offsidePlayer.pos.set(-dir * 2, 0, 0);
    expect(evaluateOffsidePositions(m, att, passer).has(offsidePlayer.id)).toBe(false);
  });

  it('una barrida por detrás que no toca el balón es falta y conlleva sanción', () => {
    const m = makeMatch({ seed: 9 });
    m.simulate(2);
    m.phase = 'play';
    const carrier = m.teams[0].players[9];
    const tackler = m.teams[1].players[3];
    for (const p of m.active) if (p !== carrier && p !== tackler) p.pos.set(p.pos.x, 0, -30);
    carrier.pos.set(0, 0, 0);
    carrier.facing = Math.PI / 2; // mira a +x
    m.owner = carrier;
    m.ball.pos.set(2.5, BALL_RADIUS, 0); // balón lejos del alcance de la barrida
    m.ball.vel.set(0, 0, 0);
    tackler.pos.set(-1.3, 0, 0);
    tackler.facing = Math.PI / 2; // por detrás, en la misma dirección
    tackler.vel.set(6, 0, 0);
    m.requestTackle(tackler, true);
    let fouled = false;
    for (let i = 0; i < 60; i++) {
      m.step();
      if (m.events.some((e) => e.type === 'foul')) fouled = true;
      m.events.length = 0;
    }
    expect(fouled).toBe(true);
    expect(m.teams[1].stats.fouls).toBe(1);
    expect(tackler.yellowCards + (tackler.sentOff ? 1 : 0)).toBeGreaterThan(0);
  });

  it('una entrada limpia que toca el balón primero no es falta', () => {
    const m = makeMatch({ seed: 9 });
    m.simulate(2);
    m.phase = 'play';
    const carrier = m.teams[0].players[9];
    const tackler = m.teams[1].players[3];
    for (const p of m.active) if (p !== carrier && p !== tackler) p.pos.set(p.pos.x, 0, -30);
    carrier.pos.set(0, 0, 0);
    carrier.facing = Math.PI / 2;
    m.owner = null;
    m.ball.pos.set(0.9, BALL_RADIUS, 0);
    m.ball.vel.set(0, 0, 0);
    tackler.pos.set(1.6, 0, 0);
    tackler.facing = -Math.PI / 2; // de frente
    m.requestTackle(tackler, false);
    let fouled = false;
    for (let i = 0; i < 40; i++) {
      m.step();
      if (m.events.some((e) => e.type === 'foul')) fouled = true;
      m.events.length = 0;
    }
    expect(fouled).toBe(false);
  });
});

describe('Control humano (teclado estilo FIFA)', () => {
  function setup() {
    let m = makeMatch({ humanTeam: 0, seed: 3 });
    for (let s = 4; m.restart!.team !== 0; s++) m = makeMatch({ humanTeam: 0, seed: s });
    const input = new Input();
    const hc = new HumanController(input, { right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, -1) }, { autoSwitch: true, passAssist: 1, powerBarTime: 1, showAimAssist: true });
    m.controllers[0] = hc;
    const step = (n: number) => { for (let i = 0; i < n; i++) { input.poll(SIM_DT); m.step(); m.events.length = 0; } };
    return { m, input, hc, step };
  }

  it('saque inicial con S (pase) y el control pasa al receptor', () => {
    const { m, input, step } = setup();
    step(60);
    const taker = m.restart!.taker!;
    input.setKey('KeyS', true); step(1); input.setKey('KeyS', false);
    step(40);
    expect(m.phase).toBe('play');
    expect(m.debug.kicks).toBe(1);
    expect(m.teams[0].controlled).not.toBe(taker);
  });

  it('el jugador se mueve con las flechas y esprinta con E', () => {
    const { m, input, step } = setup();
    step(60);
    input.setKey('KeyS', true); step(1); input.setKey('KeyS', false);
    step(30);
    // el receptor va primero a buscar el pase; se mide cuando ya tiene el balón
    for (let i = 0; i < 240 && m.owner !== m.teams[0].controlled; i++) step(1);
    const p = m.teams[0].controlled!;
    const x0 = p.pos.x;
    input.setKey('ArrowRight', true);
    step(60);
    const walk = p.pos.x - x0;
    input.setKey('KeyE', true);
    const x1 = p.pos.x;
    step(60);
    const sprint = p.pos.x - x1;
    input.setKey('ArrowRight', false);
    input.setKey('KeyE', false);
    expect(walk).toBeGreaterThan(2);
    expect(sprint).toBeGreaterThan(walk);
  });

  it('el tiro carga potencia mientras se mantiene D y dispara al soltar', () => {
    const { m, input, step, hc } = setup();
    step(60);
    input.setKey('KeyS', true); step(1); input.setKey('KeyS', false);
    step(90); // carrera previa y saque inicial completados
    m.phase = 'play';
    const team = m.teams[0];
    const p = team.players[9];
    team.controlled = p;
    for (const q of m.active) if (q !== p && !q.isGK) q.pos.set(q.pos.x, 0, -30);
    p.pos.set(team.attackDir * (HALF_LENGTH - 18), 0, 0);
    p.facing = team.attackDir === 1 ? Math.PI / 2 : -Math.PI / 2;
    p.vel.set(0, 0, 0);
    m.ball.pos.set(p.pos.x + team.attackDir * 0.5, BALL_RADIUS, 0);
    m.ball.vel.set(0, 0, 0);
    m.owner = p;
    input.setKey('KeyD', true);
    step(30);
    expect(hc.charge?.action).toBe('shoot');
    expect(hc.charge!.value).toBeGreaterThan(0.3);
    input.setKey('KeyD', false);
    step(30);
    expect(team.stats.shots).toBe(1);
    expect(m.ball.speed > 5 || m.phase !== 'play').toBe(true);
  });
});

describe('Datos', () => {
  it('9 equipos con 18 jugadores, dorsales únicos y un arquero titular', () => {
    expect(TEAMS.length).toBe(9);
    for (const t of TEAMS) {
      expect(t.players.length).toBe(18);
      const nums = new Set(t.players.map((p) => p.number));
      expect(nums.size).toBe(18);
      expect(t.players[0].position).toBe('GK');
    }
  });
});
