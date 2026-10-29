// "Generar enlace": creates the Partee online check-in link of ONE `No generado` reservation through the server
// function and stores it. Visible only to editors of 'registre_hostes' (the server re-checks the permission and
// every guard anyway). After success the toast offers "Copiar"; nothing is copied automatically.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { generarEnlacePartee, type GenerarEnlaceResponse } from "@/lib/api/generar-enlace-partee.functions";
import { copyLink } from "@/components/partee-registre-bits";

const FAIL_MESSAGE: Record<string, string> = {
  not_found: "No se ha encontrado la reserva",
  excluded: "Esta reserva está excluida del registro",
  cancelled: "La reserva está cancelada",
  past_checkin: "La fecha de entrada ya ha pasado",
  no_units: "Ningún apartamento de la reserva está dado de alta en Partee",
  not_single_unit: "Solo se puede generar el enlace en reservas de una sola unidad",
  conflict: "Hay otra reserva en el mismo apartamento y día; no se puede asociar a Partee",
  stale_state: "El estado de la reserva ha cambiado; pulsa «Actualizar ahora» y vuelve a intentarlo",
  not_in_partee: "La reserva todavía no está en Partee",
  ambiguous: "Hay varios registros en Partee para esta unidad y fecha; revisadlo a mano",
  partee_unauthorized: "Partee ha rechazado la petición (token o suscripción del alojamiento)",
  partee_rate_limited: "Partee está limitando las consultas, inténtalo en unos minutos",
  forbidden: "No tienes permiso para generar enlaces",
};
const GENERIC = "No se ha podido generar el enlace";

/** Toast text for a server response (exported to keep the mapping in one place). */
export function generarEnlaceToast(res: GenerarEnlaceResponse): {
  kind: "success" | "error";
  text: string;
  /** Short non-sensitive diagnostic (partee_error only), to help report the failure. */
  description?: string;
} {
  if (res.ok) {
    return { kind: "success", text: res.code === "existing" ? "Enlace recuperado" : "Enlace generado" };
  }
  const text = FAIL_MESSAGE[res.code] ?? GENERIC;
  return res.code === "partee_error" && res.detail
    ? { kind: "error", text, description: `Detalle: ${res.detail}` }
    : { kind: "error", text };
}

export function useGenerarEnlace(numero: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => generarEnlacePartee({ data: { numero_reserva: numero } }),
    onSuccess: (res) => {
      const t = generarEnlaceToast(res);
      if (res.ok) {
        const url = res.url;
        toast.success(t.text, { action: { label: "Copiar", onClick: () => void copyLink(url) } });
      } else {
        toast.error(t.text, t.description ? { description: t.description } : undefined);
        if (res.detail) console.error("[generar-enlace]", res.code, res.detail);
        else if (!FAIL_MESSAGE[res.code]) console.error("[generar-enlace]", res.code);
      }
      // The row changed (ok) or turned out to be out of date (stale_state): reload it either way.
      if (res.ok || res.code === "stale_state") {
        qc.invalidateQueries({ queryKey: ["partee-registre-reserva"] });
        qc.invalidateQueries({ queryKey: ["partee-registre-window"] });
      }
    },
    onError: (e) => {
      toast.error(GENERIC);
      console.error("[generar-enlace]", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    },
  });
}

/** Button; `compact` = icon-only with tooltip (list rows and mobile cards). */
export function GenerarEnlaceButton({ numero, compact = false }: { numero: string; compact?: boolean }) {
  const m = useGenerarEnlace(numero);
  const Icon = m.isPending ? Loader2 : Link2;
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Generar enlace"
            disabled={m.isPending}
            onClick={() => m.mutate()}
          >
            <Icon className={m.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{m.isPending ? "Generando…" : "Generar enlace"}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button variant="outline" size="sm" disabled={m.isPending} onClick={() => m.mutate()}>
      <Icon className={m.isPending ? "mr-1 h-3.5 w-3.5 animate-spin" : "mr-1 h-3.5 w-3.5"} />
      {m.isPending ? "Generando…" : "Generar enlace"}
    </Button>
  );
}
