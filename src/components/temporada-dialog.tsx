import { useRef, useState, type ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  insertTemporadaConPrimerPeriodo, updateTemporada, insertPeriodo, deletePeriodo, findPeriodoOverlap,
  type Temporada, type TemporadaAplicaA,
} from "@/lib/pricing";
import { addDaysISO, fmtDate } from "@/lib/format";
import { Field } from "@/components/plantilla-edit-dialog";
import { isPositiveIntOrEmpty } from "@/components/evento-form-dialog";

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
  return { fechaInicio, fechaFin, estanciaMinima, dirty, setFechaInicio, setFechaFin, setEstanciaMinima, reset };
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
  const [addingPeriodo, setAddingPeriodo] = useState(false);
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
    // Create always needs its first period. In edit mode, a period the person started
    // typing but didn't add with "Añadir" is saved along with the identity fields.
    const pendingPeriodo = !!temporada && periodo.dirty && periodo.fechaInicio !== "";
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
    setAddingPeriodo(true);
    try {
      await insertPeriodo(temporada.id, periodo.fechaInicio, periodo.fechaFin, estanciaOrNull(periodo.estanciaMinima));
      const newLatest = periodo.fechaFin > latestFin ? periodo.fechaFin : latestFin;
      periodo.reset(addDaysISO(newLatest, 1));
      onSaved();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setAddingPeriodo(false);
    }
  }

  async function handleDeletePeriodo(id: string) {
    try {
      await deletePeriodo(id);
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
          <div className="font-medium">{temporada ? "Períodos" : "Primer período"}</div>
          {temporada && periodos.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin períodos</p>
          )}
          {periodos.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <span className="whitespace-nowrap">
                {fmtDate(p.fecha_inicio)} – {fmtDate(p.fecha_fin)}
                {p.estancia_minima != null && ` · mín. ${p.estancia_minima}`}
              </span>
              <Button size="icon" variant="ghost" title="Eliminar período" onClick={() => handleDeletePeriodo(p.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <PeriodoInputs
            form={periodo}
            action={
              temporada ? (
                <Button variant="outline" onClick={handleAddPeriodo} disabled={addingPeriodo}>Añadir</Button>
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
