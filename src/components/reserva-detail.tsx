import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { fetchReserva, upsertGestio } from "@/lib/reservas";
import type { Reserva, ReservaGestio } from "@/lib/types";
import { toast } from "sonner";

export function ReservaDetail({
  numero,
  open,
  onOpenChange,
  onSaved,
}: {
  numero: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [g, setG] = useState<Partial<ReservaGestio>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!numero || !open) return;
    setReserva(null);
    fetchReserva(numero).then((r) => {
      setReserva(r);
      setG(r?.gestio ?? {});
    });
  }, [numero, open]);

  async function save() {
    if (!numero) return;
    setSaving(true);
    try {
      await upsertGestio({ "Número": numero, ...g });
      toast.success("Cambios guardados");
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error("Error al guardar: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reserva {numero}</DialogTitle>
          <DialogDescription>
            {reserva?.["Huésped"] ?? ""} · {reserva?.["Apartamento"] ?? ""}
          </DialogDescription>
        </DialogHeader>

        {!reserva ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Llegada" value={reserva["Llegada"]} />
              <Info label="Salida" value={reserva["Salida"]} />
              <Info label="Personas" value={reserva["Personas"]} />
              <Info label="Canal" value={reserva["Canal"]} />
              <Info label="Importe" value={reserva["Importe"] != null ? `${reserva["Importe"]} €` : null} />
              <Info label="Estado" value={<Badge variant="secondary">{reserva["Estado"] ?? "—"}</Badge>} />
              <Info label="Email" value={reserva["Email"]} />
              <Info label="Teléfono" value={reserva["Teléfono"]} />
            </section>

            <section className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-sm">Gestión interna</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hora de llegada estimada</Label>
                  <Input
                    type="time"
                    value={g.hora_llegada_estimada ?? ""}
                    onChange={(e) => setG({ ...g, hora_llegada_estimada: e.target.value || null })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Limpiador asignado</Label>
                  <Input
                    value={g.limpiador_asignado ?? ""}
                    onChange={(e) => setG({ ...g, limpiador_asignado: e.target.value || null })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Check label="Check-in realizado" checked={!!g.check_in_realizado} onChange={(v) => setG({ ...g, check_in_realizado: v })} />
                <Check label="Limpieza realizada" checked={!!g.limpieza_realizada} onChange={(v) => setG({ ...g, limpieza_realizada: v })} />
                <Check label="Fianza recibida" checked={!!g.fianza_recibida} onChange={(v) => setG({ ...g, fianza_recibida: v })} />
                <Check label="Documento recibido" checked={!!g.documento_recibido} onChange={(v) => setG({ ...g, documento_recibido: v })} />
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea
                  rows={4}
                  value={g.notas ?? ""}
                  onChange={(e) => setG({ ...g, notas: e.target.value || null })}
                />
              </div>
            </section>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span>{label}</span>
    </label>
  );
}