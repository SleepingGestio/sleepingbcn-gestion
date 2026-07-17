import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fullName } from "@/lib/types";
import { getUnavailableWorkerIds } from "@/lib/worker-availability";
import { WorkerSelectItem, unavailabilityWarningText } from "@/components/worker-select-item";
import { ApartamentoOcupacionCalendario } from "@/components/apartamento-ocupacion-calendario";
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

  const candidateIds = useMemo(() => {
    const ids = new Set(workers.map((w) => w.id_persona));
    if (workerId != null) ids.add(workerId);
    return Array.from(ids);
  }, [workers, workerId]);

  const unavailableQ = useQuery({
    queryKey: ["worker-unavailability", fecha, candidateIds],
    enabled: !!inc && !!fecha && candidateIds.length > 0,
    queryFn: () => getUnavailableWorkerIds(fecha, candidateIds),
  });

  const workerUnavailableReason = workerId != null ? unavailableQ.data?.get(workerId) : undefined;

  return (
    <Dialog open={!!inc} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{inc?.id_assignat != null ? "Reasignar incidencia" : "Asignar incidencia"}</DialogTitle>
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
                  <WorkerSelectItem
                    key={w.id_persona}
                    id_persona={w.id_persona}
                    label={`${fullName(w)}${w.codigo ? ` (${w.codigo})` : ""}`}
                    reason={unavailableQ.data?.get(w.id_persona)}
                  />
                ))}
              </SelectContent>
            </Select>
            {workerUnavailableReason && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠ Este trabajador {unavailabilityWarningText(workerUnavailableReason)} en la fecha prevista
                seleccionada — revisa antes de confirmar.
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fecha prevista (opcional)</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            {!fecha && (
              <div className="text-xs text-muted-foreground">
                Selecciona una fecha prevista para ver disponibilidad.
              </div>
            )}
          </div>
          {inc?.id_apt != null && (
            <div className="space-y-1.5">
              <Label className="text-xs">Ocupación del apartamento</Label>
              <div className="rounded-md border p-2">
                <ApartamentoOcupacionCalendario
                  key={openId ?? "none"}
                  idApt={inc.id_apt}
                  initialDateISO={fecha || null}
                  onSelectDate={(iso) => setFecha(iso)}
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Prioridad confirmada</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["alta", "normal", "baixa"] as Prioridad[]).map((p) => {
                const s = PRIORIDAD_STYLE[p];
                const selected = prioridad === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrioridad(p)}
                    style={selected ? { borderColor: s.bg, backgroundColor: `${s.bg}1A`, color: s.bg } : undefined}
                    className={cn(
                      "h-9 rounded-md border text-sm font-medium transition-colors",
                      !selected && "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={busy || workerId == null}
            style={{ backgroundColor: PRIORIDAD_STYLE[prioridad].bg, color: PRIORIDAD_STYLE[prioridad].fg }}
            className="hover:opacity-90"
          >
            {busy ? "Guardando…" : "Confirmar asignación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
