import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTime, fmtTime } from "@/lib/format";

// Normal lifecycle states for cleaning lookups (Confirmada → Check-in
// realizado → Check-out realizado). Cancelada / No show are problem states.
export const ESTADOS_VALID = ["Confirmada", "Check-in realizado", "Check-out realizado"] as const;

export type ReservaPopoverRow = {
  "Número": string;
  "Check in": string | null;
  "Check-out": string | null;
  "Huéspedes": number | null;
  "Estado": string | null;
  "Hora estimada de llegada": string | null;
  "Hora estimada de salida": string | null;
  id_apt: number | null;
  es_reserva_compartida: boolean | null;
};

export type FreshKbData = {
  hora_out_time: string;
  hora_out_informed: boolean;
  hora_in_time: string | null;
  hora_in_informed: boolean;
  sfc_montar_auto: boolean;
  sfc_desmontar_auto: boolean;
  proxima_reserva_numero: string | null;
  next_guests: number | null;
};

export type StoredKbData = {
  hora_out_time: string | null;
  hora_out_informed: boolean;
  hora_in_time: string | null;
  hora_in_informed: boolean;
  sfc_montar_auto: boolean;
  sfc_desmontar_auto: boolean;
  proxima_reserva_numero: string | null;
  cur_estado: string | null;
  cur_guests: number | null;
};

export type KbChangeDiffEntry = { label: string; old: string; nu: string };

export type PersistedForKbDiff = {
  numero_reserva: string | null;
  tipo: string | null;
  hora_out_time: string | null;
  hora_out_informed: boolean | null;
  hora_in_time: string | null;
  hora_in_informed: boolean | null;
  sfc_montar: boolean | null;
  sfc_desmontar: boolean | null;
  proxima_reserva_numero: string | null;
};

export type AptForKbDiff = {
  id_apt: number;
  camas_fijas?: number | null;
  tiene_sofa_cama?: boolean | null;
};

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function parseHM(s: string | null | undefined): { h: number; m: number } | null {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
}

// Combine an ISO date (YYYY-MM-DD) and HH:MM[:SS] into a UTC-anchored Date
// (we only ever subtract two such Dates, so the tz anchor is irrelevant).
function combineDateTime(dateISO: string | null, time: string | null): Date | null {
  if (!dateISO) return null;
  const t = parseHM(time);
  if (!t) return null;
  const dm = dateISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dm) return null;
  return new Date(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), t.h, t.m, 0));
}

/**
 * Recomputes what generar-limpiezas.ts / the popover's "datos nuevos" would be for a
 * salida cleaning right now, and compares against what's currently stored on the row.
 * This is the same fresh-vs-stored logic limpieza-popover.tsx uses for its KB-change
 * alert — extracted here so every screen that lists limpiezas can show the same
 * pending-changes detail, not just the popover.
 *
 * Returns null for "intermedia" rows (no salida-side KB comparison applies).
 */
export async function computeFreshKbData(
  supabase: SupabaseClient,
  apt: AptForKbDiff,
  persisted: PersistedForKbDiff,
  fecha: string,
): Promise<{
  fresh: FreshKbData;
  stored: StoredKbData;
  reason: string | null;
  realCheckoutDate: string;
  currentNumero: string | null;
  nextReservation: ReservaPopoverRow | null;
  winMins: number | null;
} | null> {
  if (persisted.tipo === "intermedia") return null;

  let current: ReservaPopoverRow | null = null;
  if (persisted.numero_reserva) {
    const { data, error } = await supabase
      .from("v_reservas_por_apartamento")
      .select(`"Número","Check in","Check-out","Huéspedes","Estado","Hora estimada de llegada","Hora estimada de salida",id_apt,es_reserva_compartida`)
      .eq("id_apt", apt.id_apt)
      .eq("Número", persisted.numero_reserva)
      .limit(1);
    if (error) throw error;
    current = ((data ?? [])[0] ?? null) as ReservaPopoverRow | null;
  } else {
    const { data, error } = await supabase
      .from("v_reservas_por_apartamento")
      .select(`"Número","Check in","Check-out","Huéspedes","Estado","Hora estimada de llegada","Hora estimada de salida",id_apt,es_reserva_compartida`)
      .eq("id_apt", apt.id_apt)
      .in("Estado", ESTADOS_VALID as unknown as string[])
      .eq("Check-out", fecha)
      .order("Check in", { ascending: true })
      .limit(1);
    if (error) throw error;
    current = ((data ?? [])[0] ?? null) as ReservaPopoverRow | null;
  }

  let checkoutDate = current?.["Check-out"] ?? null;
  if (!checkoutDate && persisted.numero_reserva) {
    const { data, error } = await supabase
      .from("reservas_kb")
      .select('"Número","Check-out"')
      .eq("Número", persisted.numero_reserva)
      .maybeSingle();
    if (error) throw error;
    checkoutDate = ((data as any)?.["Check-out"] as string | null | undefined) ?? null;
  }
  checkoutDate = checkoutDate ?? fecha;
  const currentNumero = current?.["Número"] ?? persisted.numero_reserva ?? null;

  const { data: nextRows, error: nextError } = await supabase
    .from("v_reservas_por_apartamento")
    .select(`"Número","Check in","Check-out","Huéspedes","Estado","Hora estimada de llegada","Hora estimada de salida",id_apt,es_reserva_compartida`)
    .eq("id_apt", apt.id_apt)
    .in("Estado", ESTADOS_VALID as unknown as string[])
    .gte("Check in", checkoutDate)
    .lte("Check in", addDaysISO(checkoutDate, 7))
    .order("Check in", { ascending: true })
    .order("Hora estimada de llegada", { ascending: true, nullsFirst: true });
  if (nextError) throw nextError;
  const next = ((nextRows ?? []) as ReservaPopoverRow[]).find((r) => r["Número"] !== currentNumero) ?? null;

  const out = current
    ? resolveTime(current["Hora estimada de salida"], "11:00:00")
    : { value: persisted.hora_out_time ?? "11:00:00", informed: persisted.hora_out_informed ?? false };
  const inRes = next ? resolveTime(next["Hora estimada de llegada"], "15:00:00") : null;
  const checkoutDT = combineDateTime(checkoutDate, out.value);
  const checkinDT = combineDateTime(next?.["Check in"] ?? null, inRes?.value ?? null);
  const winMins = checkoutDT && checkinDT ? Math.round((checkinDT.getTime() - checkoutDT.getTime()) / 60000) : null;
  const autoSfcMontar = !!next && !current?.es_reserva_compartida && !!apt.tiene_sofa_cama && (next["Huéspedes"] ?? 0) > (apt.camas_fijas ?? 0);
  const autoSfcDesmontar = !current?.es_reserva_compartida && !!apt.tiene_sofa_cama && (current?.["Huéspedes"] ?? 0) > (apt.camas_fijas ?? 0) && !autoSfcMontar;

  const isCurCancelada = !!current?.Estado && (current.Estado === "Cancelada" || current.Estado === "No show");
  const fresh: FreshKbData = {
    hora_out_time: out.value,
    hora_out_informed: out.informed,
    hora_in_time: inRes?.value ?? null,
    hora_in_informed: inRes?.informed ?? false,
    sfc_montar_auto: autoSfcMontar,
    sfc_desmontar_auto: autoSfcDesmontar,
    proxima_reserva_numero: next?.["Número"] ?? null,
    next_guests: next?.["Huéspedes"] ?? null,
  };
  const stored: StoredKbData = {
    hora_out_time: persisted.hora_out_time,
    hora_out_informed: !!persisted.hora_out_informed,
    hora_in_time: persisted.hora_in_time,
    hora_in_informed: !!persisted.hora_in_informed,
    sfc_montar_auto: !!persisted.sfc_montar,
    sfc_desmontar_auto: !!persisted.sfc_desmontar,
    proxima_reserva_numero: persisted.proxima_reserva_numero ?? null,
    cur_estado: current?.Estado ?? null,
    cur_guests: current?.["Huéspedes"] ?? null,
  };

  return {
    fresh,
    stored,
    reason: isCurCancelada ? "cancelada" : null,
    realCheckoutDate: checkoutDate,
    currentNumero,
    nextReservation: next,
    winMins,
  };
}

/** Pure diff: same {label, old, nu} rows the popover's KB-change alert lists. */
export function buildKbChanges(fresh: FreshKbData, stored: StoredKbData): KbChangeDiffEntry[] {
  const changes: KbChangeDiffEntry[] = [];
  if (stored.hora_out_time !== fresh.hora_out_time) {
    changes.push({
      label: "Hora de salida",
      old: stored.hora_out_time ? fmtTime(stored.hora_out_time) : "—",
      nu: fresh.hora_out_time ? fmtTime(fresh.hora_out_time) : "—",
    });
  }
  if (stored.hora_in_time !== fresh.hora_in_time) {
    changes.push({
      label: "Hora de entrada",
      old: stored.hora_in_time ? fmtTime(stored.hora_in_time) : "—",
      nu: fresh.hora_in_time ? fmtTime(fresh.hora_in_time) : "—",
    });
  }
  if (stored.proxima_reserva_numero !== fresh.proxima_reserva_numero) {
    changes.push({
      label: "Próxima reserva",
      old: stored.proxima_reserva_numero ?? "ninguna",
      nu: fresh.proxima_reserva_numero ?? "ninguna",
    });
  }
  if (stored.sfc_montar_auto !== fresh.sfc_montar_auto) {
    changes.push({
      label: "Montar sofá cama (auto)",
      old: stored.sfc_montar_auto ? "sí" : "no",
      nu: fresh.sfc_montar_auto ? "sí" : "no",
    });
  }
  if (stored.sfc_desmontar_auto !== fresh.sfc_desmontar_auto) {
    changes.push({
      label: "Desmontar sofá cama (auto)",
      old: stored.sfc_desmontar_auto ? "sí" : "no",
      nu: fresh.sfc_desmontar_auto ? "sí" : "no",
    });
  }
  return changes;
}

/** Same "probably unneeded" wording the popover shows when the reason isn't a plain field diff. */
export function kbReasonNote(reason: string | null): string | null {
  if (reason === "cancelada") return "Esta reserva ha sido cancelada — revisar si la limpieza sigue siendo necesaria.";
  if (reason === "apartamento") return "Esta reserva ya no hace checkout en este apartamento — es probable que esta limpieza ya no sea necesaria.";
  return null;
}
