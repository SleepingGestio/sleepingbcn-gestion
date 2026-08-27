import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { X } from "lucide-react";
import { EstadoBadge } from "@/components/estado-badge";
import { fetchReserva, upsertGestio } from "@/lib/reservas";
import { fetchReservaExtras, saveReservaExtras } from "@/lib/reserva-extras";
import { fetchAgentes, fetchLimpiadores } from "@/lib/catalogos";
import {
  fetchCanalesReserva, fetchTarifasCobroCanal, fetchTarifasComisionOta, fetchTarifasLimpieza,
} from "@/lib/tarifas";
import {
  fullName, type Reserva, type ReservaGestio, type ReservaExtra, type ReservaExtraDraft,
} from "@/lib/types";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { fmtDate, fmtEUR, fmtNum2, resolveTime } from "@/lib/format";
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
  const [extras, setExtras] = useState<ReservaExtraDraft[]>([]);
  const [extrasOriginal, setExtrasOriginal] = useState<ReservaExtra[]>([]);
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
  // KB's imported tourist-tax figure — shown only as a reference next to the
  // (editable, often corrected) Tasa turística field. NaN when absent/non-numeric.
  const tasaKB = reserva ? Number(reserva["Cargo tasa turística"]) : NaN;

  // Resolved by exact-match: canales_reserva.nombre <-> reservas_kb.Portal, same
  // convention as apartamentos.nombre <-> Habitaciones. A spelling mismatch just
  // means no suggestion — never an error. The full record (not just the id) is
  // kept because its modo_comision drives which commission formula applies below.
  const canal = useMemo(() => {
    const portal = reserva?.["Portal"];
    if (!portal) return null;
    return canalesQ.data?.find((c) => c.nombre === portal) ?? null;
  }, [reserva, canalesQ.data]);
  const idCanal = canal?.id_canal ?? null;
  const modoComision = canal?.modo_comision ?? "bruto";

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

  // Two-column ledger. Pagado estancia / limpieza always land in Con IVA;
  // each extra lands in exactly one column per its own toggle.
  const ledger = useMemo(() => {
    const extrasSin = extras.filter((e) => !e.con_iva).reduce((s, e) => s + (e.importe ?? 0), 0);
    const extrasCon = extras.filter((e) => e.con_iva).reduce((s, e) => s + (e.importe ?? 0), 0);
    const sinIva = extrasSin;
    const conIva = (g.PagadoEstancia ?? 0) + (g.PagadoLimpieza ?? 0) + extrasCon;
    return { sinIva, conIva, total: sinIva + conIva };
  }, [g.PagadoEstancia, g.PagadoLimpieza, extras]);

  // Commission amounts derived FROM the %, per the channel's modo_comision.
  // base = KB "Cargo estancia" + Pagado limpieza (verified to the cent).
  //   bruto (Booking): (pOta + pCobro) · base
  //   neto  (Airbnb/Expedia): pOta · base / (1 − pOta);  pCobro does not apply.
  const comision = useMemo(() => {
    const base = (Number(reserva?.["Cargo estancia"]) || 0) + (g.PagadoLimpieza ?? 0);
    const pOta = (g.PctComisionOTA ?? 0) / 100;
    const pCobro = (g.PctPorCobro ?? 0) / 100;
    if (modoComision === "neto") {
      const ota = pOta > 0 && pOta < 1 ? (pOta * base) / (1 - pOta) : 0;
      return { ota, cobro: 0, total: ota, aplicaCobro: false };
    }
    return { ota: pOta * base, cobro: pCobro * base, total: (pOta + pCobro) * base, aplicaCobro: true };
  }, [reserva, g.PagadoLimpieza, g.PctComisionOTA, g.PctPorCobro, modoComision]);

  useEffect(() => {
    if (!numero || !open) return;
    setReserva(null);
    setExtras([]);
    setExtrasOriginal([]);
    fetchReserva(numero).then((r) => {
      setReserva(r);
      const gestio: Partial<ReservaGestio> = r?.gestio ?? {};
      // One-time prefill (local state only, not a DB write): for a reservation
      // nobody has closed yet, seed Pagado estancia with the real gross stay
      // amount the client paid (cleaning excluded). For bruto channels KB
      // "Cargo estancia" is that figure directly; for neto channels (Airbnb/
      // Expedia) it's already net of the OTA's cut, so add back KB's own
      // "Comisiones retenidas" — the commission actually withheld for that
      // exact reservation. That field is verified 0 on every non-withholding
      // channel (Booking 459/459, FrontOffice 31/31, Motor de Reserva 2/2),
      // so the single formula is correct everywhere — no modo_comision branch.
      // A saved value is never overwritten — same "don't rewrite a closed
      // figure" principle as the suggestion chips, just without the click.
      const cargoEstancia = r?.["Cargo estancia"];
      const comisionesRetenidas = r?.["Comisiones retenidas"];
      const prefill =
        typeof cargoEstancia === "number" && Number.isFinite(cargoEstancia)
          ? cargoEstancia +
            (typeof comisionesRetenidas === "number" && Number.isFinite(comisionesRetenidas) ? comisionesRetenidas : 0)
          : null;
      // Tasa turística: KB "Cargo tasa turística" is frequently wrong and is
      // corrected here. Seed it exactly like Pagado estancia — only when
      // nothing is saved yet, never overwriting a corrected value.
      const cargoTasa = r?.["Cargo tasa turística"];
      const tasaPrefill = typeof cargoTasa === "number" && Number.isFinite(cargoTasa) ? cargoTasa : null;
      setG({
        ...gestio,
        PagadoEstancia: gestio.PagadoEstancia ?? prefill,
        TasaTuristica: gestio.TasaTuristica ?? tasaPrefill,
      });
    });
    fetchReservaExtras(numero).then((rows) => {
      setExtrasOriginal(rows);
      setExtras(rows.map((x) => ({
        id_extra: x.id_extra, concepto: x.concepto, importe: x.importe, con_iva: x.con_iva,
      })));
    });
  }, [numero, open]);

  function patchExtra(i: number, patch: Partial<ReservaExtraDraft>) {
    setExtras((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }

  async function save() {
    if (readOnly || !numero) return;
    setSaving(true);
    try {
      await upsertGestio({ "Número": numero, ...g });
      await saveReservaExtras(numero, extras, extrasOriginal);
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
              {/* ── Cobros del cliente: columnas Sin IVA / Con IVA ── */}
              <div className="overflow-hidden rounded-md border">
                <div className="flex items-center gap-2.5 bg-muted px-3.5 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <div className="flex-1">Concepto</div>
                  <div className="w-[78px] text-right">Sin IVA</div>
                  <div className="w-[78px] text-right">Con IVA</div>
                  <div className="w-3.5 shrink-0" />
                </div>

                {/* Pagado estancia — siempre Con IVA */}
                <div className="flex items-center gap-2.5 border-t px-3.5 py-2.5">
                  <div className="flex-1 text-sm">Pagado estancia</div>
                  <div className="w-[78px] shrink-0" />
                  <LedgerInput
                    value={g.PagadoEstancia}
                    disabled={readOnly}
                    onChange={(v) => setG({ ...g, PagadoEstancia: v })}
                  />
                  <div className="w-3.5 shrink-0 text-[13px] text-muted-foreground">€</div>
                </div>

                {/* Pagado limpieza — Con IVA; chip de sugerencia en línea con la etiqueta */}
                <div className="flex items-center gap-2.5 border-t px-3.5 py-2.5">
                  <div className="flex flex-1 items-center gap-2 text-sm">
                    <span>Pagado limpieza</span>
                    {!readOnly && propuestaLimpieza != null && g.PagadoLimpieza == null && (
                      <button
                        type="button"
                        className="whitespace-nowrap text-[11px] text-primary hover:underline"
                        onClick={() => setG({ ...g, PagadoLimpieza: propuestaLimpieza })}
                      >
                        Sugerido: {propuestaLimpieza} € · aplicar
                      </button>
                    )}
                  </div>
                  <div className="w-[78px] shrink-0" />
                  <LedgerInput
                    value={g.PagadoLimpieza}
                    disabled={readOnly}
                    onChange={(v) => setG({ ...g, PagadoLimpieza: v })}
                  />
                  <div className="w-3.5 shrink-0 text-[13px] text-muted-foreground">€</div>
                </div>
                {propuestaLimpieza != null && g.PagadoLimpieza != null && propuestaLimpieza !== g.PagadoLimpieza && (
                  <div className="px-3.5 pb-1 text-[11px] text-muted-foreground">
                    Tarifa actual: {propuestaLimpieza} € (guardado: {g.PagadoLimpieza} €)
                  </div>
                )}

                {/* Extras — líneas repetibles */}
                <div className="border-t px-3.5 pb-0.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Extras
                </div>
                {extras.map((e, i) => (
                  <div key={e.id_extra ?? `new-${i}`} className="flex items-center gap-2.5 px-3.5 py-1.5">
                    <input
                      className="min-w-0 flex-1 border-0 border-b-[1.5px] border-input bg-transparent py-0.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-60"
                      placeholder="Concepto"
                      value={e.concepto}
                      disabled={readOnly}
                      onChange={(ev) => patchExtra(i, { concepto: ev.target.value })}
                    />
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Switch
                        className="scale-90"
                        checked={e.con_iva}
                        disabled={readOnly}
                        onCheckedChange={(v) => patchExtra(i, { con_iva: !!v })}
                      />
                      IVA
                    </label>
                    {e.con_iva ? (
                      <div className="w-[78px] shrink-0" />
                    ) : (
                      <LedgerInput sm value={e.importe} disabled={readOnly} onChange={(v) => patchExtra(i, { importe: v })} />
                    )}
                    {e.con_iva ? (
                      <LedgerInput sm value={e.importe} disabled={readOnly} onChange={(v) => patchExtra(i, { importe: v })} />
                    ) : (
                      <div className="w-[78px] shrink-0" />
                    )}
                    <div className="w-3.5 shrink-0 text-[13px] text-muted-foreground">€</div>
                    {!readOnly && (
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        title="Quitar línea"
                        onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <button
                    type="button"
                    className="mx-3.5 mb-2.5 mt-1 flex items-center gap-1.5 py-1 text-[12px] text-primary hover:underline"
                    onClick={() => setExtras([...extras, { concepto: "", importe: null, con_iva: false }])}
                  >
                    <span className="text-sm font-bold leading-none">+</span> Añadir línea de extra
                  </button>
                )}

                {/* Subtotal por columna */}
                <div className="flex items-center gap-2.5 border-t bg-muted/40 px-3.5 py-2 text-[12px] font-semibold text-muted-foreground">
                  <div className="flex-1">Subtotal</div>
                  <div className="w-[78px] shrink-0 text-right tabular-nums">{fmtNum2(ledger.sinIva)}</div>
                  <div className="w-[78px] shrink-0 text-right tabular-nums">{fmtNum2(ledger.conIva)}</div>
                  <div className="w-3.5 shrink-0" />
                </div>
              </div>

              {/* ── Total pagado por el cliente: triple resumen ── */}
              <div className="flex gap-2.5">
                <TotalCard label="Sin IVA" value={ledger.sinIva} />
                <TotalCard label="Con IVA" value={ledger.conIva} />
                <TotalCard label="Total pagado" value={ledger.total} highlight />
              </div>

              {/* ── Comisiones (se restan del total) ── */}
              <div className="overflow-hidden rounded-md border">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <div className="w-3.5 shrink-0 text-center text-[15px] font-semibold text-muted-foreground">−</div>
                  <div className="flex flex-1 items-center gap-2 text-sm">
                    <span>Comisión OTA</span>
                    <input
                      className="w-11 border-0 border-b-[1.5px] border-input bg-transparent py-px text-right text-[13px] outline-none focus:border-primary disabled:opacity-60"
                      type="number"
                      step="0.01"
                      value={g.PctComisionOTA ?? ""}
                      disabled={readOnly}
                      onChange={(e) => setG({ ...g, PctComisionOTA: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                    <span className="text-[13px] text-muted-foreground">%</span>
                    {!readOnly && propuestaComision != null && g.PctComisionOTA == null && (
                      <button
                        type="button"
                        className="whitespace-nowrap text-[11px] text-primary hover:underline"
                        onClick={() => setG({ ...g, PctComisionOTA: propuestaComision })}
                      >
                        Sugerido: {propuestaComision}% · aplicar
                      </button>
                    )}
                  </div>
                  <div className="w-[90px] shrink-0 text-right text-sm tabular-nums">{fmtNum2(comision.ota)}</div>
                  <div className="w-3.5 shrink-0 text-[13px] text-muted-foreground">€</div>
                </div>

                <div className="flex items-center gap-2.5 border-t px-3.5 py-2.5">
                  <div className="w-3.5 shrink-0 text-center text-[15px] font-semibold text-muted-foreground">−</div>
                  {comision.aplicaCobro ? (
                    <>
                      <div className="flex flex-1 items-center gap-2 text-sm">
                        <span>Comisión por cobro</span>
                        <input
                          className="w-11 border-0 border-b-[1.5px] border-input bg-transparent py-px text-right text-[13px] outline-none focus:border-primary disabled:opacity-60"
                          type="number"
                          step="0.01"
                          value={g.PctPorCobro ?? ""}
                          disabled={readOnly}
                          onChange={(e) => setG({ ...g, PctPorCobro: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                        <span className="text-[13px] text-muted-foreground">%</span>
                        {!readOnly && propuestaCobro != null && g.PctPorCobro == null && (
                          <button
                            type="button"
                            className="whitespace-nowrap text-[11px] text-primary hover:underline"
                            onClick={() => setG({ ...g, PctPorCobro: propuestaCobro })}
                          >
                            Sugerido: {propuestaCobro}% · aplicar
                          </button>
                        )}
                      </div>
                      <div className="w-[90px] shrink-0 text-right text-sm tabular-nums">{fmtNum2(comision.cobro)}</div>
                      <div className="w-3.5 shrink-0 text-[13px] text-muted-foreground">€</div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 text-sm text-muted-foreground">
                        Comisión por cobro <span className="text-[12px]">· no aplica en este canal</span>
                      </div>
                      <div className="w-[90px] shrink-0 text-right text-sm text-muted-foreground">0%</div>
                      <div className="w-3.5 shrink-0 text-[13px] text-muted-foreground">—</div>
                    </>
                  )}
                </div>
              </div>
              {((propuestaComision != null && g.PctComisionOTA != null && propuestaComision !== g.PctComisionOTA) ||
                (comision.aplicaCobro && propuestaCobro != null && g.PctPorCobro != null && propuestaCobro !== g.PctPorCobro)) && (
                <div className="space-y-0.5 px-1 text-[11px] text-muted-foreground">
                  {propuestaComision != null && g.PctComisionOTA != null && propuestaComision !== g.PctComisionOTA && (
                    <div>Comisión OTA — tarifa actual: {propuestaComision}% (guardado: {g.PctComisionOTA}%)</div>
                  )}
                  {comision.aplicaCobro && propuestaCobro != null && g.PctPorCobro != null && propuestaCobro !== g.PctPorCobro && (
                    <div>Comisión por cobro — tarifa actual: {propuestaCobro}% (guardado: {g.PctPorCobro}%)</div>
                  )}
                </div>
              )}

              {/* ── Tasa turística — informativa, fuera de la cuenta ── */}
              <div className="space-y-2 rounded-md border border-dashed bg-muted/60 px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tasa turística</div>

                <div className="flex items-center gap-2.5">
                  <div className="flex-1 text-sm">Importe esperado</div>
                  <LedgerInput
                    value={g.TasaTuristica}
                    disabled={readOnly}
                    onChange={(v) => setG({ ...g, TasaTuristica: v })}
                  />
                  <div className="w-3.5 shrink-0 text-[13px] text-muted-foreground">€</div>
                </div>
                {Number.isFinite(tasaKB) && g.TasaTuristica != null && tasaKB !== g.TasaTuristica && (
                  <div className="text-[11px] text-muted-foreground">
                    KB importó: {fmtNum2(tasaKB)} € (corregido: {fmtNum2(g.TasaTuristica)} €)
                  </div>
                )}

                <div className="flex items-center gap-2.5">
                  <div className="flex-1 text-sm">Importe cobrado</div>
                  <LedgerInput
                    value={g.TasaTuristicaCobrada}
                    disabled={readOnly}
                    onChange={(v) => setG({ ...g, TasaTuristicaCobrada: v })}
                  />
                  <div className="w-3.5 shrink-0 text-[13px] text-muted-foreground">€</div>
                </div>

                <div className="text-[11px] text-muted-foreground">
                  Informativa — no forma parte de la cuenta ni de las comisiones.
                </div>
              </div>

              {/* ── Cuenta verificada y cerrada (ámbito: esta pestaña) ── */}
              <div className="border-t pt-3">
                <Check
                  label="Cuenta verificada y cerrada"
                  checked={!!g.CuentaVerificada}
                  onChange={(v) => setG({ ...g, CuentaVerificada: v })}
                  disabled={readOnly}
                />
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

/** Borderless right-aligned numeric cell for the Sin IVA / Con IVA ledger. */
function LedgerInput({
  value,
  onChange,
  disabled,
  sm,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  sm?: boolean;
}) {
  return (
    <input
      type="number"
      step="0.01"
      inputMode="decimal"
      className={cn(
        "w-[78px] shrink-0 border-0 border-b-[1.5px] border-input bg-transparent py-0.5 text-right tabular-nums outline-none focus:border-primary disabled:opacity-60",
        sm ? "text-[13px]" : "text-sm",
      )}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    />
  );
}

/** One of the three "Total pagado por el cliente" summary cards. */
function TotalCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "flex-1 rounded-md p-2.5 text-center",
        highlight ? "border border-primary/35 bg-primary/10" : "bg-muted",
      )}
    >
      <div className={cn("text-[10px] uppercase tracking-wide", highlight ? "text-primary" : "text-muted-foreground")}>
        {label}
      </div>
      <div className="mt-0.5 text-[15px] font-bold tabular-nums">{fmtEUR(value)}</div>
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
