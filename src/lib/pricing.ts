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

export type FuenteEstadoVerificacion = "ok" | "roto";

export type PlantillaFuente = {
  id: string;
  plantilla_id: string;
  url: string;
  descripcion: string | null;
  created_at: string;
  /** Verification is manual: Claude opens the URL and sets these two via direct SQL when asked. */
  ultima_verificacion: string | null;
  estado_verificacion: FuenteEstadoVerificacion | null;
  /** Ramon flags a fuente for an out-of-cycle check, independent of how stale ultima_verificacion is. */
  revision_forzada: boolean;
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

/**
 * Toggles a fuente's revision_forzada flag from the UI. ultima_verificacion and estado_verificacion
 * are not settable here: those are only ever written by Claude via direct SQL, after actually opening
 * the URL.
 */
export async function updateFuenteRevisionForzada(id: string, revisionForzada: boolean): Promise<void> {
  const { error } = await pricingDb().from("plantillas_fuentes").update({ revision_forzada: revisionForzada }).eq("id", id);
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

/** A temporada's periods, earliest fecha_inicio first. Shared by the edit dialog and the list's "Períodos" column. */
export function ordenarPeriodos(periodos: TemporadaPeriodo[]): TemporadaPeriodo[] {
  return [...periodos].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
}

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

export type PeriodoEditable = Pick<TemporadaPeriodo, "fecha_inicio" | "fecha_fin" | "estancia_minima">;

export async function updatePeriodo(id: string, changes: PeriodoEditable): Promise<void> {
  const { error } = await pricingDb().from("temporada_periodos").update(changes).eq("id", id);
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

/** Where a festivo is observed. A festivo can list several; "comunidad_otras" pairs with `detalle`. */
export type FestivoAmbito =
  | "nacional" | "catalan" | "comunidad_otras" | "local"
  | "francia" | "alemania" | "italia" | "reino_unido";

/** Calendar fact, not a pricing one: no aplica_a, and no effect on the price calculation for now. */
export type Festivo = {
  id: string;
  id_negocio: string;
  fecha: string;
  nombre: string;
  ambitos: FestivoAmbito[];
  /** Free text naming the specific comunidades, only meaningful when ambitos includes "comunidad_otras". */
  detalle: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchFestivos(): Promise<Festivo[]> {
  const { data, error } = await pricingDb().from("festivos").select("*").order("fecha", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Festivo[];
}

export async function insertFestivo(festivo: { fecha: string; nombre: string; ambitos: FestivoAmbito[]; detalle?: string | null }): Promise<void> {
  const { error } = await pricingDb().from("festivos").insert({ ...festivo, detalle: festivo.detalle ?? null });
  if (error) throw error;
}

export async function updateFestivo(
  id: string,
  changes: { fecha: string; nombre: string; ambitos: FestivoAmbito[]; detalle?: string | null },
): Promise<void> {
  const { error } = await pricingDb().from("festivos").update({ ...changes, detalle: changes.detalle ?? null }).eq("id", id);
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

/** First (or last, if `ultimo`) Monday of a month, in UTC. `mes` is 1-12. */
function lunesDelMes(anio: number, mes: number, ultimo: boolean): Date {
  if (ultimo) {
    const fin = new Date(Date.UTC(anio, mes, 0)); // last day of that month
    const delta = (fin.getUTCDay() + 6) % 7;
    fin.setUTCDate(fin.getUTCDate() - delta);
    return fin;
  }
  const ini = new Date(Date.UTC(anio, mes - 1, 1));
  const delta = (8 - ini.getUTCDay()) % 7;
  ini.setUTCDate(1 + delta);
  return ini;
}

// Several festivos can share a date, so the unique constraint is (id_negocio, fecha, nombre).
const FESTIVOS_CONFLICT = "id_negocio,fecha,nombre";

type FestivoGenerado = { fecha: string; nombre: string; ambitos: FestivoAmbito[]; detalle?: string };

/**
 * All the year's holidays in one list, sorted by fecha (then nombre for same-date ties). Pure.
 * Two rows may share a date without sharing a nombre (Pfingstmontag / Segunda Pascua): the unique
 * constraint is (id_negocio, fecha, nombre), so they coexist as separate rows.
 */
export function festivosDelAnio(anio: number): FestivoGenerado[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fijo = (mes: number, dia: number, nombre: string, ambitos: FestivoAmbito[], detalle?: string): FestivoGenerado => ({
    fecha: `${anio}-${pad(mes)}-${pad(dia)}`,
    nombre,
    ambitos,
    detalle,
  });

  const lista: FestivoGenerado[] = [
    fijo(1, 1, "Año Nuevo", ["nacional", "francia", "alemania", "italia", "reino_unido"]),
    fijo(1, 6, "Reyes", ["nacional", "italia"]),
    fijo(5, 1, "Fiesta del Trabajo", ["nacional", "francia", "alemania", "italia"]),
    fijo(10, 12, "Fiesta Nacional de España", ["nacional"]),
    fijo(12, 6, "Día de la Constitución", ["nacional"]),
    fijo(8, 15, "La Asunción", ["nacional", "francia", "italia"]),
    fijo(11, 1, "Todos los Santos", ["nacional", "francia", "italia"]),
    fijo(12, 8, "La Inmaculada", ["nacional", "italia"]),
    fijo(12, 25, "Navidad", ["nacional", "francia", "alemania", "italia", "reino_unido"]),
    fijo(6, 24, "San Juan", ["catalan"]),
    fijo(9, 11, "Diada Nacional de Cataluña", ["catalan"]),
    fijo(12, 26, "San Esteban", ["catalan", "reino_unido", "alemania", "italia"]),
    fijo(2, 28, "Día de Andalucía", ["comunidad_otras"], "Andalucía"),
    fijo(3, 19, "San José", ["comunidad_otras"], "Comunidad Valenciana, Madrid, Murcia, Navarra, País Vasco"),
    fijo(5, 2, "Día de la Comunidad de Madrid", ["comunidad_otras"], "Madrid"),
    fijo(5, 15, "San Isidro", ["comunidad_otras"], "Madrid"),
    fijo(7, 25, "Santiago Apóstol", ["comunidad_otras"], "Madrid, Castilla y León, Galicia, Navarra, País Vasco"),
    fijo(11, 9, "La Almudena", ["comunidad_otras"], "Madrid"),
    fijo(5, 8, "Victory Day", ["francia"]),
    fijo(7, 14, "Bastille Day", ["francia"]),
    fijo(10, 3, "Día de la Unidad Alemana", ["alemania"]),
    fijo(11, 11, "Armistice Day", ["francia"]),
  ];

  const pascua = domingoResurreccion(anio).toISOString().slice(0, 10);
  lista.push(
    { fecha: addDaysISO(pascua, -3), nombre: "Jueves Santo", ambitos: ["catalan"] },
    { fecha: addDaysISO(pascua, -2), nombre: "Viernes Santo", ambitos: ["nacional", "alemania", "reino_unido"] },
    {
      fecha: addDaysISO(pascua, 1),
      nombre: "Lunes de Pascua Florida",
      ambitos: ["catalan", "francia", "alemania", "italia", "reino_unido"],
    },
    // Not Francia: Whit Monday stopped being an official holiday there in 2004.
    { fecha: addDaysISO(pascua, 39), nombre: "Ascensión", ambitos: ["alemania", "francia"] },
    { fecha: addDaysISO(pascua, 50), nombre: "Pfingstmontag / Lunes de Pentecostés", ambitos: ["alemania"] },
    // Barcelona's own choice: same date as the German Pfingstmontag, but a separate row with its own
    // nombre (a municipal holiday, not a German national one).
    { fecha: addDaysISO(pascua, 50), nombre: "Segunda Pascua (Lunes de Pentecostés)", ambitos: ["local"] },
  );

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  lista.push(
    { fecha: iso(lunesDelMes(anio, 5, false)), nombre: "Early May Bank Holiday", ambitos: ["reino_unido"] },
    { fecha: iso(lunesDelMes(anio, 5, true)), nombre: "Spring Bank Holiday", ambitos: ["reino_unido"] },
    { fecha: iso(lunesDelMes(anio, 8, true)), nombre: "Summer Bank Holiday", ambitos: ["reino_unido"] },
  );

  return lista.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.nombre.localeCompare(y.nombre));
}

/**
 * Upserts all the year's holidays in one call, onConflict on the unique (id_negocio, fecha, nombre),
 * so re-running it updates rather than duplicates. Returns rows upserted.
 */
export async function generarFestivosDelAnio(anio: number): Promise<number> {
  const rows = festivosDelAnio(anio);
  const { error } = await pricingDb().from("festivos").upsert(rows, { onConflict: FESTIVOS_CONFLICT });
  if (error) throw error;
  return rows.length;
}

/**
 * A day's manual overrides, one row per (fecha, aplica_a). Every field is independent and optional:
 * when set, it ALWAYS wins for that day, unconditionally — it doesn't go through the "highest
 * coeficiente wins" rule used between competing eventos.
 */
export type AjusteDia = {
  id: string;
  id_negocio: string;
  fecha: string;
  aplica_a: TemporadaAplicaA;
  temporada_id: string | null;
  estancia_minima: number | null;
  precio_manual: number | null;
  created_at: string;
  updated_at: string;
};

export async function fetchAjustesDia(): Promise<AjusteDia[]> {
  const { data, error } = await pricingDb().from("ajustes_dia").select("*");
  if (error) throw error;
  return (data ?? []) as AjusteDia[];
}

const AJUSTES_DIA_CONFLICT = "id_negocio,fecha,aplica_a";

/**
 * Sets one or more override fields for a day, leaving any other field of that day's row untouched
 * (a partial upsert: PostgREST only SETs the columns present in the payload on conflict, so a field
 * left out of `changes` keeps whatever value — or absence — it already had). Pass a field as `null`
 * to clear just that override back to "no manual value" without affecting the other two.
 */
export async function upsertAjusteDia(
  fecha: string,
  aplicaA: TemporadaAplicaA,
  changes: Partial<{ temporadaId: string | null; estanciaMinima: number | null; precioManual: number | null }>,
): Promise<void> {
  const payload: Record<string, unknown> = { fecha, aplica_a: aplicaA };
  if ("temporadaId" in changes) payload.temporada_id = changes.temporadaId;
  if ("estanciaMinima" in changes) payload.estancia_minima = changes.estanciaMinima;
  if ("precioManual" in changes) payload.precio_manual = changes.precioManual;
  const { error } = await pricingDb().from("ajustes_dia").upsert(payload, { onConflict: AJUSTES_DIA_CONFLICT });
  if (error) throw error;
}

/**
 * Bulk version of upsertAjusteDia, for applying overrides to many days at once (the multi-day
 * selection on Vista Calendario). Same partial-column semantics per row: a field absent from a row's
 * `changes` leaves that row's existing value alone; `null` clears it.
 *
 * PostgREST's bulk upsert takes one shared column list for the whole call, built from the keys
 * present in the payload — so rows are grouped by which fields they're changing, and each group goes
 * out in its own upsert call, to avoid a field absent on one row but present on another silently
 * being nulled out to match the other row's column list. In practice the bulk-edit dialog always
 * changes the same fields on every selected day, so this is one call, same as a single mixed one
 * would have been if it were safe.
 */
export async function upsertAjustesDiaBulk(
  rows: {
    fecha: string;
    aplicaA: TemporadaAplicaA;
    changes: Partial<{ temporadaId: string | null; estanciaMinima: number | null; precioManual: number | null }>;
  }[],
): Promise<void> {
  const grupos = new Map<string, Record<string, unknown>[]>();
  for (const { fecha, aplicaA, changes } of rows) {
    const keys = (["temporadaId", "estanciaMinima", "precioManual"] as const).filter((k) => k in changes);
    const firma = keys.join(",");
    const payload: Record<string, unknown> = { fecha, aplica_a: aplicaA };
    if (keys.includes("temporadaId")) payload.temporada_id = changes.temporadaId;
    if (keys.includes("estanciaMinima")) payload.estancia_minima = changes.estanciaMinima;
    if (keys.includes("precioManual")) payload.precio_manual = changes.precioManual;
    if (!grupos.has(firma)) grupos.set(firma, []);
    grupos.get(firma)!.push(payload);
  }
  for (const payloads of grupos.values()) {
    const { error } = await pricingDb().from("ajustes_dia").upsert(payloads, { onConflict: AJUSTES_DIA_CONFLICT });
    if (error) throw error;
  }
}
