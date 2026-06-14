import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReservas } from "@/lib/reservas";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ReservaDetail } from "@/components/reserva-detail";

export const Route = createFileRoute("/reservas")({
  component: ReservasPage,
});

function ReservasPage() {
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("Confirmada");
  const [selected, setSelected] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["reservas", { estado }],
    queryFn: () => fetchReservas({ estado: estado === "all" ? undefined : estado }),
  });

  const filtered = useMemo(() => {
    if (!q.data) return [];
    const s = search.trim().toLowerCase();
    if (!s) return q.data;
    return q.data.filter((r) =>
      [r["Referencia"], r["Número"], r["Habitaciones"]].some((v) => v && String(v).toLowerCase().includes(s)),
    );
  }, [q.data, search]);

  return (
    <AppShell title="Reservas">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
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

      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Habitación</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Pers.</TableHead>
              <TableHead>Portal</TableHead>
              <TableHead>Estado</TableHead>
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
                <TableCell>{r["Check in"] ?? "—"}</TableCell>
                <TableCell>{r["Check-out"] ?? "—"}</TableCell>
                <TableCell>{r["Huéspedes"] ?? "—"}</TableCell>
                <TableCell>{r["Portal"] ?? "—"}</TableCell>
                <TableCell><Badge variant="secondary">{r["Estado"] ?? "—"}</Badge></TableCell>
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