import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePermissions, ROUTE_TO_MENU } from "@/hooks/use-permissions";

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
