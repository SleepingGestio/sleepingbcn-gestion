import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePermissions, type MenuKey } from "@/hooks/use-permissions";

const ROUTE_TO_MENU: { route: string; menu: MenuKey }[] = [
  { route: "/reservas", menu: "reservas" },
  { route: "/checkins", menu: "checkins" },
  { route: "/limpiezas", menu: "limpiezas_asignadas" },
  { route: "/programacion-limpiezas", menu: "programacion_limpiezas" },
  { route: "/comunicar-tareas", menu: "comunicar_tareas" },
  { route: "/registre-horari", menu: "registre_horari" },
  { route: "/mi-dia", menu: "mi_dia" },
];

function IndexRedirect() {
  const navigate = useNavigate();
  const { canView, isAdmin, onlyMiDia, loading } = usePermissions();
  useEffect(() => {
    if (loading) return;
    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches;
    if (onlyMiDia || isMobile) {
      navigate({ to: "/mi-dia", replace: true });
      return;
    }
    if (isAdmin) {
      navigate({ to: "/reservas", replace: true });
      return;
    }
    const first = ROUTE_TO_MENU.find((m) => canView(m.menu));
    navigate({ to: (first?.route ?? "/mi-dia") as string, replace: true });
  }, [loading, onlyMiDia, isAdmin, canView, navigate]);
  return null;
}

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});
