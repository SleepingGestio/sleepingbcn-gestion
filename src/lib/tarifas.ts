import { supabase } from "@/integrations/supabase/client";

export type TipoLicencia = { id_tipo_licencia: number; nombre: string; activo: boolean };
/** How KB reports the price for this channel, which formula ReservaDetail
 *  uses to derive the commission amount:
 *   - "bruto": "Cargo estancia" is pre-commission (Booking)
 *   - "neto":  "Cargo estancia" is already net of commission (Airbnb, Expedia) */
export type ModoComision = "bruto" | "neto";
export type CanalReserva = {
  id_canal: number; nombre: string; activo: boolean; modo_comision: ModoComision;
};
export type TipoCategoriaLimpieza = { id_categoria_limpieza: number; nombre: string; activo: boolean };
export type TarifaLimpieza = { id_categoria_limpieza: number; costo_limpieza: number };
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
    .select("id_canal, nombre, activo, modo_comision")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CanalReserva[];
}

/** App-wide constants from ajustes_app, as a { clave: valor } map. */
export async function fetchAjustes(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("ajustes_app").select("clave, valor");
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { clave: string; valor: string }[]).map((r) => [r.clave, r.valor]));
}

/** IVA rate as a fraction (10 % → 0.10). Falls back to 0.10 if unset/invalid. */
export async function fetchIvaPct(): Promise<number> {
  const a = await fetchAjustes();
  const n = Number(a["iva_pct"]);
  return Number.isFinite(n) && n >= 0 ? n / 100 : 0.1;
}

export async function upsertAjuste(clave: string, valor: string) {
  const { error } = await supabase
    .from("ajustes_app")
    .upsert({ clave, valor, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
  if (error) throw error;
}

export async function fetchTiposCategoriaLimpieza(): Promise<TipoCategoriaLimpieza[]> {
  const { data, error } = await supabase
    .from("tipos_categoria_limpieza")
    .select("id_categoria_limpieza, nombre, activo")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TipoCategoriaLimpieza[];
}

export async function fetchTarifasLimpieza(): Promise<TarifaLimpieza[]> {
  const { data, error } = await supabase
    .from("tarifas_limpieza")
    .select("id_categoria_limpieza, costo_limpieza")
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

/** Apartment fields needed to resolve suggested tariffs for a reservation,
 *  keyed by nombre (same apartamentos.nombre <-> reservas_kb.Habitaciones
 *  exact-match convention used everywhere else). Fetched whole (small table)
 *  rather than per-reservation — used by the reservations list to compute the
 *  "No cuadra" column for every visible row without N+1 queries. */
export type ApartamentoRef = {
  id_apt: number;
  nombre: string;
  id_categoria_limpieza: number | null;
  id_tipo_licencia: number | null;
};

export async function fetchApartamentosRef(): Promise<ApartamentoRef[]> {
  const { data, error } = await supabase
    .from("apartamentos")
    .select("id_apt, nombre, id_categoria_limpieza, id_tipo_licencia");
  if (error) throw error;
  return (data ?? []) as ApartamentoRef[];
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
