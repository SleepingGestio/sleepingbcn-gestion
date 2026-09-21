import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EventoAplicaA, EventoCategoria, EventoEstado } from "@/lib/pricing";
import { CATEGORIA_STYLES } from "@/lib/pricing-styles";

const CATEGORIA_LABEL: Record<EventoCategoria, string> = {
  feria: "Feria",
  deporte: "Deporte",
  cultura: "Cultura",
  otro: "Otro",
};

export function CategoriaBadge({ categoria, className }: { categoria: EventoCategoria; className?: string }) {
  return (
    <Badge className={cn("border-transparent", CATEGORIA_STYLES[categoria], className)}>
      {CATEGORIA_LABEL[categoria]}
    </Badge>
  );
}

const APLICA_A_STYLES: Record<EventoAplicaA, string> = {
  city: "bg-indigo-600 text-white hover:bg-indigo-600",
  rural: "bg-amber-600 text-white hover:bg-amber-600",
  ambos: "bg-slate-600 text-white hover:bg-slate-600",
};

const APLICA_A_LABEL: Record<EventoAplicaA, string> = {
  city: "City",
  rural: "Rural",
  ambos: "Ambos",
};

export function AplicaABadge({ aplicaA, className }: { aplicaA: EventoAplicaA; className?: string }) {
  return (
    <Badge className={cn("border-transparent", APLICA_A_STYLES[aplicaA], className)}>
      {APLICA_A_LABEL[aplicaA]}
    </Badge>
  );
}

const ESTADO_STYLES: Record<EventoEstado, string> = {
  confirmado: "bg-green-600 text-white hover:bg-green-600",
  propuesto: "bg-orange-500 text-white hover:bg-orange-500",
  descartado: "bg-secondary text-secondary-foreground hover:bg-secondary",
};

const ESTADO_LABEL: Record<EventoEstado, string> = {
  confirmado: "Confirmado",
  propuesto: "Propuesto",
  descartado: "Descartado",
};

export function EventoEstadoBadge({ estado, className }: { estado: EventoEstado; className?: string }) {
  return (
    <Badge className={cn("border-transparent", ESTADO_STYLES[estado], className)}>
      {ESTADO_LABEL[estado]}
    </Badge>
  );
}
