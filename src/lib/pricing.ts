import { supabase } from "@/integrations/supabase/client";
import { addYearsISO } from "@/lib/format";

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

export type Temporada = {
  id: string;
  id_negocio: string;
  aplica_a: TemporadaAplicaA;
  anio: number;
  codigo: string;
  nombre: string;
  coeficiente: number;
  fecha_inicio: string;
  fecha_fin: string;
  created_at: string;
  updated_at: string;
};

export async function fetchTemporadas(): Promise<Temporada[]> {
  const { data, error } = await pricingDb()
    .from("temporadas")
    .select("*")
    .order("aplica_a", { ascending: true })
    .order("fecha_inicio", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Temporada[];
}

export type NuevaTemporadaInput = Pick<
  Temporada,
  "aplica_a" | "anio" | "codigo" | "nombre" | "coeficiente" | "fecha_inicio" | "fecha_fin"
>;

export async function insertTemporada(input: NuevaTemporadaInput): Promise<void> {
  const { error } = await pricingDb().from("temporadas").insert(input);
  if (error) throw error;
}

export async function updateTemporada(id: string, changes: Partial<NuevaTemporadaInput>): Promise<void> {
  const { error } = await pricingDb().from("temporadas").update(changes).eq("id", id);
  if (error) throw error;
}

/** Copies every temporada of `fromYear` (both groups) into `toYear`, dates shifted by the year gap, in one insert. Returns rows copied. */
export async function copyTemporadasToYear(fromYear: number, toYear: number): Promise<number> {
  const { data, error } = await pricingDb().from("temporadas").select("*").eq("anio", fromYear);
  if (error) throw error;
  const rows = ((data ?? []) as Temporada[]).map((t) => ({
    aplica_a: t.aplica_a,
    anio: toYear,
    codigo: t.codigo,
    nombre: t.nombre,
    coeficiente: t.coeficiente,
    fecha_inicio: addYearsISO(t.fecha_inicio, toYear - fromYear),
    fecha_fin: addYearsISO(t.fecha_fin, toYear - fromYear),
  }));
  if (rows.length === 0) return 0;
  const { error: insErr } = await pricingDb().from("temporadas").insert(rows);
  if (insErr) throw insErr;
  return rows.length;
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
