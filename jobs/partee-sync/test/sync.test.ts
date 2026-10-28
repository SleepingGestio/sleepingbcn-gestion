// End-to-end tests of runSync with a fake fetch (Supabase + Partee). Synthetic data only.
import { describe, expect, it } from 'vitest';
import { PartneeUnauthorizedError, runSync, type Deps } from '../src/sync';
import type { Env } from '../src/types';

const env: Env = {
  PARTEE_API_TOKEN: 'test-token',
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
};

const SECRET = 'Zzyzx Qwerty'; // fake guest name that must never be persisted or returned

type Responder = () => Response;
const ok = (body: unknown): Responder => () => new Response(JSON.stringify(body), { status: 200 });
const status = (s: number, body = '', headers: Record<string, string> = {}): Responder =>
  () => new Response(body, { status: s, headers });

const ical = (id: number) => ({ id, channel: 'AIRBNB', totalGuests: 0, guestName: SECRET });
const partee = (id: number, parteID: number | null, guests = 2) => ({
  id,
  channel: 'PARTEE',
  parteID,
  totalGuests: guests,
  checkInOnlineURL: `https://m.partee.es/u${id}`,
  guestName: SECRET,
  guestEmail: 'secret@example.test',
});
const parte = (o: Record<string, unknown>, n = 2) => ({
  parteId: 1,
  isBorrador: false,
  ministerioAnulacion: false,
  viajeros: Array.from({ length: n }, () => ({ nombre: SECRET, documento: 'X0000000A' })),
  ...o,
});

interface World {
  kb: Array<Record<string, string>>;
  reservations: Record<string, Responder>; // "estId|dd-MM-yyyy"
  partes: Record<string, Responder>; // parteId
  existing?: Array<{ numero_reserva: string; id_apt: number; estado: string }>; // current partee_registre rows
  excluded?: string[]; // numero_reserva rows of partee_exclusion
  exclusionReadStatus?: number; // make the partee_exclusion read fail with this HTTP status
}

function setup(w: World) {
  const log = { partee: [] as string[], parte: [] as string[], upserts: [] as Record<string, unknown>[][], other: [] as string[] };
  const f = (async (input: Request | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (u.host === 'sb.test') {
      const table = u.pathname.replace('/rest/v1/', '');
      if (method === 'POST' && table === 'partee_registre') {
        log.upserts.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 201 });
      }
      switch (table) {
        case 'partee_establiment':
          return new Response(JSON.stringify([
            { id_apt: 1, partee_est_id: 101 },
            { id_apt: 2, partee_est_id: 102 },
            { id_apt: 3, partee_est_id: 103 },
          ]));
        case 'apartamentos':
          return new Response(JSON.stringify([
            { id_apt: 1, nombre: 'Apt 1' },
            { id_apt: 2, nombre: 'Apt 2' },
            { id_apt: 3, nombre: 'Apt 3' },
            { id_apt: 9, nombre: 'Apt 9' },
          ]));
        case 'partee_registre':
          return new Response(JSON.stringify(w.existing ?? []));
        case 'partee_exclusion':
          if (w.exclusionReadStatus) return new Response('{"message":"boom"}', { status: w.exclusionReadStatus });
          return new Response(JSON.stringify((w.excluded ?? []).map((numero_reserva) => ({ numero_reserva }))));
        case 'apartamentos_alias_kb':
          return new Response(JSON.stringify([]));
        case 'reservas_kb':
          return new Response(JSON.stringify(w.kb));
      }
      log.other.push(`${method} ${table}`);
      return new Response('[]');
    }
    if (u.pathname.endsWith('/reservation/external/reservations')) {
      const b = JSON.parse(String(init?.body)) as { accomodationID: string; checkinDate: string };
      const key = `${b.accomodationID}|${b.checkinDate}`;
      log.partee.push(key);
      return (w.reservations[key] ?? status(404, 'no reservations found'))();
    }
    const m = u.pathname.match(/\/parteviajeros\/external\/(\d+)$/);
    if (m && method === 'GET') {
      log.parte.push(m[1]);
      return (w.partes[m[1]] ?? status(404))();
    }
    throw new Error(`unexpected request ${method} ${u}`);
  }) as typeof fetch;
  const deps: Deps = { fetch: f, now: () => new Date('2026-10-28T10:00:00Z'), sleep: async () => {} };
  return { deps, log };
}

const kb = (numero: string, habitaciones: string, checkIn = '2026-10-28', estado = 'Confirmada') => ({
  'Número': numero,
  'Check in': checkIn,
  'Estado': estado,
  'Habitaciones': habitaciones,
});

const opts = { dry: false, from: null, to: null } as const;

describe('runSync', () => {
  it('maps iCal+PARTEE, only-iCal, iniciado, draft, finalized, annulled and never leaks guest data', async () => {
    const { deps, log } = setup({
      kb: [
        kb('R-DRAFT', 'Apt 1'),
        kb('R-ICAL', 'Apt 2'),
        kb('R-INI', 'Apt 3'),
        kb('R-FIN', 'Apt 1', '2026-10-29'),
        kb('R-ANU', 'Apt 2', '2026-10-29'),
      ],
      reservations: {
        '101|28-10-2026': ok([ical(1), partee(2, 900)]),
        '102|28-10-2026': ok([ical(3)]),
        '103|28-10-2026': ok([ical(4), partee(5, null, 0)]),
        '101|29-10-2026': ok([ical(6), partee(7, 901, 3)]),
        '102|29-10-2026': ok([partee(8, 902, 1)]),
      },
      partes: {
        '900': ok(parte({ isBorrador: true })),
        '901': ok(parte({ numLoteMinisterio: 'LOTE-1' }, 3)),
        '902': ok(parte({ ministerioAnulacion: true }, 1)),
      },
    });
    const s = await runSync(env, opts, deps);

    const rows = Object.fromEntries(log.upserts[0].map((r) => [r.numero_reserva as string, r]));
    expect(rows['R-DRAFT']).toMatchObject({ estado: 'borrador', parte_id: 900, partee_reservation_id: 2, num_viajeros: 2, is_borrador: true, checkin_url: 'https://m.partee.es/u2' });
    expect(rows['R-ICAL']).toMatchObject({ estado: 'sin_registro', parte_id: null, checkin_url: null });
    expect(rows['R-INI']).toMatchObject({ estado: 'iniciado', parte_id: null, partee_reservation_id: 5, checkin_url: 'https://m.partee.es/u5' });
    expect(rows['R-FIN']).toMatchObject({ estado: 'finalizado', num_viajeros: 3, num_lote: 'LOTE-1' });
    expect(rows['R-ANU']).toMatchObject({ estado: 'anulado', num_viajeros: 1 });
    expect(Object.keys(rows['R-FIN'])).not.toContain('ses_codigo_estado');
    expect(Object.keys(rows['R-FIN'])).not.toContain('ses_desc');
    expect(rows['R-FIN'].actualizado_en).toBe('2026-10-28T10:00:00.000Z');

    expect(s.partee_calls).toBe(5);
    expect(s.parte_calls).toBe(3);
    expect(s.kb_pairs).toBe(5);
    expect(s.upserts).toEqual({ borrador: 1, sin_registro: 1, iniciado: 1, finalizado: 1, anulado: 1 });

    const everything = JSON.stringify([log.upserts, s]);
    expect(everything).not.toContain(SECRET);
    expect(everything).not.toContain('secret@example.test');
    expect(everything).not.toContain('X0000000A');
  });

  it('multi-room reservation yields one row per Partee-enabled unit', async () => {
    const { deps, log } = setup({
      kb: [kb('MULTI', 'Apt 1,  Apt 2, Apt 9')],
      reservations: { '101|28-10-2026': ok([partee(1, 910)]), '102|28-10-2026': ok([partee(2, 911)]) },
      partes: { '910': ok(parte({})), '911': ok(parte({ isBorrador: true })) },
    });
    const s = await runSync(env, opts, deps);
    expect(log.upserts[0].map((r) => [r.numero_reserva, r.id_apt, r.estado])).toEqual([
      ['MULTI', 1, 'finalizado'],
      ['MULTI', 2, 'borrador'],
    ]);
    expect(s.ignored_units).toBe(1); // Apt 9 has no establishment
  });

  it('two KB reservations on the same unit/date: counted as conflict, no call, no rows', async () => {
    const { deps, log } = setup({ kb: [kb('A', 'Apt 1'), kb('B', 'Apt 1')], reservations: {}, partes: {} });
    const s = await runSync(env, opts, deps);
    expect(s.conflicts).toBe(1);
    expect(s.partee_calls).toBe(0);
    expect(log.upserts).toHaveLength(0);
  });

  it('404 "no reservations" is an empty date, not a failure', async () => {
    const { deps, log } = setup({ kb: [kb('R1', 'Apt 1')], reservations: {}, partes: {} });
    const s = await runSync(env, opts, deps);
    expect(s.empty_dates).toBe(1);
    expect(s.failures).toBe(0);
    expect(log.upserts[0][0]).toMatchObject({ estado: 'sin_registro' });
  });

  it('429 stops the run, records Retry-After and keeps rows of dates not reached untouched', async () => {
    const { deps, log } = setup({
      kb: [kb('R1', 'Apt 1'), kb('R2', 'Apt 2'), kb('R3', 'Apt 3')],
      reservations: {
        '101|28-10-2026': ok([partee(1, 920)]),
        '102|28-10-2026': status(429, '', { 'Retry-After': '120' }),
        '103|28-10-2026': ok([partee(3, 921)]),
      },
      partes: { '920': ok(parte({})) },
    });
    const s = await runSync(env, opts, deps);
    expect(s.rate_limited).toEqual({ hit: true, retry_after: '120' });
    expect(log.partee).toEqual(['101|28-10-2026', '102|28-10-2026']); // no retry, no third call
    expect(log.upserts[0].map((r) => r.numero_reserva)).toEqual(['R1']);
  });

  it('401 aborts with a clear error and writes nothing', async () => {
    const { deps, log } = setup({ kb: [kb('R1', 'Apt 1')], reservations: { '101|28-10-2026': status(401) }, partes: {} });
    await expect(runSync(env, opts, deps)).rejects.toBeInstanceOf(PartneeUnauthorizedError);
    expect(log.upserts).toHaveLength(0);
  });

  it('a failed Partee call counts a failure and leaves those rows untouched', async () => {
    const { deps, log } = setup({
      kb: [kb('R1', 'Apt 1'), kb('R2', 'Apt 2')],
      reservations: { '101|28-10-2026': status(500, 'boom'), '102|28-10-2026': ok([ical(1)]) },
      partes: {},
    });
    const s = await runSync(env, opts, deps);
    expect(s.failures).toBe(1);
    expect(log.upserts[0].map((r) => r.numero_reserva)).toEqual(['R2']);
  });

  it('a failed parte call also leaves the rows untouched', async () => {
    const { deps, log } = setup({
      kb: [kb('R1', 'Apt 1')],
      reservations: { '101|28-10-2026': ok([partee(1, 930)]) },
      partes: { '930': status(500) },
    });
    const s = await runSync(env, opts, deps);
    expect(s.failures).toBe(1);
    expect(log.upserts).toHaveLength(0);
  });

  it('ambiguous: several records with parteID pick one and report the others by id', async () => {
    const { deps, log } = setup({
      kb: [kb('R1', 'Apt 1')],
      reservations: { '101|28-10-2026': ok([partee(1, 940, 1), partee(2, 941, 4)]) },
      partes: { '941': ok(parte({})) },
    });
    const s = await runSync(env, opts, deps);
    expect(s.ambiguous).toBe(1);
    expect(s.unmatched_partee_records).toEqual([1]);
    expect(log.parte).toEqual(['941']);
  });

  it('dry run reads but never writes', async () => {
    const { deps, log } = setup({
      kb: [kb('R1', 'Apt 1')],
      reservations: { '101|28-10-2026': ok([partee(1, 950)]) },
      partes: { '950': ok(parte({})) },
    });
    const s = await runSync(env, { ...opts, dry: true }, deps);
    expect(s.dry).toBe(true);
    expect(s.upserts).toEqual({ finalizado: 1 });
    expect(log.upserts).toHaveLength(0);
  });

  it('stops cleanly when the read budget is reached', async () => {
    const { deps, log } = setup({
      kb: [kb('R1', 'Apt 1'), kb('R2', 'Apt 2'), kb('R3', 'Apt 3')],
      reservations: { '101|28-10-2026': ok([ical(1)]), '102|28-10-2026': ok([ical(2)]), '103|28-10-2026': ok([ical(3)]) },
      partes: {},
    });
    const s = await runSync(env, { ...opts, readBudget: 2 }, deps);
    expect(s.budget_exceeded).toBe(true);
    expect(s.partee_calls).toBe(2);
    expect(log.partee).toHaveLength(2);
  });

  it('only reads: never sends a write verb to Partee', async () => {
    const calls: string[] = [];
    const { deps } = setup({ kb: [kb('R1', 'Apt 1')], reservations: { '101|28-10-2026': ok([partee(1, 960)]) }, partes: { '960': ok(parte({})) } });
    const inner = deps.fetch;
    deps.fetch = (async (i: Request | URL, init?: RequestInit) => {
      if (new URL(String(i)).host === 'app.partee.es') calls.push(`${init?.method} ${new URL(String(i)).pathname}`);
      return inner(i, init);
    }) as typeof fetch;
    await runSync(env, opts, deps);
    expect(calls).toEqual(['POST /resources/api/reservation/external/reservations', 'GET /resources/api/parteviajeros/external/960']);
  });

  describe('never downgrades a sent parte', () => {
    const existing = (numero: string, estado: string, id_apt = 1) => ({ numero_reserva: numero, id_apt, estado });

    it('finalizado + empty date: row kept, listed in needs_review', async () => {
      const { deps, log } = setup({ kb: [kb('R1', 'Apt 1')], reservations: {}, partes: {}, existing: [existing('R1', 'finalizado')] });
      const s = await runSync(env, opts, deps);
      expect(s.empty_dates).toBe(1);
      expect(s.needs_review).toEqual([{ numero_reserva: 'R1', id_apt: 1 }]);
      expect(log.upserts).toHaveLength(0);
    });

    it('anulado + record without parteID (iniciado): row kept, needs_review', async () => {
      const { deps, log } = setup({
        kb: [kb('R1', 'Apt 1')],
        reservations: { '101|28-10-2026': ok([ical(1), partee(2, null, 0)]) },
        partes: {},
        existing: [existing('R1', 'anulado')],
      });
      const s = await runSync(env, opts, deps);
      expect(s.needs_review).toEqual([{ numero_reserva: 'R1', id_apt: 1 }]);
      expect(log.upserts).toHaveLength(0);
    });

    it('finalizado + failed Partee call: row kept, failure counted, needs_review', async () => {
      const { deps, log } = setup({
        kb: [kb('R1', 'Apt 1')],
        reservations: { '101|28-10-2026': status(500) },
        partes: {},
        existing: [existing('R1', 'finalizado')],
      });
      const s = await runSync(env, opts, deps);
      expect(s.failures).toBe(1);
      expect(s.needs_review).toEqual([{ numero_reserva: 'R1', id_apt: 1 }]);
      expect(log.upserts).toHaveLength(0);
    });

    it('finalizado + failed parte call: also needs_review', async () => {
      const { deps } = setup({
        kb: [kb('R1', 'Apt 1')],
        reservations: { '101|28-10-2026': ok([partee(1, 970)]) },
        partes: { '970': status(500) },
        existing: [existing('R1', 'finalizado')],
      });
      const s = await runSync(env, opts, deps);
      expect(s.needs_review).toEqual([{ numero_reserva: 'R1', id_apt: 1 }]);
    });

    it('a failed call on a non-sent row is not flagged', async () => {
      const { deps } = setup({
        kb: [kb('R1', 'Apt 1')],
        reservations: { '101|28-10-2026': status(500) },
        partes: {},
        existing: [existing('R1', 'borrador')],
      });
      expect((await runSync(env, opts, deps)).needs_review).toEqual([]);
    });

    it('other transitions still apply: finalizado -> anulado, borrador -> sin_registro', async () => {
      const { deps, log } = setup({
        kb: [kb('R1', 'Apt 1'), kb('R2', 'Apt 2')],
        reservations: { '101|28-10-2026': ok([partee(1, 980)]), '102|28-10-2026': ok([ical(2)]) },
        partes: { '980': ok(parte({ ministerioAnulacion: true })) },
        existing: [existing('R1', 'finalizado'), existing('R2', 'borrador', 2)],
      });
      const s = await runSync(env, opts, deps);
      expect(s.needs_review).toEqual([]);
      expect(log.upserts[0].map((r) => [r.numero_reserva, r.estado])).toEqual([['R1', 'anulado'], ['R2', 'sin_registro']]);
    });
  });

  describe('excluded reservations (partee_exclusion)', () => {
    it('skips excluded reservations: no Partee reads, no rows, counted in skipped_excluded', async () => {
      const { deps, log } = setup({
        kb: [kb('EXCL', 'Apt 1'), kb('KEEP', 'Apt 2')],
        reservations: { '101|28-10-2026': ok([partee(1, 990)]), '102|28-10-2026': ok([ical(2)]) },
        partes: { '990': ok(parte({})) },
        excluded: ['EXCL'],
      });
      const s = await runSync(env, opts, deps);
      expect(s.skipped_excluded).toBe(1);
      expect(s.kb_pairs).toBe(1);
      expect(log.partee).toEqual(['102|28-10-2026']); // nothing asked for Apt 1 / EXCL
      expect(log.parte).toEqual([]);
      expect(log.upserts[0].map((r) => r.numero_reserva)).toEqual(['KEEP']);
    });

    it('an excluded multi-room reservation generates no reads for any unit', async () => {
      const { deps, log } = setup({
        kb: [kb('MULTI', 'Apt 1, Apt 2')],
        reservations: {},
        partes: {},
        excluded: ['MULTI'],
      });
      const s = await runSync(env, opts, deps);
      expect(s.skipped_excluded).toBe(1);
      expect(s.partee_calls).toBe(0);
      expect(log.upserts).toHaveLength(0);
    });

    it('leaves existing partee_registre rows of an excluded reservation untouched (no write at all)', async () => {
      const { deps, log } = setup({
        kb: [kb('EXCL', 'Apt 1')],
        reservations: { '101|28-10-2026': ok([partee(1, 991)]) },
        partes: { '991': ok(parte({})) },
        existing: [{ numero_reserva: 'EXCL', id_apt: 1, estado: 'finalizado' }],
        excluded: ['EXCL'],
      });
      const s = await runSync(env, opts, deps);
      expect(s.needs_review).toEqual([]);
      expect(log.upserts).toHaveLength(0);
    });

    it('aborts the run when the exclusion read fails (never syncs excluded reservations by mistake)', async () => {
      const { deps, log } = setup({
        kb: [kb('R1', 'Apt 1')],
        reservations: { '101|28-10-2026': ok([ical(1)]) },
        partes: {},
        exclusionReadStatus: 500,
      });
      await expect(runSync(env, opts, deps)).rejects.toThrow('supabase_read_failed:partee_exclusion:500');
      expect(log.partee).toHaveLength(0);
      expect(log.upserts).toHaveLength(0);
    });

    it('has no effect when the exclusion set is empty', async () => {
      const world = {
        kb: [kb('R1', 'Apt 1')],
        reservations: { '101|28-10-2026': ok([partee(1, 992)]) },
        partes: { '992': ok(parte({})) },
      };
      const a = setup({ ...world, excluded: [] });
      const sa = await runSync(env, opts, a.deps);
      expect(sa.skipped_excluded).toBe(0);
      expect(sa.kb_pairs).toBe(1);
      expect(a.log.upserts[0].map((r) => r.numero_reserva)).toEqual(['R1']);
    });
  });
});
