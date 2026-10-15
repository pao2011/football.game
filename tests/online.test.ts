import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { DIVISIONS, divisionIndex, divisionInfo, rivalsDelta } from '../server/divisions.mjs';
// @ts-expect-error módulo JS del servidor (sin tipos)
import { Lobby } from '../server/lobby.mjs';
import { GuestSync, HostSync } from '../src/net/NetSync';
import { RemoteInput, captureFrame, mergeFrames, type InputFrame } from '../src/net/RemoteInput';
import { HumanController } from '../src/control/HumanController';
import { Input } from '../src/input/Input';
import { normalizeServer } from '../src/net/NetClient';

class FakeWs {
  sent: any[] = [];
  handlers: Record<string, (d?: any) => void> = {};
  send(s: string) { this.sent.push(JSON.parse(s)); }
  on(ev: string, fn: (d?: any) => void) { this.handlers[ev] = fn; }
  msg(o: object) { this.handlers.message(JSON.stringify(o)); }
  close() { this.handlers.close(); }
  last(t: string) { return [...this.sent].reverse().find((m) => m.t === t); }
}

function memStore() {
  const m = new Map<string, any>();
  return { get: (id: string) => m.get(id), set: (id: string, r: any) => m.set(id, r), top: (n: number) => [...m.values()].sort((a, b) => b.points - a.points).slice(0, n) };
}

function hello(lobby: any, name: string) {
  const ws = new FakeWs();
  lobby.connect(ws);
  ws.msg({ t: 'hello', id: `id-${name}-0123456789`, name });
  return ws;
}

describe('Division Rivals', () => {
  it('divisiones de la 10 a Élite y puntos', () => {
    expect(DIVISIONS.length).toBe(11);
    expect(divisionIndex(0)).toBe(0);
    expect(divisionIndex(120)).toBe(1);
    expect(divisionInfo(2500).name).toBe('Élite');
    expect(rivalsDelta(2, 0, 0, 0)).toBe(35);
    expect(rivalsDelta(1, 1, 0, 0)).toBe(10);
    expect(rivalsDelta(0, 1, 0, 0)).toBe(-12);
    expect(rivalsDelta(0, 0, 0, 0, true)).toBe(-20);
    // ganar a alguien de división superior da más
    expect(rivalsDelta(1, 0, 0, 600)).toBeGreaterThan(rivalsDelta(1, 0, 0, 0));
  });
});

describe('Servidor online (sala de espera)', () => {
  it('empareja en Rivals, reenvía mensajes y reparte puntos si los dos informan lo mismo', () => {
    const lobby = new Lobby(memStore());
    const a = hello(lobby, 'Ana');
    const b = hello(lobby, 'Beto');
    expect(a.last('welcome').profile.division.name).toBe('División 10');
    a.msg({ t: 'queue', mode: 'rivals', team: 'aurora' });
    b.msg({ t: 'queue', mode: 'rivals', team: 'brasa' });
    const ma = a.last('match');
    const mb = b.last('match');
    expect(ma.role).toBe('host');
    expect(mb.role).toBe('guest');
    expect(ma.seed).toBe(mb.seed);
    expect(ma.home.team).toBe('aurora');
    a.msg({ t: 'relay', d: { k: 's', x: 1 } });
    expect(b.last('relay').d.x).toBe(1);
    a.msg({ t: 'result', home: 2, away: 1, pens: -1 });
    b.msg({ t: 'result', home: 2, away: 1, pens: -1 });
    expect(a.last('final').change.delta).toBe(30);
    expect(b.last('final').change.delta).toBe(0); // derrota con 0 puntos: no baja de 0
    expect(a.last('final').profile.points).toBe(30);
  });

  it('resultados distintos no cuentan; abandonar es derrota', () => {
    const lobby = new Lobby(memStore());
    const a = hello(lobby, 'Ana');
    const b = hello(lobby, 'Beto');
    a.msg({ t: 'queue', mode: 'rivals' });
    b.msg({ t: 'queue', mode: 'rivals' });
    a.msg({ t: 'result', home: 3, away: 0 });
    b.msg({ t: 'result', home: 0, away: 3 });
    expect(a.last('final').disputed).toBe(true);
    a.msg({ t: 'queue', mode: 'rivals' });
    b.msg({ t: 'queue', mode: 'rivals' });
    b.close();
    expect(a.last('opponentLeft')).toBeTruthy();
    const f = a.last('final');
    expect(f.outcome.home + f.outcome.away).toBe(3);
    expect(f.change.delta).toBeGreaterThan(0);
  });

  it('salas privadas con código', () => {
    const lobby = new Lobby(memStore());
    const a = hello(lobby, 'Ana');
    const b = hello(lobby, 'Beto');
    a.msg({ t: 'create', team: 'marea', half: 3 });
    const code = a.last('room').code;
    expect(code).toMatch(/^[A-Z0-9]{5}$/);
    b.msg({ t: 'join', code: 'ZZZZZ' });
    expect(b.last('error')).toBeTruthy();
    b.msg({ t: 'join', code: code.toLowerCase() });
    expect(a.last('match').half).toBe(3);
    expect(b.last('match').mode).toBe('friendly');
  });

  it('en Rivals no empareja divisiones muy distintas enseguida', () => {
    const store = memStore();
    let now = 0;
    const lobby = new Lobby(store, { now: () => now });
    const a = hello(lobby, 'Ana');
    const b = hello(lobby, 'Beto');
    store.get('id-Beto-0123456789').points = 1500;
    a.msg({ t: 'queue', mode: 'rivals' });
    b.msg({ t: 'queue', mode: 'rivals' });
    expect(a.last('match')).toBeUndefined();
    now = 60000; // tras un minuto se amplía la búsqueda
    lobby.matchmake();
    expect(a.last('match')).toBeTruthy();
  });
});

describe('Sincronización online', () => {
  it('el invitado reproduce el estado del anfitrión (jugadores, balón, marcador, cambios)', () => {
    const host = makeMatch({ seed: 21 });
    const guest = makeMatch({ seed: 21 });
    const input = new Input(undefined, false);
    const hc = new HumanController(input, { right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, -1) }, { autoSwitch: true, passAssist: 1, powerBarTime: 1, showAimAssist: true, assist: false });
    const sync = new HostSync(host, hc, 1);
    const gs = new GuestSync(guest);
    let t = 0;
    for (let i = 0; i < 60 * 8; i++) {
      host.step();
      sync.collect(host.events);
      host.events.length = 0;
      if (i === 200) host.substitute(host.teams[1], host.teams[1].players[6], host.teams[1].bench[1]);
      const s = sync.step(1 / 60);
      if (s) gs.push(JSON.parse(JSON.stringify(s)), (t += 1000 / 30));
    }
    gs.delay = 0;
    gs.update(t);
    expect(guest.playersAll.map((p) => p.id)).toEqual(host.playersAll.map((p) => p.id));
    for (let i = 0; i < host.playersAll.length; i++) {
      expect(guest.playersAll[i].pos.distanceTo(host.playersAll[i].pos)).toBeLessThan(0.5);
    }
    expect(guest.ball.pos.distanceTo(host.ball.pos)).toBeLessThan(0.6);
    expect(guest.phase).toBe(host.phase);
    expect(guest.teams[1].subsUsed).toBe(1);
  });

  it('mandos remotos: pulsaciones breves no se pierden aunque lleguen juntas', () => {
    const ri = new RemoteInput();
    const base: InputFrame = { h: 0, mx: 0, my: 0, rx: 0, ry: 0, rf: null, pt: 0, ts: 0, vm: 0, gp: false, bx: 1, bz: 0, fx: 0, fz: -1 };
    const passBit = 1 << 5; // ACTIONS[5] = 'pass'
    const frames = [base, { ...base, h: passBit }, base, base, base, base, base, base, base];
    ri.push(frames);
    let pressed = false;
    for (let i = 0; i < 6; i++) {
      ri.poll(1 / 60);
      if (ri.pressed('pass')) pressed = true;
    }
    expect(pressed).toBe(true);
    expect(mergeFrames({ ...base, h: 1 }, { ...base, h: 2 }).h).toBe(3);
    const local = new Input(undefined, false);
    local.setKey('ArrowRight', true);
    local.poll(1 / 60);
    const f = captureFrame(local, { x: 1, z: 0 }, { x: 0, z: -1 });
    expect(f.mx).toBe(1);
    ri.push([f]);
    ri.poll(1 / 60);
    expect(ri.move().x).toBe(1);
  });

  it('direcciones de servidor', () => {
    expect(normalizeServer('192.168.1.20:8080')).toBe('ws://192.168.1.20:8080/ws');
    expect(normalizeServer('mi-futbol.onrender.com')).toBe('wss://mi-futbol.onrender.com/ws');
    expect(normalizeServer('https://x.example.com/')).toBe('wss://x.example.com/ws');
    expect(normalizeServer('')).toBe('');
  });
});

describe('Mismo club en los dos lados (online)', () => {
  it('los 22 jugadores tienen identificadores distintos y el partido se juega', async () => {
    const { TEAMS } = await import('../src/data/teams');
    const m = makeMatch({ home: TEAMS[0], away: TEAMS[0], seed: 4 });
    const ids = new Set(m.playersAll.map((p) => p.id));
    expect(ids.size).toBe(22);
    expect(m.teams[1].bench.every((p) => !m.teams[0].bench.some((q) => q.id === p.id))).toBe(true);
    m.simulate(30);
    expect(m.teams[0].stats.passes + m.teams[1].stats.passes).toBeGreaterThan(3);
    // el invitado (mismo config) obtiene los mismos ids
    const g = makeMatch({ home: TEAMS[0], away: TEAMS[0], seed: 4 });
    expect(g.playersAll.map((p) => p.id)).toEqual(makeMatch({ home: TEAMS[0], away: TEAMS[0], seed: 4 }).playersAll.map((p) => p.id));
  });
});
