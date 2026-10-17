import { describe, expect, it } from 'vitest';
import { Career, SQUAD_MIN, buyPlayer, marketOffers, sellPlayer } from '../src/modes/Career';
import { TEAMS } from '../src/data/teams';
import { playerOverall } from '../src/data/teams';

function playSeason(c: Career) {
  let f = c.nextUserFixture();
  while (f) {
    const home = f.home === c.state.userTeam;
    c.recordUserResult(f, home ? 0 : 3, home ? 3 : 0, []);
    f = c.nextUserFixture();
  }
}

describe('Liga con divisiones y mercado', () => {
  it('hay Primera y Segunda; el usuario juega solo su división', () => {
    const c = Career.create(TEAMS[0].id, 3);
    expect(c.state.divisions!.first.length).toBe(8);
    expect(c.state.divisions!.second.length).toBe(8);
    expect(c.division).toBe(1);
    const ids = new Set(c.state.fixtures.flatMap((f) => [f.home, f.away]));
    expect([...ids].every((id) => c.state.divisions!.first.includes(id))).toBe(true);
  });

  it('al terminar la temporada suben 2 y bajan 2 (perdiendo todo, el usuario desciende)', () => {
    const c = Career.create(TEAMS[0].id, 4);
    playSeason(c);
    expect(c.state.seasonOver).toBe(true);
    const res = c.startNextSeason();
    expect(res.promoted.length).toBe(2);
    expect(res.relegated.length).toBe(2);
    expect(res.relegated).toContain(TEAMS[0].id);
    expect(res.userMove).toBe('down');
    expect(c.division).toBe(2);
    expect(c.state.divisions!.first).toEqual(expect.arrayContaining(res.promoted));
    // el nuevo calendario es de Segunda
    expect(c.state.fixtures.every((f) => c.state.divisions!.second.includes(f.home))).toBe(true);
    expect(c.state.otherTable?.length).toBe(8);
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

  it('una carrera guardada sin divisiones se actualiza al cargarla', () => {
    const c = Career.create(TEAMS[1].id, 6);
    const st = structuredClone(c.state);
    delete st.divisions;
    delete st.budget;
    st.teams = st.teams.filter((t) => !t.id.startsWith('seg-'));
    const old = new Career(st);
    old.migrate();
    expect(old.state.divisions!.second.length).toBe(8);
    expect(old.state.budget).toBeGreaterThan(0);
  });
});
