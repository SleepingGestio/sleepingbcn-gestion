import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SortHeader } from "@/components/sort-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Search, Lock, LockOpen, Eye, Pencil, ArrowUp, ArrowDown, CheckCircle2 } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { formatHHMM as fmtHours } from "@/lib/utils";
import { DIAS_PROMEDIO_MES, isFijoDiscontinuo, desgloseVacances } from "@/lib/vacaciones";
import { toast } from "sonner";
import { LimpiezaPopover, type Limpieza } from "@/components/limpieza-popover";
import { MantenimientoPopover } from "@/components/mantenimiento-popover";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { usePermissions } from "@/hooks/use-permissions";
import { HHMMInput } from "@/components/hhmm-input";
import { useApartamentosLite, useEspaciosLite, useGruposLite, usePersonalLite } from "@/hooks/use-mantenimiento";
import { resolveLocation, TIPO_STYLE, type IncidenciaTipo } from "@/lib/mantenimiento";

export const Route = createFileRoute("/registre-horari/$id")({
  component: DetallPage,
});

const MONTH_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DOW_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
// Desviación relativa (sobre el estándar) a partir de la cual se resalta en la tabla.
const DESVIACION_UMBRAL = 0.15;

function pad(n: number) { return String(n).padStart(2, "0"); }

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

function EstandarCells({ std }: { std: Row["std"] }) {
  if (std === "otra-sesion") {
    return (<><td className="py-1.5 px-3" /><td className="py-1.5 px-3" /></>);
  }
  if (!std) {
    return (
      <>
        <td className="py-1.5 px-3 text-right text-muted-foreground">—</td>
        <td className="py-1.5 px-3 text-right text-muted-foreground">—</td>
      </>
    );
  }
  const diff = std.total - std.standard;
  const ratio = diff / std.standard;
  const sign = diff < 0 ? "−" : "+";
  const pct = `${ratio < 0 ? "−" : "+"}${Math.round(Math.abs(ratio) * 100)}%`;
  let cls = "text-muted-foreground";
  let icon: React.ReactNode = null;
  if (ratio > DESVIACION_UMBRAL) {
    cls = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
    icon = <ArrowUp className="h-3 w-3" />;
  } else if (ratio < -DESVIACION_UMBRAL) {
    cls = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    icon = <ArrowDown className="h-3 w-3" />;
  }
  return (
    <>
      <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap">{fmtHours(std.standard)}</td>
      <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cls}`}
          title={`${pct} respecto al estándar`}
        >
          {icon}
          {sign}{fmtHours(Math.abs(diff))}
        </span>
      </td>
    </>
  );
}

function fmtAjustSigned(h: number): { text: string; className: string } {
  if (h < 0) {
    return { text: `−${fmtHours(Math.abs(h))}`, className: "text-red-600" };
  }
  return { text: `+${fmtHours(h)}`, className: "text-emerald-600" };
}

function ajustCellText(r: { kind: RowKind; hores: number; tipus_computa?: "treballades" | "objectiu" | "ajust" | null }): string {
  if (r.kind !== "ajust") return fmtHours(r.hores);
  const tc = r.tipus_computa ?? "ajust";
  if (tc === "treballades") return fmtAjustSigned(r.hores).text;
  if (tc === "objectiu") return `−${fmtHours(Math.abs(r.hores))} obj.`;
  return fmtAjustSigned(r.hores).text;
}

function ajustCellClass(r: { kind: RowKind; hores: number; tipus_computa?: "treballades" | "objectiu" | "ajust" | null }): string {
  if (r.kind !== "ajust") return "";
  const tc = r.tipus_computa ?? "ajust";
  if (tc === "treballades") return fmtAjustSigned(r.hores).className;
  if (tc === "objectiu") return "text-amber-600";
  return fmtAjustSigned(r.hores).className;
}

function fmtHM(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateOnly(v: string | null): string {
  if (!v) return "";
  return v.length >= 10 ? v.slice(0, 10) : v;
}

type RowKind = "checkout" | "extra_cr" | "generica" | "manteniment" | "ajust";
type Row = {
  key: string;
  kind: RowKind;
  fecha: string;
  inici: string | null;
  fi: string | null;
  propietat: string;
  tipus: string;
  hores: number;
  tipus_computa?: "treballades" | "objectiu" | "ajust" | null;
  // undefined = sin estándar; "otra-sesion" = sesión no inicial de una limpieza con varias sesiones.
  std?: { standard: number; total: number } | "otra-sesion";
  raw: Record<string, unknown>;
};

type SortKey = "fecha" | "propietat" | "tipus" | "hores";

function DetallPage() {
  const { id } = Route.useParams();
  const idPersona = Number(id);
  const qc = useQueryClient();
  const { persona: currentPersona } = useCurrentPersonal();
  // El permiso sigue a lo que se edita, no a la pantalla desde la que se llega:
  // poder consultar las horas de alguien no habilita a reprogramar limpiezas.
  // Mismo criterio (y mismo menú) que /programacion-limpiezas, que es donde
  // este popover se abre normalmente.
  const { canEdit } = usePermissions();
  const canEditLimpiezas = canEdit("programacion_limpiezas");

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const { start, end } = monthRange(year, month0);
  const [activeTab, setActiveTab] = useState<"mes" | "tancaments" | "vacances">("mes");

  const [sortKey, setSortKey] = useState<SortKey>("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [ajustOpen, setAjustOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [limpiezaPopover, setLimpiezaPopover] = useState<null | {
    loadKey: number;
    apt: { id_apt: number; nombre: string; camas_fijas?: number | null; tiene_sofa_cama?: boolean | null };
    fecha: string;
    existing: Limpieza | null;
  }>(null);
  const [mantDetailId, setMantDetailId] = useState<number | null>(null);
  const mantWorkersQ = usePersonalLite();

  async function openRow(r: Row) {
    if (r.kind === "manteniment") {
      const raw = r.raw as { id_incidencia: number };
      setMantDetailId(raw.id_incidencia);
      return;
    }
    if (r.kind === "checkout" || r.kind === "extra_cr") {
      const raw = r.raw as {
        id_limpieza: number;
        id_apt?: number;
        limpiezas?: { id_apt: number } | null;
      };
      const idApt = raw.id_apt ?? raw.limpiezas?.id_apt;
      if (idApt == null) { toast.error("Apartamento no encontrado"); return; }
      const [{ data: apt }, { data: full }] = await Promise.all([
        supabase
          .from("apartamentos")
          .select("id_apt, nombre, camas_fijas, tiene_sofa_cama")
          .eq("id_apt", idApt)
          .maybeSingle(),
        supabase.from("limpiezas").select("*").eq("id_limpieza", raw.id_limpieza).maybeSingle(),
      ]);
      if (!apt) { toast.error("Apartamento no encontrado"); return; }
      setLimpiezaPopover({
        loadKey: Date.now(),
        apt: {
          id_apt: apt.id_apt,
          nombre: apt.nombre ?? `Apt #${apt.id_apt}`,
          camas_fijas: (apt as { camas_fijas?: number | null }).camas_fijas ?? null,
          tiene_sofa_cama: (apt as { tiene_sofa_cama?: boolean | null }).tiene_sofa_cama ?? null,
        },
        fecha: r.fecha,
        existing: (full ?? { id_limpieza: raw.id_limpieza }) as unknown as Limpieza,
      });
      return;
    }
    setDetailRow(r);
  }

  function prevMonth() {
    const d = new Date(year, month0 - 1, 1);
    setYear(d.getFullYear()); setMonth0(d.getMonth());
  }
  function nextMonth() {
    const d = new Date(year, month0 + 1, 1);
    setYear(d.getFullYear()); setMonth0(d.getMonth());
  }

  const personaQ = useQuery({
    queryKey: ["reg-horari-persona", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select("id_persona, nombre, apellidos, tipo_contrato, horas_objetivo_mes")
        .eq("id_persona", idPersona)
        .maybeSingle();
      if (error) throw error;
      return data as { id_persona: number; nombre: string | null; apellidos: string | null; tipo_contrato: string | null; horas_objetivo_mes: number | null } | null;
    },
  });

  const limpiezasQ = useQuery({
    queryKey: ["reg-horari-det-limpiezas", idPersona, start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("id_limpieza, worker, iniciada_en, finalizada_en, estado, fecha_limpieza, tipo, id_apt, sfc_montar")
        .eq("worker", idPersona)
        .eq("estado", "finalizada")
        .gte("fecha_limpieza", start)
        .lte("fecha_limpieza", end);
      if (error) throw error;
      return (data ?? []) as Array<{
        id_limpieza: number; worker: number | null; iniciada_en: string | null;
        finalizada_en: string | null; fecha_limpieza: string; tipo: string | null; id_apt: number; sfc_montar: boolean | null;
      }>;
    },
  });

  const pendientesQ = useQuery({
    queryKey: ["reg-horari-det-pendientes", idPersona, start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas")
        .select("id_apt, tipo, sfc_montar")
        .eq("worker", idPersona)
        .in("estado", ["comunicada", "aceptada", "en_curso"])
        .gte("fecha_limpieza", start)
        .lte("fecha_limpieza", end);
      if (error) throw error;
      return (data ?? []) as Array<{ id_apt: number; tipo: string | null; sfc_montar: boolean | null }>;
    },
  });

  const limpiezasRegistreQ = useQuery({
    queryKey: ["reg-horari-det-limpiezas-registre", idPersona, start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("limpiezas_registre")
        .select(
          "id_registre, id_limpieza, id_persona, inici, fi, hores, limpiezas!limpiezas_registre_id_limpieza_fkey(id_apt, tipo, fecha_limpieza, sfc_montar)",
        )
        .eq("id_persona", idPersona)
        .not("fi", "is", null)
        .not("hores", "is", null)
        .gte("inici", `${start}T00:00:00`)
        .lte("inici", `${end}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id_registre: number; id_limpieza: number; id_persona: number;
        inici: string; fi: string | null; hores: number | null;
        limpiezas: { id_apt: number; tipo: string | null; fecha_limpieza: string; sfc_montar: boolean | null } | null;
      }>;
    },
  });

  const genericQ = useQuery({
    queryKey: ["reg-horari-det-generic", idPersona, start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registre_temps_generic")
        .select("id_registre, id_persona, id_tipus, id_apt, inici, fi, notes, tipos_tarea_generica(nombre)")
        .eq("id_persona", idPersona)
        .gte("inici", `${start}T00:00:00`)
        .lte("inici", `${end}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id_registre: number; id_persona: number; id_tipus: number; id_apt: number | null;
        inici: string | null; fi: string | null; notes: string | null;
        tipos_tarea_generica: { nombre: string } | null;
      }>;
    },
  });

  const mantenimentQ = useQuery({
    queryKey: ["reg-horari-det-manteniment", idPersona, start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manteniment_registre")
        .select(
          "id_registre, id_incidencia, id_persona, inici, fi, hores, notas, manteniment_incidencies(titol, tipus, id_apt, id_grup, id_tipo_espacio_comun)",
        )
        .eq("id_persona", idPersona)
        .not("fi", "is", null)
        .not("hores", "is", null)
        .gte("inici", `${start}T00:00:00`)
        .lte("inici", `${end}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id_registre: number; id_incidencia: number; id_persona: number;
        inici: string; fi: string | null; hores: number | null; notas: string | null;
        manteniment_incidencies: {
          titol: string; tipus: string | null;
          id_apt: number | null; id_grup: number | null; id_tipo_espacio_comun: number | null;
        } | null;
      }>;
    },
  });

  const mantAptsQ = useApartamentosLite();
  const mantEspaciosQ = useEspaciosLite();
  const mantGruposQ = useGruposLite();
  const mantAptById = useMemo(() => new Map((mantAptsQ.data ?? []).map((a) => [a.id_apt, a])), [mantAptsQ.data]);
  const mantEspacioById = useMemo(() => new Map((mantEspaciosQ.data ?? []).map((e) => [e.id_tipo, e])), [mantEspaciosQ.data]);
  const mantGrupoById = useMemo(() => new Map((mantGruposQ.data ?? []).map((g) => [g.id_grupo, g])), [mantGruposQ.data]);

  const ajustosQ = useQuery({
    queryKey: ["reg-horari-det-ajustos", idPersona, start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_ajustos_hores")
        .select("id_ajuste, id_persona, fecha, tipo, horas, notas, tipus_computa, id_apt, id_grupo, id_tipo_espacio_comun")
        .eq("id_persona", idPersona)
        .gte("fecha", start)
        .lte("fecha", end);
      if (error) {
        console.warn("ajustos query", error);
        return [];
      }
      return (data ?? []) as Array<{
        id_ajuste: number; id_persona: number; fecha: string; tipo: string | null;
        horas: number | null; notas: string | null;
        tipus_computa: "treballades" | "objectiu" | "ajust" | null;
        id_apt: number | null; id_grupo: number | null; id_tipo_espacio_comun: number | null;
      }>;
    },
  });

  const activePeriodQ = useQuery({
    queryKey: ["reg-horari-active-period", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_periodos_actividad")
        .select("id_periodo, horas_objetivo_mes, fecha_inicio, fecha_fin")
        .eq("id_persona", idPersona)
        .is("fecha_fin", null)
        .order("fecha_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("active period query", error);
        return null;
      }
      return data as { id_periodo: number; horas_objetivo_mes: number | null; fecha_inicio: string; fecha_fin: string | null } | null;
    },
  });

  const aptIds = useMemo(() => {
    const s = new Set<number>();
    for (const l of limpiezasQ.data ?? []) s.add(l.id_apt);
    for (const r of limpiezasRegistreQ.data ?? []) if (r.limpiezas?.id_apt != null) s.add(r.limpiezas.id_apt);
    for (const r of genericQ.data ?? []) if (r.id_apt != null) s.add(r.id_apt);
    for (const p of pendientesQ.data ?? []) s.add(p.id_apt);
    return Array.from(s);
  }, [limpiezasQ.data, limpiezasRegistreQ.data, genericQ.data, pendientesQ.data]);

  const aptsQ = useQuery({
    queryKey: ["reg-horari-det-apts", aptIds.join(",")],
    enabled: aptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartamentos")
        .select("id_apt, nombre, tiempo_estandar_std_sin_sfc, tiempo_estandar_std_con_sfc, tiempo_estandar_extra_cr")
        .in("id_apt", aptIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        id_apt: number; nombre: string | null;
        tiempo_estandar_std_sin_sfc: number | null;
        tiempo_estandar_std_con_sfc: number | null;
        tiempo_estandar_extra_cr: number | null;
      }>;
    },
  });

  const aptName = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of aptsQ.data ?? []) m.set(a.id_apt, a.nombre ?? `Apt #${a.id_apt}`);
    return m;
  }, [aptsQ.data]);

  const aptStdById = useMemo(() => {
    const m = new Map<number, { sin_sfc: number | null; con_sfc: number | null; extra_cr: number | null }>();
    for (const a of aptsQ.data ?? []) {
      m.set(a.id_apt, {
        sin_sfc: a.tiempo_estandar_std_sin_sfc,
        con_sfc: a.tiempo_estandar_std_con_sfc,
        extra_cr: a.tiempo_estandar_extra_cr,
      });
    }
    return m;
  }, [aptsQ.data]);

  const scheduledPendingHours = useMemo(() => {
    let total = 0;
    for (const p of pendientesQ.data ?? []) {
      const std = aptStdById.get(p.id_apt);
      if (!std) continue;
      const value = p.tipo === "intermedia"
        ? std.extra_cr
        : p.sfc_montar
          ? std.con_sfc
          : std.sin_sfc;
      if (value != null) total += value;
    }
    return total;
  }, [pendientesQ.data, aptStdById]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const limpiezasConSesiones = new Set((limpiezasRegistreQ.data ?? []).map((r) => r.id_limpieza));
    const stdFor = (idApt: number | undefined, isSalida: boolean, sfc: boolean | null | undefined) => {
      const std = idApt != null ? aptStdById.get(idApt) : undefined;
      if (!std) return null;
      const v = isSalida ? (sfc ? std.con_sfc : std.sin_sfc) : std.extra_cr;
      return v != null && v > 0 ? v : null;
    };
    // Por limpieza con sesiones: horas totales y sesión más temprana (por inici).
    const sesiones = new Map<number, { total: number; first: { id: number; inici: string } }>();
    for (const r of limpiezasRegistreQ.data ?? []) {
      const cur = sesiones.get(r.id_limpieza);
      if (!cur) sesiones.set(r.id_limpieza, { total: Number(r.hores ?? 0), first: { id: r.id_registre, inici: r.inici } });
      else {
        cur.total += Number(r.hores ?? 0);
        if (r.inici < cur.first.inici) cur.first = { id: r.id_registre, inici: r.inici };
      }
    }
    for (const l of limpiezasQ.data ?? []) {
      if (limpiezasConSesiones.has(l.id_limpieza)) continue;
      const isSalida = l.tipo === "salida";
      const kind: RowKind = isSalida ? "checkout" : "extra_cr";
      const hLegacy = diffHours(l.iniciada_en, l.finalizada_en);
      const stdLegacy = stdFor(l.id_apt, isSalida, l.sfc_montar);
      out.push({
        key: `limp-${l.id_limpieza}`,
        kind,
        fecha: l.fecha_limpieza,
        inici: l.iniciada_en,
        fi: l.finalizada_en,
        propietat: aptName.get(l.id_apt) ?? `Apt #${l.id_apt}`,
        tipus: isSalida ? "Limpieza STD" : "Extra-CR",
        hores: hLegacy,
        std: stdLegacy != null ? { standard: stdLegacy, total: hLegacy } : undefined,
        raw: l as unknown as Record<string, unknown>,
      });
    }
    for (const r of limpiezasRegistreQ.data ?? []) {
      const lim = r.limpiezas;
      const isSalida = lim?.tipo === "salida";
      const kind: RowKind = isSalida ? "checkout" : "extra_cr";
      const ses = sesiones.get(r.id_limpieza);
      const stdReg = stdFor(lim?.id_apt, isSalida, lim?.sfc_montar);
      let stdInfo: Row["std"];
      if (stdReg != null && ses) {
        stdInfo = ses.first.id === r.id_registre ? { standard: stdReg, total: ses.total } : "otra-sesion";
      }
      out.push({
        key: `limpreg-${r.id_registre}`,
        kind,
        fecha: lim?.fecha_limpieza ?? dateOnly(r.inici),
        inici: r.inici,
        fi: r.fi,
        propietat: lim?.id_apt != null ? (aptName.get(lim.id_apt) ?? `Apt #${lim.id_apt}`) : "—",
        tipus: isSalida ? "Limpieza STD" : "Extra-CR",
        hores: Number(r.hores ?? 0),
        std: stdInfo,
        raw: r as unknown as Record<string, unknown>,
      });
    }
    for (const r of genericQ.data ?? []) {
      out.push({
        key: `gen-${r.id_registre}`,
        kind: "generica",
        fecha: dateOnly(r.inici),
        inici: r.inici,
        fi: r.fi,
        propietat: r.id_apt != null ? (aptName.get(r.id_apt) ?? `Apt #${r.id_apt}`) : "—",
        tipus: r.tipos_tarea_generica?.nombre ?? "Tarea genérica",
        hores: diffHours(r.inici, r.fi),
        raw: r as unknown as Record<string, unknown>,
      });
    }
    for (const m of mantenimentQ.data ?? []) {
      const inc = m.manteniment_incidencies;
      const propietat = inc
        ? resolveLocation(
            { id_apt: inc.id_apt, id_tipo_espacio_comun: inc.id_tipo_espacio_comun, id_grup: inc.id_grup },
            mantAptById,
            mantEspacioById,
            mantGrupoById,
          )
        : "—";
      const tipoLabel = inc?.tipus ? TIPO_STYLE[inc.tipus as IncidenciaTipo]?.label : undefined;
      out.push({
        key: `mant-${m.id_registre}`,
        kind: "manteniment",
        fecha: dateOnly(m.inici),
        inici: m.inici,
        fi: m.fi,
        propietat,
        tipus: tipoLabel ?? "Mantenimiento",
        hores: Number(m.hores ?? 0),
        raw: m as unknown as Record<string, unknown>,
      });
    }
    for (const a of ajustosQ.data ?? []) {
      const hasLocation = a.id_apt != null || a.id_tipo_espacio_comun != null || a.id_grupo != null;
      const propietat = hasLocation
        ? resolveLocation(
            { id_apt: a.id_apt, id_tipo_espacio_comun: a.id_tipo_espacio_comun, id_grup: a.id_grupo },
            mantAptById,
            mantEspacioById,
            mantGrupoById,
          )
        : "—";
      out.push({
        key: `aj-${a.id_ajuste}`,
        kind: "ajust",
        fecha: a.fecha,
        inici: null,
        fi: null,
        propietat,
        tipus: a.tipo ?? "Ajuste manual",
        hores: Number(a.horas ?? 0),
        tipus_computa: a.tipus_computa ?? "ajust",
        raw: a as unknown as Record<string, unknown>,
      });
    }
    return out;
  }, [limpiezasQ.data, limpiezasRegistreQ.data, genericQ.data, mantenimentQ.data, ajustosQ.data, aptName, aptStdById, mantAptById, mantEspacioById, mantGrupoById]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (typeFilter !== "all") list = list.filter((r) => r.kind === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.propietat.toLowerCase().includes(q) || r.tipus.toLowerCase().includes(q));
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "fecha") { va = a.fecha; vb = b.fecha; }
      else if (sortKey === "propietat") { va = a.propietat; vb = b.propietat; }
      else if (sortKey === "tipus") { va = a.tipus; vb = b.tipus; }
      else if (sortKey === "hores") { va = a.hores; vb = b.hores; }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      if (sortKey === "fecha") {
        // Los ajustes van al final cronológico del día.
        const ia = a.kind === "ajust" ? "\uffff" : (a.inici ?? "");
        const ib = b.kind === "ajust" ? "\uffff" : (b.inici ?? "");
        if (ia < ib) return -1 * dir;
        if (ia > ib) return 1 * dir;
      }
      return 0;
    });
    return sorted;
  }, [rows, typeFilter, search, sortKey, sortDir]);

  const grouped = sortKey === "fecha";

  // Total neto por día sobre todas las filas (sin filtros).
  const dayTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const h = r.kind === "ajust" && r.tipus_computa === "objectiu" ? 0 : r.hores;
      m.set(r.fecha, (m.get(r.fecha) ?? 0) + h);
    }
    return m;
  }, [rows]);

  // Same query TancamentsTab runs (identical queryKey, so react-query dedupes the
  // network request) — needed here too so prevAcumulat can be folded into
  // effectiveObjective below, before totals is computed.
  const historyForPrevAcumulatQ = useQuery({
    queryKey: ["resum-mes-history", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_resum_mes" as never)
        .select("*")
        .eq("id_persona", idPersona)
        .order("anio", { ascending: false })
        .order("mes", { ascending: false });
      if (error) { console.warn(error); return []; }
      return (data ?? []) as ResumRow[];
    },
  });

  // Previous month's accumulated balance, for the currently selected
  // year/month0 — same logic as TancamentsTab's own prevAcumulat.
  const prevAcumulat = useMemo(() => {
    const prevIdx = (() => {
      const d = new Date(year, month0 - 1, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    })();
    const rowsHist = historyForPrevAcumulatQ.data ?? [];
    const row = rowsHist.find((r) => r.anio === prevIdx.y && r.mes === prevIdx.m && r.cerrado);
    return row?.saldo_acumulat_fi ?? 0;
  }, [historyForPrevAcumulatQ.data, year, month0]);

  const totals = useMemo(() => {
    let workedRaw = 0, otherAdjustments = 0, reductions = 0;
    let reductionTipo: string | null = null;
    const limpiezasConSesiones = new Set((limpiezasRegistreQ.data ?? []).map((r) => r.id_limpieza));
    for (const l of limpiezasQ.data ?? []) {
      if (limpiezasConSesiones.has(l.id_limpieza)) continue;
      workedRaw += diffHours(l.iniciada_en, l.finalizada_en);
    }
    for (const r of limpiezasRegistreQ.data ?? []) workedRaw += Number(r.hores ?? 0);
    for (const r of genericQ.data ?? []) workedRaw += diffHours(r.inici, r.fi);
    for (const m of mantenimentQ.data ?? []) workedRaw += Number(m.hores ?? 0);
    for (const a of ajustosQ.data ?? []) {
      const h = Number(a.horas ?? 0);
      const tc = a.tipus_computa ?? "ajust";
      if (tc === "treballades") {
        workedRaw += h;
      } else if (tc === "objectiu") {
        reductions += Math.abs(h);
        if (!reductionTipo) reductionTipo = a.tipo;
      } else {
        otherAdjustments += h;
      }
    }
    // "Horas trabajadas" folds in manual balance corrections (otherAdjustments)
    // so it matches mi-dia.tsx's "Horas efectivas" figure for the same worker/month.
    const workedTotal = workedRaw + otherAdjustments;
    const objective = activePeriodQ.data?.horas_objetivo_mes ?? personaQ.data?.horas_objetivo_mes ?? null;
    const isAutonom = personaQ.data?.tipo_contrato === "autonomo";
    const baseObjective = objective != null ? Number(objective) : null;
    const effectiveObjective = baseObjective != null ? Math.max(0, baseObjective - reductions - Number(prevAcumulat)) : null;
    // otherAdjustments is already folded into workedTotal above — don't add it again here.
    const saldo = !isAutonom && effectiveObjective != null ? workedTotal - effectiveObjective : 0;
    return { worked: workedTotal, adjustments: otherAdjustments, reductions, reductionTipo, objective: baseObjective, effectiveObjective, isAutonom, saldo };
  }, [limpiezasQ.data, limpiezasRegistreQ.data, genericQ.data, mantenimentQ.data, ajustosQ.data, personaQ.data, activePeriodQ.data, prevAcumulat]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "fecha" ? "desc" : "asc"); }
  }

  const deleteAjust = useMutation({
    mutationFn: async (ajustId: number) => {
      const { error } = await supabase.from("personal_ajustos_hores").delete().eq("id_ajuste", ajustId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ajuste eliminado");
      qc.invalidateQueries({ queryKey: ["reg-horari-det-ajustos", idPersona] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const fullName = personaQ.data
    ? [personaQ.data.nombre, personaQ.data.apellidos].filter(Boolean).join(" ").trim() || `#${idPersona}`
    : `#${idPersona}`;

  const CONTRACT_LABELS: Record<string, string> = {
    fijo: "Fijo",
    fijo_discontinuo: "Fijo discontinuo",
    discontinuo: "Fijo discontinuo",
    autonomo: "Autónomo",
    temporal: "Temporal",
    practicas: "Prácticas",
    otro: "Otro",
  };
  const contractLabel = CONTRACT_LABELS[personaQ.data?.tipo_contrato ?? ""] ?? "";

  return (
    <AppShell title="Registro horario">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Link to="/registre-horari" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <div className="flex-1" />
          {activeTab !== "vacances" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Mes anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium capitalize min-w-[140px] text-center">
                {MONTH_ES[month0]} {year}
              </div>
              <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Mes siguiente">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-semibold">{fullName}</h1>
          {contractLabel && <Badge variant="secondary">{contractLabel}</Badge>}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "mes" | "tancaments" | "vacances")} className="mb-4">
          <TabsList>
            <TabsTrigger value="mes">Mes en curso</TabsTrigger>
            <TabsTrigger value="tancaments">Cierres</TabsTrigger>
            <TabsTrigger value="vacances">Vacaciones</TabsTrigger>
          </TabsList>

        <TabsContent value="mes" className="mt-4">
        <HoresProgress
          worked={totals.worked}
          adjustments={totals.adjustments}
          reductions={totals.reductions}
          reductionTipo={totals.reductionTipo}
          prevAcumulat={Number(prevAcumulat)}
          baseObjective={totals.objective}
          effectiveObjective={totals.effectiveObjective}
          saldo={totals.saldo}
          isAutonom={totals.isAutonom}
          scheduledPending={scheduledPendingHours}
        />

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="checkout">Check-out</SelectItem>
              <SelectItem value="extra_cr">Extra-CR</SelectItem>
              <SelectItem value="generica">Tarea genérica</SelectItem>
              <SelectItem value="manteniment">Mantenimiento</SelectItem>
              <SelectItem value="ajust">Ajuste manual</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por propiedad o tipo…"
              className="pl-8"
            />
          </div>
          <div className="flex-1" />
          <Button onClick={() => setAjustOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Ajuste manual
          </Button>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {grouped && (
                    <th className="text-right p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Total día</th>
                  )}
                  <th className="text-left p-3">
                    <SortHeader label="Fecha" active={sortKey === "fecha"} dir={sortDir} onClick={() => toggleSort("fecha")} />
                  </th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inicio</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fin</th>
                  <th className="text-left p-3">
                    <SortHeader label="Propiedad" active={sortKey === "propietat"} dir={sortDir} onClick={() => toggleSort("propietat")} />
                  </th>
                  <th className="text-left p-3">
                    <SortHeader label="Tipo / Actividad" active={sortKey === "tipus"} dir={sortDir} onClick={() => toggleSort("tipus")} />
                  </th>
                  <th className="text-right p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estándar</th>
                  <th className="text-right p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desviación</th>
                  <th className="text-right p-3">
                    <SortHeader label="Tiempo" active={sortKey === "hores"} dir={sortDir} onClick={() => toggleSort("hores")} />
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={grouped ? 10 : 9} className="text-center text-muted-foreground py-10">Sin registros este mes.</td></tr>
                ) : (
                  filteredRows.map((r, idx) => {
                    const firstOfDay = grouped && (idx === 0 || filteredRows[idx - 1].fecha !== r.fecha);
                    const dayTotal = firstOfDay ? (dayTotals.get(r.fecha) ?? 0) : 0;
                    const sepClass = firstOfDay && idx > 0 ? " border-t-2 border-t-muted-foreground/40" : "";
                    return (
                    <Popover key={r.key}>
                      <PopoverTrigger asChild>
                         <tr className={`border-b hover:bg-muted/40 cursor-pointer${sepClass}`} onClick={() => openRow(r)}>
                          {grouped && (
                            <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap bg-muted/30 border-r">
                              {firstOfDay ? `${dayTotal < 0 ? "−" : ""}${fmtHours(Math.abs(dayTotal))}` : ""}
                            </td>
                          )}
                          <td className="py-1.5 px-3">
                            {(!grouped || firstOfDay) ? `${DOW_SHORT[new Date(r.fecha + "T00:00:00").getDay()]} ${r.fecha.slice(8, 10)}` : ""}
                          </td>
                          <td className="py-1.5 px-3 tabular-nums whitespace-nowrap">{r.kind === "ajust" ? "—" : fmtHM(r.inici)}</td>
                          <td className="py-1.5 px-3 tabular-nums whitespace-nowrap">{r.kind === "ajust" ? "—" : fmtHM(r.fi)}</td>
                          <td className="py-1.5 px-3">{r.propietat}</td>
                          <td className="py-1.5 px-3">
                            <RowTypeBadge kind={r.kind} label={r.tipus} />
                          </td>
                          <EstandarCells std={r.std} />
                          <td className={`py-1.5 px-3 text-right tabular-nums whitespace-nowrap ${ajustCellClass(r)}`}>
                            {ajustCellText(r)}
                          </td>
                          <td className="py-1.5 px-3">
                            {r.kind === "ajust" && (
                              <button
                                className="text-muted-foreground hover:text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("¿Eliminar este ajuste?")) {
                                    deleteAjust.mutate((r.raw as { id_ajuste: number }).id_ajuste);
                                  }
                                }}
                                aria-label="Eliminar ajuste"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      </PopoverTrigger>
                    </Popover>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DetailPopoverDialog row={detailRow} onClose={() => setDetailRow(null)} />

        {limpiezaPopover && (
          <LimpiezaPopover
            key={`${limpiezaPopover.apt.id_apt}|${limpiezaPopover.fecha}|${limpiezaPopover.existing?.id_limpieza ?? 0}|${limpiezaPopover.loadKey}`}
            open={!!limpiezaPopover}
            loadKey={limpiezaPopover.loadKey}
            onOpenChange={(o) => !o && setLimpiezaPopover(null)}
            apt={limpiezaPopover.apt}
            fecha={limpiezaPopover.fecha}
            existing={limpiezaPopover.existing}
            readOnly={!canEditLimpiezas}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["reg-horari-det-limpiezas", idPersona] });
            }}
          />
        )}

        <MantenimientoPopover
          idIncidencia={mantDetailId}
          onOpenChange={(o) => {
            if (!o) setMantDetailId(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["reg-horari-det-manteniment", idPersona] });
          }}
          workers={mantWorkersQ.data ?? []}
          selfAssignId={idPersona}
        />

        <AjustModal
          open={ajustOpen}
          onClose={() => setAjustOpen(false)}
          idPersona={idPersona}
          defaultDate={`${start.slice(0, 8)}${pad(Math.min(today.getDate(), 28))}`}
          tipoContrato={personaQ.data?.tipo_contrato ?? null}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["reg-horari-det-ajustos", idPersona] });
            setAjustOpen(false);
          }}
          grupos={mantGruposQ.data ?? []}
          apartamentos={mantAptsQ.data ?? []}
          espaciosComunes={mantEspaciosQ.data ?? []}
        />
        </TabsContent>

        <TabsContent value="tancaments" className="mt-4">
          <TancamentsTab
            idPersona={idPersona}
            year={year}
            month0={month0}
            totals={totals}
            currentPersonaId={currentPersona?.id_persona ?? null}
          />
        </TabsContent>

        <TabsContent value="vacances" className="mt-4">
          <VacancesTab
            idPersona={idPersona}
            tipoContrato={personaQ.data?.tipo_contrato ?? null}
            currentPersonaId={currentPersona?.id_persona ?? null}
          />
        </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function SummaryCard({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueClassName}`}>{value}</div>
    </div>
  );
}

function RowTypeBadge({ kind, label }: { kind: RowKind; label: string }) {
  const cls =
    kind === "checkout" ? "bg-blue-100 text-blue-800" :
    kind === "extra_cr" ? "bg-purple-100 text-purple-800" :
    kind === "generica" ? "bg-amber-100 text-amber-800" :
    kind === "manteniment" ? "bg-rose-100 text-rose-800" :
    "bg-emerald-100 text-emerald-800";
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function DetailPopoverDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Detalle de actividad</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-2 text-sm">
            <Field label="Fecha" value={fmtDate(row.fecha)} />
            <Field label="Tipo" value={row.tipus} />
            <Field label="Propiedad" value={row.propietat} />
            {row.kind !== "ajust" && (
              <>
                <Field label="Inicio" value={fmtHM(row.inici)} />
                <Field label="Fin" value={fmtHM(row.fi)} />
              </>
            )}
            <Field
              label="Horas"
              value={row.kind === "ajust" ? fmtAjustSigned(row.hores).text : fmtHours(row.hores)}
              valueClassName={row.kind === "ajust" ? fmtAjustSigned(row.hores).className : ""}
            />
            {row.kind === "ajust" ? (
              <Field
                label="Notas"
                value={
                  typeof (row.raw as { notas?: unknown }).notas === "string" && (row.raw as { notas: string }).notas.trim()
                    ? (row.raw as { notas: string }).notas.trim()
                    : "—"
                }
              />
            ) : (
              <>
                {(row.raw as { notes?: string | null; notas?: string | null }).notes && (
                  <Field label="Notas" value={String((row.raw as { notes: string }).notes)} />
                )}
                {(row.raw as { notas?: string | null }).notas && (
                  <Field label="Notas" value={String((row.raw as { notas: string }).notas)} />
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function HoresProgress({
  worked, adjustments, reductions, reductionTipo, prevAcumulat,
  baseObjective, effectiveObjective, saldo, isAutonom, scheduledPending,
}: {
  worked: number; adjustments: number; reductions: number; reductionTipo: string | null; prevAcumulat: number;
  baseObjective: number | null; effectiveObjective: number | null; saldo: number; isAutonom: boolean;
  scheduledPending: number;
}) {
  const BASE_PCT = 80;
  const hasObjective = baseObjective != null && baseObjective > 0 && effectiveObjective != null;
  // `worked` already folds in `adjustments` (see DetallPage's totals memo) —
  // don't add it again here or the bar width/color would double-count it.
  const total = worked;

  // Positions relative to bar container width (%). Base objective sits at 80%.
  const effPct = hasObjective ? (effectiveObjective! / baseObjective!) * BASE_PCT : 0;
  const workedPct = hasObjective ? Math.min(100, (total / baseObjective!) * BASE_PCT) : 0;
  const scheduledPendingPct = hasObjective
    ? Math.min(100 - workedPct, (scheduledPending / baseObjective!) * BASE_PCT)
    : 0;
  // Same excess-segment math as ClosureProgressBar. Depends only on
  // effectiveObjective/baseObjective, not on workedPct (which folds in
  // `adjustments` here) — so workedPct's different formula has no bearing on this.
  const excessPct = hasObjective && effectiveObjective! > baseObjective!
    ? ((effectiveObjective! - baseObjective!) / baseObjective!) * BASE_PCT
    : 0;

  // Progress bar color
  let workedColor = "#1D9E75";
  if (isAutonom) {
    workedColor = "#378ADD";
  } else if (hasObjective) {
    if (total >= effectiveObjective!) workedColor = "#1D9E75";
    else {
      const deficit = (effectiveObjective! - total) / effectiveObjective!;
      workedColor = deficit >= 0.15 ? "#E24B4A" : "#EF9F27";
    }
  }

  // Saldo pill color
  let saldoBg = "#E1F5EE", saldoFg = "#085041", saldoText: string;
  if (isAutonom) {
    saldoBg = "#EBF4FD"; saldoFg = "#0C447C"; saldoText = fmtHours(worked);
  } else if (!hasObjective) {
    saldoBg = "#F1F1EE"; saldoFg = "#6B7280"; saldoText = "—";
  } else {
    if (saldo >= 0) {
      saldoBg = "#E1F5EE"; saldoFg = "#085041";
    } else {
      const deficitPct = effectiveObjective! > 0 ? Math.abs(saldo) / effectiveObjective! : 0;
      if (deficitPct >= 0.15) { saldoBg = "#FDEAEA"; saldoFg = "#A32D2D"; }
      else { saldoBg = "#FEF3E2"; saldoFg = "#B35C00"; }
    }
    saldoText = `${saldo >= 0 ? "+" : "−"}${fmtHours(Math.abs(saldo))}`;
  }

  const reductionLabel = reductionTipo === "vacaciones" ? "VACAC." : reductionTipo === "baja" ? "baja" : reductionTipo ?? "";
  const adjClauses: string[] = [];
  if (reductions > 0) adjClauses.push(`−${fmtHours(reductions)} ${reductionLabel}`);
  if (prevAcumulat !== 0) adjClauses.push(`${prevAcumulat > 0 ? "−" : "+"}${fmtHours(Math.abs(prevAcumulat))} S.ANT.`);
  const infoText = !hasObjective
    ? (isAutonom ? "Autónomo" : "Sin objetivo")
    : adjClauses.length > 0
      ? `Obj. ${fmtHours(baseObjective!)} · ${adjClauses.join(" · ")} → ${fmtHours(effectiveObjective!)} efectivo`
      : `Obj. ${fmtHours(baseObjective!)}`;

  return (
    <div className="mb-6 flex items-end gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-1">{infoText}</div>
        <div className="relative w-full" style={{ overflow: "visible" }}>
          {/* Bar 1 - objective breakdown */}
          <div className="relative w-full" style={{ height: 10 }}>
            <div className="absolute inset-y-0 left-0" style={{ width: `${effPct}%`, background: "#D3D1C7" }} />
            {hasObjective && (reductions > 0 || prevAcumulat > 0) && (
              <div
                className="absolute inset-y-0 flex items-center justify-center text-[10px] font-medium"
                style={{
                  left: `${effPct}%`,
                  width: `${Math.max(0, BASE_PCT - effPct)}%`,
                  background: "#FAEEDA",
                  borderLeft: "2px solid #EF9F27",
                  color: "#B35C00",
                }}
              >
                −{fmtHours(reductions + (prevAcumulat > 0 ? prevAcumulat : 0))}
              </div>
            )}
            {hasObjective && excessPct > 0 && (
              <div
                className="absolute inset-y-0 flex items-center justify-center text-[10px] font-medium"
                style={{
                  left: `${BASE_PCT}%`,
                  width: `${excessPct}%`,
                  background: "#FBDEDD",
                  borderLeft: "2px solid #E24B4A",
                  color: "#A32D2D",
                }}
              >
                {excessPct > 4 ? `+${fmtHours(effectiveObjective! - baseObjective!)}` : ""}
              </div>
            )}
          </div>
          {/* Bar 2 - progress */}
          <div className="relative w-full" style={{ height: 20 }}>
            <div
              className="absolute inset-y-0 left-0 flex items-center justify-end pr-2 text-xs font-semibold text-white"
              style={{ width: `${workedPct}%`, background: workedColor }}
            >
              {workedPct > 8 ? fmtHours(worked) : ""}
            </div>
            {scheduledPending > 0 && (
              <div
                className="absolute inset-y-0 flex items-center justify-end pr-2 text-xs font-semibold"
                style={{
                  left: `${workedPct}%`,
                  width: `${scheduledPendingPct}%`,
                  background: hexToRgba(workedColor, 0.35),
                  color: "#1F2937",
                }}
              >
                {scheduledPendingPct > 8 ? `+${fmtHours(scheduledPending)}` : ""}
              </div>
            )}
          </div>
          {/* Vertical marker at effectiveObjective */}
          {hasObjective && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${effPct}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: "#26215C",
                transform: "translateX(-1px)",
              }}
            />
          )}
          {hasObjective && (
            <div
              className="absolute"
              style={{
                left: `${effPct}%`,
                top: -28,
                transform: "translateX(-50%)",
                fontSize: 13,
                color: "#26215C",
                fontWeight: 700,
                whiteSpace: "nowrap",
                background: "#fff",
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid #26215C",
              }}
            >
              {fmtHours(effectiveObjective!)}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center shrink-0">
        <div
          className="rounded-full px-3 py-1 tabular-nums"
          style={{ background: saldoBg, color: saldoFg, fontSize: 16, fontWeight: 700 }}
        >
          {saldoText}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">saldo del mes</div>
      </div>
    </div>
  );
}

function Field({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-right ${valueClassName}`}>{value}</span>
    </div>
  );
}

const RANGE_TIPOS = new Set(["vacaciones", "baja", "festivo"]);

function eachDateISO(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const cur = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  while (cur.getTime() <= end.getTime()) {
    out.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function AjustModal({
  open, onClose, idPersona, defaultDate, tipoContrato, onSaved,
  grupos, apartamentos, espaciosComunes,
}: {
  open: boolean; onClose: () => void; idPersona: number; defaultDate: string;
  tipoContrato: string | null; onSaved: () => void;
  grupos: { id_grupo: number; nombre: string }[];
  apartamentos: { id_apt: number; nombre: string; id_grupo: number | null }[];
  espaciosComunes: { id_tipo: number; nombre: string }[];
}) {
  const [fecha, setFecha] = useState(defaultDate);
  const [fechaFin, setFechaFin] = useState(defaultDate);
  const [tipusComputa, setTipusComputa] = useState<"treballades" | "objectiu" | "ajust">("ajust");
  const [tipusComputaTouched, setTipusComputaTouched] = useState(false);
  const [tipo, setTipo] = useState("otro");
  const [horas, setHoras] = useState<string>("");
  const [horasValid, setHorasValid] = useState(true);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [horasAutoSet, setHorasAutoSet] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const [propOpen, setPropOpen] = useState(false);
  const [idGrupo, setIdGrupo] = useState<number | null>(null);
  const [idApt, setIdApt] = useState<number | null>(null);
  const [idEspacioComun, setIdEspacioComun] = useState<number | null>(null);
  const lastAutoValueRef = useRef<string>("");
  const prevOpenRef = useRef(false);

  const isRangeTipo = RANGE_TIPOS.has(tipo);
  const showPropiedad = tipo === "otro" && (tipusComputa === "ajust" || tipusComputa === "treballades");

  const filteredApts = useMemo(() => {
    const list = idGrupo == null
      ? apartamentos
      : apartamentos.filter((a) => a.id_grupo === idGrupo);
    return [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, "ca", { sensitivity: "base" }));
  }, [apartamentos, idGrupo]);

  // When the visibility rule stops being met (tipo/tipusComputa changed away
  // from a qualifying combination), clear any selection so a stale
  // apt/grupo/espacio can't get silently submitted for a type that shouldn't
  // carry one.
  useEffect(() => {
    if (!showPropiedad) {
      setIdGrupo(null);
      setIdApt(null);
      setIdEspacioComun(null);
    }
  }, [showPropiedad]);

  const periodsQ = useQuery({
    queryKey: ["ajuste-modal-periods", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_periodos_actividad")
        .select("id_periodo, fecha_inicio, fecha_fin, horas_objetivo_mes")
        .eq("id_persona", idPersona)
        .order("fecha_inicio", { ascending: true });
      if (error) { console.warn(error); return []; }
      return (data ?? []) as PeriodRow[];
    },
    enabled: !!idPersona,
  });

  function horasObjetivoMesForDate(dateISO: string): number {
    const periods = periodsQ.data ?? [];
    if (periods.length === 0) return 0;
    const exact = periods.find(
      (p) => p.fecha_inicio <= dateISO && (p.fecha_fin == null || dateISO <= p.fecha_fin),
    );
    if (exact) return Number(exact.horas_objetivo_mes ?? 0);
    // No period covers this exact date (e.g. a gap in the contract history) —
    // fall back to the closest period that had already started by this date.
    const started = periods.filter((p) => p.fecha_inicio <= dateISO);
    const fallback = started.length > 0 ? started[started.length - 1] : periods[0];
    return Number(fallback?.horas_objetivo_mes ?? 0);
  }

  // Master reset: whenever the dialog transitions from closed to open, wipe all
  // local state back to fresh defaults. AjustModal is always mounted (visibility
  // is delegated to the Dialog's `open` prop), so without this every field would
  // keep leaking stale values across reopens and across switching to a different
  // worker (idPersona changes via route param without remounting this component).
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setFecha(defaultDate);
      setFechaFin(defaultDate);
      setTipusComputa("ajust");
      setTipusComputaTouched(false);
      setTipo("otro");
      setHoras("");
      setHorasValid(true);
      setNotas("");
      setSaving(false);
      setHorasAutoSet(true);
      setResetToken((n) => n + 1);
      setPropOpen(false);
      setIdGrupo(null);
      setIdApt(null);
      setIdEspacioComun(null);
      lastAutoValueRef.current = "";
      // periodsQ never remounts (AjustModal stays mounted for the page's whole
      // lifetime), so a dialog reopen is not a react-query "mount" event and
      // won't auto-refetch on its own — force it here in case the worker's
      // contract periods changed elsewhere since the last fetch.
      periodsQ.refetch();
    }
    prevOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate]);

  // Re-enable auto-calc whenever the user selects "vacaciones" from the Tipo
  // dropdown (tipo now defaults to "otro", so this no longer fires on mount).
  useEffect(() => {
    if (tipo === "vacaciones") setHorasAutoSet(true);
  }, [tipo]);

  // "Cómo computa" sigue al Tipo mientras el usuario no lo haya tocado a mano.
  useEffect(() => {
    if (tipusComputaTouched) return;
    setTipusComputa(tipo === "vacaciones" || tipo === "baja" ? "objectiu" : "ajust");
  }, [tipo, tipusComputaTouched]);

  useEffect(() => {
    if (tipo !== "vacaciones" || !horasAutoSet) return;
    const perDia = horasObjetivoMesForDate(fecha) / DIAS_PROMEDIO_MES;
    const rounded = String(Math.round(perDia * 100) / 100);
    lastAutoValueRef.current = rounded;
    setHoras(rounded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, fecha, horasAutoSet, periodsQ.data, tipoContrato, resetToken]);

  function handleHorasChange(v: string) {
    setHoras(v);
    if (v !== lastAutoValueRef.current) setHorasAutoSet(false);
  }

  async function save() {
    const h = Number(horas);

    if (isRangeTipo) {
      if (!fecha || !fechaFin || !isFinite(h) || h === 0) {
        toast.error("La fecha y las horas son obligatorias");
        return;
      }
      if (fechaFin < fecha) {
        toast.error("La fecha de fin debe ser igual o posterior a la fecha de inicio");
        return;
      }
      const dates = eachDateISO(fecha, fechaFin);
      if (tipo === "vacaciones") {
        const { data: dup, error: dupErr } = await supabase
          .from("personal_ajustos_hores")
          .select("fecha")
          .eq("id_persona", idPersona)
          .eq("tipo", "vacaciones")
          .in("fecha", dates);
        if (dupErr) { toast.error(`No se pudo comprobar las vacaciones existentes: ${dupErr.message}`); return; }
        const dupDates = [...new Set((dup ?? []).map((r) => r.fecha as string))].sort();
        if (dupDates.length > 0) {
          const fmt = (d: string) => d.split("-").reverse().join("/");
          const shown = dupDates.slice(0, 5).map(fmt).join(", ");
          const more = dupDates.length > 5 ? ` y ${dupDates.length - 5} más` : "";
          toast.error(`Ya hay vacaciones registradas el ${shown}${more}`);
          return;
        }
        const { data: yr } = await supabase
          .from("personal_vacances_any" as never)
          .select("data_inici_any, data_fi_any, dies_assignats")
          .eq("id_persona", idPersona)
          .lte("data_inici_any", fecha)
          .gte("data_fi_any", fecha)
          .maybeSingle();
        const year = yr as { data_inici_any: string; data_fi_any: string; dies_assignats: number } | null;
        if (year) {
          const { data: used } = await supabase
            .from("personal_ajustos_hores")
            .select("fecha")
            .eq("id_persona", idPersona)
            .eq("tipo", "vacaciones")
            .gte("fecha", year.data_inici_any)
            .lte("fecha", year.data_fi_any);
          const usedN = new Set((used ?? []).map((r) => r.fecha as string)).size;
          const newN = dates.filter((d) => d >= year.data_inici_any && d <= year.data_fi_any).length;
          const limite = desgloseVacances(
            periodsQ.data ?? [], year.data_inici_any, year.data_fi_any, Number(year.dies_assignats), dates[dates.length - 1],
          ).meritats;
          if (usedN + newN > limite) {
            if (!window.confirm(`Con estas vacaciones se superan los ${limite} días devengados. ¿Continuar?`)) return;
          }
        }
      }
      if (dates.length > 1) {
        const ok = window.confirm(
          `Se crearán ${dates.length} ajustes, uno por cada día del ${fmtDateLong(fecha)} al ${fmtDateLong(fechaFin)}.`,
        );
        if (!ok) return;
      }
      setSaving(true);
      const rows = dates.map((d) => ({
        id_persona: idPersona,
        fecha: d,
        tipo,
        horas: h,
        notas: notas.trim() || null,
        tipus_computa: tipusComputa,
        id_grupo: idGrupo,
        id_apt: idApt,
        id_tipo_espacio_comun: idEspacioComun,
      }));
      const { error } = await supabase.from("personal_ajustos_hores").insert(rows as never);
      setSaving(false);
      if (error) {
        toast.error(`No se pudo crear ningún ajuste (0 de ${dates.length}): ${error.message}`);
        return;
      }
      toast.success(dates.length === 1 ? "Ajuste creado" : `${dates.length} ajustes creados`);
      setHoras(""); setNotas("");
      onSaved();
      return;
    }

    if (!fecha || !isFinite(h) || h === 0) {
      toast.error("La fecha y las horas son obligatorias");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("personal_ajustos_hores").insert({
      id_persona: idPersona, fecha, tipo, horas: h, notas: notas.trim() || null,
      tipus_computa: tipusComputa,
      id_grupo: idGrupo, id_apt: idApt, id_tipo_espacio_comun: idEspacioComun,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Ajuste creado");
    setHoras(""); setNotas("");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nuevo ajuste manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {isRangeTipo ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Fecha inicio</label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Fecha fin</label>
                <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              </div>
            </div>
          ) : (
          <div>
            <label className="text-sm font-medium">Fecha</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          )}
          <div>
            <label className="text-sm font-medium">Cómo computa</label>
            <Select value={tipusComputa} onValueChange={(v) => { setTipusComputaTouched(true); setTipusComputa(v as "treballades" | "objectiu" | "ajust"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="treballades">Horas trabajadas no registradas</SelectItem>
                <SelectItem value="objectiu">Reducción de objetivo (vacaciones/baja)</SelectItem>
                <SelectItem value="ajust">Ajuste de saldo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Tipo</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vacaciones">Vacaciones</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
                <SelectItem value="festivo">Festivo</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {showPropiedad && (
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
                    <label className="text-xs font-medium">Grupo</label>
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
                    <label className="text-xs font-medium">Ubicación</label>
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
          )}
          <div>
            <label className="text-sm font-medium">Horas</label>
            <HHMMInput value={horas} onChange={handleHorasChange} onValidityChange={setHorasValid} placeholder="ej. 8:00" />
            {tipo === "vacaciones" && horasAutoSet && (
              <p className="text-xs text-muted-foreground mt-1">
                Calculado automáticamente según el contrato — puedes ajustarlo
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Notas</label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !horasValid}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// TANCAMENTS TAB
// ============================================================

type ResumRow = {
  id_resumen: number;
  id_persona: number;
  anio: number;
  mes: number;
  hores_objectiu_base: number;
  hores_reduccio: number;
  hores_objectiu_ef: number;
  hores_treballades: number;
  hores_ajust_saldo: number;
  saldo_mes: number;
  saldo_acumulat_ant: number;
  saldo_acumulat_fi: number;
  decisio_tancament: "liquidar" | "acumular" | null;
  cerrado: boolean;
  cerrado_en: string | null;
  cerrado_por: number | null;
  notas: string | null;
};

type TotalsShape = {
  worked: number;
  adjustments: number;
  reductions: number;
  reductionTipo: string | null;
  objective: number | null;
  effectiveObjective: number | null;
  isAutonom: boolean;
  saldo: number;
};

function saldoChipStyle(saldo: number, effectiveObjective: number | null): { bg: string; fg: string } {
  if (saldo >= 0) return { bg: "#E1F5EE", fg: "#085041" };
  const eff = effectiveObjective ?? 0;
  const deficitPct = eff > 0 ? Math.abs(saldo) / eff : 1;
  if (deficitPct >= 0.15) return { bg: "#FDEAEA", fg: "#A32D2D" };
  return { bg: "#FEF3E2", fg: "#B35C00" };
}

function TancamentsTab({
  idPersona, year, month0, totals, currentPersonaId,
}: {
  idPersona: number; year: number; month0: number; totals: TotalsShape; currentPersonaId: number | null;
}) {
  const qc = useQueryClient();
  const mes = month0 + 1;

  const currentMonthQ = useQuery({
    queryKey: ["resum-mes-current", idPersona, year, mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_resum_mes" as never)
        .select("*")
        .eq("id_persona", idPersona)
        .eq("anio", year)
        .eq("mes", mes)
        .maybeSingle();
      if (error) { console.warn(error); return null; }
      return (data ?? null) as ResumRow | null;
    },
  });

  const historyQ = useQuery({
    queryKey: ["resum-mes-history", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_resum_mes" as never)
        .select("*")
        .eq("id_persona", idPersona)
        .order("anio", { ascending: false })
        .order("mes", { ascending: false });
      if (error) { console.warn(error); return []; }
      return (data ?? []) as ResumRow[];
    },
  });

  // Previous month's accumulated balance
  const prevIdx = (() => {
    const d = new Date(year, month0 - 1, 1);
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  })();

  const prevAcumulat = useMemo(() => {
    const rows = historyQ.data ?? [];
    // Only use the immediately-previous month's balance, and only if that
    // exact month is closed — no falling back to an earlier closed month.
    const row = rows.find((r) => r.anio === prevIdx.y && r.mes === prevIdx.m && r.cerrado);
    return row?.saldo_acumulat_fi ?? 0;
  }, [historyQ.data, year, mes]);

  const [detailRow, setDetailRow] = useState<ResumRow | null>(null);

  const closeMonth = useMutation({
    mutationFn: async (decisio: "liquidar" | "acumular") => {
      // prevAcumulat is now already baked into totals.saldo via effectiveObjective
      // (see DetallPage's totals useMemo) — adding it again here would double-count it.
      const saldoAcumulat = decisio === "liquidar" ? 0 : totals.saldo;
      const payload = {
        id_persona: idPersona,
        anio: year,
        mes,
        hores_objectiu_base: totals.objective ?? 0,
        hores_reduccio: totals.reductions,
        hores_objectiu_ef: totals.effectiveObjective ?? 0,
        hores_treballades: totals.worked,
        hores_ajust_saldo: totals.adjustments,
        saldo_mes: totals.saldo,
        saldo_acumulat_ant: Number(prevAcumulat),
        saldo_acumulat_fi: saldoAcumulat,
        decisio_tancament: decisio,
        cerrado: true,
        cerrado_en: new Date().toISOString(),
        cerrado_por: currentPersonaId,
      };
      const existing = currentMonthQ.data;
      if (existing) {
        const { error } = await supabase
          .from("personal_resum_mes" as never)
          .update(payload as never)
          .eq("id_resumen", existing.id_resumen);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("personal_resum_mes" as never)
          .insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Mes cerrado");
      qc.invalidateQueries({ queryKey: ["resum-mes-current", idPersona] });
      qc.invalidateQueries({ queryKey: ["resum-mes-history", idPersona] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const cerrador = currentMonthQ.data?.cerrado_por;
  const cerradorNameQ = useQuery({
    queryKey: ["persona-name", cerrador],
    enabled: !!cerrador,
    queryFn: async () => {
      const { data } = await supabase.from("personal").select("nombre, apellidos").eq("id_persona", cerrador!).maybeSingle();
      return data ? `${(data as { nombre?: string }).nombre ?? ""} ${(data as { apellidos?: string }).apellidos ?? ""}`.trim() : "";
    },
  });

  const closed = currentMonthQ.data?.cerrado === true;
  const monthLabel = `${MONTH_ES[month0]} ${year}`;

  return (
    <div className="space-y-6">
      {/* Current month block */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {closed ? <Lock className="h-5 w-5 text-emerald-600" /> : <LockOpen className="h-5 w-5 text-amber-600" />}
            <span className="font-semibold capitalize">{monthLabel}</span>
            {closed ? (
              <span className="rounded-md bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-medium">Cerrado</span>
            ) : (
              <span className="rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">Pendiente</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {closed
              ? `Cerrado el ${fmtDate(currentMonthQ.data?.cerrado_en ?? null)}${cerradorNameQ.data ? ` por ${cerradorNameQ.data}` : ""}`
              : "Propuesta del sistema"}
          </div>
        </div>

        {totals.isAutonom ? (
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Horas registradas</span>
              <span className="font-semibold tabular-nums">{fmtHours(totals.worked)}</span>
            </div>
            {!closed && (
              <div className="flex justify-end">
                <Button onClick={() => closeMonth.mutate("acumular")} disabled={closeMonth.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                  Confirmar cierre
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-end gap-4">
              <div className="flex-1 min-w-0">
                <ClosureProgressBar
                  worked={closed ? currentMonthQ.data!.hores_treballades : totals.worked}
                  reductions={closed ? currentMonthQ.data!.hores_reduccio : totals.reductions}
                  baseObjective={closed ? currentMonthQ.data!.hores_objectiu_base : (totals.objective ?? 0)}
                  prevAcumulat={closed ? currentMonthQ.data!.saldo_acumulat_ant : Number(prevAcumulat)}
                  effectiveObjective={closed ? currentMonthQ.data!.hores_objectiu_ef : (totals.effectiveObjective ?? 0)}
                  reductionTipo={totals.reductionTipo}
                />
              </div>
              {(() => {
                const saldoVal = closed ? Number(currentMonthQ.data!.saldo_mes) : totals.saldo;
                const eff = closed ? Number(currentMonthQ.data!.hores_objectiu_ef) : (totals.effectiveObjective ?? 0);
                const st = saldoChipStyle(saldoVal, eff);
                return (
                  <div className="flex flex-col items-center shrink-0" style={{ minWidth: 72 }}>
                    <div className="rounded-full px-3 py-1 tabular-nums" style={{ background: st.bg, color: st.fg, fontSize: 16, fontWeight: 700 }}>
                      {fmtSigned(saldoVal)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">saldo del mes</div>
                  </div>
                );
              })()}
            </div>

            <BreakdownRows
              baseObjective={closed ? currentMonthQ.data!.hores_objectiu_base : (totals.objective ?? 0)}
              reductions={closed ? currentMonthQ.data!.hores_reduccio : totals.reductions}
              reductionTipo={totals.reductionTipo}
              prevAcumulat={closed ? currentMonthQ.data!.saldo_acumulat_ant : Number(prevAcumulat)}
              effectiveObjective={closed ? currentMonthQ.data!.hores_objectiu_ef : (totals.effectiveObjective ?? 0)}
              worked={closed ? currentMonthQ.data!.hores_treballades : totals.worked}
              adjustments={closed ? currentMonthQ.data!.hores_ajust_saldo : totals.adjustments}
              saldoMes={closed ? currentMonthQ.data!.saldo_mes : totals.saldo}
            />

            <div className="my-4 border-t" />

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {closed ? "Saldo acumulado final" : "Saldo acumulado si se confirma"}
                </span>
                {(() => {
                  // totals.saldo already includes prevAcumulat's effect via
                  // effectiveObjective — adding it again here would double-count it,
                  // same root cause already fixed in closeMonth's own saldoAcumulat.
                  const acc = closed ? currentMonthQ.data!.saldo_acumulat_fi : totals.saldo;
                  const st = saldoChipStyle(acc, totals.effectiveObjective);
                  return (
                    <div className="rounded-full px-3 py-1 tabular-nums" style={{ background: st.bg, color: st.fg, fontSize: 16, fontWeight: 700 }}>
                      {fmtSigned(acc)}
                    </div>
                  );
                })()}
              </div>
            </div>

            {!closed && (
              <div className="mt-5 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" className="gap-1">
                  <Plus className="h-4 w-4" /> Añadir ajuste
                </Button>
                <div className="flex gap-2">
                  <Button
                    onClick={() => closeMonth.mutate("liquidar")}
                    disabled={closeMonth.isPending}
                    className="bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    Liquidar y saldar
                  </Button>
                  <Button
                    onClick={() => closeMonth.mutate("acumular")}
                    disabled={closeMonth.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Confirmar (acumular)
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* History */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Historial de saldos acumulados</h3>
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="text-left p-3">Mes</th>
                <th className="text-right p-3">Obj. efectivo</th>
                <th className="text-right p-3">Trabajadas</th>
                <th className="text-right p-3">Saldo del mes</th>
                <th className="text-right p-3">Acumulado</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {(historyQ.data ?? []).length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Sin historial.</td></tr>
              ) : (
                (historyQ.data ?? []).map((r) => (
                  <tr key={r.id_resumen} className="border-b">
                    <td className="p-3 capitalize">{MONTH_ES[r.mes - 1]} {r.anio}</td>
                    <td className="p-3 text-right tabular-nums">
                      {fmtHours(Number(r.hores_objectiu_ef))}
                      {r.decisio_tancament === "liquidar" && <span className="ml-1 text-amber-600 text-xs">★ liquidado</span>}
                    </td>
                    <td className="p-3 text-right tabular-nums">{fmtHours(Number(r.hores_treballades))}</td>
                    <td className={`p-3 text-right tabular-nums ${saldoColor(Number(r.saldo_mes))}`}>{fmtSigned(Number(r.saldo_mes))}</td>
                    <td className={`p-3 text-right tabular-nums ${saldoColor(Number(r.saldo_acumulat_fi))}`}>{fmtSigned(Number(r.saldo_acumulat_fi))}</td>
                    <td className="p-3">
                      <button className="text-muted-foreground hover:text-foreground" onClick={() => setDetailRow(r)} aria-label="Ver detalle">
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      <Dialog open={!!detailRow} onOpenChange={(o) => { if (!o) setDetailRow(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {detailRow ? `${MONTH_ES[detailRow.mes - 1]} ${detailRow.anio}` : ""}
            </DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-1 text-sm">
              <Field label="Objetivo base" value={fmtHours(Number(detailRow.hores_objectiu_base))} />
              <Field label="Reducción" value={`−${fmtHours(Number(detailRow.hores_reduccio))}`} />
              <Field label="Objetivo efectivo" value={fmtHours(Number(detailRow.hores_objectiu_ef))} />
              <Field label="Horas trabajadas" value={fmtHours(Number(detailRow.hores_treballades))} />
              <Field label="Ajuste de saldo" value={fmtSigned(Number(detailRow.hores_ajust_saldo))} />
              <Field label="Saldo del mes" value={fmtSigned(Number(detailRow.saldo_mes))} />
              <Field label="Acumulado anterior" value={fmtSigned(Number(detailRow.saldo_acumulat_ant))} />
              <Field label="Acumulado final" value={fmtSigned(Number(detailRow.saldo_acumulat_fi))} />
              <Field label="Decisión" value={detailRow.decisio_tancament ?? "—"} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtSigned(h: number): string {
  if (h === 0) return "0h";
  return `${h > 0 ? "+" : "−"}${fmtHours(Math.abs(h))}`;
}

function saldoColor(h: number): string {
  if (h > 0) return "text-emerald-600";
  if (h < 0) return "text-red-600";
  return "text-muted-foreground";
}

function ClosureProgressBar({
  worked, reductions, baseObjective, prevAcumulat, effectiveObjective, reductionTipo,
}: {
  worked: number; reductions: number; baseObjective: number; prevAcumulat: number;
  effectiveObjective: number; reductionTipo: string | null;
}) {
  const BASE_PCT = 80;
  const has = baseObjective > 0;
  const effPct = has ? (effectiveObjective / baseObjective) * BASE_PCT : 0;
  const workedPct = has ? Math.min(100, (worked / baseObjective) * BASE_PCT) : 0;
  // When effectiveObjective exceeds baseObjective (prevAcumulat < 0, the objective
  // grew), effPct already extends past BASE_PCT on the same hours-per-percent
  // scale — this segment just fills that extra width, from BASE_PCT to effPct.
  const excessPct = has && effectiveObjective > baseObjective
    ? ((effectiveObjective - baseObjective) / baseObjective) * BASE_PCT
    : 0;

  let color = "#1D9E75";
  if (has && worked < effectiveObjective) {
    const deficit = (effectiveObjective - worked) / (effectiveObjective || 1);
    color = deficit >= 0.15 ? "#E24B4A" : "#EF9F27";
  }

  const reductionLabel = reductionTipo === "vacaciones" ? "VACAC." : reductionTipo === "baja" ? "baja" : reductionTipo ?? "";
  const adjClauses: string[] = [];
  if (reductions > 0) adjClauses.push(`−${fmtHours(reductions)} ${reductionLabel}`);
  if (prevAcumulat !== 0) adjClauses.push(`${prevAcumulat > 0 ? "−" : "+"}${fmtHours(Math.abs(prevAcumulat))} S.ANT.`);
  const infoText = !has
    ? "Sin objetivo"
    : adjClauses.length > 0
      ? `Obj. ${fmtHours(baseObjective)} · ${adjClauses.join(" · ")} → ${fmtHours(effectiveObjective)} efectivo`
      : `Obj. ${fmtHours(baseObjective)}`;

  return (
    <>
      <div className="text-xs text-muted-foreground mb-1">{infoText}</div>
      <div className="relative w-full mb-4" style={{ overflow: "visible" }}>
      <div className="relative w-full" style={{ height: 10 }}>
        <div className="absolute inset-y-0 left-0" style={{ width: `${effPct}%`, background: "#D3D1C7" }} />
        {has && (reductions > 0 || prevAcumulat > 0) && (
          <div
            className="absolute inset-y-0 flex items-center justify-center text-[10px] font-medium"
            style={{ left: `${effPct}%`, width: `${Math.max(0, BASE_PCT - effPct)}%`, background: "#FAEEDA", borderLeft: "2px solid #EF9F27", color: "#B35C00" }}
          >
            −{fmtHours(reductions + (prevAcumulat > 0 ? prevAcumulat : 0))}
          </div>
        )}
        {has && excessPct > 0 && (
          <div
            className="absolute inset-y-0 flex items-center justify-center text-[10px] font-medium"
            style={{ left: `${BASE_PCT}%`, width: `${excessPct}%`, background: "#FBDEDD", borderLeft: "2px solid #E24B4A", color: "#A32D2D" }}
          >
            {excessPct > 4 ? `+${fmtHours(effectiveObjective - baseObjective)}` : ""}
          </div>
        )}
      </div>
      <div className="relative w-full" style={{ height: 18 }}>
        <div className="absolute inset-y-0 left-0 flex items-center justify-end pr-2 text-xs font-semibold text-white" style={{ width: `${workedPct}%`, background: color }}>
          {workedPct > 8 ? fmtHours(worked) : ""}
        </div>
      </div>
      {has && (
        <div className="absolute pointer-events-none" style={{ left: `${effPct}%`, top: 0, bottom: 0, width: 2, background: "#26215C", transform: "translateX(-1px)" }} />
      )}
      {has && (
        <div
          className="absolute"
          style={{
            left: `${effPct}%`,
            top: -28,
            transform: "translateX(-50%)",
            fontSize: 13,
            color: "#26215C",
            fontWeight: 700,
            whiteSpace: "nowrap",
            background: "#fff",
            padding: "2px 6px",
            borderRadius: 4,
            border: "1px solid #26215C",
          }}
        >
          {fmtHours(effectiveObjective)}
        </div>
      )}
      </div>
    </>
  );
}

function BreakdownRows({
  baseObjective, reductions, reductionTipo, prevAcumulat, effectiveObjective, worked, adjustments, saldoMes,
}: {
  baseObjective: number; reductions: number; reductionTipo: string | null; prevAcumulat: number;
  effectiveObjective: number; worked: number; adjustments: number; saldoMes: number;
}) {
  const redLabel = reductionTipo === "vacaciones" ? "vacaciones" : reductionTipo === "baja" ? "baja" : reductionTipo ?? "";
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Objetivo base</span>
        <span className="tabular-nums">{fmtHours(baseObjective)}</span>
      </div>
      {reductions > 0 && (
        <div className="flex justify-between text-amber-700">
          <span>− {redLabel} (ajuste objetivo)</span>
          <span className="tabular-nums">−{fmtHours(reductions)}</span>
        </div>
      )}
      {prevAcumulat !== 0 && (
        <div className={`flex justify-between ${saldoColor(prevAcumulat)}`}>
          <span>Saldo acumulado anterior</span>
          <span className="tabular-nums">{fmtSigned(-prevAcumulat)}</span>
        </div>
      )}
      <div className="border-t my-1" />
      <div className="flex justify-between font-medium">
        <span>Objetivo efectivo</span>
        <span className="tabular-nums">{fmtHours(effectiveObjective)}</span>
      </div>
      <div className="border-t my-1" />
      <div className="flex justify-between">
        <span className="text-muted-foreground">Horas trabajadas</span>
        <span className="tabular-nums">{fmtHours(worked)}</span>
      </div>
      {adjustments !== 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Ajuste de saldo</span>
          <span className="tabular-nums">{fmtSigned(adjustments)}</span>
        </div>
      )}
      <div className="border-t my-1" />
      <div className="flex justify-between items-center">
        <span className="font-medium">Saldo del mes</span>
        {(() => {
          const st = saldoChipStyle(saldoMes, effectiveObjective);
          return (
            <div className="rounded-full px-3 py-1 tabular-nums" style={{ background: st.bg, color: st.fg, fontSize: 15, fontWeight: 700 }}>
              {fmtSigned(saldoMes)}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ============================================================
// VACANCES TAB
// ============================================================

type VacAnyRow = {
  id_vac_any: number;
  id_persona: number;
  data_inici_any: string;
  data_fi_any: string;
  dies_assignats: number;
  hores_calculades: number;
  hores_assignades: number;
  notas: string | null;
  creado_por: number | null;
  creado_en: string;
  dies_meritats?: number | null;
  dies_liquidats?: number | null;
  decisio_saldo?: string | null;
  data_saldo?: string | null;
};

type PeriodRow = {
  id_periodo: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  horas_objetivo_mes: number | null;
  dies_vacances_any?: number | null;
};

function addYears(dateISO: string, n: number): string {
  const d = new Date(dateISO);
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}
function addDays(dateISO: string, n: number): string {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function VacancesTab({
  idPersona, tipoContrato, currentPersonaId,
}: { idPersona: number; tipoContrato: string | null; currentPersonaId: number | null }) {
  const qc = useQueryClient();
  const isAutonom = tipoContrato === "autonomo";
  const [newOpen, setNewOpen] = useState(false);

  const vacsQ = useQuery({
    queryKey: ["vac-any", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_vacances_any" as never)
        .select("*")
        .eq("id_persona", idPersona)
        .order("data_inici_any", { ascending: false });
      if (error) { console.warn(error); return []; }
      return (data ?? []) as VacAnyRow[];
    },
    enabled: !isAutonom,
  });

  const periodsQ = useQuery({
    queryKey: ["all-periods", idPersona],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_periodos_actividad")
        .select("id_periodo, fecha_inicio, fecha_fin, horas_objetivo_mes, dies_vacances_any")
        .eq("id_persona", idPersona)
        .order("fecha_inicio", { ascending: true });
      if (error) { console.warn(error); return []; }
      return (data ?? []) as PeriodRow[];
    },
    enabled: !isAutonom,
  });

  if (isAutonom) {
    return (
      <div className="rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Los autónomos no tienen días de vacaciones asignados.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setNewOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Nuevo año
        </Button>
      </div>

      {(vacsQ.data ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Todavía no hay ningún año de vacaciones configurado.
        </div>
      ) : (
        (vacsQ.data ?? []).map((v) => (
          <VacYearCard key={v.id_vac_any} row={v} idPersona={idPersona} tipoContrato={tipoContrato} periods={periodsQ.data ?? []} />
        ))
      )}

      <NouAnyModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        idPersona={idPersona}
        tipoContrato={tipoContrato}
        periods={periodsQ.data ?? []}
        existing={vacsQ.data ?? []}
        currentPersonaId={currentPersonaId}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["vac-any", idPersona] });
          setNewOpen(false);
        }}
      />
    </div>
  );
}

function VacYearCard({
  row, idPersona, tipoContrato, periods,
}: { row: VacAnyRow; idPersona: number; tipoContrato: string | null; periods: PeriodRow[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const isActive = row.data_inici_any <= today && today <= row.data_fi_any;
  const isPast = row.data_fi_any < today;
  const [editOpen, setEditOpen] = useState(false);

  const consumedQ = useQuery({
    queryKey: ["vac-consumed", idPersona, row.data_inici_any, row.data_fi_any],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_ajustos_hores")
        .select("id_ajuste, fecha, horas, notas")
        .eq("id_persona", idPersona)
        .eq("tipo", "vacaciones")
        .gte("fecha", row.data_inici_any)
        .lte("fecha", row.data_fi_any);
      if (error) { console.warn(error); return []; }
      return (data ?? []) as Array<{ id_ajuste: number; fecha: string; horas: number; notas: string | null }>;
    },
  });

  // Un día disfrutado = una fecha distinta con ajuste de vacaciones.
  const consumedDays = useMemo(() => {
    const seen = new Map<string, { id_ajuste: number; fecha: string; notas: string | null }>();
    for (const r of consumedQ.data ?? []) if (!seen.has(r.fecha)) seen.set(r.fecha, r);
    return [...seen.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [consumedQ.data]);
  const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const consumed = consumedDays.length;
  // Días devengados en proporción al tiempo activo (todos los tipos de contrato);
  // un año saldado queda congelado con los días devengados en el saldo.
  const isFD = isFijoDiscontinuo(tipoContrato);
  const settled = row.decisio_saldo != null;
  const anual = Number(row.dies_assignats ?? 0);
  let meritats: number, perduts: number, maxim: number;
  if (settled) {
    meritats = Number(row.dies_meritats ?? row.dies_assignats ?? 0);
    maxim = meritats;
    perduts = Math.max(0, anual - maxim);
  } else {
    ({ meritats, perduts, maxim } = desgloseVacances(periods, row.data_inici_any, row.data_fi_any, anual, today));
  }
  const disponibles = meritats - consumed;
  const settledTitle = row.decisio_saldo === "liquidar"
    ? `Liquidados ${fmtDays(Number(row.dies_liquidats ?? 0))} d`
    : `Perdidos ${fmtDays(Math.max(0, Number(row.dies_meritats ?? 0) - consumed))} d`;
  // Las tres barras comparten la escala 0…anual y van alineadas a la izquierda.
  const pctAnual = (n: number) => (anual > 0 ? Math.max(0, Math.min(100, (n / anual) * 100)) : 0);
  const pctMaxim = (n: number) => (maxim > 0 ? Math.max(0, Math.min(100, (n / maxim) * 100)) : 0);
  const trackWidth = `${pctAnual(maxim)}%`;
  const consumedOver = consumed > maxim;

  const status = isActive ? "Activo" : isPast ? "Cerrado" : "Futuro";
  const statusClass = isActive
    ? "bg-emerald-100 text-emerald-800"
    : isPast ? "bg-gray-100 text-gray-700" : "bg-blue-100 text-blue-800";
  const advancedClass = consumed > meritats ? "bg-red-100 text-red-800" : "";

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Año contractual {fmtDate(row.data_inici_any)} – {fmtDate(row.data_fi_any)}</span>
            {consumed <= meritats && status === "Cerrado" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white">
                <Lock className="h-3 w-3" />
                Cerrado
              </span>
            ) : (
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${consumed > meritats ? advancedClass : statusClass}`}>
                {consumed > meritats ? "Adelantadas" : status}
              </span>
            )}
            {settled && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white" title={settledTitle}>
                <CheckCircle2 className="h-3 w-3" />
                Saldado
              </span>
            )}
          </div>
          {settled && (
            <div className="text-xs text-muted-foreground mt-1">
              Saldado{row.data_saldo ? ` el ${fmtDate(row.data_saldo)}` : ""} · {settledTitle.toLowerCase()}
            </div>
          )}
        </div>
        {isPast ? (
          <Lock className="h-4 w-4 text-muted-foreground" />
        ) : (
          <button className="text-muted-foreground hover:text-foreground" aria-label="Editar" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {/* Anuales: toda la barra = días de la ficha; la parte perdida en ámbar */}
        <div className="grid grid-cols-[110px_minmax(0,1fr)_78px] items-center gap-3">
          <div>
            <div className="text-sm font-medium">Anuales</div>
            <div className="text-[11px] text-muted-foreground">de la ficha</div>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted min-w-0">
            <div style={{ width: `${pctAnual(maxim)}%`, background: "#D3D1C7" }} />
            <div style={{ width: `${pctAnual(perduts)}%`, background: "#EF9F27" }} />
          </div>
          <div className="text-right text-sm font-semibold tabular-nums">{fmtDays(anual)} d</div>
        </div>
        {/* Devengados */}
        <div className="grid grid-cols-[110px_minmax(0,1fr)_78px] items-center gap-3">
          <div>
            <div className="text-sm font-medium">Devengados</div>
            <div className="text-[11px] text-muted-foreground">a fecha de hoy</div>
          </div>
          <div className="min-w-0">
            <div className="h-3 overflow-hidden rounded-full bg-muted" style={{ width: trackWidth }}>
              <div className="h-full" style={{ width: `${pctMaxim(meritats)}%`, background: "#1D9E75" }} />
            </div>
          </div>
          <div className="text-right text-sm font-semibold tabular-nums">
            {fmtDays(meritats)}<span className="text-xs font-normal text-muted-foreground"> de {fmtDays(maxim)}</span>
          </div>
        </div>
        {/* Disfrutados */}
        <div className="grid grid-cols-[110px_minmax(0,1fr)_78px] items-center gap-3">
          <div>
            <div className="text-sm font-medium">Disfrutados</div>
            <div className="text-[11px] text-muted-foreground">en este año</div>
          </div>
          <div className="min-w-0">
            <div className="h-3 overflow-hidden rounded-full bg-muted" style={{ width: trackWidth }}>
              <div className="h-full" style={{ width: `${pctMaxim(Math.min(consumed, maxim))}%`, background: consumedOver ? "#A32D2D" : "#0F6E56" }} />
            </div>
          </div>
          <div className={`text-right text-sm font-semibold tabular-nums ${consumedOver ? "text-red-600" : ""}`}>
            {fmtDays(consumed)}<span className="text-xs font-normal text-muted-foreground"> de {fmtDays(maxim)}</span>
          </div>
        </div>
        {/* Eje */}
        <div className="grid grid-cols-[110px_minmax(0,1fr)_78px] gap-3">
          <div />
          <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>0</span>
            <span>{fmtDays(anual / 2)}</span>
            <span>{fmtDays(anual)}</span>
          </div>
          <div />
        </div>
        {perduts > 0 && (
          <div className="text-xs text-amber-700">
            {settled
              ? `${fmtDays(perduts)} d no devengados por fin de contrato → total devengado del año: ${fmtDays(maxim)} d`
              : `${fmtDays(perduts)} d perdidos ${isFD ? "por F.DISC" : "por periodos sin actividad"} → máximo real de este año: ${fmtDays(maxim)} d`}
          </div>
        )}
      </div>

      <div
        className="mt-4 flex items-center gap-3 rounded-lg px-4 py-3"
        style={disponibles >= 0 ? { background: "#E1F5EE", color: "#085041" } : { background: "#FDEAEA", color: "#A32D2D" }}
      >
        <div className="tabular-nums" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
          {disponibles >= 0 ? fmtDays(disponibles) : `−${fmtDays(Math.abs(disponibles))}`}
        </div>
        <div className="text-sm">
          {disponibles >= 0 ? "días disponibles hoy (devengados − disfrutados)" : "días adelantados"}
        </div>
      </div>

      {consumedDays.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">Consumido</div>
          <div className="space-y-1 text-sm">
            {consumedDays.map((c) => (
              <div key={c.id_ajuste} className="flex justify-between">
                <span>{fmtDate(c.fecha)}{c.notas ? ` · ${c.notas}` : ""}</span>
                <span className="tabular-nums">1 día</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <EditAnyModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        row={row}
        idPersona={idPersona}
        periods={periods}
      />
    </div>
  );
}

function EditAnyModal({
  open, onClose, row, idPersona, periods,
}: {
  open: boolean; onClose: () => void; row: VacAnyRow; idPersona: number; periods: PeriodRow[];
}) {
  const qc = useQueryClient();
  const settled = row.decisio_saldo != null;
  const [ini, setIni] = useState(row.data_inici_any);
  const [fin, setFin] = useState(row.data_fi_any);
  const [dies, setDies] = useState(String(row.dies_assignats ?? 0));
  const [notas, setNotas] = useState(row.notas ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIni(row.data_inici_any);
    setFin(row.data_fi_any);
    setDies(String(row.dies_assignats ?? 0));
    setNotas(row.notas ?? "");
    setSaving(false);
  }, [open, row]);

  async function save() {
    const diesN = Number(dies);
    let patch: Record<string, unknown>;
    if (settled) {
      patch = { notas: notas.trim() || null };
    } else {
      if (!ini || !fin) { toast.error("Las fechas de inicio y fin son obligatorias"); return; }
      if (fin < ini) { toast.error("La fecha de fin debe ser igual o posterior a la de inicio"); return; }
      if (!isFinite(diesN) || diesN < 0) { toast.error("Los días anuales deben ser 0 o más"); return; }
      patch = { data_inici_any: ini, data_fi_any: fin, dies_assignats: diesN, notas: notas.trim() || null };
      if (diesN !== Number(row.dies_assignats)) {
        const active = periods.find((p) => !p.fecha_fin) ?? periods[periods.length - 1];
        const horasPerMes = Number(active?.horas_objetivo_mes ?? 0);
        const horas = Math.round(diesN * (horasPerMes / DIAS_PROMEDIO_MES) * 100) / 100;
        patch.hores_calculades = horas;
        patch.hores_assignades = horas;
      }
    }
    setSaving(true);
    if (!settled) {
      // No puede solaparse con otro año de vacaciones de la misma persona.
      const { data: others, error: oErr } = await supabase
        .from("personal_vacances_any" as never)
        .select("id_vac_any, data_inici_any, data_fi_any")
        .eq("id_persona", idPersona)
        .neq("id_vac_any", row.id_vac_any);
      if (oErr) { setSaving(false); toast.error(oErr.message); return; }
      const clash = ((others ?? []) as unknown as Array<{ data_inici_any: string; data_fi_any: string }>)
        .find((o) => o.data_inici_any <= fin && o.data_fi_any >= ini);
      if (clash) {
        setSaving(false);
        toast.error(`Las fechas se solapan con otro año (${fmtDate(clash.data_inici_any)} – ${fmtDate(clash.data_fi_any)})`);
        return;
      }
      // Días de vacaciones que quedarían fuera del nuevo rango.
      if (ini !== row.data_inici_any || fin !== row.data_fi_any) {
        const { data: used, error: uErr } = await supabase
          .from("personal_ajustos_hores")
          .select("fecha")
          .eq("id_persona", idPersona)
          .eq("tipo", "vacaciones")
          .gte("fecha", row.data_inici_any)
          .lte("fecha", row.data_fi_any);
        if (uErr) { setSaving(false); toast.error(uErr.message); return; }
        const outside = new Set(
          (used ?? []).map((r) => r.fecha as string).filter((f) => f < ini || f > fin),
        ).size;
        if (outside > 0 && !window.confirm(`${outside} días de vacaciones quedarán fuera de este año. ¿Continuar?`)) {
          setSaving(false);
          return;
        }
      }
    }
    const { error } = await supabase
      .from("personal_vacances_any" as never)
      .update(patch as never)
      .eq("id_vac_any", row.id_vac_any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Año actualizado");
    qc.invalidateQueries({ queryKey: ["vac-any", idPersona] });
    qc.invalidateQueries({ queryKey: ["vac-consumed", idPersona] });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar año de vacaciones</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {settled && (
            <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700">
              Año saldado: solo se pueden editar las notas
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Inicio del año</label>
              <Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} disabled={settled} />
            </div>
            <div>
              <label className="text-sm font-medium">Fin del año</label>
              <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} disabled={settled} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Días anuales (naturales)</label>
            <Input type="number" min={0} step="0.5" value={dies} onChange={(e) => setDies(e.target.value)} disabled={settled} />
          </div>
          <div>
            <label className="text-sm font-medium">Notas</label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NouAnyModal({
  open, onClose, idPersona, tipoContrato, periods, existing, currentPersonaId, onSaved,
}: {
  open: boolean; onClose: () => void; idPersona: number; tipoContrato: string | null;
  periods: PeriodRow[]; existing: VacAnyRow[]; currentPersonaId: number | null;
  onSaved: () => void;
}) {
  // Compute next contractual year based on earliest period start + number of existing years
  const earliest = periods[0]?.fecha_inicio ?? null;
  const nextYearIdx = existing.length; // 0-based offset from earliest
  const inici = earliest ? addYears(earliest, nextYearIdx) : new Date().toISOString().slice(0, 10);
  const fi = addDays(addYears(inici, 1), -1);

  const [dies, setDies] = useState<string>("30");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  // Por defecto, los días de vacaciones del período activo (o 30).
  const activeDies = periods.find((p) => !p.fecha_fin)?.dies_vacances_any ?? null;
  useEffect(() => {
    if (open) setDies(String(activeDies ?? 30));
  }, [open, activeDies]);

  const horesPerMes = useMemo(() => {
    // Use active period (fecha_fin null) horas_objetivo_mes; fallback last period
    const active = periods.find((p) => !p.fecha_fin) ?? periods[periods.length - 1];
    return Number(active?.horas_objetivo_mes ?? 0);
  }, [periods, inici, fi]);

  const diesN = Number(dies) || 0;
  const horesCalc = diesN * (horesPerMes / DIAS_PROMEDIO_MES);

  async function save() {
    if (diesN <= 0) { toast.error("Los días deben ser > 0"); return; }
    setSaving(true);
    const { error } = await supabase.from("personal_vacances_any" as never).insert({
      id_persona: idPersona,
      data_inici_any: inici,
      data_fi_any: fi,
      dies_assignats: diesN,
      hores_calculades: horesCalc,
      hores_assignades: horesCalc,
      notas: notas.trim() || null,
      creado_por: currentPersonaId,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Año creado");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nuevo año de vacaciones</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Inicio</label>
              <Input value={fmtDate(inici)} readOnly />
            </div>
            <div>
              <label className="text-sm font-medium">Fin</label>
              <Input value={fmtDate(fi)} readOnly />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Días asignados (naturales)</label>
            <Input type="number" value={dies} onChange={(e) => setDies(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Notas</label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}