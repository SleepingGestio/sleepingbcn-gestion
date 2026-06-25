import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fetchLimpiadores } from "@/lib/catalogos";
import { fullName } from "@/lib/types";
import { DateRangePicker, todayRange } from "@/components/date-range-picker";
import { fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { GroupFilterChips, useGroupFilter } from "@/components/group-filter";
import type { Limpieza } from "@/components/limpieza-popover";

export const Route = createFileRoute("/limpiezas")({
  component: LimpiezasAsignadasPage,
});

async function fetchLimpiezasAsignadas(fechaFrom: string, fechaTo: string): Promise<Limpieza[]> {
  const { data, error } = await supabase
    .from("limpiezas")
    .select("*")
    .not("worker", "is", null)
    .gte("fecha_limpieza", fechaFrom)
    .lte("fecha_limpieza", fechaTo)
    .order("fecha_limpieza", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Limpieza[];
}

function trimHM(s: string | null | undefined): string {
  if (!s) return "—";
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "—";
}

function CheckCell({ on }: { on: boolean | null | undefined }) {
  return on ? <span className="text-emerald-600 font-medium">✓</span> : <span className="text-muted-foreground">·</span>;
}

function LimpiezasAsignadasPage() {
  const [range, setRange] = useState(todayRange);
  const limpiadoresQ = useQuery({ queryKey: ["limpiadores"], queryFn: fetchLimpiadores });
  const filter = useGroupFilter();

  const q = useQuery({
    queryKey: ["limpiezas_asignadas", range.from, range.to],
    queryFn: () => fetchLimpiezasAsignadas(range.from, range.to),
  });

  const aptInfoById = useMemo(() => {
    const m = new Map<number, { nombre: string; grupo: string | null }>();
    const gruposById = new Map((filter.gruposQ.data ?? []).map((g) => [g.id_grupo, g.nombre]));
    for (const a of filter.aptsQ.data ?? []) {
      m.set(a.id_apt, { nombre: a.nombre, grupo: gruposById.get(a.id_grupo) ?? null });
    }
    return m;
  }, [filter.aptsQ.data, filter.gruposQ.data]);

  const workerName = (id: number | null) => {
    if (id == null) return "—";
    const p = limpiadoresQ.data?.find((x) => x.id_persona === id);
    return p ? fullName(p) : `#${id}`;
  };

  const rows = useMemo(() => {
    const arr = (q.data ?? []).filter((l) => filter.allowedAptIds.has(l.id_apt));
    arr.sort((a, b) => {
      const ka = `${a.fecha_limpieza} ${a.hora_out_time ?? ""} ${aptInfoById.get(a.id_apt)?.nombre ?? ""}`;
      const kb = `${b.fecha_limpieza} ${b.hora_out_time ?? ""} ${aptInfoById.get(b.id_apt)?.nombre ?? ""}`;
      return ka.localeCompare(kb);
    });
    return arr;
  }, [q.data, filter.allowedAptIds, aptInfoById]);

  return (
    <AppShell title="Limpiezas asignadas">
      <div className="mb-4 flex items-center gap-3">
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      <GroupFilterChips {...filter} />
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Apartamento</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Limpiador</TableHead>
              <TableHead>Sale</TableHead>
              <TableHead>Entra</TableHead>
              <TableHead title="SFC montar / desmontar">SFC m/d</TableHead>
              <TableHead title="Check-in / Tasas (salida)">CI/Tas</TableHead>
              <TableHead title="Toallas / Sábanas / Básica / Completa (intermedia)">Toa/Sáb/Bás/Com</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
            )}
            {!q.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Sin limpiezas asignadas en el rango</TableCell></TableRow>
            )}
            {rows.map((l) => {
              const info = aptInfoById.get(l.id_apt);
              const isSalida = l.tipo === "salida";
              return (
                <TableRow key={l.id_limpieza}>
                  <TableCell>{fmtDate(l.fecha_limpieza)}</TableCell>
                  <TableCell className="font-medium">{info?.nombre ?? `#${l.id_apt}`}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{info?.grupo ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={isSalida ? "default" : "secondary"}>{l.tipo ?? "—"}</Badge>
                  </TableCell>
                  <TableCell>{workerName(l.worker)}</TableCell>
                  <TableCell>{trimHM(l.hora_out_time)}</TableCell>
                  <TableCell>{trimHM(l.hora_in_time)}</TableCell>
                  <TableCell className="text-center">
                    <CheckCell on={l.sfc_montar} /> / <CheckCell on={l.sfc_desmontar} />
                  </TableCell>
                  <TableCell className="text-center">
                    {isSalida ? (
                      <><CheckCell on={l.check_checkin} /> / <CheckCell on={l.check_tasas} /></>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {!isSalida ? (
                      <>
                        <CheckCell on={l.check_toallas} /> / <CheckCell on={l.check_sabanas} /> /{" "}
                        <CheckCell on={l.check_limpieza_basica} /> / <CheckCell on={l.check_limpieza_completa} />
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{l.estado ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}