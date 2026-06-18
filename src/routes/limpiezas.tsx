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
import { SortHeader } from "@/components/sort-header";
import { fmtDate, fmtTime } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/limpiezas")({
  component: LimpiezasPage,
});

type SortKey = "checkout" | "limpiador" | "salidaKB" | "salidaConf";

function LimpiezasPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState(todayRange);
  const [sortKey, setSortKey] = useState<SortKey>("checkout");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openPop, setOpenPop] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["limpiezas", range.from, range.to],
    queryFn: () =>
      fetchReservas({
        from: range.from,
        to: range.to,
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
      switch (sortKey) {
        case "checkout":
          av = a["Check-out"] ?? ""; bv = b["Check-out"] ?? ""; break;
        case "salidaKB":
          av = a["Hora estimada de salida"] ?? ""; bv = b["Hora estimada de salida"] ?? ""; break;
        case "salidaConf":
          av = a.gestio?.HCheckOutConf ?? ""; bv = b.gestio?.HCheckOutConf ?? ""; break;
        case "limpiador":
          av = nombreLimp(a.gestio?.PersLImpAsig) ?? "";
          bv = nombreLimp(b.gestio?.PersLImpAsig) ?? ""; break;
      }
      const c = av.localeCompare(bv);
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [q.data, sortKey, sortDir, limpiadoresQ.data]);
  const asignarM = useMutation({
    mutationFn: async ({ numero, id }: { numero: string; id: number | null }) =>
      upsertGestio({ "Número": numero, PersLImpAsig: id }),
    onSuccess: () => { q.refetch(); toast.success("Limpiador asignado"); },
    onError: (e) => toast.error("Error: " + (e as Error).message),
  });


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
                <SortHeader label="Check-out" active={sortKey === "checkout"} dir={sortDir} onClick={() => toggleSort("checkout")} />
              </TableHead>
              <TableHead>
                <SortHeader label="Salida (KB)" active={sortKey === "salidaKB"} dir={sortDir} onClick={() => toggleSort("salidaKB")} />
              </TableHead>
              <TableHead>
                <SortHeader label="Salida (conf.)" active={sortKey === "salidaConf"} dir={sortDir} onClick={() => toggleSort("salidaConf")} />
              </TableHead>
              <TableHead>Huésped</TableHead>
              <TableHead>
                <SortHeader label="Limpiador" active={sortKey === "limpiador"} dir={sortDir} onClick={() => toggleSort("limpiador")} />
              </TableHead>
              <TableHead>En limpieza</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!q.isLoading && sorted.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin estancias en curso en el rango</TableCell></TableRow>
            )}
            {sorted.map((r) => (
              <TableRow key={r["Número"]} className="cursor-pointer" onClick={() => setSelected(r["Número"])}>
                <TableCell className="font-medium">{r["Habitaciones"] ?? "—"}</TableCell>
                <TableCell>{fmtDate(r["Check-out"])}</TableCell>
                <TableCell>{fmtTime(r["Hora estimada de salida"])}</TableCell>
                <TableCell>{fmtTime(r.gestio?.HCheckOutConf)}</TableCell>
                <TableCell>{r["Referencia"] ?? "—"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Popover open={openPop === r["Número"]} onOpenChange={(o) => setOpenPop(o ? r["Número"] : null)}>
                    <PopoverTrigger asChild>
                      <button className="rounded px-2 py-1 -mx-2 text-left hover:bg-muted transition-colors w-full">
                        {nombreLimp(r.gestio?.PersLImpAsig) ?? <span className="text-muted-foreground">Sin asignar</span>}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar limpiador…" />
                        <CommandList>
                          <CommandEmpty>Sin resultados</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => { asignarM.mutate({ numero: r["Número"], id: null }); setOpenPop(null); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", r.gestio?.PersLImpAsig == null ? "opacity-100" : "opacity-0")} />
                              Sin asignar
                            </CommandItem>
                            {limpiadoresQ.data?.map((p) => (
                              <CommandItem
                                key={p.id_persona}
                                value={fullName(p)}
                                onSelect={() => { asignarM.mutate({ numero: r["Número"], id: p.id_persona }); setOpenPop(null); }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", r.gestio?.PersLImpAsig === p.id_persona ? "opacity-100" : "opacity-0")} />
                                {fullName(p)}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </TableCell>
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