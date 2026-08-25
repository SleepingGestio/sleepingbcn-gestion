import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
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
import { Zap, Sofa, LogOut, Clock, ArrowLeft, Check, X, Play, Pause, Menu, UserCircle2, KeyRound, Square, ClipboardList, Plus, LayoutDashboard, AlertTriangle, Wrench, Home, RotateCcw, Camera, Video, Mic, FileText, Bell } from "lucide-react";
import { ReportarIncidenciaSheet, AdjuntoPicker, type ReportarIncidenciaContext, type AdjuntoTipo } from "@/components/reportar-incidencia";
import { MantenimientoPopover } from "@/components/mantenimiento-popover";
import { ApartamentoOcupacionCalendario } from "@/components/apartamento-ocupacion-calendario";
import { cn, formatHHMM } from "@/lib/utils";
import { toast } from "sonner";
import { TimeBadge } from "@/components/time-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ESTADO_LIMPIEZA_STYLE } from "@/components/estado-limpieza-badge";
import { fmtDate } from "@/lib/format";
import { TipoBadge, PrioridadPill, EstadoFullPill } from "@/components/mantenimiento-badges";
import { useApartamentosLite, useEspaciosLite, useGruposLite, useMantenimientoActions, usePersonalLite } from "@/hooks/use-mantenimiento";
import {
  INCIDENCIA_COLUMNS,
  REGISTRE_COLUMNS,
  resolveLocation,
  findOpenSession,
  type Incidencia,
  type Registre,
} from "@/lib/mantenimiento";

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
  tipo: string;
  hora_out_time: string | null;
  hora_out_informed: boolean;
  hora_in_time: string | null;
  hora_in_informed: boolean;
  worker: number | null;
  orden_trabajo: number | null;
  prioritaria: boolean;
  prioritaria_manual: boolean | null;
  sfc_montar: boolean;
  sfc_desmontar: boolean;
  check_checkin: boolean;
  check_tasas: boolean;
  check_toallas: boolean;
  check_sabanas: boolean;
  check_limpieza_basica: boolean;
  check_limpieza_completa: boolean;
  observaciones: string | null;
  incidencias: string | null;
  estado: string;
  iniciada_en: string | null;
  finalizada_en: string | null;
  rechazada_en: string | null;
  motivo_rechazo: string | null;
  proxima_reserva_numero: string | null;
  huespedes_previstos: number | null;
};

type LimpiezaDia = Limpieza & { esPendienteAtrasada?: boolean };

type Apartamento = { id_apt: number; nombre: string };
type ResvLite = { Número: string; "Check in": string | null; "Check-out": string | null; "Huéspedes": number | null };
type ComDia = { worker: number; fecha: string; observaciones: string | null };
type MiDiaNotificacion = {
  id_notificacion: number;
  id_persona: number;
  tipo: string;
  referencia_id: number | null;
  mensaje: string | null;
  fecha_afectada: string | null;
  creado_en: string | null;
  visto: boolean;
};

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
// For timestamptz values (e.g. registre_temps_generic.inici) — trimHM's raw
// digit extraction would show UTC instead of local time, unlike time-only columns.
function localHM(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

const DOW_FULL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Sentinel for notifications with no fecha_afectada (e.g. an "asignada" notification
// for an incidencia with no data_prevista set yet) — never a valid ISO date, so it
// can't collide with a real ISO date key and can be special-cased before parsing.
const NOTIF_SIN_FECHA = "__sin_fecha__";

function notifDayLabel(iso: string, todayISO: string, tomorrowISO: string): string {
  if (iso === NOTIF_SIN_FECHA) return "sin fecha";
  if (iso === todayISO) return "hoy";
  if (iso === tomorrowISO) return "mañana";
  const d = fromISO(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${DOW_FULL[d.getDay()]} ${dd}/${mm}`;
}

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

function shortAptName(name: string): string {
  return name
    .replace(/^\s*(Apartamento|Apart\.?)\s+/i, "")
    .replace(/\s+(Apartamento|Apart\.?)\s*$/i, "")
    .trim() || name;
}

const COMPACT_ESTADO: Record<string, { label: string; bg: string; fg: string }> = {
  activa: { label: "ASIG", bg: ESTADO_LIMPIEZA_STYLE.activa.bg, fg: ESTADO_LIMPIEZA_STYLE.activa.fg },
  comunicada: { label: "COMU", bg: ESTADO_LIMPIEZA_STYLE.comunicada.bg, fg: ESTADO_LIMPIEZA_STYLE.comunicada.fg },
  aceptada: { label: "ACEP", bg: ESTADO_LIMPIEZA_STYLE.aceptada.bg, fg: ESTADO_LIMPIEZA_STYLE.aceptada.fg },
  en_curso: { label: "CURSO", bg: ESTADO_LIMPIEZA_STYLE.en_curso.bg, fg: ESTADO_LIMPIEZA_STYLE.en_curso.fg },
  finalizada: { label: "FINAL", bg: ESTADO_LIMPIEZA_STYLE.finalizada.bg, fg: ESTADO_LIMPIEZA_STYLE.finalizada.fg },
  rechazada: { label: "RECH", bg: ESTADO_LIMPIEZA_STYLE.rechazada.bg, fg: ESTADO_LIMPIEZA_STYLE.rechazada.fg },
  anulada: { label: "ANUL", bg: ESTADO_LIMPIEZA_STYLE.anulada.bg, fg: ESTADO_LIMPIEZA_STYLE.anulada.fg },
};

function CompactEstadoBadge({ estado }: { estado: string | null }) {
  const cfg = COMPACT_ESTADO[estado ?? ""] ?? COMPACT_ESTADO.activa;
  return (
    <span
      className="inline-block rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: cfg.bg, color: cfg.fg }}
    >
      {cfg.label}
    </span>
  );
}

function CompactTipoBadge({ tipo, completa }: { tipo: string | null; completa?: boolean }) {
  const isSalida = tipo === "salida" || completa;
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-px text-[9px] font-semibold uppercase",
        isSalida ? "bg-slate-200 text-slate-800" : "bg-fuchsia-200 text-fuchsia-900",
      )}
    >
      {isSalida ? "STD" : "X-CR"}
    </span>
  );
}

function workerCode(id: number | null, workers: { id_persona: number; codigo: string | null }[]): string {
  if (id == null) return "—";
  const w = workers.find((x) => x.id_persona === id);
  return w?.codigo ?? `#${id}`;
}

const VISIBLE_STATES = ["comunicada", "aceptada", "en_curso", "finalizada"] as const;

const ADJUNTO_TIPO_ICONS: { tipo: string; Icon: typeof Camera; title: string }[] = [
  { tipo: "foto", Icon: Camera, title: "Tiene fotos" },
  { tipo: "video", Icon: Video, title: "Tiene vídeos" },
  { tipo: "nota_veu", Icon: Mic, title: "Tiene notas de voz" },
  { tipo: "document", Icon: FileText, title: "Tiene documentos" },
];

// Small badge shown on task/incidencia cards affected by a pending
// mi_dia_notificaciones row — consistent red accent matching the banner,
// "nueva" gets a distinct color since it's a new assignment, not a change.
function CambioBadge({ tipo }: { tipo: string }) {
  const isNueva = tipo.endsWith("_nueva");
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
        isNueva && "bg-blue-100 text-blue-900",
      )}
      style={!isNueva ? { backgroundColor: "#FCEBEB", color: "#791F1F" } : undefined}
    >
      {isNueva ? "Nueva" : "Reprogramada"}
    </span>
  );
}

const MANT_PRIORIDAD_RANK: Record<string, number> = { alta: 0, normal: 1, baixa: 2 };

function mantPriorityRank(inc: Incidencia): number {
  const p = inc.prioritat_confirmada ?? inc.prioritat_proposta;
  return MANT_PRIORIDAD_RANK[p ?? ""] ?? 3;
}

// Distinct from PendienteAtrasadaBadge (cleaning-only) and the RotateCcw
// "reprogramada por operario" icon already on this card — own visual so the
// three don't get confused with each other.
function MantAtrasadaBadge() {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold border bg-orange-100 text-orange-900 border-orange-300">
      Atrasada
    </span>
  );
}

function MantSinProgramarBadge() {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold border bg-slate-100 text-slate-700 border-slate-300">
      Sin fecha programada
    </span>
  );
}

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
        .select("id_persona, nombre, apellidos, personal_roles(fecha_hasta, roles(nombre))")
        .eq("id_persona", previewId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const pr = (data as any).personal_roles ?? [];
      const roles: string[] = pr
        .filter((r: any) => !r.fecha_hasta)
        .map((r: any) => r.roles?.nombre)
        .filter(Boolean);
      return {
        id_persona: (data as any).id_persona,
        nombre: (data as any).nombre,
        apellidos: (data as any).apellidos,
        roles,
      } as { id_persona: number; nombre: string | null; apellidos: string | null; roles: string[] };
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
  const targetRoles = previewId ? (previewQ.data?.roles ?? []) : (persona!.roles ?? []);
  return (
    <WorkerView
      personalId={targetId}
      nombre={targetName}
      roles={targetRoles}
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
  roles,
  previewing,
  onExitPreview,
}: {
  personalId: number;
  nombre: string;
  roles: string[];
  previewing?: string | null;
  onExitPreview?: () => void;
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const workerPermsQ = useQuery({
    queryKey: ["mi-dia-worker-perms", personalId],
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data: prData, error: prErr } = await supabase
        .from("personal_roles")
        .select("id_rol")
        .eq("id_persona", personalId)
        .is("fecha_hasta", null);
      if (prErr) throw prErr;
      const roleIds = (prData ?? []).map((r: { id_rol: number }) => r.id_rol);
      if (!roleIds.length) return {};
      const { data, error } = await supabase
        .from("rol_permisos")
        .select("menu, pot_veure")
        .in("id_rol", roleIds);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const r of (data ?? []) as { menu: string; pot_veure: boolean }[]) {
        map[r.menu] = map[r.menu] || !!r.pot_veure;
      }
      return map;
    },
  });
  const fullModeRoute = useMemo<string | null>(() => {
    const perms = workerPermsQ.data ?? {};
    const order: { route: string; menu: string }[] = [
      { route: "/reservas", menu: "reservas" },
      { route: "/checkins", menu: "checkins" },
      { route: "/limpiezas", menu: "limpiezas_asignadas" },
      { route: "/programacion-limpiezas", menu: "programacion_limpiezas" },
      { route: "/comunicar-tareas", menu: "comunicar_tareas" },
      { route: "/registre-horari", menu: "registre_horari" },
    ];
    const match = order.find((m) => !!perms[m.menu]);
    return match?.route ?? null;
  }, [workerPermsQ.data]);
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
  const [mantDetailId, setMantDetailId] = useState<number | null>(null);
  const [previewEditEnabled, setPreviewEditEnabled] = useState(false);
  useEffect(() => {
    setPreviewEditEnabled(false);
  }, [personalId]);
  const disabled = !!previewing && !previewEditEnabled;

  // Upcoming tasks (today + future)
  const tasksQ = useQuery({
    queryKey: ["mi-dia-tasks", personalId, todayISO],
    queryFn: async (): Promise<Limpieza[]> => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("*")
        .eq("worker", personalId)
        .or(`fecha_limpieza.gte.${todayISO},and(fecha_limpieza.lt.${todayISO},estado.neq.finalizada)`)
        .in("estado", VISIBLE_STATES as unknown as string[])
        .order("fecha_limpieza", { ascending: true })
        .order("orden_trabajo", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Limpieza[];
    },
  });

  // Furthest scheduled cleaning date across the WHOLE team (not just this
  // worker) — used to fill the day tabs with muted placeholder days through
  // that horizon, so a worker can see how far out the team is scheduled even
  // on days with nothing assigned to them personally.
  const teamHorizonQ = useQuery({
    queryKey: ["mi-dia-team-horizon", todayISO],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("fecha_limpieza")
        .in("estado", VISIBLE_STATES as unknown as string[])
        .gte("fecha_limpieza", todayISO)
        .order("fecha_limpieza", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.fecha_limpieza ?? null;
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

  // ---- Mi Día change notifications (unread only) ----
  const notificacionesQ = useQuery({
    queryKey: ["mi-dia-notificaciones", personalId],
    queryFn: async (): Promise<MiDiaNotificacion[]> => {
      const { data, error } = await supabase
        .from("mi_dia_notificaciones")
        .select("*")
        .eq("id_persona", personalId)
        .eq("visto", false)
        .order("creado_en", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MiDiaNotificacion[];
    },
  });

  const notifByFecha = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notificacionesQ.data ?? []) {
      const f = n.fecha_afectada ?? NOTIF_SIN_FECHA;
      m.set(f, (m.get(f) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort(([a], [b]) => {
      if (a === NOTIF_SIN_FECHA) return b === NOTIF_SIN_FECHA ? 0 : 1;
      if (b === NOTIF_SIN_FECHA) return -1;
      return a.localeCompare(b);
    });
  }, [notificacionesQ.data]);

  const notifByReferencia = useMemo(() => {
    const m = new Map<number, { tipo: string }[]>();
    for (const n of notificacionesQ.data ?? []) {
      if (n.referencia_id == null) continue;
      const arr = m.get(n.referencia_id) ?? [];
      arr.push({ tipo: n.tipo });
      m.set(n.referencia_id, arr);
    }
    return m;
  }, [notificacionesQ.data]);

  const notifSummary = useMemo(() => {
    if (notifByFecha.length === 0) return "";
    const parts = notifByFecha.map(([fecha, count]) => `${notifDayLabel(fecha, todayISO, tomorrowISO)} (${count})`);
    if (parts.length === 1) return `Cambios: ${parts[0]}`;
    return `Cambios: ${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
  }, [notifByFecha, todayISO, tomorrowISO]);

  async function marcarNotificacionesVistas() {
    const ids = (notificacionesQ.data ?? []).map((n) => n.id_notificacion);
    await marcarNotificacionesVistasIds(ids);
  }

  async function marcarNotificacionesVistasIds(ids: number[]) {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("mi_dia_notificaciones")
      .update({ visto: true })
      .in("id_notificacion", ids);
    if (error) { toast.error("Error: " + error.message); return; }
    notificacionesQ.refetch();
  }

  function handleDismissAllNotifications() {
    marcarNotificacionesVistas();
    // A dismiss-all makes any in-progress "Ver" sequence moot — its remaining
    // steps' notifIds are about to be marked visto anyway, and there's nothing
    // left to sequence through.
    setVerQueue(null);
    setVerQueueIndex(0);
  }

  // ---- Sequential "Ver" review of pending notifications ----
  type VerQueueItem = { kind: "incidencia" | "limpieza"; id: number; fecha: string | null; notifIds: number[] };
  const [verQueue, setVerQueue] = useState<VerQueueItem[] | null>(null);
  const [verQueueIndex, setVerQueueIndex] = useState(0);

  // Groups unread notifications by the underlying item they're about (an
  // incidencia or a limpieza), keeping the most recent one's fecha_afectada as
  // the representative but collecting every id_notificacion in the group — all
  // of them get marked visto together once the group's item is opened. Sorted by
  // fecha_afectada ascending, unscheduled last.
  function buildVerQueue(): VerQueueItem[] {
    const groups = new Map<
      string,
      { kind: "incidencia" | "limpieza"; id: number; fecha: string | null; notifIds: number[]; latestCreado: string }
    >();
    for (const n of notificacionesQ.data ?? []) {
      if (n.referencia_id == null) continue;
      const kind: "incidencia" | "limpieza" | null = n.tipo.startsWith("mantenimiento_")
        ? "incidencia"
        : n.tipo.startsWith("limpieza_")
          ? "limpieza"
          : null;
      if (!kind) continue;
      const key = `${kind}-${n.referencia_id}`;
      const creado = n.creado_en ?? "";
      const existing = groups.get(key);
      if (existing) {
        existing.notifIds.push(n.id_notificacion);
        if (creado >= existing.latestCreado) {
          existing.fecha = n.fecha_afectada;
          existing.latestCreado = creado;
        }
      } else {
        groups.set(key, { kind, id: n.referencia_id, fecha: n.fecha_afectada, notifIds: [n.id_notificacion], latestCreado: creado });
      }
    }
    return Array.from(groups.values())
      .sort((a, b) => {
        const fa = a.fecha ?? NOTIF_SIN_FECHA;
        const fb = b.fecha ?? NOTIF_SIN_FECHA;
        if (fa === NOTIF_SIN_FECHA) return fb === NOTIF_SIN_FECHA ? 0 : 1;
        if (fb === NOTIF_SIN_FECHA) return -1;
        return fa.localeCompare(fb);
      })
      .map(({ kind, id, fecha, notifIds }) => ({ kind, id, fecha, notifIds }));
  }

  function openVerStep(item: VerQueueItem) {
    marcarNotificacionesVistasIds(item.notifIds);
    // Close whichever detail overlay isn't relevant to this step, so it can't
    // fight the one we're about to open (Sheet for limpiezas, Dialog for
    // incidencias — never both should be open at once).
    if (item.kind === "incidencia") {
      setDetailId(null);
      // Every "mantenimiento_*" notification is sent to id_persona = the incidencia's
      // own id_assignat at the time it was created (see confirmarAsignacion/
      // reprogramar in use-mantenimiento.ts) — so "mias" is always the right tab.
      setMantFiltro("mias");
      setActiveDay(item.fecha ?? todayISO);
      setMantDetailId(item.id);
    } else {
      setMantDetailId(null);
      if (item.fecha) setActiveDay(item.fecha);
      setDetailId(item.id);
    }
  }

  function handleVerClick() {
    const queue = buildVerQueue();
    if (queue.length === 0) return;
    setVerQueue(queue);
    setVerQueueIndex(0);
    openVerStep(queue[0]);
  }

  function handleVerSiguiente() {
    if (!verQueue) return;
    const nextIndex = verQueueIndex + 1;
    if (nextIndex >= verQueue.length) {
      setVerQueue(null);
      setVerQueueIndex(0);
      return;
    }
    setVerQueueIndex(nextIndex);
    openVerStep(verQueue[nextIndex]);
  }

  function handleCancelVerQueue() {
    setVerQueue(null);
    setVerQueueIndex(0);
  }

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

  const monthMantQ = useQuery({
    queryKey: ["mi-dia-month-mant", personalId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manteniment_registre")
        .select("id_registre, inici, hores")
        .eq("id_persona", personalId)
        .not("fi", "is", null)
        .gte("inici", `${monthStart}T00:00:00`)
        .lte("inici", `${monthEnd}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as { id_registre: number; inici: string; hores: number | null }[];
    },
  });

  const monthGenericQ = useQuery({
    queryKey: ["mi-dia-month-generic", personalId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registre_temps_generic")
        .select("id_registre, inici, fi")
        .eq("id_persona", personalId)
        .not("fi", "is", null)
        .gte("inici", `${monthStart}T00:00:00`)
        .lte("inici", `${monthEnd}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as { id_registre: number; inici: string; fi: string | null }[];
    },
  });

  const monthLimpiezasRegistreQ = useQuery({
    queryKey: ["mi-dia-month-limpiezas-registre", personalId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas_registre")
        .select("id_limpieza, inici, hores")
        .eq("id_persona", personalId)
        .not("fi", "is", null)
        .not("hores", "is", null)
        .gte("inici", `${monthStart}T00:00:00`)
        .lte("inici", `${monthEnd}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as { id_limpieza: number; inici: string; hores: number | null }[];
    },
  });

  const monthAjustosQ = useQuery({
    queryKey: ["mi-dia-month-ajustos", personalId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_ajustos_hores")
        .select("id_ajuste, fecha, horas, tipo")
        .eq("id_persona", personalId)
        .or("tipo.is.null,tipo.neq.vacaciones")
        .gte("fecha", monthStart)
        .lte("fecha", monthEnd);
      if (error) throw error;
      return (data ?? []) as { id_ajuste: number; fecha: string; horas: number; tipo: string | null }[];
    },
  });

  const monthDayHours = useMemo(() => {
    const m = new Map<string, number>();
    // Don't compute anything from limpiezas until BOTH sources have resolved —
    // otherwise a limpieza with a session can be counted via raw
    // iniciada_en/finalizada_en (the no-session path) during the window where
    // monthTasksQ has data but monthLimpiezasRegistreQ hasn't loaded yet, since
    // the exclusion set built from the latter would still be empty.
    const limpiezasReady = monthTasksQ.isSuccess && monthLimpiezasRegistreQ.isSuccess;
    if (limpiezasReady) {
      const fechaByLimpieza = new Map<number, string>();
      for (const t of monthTasksQ.data ?? []) fechaByLimpieza.set(t.id_limpieza, t.fecha_limpieza);
      const limpiezasConSesiones = new Set((monthLimpiezasRegistreQ.data ?? []).map((r) => r.id_limpieza));
      for (const t of monthTasksQ.data ?? []) {
        if (limpiezasConSesiones.has(t.id_limpieza)) continue;
        const h = diffHoursMinutes(t.iniciada_en, t.finalizada_en);
        m.set(t.fecha_limpieza, (m.get(t.fecha_limpieza) ?? 0) + h);
      }
      for (const r of monthLimpiezasRegistreQ.data ?? []) {
        // Overdue tasks (fecha_limpieza in an earlier month) can be worked and
        // have session rows dated in this month even though monthTasksQ (scoped
        // to this month's fecha_limpieza) never picked up their parent row — fall
        // back to the session's own date instead of silently dropping the hours.
        const fecha = fechaByLimpieza.get(r.id_limpieza) ?? r.inici.slice(0, 10);
        const h = Number(r.hores ?? 0);
        m.set(fecha, (m.get(fecha) ?? 0) + h);
      }
    }
    for (const r of monthMantQ.data ?? []) {
      const h = Number(r.hores ?? 0);
      const fecha = r.inici.slice(0, 10);
      m.set(fecha, (m.get(fecha) ?? 0) + h);
    }
    for (const g of monthGenericQ.data ?? []) {
      const h = diffHoursMinutes(g.inici, g.fi);
      const fecha = g.inici.slice(0, 10);
      m.set(fecha, (m.get(fecha) ?? 0) + h);
    }
    for (const a of monthAjustosQ.data ?? []) {
      const h = Number(a.horas ?? 0);
      m.set(a.fecha, (m.get(a.fecha) ?? 0) + h);
    }
    return m;
  }, [
    monthTasksQ.data, monthTasksQ.isSuccess,
    monthLimpiezasRegistreQ.data, monthLimpiezasRegistreQ.isSuccess,
    monthMantQ.data, monthGenericQ.data, monthAjustosQ.data,
  ]);

  const monthHours = useMemo(() => {
    let total = 0;
    for (const h of monthDayHours.values()) total += h;
    return total;
  }, [monthDayHours]);

  // ---- Equipo trabajando este día ----
  const otherQ = useQuery({
    queryKey: ["mi-dia-other-today", personalId, activeDay],
    queryFn: async (): Promise<Limpieza[]> => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("*")
        .eq("fecha_limpieza", activeDay)
        .not("worker", "is", null)
        .neq("worker", personalId)
        .order("orden_trabajo", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Limpieza[];
    },
  });

  const mantByAptQ = useQuery({
    queryKey: ["mi-dia-mant-by-apt", activeDay],
    queryFn: async (): Promise<Set<number>> => {
      const { data, error } = await supabase
        .from("manteniment_incidencies")
        .select("id_apt")
        .eq("data_prevista", activeDay)
        .in("estat", ["validada", "en_curs"])
        .not("id_apt", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.id_apt as number));
    },
  });

  const otherWorkerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const t of otherQ.data ?? []) {
      if (t.worker != null) ids.add(t.worker);
    }
    return Array.from(ids);
  }, [otherQ.data]);

  const otherWorkersQ = useQuery({
    queryKey: ["mi-dia-other-workers", otherWorkerIds.sort().join(",")],
    enabled: otherWorkerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("personal_codigos_by_ids", { p_ids: otherWorkerIds });
      if (error) throw error;
      return (data ?? []) as { id_persona: number; codigo: string | null }[];
    },
  });

  const otherNumeros = useMemo(() => {
    const s = new Set<string>();
    for (const t of otherQ.data ?? []) {
      if (t.numero_reserva) s.add(t.numero_reserva);
      if (t.proxima_reserva_numero) s.add(t.proxima_reserva_numero);
    }
    return Array.from(s);
  }, [otherQ.data]);

  const otherResvQ = useQuery({
    queryKey: ["mi-dia-other-resv", otherNumeros.sort().join(",")],
    enabled: otherNumeros.length > 0,
    queryFn: async (): Promise<Map<string, ResvLite>> => {
      const { data, error } = await supabase
        .from("reservas_kb")
        .select(`"Número","Check in","Check-out","Huéspedes"`)
        .in("Número", otherNumeros);
      if (error) throw error;
      const m = new Map<string, ResvLite>();
      for (const r of (data ?? []) as ResvLite[]) m.set(r["Número"], r);
      return m;
    },
  });

  // ---- Jornada (fichaje) + generic task ----
  type Fichaje = { id_fichaje: number; hora_entrada: string | null; hora_salida: string | null };
  type ActiveGen = {
    id_registre: number;
    id_tipus: number;
    inici: string;
    notes: string | null;
    id_apt: number | null;
    id_grupo: number | null;
    id_tipo_espacio_comun: number | null;
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
        .select("id_registre, id_tipus, inici, notes, id_apt, id_grupo, id_tipo_espacio_comun, tipos_tarea_generica(nombre)")
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

  const espaciosComunesQ = useQuery({
    queryKey: ["mi-dia-espacios-comunes"],
    queryFn: async (): Promise<{ id_tipo: number; nombre: string }[]> => {
      const { data, error } = await supabase
        .from("tipos_espacio_comun")
        .select("id_tipo,nombre")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as { id_tipo: number; nombre: string }[];
    },
  });

  const activeGen = activeGenQ.data ?? null;
  const fichaje = fichajeQ.data ?? null;

  const refetchJornada = () => {
    fichajeQ.refetch();
    activeGenQ.refetch();
    monthTasksQ.refetch();
  };

  const isMantenimiento = roles.includes("Mantenimiento");
  const [incidenciaOpen, setIncidenciaOpen] = useState(false);
  const [incidenciaContext, setIncidenciaContext] = useState<ReportarIncidenciaContext | null>(null);

  function openIncidenciaForTask(t: Limpieza) {
    const apt = aptsAllQ.data?.find((a) => a.id_apt === t.id_apt);
    setIncidenciaContext({
      origen: "neteja",
      idApt: t.id_apt,
      idGrupo: apt?.id_grupo ?? null,
      idLimpieza: t.id_limpieza,
      aptLabel: aptById.get(t.id_apt)?.nombre ?? `Apt #${t.id_apt}`,
    });
    setIncidenciaOpen(true);
  }

  function openIncidenciaManual() {
    setIncidenciaContext({
      origen: "manteniment",
      grupos: gruposQ.data ?? [],
      apartamentos: aptsAllQ.data ?? [],
    });
    setIncidenciaOpen(true);
  }

  // ---- Incidencias reportadas hoy por este trabajador (cualquier rol) ----
  const [misIncidenciasHoyOpen, setMisIncidenciasHoyOpen] = useState(false);
  const misIncidenciasHoyQ = useQuery({
    queryKey: ["mi-dia-mis-incidencias-hoy", personalId, todayISO],
    queryFn: async (): Promise<Incidencia[]> => {
      const { data, error } = await supabase
        .from("manteniment_incidencies")
        .select(INCIDENCIA_COLUMNS)
        .eq("id_reporter", personalId)
        .gte("creado_en", `${todayISO}T00:00:00`)
        .lte("creado_en", `${todayISO}T23:59:59`)
        .order("creado_en", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Incidencia[];
    },
  });

  // ---- Tareas de mantenimiento (role Mantenimiento only) ----
  const [mantFiltro, setMantFiltro] = useState<"mias" | "todas" | "nuevas">("mias");

  const mantAptQ = useApartamentosLite();
  const mantAptById = useMemo(() => new Map((mantAptQ.data ?? []).map((a) => [a.id_apt, a])), [mantAptQ.data]);
  const mantEspaciosQ = useEspaciosLite();
  const mantEspacioById = useMemo(() => new Map((mantEspaciosQ.data ?? []).map((e) => [e.id_tipo, e])), [mantEspaciosQ.data]);
  const mantGruposQ = useGruposLite();
  const mantGrupoById = useMemo(() => new Map((mantGruposQ.data ?? []).map((g) => [g.id_grupo, g])), [mantGruposQ.data]);
  const personalQ = usePersonalLite();

  const mantIncidenciasQ = useQuery({
    queryKey: ["mi-dia-mant-incidencias", mantFiltro, personalId],
    queryFn: async (): Promise<Incidencia[]> => {
      let q = supabase.from("manteniment_incidencies").select(INCIDENCIA_COLUMNS);
      if (mantFiltro === "nuevas") {
        q = q.eq("estat", "pendent_validacio");
      } else {
        q = q.in("estat", ["validada", "en_curs"]);
        if (mantFiltro === "mias") q = q.eq("id_assignat", personalId);
        else q = q.not("id_assignat", "is", null).neq("id_assignat", personalId);
      }
      const { data, error } = await q.order("data_prevista", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Incidencia[];
    },
  });

  const mantNuevasAllQ = useQuery({
    queryKey: ["mi-dia-mant-nuevas-all"],
    enabled: isMantenimiento,
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await supabase
        .from("manteniment_incidencies")
        .select("id_incidencia")
        .eq("estat", "pendent_validacio");
      if (error) throw error;
      return (data ?? []).map((r) => r.id_incidencia);
    },
    refetchInterval: 60_000,
  });

  const mantMiasCountQ = useQuery({
    queryKey: ["mi-dia-mant-mias-count", personalId],
    enabled: isMantenimiento,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("manteniment_incidencies")
        .select("id_incidencia", { count: "exact", head: true })
        .eq("id_assignat", personalId)
        .in("estat", ["validada", "en_curs"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const mantNuevasSeenKey = `mant_nuevas_seen_${personalId}`;
  const [mantNuevasSeenIds, setMantNuevasSeenIds] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(mantNuevasSeenKey) ?? "[]");
    } catch {
      return [];
    }
  });
  const hasUnseenNuevas = (mantNuevasAllQ.data ?? []).some((id) => !mantNuevasSeenIds.includes(id));

  function markNuevasSeen() {
    const ids = mantNuevasAllQ.data ?? [];
    setMantNuevasSeenIds(ids);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(mantNuevasSeenKey, JSON.stringify(ids));
    }
  }

  const mantIncIds = useMemo(() => (mantIncidenciasQ.data ?? []).map((i) => i.id_incidencia), [mantIncidenciasQ.data]);
  const mantIncIdsKey = useMemo(() => mantIncIds.slice().sort((a, b) => a - b).join(","), [mantIncIds]);

  // Only this worker's own sessions — the maintenance card's action button
  // depends on whether THEY have an open session, not on the incidencia's
  // overall estat or on who it's officially assigned to.
  const mantMisSesionesQ = useQuery({
    queryKey: ["mi-dia-mant-mis-sesiones", personalId, mantIncIdsKey],
    enabled: mantIncIds.length > 0,
    queryFn: async (): Promise<Registre[]> => {
      const { data, error } = await supabase
        .from("manteniment_registre")
        .select(REGISTRE_COLUMNS)
        .eq("id_persona", personalId)
        .in("id_incidencia", mantIncIds);
      if (error) throw error;
      return (data ?? []) as Registre[];
    },
  });

  const mantMisSesionesByIncidencia = useMemo(() => {
    const m = new Map<number, Registre[]>();
    for (const r of mantMisSesionesQ.data ?? []) {
      const arr = m.get(r.id_incidencia) ?? [];
      arr.push(r);
      m.set(r.id_incidencia, arr);
    }
    return m;
  }, [mantMisSesionesQ.data]);

  // Worker's own open manteniment_registre session, regardless of estat/id_assignat
  // or which mantFiltro tab is currently loaded — mirrors activeGenQ's "what is this
  // worker doing right now" role but for mantenimiento instead of tareas genéricas.
  type ActiveMantSession = Registre & { manteniment_incidencies: { titol: string } | null };
  const activeMantSessionQ = useQuery({
    queryKey: ["mi-dia-active-mant-session", personalId],
    queryFn: async (): Promise<ActiveMantSession | null> => {
      const { data, error } = await supabase
        .from("manteniment_registre")
        .select(`${REGISTRE_COLUMNS},manteniment_incidencies(titol)`)
        .eq("id_persona", personalId)
        .is("fi", null)
        .order("inici", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ActiveMantSession | null) ?? null;
    },
    refetchInterval: 60_000,
  });
  const activeMantSession = activeMantSessionQ.data ?? null;

  const mantAdjuntoTiposQ = useQuery({
    queryKey: ["mi-dia-mant-adjunto-tipos", mantIncIdsKey],
    enabled: mantIncIds.length > 0,
    queryFn: async (): Promise<{ id_incidencia: number; tipus: string | null }[]> => {
      const { data, error } = await supabase
        .from("manteniment_adjunts")
        .select("id_incidencia, tipus")
        .in("id_incidencia", mantIncIds);
      if (error) throw error;
      return (data ?? []) as { id_incidencia: number; tipus: string | null }[];
    },
  });

  const adjuntoTiposByIncidencia = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const a of mantAdjuntoTiposQ.data ?? []) {
      if (!a.tipus) continue;
      const set = m.get(a.id_incidencia) ?? new Set<string>();
      set.add(a.tipus);
      m.set(a.id_incidencia, set);
    }
    return m;
  }, [mantAdjuntoTiposQ.data]);

  // Names aren't broadly readable via RLS (same reason "Equipo trabajando este
  // día" below uses a codigo-only RPC instead of a direct personal select) —
  // "Asignado a" shows the worker's código for the same reason.
  const mantAssignatIds = useMemo(
    () =>
      Array.from(
        new Set((mantIncidenciasQ.data ?? []).map((i) => i.id_assignat).filter((x): x is number => x != null)),
      ),
    [mantIncidenciasQ.data],
  );

  const mantAssignatCodigosQ = useQuery({
    queryKey: ["mi-dia-mant-assignat-codigos", mantAssignatIds.slice().sort().join(",")],
    enabled: mantAssignatIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("personal_codigos_by_ids", { p_ids: mantAssignatIds });
      if (error) throw error;
      return (data ?? []) as { id_persona: number; codigo: string | null }[];
    },
  });

  function refetchMant() {
    mantIncidenciasQ.refetch();
    mantMisSesionesQ.refetch();
    activeMantSessionQ.refetch();
  }

  const mantActions = useMantenimientoActions(refetchMant);

  // ---- Mantenimiento "mías" grouped by day (mirrors daysWithTasks' spirit
  // for cleanings, but kept as a separate parallel structure — cleanings and
  // maintenance stay visually separate sections, both driven by activeDay).
  // Explicit id_assignat/estat filter for safety even though mantIncidenciasQ
  // is already scoped to "mias" whenever this data actually gets read below
  // (isMantenimiento + mantFiltro==="mias", or the always-mías non-Mantenimiento path).
  const mantMiasIncidencias = useMemo(
    () =>
      (mantIncidenciasQ.data ?? []).filter(
        (i) => i.id_assignat === personalId && (i.estat === "validada" || i.estat === "en_curs"),
      ),
    [mantIncidenciasQ.data, personalId],
  );

  const { mantDaysMap, mantOverdueIds, mantUnscheduledIds } = useMemo(() => {
    const byDate = new Map<string, Incidencia[]>();
    const overdue: Incidencia[] = [];
    const unscheduled: Incidencia[] = [];
    for (const inc of mantMiasIncidencias) {
      const fecha = inc.data_prevista;
      if (fecha == null) {
        unscheduled.push(inc);
      } else if (fecha < todayISO) {
        overdue.push(inc);
      } else {
        const arr = byDate.get(fecha) ?? [];
        arr.push(inc);
        byDate.set(fecha, arr);
      }
    }
    overdue.sort((a, b) => (a.data_prevista ?? "").localeCompare(b.data_prevista ?? ""));
    unscheduled.sort((a, b) => mantPriorityRank(a) - mantPriorityRank(b));
    for (const arr of byDate.values()) arr.sort((a, b) => mantPriorityRank(a) - mantPriorityRank(b));

    const todaysOwn = byDate.get(todayISO) ?? [];
    const map = new Map(byDate);
    map.set(todayISO, [...overdue, ...todaysOwn, ...unscheduled]);

    return {
      mantDaysMap: map,
      mantOverdueIds: new Set(overdue.map((i) => i.id_incidencia)),
      mantUnscheduledIds: new Set(unscheduled.map((i) => i.id_incidencia)),
    };
  }, [mantMiasIncidencias, todayISO]);

  const startGenericInFlightRef = useRef(false);

  async function startGeneric(
    idTipus: number,
    notes: string,
    idGrupo: number | null,
    idApt: number | null,
    idEspacioComun: number | null,
  ): Promise<number | null> {
    if (disabled || startGenericInFlightRef.current) return null;
    startGenericInFlightRef.current = true;
    try {
      const nowIso = new Date().toISOString();
      // 1. Asegurar fichaje abierto hoy
      let fichajeId = fichaje?.id_fichaje ?? null;
      if (!fichajeId) {
        const { data: f, error: fErr } = await supabase
          .from("fichajes")
          .insert({ id_persona: personalId, fecha: todayISO, hora_entrada: nowIso })
          .select("id_fichaje")
          .single();
        if (fErr) { toast.error("Error fichaje: " + fErr.message); return null; }
        fichajeId = (f as { id_fichaje: number }).id_fichaje;
      }
      // 2. Insert registre genèric
      const payload: TablesInsert<"registre_temps_generic"> = {
        id_persona: personalId,
        id_tipus: idTipus,
        inici: nowIso,
        notes: notes.trim() || null,
      };
      if (idApt != null) payload.id_apt = idApt;
      if (idGrupo != null) payload.id_grupo = idGrupo;
      if (idEspacioComun != null) payload.id_tipo_espacio_comun = idEspacioComun;
      const { data: inserted, error: rErr } = await supabase
        .from("registre_temps_generic")
        .insert(payload)
        .select("id_registre")
        .single();
      if (rErr) { toast.error("Error: " + rErr.message); return null; }
      toast.success("Tarea iniciada");
      setStartSheetOpen(false);
      refetchJornada();
      return (inserted as { id_registre: number }).id_registre;
    } finally {
      startGenericInFlightRef.current = false;
    }
  }

  async function finishGeneric(openEndSheet: boolean = true) {
    if (disabled || !activeGen) return;
    const nowIso = new Date().toISOString();
    const hores = diffHoursMinutes(activeGen.inici, nowIso);
    const { error } = await supabase
      .from("registre_temps_generic")
      .update({ fi: nowIso, hores_totals: hores })
      .eq("id_registre", activeGen.id_registre);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Tarea finalizada");
    if (openEndSheet) {
      // Case 4: this finish is the SECOND genérica that was started by pausing an
      // earlier one — offer to reopen the earlier one instead of the normal
      // end-of-task sheet. openEndSheet=false (the internal auto-close used while
      // pausing) never reaches this branch, so it can't misfire mid-interrupt.
      if (pendingReopenGen?.trigger.kind === "generic" && pendingReopenGen.trigger.id === activeGen.id_registre) {
        setReopenGenDialogOpen(true);
      } else {
        setEndSheetOpen(true);
      }
    }
    refetchJornada();
  }

  // ---- Starting a maintenance incidencia while a tarea genérica is open ----
  // Out of scope: the reverse (starting a generic task while an incidencia is
  // open) and any broader "only one active thing" rule — this only covers
  // Iniciar-on-incidencia-while-activeGen, and the matching Fin Total/Fin
  // Parcial afterward on that SAME incidencia.
  type PendingReopenGenTrigger =
    | { kind: "incidencia"; id: number }
    | { kind: "generic"; id: number };
  type PendingReopenGen = {
    id_tipus: number;
    nombre: string;
    idGrupo: number | null;
    idApt: number | null;
    idEspacioComun: number | null;
    notes: string | null;
    trigger: PendingReopenGenTrigger;
  };
  // Case 1 (genérica activa → iniciar incidencia) and Case 4 (genérica activa →
  // iniciar OTRA genérica) both interrupt the current tarea genérica and offer
  // Pausar (sets up pendingReopenGen) vs Cerrar definitivamente (no reopen offer).
  type PendingGenInterrupt =
    | { kind: "incidencia"; inc: Incidencia }
    | {
        kind: "generic-start";
        idTipus: number;
        notes: string;
        idGrupo: number | null;
        idApt: number | null;
        idEspacioComun: number | null;
      };
  // Case 2 (incidencia activa → iniciar OTRA incidencia) and Case 3 (incidencia
  // activa → iniciar tarea genérica) — pause the active incidencia (finParcial) and
  // proceed. No reopen offer: finParcial already returns it to "validada".
  type PendingMantInterrupt = { kind: "incidencia"; inc: Incidencia } | { kind: "generic-start" };
  const [confirmCloseGenInterrupt, setConfirmCloseGenInterrupt] = useState<PendingGenInterrupt | null>(null);
  const [confirmPauseMant, setConfirmPauseMant] = useState<PendingMantInterrupt | null>(null);
  const [pendingReopenGen, setPendingReopenGen] = useState<PendingReopenGen | null>(null);
  const [reopenGenDialogOpen, setReopenGenDialogOpen] = useState(false);

  // Optional, skippable "add adjuntos + nota de finalización" follow-up after the
  // list card's own "Fin total" button — same dialog MantenimientoPopover already
  // has for its own Fin total button, replicated here for the two
  // MantenimientoTaskCard usages in this file's own rendering.
  const [finTotalExtrasOpen, setFinTotalExtrasOpen] = useState(false);
  const [finTotalExtrasInc, setFinTotalExtrasInc] = useState<Incidencia | null>(null);
  const [finTotalExtrasAdjuntos, setFinTotalExtrasAdjuntos] = useState<{ tipo: AdjuntoTipo; file: File }[]>([]);
  const [finTotalExtrasNota, setFinTotalExtrasNota] = useState("");
  const [finTotalExtrasSaving, setFinTotalExtrasSaving] = useState(false);

  function activeGenNombre(gen: NonNullable<typeof activeGen>): string {
    return (
      tiposQ.data?.find((t) => t.id_tipus === gen.id_tipus)?.nombre ??
      gen.tipos_tarea_generica?.nombre ??
      "Tarea genérica"
    );
  }

  function handleIniciarIncidencia(inc: Incidencia) {
    if (activeGen) {
      setConfirmCloseGenInterrupt({ kind: "incidencia", inc });
      return;
    }
    if (activeMantSession && activeMantSession.id_incidencia !== inc.id_incidencia) {
      setConfirmPauseMant({ kind: "incidencia", inc });
      return;
    }
    mantActions.iniciar(inc, personalId);
  }

  // Case 3: clicking any "Iniciar tarea genérica" entry point. If an incidencia is
  // active it's paused first (Case 3's confirm dialog); otherwise the sheet opens
  // directly. Case 4 (genérica already active) is handled later, inside
  // handleStartGenericSubmit, once the user has actually picked the new task's
  // type/notes in the sheet.
  function handleClickIniciarGenerica() {
    if (activeMantSession) {
      setConfirmPauseMant({ kind: "generic-start" });
      return;
    }
    setStartSheetOpen(true);
  }

  async function handleStartGenericSubmit(
    idTipus: number,
    notes: string,
    idGrupo: number | null,
    idApt: number | null,
    idEspacioComun: number | null,
  ) {
    if (activeGen) {
      setStartSheetOpen(false);
      setConfirmCloseGenInterrupt({ kind: "generic-start", idTipus, notes, idGrupo, idApt, idEspacioComun });
      return;
    }
    await startGeneric(idTipus, notes, idGrupo, idApt, idEspacioComun);
  }

  // Note: neither branch below needs an explicit mantIncidenciasQ.refetch() after
  // mantActions.iniciar() — that call already triggers onMutated (refetchMant),
  // which refetches mantIncidenciasQ/mantMisSesionesQ/activeMantSessionQ internally.
  async function confirmCloseGenPausar() {
    const target = confirmCloseGenInterrupt;
    setConfirmCloseGenInterrupt(null);
    if (!target || !activeGen) return;
    const snapshot = {
      id_tipus: activeGen.id_tipus,
      nombre: activeGenNombre(activeGen),
      idGrupo: activeGen.id_grupo,
      idApt: activeGen.id_apt,
      idEspacioComun: activeGen.id_tipo_espacio_comun,
      notes: activeGen.notes,
    };
    await finishGeneric(false);
    if (target.kind === "incidencia") {
      setPendingReopenGen({ ...snapshot, trigger: { kind: "incidencia", id: target.inc.id_incidencia } });
      await mantActions.iniciar(target.inc, personalId);
    } else {
      const newId = await startGeneric(target.idTipus, target.notes, target.idGrupo, target.idApt, target.idEspacioComun);
      if (newId != null) {
        setPendingReopenGen({ ...snapshot, trigger: { kind: "generic", id: newId } });
      }
    }
  }

  async function confirmCloseGenDefinitiva() {
    const target = confirmCloseGenInterrupt;
    setConfirmCloseGenInterrupt(null);
    if (!target) return;
    await finishGeneric(false);
    if (target.kind === "incidencia") {
      await mantActions.iniciar(target.inc, personalId);
    } else {
      await startGeneric(target.idTipus, target.notes, target.idGrupo, target.idApt, target.idEspacioComun);
    }
  }

  async function confirmPauseMantAndProceed() {
    const target = confirmPauseMant;
    setConfirmPauseMant(null);
    if (!target || !activeMantSession) return;
    const sesiones: Registre[] = [
      {
        id_registre: activeMantSession.id_registre,
        id_incidencia: activeMantSession.id_incidencia,
        id_persona: activeMantSession.id_persona,
        inici: activeMantSession.inici,
        fi: activeMantSession.fi,
        hores: activeMantSession.hores,
        notas: activeMantSession.notas,
        cost_materials: activeMantSession.cost_materials,
        desc_materials: activeMantSession.desc_materials,
      },
    ];
    await mantActions.finParcial({ id_incidencia: activeMantSession.id_incidencia }, personalId, sesiones);
    if (target.kind === "incidencia") {
      await mantActions.iniciar(target.inc, personalId);
    } else {
      setStartSheetOpen(true);
    }
  }

  // The extras dialog is offered first (it's about the incidencia just closed);
  // the pendingReopenGen check (Case 2/3's existing rule) only runs once the user
  // resolves it via Guardar or Omitir — see closeFinTotalExtras.
  async function handleMantFinTotal(inc: Incidencia) {
    const ok = await mantActions.finTotal(inc);
    if (ok) {
      setFinTotalExtrasInc(inc);
      setFinTotalExtrasOpen(true);
    }
  }

  function closeFinTotalExtras() {
    const inc = finTotalExtrasInc;
    setFinTotalExtrasOpen(false);
    setFinTotalExtrasAdjuntos([]);
    setFinTotalExtrasNota("");
    setFinTotalExtrasInc(null);
    if (inc && pendingReopenGen?.trigger.kind === "incidencia" && pendingReopenGen.trigger.id === inc.id_incidencia) {
      setReopenGenDialogOpen(true);
    }
  }

  async function handleGuardarFinTotalExtras() {
    const inc = finTotalExtrasInc;
    if (!inc) return;
    setFinTotalExtrasSaving(true);
    if (finTotalExtrasAdjuntos.length > 0) {
      await mantActions.subirAdjuntosIncidencia(inc.id_incidencia, finTotalExtrasAdjuntos, personalId, "cierre");
      // Not covered by refetchMant/guardarNotaFinalizacion's onMutated below — this
      // is the query that drives the list cards' adjunto-type icons.
      mantAdjuntoTiposQ.refetch();
    }
    const notaTrim = finTotalExtrasNota.trim();
    if (notaTrim) {
      // guardarNotaFinalizacion's onMutated already refetches mantIncidenciasQ/
      // mantMisSesionesQ/activeMantSessionQ via refetchMant.
      await mantActions.guardarNotaFinalizacion(inc, notaTrim);
    } else if (finTotalExtrasAdjuntos.length > 0) {
      refetchMant();
    }
    setFinTotalExtrasSaving(false);
    closeFinTotalExtras();
  }

  async function handleMantFinParcial(inc: Incidencia, sesiones: Registre[]) {
    const ok = await mantActions.finParcial(inc, personalId, sesiones);
    if (ok && pendingReopenGen?.trigger.kind === "incidencia" && pendingReopenGen.trigger.id === inc.id_incidencia) {
      setReopenGenDialogOpen(true);
    }
  }

  async function confirmReopenGen() {
    const p = pendingReopenGen;
    setReopenGenDialogOpen(false);
    setPendingReopenGen(null);
    if (!p) return;
    await startGeneric(p.id_tipus, p.notes ?? "", p.idGrupo, p.idApt, p.idEspacioComun);
  }

  function declineReopenGen() {
    const p = pendingReopenGen;
    setReopenGenDialogOpen(false);
    setPendingReopenGen(null);
    // Only close the detail panel that matches what triggered this reopen offer —
    // an unrelated detail panel the user has open must not be closed as a side effect.
    // Tareas genéricas have no detail panel of their own, so a "generic" trigger has
    // nothing to close here.
    if (p?.trigger.kind === "incidencia" && mantDetailId === p.trigger.id) {
      setMantDetailId(null);
    }
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
    const overdue: LimpiezaDia[] = [];
    const m = new Map<string, LimpiezaDia[]>();
    for (const t of tasksQ.data ?? []) {
      if (t.fecha_limpieza < todayISO && t.estado !== "finalizada") {
        overdue.push(t);
        continue;
      }
      const arr = m.get(t.fecha_limpieza) ?? [];
      arr.push(t); m.set(t.fecha_limpieza, arr);
    }
    const todayOwn = (m.get(todayISO) ?? []).sort((a, b) => (a.orden_trabajo ?? 999) - (b.orden_trabajo ?? 999));
    if (overdue.length > 0) {
      overdue.sort((a, b) => a.fecha_limpieza.localeCompare(b.fecha_limpieza));
      m.set(todayISO, [
        ...overdue.map((t) => ({ ...t, esPendienteAtrasada: true })),
        ...todayOwn,
      ]);
    } else if (m.has(todayISO)) {
      m.set(todayISO, todayOwn);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, tasks]) => ({
        fecha,
        tasks: fecha === todayISO ? tasks : tasks.sort((a, b) => (a.orden_trabajo ?? 999) - (b.orden_trabajo ?? 999)),
        hasPending: tasks.some((t) => t.estado === "comunicada"),
      }));
  }, [tasksQ.data, todayISO]);

  // Union of cleaning days and mías-maintenance-only days, so a worker can
  // navigate to a future day that only has a maintenance task assigned and
  // no cleaning. todayISO is always included, even if both sources are empty
  // for it — mantDaysMap already guarantees a (possibly empty) todayISO key.
  // Also filled through the team-wide horizon with placeholder dates that
  // have nothing for this worker — emptyDates below marks which ones those
  // are, so the tabs can render them muted instead of just omitting them.
  const tabDates = useMemo(() => {
    const s = new Set<string>([todayISO]);
    for (const d of daysWithTasks) s.add(d.fecha);
    for (const fecha of mantDaysMap.keys()) s.add(fecha);
    const horizon = teamHorizonQ.data;
    if (horizon != null) {
      const cur = fromISO(todayISO);
      const end = fromISO(horizon);
      while (cur.getTime() <= end.getTime()) {
        s.add(toISO(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [daysWithTasks, mantDaysMap, todayISO, teamHorizonQ.data]);

  // Dates present in tabDates purely because of the team-horizon fill above —
  // neither a real cleaning nor a maintenance task for this worker on that
  // date. Rendered muted/disabled in the tabs; every other date is untouched.
  const emptyDates = useMemo(() => {
    const s = new Set<string>();
    for (const fecha of tabDates) {
      const hasCleaning = daysWithTasks.some((d) => d.fecha === fecha);
      const hasMant = (mantDaysMap.get(fecha)?.length ?? 0) > 0;
      if (!hasCleaning && !hasMant) s.add(fecha);
    }
    return s;
  }, [tabDates, daysWithTasks, mantDaysMap]);

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

  const finishTaskInFlightRef = useRef(false);
  const [finishingTask, setFinishingTask] = useState(false);

  async function finishTask(task: Limpieza) {
    if (disabled) return;
    if (finishTaskInFlightRef.current) return;
    finishTaskInFlightRef.current = true;
    setFinishingTask(true);
    try {
      const nowIso = new Date().toISOString();
      const { data: openSessions, error: eSel } = await supabase
        .from("limpiezas_registre")
        .select("id_registre, inici")
        .eq("id_limpieza", task.id_limpieza)
        .is("fi", null);
      if (eSel) { toast.error("Error: " + eSel.message); return; }
      for (const s of openSessions ?? []) {
        const { error: eUpd } = await supabase
          .from("limpiezas_registre")
          .update({ fi: nowIso, hores: diffHoursMinutes(s.inici, nowIso) })
          .eq("id_registre", s.id_registre);
        if (eUpd) { toast.error("Error: " + eUpd.message); return; }
      }
      const { error } = await supabase
        .from("limpiezas")
        .update({ estado: "finalizada", finalizada_en: nowIso })
        .eq("id_limpieza", task.id_limpieza);
      if (error) { toast.error("Error: " + error.message); return; }
      refetchAll();
      setEndSheetOpen(true);
    } finally {
      finishTaskInFlightRef.current = false;
      setFinishingTask(false);
    }
  }

  const refetchAll = () => {
    tasksQ.refetch();
    monthTasksQ.refetch();
    monthLimpiezasRegistreQ.refetch();
    monthMantQ.refetch();
    monthGenericQ.refetch();
    monthAjustosQ.refetch();
  };

  const detailTask = detailId != null ? (tasksQ.data ?? []).find((t) => t.id_limpieza === detailId) ?? null : null;

  const todayHasTasks = daysWithTasks.some((d) => d.fecha === todayISO);
  const todayPendingAssigned = (daysWithTasks.find((d) => d.fecha === todayISO)?.tasks ?? [])
    .filter((t) => t.estado !== "finalizada").length;

  // Sequential "Ver" review progress — rendered inline just below the day tabs
  // (or in their place, when day tabs aren't shown) instead of floating.
  const verQueuePill = verQueue != null && (
    <div className="mx-3 mt-3 flex items-center gap-3 rounded-lg bg-slate-900 text-white px-3 py-2.5">
      <span className="flex-1 text-sm font-medium whitespace-nowrap">
        {verQueueIndex + 1} de {verQueue.length} cambios
      </span>
      <Button
        size="sm"
        className="h-8 px-3 bg-white/15 hover:bg-white/25 text-white"
        onClick={handleVerSiguiente}
      >
        {verQueueIndex + 1 >= verQueue.length ? "Finalizar" : "Ver siguiente"}
      </Button>
      <button
        type="button"
        className="h-8 w-8 shrink-0 grid place-items-center rounded-full hover:bg-white/15"
        aria-label="Cancelar revisión"
        onClick={handleCancelVerQueue}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {previewing && (
        <div className="sticky top-0 z-40 bg-amber-400 text-amber-950 px-4 py-2 text-sm font-semibold flex items-center gap-2 shadow">
          <span className="flex-1">👁 Modo supervisión — viendo como: {previewing}</span>
          <button
            type="button"
            onClick={() => setPreviewEditEnabled((v) => !v)}
            className={cn(
              "rounded-full px-3 h-7 text-xs font-semibold border transition-colors",
              previewEditEnabled
                ? "bg-amber-950 text-amber-50 border-amber-950"
                : "bg-transparent text-amber-950 border-amber-950/40 hover:bg-amber-500/40",
            )}
          >
            {previewEditEnabled ? "Edición activada ✓" : "Activar edición"}
          </button>
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
          {fullModeRoute && (
            <button
              type="button"
              onClick={() => navigate({ to: fullModeRoute })}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/30 px-3 h-10 text-sm font-medium"
              aria-label="Modo completo"
            >
              <LayoutDashboard className="h-4 w-4" /> Modo completo
            </button>
          )}
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
              {fullModeRoute && (
                <DropdownMenuItem onSelect={() => navigate({ to: fullModeRoute })}>
                  <LayoutDashboard className="h-4 w-4" /> Modo completo
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setPwOpen(true)}>
                <KeyRound className="h-4 w-4" /> Cambiar contraseña
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => signOut()}>
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Change notifications banner — never auto-dismissed on mount, only on
          explicit "Ver" / close interaction (marks all currently-fetched rows visto). */}
      {(notificacionesQ.data ?? []).length > 0 && (
        <div
          className="mx-3 mt-3 rounded-lg px-3 py-2.5 flex items-center gap-2"
          style={{ backgroundColor: "#FCEBEB", color: "#791F1F" }}
        >
          <Bell className="h-5 w-5 shrink-0 notif-bell-pulse" />
          <div className="flex-1 text-sm font-semibold">{notifSummary}</div>
          <button
            type="button"
            className="shrink-0 text-sm font-semibold underline underline-offset-2"
            onClick={handleVerClick}
          >
            Ver
          </button>
          <button
            type="button"
            className="shrink-0 rounded-full p-1 hover:bg-black/5"
            aria-label="Cerrar aviso"
            onClick={handleDismissAllNotifications}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Incidencias reportadas hoy por este trabajador — visible a cualquier rol */}
      {(misIncidenciasHoyQ.data?.length ?? 0) > 0 && (
        <div className="px-3 mt-3">
          <Button
            className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => setMisIncidenciasHoyOpen(true)}
          >
            <AlertTriangle className="h-4 w-4" /> Incidencias reportadas hoy ({misIncidenciasHoyQ.data?.length ?? 0})
          </Button>
        </div>
      )}

      {/* Persistent entry point for Mantenimiento workers — no active cleaning required */}
      {isMantenimiento && (
        <div className="px-3 mt-3">
          <Button
            className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white"
            disabled={disabled}
            onClick={openIncidenciaManual}
          >
            <Wrench className="h-4 w-4" /> Nueva incidencia
          </Button>
        </div>
      )}

      {/* Tareas de mantenimiento (role Mantenimiento only) */}
      {isMantenimiento && (
        <div className="px-3 mt-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-800">Tareas de mantenimiento</h2>
            <div className="flex rounded-full bg-slate-200 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setMantFiltro("mias")}
                className={cn(
                  "rounded-full px-3 py-1 transition-colors",
                  mantFiltro === "mias" ? "bg-white shadow-sm text-slate-900" : "text-slate-600",
                )}
              >
                Asignadas a mí
              </button>
              <button
                type="button"
                onClick={() => setMantFiltro("todas")}
                className={cn(
                  "rounded-full px-3 py-1 transition-colors",
                  mantFiltro === "todas" ? "bg-white shadow-sm text-slate-900" : "text-slate-600",
                )}
              >
                Asignadas a otros
              </button>
              <button
                type="button"
                onClick={() => {
                  setMantFiltro("nuevas");
                  markNuevasSeen();
                }}
                className={cn(
                  "rounded-full px-3 py-1 transition-colors font-semibold",
                  hasUnseenNuevas
                    ? "bg-red-600 text-white"
                    : mantFiltro === "nuevas"
                      ? "bg-white shadow-sm text-slate-900"
                      : "text-slate-600",
                )}
              >
                Nuevas
              </button>
            </div>
          </div>
          {mantIncidenciasQ.isLoading ? (
            <div className="text-xs text-muted-foreground py-4 text-center">Cargando…</div>
          ) : (mantIncidenciasQ.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
              <p className="text-sm font-medium text-slate-600">
                {mantFiltro === "mias"
                  ? "No tienes tareas de mantenimiento asignadas."
                  : mantFiltro === "nuevas"
                    ? "No hay incidencias nuevas pendientes de validar."
                    : "No hay tareas de mantenimiento abiertas."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {mantFiltro === "nuevas"
                ? (mantIncidenciasQ.data ?? []).map((inc) => (
                    <div
                      key={inc.id_incidencia}
                      className="rounded-xl bg-white shadow-sm overflow-hidden flex cursor-pointer"
                      onClick={() => setMantDetailId(inc.id_incidencia)}
                    >
                      <div className="w-1.5 shrink-0 bg-amber-400" />
                      <div className="flex-1 p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <TipoBadge tipus={inc.tipus} />
                          <PrioridadPill prioridad={inc.prioritat_confirmada ?? inc.prioritat_proposta} />
                        </div>
                        <div className="text-sm font-medium">
                          {resolveLocation(inc, mantAptById, mantEspacioById, mantGrupoById)}
                        </div>
                        {inc.descripcio && (
                          <div className="text-xs text-slate-600 line-clamp-2">{inc.descripcio}</div>
                        )}
                        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
                            disabled={disabled}
                            onClick={() =>
                              mantActions.confirmarAsignacion(inc, personalId, null, inc.prioritat_proposta)
                            }
                          >
                            Autoasignar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                : (mantFiltro === "mias" ? mantDaysMap.get(activeDay) ?? [] : mantIncidenciasQ.data ?? []).map((inc) => (
                    <MantenimientoTaskCard
                      key={inc.id_incidencia}
                      inc={inc}
                      location={resolveLocation(inc, mantAptById, mantEspacioById, mantGrupoById)}
                      asignadoCodigo={workerCode(inc.id_assignat, mantAssignatCodigosQ.data ?? [])}
                      misSesiones={mantMisSesionesByIncidencia.get(inc.id_incidencia) ?? []}
                      adjuntoTipos={adjuntoTiposByIncidencia.get(inc.id_incidencia) ?? new Set()}
                      notifTipo={notifByReferencia.get(inc.id_incidencia)?.slice(-1)[0]?.tipo}
                      esAtrasada={mantOverdueIds.has(inc.id_incidencia)}
                      sinProgramar={mantUnscheduledIds.has(inc.id_incidencia)}
                      disabled={disabled}
                      onIniciar={() => handleIniciarIncidencia(inc)}
                      onFinParcial={() =>
                        handleMantFinParcial(inc, mantMisSesionesByIncidencia.get(inc.id_incidencia) ?? [])
                      }
                      onFinTotal={() => handleMantFinTotal(inc)}
                      onOpenDetail={() => setMantDetailId(inc.id_incidencia)}
                      onReprogramar={(nuevaFecha) => mantActions.reprogramar(inc, nuevaFecha)}
                      todayISO={todayISO}
                    />
                  ))}
            </div>
          )}
        </div>
      )}

      {/* Day tabs */}
      {/* Active generic task banner (always shown if active) */}
      {activeGen && (
        <ActiveGenericBanner
          gen={activeGen}
          onFinish={finishGeneric}
          disabled={disabled}
        />
      )}

      {daysWithTasks.length === 0 && !(mantMiasCountQ.data ?? 0) ? (
        <>
          {verQueuePill}
          <div className="p-8 text-center">
            {!activeGen && (
              <>
                <p className="text-sm text-muted-foreground mb-4">No tienes tareas asignadas hoy.</p>
                <Button
                  size="lg"
                  className="h-14 px-6 bg-[#26215C] hover:bg-[#1e1a48] text-white text-base"
                  disabled={disabled}
                  onClick={handleClickIniciarGenerica}
                >
                  <Play className="h-5 w-5" /> Iniciar jornada
                </Button>
              </>
            )}
          </div>
        </>
      ) : daysWithTasks.length === 0 && tabDates.length <= 1 ? (
        <>
          {verQueuePill}
          <div className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-3">
              No tienes limpiezas asignadas hoy, pero sí tareas de mantenimiento arriba.
            </p>
            <Button
              className="w-full h-12 bg-[#26215C] hover:bg-[#1e1a48] text-white"
              disabled={disabled}
              onClick={handleClickIniciarGenerica}
            >
              <ClipboardList className="h-4 w-4" /> Iniciar tarea genérica
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className={cn("sticky z-20 bg-slate-200 border-b", previewing ? "top-[96px]" : "top-[60px]")}>
            <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
              {tabDates.map((fecha) => {
                const active = fecha === activeDay;
                const isEmpty = emptyDates.has(fecha);
                const hasPending = daysWithTasks.find((d) => d.fecha === fecha)?.hasPending ?? false;
                return (
                  <button
                    key={fecha}
                    type="button"
                    disabled={isEmpty}
                    onClick={() => setActiveDay(fecha)}
                    className={cn(
                      "relative shrink-0 rounded-full px-4 text-sm font-medium transition-colors min-w-[88px]",
                      isEmpty
                        ? "min-h-11 py-1.5 flex flex-col items-center justify-center gap-0.5 bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        : active
                          ? "h-11 bg-[#26215C] text-white"
                          : "h-11 bg-white text-slate-700 border border-slate-200",
                    )}
                  >
                    {tabLabel(fecha, todayISO, tomorrowISO)}
                    {isEmpty && (
                      <span className="text-[10px] font-normal leading-none text-slate-500">Nada asignado</span>
                    )}
                    {hasPending && (
                      <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {verQueuePill}

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
                notifTipo={notifByReferencia.get(t.id_limpieza)?.slice(-1)[0]?.tipo}
                disabled={disabled}
                finishing={finishingTask}
                onChanged={refetchAll}
                onOpenDetail={() => setDetailId(t.id_limpieza)}
                onFinish={() => finishTask(t)}
                onReportIncidencia={() => openIncidenciaForTask(t)}
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

          {/* Extra CTA: also let workers start a generic task on days they have
              assignments. Not gated on activeGen — starting a second genérica while
              one is already active is Case 4 of the interrupt flow, handled in
              handleStartGenericSubmit once the user picks the new task in the sheet. */}
          <div className="px-3 mt-4">
            <Button
              className="w-full h-12 bg-[#26215C] hover:bg-[#1e1a48] text-white"
              disabled={disabled}
              onClick={handleClickIniciarGenerica}
            >
              <ClipboardList className="h-4 w-4" /> Iniciar tarea genérica
            </Button>
          </div>
        </>
      )}

      {/* Maintenance task(s) assigned to a non-Mantenimiento worker (e.g. a
          cleaner occasionally assigned a task) — shown plainly at the end of
          the list, no section title, no "mías/todas" toggle: mantFiltro
          stays at its default "mias" since these workers never see the
          toggle UI, so mantIncidenciasQ is already scoped to just their own. */}
      {!isMantenimiento && (mantIncidenciasQ.data ?? []).length > 0 && (
        <div className="px-3 mt-3 flex flex-col gap-3">
          {(mantDaysMap.get(activeDay) ?? []).map((inc) => (
            <MantenimientoTaskCard
              key={inc.id_incidencia}
              inc={inc}
              location={resolveLocation(inc, mantAptById, mantEspacioById, mantGrupoById)}
              asignadoCodigo={workerCode(inc.id_assignat, mantAssignatCodigosQ.data ?? [])}
              misSesiones={mantMisSesionesByIncidencia.get(inc.id_incidencia) ?? []}
              adjuntoTipos={adjuntoTiposByIncidencia.get(inc.id_incidencia) ?? new Set()}
              notifTipo={notifByReferencia.get(inc.id_incidencia)?.slice(-1)[0]?.tipo}
              esAtrasada={mantOverdueIds.has(inc.id_incidencia)}
              sinProgramar={mantUnscheduledIds.has(inc.id_incidencia)}
              disabled={disabled}
              onIniciar={() => handleIniciarIncidencia(inc)}
              onFinParcial={() =>
                handleMantFinParcial(inc, mantMisSesionesByIncidencia.get(inc.id_incidencia) ?? [])
              }
              onFinTotal={() => handleMantFinTotal(inc)}
              onOpenDetail={() => setMantDetailId(inc.id_incidencia)}
              onReprogramar={(nuevaFecha) => mantActions.reprogramar(inc, nuevaFecha)}
              todayISO={todayISO}
            />
          ))}
        </div>
      )}

      {/* Detail overlay */}
      <Sheet open={!!detailTask} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
          {detailTask && (
            <DetailView
              t={detailTask}
              apt={aptById.get(detailTask.id_apt)}
              resv={resvQ.data ?? new Map()}
              disabled={disabled}
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
            byDay={monthDayHours}
            onClose={() => setHoursOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />

      {/* Case 1 & 4: a tarea genérica is open and the user wants to start something
          else (an incidencia, or another tarea genérica) — offer Pausar (remember it
          for a later reopen offer) vs Cerrar definitivamente (no reopen offer). */}
      <Dialog open={!!confirmCloseGenInterrupt} onOpenChange={(o) => { if (!o) setConfirmCloseGenInterrupt(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tarea genérica abierta</DialogTitle>
            <DialogDescription>
              Tienes la tarea genérica '{activeGen ? activeGenNombre(activeGen) : ""}' abierta. ¿Quieres pausarla
              (te la ofreceremos de nuevo más tarde) o cerrarla definitivamente?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button className="w-full bg-[#26215C] hover:bg-[#1e1a48] text-white" onClick={confirmCloseGenPausar}>
              Pausar e iniciar
            </Button>
            <Button className="w-full" variant="outline" onClick={confirmCloseGenDefinitiva}>
              Cerrar definitivamente e iniciar
            </Button>
            <Button className="w-full" variant="ghost" onClick={() => setConfirmCloseGenInterrupt(null)}>
              No, volver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Case 2 & 3: an incidencia is already active and the user wants to start a
          different incidencia, or a tarea genérica — pause the active incidencia
          (finParcial) and proceed. No reopen offer: finParcial already returns it to
          "validada" with its own "Iniciar" button. */}
      <Dialog open={!!confirmPauseMant} onOpenChange={(o) => { if (!o) setConfirmPauseMant(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Incidencia en curso</DialogTitle>
            <DialogDescription>
              Tienes '{activeMantSession?.manteniment_incidencies?.titol ?? "una incidencia"}' en curso. ¿Quieres
              pausarla e iniciar {confirmPauseMant?.kind === "incidencia" ? "esta incidencia" : "la tarea genérica"}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPauseMant(null)}>
              No, volver
            </Button>
            <Button className="bg-[#26215C] hover:bg-[#1e1a48] text-white" onClick={confirmPauseMantAndProceed}>
              Sí, pausar e iniciar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Offer to reopen the tarea genérica closed earlier, once the
          triggering incidencia is finished/paused */}
      <Dialog open={reopenGenDialogOpen} onOpenChange={(o) => { if (!o) declineReopenGen(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reabrir tarea genérica</DialogTitle>
            <DialogDescription>
              ¿Quieres reabrir la tarea genérica '{pendingReopenGen?.nombre ?? ""}' que cerraste antes?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={declineReopenGen}>
              No
            </Button>
            <Button className="bg-[#26215C] hover:bg-[#1e1a48] text-white" onClick={confirmReopenGen}>
              Sí
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Optional, skippable follow-up after Fin total (list card's own button) —
          the incidencia is already closed by the time this appears, Omitir just
          discards this extra step. Same pattern as MantenimientoPopover's own
          version of this dialog. */}
      <Dialog open={finTotalExtrasOpen} onOpenChange={(o) => { if (!o) closeFinTotalExtras(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Incidencia finalizada</DialogTitle>
            <DialogDescription>
              ¿Quieres añadir fotos, vídeos u otros adjuntos y una nota de finalización antes de cerrar?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <AdjuntoPicker adjuntos={finTotalExtrasAdjuntos} onChange={setFinTotalExtrasAdjuntos} />
            <div className="space-y-1">
              <Label className="text-xs">Notas de finalización</Label>
              <Textarea
                rows={3}
                value={finTotalExtrasNota}
                onChange={(e) => setFinTotalExtrasNota(e.target.value)}
                placeholder="Describe cómo quedó resuelta la incidencia…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={finTotalExtrasSaving} onClick={closeFinTotalExtras}>
              Omitir
            </Button>
            <Button
              className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
              disabled={finTotalExtrasSaving}
              onClick={handleGuardarFinTotalExtras}
            >
              {finTotalExtrasSaving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start jornada / generic task sheet */}
      <Sheet open={startSheetOpen} onOpenChange={setStartSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <StartJornadaPanel
            tipos={tiposQ.data ?? []}
            grupos={gruposQ.data ?? []}
            apartamentos={aptsAllQ.data ?? []}
            espaciosComunes={espaciosComunesQ.data ?? []}
            disabled={disabled}
            onStart={handleStartGenericSubmit}
            onCancel={() => setStartSheetOpen(false)}
            onCreateType={async (nombre) => {
              const cleanName = nombre.toUpperCase().trim();
              if (!cleanName) return null;
              const nextOrden =
                (tiposQ.data ?? []).reduce((m, t) => Math.max(m, t.orden ?? 0), 0) + 1;
              const { data, error } = await supabase
                .from("tipos_tarea_generica")
                .insert({
                  nombre: cleanName,
                  actiu: true,
                  requiere_apartamento: false,
                  computable_hores: true,
                  orden: nextOrden,
                  creado_por: personalId,
                  creado_en: new Date().toISOString(),
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
            onNewGeneric={() => { setEndSheetOpen(false); handleClickIniciarGenerica(); }}
            onViewTasks={() => setEndSheetOpen(false)}
            onClose={tancarJornada}
          />
        </SheetContent>
      </Sheet>

      {/* Reportar incidencia (mantenimiento) */}
      {incidenciaContext && (
        <ReportarIncidenciaSheet
          open={incidenciaOpen}
          onOpenChange={setIncidenciaOpen}
          reporterId={personalId}
          context={incidenciaContext}
        />
      )}

      {/* Incidencias reportadas hoy por este trabajador (cualquier rol) */}
      <Dialog open={misIncidenciasHoyOpen} onOpenChange={setMisIncidenciasHoyOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Incidencias reportadas hoy</DialogTitle>
            <DialogDescription>Incidencias que has reportado hoy</DialogDescription>
          </DialogHeader>
          {(misIncidenciasHoyQ.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">No has reportado incidencias hoy</div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {(misIncidenciasHoyQ.data ?? []).map((inc) => {
                // misIncidenciasHoyQ is already scoped to today + id_reporter === personalId,
                // so every row here is editable by the reporter regardless of estat (kept in
                // sync with `puedeEditarComoReporter` in MantenimientoPopover).
                return (
                  <div
                    key={inc.id_incidencia}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                    onClick={() => {
                      setMantDetailId(inc.id_incidencia);
                      setMisIncidenciasHoyOpen(false);
                    }}
                  >
                    {inc.descripcio && <div className="text-sm text-slate-700 line-clamp-2">{inc.descripcio}</div>}
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <TipoBadge tipus={inc.tipus} />
                      <EstadoFullPill estat={inc.estat} />
                      {inc.estat !== "pendent_validacio" && (
                        <span className="text-xs text-muted-foreground">
                          Asignada a{" "}
                          {inc.id_assignat != null
                            ? (personalQ.data ?? []).find((p) => p.id_persona === inc.id_assignat)?.codigo ??
                              `#${inc.id_assignat}`
                            : "—"}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(inc.data_incident ?? inc.creado_en).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MantenimientoPopover
        idIncidencia={mantDetailId}
        onOpenChange={(o) => {
          if (!o) setMantDetailId(null);
        }}
        onSaved={() => {
          mantIncidenciasQ.refetch();
          mantNuevasAllQ.refetch();
          misIncidenciasHoyQ.refetch();
        }}
        workers={personalQ.data ?? []}
        selfAssignId={personalId}
      />

      {/* Equipo trabajando este día */}
      <div className="px-3 mt-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Equipo trabajando este día</h2>
        {otherQ.isLoading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Cargando…</div>
        ) : (otherQ.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
            <p className="text-sm font-medium text-slate-600">No hay más tareas asignadas este día</p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-[10px] py-2 px-2 h-auto">Ubicación</TableHead>
                  <TableHead className="text-[10px] py-2 px-2 h-auto">Tipo</TableHead>
                  <TableHead className="text-[10px] py-2 px-2 h-auto">N.</TableHead>
                  <TableHead className="text-[10px] py-2 px-2 h-auto">Sale</TableHead>
                  <TableHead className="text-[10px] py-2 px-2 h-auto">Entra</TableHead>
                  <TableHead className="text-[10px] py-2 px-2 h-auto">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(otherQ.data ?? []).map((t) => {
                  const apt = aptsAllQ.data?.find((a) => a.id_apt === t.id_apt);
                  const aptName = apt?.nombre ?? `Apt #${t.id_apt}`;
                  const next = t.proxima_reserva_numero ? otherResvQ.data?.get(t.proxima_reserva_numero) ?? null : null;
                  const isNentran = !next || next["Check in"] !== t.fecha_limpieza;
                  return (
                    <TableRow key={t.id_limpieza} className="text-xs">
                      <TableCell className="py-2 px-2">
                        <span className="truncate block max-w-[160px]" title={aptName}>
                          {shortAptName(aptName)}
                        </span>
                        {mantByAptQ.data?.has(t.id_apt) && (
                          <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
                            <Wrench className="h-2.5 w-2.5" /> Mant.
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 px-2">
                        <CompactTipoBadge tipo={t.tipo} completa={t.check_limpieza_completa ?? false} />
                      </TableCell>
                      <TableCell className="py-2 px-2 text-[10px] font-medium">
                        {workerCode(t.worker, otherWorkersQ.data ?? [])}
                      </TableCell>
                      <TableCell className="py-2 px-2">
                        <TimeBadge time={t.hora_out_time} informed={t.hora_out_informed} size="xs" />
                      </TableCell>
                      <TableCell className="py-2 px-2">
                        {isNentran ? (
                          <span className="rounded px-1 py-px text-[9px] font-semibold bg-gray-200 text-gray-700">
                            NE
                          </span>
                        ) : (
                          <TimeBadge time={t.hora_in_time} informed={t.hora_in_informed} size="xs" />
                        )}
                      </TableCell>
                      <TableCell className="py-2 px-2">
                        <CompactEstadoBadge estado={t.estado} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
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

function PendienteAtrasadaBadge() {
  return (
    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold border bg-rose-100 text-rose-900 border-rose-300">
      ⏰ PENDIENTE
    </span>
  );
}

function TimeChip({ time, informed }: { time: string | null; informed: boolean | null }) {
  return <TimeBadge time={time} informed={informed} size="md" className="rounded-md" />;
}

function TaskCard({
  t, apt, resv, notifTipo, disabled, finishing, onChanged, onOpenDetail, onFinish, onReportIncidencia,
}: {
  t: LimpiezaDia;
  apt: Apartamento | undefined;
  resv: Map<string, ResvLite>;
  notifTipo?: string;
  disabled: boolean;
  finishing: boolean;
  onChanged: () => void;
  onOpenDetail: () => void;
  onFinish: () => void;
  onReportIncidencia: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const startInFlightRef = useRef(false);

  const next = t.proxima_reserva_numero ? resv.get(t.proxima_reserva_numero) ?? null : null;
  const nentran = !t.hora_in_time || !next || next["Check in"] !== t.fecha_limpieza;
  const sourceResv = t.numero_reserva ? resv.get(t.numero_reserva) ?? null : null;
  const isVacio = t.tipo === "salida" && !!sourceResv?.["Check-out"] && sourceResv["Check-out"] < t.fecha_limpieza;
  const isIntermedia = t.tipo === "intermedia";
  const nextGuests = next?.["Huéspedes"] ?? null;
  // "intermedia" (LIMPIEZA EXTRA-CR) has no incoming reservation of its own —
  // show the current stay's guests when linked to one, or the manually-entered
  // huespedes_previstos when it's an ad-hoc cleaning over an unoccupied gap.
  const guestsToShow =
    t.tipo === "intermedia"
      ? t.numero_reserva != null
        ? sourceResv?.["Huéspedes"] ?? null
        : t.huespedes_previstos ?? null
      : nextGuests;
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
  const start = async () => {
    if (startInFlightRef.current) return;
    if (t.worker == null) { toast.error("La limpieza no tiene un operario asignado"); return; }
    startInFlightRef.current = true;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { error: e1 } = await supabase.from("limpiezas_registre").insert({
        id_limpieza: t.id_limpieza,
        id_persona: t.worker,
        inici: nowIso,
      });
      if (e1) {
        setBusy(false);
        toast.error("Error: " + e1.message);
        return;
      }
      const patch: Partial<Limpieza> = { estado: "en_curso" };
      if (!t.iniciada_en) patch.iniciada_en = nowIso;
      await update(patch);
    } finally {
      startInFlightRef.current = false;
    }
  };
  const finParcial = async () => {
    setBusy(true);
    const nowIso = new Date().toISOString();
    const { data: openSession, error: eSel } = await supabase
      .from("limpiezas_registre")
      .select("id_registre, inici")
      .eq("id_limpieza", t.id_limpieza)
      .is("fi", null)
      .limit(1)
      .maybeSingle();
    if (eSel) {
      setBusy(false);
      toast.error("Error: " + eSel.message);
      return;
    }
    if (openSession) {
      const { error: eUpd } = await supabase
        .from("limpiezas_registre")
        .update({ fi: nowIso, hores: diffHoursMinutes(openSession.inici, nowIso) })
        .eq("id_registre", openSession.id_registre);
      if (eUpd) {
        setBusy(false);
        toast.error("Error: " + eUpd.message);
        return;
      }
    }
    const ok = await update({ estado: "aceptada" });
    if (ok) toast.success("Sesión pausada");
  };
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
            {t.esPendienteAtrasada && (
              <div className="text-[11px] text-rose-700 mt-0.5">Pendiente desde {fmtDate(t.fecha_limpieza)}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {t.esPendienteAtrasada && <PendienteAtrasadaBadge />}
            {notifTipo && <CambioBadge tipo={notifTipo} />}
            <StateBadge estado={t.estado} />
          </div>
        </div>

        {/* Times */}
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 flex-wrap">
          <span>Sale:</span>
          {isVacio ? (
            <span className="rounded px-1.5 py-px font-semibold bg-rose-200 text-rose-900">VACÍA</span>
          ) : (
            <TimeChip time={t.hora_out_time} informed={t.hora_out_informed} />
          )}
          <span>→</span>
          <span>Entra:</span>
          {nentran ? (
            <span className="rounded px-1.5 py-px font-semibold bg-gray-200 text-gray-700">NOENTRAN</span>
          ) : (
            <TimeChip time={t.hora_in_time} informed={t.hora_in_informed} />
          )}
          {guestsToShow != null && guestsToShow > 0 && (
            <span>👤 {guestsToShow} {guestsToShow === 1 ? "huésped" : "huéspedes"}</span>
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
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-[11px] font-semibold",
                  t.tipo === "intermedia" ? "bg-orange-100 text-orange-900" : "bg-indigo-100 text-indigo-900",
                )}
              >
                <Sofa className="h-3 w-3" /> {t.tipo === "intermedia" ? "Cambiar ropa SFC" : "Montar SFC"}
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
              <Button size="sm" className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={disabled || busy} onClick={accept}>
                <Check className="h-4 w-4" /> Aceptar
              </Button>
              <Button size="sm" className="h-11 px-4 bg-amber-500 hover:bg-amber-600 text-white" disabled={disabled || busy} onClick={() => setRejecting(true)}>
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
                <Button size="sm" className="h-11 px-4 bg-amber-500 hover:bg-amber-600 text-white" disabled={disabled || busy} onClick={confirmReject}>
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
              <Button size="sm" className="h-11 px-4 bg-[#26215C] hover:bg-[#1e1a48] text-white" disabled={disabled || busy} onClick={start}>
                <Play className="h-4 w-4" /> Iniciar limpieza
              </Button>
              <Button size="sm" variant="secondary" className="h-11 px-4" onClick={onOpenDetail}>
                <Menu className="h-4 w-4" /> Detalle
              </Button>
            </>
          )}
          {t.estado === "en_curso" && (
            <>
              <Button size="sm" className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={disabled || finishing} onClick={onFinish}>
                <Check className="h-4 w-4" /> Finalizar
              </Button>
              <Button size="sm" variant="outline" className="h-11 px-4" disabled={disabled || busy} onClick={finParcial}>
                <Pause className="h-4 w-4" /> Fin parcial
              </Button>
              <Button size="sm" variant="secondary" className="h-11 px-4" onClick={onOpenDetail}>
                <Menu className="h-4 w-4" /> Detalle
              </Button>
              <Button size="sm" variant="outline" className="h-11 px-4 border-amber-400 text-amber-800 hover:bg-amber-50" onClick={onReportIncidencia}>
                <AlertTriangle className="h-4 w-4" /> Incidencia
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

function MantenimientoTaskCard({
  inc,
  location,
  asignadoCodigo,
  misSesiones,
  adjuntoTipos,
  notifTipo,
  esAtrasada,
  sinProgramar,
  disabled,
  onIniciar,
  onFinParcial,
  onFinTotal,
  onOpenDetail,
  onReprogramar,
  todayISO,
}: {
  inc: Incidencia;
  location: string;
  asignadoCodigo: string;
  misSesiones: Registre[];
  adjuntoTipos: Set<string>;
  notifTipo?: string;
  esAtrasada?: boolean;
  sinProgramar?: boolean;
  disabled: boolean;
  onIniciar: () => Promise<void> | void;
  onFinParcial: () => Promise<void> | void;
  onFinTotal: () => Promise<void> | void;
  onOpenDetail: () => void;
  onReprogramar: (nuevaFecha: string) => Promise<void> | void;
  todayISO: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [reprogramando, setReprogramando] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState("");
  const misOpenSession = findOpenSession(misSesiones);

  async function guarded(action: () => Promise<void> | void) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await action();
    } finally {
      setSubmitting(false);
    }
  }

  async function guardarReprogramar() {
    if (!nuevaFecha) return;
    await guarded(() => onReprogramar(nuevaFecha));
    setReprogramando(false);
    setNuevaFecha("");
  }

  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden flex">
      <div className={cn("w-1.5 shrink-0", misOpenSession ? "bg-[#378ADD]" : "bg-slate-300")} />
      <div className="flex-1 p-3 space-y-1.5 cursor-pointer" onClick={onOpenDetail}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <TipoBadge tipus={inc.tipus} />
          <PrioridadPill prioridad={inc.prioritat_confirmada ?? inc.prioritat_proposta} />
          {notifTipo && <CambioBadge tipo={notifTipo} />}
          {esAtrasada && <MantAtrasadaBadge />}
          {sinProgramar && <MantSinProgramarBadge />}
        </div>
        {inc.descripcio && (
          <div className="text-sm text-foreground font-medium line-clamp-2">{inc.descripcio}</div>
        )}
        <div className="text-xs text-slate-600 flex items-center gap-1">
          <Home className="h-3 w-3 shrink-0" /> {location}
          {adjuntoTipos.size > 0 && (
            <span className="flex items-center gap-1 ml-1 text-slate-500">
              {ADJUNTO_TIPO_ICONS.filter((o) => adjuntoTipos.has(o.tipo)).map((o) => (
                <span key={o.tipo} title={o.title}>
                  <o.Icon className="h-3 w-3" />
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-600">Asignado a: {asignadoCodigo}</div>
        {inc.data_prevista && (
          <div className="text-xs text-slate-600 flex items-center gap-1">
            Prevista: {fmtDate(inc.data_prevista)}
            {inc.data_reprogramada_por_operario && (
              <span title="Fecha modificada por el operario">
                <RotateCcw className="h-3 w-3 text-amber-600" />
              </span>
            )}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {!misOpenSession ? (
            <>
              <Button
                size="sm"
                className="h-11 px-4 bg-[#26215C] hover:bg-[#1e1a48] text-white"
                disabled={disabled || submitting}
                onClick={() => guarded(onIniciar)}
              >
                <Play className="h-4 w-4" /> {submitting ? "Iniciando…" : "Iniciar"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 px-4"
                disabled={disabled || submitting}
                onClick={() => setReprogramando((v) => !v)}
              >
                <RotateCcw className="h-4 w-4" /> Reprogramar
              </Button>
              {reprogramando && (
                <div className="w-full flex flex-col gap-2 mt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      min={todayISO}
                      value={nuevaFecha}
                      onChange={(e) => setNuevaFecha(e.target.value)}
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    />
                    <Button
                      size="sm"
                      className="h-9 px-3 bg-[#26215C] hover:bg-[#1e1a48] text-white"
                      disabled={disabled || submitting || !nuevaFecha}
                      onClick={guardarReprogramar}
                    >
                      Guardar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 px-3"
                      disabled={disabled || submitting}
                      onClick={() => { setReprogramando(false); setNuevaFecha(""); }}
                    >
                      Cancelar
                    </Button>
                  </div>
                  {inc.id_apt != null && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Ocupación del apartamento</Label>
                      <div className="rounded-md border p-2">
                        <ApartamentoOcupacionCalendario
                          idApt={inc.id_apt}
                          initialDateISO={nuevaFecha || inc.data_prevista}
                          onSelectDate={(iso) => setNuevaFecha(iso)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-11 px-4 border-amber-400 text-amber-800 hover:bg-amber-50"
                disabled={disabled || submitting}
                onClick={() => guarded(onFinParcial)}
              >
                {submitting ? "Guardando…" : "Fin parcial"}
              </Button>
              <Button
                size="sm"
                className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={disabled || submitting}
                onClick={() => guarded(onFinTotal)}
              >
                <Check className="h-4 w-4" /> {submitting ? "Finalizando…" : "Fin total"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Detail view ---------------- */

function DetailView({
  t, apt, resv, disabled, onClose, onChanged,
}: {
  t: Limpieza;
  apt: Apartamento | undefined;
  resv: Map<string, ResvLite>;
  disabled: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [local, setLocal] = useState<Limpieza>(t);
  const [incLocal, setIncLocal] = useState<string>(t.incidencias ?? "");
  const [busy, setBusy] = useState(false);
  const startInFlightRef = useRef(false);

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
    if (disabled) return;
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
    if (disabled) return;
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
    if (disabled) return;
    setBusy(true);
    const { error } = await supabase.from("limpiezas").update({ estado: "aceptada" }).eq("id_limpieza", t.id_limpieza);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onChanged(); onClose();
  };
  const start = async () => {
    if (disabled) return;
    if (startInFlightRef.current) return;
    if (t.worker == null) { toast.error("La limpieza no tiene un operario asignado"); return; }
    startInFlightRef.current = true;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { error: e1 } = await supabase.from("limpiezas_registre").insert({
        id_limpieza: t.id_limpieza,
        id_persona: t.worker,
        inici: nowIso,
      });
      if (e1) {
        setBusy(false);
        toast.error("Error: " + e1.message);
        return;
      }
      const patch: Partial<Limpieza> = { estado: "en_curso" };
      if (!t.iniciada_en) patch.iniciada_en = nowIso;
      const { error } = await supabase.from("limpiezas").update(patch).eq("id_limpieza", t.id_limpieza);
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      onChanged(); onClose();
    } finally {
      startInFlightRef.current = false;
    }
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
            {next?.["Huéspedes"] != null && next["Huéspedes"] > 0 && (
              <div className="text-xs font-medium text-foreground">
                👤 {next["Huéspedes"]} {next["Huéspedes"] === 1 ? "huésped" : "huéspedes"} entrantes
              </div>
            )}
          </div>
        </section>

        {/* Checklist */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Tareas</h3>
          <div className="rounded-lg border bg-white p-3 space-y-3">
            {t.tipo === "salida" ? (
              <>
                <CheckRow label="Montar sofá cama" checked={!!local.sfc_montar} disabled={disabled} onChange={() => toggleSalida("sfc_montar")} />
                <CheckRow label="Desmontar sofá cama" checked={!!local.sfc_desmontar} disabled={disabled} onChange={() => toggleSalida("sfc_desmontar")} />
                <CheckRow label="Realizar check-in" checked={!!local.check_checkin} disabled={disabled} onChange={() => toggleSalida("check_checkin")} />
                <CheckRow label="Cobrar tasas" checked={!!local.check_tasas} disabled={disabled} onChange={() => toggleSalida("check_tasas")} />
              </>
            ) : (
              <>
                <CheckRow label="Cambiar ropa SFC" checked={!!local.sfc_montar} disabled={disabled} onChange={() => toggleSalida("sfc_montar")} />
                <CheckRow label="Cambiar toallas" checked={!!local.check_toallas} disabled={disabled} onChange={() => toggleIntermedia("check_toallas")} />
                <CheckRow label="Cambiar sábanas" checked={!!local.check_sabanas} disabled={disabled} onChange={() => toggleIntermedia("check_sabanas")} />
                <CheckRow label="Limpieza básica" checked={!!local.check_limpieza_basica} disabled={disabled} onChange={() => toggleIntermedia("check_limpieza_basica")} />
                <CheckRow label="Limpieza completa" checked={!!local.check_limpieza_completa} disabled={disabled} onChange={() => toggleIntermedia("check_limpieza_completa")} />
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
            disabled={disabled}
          />
        </section>

        {/* Action */}
        <section className="pt-2">
          {t.estado === "comunicada" && (
            <div className="flex gap-2">
              <Button className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={disabled || busy} onClick={accept}>
                <Check className="h-4 w-4" /> Aceptar
              </Button>
              <Button className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 text-white" disabled={busy} onClick={onClose}>
                <X className="h-4 w-4" /> Rechazar
              </Button>
            </div>
          )}
          {t.estado === "aceptada" && (
            <Button className="w-full h-12 bg-[#26215C] hover:bg-[#1e1a48] text-white" disabled={disabled || busy} onClick={start}>
              <Play className="h-4 w-4" /> Iniciar limpieza
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}

function CheckRow({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label className={cn("flex items-center gap-3 min-h-[44px]", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={onChange} className="h-5 w-5" />
      <span className="text-sm">{label}</span>
    </label>
  );
}

/* ---------------- Hours panel ---------------- */

function HoursPanel({
  monthHours, byDay: byDayMap, onClose,
}: {
  monthHours: number;
  byDay: Map<string, number>;
  onClose: () => void;
}) {
  const now = new Date();
  const monthName = MONTH_ES[now.getMonth()];
  const year = now.getFullYear();

  const byDay = useMemo(() => {
    return Array.from(byDayMap.entries())
      .filter(([, h]) => h > 0)
      .sort(([a], [b]) => b.localeCompare(a));
  }, [byDayMap]);

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
                  <span className="font-semibold">{formatHHMM(h)}</span>
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
      setError("Ambos campos son obligatorios");
      return;
    }
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      toast.error("Error al actualizar la contraseña");
      return;
    }
    toast.success("Contraseña actualizada correctamente");
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
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>Mínimo 8 caracteres.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="mi-dia-new-pw">Nueva contraseña</Label>
            <PasswordInput
              id="mi-dia-new-pw"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mi-dia-confirm-pw">Confirmar contraseña</Label>
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
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar"}
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
  onFinish: () => void | Promise<void>;
  disabled: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const startMs = new Date(gen.inici).getTime();
  const elapsed = Math.max(0, (now - startMs) / 3_600_000);
  const startHM = localHM(gen.inici) ?? "—";

  return (
    <div className="mx-3 mt-3 rounded-xl bg-emerald-50 border border-emerald-300 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-500 text-white grid place-items-center shrink-0">
          <Play className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wide text-emerald-800 font-semibold">Tarea en curso</div>
          <div className="text-base font-semibold text-emerald-950 truncate">
            {gen.tipos_tarea_generica?.nombre ?? "Tarea genérica"}
          </div>
          <div className="text-xs text-emerald-900 mt-0.5">
            Inicio {startHM} · {fmtHours(elapsed)} transcurrido
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Button
          className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={disabled || submitting}
          onClick={async () => {
            if (submitting) return;
            setSubmitting(true);
            try {
              await onFinish();
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Square className="h-4 w-4" /> {submitting ? "Finalizando…" : "Finalizar tarea"}
        </Button>
      </div>
    </div>
  );
}

function StartJornadaPanel({
  tipos, grupos, apartamentos, espaciosComunes, disabled, onStart, onCancel, onCreateType,
}: {
  tipos: { id_tipus: number; nombre: string }[];
  grupos: { id_grupo: number; nombre: string }[];
  apartamentos: { id_apt: number; nombre: string; id_grupo: number | null }[];
  espaciosComunes: { id_tipo: number; nombre: string }[];
  disabled: boolean;
  onStart: (
    idTipus: number,
    notes: string,
    idGrupo: number | null,
    idApt: number | null,
    idEspacioComun: number | null,
  ) => void | Promise<void>;
  onCancel: () => void;
  onCreateType: (nombre: string) => Promise<number | null>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [propOpen, setPropOpen] = useState(false);
  const [idGrupo, setIdGrupo] = useState<number | null>(null);
  const [idApt, setIdApt] = useState<number | null>(null);
  const [idEspacioComun, setIdEspacioComun] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        <div className="text-xs text-muted-foreground">Elige el tipo de tarea que empiezas</div>
      </div>
      <div className="space-y-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tipo de tarea..."
          className="text-sm"
        />
        <div className="border border-slate-200 rounded-lg overflow-y-auto max-h-[280px] divide-y divide-slate-100">
          {tipos.length === 0 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              No hay tipos activos. Contacta con el gestor.
            </div>
          )}
          {tipos.length > 0 && filteredTipos.length === 0 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">Sin resultados</div>
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
                className="w-full flex items-center gap-2 px-3 py-3 text-sm font-semibold rounded-md border border-[#5DCAA5] bg-[#E1F5EE] text-[#085041] hover:bg-[#d3efe4] disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                <span>
                  {creating
                    ? "Creando…"
                    : `Crear "${query.trim().toUpperCase()}" como nueva tarea`}
                </span>
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
          <span>Asociar a una propiedad (opcional)</span>
          <span className="text-xs text-muted-foreground">
            {propOpen ? "−" : "+"}
          </span>
        </button>
        {propOpen && (
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-100">
            <div className="space-y-1">
              <Label className="text-xs">Grupo</Label>
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
                <option value="">— Ninguno —</option>
                {grupos.map((g) => (
                  <option key={g.id_grupo} value={g.id_grupo}>{g.nombre}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ubicación</Label>
              <select
                value={
                  idApt != null
                    ? `apt-${idApt}`
                    : idEspacioComun != null
                      ? `esp-${idEspacioComun}`
                      : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setIdApt(v.startsWith("apt-") ? Number(v.slice(4)) : null);
                  setIdEspacioComun(v.startsWith("esp-") ? Number(v.slice(4)) : null);
                }}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— Ninguno —</option>
                {filteredApts.length > 0 && (
                  <optgroup label="Apartamentos">
                    {filteredApts.map((a) => (
                      <option key={`apt-${a.id_apt}`} value={`apt-${a.id_apt}`}>{a.nombre}</option>
                    ))}
                  </optgroup>
                )}
                {espaciosComunes.length > 0 && (
                  <optgroup label="Espacios comunes">
                    {espaciosComunes.map((esp) => (
                      <option key={`esp-${esp.id_tipo}`} value={`esp-${esp.id_tipo}`}>{esp.nombre}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="gen-notes" className="text-xs">Notas (opcional)</Label>
        <Textarea
          id="gen-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Detalles opcionales…"
          className="text-sm min-h-[70px]"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1 h-12" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        <Button
          className="flex-1 h-12 bg-[#26215C] hover:bg-[#1e1a48] text-white"
          disabled={disabled || selected == null || submitting}
          onClick={async () => {
            if (selected == null || submitting) return;
            setSubmitting(true);
            try {
              await onStart(selected, notes, idGrupo, idApt, idEspacioComun);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Play className="h-4 w-4" /> {submitting ? "Iniciando…" : "Iniciar"}
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
        <div className="text-lg font-semibold">Tarea finalizada ✓</div>
        <div className="text-xs text-muted-foreground">¿Qué quieres hacer ahora?</div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {hasPending ? (
          <Button variant="outline" className="h-12" onClick={onViewTasks}>
            <Menu className="h-4 w-4" /> Ver tareas pendientes
          </Button>
        ) : (
          <Button variant="outline" className="h-12" disabled={disabled} onClick={onNewGeneric}>
            <ClipboardList className="h-4 w-4" /> Iniciar nueva tarea genérica
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
