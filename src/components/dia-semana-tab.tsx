import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import {
  fetchDiaSemanaPeriodos, deleteDiaSemanaPeriodo, findCoverageGaps,
  type DiaSemanaPeriodo, type TemporadaAplicaA,
} from "@/lib/pricing";
import { addDaysISO, fmtDate } from "@/lib/format";
import { SortHeader } from "@/components/sort-header";
import { DiaSemanaPeriodoDialog } from "@/components/dia-semana-periodo-dialog";

type SortKey = "fechas" | "entresemana" | "finsemana";

/** "Días de la semana" tab of Configuración Tarifas. Fetches its own data. */
export function DiaSemanaTab({ anio, aplicaA }: { anio: number; aplicaA: TemporadaAplicaA }) {
  const { canEdit } = usePermissions();
  const canEditTarifas = canEdit("pricing_temporadas");
  const q = useQuery({ queryKey: ["pricing-dia-semana-periodos"], queryFn: fetchDiaSemanaPeriodos });

  const [dialog, setDialog] = useState<{ id: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DiaSemanaPeriodo | null>(null);
  const [gaps, setGaps] = useState<{ desde: string; hasta: string }[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("fechas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const colSpan = canEditTarifas ? 4 : 3;

  const all = useMemo(() => q.data ?? [], [q.data]);
  const periodos = useMemo(() => {
    const pick = (p: DiaSemanaPeriodo) => {
      switch (sortKey) {
        case "fechas": return p.fecha_inicio;
        case "entresemana": return p.coef_entresemana;
        case "finsemana": return p.coef_finsemana;
      }
    };
    return all.filter((p) => p.anio === anio && p.aplica_a === aplicaA).sort((a, b) => {
      const av = pick(a), bv = pick(b);
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? c : -c;
    });
  }, [all, anio, aplicaA, sortKey, sortDir]);

  // A new period starts the day after the latest existing one, or Jan 1 when there is none.
  const defaultInicio = useMemo(() => {
    const latestFin = periodos.reduce((max, p) => (p.fecha_fin > max ? p.fecha_fin : max), "");
    return latestFin ? addDaysISO(latestFin, 1) : `${anio}-01-01`;
  }, [periodos, anio]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteDiaSemanaPeriodo(deleteTarget.id);
      toast.success("Período eliminado");
      q.refetch();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <div className="flex justify-end gap-2 mb-4">
        <Button size="sm" variant="outline" onClick={() => setGaps(findCoverageGaps(periodos, anio))}>
          <CalendarCheck className="h-4 w-4 mr-1" /> Comprobar cobertura
        </Button>
        {canEditTarifas && (
          <Button size="sm" onClick={() => setDialog({ id: null })}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo periodo
          </Button>
        )}
      </div>
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader label="Fechas" active={sortKey === "fechas"} dir={sortDir} onClick={() => toggleSort("fechas")} /></TableHead>
              <TableHead><SortHeader label="Entre semana" active={sortKey === "entresemana"} dir={sortDir} onClick={() => toggleSort("entresemana")} /></TableHead>
              <TableHead><SortHeader label="Fin de semana" active={sortKey === "finsemana"} dir={sortDir} onClick={() => toggleSort("finsemana")} /></TableHead>
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
            {!q.isLoading && !q.error && periodos.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  Sin períodos
                </TableCell>
              </TableRow>
            )}
            {periodos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap">{fmtDate(p.fecha_inicio)} – {fmtDate(p.fecha_fin)}</TableCell>
                <TableCell>{p.coef_entresemana}</TableCell>
                <TableCell>{p.coef_finsemana}</TableCell>
                {canEditTarifas && (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDialog({ id: p.id })}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(p)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Eliminar
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
        <DiaSemanaPeriodoDialog
          key={dialog.id ?? "nuevo"}
          periodo={dialog.id ? all.find((p) => p.id === dialog.id) ?? null : null}
          defaultInicio={defaultInicio}
          anio={anio}
          aplicaA={aplicaA}
          onClose={() => setDialog(null)}
          onSaved={() => q.refetch()}
        />
      )}

      <Dialog open={gaps !== null} onOpenChange={(o) => !o && setGaps(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cobertura {anio} · {aplicaA === "city" ? "City" : "Rural"}</DialogTitle>
            <DialogDescription className="sr-only">Resultado de la comprobación de cobertura del año</DialogDescription>
          </DialogHeader>
          {gaps?.length === 0 ? (
            <p className="text-sm">Todo el año está cubierto por algún período</p>
          ) : (
            <ul className="text-sm space-y-1">
              {gaps?.map((g) => (
                <li key={g.desde}>Sin período asignado: {fmtDate(g.desde)} – {fmtDate(g.hasta)}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGaps(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar este período?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el período {deleteTarget ? `${fmtDate(deleteTarget.fecha_inicio)} – ${fmtDate(deleteTarget.fecha_fin)}` : ""}. Esta acción no se puede deshacer.
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
