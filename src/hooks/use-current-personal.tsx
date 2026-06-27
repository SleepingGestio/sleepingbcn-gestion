import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type CurrentPersonal = {
  id_persona: number;
  nombre: string | null;
  apellidos: string | null;
  codigo: string | null;
  mail: string | null;
  activo: boolean | null;
  roles: string[];
  accesoApps: string[];
};

async function fetchByEmail(email: string): Promise<CurrentPersonal | null> {
  console.log("[useCurrentPersonal] Looking up personal by email:", email);
  const { data, error } = await supabase
    .from("personal")
    .select(
      "id_persona, nombre, apellidos, codigo, mail, activo, personal_roles(fecha_hasta, roles(nombre, acceso_app))",
    )
    .ilike("mail", email)
    .maybeSingle();
  if (error) {
    console.error("[useCurrentPersonal] Lookup error:", error);
    throw error;
  }
  if (!data) {
    console.warn("[useCurrentPersonal] No matching personal record for:", email);
    return null;
  }
  const pr = (data as any).personal_roles ?? [];
  const active = pr.filter((r: any) => !r.fecha_hasta);
  const roles: string[] = active.map((r: any) => r.roles?.nombre).filter(Boolean);
  const accesoApps: string[] = Array.from(
    new Set(active.map((r: any) => r.roles?.acceso_app).filter(Boolean) as string[]),
  );
  console.log("[useCurrentPersonal] Found personal:", {
    id_persona: (data as any).id_persona,
    mail: (data as any).mail,
    roles,
    accesoApps,
  });
  return {
    id_persona: (data as any).id_persona,
    nombre: (data as any).nombre,
    apellidos: (data as any).apellidos,
    codigo: (data as any).codigo,
    mail: (data as any).mail,
    activo: (data as any).activo,
    roles,
    accesoApps,
  };
}

export function useCurrentPersonal() {
  const { user } = useAuth();
  const email = user?.email ?? null;
  const q = useQuery({
    queryKey: ["current-personal", email],
    queryFn: () => fetchByEmail(email!),
    enabled: !!email,
    staleTime: 60_000,
  });
  const persona = q.data ?? null;
  const roles = persona?.roles ?? [];
  const accesoApps = persona?.accesoApps ?? [];
  const isAdmin = accesoApps.includes("admin");
  const isGestor = accesoApps.includes("gestor") || isAdmin;
  const isWorker = accesoApps.includes("worker");
  const isWorkerOnly = isWorker && !isAdmin && !isGestor;
  const hasAppAccess = isAdmin || isGestor || isWorker;
  const notConfigured = !q.isLoading && !!email && !persona;
  // Backwards-compat alias used elsewhere
  const isLimpieza = isWorker;
  return {
    persona,
    roles,
    accesoApps,
    isAdmin,
    isGestor,
    isWorker,
    isLimpieza,
    isWorkerOnly,
    hasAppAccess,
    notConfigured,
    loading: q.isLoading,
  };
}
