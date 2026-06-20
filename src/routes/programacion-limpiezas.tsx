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
import { LimpiezaPopover, type Limpieza } from "@/components/limpieza-popover";
import { fetchLimpiadores } from "@/lib/catalogos";

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

type LimpiezaRow = Limpieza;

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

async function fetchLimpiezas(fromISO: string, toExclusiveISO: string): Promise<LimpiezaRow[]> {
  const { data, error } = await supabase
    .from("limpiezas")
    .select("*")
    .gte("fecha_limpieza", fromISO)
    .lt("fecha_limpieza", toExclusiveISO);
  if (error) throw error;
  return (data ?? []) as LimpiezaRow[];
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
  const [popover, setPopover] = useState<
    | null
    | {
        apt: { id_apt: number; nombre: string; grupo_nombre?: string | null };
        fecha: string;
        existing: LimpiezaRow | null;
      }
  >(null);

  const gruposQ = useQuery({ queryKey: ["grupos_apartamentos"], queryFn: fetchGrupos });
  const aptsQ = useQuery({ queryKey: ["apartamentos_activos"], queryFn: fetchApartamentos });
  const limpiadoresQ = useQuery({ queryKey: ["limpiadores"], queryFn: fetchLimpiadores });

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
  const limpiezasQ = useQuery({
    queryKey: ["limpiezas-grid", fetchFromISO, fetchToExclusiveISO],
    queryFn: () => fetchLimpiezas(fetchFromISO, fetchToExclusiveISO),
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

  const limpiezasByAptDay = useMemo(() => {
    const m = new Map<string, LimpiezaRow>();
    for (const l of limpiezasQ.data ?? []) {
      m.set(`${l.id_apt}|${l.fecha_limpieza}`, l);
    }
    return m;
  }, [limpiezasQ.data]);

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

  const grupoNombreById = (id: number) =>
    (gruposQ.data ?? []).find((g) => g.id_grupo === id)?.nombre ?? null;

  const workerCodigo = (id: number | null) =>
    id == null ? null : limpiadoresQ.data?.find((p) => p.id_persona === id)?.codigo ?? null;

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
                            const existing = limpiezasByAptDay.get(`${a.id_apt}|${iso}`) ?? null;
                            return (
                              <div
                                key={iso}
                                className={cn(
                                  "shrink-0 border-r h-full relative",
                                  isToday && "bg-primary/5",
                                )}
                                style={{ width: DAY_COL_W }}
                              >
                                {/* Bottom-half click target for empty cells / wraps the bar */}
                                <button
                                  type="button"
                                  className="absolute inset-x-0 bottom-0 h-[55%] hover:bg-muted/40 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPopover({
                                      apt: {
                                        id_apt: a.id_apt,
                                        nombre: a.nombre,
                                        grupo_nombre: grupoNombreById(a.id_grupo),
                                      },
                                      fecha: iso,
                                      existing,
                                    });
                                  }}
                                >
                                  {existing && (
                                    <CleaningBar
                                      l={existing}
                                      codigo={workerCodigo(existing.worker)}
                                    />
                                  )}
                                </button>
                              </div>
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

      {popover && (
        <LimpiezaPopover
          open={!!popover}
          onOpenChange={(o) => !o && setPopover(null)}
          apt={popover.apt}
          fecha={popover.fecha}
          existing={popover.existing}
          onSaved={() => limpiezasQ.refetch()}
        />
      )}
    </AppShell>
  );
}

function ReservaBar({
  r,
  apt,
  days,
  sharedOthers,
}: {
  r: ReservaRow;
  apt: Apartamento;
  days: Date[];
  sharedOthers: ReservaRow[];
}) {
  const ciISO = r["Check in"];
  const coISO = r["Check-out"];
  if (!ciISO || !coISO) return null;

  const dayISOs = days.map(toISO);
  let ciIdx = dayISOs.indexOf(ciISO);
  let coIdx = dayISOs.indexOf(coISO);

  // Clamp out-of-range to visible edges
  const ciVisible = ciIdx >= 0;
  const coVisible = coIdx >= 0;
  if (!ciVisible) ciIdx = ciISO < dayISOs[0] ? -1 : days.length;
  if (!coVisible) coIdx = coISO < dayISOs[0] ? -1 : days.length;

  const left =
    ciVisible ? ciIdx * DAY_COL_W + 0.62 * DAY_COL_W : ciIdx < 0 ? 0 : days.length * DAY_COL_W;
  const right =
    coVisible ? coIdx * DAY_COL_W + 0.2 * DAY_COL_W : coIdx < 0 ? 0 : days.length * DAY_COL_W;
  const width = right - left;
  if (width <= 2) return null;

  const colorClass =
    ESTADO_BAR[r.Estado ?? ""] ?? "bg-secondary text-secondary-foreground";

  // Per spec: LEFT badge = checkout time; RIGHT badge = checkin time
  const leftTime = resolveTime(r.hCheckOutConf, r["Hora estimada de salida"], "11:00");
  const rightTime = resolveTime(r.hCheckInConf, r["Hora estimada de llegada"], "15:00");

  const guestCount = r["Huéspedes"] ?? 0;
  const overCapacity =
    !r.es_reserva_compartida &&
    apt.camas_fijas != null &&
    guestCount > (apt.camas_fijas ?? 0);

  const guestLabel = r.es_reserva_compartida ? "Reserva compartida" : r.referencia ?? "—";

  return (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "absolute rounded-md shadow-sm flex items-center gap-1 px-1 text-[11px] font-medium overflow-hidden cursor-default",
            colorClass,
          )}
          style={{ left, width, top: 24, height: 22 }}
        >
          <TimeBadge {...leftTime} />
          <span className="flex-1 truncate flex items-center gap-1 min-w-0">
            {r.es_reserva_compartida && (
              <Link2 className="h-3 w-3 shrink-0 opacity-90" />
            )}
            <span className="truncate">{guestLabel}</span>
          </span>
          {!r.es_reserva_compartida && (
            <span className="shrink-0 rounded-full bg-black/25 px-1.5 py-px text-[10px] leading-4 flex items-center gap-0.5">
              {guestCount}p
              {overCapacity && <Sofa className="h-3 w-3" />}
            </span>
          )}
          <TimeBadge {...rightTime} />
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 text-xs" align="center">
        <div className="font-semibold text-sm mb-1 flex items-center gap-1">
          {r.es_reserva_compartida && <Link2 className="h-3.5 w-3.5" />}
          {guestLabel}
        </div>
        <div className="text-muted-foreground space-y-0.5">
          <div>
            <span className="font-medium text-foreground">Check-in:</span> {fmtDate(ciISO)}
          </div>
          <div>
            <span className="font-medium text-foreground">Check-out:</span> {fmtDate(coISO)}
          </div>
          <div>
            <span className="font-medium text-foreground">Huéspedes:</span> {guestCount}
          </div>
          <div>
            <span className="font-medium text-foreground">Estado:</span> {r.Estado ?? "—"}
          </div>
          {r.Portal && (
            <div>
              <span className="font-medium text-foreground">Portal:</span> {r.Portal}
            </div>
          )}
          {r.es_reserva_compartida && (
            <div className="pt-1 border-t mt-1">
              <div className="font-medium text-foreground">Otros apartamentos:</div>
              <div>{r.habitaciones_original ?? "—"}</div>
              {sharedOthers.length > 0 && (
                <div className="text-[11px] mt-0.5">
                  {sharedOthers.length} apartamento(s) más en esta reserva
                </div>
              )}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function TimeBadge({ value, informed }: { value: string; informed: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1 py-px text-[10px] leading-4 font-semibold",
        informed ? "bg-emerald-500 text-white" : "bg-gray-300 text-gray-700",
      )}
    >
      {value}
    </span>
  );
}
