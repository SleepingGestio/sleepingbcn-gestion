import { supabase } from "@/integrations/supabase/client";
import type { AgCheckIn, PersLimp } from "./types";

async function fetchPersonalByRole(roleName: string) {
  const { data, error } = await supabase
    .from("personal")
    .select("id_persona, nombre, apellidos, personal_roles!inner(fecha_hasta, roles!inner(nombre))")
    .eq("activo", true)
    .eq("personal_roles.roles.nombre", roleName)
    .is("personal_roles.fecha_hasta", null)
    .order("nombre");
  if (error) throw error;
  return (data ?? []).map((p: { id_persona: number; nombre: string | null; apellidos: string | null }) => ({
    id_persona: p.id_persona,
    nombre: p.nombre,
    apellidos: p.apellidos,
  }));
}

export async function fetchAgentes(): Promise<AgCheckIn[]> {
  return fetchPersonalByRole("Check-in");
}

export async function fetchLimpiadores(): Promise<PersLimp[]> {
  return fetchPersonalByRole("Limpieza");
}