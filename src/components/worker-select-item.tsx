import { SelectItem } from "@/components/ui/select";
import type { UnavailabilityReason } from "@/lib/worker-availability";

const REASON_LABEL: Record<UnavailabilityReason, string> = {
  sin_contrato: "sin contrato activo",
  vacaciones: "vacaciones",
  baja: "baja",
  festivo: "festivo",
};

const REASON_WARNING: Record<UnavailabilityReason, string> = {
  sin_contrato: "no tiene un contrato activo",
  vacaciones: "está de vacaciones",
  baja: "está de baja",
  festivo: "tiene festivo",
};

export function unavailabilityReasonLabel(reason: UnavailabilityReason): string {
  return REASON_LABEL[reason];
}

export function unavailabilityWarningText(reason: UnavailabilityReason): string {
  return REASON_WARNING[reason];
}

/**
 * Drop-in replacement for a plain <SelectItem> in any worker-assignment
 * dropdown wired to getUnavailableWorkerIds(): disabled + shaded + a short
 * reason suffix when the worker is unavailable on the selected date.
 */
export function WorkerSelectItem({
  id_persona,
  label,
  reason,
}: {
  id_persona: number;
  label: string;
  reason: UnavailabilityReason | undefined;
}) {
  return (
    <SelectItem value={String(id_persona)} disabled={!!reason} className={reason ? "text-muted-foreground/60" : undefined}>
      {label}
      {reason ? ` — ${unavailabilityReasonLabel(reason)}` : ""}
    </SelectItem>
  );
}
