import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  "Confirmada": "bg-green-600 text-white hover:bg-green-600",
  "En espera de confirmación": "bg-orange-500 text-white hover:bg-orange-500",
  "En espera de confirmación (Caducadas)": "bg-orange-200 text-orange-900 hover:bg-orange-200",
  "Check-out realizado": "bg-gray-400 text-white hover:bg-gray-400",
  "No show": "bg-neutral-800 text-white hover:bg-neutral-800",
  "Check-in realizado": "bg-blue-600 text-white hover:bg-blue-600",
  "En salida": "bg-pink-500 text-white hover:bg-pink-500",
  "En limpieza": "bg-teal-500 text-white hover:bg-teal-500",
  "Cancelada": "bg-red-600 text-white hover:bg-red-600",
};

const ABBR: Record<string, string> = {
  "Confirmada": "CONF",
  "En espera de confirmación": "PTE",
  "En espera de confirmación (Caducadas)": "PTE CAD",
  "Check-out realizado": "C-OUT",
  "No show": "NO SHOW",
  "Check-in realizado": "C-IN",
  "En salida": "SALIDA",
  "En limpieza": "LIMP",
  "Cancelada": "CANC",
};

export function EstadoBadge({
  estado,
  enLimpieza,
  className,
}: {
  estado: string | null | undefined;
  enLimpieza?: boolean | null;
  className?: string;
}) {
  const full = enLimpieza ? "En limpieza" : (estado ?? "—");
  const label = ABBR[full] ?? full;
  const style = STYLES[full] ?? "bg-secondary text-secondary-foreground hover:bg-secondary";
  return (
    <Badge
      title={full}
      className={cn(
        "border-transparent px-1.5 py-0 text-[10px] font-semibold leading-4 tracking-wide rounded",
        style,
        className,
      )}
    >
      {label}
    </Badge>
  );
}