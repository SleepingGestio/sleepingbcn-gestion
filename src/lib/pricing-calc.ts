import type {
  DiaSemanaPeriodo, Evento, EventoTipoValor, PrecioBase, Temporada, TemporadaAplicaA,
} from "@/lib/pricing";

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
  origen: "periodo" | "evento";
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
  origen: "periodo" | "evento";
  /** Temporada label for the period, event name for an event. */
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

  /** Rounded to whole euros. */
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
 * Full price breakdown for one day, or null when it can't be calculated: no temporada
 * period, no día-de-la-semana period, or no precio base covers that date / año / grupo.
 */
export function calcularPrecioDia(
  fecha: string,
  aplicaA: TemporadaAplicaA,
  data: CalcData,
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
  const temporada: TemporadaEfectiva = ganador
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

  const notaTemporada =
    candidatosTemporada.length > 1
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

  // 7. Final price.
  const precioFinal = Math.round(subtotal + efectosTotal);

  // 8. Minimum stay: the maximum of the period's and every active event's, including
  //     temporada-override events that lost the conflict.
  const fuentesRaw: Omit<FuenteEstanciaMinima, "aplicada">[] = [];
  if (periodo.estancia_minima != null) {
    fuentesRaw.push({ origen: "periodo", nombre: `${temporadaBase.codigo} · ${temporadaBase.nombre}`, valor: periodo.estancia_minima });
  }
  for (const e of activos) {
    if (e.estancia_minima != null) fuentesRaw.push({ origen: "evento", nombre: e.nombre, valor: e.estancia_minima });
  }
  const estanciaMinima = fuentesRaw.length ? Math.max(...fuentesRaw.map((f) => f.valor)) : null;
  const estanciaMinimaFuentes = fuentesRaw.map((f) => ({ ...f, aplicada: f.valor === estanciaMinima }));

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

/** Calculates every day of `anio` once, so a calendar can page between months without recomputing. */
export function calcularAnio(anio: number, aplicaA: TemporadaAplicaA, data: CalcData): AnioCalculado {
  const dias = new Map<string, DiaCalculado | null>();
  let min = Infinity;
  let max = -Infinity;
  for (let t = Date.UTC(anio, 0, 1); new Date(t).getUTCFullYear() === anio; t += 86_400_000) {
    const fecha = new Date(t).toISOString().slice(0, 10);
    const r = calcularPrecioDia(fecha, aplicaA, data);
    dias.set(fecha, r);
    if (r) {
      if (r.precioFinal < min) min = r.precioFinal;
      if (r.precioFinal > max) max = r.precioFinal;
    }
  }
  return { dias, rango: min <= max ? { min, max } : null };
}
