import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn, formatHHMM } from "@/lib/utils";
import { fullName } from "@/lib/types";
import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import {
  usePersonalLite,
  useApartamentosLite,
  useEspaciosLite,
  useGruposLite,
  useMantenimientoWorkers,
  useMantenimientoActions,
} from "@/hooks/use-mantenimiento";
import { TipoBadge, PrioridadPill, EstadoPill } from "@/components/mantenimiento-badges";
import { AsignarDialog } from "@/components/mantenimiento-asignar-dialog";
import { MantenimientoPopover } from "@/components/mantenimiento-popover";
import { OcupacionPopoverTrigger } from "@/components/apartamento-ocupacion-calendario";
import { ReportarIncidenciaSheet, type ReportarIncidenciaContext } from "@/components/reportar-incidencia";
import {
  INCIDENCIA_COLUMNS,
  REGISTRE_COLUMNS,
  PRIORIDAD_RANK,
  resolveLocation,
  rightPanelStyle,
  type Incidencia,
  type Registre,
  type PersonaLite,
} from "@/lib/mantenimiento";
import { Home, Plus, RotateCcw, Camera, Video, Mic, FileText, Euro, Filter, ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/mantenimiento")({
  component: MantenimientoPage,
});

type TareasFilter = "asignadas_curso" | "en_curso" | "finalizadas" | "rechazadas" | "todas";
type SortKey = "prioridad" | "fecha_prevista" | "fecha_inicio" | "fecha_fin" | "titulo" | "ubicacion" | "operario";
type UbicacionFilter = "todos" | `apt-${number}` | `esp-${number}`;
type OperarioFilter = "todos" | "sin_asignar" | number;
type ReclamacionFilter = "todas" | "abierta" | "cerrada";
type ReclamacionEstado = "pendiente" | "gestionada" | "finalizada";

const ADJUNTO_TIPO_ICONS: { tipo: string; Icon: typeof Camera; title: string }[] = [
  { tipo: "foto", Icon: Camera, title: "Tiene fotos" },
  { tipo: "video", Icon: Video, title: "Tiene vídeos" },
  { tipo: "nota_veu", Icon: Mic, title: "Tiene notas de voz" },
  { tipo: "document", Icon: FileText, title: "Tiene documentos" },
];

const RECLAMACION_ESTADO_STYLE: Record<ReclamacionEstado, { className: string; label: string }> = {
  pendiente: { className: "bg-amber-200 text-amber-800 border border-amber-400", label: "Reclamación pendiente" },
  gestionada: { className: "bg-blue-200 text-blue-800 border border-blue-400", label: "Reclamación gestionada" },
  finalizada: { className: "bg-emerald-200 text-emerald-800 border border-emerald-400", label: "Reclamación finalizada" },
};

function ReclamacionIndicator({ estado }: { estado: ReclamacionEstado }) {
  const s = RECLAMACION_ESTADO_STYLE[estado];
  return (
    <span
      title={s.label}
      className={cn("inline-flex items-center rounded-md px-2 py-1 shrink-0", s.className)}
    >
      <Euro className="h-4 w-4" strokeWidth={2.5} />
    </span>
  );
}

function MantenimientoPage() {
  const { canEdit } = usePermissions();
  const editable = canEdit("mantenimiento");
  const { persona } = useCurrentPersonal();

  const [assignTarget, setAssignTarget] = useState<Incidencia | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<TareasFilter>("asignadas_curso");
  const [sortKey, setSortKey] = useState<SortKey>("prioridad");
  const [grupoFilter, setGrupoFilter] = useState<number | "todos">("todos");
  const [ubicacionFilter, setUbicacionFilter] = useState<UbicacionFilter>("todos");
  const [operarioFilter, setOperarioFilter] = useState<OperarioFilter>("todos");
  const [reclamacionFilter, setReclamacionFilter] = useState<ReclamacionFilter>("todas");
  const [incidenciaOpen, setIncidenciaOpen] = useState(false);

  const pendientesQ = useQuery({
    queryKey: ["mantenimiento-pendientes"],
    queryFn: async (): Promise<Incidencia[]> => {
      const { data, error } = await supabase
        .from("manteniment_incidencies")
        .select(INCIDENCIA_COLUMNS)
        .eq("estat", "pendent_validacio")
        .order("creado_en", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Incidencia[];
    },
  });

  const tareasQ = useQuery({
    queryKey: ["mantenimiento-tareas", filtro],
    queryFn: async (): Promise<Incidencia[]> => {
      let q = supabase.from("manteniment_incidencies").select(INCIDENCIA_COLUMNS);
      if (filtro === "asignadas_curso") q = q.in("estat", ["validada", "en_curs"]);
      else if (filtro === "en_curso") q = q.eq("estat", "en_curs");
      else if (filtro === "finalizadas") q = q.eq("estat", "finalitzada");
      else if (filtro === "rechazadas") q = q.eq("estat", "rebutjada");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Incidencia[];
    },
  });

  const tareaIds = useMemo(() => (tareasQ.data ?? []).map((t) => t.id_incidencia), [tareasQ.data]);
  const tareaIdsKey = useMemo(() => tareaIds.slice().sort((a, b) => a - b).join(","), [tareaIds]);

  // pendientesQ is fetched entirely independently of tareasQ (own queryKey, no
  // `enabled` gate, own refetch) — mirroring that independence rather than
  // unioning the two id sets into tareaIds keeps this query's lifecycle
  // consistent with how the rest of this file already treats "Nuevas" as a
  // separate parallel list.
  const pendienteIds = useMemo(() => (pendientesQ.data ?? []).map((t) => t.id_incidencia), [pendientesQ.data]);
  const pendienteIdsKey = useMemo(() => pendienteIds.slice().sort((a, b) => a - b).join(","), [pendienteIds]);

  const registreQ = useQuery({
    queryKey: ["mantenimiento-registre", tareaIdsKey],
    enabled: tareaIds.length > 0,
    queryFn: async (): Promise<Registre[]> => {
      const { data, error } = await supabase
        .from("manteniment_registre")
        .select(REGISTRE_COLUMNS)
        .in("id_incidencia", tareaIds)
        .order("inici", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Registre[];
    },
  });

  const registreByIncidencia = useMemo(() => {
    const m = new Map<number, Registre[]>();
    for (const r of registreQ.data ?? []) {
      const arr = m.get(r.id_incidencia) ?? [];
      arr.push(r);
      m.set(r.id_incidencia, arr);
    }
    return m;
  }, [registreQ.data]);

  const adjuntoTiposQ = useQuery({
    queryKey: ["mantenimiento-adjunto-tipos", tareaIdsKey],
    enabled: tareaIds.length > 0,
    queryFn: async (): Promise<{ id_incidencia: number; tipus: string | null }[]> => {
      const { data, error } = await supabase
        .from("manteniment_adjunts")
        .select("id_incidencia, tipus")
        .in("id_incidencia", tareaIds);
      if (error) throw error;
      return (data ?? []) as { id_incidencia: number; tipus: string | null }[];
    },
  });

  const adjuntoTiposByIncidencia = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const a of adjuntoTiposQ.data ?? []) {
      if (!a.tipus) continue;
      const set = m.get(a.id_incidencia) ?? new Set<string>();
      set.add(a.tipus);
      m.set(a.id_incidencia, set);
    }
    return m;
  }, [adjuntoTiposQ.data]);

  const reclamacionesQ = useQuery({
    queryKey: ["mantenimiento-reclamaciones", tareaIdsKey],
    enabled: tareaIds.length > 0,
    queryFn: async (): Promise<{ id_incidencia: number; cobro_confirmado: boolean; cerrado: boolean }[]> => {
      const { data, error } = await supabase
        .from("manteniment_reclamaciones")
        .select("id_incidencia, cobro_confirmado, cerrado")
        .in("id_incidencia", tareaIds);
      if (error) throw error;
      return (data ?? []) as { id_incidencia: number; cobro_confirmado: boolean; cerrado: boolean }[];
    },
  });

  // Separate small query for "Nuevas", scoped to its own independent id set —
  // see the comment by pendienteIds above for why this isn't unioned into the
  // tareaIds-scoped query above.
  const reclamacionesPendientesQ = useQuery({
    queryKey: ["mantenimiento-reclamaciones-pendientes", pendienteIdsKey],
    enabled: pendienteIds.length > 0,
    queryFn: async (): Promise<{ id_incidencia: number; cobro_confirmado: boolean; cerrado: boolean }[]> => {
      const { data, error } = await supabase
        .from("manteniment_reclamaciones")
        .select("id_incidencia, cobro_confirmado, cerrado")
        .in("id_incidencia", pendienteIds);
      if (error) throw error;
      return (data ?? []) as { id_incidencia: number; cobro_confirmado: boolean; cerrado: boolean }[];
    },
  });

  // Fully independent of tareaIds/filtro — tareaIds only covers whatever
  // estados the current filtro happens to include (e.g. "Asignadas + en curso"
  // excludes finalitzada), so it can't be trusted for an always-correct count
  // of open reclamaciones across ALL incidencias regardless of their estat.
  const reclamacionesAbiertasCountQ = useQuery({
    queryKey: ["mantenimiento-reclamaciones-abiertas-count"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("manteniment_reclamaciones")
        .select("id_reclamacion", { count: "exact", head: true })
        .eq("cerrado", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Single shared map for both TareaRow and NuevaCard, fed by the two
  // independent queries above.
  const reclamacionEstadoByIncidencia = useMemo(() => {
    const m = new Map<number, ReclamacionEstado>();
    for (const r of [...(reclamacionesQ.data ?? []), ...(reclamacionesPendientesQ.data ?? [])]) {
      m.set(r.id_incidencia, r.cerrado ? "finalizada" : r.cobro_confirmado ? "gestionada" : "pendiente");
    }
    return m;
  }, [reclamacionesQ.data, reclamacionesPendientesQ.data]);

  const personalQ = usePersonalLite();
  const personaById = useMemo(
    () => new Map((personalQ.data ?? []).map((p) => [p.id_persona, p])),
    [personalQ.data],
  );

  const aptQ = useApartamentosLite();
  const aptById = useMemo(() => new Map((aptQ.data ?? []).map((a) => [a.id_apt, a])), [aptQ.data]);

  const espaciosQ = useEspaciosLite();
  const espacioById = useMemo(() => new Map((espaciosQ.data ?? []).map((e) => [e.id_tipo, e])), [espaciosQ.data]);

  const gruposQ = useGruposLite();
  const grupoById = useMemo(() => new Map((gruposQ.data ?? []).map((g) => [g.id_grupo, g])), [gruposQ.data]);

  const aptOptionsForFilter = useMemo(() => {
    const list = (aptQ.data ?? []).filter((a) => grupoFilter === "todos" || a.id_grupo === grupoFilter);
    return list.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [aptQ.data, grupoFilter]);

  const espacioOptionsForFilter = useMemo(
    () => (espaciosQ.data ?? []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [espaciosQ.data],
  );

  const workersQ = useMantenimientoWorkers();
  const operarioOptionsForFilter = useMemo(
    () => (workersQ.data ?? []).slice().sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [workersQ.data],
  );

  const incidenciaContext: ReportarIncidenciaContext = useMemo(
    () => ({
      origen: "gestor",
      grupos: gruposQ.data ?? [],
      apartamentos: aptQ.data ?? [],
    }),
    [gruposQ.data, aptQ.data],
  );

  function refetchLists() {
    pendientesQ.refetch();
    tareasQ.refetch();
    registreQ.refetch();
    reclamacionesQ.refetch();
    reclamacionesPendientesQ.refetch();
    reclamacionesAbiertasCountQ.refetch();
  }

  const actions = useMantenimientoActions(refetchLists);

  const filteredTareas = useMemo(() => {
    return (tareasQ.data ?? []).filter((t) => {
      if (grupoFilter !== "todos" && t.id_grup !== grupoFilter) return false;
      if (ubicacionFilter !== "todos") {
        if (ubicacionFilter.startsWith("apt-")) {
          if (t.id_apt !== Number(ubicacionFilter.slice(4))) return false;
        } else if (ubicacionFilter.startsWith("esp-")) {
          if (t.id_tipo_espacio_comun !== Number(ubicacionFilter.slice(4))) return false;
        }
      }
      if (operarioFilter !== "todos") {
        if (operarioFilter === "sin_asignar") {
          if (t.id_assignat != null) return false;
        } else if (t.id_assignat !== operarioFilter) return false;
      }
      if (reclamacionFilter !== "todas") {
        const estado = reclamacionEstadoByIncidencia.get(t.id_incidencia);
        if (reclamacionFilter === "abierta" && !(estado === "pendiente" || estado === "gestionada")) return false;
        if (reclamacionFilter === "cerrada" && estado !== "finalizada") return false;
      }
      return true;
    });
  }, [tareasQ.data, grupoFilter, ubicacionFilter, operarioFilter, reclamacionFilter, reclamacionEstadoByIncidencia]);

  const sortedTareas = useMemo(() => {
    const arr = [...filteredTareas];
    const locName = (t: Incidencia) => resolveLocation(t, aptById, espacioById, grupoById);
    const workerName = (t: Incidencia) =>
      t.id_assignat != null ? fullName(personaById.get(t.id_assignat)) : "";
    arr.sort((a, b) => {
      switch (sortKey) {
        case "prioridad": {
          const ra = a.prioritat_confirmada ? PRIORIDAD_RANK[a.prioritat_confirmada] : 3;
          const rb = b.prioritat_confirmada ? PRIORIDAD_RANK[b.prioritat_confirmada] : 3;
          return ra - rb;
        }
        case "fecha_prevista": {
          if (!a.data_prevista && !b.data_prevista) return 0;
          if (!a.data_prevista) return 1;
          if (!b.data_prevista) return -1;
          return a.data_prevista.localeCompare(b.data_prevista);
        }
        case "fecha_inicio": {
          if (!a.iniciat_en && !b.iniciat_en) return 0;
          if (!a.iniciat_en) return 1;
          if (!b.iniciat_en) return -1;
          return a.iniciat_en.localeCompare(b.iniciat_en);
        }
        case "fecha_fin": {
          if (!a.finalitzat_en && !b.finalitzat_en) return 0;
          if (!a.finalitzat_en) return 1;
          if (!b.finalitzat_en) return -1;
          return b.finalitzat_en.localeCompare(a.finalitzat_en);
        }
        case "titulo":
          return a.titol.localeCompare(b.titol);
        case "ubicacion":
          return locName(a).localeCompare(locName(b));
        case "operario":
          return workerName(a).localeCompare(workerName(b));
        default:
          return 0;
      }
    });
    return arr;
  }, [filteredTareas, sortKey, aptById, espacioById, grupoById, personaById]);

  async function handleConfirmarAsignacion(
    inc: Incidencia,
    workerId: number,
    fecha: string | null,
    prioridad: "alta" | "normal" | "baixa",
  ) {
    await actions.confirmarAsignacion(inc, workerId, fecha, prioridad);
    setAssignTarget(null);
  }

  const pendientes = pendientesQ.data ?? [];

  return (
    <AppShell title="Mantenimiento">
      <div className="space-y-6">
        {(editable || (reclamacionesAbiertasCountQ.data ?? 0) > 0) && (
          <div className="flex justify-end items-center gap-2">
            {(reclamacionesAbiertasCountQ.data ?? 0) > 0 && (
              <Button
                size="sm"
                className={cn(
                  "h-8 text-xs",
                  reclamacionFilter === "abierta"
                    ? "bg-red-900 hover:bg-red-900 text-white ring-2 ring-inset ring-red-950"
                    : "bg-red-600 hover:bg-red-700 text-white",
                )}
                onClick={() => {
                  if (reclamacionFilter === "abierta") {
                    setFiltro("asignadas_curso");
                    setReclamacionFilter("todas");
                  } else {
                    setFiltro("todas");
                    setReclamacionFilter("abierta");
                  }
                }}
              >
                <Euro className="h-3.5 w-3.5" />
                {reclamacionesAbiertasCountQ.data} pendientes de cobro
              </Button>
            )}
            {editable && (
              <Button
                className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
                onClick={() => setIncidenciaOpen(true)}
              >
                <Plus className="h-4 w-4" /> Nueva incidencia
              </Button>
            )}
          </div>
        )}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Nuevas {pendientes.length > 0 ? `(${pendientes.length})` : ""}
          </h2>
          {pendientesQ.isLoading && <div className="text-sm text-muted-foreground py-4">Cargando…</div>}
          {!pendientesQ.isLoading && pendientes.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">No hay incidencias pendientes de validar.</div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pendientes.map((inc) => (
              <NuevaCard
                key={inc.id_incidencia}
                inc={inc}
                location={resolveLocation(inc, aptById, espacioById, grupoById)}
                reporter={inc.id_reporter != null ? fullName(personaById.get(inc.id_reporter)) : "—"}
                reclamacionEstado={reclamacionEstadoByIncidencia.get(inc.id_incidencia)}
                editable={editable}
                onOpenDetail={() => setDetailId(inc.id_incidencia)}
                onRechazar={() => actions.rechazar(inc)}
                onAsignar={() => setAssignTarget(inc)}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tareas</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-lime-300 bg-lime-100 px-2 py-1.5">
                <span className="flex items-center gap-1 pl-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                  <Filter className="h-3.5 w-3.5" /> Filtros
                </span>
                <Select value={filtro} onValueChange={(v) => setFiltro(v as TareasFilter)}>
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asignadas_curso">Asignadas + en curso</SelectItem>
                    <SelectItem value="en_curso">Solo en curso</SelectItem>
                    <SelectItem value="finalizadas">Finalizadas</SelectItem>
                    <SelectItem value="rechazadas">Rechazadas</SelectItem>
                    <SelectItem value="todas">Todas</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={grupoFilter === "todos" ? "todos" : String(grupoFilter)}
                  onValueChange={(v) => {
                    setGrupoFilter(v === "todos" ? "todos" : Number(v));
                    setUbicacionFilter("todos");
                  }}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los grupos</SelectItem>
                    {(gruposQ.data ?? []).map((g) => (
                      <SelectItem key={g.id_grupo} value={String(g.id_grupo)}>
                        {g.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={ubicacionFilter} onValueChange={(v) => setUbicacionFilter(v as UbicacionFilter)}>
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los apt./espacios</SelectItem>
                    {aptOptionsForFilter.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Apartamentos</SelectLabel>
                        {aptOptionsForFilter.map((a) => (
                          <SelectItem key={`apt-${a.id_apt}`} value={`apt-${a.id_apt}`}>
                            {a.nombre}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {espacioOptionsForFilter.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Espacios comunes</SelectLabel>
                        {espacioOptionsForFilter.map((e) => (
                          <SelectItem key={`esp-${e.id_tipo}`} value={`esp-${e.id_tipo}`}>
                            {e.nombre}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                <Select
                  value={operarioFilter === "todos" || operarioFilter === "sin_asignar" ? operarioFilter : String(operarioFilter)}
                  onValueChange={(v) => setOperarioFilter(v === "todos" || v === "sin_asignar" ? v : Number(v))}
                >
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los operarios</SelectItem>
                    <SelectItem value="sin_asignar">Sin asignar</SelectItem>
                    {operarioOptionsForFilter.map((w) => (
                      <SelectItem key={w.id_persona} value={String(w.id_persona)}>
                        {fullName(w)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={reclamacionFilter} onValueChange={(v) => setReclamacionFilter(v as ReclamacionFilter)}>
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="abierta">Con reclamación abierta</SelectItem>
                    <SelectItem value="cerrada">Con reclamación cerrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden h-6 w-px bg-border sm:block" />
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-200 px-2 py-1.5">
                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                  <ArrowUpDown className="h-3.5 w-3.5" /> Ordenar por
                </span>
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prioridad">Prioridad</SelectItem>
                    <SelectItem value="fecha_prevista">Fecha prevista</SelectItem>
                    <SelectItem value="fecha_inicio">Fecha inicio</SelectItem>
                    <SelectItem value="fecha_fin">Fecha fin</SelectItem>
                    <SelectItem value="titulo">Título</SelectItem>
                    <SelectItem value="ubicacion">Apartamento/espacio</SelectItem>
                    <SelectItem value="operario">Operario asignado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {tareasQ.isLoading && <div className="text-sm text-muted-foreground py-4">Cargando…</div>}
            {!tareasQ.isLoading && sortedTareas.length === 0 && (
              <div className="text-sm text-muted-foreground py-4">No hay tareas para este filtro.</div>
            )}
            {sortedTareas.map((t) => (
              <TareaRow
                key={t.id_incidencia}
                inc={t}
                sesiones={registreByIncidencia.get(t.id_incidencia) ?? []}
                location={resolveLocation(t, aptById, espacioById, grupoById)}
                worker={t.id_assignat != null ? personaById.get(t.id_assignat) : null}
                personaById={personaById}
                adjuntoTipos={adjuntoTiposByIncidencia.get(t.id_incidencia) ?? new Set()}
                reclamacionEstado={reclamacionEstadoByIncidencia.get(t.id_incidencia)}
                editable={editable}
                onOpenDetail={() => setDetailId(t.id_incidencia)}
                onIniciar={() => actions.iniciar(t, t.id_assignat)}
                onFinParcial={() => actions.finParcial(t, t.id_assignat, registreByIncidencia.get(t.id_incidencia) ?? [])}
                onFinTotal={() => actions.finTotal(t)}
                onReasignar={() => setAssignTarget(t)}
              />
            ))}
          </div>
        </section>
      </div>

      <AsignarDialog
        inc={assignTarget}
        workers={workersQ.data ?? []}
        onOpenChange={(o) => {
          if (!o) setAssignTarget(null);
        }}
        onConfirm={handleConfirmarAsignacion}
      />

      <MantenimientoPopover
        idIncidencia={detailId}
        onOpenChange={(o) => {
          if (!o) {
            setDetailId(null);
            refetchLists();
          }
        }}
        onSaved={refetchLists}
        workers={workersQ.data ?? []}
      />

      {persona && (
        <ReportarIncidenciaSheet
          open={incidenciaOpen}
          onOpenChange={setIncidenciaOpen}
          reporterId={persona.id_persona}
          context={incidenciaContext}
          onSaved={refetchLists}
        />
      )}
    </AppShell>
  );
}

function NuevaCard({
  inc,
  location,
  reporter,
  reclamacionEstado,
  editable,
  onOpenDetail,
  onRechazar,
  onAsignar,
}: {
  inc: Incidencia;
  location: string;
  reporter: string;
  reclamacionEstado: ReclamacionEstado | undefined;
  editable: boolean;
  onOpenDetail: () => void;
  onRechazar: () => void;
  onAsignar: () => void;
}) {
  return (
    <Card
      className="p-3 space-y-2 bg-white cursor-pointer hover:shadow-md transition-shadow"
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpenDetail();
      }}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <TipoBadge tipus={inc.tipus} />
        <PrioridadPill prioridad={inc.prioritat_proposta} />
        {reclamacionEstado && <ReclamacionIndicator estado={reclamacionEstado} />}
      </div>
      {inc.descripcio && (
        <div className="text-sm text-foreground font-medium line-clamp-2">{inc.descripcio}</div>
      )}
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Home className="h-3 w-3 shrink-0" />
        {location}
      </div>
      <div className="text-xs text-muted-foreground">Reportado por {reporter}</div>
      {editable && (
        <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
            onClick={onRechazar}
          >
            Rechazar
          </Button>
          <Button size="sm" className="flex-1 bg-[#26215C] hover:bg-[#1e1a48] text-white" onClick={onAsignar}>
            Asignar
          </Button>
        </div>
      )}
    </Card>
  );
}

function TareaRow({
  inc,
  sesiones,
  location,
  worker,
  personaById,
  adjuntoTipos,
  reclamacionEstado,
  editable,
  onOpenDetail,
  onIniciar,
  onFinParcial,
  onFinTotal,
  onReasignar,
}: {
  inc: Incidencia;
  sesiones: Registre[];
  location: string;
  worker: PersonaLite | null | undefined;
  personaById: Map<number, PersonaLite>;
  adjuntoTipos: Set<string>;
  reclamacionEstado: ReclamacionEstado | undefined;
  editable: boolean;
  onOpenDetail: () => void;
  onIniciar: () => void;
  onFinParcial: () => void;
  onFinTotal: () => void;
  onReasignar: () => void;
}) {
  const hasOpenSession = sesiones.some((s) => s.fi == null && s.id_persona === inc.id_assignat);
  const closedSessions = sesiones.filter((s) => s.fi != null);
  const totalHoras = closedSessions.reduce((sum, s) => sum + (s.hores ?? 0), 0);
  const panel = rightPanelStyle(inc.estat, sesiones.length);

  return (
    <Card
      className="p-0 overflow-hidden bg-white cursor-pointer hover:shadow-md transition-shadow"
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpenDetail();
      }}
    >
      <div className="flex flex-col md:flex-row">
        <div className="flex-1 min-w-0 p-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <TipoBadge tipus={inc.tipus} />
            <EstadoPill estat={inc.estat} />
            <div className="flex items-center gap-1.5 text-xs text-foreground">
              <Home className="h-3 w-3 shrink-0" />
              <span>{location}</span>
              <span>·</span>
              <span>{worker ? (worker.codigo ?? fullName(worker)) : "Sin asignar"}</span>
              {adjuntoTipos.size > 0 && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  {ADJUNTO_TIPO_ICONS.filter((o) => adjuntoTipos.has(o.tipo)).map((o) => (
                    <span key={o.tipo} title={o.title}>
                      <o.Icon className="h-3 w-3" />
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
          {inc.descripcio && (
            <div className="text-sm text-foreground font-medium line-clamp-2">{inc.descripcio}</div>
          )}
          {editable && (
            <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
              {worker && (
                <span className="text-xs text-muted-foreground mr-1">{fullName(worker)}</span>
              )}
              {inc.estat === "validada" && !hasOpenSession && (
                <Button size="sm" className="bg-[#26215C] hover:bg-[#1e1a48] text-white" onClick={onIniciar}>
                  Iniciar
                </Button>
              )}
              {inc.estat === "en_curs" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-700 hover:bg-amber-50"
                    onClick={onFinParcial}
                  >
                    Fin parcial
                  </Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onFinTotal}>
                    Fin total
                  </Button>
                </>
              )}
              {(inc.estat === "validada" || inc.estat === "en_curs") && (
                <Button size="sm" variant="outline" onClick={onReasignar}>
                  Reasignar
                </Button>
              )}
            </div>
          )}
        </div>
        {reclamacionEstado && (
          <div className="shrink-0 flex items-center justify-center px-2">
            <ReclamacionIndicator estado={reclamacionEstado} />
          </div>
        )}
        <div
          className="shrink-0 flex flex-col justify-center gap-1 px-3 py-2 text-xs leading-tight w-full md:w-[288px] md:min-w-[288px] md:max-w-[288px]"
          style={{
            backgroundColor: panel.bg,
            borderLeft: panel.borderColor ? `3px solid ${panel.borderColor}` : undefined,
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              <OcupacionPopoverTrigger idApt={inc.id_apt} initialDateISO={inc.data_prevista} underline={false}>
                Prevista: {inc.data_prevista ? fmtDate(inc.data_prevista) : "—"}
                {inc.data_reprogramada_por_operario && (
                  <span title="Fecha modificada por el operario">
                    <RotateCcw className="inline-block h-3 w-3 ml-1 text-amber-600" />
                  </span>
                )}
              </OcupacionPopoverTrigger>
            </span>
            <PrioridadPill prioridad={inc.prioritat_confirmada} />
          </div>
          {sesiones.length === 0 ? (
            <div className="text-muted-foreground italic">Sin sesiones aún</div>
          ) : (
            sesiones.map((s) => {
              const codigo = personaById.get(s.id_persona)?.codigo ?? "";
              return (
                <div key={s.id_registre}>
                  <span className="inline-block rounded bg-muted px-1 py-0.5 font-medium">{codigo}</span>{" "}
                  {fmtDateTime(s.inici)} →{" "}
                  {s.fi ? fmtDateTime(s.fi) : <span className="text-[#378ADD] font-medium">en curso</span>}
                  {s.fi && s.hores != null && (
                    <span className="text-muted-foreground"> · {formatHHMM(s.hores)}</span>
                  )}
                </div>
              );
            })
          )}
          {closedSessions.length > 0 && <div className="font-medium pt-0.5">Total: {formatHHMM(totalHoras)} hrs.</div>}
        </div>
      </div>
    </Card>
  );
}
