// Refresh ONE reservation from Partee ("Actualizar ahora"). Shared by the app Worker (via the
// `@partee-sync/*` alias) and tested here with fakes. It reuses the job's pure logic and Partee client;
// all I/O comes in through injected ports, so this file imports nothing from node or the app.
// Privacy: counts, ids and states only; guest data from Partee is never kept (see partee.ts / logic.ts).
import {
  buildRoomIndex,
  buildRow,
  buildTargetPairs,
  deriveEstado,
  isActiveEstado,
  isValidIsoDate,
  selectRecord,
  type Outcome,
} from './logic';
import type { PartneeResult } from './partee';
import type { KbRow, ParteFacts, PRecord, RegistreEstado, RegistreRow, TargetPair } from './types';

export const REFRESH_MAX_UNITS = 3;
export const REFRESH_COOLDOWN_SECONDS = 30;
const CALL_DELAY_MS = 250;

/** A partee_registre row as stored (only what a "touch" needs). */
export interface ExistingRegistre {
  id_apt: number;
  estado: string;
  ultimo_sync: string | null;
  partee_reservation_id: number | null;
  parte_id: number | null;
  is_borrador: boolean | null;
  num_viajeros: number | null;
  num_lote: string | null;
  checkin_url: string | null;
}

export interface UpsertResult {
  upserted: number;
  needs_review: Array<{ numero_reserva: string; id_apt: number }>;
}

/** Data access, implemented in the app with the CALLER's Supabase client (no service role key). */
export interface RefreshDb {
  kbReserva(numero: string): Promise<KbRow | null>;
  /** Every KB reservation whose check-in is `date` (used to detect two reservations on one unit and day). */
  kbMismaFecha(date: string): Promise<KbRow[]>;
  isExcluded(numero: string): Promise<boolean>;
  registre(numero: string): Promise<ExistingRegistre[]>;
  apartamentos(): Promise<Array<{ id_apt: number; nombre: string | null }>>;
  alias(): Promise<Array<{ id_apt: number; nombre_kb: string | null }>>;
  establiments(): Promise<Array<{ id_apt: number; partee_est_id: number }>>;
  /** One call to the partee_refresh_upsert RPC with all rows. */
  upsert(rows: RegistreRow[]): Promise<UpsertResult>;
}

export interface RefreshPartee {
  reservations(estId: number, dateIso: string): Promise<PartneeResult<PRecord[]>>;
  parte(parteId: number | string): Promise<PartneeResult<ParteFacts>>;
}

export interface RefreshDeps {
  db: RefreshDb;
  partee: RefreshPartee;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

export type RefreshFailCode =
  | 'not_found'
  | 'excluded'
  | 'cancelled'
  | 'cooldown'
  | 'no_units'
  | 'conflict'
  | 'too_many_units'
  | 'partee_rate_limited'
  | 'partee_error';

export type RefreshResult =
  | {
      ok: true;
      /** Set when Partee has no record at all for the reservation (rows are still created / touched). */
      code?: 'not_in_partee';
      upserted: number;
      needs_review: Array<{ numero_reserva: string; id_apt: number }>;
      /** Per unit, the state that was sent (counts and states only). */
      estados: Array<{ id_apt: number; estado: string; num_viajeros: number | null }>;
      /** Units skipped because another reservation has the same unit and check-in date. */
      conflicts: number;
    }
  | { ok: false; code: RefreshFailCode; retryInSeconds?: number };

const fail = (code: RefreshFailCode, extra: { retryInSeconds?: number } = {}): RefreshResult => ({
  ok: false,
  code,
  ...extra,
});

/** Same row as before with only the sync timestamps moved: "keep it and just touch ultimo_sync". */
function touchRow(pair: TargetPair, ex: ExistingRegistre, nowIso: string): RegistreRow {
  return {
    numero_reserva: pair.numero_reserva,
    id_apt: pair.id_apt,
    fecha_checkin: pair.fecha_checkin,
    partee_reservation_id: ex.partee_reservation_id,
    parte_id: ex.parte_id,
    estado: ex.estado as RegistreEstado,
    is_borrador: ex.is_borrador,
    num_viajeros: ex.num_viajeros,
    num_lote: ex.num_lote,
    checkin_url: ex.checkin_url,
    ultimo_sync: nowIso,
    actualizado_en: nowIso,
  };
}

export async function refreshReserva(
  numeroRaw: string,
  deps: RefreshDeps,
  opts: { cooldownSeconds?: number; delayMs?: number } = {},
): Promise<RefreshResult> {
  const { db, partee, now, sleep } = deps;
  const cooldown = opts.cooldownSeconds ?? REFRESH_COOLDOWN_SECONDS;
  const delay = opts.delayMs ?? CALL_DELAY_MS;
  const numero = numeroRaw.trim();

  // 1. Cheap reads first: the reservation, its exclusion and its current rows.
  const kb = await db.kbReserva(numero);
  if (!kb) return fail('not_found');
  const [excluded, existing] = await Promise.all([db.isExcluded(numero), db.registre(numero)]);
  if (excluded) return fail('excluded');
  if (!isActiveEstado(kb.estado)) return fail('cancelled'); // same Cancelada / No show list as the job

  // 2. Cooldown from the most recent ultimo_sync of the reservation's rows (the hourly job updates it too).
  const lastMs = Math.max(
    ...existing.map((e) => (e.ultimo_sync ? Date.parse(e.ultimo_sync) : Number.NaN)).filter((n) => Number.isFinite(n)),
    Number.NEGATIVE_INFINITY,
  );
  if (Number.isFinite(lastMs)) {
    const elapsed = (now().getTime() - lastMs) / 1000;
    if (elapsed < cooldown) return fail('cooldown', { retryInSeconds: Math.max(1, Math.ceil(cooldown - elapsed)) });
  }

  // 3. Units of the reservation that are enabled in Partee, and conflicts with other reservations.
  const date = kb.checkIn.slice(0, 10);
  if (!isValidIsoDate(date)) return fail('not_found');
  const [apts, alias, ests, sameDay] = await Promise.all([
    db.apartamentos(),
    db.alias(),
    db.establiments(),
    db.kbMismaFecha(date),
  ]);
  const estByApt = new Map(ests.map((e) => [e.id_apt, e.partee_est_id]));
  const index = buildRoomIndex(apts, alias);
  const enabled = new Set(estByApt.keys());
  const own = buildTargetPairs([kb], index, enabled).pairs; // this reservation alone
  if (own.length === 0) return fail('no_units');
  if (own.length > REFRESH_MAX_UNITS) return fail('too_many_units');
  const free = new Set(buildTargetPairs(sameDay, index, enabled).pairs.map((p) => `${p.numero_reserva}|${p.id_apt}`));
  const mine = own.filter((p) => free.has(`${p.numero_reserva}|${p.id_apt}`));
  if (mine.length === 0) return fail('conflict');

  // 4. One Partee query per unit (the job's flow), with the job's delay between Partee calls.
  const nowIso = now().toISOString();
  const rows: RegistreRow[] = [];
  let emptyUnits = 0;
  let calls = 0;
  const existingByApt = new Map(existing.map((e) => [e.id_apt, e]));

  for (const pair of mine) {
    if (calls++ > 0) await sleep(delay);
    const res = await partee.reservations(estByApt.get(pair.id_apt) as number, pair.fecha_checkin);
    if (res.kind === 'rate_limited') return fail('partee_rate_limited');
    if (res.kind === 'unauthorized' || res.kind === 'error') return fail('partee_error');

    let outcome: Outcome;
    if (res.kind === 'empty') {
      emptyUnits++;
      outcome = { estado: 'sin_registro' };
    } else {
      const sel = selectRecord(res.data);
      if (sel.kind === 'sin_registro') {
        outcome = { estado: 'sin_registro' };
      } else if (sel.kind === 'iniciado') {
        outcome = { estado: 'iniciado', record: sel.record };
      } else {
        await sleep(delay);
        calls++;
        const pr = await partee.parte(sel.record.parteID as number | string);
        if (pr.kind === 'rate_limited') return fail('partee_rate_limited');
        if (pr.kind !== 'ok') return fail('partee_error');
        outcome = { estado: deriveEstado(pr.data), record: sel.record, facts: pr.data };
      }
    }

    const ex = existingByApt.get(pair.id_apt);
    // No registration record in Partee: create it as sin_registro, or keep the existing row and touch it.
    rows.push(outcome.estado === 'sin_registro' && ex ? touchRow(pair, ex, nowIso) : buildRow(pair, outcome, nowIso));
  }

  // 5. A single RPC call with all rows (the SQL function re-checks the permission and the never-downgrade rule).
  const saved = await db.upsert(rows);
  return {
    ok: true,
    ...(emptyUnits === mine.length ? { code: 'not_in_partee' as const } : {}),
    upserted: saved.upserted,
    needs_review: saved.needs_review,
    estados: rows.map((r) => ({ id_apt: r.id_apt, estado: r.estado, num_viajeros: r.num_viajeros })),
    conflicts: own.length - mine.length,
  };
}
