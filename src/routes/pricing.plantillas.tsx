import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronRight, CircleCheck, Clock, Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import {
  fetchPlantillas, fetchEventos, fetchTemporadas, formatEfecto,
  edicionesPorAnio, proximaEdicionPlantilla, anotarEstadoEdiciones, anioAComprobar,
  esFuenteDesactualizada, fuentesPendientes, estadoPeorFuente, updateFuenteVerificacion, type FuenteEstadoVerificacion,
  type EventoCategoria, type EventoPeriodicidad, type EventoEstado, type Evento,
  type Plantilla, type EdicionAnioEstado,
} from "@/lib/pricing";
import { fmtDate } from "@/lib/format";
import { CategoriaBadge, AplicaABadge } from "@/components/pricing-badges";
import { PlantillaEditDialog, CATEGORIA_OPTIONS } from "@/components/plantilla-edit-dialog";
import { EventoFormDialog } from "@/components/evento-form-dialog";
import { FilterField } from "@/components/filter-field";
import { PlantillaCreateDialog } from "@/components/plantilla-create-dialog";
import { SortHeader } from "@/components/sort-header";
import { comprobarFuente } from "@/lib/api/fuentes.functions";
import { FuentesPendientesNotice } from "@/components/fuentes-pendientes-notice";
import {
  ESTADO_VERIFICACION_DOT, ESTADO_VERIFICACION_LABEL, ESTADO_VERIFICACION_STYLES, type EstadoBadge,
} from "@/lib/pricing-styles";

type RevisarAlcance = "todas" | "pendientes";
type RevisarPendientes = "marcadas" | "desactualizadas" | "ambas";

type SortKey = "nombre" | "categoria" | "aplica_a" | "periodicidad" | "activo" | "fuentes" | "proxima";

type PlantillasTab = "plantillas" | "fuentes";

export const Route = createFileRoute("/pricing/plantillas")({
  // ?tab=fuentes deep-links to the "Fuentes a revisar" tab (used by the pending notice).
  validateSearch: (search: Record<string, unknown>): { tab?: "fuentes" } =>
    search.tab === "fuentes" ? { tab: "fuentes" } : {},
  component: PlantillasPage,
});

const CATEGORIA_FILTER_OPTIONS: { value: "todas" | EventoCategoria; label: string }[] = [
  { value: "todas", label: "Todas" },
  ...CATEGORIA_OPTIONS,
];

const PERIODICIDAD_LABEL: Record<EventoPeriodicidad, string> = {
  anual: "Anual",
  bianual: "Bianual",
  trianual: "Trianual",
  puntual: "Puntual",
};

/** Green check when the edition's dates are confirmed, amber clock while still provisional. */
function ConfirmMarker({ estado }: { estado: EventoEstado }) {
  if (estado === "confirmado") {
    return (
      <span title="Fechas confirmadas" aria-label="Fechas confirmadas" className="inline-flex shrink-0 text-green-600">
        <CircleCheck className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (estado === "propuesto") {
    return (
      <span
        title="Fechas provisionales — pendientes de confirmación oficial"
        aria-label="Fechas provisionales"
        className="inline-flex shrink-0 text-amber-600"
      >
        <Clock className="h-3.5 w-3.5" />
      </span>
    );
  }
  return null;
}

const ANIO_COLOR: Record<EdicionAnioEstado, string> = {
  pasada: "text-slate-400",
  actual: "text-slate-900",
  proxima: "text-slate-900",
  futura: "text-slate-700",
};

const PRINCIPAL_COLOR: Record<EdicionAnioEstado, string> = {
  pasada: "text-slate-500",
  actual: "text-slate-900",
  proxima: "text-slate-900",
  futura: "text-slate-900",
};

const MUTED_COLOR: Record<EdicionAnioEstado, string> = {
  pasada: "text-slate-300",
  actual: "text-slate-400",
  proxima: "text-slate-400",
  futura: "text-slate-400",
};

const ROW_BG: Record<EdicionAnioEstado, string> = {
  pasada: "bg-slate-50/70",
  actual: "bg-blue-50",
  proxima: "",
  futura: "",
};

/** Worst-fuente indicator for the Fuentes cell; stale counts as amber, like in the edit dialog. */
function EstadoDot({ estado }: { estado: FuenteEstadoVerificacion | null }) {
  if (!estado) return null;
  return (
    <span
      title={ESTADO_VERIFICACION_LABEL[estado]}
      aria-label={`Estado de las fuentes: ${ESTADO_VERIFICACION_LABEL[estado]}`}
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", ESTADO_VERIFICACION_DOT[estado])}
    />
  );
}

function PlantillasPage() {
  const { canEdit } = usePermissions();
  const canEditPlantillas = canEdit("pricing_plantillas");
  const canEditEventos = canEdit("pricing_eventos");
  const navigate = Route.useNavigate();
  const tab: PlantillasTab = Route.useSearch().tab ?? "plantillas";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [soloMarcadas, setSoloMarcadas] = useState(false);
  const [categoriaFilter, setCategoriaFilter] = useState<"todas" | EventoCategoria>("todas");
  const [sortKey, setSortKey] = useState<SortKey>("proxima");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingEvento, setEditingEvento] = useState<Evento | null>(null);
  const [creatingEdicionFor, setCreatingEdicionFor] = useState<Plantilla | null>(null);
  const [revisarAlcance, setRevisarAlcance] = useState<RevisarAlcance>("pendientes");
  const [revisarPendientes, setRevisarPendientes] = useState<RevisarPendientes>("ambas");
  const [revisando, setRevisando] = useState<{ hecho: number; total: number } | null>(null);

  const q = useQuery({ queryKey: ["pricing-plantillas"], queryFn: fetchPlantillas });
  const eventosQ = useQuery({ queryKey: ["pricing-eventos"], queryFn: fetchEventos });
  const temporadasQ = useQuery({ queryKey: ["pricing-temporadas"], queryFn: fetchTemporadas });
  const temporadaById = useMemo(
    () => new Map((temporadasQ.data ?? []).map((t) => [t.id, t])),
    [temporadasQ.data],
  );
  const editing = (q.data ?? []).find((p) => p.id === editingId) ?? null;
  const colSpan = canEditPlantillas ? 8 : 7;

  // Local-date ISO string, same convention pricing.eventos.tsx's own rango filter uses.
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const anioActual = useMemo(() => new Date().getFullYear(), []);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Independent of the other filters, so the queue is always visible regardless of what's shown below.
  const totalFuentesMarcadas = useMemo(
    () => (q.data ?? []).reduce((sum, p) => sum + p.plantillas_fuentes.filter((f) => f.revision_forzada).length, 0),
    [q.data],
  );

  const pendientes = useMemo(() => fuentesPendientes(q.data ?? []), [q.data]);

  // Computed once for every plantilla (not just expanded ones): the sortable "Próxima edición"
  // column needs it regardless of which rows are expanded.
  const proximaByPlantilla = useMemo(() => {
    const eventos = eventosQ.data ?? [];
    const map = new Map<string, Evento | null>();
    for (const p of q.data ?? []) map.set(p.id, proximaEdicionPlantilla(eventos, p.id, today));
    return map;
  }, [q.data, eventosQ.data, today]);

  const plantillas = useMemo(() => {
    const pick = (p: Plantilla) => {
      switch (sortKey) {
        case "nombre": return p.nombre;
        case "categoria": return p.categoria;
        case "aplica_a": return p.aplica_a;
        case "periodicidad": return p.periodicidad;
        case "activo": return p.activo ? 1 : 0;
        case "fuentes": return p.plantillas_fuentes.length;
        case "proxima": return null; // handled separately below
      }
    };
    return (q.data ?? [])
      .filter((p) => incluirInactivas || p.activo)
      .filter((p) => categoriaFilter === "todas" || p.categoria === categoriaFilter)
      .filter((p) => !soloMarcadas || p.plantillas_fuentes.some((f) => f.revision_forzada))
      .sort((a, b) => {
        if (sortKey === "proxima") {
          const av = proximaByPlantilla.get(a.id)?.fecha_inicio ?? null;
          const bv = proximaByPlantilla.get(b.id)?.fecha_inicio ?? null;
          // No upcoming edition sorts to the bottom regardless of direction.
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          const c = av.localeCompare(bv);
          return sortDir === "asc" ? c : -c;
        }
        const av = pick(a), bv = pick(b);
        const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? c : -c;
      });
  }, [q.data, sortKey, sortDir, incluirInactivas, categoriaFilter, soloMarcadas, proximaByPlantilla]);

  // One server call per fuente (looped here) keeps each request small and gives per-item progress.
  async function revisarFuentes() {
    const eventos = eventosQ.data ?? [];
    const activas = (q.data ?? [])
      .filter((p) => p.activo)
      .flatMap((p) => p.plantillas_fuentes.map((f) => ({ plantilla: p, fuente: f })));
    const fuentes =
      revisarAlcance === "todas"
        ? activas
        : revisarPendientes === "ambas"
          ? pendientes
          : activas.filter(({ fuente: f }) =>
              revisarPendientes === "marcadas" ? f.revision_forzada : esFuenteDesactualizada(f),
            );
    if (fuentes.length === 0) {
      toast.info("No hay fuentes que revisar con este alcance");
      return;
    }

    const cuenta: Record<FuenteEstadoVerificacion, number> = { ok: 0, roto: 0, dudosa: 0 };
    let errores = 0;
    setRevisando({ hecho: 0, total: fuentes.length });
    for (const [i, { plantilla, fuente }] of fuentes.entries()) {
      try {
        const anio = anioAComprobar(
          anotarEstadoEdiciones(edicionesPorAnio(eventos, plantilla.id), today, anioActual),
          anioActual,
        );
        const { resultado } = await comprobarFuente({ data: { url: fuente.url, nombre: plantilla.nombre, anio } });
        await updateFuenteVerificacion(fuente.id, resultado);
        cuenta[resultado]++;
      } catch {
        errores++;
      }
      setRevisando({ hecho: i + 1, total: fuentes.length });
    }
    setRevisando(null);
    await q.refetch();

    const resumen = `${cuenta.ok} OK · ${cuenta.roto} ${cuenta.roto === 1 ? "rota" : "rotas"} · ${cuenta.dudosa} ${cuenta.dudosa === 1 ? "dudosa" : "dudosas"}`;
    if (errores > 0) toast.warning(`${resumen} · ${errores} sin comprobar por error`);
    else toast.success(resumen);
  }

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  return (
    <AppShell title="Eventos-plantillas">
      <FuentesPendientesNotice />
      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: v === "fuentes" ? { tab: "fuentes" } : {}, replace: true })}
        className="w-full"
      >
      <TabsList className="mb-4">
        <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
        <TabsTrigger value="fuentes">Fuentes a revisar ({pendientes.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="plantillas" className="mt-0">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Categoría">
            <Select value={categoriaFilter} onValueChange={(v) => setCategoriaFilter(v as typeof categoriaFilter)}>
              <SelectTrigger className="w-auto min-w-[140px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIA_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <div className="flex items-center gap-2 h-9">
            <Checkbox
              id="incluir-inactivas"
              checked={incluirInactivas}
              onCheckedChange={(v) => setIncluirInactivas(!!v)}
            />
            <Label htmlFor="incluir-inactivas" className="text-sm font-normal cursor-pointer">
              Mostrar inactivas
            </Label>
          </div>
          <div className="flex items-center gap-2 h-9">
            <Checkbox
              id="solo-marcadas"
              checked={soloMarcadas}
              onCheckedChange={(v) => setSoloMarcadas(!!v)}
            />
            <Label htmlFor="solo-marcadas" className="text-sm font-normal cursor-pointer">
              Ver solo marcadas
            </Label>
          </div>
          {canEditPlantillas && (
            <div className="flex items-center gap-2">
              <ToggleGroup
                type="single"
                value={revisarAlcance}
                onValueChange={(v) => v && setRevisarAlcance(v as RevisarAlcance)}
                disabled={revisando !== null}
                className="h-9"
              >
                <ToggleGroupItem value="pendientes" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  Pendientes
                </ToggleGroupItem>
                <ToggleGroupItem value="todas" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  Todas
                </ToggleGroupItem>
              </ToggleGroup>
              {revisarAlcance === "pendientes" && (
                <Select
                  value={revisarPendientes}
                  onValueChange={(v) => setRevisarPendientes(v as RevisarPendientes)}
                  disabled={revisando !== null}
                >
                  <SelectTrigger className="w-auto min-w-[160px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambas">Ambas</SelectItem>
                    <SelectItem value="marcadas">Marcadas a mano</SelectItem>
                    <SelectItem value="desactualizadas">Desactualizadas</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" variant="outline" onClick={revisarFuentes} disabled={revisando !== null || q.isLoading || eventosQ.isLoading}>
                {revisando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                {revisando ? `Revisando ${revisando.hecho} de ${revisando.total}…` : "Revisar fuentes"}
              </Button>
            </div>
          )}
          <span className="text-sm text-muted-foreground">
            {totalFuentesMarcadas} fuente{totalFuentesMarcadas === 1 ? "" : "s"} marcada{totalFuentesMarcadas === 1 ? "" : "s"} para revisar
          </span>
        </div>
        {canEditPlantillas && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo evento
          </Button>
        )}
      </div>
      <Card className="overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader label="Nombre" active={sortKey === "nombre"} dir={sortDir} onClick={() => toggleSort("nombre")} /></TableHead>
              <TableHead><SortHeader label="Categoría" active={sortKey === "categoria"} dir={sortDir} onClick={() => toggleSort("categoria")} /></TableHead>
              <TableHead><SortHeader label="Aplica a" active={sortKey === "aplica_a"} dir={sortDir} onClick={() => toggleSort("aplica_a")} /></TableHead>
              <TableHead><SortHeader label="Periodicidad" active={sortKey === "periodicidad"} dir={sortDir} onClick={() => toggleSort("periodicidad")} /></TableHead>
              <TableHead><SortHeader label="Activo" active={sortKey === "activo"} dir={sortDir} onClick={() => toggleSort("activo")} /></TableHead>
              <TableHead><SortHeader label="Fuentes" active={sortKey === "fuentes"} dir={sortDir} onClick={() => toggleSort("fuentes")} /></TableHead>
              <TableHead><SortHeader label="Próxima edición" active={sortKey === "proxima"} dir={sortDir} onClick={() => toggleSort("proxima")} /></TableHead>
              {canEditPlantillas && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {q.error && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-destructive">
                  {(q.error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {!q.isLoading && !q.error && plantillas.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  Sin plantillas
                </TableCell>
              </TableRow>
            )}
            {plantillas.map((p) => {
              const n = p.plantillas_fuentes.length;
              const proxima = proximaByPlantilla.get(p.id) ?? null;
              const expanded = expandedIds.has(p.id);
              const ediciones = expanded
                ? anotarEstadoEdiciones(edicionesPorAnio(eventosQ.data ?? [], p.id), today, anioActual)
                : [];
              return (
                <Fragment key={p.id}>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={expanded ? "Colapsar ediciones" : "Ver ediciones"}
                          onClick={() => toggleExpand(p.id)}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
                        </button>
                        {p.nombre}
                      </div>
                    </TableCell>
                    <TableCell><CategoriaBadge categoria={p.categoria} /></TableCell>
                    <TableCell><AplicaABadge aplicaA={p.aplica_a} /></TableCell>
                    <TableCell>{PERIODICIDAD_LABEL[p.periodicidad]}</TableCell>
                    <TableCell>
                      {p.activo ? (
                        <Badge>Activo</Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {n === 0 ? (
                        <span className="text-muted-foreground">Sin fuentes</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <EstadoDot estado={estadoPeorFuente(p.plantillas_fuentes)} />
                          {n} {n === 1 ? "fuente" : "fuentes"}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {proxima ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground">{fmtDate(proxima.fecha_inicio)}</span>
                          <ConfirmMarker estado={proxima.estado} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Sin próxima edición</span>
                      )}
                    </TableCell>
                    {canEditPlantillas && (
                      <TableCell>
                        <div className="flex justify-end">
                          <Button size="sm" variant="outline" onClick={() => setEditingId(p.id)}>
                            <Pencil className="h-4 w-4 mr-1" /> Editar
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>

                  {expanded && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={colSpan} className="border-t border-dashed bg-slate-50/60 p-0">
                        <div className="py-3 pl-10 pr-4">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Ediciones por año — actual y próxima son editables (lápiz activo); pasadas solo consulta
                          </div>
                          <div className="overflow-hidden rounded-md border bg-white">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[10.5px]">Año</TableHead>
                                  <TableHead className="text-[10.5px]">Previo</TableHead>
                                  <TableHead className="text-[10.5px]">Principal</TableHead>
                                  <TableHead className="text-[10.5px]">Post</TableHead>
                                  <TableHead className="text-[10.5px]">Efecto</TableHead>
                                  <TableHead className="text-[10.5px]">Mín. noches</TableHead>
                                  <TableHead className="text-[10.5px]">Afluencia prevista</TableHead>
                                  <TableHead className="text-[10.5px]">Ubicación</TableHead>
                                  <TableHead className="text-right text-[10.5px]">Acciones</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {ediciones.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={9} className="py-4 text-center text-xs text-muted-foreground">
                                      Sin ediciones
                                    </TableCell>
                                  </TableRow>
                                )}
                                {ediciones.map((ed) => {
                                  const temporada = ed.principal.temporada_override_id
                                    ? temporadaById.get(ed.principal.temporada_override_id)
                                    : undefined;
                                  const efecto = formatEfecto(ed.principal.valor, ed.principal.tipo_valor);
                                  return (
                                    <TableRow key={ed.principal.id} className={ROW_BG[ed.estadoFila]}>
                                      <TableCell
                                        className={cn(
                                          "font-bold",
                                          ANIO_COLOR[ed.estadoFila],
                                          ed.estadoFila === "actual" && "border-l-[3px] border-l-blue-600",
                                        )}
                                      >
                                        <div className="flex items-center gap-1.5">
                                          {ed.anio}
                                          {ed.estadoFila === "actual" && (
                                            <span className="inline-block rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                              Actual
                                            </span>
                                          )}
                                          {ed.estadoFila === "proxima" && (
                                            <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                              Próxima
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className={MUTED_COLOR[ed.estadoFila]}>
                                        {ed.previo ? `${fmtDate(ed.previo.fecha_inicio)} – ${fmtDate(ed.previo.fecha_fin)}` : "—"}
                                      </TableCell>
                                      <TableCell>
                                        <div className={cn("flex items-center gap-1.5 text-[13.5px] font-bold", PRINCIPAL_COLOR[ed.estadoFila])}>
                                          {fmtDate(ed.principal.fecha_inicio)} – {fmtDate(ed.principal.fecha_fin)}
                                          {ed.estadoFila !== "pasada" && <ConfirmMarker estado={ed.principal.estado} />}
                                        </div>
                                      </TableCell>
                                      <TableCell className={MUTED_COLOR[ed.estadoFila]}>
                                        {ed.post ? `${fmtDate(ed.post.fecha_inicio)} – ${fmtDate(ed.post.fecha_fin)}` : "—"}
                                      </TableCell>
                                      <TableCell className={MUTED_COLOR[ed.estadoFila]}>
                                        {efecto ? efecto : temporada ? `→ ${temporada.codigo}` : "—"}
                                      </TableCell>
                                      <TableCell className={MUTED_COLOR[ed.estadoFila]}>
                                        {ed.principal.estancia_minima ?? "—"}
                                      </TableCell>
                                      <TableCell className={MUTED_COLOR[ed.estadoFila]}>
                                        {ed.principal.afluencia_estimada != null ? ed.principal.afluencia_estimada : "—"}
                                      </TableCell>
                                      <TableCell
                                        className={cn("max-w-[200px] truncate", MUTED_COLOR[ed.estadoFila])}
                                        title={ed.principal.ubicacion ?? undefined}
                                      >
                                        {ed.principal.ubicacion ?? "—"}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {ed.estadoFila === "pasada" ? (
                                          <span
                                            title="Edición pasada — no editable"
                                            aria-label="Edición pasada — no editable"
                                            className="inline-flex h-6 w-6 cursor-not-allowed items-center justify-center text-slate-300"
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </span>
                                        ) : canEditEventos ? (
                                          <Button
                                            size="icon"
                                            variant="outline"
                                            className="h-6 w-6"
                                            title={`Editar edición ${ed.anio}`}
                                            onClick={() => setEditingEvento(ed.principal)}
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                        ) : null}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                          {canEditEventos && (
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                className="shrink-0 text-xs font-semibold text-primary hover:underline"
                                onClick={() => setCreatingEdicionFor(p)}
                              >
                                + Nueva edición
                              </button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      </TabsContent>

      <TabsContent value="fuentes" className="mt-0">
        <Card className="overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plantilla</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Última verificación</TableHead>
                {canEditPlantillas && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow>
                  <TableCell colSpan={canEditPlantillas ? 5 : 4} className="text-center py-8 text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {!q.isLoading && pendientes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEditPlantillas ? 5 : 4} className="text-center py-8 text-muted-foreground">
                    No hay fuentes pendientes de revisar
                  </TableCell>
                </TableRow>
              )}
              {pendientes.map(({ plantilla, fuente }) => {
                const estado: EstadoBadge = fuente.estado_verificacion ?? "sin_verificar";
                return (
                  <TableRow key={fuente.id}>
                    <TableCell className="font-medium">{plantilla.nombre}</TableCell>
                    <TableCell className="max-w-[360px]">
                      <a
                        href={fuente.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline break-all"
                      >
                        {fuente.url}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge className={ESTADO_VERIFICACION_STYLES[estado]}>{ESTADO_VERIFICACION_LABEL[estado]}</Badge>
                    </TableCell>
                    <TableCell>{fuente.ultima_verificacion ? fmtDate(fuente.ultima_verificacion) : "Nunca"}</TableCell>
                    {canEditPlantillas && (
                      <TableCell>
                        <div className="flex justify-end">
                          <Button size="sm" variant="outline" onClick={() => setEditingId(plantilla.id)}>
                            <Pencil className="h-4 w-4 mr-1" /> Editar
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>
      </Tabs>

      {creating && (
        <PlantillaCreateDialog
          onClose={() => setCreating(false)}
          onSaved={() => q.refetch()}
        />
      )}

      {editing && (
        <PlantillaEditDialog
          key={editing.id}
          plantilla={editing}
          onClose={() => setEditingId(null)}
          onChanged={() => q.refetch()}
        />
      )}

      {editingEvento && (
        <EventoFormDialog
          fase="principal"
          parent={null}
          evento={editingEvento}
          onClose={() => setEditingEvento(null)}
          onSaved={() => eventosQ.refetch()}
        />
      )}

      {creatingEdicionFor && (
        <EventoFormDialog
          fase="principal"
          parent={null}
          plantilla={creatingEdicionFor}
          onClose={() => setCreatingEdicionFor(null)}
          onSaved={() => eventosQ.refetch()}
        />
      )}
    </AppShell>
  );
}
