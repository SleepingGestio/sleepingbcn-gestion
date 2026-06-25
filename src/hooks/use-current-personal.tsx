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
};

async function fetchByEmail(email: string): Promise<CurrentPersonal | null> {
  const { data, error } = await supabase
    .from("personal")
    .select(
      "id_persona, nombre, apellidos, codigo, mail, activo, personal_roles(fecha_hasta, roles(nombre))",
    )
    .eq("mail", email)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const pr = (data as any).personal_roles ?? [];
  const roles: string[] = pr
    .filter((r: any) => !r.fecha_hasta)
    .map((r: any) => r.roles?.nombre)
    .filter(Boolean);
  return {
    id_persona: (data as any).id_persona,
    nombre: (data as any).nombre,
    apellidos: (data as any).apellidos,
    codigo: (data as any).codigo,
    mail: (data as any).mail,
    activo: (data as any).activo,
    roles,
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
  const isLimpieza = roles.includes("Limpieza");
  const isGestor = roles.some((r) => r !== "Limpieza");
  const isWorkerOnly = isLimpieza && !isGestor;
  return { persona, roles, isLimpieza, isGestor, isWorkerOnly, loading: q.isLoading };
}
