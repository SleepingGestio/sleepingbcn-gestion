import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  updatePlantilla, addFuente, deleteFuente, updateFuenteRevisionForzada,
  type Plantilla, type PlantillaFuente, type EventoAplicaA, type EventoCategoria, type EventoPeriodicidad,
} from "@/lib/pricing";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export const CATEGORIA_OPTIONS: { value: EventoCategoria; label: string }[] = [
  { value: "feria", label: "Feria" },
  { value: "deporte", label: "Deporte" },
  { value: "cultura", label: "Cultura" },
  { value: "otro", label: "Otro" },
];

export const APLICA_A_OPTIONS: { value: EventoAplicaA; label: string }[] = [
  { value: "city", label: "City" },
  { value: "rural", label: "Rural" },
  { value: "ambos", label: "Ambos" },
];

export const PERIODICIDAD_OPTIONS: { value: EventoPeriodicidad; label: string }[] = [
  { value: "anual", label: "Anual" },
  { value: "bianual", label: "Bianual" },
  { value: "puntual", label: "Puntual" },
];

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

type EstadoBadge = "ok" | "roto" | "sin_verificar";

const ESTADO_VERIFICACION_LABEL: Record<EstadoBadge, string> = {
  ok: "Ok", roto: "Roto", sin_verificar: "Sin verificar",
};

const ESTADO_VERIFICACION_STYLES: Record<EstadoBadge, string> = {
  ok: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  roto: "border-transparent bg-red-600 text-white hover:bg-red-600",
  sin_verificar: "border-transparent bg-slate-400 text-white hover:bg-slate-400",
};

/** Due for the annual September review: never verified, or verified more than 11 months ago. */
function esFuenteDesactualizada(f: PlantillaFuente): boolean {
  if (!f.ultima_verificacion) return true;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 11);
  return new Date(f.ultima_verificacion) < limite;
}

/**
 * Combined edit dialog for a plantilla: core fields save with the button in
 * the footer; fuentes are added/removed immediately and the dialog stays open
 * (`plantilla` comes from the parent's query data, so onChanged() refreshes
 * the list shown here).
 */
export function PlantillaEditDialog({
  plantilla, onClose, onChanged,
}: {
  plantilla: Plantilla;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [nombre, setNombre] = useState(plantilla.nombre);
  const [categoria, setCategoria] = useState<EventoCategoria>(plantilla.categoria);
  const [aplicaA, setAplicaA] = useState<EventoAplicaA>(plantilla.aplica_a);
  const [periodicidad, setPeriodicidad] = useState<EventoPeriodicidad>(plantilla.periodicidad);
  const [activo, setActivo] = useState(plantilla.activo);
  const [saving, setSaving] = useState(false);

  const [newUrl, setNewUrl] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [addingFuente, setAddingFuente] = useState(false);
  const [togglingFuenteId, setTogglingFuenteId] = useState<string | null>(null);

  async function handleSave() {
    if (!nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      await updatePlantilla(plantilla.id, {
        nombre: nombre.trim(),
        categoria,
        aplica_a: aplicaA,
        periodicidad,
        activo,
      });
      toast.success("Plantilla guardada");
      onChanged();
      onClose();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFuente() {
    const url = newUrl.trim();
    if (!url) { toast.error("La URL es obligatoria"); return; }
    if (!isHttpUrl(url)) { toast.error("La URL debe empezar por http:// o https://"); return; }
    setAddingFuente(true);
    try {
      await addFuente(plantilla.id, url, newDesc.trim() || null);
      setNewUrl("");
      setNewDesc("");
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setAddingFuente(false);
    }
  }

  async function handleDeleteFuente(id: string) {
    try {
      await deleteFuente(id);
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    }
  }

  async function handleToggleRevisionForzada(f: PlantillaFuente) {
    setTogglingFuenteId(f.id);
    try {
      await updateFuenteRevisionForzada(f.id, !f.revision_forzada);
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setTogglingFuenteId(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar plantilla</DialogTitle>
          <DialogDescription className="sr-only">Editar datos y fuentes de la plantilla</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <Field label="Nombre *">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
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
          <div className="flex items-center gap-2">
            <Switch id="plantilla-activo" checked={activo} onCheckedChange={setActivo} />
            <Label htmlFor="plantilla-activo" className="text-sm font-normal cursor-pointer">Activo</Label>
          </div>
        </div>

        <div className="border-t pt-3 space-y-2 text-sm">
          <div className="font-medium">Fuentes</div>
          {plantilla.plantillas_fuentes.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin fuentes</p>
          )}
          {plantilla.plantillas_fuentes.map((f) => {
            const desactualizada = esFuenteDesactualizada(f);
            const estado: EstadoBadge = f.estado_verificacion ?? "sin_verificar";
            return (
              <div key={f.id} className={cn("flex flex-col gap-1.5 rounded-md p-2", desactualizada && "bg-amber-50")}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all"
                    >
                      {f.url}
                    </a>
                    {f.descripcion && <div className="text-xs text-muted-foreground">{f.descripcion}</div>}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Eliminar fuente"
                    onClick={() => handleDeleteFuente(f.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge className={ESTADO_VERIFICACION_STYLES[estado]}>{ESTADO_VERIFICACION_LABEL[estado]}</Badge>
                  <span className={cn("text-muted-foreground", desactualizada && "font-medium text-amber-700")}>
                    {f.ultima_verificacion ? fmtDate(f.ultima_verificacion) : "Nunca"}
                  </span>
                  {f.revision_forzada && (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                      <Flag className="h-3 w-3" /> Marcada
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-6 px-2"
                    disabled={togglingFuenteId === f.id}
                    onClick={() => handleToggleRevisionForzada(f)}
                  >
                    {f.revision_forzada ? "Quitar marca" : "Marcar para revisar"}
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="flex items-end gap-2 pt-1">
            <div className="flex-1">
              <Field label="URL">
                <Input
                  placeholder="https://…"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Descripción">
                <Input
                  placeholder="Opcional"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </Field>
            </div>
            <Button variant="outline" onClick={handleAddFuente} disabled={addingFuente}>Añadir</Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
