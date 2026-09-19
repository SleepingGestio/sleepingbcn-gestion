import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchPlantillas, type EventoPeriodicidad } from "@/lib/pricing";
import { CategoriaBadge, AplicaABadge } from "@/components/pricing-badges";
import { PlantillaEditDialog } from "@/components/plantilla-edit-dialog";

export const Route = createFileRoute("/pricing/plantillas")({
  component: PlantillasPage,
});

const PERIODICIDAD_LABEL: Record<EventoPeriodicidad, string> = {
  anual: "Anual",
  bianual: "Bianual",
  puntual: "Puntual",
};

function PlantillasPage() {
  const { canEdit } = usePermissions();
  const canEditPlantillas = canEdit("pricing_plantillas");

  const [editingId, setEditingId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["pricing-plantillas"], queryFn: fetchPlantillas });
  const plantillas = q.data ?? [];
  const editing = plantillas.find((p) => p.id === editingId) ?? null;
  const colSpan = canEditPlantillas ? 7 : 6;

  return (
    <AppShell title="Plantillas">
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Aplica a</TableHead>
              <TableHead>Periodicidad</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead>Fuentes</TableHead>
              {canEditPlantillas && <TableHead className="text-right">Acciones</TableHead>}
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
            {!q.isLoading && !q.error && plantillas.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  Sin plantillas
                </TableCell>
              </TableRow>
            )}
            {plantillas.map((p) => {
              const n = p.plantillas_fuentes.length;
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell><CategoriaBadge categoria={p.categoria} /></TableCell>
                  <TableCell><AplicaABadge aplicaA={p.aplica_a} /></TableCell>
                  <TableCell>{PERIODICIDAD_LABEL[p.periodicidad]}</TableCell>
                  <TableCell>
                    {p.activo ? (
                      <Badge>Activo</Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {n === 0 ? (
                      <span className="text-muted-foreground">Sin fuentes</span>
                    ) : (
                      `${n} ${n === 1 ? "fuente" : "fuentes"}`
                    )}
                  </TableCell>
                  {canEditPlantillas && (
                    <TableCell>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => setEditingId(p.id)}>
                          <Pencil className="h-4 w-4 mr-1" /> Editar
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {editing && (
        <PlantillaEditDialog
          key={editing.id}
          plantilla={editing}
          onClose={() => setEditingId(null)}
          onChanged={() => q.refetch()}
        />
      )}
    </AppShell>
  );
}
