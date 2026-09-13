import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fmtDate } from "@/lib/format";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { useGruposLite, useEspaciosLite, useMantenimientoWorkers } from "@/hooks/use-mantenimiento";
import { MantenimientoPopover } from "@/components/mantenimiento-popover";
import {
  useApartamentosConActivoLite,
  useIncidenciasPreventivas,
  useMantenimientoPreventivoActions,
  useTareasPreventivasAplicaciones,
  useTareasPreventivasConMeses,
  type AptConActivo,
  type GenerarItem,
} from "@/hooks/use-mantenimiento-preventivo";
import { TareaPreventivaDialog } from "@/components/mantenimiento-preventivo-tarea-dialog";
import { MantenimientoPreventivoPlanning } from "@/components/mantenimiento-preventivo-planning";
import {
  MES_LABELS_LARGO,
  PREVENTIVO_COLOR_PROXIMA,
  PREVENTIVO_COLOR_VENCIDA,
  computeLocationPending,
  diasEntre,
  incidenciaLocationKey,
  locationKey,
  locationLabel,
  periodicidadLabel,
  resolveConcreteLocations,
  todayISO,
  type AplicacionPreventiva,
  type ConcreteLocation,
  type IncidenciaPreventivaLite,
  type PendingInfo,
  type TareaPreventivaConMeses,
} from "@/lib/mantenimiento-preventivo";
import type { GrupoLite, EspacioLite } from "@/lib/mantenimiento";

function PendingBadge({ pending }: { pending: PendingInfo }) {
  const today = todayISO();
  if (pending.estado === "vencida") {
    const dias = diasEntre(pending.targetDate, today);
    return (
      <span
        className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
        style={{ backgroundColor: "#FEE2E2", color: "#7F1D1D" }}
      >
        Vencida{dias > 0 ? ` · hace ${dias} día${dias === 1 ? "" : "s"}` : ""}
      </span>
    );
  }
  const dias = diasEntre(today, pending.targetDate);
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: "#FEF3C7", color: PREVENTIVO_COLOR_PROXIMA }}
    >
      Próxima{dias > 0 ? ` · en ${dias} día${dias === 1 ? "" : "s"}` : ""}
    </span>
  );
}

function proximaLabel(pending: PendingInfo): string {
  if (pending.mes != null)
    return `${MES_LABELS_LARGO[pending.mes]} ${pending.targetDate.slice(0, 4)}`;
  return fmtDate(pending.targetDate);
}

function ultimaLabel(incidenciasAtLocation: IncidenciaPreventivaLite[]): string {
  const closures = incidenciasAtLocation.filter(
    (i) => i.estat === "finalitzada" && i.finalitzat_en,
  );
  if (closures.length === 0) return "—";
  const last = closures.sort((a, b) => b.finalitzat_en!.localeCompare(a.finalitzat_en!))[0];
  return fmtDate(last.finalitzat_en);
}

function PendingRow({
  location,
  pending,
  incidenciasAtLocation,
  grupoById,
  espacioById,
  editable,
  onGenerar,
  indent,
}: {
  location: ConcreteLocation;
  pending: PendingInfo;
  incidenciasAtLocation: IncidenciaPreventivaLite[];
  grupoById: Map<number, GrupoLite>;
  espacioById: Map<number, EspacioLite>;
  editable: boolean;
  onGenerar: () => void;
  indent?: boolean;
}) {
  const { grupo, detalle } = locationLabel(location, grupoById, espacioById);
  return (
    <div
      className={`flex items-center gap-3.5 py-2.5 ${indent ? "" : "px-5"} border-t first:border-t-0`}
    >
      <div className="flex-1 text-sm min-w-0">
        {indent ? (
          detalle
        ) : (
          <>
            <span className="font-medium">{grupo}</span>{" "}
            <span className="text-muted-foreground">· {detalle}</span>
          </>
        )}
      </div>
      <div className="w-[110px] text-xs text-muted-foreground shrink-0">
        Última: {ultimaLabel(incidenciasAtLocation)}
      </div>
      <div className="w-[130px] text-xs text-muted-foreground shrink-0">
        Próxima: {proximaLabel(pending)}
      </div>
      <PendingBadge pending={pending} />
      {editable && (
        <Button
          size="sm"
          className="h-8 bg-[#26215C] hover:bg-[#1e1a48] text-white shrink-0"
          onClick={onGenerar}
        >
          Generar
        </Button>
      )}
    </div>
  );
}

function TareaCard({
  tarea,
  aplicacionesTarea,
  incidenciasTarea,
  apartamentos,
  grupoById,
  espacioById,
  today,
  editable,
  onVerPlanning,
  onEditar,
  onGenerarUno,
}: {
  tarea: TareaPreventivaConMeses;
  aplicacionesTarea: AplicacionPreventiva[];
  incidenciasTarea: IncidenciaPreventivaLite[];
  apartamentos: AptConActivo[];
  grupoById: Map<number, GrupoLite>;
  espacioById: Map<number, EspacioLite>;
  today: string;
  editable: boolean;
  onVerPlanning: () => void;
  onEditar: () => void;
  onGenerarUno: (location: ConcreteLocation, pending: PendingInfo) => void;
}) {
  const incidenciasByLocKey = useMemo(() => {
    const m = new Map<string, IncidenciaPreventivaLite[]>();
    for (const i of incidenciasTarea) {
      const k = incidenciaLocationKey(i);
      const arr = m.get(k) ?? [];
      arr.push(i);
      m.set(k, arr);
    }
    return m;
  }, [incidenciasTarea]);

  function pendingFor(loc: ConcreteLocation): PendingInfo | null {
    return computeLocationPending(
      tarea,
      loc.scopeSince,
      incidenciasByLocKey.get(locationKey(loc)) ?? [],
      today,
    );
  }

  return (
    <Card className="p-0 overflow-hidden bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-4 border-b">
        <div className="flex flex-wrap items-baseline gap-3">
          <div className="text-[17px] font-semibold">{tarea.nombre}</div>
          <div className="text-[13px] text-muted-foreground">{periodicidadLabel(tarea)}</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onVerPlanning}
            className="text-[13px] font-medium text-primary hover:underline"
          >
            Ver planning anual →
          </button>
          {editable && (
            <Button size="sm" variant="outline" className="h-[30px] text-xs" onClick={onEditar}>
              Editar
            </Button>
          )}
        </div>
      </div>

      {aplicacionesTarea.map((ap) => {
        if (ap.modo_aplicacion === "espacio_comun") {
          const [loc] = resolveConcreteLocations(tarea.creado_en, [ap], apartamentos);
          if (!loc) return null;
          const pending = pendingFor(loc);
          if (!pending) {
            const { grupo, detalle } = locationLabel(loc, grupoById, espacioById);
            return (
              <div
                key={ap.id_aplicacion}
                className="px-5 py-2.5 text-[13px] text-muted-foreground border-t first:border-t-0"
              >
                {grupo} · {detalle} — sin tareas pendientes ahora mismo
              </div>
            );
          }
          return (
            <PendingRow
              key={ap.id_aplicacion}
              location={loc}
              pending={pending}
              incidenciasAtLocation={incidenciasByLocKey.get(locationKey(loc)) ?? []}
              grupoById={grupoById}
              espacioById={espacioById}
              editable={editable}
              onGenerar={() => onGenerarUno(loc, pending)}
            />
          );
        }

        const locs = resolveConcreteLocations(tarea.creado_en, [ap], apartamentos);
        const withPending = locs
          .map((loc) => ({ loc, pending: pendingFor(loc) }))
          .filter((r): r is { loc: ConcreteLocation; pending: PendingInfo } => r.pending != null);
        const grupoNombre = grupoById.get(ap.id_grupo)?.nombre ?? `#${ap.id_grupo}`;

        if (withPending.length === 0) {
          return (
            <div
              key={ap.id_aplicacion}
              className="px-5 py-2.5 text-[13px] text-muted-foreground border-t first:border-t-0"
            >
              {grupoNombre} · sin tareas pendientes ahora mismo
            </div>
          );
        }

        const nVencidas = withPending.filter((r) => r.pending.estado === "vencida").length;
        const nProximas = withPending.filter((r) => r.pending.estado === "proxima").length;
        const restantes = locs.length - withPending.length;

        return (
          <Collapsible key={ap.id_aplicacion} defaultOpen className="border-t first:border-t-0">
            <CollapsibleTrigger className="flex w-full items-center gap-3 px-5 py-3 text-left group">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              <div className="flex-1 text-sm min-w-0">
                <span className="font-medium">{grupoNombre}</span>{" "}
                <span className="text-muted-foreground">
                  · todos los apartamentos ({locs.length})
                </span>
              </div>
              {nVencidas > 0 && (
                <span className="text-[13px] font-semibold" style={{ color: "#7F1D1D" }}>
                  {nVencidas} vencida{nVencidas === 1 ? "" : "s"}
                </span>
              )}
              {nProximas > 0 && (
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: PREVENTIVO_COLOR_PROXIMA }}
                >
                  {nProximas} próxima{nProximas === 1 ? "" : "s"}
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-[38px] pr-5 pb-2">
              {withPending.map(({ loc, pending }) => (
                <PendingRow
                  key={locationKey(loc)}
                  location={loc}
                  pending={pending}
                  incidenciasAtLocation={incidenciasByLocKey.get(locationKey(loc)) ?? []}
                  grupoById={grupoById}
                  espacioById={espacioById}
                  editable={editable}
                  onGenerar={() => onGenerarUno(loc, pending)}
                  indent
                />
              ))}
              {restantes > 0 && (
                <div className="pt-2 border-t text-[13px] text-muted-foreground">
                  + {restantes} apartamento{restantes === 1 ? "" : "s"} sin nada pendiente ahora
                  mismo —{" "}
                  <button
                    type="button"
                    onClick={onVerPlanning}
                    className="text-primary hover:underline"
                  >
                    ver planning anual →
                  </button>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </Card>
  );
}

export function MantenimientoPreventivoTab({ editable }: { editable: boolean }) {
  const { persona } = useCurrentPersonal();
  const [view, setView] = useState<"queue" | "planning">("queue");
  const [planningTareaId, setPlanningTareaId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTareaId, setEditingTareaId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const {
    data: tareas,
    isLoading: tareasLoading,
    refetch: refetchTareas,
  } = useTareasPreventivasConMeses();
  const aplicacionesQ = useTareasPreventivasAplicaciones();
  const incidenciasQ = useIncidenciasPreventivas();
  const apartamentosQ = useApartamentosConActivoLite();
  const gruposQ = useGruposLite();
  const espaciosQ = useEspaciosLite();
  const workersQ = useMantenimientoWorkers();

  const grupoById = useMemo(
    () => new Map((gruposQ.data ?? []).map((g) => [g.id_grupo, g])),
    [gruposQ.data],
  );
  const espacioById = useMemo(
    () => new Map((espaciosQ.data ?? []).map((e) => [e.id_tipo, e])),
    [espaciosQ.data],
  );

  function refetchAll() {
    incidenciasQ.refetch();
    aplicacionesQ.refetch();
    refetchTareas();
  }

  const { guardarTarea, generarOcurrencias } = useMantenimientoPreventivoActions(refetchAll);

  const tareasActivas = useMemo(() => (tareas ?? []).filter((t) => t.activo), [tareas]);
  const aplicaciones = useMemo(() => aplicacionesQ.data ?? [], [aplicacionesQ.data]);
  const incidencias = useMemo(() => incidenciasQ.data ?? [], [incidenciasQ.data]);
  const apartamentos = useMemo(() => apartamentosQ.data ?? [], [apartamentosQ.data]);
  const today = todayISO();

  // Every currently-pending (tarea, location) pair across all active tareas —
  // the summary strip and "Generar todas las vencidas" both fold over this,
  // recomputed here once rather than duplicating the per-card traversal.
  const allPending = useMemo(() => {
    const out: {
      tarea: TareaPreventivaConMeses;
      location: ConcreteLocation;
      pending: PendingInfo;
    }[] = [];
    for (const tarea of tareasActivas) {
      const aplicacionesTarea = aplicaciones.filter(
        (a) => a.id_tarea_preventiva === tarea.id_tarea_preventiva,
      );
      const locations = resolveConcreteLocations(tarea.creado_en, aplicacionesTarea, apartamentos);
      const incidenciasTarea = incidencias.filter(
        (i) => i.id_tarea_preventiva === tarea.id_tarea_preventiva,
      );
      const byLocKey = new Map<string, IncidenciaPreventivaLite[]>();
      for (const i of incidenciasTarea) {
        const k = incidenciaLocationKey(i);
        const arr = byLocKey.get(k) ?? [];
        arr.push(i);
        byLocKey.set(k, arr);
      }
      for (const loc of locations) {
        const pending = computeLocationPending(
          tarea,
          loc.scopeSince,
          byLocKey.get(locationKey(loc)) ?? [],
          today,
        );
        if (pending) out.push({ tarea, location: loc, pending });
      }
    }
    return out;
  }, [tareasActivas, aplicaciones, apartamentos, incidencias, today]);

  const vencidas = allPending.filter((p) => p.pending.estado === "vencida");
  const proximas = allPending.filter((p) => p.pending.estado === "proxima");

  async function handleGenerarUno(
    tarea: TareaPreventivaConMeses,
    location: ConcreteLocation,
    pending: PendingInfo,
  ) {
    if (!persona) return;
    await generarOcurrencias(
      [{ tarea, location, fechaPrevista: pending.targetDate }],
      persona.id_persona,
    );
  }

  async function handleGenerarTodasVencidas() {
    if (!persona || vencidas.length === 0) return;
    await generarOcurrencias(
      vencidas.map((p) => ({
        tarea: p.tarea,
        location: p.location,
        fechaPrevista: p.pending.targetDate,
      })),
      persona.id_persona,
    );
  }

  async function handleGenerarFromPlanning(items: GenerarItem[], asignarA?: number | null) {
    if (!persona) return false;
    return generarOcurrencias(items, persona.id_persona, asignarA);
  }

  function openEditDialog(id: number | null) {
    setEditingTareaId(id);
    setDialogOpen(true);
  }

  const editingTarea = useMemo(() => {
    if (editingTareaId == null) return null;
    const t =
      tareasActivas.find((x) => x.id_tarea_preventiva === editingTareaId) ??
      (tareas ?? []).find((x) => x.id_tarea_preventiva === editingTareaId);
    if (!t) return null;
    return {
      ...t,
      aplicaciones: aplicaciones.filter((a) => a.id_tarea_preventiva === editingTareaId),
    };
  }, [editingTareaId, tareasActivas, tareas, aplicaciones]);

  if (view === "planning") {
    return (
      <>
        <MantenimientoPreventivoPlanning
          tareas={tareasActivas}
          aplicaciones={aplicaciones}
          incidencias={incidencias}
          apartamentos={apartamentos}
          grupoById={grupoById}
          espacioById={espacioById}
          workers={workersQ.data ?? []}
          selectedTareaId={planningTareaId}
          onSelectTarea={setPlanningTareaId}
          onBack={() => setView("queue")}
          onOpenIncidencia={setDetailId}
          onGenerar={handleGenerarFromPlanning}
        />
        <MantenimientoPopover
          idIncidencia={detailId}
          onOpenChange={(o) => {
            if (!o) {
              setDetailId(null);
              refetchAll();
            }
          }}
          onSaved={refetchAll}
          workers={workersQ.data ?? []}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[23px] font-bold">Mantenimiento preventivo</div>
          <div className="text-sm text-muted-foreground mt-1">
            Cola de generación: solo lo pendiente de generar. Asignar, reasignar, cambiar fechas y
            ver el histórico se hace desde el planning anual de cada tarea.
          </div>
        </div>
        {editable && (
          <Button variant="outline" onClick={() => openEditDialog(null)}>
            + Nueva tarea preventiva
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: "#FEE2E2", color: "#7F1D1D" }}
        >
          {vencidas.length} vencida{vencidas.length === 1 ? "" : "s"}
        </span>
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: "#FEF3C7", color: PREVENTIVO_COLOR_PROXIMA }}
        >
          {proximas.length} próxima{proximas.length === 1 ? "" : "s"} (≤15 días)
        </span>
        <div className="flex-1" />
        {editable && vencidas.length > 0 && (
          <Button
            size="sm"
            className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
            onClick={handleGenerarTodasVencidas}
          >
            Generar todas las vencidas ({vencidas.length})
          </Button>
        )}
      </div>

      {tareasLoading && <div className="text-sm text-muted-foreground py-4">Cargando…</div>}
      {!tareasLoading && tareasActivas.length === 0 && (
        <div className="text-sm text-muted-foreground py-4">
          No hay tareas preventivas activas todavía.
        </div>
      )}

      <div className="space-y-4">
        {tareasActivas.map((tarea) => (
          <TareaCard
            key={tarea.id_tarea_preventiva}
            tarea={tarea}
            aplicacionesTarea={aplicaciones.filter(
              (a) => a.id_tarea_preventiva === tarea.id_tarea_preventiva,
            )}
            incidenciasTarea={incidencias.filter(
              (i) => i.id_tarea_preventiva === tarea.id_tarea_preventiva,
            )}
            apartamentos={apartamentos}
            grupoById={grupoById}
            espacioById={espacioById}
            today={today}
            editable={editable}
            onVerPlanning={() => {
              setPlanningTareaId(tarea.id_tarea_preventiva);
              setView("planning");
            }}
            onEditar={() => openEditDialog(tarea.id_tarea_preventiva)}
            onGenerarUno={(loc, pending) => handleGenerarUno(tarea, loc, pending)}
          />
        ))}
      </div>

      <div className="text-xs text-muted-foreground text-center pt-2">
        Al pulsar "Generar" se crea una incidencia normal en Mantenimiento (pendiente de validar y
        asignar). Asignar, reasignar, cambiar fechas y ver el histórico de cada ubicación se hace
        desde "Ver planning anual" — esta pantalla es solo la cola de generación.
      </div>

      <TareaPreventivaDialog
        open={dialogOpen}
        tarea={editingTarea}
        grupos={gruposQ.data ?? []}
        espacios={espaciosQ.data ?? []}
        onOpenChange={setDialogOpen}
        onSave={(input) => guardarTarea(input, persona?.id_persona ?? null)}
      />
    </div>
  );
}
