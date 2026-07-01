import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/registre-horari")({
  component: () => <Outlet />,
});
