import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Zap, Sofa, LogOut, Clock, ArrowLeft, Check, X, Play, Menu, UserCircle2, KeyRound, Square, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/mi-dia")({
  component: MiDiaPage,
});

const DOW_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

type Limpieza = {
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
  prioritaria: boolean | null;
  prioritaria_manual: boolean | null;
  sfc_montar: boolean | null;
  sfc_desmontar: boolean | null;
  check_checkin: boolean | null;
  check_tasas: boolean | null;
  check_toallas: boolean | null;
  check_sabanas: boolean | null;
  check_limpieza_basica: boolean | null;
  check_limpieza_completa: boolean | null;
  observaciones: string | null;
  incidencias: string | null;
  estado: string | null;
  iniciada_en: string | null;
  finalizada_en: string | null;
  rechazada_en: string | null;
  motivo_rechazo: string | null;
  proxima_reserva_numero: string | null;
};

type Apartamento = { id_apt: number; nombre: string };
type ResvLite = { Número: string; "Check in": string | null; "Check-out": string | null; "Huéspedes": number | null };
type ComDia = { worker: number; fecha: string; observaciones: string | null };

function toISO(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function fromISO(s: string): Date {
  return new Date(s + "T00:00:00");
}
function trimHM(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function tabLabel(iso: string, todayISO: string, tomorrowISO: string): string {
  const d = fromISO(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  if (iso === todayISO) return `Hoy ${dd}/${mm}`;
  if (iso === tomorrowISO) return `Mañana ${dd}/${mm}`;
  return `${DOW_SHORT[d.getDay()]} ${dd}/${mm}`;
}

function diffHoursMinutes(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!isFinite(da) || !isFinite(db)) return 0;
  return Math.max(0, (db - da) / 3_600_000);
}

function fmtHours(h: number): string {
  if (h <= 0) return "0h";
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  if (mm === 0) return `${hh}h`;
  return `${hh}h ${String(mm).padStart(2, "0")}`;
}

function windowHours(outTime: string | null, inTime: string | null, fecha: string, inDate: string | null): string | null {
  const o = trimHM(outTime); const i = trimHM(inTime);
  if (!o || !i || !inDate) return null;
  const out = new Date(`${fecha}T${o}:00`).getTime();
  const inn = new Date(`${inDate}T${i}:00`).getTime();
  if (!isFinite(out) || !isFinite(inn)) return null;
  const mins = Math.round((inn - out) / 60000);
  if (mins < 0) return null;
  const h = Math.floor(mins / 60); const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

const VISIBLE_STATES = ["comunicada", "aceptada", "en_curso", "finalizada"] as const;

function MiDiaPage() {
  const { persona, loading: loadingPersona } = useCurrentPersonal();
  const { canView, canEdit, isAdmin } = usePermissions();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const previewParam = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("preview")
    : null;
  const canPreview = isAdmin || canEdit("config_personal") || canView("config_personal");
  const previewId = canPreview && previewParam ? Number(previewParam) : null;

  const previewQ = useQuery({
    queryKey: ["mi-dia-preview-persona", previewId],
    enabled: !!previewId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select("id_persona, nombre, apellidos")
        .eq("id_persona", previewId!)
        .maybeSingle();
      if (error) throw error;
      return data as { id_persona: number; nombre: string | null; apellidos: string | null } | null;
    },
  });

  if (loadingPersona || (previewId && previewQ.isLoading)) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Cargando…</div>;
  }
  const allowed = !!persona && (canView("mi_dia") || !!previewId);
  if (!allowed) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground mb-3">No tienes acceso a esta vista.</p>
          <Button variant="outline" onClick={() => signOut()}><LogOut className="h-4 w-4" /> Cerrar sesión</Button>
        </div>
      </div>
    );
  }
  const targetId = previewId ?? persona!.id_persona;
  const targetName = previewId
    ? ([previewQ.data?.nombre, previewQ.data?.apellidos].filter(Boolean).join(" ") || `#${previewId}`)
    : (persona!.nombre ?? "limpiador/a");
  return (
    <WorkerView
      personalId={targetId}
      nombre={targetName}
      previewing={!!previewId ? targetName : null}
      onExitPreview={() => {
        if (typeof window !== "undefined") {
          window.location.href = "/configuracion?tab=personal";
        } else {
          navigate({ to: "/configuracion", replace: true });
        }
      }}
    />
  );
}

function WorkerView({
  personalId,
  nombre,
  previewing,
  onExitPreview,
}: {
  personalId: number;
  nombre: string;
  previewing?: string | null;
  onExitPreview?: () => void;
}) {
  const { signOut } = useAuth();
  const todayISO = toISO(new Date());
  const tomorrowISO = toISO(new Date(Date.now() + 86400000));
  const monthStart = toISO(startOfMonth(new Date()));
  const monthEnd = toISO(endOfMonth(new Date()));

  const [activeDay, setActiveDay] = useState<string>(todayISO);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [startSheetOpen, setStartSheetOpen] = useState(false);
  const [endSheetOpen, setEndSheetOpen] = useState(false);
  const disabled = !!previewing;

  // Upcoming tasks (today + future)
  const tasksQ = useQuery({
    queryKey: ["mi-dia-tasks", personalId, todayISO],
    queryFn: async (): Promise<Limpieza[]> => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("*")
        .eq("worker", personalId)
        .gte("fecha_limpieza", todayISO)
        .in("estado", VISIBLE_STATES as unknown as string[])
        .order("fecha_limpieza", { ascending: true })
        .order("orden_trabajo", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Limpieza[];
    },
  });

  // Apartments lookup
  const aptIds = useMemo(() => Array.from(new Set((tasksQ.data ?? []).map((t) => t.id_apt))), [tasksQ.data]);
  const aptsQ = useQuery({
    queryKey: ["mi-dia-apts", aptIds.sort().join(",")],
    enabled: aptIds.length > 0,
    queryFn: async (): Promise<Apartamento[]> => {
      const { data, error } = await supabase
        .from("apartamentos")
        .select("id_apt, nombre")
        .in("id_apt", aptIds);
      if (error) throw error;
      return (data ?? []) as Apartamento[];
    },
  });
  const aptById = useMemo(() => {
    const m = new Map<number, Apartamento>();
    for (const a of aptsQ.data ?? []) m.set(a.id_apt, a);
    return m;
  }, [aptsQ.data]);

  // Reservation lookups (for VACÍO / NENTRAN / ventana)
  const numeros = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasksQ.data ?? []) {
      if (t.numero_reserva) s.add(t.numero_reserva);
      if (t.proxima_reserva_numero) s.add(t.proxima_reserva_numero);
    }
    return Array.from(s);
  }, [tasksQ.data]);
  const resvQ = useQuery({
    queryKey: ["mi-dia-resv", numeros.sort().join(",")],
    enabled: numeros.length > 0,
    queryFn: async (): Promise<Map<string, ResvLite>> => {
      const { data, error } = await supabase
        .from("reservas_kb")
        .select(`"Número","Check in","Check-out","Huéspedes"`)
        .in("Número", numeros);
      if (error) throw error;
      const m = new Map<string, ResvLite>();
      for (const r of (data ?? []) as ResvLite[]) m.set(r["Número"], r);
      return m;
    },
  });

  // Day notes for active day
  const comDiaQ = useQuery({
    queryKey: ["mi-dia-comdia", personalId, activeDay],
    queryFn: async (): Promise<ComDia | null> => {
      const { data, error } = await supabase
        .from("comunicaciones_dia")
        .select("worker, fecha, observaciones")
        .eq("worker", personalId)
        .eq("fecha", activeDay)
        .maybeSingle();
      if (error) throw error;
      return (data as ComDia | null) ?? null;
    },
  });

  // Month hours
  const monthTasksQ = useQuery({
    queryKey: ["mi-dia-month", personalId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("id_limpieza, fecha_limpieza, iniciada_en, finalizada_en, estado")
        .eq("worker", personalId)
        .eq("estado", "finalizada")
        .gte("fecha_limpieza", monthStart)
        .lte("fecha_limpieza", monthEnd);
      if (error) throw error;
      return (data ?? []) as { id_limpieza: number; fecha_limpieza: string; iniciada_en: string | null; finalizada_en: string | null; estado: string | null }[];
    },
  });

  const monthHours = useMemo(() => {
    let total = 0;
    for (const t of monthTasksQ.data ?? []) total += diffHoursMinutes(t.iniciada_en, t.finalizada_en);
    return total;
  }, [monthTasksQ.data]);

  // ---- Jornada (fichaje) + generic task ----
  type Fichaje = { id_fichaje: number; hora_entrada: string | null; hora_salida: string | null };
  type ActiveGen = {
    id_registre: number;
    id_tipus: number;
    inici: string;
    notes: string | null;
    tipos_tarea_generica: { nombre: string } | null;
  };
  type TipoGen = { id_tipus: number; nombre: string; orden: number | null };

  const fichajeQ = useQuery({
    queryKey: ["mi-dia-fichaje", personalId, todayISO],
    queryFn: async (): Promise<Fichaje | null> => {
      const { data, error } = await supabase
        .from("fichajes")
        .select("id_fichaje, hora_entrada, hora_salida")
        .eq("id_persona", personalId)
        .eq("fecha", todayISO)
        .is("hora_salida", null)
        .order("hora_entrada", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as Fichaje | null) ?? null;
    },
  });

  const activeGenQ = useQuery({
    queryKey: ["mi-dia-active-gen", personalId, todayISO],
    queryFn: async (): Promise<ActiveGen | null> => {
      const { data, error } = await supabase
        .from("registre_temps_generic")
        .select("id_registre, id_tipus, inici, notes, tipos_tarea_generica(nombre)")
        .eq("id_persona", personalId)
        .is("fi", null)
        .order("inici", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ActiveGen | null) ?? null;
    },
    refetchInterval: 60_000,
  });

  const tiposQ = useQuery({
    queryKey: ["tipos-tarea-generica-active"],
    queryFn: async (): Promise<TipoGen[]> => {
      const { data, error } = await supabase
        .from("tipos_tarea_generica")
        .select("id_tipus, nombre, orden")
        .eq("actiu", true)
        .order("orden", { ascending: true, nullsFirst: false })
        .order("id_tipus");
      if (error) throw error;
      return (data ?? []) as TipoGen[];
    },
  });

  type GrupoLite = { id_grupo: number; nombre: string; orden: number | null };
  type AptLite = { id_apt: number; nombre: string; id_grupo: number | null };

  const gruposQ = useQuery({
    queryKey: ["mi-dia-grupos"],
    queryFn: async (): Promise<GrupoLite[]> => {
      const { data, error } = await supabase
        .from("grupos_apartamentos")
        .select("id_grupo, nombre, orden")
        .order("orden", { ascending: true, nullsFirst: false })
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as GrupoLite[];
    },
  });

  const aptsAllQ = useQuery({
    queryKey: ["mi-dia-apts-all"],
    queryFn: async (): Promise<AptLite[]> => {
      const { data, error } = await supabase
        .from("apartamentos")
        .select("id_apt, nombre, id_grupo")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as AptLite[];
    },
  });

  const activeGen = activeGenQ.data ?? null;
  const fichaje = fichajeQ.data ?? null;

  const refetchJornada = () => {
    fichajeQ.refetch();
    activeGenQ.refetch();
    monthTasksQ.refetch();
  };

  async function startGeneric(
    idTipus: number,
    notes: string,
    idGrupo: number | null,
    idApt: number | null,
  ) {
    if (disabled) return;
    const nowIso = new Date().toISOString();
    // 1. Asegurar fichaje abierto hoy
    let fichajeId = fichaje?.id_fichaje ?? null;
    if (!fichajeId) {
      const { data: f, error: fErr } = await supabase
        .from("fichajes")
        .insert({ id_persona: personalId, fecha: todayISO, hora_entrada: nowIso })
        .select("id_fichaje")
        .single();
      if (fErr) { toast.error("Error fichaje: " + fErr.message); return; }
      fichajeId = (f as { id_fichaje: number }).id_fichaje;
    }
    // 2. Insert registre genèric
    const payload: Record<string, unknown> = {
      id_persona: personalId,
      id_tipus: idTipus,
      inici: nowIso,
      notes: notes.trim() || null,
    };
    if (idApt != null) payload.id_apt = idApt;
    if (idGrupo != null) payload.id_grupo = idGrupo;
    const { error: rErr } = await supabase
      .from("registre_temps_generic")
      .insert(payload);
    if (rErr) { toast.error("Error: " + rErr.message); return; }
    toast.success("Tasca iniciada");
    setStartSheetOpen(false);
    refetchJornada();
  }

  async function finishGeneric() {
    if (disabled || !activeGen) return;
    const nowIso = new Date().toISOString();
    const hores = diffHoursMinutes(activeGen.inici, nowIso);
    const { error } = await supabase
      .from("registre_temps_generic")
      .update({ fi: nowIso, hores_totals: hores })
      .eq("id_registre", activeGen.id_registre);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Tasca finalitzada");
    setEndSheetOpen(true);
    refetchJornada();
  }

  async function tancarJornada() {
    if (disabled || !fichaje) { setEndSheetOpen(false); return; }
    const nowIso = new Date().toISOString();
    const hores = diffHoursMinutes(fichaje.hora_entrada, nowIso);
    const { error } = await supabase
      .from("fichajes")
      .update({ hora_salida: nowIso, horas_totales: hores })
      .eq("id_fichaje", fichaje.id_fichaje);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Jornada tancada");
    setEndSheetOpen(false);
    refetchJornada();
  }

  // Group by day
  const daysWithTasks = useMemo(() => {
    const m = new Map<string, Limpieza[]>();
    for (const t of tasksQ.data ?? []) {
      const arr = m.get(t.fecha_limpieza) ?? [];
      arr.push(t); m.set(t.fecha_limpieza, arr);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, tasks]) => ({
        fecha,
        tasks: tasks.sort((a, b) => (a.orden_trabajo ?? 999) - (b.orden_trabajo ?? 999)),
        hasPending: tasks.some((t) => t.estado === "comunicada"),
      }));
  }, [tasksQ.data]);

  // Default day: first available if today has none
  useEffect(() => {
    if (daysWithTasks.length === 0) return;
    if (!daysWithTasks.some((d) => d.fecha === activeDay)) {
      setActiveDay(daysWithTasks[0].fecha);
    }
  }, [daysWithTasks, activeDay]);

  const activeTasks = daysWithTasks.find((d) => d.fecha === activeDay)?.tasks ?? [];
  const pendingCount = activeTasks.filter((t) => t.estado === "comunicada").length;
  const dayNote = (comDiaQ.data?.observaciones ?? "").trim();

  async function finishTask(task: Limpieza) {
    if (disabled) return;
    const { error } = await supabase
      .from("limpiezas")
      .update({ estado: "finalizada", finalizada_en: new Date().toISOString() })
      .eq("id_limpieza", task.id_limpieza);
    if (error) { toast.error("Error: " + error.message); return; }
    refetchAll();
    setEndSheetOpen(true);
  }

  const refetchAll = () => {
    tasksQ.refetch();
    monthTasksQ.refetch();
  };

  const detailTask = detailId != null ? (tasksQ.data ?? []).find((t) => t.id_limpieza === detailId) ?? null : null;

  const todayHasTasks = daysWithTasks.some((d) => d.fecha === todayISO);
  const todayPendingAssigned = (daysWithTasks.find((d) => d.fecha === todayISO)?.tasks ?? [])
    .filter((t) => t.estado !== "finalizada").length;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {previewing && (
        <div className="sticky top-0 z-40 bg-amber-400 text-amber-950 px-4 py-2 text-sm font-semibold flex items-center gap-2 shadow">
          <span className="flex-1">👁 Modo supervisión — viendo como: {previewing}</span>
          <button
            type="button"
            onClick={() => onExitPreview?.()}
            className="h-7 w-7 grid place-items-center rounded-full hover:bg-amber-500/40"
            aria-label="Salir del modo supervisión"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Header */}
      <header className={cn("sticky z-30 bg-[#26215C] text-white px-4 py-3 shadow-md", previewing ? "top-[36px]" : "top-0")}>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold truncate">Hola, {nombre} 👋</div>
            <div className="text-[11px] text-white/70">SleepingBCN</div>
          </div>
          <button
            type="button"
            onClick={() => setHoursOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/30 px-3 h-10 text-sm font-medium"
            aria-label="Ver horas del mes"
          >
            <Clock className="h-4 w-4" /> {fmtHours(monthHours)} mes
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-full bg-white/10 hover:bg-white/20 h-10 w-10 grid place-items-center"
                aria-label="Menú de cuenta"
              >
                <UserCircle2 className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setPwOpen(true)}>
                <KeyRound className="h-4 w-4" /> Canviar contrasenya
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => signOut()}>
                <LogOut className="h-4 w-4" /> Tancar sessió
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Day tabs */}
      {/* Active generic task banner (always shown if active) */}
      {activeGen && (
        <ActiveGenericBanner
          gen={activeGen}
          onFinish={finishGeneric}
          disabled={disabled}
        />
      )}

      {daysWithTasks.length === 0 ? (
        <div className="p-8 text-center">
          {!activeGen && (
            <>
              <p className="text-sm text-muted-foreground mb-4">No tens tasques assignades avui.</p>
              <Button
                size="lg"
                className="h-14 px-6 bg-[#26215C] hover:bg-[#1e1a48] text-white text-base"
                disabled={disabled}
                onClick={() => setStartSheetOpen(true)}
              >
                <Play className="h-5 w-5" /> Iniciar jornada
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={cn("sticky z-20 bg-slate-50 border-b", previewing ? "top-[96px]" : "top-[60px]")}>
            <div className="flex gap-2 overflow-x-auto px-3 py-2">
              {daysWithTasks.map((d) => {
                const active = d.fecha === activeDay;
                return (
                  <button
                    key={d.fecha}
                    type="button"
                    onClick={() => setActiveDay(d.fecha)}
                    className={cn(
                      "relative shrink-0 rounded-full px-4 h-11 text-sm font-medium transition-colors min-w-[88px]",
                      active
                        ? "bg-[#26215C] text-white"
                        : "bg-white text-slate-700 border border-slate-200",
                    )}
                  >
                    {tabLabel(d.fecha, todayISO, tomorrowISO)}
                    {d.hasPending && (
                      <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pending banner */}
          {pendingCount > 0 && (
            <div className="mx-3 mt-3 rounded-lg bg-amber-100 border border-amber-300 px-3 py-2.5 text-sm text-amber-900">
              🔔 <strong>{pendingCount}</strong> tarea{pendingCount === 1 ? "" : "s"} pendiente{pendingCount === 1 ? "" : "s"} de confirmar — Acepta o rechaza antes de empezar
            </div>
          )}

          {/* Task list */}
          <div className="px-3 pt-3 flex flex-col gap-3">
            {activeTasks.map((t) => (
              <TaskCard
                key={t.id_limpieza}
                t={t}
                apt={aptById.get(t.id_apt)}
                resv={resvQ.data ?? new Map()}
                onChanged={refetchAll}
                onOpenDetail={() => setDetailId(t.id_limpieza)}
                onFinish={() => finishTask(t)}
              />
            ))}
          </div>

          {/* Day notes */}
          {dayNote && (
            <div className="mx-3 mt-4 rounded-lg bg-purple-50 border border-purple-200 px-3 py-2.5 text-sm">
              <div className="text-xs font-semibold text-purple-900 mb-1">📋 Notas del gestor</div>
              <div className="text-slate-800 whitespace-pre-wrap">{dayNote}</div>
            </div>
          )}

          {/* Extra CTA: also let workers start a generic task on days they have assignments */}
          {!activeGen && (
            <div className="px-3 mt-4">
              <Button
                variant="outline"
                className="w-full h-12"
                disabled={disabled}
                onClick={() => setStartSheetOpen(true)}
              >
                <ClipboardList className="h-4 w-4" /> Iniciar tasca genèrica
              </Button>
            </div>
          )}
        </>
      )}

      {/* Detail overlay */}
      <Sheet open={!!detailTask} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
          {detailTask && (
            <DetailView
              t={detailTask}
              apt={aptById.get(detailTask.id_apt)}
              resv={resvQ.data ?? new Map()}
              onClose={() => setDetailId(null)}
              onChanged={refetchAll}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Hours overlay */}
      <Sheet open={hoursOpen} onOpenChange={setHoursOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
          <HoursPanel
            monthHours={monthHours}
            rows={monthTasksQ.data ?? []}
            onClose={() => setHoursOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />

      {/* Start jornada / generic task sheet */}
      <Sheet open={startSheetOpen} onOpenChange={setStartSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <StartJornadaPanel
            tipos={tiposQ.data ?? []}
            grupos={gruposQ.data ?? []}
            apartamentos={aptsAllQ.data ?? []}
            disabled={disabled}
            onStart={startGeneric}
            onCancel={() => setStartSheetOpen(false)}
            onCreateType={async (nombre) => {
              const nextOrden =
                (tiposQ.data ?? []).reduce((m, t) => Math.max(m, t.orden ?? 0), 0) + 1;
              const { data, error } = await supabase
                .from("tipos_tarea_generica")
                .insert({
                  nombre,
                  actiu: true,
                  requiere_apartamento: false,
                  computable_hores: true,
                  orden: nextOrden,
                })
                .select("id_tipus")
                .single();
              if (error) {
                toast.error("Error: " + error.message);
                return null;
              }
              await tiposQ.refetch();
              return (data as { id_tipus: number }).id_tipus;
            }}
          />
        </SheetContent>
      </Sheet>

      {/* End-of-task sheet */}
      <Sheet open={endSheetOpen} onOpenChange={setEndSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <EndTaskPanel
            hasPending={todayHasTasks && todayPendingAssigned > 0}
            disabled={disabled}
            onNewGeneric={() => { setEndSheetOpen(false); setStartSheetOpen(true); }}
            onViewTasks={() => setEndSheetOpen(false)}
            onClose={tancarJornada}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ---------------- Task card ---------------- */

function stateAccent(estado: string | null): string {
  switch (estado) {
    case "comunicada": return "bg-amber-400";
    case "aceptada": return "bg-emerald-500";
    case "en_curso": return "bg-[#26215C]";
    case "finalizada": return "bg-teal-500";
    default: return "bg-slate-300";
  }
}

function StateBadge({ estado }: { estado: string | null }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    comunicada: { label: "⚠ Confirmar", cls: "bg-amber-100 text-amber-900 border-amber-300" },
    aceptada: { label: "✓ Aceptada", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
    en_curso: { label: "⟳ En curso", cls: "bg-violet-100 text-violet-900 border-violet-300" },
    finalizada: { label: "✓ Finalizada", cls: "bg-teal-100 text-teal-900 border-teal-300" },
  };
  const c = cfg[estado ?? ""] ?? { label: estado ?? "—", cls: "bg-slate-100 text-slate-800 border-slate-200" };
  return <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold border", c.cls)}>{c.label}</span>;
}

function TimeChip({ time, informed }: { time: string | null; informed: boolean | null }) {
  const t = trimHM(time) ?? "—";
  return (
    <span className={cn(
      "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
      informed ? "bg-emerald-500 text-white" : "bg-gray-300 text-gray-700",
    )}>{t}</span>
  );
}

function TaskCard({
  t, apt, resv, onChanged, onOpenDetail, onFinish,
}: {
  t: Limpieza;
  apt: Apartamento | undefined;
  resv: Map<string, ResvLite>;
  onChanged: () => void;
  onOpenDetail: () => void;
  onFinish: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const next = t.proxima_reserva_numero ? resv.get(t.proxima_reserva_numero) ?? null : null;
  const nentran = !t.hora_in_time || !next || next["Check in"] !== t.fecha_limpieza;
  const sourceResv = t.numero_reserva ? resv.get(t.numero_reserva) ?? null : null;
  const isVacio = t.tipo === "salida" && !!sourceResv?.["Check-out"] && sourceResv["Check-out"] < t.fecha_limpieza;
  const isIntermedia = t.tipo === "intermedia";
  const nextGuests = next?.["Huéspedes"] ?? null;
  const win = windowHours(t.hora_out_time, t.hora_in_time, t.fecha_limpieza, next?.["Check in"] ?? null);

  const isPriority = t.prioritaria_manual != null ? !!t.prioritaria_manual : !!t.prioritaria;
  const sfcMontar = !!t.sfc_montar;
  const sfcDesmontar = !!t.sfc_desmontar;

  const update = async (patch: Partial<Limpieza>) => {
    setBusy(true);
    const { error } = await supabase.from("limpiezas").update(patch).eq("id_limpieza", t.id_limpieza);
    setBusy(false);
    if (error) { toast.error("Error: " + error.message); return false; }
    onChanged();
    return true;
  };

  const accept = () => update({ estado: "aceptada" });
  const start = () => update({ estado: "en_curso", iniciada_en: new Date().toISOString() });
  const confirmReject = async () => {
    const m = motivo.trim();
    if (!m) { toast.error("Indica un motivo de rechazo"); return; }
    const ok = await update({
      estado: "rechazada",
      motivo_rechazo: m,
      rechazada_en: new Date().toISOString(),
    });
    if (ok) { setRejecting(false); setMotivo(""); }
  };

  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden flex">
      <div className={cn("w-1.5 shrink-0", stateAccent(t.estado))} />
      <div className="flex-1 p-3">
        {/* Top row */}
        <div className="flex items-start gap-2">
          <div className="h-7 w-7 rounded-full bg-slate-200 text-slate-800 text-xs font-bold grid place-items-center shrink-0">
            {t.orden_trabajo ?? "·"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">{apt?.nombre ?? `Apt #${t.id_apt}`}</div>
          </div>
          <StateBadge estado={t.estado} />
        </div>

        {/* Times */}
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 flex-wrap">
          {isVacio || nentran ? (
            <>
              {isVacio && (
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold bg-rose-200 text-rose-900">VACÍA</span>
              )}
              {isVacio && nentran && (
                <span className="text-slate-400">·</span>
              )}
              {nentran && (
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold bg-gray-200 text-gray-700">NOENTRAN</span>
              )}
            </>
          ) : (
            <>
              <TimeChip time={t.hora_out_time} informed={t.hora_out_informed} />
              <span>→</span>
              <TimeChip time={t.hora_in_time} informed={t.hora_in_informed} />
            </>
          )}
          {nextGuests != null && nextGuests > 0 && (
            <span className="ml-1 text-xs font-medium text-slate-800">
              👤 {nextGuests} {nextGuests === 1 ? "huésped" : "huéspedes"}
            </span>
          )}
        </div>

        {/* Window */}
        <div className="mt-1.5 text-xs text-slate-700">
          {!nentran && <span>⏱ Ventana: {win ?? "—"}</span>}
        </div>

        {/* Tags */}
        {(isPriority || sfcMontar || sfcDesmontar || isIntermedia || !!t.check_checkin) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {isIntermedia && (
              <span className="rounded bg-fuchsia-200 text-fuchsia-900 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                LIMPIEZA EXTRA-CR
              </span>
            )}
            {isPriority && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 text-amber-900 px-2 py-0.5 text-[11px] font-semibold">
                <Zap className="h-3 w-3" /> Prioritaria
              </span>
            )}
            {sfcMontar && (
              <span className="inline-flex items-center gap-0.5 rounded bg-indigo-100 text-indigo-900 px-2 py-0.5 text-[11px] font-semibold">
                <Sofa className="h-3 w-3" /> Montar SFC
              </span>
            )}
            {sfcDesmontar && (
              <span className="inline-flex items-center gap-0.5 rounded bg-orange-100 text-orange-900 px-2 py-0.5 text-[11px] font-semibold">
                <Sofa className="h-3 w-3" /> Desmontar SFC
              </span>
            )}
            {!!t.check_checkin && (
              <span className="rounded bg-emerald-100 text-emerald-900 px-2 py-0.5 text-[11px] font-semibold">✓ Check-in</span>
            )}
          </div>
        )}

        {/* Observations */}
        {t.observaciones && (
          <div className="mt-2 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs italic text-slate-700">
            {t.observaciones}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex flex-wrap gap-2">
          {t.estado === "comunicada" && !rejecting && (
            <>
              <Button size="sm" className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={accept}>
                <Check className="h-4 w-4" /> Aceptar
              </Button>
              <Button size="sm" className="h-11 px-4 bg-amber-500 hover:bg-amber-600 text-white" disabled={busy} onClick={() => setRejecting(true)}>
                <X className="h-4 w-4" /> Rechazar
              </Button>
              <Button size="sm" variant="secondary" className="h-11 px-4" onClick={onOpenDetail}>
                <Menu className="h-4 w-4" /> Detalle
              </Button>
            </>
          )}
          {t.estado === "comunicada" && rejecting && (
            <div className="w-full">
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo del rechazo…"
                className="text-sm min-h-[70px]"
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="h-11 px-4 bg-amber-500 hover:bg-amber-600 text-white" disabled={busy} onClick={confirmReject}>
                  Confirmar rechazo
                </Button>
                <Button size="sm" variant="ghost" className="h-11 px-4" onClick={() => { setRejecting(false); setMotivo(""); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {t.estado === "aceptada" && (
            <>
              <Button size="sm" className="h-11 px-4 bg-[#26215C] hover:bg-[#1e1a48] text-white" disabled={busy} onClick={start}>
                <Play className="h-4 w-4" /> Iniciar limpieza
              </Button>
              <Button size="sm" variant="secondary" className="h-11 px-4" onClick={onOpenDetail}>
                <Menu className="h-4 w-4" /> Detalle
              </Button>
            </>
          )}
          {t.estado === "en_curso" && (
            <>
              <Button size="sm" className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onFinish}>
                <Check className="h-4 w-4" /> Finalizar
              </Button>
              <Button size="sm" variant="secondary" className="h-11 px-4" onClick={onOpenDetail}>
                <Menu className="h-4 w-4" /> Detalle
              </Button>
            </>
          )}
          {t.estado === "finalizada" && (
            <Button size="sm" variant="secondary" className="h-11 px-4" onClick={onOpenDetail}>
              <Menu className="h-4 w-4" /> Detalle
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Detail view ---------------- */

function DetailView({
  t, apt, resv, onClose, onChanged,
}: {
  t: Limpieza;
  apt: Apartamento | undefined;
  resv: Map<string, ResvLite>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [local, setLocal] = useState<Limpieza>(t);
  const [incLocal, setIncLocal] = useState<string>(t.incidencias ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLocal(t);
    setIncLocal(t.incidencias ?? "");
  }, [t.id_limpieza]); // eslint-disable-line react-hooks/exhaustive-deps

  const src = t.numero_reserva ? resv.get(t.numero_reserva) ?? null : null;
  const next = t.proxima_reserva_numero ? resv.get(t.proxima_reserva_numero) ?? null : null;
  const isVacio = t.tipo === "salida" && src?.["Check-out"] && src["Check-out"] < t.fecha_limpieza;
  const nentran = !t.hora_in_time || !next || next["Check in"] !== t.fecha_limpieza;
  const win = windowHours(t.hora_out_time, t.hora_in_time, t.fecha_limpieza, next?.["Check in"] ?? null);

  const updateField = async <K extends keyof Limpieza>(key: K, value: Limpieza[K]) => {
    setLocal((l) => ({ ...l, [key]: value }));
    const { error } = await supabase
      .from("limpiezas")
      .update({ [key]: value } as any)
      .eq("id_limpieza", t.id_limpieza);
    if (error) { toast.error("Error: " + error.message); return; }
    onChanged();
  };

  const toggleSalida = (field: "sfc_montar" | "sfc_desmontar" | "check_checkin" | "check_tasas") => {
    updateField(field, !local[field] as any);
  };
  const toggleIntermedia = (field: "check_toallas" | "check_sabanas" | "check_limpieza_basica" | "check_limpieza_completa") => {
    if (field === "check_limpieza_completa") {
      const newVal = !local.check_limpieza_completa;
      const patch: Partial<Limpieza> = newVal
        ? { check_limpieza_completa: true, check_toallas: false, check_sabanas: false, check_limpieza_basica: false }
        : { check_limpieza_completa: false };
      setLocal((l) => ({ ...l, ...patch }));
      supabase.from("limpiezas").update(patch as any).eq("id_limpieza", t.id_limpieza)
        .then(({ error }) => { if (error) toast.error("Error: " + error.message); else onChanged(); });
      return;
    }
    updateField(field, !local[field] as any);
  };

  const saveIncidencias = async () => {
    const v = incLocal.trim() || null;
    if ((t.incidencias ?? null) === v) return;
    await updateField("incidencias", v as any);
  };

  const accept = async () => {
    setBusy(true);
    const { error } = await supabase.from("limpiezas").update({ estado: "aceptada" }).eq("id_limpieza", t.id_limpieza);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onChanged(); onClose();
  };
  const start = async () => {
    setBusy(true);
    const { error } = await supabase.from("limpiezas").update({ estado: "en_curso", iniciada_en: new Date().toISOString() }).eq("id_limpieza", t.id_limpieza);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onChanged(); onClose();
  };
  // Finalizar is only triggered from the task list, never from the detail view.

  return (
    <div className="flex flex-col min-h-full">
      <header className="sticky top-0 z-10 bg-[#26215C] text-white px-3 py-3 flex items-center gap-2 shadow">
        <button type="button" onClick={onClose} className="h-10 w-10 grid place-items-center rounded-full hover:bg-white/15" aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-white/70">← Volver</div>
          <div className="text-base font-semibold truncate">{apt?.nombre ?? `Apt #${t.id_apt}`}</div>
        </div>
      </header>

      <div className="p-4 space-y-5">
        {/* Horarios */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Horarios</h3>
          <div className="rounded-lg border bg-white p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-600">Sale:</span>
              <span className="font-medium">{t.fecha_limpieza}</span>
              <TimeChip time={t.hora_out_time} informed={t.hora_out_informed} />
              {isVacio && (
                <span className="rounded bg-rose-200 text-rose-900 px-2 py-0.5 text-[11px] font-semibold">VACÍO</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-600">Entra:</span>
              <span className="font-medium">{next?.["Check in"] ?? "—"}</span>
              <TimeChip time={t.hora_in_time} informed={t.hora_in_informed} />
              {nentran && (
                <span className="rounded bg-slate-200 text-slate-800 px-2 py-0.5 text-[11px] font-semibold">NOENTRAN</span>
              )}
            </div>
            <div className="text-xs text-slate-600">⏱ Ventana: {win ?? (nentran ? "—" : "—")}</div>
          </div>
        </section>

        {/* Checklist */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Tareas</h3>
          <div className="rounded-lg border bg-white p-3 space-y-3">
            {t.tipo === "salida" ? (
              <>
                <CheckRow label="Montar sofá cama" checked={!!local.sfc_montar} onChange={() => toggleSalida("sfc_montar")} />
                <CheckRow label="Desmontar sofá cama" checked={!!local.sfc_desmontar} onChange={() => toggleSalida("sfc_desmontar")} />
                <CheckRow label="Realizar check-in" checked={!!local.check_checkin} onChange={() => toggleSalida("check_checkin")} />
                <CheckRow label="Cobrar tasas" checked={!!local.check_tasas} onChange={() => toggleSalida("check_tasas")} />
              </>
            ) : (
              <>
                <CheckRow label="Cambiar toallas" checked={!!local.check_toallas} onChange={() => toggleIntermedia("check_toallas")} />
                <CheckRow label="Cambiar sábanas" checked={!!local.check_sabanas} onChange={() => toggleIntermedia("check_sabanas")} />
                <CheckRow label="Limpieza básica" checked={!!local.check_limpieza_basica} onChange={() => toggleIntermedia("check_limpieza_basica")} />
                <CheckRow label="Limpieza completa" checked={!!local.check_limpieza_completa} onChange={() => toggleIntermedia("check_limpieza_completa")} />
              </>
            )}
          </div>
        </section>

        {/* Notas del gestor */}
        {t.observaciones && (
          <section>
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Notas del gestor</h3>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm italic text-slate-700">{t.observaciones}</div>
          </section>
        )}

        {/* Incidencias */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Incidencias</h3>
          <Textarea
            value={incLocal}
            onChange={(e) => setIncLocal(e.target.value)}
            onBlur={saveIncidencias}
            placeholder="Anota cualquier incidencia detectada…"
            className="text-sm min-h-[90px] bg-white"
          />
        </section>

        {/* Action */}
        <section className="pt-2">
          {t.estado === "comunicada" && (
            <div className="flex gap-2">
              <Button className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={accept}>
                <Check className="h-4 w-4" /> Aceptar
              </Button>
              <Button className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 text-white" disabled={busy} onClick={onClose}>
                <X className="h-4 w-4" /> Rechazar
              </Button>
            </div>
          )}
          {t.estado === "aceptada" && (
            <Button className="w-full h-12 bg-[#26215C] hover:bg-[#1e1a48] text-white" disabled={busy} onClick={start}>
              <Play className="h-4 w-4" /> Iniciar limpieza
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onChange} className="h-5 w-5" />
      <span className="text-sm">{label}</span>
    </label>
  );
}

/* ---------------- Hours panel ---------------- */

function HoursPanel({
  monthHours, rows, onClose,
}: {
  monthHours: number;
  rows: { fecha_limpieza: string; iniciada_en: string | null; finalizada_en: string | null }[];
  onClose: () => void;
}) {
  const now = new Date();
  const monthName = MONTH_ES[now.getMonth()];
  const year = now.getFullYear();

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const h = diffHoursMinutes(r.iniciada_en, r.finalizada_en);
      m.set(r.fecha_limpieza, (m.get(r.fecha_limpieza) ?? 0) + h);
    }
    return Array.from(m.entries())
      .filter(([, h]) => h > 0)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="flex flex-col min-h-full">
      <header className="sticky top-0 z-10 bg-[#26215C] text-white px-3 py-3 flex items-center gap-2 shadow">
        <button type="button" onClick={onClose} className="h-10 w-10 grid place-items-center rounded-full hover:bg-white/15" aria-label="Volver">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-base font-semibold">Mis horas</div>
      </header>
      <div className="p-6 text-center">
        <div className="text-5xl font-bold text-[#26215C]">{fmtHours(monthHours)}</div>
        <div className="mt-1 text-sm text-slate-600 capitalize">Horas efectivas {monthName} {year}</div>
      </div>
      <div className="px-4 pb-8">
        {byDay.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center">Aún no hay días con tareas finalizadas este mes.</div>
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {byDay.map(([fecha, h]) => {
              const d = fromISO(fecha);
              const dd = String(d.getDate()).padStart(2, "0");
              const mm = String(d.getMonth() + 1).padStart(2, "0");
              return (
                <li key={fecha} className="flex items-center justify-between px-3 py-3 text-sm">
                  <span>{DOW_SHORT[d.getDay()]} {dd}/{mm}</span>
                  <span className="font-semibold">{fmtHours(h)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newPassword || !confirmPassword) {
      setError("Ambdós camps són obligatoris");
      return;
    }
    if (newPassword.length < 8) {
      setError("La contrasenya ha de tenir almenys 8 caràcters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les contrasenyes no coincideixen");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      toast.error("Error en actualitzar la contrasenya");
      return;
    }
    toast.success("Contrasenya actualitzada correctament");
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Canviar contrasenya</DialogTitle>
          <DialogDescription>Mínim 8 caràcters.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="mi-dia-new-pw">Nova contrasenya</Label>
            <PasswordInput
              id="mi-dia-new-pw"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mi-dia-confirm-pw">Confirmar contrasenya</Label>
            <PasswordInput
              id="mi-dia-confirm-pw"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel·lar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Guardant…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Generic task: active banner + sheets ---------------- */

function ActiveGenericBanner({
  gen, onFinish, disabled,
}: {
  gen: { id_registre: number; inici: string; tipos_tarea_generica: { nombre: string } | null };
  onFinish: () => void;
  disabled: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const startMs = new Date(gen.inici).getTime();
  const elapsed = Math.max(0, (now - startMs) / 3_600_000);
  const startHM = trimHM(gen.inici) ?? "—";

  return (
    <div className="mx-3 mt-3 rounded-xl bg-emerald-50 border border-emerald-300 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-500 text-white grid place-items-center shrink-0">
          <Play className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wide text-emerald-800 font-semibold">Tasca en curs</div>
          <div className="text-base font-semibold text-emerald-950 truncate">
            {gen.tipos_tarea_generica?.nombre ?? "Tasca genèrica"}
          </div>
          <div className="text-xs text-emerald-900 mt-0.5">
            Inici {startHM} · {fmtHours(elapsed)} transcorregut
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Button
          className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={disabled}
          onClick={onFinish}
        >
          <Square className="h-4 w-4" /> Finalitzar tasca
        </Button>
      </div>
    </div>
  );
}

function StartJornadaPanel({
  tipos, grupos, apartamentos, disabled, onStart, onCancel, onCreateType,
}: {
  tipos: { id_tipus: number; nombre: string }[];
  grupos: { id_grupo: number; nombre: string }[];
  apartamentos: { id_apt: number; nombre: string; id_grupo: number | null }[];
  disabled: boolean;
  onStart: (
    idTipus: number,
    notes: string,
    idGrupo: number | null,
    idApt: number | null,
  ) => void;
  onCancel: () => void;
  onCreateType: (nombre: string) => Promise<number | null>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [propOpen, setPropOpen] = useState(false);
  const [idGrupo, setIdGrupo] = useState<number | null>(null);
  const [idApt, setIdApt] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const sortedTipos = useMemo(
    () => [...tipos].sort((a, b) => a.nombre.localeCompare(b.nombre, "ca", { sensitivity: "base" })),
    [tipos],
  );
  const filteredTipos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedTipos;
    return sortedTipos.filter((t) => t.nombre.toLowerCase().includes(q));
  }, [sortedTipos, query]);

  const filteredApts = useMemo(() => {
    const list = idGrupo == null
      ? apartamentos
      : apartamentos.filter((a) => a.id_grupo === idGrupo);
    return [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, "ca", { sensitivity: "base" }));
  }, [apartamentos, idGrupo]);

  return (
    <div className="pt-2 pb-6 space-y-4">
      <div>
        <div className="text-lg font-semibold">Iniciar jornada</div>
        <div className="text-xs text-muted-foreground">Tria el tipus de tasca que comences</div>
      </div>
      <div className="space-y-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cercar tipus de tasca..."
          className="text-sm"
        />
        <div className="border border-slate-200 rounded-lg overflow-y-auto max-h-[280px] divide-y divide-slate-100">
          {tipos.length === 0 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              No hi ha tipus actius. Contacta amb el gestor.
            </div>
          )}
          {tipos.length > 0 && filteredTipos.length === 0 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">Sense resultats</div>
          )}
          {filteredTipos.map((t) => {
            const active = selected === t.id_tipus;
            return (
              <button
                key={t.id_tipus}
                type="button"
                onClick={() => setSelected(t.id_tipus)}
                className={cn(
                  "w-full text-left px-3 py-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#26215C] text-white"
                    : "bg-white text-slate-800 hover:bg-slate-50",
                )}
              >
                {t.nombre}
              </button>
            );
          })}
          {query.trim() &&
            !sortedTipos.some(
              (t) => t.nombre.toLowerCase() === query.trim().toLowerCase(),
            ) && (
              <button
                type="button"
                disabled={creating || disabled}
                onClick={async () => {
                  const name = query.trim();
                  setCreating(true);
                  const newId = await onCreateType(name);
                  setCreating(false);
                  if (newId != null) {
                    setSelected(newId);
                    setQuery("");
                  }
                }}
                className="w-full text-left px-3 py-3 text-sm font-medium text-[#26215C] hover:bg-slate-50 disabled:opacity-50"
              >
                {creating ? "Creant…" : `+ Crear "${query.trim()}"`}
              </button>
            )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setPropOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <span>Associar a una propietat (opcional)</span>
          <span className="text-xs text-muted-foreground">
            {propOpen ? "−" : "+"}
          </span>
        </button>
        {propOpen && (
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-100">
            <div className="space-y-1">
              <Label className="text-xs">Grup</Label>
              <select
                value={idGrupo ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setIdGrupo(v);
                  if (idApt != null) {
                    const apt = apartamentos.find((a) => a.id_apt === idApt);
                    if (v != null && apt && apt.id_grupo !== v) setIdApt(null);
                  }
                }}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— Cap —</option>
                {grupos.map((g) => (
                  <option key={g.id_grupo} value={g.id_grupo}>{g.nombre}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Apartament</Label>
              <select
                value={idApt ?? ""}
                onChange={(e) => setIdApt(e.target.value ? Number(e.target.value) : null)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— Cap —</option>
                {filteredApts.map((a) => (
                  <option key={a.id_apt} value={a.id_apt}>{a.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="gen-notes" className="text-xs">Notes (opcional)</Label>
        <Textarea
          id="gen-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Detalls opcionals…"
          className="text-sm min-h-[70px]"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel·lar</Button>
        <Button
          className="flex-1 h-12 bg-[#26215C] hover:bg-[#1e1a48] text-white"
          disabled={disabled || selected == null}
          onClick={() => selected != null && onStart(selected, notes, idGrupo, idApt)}
        >
          <Play className="h-4 w-4" /> Iniciar
        </Button>
      </div>
    </div>
  );
}

function EndTaskPanel({
  hasPending, disabled, onNewGeneric, onViewTasks, onClose,
}: {
  hasPending: boolean;
  disabled: boolean;
  onNewGeneric: () => void;
  onViewTasks: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pt-2 pb-6 space-y-4">
      <div>
        <div className="text-lg font-semibold">Tasca finalitzada ✓</div>
        <div className="text-xs text-muted-foreground">Què vols fer ara?</div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {hasPending ? (
          <Button variant="outline" className="h-12" onClick={onViewTasks}>
            <Menu className="h-4 w-4" /> Veure tasques pendents
          </Button>
        ) : (
          <Button variant="outline" className="h-12" disabled={disabled} onClick={onNewGeneric}>
            <ClipboardList className="h-4 w-4" /> Iniciar nova tasca genèrica
          </Button>
        )}
        <Button
          className="h-12 bg-rose-600 hover:bg-rose-700 text-white"
          disabled={disabled}
          onClick={onClose}
        >
          <LogOut className="h-4 w-4" /> Tancar jornada
        </Button>
      </div>
    </div>
  );
}
