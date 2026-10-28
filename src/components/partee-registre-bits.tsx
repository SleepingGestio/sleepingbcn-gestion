// Small presentational pieces shared by the reservation tab and /registre-hostes.
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  COMPARISON_TOOLTIP,
  ESTADO_LABEL,
  viajerosText,
  type AlertLevel,
  type Expected,
} from "@/lib/partee-registre";

const LEVEL_STYLE: Record<AlertLevel, string> = {
  danger: "bg-red-600 text-white hover:bg-red-600",
  warning: "bg-orange-500 text-white hover:bg-orange-500",
  info: "bg-sky-100 text-sky-900 hover:bg-sky-100",
  ok: "bg-green-600 text-white hover:bg-green-600",
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

/** Estado pill, coloured by the alert level of the row. */
export function RegistreEstadoBadge({ estado, level }: { estado: string; level: AlertLevel }) {
  return (
    <Badge className={cn("whitespace-nowrap", LEVEL_STYLE[level])}>{ESTADO_LABEL[estado] ?? estado}</Badge>
  );
}

/** "n registrados · N previstos" with the children caveat tooltip when a comparison is shown. */
export function ViajerosCell({ n, expected }: { n: number | null; expected: Expected }) {
  const text = viajerosText(n, expected);
  if (expected.expected === null) return <span className="whitespace-nowrap">{text}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help whitespace-nowrap underline decoration-dotted underline-offset-2">{text}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{COMPARISON_TOOLTIP}</TooltipContent>
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
      <a href={url} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir
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
