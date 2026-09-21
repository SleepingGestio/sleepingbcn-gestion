import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { insertFestivo } from "@/lib/pricing";
import { Field } from "@/components/plantilla-edit-dialog";

/** Small dialog to add a local festivo (Fecha + Nombre) to the año in view. */
export function FestivoDialog({
  anio, onClose, onSaved,
}: {
  anio: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fecha, setFecha] = useState(`${anio}-01-01`);
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!fecha) { toast.error("La fecha es obligatoria"); return; }
    // The list is per año, so a festivo outside it would be saved but never show up here.
    if (!fecha.startsWith(`${anio}-`)) { toast.error(`La fecha debe estar en ${anio}`); return; }
    if (!nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      await insertFestivo(fecha, nombre.trim());
      toast.success("Festivo añadido");
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
          <DialogTitle>Añadir festivo local · {anio}</DialogTitle>
          <DialogDescription className="sr-only">Formulario de festivo local</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <Field label="Fecha *">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Nombre *">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
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
