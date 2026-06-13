import { supabase } from "@/integrations/supabase/client";
import type { Reserva, ReservaGestio, ReservaKB } from "./types";

export async function fetchReservas(params?: {
  from?: string;
  to?: string;
  search?: string;
  estado?: string;
}): Promise<Reserva[]> {
  let q = supabase.from("reservas_kb").select("*").order("Llegada", { ascending: false });
  if (params?.from) q = q.gte("Llegada", params.from);
  if (params?.to) q = q.lte("Llegada", params.to);
  if (params?.estado) q = q.eq("Estado", params.estado);
  if (params?.search) {
    q = q.or(`Huésped.ilike.%${params.search}%,Número.ilike.%${params.search}%`);
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
  return { ...(kb as ReservaKB), gestio: (gestio as ReservaGestio) ?? null };
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