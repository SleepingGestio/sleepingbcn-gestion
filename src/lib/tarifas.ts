import { supabase } from "@/integrations/supabase/client";

export type TipoLicencia = { id_tipo_licencia: number; nombre: string; activo: boolean };
export type CanalReserva = { id_canal: number; nombre: string; activo: boolean };
export type TarifaLimpieza = { id_categoria: number; costo_limpieza: number };
export type TarifaComisionOta = { id_tipo_licencia: number; id_canal: number; pct_comision: number };
export type TarifaCobroCanal = { id_canal: number; pct_cobro: number };

export async function fetchTiposLicencia(): Promise<TipoLicencia[]> {
  const { data, error } = await supabase
    .from("tipos_licencia_turistica")
    .select("id_tipo_licencia, nombre, activo")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TipoLicencia[];
}

export async function fetchCanalesReserva(): Promise<CanalReserva[]> {
  const { data, error } = await supabase
    .from("canales_reserva")
    .select("id_canal, nombre, activo")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CanalReserva[];
}

export async function fetchTarifasLimpieza(): Promise<TarifaLimpieza[]> {
  const { data, error } = await supabase
    .from("tarifas_limpieza")
    .select("id_categoria, costo_limpieza")
    .eq("activo", true);
  if (error) throw error;
  return (data ?? []) as TarifaLimpieza[];
}

export async function fetchTarifasComisionOta(): Promise<TarifaComisionOta[]> {
  const { data, error } = await supabase
    .from("tarifas_comision_ota")
    .select("id_tipo_licencia, id_canal, pct_comision")
    .eq("activo", true);
  if (error) throw error;
  return (data ?? []) as TarifaComisionOta[];
}

export async function fetchTarifasCobroCanal(): Promise<TarifaCobroCanal[]> {
  const { data, error } = await supabase
    .from("tarifas_cobro_canal")
    .select("id_canal, pct_cobro")
    .eq("activo", true);
  if (error) throw error;
  return (data ?? []) as TarifaCobroCanal[];
}

/** Distinct Portal strings actually seen in reservas_kb — a live-data hint for
 *  keying canales_reserva.nombre to match, since nothing else in the app
 *  surfaces the real spellings Krossbooking sends. */
export async function fetchDistinctPortales(): Promise<string[]> {
  const { data, error } = await supabase
    .from("reservas_kb")
    .select("Portal")
    .not("Portal", "is", null)
    .limit(2000);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of (data ?? []) as { Portal: string | null }[]) {
    if (r.Portal) set.add(r.Portal);
  }
  return Array.from(set).sort();
}
