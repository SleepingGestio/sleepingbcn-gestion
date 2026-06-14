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
  const label = enLimpieza ? "En limpieza" : (estado ?? "—");
  const style = STYLES[label] ?? "bg-secondary text-secondary-foreground hover:bg-secondary";
  return <Badge className={cn("border-transparent", style, className)}>{label}</Badge>;
}