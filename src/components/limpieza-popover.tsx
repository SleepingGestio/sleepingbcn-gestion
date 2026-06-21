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
import { Link2, RotateCcw, Trash2, X, Zap } from "lucide-react";
import { bedLabel } from "@/routes/programacion-limpiezas";
import { fmtTime } from "@/lib/format";

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
  affected_reason: string | null;
  proxima_reserva_numero: string | null;
};

type AptInfo = {
  id_apt: number;
  nombre: string;
  grupo_nombre?: string | null;
  camas_fijas?: number | null;
  tiene_sofa_cama?: boolean | null;
};

type ReservaPopoverRow = {
  "Número": string;
  "Check in": string | null;
  "Check-out": string | null;
  "Huéspedes": number | null;
  "Estado": string | null;
  "Hora estimada de llegada": string | null;
  "Hora estimada de salida": string | null;
  id_apt: number | null;
  es_reserva_compartida: boolean | null;
};

type GestioTimes = {
  "Número": string;
  HCheckInConf: string | null;
  HCheckOutConf: string | null;
};

type Props = {
  open: boolean;
  loadKey: number;
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
    affected_reason: null,
    proxima_reserva_numero: null,
  };
}

// Normal lifecycle states for cleaning lookups (Confirmada → Check-in
// realizado → Check-out realizado). Cancelada / No show are problem states.
const ESTADOS_VALID = ["Confirmada", "Check-in realizado", "Check-out realizado"] as const;
const ESTADOS_VALID_FILTER = `(${ESTADOS_VALID.map((e) => `"${e}"`).join(",")})`;

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function normalizeLimpieza(row: Partial<Limpieza> | null | undefined, apt: AptInfo, fecha: string): Limpieza {
  return {
    ...emptyLimpieza(apt, fecha),
    ...(row ?? {}),
    id_apt: row?.id_apt ?? apt.id_apt,
    fecha_limpieza: row?.fecha_limpieza ?? fecha,
    tipo: row?.tipo ?? "salida",
  };
}

function parseHM(s: string | null | undefined): { h: number; m: number } | null {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
}

function resolveTime(
  conf: string | null,
  estimada: string | null,
  defaultVal: string,
): { value: string; informed: boolean } {
  const c = parseHM(conf);
  if (c) return { value: `${String(c.h).padStart(2, "0")}:${String(c.m).padStart(2, "0")}:00`, informed: true };
  const e = parseHM(estimada);
  if (e) return { value: `${String(e.h).padStart(2, "0")}:${String(e.m).padStart(2, "0")}:00`, informed: true };
  return { value: defaultVal, informed: false };
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

export function LimpiezaPopover({ open, loadKey, onOpenChange, apt, fecha, existing, onSaved }: Props) {
  const [form, setForm] = useState<Limpieza>(() => emptyLimpieza(apt, fecha));
  const [loaded, setLoaded] = useState(false);
  const [realCheckoutDate, setRealCheckoutDate] = useState<string | null>(null);
  const [nextReservation, setNextReservation] = useState<ReservaPopoverRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [anularOpen, setAnularOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(emptyLimpieza(apt, fecha));
    setRealCheckoutDate(null);
    setNextReservation(null);
    setSaving(false);
    setAnularOpen(false);
    setLoaded(false);
  }, [open, loadKey, apt.id_apt, fecha, existing?.id_limpieza]);

  const popoverDataQ = useQuery({
    queryKey: [
      "limpieza-popover-data",
      apt.id_apt,
      fecha,
      existing?.id_limpieza ?? 0,
      existing?.numero_reserva ?? null,
      existing?.tipo ?? "salida",
      loadKey,
    ],
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const freshExisting = existing?.id_limpieza
        ? await supabase
            .from("limpiezas")
            .select("*")
            .eq("id_limpieza", existing.id_limpieza)
            .maybeSingle()
        : { data: null, error: null };
      if (freshExisting.error) throw freshExisting.error;
      const persisted = normalizeLimpieza((freshExisting.data as Partial<Limpieza> | null) ?? existing, apt, fecha);
      if (persisted.tipo === "intermedia") {
        return {
          form: {
            ...persisted,
            tipo: "intermedia",
            check_toallas: persisted.check_toallas ?? true,
            check_sabanas: persisted.check_sabanas ?? true,
            check_limpieza_basica: persisted.check_limpieza_basica ?? true,
            check_limpieza_completa: persisted.check_limpieza_completa ?? false,
          },
          realCheckoutDate: null,
          nextReservation: null,
          fresh: null,
          stored: null,
          reason: null,
        };
      }

      let current: ReservaPopoverRow | null = null;
      if (persisted.numero_reserva) {
        const { data, error } = await supabase
          .from("v_reservas_por_apartamento")
          .select(`"Número","Check in","Check-out","Huéspedes","Estado","Hora estimada de llegada","Hora estimada de salida",id_apt,es_reserva_compartida`)
          .eq("id_apt", apt.id_apt)
          .eq("Número", persisted.numero_reserva)
          .limit(1);
        if (error) throw error;
        current = ((data ?? [])[0] ?? null) as ReservaPopoverRow | null;
      } else {
        const { data, error } = await supabase
          .from("v_reservas_por_apartamento")
          .select(`"Número","Check in","Check-out","Huéspedes","Estado","Hora estimada de llegada","Hora estimada de salida",id_apt,es_reserva_compartida`)
          .eq("id_apt", apt.id_apt)
          .in("Estado", ESTADOS_VALID as unknown as string[])
          .eq("Check-out", fecha)
          .order("Check in", { ascending: true })
          .limit(1);
        if (error) throw error;
        current = ((data ?? [])[0] ?? null) as ReservaPopoverRow | null;
      }

      let checkoutDate = current?.["Check-out"] ?? null;
      if (!checkoutDate && persisted.numero_reserva) {
        const { data, error } = await supabase
          .from("reservas_kb")
          .select('"Número","Check-out"')
          .eq("Número", persisted.numero_reserva)
          .maybeSingle();
        if (error) throw error;
        checkoutDate = ((data as any)?.["Check-out"] as string | null | undefined) ?? null;
      }
      checkoutDate = checkoutDate ?? fecha;
      const currentNumero = current?.["Número"] ?? persisted.numero_reserva ?? null;

      let next: ReservaPopoverRow | null = null;
      const { data: nextRows, error: nextError } = await supabase
        .from("v_reservas_por_apartamento")
        .select(`"Número","Check in","Check-out","Huéspedes","Estado","Hora estimada de llegada","Hora estimada de salida",id_apt,es_reserva_compartida`)
        .eq("id_apt", apt.id_apt)
        .in("Estado", ESTADOS_VALID as unknown as string[])
        .gte("Check in", checkoutDate)
        .lte("Check in", addDaysISO(checkoutDate, 7))
        .order("Check in", { ascending: true })
        .order("Hora estimada de llegada", { ascending: true, nullsFirst: true });
      if (nextError) throw nextError;
      next = ((nextRows ?? []) as ReservaPopoverRow[]).find((r) => r["Número"] !== currentNumero) ?? null;

      const numeros = Array.from(new Set([currentNumero, next?.["Número"]].filter(Boolean))) as string[];
      const gestRows = numeros.length
        ? await supabase.from("reservas_gestio").select('"Número",HCheckInConf,HCheckOutConf').in("Número", numeros)
        : { data: [] as GestioTimes[], error: null };
      if (gestRows.error) throw gestRows.error;
      const gestMap = new Map<string, GestioTimes>(
        ((gestRows.data ?? []) as GestioTimes[]).map((g) => [g["Número"], g]),
      );

      const currentGest = currentNumero ? gestMap.get(currentNumero) : null;
      const nextGest = next?.["Número"] ? gestMap.get(next["Número"]) : null;
      const out = current
        ? resolveTime(currentGest?.HCheckOutConf ?? null, current["Hora estimada de salida"], "11:00:00")
        : { value: persisted.hora_out_time ?? "11:00:00", informed: persisted.hora_out_informed ?? false };
      const inRes = next
        ? resolveTime(nextGest?.HCheckInConf ?? null, next["Hora estimada de llegada"], "15:00:00")
        : null;
      const checkoutDT = combineDateTime(checkoutDate, out.value);
      const checkinDT = combineDateTime(next?.["Check in"] ?? null, inRes?.value ?? null);
      const winMins = checkoutDT && checkinDT ? Math.round((checkinDT.getTime() - checkoutDT.getTime()) / 60000) : null;
      const autoSfcMontar = !!next && !current?.es_reserva_compartida && !!apt.tiene_sofa_cama && (next["Huéspedes"] ?? 0) > (apt.camas_fijas ?? 0);
      const autoSfcDesmontar = !current?.es_reserva_compartida && !!apt.tiene_sofa_cama && (current?.["Huéspedes"] ?? 0) > (apt.camas_fijas ?? 0) && !autoSfcMontar;

      const isCurCancelada =
        !!current?.Estado && (current.Estado === "Cancelada" || current.Estado === "No show");
      const fresh = {
        hora_out_time: out.value,
        hora_out_informed: out.informed,
        hora_in_time: inRes?.value ?? null,
        hora_in_informed: inRes?.informed ?? false,
        sfc_montar_auto: autoSfcMontar,
        sfc_desmontar_auto: autoSfcDesmontar,
        proxima_reserva_numero: next?.["Número"] ?? null,
        next_guests: next?.["Huéspedes"] ?? null,
      };
      const stored = {
        hora_out_time: persisted.hora_out_time,
        hora_out_informed: !!persisted.hora_out_informed,
        hora_in_time: persisted.hora_in_time,
        hora_in_informed: !!persisted.hora_in_informed,
        sfc_montar_auto: !!persisted.sfc_montar,
        sfc_desmontar_auto: !!persisted.sfc_desmontar,
        proxima_reserva_numero: persisted.proxima_reserva_numero ?? null,
        cur_estado: current?.Estado ?? null,
        cur_guests: current?.["Huéspedes"] ?? null,
      };
      const affected = !!persisted.affected_by_kb_change || isCurCancelada;
      // When affected: show the gestor's stored values so they can compare
      // against the freshly recalculated ones in the alert. When not affected:
      // keep things in sync with the recomputation (existing behaviour).
      const formBase = affected
        ? {
            ...persisted,
            numero_reserva: currentNumero,
            tipo: "salida",
            sfc_montar: persisted.sfc_montar_manual ?? !!persisted.sfc_montar,
            sfc_desmontar: persisted.sfc_desmontar_manual ?? !!persisted.sfc_desmontar,
          }
        : {
            ...persisted,
            numero_reserva: currentNumero,
            tipo: "salida",
            hora_out_time: out.value,
            hora_out_informed: out.informed,
            hora_in_time: inRes?.value ?? null,
            hora_in_informed: inRes?.informed ?? false,
            prioritaria: winMins != null && winMins >= 0 && winMins < 150,
            sfc_montar: persisted.sfc_montar_manual ?? autoSfcMontar,
            sfc_desmontar: persisted.sfc_desmontar_manual ?? autoSfcDesmontar,
          };
      return {
        form: formBase,
        realCheckoutDate: checkoutDate,
        nextReservation: next,
        fresh,
        stored,
        reason: persisted.affected_reason ?? (isCurCancelada ? "cancelada" : null),
      };
    },
  });

  useEffect(() => {
    if (!open || !popoverDataQ.data) return;
    setForm(popoverDataQ.data.form);
    setRealCheckoutDate(popoverDataQ.data.realCheckoutDate);
    setNextReservation(popoverDataQ.data.nextReservation);
    setLoaded(true);
  }, [open, popoverDataQ.data]);

  const limpiadoresQ = useQuery({ queryKey: ["limpiadores"], queryFn: fetchLimpiadores });

  // Shared-reservation detection
  const sharedQ = useQuery({
    queryKey: ["limpieza-shared", apt.id_apt, form.numero_reserva],
    enabled: loaded && !!form.numero_reserva,
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
    enabled: loaded && !!form.worker && !!form.fecha_limpieza,
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

  const checkoutDT = combineDateTime(realCheckoutDate, form.hora_out_time);
  const checkinDT = combineDateTime(
    nextReservation?.["Check in"] ?? null,
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
    // Append as next slot for that worker on that date. Exclude this task
    // itself so re-selecting the same worker doesn't double-count.
    const { data } = await supabase
      .from("limpiezas")
      .select("id_limpieza")
      .eq("worker", newWorker)
      .eq("fecha_limpieza", form.fecha_limpieza)
      .eq("estado", "activa");
    const others = (data ?? []).filter((r: any) => r.id_limpieza !== form.id_limpieza);
    const next = others.length + 1;
    setForm((f) => ({ ...f, worker: newWorker, orden_trabajo: next }));
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
        // Saving normally implies the gestor has reviewed and acted on
        // any KB-change alert, so clear the flag.
        affected_by_kb_change: false,
        affected_reason: null,
      };
      if (form.id_limpieza > 0) {
        const { error } = await supabase.from("limpiezas").update(payload).eq("id_limpieza", form.id_limpieza);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("limpiezas").insert(payload);
        if (error) throw error;
      }
      // Simple assignment-order model: no renumbering of siblings on save.
      void prevWorker; void prevFecha;
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

  const kbChange = popoverDataQ.data && "fresh" in popoverDataQ.data ? popoverDataQ.data : null;
  const showKbAlert =
    !!kbChange &&
    kbChange.fresh &&
    kbChange.stored &&
    (form.affected_by_kb_change || kbChange.reason === "cancelada");
  const kbChanges: { label: string; old: string; nu: string }[] = [];
  if (showKbAlert && kbChange?.fresh && kbChange?.stored) {
    const f = kbChange.fresh;
    const s = kbChange.stored;
    if (s.hora_out_time !== f.hora_out_time) {
      kbChanges.push({
        label: "Hora de salida",
        old: s.hora_out_time ? fmtTime(s.hora_out_time) : "—",
        nu: f.hora_out_time ? fmtTime(f.hora_out_time) : "—",
      });
    }
    if (s.hora_in_time !== f.hora_in_time) {
      kbChanges.push({
        label: "Hora de entrada",
        old: s.hora_in_time ? fmtTime(s.hora_in_time) : "—",
        nu: f.hora_in_time ? fmtTime(f.hora_in_time) : "—",
      });
    }
    if (s.proxima_reserva_numero !== f.proxima_reserva_numero) {
      kbChanges.push({
        label: "Próxima reserva",
        old: s.proxima_reserva_numero ?? "ninguna",
        nu: f.proxima_reserva_numero ?? "ninguna",
      });
    }
    if (s.sfc_montar_auto !== f.sfc_montar_auto) {
      kbChanges.push({
        label: "Montar sofá cama (auto)",
        old: s.sfc_montar_auto ? "sí" : "no",
        nu: f.sfc_montar_auto ? "sí" : "no",
      });
    }
    if (s.sfc_desmontar_auto !== f.sfc_desmontar_auto) {
      kbChanges.push({
        label: "Desmontar sofá cama (auto)",
        old: s.sfc_desmontar_auto ? "sí" : "no",
        nu: f.sfc_desmontar_auto ? "sí" : "no",
      });
    }
  }

  const isCancelada = showKbAlert && kbChange?.reason === "cancelada";

  const applyFresh = async () => {
    if (!kbChange?.fresh || form.id_limpieza === 0) return;
    setSaving(true);
    try {
      const f = kbChange.fresh;
      const payload: any = {
        hora_out_time: f.hora_out_time,
        hora_out_informed: f.hora_out_informed,
        hora_in_time: f.hora_in_time,
        hora_in_informed: f.hora_in_informed,
        proxima_reserva_numero: f.proxima_reserva_numero,
        affected_by_kb_change: false,
        affected_reason: null,
      };
      // Only update the auto SFC base when the gestor hasn't manually
      // overridden it; manual flags are explicitly preserved.
      if (form.sfc_montar_manual == null) payload.sfc_montar = f.sfc_montar_auto;
      if (form.sfc_desmontar_manual == null) payload.sfc_desmontar = f.sfc_desmontar_auto;
      const { error } = await supabase
        .from("limpiezas")
        .update(payload)
        .eq("id_limpieza", form.id_limpieza);
      if (error) throw error;
      toast.success("Limpieza actualizada con datos nuevos");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const markReviewed = async () => {
    if (form.id_limpieza === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("limpiezas")
        .update({ affected_by_kb_change: false, affected_reason: null })
        .eq("id_limpieza", form.id_limpieza);
      if (error) throw error;
      setForm((f) => ({ ...f, affected_by_kb_change: false, affected_reason: null }));
      toast.success("Marcada como revisada");
      onSaved();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="text-base">{apt.nombre}</DialogTitle>
            {(apt.grupo_nombre || apt.camas_fijas != null || form.tipo === "intermedia") && (
              <DialogDescription className="text-xs">
                {form.tipo === "intermedia" && (
                  <span className="inline-block mr-1 rounded bg-teal-100 text-teal-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Limpieza extra
                  </span>
                )}
                {apt.grupo_nombre}
                {apt.grupo_nombre && apt.camas_fijas != null ? " · " : ""}
                {apt.camas_fijas != null ? bedLabel(apt.camas_fijas) : ""}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="overflow-y-auto px-4 py-3 space-y-4">
            {popoverDataQ.isError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Error cargando la limpieza: {(popoverDataQ.error as Error).message}
              </div>
            ) : !loaded || popoverDataQ.isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Cargando limpieza…</div>
            ) : (
              <>
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

            {/* KB-change alert */}
            {showKbAlert && (
              <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-xs space-y-2">
                <div className="font-semibold text-orange-900">
                  {isCancelada
                    ? "⚠ Esta reserva ha sido cancelada — revisar si la limpieza sigue siendo necesaria"
                    : "⚠ Cambios detectados en la reserva"}
                </div>
                {!isCancelada && kbChanges.length > 0 && (
                  <ul className="space-y-1 text-orange-900">
                    {kbChanges.map((c) => (
                      <li key={c.label} className="flex flex-wrap items-center gap-1">
                        <span className="font-medium">{c.label}:</span>
                        <span className="line-through text-orange-700/70">{c.old}</span>
                        <span>→</span>
                        <span className="font-semibold">{c.nu}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {isCancelada && (
                  <div className="text-orange-800">
                    Si la limpieza ya no es necesaria, usa el botón <span className="font-semibold">Anular limpieza</span>.
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {!isCancelada && (
                    <Button
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                      disabled={saving}
                      onClick={applyFresh}
                    >
                      Actualizar con datos nuevos
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-orange-400 text-orange-800 hover:bg-orange-100"
                    disabled={saving}
                    onClick={markReviewed}
                  >
                    ✓ Marcar como revisada
                  </Button>
                </div>
              </div>
            )}

            {/* Horarios */}
            {form.tipo !== "intermedia" && (
            <section>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Horarios</Label>
              <div className="mt-2 space-y-1.5">
                <HoraRow
                  label="Sale (checkout)"
                  dateLabel={realCheckoutDate ? fmtDate(realCheckoutDate) : fmtDate(form.fecha_limpieza)}
                  time={form.hora_out_time}
                  informed={!!form.hora_out_informed}
                  badge={
                    realCheckoutDate && realCheckoutDate < form.fecha_limpieza
                      ? {
                          label: "VACÍO",
                          title: `Apartamento vacío desde ${fmtDate(realCheckoutDate)}`,
                        }
                      : undefined
                  }
                />
                <HoraRow
                  label="Entra (próx. reserva)"
                  dateLabel={
                    nextReservation?.["Check in"]
                      ? fmtDate(nextReservation["Check in"])
                      : "—"
                  }
                  time={form.hora_in_time}
                  informed={!!form.hora_in_informed}
                  emptyText="— sin reserva en 7 días"
                  badge={
                    (nextReservation?.["Check in"] ?? null) !== form.fecha_limpieza
                      ? {
                          label: "NENTRAN",
                          title: "No entra ningún huésped el día de la limpieza",
                        }
                      : undefined
                  }
                />
              </div>
            </section>
            )}

            {/* Ventana */}
            {form.tipo !== "intermedia" && (
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
            )}

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
                  <div className="rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
                    Orden:{" "}
                    <span className="font-semibold">{form.orden_trabajo ?? "—"}</span>
                    <span className="text-muted-foreground">
                      {" "}de {Math.max(siblingsQ.data?.length ?? 0, form.orden_trabajo ?? 0)}
                    </span>
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
            {form.tipo === "intermedia" ? (
            <section>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tareas</Label>
              <div className="mt-2 space-y-2">
                <TaskRow
                  label="Cambiar toallas"
                  checked={!!form.check_toallas}
                  onChange={(v) => set("check_toallas", v)}
                />
                <TaskRow
                  label="Cambiar sábanas"
                  checked={!!form.check_sabanas}
                  onChange={(v) => set("check_sabanas", v)}
                />
                <TaskRow
                  label="Limpieza básica"
                  checked={!!form.check_limpieza_basica}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      check_limpieza_basica: v,
                      check_limpieza_completa: v ? false : f.check_limpieza_completa,
                    }))
                  }
                />
                <TaskRow
                  label="Limpieza completa"
                  checked={!!form.check_limpieza_completa}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      check_limpieza_completa: v,
                      check_limpieza_basica: v ? false : f.check_limpieza_basica,
                      check_toallas: v ? false : f.check_toallas,
                      check_sabanas: v ? false : f.check_sabanas,
                    }))
                  }
                />
              </div>
            </section>
            ) : (
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
            )}

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
              </>
            )}
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
                <Button onClick={save} disabled={saving || !loaded || popoverDataQ.isError} className="bg-emerald-600 hover:bg-emerald-700">
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
  badge,
}: {
  label: string;
  dateLabel: string;
  time: string | null;
  informed: boolean;
  emptyText?: string;
  badge?: { label: string; title?: string };
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
      {badge && (
        <span
          title={badge.title}
          className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-muted text-muted-foreground border border-muted-foreground/20"
        >
          {badge.label}
        </span>
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