import { supabase } from "@/integrations/supabase/client";
import type { AgCheckIn, PersLimp } from "./types";

async function fetchPersonalByRole(roleName: string) {
  const { data, error } = await supabase
    .from("personal")
    .select("id_persona, nombre, apellidos, codigo, personal_roles!inner(fecha_hasta, roles!inner(nombre))")
    .eq("activo", true)
    .eq("personal_roles.roles.nombre", roleName)
    .is("personal_roles.fecha_hasta", null)
    .order("nombre");
  if (error) throw error;
  return (data ?? []).map((p: { id_persona: number; nombre: string | null; apellidos: string | null; codigo?: string | null }) => ({
    id_persona: p.id_persona,
    nombre: p.nombre,
    apellidos: p.apellidos,
    codigo: p.codigo ?? null,
  }));
}

export async function fetchAgentes(): Promise<AgCheckIn[]> {
  return fetchPersonalByRole("Check-in");
}

export async function fetchLimpiadores(): Promise<PersLimp[]> {
  return fetchPersonalByRole("Limpieza");
}

// Any active worker can be assigned a maintenance incidencia — not just
// personal with the "Mantenimiento" role (e.g. a cleaner occasionally
// assigned a task, see mi-dia.tsx's non-Mantenimiento task card support).
export async function fetchActivePersonal(): Promise<PersLimp[]> {
  const { data, error } = await supabase
    .from("personal")
    .select("id_persona, nombre, apellidos, codigo")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as PersLimp[];
}