import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Link2, Sofa } from "lucide-react";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/programacion-limpiezas")({
  component: ProgramacionLimpiezasPage,
});

type Grupo = {
  id_grupo: number;
  nombre: string;
  orden: number | null;
  mostrar_por_defecto: boolean | null;
};

type Apartamento = {
  id_apt: number;
  nombre: string;
  id_grupo: number;
  camas_fijas: number | null;
  tiene_sofa_cama: boolean | null;
  orden: number | null;
  activo: boolean;
};

type ReservaRow = {
  Número: string;
  "Check in": string | null;
  "Check-out": string | null;
  id_apt: number | null;
  Huéspedes: number | null;
  Estado: string | null;
  "Hora estimada de llegada": string | null;
  "Hora estimada de salida": string | null;
  Portal: string | null;
  es_reserva_compartida: boolean | null;
  habitaciones_original: string | null;
  referencia: string | null;
  hCheckInConf: string | null;
  hCheckOutConf: string | null;
};

const DOW = ["D", "L", "M", "X", "J", "V", "S"];
const DAY_COL_W = 96; // px per day column
const APT_COL_W = 160; // px for left apartment column

function toISO(d: Date) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function defaultRange(): { from: Date; to: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return { from: addDays(today, -2), to: addDays(today, 7) };
}

async function fetchGrupos(): Promise<Grupo[]> {
  const { data, error } = await supabase
    .from("grupos_apartamentos")
    .select("id_grupo, nombre, orden, mostrar_por_defecto")
    .order("orden", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Grupo[];
}

async function fetchApartamentos(): Promise<Apartamento[]> {
  const { data, error } = await supabase
    .from("apartamentos")
    .select("id_apt, nombre, id_grupo, camas_fijas, tiene_sofa_cama, orden, activo")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Apartamento[];
}

async function fetchReservas(fromISO: string, toExclusiveISO: string): Promise<ReservaRow[]> {
  const { data: vres, error } = await supabase
    .from("v_reservas_por_apartamento")
    .select("*")
    .lt("Check in", toExclusiveISO)
    .gt("Check-out", fromISO);
  if (error) throw error;
  const rows = (vres ?? []) as any[];
  if (rows.length === 0) return [];
  const numeros = Array.from(new Set(rows.map((r) => r["Número"]).filter(Boolean)));
  const [kbRes, gestRes] = await Promise.all([
    supabase.from("reservas_kb").select("Número, Referencia").in("Número", numeros),
    supabase
      .from("reservas_gestio")
      .select("Número, HCheckInConf, HCheckOutConf")
      .in("Número", numeros),
  ]);
  const kbMap = new Map((kbRes.data ?? []).map((r: any) => [r["Número"], r["Referencia"]]));
  const gestMap = new Map((gestRes.data ?? []).map((r: any) => [r["Número"], r]));
  return rows.map((r) => ({
    Número: r["Número"],
    "Check in": r["Check in"],
    "Check-out": r["Check-out"],
    id_apt: r.id_apt,
    Huéspedes: r["Huéspedes"],
    Estado: r["Estado"],
    "Hora estimada de llegada": r["Hora estimada de llegada"],
    "Hora estimada de salida": r["Hora estimada de salida"],
    Portal: r["Portal"],
    es_reserva_compartida: r.es_reserva_compartida,
    habitaciones_original: r.habitaciones_original,
    referencia: kbMap.get(r["Número"]) ?? null,
    hCheckInConf: gestMap.get(r["Número"])?.HCheckInConf ?? null,
    hCheckOutConf: gestMap.get(r["Número"])?.HCheckOutConf ?? null,
  }));
}

// Estado → bar background color (mirror of EstadoBadge palette)
const ESTADO_BAR: Record<string, string> = {
  "Confirmada": "bg-green-600 text-white",
  "En espera de confirmación": "bg-orange-500 text-white",
  "En espera de confirmación (Caducadas)": "bg-orange-200 text-orange-900",
  "Check-out realizado": "bg-gray-400 text-white",
  "No show": "bg-neutral-800 text-white",
  "Check-in realizado": "bg-blue-600 text-white",
  "En salida": "bg-pink-500 text-white",
  "En limpieza": "bg-teal-500 text-white",
  "Cancelada": "bg-red-600 text-white",
};

function trimHM(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

function resolveTime(
  conf: string | null,
  estimada: string | null,
  defaultVal: string,
): { value: string; informed: boolean } {
  const c = trimHM(conf);
  if (c) return { value: c, informed: true };
  const e = trimHM(estimada);
  if (e) return { value: e, informed: true };
  return { value: defaultVal, informed: false };
}
type FilterMode = "default" | "all" | "custom";

function ProgramacionLimpiezasPage() {
  const [range, setRange] = useState(defaultRange);
  const [filterMode, setFilterMode] = useState<FilterMode>("default");
  const [customGroups, setCustomGroups] = useState<Set<number>>(new Set());

  const gruposQ = useQuery({ queryKey: ["grupos_apartamentos"], queryFn: fetchGrupos });
  const aptsQ = useQuery({ queryKey: ["apartamentos_activos"], queryFn: fetchApartamentos });

  const days = useMemo(() => {
    const out: Date[] = [];
    const start = new Date(range.from);
    const end = new Date(range.to);
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(new Date(d));
    return out;
  }, [range]);

  const todayISO = toISO(new Date());

  const fetchFromISO = toISO(addDays(range.from, -1));
  const fetchToExclusiveISO = toISO(addDays(range.to, 2));
  const reservasQ = useQuery({
    queryKey: ["v_reservas_por_apartamento", fetchFromISO, fetchToExclusiveISO],
    queryFn: () => fetchReservas(fetchFromISO, fetchToExclusiveISO),
  });

  const reservasByApt = useMemo(() => {
    const m = new Map<number, ReservaRow[]>();
    for (const r of reservasQ.data ?? []) {
      if (r.id_apt == null) continue;
      const arr = m.get(r.id_apt) ?? [];
      arr.push(r);
      m.set(r.id_apt, arr);
    }
    return m;
  }, [reservasQ.data]);

  const sharedByNumero = useMemo(() => {
    const m = new Map<string, ReservaRow[]>();
    for (const r of reservasQ.data ?? []) {
      if (!r.es_reserva_compartida) continue;
      const arr = m.get(r.Número) ?? [];
      arr.push(r);
      m.set(r.Número, arr);
    }
    return m;
  }, [reservasQ.data]);

  const shiftDays = (n: number) =>
    setRange((r) => ({ from: addDays(r.from, n), to: addDays(r.to, n) }));

  const resetToday = () => setRange(defaultRange());

  const visibleGrupos = useMemo(() => {
    const all = gruposQ.data ?? [];
    if (filterMode === "all") return all;
    if (filterMode === "default") return all.filter((g) => g.mostrar_por_defecto);
    return all.filter((g) => customGroups.has(g.id_grupo));
  }, [gruposQ.data, filterMode, customGroups]);

  const toggleGroup = (id: number) => {
    setFilterMode("custom");
    setCustomGroups((prev) => {
      const next = new Set(prev);
      if (filterMode !== "custom") {
        // seed from current visible
        const seed = new Set(visibleGrupos.map((g) => g.id_grupo));
        if (seed.has(id)) seed.delete(id);
        else seed.add(id);
        return seed;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const aptsByGroup = useMemo(() => {
    const map = new Map<number, Apartamento[]>();
    for (const a of aptsQ.data ?? []) {
      const arr = map.get(a.id_grupo) ?? [];
      arr.push(a);
      map.set(a.id_grupo, arr);
    }
    return map;
  }, [aptsQ.data]);

  const fmtShort = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

  const rangeLabel = `${fmtShort(range.from)} – ${fmtShort(range.to)}`;

  const gridWidth = APT_COL_W + DAY_COL_W * days.length;

  return (
    <AppShell title="Programación de limpiezas">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => shiftDays(-7)}>
          <ChevronLeft className="h-4 w-4" /> 7d
        </Button>
        <Button variant="outline" size="sm" onClick={() => shiftDays(-1)}>
          <ChevronLeft className="h-4 w-4" /> 1d
        </Button>
        <div className="px-3 py-1.5 text-sm font-medium border rounded-md bg-white min-w-[140px] text-center">
          {rangeLabel}
        </div>
        <Button variant="outline" size="sm" onClick={() => shiftDays(1)}>
          1d <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => shiftDays(7)}>
          7d <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={resetToday}>
          Hoy
        </Button>
      </div>

      {/* Group filter chips */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterMode("default")}
          className={cn(
            "px-3 py-1 rounded-full text-xs border transition-colors",
            filterMode === "default"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-white hover:bg-muted",
          )}
        >
          Por defecto
        </button>
        <button
          onClick={() => setFilterMode("all")}
          className={cn(
            "px-3 py-1 rounded-full text-xs border transition-colors",
            filterMode === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-white hover:bg-muted",
          )}
        >
          Todos
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        {(gruposQ.data ?? []).map((g) => {
          const active = visibleGrupos.some((v) => v.id_grupo === g.id_grupo);
          return (
            <button
              key={g.id_grupo}
              onClick={() => toggleGroup(g.id_grupo)}
              className={cn(
                "px-3 py-1 rounded-full text-xs border transition-colors",
                active
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-muted-foreground hover:bg-muted",
              )}
            >
              {g.nombre}
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <div style={{ width: gridWidth, minWidth: "100%" }}>
            {/* Sticky day header */}
            <div className="flex sticky top-0 z-20 bg-white border-b">
              <div
                className="shrink-0 sticky left-0 z-30 bg-white border-r px-3 py-2 text-xs font-medium text-muted-foreground"
                style={{ width: APT_COL_W }}
              >
                Apartamento
              </div>
              {days.map((d) => {
                const iso = toISO(d);
                const isToday = iso === todayISO;
                return (
                  <div
                    key={iso}
                    className={cn(
                      "shrink-0 border-r text-center py-2 text-xs",
                      isToday ? "bg-primary/10 font-semibold" : "text-muted-foreground",
                    )}
                    style={{ width: DAY_COL_W }}
                  >
                    <div>{DOW[d.getDay()]}</div>
                    <div>{fmtShort(d)}</div>
                  </div>
                );
              })}
            </div>

            {/* Group sections */}
            {(gruposQ.isLoading || aptsQ.isLoading) && (
              <div className="p-6 text-center text-sm text-muted-foreground">Cargando…</div>
            )}
            {!gruposQ.isLoading && visibleGrupos.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Ningún grupo seleccionado
              </div>
            )}
            {visibleGrupos.map((g) => {
              const apts = aptsByGroup.get(g.id_grupo) ?? [];
              return (
                <div key={g.id_grupo}>
                  {/* Group header bar */}
                  <div className="flex bg-muted/60 border-b border-t">
                    <div
                      className="sticky left-0 z-10 bg-muted/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                      style={{ width: APT_COL_W + DAY_COL_W * days.length }}
                    >
                      {g.nombre}
                    </div>
                  </div>
                  {apts.map((a) => (
                    <div key={a.id_apt} className="flex border-b relative" style={{ height: 70 }}>
                      <div
                        className="shrink-0 sticky left-0 z-10 bg-white border-r px-3 py-2 flex flex-col justify-center"
                        style={{ width: APT_COL_W }}
                      >
                        <div className="text-sm font-medium truncate">{a.nombre}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {a.camas_fijas ?? 0} camas
                          {a.tiene_sofa_cama && (
                            <span className="ml-1 inline-block px-1 py-px rounded bg-slate-200 text-slate-700 text-[10px] font-medium">
                              SFC
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className="relative"
                        style={{ width: DAY_COL_W * days.length, height: 70 }}
                      >
                        <div className="flex h-full">
                          {days.map((d) => {
                            const iso = toISO(d);
                            const isToday = iso === todayISO;
                            return (
                              <div
                                key={iso}
                                className={cn(
                                  "shrink-0 border-r h-full",
                                  isToday && "bg-primary/5",
                                )}
                                style={{ width: DAY_COL_W }}
                              />
                            );
                          })}
                        </div>
                        {(reservasByApt.get(a.id_apt) ?? []).map((r) => (
                          <ReservaBar
                            key={r.Número + "-" + a.id_apt}
                            r={r}
                            apt={a}
                            days={days}
                            sharedOthers={
                              r.es_reserva_compartida
                                ? (sharedByNumero.get(r.Número) ?? []).filter(
                                    (x) => x.id_apt !== a.id_apt,
                                  )
                                : []
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {apts.length === 0 && (
                    <div className="px-3 py-3 text-xs text-muted-foreground border-b">
                      Sin apartamentos activos
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
