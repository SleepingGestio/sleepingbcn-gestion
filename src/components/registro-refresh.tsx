// "Actualizar ahora": refreshes ONE reservation from Partee through the server function.
// Visible only to editors of 'registre_hostes' (the server re-checks the permission anyway).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/use-permissions";
import { actualizarReservaPartee, type RefreshResponse } from "@/lib/api/refresh-partee.functions";
import { fmtAgo } from "@/lib/partee-registre";

const FAIL_MESSAGE: Record<string, string> = {
  cooldown: "Espera unos segundos antes de volver a actualizar",
  excluded: "Esta reserva está excluida del registro",
  cancelled: "La reserva está cancelada",
  partee_rate_limited: "Partee está limitando las consultas, inténtalo en unos minutos",
  no_units: "Ningún apartamento de la reserva está dado de alta en Partee",
  conflict: "Hay otra reserva en el mismo apartamento y día; no se puede asociar a Partee",
  too_many_units: "La reserva tiene demasiadas unidades para actualizarla desde aquí",
};
const GENERIC = "No se ha podido actualizar";

/** Toast text for a server response (exported to keep the mapping in one place). */
export function refreshToast(res: RefreshResponse): { kind: "success" | "info" | "error"; text: string } {
  if (res.ok) {
    if (res.code === "not_in_partee") return { kind: "info", text: "La reserva todavía no está en Partee" };
    return { kind: "success", text: "Registro actualizado" };
  }
  return { kind: "error", text: FAIL_MESSAGE[res.code] ?? GENERIC };
}

export function useRefreshReserva(numero: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => actualizarReservaPartee({ data: { numero_reserva: numero } }),
    onSuccess: (res) => {
      const t = refreshToast(res);
      if (t.kind === "success") toast.success(t.text);
      else if (t.kind === "info") toast.info(t.text);
      else {
        toast.error(t.text);
        if (!FAIL_MESSAGE[res.ok ? "" : res.code]) console.error("[actualizar-partee]", res.ok ? "" : res.code);
      }
      if (res.ok && res.needs_review.length > 0) {
        toast.warning("Alguna parte ya enviada no se ha modificado; revísala");
      }
      // The data may have changed (also for not_in_partee: rows are created or touched).
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["partee-registre-reserva"] });
        qc.invalidateQueries({ queryKey: ["partee-registre-window"] });
      }
    },
    onError: (e) => {
      toast.error(GENERIC);
      console.error("[actualizar-partee]", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    },
  });
}

/** Button; `compact` = icon-only with tooltip (list rows and mobile cards). */
export function RefreshButton({ numero, compact = false }: { numero: string; compact?: boolean }) {
  const { canEdit } = usePermissions();
  const m = useRefreshReserva(numero);
  if (!canEdit("registre_hostes")) return null;
  const Icon = m.isPending ? Loader2 : RefreshCw;
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar ahora"
            disabled={m.isPending}
            onClick={() => m.mutate()}
          >
            <Icon className={m.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Actualizar ahora</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button variant="outline" size="sm" disabled={m.isPending} onClick={() => m.mutate()}>
      <Icon className={m.isPending ? "mr-1 h-3.5 w-3.5 animate-spin" : "mr-1 h-3.5 w-3.5"} />
      {m.isPending ? "Actualizando…" : "Actualizar ahora"}
    </Button>
  );
}

/** Top bar of the reservation tab: "Actualizado hace …" + the button (editors, not excluded). */
export function RefreshBar({
  numero,
  lastSync,
  excluded,
}: {
  numero: string;
  lastSync: string | null;
  excluded: boolean;
}) {
  const { canEdit } = usePermissions();
  const showButton = canEdit("registre_hostes") && !excluded;
  if (!showButton && !lastSync) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
      {lastSync && <span>Actualizado {fmtAgo(lastSync)}</span>}
      {showButton && <RefreshButton numero={numero} />}
    </div>
  );
}
