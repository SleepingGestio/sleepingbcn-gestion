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
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import {
  fetchFestivos, deleteFestivo, generarFestivosNacionalesCatalanes,
  type Festivo, type FestivoTipo,
} from "@/lib/pricing";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FestivoDialog } from "@/components/festivo-dialog";

const TIPO_LABEL: Record<FestivoTipo, string> = { nacional_catalan: "Nacional/Catalán", local: "Local" };
const TIPO_STYLES: Record<FestivoTipo, string> = {
  nacional_catalan: "bg-rose-600 text-white hover:bg-rose-600",
  local: "bg-sky-600 text-white hover:bg-sky-600",
};

/**
 * "Festivos" tab of Configuración Tarifas. Festivos are calendar facts, so the page's Grupo does not
 * matter here: only the año does. Fetches its own data.
 */
export function FestivosTab({ anio }: { anio: number }) {
  const { canEdit } = usePermissions();
  const canEditTarifas = canEdit("pricing_temporadas");
  const q = useQuery({ queryKey: ["pricing-festivos"], queryFn: fetchFestivos });

  const [dialog, setDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Festivo | null>(null);
  const [generating, setGenerating] = useState(false);
  const colSpan = canEditTarifas ? 4 : 3;

  const festivos = useMemo(
    () => (q.data ?? []).filter((f) => f.fecha.startsWith(`${anio}-`)).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [q.data, anio],
  );

  async function handleGenerar() {
    setGenerating(true);
    try {
      const n = await generarFestivosNacionalesCatalanes(anio);
      toast.success(`${n} festivos nacionales/catalanes generados o actualizados en ${anio}`);
      await q.refetch();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setGenerating(false);
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
            <Sparkles className="h-4 w-4 mr-1" /> Generar nacionales/catalanes
          </Button>
          <Button size="sm" onClick={() => setDialog(true)}>
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
                    <div className="flex justify-end">
                      {f.tipo === "local" ? (
                        <Button size="sm" variant="outline" onClick={() => setDeleteTarget(f)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                        </Button>
                      ) : (
                        // Allowed, but kept low-key: nacional/catalán ones come back when regenerated.
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Eliminar (volverá a aparecer al generar los festivos del año)"
                          onClick={() => setDeleteTarget(f)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
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

      {dialog && <FestivoDialog anio={anio} onClose={() => setDialog(false)} onSaved={() => q.refetch()} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleteTarget?.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.tipo === "nacional_catalan"
                ? "Es un festivo nacional/catalán: volverá a aparecer si generas de nuevo los festivos del año. "
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
