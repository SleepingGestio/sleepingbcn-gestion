import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { fetchReservas, upsertGestio } from "@/lib/reservas";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReservaDetail } from "@/components/reserva-detail";
import { EstadoBadge } from "@/components/estado-badge";
import { Switch } from "@/components/ui/switch";
import { DateRangePicker, todayRange } from "@/components/date-range-picker";
import { toast } from "sonner";
import { SortHeader } from "@/components/sort-header";
import { fmtDate, fmtTime } from "@/lib/format";
import { GroupFilterChips, useGroupFilter } from "@/components/group-filter";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/checkins")({
  component: CheckinsPage,
});

type SortKey = "checkin" | "habitaciones" | "horaKB" | "horaConf";

function CheckinsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState(todayRange);
  const [sortKey, setSortKey] = useState<SortKey>("checkin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const filter = useGroupFilter();
  const { canEdit } = usePermissions();
  const canEditCheckins = canEdit("checkins");

  const q = useQuery({
    queryKey: ["checkins", range.from, range.to],
    queryFn: () =>
      fetchReservas({ from: range.from, to: range.to, dateField: "Check in" }),
  });

  const toggleM = useMutation({
    mutationFn: async ({ numero, value }: { numero: string; value: boolean }) => {
      if (!canEditCheckins) return;
      await upsertGestio({ "Número": numero, ReadyCheckIn: value });
    },
    onSuccess: () => { q.refetch(); },
    onError: (e) => toast.error("Error: " + (e as Error).message),
  });

  const sorted = useMemo(() => {
    const arr = [...(q.data ?? [])];
    const filtered = arr.filter(
      (r) =>
        r["Estado"] !== "Cancelada" &&
        r["Estado"] !== "No show" &&
        r["Habitaciones"] != null &&
        filter.allowedAptNames.has(r["Habitaciones"]),
    );
    filtered.sort((a, b) => {
      const pick = (r: typeof a) => {
        switch (sortKey) {
          case "checkin": return r["Check in"] ?? "";
          case "habitaciones": return r["Habitaciones"] ?? "";
          case "horaKB": return r["Hora estimada de llegada"] ?? "";
          case "horaConf": return r.gestio?.HCheckInConf ?? "";
        }
      };
      const av = pick(a);
      const bv = pick(b);
      const c = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? c : -c;
    });
    return filtered;
  }, [q.data, sortKey, sortDir, filter.allowedAptNames]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  return (
    <AppShell title="Check-ins">
      <div className="mb-4 flex items-center gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <span className="text-sm text-muted-foreground">{q.data?.length ?? 0} llegada(s)</span>
      </div>
      <GroupFilterChips {...filter} />
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader label="Check in" active={sortKey === "checkin"} dir={sortDir} onClick={() => toggleSort("checkin")} />
              </TableHead>
              <TableHead>
                <SortHeader label="Hora (KB)" active={sortKey === "horaKB"} dir={sortDir} onClick={() => toggleSort("horaKB")} />
              </TableHead>
              <TableHead>
                <SortHeader label="Hora (conf.)" active={sortKey === "horaConf"} dir={sortDir} onClick={() => toggleSort("horaConf")} />
              </TableHead>
              <TableHead>Huésped</TableHead>
              <TableHead>
                <SortHeader label="Apartamento" active={sortKey === "habitaciones"} dir={sortDir} onClick={() => toggleSort("habitaciones")} />
              </TableHead>
              <TableHead>Pers.</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Listo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!q.isLoading && sorted.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No hay check-ins en el rango</TableCell></TableRow>
            )}
            {sorted.map((r) => (
              <TableRow key={r["Número"]} className="cursor-pointer" onClick={() => setSelected(r["Número"])}>
                <TableCell>{fmtDate(r["Check in"])}</TableCell>
                <TableCell>{fmtTime(r["Hora estimada de llegada"])}</TableCell>
                <TableCell>{fmtTime(r.gestio?.HCheckInConf)}</TableCell>
                <TableCell className="font-medium">{r["Referencia"] ?? "—"}</TableCell>
                <TableCell>{r["Habitaciones"] ?? "—"}</TableCell>
                <TableCell>{r["Huéspedes"] ?? "—"}</TableCell>
                <TableCell>{r["Teléfono"] ?? "—"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={!!r.gestio?.ReadyCheckIn}
                    disabled={toggleM.isPending || !canEditCheckins}
                    onCheckedChange={(v) => toggleM.mutate({ numero: r["Número"], value: v })}
                  />
                </TableCell>
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
        readOnly={!canEditCheckins}
      />
    </AppShell>
  );
}