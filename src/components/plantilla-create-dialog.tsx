import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  insertPlantillaConPrimeraEdicion,
  type EventoAplicaA, type EventoCategoria, type EventoPeriodicidad, type EventoTipoValor,
} from "@/lib/pricing";
import {
  Field, CATEGORIA_OPTIONS, APLICA_A_OPTIONS, PERIODICIDAD_OPTIONS,
} from "@/components/plantilla-edit-dialog";
import { isPositiveIntOrEmpty } from "@/components/evento-form-dialog";

/**
 * "+ Nuevo evento": defines a plantilla (stable identity) and its first
 * principal edition in one step. Two inserts under the hood (see
 * insertPlantillaConPrimeraEdicion).
 */
export function PlantillaCreateDialog({
  onClose, onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<EventoCategoria>("feria");
  const [aplicaA, setAplicaA] = useState<EventoAplicaA>("ambos");
  const [periodicidad, setPeriodicidad] = useState<EventoPeriodicidad>("anual");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [valor, setValor] = useState("");
  const [tipoValor, setTipoValor] = useState<EventoTipoValor>("%");
  const [estanciaMinima, setEstanciaMinima] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (!fechaInicio || !fechaFin) { toast.error("Las fechas son obligatorias"); return; }
    if (fechaFin < fechaInicio) { toast.error("La fecha de fin no puede ser anterior a la de inicio"); return; }
    if (!isPositiveIntOrEmpty(estanciaMinima)) {
      toast.error("La estancia mínima debe ser un número entero mayor que 0");
      return;
    }

    setSaving(true);
    try {
      await insertPlantillaConPrimeraEdicion(
        { nombre: nombre.trim(), categoria, aplica_a: aplicaA, periodicidad },
        {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          valor: valor.trim() === "" ? null : Number(valor),
          tipo_valor: valor.trim() === "" ? null : tipoValor,
          estancia_minima: estanciaMinima.trim() === "" ? null : Number(estanciaMinima),
        },
      );
      toast.success("Evento creado");
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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo evento</DialogTitle>
          <DialogDescription className="sr-only">Alta de plantilla y su primera edición</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="font-medium">Plantilla</div>
          <Field label="Nombre *">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Categoría">
              <Select value={categoria} onValueChange={(v) => setCategoria(v as EventoCategoria)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIA_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Aplica a">
              <Select value={aplicaA} onValueChange={(v) => setAplicaA(v as EventoAplicaA)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APLICA_A_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Periodicidad">
              <Select value={periodicidad} onValueChange={(v) => setPeriodicidad(v as EventoPeriodicidad)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODICIDAD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <div className="border-t pt-3 grid gap-3 text-sm">
          <div className="font-medium">Primera edición</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha inicio *">
              <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </Field>
            <Field label="Fecha fin *">
              <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor">
              <Input
                type="number"
                step="any"
                placeholder="Opcional"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </Field>
            {valor.trim() !== "" && (
              <Field label="Tipo">
                <Select value={tipoValor} onValueChange={(v) => setTipoValor(v as EventoTipoValor)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="%">%</SelectItem>
                    <SelectItem value="€">€</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
          <Field label="Estancia mínima (noches)">
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="Opcional"
              value={estanciaMinima}
              onChange={(e) => setEstanciaMinima(e.target.value)}
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
