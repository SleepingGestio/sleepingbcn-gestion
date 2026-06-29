import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPersonal } from "@/hooks/use-current-personal";

export type MenuKey =
  | "reservas"
  | "checkins"
  | "limpiezas_asignadas"
  | "programacion_limpiezas"
  | "comunicar_tareas"
  | "mi_dia"
  | "config_general"
  | "config_personal"
  | "config_apartamentos";

export const ALL_MENUS: { key: MenuKey; label: string }[] = [
  { key: "reservas", label: "Reservas" },
  { key: "checkins", label: "Check-ins" },
  { key: "limpiezas_asignadas", label: "Limpiezas asignadas" },
  { key: "programacion_limpiezas", label: "Programación limpiezas" },
  { key: "comunicar_tareas", label: "Comunicar tareas" },
  { key: "mi_dia", label: "Mi día" },
  { key: "config_general", label: "Configuración · General" },
  { key: "config_personal", label: "Configuración · Personal" },
  { key: "config_apartamentos", label: "Configuración · Apartamentos" },
];

type PermMap = Record<string, { v: boolean; e: boolean }>;

export function usePermissions() {
  const { persona, isAdmin, loading: cpLoading } = useCurrentPersonal();
  const id_persona = persona?.id_persona ?? null;

  const q = useQuery({
    queryKey: ["my-permissions", id_persona],
    enabled: !!id_persona && !isAdmin,
    queryFn: async (): Promise<PermMap> => {
      const { data: prData, error: prErr } = await supabase
        .from("personal_roles")
        .select("id_rol")
        .eq("id_persona", id_persona!)
        .is("fecha_hasta", null);
      if (prErr) throw prErr;
      const roleIds = (prData ?? []).map((r: { id_rol: number }) => r.id_rol);
      if (!roleIds.length) return {};
      const { data, error } = await supabase
        .from("rol_permisos")
        .select("menu, pot_veure, pot_editar")
        .in("id_rol", roleIds);
      if (error) throw error;
      const map: PermMap = {};
      for (const r of (data ?? []) as { menu: string; pot_veure: boolean; pot_editar: boolean }[]) {
        const cur = map[r.menu] ?? { v: false, e: false };
        map[r.menu] = { v: cur.v || !!r.pot_veure, e: cur.e || !!r.pot_editar };
      }
      return map;
    },
    staleTime: 60_000,
  });

  const map = q.data ?? {};

  function canView(menu: MenuKey | string): boolean {
    if (isAdmin) return true;
    return !!map[menu]?.v;
  }
  function canEdit(menu: MenuKey | string): boolean {
    if (isAdmin) return true;
    return !!map[menu]?.e;
  }

  return {
    canView,
    canEdit,
    isAdmin,
    map,
    loading: cpLoading || (!isAdmin && !!id_persona && q.isLoading),
  };
}
