import { cn } from "@/lib/utils";

export type EstadoLimpieza =
  | "activa"
  | "comunicada"
  | "aceptada"
  | "en_curso"
  | "finalizada"
  | "rechazada"
  | "anulada";

export const ESTADO_LIMPIEZA_STYLE: Record<
  EstadoLimpieza,
  { bg: string; fg: string; label: string }
> = {
  activa:      { bg: "#3C3489", fg: "#EEEDFE", label: "Asignada" },
  comunicada:  { bg: "#BA7517", fg: "#FFFFFF", label: "Comunicada" },
  aceptada:    { bg: "#0C447C", fg: "#FFFFFF", label: "Aceptada" },
  en_curso:    { bg: "#085041", fg: "#FFFFFF", label: "En curso" },
  finalizada:  { bg: "rgba(107,114,128,0.6)", fg: "#FFFFFF", label: "Finalizada" },
  rechazada:   { bg: "#7F1D1D", fg: "#FFFFFF", label: "Rechazada" },
  anulada:     { bg: "#9CA3AF", fg: "#FFFFFF", label: "Anulada" },
};

export function getEstadoStyle(estado: string | null | undefined) {
  const key = (estado ?? "activa") as EstadoLimpieza;
  return ESTADO_LIMPIEZA_STYLE[key] ?? ESTADO_LIMPIEZA_STYLE.activa;
}

export function EstadoLimpiezaBadge({
  estado,
  className,
}: {
  estado: string | null | undefined;
  className?: string;
}) {
  const s = getEstadoStyle(estado);
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        className,
      )}
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}