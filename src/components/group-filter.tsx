import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type Grupo = {
  id_grupo: number;
  nombre: string;
  orden: number | null;
  mostrar_por_defecto: boolean | null;
};

export type Apartamento = {
  id_apt: number;
  nombre: string;
  id_grupo: number;
};

export type FilterMode = "default" | "all" | "custom";

async function fetchGrupos(): Promise<Grupo[]> {
  const { data, error } = await supabase
    .from("grupos_apartamentos")
    .select("id_grupo, nombre, orden, mostrar_por_defecto")
    .order("orden", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Grupo[];
}

async function fetchApartamentos(): Promise<Apartamento[]> {
  const { data, error } = await supabase
    .from("apartamentos")
    .select("id_apt, nombre, id_grupo")
    .eq("activo", true);
  if (error) throw error;
  return (data ?? []) as Apartamento[];
}

export function useGroupFilter() {
  const [filterMode, setFilterMode] = useState<FilterMode>("default");
  const [customGroups, setCustomGroups] = useState<Set<number>>(new Set());

  const gruposQ = useQuery({ queryKey: ["grupos_apartamentos"], queryFn: fetchGrupos });
  const aptsQ = useQuery({ queryKey: ["apartamentos_activos_min"], queryFn: fetchApartamentos });

  const visibleGrupos = useMemo(() => {
    const all = gruposQ.data ?? [];
    if (filterMode === "all") return all;
    if (filterMode === "default") return all.filter((g) => g.mostrar_por_defecto);
    return all.filter((g) => customGroups.has(g.id_grupo));
  }, [gruposQ.data, filterMode, customGroups]);

  const visibleGroupIds = useMemo(
    () => new Set(visibleGrupos.map((g) => g.id_grupo)),
    [visibleGrupos],
  );

  const allowedAptIds = useMemo(() => {
    const s = new Set<number>();
    for (const a of aptsQ.data ?? []) {
      if (visibleGroupIds.has(a.id_grupo)) s.add(a.id_apt);
    }
    return s;
  }, [aptsQ.data, visibleGroupIds]);

  const allowedAptNames = useMemo(() => {
    const s = new Set<string>();
    for (const a of aptsQ.data ?? []) {
      if (visibleGroupIds.has(a.id_grupo)) s.add(a.nombre);
    }
    return s;
  }, [aptsQ.data, visibleGroupIds]);

  const toggleGroup = (id: number) => {
    setCustomGroups((prev) => {
      if (filterMode !== "custom") {
        const seed = new Set(visibleGroupIds);
        if (seed.has(id)) seed.delete(id);
        else seed.add(id);
        setFilterMode("custom");
        return seed;
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return {
    gruposQ,
    aptsQ,
    filterMode,
    setFilterMode,
    visibleGrupos,
    visibleGroupIds,
    allowedAptIds,
    allowedAptNames,
    toggleGroup,
  };
}

export function GroupFilterChips(props: ReturnType<typeof useGroupFilter>) {
  const { gruposQ, filterMode, setFilterMode, visibleGroupIds, toggleGroup } = props;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setFilterMode("default")}
        className={cn(
          "px-3 py-1 rounded-full text-xs border transition-colors",
          filterMode === "default"
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-white hover:bg-muted",
        )}
      >
        Por defecto
      </button>
      <button
        type="button"
        onClick={() => setFilterMode("all")}
        className={cn(
          "px-3 py-1 rounded-full text-xs border transition-colors",
          filterMode === "all"
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-white hover:bg-muted",
        )}
      >
        Todos
      </button>
      <span className="mx-1 h-5 w-px bg-border" />
      {(gruposQ.data ?? []).map((g) => {
        const active = visibleGroupIds.has(g.id_grupo);
        return (
          <button
            key={g.id_grupo}
            type="button"
            onClick={() => toggleGroup(g.id_grupo)}
            className={cn(
              "px-3 py-1 rounded-full text-xs border transition-colors",
              active
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-muted-foreground hover:bg-muted",
            )}
          >
            {g.nombre}
          </button>
        );
      })}
    </div>
  );
}