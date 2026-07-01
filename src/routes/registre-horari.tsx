import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/registre-horari")({
  component: RegistreHorariPage,
});

const MONTH_CA = [
  "gener", "febrer", "març", "abril", "maig", "juny",
  "juliol", "agost", "setembre", "octubre", "novembre", "desembre",
];

type Persona = {
  id_persona: number;
  nombre: string | null;
  apellidos: string | null;
  tipo_contrato: string | null;
  horas_objetivo_mes: number | null;
  control_horario: boolean | null;
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

function fmtHours(h: number): string {
  const sign = h < 0 ? "-" : "";
  const abs = Math.abs(h);
  const totalMin = Math.round(abs * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (mm === 0) return `${sign}${hh}h`;
  return `${sign}${hh}h ${pad(mm)}m`;
}

function RegistreHorariPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const { start, end } = monthRange(year, month0);

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
        .from("personal")
        .select("id_persona, nombre, apellidos, tipo_contrato, horas_objetivo_mes, control_horario")
        .eq("activo", true)
        .eq("control_horario", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Persona[];
    },
  });

  const workers = workersQ.data ?? [];
  const workerIds = useMemo(() => workers.map((w) => w.id_persona), [workers]);

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

  const hoursByWorker = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of limpiezasQ.data ?? []) {
      if (l.worker == null) continue;
      map.set(l.worker, (map.get(l.worker) ?? 0) + diffHours(l.iniciada_en, l.finalizada_en));
    }
    for (const r of genericQ.data ?? []) {
      map.set(r.id_persona, (map.get(r.id_persona) ?? 0) + diffHours(r.inici, r.fi));
    }
    return map;
  }, [limpiezasQ.data, genericQ.data]);

  const maxScale = useMemo(() => {
    let m = 0;
    for (const w of workers) {
      const actual = hoursByWorker.get(w.id_persona) ?? 0;
      const obj = w.horas_objetivo_mes ?? 0;
      m = Math.max(m, actual, obj);
    }
    return m || 1;
  }, [workers, hoursByWorker]);

  const loading = workersQ.isLoading || limpiezasQ.isLoading || genericQ.isLoading;

  return (
    <AppShell title="Registre horari">
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Registre horari</h1>
      </div>

      <div className="flex items-center justify-center gap-4 mb-8">
        <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Mes anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-lg font-medium capitalize min-w-[180px] text-center">
          {MONTH_CA[month0]} {year}
        </div>
        <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Mes següent">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-16">Carregant…</div>
      ) : workers.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          No hi ha treballadors amb control horari actiu.
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-4 md:p-6">
          <div className="flex items-end justify-around gap-3 md:gap-6 overflow-x-auto min-h-[320px]">
            {workers.map((w) => (
              <WorkerColumn
                key={w.id_persona}
                worker={w}
                actual={hoursByWorker.get(w.id_persona) ?? 0}
                maxScale={maxScale}
              />
            ))}
          </div>
        </div>
      )}
    </div>
    </AppShell>
  );
}

const BAR_MAX_PX = 240;

function WorkerColumn({
  worker,
  actual,
  maxScale,
}: {
  worker: Persona;
  actual: number;
  maxScale: number;
}) {
  const isAutonom = worker.tipo_contrato === "autonomo";
  const objective = worker.horas_objetivo_mes;
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
  const firstName = (worker.nombre ?? "").split(" ")[0] || "—";

  return (
    <div className="flex flex-col items-center min-w-[110px]">
      <div className="flex items-end gap-1.5 h-[240px]">
        {hasObjective && (
          <div
            className="w-8 rounded-t bg-slate-300"
            style={{ height: `${objPx}px` }}
            title={`Objectiu: ${fmtHours(objective as number)}`}
          />
        )}
        <div
          className="w-8 rounded-t"
          style={{ height: `${actualPx}px`, backgroundColor: color }}
          title={`Reals: ${fmtHours(actual)}`}
        />
      </div>
      <div className="mt-3 text-center">
        <div className="text-sm font-medium truncate max-w-[110px]">{firstName}</div>
        <div className="text-xs text-muted-foreground">
          {fmtHours(actual)} / {hasObjective ? fmtHours(objective as number) : "autònom"}
        </div>
        {hasObjective && (
          <div
            className={`text-xs font-medium ${saldo >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {saldo >= 0 ? "+" : ""}
            {fmtHours(saldo)}
          </div>
        )}
        <Link
          to="/registre-horari/$id"
          params={{ id: String(worker.id_persona) }}
          className="text-xs text-primary hover:underline mt-1 inline-block"
        >
          Detall →
        </Link>
      </div>
    </div>
  );
}