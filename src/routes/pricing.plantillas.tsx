import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Plus } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchPlantillas, type EventoCategoria, type EventoPeriodicidad, type Plantilla } from "@/lib/pricing";
import { CategoriaBadge, AplicaABadge } from "@/components/pricing-badges";
import { PlantillaEditDialog, CATEGORIA_OPTIONS } from "@/components/plantilla-edit-dialog";
import { FilterField } from "@/components/filter-field";
import { PlantillaCreateDialog } from "@/components/plantilla-create-dialog";
import { SortHeader } from "@/components/sort-header";

type SortKey = "nombre" | "categoria" | "aplica_a" | "periodicidad" | "activo" | "fuentes";

export const Route = createFileRoute("/pricing/plantillas")({
  component: PlantillasPage,
});

const CATEGORIA_FILTER_OPTIONS: { value: "todas" | EventoCategoria; label: string }[] = [
  { value: "todas", label: "Todas" },
  ...CATEGORIA_OPTIONS,
];

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
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [soloMarcadas, setSoloMarcadas] = useState(false);
  const [categoriaFilter, setCategoriaFilter] = useState<"todas" | EventoCategoria>("todas");
  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const q = useQuery({ queryKey: ["pricing-plantillas"], queryFn: fetchPlantillas });
  const editing = (q.data ?? []).find((p) => p.id === editingId) ?? null;
  const colSpan = canEditPlantillas ? 7 : 6;

  // Independent of the other filters, so the queue is always visible regardless of what's shown below.
  const totalFuentesMarcadas = useMemo(
    () => (q.data ?? []).reduce((sum, p) => sum + p.plantillas_fuentes.filter((f) => f.revision_forzada).length, 0),
    [q.data],
  );

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
    return (q.data ?? [])
      .filter((p) => incluirInactivas || p.activo)
      .filter((p) => categoriaFilter === "todas" || p.categoria === categoriaFilter)
      .filter((p) => !soloMarcadas || p.plantillas_fuentes.some((f) => f.revision_forzada))
      .sort((a, b) => {
      const av = pick(a), bv = pick(b);
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? c : -c;
    });
  }, [q.data, sortKey, sortDir, incluirInactivas, categoriaFilter, soloMarcadas]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  return (
    <AppShell title="Eventos-plantillas">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Categoría">
            <Select value={categoriaFilter} onValueChange={(v) => setCategoriaFilter(v as typeof categoriaFilter)}>
              <SelectTrigger className="w-auto min-w-[140px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIA_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <div className="flex items-center gap-2 h-9">
            <Checkbox
              id="incluir-inactivas"
              checked={incluirInactivas}
              onCheckedChange={(v) => setIncluirInactivas(!!v)}
            />
            <Label htmlFor="incluir-inactivas" className="text-sm font-normal cursor-pointer">
              Mostrar inactivas
            </Label>
          </div>
          <div className="flex items-center gap-2 h-9">
            <Checkbox
              id="solo-marcadas"
              checked={soloMarcadas}
              onCheckedChange={(v) => setSoloMarcadas(!!v)}
            />
            <Label htmlFor="solo-marcadas" className="text-sm font-normal cursor-pointer">
              Ver solo marcadas
            </Label>
          </div>
          <span className="text-sm text-muted-foreground">
            {totalFuentesMarcadas} fuente{totalFuentesMarcadas === 1 ? "" : "s"} marcada{totalFuentesMarcadas === 1 ? "" : "s"} para revisar
          </span>
        </div>
        {canEditPlantillas && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo evento
          </Button>
        )}
      </div>
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
