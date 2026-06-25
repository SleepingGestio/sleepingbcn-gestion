import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
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
import { generarLimpiezas } from "@/lib/generar-limpiezas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

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
const DAY_COL_W = 112; // px per day column — legible worker codes / times at 12-day default
const APT_COL_W = 160; // px for left apartment column
const ROW_H = 38; // px per apartment row (compact: one reservation lane)

export function bedLabel(camas: number | null | undefined): string {
  const pax = camas ?? 0;
  if (pax <= 0) return "—";
  const beds = Math.ceil(pax / 2);
  return `${beds} ${beds === 1 ? "cama" : "camas"} · ${pax} pax`;
}

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
  // Default visible window: today-2 .. today+9 (12 columns total)
  return { from: addDays(today, -2), to: addDays(today, 9) };
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
    .in("Estado", ["Confirmada", "Check-in realizado", "Check-out realizado"])
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
  "Confirmada": "bg-emerald-500/85 text-white",
  "En espera de confirmación": "bg-amber-500/80 text-white",
  "En espera de confirmación (Caducadas)": "bg-amber-200 text-amber-900",
  "Check-out realizado": "bg-slate-400/80 text-white",
  "No show": "bg-slate-600/80 text-white",
  "Check-in realizado": "bg-sky-500/85 text-white",
  "En salida": "bg-rose-400/85 text-white",
  "En limpieza": "bg-teal-400/85 text-white",
  "Cancelada": "bg-rose-500/80 text-white",
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
        loadKey: number;
        apt: { id_apt: number; nombre: string; grupo_nombre?: string | null; camas_fijas?: number | null; tiene_sofa_cama?: boolean | null };
        fecha: string;
        existing: LimpiezaRow | null;
      }
  >(null);
  const popoverLoadSeq = useRef(0);
  const [genOpen, setGenOpen] = useState(false);

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

  const limpiezasByApt = useMemo(() => {
    const m = new Map<number, LimpiezaRow[]>();
    for (const l of limpiezasQ.data ?? []) {
      const arr = m.get(l.id_apt) ?? [];
      arr.push(l);
      m.set(l.id_apt, arr);
    }
    return m;
  }, [limpiezasQ.data]);

  // Per apartment, the set of check-in dates of (non-cancelled) reservations.
  // Used to detect NENTRAN: a salida task whose next reservation does not
  // arrive on the SAME calendar day as the checkout.
  const checkinDaysByApt = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const r of reservasQ.data ?? []) {
      if (r.id_apt == null || !r["Check in"]) continue;
      const s = m.get(r.id_apt) ?? new Set<string>();
      s.add(r["Check in"]);
      m.set(r.id_apt, s);
    }
    return m;
  }, [reservasQ.data]);

  const [onlyAffected, setOnlyAffected] = useState(false);
  const affectedCount = useMemo(
    () => (limpiezasQ.data ?? []).filter((l) => l.affected_by_kb_change).length,
    [limpiezasQ.data],
  );

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
  const dayISOs = useMemo(() => days.map(toISO), [days]);

  const grupoNombreById = (id: number) =>
    (gruposQ.data ?? []).find((g) => g.id_grupo === id)?.nombre ?? null;

  const workerCodigo = (id: number | null) =>
    id == null ? null : limpiadoresQ.data?.find((p) => p.id_persona === id)?.codigo ?? null;

  return (
    <AppShell title="Programación de limpiezas">
      {affectedCount > 0 && (
        <button
          type="button"
          onClick={() => setOnlyAffected((v) => !v)}
          className={cn(
            "mb-3 w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
            onlyAffected
              ? "bg-orange-500 border-orange-600 text-white"
              : "bg-orange-50 border-orange-300 text-orange-900 hover:bg-orange-100",
          )}
        >
          <span className="font-semibold">{affectedCount}</span>{" "}
          {affectedCount === 1 ? "limpieza afectada" : "limpiezas afectadas"} — revisar
          <span className="ml-2 text-xs opacity-80">
            {onlyAffected ? "(filtro activo · clic para quitar)" : "(clic para filtrar)"}
          </span>
        </button>
      )}
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
        <Button
          size="sm"
          onClick={() => setGenOpen(true)}
          className="bg-purple-700 hover:bg-purple-800 text-white"
        >
          <Sparkles className="h-4 w-4" /> Generar limpiezas automáticas
        </Button>
        <div className="ml-auto" />
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
            <div className="flex sticky top-0 z-40 bg-white border-b">
              <div
                className="shrink-0 sticky left-0 z-50 bg-white border-r px-3 py-2 text-xs font-medium text-muted-foreground"
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
                      className="shrink-0 sticky left-0 z-30 bg-muted/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                      style={{ width: APT_COL_W }}
                    >
                      {g.nombre}
                    </div>
                    <div
                      className="shrink-0 bg-muted/60"
                      style={{ width: DAY_COL_W * days.length }}
                    />
                  </div>
                  {apts.map((a) => (
                    <div key={a.id_apt} className="flex border-b relative" style={{ height: ROW_H }}>
                      <div
                        className="shrink-0 sticky left-0 z-30 bg-white border-r px-3 py-1 flex flex-col justify-center"
                        style={{ width: APT_COL_W }}
                      >
                        <div className="text-sm font-medium truncate leading-tight">{a.nombre}</div>
                        <div className="text-[11px] text-muted-foreground leading-tight">
                          {bedLabel(a.camas_fijas)}
                          {a.tiene_sofa_cama && (
                            <span className="ml-1 inline-block px-1 py-px rounded bg-slate-200 text-slate-700 text-[10px] font-medium">
                              SFC
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className="relative overflow-hidden"
                        style={{ width: DAY_COL_W * days.length, height: ROW_H }}
                      >
                        <div className="flex h-full">
                          {days.map((d) => {
                            const iso = toISO(d);
                            const isToday = iso === todayISO;
                            return (
                              <button
                                key={iso}
                                type="button"
                                className={cn(
                                  "shrink-0 border-r h-full hover:bg-muted/40 transition-colors",
                                  isToday && "bg-primary/5",
                                )}
                                style={{ width: DAY_COL_W }}
                                onClick={() => {
                                  const existing =
                                    limpiezasByAptDay.get(`${a.id_apt}|${iso}`) ?? null;
                                  const loadKey = ++popoverLoadSeq.current;
                                  const skeleton: LimpiezaRow | null = existing
                                    ? null
                                    : {
                                        id_limpieza: 0,
                                        numero_reserva: null,
                                        id_apt: a.id_apt,
                                        fecha_limpieza: iso,
                                        tipo: "intermedia",
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
                                        check_toallas: true,
                                        check_sabanas: true,
                                        check_limpieza_basica: true,
                                        check_limpieza_completa: false,
                                        observaciones: null,
                                        estado: "activa",
                                        motivo_anulacion: null,
                                        affected_by_kb_change: false,
                                        affected_reason: null,
                                        proxima_reserva_numero: null,
                                      };
                                  setPopover({
                                    loadKey,
                                    apt: {
                                      id_apt: a.id_apt,
                                      nombre: a.nombre,
                                      grupo_nombre: grupoNombreById(a.id_grupo),
                                      camas_fijas: a.camas_fijas,
                                      tiene_sofa_cama: a.tiene_sofa_cama,
                                    },
                                    fecha: iso,
                                    existing: existing ?? skeleton,
                                  });
                                }}
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
                        {(limpiezasByApt.get(a.id_apt) ?? []).map((l) => {
                          const idx = dayISOs.indexOf(l.fecha_limpieza);
                          if (idx < 0) return null;
                          if (onlyAffected && !l.affected_by_kb_change) return null;
                          const onOpen = () => {
                            const loadKey = ++popoverLoadSeq.current;
                            setPopover({
                              loadKey,
                              apt: {
                                id_apt: a.id_apt,
                                nombre: a.nombre,
                                grupo_nombre: grupoNombreById(a.id_grupo),
                                camas_fijas: a.camas_fijas,
                                tiene_sofa_cama: a.tiene_sofa_cama,
                              },
                              fecha: l.fecha_limpieza,
                              existing: l,
                            });
                          };
                          if (l.tipo === "intermedia") {
                            return (
                              <IntermediaOverlay
                                key={l.id_limpieza}
                                l={l}
                                codigo={workerCodigo(l.worker)}
                                dayIdx={idx}
                                onClick={onOpen}
                              />
                            );
                          }
                          return (
                            <SalidaLabel
                              key={l.id_limpieza}
                              l={l}
                              codigo={workerCodigo(l.worker)}
                              dayIdx={idx}
                              onClick={onOpen}
                            />
                          );
                        })}
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
          key={`${popover.apt.id_apt}|${popover.fecha}|${popover.existing?.id_limpieza ?? 0}|${popover.loadKey}`}
          open={!!popover}
          loadKey={popover.loadKey}
          onOpenChange={(o) => !o && setPopover(null)}
          apt={popover.apt}
          fecha={popover.fecha}
          existing={popover.existing}
          onSaved={() => limpiezasQ.refetch()}
        />
      )}
      <GenerarDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        onDone={() => limpiezasQ.refetch()}
      />
    </AppShell>
  );
}

function GenerarDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const today = toISO(new Date());
  const [mode, setMode] = useState<"hoy" | "3d" | "5d" | "custom">("hoy");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [running, setRunning] = useState(false);

  function effectiveRange(): { from: string; to: string } {
    if (mode === "hoy") return { from: today, to: today };
    if (mode === "3d") return { from: today, to: toISO(addDays(new Date(), 3)) };
    if (mode === "5d") return { from: today, to: toISO(addDays(new Date(), 5)) };
    return { from, to };
  }

  const run = async () => {
    setRunning(true);
    try {
      const r = effectiveRange();
      const res = await generarLimpiezas(r.from, r.to);
      toast.success(`${res.created} limpiezas generadas`);
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Generar limpiezas</DialogTitle>
          <DialogDescription className="text-xs">
            Crea las limpiezas (salida e intermedias) que faltan para el rango seleccionado. No se sobreescriben campos editados manualmente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "hoy", label: "Hoy" },
              { id: "3d", label: "Próximos 3 días" },
              { id: "5d", label: "Próximos 5 días" },
              { id: "custom", label: "Personalizar" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id as typeof mode)}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                  mode === opt.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white hover:bg-muted",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {mode === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancelar
          </Button>
          <Button onClick={run} disabled={running}>
            {running ? "Generando…" : "Generar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    ciVisible ? ciIdx * DAY_COL_W + 0.66 * DAY_COL_W : ciIdx < 0 ? 0 : days.length * DAY_COL_W;
  const right =
    coVisible ? coIdx * DAY_COL_W + 0.18 * DAY_COL_W : coIdx < 0 ? 0 : days.length * DAY_COL_W;
  const width = right - left;
  if (width <= 2) return null;

  const colorClass =
    ESTADO_BAR[r.Estado ?? ""] ?? "bg-secondary text-secondary-foreground";

  // LEFT edge = check-in time; RIGHT edge = check-out time
  const leftTime = resolveTime(r.hCheckInConf, r["Hora estimada de llegada"], "15:00");
  const rightTime = resolveTime(r.hCheckOutConf, r["Hora estimada de salida"], "11:00");

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
          style={{ left, width, top: 3, height: 20 }}
        >
          <TimeBadge {...leftTime} />
          {!r.es_reserva_compartida && (
            <span className="shrink-0 rounded-full bg-black/25 px-1.5 py-px text-[10px] leading-4 flex items-center gap-0.5">
              {guestCount}p
              {overCapacity && <Sofa className="h-3 w-3" />}
            </span>
          )}
          <span className="flex-1 truncate flex items-center gap-1 min-w-0">
            {r.es_reserva_compartida && (
              <Link2 className="h-3 w-3 shrink-0 opacity-90" />
            )}
            <span className="truncate">{guestLabel}</span>
          </span>
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

function cleaningState(l: Limpieza) {
  const anulada = l.estado === "anulada";
  const enCurso = l.estado === "en_curso";
  const finalizada = l.estado === "finalizada";
  const rechazada = l.estado === "rechazada";
  const isPriority =
    l.prioritaria_manual !== null && l.prioritaria_manual !== undefined
      ? l.prioritaria_manual
      : !!l.prioritaria;
  const hasWorker = l.worker != null;
  const affected = !!l.affected_by_kb_change;
  return { anulada, enCurso, finalizada, rechazada, isPriority, hasWorker, affected };
}

function SalidaLabel({
  l,
  codigo,
  dayIdx,
  onClick,
}: {
  l: Limpieza;
  codigo: string | null;
  dayIdx: number;
  onClick: () => void;
}) {
  const { anulada, enCurso, finalizada, rechazada, isPriority, hasWorker, affected } = cleaningState(l);
  const left = dayIdx * DAY_COL_W + 0.24 * DAY_COL_W;
  const width = 0.36 * DAY_COL_W;

  let cls = "bg-rose-400/85 text-white border border-dashed border-rose-500";
  if (anulada) {
    cls =
      "bg-gray-300 text-gray-600 line-through bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(0,0,0,0.08)_4px_8px)]";
  } else if (enCurso) {
    cls = "bg-violet-500/85 text-white";
  } else if (rechazada) {
    cls = "bg-red-600 text-white border border-red-700";
  } else if (finalizada) {
    cls = "bg-emerald-200 text-emerald-900 opacity-70";
  } else if (hasWorker && isPriority) {
    cls = "bg-amber-500/85 text-white";
  } else if (hasWorker) {
    cls = "bg-purple-700/90 text-white";
  }
  if (affected && !anulada) {
    cls = "bg-orange-100 text-orange-900 border border-dashed border-orange-500";
  }
  const label = anulada
    ? "NUL"
    : rechazada
      ? `! ${codigo ?? `#${l.worker}`}`
      : finalizada
        ? `✓ ${codigo ?? `#${l.worker}`}`
        : hasWorker
          ? codigo ?? `#${l.worker}`
          : "Sin asig.";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute z-10 rounded flex items-center justify-center gap-1 px-1 text-[10px] font-semibold overflow-hidden shadow-sm",
        cls,
      )}
      style={{ left, width, top: 3, height: 20 }}
      title={`Salida · ${l.fecha_limpieza}`}
    >
      <span className="truncate">{label}</span>
      {hasWorker && l.orden_trabajo != null && !anulada && (
        <span className="shrink-0 h-3.5 min-w-[14px] rounded-full bg-black/30 px-1 text-[9px] leading-[14px] text-center">
          {l.orden_trabajo}
        </span>
      )}
    </button>
  );
}

function IntermediaOverlay({
  l,
  codigo,
  dayIdx,
  onClick,
}: {
  l: Limpieza;
  codigo: string | null;
  dayIdx: number;
  onClick: () => void;
}) {
  const { anulada, hasWorker, affected, isPriority, enCurso, finalizada, rechazada } = cleaningState(l);
  // base: dark purple translucent overlay on top of reservation bar
  let cls =
    "bg-purple-700/60 text-white border border-dashed border-purple-200/90 backdrop-blur-[1px]";
  if (anulada) {
    cls =
      "bg-gray-400/60 text-white line-through bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(0,0,0,0.15)_4px_8px)] border border-dashed border-gray-500";
  } else if (affected) {
    cls = "bg-amber-500/60 text-white border border-dashed border-amber-200";
  } else if (enCurso) {
    cls = "bg-violet-500/60 text-white border border-dashed border-violet-200";
  } else if (rechazada) {
    cls = "bg-red-600/80 text-white border border-red-700";
  } else if (finalizada) {
    cls = "bg-emerald-300/60 text-emerald-950 border border-dashed border-emerald-400 opacity-80";
  } else if (hasWorker && isPriority) {
    cls = "bg-amber-500/55 text-white border border-dashed border-amber-200";
  }
  const left = dayIdx * DAY_COL_W + 0.24 * DAY_COL_W;
  const width = 0.36 * DAY_COL_W;
  const label = anulada
    ? "NUL"
    : rechazada
      ? `! ${codigo ?? `#${l.worker}`}`
      : finalizada
        ? `✓ ${codigo ?? `#${l.worker}`}`
        : hasWorker
          ? codigo ?? `#${l.worker}`
          : "Sin asig.";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute z-10 rounded flex items-center justify-center gap-1 px-1 text-[10px] font-semibold overflow-hidden shadow-sm",
        cls,
      )}
      style={{ left, width, top: 3, height: 20 }}
      title={`Intermedia · ${l.fecha_limpieza}`}
    >
      <span className="truncate">{label}</span>
      {hasWorker && l.orden_trabajo != null && !anulada && (
        <span className="shrink-0 h-3.5 min-w-[14px] rounded-full bg-black/30 px-1 text-[9px] leading-[14px] text-center">
          {l.orden_trabajo}
        </span>
      )}
    </button>
  );
}

