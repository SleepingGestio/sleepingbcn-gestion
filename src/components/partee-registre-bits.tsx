// Small presentational pieces shared by the reservation tab and /registre-hostes.
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  viajerosTooltip,
  type AlertLevel,
  type Expected,
  reclamacionTooltip,
  type Situacion,
  type SituacionTone,
  type ViajerosTone,
} from "@/lib/partee-registre";

/** One fixed colour per situation; only the orange of the pending ones varies in intensity. */
const SITUACION_STYLE: Record<SituacionTone, string> = {
  ok: "bg-green-600 text-white hover:bg-green-600",
  pendiente_fuerte: "bg-orange-500 text-white hover:bg-orange-500",
  pendiente_suave: "bg-orange-100 text-orange-900 hover:bg-orange-100",
  neutro: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  error: "bg-red-600 text-white hover:bg-red-600",
};

export const LEVEL_TEXT: Record<AlertLevel, string> = {
  danger: "text-red-700",
  warning: "text-orange-700",
  info: "text-sky-800",
  ok: "text-green-700",
};

export const LEVEL_LABEL: Record<AlertLevel, string> = {
  danger: "Urgente",
  warning: "Aviso",
  info: "Info",
  ok: "Correcto",
};

/** The single situation pill, one fixed colour per situation; the tooltip has the technical detail. */
export function SituacionPill({
  situacion,
  tone,
  tooltip,
}: {
  situacion: Situacion;
  tone: SituacionTone;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">
          <Badge className={cn("whitespace-nowrap", SITUACION_STYLE[tone])}>{situacion.label}</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

const TONE_TEXT: Record<ViajerosTone, string> = {
  ok: "text-green-700",
  pendiente_fuerte: "text-orange-600",
  pendiente_suave: "text-orange-400",
  muted: "text-muted-foreground",
};

/** "Reclamado N": orange (same as the pending pill) while nobody claimed, calm blue once claimed. */
export function ReclamadoBadge({
  count,
  last,
  tone,
}: {
  count: number;
  last: { enviada_en: string; canal: string | null } | null;
  /** Tone of the row's pending pill; used only while count is 0. */
  tone: SituacionTone;
}) {
  const style = count >= 1 ? "bg-sky-100 text-sky-900 hover:bg-sky-100" : SITUACION_STYLE[tone];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">
          <Badge className={cn("whitespace-nowrap", style)}>Reclamado {count}</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reclamacionTooltip(count, last)}</TooltipContent>
    </Tooltip>
  );
}

/** Compact "n/N" (just "n" when the expected count is unknown), coloured by tone, no words. */
export function ViajerosCell({ n, expected, tone }: { n: number | null; expected: Expected; tone: ViajerosTone }) {
  const text = expected.expected === null ? `${n ?? 0}` : `${n ?? 0}/${expected.expected}`;
  const tip = viajerosTooltip(n, expected);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={tip}
          className={cn("cursor-help whitespace-nowrap text-lg font-semibold tabular-nums", TONE_TEXT[tone])}
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

export async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Enlace copiado");
  } catch {
    toast.error("No se pudo copiar el enlace");
  }
}

/** Icon-only "Copiar enlace"; disabled with a tooltip when the row has no link. */
export function CopyLinkIconButton({ url, noLinkReason }: { url: string | null; noLinkReason: string }) {
  if (!url) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Button variant="ghost" size="icon" disabled aria-label="Copiar enlace">
              <Copy className="h-4 w-4" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{noLinkReason}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Copiar enlace" onClick={() => copyLink(url)}>
          <Copy className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copiar enlace</TooltipContent>
    </Tooltip>
  );
}

export function OpenLinkButton({ url }: { url: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir en Partee">
        <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir en Partee
      </a>
    </Button>
  );
}

/** Why a row has no check-in link. */
export function noLinkReason(estado: string): string {
  return estado === "finalizado"
    ? "Parte finalizado: Partee ya no ofrece el enlace"
    : "Todavía no hay enlace de registro para esta estancia";
}
