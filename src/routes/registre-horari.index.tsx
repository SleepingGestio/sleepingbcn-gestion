import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";

export const Route = createFileRoute("/registre-horari/")({
  component: RegistreHorariPage,
});

const MONTH_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

type Persona = {
  id_persona: number;
  nombre: string | null;
  apellidos: string | null;
  tipo_contrato: string | null;
  horas_objetivo_mes: number | null;
  control_horario: boolean | null;
  orden_dashboard: number | null;
};

type ActivePeriod = {
  id_persona: number;
  horas_objetivo_mes: number | null;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthRange(year: number, month0: number) {
  const start = `${year}-${pad(month0 + 1)}-01`;
  const endDate = new Date(year, month0 + 1, 0);
  const end = `${year}-${pad(month0 + 1)}-${pad(endDate.getDate())}`;
  return { start, end };
}

function diffHours(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!isFinite(da) || !isFinite(db)) return 0;
  return Math.max(0, (db - da) / 3_600_000);
}

import { formatHHMM as fmtHours } from "@/lib/utils";

function RegistreHorariPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const { start, end } = monthRange(year, month0);
  const { canEdit } = usePermissions();
  const canEditDashboard = canEdit("registre_horari");

  function prevMonth() {
    const d = new Date(year, month0 - 1, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }
  function nextMonth() {
    const d = new Date(year, month0 + 1, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }

  const workersQ = useQuery({
    queryKey: ["reg-horari-workers"],
    queryFn: async (): Promise<Persona[]> => {
      const { data, error } = await supabase
        .from("personal" as never)
        .select("id_persona, nombre, apellidos, tipo_contrato, horas_objetivo_mes, control_horario, orden_dashboard")
        .eq("activo", true)
        .eq("control_horario", true)
        .order("orden_dashboard", { ascending: true, nullsFirst: false })
        .order("nombre", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Persona[];
    },
  });

  const workers = workersQ.data ?? [];
  const workerIds = useMemo(() => workers.map((w) => w.id_persona), [workers]);

  // Optimistic reorder: while a drag-persist mutation is in flight, show the
  // dropped order immediately instead of waiting for the refetch round-trip.
  const [orderOverride, setOrderOverride] = useState<number[] | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);

  const displayedWorkers = useMemo(() => {
    if (!orderOverride) return workers;
    const byId = new Map(workers.map((w) => [w.id_persona, w]));
    const ordered = orderOverride.map((id) => byId.get(id)).filter((w): w is Persona => !!w);
    // Any worker not covered by the override (e.g. list changed underneath) is appended.
    for (const w of workers) if (!orderOverride.includes(w.id_persona)) ordered.push(w);
    return ordered;
  }, [workers, orderOverride]);

  const reorderM = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      const results = await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from("personal" as never).update({ orden_dashboard: idx + 1 } as never).eq("id_persona", id),
        ),
      );
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;
    },
    onSuccess: () => {
      setOrderOverride(null);
      workersQ.refetch();
    },
    onError: (e) => {
      setOrderOverride(null);
      toast.error("Error al reordenar: " + (e as Error).message);
    },
  });

  function handleDrop(targetId: number) {
    if (!canEditDashboard || dragId == null || dragId === targetId) return;
    const current = (orderOverride ?? workers.map((w) => w.id_persona)).slice();
    const fromIdx = current.indexOf(dragId);
    const toIdx = current.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    current.splice(fromIdx, 1);
    current.splice(toIdx, 0, dragId);
    setOrderOverride(current);
    reorderM.mutate(current);
    setDragId(null);
  }

  const activePeriodsQ = useQuery({
    queryKey: ["reg-horari-active-periods", workerIds.join(",")],
    enabled: workerIds.length > 0,
    queryFn: async (): Promise<ActivePeriod[]> => {
      const { data, error } = await supabase
        .from("personal_periodos_actividad")
        .select("id_persona, horas_objetivo_mes")
        .in("id_persona", workerIds)
        .is("fecha_fin", null);
      if (error) throw error;
      return (data ?? []) as ActivePeriod[];
    },
  });

  const limpiezasQ = useQuery({
    queryKey: ["reg-horari-limpiezas", start, end, workerIds.join(",")],
    enabled: workerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("id_limpieza, worker, iniciada_en, finalizada_en, estado, fecha_limpieza")
        .in("worker", workerIds)
        .eq("estado", "finalizada")
        .gte("fecha_limpieza", start)
        .lte("fecha_limpieza", end);
      if (error) throw error;
      return (data ?? []) as { id_limpieza: number; worker: number | null; iniciada_en: string | null; finalizada_en: string | null }[];
    },
  });

  const limpiezasRegistreQ = useQuery({
    queryKey: ["reg-horari-limpiezas-registre", start, end, workerIds.join(",")],
    enabled: workerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas_registre")
        .select("id_limpieza, id_persona, hores")
        .in("id_persona", workerIds)
        .not("fi", "is", null)
        .not("hores", "is", null)
        .gte("inici", `${start}T00:00:00`)
        .lte("inici", `${end}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as { id_limpieza: number; id_persona: number; hores: number | null }[];
    },
  });

  const genericQ = useQuery({
    queryKey: ["reg-horari-generic", start, end, workerIds.join(",")],
    enabled: workerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registre_temps_generic")
        .select("id_persona, inici, fi")
        .in("id_persona", workerIds)
        .gte("inici", `${start}T00:00:00`)
        .lte("inici", `${end}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as { id_persona: number; inici: string | null; fi: string | null }[];
    },
  });

  const ajustosQ = useQuery({
    queryKey: ["reg-horari-ajustos", start, end, workerIds.join(",")],
    enabled: workerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_ajustos_hores")
        .select("id_persona, fecha, horas, tipus_computa")
        .in("id_persona", workerIds)
        .eq("tipus_computa", "treballades")
        .gte("fecha", start)
        .lte("fecha", end);
      if (error) throw error;
      return (data ?? []) as { id_persona: number; horas: number | null }[];
    },
  });

  const mantenimentQ = useQuery({
    queryKey: ["reg-horari-manteniment", start, end, workerIds.join(",")],
    enabled: workerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manteniment_registre")
        .select("id_persona, hores")
        .in("id_persona", workerIds)
        .not("fi", "is", null)
        .not("hores", "is", null)
        .gte("inici", `${start}T00:00:00`)
        .lte("inici", `${end}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as { id_persona: number; hores: number | null }[];
    },
  });

  const reduccionesQ = useQuery({
    queryKey: ["reg-horari-reducciones", start, end, workerIds.join(",")],
    enabled: workerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_ajustos_hores")
        .select("id_persona, horas")
        .in("id_persona", workerIds)
        .eq("tipus_computa", "objectiu")
        .gte("fecha", start)
        .lte("fecha", end);
      if (error) throw error;
      return (data ?? []) as { id_persona: number; horas: number | null }[];
    },
  });

  const historyQ = useQuery({
    queryKey: ["reg-horari-index-history", workerIds.join(",")],
    enabled: workerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_resum_mes" as never)
        .select("id_persona, anio, mes, cerrado, saldo_acumulat_fi")
        .in("id_persona", workerIds)
        .eq("cerrado", true);
      if (error) throw error;
      return (data ?? []) as { id_persona: number; anio: number; mes: number; saldo_acumulat_fi: number }[];
    },
  });

  const pendientesQ = useQuery({
    queryKey: ["reg-horari-pendientes", start, end, workerIds.join(",")],
    enabled: workerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("worker, id_apt, tipo, sfc_montar")
        .in("worker", workerIds)
        .in("estado", ["comunicada", "aceptada", "en_curso"])
        .gte("fecha_limpieza", start)
        .lte("fecha_limpieza", end);
      if (error) throw error;
      return (data ?? []) as { worker: number | null; id_apt: number; tipo: string | null; sfc_montar: boolean | null }[];
    },
  });

  const pendientesAptIds = useMemo(() => {
    const s = new Set<number>();
    for (const p of pendientesQ.data ?? []) s.add(p.id_apt);
    return Array.from(s);
  }, [pendientesQ.data]);

  const aptStdQ = useQuery({
    queryKey: ["reg-horari-apt-std", pendientesAptIds.join(",")],
    enabled: pendientesAptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartamentos")
        .select("id_apt, tiempo_estandar_std_sin_sfc, tiempo_estandar_std_con_sfc, tiempo_estandar_extra_cr")
        .in("id_apt", pendientesAptIds);
      if (error) throw error;
      return (data ?? []) as {
        id_apt: number;
        tiempo_estandar_std_sin_sfc: number | null;
        tiempo_estandar_std_con_sfc: number | null;
        tiempo_estandar_extra_cr: number | null;
      }[];
    },
  });

  const aptStdById = useMemo(() => {
    const m = new Map<number, { sin_sfc: number | null; con_sfc: number | null; extra_cr: number | null }>();
    for (const a of aptStdQ.data ?? []) {
      m.set(a.id_apt, {
        sin_sfc: a.tiempo_estandar_std_sin_sfc,
        con_sfc: a.tiempo_estandar_std_con_sfc,
        extra_cr: a.tiempo_estandar_extra_cr,
      });
    }
    return m;
  }, [aptStdQ.data]);

  const scheduledPendingByWorker = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of pendientesQ.data ?? []) {
      if (p.worker == null) continue;
      const std = aptStdById.get(p.id_apt);
      if (!std) continue;
      const value = p.tipo === "intermedia"
        ? std.extra_cr
        : p.sfc_montar
          ? std.con_sfc
          : std.sin_sfc;
      if (value != null) map.set(p.worker, (map.get(p.worker) ?? 0) + value);
    }
    return map;
  }, [pendientesQ.data, aptStdById]);

  const hoursByWorker = useMemo(() => {
    const map = new Map<number, number>();
    const limpiezasConSesiones = new Set((limpiezasRegistreQ.data ?? []).map((r) => r.id_limpieza));
    for (const l of limpiezasQ.data ?? []) {
      if (l.worker == null) continue;
      if (limpiezasConSesiones.has(l.id_limpieza)) continue;
      map.set(l.worker, (map.get(l.worker) ?? 0) + diffHours(l.iniciada_en, l.finalizada_en));
    }
    for (const r of limpiezasRegistreQ.data ?? []) {
      map.set(r.id_persona, (map.get(r.id_persona) ?? 0) + Number(r.hores ?? 0));
    }
    for (const r of genericQ.data ?? []) {
      map.set(r.id_persona, (map.get(r.id_persona) ?? 0) + diffHours(r.inici, r.fi));
    }
    for (const a of ajustosQ.data ?? []) {
      map.set(a.id_persona, (map.get(a.id_persona) ?? 0) + Number(a.horas ?? 0));
    }
    for (const m of mantenimentQ.data ?? []) {
      map.set(m.id_persona, (map.get(m.id_persona) ?? 0) + Number(m.hores ?? 0));
    }
    return map;
  }, [limpiezasQ.data, limpiezasRegistreQ.data, genericQ.data, ajustosQ.data, mantenimentQ.data]);

  const reductionsByWorker = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of reduccionesQ.data ?? []) {
      map.set(r.id_persona, (map.get(r.id_persona) ?? 0) + Math.abs(Number(r.horas ?? 0)));
    }
    return map;
  }, [reduccionesQ.data]);

  // Most recent closed month's saldo_acumulat_fi per worker, strictly before the
  // currently-viewed year/month0 — same logic as registre-horari.$id.tsx's
  // prevAcumulat, fanned out across all workers into a Map like reductionsByWorker.
  const prevAcumulatByWorker = useMemo(() => {
    const mesSel = month0 + 1;
    const byWorker = new Map<number, { anio: number; mes: number; saldo_acumulat_fi: number }[]>();
    for (const r of historyQ.data ?? []) {
      if (!byWorker.has(r.id_persona)) byWorker.set(r.id_persona, []);
      byWorker.get(r.id_persona)!.push(r);
    }
    const map = new Map<number, number>();
    for (const [id, rows] of byWorker) {
      const sorted = rows
        .filter((r) => r.anio < year || (r.anio === year && r.mes < mesSel))
        .sort((a, b) => (b.anio - a.anio) || (b.mes - a.mes));
      map.set(id, sorted[0]?.saldo_acumulat_fi ?? 0);
    }
    return map;
  }, [historyQ.data, year, month0]);

  const activeObjectiveByWorker = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const p of activePeriodsQ.data ?? []) {
      map.set(p.id_persona, p.horas_objetivo_mes == null ? null : Number(p.horas_objetivo_mes));
    }
    return map;
  }, [activePeriodsQ.data]);

  const objectiveForWorker = (worker: Persona) => (
    activeObjectiveByWorker.has(worker.id_persona)
      ? activeObjectiveByWorker.get(worker.id_persona)!
      : worker.horas_objetivo_mes
  );

  const maxScale = useMemo(() => {
    let m = 0;
    for (const w of workers) {
      const actual = hoursByWorker.get(w.id_persona) ?? 0;
      const obj = objectiveForWorker(w) ?? 0;
      const pending = scheduledPendingByWorker.get(w.id_persona) ?? 0;
      m = Math.max(m, actual + pending, obj);
    }
    return m || 1;
  }, [workers, hoursByWorker, activeObjectiveByWorker, scheduledPendingByWorker]);

  const loading = workersQ.isLoading || limpiezasQ.isLoading || limpiezasRegistreQ.isLoading || genericQ.isLoading || ajustosQ.isLoading || mantenimentQ.isLoading || reduccionesQ.isLoading || activePeriodsQ.isLoading;

  return (
    <AppShell title="Registro horario">
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Registro horario</h1>
      </div>

      <div className="flex items-center justify-center gap-4 mb-8">
        <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Mes anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-lg font-medium capitalize min-w-[180px] text-center">
          {MONTH_ES[month0]} {year}
        </div>
        <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Mes siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-16">Cargando…</div>
      ) : workers.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          No hay trabajadores con control horario activo.
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-4 md:p-6">
          <div className="flex items-end justify-around gap-3 md:gap-6 overflow-x-auto min-h-[340px] pl-10">
            {displayedWorkers.map((w) => (
              <div
                key={w.id_persona}
                draggable={canEditDashboard}
                onDragStart={() => canEditDashboard && setDragId(w.id_persona)}
                onDragOver={(e) => canEditDashboard && e.preventDefault()}
                onDrop={() => handleDrop(w.id_persona)}
                className={canEditDashboard ? "cursor-grab active:cursor-grabbing" : undefined}
              >
                <WorkerColumn
                  worker={w}
                  actual={hoursByWorker.get(w.id_persona) ?? 0}
                  objective={objectiveForWorker(w)}
                  reduction={reductionsByWorker.get(w.id_persona) ?? 0}
                  prevAcumulat={prevAcumulatByWorker.get(w.id_persona) ?? 0}
                  maxScale={maxScale}
                  showGrip={canEditDashboard}
                  scheduledPending={scheduledPendingByWorker.get(w.id_persona) ?? 0}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </AppShell>
  );
}

const BAR_MAX_PX = 340;
const LABEL_SPACE_PX = 40;

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function WorkerColumn({
  worker,
  actual,
  objective,
  reduction,
  prevAcumulat,
  maxScale,
  showGrip,
  scheduledPending,
}: {
  worker: Persona;
  actual: number;
  objective: number | null;
  reduction: number;
  prevAcumulat: number;
  maxScale: number;
  showGrip: boolean;
  scheduledPending: number;
}) {
  const isAutonom = worker.tipo_contrato === "autonomo";
  const hasObjective = !isAutonom && objective != null && objective > 0;
  const hasAdjustment = reduction !== 0 || prevAcumulat !== 0;

  const effectiveObjective = hasObjective ? Math.max(0, (objective as number) - reduction - prevAcumulat) : null;

  let color = "#378ADD"; // blue for autonomo / no objective
  if (hasObjective) {
    const target = effectiveObjective as number;
    const deficit = target - actual;
    if (actual >= target) color = "#1D9E75";
    else if (target > 0 && deficit / target < 0.1) color = "#EF9F27";
    else color = "#E24B4A";
  }

  const actualPx = Math.round((actual / maxScale) * BAR_MAX_PX);
  const scheduledPx = Math.round((scheduledPending / maxScale) * BAR_MAX_PX);
  const objPx = hasObjective ? Math.round(((objective as number) / maxScale) * BAR_MAX_PX) : 0;
  const effPx =
    hasObjective && hasAdjustment && effectiveObjective != null
      ? Math.round((effectiveObjective / maxScale) * BAR_MAX_PX)
      : null;
  // effPx can exceed objPx when prevAcumulat < 0 (effectiveObjective grew past
  // the base objective) — this is the height of the extra segment stacked above
  // the grey objective bar, mirroring how scheduledPx stacks above actualPx below.
  const excessPx = effPx !== null && effPx > objPx ? effPx - objPx : 0;

  const objectiveClauses: string[] = [];
  if (reduction !== 0) objectiveClauses.push(`−${fmtHours(reduction)}`);
  if (prevAcumulat !== 0) objectiveClauses.push(`${prevAcumulat > 0 ? "−" : "+"}${fmtHours(Math.abs(prevAcumulat))} S.ANT.`);
  const objectiveTitle =
    objectiveClauses.length > 0 && effectiveObjective != null
      ? `Objetivo: ${fmtHours(objective as number)} (${objectiveClauses.join(" · ")} → ${fmtHours(effectiveObjective)} efectivo)`
      : `Objetivo: ${fmtHours(objective as number)}`;

  // Both top labels share this height so they stay aligned with each other
  // and always clear the actual-hours number, even when the red bar grows
  // past the gray one.
  const topLabelBottomPx = Math.max(objPx + excessPx + 8, actualPx + 22);

  const saldo = hasObjective
    ? actual - (hasAdjustment && effectiveObjective != null ? effectiveObjective : (objective as number))
    : 0;
  const deltaText = `${saldo >= 0 ? "+" : ""}${fmtHours(saldo)}`;
  const firstName = (worker.nombre ?? "").split(" ")[0] || "—";

  return (
    <div className="flex flex-col items-center min-w-[110px]">
      {showGrip && <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 mb-1" />}
      <div className="flex items-end gap-2" style={{ height: `${BAR_MAX_PX + LABEL_SPACE_PX}px`, paddingTop: `${LABEL_SPACE_PX}px` }}>
        {hasObjective && (
          <div className="relative flex flex-col items-center" style={{ width: 32 }}>
            <div className="absolute whitespace-nowrap" style={{ bottom: `${topLabelBottomPx}px` }}>
              <span className="text-[12px] font-semibold leading-none text-slate-500">
                {fmtHours(objective as number)}
              </span>
            </div>
            <div
              className="w-8 rounded-t bg-slate-300"
              style={{ height: `${objPx}px` }}
              title={objectiveTitle}
            />
            {excessPx > 0 && (
              <div
                className="absolute w-8 rounded-t"
                style={{
                  bottom: `${objPx}px`,
                  left: 0,
                  height: `${excessPx}px`,
                  background: "#FBDEDD",
                  borderBottom: "2px solid #E24B4A",
                }}
                title={objectiveTitle}
              />
            )}
            {hasAdjustment && effPx !== null && effectiveObjective != null && (
              <>
                {/* Anchored to this column's own bottom (bottom: effPx), not
                    nested inside the grey bar — effPx already represents the
                    marker's true height above the baseline whether it falls
                    within the grey zone (reduction) or above it (excess from a
                    negative prevAcumulat), so no top/negative-offset math needed. */}
                <div
                  className="absolute left-0 right-0"
                  style={{ bottom: `${effPx}px`, height: 2, backgroundColor: "#26215C" }}
                />
                <span
                  className="absolute whitespace-nowrap"
                  style={{
                    bottom: `${effPx + 12}px`,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#26215C",
                    background: "#fff",
                    padding: "1px 5px",
                    borderRadius: 4,
                    border: "1px solid #26215C",
                  }}
                >
                  {fmtHours(effectiveObjective)}
                </span>
              </>
            )}
          </div>
        )}
        <div className="relative flex flex-col items-center" style={{ width: 32 }}>
          {hasObjective && (
            <div className="absolute whitespace-nowrap" style={{ bottom: `${topLabelBottomPx}px` }}>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                  saldo >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                }`}
              >
                {deltaText}
              </span>
            </div>
          )}
          <div className="absolute bottom-full mb-1 whitespace-nowrap">
            <span className="text-[12px] font-semibold leading-none" style={{ color }}>
              {fmtHours(actual)}
            </span>
          </div>
          <div
            className="w-8 rounded-t"
            style={{ height: `${actualPx}px`, backgroundColor: color }}
            title={`Reales: ${fmtHours(actual)}`}
          />
          {scheduledPending > 0 && (
            <div
              className="absolute w-8 rounded-t"
              style={{
                bottom: `${actualPx}px`,
                left: 0,
                height: `${scheduledPx}px`,
                backgroundColor: hexToRgba(color, 0.35),
              }}
              title={`Programadas: ${fmtHours(scheduledPending)}`}
            />
          )}
        </div>
      </div>
      <div className="mt-3 text-center">
        <div className="text-[14px] font-semibold truncate max-w-[110px]">{firstName}</div>
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link to="/registre-horari/$id" params={{ id: String(worker.id_persona) }}>
            Detalle
          </Link>
        </Button>
      </div>
    </div>
  );
}
