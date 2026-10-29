// "Generar enlace": creates the Partee online check-in link for ONE single-unit reservation whose Partee
// registration has not been generated (`sin_registro`). Shared by the app Worker (via the `@partee-sync/*`
// alias) and tested here with fakes: all I/O comes in through injected ports.
// Writes: one Partee call (link/create, idempotent) and one RPC that stores ONLY the URL. Nothing else.
// Privacy: ids, states and the guest-facing URL only; Partee bodies and error messages never leave partee-link.ts.
import { madridDate, selectLinkTarget } from './logic';
import { isParteeUrl, type LinkResult } from './partee-link';
import type { PartneeResult } from './partee';
import { loadReserva, resolveUnits, type ExistingRegistre, type ReservaReadDb } from './refresh';
import type { PRecord } from './types';

/** A partee_registre row as the link flow needs it. */
export interface LinkExistingRegistre extends ExistingRegistre {
  checkin_url_generado: string | null;
}

/** Data access, implemented in the app with the CALLER's Supabase client. */
export interface LinkDb extends Omit<ReservaReadDb, 'registre'> {
  registre(numero: string): Promise<LinkExistingRegistre[]>;
  /** The RPC partee_set_checkin_url: only writes while the row is still `sin_registro`. */
  setCheckinUrl(numero: string, idApt: number, url: string): Promise<{ updated: number }>;
}

export interface LinkPartee {
  reservations(estId: number, dateIso: string): Promise<PartneeResult<PRecord[]>>;
  createLink(reservationId: number | string): Promise<LinkResult>;
}

export interface LinkDeps {
  db: LinkDb;
  partee: LinkPartee;
  now: () => Date;
}

export type LinkFailCode =
  | 'not_found'
  | 'excluded'
  | 'cancelled'
  | 'past_checkin'
  | 'no_units'
  | 'not_single_unit'
  | 'conflict'
  | 'stale_state'
  | 'not_in_partee'
  | 'ambiguous'
  | 'partee_unauthorized'
  | 'partee_rate_limited'
  | 'partee_error'
  | 'invalid_url';

export type LinkResponse =
  | { ok: true; code: 'created' | 'existing'; url: string }
  | { ok: false; code: LinkFailCode; retryInSeconds?: number };

const fail = (code: LinkFailCode): LinkResponse => ({ ok: false, code });

export async function generarEnlace(numeroRaw: string, deps: LinkDeps): Promise<LinkResponse> {
  const { db, partee, now } = deps;
  const numero = numeroRaw.trim();

  // 1. Cheap reads and guards (same ones as "Actualizar ahora").
  const loaded = await loadReserva(numero, db);
  if (!loaded.ok) return fail(loaded.code);
  const { kb, existing } = loaded;

  // 2. Single unit only, on a row that still says "No generado".
  if (existing.length > 1) return fail('not_single_unit');
  const row = existing[0];
  if (!row) return fail('stale_state'); // never synced: refresh first
  const stored = row.checkin_url_generado ?? row.checkin_url;
  if (stored && isParteeUrl(stored)) return { ok: true, code: 'existing', url: stored }; // no Partee call
  if (row.estado !== 'sin_registro') return fail('stale_state');

  const date = kb.checkIn.slice(0, 10);
  if (date < madridDate(now())) return fail('past_checkin');

  // 3. The reservation's unit, free of conflicts with other reservations of the same unit and day.
  const units = await resolveUnits(kb, db);
  if (!units.ok) return fail(units.code);
  const { estByApt, own, mine } = units;
  if (own.length !== 1) return fail('not_single_unit');
  if (mine.length === 0) return fail('conflict');
  const pair = mine[0];
  if (pair.id_apt !== row.id_apt) return fail('stale_state');
  const estId = estByApt.get(pair.id_apt) as number;

  // 4. One Partee read to find the Partee reservation (a single, unambiguous one).
  const res = await partee.reservations(estId, pair.fecha_checkin);
  if (res.kind === 'rate_limited') return fail('partee_rate_limited');
  if (res.kind === 'unauthorized') return fail('partee_unauthorized');
  if (res.kind === 'error') return fail('partee_error');
  if (res.kind === 'empty') return fail('not_in_partee');
  const target = selectLinkTarget(res.data);
  if (target.kind === 'none') return fail('not_in_partee');
  if (target.kind === 'ambiguous') return fail('ambiguous');
  if (target.kind === 'stale') return fail('stale_state');

  // 5. The link: reuse the one the record already carries, else create it (idempotent on Partee's side).
  let url: string;
  let code: 'created' | 'existing';
  if (isParteeUrl(target.record.checkInOnlineURL)) {
    url = target.record.checkInOnlineURL;
    code = 'existing';
  } else {
    const link = await partee.createLink(target.record.id as number | string);
    if (link.kind === 'unauthorized' || link.kind === 'forbidden') return fail('partee_unauthorized');
    if (link.kind === 'rate_limited') return fail('partee_rate_limited');
    if (link.kind === 'not_found') return fail('not_in_partee');
    if (link.kind === 'error') return fail('partee_error');
    url = link.url;
    code = link.existed ? 'existing' : 'created';
  }

  // 6. Store ONLY the URL, and only if the row is still sin_registro.
  const saved = await db.setCheckinUrl(numero, pair.id_apt, url);
  if (saved.updated < 1) return fail('stale_state');
  return { ok: true, code, url };
}
