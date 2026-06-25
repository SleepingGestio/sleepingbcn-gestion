import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReservas } from "@/lib/reservas";
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

export const Route = createFileRoute("/reservas")({
  component: ReservasPage,
});

type SortKey = "numero" | "referencia" | "habitaciones" | "checkin" | "checkout" | "huespedes" | "portal" | "estado";

function ReservasPage() {
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("Confirmada");
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState(nextWeekRange);
  const [sortKey, setSortKey] = useState<SortKey>("checkin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const filter = useGroupFilter();

  const q = useQuery({
    queryKey: ["reservas", { estado, from: range.from, to: range.to }],
    queryFn: () =>
      fetchReservas({
        estado: estado === "all" ? undefined : estado,
        from: range.from,
        to: range.to,
        dateField: "Check in",
      }),
  });

  const filtered = useMemo(() => {
    if (!q.data) return [];
    const s = search.trim().toLowerCase();
    const byGroup = q.data.filter(
      (r) => !r["Habitaciones"] || filter.allowedAptNames.has(r["Habitaciones"]),
    );
    const base = !s
      ? byGroup
      : byGroup.filter((r) =>
          [r["Referencia"], r["Número"], r["Habitaciones"]].some(
            (v) => v && String(v).toLowerCase().includes(s),
          ),
        );
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
  }, [q.data, search, sortKey, sortDir, filter.allowedAptNames]);

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
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-48 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="Confirmada">Confirmada</SelectItem>
            <SelectItem value="Cancelada">Cancelada</SelectItem>
            <SelectItem value="Pendiente">Pendiente</SelectItem>
          </SelectContent>
        </Select>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
            )}
            {q.error && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-destructive">{(q.error as Error).message}</TableCell></TableRow>
            )}
            {!q.isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin reservas</TableCell></TableRow>
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
      />
    </AppShell>
  );
}