import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchReservas, todayISO } from "@/lib/reservas";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReservaDetail } from "@/components/reserva-detail";
import { EstadoBadge } from "@/components/estado-badge";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/checkins")({
  component: CheckinsPage,
});

function CheckinsPage() {
  const today = todayISO();
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["checkins", today],
    queryFn: () => fetchReservas({ from: today, to: today, estado: "Confirmada" }),
  });

  return (
    <AppShell title={`Check-ins de hoy · ${today}`}>
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hora</TableHead>
              <TableHead>Huésped</TableHead>
              <TableHead>Apartamento</TableHead>
              <TableHead>Pers.</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Listo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!q.isLoading && (q.data?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay check-ins hoy</TableCell></TableRow>
            )}
            {q.data?.map((r) => (
              <TableRow key={r["Número"]} className="cursor-pointer" onClick={() => setSelected(r["Número"])}>
                <TableCell className="font-mono">{r.gestio?.HCheckInConf ?? "—"}</TableCell>
                <TableCell className="font-medium">{r["Referencia"] ?? "—"}</TableCell>
                <TableCell>{r["Habitaciones"] ?? "—"}</TableCell>
                <TableCell>{r["Huéspedes"] ?? "—"}</TableCell>
                <TableCell>{r["Teléfono"] ?? "—"}</TableCell>
                <TableCell>
                  {r.gestio?.ReadyCheckIn
                    ? <Badge>Listo</Badge>
                    : <Badge variant="outline">Pendiente</Badge>}
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