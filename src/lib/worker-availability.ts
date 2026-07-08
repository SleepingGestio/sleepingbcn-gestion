import { supabase } from "@/integrations/supabase/client";

export type UnavailabilityReason = "sin_contrato" | "vacaciones" | "baja" | "festivo";

const LEAVE_TIPOS = ["vacaciones", "baja", "festivo"] as const;

/**
 * A worker is unavailable on `date` if either:
 *  - they have no personal_periodos_actividad row covering that date, or
 *  - they have a personal_ajustos_hores row for that date with tipo in
 *    vacaciones/baja/festivo.
 * When both apply, "sin_contrato" is reported (the more fundamental issue).
 * Runs exactly 2 queries regardless of candidateIds.length.
 */
export async function getUnavailableWorkerIds(
  date: string,
  candidateIds: number[],
): Promise<Map<number, UnavailabilityReason>> {
  const result = new Map<number, UnavailabilityReason>();
  if (candidateIds.length === 0) return result;

  const [periodosRes, ajustosRes] = await Promise.all([
    supabase
      .from("personal_periodos_actividad")
      .select("id_persona")
      .in("id_persona", candidateIds)
      .lte("fecha_inicio", date)
      .or(`fecha_fin.is.null,fecha_fin.gte.${date}`),
    supabase
      .from("personal_ajustos_hores")
      .select("id_persona, tipo")
      .in("id_persona", candidateIds)
      .eq("fecha", date)
      .in("tipo", LEAVE_TIPOS as unknown as string[]),
  ]);
  if (periodosRes.error) throw periodosRes.error;
  if (ajustosRes.error) throw ajustosRes.error;

  const withContract = new Set((periodosRes.data ?? []).map((p) => p.id_persona as number));

  for (const row of ajustosRes.data ?? []) {
    result.set(row.id_persona as number, row.tipo as UnavailabilityReason);
  }
  for (const id of candidateIds) {
    if (!withContract.has(id)) result.set(id, "sin_contrato");
  }

  return result;
}
