import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { fetchLimpiadores } from "@/lib/catalogos";
import { fullName } from "@/lib/types";
import { Link2, Minus, Plus, RotateCcw, Trash2, X, Zap } from "lucide-react";
import { bedLabel } from "@/routes/programacion-limpiezas";
import { fmtTime } from "@/lib/format";
import { recalcOrdenesTrabajo } from "@/lib/recalc-ordenes";

export type Limpieza = {
  id_limpieza: number;
  numero_reserva: string | null;
  id_apt: number;
  fecha_limpieza: string;
  tipo: string | null;
  hora_out_time: string | null;
  hora_out_informed: boolean | null;
  hora_in_time: string | null;
  hora_in_informed: boolean | null;
  worker: number | null;
  orden_trabajo: number | null;
  hora_sugerida: string | null;
  prioritaria: boolean | null;
  prioritaria_manual: boolean | null;
  sfc_montar: boolean | null;
  sfc_montar_manual: boolean | null;
  sfc_desmontar: boolean | null;
  sfc_desmontar_manual: boolean | null;
  check_checkin: boolean | null;
  check_tasas: boolean | null;
  check_toallas: boolean | null;
  check_sabanas: boolean | null;
  check_limpieza_basica: boolean | null;
  check_limpieza_completa: boolean | null;
  observaciones: string | null;
  estado: string | null;
  motivo_anulacion: string | null;
  affected_by_kb_change: boolean | null;
};

type AptInfo = {
  id_apt: number;
  nombre: string;
  grupo_nombre?: string | null;
  camas_fijas?: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  apt: AptInfo;
  fecha: string; // YYYY-MM-DD
  existing: Limpieza | null;
  onSaved: () => void;
};

function emptyLimpieza(apt: AptInfo, fecha: string): Limpieza {
  return {
    id_limpieza: 0,
    numero_reserva: null,
    id_apt: apt.id_apt,
    fecha_limpieza: fecha,
    tipo: "salida",
    hora_out_time: null,
    hora_out_informed: false,
    hora_in_time: null,
    hora_in_informed: false,
    worker: null,
    orden_trabajo: null,
    hora_sugerida: null,
    prioritaria: false,
    prioritaria_manual: null,
    sfc_montar: false,
    sfc_montar_manual: null,
    sfc_desmontar: false,
    sfc_desmontar_manual: null,
    check_checkin: false,
    check_tasas: false,
    check_toallas: false,
    check_sabanas: false,
    check_limpieza_basica: false,
    check_limpieza_completa: false,
    observaciones: null,
    estado: "activa",
    motivo_anulacion: null,
    affected_by_kb_change: false,
  };
}

function parseHM(s: string | null | undefined): { h: number; m: number } | null {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
}

// Combine an ISO date (YYYY-MM-DD) and HH:MM[:SS] into a UTC-anchored Date
// (we only ever subtract two such Dates, so the tz anchor is irrelevant).
function combineDateTime(dateISO: string | null, time: string | null): Date | null {
  if (!dateISO) return null;
  const t = parseHM(time);
  if (!t) return null;
  const dm = dateISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dm) return null;
  return new Date(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), t.h, t.m, 0));
}

function fmtWindow(mins: number): string {
  if (mins < 0) return "Invalida";
  const totalH = Math.floor(mins / 60);
  const days = Math.floor(totalH / 24);
  const hours = totalH % 24;
  const m = mins % 60;
  const hm = m === 0 ? `${hours}h` : `${hours}h${String(m).padStart(2, "0")}`;
  return days > 0 ? `${days}d ${hm}` : hm;
}

export function LimpiezaPopover({ open, onOpenChange, apt, fecha, existing, onSaved }: Props) {
  const [form, setForm] = useState<Limpieza>(() => existing ?? emptyLimpieza(apt, fecha));
  const [saving, setSaving] = useState(false);
  const [anularOpen, setAnularOpen] = useState(false);

  useEffect(() => {
    if (open) setForm(existing ?? emptyLimpieza(apt, fecha));
  }, [open, existing, apt, fecha]);

  const limpiadoresQ = useQuery({ queryKey: ["limpiadores"], queryFn: fetchLimpiadores });

  // Shared-reservation detection
  const sharedQ = useQuery({
    queryKey: ["limpieza-shared", form.numero_reserva],
    enabled: !!form.numero_reserva,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_reservas_por_apartamento")
        .select("*")
        .eq("Número", form.numero_reserva!);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const anyShared = rows.some((r) => r.es_reserva_compartida);
      if (!anyShared) return { shared: false as const };
      const others = rows.filter((r) => r.id_apt !== apt.id_apt);
      const { data: kb } = await supabase
        .from("reservas_kb")
        .select('"Notas"')
        .eq("Número", form.numero_reserva!)
        .maybeSingle();
      return { shared: true as const, others, notas: (kb as any)?.Notas ?? null };
    },
  });

  const isPriority =
    form.prioritaria_manual !== null && form.prioritaria_manual !== undefined
      ? form.prioritaria_manual
      : !!form.prioritaria;

  // orden_trabajo siblings count
  const siblingsQ = useQuery({
    queryKey: ["limp-siblings", form.worker, form.fecha_limpieza],
    enabled: !!form.worker && !!form.fecha_limpieza,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("id_limpieza, orden_trabajo")
        .eq("worker", form.worker!)
        .eq("fecha_limpieza", form.fecha_limpieza)
        .eq("estado", "activa");
      if (error) throw error;
      return (data ?? []) as { id_limpieza: number; orden_trabajo: number | null }[];
    },
  });

  // The reservation's REAL checkout date is a fact about the reservation and
  // must NOT change when the gestor reschedules the cleaning (fecha_limpieza).
  const reservaQ = useQuery({
    queryKey: ["limp-reserva-kb", form.numero_reserva],
    enabled: !!form.numero_reserva,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservas_kb")
        .select('"Número","Check-out"')
        .eq("Número", form.numero_reserva!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { "Número": string; "Check-out": string | null } | null;
    },
  });
  const realCheckoutDate =
    reservaQ.data?.["Check-out"] ?? (form.tipo === "salida" ? form.fecha_limpieza : null);

  // Look up the genuinely NEXT reservation (strictly after the real checkout).
  const nextResQ = useQuery({
    queryKey: ["limp-next-res", apt.id_apt, realCheckoutDate, form.numero_reserva],
    enabled: !!realCheckoutDate && !!apt.id_apt,
    queryFn: async () => {
      const fecha = realCheckoutDate!;
      const end = new Date(fecha + "T00:00:00");
      end.setDate(end.getDate() + 14);
      const tz = end.getTimezoneOffset() * 60000;
      const endISO = new Date(end.getTime() - tz).toISOString().slice(0, 10);
      let q = supabase
        .from("v_reservas_por_apartamento")
        .select(`"Número","Check in","Hora estimada de llegada"`)
        .eq("id_apt", apt.id_apt)
        .not("Estado", "in", '("Cancelada","No show")')
        .gte("Check in", fecha)
        .lte("Check in", endISO);
      if (form.numero_reserva) q = q.neq("Número", form.numero_reserva);
      const { data, error } = await q
        .order("Check in", { ascending: true })
        .order("Hora estimada de llegada", { ascending: true, nullsFirst: true })
        .limit(1);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ "Número": string; "Check in": string }>;
      return rows[0] ?? null;
    },
  });

  const checkoutDT = combineDateTime(realCheckoutDate, form.hora_out_time);
  const checkinDT = combineDateTime(
    nextResQ.data?.["Check in"] ?? null,
    form.hora_in_time,
  );
  const winMinsAdj =
    checkoutDT && checkinDT
      ? Math.round((checkinDT.getTime() - checkoutDT.getTime()) / 60000)
      : null;
  const winCritical = winMinsAdj != null && winMinsAdj >= 0 && winMinsAdj < 150;

  const set = <K extends keyof Limpieza>(k: K, v: Limpieza[K]) => setForm((f) => ({ ...f, [k]: v }));

  const togglePriority = () => {
    set("prioritaria_manual", !isPriority);
  };

  const onChangeWorker = async (val: string) => {
    const newWorker = val === "__none__" ? null : Number(val);
    if (newWorker == null) {
      setForm((f) => ({ ...f, worker: null, orden_trabajo: null }));
      return;
    }
    // append as last
    const { data } = await supabase
      .from("limpiezas")
      .select("orden_trabajo")
      .eq("worker", newWorker)
      .eq("fecha_limpieza", form.fecha_limpieza)
      .eq("estado", "activa");
    const next = ((data ?? []).length) + 1;
    setForm((f) => ({ ...f, worker: newWorker, orden_trabajo: next }));
  };

  const stepOrden = async (delta: number) => {
    if (!form.worker || form.orden_trabajo == null) return;
    const target = form.orden_trabajo + delta;
    if (target < 1) return;
    const siblings = siblingsQ.data ?? [];
    const collision = siblings.find(
      (s) => s.id_limpieza !== form.id_limpieza && s.orden_trabajo === target,
    );
    if (collision && form.id_limpieza > 0) {
      // swap in DB
      const oldOrden = form.orden_trabajo;
      const { error: e1 } = await supabase
        .from("limpiezas")
        .update({ orden_trabajo: oldOrden })
        .eq("id_limpieza", collision.id_limpieza);
      if (e1) { toast.error(e1.message); return; }
      const { error: e2 } = await supabase
        .from("limpiezas")
        .update({ orden_trabajo: target })
        .eq("id_limpieza", form.id_limpieza);
      if (e2) { toast.error(e2.message); return; }
      set("orden_trabajo", target);
      siblingsQ.refetch();
      onSaved();
    } else {
      set("orden_trabajo", target);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const prevWorker = existing?.worker ?? null;
      const prevFecha = existing?.fecha_limpieza ?? null;
      const payload: any = {
        numero_reserva: form.numero_reserva,
        id_apt: form.id_apt,
        fecha_limpieza: form.fecha_limpieza,
        tipo: form.tipo,
        hora_out_time: form.hora_out_time,
        hora_out_informed: form.hora_out_informed,
        hora_in_time: form.hora_in_time,
        hora_in_informed: form.hora_in_informed,
        worker: form.worker,
        orden_trabajo: form.orden_trabajo,
        hora_sugerida: form.hora_sugerida,
        prioritaria: form.prioritaria,
        prioritaria_manual: form.prioritaria_manual,
        sfc_montar: form.sfc_montar,
        sfc_montar_manual: form.sfc_montar_manual,
        sfc_desmontar: form.sfc_desmontar,
        sfc_desmontar_manual: form.sfc_desmontar_manual,
        check_checkin: form.check_checkin,
        check_tasas: form.check_tasas,
        check_toallas: form.check_toallas,
        check_sabanas: form.check_sabanas,
        check_limpieza_basica: form.check_limpieza_basica,
        check_limpieza_completa: form.check_limpieza_completa,
        observaciones: form.observaciones,
        estado: form.estado ?? "activa",
      };
      if (form.id_limpieza > 0) {
        const { error } = await supabase.from("limpiezas").update(payload).eq("id_limpieza", form.id_limpieza);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("limpiezas").insert(payload);
        if (error) throw error;
      }
      // Recompute orden_trabajo for affected worker+date buckets.
      const buckets = new Set<string>();
      if (form.worker != null) buckets.add(`${form.worker}|${form.fecha_limpieza}`);
      if (prevWorker != null && prevFecha) buckets.add(`${prevWorker}|${prevFecha}`);
      for (const key of buckets) {
        const [w, f] = key.split("|");
        try { await recalcOrdenesTrabajo(Number(w), f); } catch { /* non-blocking */ }
      }
      toast.success("Limpieza guardada");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const workerObj = limpiadoresQ.data?.find((p) => p.id_persona === form.worker);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="text-base">{apt.nombre}</DialogTitle>
            {(apt.grupo_nombre || apt.camas_fijas != null) && (
              <DialogDescription className="text-xs">
                {apt.grupo_nombre}
                {apt.grupo_nombre && apt.camas_fijas != null ? " · " : ""}
                {apt.camas_fijas != null ? bedLabel(apt.camas_fijas) : ""}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="overflow-y-auto px-4 py-3 space-y-4">
            {/* Cancellation reason (read-only) */}
            {form.estado === "anulada" && (
              <div className="rounded-md border border-muted bg-muted/40 p-3 text-xs">
                <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">
                  Limpieza anulada
                </div>
                <div className="text-foreground">
                  <span className="text-muted-foreground">Motivo de anulación:</span>{" "}
                  {form.motivo_anulacion ?? "—"}
                </div>
              </div>
            )}
            {/* Shared reservation warning */}
            {sharedQ.data?.shared && (
              <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-xs space-y-2">
                <div className="font-semibold flex items-center gap-1 text-orange-900">
                  <Link2 className="h-3.5 w-3.5" /> Reserva compartida entre apartamentos
                </div>
                <div className="text-orange-800">
                  Otros apartamentos:{" "}
                  {sharedQ.data.others.map((o: any) => o.id_apt).join(", ") || "—"}
                </div>
                {sharedQ.data.notas && (
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-[11px] font-mono border border-orange-200">
                    {sharedQ.data.notas}
                  </pre>
                )}
                <div className="text-[11px] text-orange-700">
                  El número de huéspedes es para la reserva completa, no solo este apartamento.
                </div>
              </div>
            )}

            {/* Horarios */}
            <section>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Horarios</Label>
              <div className="mt-2 space-y-1.5">
                <HoraRow
                  label="Sale (checkout)"
                  dateLabel={realCheckoutDate ? fmtDate(realCheckoutDate) : fmtDate(form.fecha_limpieza)}
                  time={form.hora_out_time}
                  informed={!!form.hora_out_informed}
                />
                <HoraRow
                  label="Entra (próx. reserva)"
                  dateLabel={
                    nextResQ.data?.["Check in"]
                      ? fmtDate(nextResQ.data["Check in"])
                      : "—"
                  }
                  time={form.hora_in_time}
                  informed={!!form.hora_in_informed}
                  emptyText="— sin reserva en 7 días"
                />
              </div>
            </section>

            {/* Ventana */}
            <section>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ventana de limpieza</Label>
              <div
                className={cn(
                  "mt-2 block w-full rounded-md px-3 py-2 text-sm font-semibold text-center",
                  winMinsAdj == null
                    ? "bg-muted text-muted-foreground"
                    : winCritical
                      ? "bg-amber-200 text-amber-900"
                      : "bg-teal-200 text-teal-900",
                )}
              >
                {winMinsAdj == null
                  ? "Sin próxima entrada en 7 días"
                  : fmtWindow(winMinsAdj)}
              </div>
            </section>

            {/* Fecha + prioritaria */}
            <section>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Fecha de la limpieza
              </Label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="date"
                  value={form.fecha_limpieza}
                  onChange={(e) => set("fecha_limpieza", e.target.value)}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={togglePriority}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors",
                    isPriority
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Zap className="h-3 w-3" /> Prioritaria
                </button>
              </div>
            </section>

            {/* Orden de trabajo */}
            {form.worker && (
              <section>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Orden de trabajo {workerObj ? `— ${workerObj.nombre ?? ""}` : ""}
                </Label>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => stepOrden(-1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <div className="min-w-16 text-center text-sm">
                      <span className="font-semibold">{form.orden_trabajo ?? "—"}</span>
                      <span className="text-muted-foreground"> de {siblingsQ.data?.length ?? 0}</span>
                    </div>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => stepOrden(1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <Input
                    placeholder="--:--"
                    value={form.hora_sugerida ?? ""}
                    onChange={(e) => set("hora_sugerida", e.target.value || null)}
                    className="flex-1"
                  />
                </div>
              </section>
            )}

            {/* Tareas */}
            <section>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tareas</Label>
              <div className="mt-2 space-y-2">
                <TaskRow
                  label="Montar sofá cama"
                  checked={!!form.sfc_montar}
                  onChange={(v) => setForm((f) => ({ ...f, sfc_montar: v, sfc_montar_manual: v }))}
                  manualSet={form.sfc_montar_manual !== null && form.sfc_montar_manual !== undefined}
                />
                <TaskRow
                  label="Desmontar sofá cama"
                  checked={!!form.sfc_desmontar}
                  onChange={(v) => setForm((f) => ({ ...f, sfc_desmontar: v, sfc_desmontar_manual: v }))}
                  manualSet={form.sfc_desmontar_manual !== null && form.sfc_desmontar_manual !== undefined}
                />
                <TaskRow
                  label="Realizar check-in"
                  checked={!!form.check_checkin}
                  onChange={(v) => set("check_checkin", v)}
                />
                <TaskRow
                  label="Cobrar tasas turísticas"
                  checked={!!form.check_tasas}
                  onChange={(v) => set("check_tasas", v)}
                />
              </div>
            </section>

            {/* Asignar limpiador */}
            <section>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Asignar limpiador
              </Label>
              <Select
                value={form.worker == null ? "__none__" : String(form.worker)}
                onValueChange={onChangeWorker}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {limpiadoresQ.data?.map((p) => (
                    <SelectItem key={p.id_persona} value={String(p.id_persona)}>
                      {fullName(p)}
                      {p.codigo ? ` (${p.codigo})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            {/* Observaciones */}
            <section>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Observaciones
              </Label>
              <Textarea
                rows={2}
                placeholder="Notas para el limpiador..."
                className="mt-2"
                value={form.observaciones ?? ""}
                onChange={(e) => set("observaciones", e.target.value || null)}
              />
            </section>
          </div>

          <DialogFooter className="px-4 py-3 border-t flex-row sm:justify-between gap-2">
            {form.estado === "anulada" ? (
              <>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  disabled={saving || form.id_limpieza === 0}
                  onClick={async () => {
                    if (!window.confirm("¿Borrar definitivamente esta limpieza? Esta acción no se puede deshacer.")) return;
                    setSaving(true);
                    try {
                      const { error } = await supabase
                        .from("limpiezas")
                        .delete()
                        .eq("id_limpieza", form.id_limpieza);
                      if (error) throw error;
                      toast.success("Limpieza borrada");
                      onSaved();
                      onOpenChange(false);
                    } catch (e) {
                      toast.error("Error: " + (e as Error).message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Borrar
                </Button>
                <Button
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  disabled={saving || form.id_limpieza === 0}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const { error } = await supabase
                        .from("limpiezas")
                        .update({ estado: "activa", motivo_anulacion: null })
                        .eq("id_limpieza", form.id_limpieza);
                      if (error) throw error;
                      setForm((f) => ({ ...f, estado: "activa", motivo_anulacion: null }));
                      toast.success("Limpieza reactivada");
                      onSaved();
                    } catch (e) {
                      toast.error("Error: " + (e as Error).message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-1" /> Reactivar limpieza
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => setAnularOpen(true)}
                  disabled={form.id_limpieza === 0}
                >
                  <X className="h-4 w-4 mr-1" /> Anular limpieza
                </Button>
                <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnularDialog
        open={anularOpen}
        onOpenChange={setAnularOpen}
        apt={apt}
        fecha={form.fecha_limpieza}
        onConfirm={async (motivo, detalle) => {
          const motivoText = detalle ? `${motivo} — ${detalle}` : motivo;
          const { error } = await supabase
            .from("limpiezas")
            .update({ estado: "anulada", worker: null, motivo_anulacion: motivoText })
            .eq("id_limpieza", form.id_limpieza);
          if (error) {
            toast.error(error.message);
            return;
          }
          toast.success("Limpieza anulada");
          setAnularOpen(false);
          onOpenChange(false);
          onSaved();
        }}
      />
    </>
  );
}

function HoraRow({
  label,
  dateLabel,
  time,
  informed,
  emptyText,
}: {
  label: string;
  dateLabel: string;
  time: string | null;
  informed: boolean;
  emptyText?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-44 text-muted-foreground">{label}</span>
      <span className="text-xs rounded bg-muted px-1.5 py-0.5">{dateLabel}</span>
      {time ? (
        <span
          className={cn(
            "text-xs font-semibold rounded px-1.5 py-0.5",
            informed ? "bg-emerald-500 text-white" : "bg-gray-300 text-gray-700",
          )}
        >
          {fmtTime(time)}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground italic">{emptyText ?? "—"}</span>
      )}
    </div>
  );
}

function TaskRow({
  label,
  checked,
  onChange,
  manualSet,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  manualSet?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span className="flex-1">{label}</span>
      {manualSet !== undefined && (
        <span
          className={cn(
            "text-[10px] rounded px-1.5 py-0.5",
            manualSet ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground",
          )}
        >
          {manualSet ? "editado" : "auto"}
        </span>
      )}
    </label>
  );
}

function AnularDialog({
  open,
  onOpenChange,
  apt,
  fecha,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  apt: AptInfo;
  fecha: string;
  onConfirm: (motivo: string, detalle: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setMotivo("");
      setDetalle("");
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-orange-700">⚠ Anular limpieza</DialogTitle>
          <DialogDescription>
            {apt.nombre} — {fmtDate(fecha)}. Se eliminará la asignación y la limpieza quedará marcada
            como anulada (seguirá visible para el registro).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecciona un motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Huésped amplió estancia">Huésped amplió estancia</SelectItem>
                <SelectItem value="Huésped rechazó limpieza intermedia">
                  Huésped rechazó limpieza intermedia
                </SelectItem>
                <SelectItem value="Reserva cancelada">Reserva cancelada</SelectItem>
                <SelectItem value="Otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Detalle (opcional)</Label>
            <Textarea
              rows={2}
              className="mt-1"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!motivo || busy}
            className="bg-red-600 hover:bg-red-700"
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(motivo, detalle);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar anulación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}