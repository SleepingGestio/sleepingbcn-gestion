import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReservas } from "@/lib/reservas";
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
  const { canEdit } = usePermissions();
  const canEditReservas = canEdit("reservas");

  const q = useQuery({
    queryKey: ["reservas", { estados: estadoFilter.estadosParam, from: range.from, to: range.to }],
    queryFn: () =>
      fetchReservas({
        estados: estadoFilter.estadosParam,
        from: range.from,
        to: range.to,
        dateField: "Check in",
      }),
  });

  // Small reference tables (whole-table fetches, cached by react-query) —
  // enough to resolve the suggested tariff per row client-side, no per-row
  // queries. Same data reserva-detail.tsx fetches for the detail popover.
  const canalesQ = useQuery({ queryKey: ["canales-reserva-list"], queryFn: fetchCanalesReserva });
  const apartamentosQ = useQuery({ queryKey: ["apartamentos-ref-list"], queryFn: fetchApartamentosRef });
  const tarifasLimpiezaQ = useQuery({ queryKey: ["tarifas-limpieza-list"], queryFn: fetchTarifasLimpieza });
  const tarifasComisionQ = useQuery({ queryKey: ["tarifas-comision-list"], queryFn: fetchTarifasComisionOta });
  const tarifasCobroQ = useQuery({ queryKey: ["tarifas-cobro-list"], queryFn: fetchTarifasCobroCanal });

  // Número -> "No cuadra" flag, recomputed only when the reservations or any
  // reference table changes — not on every render/sort/filter tweak.
  const noCuadraMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of q.data ?? []) {
      map.set(
        r["Número"],
        noCuadra(r, canalesQ.data, apartamentosQ.data, tarifasLimpiezaQ.data, tarifasComisionQ.data, tarifasCobroQ.data),
      );
    }
    return map;
  }, [q.data, canalesQ.data, apartamentosQ.data, tarifasLimpiezaQ.data, tarifasComisionQ.data, tarifasCobroQ.data]);

  const filtered = useMemo(() => {
    if (!q.data) return [];
    const s = search.trim().toLowerCase();
    const byGroup = q.data.filter(
      (r) => r["Habitaciones"] != null && filter.allowedAptNames.has(r["Habitaciones"]),
    );
    const bySearch = !s
      ? byGroup
      : byGroup.filter((r) =>
          [r["Referencia"], r["Número"], r["Habitaciones"]].some(
            (v) => v && String(v).toLowerCase().includes(s),
          ),
        );
    const base = !soloNoCuadran ? bySearch : bySearch.filter((r) => noCuadraMap.get(r["Número"]));
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
  }, [q.data, search, sortKey, sortDir, filter.allowedAptNames, soloNoCuadran, noCuadraMap]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  return (
    <AppShell title="Reservas">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <DateRangePicker value={range} onChange={setRange} />
        <Input
          placeholder="Buscar por huésped, número o apartamento…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md bg-white"
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Estado:</span>
        <EstadoFilterChips {...estadoFilter} />
        <span className="mx-1 h-5 w-px bg-border" />
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
            {q.isLoading && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
            )}
            {q.error && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-destructive">{(q.error as Error).message}</TableCell></TableRow>
            )}
            {!q.isLoading && filtered.length === 0 && (
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
        onSaved={() => q.refetch()}
        readOnly={!canEditReservas}
      />
    </AppShell>
  );
}