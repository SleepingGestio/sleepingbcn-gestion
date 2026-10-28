import { Db } from './db';
import {
  buildRoomIndex,
  buildRow,
  buildTargetPairs,
  deriveEstado,
  groupCalls,
  isSentEstado,
  resolveWindow,
  selectRecord,
  wouldDowngrade,
  type Outcome,
} from './logic';
import { PartneeClient, type FetchFn } from './partee';
import type { CallKey, Env, RegistreRow, RunSummary } from './types';

/** Partee allows 600 reads / 10 min. Stay well under it; stop cleanly if reached. */
export const READ_BUDGET = 450;
/** Pause between Partee calls (sequential, no bursts). */
const CALL_DELAY_MS = 250;

export class PartneeUnauthorizedError extends Error {
  constructor() {
    super('partee_unauthorized: token invalid/expired or API access not enabled');
  }
}

export interface Deps {
  fetch: FetchFn;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

export const realDeps: Deps = {
  fetch: (...a) => fetch(...a),
  now: () => new Date(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export interface RunOptions {
  dry: boolean;
  from: string | null;
  to: string | null;
  readBudget?: number;
  delayMs?: number;
}

export async function runSync(env: Env, opts: RunOptions, deps: Deps = realDeps): Promise<RunSummary> {
  const started = deps.now().getTime();
  const budget = opts.readBudget ?? READ_BUDGET;
  const delay = opts.delayMs ?? CALL_DELAY_MS;

  const w = resolveWindow(deps.now(), opts.from, opts.to);
  if (!w.ok) throw new Error(w.error);

  const db = new Db(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, deps.fetch);
  const partee = new PartneeClient(env.PARTEE_API_TOKEN, deps.fetch);

  const summary: RunSummary = {
    window: w.window,
    establishments: 0,
    kb_pairs: 0,
    ignored_units: 0,
    unresolved_rooms: 0,
    partee_calls: 0,
    parte_calls: 0,
    empty_dates: 0,
    upserts: {},
    unmatched_partee_records: [],
    conflicts: 0,
    needs_review: [],
    ambiguous: 0,
    failures: 0,
    rate_limited: { hit: false, retry_after: null },
    budget_exceeded: false,
    dry: opts.dry,
    duration_ms: 0,
  };

  // 1-2. Establishments, KB reservations, room resolution, current registre state.
  const [ests, apts, alias, kb, existing] = await Promise.all([
    db.establiments(),
    db.apartamentos(),
    db.alias(),
    db.kbReservations(w.window.from, w.window.to),
    db.registreEstados(w.window.from, w.window.to),
  ]);
  summary.establishments = ests.length;
  const estByApt = new Map(ests.map((e) => [e.id_apt, e.partee_est_id]));
  const built = buildTargetPairs(kb, buildRoomIndex(apts, alias), new Set(estByApt.keys()));
  summary.kb_pairs = built.pairs.length;
  summary.ignored_units = built.ignoredUnits;
  summary.unresolved_rooms = built.unresolvedRooms;
  summary.conflicts = built.conflicts;

  const existingEstado = new Map(existing.map((r) => [`${r.numero_reserva}|${r.id_apt}`, r.estado]));
  const estadoOf = (p: { numero_reserva: string; id_apt: number }) =>
    existingEstado.get(`${p.numero_reserva}|${p.id_apt}`);

  const nowIso = deps.now().toISOString();
  const rows: RegistreRow[] = [];
  const reads = () => summary.partee_calls + summary.parte_calls;

  /** A failed call keeps the last good state; a sent/annulled row is flagged for a human. */
  const failed = (call: CallKey) => {
    summary.failures++;
    for (const p of call.pairs) {
      if (isSentEstado(estadoOf(p))) summary.needs_review.push({ numero_reserva: p.numero_reserva, id_apt: p.id_apt });
    }
  };

  // 3-8. One Partee query per (establishment, date).
  for (const call of groupCalls(built.pairs, estByApt)) {
    if (reads() >= budget) {
      summary.budget_exceeded = true;
      break;
    }
    if (reads() > 0) await deps.sleep(delay);

    summary.partee_calls++;
    const res = await partee.reservations(call.estId, call.date);
    if (res.kind === 'unauthorized') throw new PartneeUnauthorizedError();
    if (res.kind === 'rate_limited') {
      summary.rate_limited = { hit: true, retry_after: res.retryAfter };
      break;
    }
    if (res.kind === 'error') {
      failed(call);
      continue;
    }

    let outcome: Outcome;
    if (res.kind === 'empty') {
      summary.empty_dates++;
      outcome = { estado: 'sin_registro' };
    } else {
      const sel = selectRecord(res.data);
      if (sel.kind === 'sin_registro') {
        outcome = { estado: 'sin_registro' };
      } else if (sel.kind === 'iniciado') {
        outcome = { estado: 'iniciado', record: sel.record };
      } else {
        if (sel.ambiguous) {
          summary.ambiguous++;
          for (const r of sel.extraParteRecords) if (r.id !== null) summary.unmatched_partee_records.push(r.id);
        }
        if (reads() >= budget) {
          summary.budget_exceeded = true;
          break;
        }
        await deps.sleep(delay);
        summary.parte_calls++;
        const pr = await partee.parte(sel.record.parteID as number | string);
        if (pr.kind === 'unauthorized') throw new PartneeUnauthorizedError();
        if (pr.kind === 'rate_limited') {
          summary.rate_limited = { hit: true, retry_after: pr.retryAfter };
          break;
        }
        if (pr.kind !== 'ok') {
          failed(call);
          continue;
        }
        outcome = { estado: deriveEstado(pr.data), record: sel.record, facts: pr.data };
      }
    }
    for (const pair of call.pairs) {
      if (wouldDowngrade(estadoOf(pair), outcome.estado)) {
        summary.needs_review.push({ numero_reserva: pair.numero_reserva, id_apt: pair.id_apt });
        continue;
      }
      rows.push(buildRow(pair, outcome, nowIso));
    }
  }

  // 7. Upsert (skipped on dry runs). Never deletes.
  for (const r of rows) summary.upserts[r.estado] = (summary.upserts[r.estado] ?? 0) + 1;
  if (!opts.dry && rows.length > 0) {
    try {
      await db.upsertRegistre(rows);
    } catch {
      summary.failures += rows.length;
      summary.upserts = {};
    }
  }

  summary.duration_ms = deps.now().getTime() - started;
  return summary;
}
