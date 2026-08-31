import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReservas, type DateMode } from "@/lib/reservas";
import {
  fetchApartamentosRef, fetchCanalesReserva, fetchTarifasCobroCanal, fetchTarifasComisionOta,
  fetchTarifasLimpieza, type ApartamentoRef, type CanalReserva,
} from "@/lib/tarifas";
import {
  comisionBase, computeComision, computeKbComparison, hasKbMismatch, pagadoEstanciaEfectivo,
} from "@/lib/comisiones";
import type { Reserva } from "@/lib/types";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { ReservaDetail } from "@/components/reserva-detail";
import { EstadoBadge } from "@/components/estado-badge";
import { DateRangePicker, nextWeekRange } from "@/components/date-range-picker";
import { fmtDate } from "@/lib/format";
import { SortHeader } from "@/components/sort-header";
import { GroupFilterChips, useGroupFilter } from "@/components/group-filter";
import { EstadoFilterChips, useEstadoFilter } from "@/components/estado-filter";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reservas")({
  component: ReservasPage,
});

type SortKey = "numero" | "referencia" | "habitaciones" | "checkin" | "checkout" | "huespedes" | "portal" | "estado";

const DATE_MODE_OPTIONS: { value: DateMode; label: string }[] = [
  { value: "checkin", label: "Check-in" },
  { value: "checkout", label: "Check-out" },
  { value: "periodo", label: "Check-in/out dentro del periodo" },
  { value: "alta", label: "Alta reserva" },
];

/** Same logic as reserva-detail.tsx's kbComparison, generalized for a list
 *  row: candidate % = saved (reservas_gestio) ?? suggested tariff (looked up
 *  from the small reference tables below — all fetched once for the whole
 *  page, not per row, so this stays client-side/cheap for the ~600-row
 *  universe this app has today; revisit if that grows a lot). */
function noCuadra(
  r: Reserva,
  canales: CanalReserva[] | undefined,
  apartamentos: ApartamentoRef[] | undefined,
  tarifasLimpieza: { id_categoria_limpieza: number; costo_limpieza: number }[] | undefined,
  tarifasComision: { id_tipo_licencia: number; id_canal: number; pct_comision: number }[] | undefined,
  tarifasCobro: { id_canal: number; pct_cobro: number }[] | undefined,
): boolean {
  const canal = canales?.find((c) => c.nombre === r["Portal"]);
  const modoComision = canal?.modo_comision ?? "bruto";
  const apto = r["Habitaciones"] ? apartamentos?.find((a) => a.nombre === r["Habitaciones"]) : undefined;

  const propuestaLimpieza =
    apto?.id_categoria_limpieza != null
      ? tarifasLimpieza?.find((t) => t.id_categoria_limpieza === apto.id_categoria_limpieza)?.costo_limpieza ?? null
      : null;
  const propuestaComision =
    apto?.id_tipo_licencia != null && canal?.id_canal != null
      ? tarifasComision?.find((t) => t.id_tipo_licencia === apto.id_tipo_licencia && t.id_canal === canal.id_canal)
          ?.pct_comision ?? null
      : null;
  const propuestaCobro =
    canal?.id_canal != null ? tarifasCobro?.find((t) => t.id_canal === canal.id_canal)?.pct_cobro ?? null : null;

  const pctOta = r.gestio?.PctComisionOTA ?? propuestaComision;
  const pctCobro = r.gestio?.PctPorCobro ?? propuestaCobro;
  const pagadoLimpieza = r.gestio?.PagadoLimpieza ?? propuestaLimpieza;
  // Same effective-Pagado-estancia fallback as the detail popover's one-time
  // prefill — without it, a reservation nobody has opened/saved yet reads as
  // an (almost always incomplete) €0 base and flags a false "No cuadra".
  const pagadoEstancia = pagadoEstanciaEfectivo(r.gestio?.PagadoEstancia, r["Cargo estancia"], r["Comisiones retenidas"]);
  const base = comisionBase(pagadoEstancia, pagadoLimpieza);
  const comision = computeComision(modoComision, pctOta, pctCobro, base);
  return hasKbMismatch(computeKbComparison(r, comision, pctOta, pctCobro));
}

function ReservasPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState(nextWeekRange);
  const [sortKey, setSortKey] = useState<SortKey>("checkin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const filter = useGroupFilter();
  const estadoFilter = useEstadoFilter();
  const [soloNoCuadran, setSoloNoCuadran] = useState(false);
  const [dateMode, setDateMode] = useState<DateMode>("checkin");
  // Whether an active search text should still respect the Estado/Grupo/
  // Fechas filters. Off by default: typing a search is almost always "find
  // this reservation wherever it is", not "find it within what I'm
  // currently filtering to" — see Ramon's request 2026-08-31. Irrelevant
  // (every filter always applies) when the search box is empty.
  const [aplicarEstadoEnBusqueda, setAplicarEstadoEnBusqueda] = useState(false);
  const [aplicarGrupoEnBusqueda, setAplicarGrupoEnBusqueda] = useState(false);
  const [aplicarFechasEnBusqueda, setAplicarFechasEnBusqueda] = useState(false);
  const { canEdit } = usePermissions();
  const canEditReservas = canEdit("reservas");

  const sTrim = search.trim();
  const s = sTrim.toLowerCase();
  const fechasActivo = !sTrim || aplicarFechasEnBusqueda;
  // Search ignoring Fechas needs its own query — the date-bound `q` below
  // physically doesn't contain rows outside `range`. Scoped server-side by
  // `search` (not a full-table fetch) so it stays fast and doesn't depend
  // on how high fetchReservas' row cap is.
  const usandoBusquedaAmplia = sTrim !== "" && !fechasActivo;

  // Estado is filtered client-side (like Grupo already was), not via a
  // query param — needed so a search can bypass it. Fetches the whole date
  // range regardless of the Estado chips; same ~600-row budget the "No
  // cuadra" column already accepts for client-side work.
  const q = useQuery({
    queryKey: ["reservas", { from: range.from, to: range.to, dateMode }],
    queryFn: () => fetchReservas({ from: range.from, to: range.to, dateMode }),
  });

  const searchQ = useQuery({
    queryKey: ["reservas-search", sTrim],
    queryFn: () => fetchReservas({ search: sTrim }),
    enabled: usandoBusquedaAmplia,
  });

  const sourceData = usandoBusquedaAmplia ? searchQ.data : q.data;
  const sourceLoading = usandoBusquedaAmplia ? searchQ.isLoading : q.isLoading;
  const sourceError = usandoBusquedaAmplia ? searchQ.error : q.error;

  // Small reference tables (whole-table fetches, cached by react-query) —
  // enough to resolve the suggested tariff per row client-side, no per-row
  // queries. Same data reserva-detail.tsx fetches for the detail popover.
  const canalesQ = useQuery({ queryKey: ["canales-reserva-list"], queryFn: fetchCanalesReserva });
  const apartamentosQ = useQuery({ queryKey: ["apartamentos-ref-list"], queryFn: fetchApartamentosRef });
  const tarifasLimpiezaQ = useQuery({ queryKey: ["tarifas-limpieza-list"], queryFn: fetchTarifasLimpieza });
  const tarifasComisionQ = useQuery({ queryKey: ["tarifas-comision-list"], queryFn: fetchTarifasComisionOta });
  const tarifasCobroQ = useQuery({ queryKey: ["tarifas-cobro-list"], queryFn: fetchTarifasCobroCanal });

  // Número -> "No cuadra" flag, recomputed only when the visible reservation
  // set (whichever source is active) or any reference table changes.
  const noCuadraMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of sourceData ?? []) {
      map.set(
        r["Número"],
        noCuadra(r, canalesQ.data, apartamentosQ.data, tarifasLimpiezaQ.data, tarifasComisionQ.data, tarifasCobroQ.data),
      );
    }
    return map;
  }, [sourceData, canalesQ.data, apartamentosQ.data, tarifasLimpiezaQ.data, tarifasComisionQ.data, tarifasCobroQ.data]);

  const filtered = useMemo(() => {
    if (!sourceData) return [];
    // Both filters always apply when there's no search text; while
    // searching, each only applies if its own toggle is on. Fechas doesn't
    // need a client-side check here — it's already baked into which query
    // (`q`, date-bound, or `searchQ`, unbound) fed `sourceData`.
    const estadoActivo = !s || aplicarEstadoEnBusqueda;
    const grupoActivo = !s || aplicarGrupoEnBusqueda;
    let base: Reserva[] = sourceData;
    if (estadoActivo) base = base.filter((r) => estadoFilter.selectedSet.has(r["Estado"] ?? ""));
    if (grupoActivo) {
      base = base.filter((r) => r["Habitaciones"] != null && filter.allowedAptNames.has(r["Habitaciones"]));
    }
    if (s) {
      base = base.filter((r) =>
        [r["Referencia"], r["Número"], r["Habitaciones"]].some(
          (v) => v && String(v).toLowerCase().includes(s),
        ),
      );
    }
    if (soloNoCuadran) base = base.filter((r) => noCuadraMap.get(r["Número"]));
    const arr = [...base];
    const pick = (r: (typeof base)[number]) => {
      switch (sortKey) {
        case "numero": return r["Número"] ?? "";
        case "referencia": return r["Referencia"] ?? "";
        case "habitaciones": return r["Habitaciones"] ?? "";
        case "checkin": return r["Check in"] ?? "";
        case "checkout": return r["Check-out"] ?? "";
        case "huespedes": return r["Huéspedes"] ?? "";
        case "portal": return r["Portal"] ?? "";
        case "estado": return r["Estado"] ?? "";
      }
    };
    arr.sort((a, b) => {
      const av = pick(a), bv = pick(b);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const c = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [
    sourceData, s, sortKey, sortDir, filter.allowedAptNames, soloNoCuadran, noCuadraMap,
    estadoFilter.selectedSet, aplicarEstadoEnBusqueda, aplicarGrupoEnBusqueda,
  ]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  return (
    <AppShell title="Reservas">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <DateRangePicker value={range} onChange={setRange} />
        <Select value={dateMode} onValueChange={(v) => setDateMode(v as DateMode)}>
          <SelectTrigger className="w-auto min-w-[220px] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_MODE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar por huésped, número o apartamento…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md bg-white"
        />
        {search.trim() !== "" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Buscar con filtros:</span>
            <button
              type="button"
              onClick={() => setAplicarEstadoEnBusqueda((v) => !v)}
              className={cn(
                "px-3 py-1 rounded-full text-xs border transition-colors",
                aplicarEstadoEnBusqueda
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-muted-foreground hover:bg-muted",
              )}
            >
              Estado
            </button>
            <button
              type="button"
              onClick={() => setAplicarGrupoEnBusqueda((v) => !v)}
              className={cn(
                "px-3 py-1 rounded-full text-xs border transition-colors",
                aplicarGrupoEnBusqueda
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-muted-foreground hover:bg-muted",
              )}
            >
              Grupo
            </button>
            <button
              type="button"
              onClick={() => setAplicarFechasEnBusqueda((v) => !v)}
              className={cn(
                "px-3 py-1 rounded-full text-xs border transition-colors",
                aplicarFechasEnBusqueda
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-muted-foreground hover:bg-muted",
              )}
            >
              Fechas
            </button>
          </div>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <EstadoFilterChips {...estadoFilter} />
        <button
          type="button"
          onClick={() => setSoloNoCuadran((v) => !v)}
          className={cn(
            "px-3 py-1 rounded-full text-xs border transition-colors",
            soloNoCuadran
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-white text-muted-foreground hover:bg-muted",
          )}
        >
          ⚠ Solo no cuadran
        </button>
      </div>
      <GroupFilterChips {...filter} />

      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader label="Número" active={sortKey === "numero"} dir={sortDir} onClick={() => toggleSort("numero")} /></TableHead>
              <TableHead><SortHeader label="Referencia" active={sortKey === "referencia"} dir={sortDir} onClick={() => toggleSort("referencia")} /></TableHead>
              <TableHead><SortHeader label="Habitación" active={sortKey === "habitaciones"} dir={sortDir} onClick={() => toggleSort("habitaciones")} /></TableHead>
              <TableHead><SortHeader label="Check-in" active={sortKey === "checkin"} dir={sortDir} onClick={() => toggleSort("checkin")} /></TableHead>
              <TableHead><SortHeader label="Check-out" active={sortKey === "checkout"} dir={sortDir} onClick={() => toggleSort("checkout")} /></TableHead>
              <TableHead><SortHeader label="Pers." active={sortKey === "huespedes"} dir={sortDir} onClick={() => toggleSort("huespedes")} /></TableHead>
              <TableHead><SortHeader label="Portal" active={sortKey === "portal"} dir={sortDir} onClick={() => toggleSort("portal")} /></TableHead>
              <TableHead><SortHeader label="Estado" active={sortKey === "estado"} dir={sortDir} onClick={() => toggleSort("estado")} /></TableHead>
              <TableHead>Comisión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sourceLoading && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
            )}
            {sourceError && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-destructive">{(sourceError as Error).message}</TableCell></TableRow>
            )}
            {!sourceLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin reservas</TableCell></TableRow>
            )}
            {filtered.map((r) => (
              <TableRow
                key={r["Número"]}
                className="cursor-pointer"
                onClick={() => setSelected(r["Número"])}
              >
                <TableCell className="font-mono text-xs">{r["Número"]}</TableCell>
                <TableCell className="font-medium">{r["Referencia"] ?? "—"}</TableCell>
                <TableCell>{r["Habitaciones"] ?? "—"}</TableCell>
                <TableCell>{fmtDate(r["Check in"])}</TableCell>
                <TableCell>{fmtDate(r["Check-out"])}</TableCell>
                <TableCell>{r["Huéspedes"] ?? "—"}</TableCell>
                <TableCell>{r["Portal"] ?? "—"}</TableCell>
                <TableCell><EstadoBadge estado={r["Estado"]} enLimpieza={r.gestio?.EnLimpieza} /></TableCell>
                <TableCell>
                  {noCuadraMap.get(r["Número"]) && (
                    <span className="whitespace-nowrap text-xs font-semibold text-amber-700">⚠ No cuadra</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ReservaDetail
        numero={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onSaved={() => { q.refetch(); if (usandoBusquedaAmplia) searchQ.refetch(); }}
        readOnly={!canEditReservas}
      />
    </AppShell>
  );
}
