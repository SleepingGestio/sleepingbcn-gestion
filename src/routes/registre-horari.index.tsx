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
        .select("worker, iniciada_en, finalizada_en, estado, fecha_limpieza")
        .in("worker", workerIds)
        .eq("estado", "finalizada")
        .gte("fecha_limpieza", start)
        .lte("fecha_limpieza", end);
      if (error) throw error;
      return (data ?? []) as { worker: number | null; iniciada_en: string | null; finalizada_en: string | null }[];
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

  const hoursByWorker = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of limpiezasQ.data ?? []) {
      if (l.worker == null) continue;
      map.set(l.worker, (map.get(l.worker) ?? 0) + diffHours(l.iniciada_en, l.finalizada_en));
    }
    for (const r of genericQ.data ?? []) {
      map.set(r.id_persona, (map.get(r.id_persona) ?? 0) + diffHours(r.inici, r.fi));
    }
    for (const a of ajustosQ.data ?? []) {
      map.set(a.id_persona, (map.get(a.id_persona) ?? 0) + Number(a.horas ?? 0));
    }
    return map;
  }, [limpiezasQ.data, genericQ.data, ajustosQ.data]);

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
      m = Math.max(m, actual, obj);
    }
    return m || 1;
  }, [workers, hoursByWorker, activeObjectiveByWorker]);

  const loading = workersQ.isLoading || limpiezasQ.isLoading || genericQ.isLoading || ajustosQ.isLoading || activePeriodsQ.isLoading;

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
          <div className="flex items-end justify-around gap-3 md:gap-6 overflow-x-auto min-h-[340px]">
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
                  maxScale={maxScale}
                  showGrip={canEditDashboard}
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

const BAR_MAX_PX = 240;
const LABEL_SPACE_PX = 40;

function WorkerColumn({
  worker,
  actual,
  objective,
  maxScale,
  showGrip,
}: {
  worker: Persona;
  actual: number;
  objective: number | null;
  maxScale: number;
  showGrip: boolean;
}) {
  const isAutonom = worker.tipo_contrato === "autonomo";
  const hasObjective = !isAutonom && objective != null && objective > 0;

  let color = "#378ADD"; // blue for autonomo / no objective
  if (hasObjective) {
    const deficit = (objective as number) - actual;
    if (actual >= (objective as number)) color = "#1D9E75";
    else if (deficit / (objective as number) < 0.1) color = "#EF9F27";
    else color = "#E24B4A";
  }

  const actualPx = Math.round((actual / maxScale) * BAR_MAX_PX);
  const objPx = hasObjective ? Math.round(((objective as number) / maxScale) * BAR_MAX_PX) : 0;

  const saldo = hasObjective ? actual - (objective as number) : 0;
  const deltaText = `${saldo >= 0 ? "+" : ""}${fmtHours(saldo)}`;
  const objIsShorter = hasObjective && objPx < actualPx;
  const actualIsShorter = hasObjective && actualPx < objPx;
  const firstName = (worker.nombre ?? "").split(" ")[0] || "—";

  return (
    <div className="flex flex-col items-center min-w-[110px]">
      {showGrip && <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 mb-1" />}
      <div className="flex items-end gap-2" style={{ height: `${BAR_MAX_PX + LABEL_SPACE_PX}px`, paddingTop: `${LABEL_SPACE_PX}px` }}>
        {hasObjective && (
          <div className="relative flex flex-col items-center" style={{ width: 32 }}>
            <div className="absolute bottom-full mb-1 flex flex-col items-center gap-0.5 whitespace-nowrap">
              {objIsShorter && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    saldo >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {deltaText}
                </span>
              )}
              <span className="text-[12px] font-semibold leading-none text-slate-500">
                {fmtHours(objective as number)}
              </span>
            </div>
            <div
              className="w-8 rounded-t bg-slate-300"
              style={{ height: `${objPx}px` }}
              title={`Objetivo: ${fmtHours(objective as number)}`}
            />
          </div>
        )}
        <div className="relative flex flex-col items-center" style={{ width: 32 }}>
          <div className="absolute bottom-full mb-1 flex flex-col items-center gap-0.5 whitespace-nowrap">
            {actualIsShorter && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                  saldo >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                }`}
              >
                {deltaText}
              </span>
            )}
            {!hasObjective && (
              <span className="text-[10px] text-muted-foreground leading-none">autónomo</span>
            )}
            <span className="text-[12px] font-semibold leading-none" style={{ color }}>
              {fmtHours(actual)}
            </span>
          </div>
          <div
            className="w-8 rounded-t"
            style={{ height: `${actualPx}px`, backgroundColor: color }}
            title={`Reales: ${fmtHours(actual)}`}
          />
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
