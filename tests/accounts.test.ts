import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS del servidor (sin tipos)
import { Accounts } from '../server/accounts.mjs';

const ok = { name: 'Pao', email: 'pao@gmail.com', password: 'clave-segura-1' };

describe('Cuentas', () => {
  it('registra, inicia sesión con correo o nombre y rechaza datos malos', async () => {
    const a = new Accounts(null);
    const r = await a.register(ok);
    expect(r.token).toHaveLength(64);
    expect(a.auth(r.token)?.name).toBe('Pao');
    expect((await a.login({ who: 'PAO@gmail.com', password: ok.password })).token).toBeTruthy();
    expect((await a.login({ who: 'pao', password: ok.password })).token).toBeTruthy();
    expect((await a.login({ who: 'pao', password: 'otra-clave-123' })).error).toBeTruthy();
    expect((await a.login({ who: 'nadie', password: ok.password })).error).toBeTruthy();
    expect((await a.register({ ...ok, name: 'Otro' })).error).toMatch(/correo/);
    expect((await a.register({ ...ok, email: 'x@y.com' })).error).toMatch(/nombre/);
    expect((await a.register({ ...ok, name: 'a', email: 'b@c.com' })).error).toBeTruthy();
    expect((await a.register({ ...ok, name: 'Bea', email: 'malo' })).error).toBeTruthy();
    expect((await a.register({ ...ok, name: 'Bea', email: 'b@c.com', password: 'corta' })).error).toBeTruthy();
  });

  it('no guarda la contraseña ni el token en claro y el cierre de sesión lo invalida', async () => {
    const a = new Accounts(null);
    const r = await a.register(ok);
    const dump = JSON.stringify([...a.users.values()]);
    expect(dump).not.toContain(ok.password);
    expect(dump).not.toContain(r.token);
    a.logout(a.auth(r.token), r.token);
    expect(a.auth(r.token)).toBeNull();
  });

  it('sincroniza por clave: gana la escritura más reciente y se ignoran claves ajenas', async () => {
    const a = new Accounts(null);
    const u = a.auth((await a.register(ok)).token);
    a.sync(u, { club: { v: '{"coins":1}', t: 100 }, settings: { v: 'x', t: 100 } });
    const d = a.sync(u, { club: { v: '{"coins":0}', t: 50 }, career: { v: '{"w":1}', t: 10 } });
    expect(d.club).toEqual({ v: '{"coins":1}', t: 100 });
    expect(d.career.v).toBe('{"w":1}');
    expect(d.settings).toBeUndefined();
    expect(a.sync(u, { club: { v: '{"coins":9}', t: 200 } }).club.v).toBe('{"coins":9}');
  });
});
