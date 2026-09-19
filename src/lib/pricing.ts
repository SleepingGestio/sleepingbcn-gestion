import { supabase } from "@/integrations/supabase/client";

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
  fase: EventoFase;
  evento_relacionado_id: string | null;
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
  periodicidad?: EventoPeriodicidad;
  fase?: EventoFase;
  evento_relacionado_id?: string | null;
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
    periodicidad: input.periodicidad ?? "anual",
    fase: input.fase ?? "principal",
    evento_relacionado_id: input.evento_relacionado_id ?? null,
    notas: input.notas,
  };
  const { error } = await pricingDb().from("eventos").insert(payload);
  if (error) throw error;
}

export async function descartarEvento(id: string): Promise<void> {
  const { error } = await pricingDb().from("eventos").update({ estado: "descartado" }).eq("id", id);
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
