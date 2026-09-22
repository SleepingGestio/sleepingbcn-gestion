import { useRef, useState, type ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  insertTemporadaConPrimerPeriodo, updateTemporada, insertPeriodo, updatePeriodo, deletePeriodo, findPeriodoOverlap,
  type Temporada, type TemporadaAplicaA, type TemporadaPeriodo,
} from "@/lib/pricing";
import { addDaysISO, fmtDate } from "@/lib/format";
import { Field } from "@/components/plantilla-edit-dialog";
import { isPositiveIntOrEmpty } from "@/components/evento-form-dialog";
import { cn } from "@/lib/utils";

/**
 * Fecha inicio / Fecha fin / Estancia mínima state. While Fecha fin hasn't been touched by the
 * person, it follows Fecha inicio + 1 day; once they set it, it's left alone.
 * `dirty` is true once the person has typed in any of the fields (the pre-filled
 * defaults alone don't count), so a pending, unsaved period can be told apart.
 */
function usePeriodoForm(initialInicio: string) {
  const [fechaInicio, setFechaInicioRaw] = useState(initialInicio);
  const [fechaFin, setFechaFinRaw] = useState(initialInicio ? addDaysISO(initialInicio, 1) : "");
  const [estanciaMinima, setEstanciaMinimaRaw] = useState("");
  const [dirty, setDirty] = useState(false);
  const finTouched = useRef(false);

  function setFechaInicio(v: string) {
    setDirty(true);
    setFechaInicioRaw(v);
    if (!finTouched.current) setFechaFinRaw(v ? addDaysISO(v, 1) : "");
  }
  function setFechaFin(v: string) {
    setDirty(true);
    finTouched.current = true;
    setFechaFinRaw(v);
  }
  function setEstanciaMinima(v: string) {
    setDirty(true);
    setEstanciaMinimaRaw(v);
  }
  function reset(nextInicio = "") {
    setDirty(false);
    finTouched.current = false;
    setFechaInicioRaw(nextInicio);
    setFechaFinRaw(nextInicio ? addDaysISO(nextInicio, 1) : "");
    setEstanciaMinimaRaw("");
  }
  /** Loads an existing period's values for editing; stops Fecha fin from following Fecha inicio. */
  function cargar(p: Pick<TemporadaPeriodo, "fecha_inicio" | "fecha_fin" | "estancia_minima">) {
    setDirty(true);
    finTouched.current = true;
    setFechaInicioRaw(p.fecha_inicio);
    setFechaFinRaw(p.fecha_fin);
    setEstanciaMinimaRaw(p.estancia_minima != null ? String(p.estancia_minima) : "");
  }
  return {
    fechaInicio, fechaFin, estanciaMinima, dirty,
    setFechaInicio, setFechaFin, setEstanciaMinima, reset, cargar,
  };
}

/** Returns an error message, or null when the range is valid. */
function validatePeriodo(fechaInicio: string, fechaFin: string, estanciaMinima: string): string | null {
  if (!fechaInicio || !fechaFin) return "Las fechas son obligatorias";
  if (fechaFin < fechaInicio) return "La fecha de fin no puede ser anterior a la de inicio";
  if (!isPositiveIntOrEmpty(estanciaMinima)) return "La estancia mínima debe ser un número entero mayor que 0";
  return null;
}

const estanciaOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

// Two columns, like the eventos form: a native date input needs roughly 150px or
// more to keep its calendar-picker icon visible, which three columns don't leave.
function PeriodoInputs({ form, action }: { form: ReturnType<typeof usePeriodoForm>; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Fecha inicio *">
        <Input type="date" value={form.fechaInicio} onChange={(e) => form.setFechaInicio(e.target.value)} />
      </Field>
      <Field label="Fecha fin *">
        <Input type="date" value={form.fechaFin} onChange={(e) => form.setFechaFin(e.target.value)} />
      </Field>
      <Field label="Estancia mínima (noches)">
        <Input
          type="number"
          min={1}
          step={1}
          placeholder="Opcional"
          value={form.estanciaMinima}
          onChange={(e) => form.setEstanciaMinima(e.target.value)}
        />
      </Field>
      {action && <div className="flex items-end justify-end">{action}</div>}
    </div>
  );
}

/**
 * Create (no `temporada`) / edit (`temporada` given) dialog for pricing.temporadas.
 * aplica_a and anio come from the page context and are fixed once created.
 * Create requires a first period. In edit mode identity fields save with the
 * footer button; periods are added/removed immediately and the dialog stays
 * open (`temporada` comes from the parent's query data, so onSaved() refreshes it).
 */
export function TemporadaDialog({
  temporada, temporadasEnContexto, defaultAnio, aplicaA, onClose, onSaved,
}: {
  temporada?: Temporada | null;
  /** Every temporada (with periods) of the año + aplica_a in view, for overlap checks. */
  temporadasEnContexto: Temporada[];
  defaultAnio: number;
  aplicaA: TemporadaAplicaA;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [codigo, setCodigo] = useState(temporada?.codigo ?? "");
  const [nombre, setNombre] = useState(temporada?.nombre ?? "");
  const [coeficiente, setCoeficiente] = useState(temporada ? String(temporada.coeficiente) : "");
  const [saving, setSaving] = useState(false);
  // Covers both "Añadir" and "Guardar cambios" — only one of the two is ever in flight.
  const [savingPeriodo, setSavingPeriodo] = useState(false);
  // Id of the period currently loaded into the form for editing, or null when the form is in
  // "add a new period" mode. Only one period can be edited at a time.
  const [editingPeriodoId, setEditingPeriodoId] = useState<string | null>(null);
  const periodos = [...(temporada?.temporada_periodos ?? [])].sort((a, b) =>
    a.fecha_inicio.localeCompare(b.fecha_inicio),
  );
  const latestFin = periodos.reduce((max, p) => (p.fecha_fin > max ? p.fecha_fin : max), "");
  // First period in create mode; the add-period mini-form in edit mode. Starts
  // the day after the latest existing period, or Jan 1 when there is none.
  const periodo = usePeriodoForm(latestFin ? addDaysISO(latestFin, 1) : `${defaultAnio}-01-01`);

  /** Toasts and returns true when the range overlaps a period of another temporada. */
  function hasConflict(fechaInicio: string, fechaFin: string): boolean {
    const c = findPeriodoOverlap(temporadasEnContexto, temporada?.id ?? null, fechaInicio, fechaFin);
    if (!c) return false;
    toast.error(
      `Se solapa con ${c.temporada.codigo} (${c.temporada.nombre}): ${fmtDate(c.periodo.fecha_inicio)} – ${fmtDate(c.periodo.fecha_fin)}`,
    );
    return true;
  }

  async function handleSubmit() {
    if (!codigo.trim()) { toast.error("El código es obligatorio"); return; }
    if (!nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    const coef = Number(coeficiente);
    if (coeficiente.trim() === "" || !Number.isFinite(coef) || coef <= 0) {
      toast.error("El coeficiente debe ser un número mayor que 0");
      return;
    }
    const identity = { codigo: codigo.trim(), nombre: nombre.trim(), coeficiente: coef };
    // Create always needs its first period. In edit mode, a period the person started typing but
    // didn't add with "Añadir" is saved along with the identity fields — unless it's actually an
    // existing period loaded for editing, which only ever saves via its own "Guardar cambios".
    const pendingPeriodo = !!temporada && !editingPeriodoId && periodo.dirty && periodo.fechaInicio !== "";
    if (!temporada || pendingPeriodo) {
      const err = validatePeriodo(periodo.fechaInicio, periodo.fechaFin, periodo.estanciaMinima);
      if (err) { toast.error(err); return; }
      if (hasConflict(periodo.fechaInicio, periodo.fechaFin)) return;
    }

    setSaving(true);
    try {
      if (temporada) {
        await updateTemporada(temporada.id, identity);
        if (pendingPeriodo) {
          try {
            await insertPeriodo(temporada.id, periodo.fechaInicio, periodo.fechaFin, estanciaOrNull(periodo.estanciaMinima));
          } catch (e) {
            // Identity fields are already saved; keep the dialog open so the period can be retried.
            onSaved();
            toast.error("Datos guardados, pero no se pudo añadir el período: " + (e as Error).message);
            return;
          }
        }
      } else {
        await insertTemporadaConPrimerPeriodo(
          { ...identity, aplica_a: aplicaA, anio: defaultAnio },
          { fecha_inicio: periodo.fechaInicio, fecha_fin: periodo.fechaFin, estancia_minima: estanciaOrNull(periodo.estanciaMinima) },
        );
      }
      toast.success(pendingPeriodo ? "Temporada y período guardados" : "Temporada guardada");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPeriodo() {
    if (!temporada) return;
    const err = validatePeriodo(periodo.fechaInicio, periodo.fechaFin, periodo.estanciaMinima);
    if (err) { toast.error(err); return; }
    if (hasConflict(periodo.fechaInicio, periodo.fechaFin)) return;
    setSavingPeriodo(true);
    try {
      await insertPeriodo(temporada.id, periodo.fechaInicio, periodo.fechaFin, estanciaOrNull(periodo.estanciaMinima));
      const newLatest = periodo.fechaFin > latestFin ? periodo.fechaFin : latestFin;
      periodo.reset(addDaysISO(newLatest, 1));
      onSaved();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSavingPeriodo(false);
    }
  }

  /** Loads a period into the form for editing. Switching to a different row while one is already
   * being edited discards whatever was typed for the previous one — the form's contents visibly
   * change to the new period's values, so nothing is lost silently. */
  function handleEmpezarEdicionPeriodo(p: TemporadaPeriodo) {
    setEditingPeriodoId(p.id);
    periodo.cargar(p);
  }

  function handleCancelarEdicionPeriodo() {
    setEditingPeriodoId(null);
    periodo.reset(addDaysISO(latestFin, 1));
  }

  async function handleGuardarCambiosPeriodo() {
    if (!temporada || !editingPeriodoId) return;
    const err = validatePeriodo(periodo.fechaInicio, periodo.fechaFin, periodo.estanciaMinima);
    if (err) { toast.error(err); return; }
    if (hasConflict(periodo.fechaInicio, periodo.fechaFin)) return;
    setSavingPeriodo(true);
    try {
      await updatePeriodo(editingPeriodoId, {
        fecha_inicio: periodo.fechaInicio,
        fecha_fin: periodo.fechaFin,
        estancia_minima: estanciaOrNull(periodo.estanciaMinima),
      });
      toast.success("Período actualizado");
      const otrasFin = periodos.filter((p) => p.id !== editingPeriodoId).map((p) => p.fecha_fin);
      const newLatest = [...otrasFin, periodo.fechaFin].reduce((max, f) => (f > max ? f : max), "");
      setEditingPeriodoId(null);
      periodo.reset(addDaysISO(newLatest, 1));
      onSaved();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSavingPeriodo(false);
    }
  }

  async function handleDeletePeriodo(id: string) {
    try {
      await deletePeriodo(id);
      // The edited period no longer exists; drop back to "add a new one" rather than
      // keep pointing "Guardar cambios" at a row that's gone.
      if (editingPeriodoId === id) handleCancelarEdicionPeriodo();
      onSaved();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {temporada ? "Editar temporada" : "Nueva temporada"} · {defaultAnio} · {aplicaA === "city" ? "City" : "Rural"}
          </DialogTitle>
          <DialogDescription className="sr-only">Formulario de temporada</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código *">
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus />
            </Field>
            <Field label="Nombre *">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Field>
          </div>
          <Field label="Coeficiente *">
            <Input
              type="number"
              min={0}
              step="any"
              value={coeficiente}
              onChange={(e) => setCoeficiente(e.target.value)}
            />
          </Field>
        </div>

        <div className="border-t pt-3 space-y-2 text-sm">
          <div className="font-medium">
            {temporada ? (editingPeriodoId ? "Editando período" : "Períodos") : "Primer período"}
          </div>
          {temporada && periodos.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin períodos</p>
          )}
          {periodos.map((p) => (
            <div
              key={p.id}
              role={temporada ? "button" : undefined}
              tabIndex={temporada ? 0 : undefined}
              onClick={() => temporada && handleEmpezarEdicionPeriodo(p)}
              className={cn(
                "flex items-center justify-between gap-2 rounded px-1 -mx-1",
                temporada && "cursor-pointer hover:bg-muted/60",
                editingPeriodoId === p.id && "bg-muted",
              )}
            >
              <span className="whitespace-nowrap">
                {fmtDate(p.fecha_inicio)} – {fmtDate(p.fecha_fin)}
                {p.estancia_minima != null && ` · mín. ${p.estancia_minima}`}
              </span>
              <Button
                size="icon"
                variant="ghost"
                title="Eliminar período"
                onClick={(e) => { e.stopPropagation(); handleDeletePeriodo(p.id); }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <PeriodoInputs
            form={periodo}
            action={
              temporada ? (
                editingPeriodoId ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleCancelarEdicionPeriodo} disabled={savingPeriodo}>
                      Cancelar
                    </Button>
                    <Button onClick={handleGuardarCambiosPeriodo} disabled={savingPeriodo}>
                      Guardar cambios
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={handleAddPeriodo} disabled={savingPeriodo}>Añadir</Button>
                )
              ) : undefined
            }
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
