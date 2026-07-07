import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fetchLimpiadores } from "@/lib/catalogos";
import { DateRangePicker, todayRange } from "@/components/date-range-picker";
import { fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { GroupFilterChips, useGroupFilter } from "@/components/group-filter";
import { LimpiezaPopover, type Limpieza } from "@/components/limpieza-popover";
import { EstadoLimpiezaBadge } from "@/components/estado-limpieza-badge";
import { TimeBadge } from "@/components/time-badge";
import { SortHeader } from "@/components/sort-header";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatHHMM } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Sofa, Pencil } from "lucide-react";

export const Route = createFileRoute("/limpiezas")({
  component: LimpiezasAsignadasPage,
});

type LimpiezaExt = Limpieza & {
  iniciada_en?: string | null;
  finalizada_en?: string | null;
};

type AptExtra = {
  id_apt: number;
  camas_fijas: number | null;
  tiene_sofa_cama: boolean | null;
};

async function fetchLimpiezasAsignadas(fechaFrom: string, fechaTo: string): Promise<LimpiezaExt[]> {
  const { data, error } = await supabase
    .from("limpiezas")
    .select("*")
    .not("worker", "is", null)
    .gte("fecha_limpieza", fechaFrom)
    .lte("fecha_limpieza", fechaTo);
  if (error) throw error;
  return (data ?? []) as LimpiezaExt[];
}

async function fetchAptsExtra(): Promise<AptExtra[]> {
  const { data, error } = await supabase
    .from("apartamentos")
    .select("id_apt, camas_fijas, tiene_sofa_cama");
  if (error) throw error;
  return (data ?? []) as AptExtra[];
}

type ResvLite = { guests: number | null; checkIn: string | null };

async function fetchReservasLite(numeros: string[]): Promise<Map<string, ResvLite>> {
  const m = new Map<string, ResvLite>();
  if (numeros.length === 0) return m;
  const { data, error } = await supabase
    .from("reservas_kb")
    .select('"Número","Huéspedes","Check in"')
    .in("Número", numeros);
  if (error) throw error;
  for (const r of (data ?? []) as { Número: string; "Huéspedes": number | null; "Check in": string | null }[]) {
    m.set(r["Número"], { guests: r["Huéspedes"] ?? null, checkIn: r["Check in"] ?? null });
  }
  return m;
}

function shortAptName(name: string): string {
  return name
    .replace(/^\s*(Apartamento|Apart\.?)\s+/i, "")
    .replace(/\s+(Apartamento|Apart\.?)\s*$/i, "")
    .trim() || name;
}

function elapsedHours(iniciada: string | null | undefined, finalizada: string | null | undefined): number | null {
  if (!iniciada || !finalizada) return null;
  const a = new Date(iniciada).getTime();
  const b = new Date(finalizada).getTime();
  if (!isFinite(a) || !isFinite(b) || b <= a) return null;
  return (b - a) / 3_600_000;
}

type SortKey = "apartamento" | "limpiador" | "estado";

function LimpiezasAsignadasPage() {
  const [range, setRange] = useState(todayRange);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editing, setEditing] = useState<LimpiezaExt | null>(null);
  const [editLoadKey, setEditLoadKey] = useState(0);

  const limpiadoresQ = useQuery({ queryKey: ["limpiadores"], queryFn: fetchLimpiadores });
  const filter = useGroupFilter();
  const aptExtraQ = useQuery({ queryKey: ["apartamentos_extra_min"], queryFn: fetchAptsExtra });

  const q = useQuery({
    queryKey: ["limpiezas_asignadas", range.from, range.to],
    queryFn: () => fetchLimpiezasAsignadas(range.from, range.to),
  });

  const numeros = useMemo(() => {
    const s = new Set<string>();
    for (const l of q.data ?? []) {
      if (l.numero_reserva) s.add(l.numero_reserva);
      if (l.proxima_reserva_numero) s.add(l.proxima_reserva_numero);
    }
    return Array.from(s);
  }, [q.data]);

  const reservasQ = useQuery({
    queryKey: ["limpiezas_asignadas_reservas", numeros.sort().join(",")],
    queryFn: () => fetchReservasLite(numeros),
    enabled: numeros.length > 0,
  });

  const aptById = useMemo(() => {
    const m = new Map<number, { nombre: string; camas_fijas: number | null; tiene_sofa_cama: boolean | null; id_grupo: number }>();
    const extras = new Map((aptExtraQ.data ?? []).map((a) => [a.id_apt, a]));
    for (const a of filter.aptsQ.data ?? []) {
      const e = extras.get(a.id_apt);
      m.set(a.id_apt, {
        nombre: a.nombre,
        camas_fijas: e?.camas_fijas ?? null,
        tiene_sofa_cama: e?.tiene_sofa_cama ?? null,
        id_grupo: a.id_grupo,
      });
    }
    return m;
  }, [filter.aptsQ.data, aptExtraQ.data]);

  const workerLabel = (id: number | null): string => {
    if (id == null) return "—";
    const p = limpiadoresQ.data?.find((x) => x.id_persona === id);
    if (!p) return `#${id}`;
    const full = [p.nombre, p.apellidos].filter(Boolean).join(" ").trim();
    return p.codigo ? `${p.codigo} · ${full || `#${id}`}` : full || `#${id}`;
  };

  const rows = useMemo(() => {
    const arr = (q.data ?? []).filter((l) => filter.allowedAptIds.has(l.id_apt));
    const dateAsc = (a: LimpiezaExt, b: LimpiezaExt) =>
      a.fecha_limpieza.localeCompare(b.fecha_limpieza);
    if (!sortKey) {
      arr.sort(dateAsc);
      return arr;
    }
    const pick = (l: LimpiezaExt): string => {
      switch (sortKey) {
        case "apartamento":
          return aptById.get(l.id_apt)?.nombre ?? "";
        case "limpiador":
          return workerLabel(l.worker);
        case "estado":
          return l.estado ?? "";
      }
    };
    arr.sort((a, b) => {
      const c = String(pick(a)).localeCompare(String(pick(b)));
      if (c !== 0) return sortDir === "asc" ? c : -c;
      return dateAsc(a, b);
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, filter.allowedAptIds, aptById, sortKey, sortDir, limpiadoresQ.data]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const openEdit = (l: LimpiezaExt) => {
    setEditing(l);
    setEditLoadKey((k) => k + 1);
  };

  const editingApt = editing ? aptById.get(editing.id_apt) : null;

  return (
    <AppShell title="Limpiezas asignadas">
      <div className="mb-4 flex items-center gap-3">
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      <GroupFilterChips {...filter} />
      <TooltipProvider delayDuration={200}>
        <Card className="overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>
                  <SortHeader
                    label="Apartamento"
                    active={sortKey === "apartamento"}
                    dir={sortDir}
                    onClick={() => toggleSort("apartamento")}
                  />
                </TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>
                  <SortHeader
                    label="Limpiador"
                    active={sortKey === "limpiador"}
                    dir={sortDir}
                    onClick={() => toggleSort("limpiador")}
                  />
                </TableHead>
                <TableHead>Huéspedes</TableHead>
                <TableHead title="Sofá cama necesario">Sofá cama</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead>Entra</TableHead>
                <TableHead>Horas</TableHead>
                <TableHead>
                  <SortHeader
                    label="Estado"
                    active={sortKey === "estado"}
                    dir={sortDir}
                    onClick={() => toggleSort("estado")}
                  />
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    Sin limpiezas asignadas en el rango
                  </TableCell>
                </TableRow>
              )}
              {rows.map((l) => {
                const info = aptById.get(l.id_apt);
                const fullApt = info?.nombre ?? `#${l.id_apt}`;
                const shortApt = shortAptName(fullApt);
                const isSalida = l.tipo === "salida";
                const guests = l.numero_reserva ? reservasQ.data?.get(l.numero_reserva)?.guests ?? null : null;
                const nxt = l.proxima_reserva_numero ? reservasQ.data?.get(l.proxima_reserva_numero) ?? null : null;
                const isNentran = !nxt || nxt.checkIn !== l.fecha_limpieza;
                const needsSofa =
                  !!info?.tiene_sofa_cama &&
                  guests != null &&
                  info.camas_fijas != null &&
                  guests > info.camas_fijas;
                const hours =
                  l.estado === "finalizada" ? elapsedHours(l.iniciada_en, l.finalizada_en) : null;
                return (
                  <TableRow key={l.id_limpieza}>
                    <TableCell>{fmtDate(l.fecha_limpieza)}</TableCell>
                    <TableCell className="font-medium">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{shortApt}</span>
                        </TooltipTrigger>
                        <TooltipContent>{fullApt}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-block rounded px-2 py-0.5 text-[11px] font-semibold",
                          isSalida
                            ? "bg-slate-200 text-slate-800"
                            : "bg-fuchsia-200 text-fuchsia-900",
                        )}
                      >
                        {isSalida ? "Limpieza STD" : "Limpieza EXTRA-CR"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="truncate block" title={workerLabel(l.worker)}>
                        {workerLabel(l.worker)}
                      </span>
                    </TableCell>
                    <TableCell>{guests ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      {needsSofa ? (
                        <Sofa className="h-4 w-4 inline-block text-fuchsia-700" />
                      ) : (
                        <span className="text-muted-foreground">·</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TimeBadge time={l.hora_out_time} informed={l.hora_out_informed} size="md" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <TimeBadge time={l.hora_in_time} informed={l.hora_in_informed} size="md" />
                        {isNentran && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-gray-200 text-gray-700">
                            NOENTRAN
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {hours != null ? formatHHMM(hours) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <EstadoLimpiezaBadge estado={l.estado} worker={l.worker} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(l)}
                        title="Editar limpieza"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </TooltipProvider>

      {editing && editingApt && (
        <LimpiezaPopover
          open={!!editing}
          loadKey={editLoadKey}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          apt={{
            id_apt: editing.id_apt,
            nombre: editingApt.nombre,
            camas_fijas: editingApt.camas_fijas,
            tiene_sofa_cama: editingApt.tiene_sofa_cama,
          }}
          fecha={editing.fecha_limpieza}
          existing={editing}
          onSaved={() => {
            q.refetch();
            setEditing(null);
          }}
        />
      )}
    </AppShell>
  );
}