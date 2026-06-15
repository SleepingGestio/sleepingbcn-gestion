import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { fetchReservas, upsertGestio } from "@/lib/reservas";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReservaDetail } from "@/components/reserva-detail";
import { fetchLimpiadores } from "@/lib/catalogos";
import { fullName } from "@/lib/types";
import { EstadoBadge } from "@/components/estado-badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { DateRangePicker, todayRange } from "@/components/date-range-picker";
import { ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/limpiezas")({
  component: LimpiezasPage,
});

type SortKey = "checkout" | "limpiador";

function LimpiezasPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState(todayRange);
  const [sortKey, setSortKey] = useState<SortKey>("checkout");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const q = useQuery({
    queryKey: ["limpiezas", range.from, range.to],
    queryFn: () =>
      fetchReservas({
        from: range.from,
        to: range.to,
        estado: "Check-in realizado",
        dateField: "Check-out",
      }),
  });
  const limpiadoresQ = useQuery({ queryKey: ["limpiadores"], queryFn: fetchLimpiadores });

  const toggleM = useMutation({
    mutationFn: async ({ numero, value }: { numero: string; value: boolean }) =>
      upsertGestio({ "Número": numero, EnLimpieza: value }),
    onSuccess: () => { q.refetch(); },
    onError: (e) => toast.error("Error: " + (e as Error).message),
  });

  const nombreLimp = (id: number | null | undefined) =>
    id == null ? null : (() => {
      const p = limpiadoresQ.data?.find((x) => x.id_persona === id);
      return p ? fullName(p) : `#${id}`;
    })();

  const sorted = useMemo(() => {
    const arr = [...(q.data ?? [])];
    arr.sort((a, b) => {
      let av = "", bv = "";
      if (sortKey === "checkout") {
        av = a["Check-out"] ?? "";
        bv = b["Check-out"] ?? "";
      } else {
        av = nombreLimp(a.gestio?.PersLImpAsig) ?? "";
        bv = nombreLimp(b.gestio?.PersLImpAsig) ?? "";
      }
      const c = av.localeCompare(bv);
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [q.data, sortKey, sortDir, limpiadoresQ.data]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  return (
    <AppShell title="Limpiezas">
      <div className="mb-4 flex items-center gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <span className="text-sm text-muted-foreground">
          {q.data?.length ?? 0} estancia(s) en curso
        </span>
      </div>
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Apartamento</TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1" onClick={() => toggleSort("checkout")}>
                  Check-out <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Llegada (KB)</TableHead>
              <TableHead>Llegada (conf.)</TableHead>
              <TableHead>Salida (KB)</TableHead>
              <TableHead>Salida (conf.)</TableHead>
              <TableHead>Huésped</TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1" onClick={() => toggleSort("limpiador")}>
                  Limpiador <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>En limpieza</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!q.isLoading && sorted.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Sin estancias en curso en el rango</TableCell></TableRow>
            )}
            {sorted.map((r) => (
              <TableRow key={r["Número"]} className="cursor-pointer" onClick={() => setSelected(r["Número"])}>
                <TableCell className="font-medium">{r["Habitaciones"] ?? "—"}</TableCell>
                <TableCell>{r["Check-out"] ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r["Hora estimada de llegada"] ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.gestio?.HCheckInConf ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r["Hora estimada de salida"] ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.gestio?.HCheckOutConf ?? "—"}</TableCell>
                <TableCell>{r["Referencia"] ?? "—"}</TableCell>
                <TableCell>{nombreLimp(r.gestio?.PersLImpAsig) ?? <span className="text-muted-foreground">Sin asignar</span>}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={!!r.gestio?.EnLimpieza}
                    disabled={toggleM.isPending}
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
      />
    </AppShell>
  );
}