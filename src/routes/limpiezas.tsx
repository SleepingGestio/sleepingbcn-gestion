import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchReservas, todayISO } from "@/lib/reservas";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReservaDetail } from "@/components/reserva-detail";
import { supabase } from "@/integrations/supabase/client";
import type { Reserva, ReservaGestio, ReservaKB } from "@/lib/types";
import { useQuery as useQuery2 } from "@tanstack/react-query";
import { fetchLimpiadores } from "@/lib/catalogos";

async function fetchSalidasHoy(): Promise<Reserva[]> {
  const today = todayISO();
  const { data: kb, error } = await supabase.from("reservas_kb").select("*").eq("Salida", today);
  if (error) throw error;
  const nums = (kb ?? []).map((r) => (r as ReservaKB)["Número"]);
  if (!nums.length) return [];
  const { data: gestio } = await supabase.from("reservas_gestio").select("*").in("Número", nums);
  const map = new Map<string, ReservaGestio>();
  (gestio ?? []).forEach((g) => map.set((g as ReservaGestio)["Número"], g as ReservaGestio));
  return (kb ?? []).map((r) => ({ ...(r as ReservaKB), gestio: map.get((r as ReservaKB)["Número"]) ?? null }));
}

export const Route = createFileRoute("/limpiezas")({
  component: LimpiezasPage,
});

function LimpiezasPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["limpiezas-hoy"], queryFn: fetchSalidasHoy });
  const limpiadoresQ = useQuery2({ queryKey: ["limpiadores"], queryFn: fetchLimpiadores });
  const nombreLimp = (id: number | null | undefined) =>
    id == null ? null : limpiadoresQ.data?.find((p) => p.id_persona === id)?.nombre ?? `#${id}`;

  return (
    <AppShell title={`Limpiezas de hoy · ${todayISO()}`}>
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Apartamento</TableHead>
              <TableHead>Huésped saliente</TableHead>
              <TableHead>Limpiador</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!q.isLoading && (q.data?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sin limpiezas hoy</TableCell></TableRow>
            )}
            {q.data?.map((r) => (
              <TableRow key={r["Número"]} className="cursor-pointer" onClick={() => setSelected(r["Número"])}>
                <TableCell className="font-medium">{r["Apartamento"] ?? "—"}</TableCell>
                <TableCell>{r["Huésped"] ?? "—"}</TableCell>
                <TableCell>{nombreLimp(r.gestio?.PersLImpAsig) ?? <span className="text-muted-foreground">Sin asignar</span>}</TableCell>
                <TableCell>
                  {r.gestio?.ReadyCheckIn
                    ? <Badge>Limpio</Badge>
                    : <Badge variant="outline">Pendiente</Badge>}
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
      />
    </AppShell>
  );
}