import { useCallback, useMemo, useState } from "react";
import type { CanalReserva } from "@/lib/tarifas";
import { cn } from "@/lib/utils";

export type PortalFilterMode = "all" | "custom";

/** Filtre de Portal per a listats reduïts (p. ex. la "vista resum" AirBnB de
 *  /informe-economico) — mateix patró visual i de comportament que
 *  useGroupFilter/GroupFilterChips (xips, multi-selecció, "Todos" per
 *  defecte), però més senzill: no hi ha taula/relació pròpia, la llista
 *  d'opcions ve directament del catàleg de canals ja carregat a la pàgina
 *  (`canales_reserva`, via fetchCanalesReserva) — cap fetch nou aquí. */
export function usePortalFilter(canales: CanalReserva[] | undefined) {
  const [filterMode, setFilterMode] = useState<PortalFilterMode>("all");
  const [customPortales, setCustomPortales] = useState<Set<string>>(new Set());

  const nombresDisponibles = useMemo(() => (canales ?? []).map((c) => c.nombre), [canales]);

  const visiblePortales = useMemo(() => {
    if (filterMode === "all") return new Set(nombresDisponibles);
    return new Set(nombresDisponibles.filter((n) => customPortales.has(n)));
  }, [nombresDisponibles, filterMode, customPortales]);

  const togglePortal = (nombre: string) => {
    setCustomPortales((prev) => {
      if (filterMode !== "custom") {
        const seed = new Set(visiblePortales);
        if (seed.has(nombre)) seed.delete(nombre);
        else seed.add(nombre);
        setFilterMode("custom");
        return seed;
      }
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre);
      else next.add(nombre);
      return next;
    });
  };

  // Predicat per filtrar reserves: en mode "all" NO consulta `visiblePortales`
  // en absolut — passa-tot sempre, encara que `nombresDisponibles` estigui
  // buit (canalesQ.data encara carregant) o una reserva tingui un Portal que
  // no existeix a `canales_reserva` (valor real vist en dades, veure
  // canales-reserva-admin.tsx). Evita que el filtre "per defecte" (Todos)
  // amagui files sense que l'usuari hagi triat res — igual que useGroupFilter
  // amb "all" no depèn de cap taula de grups per no filtrar.
  const matchesPortal = useCallback(
    (portal: string | null) => filterMode === "all" || customPortales.has(portal ?? ""),
    [filterMode, customPortales],
  );

  return {
    nombresDisponibles,
    filterMode,
    setFilterMode,
    visiblePortales,
    togglePortal,
    matchesPortal,
  };
}

// Mateixa convenció de caixa verd-oliva que GroupFilterChips (veure
// group-filter.tsx) — coherència visual entre els dos filtres.
export function PortalFilterChips(props: ReturnType<typeof usePortalFilter>) {
  const { nombresDisponibles, filterMode, setFilterMode, visiblePortales, togglePortal } = props;
  if (nombresDisponibles.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#637863]/40 bg-[#637863]/15 px-2 py-1.5">
      <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
        Portal
      </span>
      <span className="h-5 w-px bg-[#637863]/40" />
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
      {nombresDisponibles.map((nombre) => {
        const active = visiblePortales.has(nombre);
        return (
          <button
            key={nombre}
            type="button"
            onClick={() => togglePortal(nombre)}
            className={cn(
              "px-3 py-1 rounded-full text-xs border transition-colors",
              active
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-muted-foreground hover:bg-muted",
            )}
          >
            {nombre}
          </button>
        );
      })}
    </div>
  );
}
