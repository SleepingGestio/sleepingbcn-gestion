import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDistinctEstados } from "@/lib/reservas";
import { ESTADO_ORDER } from "@/components/estado-badge";
import { cn } from "@/lib/utils";

export type EstadoFilterMode = "default" | "all" | "custom";

const DEFAULT_ESTADOS = ["Confirmada"];

export function useEstadoFilter() {
  const [filterMode, setFilterMode] = useState<EstadoFilterMode>("default");
  const [customEstados, setCustomEstados] = useState<Set<string>>(new Set());

  const estadosQ = useQuery({ queryKey: ["distinct-estados-reservas"], queryFn: fetchDistinctEstados });

  const orderedEstados = useMemo(() => {
    const all = estadosQ.data ?? [];
    const rank = (e: string) => {
      const i = ESTADO_ORDER.indexOf(e);
      return i === -1 ? ESTADO_ORDER.length : i;
    };
    return [...all].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [estadosQ.data]);

  // "default" resolves to the literal default regardless of whether the
  // distinct-values query has loaded yet, so the initial render doesn't
  // briefly show zero results while estadosQ is in flight.
  const selectedSet = useMemo(() => {
    if (filterMode === "default") return new Set(DEFAULT_ESTADOS);
    if (filterMode === "all") return new Set(estadosQ.data ?? []);
    return customEstados;
  }, [filterMode, estadosQ.data, customEstados]);

  const toggleEstado = (estado: string) => {
    setCustomEstados((prev) => {
      if (filterMode !== "custom") {
        const seed = new Set(selectedSet);
        if (seed.has(estado)) seed.delete(estado);
        else seed.add(estado);
        setFilterMode("custom");
        return seed;
      }
      const next = new Set(prev);
      if (next.has(estado)) next.delete(estado);
      else next.add(estado);
      return next;
    });
  };

  const selectNone = () => {
    setFilterMode("custom");
    setCustomEstados(new Set());
  };

  // undefined = no filter at all (matches "all", including any status not
  // yet in orderedEstados); otherwise an explicit, sorted list for a
  // stable react-query cache key regardless of toggle order.
  const estadosParam = filterMode === "all" ? undefined : Array.from(selectedSet).sort();

  return {
    estadosQ,
    orderedEstados,
    filterMode,
    setFilterMode,
    selectedSet,
    toggleEstado,
    selectNone,
    estadosParam,
  };
}

// Olive-green box convention: #637863 — sampled from Krossbooking's own
// filter pill, same treatment as the "Filtros" box in /mantenimiento.
// Giving Estado and Grupo each their own labeled box (instead of two bare
// rows of otherwise-identical pills) is what makes them read as two
// distinct, independent filters.
export function EstadoFilterChips(props: ReturnType<typeof useEstadoFilter>) {
  const { orderedEstados, filterMode, setFilterMode, selectedSet, toggleEstado, selectNone } = props;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#637863]/40 bg-[#637863]/15 px-2 py-1.5">
      <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">Estado</span>
      <span className="h-5 w-px bg-[#637863]/40" />
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
      <button
        type="button"
        onClick={selectNone}
        className={cn(
          "px-3 py-1 rounded-full text-xs border transition-colors",
          filterMode === "custom" && selectedSet.size === 0
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-white hover:bg-muted",
        )}
      >
        Ninguno
      </button>
      <span className="mx-1 h-5 w-px bg-border" />
      {orderedEstados.map((estado) => {
        const active = selectedSet.has(estado);
        return (
          <button
            key={estado}
            type="button"
            onClick={() => toggleEstado(estado)}
            className={cn(
              "px-3 py-1 rounded-full text-xs border transition-colors",
              active
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-muted-foreground hover:bg-muted",
            )}
          >
            {estado}
          </button>
        );
      })}
    </div>
  );
}
