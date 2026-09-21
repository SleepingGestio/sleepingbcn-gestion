import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Globe, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import {
  fetchFestivos, deleteFestivo, generarFestivosNacionalYCatalan, generarFestivosComunidadesEInternacionales,
  type Festivo, type FestivoTipo,
} from "@/lib/pricing";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FestivoDialog } from "@/components/festivo-dialog";

const TIPO_LABEL: Record<FestivoTipo, string> = {
  nacional: "Nacional",
  catalan: "Catalán",
  comunidad_otras: "Otra comunidad",
  internacional: "Internacional",
  local: "Local",
};
const TIPO_STYLES: Record<FestivoTipo, string> = {
  nacional: "bg-rose-600 text-white hover:bg-rose-600",
  catalan: "bg-amber-600 text-white hover:bg-amber-600",
  comunidad_otras: "bg-violet-600 text-white hover:bg-violet-600",
  internacional: "bg-teal-600 text-white hover:bg-teal-600",
  local: "bg-sky-600 text-white hover:bg-sky-600",
};

/** Tipos that a "Generar" button creates (and would re-create if deleted). "local" ones are added by hand,
 * apart from Barcelona's Segunda Pascua, so they keep the normal delete button. */
const esGenerado = (tipo: FestivoTipo) => tipo !== "local";

/**
 * "Festivos" tab of Configuración Tarifas. Festivos are calendar facts, so the page's Grupo does not
 * matter here: only the año does. Fetches its own data.
 */
export function FestivosTab({ anio }: { anio: number }) {
  const { canEdit } = usePermissions();
  const canEditTarifas = canEdit("pricing_temporadas");
  const q = useQuery({ queryKey: ["pricing-festivos"], queryFn: fetchFestivos });

  const [dialog, setDialog] = useState<{ id: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Festivo | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingOtros, setGeneratingOtros] = useState(false);
  const colSpan = canEditTarifas ? 4 : 3;

  const festivos = useMemo(
    () => (q.data ?? []).filter((f) => f.fecha.startsWith(`${anio}-`)).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [q.data, anio],
  );

  async function handleGenerar() {
    setGenerating(true);
    try {
      const n = await generarFestivosNacionalYCatalan(anio);
      toast.success(`${n} festivos nacionales y catalanes generados o actualizados en ${anio}`);
      await q.refetch();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerarOtros() {
    setGeneratingOtros(true);
    try {
      const n = await generarFestivosComunidadesEInternacionales(anio);
      toast.success(`${n} festivos de comunidades e internacionales generados o actualizados en ${anio}`);
      await q.refetch();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setGeneratingOtros(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteFestivo(deleteTarget.id);
      toast.success("Festivo eliminado");
      q.refetch();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      {canEditTarifas && (
        <div className="flex justify-end gap-2 mb-4">
          <Button size="sm" variant="outline" onClick={handleGenerar} disabled={generating}>
            <Sparkles className="h-4 w-4 mr-1" /> Generar nacionales y catalanes
          </Button>
          <Button size="sm" variant="outline" onClick={handleGenerarOtros} disabled={generatingOtros}>
            <Globe className="h-4 w-4 mr-1" /> Generar comunidades/internacionales
          </Button>
          <Button size="sm" onClick={() => setDialog({ id: null })}>
            <Plus className="h-4 w-4 mr-1" /> Añadir festivo local
          </Button>
        </div>
      )}
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              {canEditTarifas && <TableHead className="text-right">Acciones</TableHead>}
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
            {!q.isLoading && !q.error && festivos.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  Sin festivos en {anio}
                </TableCell>
              </TableRow>
            )}
            {festivos.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="whitespace-nowrap">{fmtDate(f.fecha)}</TableCell>
                <TableCell>{f.nombre}</TableCell>
                <TableCell>
                  <Badge className={cn("border-transparent", TIPO_STYLES[f.tipo])}>{TIPO_LABEL[f.tipo]}</Badge>
                </TableCell>
                {canEditTarifas && (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDialog({ id: f.id })}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      {esGenerado(f.tipo) ? (
                        // Allowed, but kept low-key: generated ones come back when the año is regenerated.
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Eliminar (volverá a aparecer al generar los festivos del año)"
                          onClick={() => setDeleteTarget(f)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setDeleteTarget(f)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {dialog && (
        <FestivoDialog
          key={dialog.id ?? "nuevo"}
          festivo={dialog.id ? (q.data ?? []).find((f) => f.id === dialog.id) ?? null : null}
          anio={anio}
          onClose={() => setDialog(null)}
          onSaved={() => q.refetch()}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleteTarget?.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && esGenerado(deleteTarget.tipo)
                ? "Es un festivo generado: volverá a aparecer si generas de nuevo los festivos del año. "
                : ""}
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
