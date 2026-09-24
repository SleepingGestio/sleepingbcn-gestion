import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/plantilla-edit-dialog";
import { isPositiveIntOrEmpty } from "@/components/evento-form-dialog";
import { addDaysISO, fmtDate } from "@/lib/format";
import {
  asignarTemporadaRango, findCoverageGaps, upsertAjustesDiaBulk, type Temporada, type TemporadaAplicaA,
} from "@/lib/pricing";
import type { DiaCalculado } from "@/lib/pricing-calc";

const NO_CAMBIAR = "__no_cambiar__";
const CREAR_NUEVA = "__crear_nueva__";

/**
 * Whether sorted `fechas` can go to asignar_temporada_rango as the single range [first, last]: every
 * calculable day in between must be selected. An unselected "Sin datos" day (null in `dias`) is fine,
 * since it has no checkbox and range-fill already skips it, so the range just covers it too. 0 or 1
 * dates always count as valid.
 */
function esRangoContinuo(fechas: string[], dias: Map<string, DiaCalculado | null>): boolean {
  if (fechas.length < 2) return true;
  const seleccionadas = new Set(fechas);
  const hasta = fechas[fechas.length - 1];
  for (let d = fechas[0]; d <= hasta; d = addDaysISO(d, 1)) {
    if (!seleccionadas.has(d) && dias.get(d) != null) return false;
  }
  return true;
}

/**
 * Bulk edit for the days in `fechas`. Estancia mínima / precio are per-day overrides written to
 * ajustes_dia, like the day dialog's "Ajustes manuales" section. Temporada is different: it calls
 * asignar_temporada_rango, which actually resizes/splits the temporada períodos so the whole
 * [first, last] range belongs to the chosen temporada (existing, or created inline here), so it's
 * only offered when the selection is one continuous range. Every field defaults to "no cambiar" so
 * the person can touch only the fields they actually want to set. `dias` is the año's
 * already-computed breakdown (`calculo.dias`), used for the range check and to read each selected
 * day's current precioFinal for the "ajuste relativo" precio mode.
 */
export function DiasEdicionMasivaDialog({
  fechas, anio, aplicaA, temporadas, dias, onClose, onTemporadaAplicada, onGuardado,
}: {
  fechas: string[];
  anio: number;
  aplicaA: TemporadaAplicaA;
  temporadas: Temporada[];
  dias: Map<string, DiaCalculado | null>;
  onClose: () => void;
  /** Called right after the temporada RPC succeeds, to refetch temporadas (períodos changed, maybe a new one). */
  onTemporadaAplicada: () => void | Promise<void>;
  onGuardado: () => void | Promise<void>;
}) {
  const temporadasDelAnio = useMemo(
    () => temporadas.filter((t) => t.anio === anio && t.aplica_a === aplicaA).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [temporadas, anio, aplicaA],
  );
  const rangoValido = useMemo(() => esRangoContinuo(fechas, dias), [fechas, dias]);

  const [temporadaIdElegida, setTemporadaIdElegida] = useState<string>(NO_CAMBIAR);
  // Forced to "No cambiar" while the selection isn't one continuous range.
  const temporadaId = rangoValido ? temporadaIdElegida : NO_CAMBIAR;
  const [codigoNueva, setCodigoNueva] = useState("");
  const [nombreNueva, setNombreNueva] = useState("");
  const [coeficienteNueva, setCoeficienteNueva] = useState("");
  // The new período's own minimum stay (asignar_temporada_rango's p_estancia_minima), not to be
  // confused with the unrelated per-day "Estancia mínima" section below (ajustes_dia override).
  const [estanciaMinimaPeriodo, setEstanciaMinimaPeriodo] = useState("");
  const [gaps, setGaps] = useState<{ desde: string; hasta: string }[] | null>(null);

  /** Picking anything but "Crear nueva" drops whatever was typed into the new-temporada fields. */
  function cambiarTemporada(v: string) {
    setTemporadaIdElegida(v);
    if (v !== CREAR_NUEVA) {
      setCodigoNueva("");
      setNombreNueva("");
      setCoeficienteNueva("");
    }
  }

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
    const aplicarTemporada = temporadaId !== NO_CAMBIAR;
    let coefNueva = 0;
    if (temporadaId === CREAR_NUEVA) {
      // Same checks and messages as TemporadaDialog; the RPC repeats them server-side.
      if (!codigoNueva.trim()) { toast.error("El código es obligatorio"); return; }
      if (!nombreNueva.trim()) { toast.error("El nombre es obligatorio"); return; }
      coefNueva = Number(coeficienteNueva);
      if (coeficienteNueva.trim() === "" || !Number.isFinite(coefNueva) || coefNueva <= 0) {
        toast.error("El coeficiente debe ser un número mayor que 0");
        return;
      }
    }
    if (aplicarTemporada && !isPositiveIntOrEmpty(estanciaMinimaPeriodo)) {
      toast.error("La estancia mínima del período debe ser un número entero mayor que 0");
      return;
    }

    const comunes: Partial<{ estanciaMinima: number | null; precioManual: number | null }> = {};
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

    if (!aplicarTemporada && rows.length === 0) { toast.error("No hay ningún cambio que aplicar"); return; }

    setSaving(true);
    let temporadaAplicada = false;
    try {
      if (aplicarTemporada) {
        await asignarTemporadaRango(
          aplicaA, anio, fechas[0], fechas[fechas.length - 1],
          estanciaMinimaPeriodo.trim() === "" ? null : Number(estanciaMinimaPeriodo),
          temporadaId === CREAR_NUEVA
            ? { nueva: { codigo: codigoNueva.trim(), nombre: nombreNueva.trim(), coeficiente: coefNueva } }
            : { temporadaId },
        );
        temporadaAplicada = true;
        await onTemporadaAplicada();
      }
      // Not one transaction with the RPC above: if this fails after the RPC already committed, the
      // temporada change stays applied and only estancia/precio are missing (see the catch below).
      if (rows.length > 0) await upsertAjustesDiaBulk(rows);
      toast.success(`${aplicarTemporada ? fechas.length : rows.length} días actualizados`);
      await onGuardado();
      onClose();
    } catch (e) {
      if (temporadaAplicada) {
        // The temporada is already in place: take it out of the form so a retry only resends
        // estancia/precio, and can't create the same new temporada a second time.
        cambiarTemporada(NO_CAMBIAR);
        toast.error("Temporada aplicada, pero no se pudieron guardar estancia/precio: " + (e as Error).message);
      } else {
        toast.error("Error: " + (e as Error).message);
      }
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Temporada</p>
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setGaps(findCoverageGaps(temporadasDelAnio.flatMap((t) => t.temporada_periodos), anio))}
              >
                <CalendarCheck className="mr-1 h-3.5 w-3.5" /> Comprobar cobertura
              </Button>
            </div>
            <Select value={temporadaId} onValueChange={cambiarTemporada} disabled={!rangoValido}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CAMBIAR}>No cambiar</SelectItem>
                {temporadasDelAnio.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.codigo} · {t.nombre}</SelectItem>
                ))}
                <SelectItem value={CREAR_NUEVA}>+ Crear nueva temporada</SelectItem>
              </SelectContent>
            </Select>
            {!rangoValido && (
              <p className="text-[11px] text-muted-foreground">
                La selección debe ser un rango continuo de fechas para asignar una temporada
              </p>
            )}
            {temporadaId === CREAR_NUEVA && (
              <div className="grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Código *">
                    <Input value={codigoNueva} onChange={(e) => setCodigoNueva(e.target.value)} className="h-8 text-xs" autoFocus />
                  </Field>
                  <Field label="Nombre *">
                    <Input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} className="h-8 text-xs" />
                  </Field>
                </div>
                <Field label="Coeficiente *">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={coeficienteNueva}
                    onChange={(e) => setCoeficienteNueva(e.target.value)}
                    className="h-8 w-28 text-xs"
                  />
                </Field>
              </div>
            )}
            {temporadaId !== NO_CAMBIAR && (
              <div className="space-y-1">
                <Field label="Estancia mínima del período">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Sin mínimo"
                    value={estanciaMinimaPeriodo}
                    onChange={(e) => setEstanciaMinimaPeriodo(e.target.value)}
                    className="h-8 w-28 text-xs"
                  />
                </Field>
                <p className="text-[11px] text-muted-foreground">
                  Se guarda en el período de la temporada; aplica a todo el rango salvo que un día tenga su propio ajuste.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estancia mínima</p>
            <p className="text-[11px] text-muted-foreground">
              Ajuste manual para días concretos — tiene prioridad sobre el período.
            </p>
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

        <Dialog open={gaps !== null} onOpenChange={(o) => !o && setGaps(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cobertura {anio} · {aplicaA === "city" ? "City" : "Rural"}</DialogTitle>
              <DialogDescription className="sr-only">Resultado de la comprobación de cobertura del año</DialogDescription>
            </DialogHeader>
            {gaps?.length === 0 ? (
              <p className="text-sm">Todo el año está cubierto por alguna temporada</p>
            ) : (
              <ul className="text-sm space-y-1">
                {gaps?.map((g) => (
                  <li key={g.desde}>Sin temporada asignada: {fmtDate(g.desde)} – {fmtDate(g.hasta)}</li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setGaps(null)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
