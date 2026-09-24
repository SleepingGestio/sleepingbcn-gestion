import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { insertFestivo, updateFestivo, type Festivo, type FestivoAmbito } from "@/lib/pricing";
import { AMBITO_LIST, AMBITO_LABEL } from "@/lib/pricing-styles";
import { Field } from "@/components/plantilla-edit-dialog";

/**
 * Create (no `festivo`, always a "local" one) / edit (`festivo` given) dialog: Fecha, Nombre, ámbitos
 * (multi-select) and detalle (free text, only meaningful with "comunidad_otras" checked, but shown
 * unconditionally to keep the form simple). `defaultFecha` seeds the date field on create when the
 * caller already knows which day it's for (e.g. opened from a specific day in Vista Calendario),
 * instead of always defaulting to `${anio}-01-01`.
 */
export function FestivoDialog({
  festivo, anio, defaultFecha, onClose, onSaved,
}: {
  festivo?: Festivo | null;
  anio: number;
  defaultFecha?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fecha, setFecha] = useState(festivo?.fecha ?? defaultFecha ?? `${anio}-01-01`);
  const [nombre, setNombre] = useState(festivo?.nombre ?? "");
  const [ambitos, setAmbitos] = useState<FestivoAmbito[]>(festivo?.ambitos ?? ["local"]);
  const [detalle, setDetalle] = useState(festivo?.detalle ?? "");
  const [saving, setSaving] = useState(false);

  function toggleAmbito(a: FestivoAmbito, checked: boolean) {
    setAmbitos((prev) => (checked ? [...prev, a] : prev.filter((x) => x !== a)));
  }

  async function handleSubmit() {
    if (!fecha) { toast.error("La fecha es obligatoria"); return; }
    // The list is per año, so a festivo outside it would be saved but never show up here.
    if (!fecha.startsWith(`${anio}-`)) { toast.error(`La fecha debe estar en ${anio}`); return; }
    if (!nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (ambitos.length === 0) { toast.error("Selecciona al menos un ámbito"); return; }
    setSaving(true);
    try {
      const payload = { fecha, nombre: nombre.trim(), ambitos, detalle: detalle.trim() || null };
      if (festivo) await updateFestivo(festivo.id, payload);
      else await insertFestivo(payload);
      toast.success(festivo ? "Festivo guardado" : "Festivo añadido");
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{festivo ? "Editar festivo" : "Añadir festivo local"} · {anio}</DialogTitle>
          <DialogDescription className="sr-only">Formulario de festivo</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <Field label="Fecha *">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Nombre *">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </Field>
          <Field label="Ámbitos *">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {AMBITO_LIST.map((a) => (
                <label key={a} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={ambitos.includes(a)}
                    onCheckedChange={(c) => toggleAmbito(a, c === true)}
                  />
                  {AMBITO_LABEL[a]}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Detalle">
            <Input
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Comunidades concretas (solo para Otra comunidad)"
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
