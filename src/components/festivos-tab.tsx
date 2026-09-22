import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchFestivos, deleteFestivo, generarFestivosDelAnio, type Festivo, type FestivoAmbito } from "@/lib/pricing";
import { fmtDate } from "@/lib/format";
import { AMBITO_LIST, AMBITO_LABEL, AMBITO_COLOR } from "@/lib/pricing-styles";
import { FestivoDialog } from "@/components/festivo-dialog";

/** A row whose ámbitos are exactly ["local"] is a manual one; anything else comes from "Generar" (and
 * would come back if the año is regenerated), same distinction the old per-tipo logic made. */
const esGenerado = (ambitos: FestivoAmbito[]) => !(ambitos.length === 1 && ambitos[0] === "local");

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
  const colSpan = 2 + AMBITO_LIST.length + (canEditTarifas ? 1 : 0);

  const festivos = useMemo(
    () => (q.data ?? []).filter((f) => f.fecha.startsWith(`${anio}-`)).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [q.data, anio],
  );

  async function handleGenerar() {
    setGenerating(true);
    try {
      const n = await generarFestivosDelAnio(anio);
      toast.success(`${n} festivos generados o actualizados en ${anio}`);
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
            <Sparkles className="h-4 w-4 mr-1" /> Generar festivos del año
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
              {AMBITO_LIST.map((a) => (
                <TableHead key={a} className="text-center whitespace-nowrap">{AMBITO_LABEL[a]}</TableHead>
              ))}
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
                {AMBITO_LIST.map((a) => (
                  <TableCell key={a} className="text-center">
                    {f.ambitos.includes(a) && (
                      a === "comunidad_otras" && f.detalle ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: AMBITO_COLOR[a] }}
                          />
                          <span className="text-[10px] leading-tight text-muted-foreground max-w-[110px]">
                            {f.detalle}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: AMBITO_COLOR[a] }}
                        />
                      )
                    )}
                  </TableCell>
                ))}
                {canEditTarifas && (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDialog({ id: f.id })}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      {esGenerado(f.ambitos) ? (
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
              {deleteTarget && esGenerado(deleteTarget.ambitos)
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
