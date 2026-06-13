import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchReserva, upsertGestio } from "@/lib/reservas";
import { fetchAgentes, fetchLimpiadores } from "@/lib/catalogos";
import { fullName, type Reserva, type ReservaGestio } from "@/lib/types";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

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

  const agentesQ = useQuery({ queryKey: ["agentes"], queryFn: fetchAgentes });
  const limpiadoresQ = useQuery({ queryKey: ["limpiadores"], queryFn: fetchLimpiadores });

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
            {reserva?.["Referencia"] ?? ""} · {reserva?.["Habitaciones"] ?? ""}
          </DialogDescription>
        </DialogHeader>

        {!reserva ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Check-in" value={reserva["Check in"]} />
              <Info label="Check-out" value={reserva["Check-out"]} />
              <Info label="Huéspedes" value={reserva["Huéspedes"]} />
              <Info label="Portal" value={reserva["Portal"]} />
              <Info label="Cobros" value={reserva["Cobros"] != null ? `${reserva["Cobros"]} €` : null} />
              <Info label="Estado" value={<Badge variant="secondary">{reserva["Estado"] ?? "—"}</Badge>} />
              <Info label="Email" value={reserva["Email"]} />
              <Info label="Teléfono" value={reserva["Teléfono"]} />
            </section>

            <section className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-sm">Gestión interna</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hora check-in confirmada</Label>
                  <Input
                    type="time"
                    value={g.HCheckInConf ?? ""}
                    onChange={(e) => setG({ ...g, HCheckInConf: e.target.value || null })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hora check-out confirmada</Label>
                  <Input
                    type="time"
                    value={g.HCheckOutConf ?? ""}
                    onChange={(e) => setG({ ...g, HCheckOutConf: e.target.value || null })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Agente check-in</Label>
                  <Select
                    value={g.AgCheckIN != null ? String(g.AgCheckIN) : "none"}
                    onValueChange={(v) => setG({ ...g, AgCheckIN: v === "none" ? null : Number(v) })}
                  >
                    <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {agentesQ.data?.map((a) => (
                        <SelectItem key={a.id_agente} value={String(a.id_agente)}>{fullName(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Personal de limpieza</Label>
                  <Select
                    value={g.PersLImpAsig != null ? String(g.PersLImpAsig) : "none"}
                    onValueChange={(v) => setG({ ...g, PersLImpAsig: v === "none" ? null : Number(v) })}
                  >
                    <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {limpiadoresQ.data?.map((p) => (
                        <SelectItem key={p.id_persona} value={String(p.id_persona)}>{fullName(p)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tasa turística (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={g.ImpTTAX ?? ""}
                    onChange={(e) => setG({ ...g, ImpTTAX: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tasa cobrada (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={g.TaxCobradas ?? ""}
                    onChange={(e) => setG({ ...g, TaxCobradas: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Check label="Listo para check-in" checked={!!g.ReadyCheckIn} onChange={(v) => setG({ ...g, ReadyCheckIn: v })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Parte policía enviado</Label>
                  <Input
                    type="datetime-local"
                    value={toLocal(g.ParteeEnv)}
                    onChange={(e) => setG({ ...g, ParteeEnv: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reclamación 1</Label>
                  <Input
                    type="datetime-local"
                    value={toLocal(g.ParteeRecl1)}
                    onChange={(e) => setG({ ...g, ParteeRecl1: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reclamación 2</Label>
                  <Input
                    type="datetime-local"
                    value={toLocal(g.ParteeRecl2)}
                    onChange={(e) => setG({ ...g, ParteeRecl2: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reclamación 3</Label>
                  <Input
                    type="datetime-local"
                    value={toLocal(g.ParteeRecl3)}
                    onChange={(e) => setG({ ...g, ParteeRecl3: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notas de gestión</Label>
                <Textarea
                  rows={4}
                  value={g.NotasGestio ?? ""}
                  onChange={(e) => setG({ ...g, NotasGestio: e.target.value || null })}
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

function toLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}