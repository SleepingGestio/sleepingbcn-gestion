import { supabase } from "@/integrations/supabase/client";
import type { ApartamentoInfo, Reserva, ReservaGestio, ReservaKB } from "./types";

/** Which reservation date the from/to range filters on:
 *   - checkin/checkout: a single KB date field, as before.
 *   - periodo: the STAY overlaps [from, to] (Check in <= to AND Check-out
 *     >= from) — catches reservations spanning into/out of the period, not
 *     just ones starting or ending inside it.
 *   - alta: "Fecha de creación" (when the booking itself was made in KB),
 *     unrelated to the stay dates. */
export type DateMode = "checkin" | "checkout" | "periodo" | "alta";

export async function fetchReservas(params?: {
  from?: string;
  to?: string;
  search?: string;
  /** undefined = no filter (all estados, including any not yet known); [] = match nothing. */
  estados?: string[];
  dateMode?: DateMode;
}): Promise<Reserva[]> {
  if (params?.estados && params.estados.length === 0) return [];
  const mode = params?.dateMode ?? "checkin";
  let q = supabase.from("reservas_kb").select("*");
  if (mode === "periodo") {
    q = q.order("Check in", { ascending: false });
    if (params?.to) q = q.lte("Check in", params.to);
    if (params?.from) q = q.gte("Check-out", params.from);
  } else if (mode === "alta") {
    // "Fecha de creación" es un timestamp, no una fecha pura — el límite
    // superior debe cubrir el día entero (hasta las 23:59:59), no solo su
    // medianoche, o se perdería todo lo dado de alta ese mismo día.
    q = q.order("Fecha de creación", { ascending: false });
    if (params?.from) q = q.gte("Fecha de creación", params.from);
    if (params?.to) q = q.lte("Fecha de creación", `${params.to}T23:59:59.999`);
  } else {
    const field = mode === "checkout" ? "Check-out" : "Check in";
    q = q.order(field, { ascending: false });
    if (params?.from) q = q.gte(field, params.from);
    if (params?.to) q = q.lte(field, params.to);
  }
  if (params?.estados && params.estados.length > 0) q = q.in("Estado", params.estados);
  if (params?.search) {
    q = q.or(
      `"Referencia".ilike.%${params.search}%,"Número".ilike.%${params.search}%,"Habitaciones".ilike.%${params.search}%`,
    );
  }
  // 500 -> 2000: ahora hay consultas sin límite de fechas (búsqueda "sin
  // tener en cuenta Fechas" en /reservas), y la tabla ya supera las 500
  // filas — mismo límite que fetchDistinctEstados más abajo, por prudencia.
  const { data: kb, error } = await q.limit(2000);
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
