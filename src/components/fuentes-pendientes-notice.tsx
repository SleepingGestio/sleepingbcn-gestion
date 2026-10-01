import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchPlantillas, fuentesPendientes } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * "Hay fuentes pendientes de revisar" notice for the pricing pages. Shares the
 * ["pricing-plantillas"] cache with Eventos-plantillas, and only fetches for users who can
 * view that page (they are the only ones who can act on it). Not dismissible: it disappears
 * once nothing is pending.
 */
export function FuentesPendientesNotice({ className }: { className?: string }) {
  const { canView } = usePermissions();
  const puede = canView("pricing_plantillas");
  const q = useQuery({ queryKey: ["pricing-plantillas"], queryFn: fetchPlantillas, enabled: puede });
  if (!puede) return null;

  const n = fuentesPendientes(q.data ?? []).length;
  if (n === 0) return null;

  return (
    <Alert className={cn("mb-4 border-amber-300 bg-amber-50 text-amber-800 [&>svg]:text-amber-700", className)}>
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>
        {n} {n === 1 ? "fuente pendiente" : "fuentes pendientes"} de revisar
      </AlertTitle>
      <AlertDescription>
        <Link
          to="/pricing/plantillas"
          search={{ tab: "fuentes" }}
          className="font-medium underline underline-offset-2 hover:text-amber-900"
        >
          Ver fuentes a revisar
        </Link>
      </AlertDescription>
    </Alert>
  );
}
