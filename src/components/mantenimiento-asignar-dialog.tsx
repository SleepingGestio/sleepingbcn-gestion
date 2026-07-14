import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fullName } from "@/lib/types";
import { PRIORIDAD_STYLE, type Incidencia, type PersonaLite, type Prioridad } from "@/lib/mantenimiento";

export function AsignarDialog({
  inc,
  workers,
  onOpenChange,
  onConfirm,
}: {
  inc: Incidencia | null;
  workers: PersonaLite[];
  onOpenChange: (o: boolean) => void;
  onConfirm: (inc: Incidencia, workerId: number, fecha: string | null, prioridad: Prioridad) => Promise<void>;
}) {
  const [workerId, setWorkerId] = useState<number | null>(null);
  const [fecha, setFecha] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [busy, setBusy] = useState(false);

  const openId = inc?.id_incidencia ?? null;
  useEffect(() => {
    setWorkerId(inc?.id_assignat ?? null);
    setFecha(inc?.data_prevista ?? "");
    setPrioridad(inc?.prioritat_confirmada ?? inc?.prioritat_proposta ?? "normal");
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function confirmar() {
    if (!inc || workerId == null) return;
    setBusy(true);
    try {
      await onConfirm(inc, workerId, fecha || null, prioridad);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!inc} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Asignar incidencia</DialogTitle>
          <DialogDescription className="sr-only">Asignar trabajador, fecha y prioridad</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Trabajador</Label>
            <Select value={workerId != null ? String(workerId) : ""} onValueChange={(v) => setWorkerId(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un trabajador" />
              </SelectTrigger>
              <SelectContent>
                {workers.map((w) => (
                  <SelectItem key={w.id_persona} value={String(w.id_persona)}>
                    {fullName(w)}
                    {w.codigo ? ` (${w.codigo})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fecha prevista (opcional)</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prioridad confirmada</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["alta", "normal", "baixa"] as Prioridad[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrioridad(p)}
                  className={cn(
                    "h-9 rounded-md border text-sm font-medium transition-colors",
                    prioridad === p
                      ? "border-[#26215C] bg-[#26215C]/10 text-[#26215C]"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {PRIORIDAD_STYLE[p].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={busy || workerId == null}>
            {busy ? "Guardando…" : "Confirmar asignación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
