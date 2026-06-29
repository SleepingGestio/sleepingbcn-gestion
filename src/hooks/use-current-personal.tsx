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
  onboarding_completat: boolean | null;
  roles: string[];
  roleIds: number[];
};

async function fetchByEmail(email: string): Promise<CurrentPersonal | null> {
  console.log("[useCurrentPersonal] Looking up personal by email:", email);
  const { data, error } = await supabase
    .from("personal")
    .select(
      "id_persona, nombre, apellidos, codigo, mail, activo, onboarding_completat, personal_roles(id_rol, fecha_hasta, roles(nombre))",
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
  const roleIds: number[] = Array.from(
    new Set(active.map((r: any) => r.id_rol).filter((x: any) => typeof x === "number")),
  );
  console.log("[useCurrentPersonal] Found personal:", {
    id_persona: (data as any).id_persona,
    mail: (data as any).mail,
    roles,
    roleIds,
  });
  return {
    id_persona: (data as any).id_persona,
    nombre: (data as any).nombre,
    apellidos: (data as any).apellidos,
    codigo: (data as any).codigo,
    mail: (data as any).mail,
    activo: (data as any).activo,
    onboarding_completat: (data as any).onboarding_completat ?? false,
    roles,
    roleIds,
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
  const roleIds = persona?.roleIds ?? [];
  const isAdmin = roleIds.includes(1);
  const notConfigured = !q.isLoading && !!email && !persona;
  return {
    persona,
    roles,
    roleIds,
    isAdmin,
    notConfigured,
    loading: q.isLoading,
  };
}
