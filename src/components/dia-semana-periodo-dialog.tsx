import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  insertDiaSemanaPeriodo, updateDiaSemanaPeriodo,
  type DiaSemanaPeriodo, type TemporadaAplicaA,
} from "@/lib/pricing";
import { addDaysISO } from "@/lib/format";
import { Field } from "@/components/plantilla-edit-dialog";

const isPositive = (s: string) => s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) > 0;

/**
 * Create (no `periodo`) / edit (`periodo` given) dialog for pricing.dia_semana_periodos.
 * aplica_a and anio come from the page context and are fixed once created.
 * In create mode Fecha inicio starts at `defaultInicio`; Fecha fin follows it + 1 day
 * until the person sets it themselves.
 */
export function DiaSemanaPeriodoDialog({
  periodo, defaultInicio, anio, aplicaA, onClose, onSaved,
}: {
  periodo?: DiaSemanaPeriodo | null;
  defaultInicio: string;
  anio: number;
  aplicaA: TemporadaAplicaA;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fechaInicio, setFechaInicioRaw] = useState(periodo?.fecha_inicio ?? defaultInicio);
  const [fechaFin, setFechaFinRaw] = useState(periodo?.fecha_fin ?? addDaysISO(defaultInicio, 1));
  const [entresemana, setEntresemana] = useState(periodo ? String(periodo.coef_entresemana) : "");
  const [finsemana, setFinsemana] = useState(periodo ? String(periodo.coef_finsemana) : "");
  const [saving, setSaving] = useState(false);
  const finTouched = useRef(!!periodo);

  function setFechaInicio(v: string) {
    setFechaInicioRaw(v);
    if (!finTouched.current) setFechaFinRaw(v ? addDaysISO(v, 1) : "");
  }
  function setFechaFin(v: string) {
    finTouched.current = true;
    setFechaFinRaw(v);
  }

  async function handleSubmit() {
    if (!fechaInicio || !fechaFin) { toast.error("Las fechas son obligatorias"); return; }
    if (fechaFin < fechaInicio) { toast.error("La fecha de fin no puede ser anterior a la de inicio"); return; }
    if (!isPositive(entresemana)) { toast.error("El coeficiente entre semana debe ser un número mayor que 0"); return; }
    if (!isPositive(finsemana)) { toast.error("El coeficiente de fin de semana debe ser un número mayor que 0"); return; }

    const values = {
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      coef_entresemana: Number(entresemana),
      coef_finsemana: Number(finsemana),
    };
    setSaving(true);
    try {
      if (periodo) await updateDiaSemanaPeriodo(periodo.id, values);
      else await insertDiaSemanaPeriodo({ ...values, aplica_a: aplicaA, anio });
      toast.success("Período guardado");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {periodo ? "Editar período" : "Nuevo período"} · {anio} · {aplicaA === "city" ? "City" : "Rural"}
          </DialogTitle>
          <DialogDescription className="sr-only">Formulario de período de días de la semana</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Fecha inicio *">
            <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </Field>
          <Field label="Fecha fin *">
            <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </Field>
          <Field label="Coeficiente entre semana *">
            <Input
              type="number"
              min={0}
              step="any"
              value={entresemana}
              onChange={(e) => setEntresemana(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Coeficiente fin de semana *">
            <Input
              type="number"
              min={0}
              step="any"
              value={finsemana}
              onChange={(e) => setFinsemana(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
