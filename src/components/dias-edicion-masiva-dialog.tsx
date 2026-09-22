import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { upsertAjustesDiaBulk, type Temporada, type TemporadaAplicaA } from "@/lib/pricing";
import type { DiaCalculado } from "@/lib/pricing-calc";

const NO_CAMBIAR = "__no_cambiar__";

/**
 * Bulk version of the day dialog's "Ajustes manuales" section: applies temporada / estancia mínima /
 * precio overrides to every day in `fechas` at once. Every field defaults to "no cambiar" (left out
 * of that day's changes entirely) so the person can touch only the fields they actually want to set.
 * `dias` is the año's already-computed breakdown (`calculo.dias`), used to read each selected day's
 * current precioFinal for the "ajuste relativo" precio mode.
 */
export function DiasEdicionMasivaDialog({
  fechas, aplicaA, temporadas, dias, onClose, onGuardado,
}: {
  fechas: string[];
  aplicaA: TemporadaAplicaA;
  temporadas: Temporada[];
  dias: Map<string, DiaCalculado | null>;
  onClose: () => void;
  onGuardado: () => void | Promise<void>;
}) {
  const anioSel = Number(fechas[0]?.slice(0, 4));
  const temporadasDelAnio = useMemo(
    () => temporadas.filter((t) => t.anio === anioSel && t.aplica_a === aplicaA).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [temporadas, anioSel, aplicaA],
  );

  const [temporadaId, setTemporadaId] = useState<string>(NO_CAMBIAR);

  const [estanciaValor, setEstanciaValor] = useState("");
  const [estanciaQuitar, setEstanciaQuitar] = useState(false);

  const [precioModo, setPrecioModo] = useState<"absoluto" | "relativo">("absoluto");
  const [precioAbsoluto, setPrecioAbsoluto] = useState("");
  const [precioDelta, setPrecioDelta] = useState("");
  const [precioUnidad, setPrecioUnidad] = useState<"€" | "%">("€");
  const [precioQuitar, setPrecioQuitar] = useState(false);

  const [saving, setSaving] = useState(false);

  // Cheap to compute (the días are already in memory): the range of resulting prices for "ajuste
  // relativo", since each selected day's own current price makes the result differ per day.
  const previewPrecios = useMemo(() => {
    if (precioQuitar || precioModo !== "relativo" || precioDelta.trim() === "" || Number.isNaN(Number(precioDelta))) return null;
    const delta = Number(precioDelta);
    const resultados = fechas
      .map((f) => dias.get(f))
      .filter((d): d is DiaCalculado => d != null)
      .map((d) => (precioUnidad === "€" ? Math.round(d.precioFinal + delta) : Math.round(d.precioFinal * (1 + delta / 100))));
    if (resultados.length === 0) return null;
    return { min: Math.min(...resultados), max: Math.max(...resultados) };
  }, [precioModo, precioDelta, precioUnidad, precioQuitar, fechas, dias]);

  const hayCambios =
    temporadaId !== NO_CAMBIAR ||
    estanciaQuitar || estanciaValor.trim() !== "" ||
    precioQuitar ||
    (precioModo === "absoluto" && precioAbsoluto.trim() !== "") ||
    (precioModo === "relativo" && precioDelta.trim() !== "");

  async function handleSubmit() {
    const comunes: Partial<{ temporadaId: string | null; estanciaMinima: number | null; precioManual: number | null }> = {};
    if (temporadaId !== NO_CAMBIAR) comunes.temporadaId = temporadaId;
    if (estanciaQuitar) comunes.estanciaMinima = null;
    else if (estanciaValor.trim() !== "") comunes.estanciaMinima = Number(estanciaValor);

    const rows = fechas
      .map((fecha) => {
        const changes = { ...comunes };
        if (precioQuitar) {
          changes.precioManual = null;
        } else if (precioModo === "absoluto" && precioAbsoluto.trim() !== "") {
          changes.precioManual = Math.round(Number(precioAbsoluto));
        } else if (precioModo === "relativo" && precioDelta.trim() !== "") {
          const dia = dias.get(fecha);
          if (dia) {
            const delta = Number(precioDelta);
            changes.precioManual =
              precioUnidad === "€" ? Math.round(dia.precioFinal + delta) : Math.round(dia.precioFinal * (1 + delta / 100));
          }
        }
        return { fecha, aplicaA, changes };
      })
      .filter((r) => Object.keys(r.changes).length > 0);

    if (rows.length === 0) { toast.error("No hay ningún cambio que aplicar"); return; }

    setSaving(true);
    try {
      await upsertAjustesDiaBulk(rows);
      toast.success(`${rows.length} días actualizados`);
      await onGuardado();
      onClose();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Editar {fechas.length} días</DialogTitle>
          <DialogDescription className="sr-only">Edición masiva de ajustes manuales para los días seleccionados</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Temporada</p>
            <Select value={temporadaId} onValueChange={setTemporadaId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CAMBIAR}>No cambiar</SelectItem>
                {temporadasDelAnio.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.codigo} · {t.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estancia mínima</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="No cambiar"
                value={estanciaValor}
                onChange={(e) => { setEstanciaValor(e.target.value); setEstanciaQuitar(false); }}
                className="h-8 w-28 text-xs"
                disabled={estanciaQuitar}
              />
              <Button
                size="sm" variant={estanciaQuitar ? "default" : "outline"} className="h-8 text-xs"
                onClick={() => { setEstanciaQuitar((v) => !v); setEstanciaValor(""); }}
              >
                Quitar de todos
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Precio</p>
            <div className="flex gap-1.5">
              <Button
                size="sm" variant={!precioQuitar && precioModo === "absoluto" ? "default" : "outline"} className="h-7 flex-1 text-xs"
                onClick={() => { setPrecioModo("absoluto"); setPrecioQuitar(false); }}
              >
                Valor absoluto
              </Button>
              <Button
                size="sm" variant={!precioQuitar && precioModo === "relativo" ? "default" : "outline"} className="h-7 flex-1 text-xs"
                onClick={() => { setPrecioModo("relativo"); setPrecioQuitar(false); }}
              >
                Ajuste relativo
              </Button>
            </div>

            {!precioQuitar && precioModo === "absoluto" && (
              <Input
                type="number"
                placeholder="No cambiar"
                value={precioAbsoluto}
                onChange={(e) => setPrecioAbsoluto(e.target.value)}
                className="h-8 w-28 text-xs"
              />
            )}
            {!precioQuitar && precioModo === "relativo" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="± cantidad"
                  value={precioDelta}
                  onChange={(e) => setPrecioDelta(e.target.value)}
                  className="h-8 w-24 text-xs"
                />
                <div className="flex gap-1">
                  <Button
                    size="sm" variant={precioUnidad === "€" ? "default" : "outline"} className="h-8 w-8 px-0 text-xs"
                    onClick={() => setPrecioUnidad("€")}
                  >
                    €
                  </Button>
                  <Button
                    size="sm" variant={precioUnidad === "%" ? "default" : "outline"} className="h-8 w-8 px-0 text-xs"
                    onClick={() => setPrecioUnidad("%")}
                  >
                    %
                  </Button>
                </div>
              </div>
            )}
            {previewPrecios && (
              <p className="text-[11px] text-muted-foreground">
                Precios resultantes entre {previewPrecios.min}€ y {previewPrecios.max}€.
              </p>
            )}
            <Button
              size="sm" variant={precioQuitar ? "default" : "outline"} className="h-8 text-xs"
              onClick={() => setPrecioQuitar((v) => !v)}
            >
              Quitar precio manual de todos
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !hayCambios}>
            Aplicar a {fechas.length} días
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
