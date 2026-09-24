import type {
  AjusteDia, DiaSemanaPeriodo, Evento, EventoTipoValor, PrecioBase, Temporada, TemporadaAplicaA,
} from "@/lib/pricing";
import { addDaysISO } from "@/lib/format";

// Pure price calculation for one day. No I/O, no UI: everything comes in through `data`.

export type CalcData = {
  /** With temporada_periodos already embedded, as fetchTemporadas returns them. */
  temporadas: Temporada[];
  diaSemanaPeriodos: DiaSemanaPeriodo[];
  precioBase: PrecioBase[];
  eventos: Evento[];
};

/** The temporada whose coefficient is applied to the day, and where it came from. */
export type TemporadaEfectiva = {
  temporadaId: string;
  codigo: string;
  nombre: string;
  coeficiente: number;
  origen: "periodo" | "evento" | "manual";
  /** Set when origen is "evento": the event that rectified the temporada. */
  eventoId: string | null;
  eventoNombre: string | null;
};

/** An event that proposes replacing the period's temporada, with the temporada it points to. */
export type CandidatoTemporada = {
  eventoId: string;
  eventoNombre: string;
  temporadaId: string;
  codigo: string;
  nombre: string;
  coeficiente: number;
  /** True for the one that is applied (highest coeficiente). */
  ganador: boolean;
};

export type EfectoDia = {
  eventoId: string;
  nombre: string;
  tipoValor: EventoTipoValor | null;
  valor: number;
  /** Amount added to (or taken from) the price, before the final rounding. */
  delta: number;
};

export type FuenteEstanciaMinima = {
  origen: "periodo" | "evento" | "manual";
  /** Temporada label for the period, event name for an event, "Ajuste manual" for a manual override. */
  nombre: string;
  valor: number;
  /** True when this source's value is the one that sets the final minimum stay. */
  aplicada: boolean;
};

export type DiaCalculado = {
  fecha: string;
  aplicaA: TemporadaAplicaA;
  precioBase: number;

  /** Temporada actually applied. */
  temporada: TemporadaEfectiva;
  /** The temporada of the covering period, before any event override (for comparison in the breakdown). */
  temporadaPeriodo: { temporadaId: string; codigo: string; nombre: string; coeficiente: number };
  /** True when an event replaced the period's temporada (informational: the price formula is the same either way). */
  hayRectificacion: boolean;
  /** Every temporada-override event considered (empty when none), sorted best first. */
  candidatosTemporada: CandidatoTemporada[];
  /** Ready-made explanation when more than one event proposed a temporada, null otherwise. */
  notaTemporada: string | null;

  dia: { etiqueta: "Entre semana" | "Fin de semana"; coeficiente: number };

  /** precioBase × coeficiente de la temporada efectiva: the price after the temporada step. */
  precioTrasTemporada: number;
  /** precioBase × coeficiente de la temporada efectiva × coeficiente del día. */
  subtotal: number;

  efectos: EfectoDia[];
  efectosTotal: number;

  /** subtotal + efectos, rounded to whole euros — the underlying calculation, regardless of any manual override. */
  precioCalculado: number;
  /** Set when an ajuste manual overrides the day's price; null when the day uses the calculated one. */
  precioManual: number | null;
  /** precioManual when set, precioCalculado otherwise — the price to actually display/use (e.g. for the heatmap). */
  precioFinal: number;

  estanciaMinima: number | null;
  estanciaMinimaFuentes: FuenteEstanciaMinima[];
};

/** Day of week (0 = Sunday … 6 = Saturday) of a "YYYY-MM-DD" date, independent of timezone. */
function diaDeLaSemana(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const cubre = (p: { fecha_inicio: string; fecha_fin: string }, fecha: string) =>
  p.fecha_inicio <= fecha && fecha <= p.fecha_fin;

/** Events active on a date: confirmed, covering it, for this grupo or "ambos". Shared with the calendar view. */
export function eventosActivosDia(eventos: Evento[], fecha: string, aplicaA: TemporadaAplicaA): Evento[] {
  return eventos.filter(
    (e) => e.estado === "confirmado" && cubre(e, fecha) && (e.aplica_a === "ambos" || e.aplica_a === aplicaA),
  );
}

/**
 * Whether sorted `fechas` can go to asignar_temporada_rango (or the eventos
 * "Asignar a evento" flow) as the single range [first, last]: every calculable
 * day in between must be selected. An unselected "Sin datos" day (null in
 * `dias`) is fine, since it has no checkbox and range-fill already skips it, so
 * the range just covers it too. 0 or 1 dates always count as valid.
 * Extracted from dias-edicion-masiva-dialog.tsx (its original, only caller
 * until now) so dias-asignar-evento-dialog.tsx can reuse it too — matching how
 * findCoverageGaps is genuinely shared rather than duplicated per file.
 */
export function esRangoContinuo(fechas: string[], dias: Map<string, DiaCalculado | null>): boolean {
  if (fechas.length < 2) return true;
  const seleccionadas = new Set(fechas);
  const hasta = fechas[fechas.length - 1];
  for (let d = fechas[0]; d <= hasta; d = addDaysISO(d, 1)) {
    if (!seleccionadas.has(d) && dias.get(d) != null) return false;
  }
  return true;
}

/** Whole days between two "YYYY-MM-DD" dates (b - a); negative if b is before a. */
export function diffDaysISO(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86_400_000);
}

/**
 * Full price breakdown for one day, or null when it can't be calculated: no temporada
 * period, no día-de-la-semana period, or no precio base covers that date / año / grupo.
 * `ajusteDia`, when given, carries that day's manual overrides: each field it sets wins
 * outright over the normal período/evento calculation for that piece of the breakdown.
 */
export function calcularPrecioDia(
  fecha: string,
  aplicaA: TemporadaAplicaA,
  data: CalcData,
  ajusteDia?: AjusteDia,
): DiaCalculado | null {
  const anio = Number(fecha.slice(0, 4));

  // 1. Temporada period covering the date (same grupo and año).
  let temporadaBase: Temporada | null = null;
  let periodo: Temporada["temporada_periodos"][number] | null = null;
  for (const t of data.temporadas) {
    if (t.aplica_a !== aplicaA || t.anio !== anio) continue;
    const p = t.temporada_periodos.find((x) => cubre(x, fecha));
    if (p) { temporadaBase = t; periodo = p; break; }
  }
  if (!temporadaBase || !periodo) return null;

  // 2. Día de la semana period: Monday–Thursday → entre semana, Friday–Sunday → fin de semana.
  const diaPeriodo = data.diaSemanaPeriodos.find(
    (p) => p.aplica_a === aplicaA && p.anio === anio && cubre(p, fecha),
  );
  if (!diaPeriodo) return null;
  const dow = diaDeLaSemana(fecha);
  const esFinDeSemana = dow === 5 || dow === 6 || dow === 0;
  const dia = esFinDeSemana
    ? { etiqueta: "Fin de semana" as const, coeficiente: diaPeriodo.coef_finsemana }
    : { etiqueta: "Entre semana" as const, coeficiente: diaPeriodo.coef_entresemana };

  const base = data.precioBase.find((p) => p.aplica_a === aplicaA && p.anio === anio);
  if (!base) return null;
  const precioBase = base.precio;

  // 3. Active events: confirmed, covering the date, for this grupo or "ambos".
  const activos = eventosActivosDia(data.eventos, fecha, aplicaA);

  // 4. Events that override the temporada: the highest coeficiente wins. Ties are broken by
  //    earliest fecha_inicio, then nombre, so the outcome is deterministic.
  const candidatos = activos
    .filter((e) => e.temporada_override_id != null)
    .map((e) => ({ e, target: data.temporadas.find((t) => t.id === e.temporada_override_id) }))
    .filter((x): x is { e: Evento; target: Temporada } => x.target !== undefined)
    .sort(
      (a, b) =>
        b.target.coeficiente - a.target.coeficiente ||
        a.e.fecha_inicio.localeCompare(b.e.fecha_inicio) ||
        a.e.nombre.localeCompare(b.e.nombre),
    );
  const ganador = candidatos[0] ?? null;
  const candidatosTemporada: CandidatoTemporada[] = candidatos.map((c, i) => ({
    eventoId: c.e.id,
    eventoNombre: c.e.nombre,
    temporadaId: c.target.id,
    codigo: c.target.codigo,
    nombre: c.target.nombre,
    coeficiente: c.target.coeficiente,
    ganador: i === 0,
  }));

  const temporadaPeriodo = {
    temporadaId: temporadaBase.id,
    codigo: temporadaBase.codigo,
    nombre: temporadaBase.nombre,
    coeficiente: temporadaBase.coeficiente,
  };

  // A manual temporada override wins outright: no comparison against períodos or eventos at all.
  const temporadaManual =
    ajusteDia?.temporada_id != null ? data.temporadas.find((t) => t.id === ajusteDia.temporada_id) ?? null : null;

  const temporada: TemporadaEfectiva = temporadaManual
    ? {
        temporadaId: temporadaManual.id,
        codigo: temporadaManual.codigo,
        nombre: temporadaManual.nombre,
        coeficiente: temporadaManual.coeficiente,
        origen: "manual",
        eventoId: null,
        eventoNombre: null,
      }
    : ganador
      ? {
          temporadaId: ganador.target.id,
          codigo: ganador.target.codigo,
          nombre: ganador.target.nombre,
          coeficiente: ganador.target.coeficiente,
          origen: "evento",
          eventoId: ganador.e.id,
          eventoNombre: ganador.e.nombre,
        }
      : { ...temporadaPeriodo, origen: "periodo", eventoId: null, eventoNombre: null };

  // Moot once a manual override decides the day outright, so the conflict note is suppressed then.
  const notaTemporada =
    !temporadaManual && candidatosTemporada.length > 1
      ? `Varios eventos proponen cambiar la temporada: ${candidatosTemporada
          .map((c) => `${c.eventoNombre} → ${c.codigo} (${c.coeficiente})`)
          .join("; ")}. Se aplica ${candidatosTemporada[0].codigo} (${candidatosTemporada[0].coeficiente}), la de mayor coeficiente.`
      : null;

  // 5. Subtotal: a straight multiplication, whichever temporada applies (period or winning event).
  const hayRectificacion = ganador !== null;
  const precioTrasTemporada = precioBase * temporada.coeficiente;
  const subtotal = precioTrasTemporada * dia.coeficiente;

  // 6. Every active event with a valor: each computed against the same subtotal, then summed.
  const efectos: EfectoDia[] = activos
    .filter((e) => e.valor != null)
    .map((e) => ({
      eventoId: e.id,
      nombre: e.nombre,
      tipoValor: e.tipo_valor,
      valor: e.valor as number,
      delta: e.tipo_valor === "%" ? subtotal * ((e.valor as number) / 100) : (e.valor as number),
    }));
  const efectosTotal = efectos.reduce((sum, ef) => sum + ef.delta, 0);

  // 7. Final price: the calculated one, unless a manual precio overrides it outright.
  const precioCalculado = Math.round(subtotal + efectosTotal);
  const precioManual = ajusteDia?.precio_manual ?? null;
  const precioFinal = precioManual ?? precioCalculado;

  // 8. Minimum stay: the maximum of the period's and every active event's (including temporada-
  //    override events that lost the conflict) — UNLESS a manual value replaces that whole
  //    calculation outright, rather than joining it as another candidate.
  let estanciaMinima: number | null;
  let estanciaMinimaFuentes: FuenteEstanciaMinima[];
  if (ajusteDia?.estancia_minima != null) {
    estanciaMinima = ajusteDia.estancia_minima;
    estanciaMinimaFuentes = [{ origen: "manual", nombre: "Ajuste manual", valor: estanciaMinima, aplicada: true }];
  } else {
    const fuentesRaw: Omit<FuenteEstanciaMinima, "aplicada">[] = [];
    if (periodo.estancia_minima != null) {
      fuentesRaw.push({ origen: "periodo", nombre: `${temporadaBase.codigo} · ${temporadaBase.nombre}`, valor: periodo.estancia_minima });
    }
    for (const e of activos) {
      if (e.estancia_minima != null) fuentesRaw.push({ origen: "evento", nombre: e.nombre, valor: e.estancia_minima });
    }
    estanciaMinima = fuentesRaw.length ? Math.max(...fuentesRaw.map((f) => f.valor)) : null;
    estanciaMinimaFuentes = fuentesRaw.map((f) => ({ ...f, aplicada: f.valor === estanciaMinima }));
  }

  return {
    fecha,
    aplicaA,
    precioBase,
    temporada,
    temporadaPeriodo,
    hayRectificacion,
    candidatosTemporada,
    notaTemporada,
    dia,
    precioTrasTemporada,
    subtotal,
    efectos,
    efectosTotal,
    precioCalculado,
    precioManual,
    precioFinal,
    estanciaMinima,
    estanciaMinimaFuentes,
  };
}

export type AnioCalculado = {
  /** Every day of the año, "YYYY-MM-DD" → breakdown, or null when it can't be calculated. */
  dias: Map<string, DiaCalculado | null>;
  /** Lowest / highest precioFinal among the calculable days; null when none is calculable. */
  rango: { min: number; max: number } | null;
};

/**
 * Calculates every day of `anio` once, so a calendar can page between months without recomputing.
 * `ajustesDia` is the year's full list of manual overrides (any aplica_a); only the ones matching
 * this `aplicaA` are used, each passed to its own day's `calcularPrecioDia` call. The heatmap range
 * is driven by each day's precioFinal, so a manual precio (not just the calculated one) shapes it too.
 */
export function calcularAnio(
  anio: number,
  aplicaA: TemporadaAplicaA,
  data: CalcData,
  ajustesDia: AjusteDia[] = [],
): AnioCalculado {
  const ajustesPorFecha = new Map(ajustesDia.filter((a) => a.aplica_a === aplicaA).map((a) => [a.fecha, a]));
  const dias = new Map<string, DiaCalculado | null>();
  let min = Infinity;
  let max = -Infinity;
  for (let t = Date.UTC(anio, 0, 1); new Date(t).getUTCFullYear() === anio; t += 86_400_000) {
    const fecha = new Date(t).toISOString().slice(0, 10);
    const r = calcularPrecioDia(fecha, aplicaA, data, ajustesPorFecha.get(fecha));
    dias.set(fecha, r);
    if (r) {
      if (r.precioFinal < min) min = r.precioFinal;
      if (r.precioFinal > max) max = r.precioFinal;
    }
  }
  return { dias, rango: min <= max ? { min, max } : null };
}
