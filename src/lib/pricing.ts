import { supabase } from "@/integrations/supabase/client";
import { addDaysISO, addYearsISO } from "@/lib/format";

// pricing.eventos lives in the `pricing` Postgres schema, not `public` — the
// generated Database type (src/integrations/supabase/types.ts) doesn't cover
// it, so these calls go through an untyped client, the same way other
// out-of-schema/ungenerated tables are queried elsewhere in this app (e.g.
// personal-admin.tsx's `(supabase as any).from(...)` calls).
const pricingDb = () => (supabase as any).schema("pricing");

export type EventoCategoria = "feria" | "deporte" | "cultura" | "otro";
export type EventoAplicaA = "city" | "rural" | "ambos";
export type EventoFase = "principal" | "previo" | "post";
export type EventoEstado = "confirmado" | "propuesto" | "descartado";
export type EventoPeriodicidad = "anual" | "bianual" | "puntual";
export type EventoTipoValor = "%" | "€";

export type Evento = {
  id: string;
  id_negocio: string;
  nombre: string;
  categoria: EventoCategoria;
  fecha_inicio: string;
  fecha_fin: string;
  aplica_a: EventoAplicaA;
  valor: number | null;
  tipo_valor: EventoTipoValor | null;
  estancia_minima: number | null;
  afluencia_estimada: number | null;
  ubicacion: string | null;
  fase: EventoFase;
  evento_relacionado_id: string | null;
  plantilla_id: string | null;
  temporada_override_id: string | null;
  estado: EventoEstado;
  periodicidad: EventoPeriodicidad;
  fuente: string;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchEventos(): Promise<Evento[]> {
  const { data, error } = await pricingDb()
    .from("eventos")
    .select("*")
    .order("fecha_inicio", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Evento[];
}

export type NuevoEventoInput = {
  nombre: string;
  categoria: EventoCategoria;
  fecha_inicio: string;
  fecha_fin: string;
  aplica_a: EventoAplicaA;
  valor: number | null;
  tipo_valor: EventoTipoValor | null;
  estancia_minima?: number | null;
  fase?: EventoFase;
  evento_relacionado_id?: string | null;
  plantilla_id?: string | null;
  notas: string | null;
};

// estado/fuente are never set from this UI — manual entry relies on the
// table's own defaults ('confirmado' / 'manual').
export async function insertEvento(input: NuevoEventoInput): Promise<void> {
  const payload = {
    nombre: input.nombre,
    categoria: input.categoria,
    fecha_inicio: input.fecha_inicio,
    fecha_fin: input.fecha_fin,
    aplica_a: input.aplica_a,
    valor: input.valor,
    tipo_valor: input.valor != null ? input.tipo_valor : null,
    estancia_minima: input.estancia_minima ?? null,
    fase: input.fase ?? "principal",
    evento_relacionado_id: input.evento_relacionado_id ?? null,
    plantilla_id: input.plantilla_id ?? null,
    notas: input.notas,
  };
  const { error } = await pricingDb().from("eventos").insert(payload);
  if (error) throw error;
}

export type EventoUpdate = Partial<
  Pick<
    Evento,
    | "nombre"
    | "categoria"
    | "aplica_a"
    | "fecha_inicio"
    | "fecha_fin"
    | "valor"
    | "tipo_valor"
    | "estancia_minima"
    | "afluencia_estimada"
    | "ubicacion"
    | "notas"
    | "estado"
    | "temporada_override_id"
  >
>;

export async function updateEvento(id: string, changes: EventoUpdate): Promise<void> {
  const { error } = await pricingDb().from("eventos").update(changes).eq("id", id);
  if (error) throw error;
}

export async function descartarEvento(id: string): Promise<void> {
  const { error } = await pricingDb().from("eventos").update({ estado: "descartado" }).eq("id", id);
  if (error) throw error;
}

export async function confirmarEvento(id: string): Promise<void> {
  const { error } = await pricingDb().from("eventos").update({ estado: "confirmado" }).eq("id", id);
  if (error) throw error;
}

export type PlantillaFuente = {
  id: string;
  plantilla_id: string;
  url: string;
  descripcion: string | null;
  created_at: string;
};

export type Plantilla = {
  id: string;
  id_negocio: string;
  nombre: string;
  categoria: EventoCategoria;
  aplica_a: EventoAplicaA;
  periodicidad: EventoPeriodicidad;
  activo: boolean;
  created_at: string;
  updated_at: string;
  plantillas_fuentes: PlantillaFuente[];
};

export async function fetchPlantillas(): Promise<Plantilla[]> {
  const { data, error } = await pricingDb()
    .from("plantillas_eventos")
    .select("*, plantillas_fuentes(*)")
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Plantilla[];
}

export type PlantillaEditable = Pick<Plantilla, "nombre" | "categoria" | "aplica_a" | "periodicidad" | "activo">;

export async function updatePlantilla(id: string, changes: PlantillaEditable): Promise<void> {
  const { error } = await pricingDb().from("plantillas_eventos").update(changes).eq("id", id);
  if (error) throw error;
}

export async function addFuente(plantillaId: string, url: string, descripcion: string | null): Promise<void> {
  const { error } = await pricingDb()
    .from("plantillas_fuentes")
    .insert({ plantilla_id: plantillaId, url, descripcion });
  if (error) throw error;
}

export async function deleteFuente(id: string): Promise<void> {
  const { error } = await pricingDb().from("plantillas_fuentes").delete().eq("id", id);
  if (error) throw error;
}

export type NuevaPlantillaInput = Pick<Plantilla, "nombre" | "categoria" | "aplica_a" | "periodicidad">;

export type PrimeraEdicionInput = Pick<
  NuevoEventoInput,
  "fecha_inicio" | "fecha_fin" | "valor" | "tipo_valor" | "estancia_minima"
>;

// Two inserts, not a transaction: if the edition insert fails, the plantilla
// just created is deleted again (best effort) so no orphan is left behind.
export async function insertPlantillaConPrimeraEdicion(
  plantilla: NuevaPlantillaInput,
  edicion: PrimeraEdicionInput,
): Promise<string> {
  const { data, error } = await pricingDb().from("plantillas_eventos").insert(plantilla).select("id").single();
  if (error) throw error;
  const plantillaId = (data as { id: string }).id;
  try {
    await insertEvento({
      nombre: plantilla.nombre,
      categoria: plantilla.categoria,
      aplica_a: plantilla.aplica_a,
      ...edicion,
      fase: "principal",
      plantilla_id: plantillaId,
      notas: null,
    });
  } catch (e) {
    await pricingDb().from("plantillas_eventos").delete().eq("id", plantillaId);
    throw e;
  }
  return plantillaId;
}

export type TemporadaAplicaA = "city" | "rural";

export type TemporadaPeriodo = {
  id: string;
  temporada_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  estancia_minima: number | null;
  created_at: string;
};

export type Temporada = {
  id: string;
  id_negocio: string;
  aplica_a: TemporadaAplicaA;
  anio: number;
  codigo: string;
  nombre: string;
  coeficiente: number;
  created_at: string;
  updated_at: string;
  temporada_periodos: TemporadaPeriodo[];
};

export async function fetchTemporadas(): Promise<Temporada[]> {
  const { data, error } = await pricingDb()
    .from("temporadas")
    .select("*, temporada_periodos(*)")
    .order("aplica_a", { ascending: true })
    .order("codigo", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Temporada[];
}

export type NuevaTemporadaInput = Pick<Temporada, "aplica_a" | "anio" | "codigo" | "nombre" | "coeficiente">;

export type TemporadaEditable = Pick<Temporada, "codigo" | "nombre" | "coeficiente">;

export type PeriodoInput = Pick<TemporadaPeriodo, "fecha_inicio" | "fecha_fin" | "estancia_minima">;

// Two inserts, not a transaction: if the period insert fails, the temporada
// just created is deleted again (best effort) so no orphan is left behind.
export async function insertTemporadaConPrimerPeriodo(
  temporada: NuevaTemporadaInput,
  periodo: PeriodoInput,
): Promise<string> {
  const { data, error } = await pricingDb().from("temporadas").insert(temporada).select("id").single();
  if (error) throw error;
  const temporadaId = (data as { id: string }).id;
  try {
    await insertPeriodo(temporadaId, periodo.fecha_inicio, periodo.fecha_fin, periodo.estancia_minima);
  } catch (e) {
    await pricingDb().from("temporadas").delete().eq("id", temporadaId);
    throw e;
  }
  return temporadaId;
}

export async function updateTemporada(id: string, changes: Partial<TemporadaEditable>): Promise<void> {
  const { error } = await pricingDb().from("temporadas").update(changes).eq("id", id);
  if (error) throw error;
}

export async function insertPeriodo(
  temporadaId: string,
  fechaInicio: string,
  fechaFin: string,
  estanciaMinima: number | null = null,
): Promise<void> {
  const { error } = await pricingDb()
    .from("temporada_periodos")
    .insert({ temporada_id: temporadaId, fecha_inicio: fechaInicio, fecha_fin: fechaFin, estancia_minima: estanciaMinima });
  if (error) throw error;
}

export async function deletePeriodo(id: string): Promise<void> {
  const { error } = await pricingDb().from("temporada_periodos").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Copies every temporada of `fromYear` (both groups) into `toYear`, with all
 * its periods shifted by the year gap. One identity insert per temporada plus
 * one periods batch each; if anything fails, the copies made so far are
 * deleted again (best effort). Returns the number of temporadas copied.
 */
export async function copyTemporadasToYear(fromYear: number, toYear: number): Promise<number> {
  const { data, error } = await pricingDb()
    .from("temporadas")
    .select("*, temporada_periodos(*)")
    .eq("anio", fromYear);
  if (error) throw error;
  const source = (data ?? []) as Temporada[];
  const gap = toYear - fromYear;
  const createdIds: string[] = [];
  try {
    for (const t of source) {
      const { data: created, error: insErr } = await pricingDb()
        .from("temporadas")
        .insert({ aplica_a: t.aplica_a, anio: toYear, codigo: t.codigo, nombre: t.nombre, coeficiente: t.coeficiente })
        .select("id")
        .single();
      if (insErr) throw insErr;
      const newId = (created as { id: string }).id;
      createdIds.push(newId);
      if (t.temporada_periodos.length === 0) continue;
      const { error: perErr } = await pricingDb()
        .from("temporada_periodos")
        .insert(
          t.temporada_periodos.map((p) => ({
            temporada_id: newId,
            fecha_inicio: addYearsISO(p.fecha_inicio, gap),
            fecha_fin: addYearsISO(p.fecha_fin, gap),
            estancia_minima: p.estancia_minima,
          })),
        );
      if (perErr) throw perErr;
    }
  } catch (e) {
    if (createdIds.length > 0) await pricingDb().from("temporadas").delete().in("id", createdIds);
    throw e;
  }
  return source.length;
}

export async function deleteTemporada(id: string): Promise<void> {
  const { error } = await pricingDb().from("temporadas").delete().eq("id", id);
  if (error) throw error;
}

/** Deletes every temporada of the year, both groups. */
export async function deleteTemporadasByYear(anio: number): Promise<void> {
  const { error } = await pricingDb().from("temporadas").delete().eq("anio", anio);
  if (error) throw error;
}

export type PeriodoConflict = { temporada: Temporada; periodo: TemporadaPeriodo };

/**
 * First period of any temporada other than `excludeTemporadaId` that overlaps
 * the given range (inclusive on both ends), or null.
 */
export function findPeriodoOverlap(
  temporadas: Temporada[],
  excludeTemporadaId: string | null,
  fechaInicio: string,
  fechaFin: string,
): PeriodoConflict | null {
  for (const t of temporadas) {
    if (t.id === excludeTemporadaId) continue;
    for (const p of t.temporada_periodos) {
      if (fechaInicio <= p.fecha_fin && p.fecha_inicio <= fechaFin) return { temporada: t, periodo: p };
    }
  }
  return null;
}

/** Any date range (inclusive on both ends); temporada periods and dia_semana periods both fit. */
export type PeriodoRango = { fecha_inicio: string; fecha_fin: string };

/** Stretches of `anio` (Jan 1 – Dec 31) not covered by any of the given date ranges. */
export function findCoverageGaps(periodos: PeriodoRango[], anio: number): { desde: string; hasta: string }[] {
  const yearStart = `${anio}-01-01`;
  const yearEnd = `${anio}-12-31`;
  const sorted = [...periodos].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  const gaps: { desde: string; hasta: string }[] = [];
  let cursor = yearStart; // first day not yet known to be covered
  for (const p of sorted) {
    if (cursor > yearEnd) break;
    if (p.fecha_fin < cursor) continue;
    if (p.fecha_inicio > cursor) gaps.push({ desde: cursor, hasta: addDaysISO(p.fecha_inicio, -1) });
    cursor = addDaysISO(p.fecha_fin, 1);
  }
  if (cursor <= yearEnd) gaps.push({ desde: cursor, hasta: yearEnd });
  return gaps;
}

export type DiaSemanaPeriodo = {
  id: string;
  id_negocio: string;
  aplica_a: TemporadaAplicaA;
  anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  /** Coefficient for weekdays. */
  coef_entresemana: number;
  /** Coefficient for Friday-Saturday-Sunday. */
  coef_finsemana: number;
  created_at: string;
  updated_at: string;
};

export async function fetchDiaSemanaPeriodos(): Promise<DiaSemanaPeriodo[]> {
  const { data, error } = await pricingDb()
    .from("dia_semana_periodos")
    .select("*")
    .order("aplica_a", { ascending: true })
    .order("fecha_inicio", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DiaSemanaPeriodo[];
}

export type NuevoDiaSemanaPeriodoInput = Pick<
  DiaSemanaPeriodo,
  "aplica_a" | "anio" | "fecha_inicio" | "fecha_fin" | "coef_entresemana" | "coef_finsemana"
>;

export async function insertDiaSemanaPeriodo(input: NuevoDiaSemanaPeriodoInput): Promise<void> {
  const { error } = await pricingDb().from("dia_semana_periodos").insert(input);
  if (error) throw error;
}

// aplica_a and anio stay fixed once created, same as temporadas.
export async function updateDiaSemanaPeriodo(
  id: string,
  changes: Partial<Omit<NuevoDiaSemanaPeriodoInput, "aplica_a" | "anio">>,
): Promise<void> {
  const { error } = await pricingDb().from("dia_semana_periodos").update(changes).eq("id", id);
  if (error) throw error;
}

export async function deleteDiaSemanaPeriodo(id: string): Promise<void> {
  const { error } = await pricingDb().from("dia_semana_periodos").delete().eq("id", id);
  if (error) throw error;
}

/** Copies every dia_semana period of `fromYear` (both groups) into `toYear`, dates shifted by the year gap, in one insert. Returns rows copied. */
export async function copyDiaSemanaPeriodosToYear(fromYear: number, toYear: number): Promise<number> {
  const { data, error } = await pricingDb().from("dia_semana_periodos").select("*").eq("anio", fromYear);
  if (error) throw error;
  const gap = toYear - fromYear;
  const rows = ((data ?? []) as DiaSemanaPeriodo[]).map((p) => ({
    aplica_a: p.aplica_a,
    anio: toYear,
    fecha_inicio: addYearsISO(p.fecha_inicio, gap),
    fecha_fin: addYearsISO(p.fecha_fin, gap),
    coef_entresemana: p.coef_entresemana,
    coef_finsemana: p.coef_finsemana,
  }));
  if (rows.length === 0) return 0;
  const { error: insErr } = await pricingDb().from("dia_semana_periodos").insert(rows);
  if (insErr) throw insErr;
  return rows.length;
}

/** Deletes every dia_semana period of the year, both groups. */
export async function deleteDiaSemanaPeriodosByYear(anio: number): Promise<void> {
  const { error } = await pricingDb().from("dia_semana_periodos").delete().eq("anio", anio);
  if (error) throw error;
}

export type PrecioBase = {
  id: string;
  id_negocio: string;
  aplica_a: TemporadaAplicaA;
  anio: number;
  precio: number;
  created_at: string;
  updated_at: string;
};

export async function fetchPrecioBase(): Promise<PrecioBase[]> {
  const { data, error } = await pricingDb()
    .from("precio_base")
    .select("*")
    .order("anio", { ascending: true })
    .order("aplica_a", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PrecioBase[];
}

// At most one row per (id_negocio, aplica_a, anio); id_negocio comes from the column default.
const PRECIO_BASE_CONFLICT = "id_negocio,aplica_a,anio";

/** Sets the base price for a year + group, creating the row if there isn't one yet. */
export async function upsertPrecioBase(aplicaA: TemporadaAplicaA, anio: number, precio: number): Promise<void> {
  const { error } = await pricingDb()
    .from("precio_base")
    .upsert({ aplica_a: aplicaA, anio, precio }, { onConflict: PRECIO_BASE_CONFLICT });
  if (error) throw error;
}

/** Copies the base price of `fromYear` (both groups, whichever exist) into `toYear`. Returns rows copied. */
export async function copyPrecioBaseToYear(fromYear: number, toYear: number): Promise<number> {
  const { data, error } = await pricingDb().from("precio_base").select("*").eq("anio", fromYear);
  if (error) throw error;
  const rows = ((data ?? []) as PrecioBase[]).map((p) => ({ aplica_a: p.aplica_a, anio: toYear, precio: p.precio }));
  if (rows.length === 0) return 0;
  const { error: upErr } = await pricingDb().from("precio_base").upsert(rows, { onConflict: PRECIO_BASE_CONFLICT });
  if (upErr) throw upErr;
  return rows.length;
}

/** Deletes the base price rows of the year, both groups. */
export async function deletePrecioBaseByYear(anio: number): Promise<void> {
  const { error } = await pricingDb().from("precio_base").delete().eq("anio", anio);
  if (error) throw error;
}

export type FestivoTipo = "nacional_catalan" | "local";

/** Calendar fact, not a pricing one: no aplica_a, and no effect on the price calculation for now. */
export type Festivo = {
  id: string;
  id_negocio: string;
  fecha: string;
  nombre: string;
  tipo: FestivoTipo;
  created_at: string;
  updated_at: string;
};

export async function fetchFestivos(): Promise<Festivo[]> {
  const { data, error } = await pricingDb().from("festivos").select("*").order("fecha", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Festivo[];
}

/** Manual entries are always "local". */
export async function insertFestivo(fecha: string, nombre: string): Promise<void> {
  const { error } = await pricingDb().from("festivos").insert({ fecha, nombre, tipo: "local" });
  if (error) throw error;
}

export async function deleteFestivo(id: string): Promise<void> {
  const { error } = await pricingDb().from("festivos").delete().eq("id", id);
  if (error) throw error;
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher): Easter Sunday of the given year, in UTC.
function domingoResurreccion(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/** The national + Catalan holidays of a year as { fecha, nombre }, sorted by date. Pure. */
export function festivosNacionalesCatalanes(anio: number): { fecha: string; nombre: string }[] {
  const fixed: [number, number, string][] = [
    [1, 1, "Año Nuevo"],
    [1, 6, "Reyes"],
    [5, 1, "Fiesta del Trabajo"],
    [6, 24, "San Juan"],
    [8, 15, "La Asunción"],
    [9, 11, "Diada Nacional de Cataluña"],
    [10, 12, "Fiesta Nacional de España"],
    [11, 1, "Todos los Santos"],
    [12, 6, "Día de la Constitución"],
    [12, 8, "La Inmaculada"],
    [12, 25, "Navidad"],
    [12, 26, "San Esteban"],
  ];
  const pad = (n: number) => String(n).padStart(2, "0");
  const lista = fixed.map(([mes, dia, nombre]) => ({ fecha: `${anio}-${pad(mes)}-${pad(dia)}`, nombre }));

  const pascua = domingoResurreccion(anio).toISOString().slice(0, 10);
  lista.push(
    { fecha: addDaysISO(pascua, -3), nombre: "Jueves Santo" },
    { fecha: addDaysISO(pascua, -2), nombre: "Viernes Santo" },
    { fecha: addDaysISO(pascua, 1), nombre: "Lunes de Pascua Florida" },
  );
  return lista.sort((x, y) => x.fecha.localeCompare(y.fecha));
}

/**
 * Upserts the national/Catalan holidays of `anio` (onConflict on the unique (id_negocio, fecha)), so
 * running it again for the same year updates the rows instead of duplicating them. A date that is
 * already stored — even as a "local" holiday — is overwritten as nacional_catalan. Returns rows upserted.
 */
export async function generarFestivosNacionalesCatalanes(anio: number): Promise<number> {
  const rows = festivosNacionalesCatalanes(anio).map((f) => ({ ...f, tipo: "nacional_catalan" as const }));
  const { error } = await pricingDb().from("festivos").upsert(rows, { onConflict: "id_negocio,fecha" });
  if (error) throw error;
  return rows.length;
}
