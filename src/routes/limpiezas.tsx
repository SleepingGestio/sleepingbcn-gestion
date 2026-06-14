import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { fetchReservas, todayISO } from "@/lib/reservas";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReservaDetail } from "@/components/reserva-detail";
import { supabase } from "@/integrations/supabase/client";
import type { Reserva, ReservaGestio, ReservaKB } from "@/lib/types";
import { useQuery as useQuery2 } from "@tanstack/react-query";
import { fetchLimpiadores } from "@/lib/catalogos";
import { fullName } from "@/lib/types";
import { EstadoBadge } from "@/components/estado-badge";
import { upsertGestio } from "@/lib/reservas";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

async function fetchSalidasHoy(): Promise<Reserva[]> {
  const today = todayISO();
  const { data: kb, error } = await supabase.from("reservas_kb").select("*").eq("Check-out", today);
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

  return (
    <AppShell title={`Limpiezas de hoy · ${todayISO()}`}>
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Apartamento</TableHead>
              <TableHead>Huésped saliente</TableHead>
              <TableHead>Limpiador</TableHead>
              <TableHead>En limpieza</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!q.isLoading && (q.data?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin limpiezas hoy</TableCell></TableRow>
            )}
            {q.data?.map((r) => (
              <TableRow key={r["Número"]} className="cursor-pointer" onClick={() => setSelected(r["Número"])}>
                <TableCell className="font-medium">{r["Habitaciones"] ?? "—"}</TableCell>
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