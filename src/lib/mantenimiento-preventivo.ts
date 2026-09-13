import type { Estat } from "@/lib/mantenimiento";

export type PeriodicidadModo = "intervalo" | "epoca_anyo";
export type IntervaloUnidad = "semanas" | "meses";
export type AplicacionModo = "apartamentos_activos" | "espacio_comun";

export type TareaPreventiva = {
  id_tarea_preventiva: number;
  nombre: string;
  descripcion: string | null;
  modo_periodicidad: PeriodicidadModo;
  intervalo_cantidad: number | null;
  intervalo_unidad: IntervaloUnidad | null;
  tipo_generacion: string;
  activo: boolean;
  creado_en: string;
  creado_por: number | null;
};

export type TareaPreventivaConMeses = TareaPreventiva & { meses: number[] };

export type AplicacionPreventiva = {
  id_aplicacion: number;
  id_tarea_preventiva: number;
  id_grupo: number;
  modo_aplicacion: AplicacionModo;
  id_tipo_espacio_comun: number | null;
  creado_en: string;
};

// Only the columns the preventivo screens need — not the full Incidencia shape.
export type IncidenciaPreventivaLite = {
  id_incidencia: number;
  id_tarea_preventiva: number;
  id_apt: number | null;
  id_grup: number | null;
  id_tipo_espacio_comun: number | null;
  estat: Estat;
  data_prevista: string | null;
  finalitzat_en: string | null;
  creado_en: string;
  id_assignat: number | null;
};

// `scopeSince` = the later of the tarea's own creado_en and the producing
// aplicación's creado_en (date-only, YYYY-MM-DD) — the point before which
// this location wasn't actually in scope for this tarea yet. Computed once
// in resolveConcreteLocations so every consumer (computeLocationPending,
// buildPlanningRow) can guard against flagging a "phantom" vencida/próxima
// for a year-month instance that predates the location's own inclusion.
export type ConcreteLocation =
  | { kind: "apt"; idApt: number; idGrupo: number; nombre: string; scopeSince: string }
  | { kind: "espacio"; idGrupo: number; idTipoEspacio: number; scopeSince: string };

export const PREVENTIVO_WINDOW_DAYS = 15;

// No equivalent in ESTADO_FULL_STYLE (those are real incidencia estados; vencida/
// próxima describe the ABSENCE of one). Reused from PRIORIDAD_STYLE.alta/normal
// rather than invented, so these read consistently with the rest of the app.
export const PREVENTIVO_COLOR_VENCIDA = "#DC2626";
export const PREVENTIVO_COLOR_PROXIMA = "#D97706";

export const MES_LABELS_CORTO = [
  "",
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];
export const MES_LABELS_LARGO = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const ESTADOS_ACTIVOS: Estat[] = ["pendent_validacio", "validada", "en_curs"];
// Rejected/deleted occurrences don't count as "done" or "in flight" — the
// location goes back to being eligible for generation, same as if nothing
// had ever been created.
function esRelevante(i: IncidenciaPreventivaLite): boolean {
  return i.estat !== "rebutjada" && i.estat !== "eliminada";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoOf(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function todayISO(): string {
  return isoOf(new Date());
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diasEntre(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86_400_000);
}

export function addInterval(iso: string, cantidad: number, unidad: IntervaloUnidad): string {
  const d = new Date(iso + "T00:00:00");
  if (unidad === "semanas") d.setDate(d.getDate() + cantidad * 7);
  else d.setMonth(d.getMonth() + cantidad);
  return isoOf(d);
}

/** Later of two ISO-ish timestamp strings — valid lexicographically as long as both come from the same (Postgres timestamptz) serialization, which they do here. */
function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

export function locationKey(loc: ConcreteLocation): string {
  return loc.kind === "apt" ? `apt-${loc.idApt}` : `esp-${loc.idGrupo}-${loc.idTipoEspacio}`;
}

export function incidenciaLocationKey(
  i: Pick<IncidenciaPreventivaLite, "id_apt" | "id_grup" | "id_tipo_espacio_comun">,
): string {
  return i.id_apt != null ? `apt-${i.id_apt}` : `esp-${i.id_grup}-${i.id_tipo_espacio_comun}`;
}

export function locationInsertFields(loc: ConcreteLocation): {
  id_apt: number | null;
  id_grup: number | null;
  id_tipo_espacio_comun: number | null;
} {
  if (loc.kind === "apt")
    return { id_apt: loc.idApt, id_grup: loc.idGrupo, id_tipo_espacio_comun: null };
  return { id_apt: null, id_grup: loc.idGrupo, id_tipo_espacio_comun: loc.idTipoEspacio };
}

export function locationLabel(
  loc: ConcreteLocation,
  grupoById: Map<number, { nombre: string }>,
  espacioById: Map<number, { nombre: string }>,
): { grupo: string; detalle: string } {
  const grupo = grupoById.get(loc.idGrupo)?.nombre ?? `#${loc.idGrupo}`;
  if (loc.kind === "apt") return { grupo, detalle: loc.nombre };
  return { grupo, detalle: espacioById.get(loc.idTipoEspacio)?.nombre ?? `#${loc.idTipoEspacio}` };
}

/**
 * Every active apartment in the grupo, for "apartamentos_activos"; the single
 * grupo+tipo_espacio_comun pair, for "espacio_comun". Applied per this tarea's
 * own aplicaciones — no cross-tarea deduplication needed (each tarea is
 * evaluated independently).
 */
export function resolveConcreteLocations(
  tareaCreadoEn: string,
  aplicaciones: AplicacionPreventiva[],
  apartamentos: { id_apt: number; id_grupo: number | null; nombre: string; activo: boolean }[],
): ConcreteLocation[] {
  const out: ConcreteLocation[] = [];
  for (const ap of aplicaciones) {
    const scopeSince = maxIso(tareaCreadoEn, ap.creado_en).slice(0, 10);
    if (ap.modo_aplicacion === "espacio_comun") {
      if (ap.id_tipo_espacio_comun != null) {
        out.push({
          kind: "espacio",
          idGrupo: ap.id_grupo,
          idTipoEspacio: ap.id_tipo_espacio_comun,
          scopeSince,
        });
      }
    } else {
      for (const apt of apartamentos) {
        if (apt.id_grupo === ap.id_grupo && apt.activo) {
          out.push({
            kind: "apt",
            idApt: apt.id_apt,
            idGrupo: ap.id_grupo,
            nombre: apt.nombre,
            scopeSince,
          });
        }
      }
    }
  }
  return out;
}

export type PendingInfo = { estado: "vencida" | "proxima"; targetDate: string; mes: number | null };

/**
 * "Cada X tiempo" mode only. Anchor = the most recent REAL closure
 * (finalitzat_en) of this tarea at this location; if none exists yet,
 * `scopeSince` (the later of the tarea's and the producing aplicación's
 * creado_en — see resolveConcreteLocations) is used as the initial anchor
 * instead of treating the location as due immediately. Using `scopeSince`
 * rather than the tarea's own creado_en matters when a location enters
 * scope LATER than the tarea itself (a grupo added to an existing tarea
 * months after it was created) — anchoring on the tarea's original
 * creation date would make that just-added location's first due date
 * (creation + interval) land in the past, looking instantly overdue.
 * Suppressed (no pending) while an in-flight (non-final, non-rejected/
 * deleted) occurrence already exists — that's what makes it disappear from
 * the generation queue once generated.
 */
export function computeCadaXTiempo(
  tarea: Pick<TareaPreventiva, "intervalo_cantidad" | "intervalo_unidad">,
  scopeSince: string,
  incidenciasAtLocation: IncidenciaPreventivaLite[],
  today: string,
): { nextDue: string; pending: PendingInfo | null; inFlight: IncidenciaPreventivaLite | null } {
  const relevant = incidenciasAtLocation.filter(esRelevante);
  const inFlight = relevant.find((i) => ESTADOS_ACTIVOS.includes(i.estat)) ?? null;
  const lastClosure = relevant
    .filter(
      (i): i is IncidenciaPreventivaLite & { finalitzat_en: string } =>
        i.estat === "finalitzada" && !!i.finalitzat_en,
    )
    .sort((a, b) => b.finalitzat_en.localeCompare(a.finalitzat_en))[0];
  const anchor = (lastClosure?.finalitzat_en ?? scopeSince).slice(0, 10);
  const nextDue = addInterval(anchor, tarea.intervalo_cantidad!, tarea.intervalo_unidad!);
  let pending: PendingInfo | null = null;
  if (!inFlight) {
    if (nextDue < today) pending = { estado: "vencida", targetDate: nextDue, mes: null };
    else if (nextDue <= addDaysISO(today, PREVENTIVO_WINDOW_DAYS))
      pending = { estado: "proxima", targetDate: nextDue, mes: null };
  }
  return { nextDue, pending, inFlight };
}

/**
 * "Época del año" mode: at most one pending occurrence per marked month, each
 * independent of the others. Returns the single most urgent one (vencida
 * beats próxima; ties broken by earliest target date) since Screen 1 shows
 * one row per (tarea, location) — see the judgment-call note about the rare
 * case of two marked months being pending on the same location at once.
 *
 * For each marked month, checks TWO year-instances, never a hardcoded
 * "this year":
 *  - the "recent" instance — the most recent occurrence of that month whose
 *    window has already opened (this calendar year's, if the month has
 *    started; last calendar year's otherwise). This is what must keep
 *    reporting "vencida" across a Jan-1 rollover instead of silently
 *    resetting — e.g. mes=9 (September), never generated: checked in
 *    November 2026 it's "2026-09" (correctly vencida); checked in January
 *    2027 it's STILL "2026-09" (still vencida, 4+ months overdue), not
 *    "2027-09" (which would read as 8 months in the FUTURE and make the
 *    miss disappear from the queue). Only once 2026-09 is actually
 *    done/generated does the recent instance become "2027-09" once August
 *    2027 arrives.
 *  - the "upcoming" instance — always exactly one year after the recent one,
 *    always in the future — so a month whose recent instance is already
 *    done can still surface a "próxima ventana" heads-up as next year's
 *    occurrence approaches, the same as before.
 *
 * `scopeSince` guards against the "recent" instance reaching back to before
 * this location was actually in scope for this tarea (a brand-new tarea/
 * aplicación with a marked month that already passed THIS year must NOT
 * show that month as vencida — there was nothing to miss, since it didn't
 * exist yet). Compared at month granularity, not exact date: a tarea
 * created on the 5th of a marked month still counts that same month as
 * in-scope (only a candidate STRICTLY BEFORE the creation month is
 * skipped) — otherwise a tarea created mid-month would wrongly treat its
 * own creation month as pre-existing too.
 */
export function computeEpocaPending(
  meses: number[],
  scopeSince: string,
  incidenciasAtLocation: IncidenciaPreventivaLite[],
  today: string,
): PendingInfo | null {
  const relevant = incidenciasAtLocation.filter(esRelevante);
  const doneYms = new Set(
    relevant
      .filter((i) => i.estat === "finalitzada" && i.finalitzat_en)
      .map((i) => i.finalitzat_en!.slice(0, 7)),
  );
  const genYms = new Set(
    relevant
      .filter((i) => ESTADOS_ACTIVOS.includes(i.estat) && i.data_prevista)
      .map((i) => i.data_prevista!.slice(0, 7)),
  );
  const scopeSinceYm = scopeSince.slice(0, 7);
  const todayYear = Number(today.slice(0, 4));
  const todayMonth = Number(today.slice(5, 7));
  const candidates: PendingInfo[] = [];
  function addCandidateIfPending(ym: string, mes: number) {
    if (ym < scopeSinceYm) return;
    if (doneYms.has(ym) || genYms.has(ym)) return;
    const targetDate = `${ym}-01`;
    if (targetDate < today) candidates.push({ estado: "vencida", targetDate, mes });
    else if (targetDate <= addDaysISO(today, PREVENTIVO_WINDOW_DAYS)) {
      candidates.push({ estado: "proxima", targetDate, mes });
    }
  }
  for (const mes of meses) {
    const recentYear = mes <= todayMonth ? todayYear : todayYear - 1;
    addCandidateIfPending(`${recentYear}-${pad2(mes)}`, mes);
    // recentYear+1's instance is always strictly in the future relative to
    // today by construction, so it can only ever contribute a "proxima"
    // candidate (addCandidateIfPending's own date check enforces this) —
    // never a duplicate/incorrect "vencida".
    addCandidateIfPending(`${recentYear + 1}-${pad2(mes)}`, mes);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === "vencida" ? -1 : 1;
    return a.targetDate.localeCompare(b.targetDate);
  });
  return candidates[0];
}

export function computeLocationPending(
  tarea: TareaPreventivaConMeses,
  scopeSince: string,
  incidenciasAtLocation: IncidenciaPreventivaLite[],
  today: string,
): PendingInfo | null {
  if (tarea.modo_periodicidad === "intervalo") {
    return computeCadaXTiempo(tarea, scopeSince, incidenciasAtLocation, today).pending;
  }
  return computeEpocaPending(tarea.meses, scopeSince, incidenciasAtLocation, today);
}

export type PlanningColumn = { year: number; month: number };

/** Last 10 months (current included) + next 2, recomputed from `today` every time — not a fixed calendar year. */
export function buildPlanningColumns(today: string): PlanningColumn[] {
  const [y, m] = today.split("-").map(Number);
  const cols: PlanningColumn[] = [];
  for (let offset = -9; offset <= 2; offset++) {
    const d = new Date(y, m - 1 + offset, 1);
    cols.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return cols;
}

export type PlanningCellState =
  | { type: "done"; incidencia: IncidenciaPreventivaLite }
  | { type: "generated"; asignada: boolean; incidencia: IncidenciaPreventivaLite }
  | { type: "pending"; estado: "vencida" | "proxima"; targetDate: string; mes: number | null }
  | { type: "empty" };

export function buildPlanningRow(
  tarea: TareaPreventivaConMeses,
  scopeSince: string,
  incidenciasAtLocation: IncidenciaPreventivaLite[],
  columns: PlanningColumn[],
  today: string,
): PlanningCellState[] {
  const scopeSinceYm = scopeSince.slice(0, 7);
  const relevant = incidenciasAtLocation.filter(esRelevante);
  const doneByYm = new Map<string, IncidenciaPreventivaLite>();
  const genByYm = new Map<string, IncidenciaPreventivaLite>();
  for (const i of relevant) {
    if (i.estat === "finalitzada" && i.finalitzat_en) {
      doneByYm.set(i.finalitzat_en.slice(0, 7), i);
    } else if (ESTADOS_ACTIVOS.includes(i.estat) && i.data_prevista) {
      genByYm.set(i.data_prevista.slice(0, 7), i);
    }
  }

  let cadaXPendingYm: string | null = null;
  let cadaXPendingEstado: "vencida" | "proxima" | null = null;
  if (tarea.modo_periodicidad === "intervalo") {
    // Same anchor (scopeSince) as computeLocationPending's own intervalo
    // branch — this grid column set carries an explicit year/month per
    // column, but the "pending" cell's anchor still comes from
    // computeCadaXTiempo, so it inherits the same fix.
    const info = computeCadaXTiempo(tarea, scopeSince, incidenciasAtLocation, today);
    if (info.pending) {
      cadaXPendingYm = info.pending.targetDate.slice(0, 7);
      cadaXPendingEstado = info.pending.estado;
    }
  }

  return columns.map(({ year, month }) => {
    const ym = `${year}-${pad2(month)}`;
    const done = doneByYm.get(ym);
    if (done) return { type: "done", incidencia: done };
    const gen = genByYm.get(ym);
    if (gen)
      return { type: "generated", asignada: gen.estat !== "pendent_validacio", incidencia: gen };
    if (tarea.modo_periodicidad === "intervalo") {
      if (cadaXPendingYm === ym && cadaXPendingEstado) {
        return { type: "pending", estado: cadaXPendingEstado, targetDate: `${ym}-01`, mes: null };
      }
    } else if (tarea.meses.includes(month)) {
      // Unlike computeEpocaPending, `year` here is never derived from
      // `today` — it's this specific grid column's own year, so there's no
      // analogous "hardcoded current year" bug: a missed month keeps
      // showing vencida in its own column regardless of which year the
      // calendar has rolled into. It DOES need the same scopeSince guard
      // though, for the same reason computeEpocaPending does — otherwise a
      // recently-created tarea/aplicación would render red "vencida" dots
      // in every column before it existed, going back up to 9 months.
      if (ym < scopeSinceYm) return { type: "empty" };
      const targetDate = `${ym}-01`;
      if (targetDate < today) return { type: "pending", estado: "vencida", targetDate, mes: month };
      if (targetDate <= addDaysISO(today, PREVENTIVO_WINDOW_DAYS)) {
        return { type: "pending", estado: "proxima", targetDate, mes: month };
      }
    }
    return { type: "empty" };
  });
}

export function periodicidadLabel(
  tarea: Pick<
    TareaPreventivaConMeses,
    "modo_periodicidad" | "intervalo_cantidad" | "intervalo_unidad" | "meses"
  >,
): string {
  if (tarea.modo_periodicidad === "intervalo") {
    const unidad = tarea.intervalo_unidad === "semanas" ? "semana" : "mes";
    const n = tarea.intervalo_cantidad ?? 0;
    return `cada ${n} ${unidad}${n === 1 ? "" : "s"} (desde el cierre real)`;
  }
  const meses = [...tarea.meses]
    .sort((a, b) => a - b)
    .map((m) => MES_LABELS_LARGO[m].toLowerCase());
  if (meses.length === 0) return "época del año (sin meses configurados)";
  if (meses.length === 1) return `1 vez al año: ${meses[0]}`;
  return `${meses.length} veces al año: ${meses.join(", ")}`;
}
