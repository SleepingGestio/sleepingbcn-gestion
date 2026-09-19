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

export type PeriodoInput = Pick<TemporadaPeriodo, "fecha_inicio" | "fecha_fin">;

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
    await insertPeriodo(temporadaId, periodo.fecha_inicio, periodo.fecha_fin);
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

export async function insertPeriodo(temporadaId: string, fechaInicio: string, fechaFin: string): Promise<void> {
  const { error } = await pricingDb()
    .from("temporada_periodos")
    .insert({ temporada_id: temporadaId, fecha_inicio: fechaInicio, fecha_fin: fechaFin });
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

/** Stretches of `anio` (Jan 1 – Dec 31) not covered by any period of the given temporadas. */
export function findCoverageGaps(temporadas: Temporada[], anio: number): { desde: string; hasta: string }[] {
  const yearStart = `${anio}-01-01`;
  const yearEnd = `${anio}-12-31`;
  const periodos = temporadas
    .flatMap((t) => t.temporada_periodos)
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  const gaps: { desde: string; hasta: string }[] = [];
  let cursor = yearStart; // first day not yet known to be covered
  for (const p of periodos) {
    if (cursor > yearEnd) break;
    if (p.fecha_fin < cursor) continue;
    if (p.fecha_inicio > cursor) gaps.push({ desde: cursor, hasta: addDaysISO(p.fecha_inicio, -1) });
    cursor = addDaysISO(p.fecha_fin, 1);
  }
  if (cursor <= yearEnd) gaps.push({ desde: cursor, hasta: yearEnd });
  return gaps;
}
