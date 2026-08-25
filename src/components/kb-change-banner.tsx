import type { KbChangeDiffEntry } from "@/lib/kb-change-diff";

/**
 * "Still affected, needs a gestor to review" banner — same wording/placement
 * wherever a limpieza with affected_by_kb_change is rendered. `changes` comes
 * from useKbChangeDiffs (live recompute); pass `loading` while that's pending.
 */
export function KbChangePendingBanner({
  changes,
  reasonNote,
  loading,
}: {
  changes: KbChangeDiffEntry[];
  reasonNote: string | null;
  loading?: boolean;
}) {
  return (
    <div className="rounded bg-red-600 px-2 py-1.5 text-[11px] font-bold text-white space-y-1">
      <div>⚠ LIMPIEZA AFECTADA POR CAMBIOS — REVISAR</div>
      {reasonNote ? (
        <div className="font-normal text-red-100">{reasonNote}</div>
      ) : loading ? (
        <div className="font-normal text-red-100">Calculando cambios…</div>
      ) : changes.length > 0 ? (
        <ul className="font-normal space-y-0.5">
          {changes.map((c) => (
            <li key={c.label}>
              {c.label}: <span className="line-through text-red-200">{c.old}</span>{" "}
              → <span className="font-bold text-emerald-300">{c.nu}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * "Resolved earlier today" notice — a gestor already applied the recomputed
 * values from the popover. Visible only for the same calendar day (caller
 * gates this on affected_resolved_en); disappears on its own the next day.
 */
export function KbChangeResolvedBanner({ diff }: { diff: KbChangeDiffEntry[] }) {
  return (
    <div className="rounded bg-blue-50 border border-blue-300 px-2 py-1.5 text-[11px] text-blue-900 space-y-1">
      <div className="font-bold">✓ LIMPIEZA CON CAMBIOS APLICADOS HOY</div>
      {diff.length > 0 && (
        <ul className="space-y-0.5">
          {diff.map((c) => (
            <li key={c.label}>
              {c.label}: <span className="line-through text-red-600">{c.old}</span>{" "}
              → <span className="font-bold text-emerald-700">{c.nu}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
