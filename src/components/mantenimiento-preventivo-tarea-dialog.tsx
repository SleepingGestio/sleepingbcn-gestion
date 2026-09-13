import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { X } from "lucide-react";
import {
  MES_LABELS_LARGO,
  type AplicacionModo,
  type PeriodicidadModo,
  type TareaPreventivaConMeses,
} from "@/lib/mantenimiento-preventivo";
import type { AplicacionPreventiva } from "@/lib/mantenimiento-preventivo";
import type { TareaFormInput } from "@/hooks/use-mantenimiento-preventivo";
import type { GrupoLite, EspacioLite } from "@/lib/mantenimiento";

type AplicacionDraft = {
  id_grupo: number | null;
  modo_aplicacion: AplicacionModo;
  id_tipo_espacio_comun: number | null;
};

function tareaToDraft(
  tarea: (TareaPreventivaConMeses & { aplicaciones: AplicacionPreventiva[] }) | null,
): {
  nombre: string;
  descripcion: string;
  modo: PeriodicidadModo;
  intervaloCantidad: string;
  intervaloUnidad: "semanas" | "meses";
  meses: number[];
  aplicaciones: AplicacionDraft[];
} {
  if (!tarea) {
    return {
      nombre: "",
      descripcion: "",
      modo: "intervalo",
      intervaloCantidad: "",
      intervaloUnidad: "meses",
      meses: [],
      aplicaciones: [],
    };
  }
  return {
    nombre: tarea.nombre,
    descripcion: tarea.descripcion ?? "",
    modo: tarea.modo_periodicidad,
    intervaloCantidad: tarea.intervalo_cantidad != null ? String(tarea.intervalo_cantidad) : "",
    intervaloUnidad: tarea.intervalo_unidad ?? "meses",
    meses: tarea.meses,
    aplicaciones: tarea.aplicaciones.map((a) => ({
      id_grupo: a.id_grupo,
      modo_aplicacion: a.modo_aplicacion,
      id_tipo_espacio_comun: a.id_tipo_espacio_comun,
    })),
  };
}

export function TareaPreventivaDialog({
  open,
  tarea,
  grupos,
  espacios,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  tarea: (TareaPreventivaConMeses & { aplicaciones: AplicacionPreventiva[] }) | null;
  grupos: GrupoLite[];
  espacios: EspacioLite[];
  onOpenChange: (o: boolean) => void;
  onSave: (input: TareaFormInput) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => tareaToDraft(tarea));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(tareaToDraft(tarea));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tarea?.id_tarea_preventiva]);

  function updateAplicacion(idx: number, patch: Partial<AplicacionDraft>) {
    setDraft((d) => ({
      ...d,
      aplicaciones: d.aplicaciones.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));
  }

  function addAplicacion() {
    setDraft((d) => ({
      ...d,
      aplicaciones: [
        ...d.aplicaciones,
        { id_grupo: null, modo_aplicacion: "apartamentos_activos", id_tipo_espacio_comun: null },
      ],
    }));
  }

  function removeAplicacion(idx: number) {
    setDraft((d) => ({ ...d, aplicaciones: d.aplicaciones.filter((_, i) => i !== idx) }));
  }

  const nombreValid = draft.nombre.trim().length > 0;
  const periodicidadValid =
    draft.modo === "intervalo" ? Number(draft.intervaloCantidad) > 0 : draft.meses.length > 0;
  const aplicacionesValid =
    draft.aplicaciones.length > 0 &&
    draft.aplicaciones.every(
      (a) =>
        a.id_grupo != null &&
        (a.modo_aplicacion === "apartamentos_activos" || a.id_tipo_espacio_comun != null),
    );
  const canSave = nombreValid && periodicidadValid && aplicacionesValid && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const input: TareaFormInput = {
      id_tarea_preventiva: tarea?.id_tarea_preventiva,
      nombre: draft.nombre,
      descripcion: draft.descripcion || null,
      modo_periodicidad: draft.modo,
      intervalo_cantidad: draft.modo === "intervalo" ? Number(draft.intervaloCantidad) : null,
      intervalo_unidad: draft.modo === "intervalo" ? draft.intervaloUnidad : null,
      meses: draft.modo === "epoca_anyo" ? draft.meses : [],
      aplicaciones: draft.aplicaciones.map((a) => ({
        id_grupo: a.id_grupo!,
        modo_aplicacion: a.modo_aplicacion,
        id_tipo_espacio_comun:
          a.modo_aplicacion === "espacio_comun" ? a.id_tipo_espacio_comun : null,
      })),
    };
    const ok = await onSave(input);
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle>{tarea ? "Editar tarea preventiva" : "Nueva tarea preventiva"}</DialogTitle>
          <DialogDescription className="sr-only">
            Nombre, periodicidad y dónde se aplica
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nombre</Label>
            <Input
              value={draft.nombre}
              onChange={(e) => setDraft((d) => ({ ...d, nombre: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Descripción / instrucciones (opcional)
            </Label>
            <Textarea
              rows={2}
              value={draft.descripcion}
              onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))}
            />
          </div>

          <div className="space-y-2.5 border-t pt-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Periodicidad
            </Label>
            <ToggleGroup
              type="single"
              value={draft.modo}
              onValueChange={(v) => v && setDraft((d) => ({ ...d, modo: v as PeriodicidadModo }))}
              className="justify-start"
            >
              <ToggleGroupItem
                value="intervalo"
                className="flex-1 data-[state=on]:bg-[#26215C] data-[state=on]:text-white"
              >
                Cada X tiempo
              </ToggleGroupItem>
              <ToggleGroupItem
                value="epoca_anyo"
                className="flex-1 data-[state=on]:bg-[#26215C] data-[state=on]:text-white"
              >
                Época del año
              </ToggleGroupItem>
            </ToggleGroup>

            {draft.modo === "intervalo" ? (
              <>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[11px]">Cada</Label>
                    <Input
                      type="number"
                      min={1}
                      className="text-right"
                      value={draft.intervaloCantidad}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, intervaloCantidad: e.target.value }))
                      }
                    />
                  </div>
                  <div className="flex-[2] space-y-1">
                    <Label className="text-[11px]">Unidad</Label>
                    <Select
                      value={draft.intervaloUnidad}
                      onValueChange={(v) =>
                        setDraft((d) => ({ ...d, intervaloUnidad: v as "semanas" | "meses" }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meses">Meses</SelectItem>
                        <SelectItem value="semanas">Semanas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Se cuenta desde la fecha real de <strong>cierre / finalización</strong> de la
                  última tarea, no desde la fecha en que estaba programada.
                </p>
              </>
            ) : (
              <>
                <Label className="text-[11px]">Meses del año (puede marcar varios)</Label>
                <ToggleGroup
                  type="multiple"
                  value={draft.meses.map(String)}
                  onValueChange={(vals) =>
                    setDraft((d) => ({ ...d, meses: vals.map(Number).sort((a, b) => a - b) }))
                  }
                  className="grid grid-cols-4 gap-1.5"
                >
                  {MES_LABELS_LARGO.slice(1).map((label, i) => (
                    <ToggleGroupItem
                      key={i + 1}
                      value={String(i + 1)}
                      className="text-xs data-[state=on]:bg-[#26215C] data-[state=on]:text-white"
                    >
                      {label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Cada mes marcado abre su propia ventana, una vez al año, con independencia de las
                  demás.
                </p>
              </>
            )}
          </div>

          <div className="space-y-2.5 border-t pt-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Dónde se aplica
            </Label>
            <div className="space-y-2">
              {draft.aplicaciones.map((a, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md border p-2.5">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[11px]">Grupo / edificio</Label>
                    <Select
                      value={a.id_grupo != null ? String(a.id_grupo) : ""}
                      onValueChange={(v) => updateAplicacion(idx, { id_grupo: Number(v) })}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Selecciona…" />
                      </SelectTrigger>
                      <SelectContent>
                        {grupos.map((g) => (
                          <SelectItem key={g.id_grupo} value={String(g.id_grupo)}>
                            {g.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-[11px]">Modo</Label>
                    <Select
                      value={a.modo_aplicacion}
                      onValueChange={(v) =>
                        updateAplicacion(idx, {
                          modo_aplicacion: v as AplicacionModo,
                          id_tipo_espacio_comun: null,
                        })
                      }
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="apartamentos_activos">Apartamentos activos</SelectItem>
                        <SelectItem value="espacio_comun">Espacio común</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {a.modo_aplicacion === "espacio_comun" ? (
                    <div className="flex-1 space-y-1">
                      <Label className="text-[11px]">Espacio</Label>
                      <Select
                        value={
                          a.id_tipo_espacio_comun != null ? String(a.id_tipo_espacio_comun) : ""
                        }
                        onValueChange={(v) =>
                          updateAplicacion(idx, { id_tipo_espacio_comun: Number(v) })
                        }
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Selecciona…" />
                        </SelectTrigger>
                        <SelectContent>
                          {espacios.map((e) => (
                            <SelectItem key={e.id_tipo} value={String(e.id_tipo)}>
                              {e.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="flex-1 text-xs text-muted-foreground pt-4">
                      todas las unidades activas
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 self-center mt-4 shrink-0 text-muted-foreground"
                    onClick={() => removeAplicacion(idx)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                onClick={addAplicacion}
              >
                + Añadir aplicación (grupo + modo)
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
            disabled={!canSave}
            onClick={handleSave}
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
