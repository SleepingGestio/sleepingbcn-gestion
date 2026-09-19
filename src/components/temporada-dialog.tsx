import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  insertTemporada, updateTemporada,
  type Temporada, type TemporadaAplicaA,
} from "@/lib/pricing";
import { Field } from "@/components/plantilla-edit-dialog";

/** Create (no `temporada`) / edit (`temporada` given) dialog for pricing.temporadas. */
export function TemporadaDialog({
  temporada, onClose, onSaved,
}: {
  temporada?: Temporada | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [aplicaA, setAplicaA] = useState<TemporadaAplicaA>(temporada?.aplica_a ?? "city");
  const [codigo, setCodigo] = useState(temporada?.codigo ?? "");
  const [nombre, setNombre] = useState(temporada?.nombre ?? "");
  const [coeficiente, setCoeficiente] = useState(temporada ? String(temporada.coeficiente) : "");
  const [fechaInicio, setFechaInicio] = useState(temporada?.fecha_inicio ?? "");
  const [fechaFin, setFechaFin] = useState(temporada?.fecha_fin ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!codigo.trim()) { toast.error("El código es obligatorio"); return; }
    if (!nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    const coef = Number(coeficiente);
    if (coeficiente.trim() === "" || !Number.isFinite(coef) || coef <= 0) {
      toast.error("El coeficiente debe ser un número mayor que 0");
      return;
    }
    if (!fechaInicio || !fechaFin) { toast.error("Las fechas son obligatorias"); return; }
    if (fechaFin < fechaInicio) { toast.error("La fecha de fin no puede ser anterior a la de inicio"); return; }

    const values = {
      aplica_a: aplicaA,
      codigo: codigo.trim(),
      nombre: nombre.trim(),
      coeficiente: coef,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
    };
    setSaving(true);
    try {
      if (temporada) await updateTemporada(temporada.id, values);
      else await insertTemporada(values);
      toast.success("Temporada guardada");
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
          <DialogTitle>{temporada ? "Editar temporada" : "Nueva temporada"}</DialogTitle>
          <DialogDescription className="sr-only">Formulario de temporada</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <Field label="Aplica a">
            <Select value={aplicaA} onValueChange={(v) => setAplicaA(v as TemporadaAplicaA)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="city">City</SelectItem>
                <SelectItem value="rural">Rural</SelectItem>
              </SelectContent>
            </Select>
          </Field>
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha inicio *">
              <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </Field>
            <Field label="Fecha fin *">
              <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
