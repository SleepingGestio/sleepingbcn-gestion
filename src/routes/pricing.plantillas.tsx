import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Plus } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchPlantillas, type EventoPeriodicidad, type Plantilla } from "@/lib/pricing";
import { CategoriaBadge, AplicaABadge } from "@/components/pricing-badges";
import { PlantillaEditDialog } from "@/components/plantilla-edit-dialog";
import { PlantillaCreateDialog } from "@/components/plantilla-create-dialog";
import { SortHeader } from "@/components/sort-header";

type SortKey = "nombre" | "categoria" | "aplica_a" | "periodicidad" | "activo" | "fuentes";

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
  const [creating, setCreating] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const q = useQuery({ queryKey: ["pricing-plantillas"], queryFn: fetchPlantillas });
  const editing = (q.data ?? []).find((p) => p.id === editingId) ?? null;
  const colSpan = canEditPlantillas ? 7 : 6;

  const plantillas = useMemo(() => {
    const pick = (p: Plantilla) => {
      switch (sortKey) {
        case "nombre": return p.nombre;
        case "categoria": return p.categoria;
        case "aplica_a": return p.aplica_a;
        case "periodicidad": return p.periodicidad;
        case "activo": return p.activo ? 1 : 0;
        case "fuentes": return p.plantillas_fuentes.length;
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
    <AppShell title="Eventos-plantillas">
      {canEditPlantillas && (
        <div className="flex justify-end mb-4">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo evento
          </Button>
        </div>
      )}
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader label="Nombre" active={sortKey === "nombre"} dir={sortDir} onClick={() => toggleSort("nombre")} /></TableHead>
              <TableHead><SortHeader label="Categoría" active={sortKey === "categoria"} dir={sortDir} onClick={() => toggleSort("categoria")} /></TableHead>
              <TableHead><SortHeader label="Aplica a" active={sortKey === "aplica_a"} dir={sortDir} onClick={() => toggleSort("aplica_a")} /></TableHead>
              <TableHead><SortHeader label="Periodicidad" active={sortKey === "periodicidad"} dir={sortDir} onClick={() => toggleSort("periodicidad")} /></TableHead>
              <TableHead><SortHeader label="Activo" active={sortKey === "activo"} dir={sortDir} onClick={() => toggleSort("activo")} /></TableHead>
              <TableHead><SortHeader label="Fuentes" active={sortKey === "fuentes"} dir={sortDir} onClick={() => toggleSort("fuentes")} /></TableHead>
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

      {creating && (
        <PlantillaCreateDialog
          onClose={() => setCreating(false)}
          onSaved={() => q.refetch()}
        />
      )}

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
