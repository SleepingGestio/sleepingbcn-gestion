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
 * "Resolved earlier today" notice. Visible only for the same calendar day
 * (caller gates this on affected_resolved_en); disappears on its own the next
 * day.
 *
 * Two very different outcomes share this banner, so it must not blur them:
 * `aplicado` means the recomputed values were written to the cleaning, while
 * `descartado` means someone dismissed the Krossbooking change without applying
 * it — the cleaning still holds the old values. The second case is the one worth
 * noticing (a cleaning can end up on the wrong day), hence the warning styling
 * and the name of whoever decided it.
 *
 * `accion` is null on rows resolved before this was recorded; those are treated
 * as "aplicado", which is what the only action that used to leave a trace did.
 */
export function KbChangeResolvedBanner({
  diff,
  accion,
  por,
}: {
  diff: KbChangeDiffEntry[];
  accion?: string | null;
  por?: string | null;
}) {
  const descartado = accion === "descartado";
  return (
    <div
      className={
        descartado
          ? "rounded bg-amber-50 border border-amber-400 px-2 py-1.5 text-[11px] text-amber-900 space-y-1"
          : "rounded bg-blue-50 border border-blue-300 px-2 py-1.5 text-[11px] text-blue-900 space-y-1"
      }
    >
      <div className="font-bold">
        {descartado ? "⚠ AVISO DE CAMBIO DESCARTADO SIN APLICAR" : "✓ LIMPIEZA CON CAMBIOS APLICADOS HOY"}
        {por ? <span className="font-normal"> · {por}</span> : null}
      </div>
      {descartado && (
        <div className="font-normal">
          La limpieza mantiene los valores anteriores. Cambios que se descartaron:
        </div>
      )}
      {diff.length > 0 && (
        <ul className="space-y-0.5">
          {diff.map((c) => (
            <li key={c.label}>
              {c.label}: <span className="line-through text-red-600">{c.old}</span>{" "}
              → <span className={descartado ? "font-bold" : "font-bold text-emerald-700"}>{c.nu}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
