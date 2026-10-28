// Registre hostes (Partee): pure logic shared by the reservation tab and the
// /registre-hostes page. No I/O and no aliased imports, so it can be unit-tested
// with `node --test` (see partee-registre.test.ts).
//
// Operational facts behind the rules:
//  - Partee auto-finalizes a parte at 03:45 the night after the entry day, so a
//    draft on the entry day is normal. The legal deadline is 24 h from entry.
//  - A draft only means a check-in link was generated; num_viajeros = 0 means the
//    guest has not started.
//  - Partee only requires guests over 14, while the KB "Huéspedes" count sometimes
//    includes children, so "registrados vs previstos" is approximate and is never
//    a hard alert before the entry day.

// ---------- configuration (everything tweakable lives here) ----------

export const PARTEE_RULES = {
  /** Days-before-entry windows. d = days from today to fecha_checkin. */
  sinRegistroDangerMaxDays: 3, // d 1..3 sin_registro -> danger
  sinRegistroWarningMaxDays: 7, // d 4..7 sin_registro -> warning (beyond: info)
  noIniciadoWarningMaxDays: 3, // d 1..3 not started -> warning
  noIniciadoInfoMaxDays: 7, // d 4..7 not started -> info (beyond: info too)
  /** Time Partee finalizes the parte (shown in the entry-day label). */
  autoFinalizeTime: "03:45",
} as const;

export const CANAL_LABEL: Record<string, string> = {
  kb: "KB",
  whatsapp: "WhatsApp",
  telefono: "Teléfono",
  email: "Email",
  otro: "Otro",
};
export const CANALES = ["kb", "whatsapp", "telefono", "email", "otro"] as const;

/** Why a whole reservation does not need a Partee registration (partee_exclusion.motivo). */
export const MOTIVOS_EXCLUSION = ["extension", "reserva_privada", "otros"] as const;
export const MOTIVO_EXCLUSION_LABEL: Record<string, string> = {
  extension: "Extensión",
  reserva_privada: "Reserva privada",
  otros: "Otros",
};

export const COMPARISON_TOOLTIP =
  "El número previsto viene de la reserva y puede incluir niños; Partee solo exige registrar a los mayores de 14 años";

export type AlertLevel = "ok" | "info" | "warning" | "danger";

export type AlertCode =
  | "finalizado"
  | "anulado"
  | "error"
  | "manual"
  | "vencido"
  | "hoy_se_finaliza"
  | "hoy_incompleto"
  | "hoy_sin_registro"
  | "sin_enlace"
  | "no_iniciado"
  | "mas_de_los_previstos"
  | "completo"
  | "faltan_viajeros"
  | "en_curso"
  | "confirmado_manual"
  | "excluida";

export interface Alert {
  level: AlertLevel;
  code: AlertCode;
  label: string;
  /** Lower = more urgent. level rank * 1e6 + days since epoch of fecha_checkin. */
  priority: number;
}

export const LEVEL_RANK: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2, ok: 3 };

export const ESTADO_LABEL: Record<string, string> = {
  sin_registro: "Sin registro",
  iniciado: "Iniciado",
  borrador: "Borrador",
  finalizado: "Finalizado",
  anulado: "Anulado",
  error: "Error",
  manual: "Manual",
};

export const ESTADOS_KB_EXCLUIDOS: ReadonlySet<string> = new Set(["Cancelada", "No show"]);

// ---------- dates (Europe/Madrid) ----------

const ISO_RE = /^\d{4}-\d{2}-\d{2}/;

/** Today's calendar date in Europe/Madrid, YYYY-MM-DD. */
export function todayMadrid(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const epochDays = (iso: string): number => Math.round(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / 86_400_000);

/** Whole days from `fromIso` to `toIso` (negative if `toIso` is earlier). */
export function diffDays(fromIso: string, toIso: string): number {
  return epochDays(toIso) - epochDays(fromIso);
}

/** YYYY-MM-DD plus n days (UTC math, no DST drift). */
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "hace 5 min", "hace 3 h", "hace 2 d" (null/invalid -> "nunca"). */
export function fmtAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "nunca";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "nunca";
  const min = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export interface SyncRowInput {
  fecha_checkin: string | null;
  ultimo_sync: string | null;
  excluida?: boolean | null;
}

/**
 * When the last GENERAL sync (full or hourly job, or "Actualizar todo") ran. It is the MEDIAN of `ultimo_sync`
 * over the rows every general sync touches (check-in from today-1 to today+3 in Madrid, not excluded), so one
 * reservation refreshed on its own does not move it. Even count: the later of the two middle values.
 * Null when there are no such rows.
 */
export function lastGeneralSync(rows: SyncRowInput[], today: string): string | null {
  const times: number[] = [];
  for (const r of rows) {
    if (r.excluida || !r.ultimo_sync || !r.fecha_checkin || !ISO_RE.test(r.fecha_checkin)) continue;
    const d = diffDays(today, r.fecha_checkin);
    if (d < -1 || d > 3) continue;
    const t = Date.parse(r.ultimo_sync);
    if (!Number.isNaN(t)) times.push(t);
  }
  if (times.length === 0) return null;
  times.sort((a, b) => a - b);
  return new Date(times[Math.floor(times.length / 2)]).toISOString();
}

// ---------- expected viajeros ----------

export interface KbGuests {
  huespedes: number | null | undefined;
  menores: number | null | undefined;
  exentos: number | null | undefined;
}

export interface Expected {
  /** null = unknown (multi-unit reservation or no guest count). */
  expected: number | null;
  /** true when children/exempt were subtracted using real KB data. */
  exact: boolean;
}

/** Number of rooms in the comma-separated KB "Habitaciones" (0 when empty). */
export function countRooms(habitaciones: string | null | undefined): number {
  return (habitaciones ?? "").split(",").filter((s) => s.trim()).length;
}

/**
 * Expected registered guests from a KB row, only for single-unit reservations.
 * KB columns: "Huéspedes", "Huéspedes menores de edad", "Huéspedes exentos".
 */
export function expectedViajeros(kb: KbGuests | null | undefined, unitCount: number): Expected {
  if (!kb || unitCount !== 1 || kb.huespedes == null || !Number.isFinite(kb.huespedes)) {
    return { expected: null, exact: false };
  }
  const menores = kb.menores ?? 0;
  const exentos = kb.exentos ?? 0;
  if (menores > 0 || exentos > 0) {
    return { expected: Math.max(0, kb.huespedes - menores - exentos), exact: true };
  }
  return { expected: kb.huespedes, exact: false };
}

// ---------- alerts ----------

export interface AlertRowInput {
  estado: string;
  num_viajeros: number | null;
  fecha_checkin: string;
  /** Manually confirmed complete by a user (partee_registre.registro_confirmado). */
  registro_confirmado?: boolean | null;
  /** The reservation is in partee_exclusion: it does not need a registration. */
  excluida?: boolean | null;
}

export interface AlertContext {
  /** Today in Madrid, YYYY-MM-DD. */
  today: string;
  expected: Expected;
}

function make(row: AlertRowInput, level: AlertLevel, code: AlertCode, label: string): Alert {
  return { level, code, label, priority: LEVEL_RANK[level] * 1_000_000 + epochDays(row.fecha_checkin) };
}

export function alertLevel(row: AlertRowInput, ctx: AlertContext): Alert {
  const R = PARTEE_RULES;
  const d = diffDays(ctx.today, row.fecha_checkin);
  const n = row.num_viajeros ?? 0;
  const { expected, exact } = ctx.expected;

  // Excluded reservations need nothing: this beats every other rule, overdue included.
  if (row.excluida) return make(row, "info", "excluida", "No requiere registro");

  switch (row.estado) {
    case "finalizado":
      return make(row, "ok", "finalizado", "Finalizado");
    case "anulado":
      return make(row, "info", "anulado", "Anulado");
    case "error":
      return make(row, "danger", "error", "Error de sincronización");
    case "manual":
      return make(row, "info", "manual", "Marcado a mano");
  }

  if (d < 0) return make(row, "danger", "vencido", "Parte vencido sin finalizar");

  // Confirmed by hand beats every comparison rule (and "Se finaliza esta noche"); overdue above stays danger.
  if (row.estado === "borrador" && n > 0 && row.registro_confirmado) {
    return make(row, "ok", "confirmado_manual", "Registro confirmado a mano");
  }

  const notStarted = row.estado === "sin_registro" || row.estado === "iniciado" || (row.estado === "borrador" && n === 0);

  if (d === 0) {
    if (notStarted) return make(row, "danger", "hoy_sin_registro", "Entra hoy sin registro");
    if (expected !== null && n < expected) {
      return make(row, "warning", "hoy_incompleto", `Posible registro incompleto (${n} de ${expected})`);
    }
    return make(row, "info", "hoy_se_finaliza", `Se finaliza esta noche (${R.autoFinalizeTime})`);
  }

  // d >= 1
  if (row.estado === "sin_registro") {
    if (d <= R.sinRegistroDangerMaxDays) return make(row, "danger", "sin_enlace", "Sin enlace de registro");
    if (d <= R.sinRegistroWarningMaxDays) return make(row, "warning", "sin_enlace", "Sin enlace de registro");
    return make(row, "info", "sin_enlace", "Sin enlace de registro");
  }
  if (notStarted) {
    // iniciado, or borrador with 0 viajeros
    if (d <= R.noIniciadoWarningMaxDays) return make(row, "warning", "no_iniciado", "Registro no iniciado");
    return make(row, "info", "no_iniciado", "Registro no iniciado");
  }

  // borrador with n > 0
  if (expected === null) return make(row, "ok", "en_curso", `Registro en curso (${n} registrados)`);
  if (n > expected && exact) return make(row, "info", "mas_de_los_previstos", "Más viajeros que los previstos");
  if (n >= expected) return make(row, "ok", "completo", "Completo, pendiente de finalizar");
  return make(row, "info", "faltan_viajeros", `Faltan viajeros por registrar (${n} de ${expected})`);
}

/** Colour of the compact "n/N" cell; derived from the situation so it never contradicts the pill. */
export type ViajerosTone = "ok" | "pendiente_fuerte" | "pendiente_suave" | "muted";

/**
 * Same colour code as the pill (situacionTone): complete -> green; pending situations -> orange,
 * strong when the entry is imminent, soft otherwise; everything else muted gray. Never red.
 */
export function viajerosTone(row: AlertRowInput, ctx: { today: string }, expected: Expected): ViajerosTone {
  const t = situacionTone(situacionRegistro(row, { expected }), row, ctx);
  if (t === "ok") return "ok";
  if (t === "pendiente_fuerte") return "pendiente_fuerte";
  if (t === "pendiente_suave") return "pendiente_suave";
  return "muted"; // neutro, error
}

/**
 * Tooltip / aria-label of the "n/N" cell. The children caveat is only added when the
 * expected number may include children (expected not exact).
 */
export function viajerosTooltip(numViajeros: number | null, ex: Expected): string {
  const n = numViajeros ?? 0;
  const registrados = n === 1 ? "1 viajero registrado" : `${n} viajeros registrados`;
  if (ex.expected === null) return `${registrados}.`;
  const previstos = ex.expected === 1 ? "1 previsto" : `${ex.expected} previstos`;
  const base = `${registrados} de ${previstos}.`;
  return ex.exact ? base : `${base} ${COMPARISON_TOOLTIP}`;
}

// ---------- Europe/Madrid date-time helpers (datetime-local <-> timestamptz) ----------

const MADRID = "Europe/Madrid";

function madridParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute") };
}

/** Madrid wall-clock minus UTC, in minutes, at an instant (60 in winter, 120 in summer). */
function madridOffsetMin(ms: number): number {
  const p = madridParts(ms);
  const minute = Math.floor(ms / 60_000) * 60_000;
  return (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - minute) / 60_000;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `datetime-local` value ("YYYY-MM-DDTHH:mm") for an instant, expressed in Madrid time. */
export function toMadridLocalInput(date: Date | string): string {
  const ms = typeof date === "string" ? Date.parse(date) : date.getTime();
  const p = madridParts(ms);
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}T${pad2(p.h)}:${pad2(p.mi)}`;
}

/** Interprets a `datetime-local` value as Madrid wall time and returns the UTC ISO string. */
export function madridLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = wall - madridOffsetMin(wall) * 60_000;
  guess = wall - madridOffsetMin(guess) * 60_000; // second pass settles instants next to a DST change
  return new Date(guess).toISOString();
}

/** "dd/MM/yy HH:mm" in Madrid time ("—" when empty/invalid). */
export function fmtMadridDateTime(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "—";
  const p = madridParts(Date.parse(iso));
  return `${pad2(p.d)}/${pad2(p.mo)}/${String(p.y).slice(-2)} ${pad2(p.h)}:${pad2(p.mi)}`;
}

/**
 * True when the KB check-in date no longer matches the row's fecha_checkin: the reservation date
 * changed after the sync created the row, so the row is stale and must not be shown.
 * Unknown KB date (null/empty) is not stale.
 */
export function isStaleRegistre(fechaCheckin: string, kbCheckIn: string | null | undefined): boolean {
  return !!kbCheckIn && kbCheckIn.slice(0, 10) !== fechaCheckin.slice(0, 10);
}

export const isValidIso = (s: string | null | undefined): s is string => !!s && ISO_RE.test(s);

// ---------- sorting of the /registre-hostes list ----------

export type SortKey =
  | "entrada"
  | "urgencia"
  | "apartamento"
  | "reserva"
  | "huesped"
  | "portal"
  | "viajeros"
  | "sync"
  | "reclamacion";
export type SortDir = "asc" | "desc";

export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "entrada", dir: "asc" };

/** Options of the mobile "Ordenar por" select ("urgencia" is also the Estado column sort). */
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "entrada", label: "Entrada" },
  { key: "urgencia", label: "Urgencia" },
  { key: "apartamento", label: "Apartamento" },
  { key: "reserva", label: "Reserva" },
  { key: "huesped", label: "Huésped" },
  { key: "portal", label: "Portal" },
  { key: "viajeros", label: "Viajeros" },
  { key: "sync", label: "Sincronizado" },
  { key: "reclamacion", label: "Reclamación" },
];

/** What a row exposes to the sort. `urgency` is Alert.priority: LOWER = MORE URGENT. */
export interface SortableRow {
  fecha_checkin: string;
  urgency: number;
  unit: string | null;
  numero_reserva: string;
  huesped: string | null;
  portal: string | null;
  viajeros: number | null;
  ultimo_sync: string | null;
  /** Number of reclamations, or null when the row has no "Reclamado N" badge (not reclaimable). */
  reclamacionCount: number | null;
  lastReclamacionAt: string | null;
}

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
const cmpStr = (a: string, b: string) => collator.compare(a, b);
const cmpNum = (a: number, b: number) => a - b;
const cmpTime = (a: string, b: string) => Date.parse(a) - Date.parse(b);

/** Empty values (null/undefined/"") always go last, whatever the direction. */
function cmpField<T>(a: T | null | undefined, b: T | null | undefined, dir: SortDir, cmp: (x: T, y: T) => number): number {
  const ea = a === null || a === undefined || (a as unknown) === "";
  const eb = b === null || b === undefined || (b as unknown) === "";
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  const c = cmp(a as T, b as T);
  return dir === "asc" ? c : -c;
}

/**
 * Comparator for one sort key. The direction only flips the primary key; the tie-breakers are
 * fixed: entry date asc, most urgent first, unit name, reservation number.
 */
export function compareRows(key: SortKey, dir: SortDir): (a: SortableRow, b: SortableRow) => number {
  const tie = (a: SortableRow, b: SortableRow, skip: "fecha" | "urgency" | null) =>
    (skip === "fecha" ? 0 : cmpStr(a.fecha_checkin, b.fecha_checkin)) ||
    (skip === "urgency" ? 0 : cmpNum(a.urgency, b.urgency)) ||
    cmpField(a.unit, b.unit, "asc", cmpStr) ||
    cmpStr(a.numero_reserva, b.numero_reserva);

  return (a, b) => {
    switch (key) {
      case "entrada":
        // date (dir) -> most urgent first -> unit
        return cmpField(a.fecha_checkin, b.fecha_checkin, dir, cmpStr) || tie(a, b, "fecha");
      case "urgencia":
        // asc = most urgent first (urgency already contains the entry date as its last component)
        return cmpField(a.urgency, b.urgency, dir, cmpNum) || tie(a, b, "urgency");
      case "apartamento":
        return cmpField(a.unit, b.unit, dir, cmpStr) || tie(a, b, null);
      case "reserva":
        return cmpField(a.numero_reserva, b.numero_reserva, dir, cmpStr) || tie(a, b, null);
      case "huesped":
        return cmpField(a.huesped, b.huesped, dir, cmpStr) || tie(a, b, null);
      case "portal":
        return cmpField(a.portal, b.portal, dir, cmpStr) || tie(a, b, null);
      case "viajeros":
        return cmpField(a.viajeros, b.viajeros, dir, cmpNum) || tie(a, b, null);
      case "sync":
        return cmpField(a.ultimo_sync, b.ultimo_sync, dir, cmpTime) || tie(a, b, null);
      case "reclamacion":
        // by count, then by last reclamation date; rows without the badge (null) go last in both directions
        return (
          cmpField(a.reclamacionCount, b.reclamacionCount, dir, cmpNum) ||
          cmpField(a.lastReclamacionAt, b.lastReclamacionAt, dir, cmpTime) ||
          tie(a, b, null)
        );
    }
  };
}

/** Sorted copy of `rows`; stable: rows that compare equal keep their input order. */
export function sortRows<T>(rows: readonly T[], key: SortKey, dir: SortDir, pick: (row: T) => SortableRow): T[] {
  const cmp = compareRows(key, dir);
  return rows
    .map((row, i) => ({ row, i, s: pick(row) }))
    .sort((a, b) => cmp(a.s, b.s) || a.i - b.i)
    .map((x) => x.row);
}

// ---------- one visible "situación" per row ----------

export type SituacionCode =
  | "excluida"
  | "anulado"
  | "error"
  | "manual"
  | "finalizado"
  | "no_generado"
  | "generado_sin_registros"
  | "completado"
  | "parcial"
  | "en_curso"
  | "otro";

export interface Situacion {
  code: SituacionCode;
  label: string;
}

export const SITUACION_LABEL: Record<Exclude<SituacionCode, "otro">, string> = {
  excluida: "Excluida",
  anulado: "Anulado",
  error: "Error de sincronización",
  manual: "Marcado a mano",
  finalizado: "Finalizado",
  no_generado: "No generado",
  generado_sin_registros: "Generado sin registros",
  completado: "Completado",
  parcial: "Parcial (Faltan registros)",
  en_curso: "En curso",
};

/** Options of the "Estado" filter select (short labels), in display order. */
export const SITUACIONES_FILTRO: { code: SituacionCode; label: string }[] = [
  { code: "no_generado", label: "No generado" },
  { code: "generado_sin_registros", label: "Generado sin registros" },
  { code: "parcial", label: "Parcial" },
  { code: "completado", label: "Completado" },
  { code: "en_curso", label: "En curso" },
  { code: "finalizado", label: "Finalizado" },
  { code: "anulado", label: "Anulado" },
  { code: "error", label: "Error" },
  { code: "manual", label: "Marcado a mano" },
];

/**
 * The single, action-oriented label shown for a row (instead of Partee's raw estado + a second
 * interpretation line). The colour still comes from alertLevel; this only decides the words.
 */
export function situacionRegistro(row: AlertRowInput, ctx: { expected: Expected }): Situacion {
  const mk = (code: Exclude<SituacionCode, "otro">): Situacion => ({ code, label: SITUACION_LABEL[code] });
  if (row.excluida) return mk("excluida");
  switch (row.estado) {
    case "anulado":
      return mk("anulado");
    case "error":
      return mk("error");
    case "manual":
      return mk("manual");
    case "finalizado":
      return mk("finalizado");
    case "sin_registro":
      return mk("no_generado");
    case "iniciado":
      return mk("generado_sin_registros");
    case "borrador": {
      const n = row.num_viajeros ?? 0;
      if (n === 0) return mk("generado_sin_registros");
      if (row.registro_confirmado) return mk("completado");
      const ex = ctx.expected.expected;
      if (ex === null) return mk("en_curso");
      return n >= ex ? mk("completado") : mk("parcial");
    }
  }
  // Defensive default: a state we do not know yet shows its raw label.
  return { code: "otro", label: ESTADO_LABEL[row.estado] ?? row.estado };
}

/**
 * Pill colour. ONE fixed colour per situation; the only variation is the intensity of the orange of
 * the pending situations (No generado, Generado sin registros, Parcial): strong when the entry is
 * imminent (d <= PARTEE_RULES.noIniciadoWarningMaxDays, overdue included), soft otherwise.
 * It deliberately ignores alertLevel.
 */
export type SituacionTone = "ok" | "pendiente_fuerte" | "pendiente_suave" | "neutro" | "error";

const PENDIENTES: ReadonlySet<SituacionCode> = new Set<SituacionCode>(["no_generado", "generado_sin_registros", "parcial"]);

/** Something is still missing: the guest has not generated / completed the registration. */
export const isPendiente = (s: Situacion): boolean => PENDIENTES.has(s.code);

/**
 * "Urgentes" counter: a pending situation (No generado, Generado sin registros, Parcial) whose entry is today or
 * tomorrow (d <= 1), plus every overdue parte (alert code `vencido`, exactly as alertLevel defines it, terminal
 * states included/excluded as there). Excluded reservations are never urgent.
 */
export function isUrgente(row: AlertRowInput, ctx: AlertContext): boolean {
  if (row.excluida) return false;
  if (alertLevel(row, ctx).code === "vencido") return true;
  return diffDays(ctx.today, row.fecha_checkin) <= 1 && isPendiente(situacionRegistro(row, ctx));
}

export function situacionTone(situacion: Situacion, row: AlertRowInput, ctx: { today: string }): SituacionTone {
  switch (situacion.code) {
    case "completado":
    case "finalizado":
      return "ok";
    case "error":
      return "error";
    case "no_generado":
    case "generado_sin_registros":
    case "parcial": {
      const d = diffDays(ctx.today, row.fecha_checkin);
      return d <= PARTEE_RULES.noIniciadoWarningMaxDays ? "pendiente_fuerte" : "pendiente_suave";
    }
    default:
      return "neutro"; // en_curso, anulado, manual, excluida, otro
  }
}

/** The "Reclamado N" badge and the "Reclamar" button only make sense while something is missing. */
export const isReclamable = (s: Situacion): boolean => isPendiente(s);

/** Tooltip of the "Reclamado N" badge. */
export function reclamacionTooltip(
  count: number,
  last: { enviada_en: string; canal: string | null } | null,
  now: Date = new Date(),
): string {
  if (count < 1 || !last) return "Sin reclamaciones";
  const canal = last.canal ? ` · ${CANAL_LABEL[last.canal] ?? last.canal}` : "";
  return `Última reclamación: ${fmtAgo(last.enviada_en, now)}${canal}`;
}

/** Tooltip of the situation pill: the technical detail that the label hides. */
export function situacionTooltip(row: AlertRowInput, expected: Expected): string {
  const parts = [`Estado en Partee: ${row.estado}`];
  if (row.num_viajeros !== null && row.num_viajeros !== undefined) {
    const n = row.num_viajeros;
    const registrados = n === 1 ? "1 viajero registrado" : `${n} viajeros registrados`;
    const ex = expected.expected;
    if (ex === null) parts.push(registrados);
    else parts.push(`${registrados} de ${ex === 1 ? "1 previsto" : `${ex} previstos`}`);
  }
  return parts.join(". ") + ".";
}
