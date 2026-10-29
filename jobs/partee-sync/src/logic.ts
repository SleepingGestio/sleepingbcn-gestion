// Pure logic: no I/O, no clock access, so it can be tested with plain fixtures.
import type {
  CallKey,
  KbRow,
  ParteFacts,
  PRecord,
  RegistreEstado,
  RegistreRow,
  Selection,
  TargetPair,
} from './types';

const TZ = 'Europe/Madrid';
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Same list the app uses (src/lib/generar-limpiezas.ts ESTADOS_CANCELADAS, src/routes/checkins.tsx). */
export const ESTADOS_EXCLUIDOS: ReadonlySet<string> = new Set(['Cancelada', 'No show']);

export const isActiveEstado = (estado: string | null | undefined): boolean =>
  !estado || !ESTADOS_EXCLUIDOS.has(estado);

// ---------- dates ----------

/** Calendar date (YYYY-MM-DD) in Europe/Madrid for an instant. */
export function madridDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isValidIsoDate(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Default window: today-1 .. today+7 in Madrid. */
export function defaultWindow(now: Date): { from: string; to: string } {
  const today = madridDate(now);
  return { from: addDays(today, -1), to: addDays(today, 7) };
}

export const MAX_WINDOW_DAYS = 14;

export function resolveWindow(
  now: Date,
  from: string | null,
  to: string | null,
): { ok: true; window: { from: string; to: string } } | { ok: false; error: string } {
  if (from === null && to === null) return { ok: true, window: defaultWindow(now) };
  if (from === null || to === null) return { ok: false, error: 'from_and_to_required_together' };
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) return { ok: false, error: 'invalid_date' };
  if (from > to) return { ok: false, error: 'from_after_to' };
  if (daysBetween(from, to) > MAX_WINDOW_DAYS) return { ok: false, error: 'window_too_large' };
  return { ok: true, window: { from, to } };
}

/** YYYY-MM-DD -> dd-MM-yyyy (Partee format). */
export function isoToPartee(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

// ---------- KB -> target pairs ----------

/** Trim, collapse inner whitespace (double spaces), case-insensitive. */
export const normalizeRoom = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function buildRoomIndex(
  apartamentos: Array<{ id_apt: number; nombre: string | null }>,
  alias: Array<{ id_apt: number; nombre_kb: string | null }>,
): Map<string, number> {
  const idx = new Map<string, number>();
  for (const a of apartamentos) if (a.nombre) idx.set(normalizeRoom(a.nombre), a.id_apt);
  // apartamentos.nombre wins over an alias with the same text.
  for (const a of alias) {
    if (!a.nombre_kb) continue;
    const k = normalizeRoom(a.nombre_kb);
    if (!idx.has(k)) idx.set(k, a.id_apt);
  }
  return idx;
}

export interface PairsResult {
  pairs: TargetPair[];
  ignoredUnits: number;
  unresolvedRooms: number;
  conflicts: number;
}

/**
 * Builds (numero_reserva, id_apt, fecha_checkin) pairs from KB rows.
 * - cancelled / no-show reservations are skipped;
 * - each room of the comma-separated "Habitaciones" is resolved to an id_apt;
 * - rooms whose unit has no Partee establishment are counted and ignored;
 * - two different reservations on the same unit and check-in date are a conflict:
 *   neither is returned (we never guess which one the Partee record belongs to).
 */
export function buildTargetPairs(
  kb: KbRow[],
  roomIndex: Map<string, number>,
  partee: ReadonlySet<number>,
): PairsResult {
  let ignoredUnits = 0;
  let unresolvedRooms = 0;
  const seen = new Set<string>();
  const all: TargetPair[] = [];

  for (const r of kb) {
    if (!isActiveEstado(r.estado)) continue;
    const date = (r.checkIn ?? '').slice(0, 10);
    if (!isValidIsoDate(date) || !r.habitaciones) continue;
    for (const room of r.habitaciones.split(',')) {
      if (!room.trim()) continue;
      const id = roomIndex.get(normalizeRoom(room));
      if (id === undefined) {
        unresolvedRooms++;
        continue;
      }
      if (!partee.has(id)) {
        ignoredUnits++;
        continue;
      }
      const key = `${r.numero}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ numero_reserva: r.numero, id_apt: id, fecha_checkin: date });
    }
  }

  const byUnitDate = new Map<string, TargetPair[]>();
  for (const p of all) {
    const k = `${p.id_apt}|${p.fecha_checkin}`;
    const list = byUnitDate.get(k);
    if (list) list.push(p);
    else byUnitDate.set(k, [p]);
  }
  const pairs: TargetPair[] = [];
  let conflicts = 0;
  for (const group of byUnitDate.values()) {
    if (group.length > 1) conflicts++;
    else pairs.push(group[0]);
  }
  pairs.sort((a, b) =>
    a.fecha_checkin === b.fecha_checkin ? a.id_apt - b.id_apt : a.fecha_checkin < b.fecha_checkin ? -1 : 1,
  );
  return { pairs, ignoredUnits, unresolvedRooms, conflicts };
}

/** One Partee query per (establishment, date) that has at least one target pair. */
export function groupCalls(pairs: TargetPair[], estByApt: ReadonlyMap<number, number>): CallKey[] {
  const map = new Map<string, CallKey>();
  for (const p of pairs) {
    const estId = estByApt.get(p.id_apt);
    if (estId === undefined) continue;
    const k = `${estId}|${p.fecha_checkin}`;
    const cur = map.get(k);
    if (cur) cur.pairs.push(p);
    else map.set(k, { estId, date: p.fecha_checkin, pairs: [p] });
  }
  return [...map.values()];
}

// ---------- never downgrade a sent parte ----------

/** A parte already sent (or annulled) must not fall back to a weaker state automatically. */
export const isSentEstado = (estado: string | null | undefined): boolean =>
  estado === 'finalizado' || estado === 'anulado';

/** True when writing `next` over an existing `finalizado`/`anulado` row would lose a parteID. */
export function wouldDowngrade(existing: string | null | undefined, next: Outcome['estado']): boolean {
  return isSentEstado(existing) && (next === 'sin_registro' || next === 'iniciado');
}

// ---------- CLI ----------

export interface CliArgs {
  dry: boolean;
  from: string | null;
  to: string | null;
}

export function parseCliArgs(argv: string[]): { ok: true; args: CliArgs } | { ok: false; error: string } {
  const args: CliArgs = { dry: false, from: null, to: null };
  for (const a of argv) {
    if (a === '--dry') args.dry = true;
    else if (a.startsWith('--from=')) args.from = a.slice(7);
    else if (a.startsWith('--to=')) args.to = a.slice(5);
    else return { ok: false, error: 'unknown_argument' };
  }
  return { ok: true, args };
}

/** Non-zero when something needs a human: failures or rate limiting (GitHub then e-mails). */
export function exitCodeFor(s: { failures: number; rate_limited: { hit: boolean } }): number {
  return s.failures > 0 || s.rate_limited.hit ? 1 : 0;
}

// ---------- Partee records ----------

const hasParteId = (r: PRecord): boolean =>
  r.parteID !== null && r.parteID !== undefined && r.parteID !== '' && r.parteID !== 0;

const idNum = (r: PRecord): number => {
  const n = Number(r.id);
  return Number.isFinite(n) ? n : -1;
};

const isPartee = (r: PRecord): boolean => (r.channel ?? '').trim().toUpperCase() === 'PARTEE';

/**
 * Picks the record that carries the registration for one (establishment, date).
 * With a parteID: highest totalGuests, then latest id (several => ambiguous).
 * Without: a PARTEE-channel record means the guest started => 'iniciado'.
 */
export function selectRecord(records: PRecord[]): Selection {
  const withParte = records.filter(hasParteId);
  if (withParte.length > 0) {
    const sorted = [...withParte].sort((a, b) => b.totalGuests - a.totalGuests || idNum(b) - idNum(a));
    return { kind: 'parte', record: sorted[0], ambiguous: sorted.length > 1, extraParteRecords: sorted.slice(1) };
  }
  const partee = records.filter(isPartee).sort((a, b) => idNum(b) - idNum(a));
  if (partee.length > 0) return { kind: 'iniciado', record: partee[0] };
  return { kind: 'sin_registro' };
}

export type LinkTarget =
  | { kind: 'target'; record: PRecord } // exactly one record, no parteID, channel not PARTEE
  | { kind: 'stale' } // a record already has a parteID / PARTEE channel: the stored state is old
  | { kind: 'ambiguous' } // several records for the same establishment and date: never guess
  | { kind: 'none' }; // nothing usable (no records, or the only one has no id)

/** Picks the Partee record to create a check-in link for. Strict: only an unambiguous record qualifies. */
export function selectLinkTarget(records: PRecord[]): LinkTarget {
  if (records.some((r) => hasParteId(r) || isPartee(r))) return { kind: 'stale' };
  if (records.length > 1) return { kind: 'ambiguous' };
  const [only] = records;
  if (!only || only.id === null || only.id === undefined || only.id === '') return { kind: 'none' };
  return { kind: 'target', record: only };
}

/** Extracts the allowed fields from a parte response. `viajeros` is only counted. */
export function extractParteFacts(raw: unknown): ParteFacts {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lote = p.numLoteMinisterio;
  return {
    isBorrador: typeof p.isBorrador === 'boolean' ? p.isBorrador : null,
    anulado: p.ministerioAnulacion === true,
    numLote: lote === null || lote === undefined || lote === '' ? null : String(lote),
    numViajeros: Array.isArray(p.viajeros) ? p.viajeros.length : 0,
  };
}

export function deriveEstado(f: ParteFacts): RegistreEstado {
  if (f.anulado) return 'anulado';
  if (f.isBorrador === true) return 'borrador';
  return 'finalizado';
}

const toNum = (v: number | string | null): number | null => {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type Outcome =
  | { estado: 'sin_registro' }
  | { estado: 'iniciado'; record: PRecord }
  | { estado: 'borrador' | 'finalizado' | 'anulado'; record: PRecord; facts: ParteFacts };

/** ses_codigo_estado / ses_desc are deliberately absent: the upsert leaves them untouched. */
export function buildRow(pair: TargetPair, outcome: Outcome, nowIso: string): RegistreRow {
  const base = {
    numero_reserva: pair.numero_reserva,
    id_apt: pair.id_apt,
    fecha_checkin: pair.fecha_checkin,
    ultimo_sync: nowIso,
    actualizado_en: nowIso,
  };
  if (outcome.estado === 'sin_registro') {
    return {
      ...base,
      partee_reservation_id: null,
      parte_id: null,
      estado: 'sin_registro',
      is_borrador: null,
      num_viajeros: null,
      num_lote: null,
      checkin_url: null,
    };
  }
  if (outcome.estado === 'iniciado') {
    return {
      ...base,
      partee_reservation_id: toNum(outcome.record.id),
      parte_id: null,
      estado: 'iniciado',
      is_borrador: null,
      num_viajeros: null,
      num_lote: null,
      checkin_url: outcome.record.checkInOnlineURL,
    };
  }
  return {
    ...base,
    partee_reservation_id: toNum(outcome.record.id),
    parte_id: toNum(outcome.record.parteID),
    estado: outcome.estado,
    is_borrador: outcome.facts.isBorrador,
    num_viajeros: outcome.facts.numViajeros,
    num_lote: outcome.facts.numLote,
    checkin_url: outcome.record.checkInOnlineURL,
  };
}
