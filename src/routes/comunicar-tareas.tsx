import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sofa, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchLimpiadores } from "@/lib/catalogos";
import { fullName } from "@/lib/types";
import { LimpiezaPopover, type Limpieza } from "@/components/limpieza-popover";
import { toast } from "sonner";

export const Route = createFileRoute("/comunicar-tareas")({
  component: ComunicarTareasPage,
});

type Apartamento = {
  id_apt: number;
  nombre: string;
  id_grupo: number;
  camas_fijas: number | null;
  tiene_sofa_cama: boolean | null;
};

type ComDia = { worker: number; fecha: string; observaciones: string | null };

type ResvLite = {
  Número: string;
  "Check in": string | null;
  "Check-out": string | null;
  "Huéspedes": number | null;
};

const DOW_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function toISO(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fromISO(s: string): Date {
  return new Date(s + "T00:00:00");
}
function trimHM(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}
function dayLabel(iso: string): string {
  const d = fromISO(iso);
  return `${DOW_ES[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function fetchLimpiezasDia(fecha: string): Promise<Limpieza[]> {
  const { data, error } = await supabase
    .from("limpiezas")
    .select("*")
    .eq("fecha_limpieza", fecha)
    .not("worker", "is", null)
    .neq("estado", "anulada")
    .order("orden_trabajo", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Limpieza[];
}

async function fetchApartamentos(): Promise<Apartamento[]> {
  const { data, error } = await supabase
    .from("apartamentos")
    .select("id_apt, nombre, id_grupo, camas_fijas, tiene_sofa_cama")
    .eq("activo", true);
  if (error) throw error;
  return (data ?? []) as Apartamento[];
}

async function fetchReservasLite(numeros: string[]): Promise<Map<string, ResvLite>> {
  if (numeros.length === 0) return new Map();
  const { data, error } = await supabase
    .from("reservas_kb")
    .select(`"Número","Check in","Check-out","Huéspedes"`)
    .in("Número", numeros);
  if (error) throw error;
  const m = new Map<string, ResvLite>();
  for (const r of (data ?? []) as ResvLite[]) m.set(r["Número"], r);
  return m;
}

async function fetchComDia(fecha: string): Promise<ComDia[]> {
  const { data, error } = await supabase
    .from("comunicaciones_dia")
    .select("worker, fecha, observaciones")
    .eq("fecha", fecha);
  if (error) throw error;
  return (data ?? []) as ComDia[];
}

/* ---------- aggregate worker state ---------- */

type AggState =
  | { key: "revisar"; label: "Revisar ⚠"; clickable: true }
  | { key: "cambios"; label: "Cambios pendientes"; clickable: false }
  | { key: "comunicar"; label: "Comunicar"; clickable: true }
  | { key: "pendiente"; label: "Pendiente"; clickable: false }
  | { key: "confirmadas"; label: "✓ Confirmadas"; clickable: false }
  | { key: "vacio"; label: "—"; clickable: false };

function aggregateState(tasks: Limpieza[]): AggState {
  if (tasks.length === 0) return { key: "vacio", label: "—", clickable: false };
  const anyRechazada = tasks.some((t) => t.estado === "rechazada");
  if (anyRechazada) return { key: "revisar", label: "Revisar ⚠", clickable: true };
  const anyActiva = tasks.some((t) => t.estado === "activa");
  const anyChanged = tasks.some((t) => {
    if (t.estado !== "comunicada") return false;
    if (t.affected_by_kb_change) return true;
    const env = (t as any).enviada_en as string | null | undefined;
    const upd = (t as any).actualizado_en as string | null | undefined;
    if (env && upd) return new Date(upd) > new Date(env);
    return false;
  });
  if (anyChanged && !anyActiva) return { key: "cambios", label: "Cambios pendientes", clickable: false };
  if (anyActiva) return { key: "comunicar", label: "Comunicar", clickable: true };
  const anyComunicada = tasks.some((t) => t.estado === "comunicada");
  if (anyComunicada) return { key: "pendiente", label: "Pendiente", clickable: false };
  return { key: "confirmadas", label: "✓ Confirmadas", clickable: false };
}

const STATE_CLASS: Record<AggState["key"], string> = {
  revisar: "bg-red-600 hover:bg-red-700 text-white",
  cambios: "bg-orange-500 text-white",
  comunicar: "bg-purple-800 hover:bg-purple-900 text-white",
  pendiente: "bg-amber-500 text-white",
  confirmadas: "bg-emerald-600 text-white",
  vacio: "bg-muted text-muted-foreground",
};

const ESTADO_BADGE: Record<string, string> = {
  activa: "bg-slate-200 text-slate-800",
  comunicada: "bg-amber-100 text-amber-900",
  aceptada: "bg-emerald-100 text-emerald-900",
  rechazada: "bg-red-100 text-red-900 border border-red-300",
  en_curso: "bg-violet-100 text-violet-900",
  finalizada: "bg-emerald-200 text-emerald-900",
};

/* ---------- page ---------- */

function ComunicarTareasPage() {
  const [fecha, setFecha] = useState<string>(toISO(new Date()));
  const [calOpen, setCalOpen] = useState(false);
  const [popover, setPopover] = useState<
    | null
    | {
        loadKey: number;
        apt: { id_apt: number; nombre: string; camas_fijas?: number | null; tiene_sofa_cama?: boolean | null };
        fecha: string;
        existing: Limpieza | null;
      }
  >(null);
  const popoverSeq = useRef(0);

  const limpiadoresQ = useQuery({ queryKey: ["limpiadores"], queryFn: fetchLimpiadores });
  const aptsQ = useQuery({ queryKey: ["apartamentos_activos_min"], queryFn: fetchApartamentos });
  const tasksQ = useQuery({
    queryKey: ["comunicar_tareas", fecha],
    queryFn: () => fetchLimpiezasDia(fecha),
  });
  const comDiaQ = useQuery({
    queryKey: ["comunicaciones_dia", fecha],
    queryFn: () => fetchComDia(fecha),
  });

  const reservaNumeros = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasksQ.data ?? []) {
      if (t.numero_reserva) s.add(t.numero_reserva);
      if (t.proxima_reserva_numero) s.add(t.proxima_reserva_numero);
    }
    return Array.from(s);
  }, [tasksQ.data]);
  const reservasQ = useQuery({
    queryKey: ["comunicar_reservas_lite", fecha, reservaNumeros.join(",")],
    queryFn: () => fetchReservasLite(reservaNumeros),
    enabled: reservaNumeros.length > 0,
  });

  const aptById = useMemo(() => {
    const m = new Map<number, Apartamento>();
    for (const a of aptsQ.data ?? []) m.set(a.id_apt, a);
    return m;
  }, [aptsQ.data]);

  const tasksByWorker = useMemo(() => {
    const m = new Map<number, Limpieza[]>();
    for (const t of tasksQ.data ?? []) {
      if (t.worker == null) continue;
      const arr = m.get(t.worker) ?? [];
      arr.push(t);
      m.set(t.worker, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.orden_trabajo ?? 999) - (b.orden_trabajo ?? 999));
    }
    return m;
  }, [tasksQ.data]);

  const workers = useMemo(() => {
    const ids = Array.from(tasksByWorker.keys());
    const list = (limpiadoresQ.data ?? []).filter((p) => ids.includes(p.id_persona));
    list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
    return list;
  }, [tasksByWorker, limpiadoresQ.data]);

  const obsByWorker = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of comDiaQ.data ?? []) m.set(c.worker, c.observaciones ?? "");
    return m;
  }, [comDiaQ.data]);

  const openCard = (l: Limpieza) => {
    const apt = aptById.get(l.id_apt);
    if (!apt) return;
    setPopover({
      loadKey: ++popoverSeq.current,
      apt: {
        id_apt: apt.id_apt,
        nombre: apt.nombre,
        camas_fijas: apt.camas_fijas,
        tiene_sofa_cama: apt.tiene_sofa_cama,
      },
      fecha: l.fecha_limpieza,
      existing: l,
    });
  };

  const comunicar = async (workerId: number) => {
    const tasks = (tasksByWorker.get(workerId) ?? []).filter((t) => t.estado === "activa");
    if (tasks.length === 0) return;
    const ids = tasks.map((t) => t.id_limpieza);
    const { error } = await supabase
      .from("limpiezas")
      .update({ estado: "comunicada", enviada_en: new Date().toISOString() })
      .in("id_limpieza", ids);
    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    toast.success(`${ids.length} tarea${ids.length === 1 ? "" : "s"} comunicada${ids.length === 1 ? "" : "s"}`);
    tasksQ.refetch();
  };

  const reorder = async (workerId: number, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const arr = (tasksByWorker.get(workerId) ?? []).slice();
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    await Promise.all(
      arr.map((t, i) =>
        supabase.from("limpiezas").update({ orden_trabajo: i + 1 }).eq("id_limpieza", t.id_limpieza),
      ),
    );
    tasksQ.refetch();
  };

  const saveObs = async (workerId: number, value: string) => {
    const prev = obsByWorker.get(workerId) ?? "";
    if (prev === value) return;
    const { error } = await supabase
      .from("comunicaciones_dia")
      .upsert(
        { worker: workerId, fecha, observaciones: value || null },
        { onConflict: "worker,fecha" },
      );
    if (error) toast.error("Error notas: " + error.message);
    else comDiaQ.refetch();
  };

  return (
    <AppShell title="Comunicar tareas">
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setFecha(toISO(addDays(fromISO(fecha), -1)))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="px-3 py-1.5 text-sm font-medium border rounded-md bg-white min-w-[180px] text-center capitalize">
          {dayLabel(fecha)}
        </div>
        <Button variant="outline" size="sm" onClick={() => setFecha(toISO(addDays(fromISO(fecha), 1)))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={fromISO(fecha)}
              onSelect={(d) => {
                if (d) {
                  setFecha(toISO(d));
                  setCalOpen(false);
                }
              }}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <Button variant="secondary" size="sm" onClick={() => setFecha(toISO(new Date()))}>
          Hoy
        </Button>
      </div>

      {/* Columns */}
      {tasksQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : workers.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Sin tareas asignadas a ningún limpiador para este día.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {workers.map((w) => {
            const tasks = tasksByWorker.get(w.id_persona) ?? [];
            const state = aggregateState(tasks);
            return (
              <WorkerColumn
                key={w.id_persona}
                worker={w}
                tasks={tasks}
                state={state}
                aptById={aptById}
                reservas={reservasQ.data ?? new Map()}
                onCardClick={openCard}
                onComunicar={() => comunicar(w.id_persona)}
                onReorder={(from, to) => reorder(w.id_persona, from, to)}
                obs={obsByWorker.get(w.id_persona) ?? ""}
                onSaveObs={(v) => saveObs(w.id_persona, v)}
              />
            );
          })}
        </div>
      )}

      {popover && (
        <LimpiezaPopover
          key={`${popover.apt.id_apt}|${popover.fecha}|${popover.existing?.id_limpieza ?? 0}|${popover.loadKey}`}
          open={!!popover}
          loadKey={popover.loadKey}
          onOpenChange={(o) => !o && setPopover(null)}
          apt={popover.apt}
          fecha={popover.fecha}
          existing={popover.existing}
          onSaved={() => {
            tasksQ.refetch();
          }}
        />
      )}
    </AppShell>
  );
}

/* ---------- worker column ---------- */

function Avatar({ codigo }: { codigo: string | null }) {
  return (
    <div className="h-9 w-9 rounded-full bg-purple-700 text-white flex items-center justify-center text-xs font-semibold shrink-0">
      {codigo ?? "?"}
    </div>
  );
}

function TimeBadge({ value, informed }: { value: string; informed: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-4 font-semibold",
        informed ? "bg-emerald-500 text-white" : "bg-gray-300 text-gray-700",
      )}
    >
      {value}
    </span>
  );
}

function WorkerColumn({
  worker,
  tasks,
  state,
  aptById,
  reservas,
  onCardClick,
  onComunicar,
  onReorder,
  obs,
  onSaveObs,
}: {
  worker: { id_persona: number; nombre: string | null; apellidos: string | null; codigo?: string | null };
  tasks: Limpieza[];
  state: AggState;
  aptById: Map<number, Apartamento>;
  reservas: Map<string, ResvLite>;
  onCardClick: (l: Limpieza) => void;
  onComunicar: () => void;
  onReorder: (from: number, to: number) => void;
  obs: string;
  onSaveObs: (v: string) => void;
}) {
  const [obsLocal, setObsLocal] = useState(obs);
  const obsRef = useRef(obs);
  if (obsRef.current !== obs) {
    obsRef.current = obs;
    setObsLocal(obs);
  }
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const onStateClick = () => {
    if (state.key === "comunicar") onComunicar();
    else if (state.key === "revisar") {
      const idx = tasks.findIndex((t) => t.estado === "rechazada");
      if (idx >= 0) onCardClick(tasks[idx]);
    }
  };

  return (
    <div className="w-[320px] shrink-0 flex flex-col gap-2">
      {/* Header */}
      <Card className="p-3 flex items-center gap-3">
        <Avatar codigo={worker.codigo ?? null} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{fullName(worker)}</div>
          <div className="text-xs text-muted-foreground">
            {tasks.length} tarea{tasks.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          type="button"
          disabled={!state.clickable}
          onClick={onStateClick}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            STATE_CLASS[state.key],
            !state.clickable && "cursor-default",
          )}
        >
          {state.label}
        </button>
      </Card>

      {/* Task cards */}
      <div className="flex flex-col gap-2">
        {tasks.map((t, idx) => (
          <TaskCard
            key={t.id_limpieza}
            t={t}
            apt={aptById.get(t.id_apt)}
            reservas={reservas}
            onClick={() => onCardClick(t)}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={() => {
              if (dragIdx !== null) onReorder(dragIdx, idx);
              setDragIdx(null);
            }}
          />
        ))}
      </div>

      {/* Notas del día */}
      <div className="mt-2">
        <div className="text-xs font-medium text-muted-foreground mb-1">Notas del día</div>
        <Textarea
          value={obsLocal}
          onChange={(e) => setObsLocal(e.target.value)}
          onBlur={() => onSaveObs(obsLocal)}
          placeholder="Notas para este limpiador este día..."
          className="min-h-[70px] text-sm bg-white"
        />
      </div>
    </div>
  );
}

/* ---------- task card ---------- */

function TaskCard({
  t,
  apt,
  reservas,
  onClick,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  t: Limpieza;
  apt: Apartamento | undefined;
  reservas: Map<string, ResvLite>;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}) {
  const isRechazada = t.estado === "rechazada";
  const motivo = (t as any).motivo_rechazo as string | null | undefined;
  const horaOut = trimHM(t.hora_out_time);
  const horaIn = trimHM(t.hora_in_time);

  // VACÍO: salida task whose source reservation's checkout is before fecha_limpieza
  const src = t.numero_reserva ? reservas.get(t.numero_reserva) : null;
  const isVacio =
    t.tipo === "salida" && src?.["Check-out"] && src["Check-out"] < t.fecha_limpieza;
  // NENTRAN: next reservation does not check in on fecha_limpieza
  const nxt = t.proxima_reserva_numero ? reservas.get(t.proxima_reserva_numero) : null;
  const isNentran = !nxt || nxt["Check in"] !== t.fecha_limpieza;

  const isPriority =
    t.prioritaria_manual != null ? !!t.prioritaria_manual : !!t.prioritaria;
  const sfcMontar = !!t.sfc_montar;
  const sfcDesmontar = !!t.sfc_desmontar;
  const isIntermedia = t.tipo === "intermedia";
  const nextGuests = nxt?.["Huéspedes"] ?? null;

  const estadoKey = (t.estado ?? "activa") as keyof typeof ESTADO_BADGE;
  const estadoCls = ESTADO_BADGE[estadoKey] ?? "bg-slate-200 text-slate-800";

  return (
    <Card
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "p-3 cursor-pointer hover:shadow-md transition-shadow select-none",
        isRechazada && "border-red-400 bg-red-50",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="h-6 w-6 rounded-full bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center shrink-0">
          {t.orden_trabajo ?? "·"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium truncate flex-1">{apt?.nombre ?? `Apt #${t.id_apt}`}</div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                estadoCls,
              )}
            >
              {t.estado ?? "activa"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            {isVacio ? (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-rose-200 text-rose-900">VACÍA</span>
            ) : (
              <TimeBadge value={horaOut ?? "—"} informed={!!t.hora_out_informed} />
            )}
            <span>→</span>
            {isNentran ? (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-gray-200 text-gray-700">NOENTRAN</span>
            ) : (
              <TimeBadge value={horaIn ?? "—"} informed={!!t.hora_in_informed} />
            )}
            <span className="ml-1 capitalize">{t.tipo ?? ""}</span>
            {nextGuests != null && nextGuests > 0 && !isNentran && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-foreground">
                👤 {nextGuests} {nextGuests === 1 ? "hoste" : "hostes"}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {isIntermedia && (
              <span className="rounded bg-fuchsia-200 text-fuchsia-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                LIMPIEZA EXTRA-CR
              </span>
            )}
            {isPriority && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 text-amber-900 px-1.5 py-0.5 text-[10px] font-semibold">
                <Zap className="h-3 w-3" /> Prioritaria
              </span>
            )}
            {sfcMontar && (
              <span className="inline-flex items-center gap-0.5 rounded bg-indigo-100 text-indigo-900 px-1.5 py-0.5 text-[10px] font-semibold">
                <Sofa className="h-3 w-3" /> Montar SFC
              </span>
            )}
            {sfcDesmontar && (
              <span className="inline-flex items-center gap-0.5 rounded bg-orange-100 text-orange-900 px-1.5 py-0.5 text-[10px] font-semibold">
                <Sofa className="h-3 w-3" /> Desmontar SFC
              </span>
            )}
          </div>
          {isRechazada && motivo && (
            <div className="mt-2 rounded border border-red-300 bg-white px-2 py-1.5 text-xs text-red-900">
              <span className="font-semibold">Rechazo:</span> {motivo}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}