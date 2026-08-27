import { supabase } from "@/integrations/supabase/client";
import type { ReservaExtra, ReservaExtraDraft } from "./types";

export async function fetchReservaExtras(numero: string): Promise<ReservaExtra[]> {
  const { data, error } = await supabase
    .from("reservas_extras")
    .select("id_extra, numero_reserva, concepto, importe, con_iva")
    .eq("numero_reserva", numero)
    .order("id_extra", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReservaExtra[];
}

/**
 * Reconciles the popover's draft list against what's stored: inserts new
 * rows, updates changed ones, deletes removed ones. Drafts with a blank
 * concepto or a null/negative importe are dropped silently (treated as
 * not-yet-filled-in lines).
 */
export async function saveReservaExtras(
  numero: string,
  drafts: ReservaExtraDraft[],
  original: ReservaExtra[],
) {
  const clean = drafts
    .map((d) => ({ ...d, concepto: d.concepto.trim() }))
    .filter((d) => d.concepto !== "" && d.importe != null && d.importe >= 0);

  const keepIds = new Set(clean.filter((d) => d.id_extra != null).map((d) => d.id_extra!));
  const toDelete = original.filter((o) => !keepIds.has(o.id_extra)).map((o) => o.id_extra);
  const toInsert = clean
    .filter((d) => d.id_extra == null)
    .map((d) => ({ numero_reserva: numero, concepto: d.concepto, importe: d.importe!, con_iva: d.con_iva }));
  const toUpdate = clean.filter((d) => {
    if (d.id_extra == null) return false;
    const o = original.find((x) => x.id_extra === d.id_extra);
    return !!o && (o.concepto !== d.concepto || o.importe !== d.importe || o.con_iva !== d.con_iva);
  });

  if (toDelete.length) {
    const { error } = await supabase.from("reservas_extras").delete().in("id_extra", toDelete);
    if (error) throw error;
  }
  if (toInsert.length) {
    const { error } = await supabase.from("reservas_extras").insert(toInsert);
    if (error) throw error;
  }
  for (const d of toUpdate) {
    const { error } = await supabase
      .from("reservas_extras")
      .update({ concepto: d.concepto, importe: d.importe!, con_iva: d.con_iva })
      .eq("id_extra", d.id_extra!);
    if (error) throw error;
  }
}
