import { supabase } from "@/integrations/supabase/client";
import type { ApartamentoInfo, Reserva, ReservaGestio, ReservaKB } from "./types";

export async function fetchReservas(params?: {
  from?: string;
  to?: string;
  search?: string;
  /** undefined = no filter (all estados, including any not yet known); [] = match nothing. */
  estados?: string[];
  dateField?: "Check in" | "Check-out";
}): Promise<Reserva[]> {
  if (params?.estados && params.estados.length === 0) return [];
  const dateField = params?.dateField ?? "Check in";
  let q = supabase.from("reservas_kb").select("*").order(dateField, { ascending: false });
  if (params?.from) q = q.gte(dateField, params.from);
  if (params?.to) q = q.lte(dateField, params.to);
  if (params?.estados && params.estados.length > 0) q = q.in("Estado", params.estados);
  if (params?.search) {
    q = q.or(`"Referencia".ilike.%${params.search}%,"Número".ilike.%${params.search}%`);
  }
  const { data: kb, error } = await q.limit(500);
  if (error) throw error;
  const nums = (kb ?? []).map((r) => (r as ReservaKB)["Número"]);
  if (!nums.length) return [];
  const { data: gestio } = await supabase
    .from("reservas_gestio")
    .select("*")
    .in("Número", nums);
  const gMap = new Map<string, ReservaGestio>();
  (gestio ?? []).forEach((g) => gMap.set((g as ReservaGestio)["Número"], g as ReservaGestio));
  return (kb ?? []).map((r) => ({
    ...(r as ReservaKB),
    gestio: gMap.get((r as ReservaKB)["Número"]) ?? null,
  }));
}

/** Distinct Estado values actually present in reservas_kb — kept dynamic so a
 *  new status Krossbooking starts sending shows up in filters without a
 *  code change. */
export async function fetchDistinctEstados(): Promise<string[]> {
  const { data, error } = await supabase
    .from("reservas_kb")
    .select("Estado")
    .not("Estado", "is", null)
    .limit(2000);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of (data ?? []) as { Estado: string | null }[]) {
    if (r.Estado) set.add(r.Estado);
  }
  return Array.from(set).sort();
}

export async function fetchReserva(numero: string): Promise<Reserva | null> {
  const { data: kb, error } = await supabase
    .from("reservas_kb")
    .select("*")
    .eq("Número", numero)
    .maybeSingle();
  if (error) throw error;
  if (!kb) return null;
  const { data: gestio } = await supabase
    .from("reservas_gestio")
    .select("*")
    .eq("Número", numero)
    .maybeSingle();
  const habitaciones = (kb as ReservaKB)["Habitaciones"];
  let apartamento: ApartamentoInfo | null = null;
  if (habitaciones) {
    const { data: apt } = await supabase
      .from("apartamentos")
      .select("id_apt,id_categoria,id_tipo_licencia,id_categoria_limpieza")
      .eq("nombre", habitaciones)
      .maybeSingle();
    apartamento = (apt as ApartamentoInfo) ?? null;
  }
  return { ...(kb as ReservaKB), gestio: (gestio as ReservaGestio) ?? null, apartamento };
}

export async function upsertGestio(g: Partial<ReservaGestio> & { "Número": string }) {
  const { error } = await supabase
    .from("reservas_gestio")
    .upsert(g, { onConflict: "Número" });
  if (error) throw error;
}

export function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}