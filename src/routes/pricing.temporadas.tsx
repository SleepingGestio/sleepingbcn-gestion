import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Plus } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchTemporadas, type Temporada } from "@/lib/pricing";
import { fmtDate } from "@/lib/format";
import { AplicaABadge } from "@/components/pricing-badges";
import { SortHeader } from "@/components/sort-header";
import { TemporadaDialog } from "@/components/temporada-dialog";

type SortKey = "aplica_a" | "codigo" | "nombre" | "coeficiente" | "fechas";

export const Route = createFileRoute("/pricing/temporadas")({
  component: TemporadasPage,
});

function TemporadasPage() {
  const { canEdit } = usePermissions();
  const canEditTemporadas = canEdit("pricing_temporadas");

  const [dialog, setDialog] = useState<{ temporada: Temporada | null } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("aplica_a");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const q = useQuery({ queryKey: ["pricing-temporadas"], queryFn: fetchTemporadas });
  const colSpan = canEditTemporadas ? 6 : 5;

  const temporadas = useMemo(() => {
    const pick = (t: Temporada) => {
      switch (sortKey) {
        case "aplica_a": return t.aplica_a;
        case "codigo": return t.codigo;
        case "nombre": return t.nombre;
        case "coeficiente": return t.coeficiente;
        case "fechas": return t.fecha_inicio;
      }
    };
    return [...(q.data ?? [])].sort((a, b) => {
      const av = pick(a), bv = pick(b);
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? c : -c;
    });
  }, [q.data, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  return (
    <AppShell title="Temporadas">
      {canEditTemporadas && (
        <div className="flex justify-end mb-4">
          <Button size="sm" onClick={() => setDialog({ temporada: null })}>
            <Plus className="h-4 w-4 mr-1" /> Nueva temporada
          </Button>
        </div>
      )}
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader label="Aplica a" active={sortKey === "aplica_a"} dir={sortDir} onClick={() => toggleSort("aplica_a")} /></TableHead>
              <TableHead><SortHeader label="Código" active={sortKey === "codigo"} dir={sortDir} onClick={() => toggleSort("codigo")} /></TableHead>
              <TableHead><SortHeader label="Nombre" active={sortKey === "nombre"} dir={sortDir} onClick={() => toggleSort("nombre")} /></TableHead>
              <TableHead><SortHeader label="Coeficiente" active={sortKey === "coeficiente"} dir={sortDir} onClick={() => toggleSort("coeficiente")} /></TableHead>
              <TableHead><SortHeader label="Fechas" active={sortKey === "fechas"} dir={sortDir} onClick={() => toggleSort("fechas")} /></TableHead>
              {canEditTemporadas && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {q.error && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-destructive">
                  {(q.error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!q.isLoading && !q.error && temporadas.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  Sin temporadas
                </TableCell>
              </TableRow>
            )}
            {temporadas.map((t) => (
              <TableRow key={t.id}>
                <TableCell><AplicaABadge aplicaA={t.aplica_a} /></TableCell>
                <TableCell className="font-medium">{t.codigo}</TableCell>
                <TableCell>{t.nombre}</TableCell>
                <TableCell>{t.coeficiente}</TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(t.fecha_inicio)} – {fmtDate(t.fecha_fin)}</TableCell>
                {canEditTemporadas && (
                  <TableCell>
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => setDialog({ temporada: t })}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {dialog && (
        <TemporadaDialog
          key={dialog.temporada?.id ?? "nueva"}
          temporada={dialog.temporada}
          onClose={() => setDialog(null)}
          onSaved={() => q.refetch()}
        />
      )}
    </AppShell>
  );
}
