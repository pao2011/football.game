import { describe, expect, it } from 'vitest';
import { Career, SQUAD_MIN, buyPlayer, marketOffers, sellPlayer } from '../src/modes/Career';
import { TEAMS, playerOverall } from '../src/data/teams';
import { LEAGUES } from '../src/data/leagues';
import { ZONE_A, ZONE_B, ZONE_PAIRS, classicName, matchHeat } from '../src/data/classics';

/** El usuario pierde todos sus partidos (3-0 en contra; en playoffs queda eliminado). */
function playTorneo(c: Career) {
  let f = c.nextUserFixture();
  let guard = 0;
  while (f && guard++ < 40) {
    const home = f.home === c.state.userTeam;
    c.recordUserResult(f, home ? 0 : 3, home ? 3 : 0, []);
    f = c.nextUserFixture();
  }
  c.simulateUntilUserOrEnd();
}

describe('Liga Profesional de 30 equipos', () => {
  it('dos zonas de 15; cada equipo juega 14 de zona + 1 interzonal, uno por fecha', () => {
    const c = Career.create('boca', 3);
    expect(c.state.zones.A.length).toBe(15);
    expect(c.state.zones.B.length).toBe(15);
    expect(new Set(c.allTeams).size).toBe(30);
    for (const id of c.allTeams) {
      const mine = c.state.fixtures.filter((f) => f.home === id || f.away === id);
      expect(mine.length).toBe(15);
      expect(new Set(mine.map((f) => f.round)).size).toBe(15);
    }
    const inter = c.state.fixtures.filter((f) => c.state.zones.A.includes(f.home) !== c.state.zones.A.includes(f.away));
    expect(inter.length).toBe(15);
  });

  it('los clásicos se juegan en cada torneo (interzonal) y con localía invertida', () => {
    const c = Career.create('river', 4);
    for (const p of ZONE_PAIRS.filter((x) => x.classic)) {
      const fx = c.state.fixtures.find((f) => [f.home, f.away].includes(p.a) && [f.home, f.away].includes(p.b))!;
      expect(fx).toBeTruthy();
      expect(c.classicOf(fx)).toBe(p.classic);
      expect(fx.stage).toContain(p.classic!);
    }
    expect(classicName('boca', 'river')).toBe('Superclásico');
    expect(classicName('river', 'boca')).toBe('Superclásico');
    expect(classicName('boca', 'velez')).toBeNull();
    expect(matchHeat('boca', 'river')).toBeGreaterThan(0.5);
    expect(matchHeat('boca', 'velez')).toBe(0);
    expect(ZONE_A.some((id) => ZONE_B.includes(id))).toBe(false);
  });

  it('juega Apertura con playoffs (8+8, final neutral), luego Clausura y tabla anual', () => {
    const c = Career.create(TEAMS[0].id, 4);
    playTorneo(c);
    expect(c.state.phase).toBe('done');
    const po = c.playoffFx;
    expect(po.length).toBe(8 + 4 + 2 + 1);
    expect(po.every((f) => f.played && (f.homeGoals !== f.awayGoals || f.pens))).toBe(true);
    const final = po[po.length - 1];
    expect(final.venue).toBeTruthy();
    expect(final.stage).toMatch(/Final/);
    // los 16 de los playoffs son los 8 mejores de cada zona
    const octavos = po.slice(0, 8).flatMap((f) => [f.home, f.away]);
    expect(octavos.filter((id) => c.state.zones.A.includes(id)).length).toBe(8);
    expect(c.torneoChampion).toBeTruthy();
    expect(c.state.torneoChampions[0]).toBe(c.torneoChampion);
    c.startNextTorneo();
    expect(c.state.torneoIdx).toBe(1);
    expect(c.torneoName).toBe('Torneo Clausura');
    expect(c.state.phase).toBe('regular');
    playTorneo(c);
    expect(c.state.seasonOver).toBe(true);
    const annual = c.annualStandings();
    expect(annual.length).toBe(30);
    expect(annual.every((r) => r.played === 30)).toBe(true);
    const res = c.startNextSeason();
    expect(c.state.season).toBe(2);
    expect(c.state.history.length).toBe(1);
    expect(res.position).toBeGreaterThan(0);
    expect(c.state.torneoIdx).toBe(0);
    expect(c.state.fixtures.every((f) => !f.played)).toBe(true);
  });

  it('un usuario que ganó todo clasifica y llega a la final', () => {
    const c = Career.create('boca', 9);
    let guard = 0;
    for (let f = c.nextUserFixture(); f && guard++ < 40; f = c.nextUserFixture()) {
      c.recordUserResult(f, f.home === 'boca' ? 3 : 0, f.home === 'boca' ? 0 : 3, []);
    }
    expect(c.state.phase).toBe('done');
    expect(c.torneoChampion).toBe('boca');
    expect(c.userPlayoffResult()).toMatch(/Campe/);
  });

  it('fichar cuesta presupuesto y vender lo devuelve; se respetan los límites', () => {
    const c = Career.create(TEAMS[2].id, 5);
    c.state.budget = 500;
    const offer = marketOffers(c).find((o) => o.player.position === 'FWD')!;
    const before = c.user.players.length;
    expect(buyPlayer(c, offer.player.id)).toBe(null);
    expect(c.user.players.length).toBe(before + 1);
    expect(c.state.budget).toBeCloseTo(500 - offer.price, 1);
    expect(offer.team.players.some((p) => p.id === offer.player.id)).toBe(false);
    const b2 = c.state.budget!;
    expect(sellPlayer(c, offer.player.id, () => 0)).toBe(null);
    expect(c.state.budget!).toBeGreaterThan(b2);
    // sin dinero no se ficha
    c.state.budget = 0;
    expect(buyPlayer(c, marketOffers(c)[0].player.id)).toMatch(/presupuesto/);
    // nunca por debajo del mínimo de plantilla
    while (c.user.players.length > SQUAD_MIN) {
      const p = c.user.players.filter((x) => x.position !== 'GK').sort((a, b) => playerOverall(a) - playerOverall(b))[0];
      expect(sellPlayer(c, p.id, () => 0)).toBe(null);
    }
    expect(sellPlayer(c, c.user.players.find((x) => x.position !== 'GK')!.id)).toMatch(/al menos/);
  });

  it('todas las ligas tienen equipos completos y se pueden jugar enteras', () => {
    for (const l of LEAGUES) {
      const ids = l.teamIds();
      if (!ids.length) continue;
      expect(new Set(ids).size, l.id).toBe(ids.length);
      for (const id of ids) {
        const t = TEAMS.find((x) => x.id === id);
        expect(t, `${l.id}:${id}`).toBeTruthy();
        expect(t!.players.length).toBe(18);
        expect(new Set(t!.players.map((p) => p.number)).size).toBe(18);
      }
      const c = Career.create(ids[0], 11, l.id);
      expect(c.allTeams.length).toBe(ids.length);
      let guard = 0;
      while (!c.state.seasonOver && guard++ < 200) {
        if (c.state.phase === 'done') c.startNextTorneo();
        else {
          c.simulateUserFixture();
          c.simulateUntilUserOrEnd();
        }
      }
      expect(c.state.seasonOver, l.id).toBe(true);
      const res = c.startNextSeason();
      expect(res.champion, l.id).toBeTruthy();
      expect(c.state.season).toBe(2);
    }
  });
});

describe('Datos de todas las ligas', () => {
  it('ids de equipos y de estadios únicos, y cada estadio de club apunta a un equipo existente', async () => {
    const { STADIUMS } = await import('../src/data/stadiums');
    const teamIds = TEAMS.map((t) => t.id);
    expect(new Set(teamIds).size).toBe(teamIds.length);
    const sIds = STADIUMS.map((s) => s.id);
    expect(new Set(sIds).size).toBe(sIds.length);
    for (const s of STADIUMS) if (s.homeTeam) expect(teamIds, s.id).toContain(s.homeTeam);
  });
});
