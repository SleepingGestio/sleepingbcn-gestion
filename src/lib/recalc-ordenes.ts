import { supabase } from "@/integrations/supabase/client";

type Task = {
  id_limpieza: number;
  id_apt: number;
  numero_reserva: string | null;
  fecha_limpieza: string;
  hora_out_time: string | null;
  hora_in_time: string | null;
  orden_trabajo: number | null;
};

function parseHM(s: string | null): { h: number; m: number } | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
}

function dateAt(dateISO: string, time: string | null): Date | null {
  const t = parseHM(time);
  if (!t) return null;
  const dm = dateISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dm) return null;
  return new Date(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), t.h, t.m, 0));
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Recompute orden_trabajo for ALL active limpiezas of (worker, fecha):
 * sort ascending by cleaning-window duration (shortest = order 1).
 * Tasks with null hora_in_time or multi-day windows sort last.
 */
export async function recalcOrdenesTrabajo(worker: number, fecha: string): Promise<void> {
  const { data, error } = await supabase
    .from("limpiezas")
    .select("id_limpieza,id_apt,numero_reserva,fecha_limpieza,hora_out_time,hora_in_time,orden_trabajo")
    .eq("worker", worker)
    .eq("fecha_limpieza", fecha)
    .neq("estado", "anulada");
  if (error) throw error;
  const tasks = (data ?? []) as Task[];
  if (tasks.length === 0) return;

  // Look up next reservation check-in date per apartment.
  const aptIds = Array.from(new Set(tasks.map((t) => t.id_apt)));
  const endISO = addDaysISO(fecha, 14);
  const { data: vres, error: e2 } = await supabase
    .from("v_reservas_por_apartamento")
    .select(`"Número","Check in",id_apt`)
    .in("id_apt", aptIds)
    .not("Estado", "in", '("Cancelada","No show")')
    .gte("Check in", fecha)
    .lte("Check in", endISO)
    .order("Check in", { ascending: true });
  if (e2) throw e2;
  const nextByApt = new Map<number, { numero: string; ci: string }[]>();
  for (const r of (vres ?? []) as any[]) {
    const arr = nextByApt.get(r.id_apt) ?? [];
    arr.push({ numero: r["Número"], ci: r["Check in"] });
    nextByApt.set(r.id_apt, arr);
  }

  const scored = tasks.map((t) => {
    const co = dateAt(t.fecha_limpieza, t.hora_out_time);
    const arr = nextByApt.get(t.id_apt) ?? [];
    const next = arr.find((x) => x.numero !== t.numero_reserva) ?? null;
    const ci = next ? dateAt(next.ci, t.hora_in_time) : null;
    const mins =
      co && ci ? Math.round((ci.getTime() - co.getTime()) / 60000) : Number.POSITIVE_INFINITY;
    return { t, mins };
  });
  scored.sort((a, b) => a.mins - b.mins || a.t.id_limpieza - b.t.id_limpieza);

  // Apply new orden_trabajo where it differs.
  await Promise.all(
    scored.map(({ t }, i) => {
      const newOrden = i + 1;
      if (t.orden_trabajo === newOrden) return Promise.resolve();
      return supabase
        .from("limpiezas")
        .update({ orden_trabajo: newOrden })
        .eq("id_limpieza", t.id_limpieza);
    }),
  );
}