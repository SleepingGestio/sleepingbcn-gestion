import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EstadoBadge } from "@/components/estado-badge";
import { fetchReserva, upsertGestio } from "@/lib/reservas";
import { fetchAgentes, fetchLimpiadores } from "@/lib/catalogos";
import {
  fetchCanalesReserva, fetchTarifasCobroCanal, fetchTarifasComisionOta, fetchTarifasLimpieza,
} from "@/lib/tarifas";
import { fullName, type Reserva, type ReservaGestio } from "@/lib/types";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { fmtDate, resolveTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TimeBadge } from "@/components/time-badge";

export function ReservaDetail({
  numero,
  open,
  onOpenChange,
  onSaved,
  readOnly = false,
}: {
  numero: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
  /** View-only: hides/disables every mutation path (fields + save button). */
  readOnly?: boolean;
}) {
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [g, setG] = useState<Partial<ReservaGestio>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"gestion" | "economica" | "huespedes">("gestion");

  const agentesQ = useQuery({ queryKey: ["agentes"], queryFn: fetchAgentes });
  const limpiadoresQ = useQuery({ queryKey: ["limpiadores"], queryFn: fetchLimpiadores });
  const canalesQ = useQuery({ queryKey: ["canales-reserva-detail"], queryFn: fetchCanalesReserva });
  const tarifasLimpiezaQ = useQuery({ queryKey: ["tarifas-limpieza-detail"], queryFn: fetchTarifasLimpieza });
  const tarifasComisionQ = useQuery({ queryKey: ["tarifas-comision-detail"], queryFn: fetchTarifasComisionOta });
  const tarifasCobroQ = useQuery({ queryKey: ["tarifas-cobro-detail"], queryFn: fetchTarifasCobroCanal });

  const llegada = reserva ? resolveTime(reserva["Hora estimada de llegada"], "15:00:00") : null;
  const salida = reserva ? resolveTime(reserva["Hora estimada de salida"], "11:00:00") : null;

  // Resolved by exact-match: canales_reserva.nombre <-> reservas_kb.Portal, same
  // convention as apartamentos.nombre <-> Habitaciones. A spelling mismatch just
  // means no suggestion — never an error.
  const idCanal = useMemo(() => {
    const portal = reserva?.["Portal"];
    if (!portal) return null;
    return canalesQ.data?.find((c) => c.nombre === portal)?.id_canal ?? null;
  }, [reserva, canalesQ.data]);

  const propuestaLimpieza = useMemo(() => {
    const idCategoriaLimpieza = reserva?.apartamento?.id_categoria_limpieza;
    if (idCategoriaLimpieza == null) return null;
    return tarifasLimpiezaQ.data?.find((t) => t.id_categoria_limpieza === idCategoriaLimpieza)?.costo_limpieza ?? null;
  }, [reserva, tarifasLimpiezaQ.data]);

  const propuestaComision = useMemo(() => {
    const idTipoLicencia = reserva?.apartamento?.id_tipo_licencia;
    if (idTipoLicencia == null || idCanal == null) return null;
    return tarifasComisionQ.data?.find(
      (t) => t.id_tipo_licencia === idTipoLicencia && t.id_canal === idCanal,
    )?.pct_comision ?? null;
  }, [reserva, idCanal, tarifasComisionQ.data]);

  const propuestaCobro = useMemo(() => {
    if (idCanal == null) return null;
    return tarifasCobroQ.data?.find((t) => t.id_canal === idCanal)?.pct_cobro ?? null;
  }, [idCanal, tarifasCobroQ.data]);

  useEffect(() => {
    if (!numero || !open) return;
    setReserva(null);
    fetchReserva(numero).then((r) => {
      setReserva(r);
      setG(r?.gestio ?? {});
    });
  }, [numero, open]);

  async function save() {
    if (readOnly || !numero) return;
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
          <DialogTitle className="flex items-center justify-between gap-3 text-sm font-normal text-muted-foreground">
            <span>Reserva <span className="font-mono">{numero}</span></span>
            {reserva && (
              <span className="text-lg font-bold text-foreground">{reserva["Habitaciones"] ?? "—"}</span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detalle de la reserva {numero}
          </DialogDescription>
        </DialogHeader>

        {!reserva ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="space-y-6">
            {/* ── Header card ── */}
            <div className="rounded-lg border bg-primary/5 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Huésped</div>
                  <div className="text-base font-semibold">{reserva["Referencia"] ?? "—"}</div>
                </div>
                <div className="shrink-0 text-right flex flex-col gap-0.5 text-sm text-muted-foreground">
                  {reserva["Email"] && <span>{reserva["Email"]}</span>}
                  {reserva["Teléfono"] && <span>{reserva["Teléfono"]}</span>}
                </div>
              </div>

              <div className="mt-3 flex items-end gap-6 border-t border-primary/10 pt-3">
                <InfoSmall label="Huéspedes" value={reserva["Huéspedes"]} />
                <InfoSmall label="Portal" value={reserva["Portal"]} />
                <EstadoBadge estado={reserva["Estado"]} enLimpieza={reserva.gestio?.EnLimpieza} full />
              </div>
            </div>

            {/* ── Dates & times ── */}
            <section className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <InfoReadOnly
                  label="Check-in"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <span>{fmtDate(reserva["Check in"])}</span>
                      {llegada && <TimeBadge value={llegada.value.slice(0, 5)} informed={llegada.informed} />}
                    </span>
                  }
                />
                <InfoReadOnly
                  label="Check-out"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <span>{fmtDate(reserva["Check-out"])}</span>
                      {salida && <TimeBadge value={salida.value.slice(0, 5)} informed={salida.informed} />}
                    </span>
                  }
                />
              </div>
            </section>

            {/* ── Notas internas (KB) ── */}
            {reserva["Notas internas"] && (
              <section className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Notas internas (KB)</div>
                <div className="whitespace-pre-wrap">{reserva["Notas internas"]}</div>
              </section>
            )}

            {/* ── Gestión / económica / huéspedes ── */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList>
                <TabsTrigger value="gestion">Notas de gestión</TabsTrigger>
                <TabsTrigger value="economica">Inf. económica</TabsTrigger>
                <TabsTrigger value="huespedes">Registro de huéspedes</TabsTrigger>
              </TabsList>

              <TabsContent value="gestion" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Agente check-in</Label>
                  <Select
                    value={g.AgCheckIN != null ? String(g.AgCheckIN) : "none"}
                    onValueChange={(v) => setG({ ...g, AgCheckIN: v === "none" ? null : Number(v) })}
                    disabled={readOnly}
                  >
                    <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {agentesQ.data?.map((a) => (
                        <SelectItem key={a.id_persona} value={String(a.id_persona)}>{fullName(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Personal de limpieza</Label>
                  <Select
                    value={g.PersLImpAsig != null ? String(g.PersLImpAsig) : "none"}
                    onValueChange={(v) => setG({ ...g, PersLImpAsig: v === "none" ? null : Number(v) })}
                    disabled={readOnly}
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Parte policía enviado</Label>
                  <Input
                    type="datetime-local"
                    value={toLocal(g.ParteeEnv)}
                    onChange={(e) => setG({ ...g, ParteeEnv: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reclamación 1</Label>
                  <Input
                    type="datetime-local"
                    value={toLocal(g.ParteeRecl1)}
                    onChange={(e) => setG({ ...g, ParteeRecl1: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reclamación 2</Label>
                  <Input
                    type="datetime-local"
                    value={toLocal(g.ParteeRecl2)}
                    onChange={(e) => setG({ ...g, ParteeRecl2: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reclamación 3</Label>
                  <Input
                    type="datetime-local"
                    value={toLocal(g.ParteeRecl3)}
                    onChange={(e) => setG({ ...g, ParteeRecl3: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    disabled={readOnly}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notas de gestión</Label>
                <Textarea
                  rows={4}
                  value={g.NotasGestio ?? ""}
                  onChange={(e) => setG({ ...g, NotasGestio: e.target.value || null })}
                  disabled={readOnly}
                />
              </div>
              </TabsContent>

              <TabsContent value="economica" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pagado estancia (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={g.PagadoEstancia ?? ""}
                    onChange={(e) => setG({ ...g, PagadoEstancia: e.target.value === "" ? null : Number(e.target.value) })}
                    disabled={readOnly}
                  />
                </div>
                <SuggestibleNumberField
                  label="Pagado limpieza (€)"
                  value={g.PagadoLimpieza}
                  propuesta={propuestaLimpieza}
                  unit=" €"
                  disabled={readOnly}
                  onChange={(v) => setG({ ...g, PagadoLimpieza: v })}
                />
                <SuggestibleNumberField
                  label="% comisión OTA"
                  value={g.PctComisionOTA}
                  propuesta={propuestaComision}
                  unit="%"
                  disabled={readOnly}
                  onChange={(v) => setG({ ...g, PctComisionOTA: v })}
                />
                <SuggestibleNumberField
                  label="% por cobro"
                  value={g.PctPorCobro}
                  propuesta={propuestaCobro}
                  unit="%"
                  disabled={readOnly}
                  onChange={(v) => setG({ ...g, PctPorCobro: v })}
                />
                <div className="space-y-2">
                  <Label>Cobro en efectivo (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={g.CobroEfectivo ?? ""}
                    onChange={(e) => setG({ ...g, CobroEfectivo: e.target.value === "" ? null : Number(e.target.value) })}
                    disabled={readOnly}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Cobro en efectivo fuera del circuito habitual, sin IVA.
                  </p>
                </div>
              </div>
              </TabsContent>

              <TabsContent value="huespedes">
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Sin diseñar todavía — pendiente de definir qué campos van aquí.
                </div>
              </TabsContent>
            </Tabs>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between border-t pt-4">
              <Check
                label="Listo para check-in"
                checked={!!g.ReadyCheckIn}
                onChange={(v) => setG({ ...g, ReadyCheckIn: v })}
                disabled={readOnly}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                {!readOnly && (
                  <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
                )}
              </div>
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

function InfoSmall({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}

function InfoReadOnly({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-l-2 border-muted pl-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-center gap-2 text-sm", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

/**
 * Numeric field with a "propose, never force" suggestion: nothing pre-fills.
 * When the field is empty and a reference value is available, a chip lets
 * the user apply it explicitly. Once a value is saved, if the underlying
 * reference value later diverges, a note surfaces the drift instead of
 * silently overwriting the saved figure.
 */
function SuggestibleNumberField({
  label,
  value,
  propuesta,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  propuesta: number | null;
  unit: string;
  disabled?: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.01"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          disabled={disabled}
        />
        {!disabled && propuesta != null && value == null && (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => onChange(propuesta)}>
            Sugerido: {propuesta}{unit} · aplicar
          </Button>
        )}
      </div>
      {propuesta != null && value != null && propuesta !== value && (
        <p className="text-[11px] text-muted-foreground">
          Tarifa actual: {propuesta}{unit} (guardado: {value}{unit})
        </p>
      )}
    </div>
  );
}

function toLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
