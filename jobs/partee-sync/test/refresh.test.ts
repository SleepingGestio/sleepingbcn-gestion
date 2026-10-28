// refreshReserva with injected fakes. Synthetic data only; no real guest data, no network.
import { describe, expect, it } from 'vitest';
import {
  refreshReserva,
  type ExistingRegistre,
  type RefreshDb,
  type RefreshDeps,
  type RefreshPartee,
  type UpsertResult,
} from '../src/refresh';
import type { PartneeResult } from '../src/partee';
import type { KbRow, ParteFacts, PRecord, RegistreRow } from '../src/types';

const NOW = new Date('2026-10-28T10:00:00Z');
const SECRET = 'Zzyzx Qwerty'; // fake guest name that must never reach the rows or the result

const rec = (id: number, parteID: number | null, channel = 'PARTEE', guests = 2): PRecord & { guestName: string } => ({
  id,
  parteID,
  channel,
  totalGuests: guests,
  checkInOnlineURL: `https://m.partee.es/u${id}`,
  guestName: SECRET, // extra field a real response would carry; toRecord() drops it, fakes here prove we never copy it
});
const facts = (o: Partial<ParteFacts> = {}): ParteFacts => ({ isBorrador: false, anulado: false, numLote: null, numViajeros: 2, ...o });

interface World {
  kb?: KbRow[];
  excluded?: string[];
  existing?: ExistingRegistre[];
  reservations?: Record<string, PartneeResult<PRecord[]>>; // "estId|YYYY-MM-DD"
  partes?: Record<string, PartneeResult<ParteFacts>>;
  upsertResult?: Partial<UpsertResult>;
}

const kbRow = (numero: string, habitaciones: string, estado = 'Confirmada', checkIn = '2026-10-29'): KbRow => ({
  numero,
  checkIn,
  estado,
  habitaciones,
});

function setup(w: World = {}) {
  const log = { reads: [] as string[], partee: [] as string[], parte: [] as string[], sleeps: [] as number[], upserts: [] as RegistreRow[][] };
  const kb = w.kb ?? [kbRow('R1', 'Apt 1')];
  const db: RefreshDb = {
    kbReserva: async (n) => (log.reads.push('kbReserva'), kb.find((r) => r.numero === n) ?? null),
    kbMismaFecha: async (d) => (log.reads.push('kbMismaFecha'), kb.filter((r) => r.checkIn.slice(0, 10) === d)),
    isExcluded: async (n) => (log.reads.push('isExcluded'), (w.excluded ?? []).includes(n)),
    registre: async (n) => (log.reads.push('registre'), (w.existing ?? []).filter(() => n === n)),
    apartamentos: async () => (
      log.reads.push('apartamentos'),
      [1, 2, 3, 4, 9].map((id) => ({ id_apt: id, nombre: `Apt ${id}` }))
    ),
    alias: async () => (log.reads.push('alias'), []),
    establiments: async () => (
      log.reads.push('establiments'),
      [1, 2, 3, 4].map((id) => ({ id_apt: id, partee_est_id: 100 + id }))
    ),
    upsert: async (rows) => {
      log.reads.push('upsert');
      log.upserts.push(rows);
      return { upserted: rows.length, needs_review: [], ...w.upsertResult };
    },
  };
  const partee: RefreshPartee = {
    reservations: async (est, date) => {
      const key = `${est}|${date}`;
      log.partee.push(key);
      return w.reservations?.[key] ?? { kind: 'empty' };
    },
    parte: async (id) => {
      log.parte.push(String(id));
      return w.partes?.[String(id)] ?? { kind: 'error', status: 404 };
    },
  };
  const deps: RefreshDeps = { db, partee, now: () => NOW, sleep: async (ms) => void log.sleeps.push(ms) };
  return { deps, log };
}

const ex = (id_apt: number, estado: string, o: Partial<ExistingRegistre> = {}): ExistingRegistre => ({
  id_apt,
  estado,
  ultimo_sync: '2026-10-28T08:00:00Z', // two hours ago: no cooldown
  partee_reservation_id: null,
  parte_id: null,
  is_borrador: null,
  num_viajeros: null,
  num_lote: null,
  checkin_url: null,
  ...o,
});

describe('refreshReserva', () => {
  it('excluded: no Partee call, no write', async () => {
    const { deps, log } = setup({ excluded: ['R1'] });
    expect(await refreshReserva('R1', deps)).toEqual({ ok: false, code: 'excluded' });
    expect(log.partee).toHaveLength(0);
    expect(log.upserts).toHaveLength(0);
  });

  it('cancelled / no show in KB: no Partee call', async () => {
    for (const estado of ['Cancelada', 'No show']) {
      const { deps, log } = setup({ kb: [kbRow('R1', 'Apt 1', estado)] });
      expect(await refreshReserva('R1', deps)).toEqual({ ok: false, code: 'cancelled' });
      expect(log.partee).toHaveLength(0);
    }
  });

  it('unknown reservation: not_found', async () => {
    const { deps } = setup();
    expect(await refreshReserva('NOPE', deps)).toEqual({ ok: false, code: 'not_found' });
  });

  it('not in Partee at all: row created as sin_registro and code not_in_partee', async () => {
    const { deps, log } = setup(); // every query answers "empty"
    const r = await refreshReserva('R1', deps);
    expect(r).toMatchObject({ ok: true, code: 'not_in_partee', upserted: 1 });
    expect(log.upserts[0]).toHaveLength(1);
    expect(log.upserts[0][0]).toMatchObject({
      numero_reserva: 'R1',
      id_apt: 1,
      estado: 'sin_registro',
      parte_id: null,
      checkin_url: null,
    });
  });

  it('only an iCal record (no PARTEE record): sin_registro, but NOT "not_in_partee"', async () => {
    const { deps } = setup({ reservations: { '101|2026-10-29': { kind: 'ok', data: [rec(1, null, 'AIRBNB', 0)] } } });
    const r = await refreshReserva('R1', deps);
    expect(r.ok && r.code).toBeUndefined();
    expect(r.ok && r.estados).toEqual([{ id_apt: 1, estado: 'sin_registro', num_viajeros: null }]);
  });

  it('new row creation from a draft parte (borrador with viajeros)', async () => {
    const { deps, log } = setup({
      reservations: { '101|2026-10-29': { kind: 'ok', data: [rec(1, null, 'AIRBNB', 0), rec(2, 900)] } },
      partes: { '900': { kind: 'ok', data: facts({ isBorrador: true, numViajeros: 1 }) } },
    });
    const r = await refreshReserva('R1', deps);
    expect(r).toMatchObject({ ok: true, upserted: 1, estados: [{ id_apt: 1, estado: 'borrador', num_viajeros: 1 }] });
    expect(log.upserts[0][0]).toMatchObject({
      estado: 'borrador',
      parte_id: 900,
      partee_reservation_id: 2,
      checkin_url: 'https://m.partee.es/u2',
      ultimo_sync: NOW.toISOString(),
      actualizado_en: NOW.toISOString(),
    });
  });

  it('existing row is updated with the fresh state (borrador -> finalizado)', async () => {
    const { deps, log } = setup({
      existing: [ex(1, 'borrador', { parte_id: 900, num_viajeros: 1 })],
      reservations: { '101|2026-10-29': { kind: 'ok', data: [rec(2, 900)] } },
      partes: { '900': { kind: 'ok', data: facts({ numLote: 'L-1', numViajeros: 2 }) } },
    });
    await refreshReserva('R1', deps);
    expect(log.upserts[0][0]).toMatchObject({ estado: 'finalizado', num_viajeros: 2, num_lote: 'L-1' });
  });

  it('finalizado stays finalizado when Partee returns no record (row kept, only ultimo_sync moves)', async () => {
    const { deps, log } = setup({
      existing: [
        ex(1, 'finalizado', {
          parte_id: 900,
          partee_reservation_id: 2,
          num_viajeros: 2,
          num_lote: 'L-1',
          is_borrador: false,
          checkin_url: null,
        }),
      ],
    });
    const r = await refreshReserva('R1', deps);
    expect(r).toMatchObject({ ok: true, code: 'not_in_partee' });
    expect(log.upserts[0][0]).toEqual({
      numero_reserva: 'R1',
      id_apt: 1,
      fecha_checkin: '2026-10-29',
      partee_reservation_id: 2,
      parte_id: 900,
      estado: 'finalizado',
      is_borrador: false,
      num_viajeros: 2,
      num_lote: 'L-1',
      checkin_url: null,
      ultimo_sync: NOW.toISOString(),
      actualizado_en: NOW.toISOString(),
    });
  });

  it('a Partee-reopened parte (finalizado -> borrador) is allowed, like in the job: sent as borrador', async () => {
    const { deps, log } = setup({
      existing: [ex(1, 'finalizado', { parte_id: 900 })],
      reservations: { '101|2026-10-29': { kind: 'ok', data: [rec(2, 900)] } },
      partes: { '900': { kind: 'ok', data: facts({ isBorrador: true, numViajeros: 2 }) } },
    });
    const r = await refreshReserva('R1', deps);
    expect(r).toMatchObject({ ok: true, upserted: 1, needs_review: [] });
    expect(log.upserts[0][0]).toMatchObject({ estado: 'borrador' });
  });

  it('an existing sent row that would receive "iniciado" is passed to the RPC, which reports needs_review', async () => {
    const { deps, log } = setup({
      existing: [ex(1, 'finalizado', { parte_id: 900 })],
      reservations: { '101|2026-10-29': { kind: 'ok', data: [rec(3, null, 'PARTEE', 0)] } },
      upsertResult: { upserted: 0, needs_review: [{ numero_reserva: 'R1', id_apt: 1 }] },
    });
    const r = await refreshReserva('R1', deps);
    expect(log.upserts[0][0]).toMatchObject({ estado: 'iniciado' });
    expect(r).toMatchObject({ ok: true, upserted: 0, needs_review: [{ numero_reserva: 'R1', id_apt: 1 }] });
  });

  it('three units: three Partee queries, delay between Partee calls, ONE RPC call with 3 rows', async () => {
    const { deps, log } = setup({
      kb: [kbRow('R1', 'Apt 1, Apt 2, Apt 3')],
      reservations: {
        '101|2026-10-29': { kind: 'ok', data: [rec(1, 901)] },
        '102|2026-10-29': { kind: 'ok', data: [rec(2, 902)] },
        '103|2026-10-29': { kind: 'empty' },
      },
      partes: { '901': { kind: 'ok', data: facts() }, '902': { kind: 'ok', data: facts({ isBorrador: true }) } },
    });
    const r = await refreshReserva('R1', deps);
    expect(log.partee).toEqual(['101|2026-10-29', '102|2026-10-29', '103|2026-10-29']);
    expect(log.parte).toEqual(['901', '902']);
    expect(log.upserts).toHaveLength(1);
    expect(log.upserts[0].map((x) => [x.id_apt, x.estado])).toEqual([[1, 'finalizado'], [2, 'borrador'], [3, 'sin_registro']]);
    expect(log.sleeps).toEqual([250, 250, 250, 250]); // between the 5 Partee calls
    expect(r).toMatchObject({ ok: true, upserted: 3 });
    expect(r.ok && r.code).toBeUndefined(); // not every unit was empty
  });

  it('more than 3 units: too_many_units, nothing is called', async () => {
    const { deps, log } = setup({ kb: [kbRow('R1', 'Apt 1, Apt 2, Apt 3, Apt 4')] });
    expect(await refreshReserva('R1', deps)).toEqual({ ok: false, code: 'too_many_units' });
    expect(log.partee).toHaveLength(0);
  });

  it('units that are not enabled in Partee: no_units', async () => {
    const { deps, log } = setup({ kb: [kbRow('R1', 'Apt 9')] });
    expect(await refreshReserva('R1', deps)).toEqual({ ok: false, code: 'no_units' });
    expect(log.partee).toHaveLength(0);
  });

  it('two reservations on the same unit and day: conflict, nothing is called', async () => {
    const { deps, log } = setup({ kb: [kbRow('R1', 'Apt 1'), kbRow('R2', 'Apt 1')] });
    expect(await refreshReserva('R1', deps)).toEqual({ ok: false, code: 'conflict' });
    expect(log.partee).toHaveLength(0);
  });

  it('a conflict on one unit only skips that unit', async () => {
    const { deps, log } = setup({
      kb: [kbRow('R1', 'Apt 1, Apt 2'), kbRow('R2', 'Apt 2')],
      reservations: { '101|2026-10-29': { kind: 'ok', data: [rec(1, 901)] } },
      partes: { '901': { kind: 'ok', data: facts() } },
    });
    const r = await refreshReserva('R1', deps);
    expect(log.partee).toEqual(['101|2026-10-29']);
    expect(r).toMatchObject({ ok: true, upserted: 1, conflicts: 1 });
  });

  it('rate limit (429) on a reservations query: partee_rate_limited, nothing written', async () => {
    const { deps, log } = setup({ reservations: { '101|2026-10-29': { kind: 'rate_limited', retryAfter: '120' } } });
    expect(await refreshReserva('R1', deps)).toEqual({ ok: false, code: 'partee_rate_limited' });
    expect(log.upserts).toHaveLength(0);
  });

  it('rate limit on the parte read: partee_rate_limited, nothing written', async () => {
    const { deps, log } = setup({
      reservations: { '101|2026-10-29': { kind: 'ok', data: [rec(1, 901)] } },
      partes: { '901': { kind: 'rate_limited', retryAfter: null } },
    });
    expect(await refreshReserva('R1', deps)).toEqual({ ok: false, code: 'partee_rate_limited' });
    expect(log.upserts).toHaveLength(0);
  });

  it('401 / network / 5xx from Partee: partee_error, nothing written', async () => {
    for (const bad of [{ kind: 'unauthorized' }, { kind: 'error', status: 500 }] as PartneeResult<PRecord[]>[]) {
      const { deps, log } = setup({ reservations: { '101|2026-10-29': bad } });
      expect(await refreshReserva('R1', deps)).toEqual({ ok: false, code: 'partee_error' });
      expect(log.upserts).toHaveLength(0);
    }
    const { deps, log } = setup({
      reservations: { '101|2026-10-29': { kind: 'ok', data: [rec(1, 901)] } },
      partes: { '901': { kind: 'error', status: 500 } },
    });
    expect(await refreshReserva('R1', deps)).toEqual({ ok: false, code: 'partee_error' });
    expect(log.upserts).toHaveLength(0);
  });

  it('cooldown: a row synced less than 30 s ago blocks the call before any Partee read', async () => {
    const { deps, log } = setup({ existing: [ex(1, 'borrador', { ultimo_sync: '2026-10-28T09:59:50Z' })] }); // 10 s ago
    expect(await refreshReserva('R1', deps)).toEqual({ ok: false, code: 'cooldown', retryInSeconds: 20 });
    expect(log.partee).toHaveLength(0);
    expect(log.reads).not.toContain('apartamentos'); // stops right after the cheap reads
  });

  it('cooldown uses the most recent ultimo_sync of all units, and an old one does not block', async () => {
    const { deps } = setup({
      kb: [kbRow('R1', 'Apt 1, Apt 2')],
      existing: [ex(1, 'borrador', { ultimo_sync: '2026-10-28T08:00:00Z' }), ex(2, 'borrador', { ultimo_sync: '2026-10-28T09:59:45Z' })],
    });
    expect(await refreshReserva('R1', deps)).toMatchObject({ ok: false, code: 'cooldown' });
    const old = setup({ existing: [ex(1, 'borrador', { ultimo_sync: '2026-10-28T09:59:00Z' })] }); // 60 s ago
    expect(await refreshReserva('R1', old.deps)).toMatchObject({ ok: true });
  });

  it('never keeps or returns guest personal data', async () => {
    const { deps, log } = setup({
      reservations: { '101|2026-10-29': { kind: 'ok', data: [rec(1, null, 'AIRBNB', 0), rec(2, 900)] } },
      partes: { '900': { kind: 'ok', data: facts() } },
    });
    const r = await refreshReserva('R1', deps);
    expect(JSON.stringify([r, log.upserts])).not.toContain(SECRET);
  });

  it('subrequest budget for 3 units: 1+1+1 reads, 4 reads, 6 Partee calls, 1 RPC = well under 50', async () => {
    const { deps, log } = setup({
      kb: [kbRow('R1', 'Apt 1, Apt 2, Apt 3')],
      reservations: {
        '101|2026-10-29': { kind: 'ok', data: [rec(1, 901)] },
        '102|2026-10-29': { kind: 'ok', data: [rec(2, 902)] },
        '103|2026-10-29': { kind: 'ok', data: [rec(3, 903)] },
      },
      partes: { '901': { kind: 'ok', data: facts() }, '902': { kind: 'ok', data: facts() }, '903': { kind: 'ok', data: facts() } },
    });
    await refreshReserva('R1', deps);
    const dbCalls = log.reads.length; // kbReserva, isExcluded, registre, apartamentos, alias, establiments, kbMismaFecha, upsert
    const partee = log.partee.length + log.parte.length;
    expect(dbCalls).toBe(8);
    expect(partee).toBe(6);
    expect(dbCalls + partee).toBeLessThan(50);
  });
});
