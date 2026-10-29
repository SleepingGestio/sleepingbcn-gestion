// generarEnlace with injected fakes. Synthetic data only; no network.
import { describe, expect, it } from 'vitest';
import { generarEnlace, type LinkDb, type LinkDeps, type LinkExistingRegistre, type LinkPartee } from '../src/link';
import { selectLinkTarget } from '../src/logic';
import type { PartneeResult } from '../src/partee';
import type { LinkResult } from '../src/partee-link';
import type { KbRow, PRecord } from '../src/types';

const NOW = new Date('2026-10-29T10:00:00Z'); // 11:00 in Madrid
const URL_NEW = 'https://m.partee.es/u77';
const SECRET = 'Zzyzx Qwerty'; // fake guest name that must never reach the result

const rec = (id: number | null, o: Partial<PRecord> = {}): PRecord => ({
  id,
  parteID: null,
  channel: 'AIRBNB',
  totalGuests: 2,
  checkInOnlineURL: null,
  ...o,
});
const kbRow = (numero: string, habitaciones: string, estado = 'Confirmada', checkIn = '2026-10-30'): KbRow => ({
  numero,
  checkIn,
  estado,
  habitaciones,
});
const row = (o: Partial<LinkExistingRegistre> = {}): LinkExistingRegistre => ({
  id_apt: 1,
  estado: 'sin_registro',
  ultimo_sync: null,
  partee_reservation_id: null,
  parte_id: null,
  is_borrador: null,
  num_viajeros: null,
  num_lote: null,
  checkin_url: null,
  checkin_url_generado: null,
  ...o,
});

interface World {
  kb?: KbRow[];
  excluded?: string[];
  existing?: LinkExistingRegistre[];
  reservations?: PartneeResult<PRecord[]>;
  link?: LinkResult;
  updated?: number;
}

function setup(w: World = {}) {
  const log = {
    partee: [] as string[],
    links: [] as Array<number | string>,
    sets: [] as Array<[string, number, string]>,
  };
  const kb = w.kb ?? [kbRow('R1', 'Apt 1')];
  const db: LinkDb = {
    kbReserva: async (n) => kb.find((r) => r.numero === n) ?? null,
    kbMismaFecha: async (d) => kb.filter((r) => r.checkIn.slice(0, 10) === d),
    isExcluded: async (n) => (w.excluded ?? []).includes(n),
    registre: async () => w.existing ?? [row()],
    apartamentos: async () => [1, 2, 3].map((id) => ({ id_apt: id, nombre: `Apt ${id}` })),
    alias: async () => [],
    establiments: async () => [1, 2, 3].map((id) => ({ id_apt: id, partee_est_id: 100 + id })),
    setCheckinUrl: async (n, a, u) => {
      log.sets.push([n, a, u]);
      return { updated: w.updated ?? 1 };
    },
  };
  const partee: LinkPartee = {
    reservations: async (est, date) => {
      log.partee.push(`${est}|${date}`);
      return w.reservations ?? { kind: 'ok', data: [rec(55)] };
    },
    createLink: async (id) => {
      log.links.push(id);
      return w.link ?? { kind: 'ok', url: URL_NEW, existed: false };
    },
  };
  const deps: LinkDeps = { db, partee, now: () => NOW };
  return { deps, log };
}

describe('generarEnlace', () => {
  it('creates the link for the single unambiguous record and stores only the URL', async () => {
    const { deps, log } = setup();
    expect(await generarEnlace('R1', deps)).toEqual({ ok: true, code: 'created', url: URL_NEW });
    expect(log.partee).toEqual(['101|2026-10-30']);
    expect(log.links).toEqual([55]);
    expect(log.sets).toEqual([['R1', 1, URL_NEW]]);
  });

  it('"already existed" from Partee => code existing, still stored', async () => {
    const { deps, log } = setup({ link: { kind: 'ok', url: URL_NEW, existed: true } });
    expect(await generarEnlace('R1', deps)).toEqual({ ok: true, code: 'existing', url: URL_NEW });
    expect(log.sets).toHaveLength(1);
  });

  it('a record that already carries the URL is reused without link/create', async () => {
    const { deps, log } = setup({
      reservations: { kind: 'ok', data: [rec(55, { checkInOnlineURL: 'https://l.partee.es/x9' })] },
    });
    expect(await generarEnlace('R1', deps)).toEqual({ ok: true, code: 'existing', url: 'https://l.partee.es/x9' });
    expect(log.links).toEqual([]);
    expect(log.sets).toEqual([['R1', 1, 'https://l.partee.es/x9']]);
  });

  it.each([
    ['checkin_url_generado', { checkin_url_generado: 'https://m.partee.es/g1' }, 'https://m.partee.es/g1'],
    ['checkin_url', { checkin_url: 'https://m.partee.es/c1' }, 'https://m.partee.es/c1'],
  ])('guard 6: a stored %s is returned with no Partee call and no write', async (_n, patch, url) => {
    const { deps, log } = setup({ existing: [row(patch)] });
    expect(await generarEnlace('R1', deps)).toEqual({ ok: true, code: 'existing', url });
    expect(log.partee).toEqual([]);
    expect(log.links).toEqual([]);
    expect(log.sets).toEqual([]);
  });

  it.each([
    ['not_found', { kb: [] as KbRow[] }],
    ['excluded', { excluded: ['R1'] }],
    ['cancelled', { kb: [kbRow('R1', 'Apt 1', 'Cancelada')] }],
    ['cancelled', { kb: [kbRow('R1', 'Apt 1', 'No show')] }],
    ['past_checkin', { kb: [kbRow('R1', 'Apt 1', 'Confirmada', '2026-10-28')] }],
    ['not_single_unit', { kb: [kbRow('R1', 'Apt 1, Apt 2')], existing: [row(), row({ id_apt: 2 })] }],
    ['not_single_unit', { kb: [kbRow('R1', 'Apt 1, Apt 2')] }],
    ['no_units', { kb: [kbRow('R1', 'Apt 9')] }],
    ['conflict', { kb: [kbRow('R1', 'Apt 1'), kbRow('R2', 'Apt 1')] }],
    ['stale_state', { existing: [] as LinkExistingRegistre[] }],
    ['stale_state', { existing: [row({ estado: 'iniciado' })] }],
    ['stale_state', { existing: [row({ id_apt: 2 })] }],
  ] as const)('%s: refuses before any Partee call or write', async (code, world) => {
    const { deps, log } = setup(world as World);
    expect(await generarEnlace('R1', deps)).toEqual({ ok: false, code });
    expect(log.partee).toEqual([]);
    expect(log.links).toEqual([]);
    expect(log.sets).toEqual([]);
  });

  it('today is allowed (Europe/Madrid)', async () => {
    const { deps } = setup({ kb: [kbRow('R1', 'Apt 1', 'Confirmada', '2026-10-29')] });
    expect((await generarEnlace('R1', deps)).ok).toBe(true);
  });

  it.each([
    ['empty => not_in_partee', { reservations: { kind: 'empty' } }, 'not_in_partee', undefined],
    ['2 records => ambiguous', { reservations: { kind: 'ok', data: [rec(1), rec(2)] } }, 'ambiguous', undefined],
    [
      'record with parteID => stale_state',
      { reservations: { kind: 'ok', data: [rec(1, { parteID: 9 })] } },
      'stale_state',
      undefined,
    ],
    [
      'PARTEE channel => stale_state',
      { reservations: { kind: 'ok', data: [rec(1, { channel: 'PARTEE' })] } },
      'stale_state',
      undefined,
    ],
    ['record without id => not_in_partee', { reservations: { kind: 'ok', data: [rec(null)] } }, 'not_in_partee', undefined],
    ['read 401', { reservations: { kind: 'unauthorized' } }, 'partee_unauthorized', 'read:401'],
    ['read 429', { reservations: { kind: 'rate_limited', retryAfter: '5' } }, 'partee_rate_limited', 'read:429'],
    ['read error 500', { reservations: { kind: 'error', status: 500 } }, 'partee_error', 'read:500'],
    ['read error 404', { reservations: { kind: 'error', status: 404 } }, 'partee_error', 'read:404'],
    ['read network error (status 0)', { reservations: { kind: 'error', status: 0 } }, 'partee_error', 'read:error'],
    ['link 401 (no detail from the client)', { link: { kind: 'unauthorized' } }, 'partee_unauthorized', 'link:401'],
    ['link 403', { link: { kind: 'forbidden' } }, 'partee_unauthorized', 'link:403'],
    ['link 403 keeps the client detail', { link: { kind: 'forbidden', detail: 'link:403 "x"' } }, 'partee_unauthorized', 'link:403 "x"'],
    ['link 429', { link: { kind: 'rate_limited', retryAfter: null } }, 'partee_rate_limited', 'link:429'],
    ['link 404', { link: { kind: 'not_found', detail: 'link:404' } }, 'not_in_partee', undefined],
    ['link 400', { link: { kind: 'error', status: 400 } }, 'partee_error', 'link:400'],
    [
      'link 400 with message',
      { link: { kind: 'error', status: 400, detail: 'link:400 "Invalid reservation"' } },
      'partee_error',
      'link:400 "Invalid reservation"',
    ],
    ['link network', { link: { kind: 'error', status: 0, detail: 'link:network' } }, 'partee_error', 'link:network'],
    ['link status 0 without detail', { link: { kind: 'error', status: 0 } }, 'partee_error', 'link:error'],
  ] as const)('%s writes nothing', async (_n, world, code, detail) => {
    const { deps, log } = setup(world as World);
    const expected = detail === undefined ? { ok: false, code } : { ok: false, code, detail };
    expect(await generarEnlace('R1', deps)).toEqual(expected);
    expect(log.sets).toEqual([]);
  });

  it('RPC updated 0 (row moved on meanwhile) => stale_state', async () => {
    const { deps } = setup({ updated: 0 });
    expect(await generarEnlace('R1', deps)).toEqual({ ok: false, code: 'stale_state' });
  });

  it('never exposes guest data from the Partee record', async () => {
    const r = { ...rec(55), guestName: SECRET } as PRecord;
    const { deps } = setup({ reservations: { kind: 'ok', data: [r] } });
    expect(JSON.stringify(await generarEnlace('R1', deps))).not.toContain(SECRET);
  });
});

describe('selectLinkTarget', () => {
  it('only one id-bearing record without parteID / PARTEE channel qualifies', () => {
    expect(selectLinkTarget([])).toEqual({ kind: 'none' });
    expect(selectLinkTarget([rec(1)])).toEqual({ kind: 'target', record: rec(1) });
    expect(selectLinkTarget([rec(1), rec(2)])).toEqual({ kind: 'ambiguous' });
    expect(selectLinkTarget([rec(1), rec(2, { parteID: 3 })])).toEqual({ kind: 'stale' });
    expect(selectLinkTarget([rec(1, { channel: ' partee ' })])).toEqual({ kind: 'stale' });
    expect(selectLinkTarget([rec(null)])).toEqual({ kind: 'none' });
  });
});
