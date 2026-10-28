import { describe, expect, it } from 'vitest';
import {
  buildRoomIndex,
  buildRow,
  buildTargetPairs,
  defaultWindow,
  deriveEstado,
  exitCodeFor,
  extractParteFacts,
  groupCalls,
  isActiveEstado,
  isoToPartee,
  parseCliArgs,
  resolveWindow,
  selectRecord,
  wouldDowngrade,
} from '../src/logic';
import type { KbRow, PRecord } from '../src/types';

const rec = (o: Partial<PRecord>): PRecord => ({
  id: 1,
  parteID: null,
  channel: 'AIRBNB',
  totalGuests: 0,
  checkInOnlineURL: null,
  ...o,
});

describe('window', () => {
  it('is today-1 .. today+7 in Madrid', () => {
    expect(defaultWindow(new Date('2026-10-28T10:00:00Z'))).toEqual({ from: '2026-10-27', to: '2026-11-04' });
  });
  it('uses the Madrid calendar day near midnight (UTC+1 in winter)', () => {
    // 23:30 UTC on the 28th is already the 29th in Madrid.
    expect(defaultWindow(new Date('2026-10-28T23:30:00Z'))).toEqual({ from: '2026-10-28', to: '2026-11-05' });
  });
  it('uses UTC+2 in summer', () => {
    expect(defaultWindow(new Date('2026-07-14T22:30:00Z'))).toEqual({ from: '2026-07-14', to: '2026-07-22' });
  });
  it('validates overrides', () => {
    const now = new Date('2026-10-28T10:00:00Z');
    expect(resolveWindow(now, '2026-10-01', '2026-10-05')).toEqual({
      ok: true,
      window: { from: '2026-10-01', to: '2026-10-05' },
    });
    expect(resolveWindow(now, '2026-10-01', null)).toMatchObject({ ok: false });
    expect(resolveWindow(now, '2026-13-01', '2026-13-02')).toMatchObject({ ok: false });
    expect(resolveWindow(now, '2026-10-05', '2026-10-01')).toMatchObject({ ok: false });
    expect(resolveWindow(now, '2026-01-01', '2026-12-31')).toMatchObject({ ok: false });
  });
  it('formats dates for Partee', () => {
    expect(isoToPartee('2026-10-28')).toBe('28-10-2026');
  });
});

describe('KB pairs', () => {
  const index = buildRoomIndex(
    [
      { id_apt: 1, nombre: 'Apt 1' },
      { id_apt: 2, nombre: 'Apt 2' },
      { id_apt: 3, nombre: 'Apt 3' },
    ],
    [{ id_apt: 3, nombre_kb: 'Apt Tres' }],
  );
  const partee = new Set([1, 2, 3]);
  const kb = (o: Partial<KbRow>): KbRow => ({
    numero: 'R1',
    checkIn: '2026-10-28',
    estado: 'Confirmada',
    habitaciones: 'Apt 1',
    ...o,
  });

  it('drops Cancelada / No show but keeps other and null estados', () => {
    expect(isActiveEstado('Cancelada')).toBe(false);
    expect(isActiveEstado('No show')).toBe(false);
    expect(isActiveEstado('Check-in realizado')).toBe(true);
    expect(isActiveEstado(null)).toBe(true);
    const r = buildTargetPairs(
      [kb({ numero: 'A', estado: 'Cancelada' }), kb({ numero: 'B', estado: 'No show', habitaciones: 'Apt 2' }), kb({ numero: 'C' })],
      index,
      partee,
    );
    expect(r.pairs.map((p) => p.numero_reserva)).toEqual(['C']);
  });

  it('splits a multi-room reservation (double spaces, alias) into one pair per unit', () => {
    const r = buildTargetPairs([kb({ numero: 'M', habitaciones: 'Apt 1,  Apt   2 , apt tres' })], index, partee);
    expect(r.pairs.map((p) => p.id_apt).sort()).toEqual([1, 2, 3]);
    expect(r.pairs.every((p) => p.numero_reserva === 'M')).toBe(true);
  });

  it('counts units without a Partee establishment and unresolved rooms, silently', () => {
    const r = buildTargetPairs([kb({ habitaciones: 'Apt 1, Apt 2, Nope' })], index, new Set([1]));
    expect(r.pairs).toHaveLength(1);
    expect(r.ignoredUnits).toBe(1);
    expect(r.unresolvedRooms).toBe(1);
  });

  it('skips both reservations when two share unit and check-in date', () => {
    const r = buildTargetPairs(
      [kb({ numero: 'X' }), kb({ numero: 'Y' }), kb({ numero: 'Z', habitaciones: 'Apt 2' })],
      index,
      partee,
    );
    expect(r.conflicts).toBe(1);
    expect(r.pairs.map((p) => p.numero_reserva)).toEqual(['Z']);
  });

  it('does not conflict across different dates and groups calls by (establishment, date)', () => {
    const r = buildTargetPairs(
      [kb({ numero: 'X' }), kb({ numero: 'Y', checkIn: '2026-10-29' }), kb({ numero: 'Z', habitaciones: 'Apt 2' })],
      index,
      partee,
    );
    expect(r.conflicts).toBe(0);
    const calls = groupCalls(r.pairs, new Map([[1, 101], [2, 102], [3, 103]]));
    expect(calls.map((c) => `${c.estId}|${c.date}`).sort()).toEqual(['101|2026-10-28', '101|2026-10-29', '102|2026-10-28']);
  });
});

describe('record selection', () => {
  const ical = rec({ id: 10, channel: 'AIRBNB' });
  const partee = rec({ id: 11, channel: 'PARTEE', parteID: 500, totalGuests: 2, checkInOnlineURL: 'https://m.partee.es/abc' });

  it('picks the record with a parteID out of an iCal + PARTEE pair', () => {
    const s = selectRecord([ical, partee]);
    expect(s).toMatchObject({ kind: 'parte', ambiguous: false });
    expect(s.kind === 'parte' && s.record.id).toBe(11);
  });
  it('with only an iCal record there is no registration', () => {
    expect(selectRecord([ical]).kind).toBe('sin_registro');
  });
  it('a PARTEE record without parteID is iniciado', () => {
    const s = selectRecord([ical, rec({ id: 12, channel: 'PARTEE', checkInOnlineURL: 'https://m.partee.es/x' })]);
    expect(s.kind).toBe('iniciado');
  });
  it('several parteIDs: most guests, then latest id, flagged ambiguous', () => {
    const a = rec({ id: 20, parteID: 1, totalGuests: 1 });
    const b = rec({ id: 21, parteID: 2, totalGuests: 3 });
    const c = rec({ id: 22, parteID: 3, totalGuests: 3 });
    const s = selectRecord([a, b, c]);
    expect(s.kind === 'parte' && s.record.id).toBe(22);
    expect(s.kind === 'parte' && s.ambiguous).toBe(true);
    expect(s.kind === 'parte' && s.extraParteRecords.map((r) => r.id)).toEqual([21, 20]);
  });
});

describe('estado derivation', () => {
  const f = (o: Record<string, unknown>) => extractParteFacts(o);
  it('annulled wins over draft', () => {
    expect(deriveEstado(f({ ministerioAnulacion: true, isBorrador: true }))).toBe('anulado');
  });
  it('draft', () => {
    expect(deriveEstado(f({ isBorrador: true, ministerioAnulacion: false }))).toBe('borrador');
  });
  it('finalized', () => {
    expect(deriveEstado(f({ isBorrador: false, ministerioAnulacion: false, numLoteMinisterio: 'L-9' }))).toBe('finalizado');
  });
  it('only counts viajeros, never keeps them', () => {
    const facts = extractParteFacts({ viajeros: [{ nombre: 'Secret Name' }, { nombre: 'Other' }], numLoteMinisterio: 77 });
    expect(facts).toEqual({ isBorrador: null, anulado: false, numLote: '77', numViajeros: 2 });
    expect(JSON.stringify(facts)).not.toContain('Secret');
  });
  it('builds a row without ses_* columns', () => {
    const row = buildRow(
      { numero_reserva: 'R1', id_apt: 1, fecha_checkin: '2026-10-28' },
      { estado: 'finalizado', record: rec({ id: 11, parteID: 500, checkInOnlineURL: 'https://m.partee.es/a' }), facts: f({ isBorrador: false, viajeros: [{}] }) },
      '2026-10-28T10:00:00.000Z',
    );
    expect(row).toMatchObject({ estado: 'finalizado', parte_id: 500, partee_reservation_id: 11, num_viajeros: 1 });
    expect(Object.keys(row).some((k) => k.startsWith('ses_'))).toBe(false);
  });
});

describe('downgrade protection', () => {
  it('protects finalizado/anulado from sin_registro and iniciado only', () => {
    expect(wouldDowngrade('finalizado', 'sin_registro')).toBe(true);
    expect(wouldDowngrade('anulado', 'iniciado')).toBe(true);
    expect(wouldDowngrade('finalizado', 'anulado')).toBe(false);
    expect(wouldDowngrade('finalizado', 'borrador')).toBe(false);
    expect(wouldDowngrade('borrador', 'sin_registro')).toBe(false);
    expect(wouldDowngrade('manual', 'sin_registro')).toBe(false);
    expect(wouldDowngrade(undefined, 'sin_registro')).toBe(false);
  });
});

describe('CLI helpers', () => {
  it('parses arguments', () => {
    expect(parseCliArgs([])).toEqual({ ok: true, args: { dry: false, from: null, to: null } });
    expect(parseCliArgs(['--dry', '--from=2026-10-01', '--to=2026-10-05'])).toEqual({
      ok: true,
      args: { dry: true, from: '2026-10-01', to: '2026-10-05' },
    });
    expect(parseCliArgs(['--nope'])).toEqual({ ok: false, error: 'unknown_argument' });
  });
  it('exit code is non-zero on failures or rate limiting', () => {
    expect(exitCodeFor({ failures: 0, rate_limited: { hit: false } })).toBe(0);
    expect(exitCodeFor({ failures: 1, rate_limited: { hit: false } })).toBe(1);
    expect(exitCodeFor({ failures: 0, rate_limited: { hit: true } })).toBe(1);
  });
});
