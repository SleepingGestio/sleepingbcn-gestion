import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeFreshKbData,
  buildKbChanges,
  kbReasonNote,
  type KbChangeDiffEntry,
  type PersistedForKbDiff,
} from "@/lib/kb-change-diff";

export type KbChangeDiffResult = { changes: KbChangeDiffEntry[]; reasonNote: string | null };

export type RowForKbDiff = PersistedForKbDiff & {
  id_limpieza: number;
  id_apt: number;
  fecha_limpieza: string;
  affected_by_kb_change: boolean | null;
};

export type AptLiteForKbDiff = { camas_fijas?: number | null; tiene_sofa_cama?: boolean | null };

/**
 * Live "what changed" detail for every currently-affected row in `rows` — the
 * same fresh-vs-stored diff limpieza-popover.tsx computes for its own alert,
 * reused here so list/card views can show it too. Scoped to just the affected
 * rows (usually a handful) so this stays cheap even on a long list.
 */
export function useKbChangeDiffs(rows: RowForKbDiff[], aptById: Map<number, AptLiteForKbDiff>) {
  const affected = useMemo(() => rows.filter((r) => r.affected_by_kb_change), [rows]);
  const key = useMemo(
    () => affected.map((r) => r.id_limpieza).sort((a, b) => a - b).join(","),
    [affected],
  );

  return useQuery({
    queryKey: ["kb-change-diffs", key],
    enabled: affected.length > 0,
    queryFn: async (): Promise<Map<number, KbChangeDiffResult>> => {
      const m = new Map<number, KbChangeDiffResult>();
      await Promise.all(
        affected.map(async (r) => {
          const apt = aptById.get(r.id_apt);
          if (!apt) return;
          const data = await computeFreshKbData(supabase, { id_apt: r.id_apt, ...apt }, r, r.fecha_limpieza);
          if (!data) return;
          m.set(r.id_limpieza, {
            changes: buildKbChanges(data.fresh, data.stored),
            reasonNote: kbReasonNote(data.reason),
          });
        }),
      );
      return m;
    },
  });
}
