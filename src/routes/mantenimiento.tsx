import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { formatHHMM, cn } from "@/lib/utils";
import { fetchMantenimiento } from "@/lib/catalogos";
import { fullName } from "@/lib/types";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import { usePermissions } from "@/hooks/use-permissions";
import { Home } from "lucide-react";

export const Route = createFileRoute("/mantenimiento")({
  component: MantenimientoPage,
});

type IncidenciaTipo = "averia_rotura" | "manteniment" | "material_danyat" | "altre";
type Prioridad = "alta" | "normal" | "baixa";
type Estat = "pendent_validacio" | "validada" | "en_curs" | "finalitzada" | "rebutjada";

type Incidencia = {
  id_incidencia: number;
  titol: string;
  descripcio: string | null;
  tipus: IncidenciaTipo;
  estat: Estat;
  id_apt: number | null;
  id_tipo_espacio_comun: number | null;
  id_reporter: number | null;
  id_assignat: number | null;
  prioritat_proposta: Prioridad;
  prioritat_confirmada: Prioridad | null;
  data_prevista: string | null;
  creado_en: string;
  iniciat_en: string | null;
  finalitzat_en: string | null;
};

type Registre = {
  id_registre: number;
  id_incidencia: number;
  id_persona: number;
  inici: string;
  fi: string | null;
  hores: number | null;
};

type PersonaLite = { id_persona: number; nombre: string | null; apellidos: string | null; codigo?: string | null };
type AptLite = { id_apt: number; nombre: string };
type EspacioLite = { id_tipo: number; nombre: string };

const INCIDENCIA_COLUMNS =
  "id_incidencia,titol,descripcio,tipus,estat,id_apt,id_tipo_espacio_comun,id_reporter,id_assignat,prioritat_proposta,prioritat_confirmada,data_prevista,creado_en,iniciat_en,finalitzat_en";

const TIPO_STYLE: Record<IncidenciaTipo, { bg: string; fg: string; label: string }> = {
  averia_rotura: { bg: "#DC2626", fg: "#FFFFFF", label: "Avería / Rotura" },
  manteniment: { bg: "#2563EB", fg: "#FFFFFF", label: "Mantenimiento" },
  material_danyat: { bg: "#D97706", fg: "#FFFFFF", label: "Material dañado" },
  altre: { bg: "#6B7280", fg: "#FFFFFF", label: "Otro" },
};

const PRIORIDAD_STYLE: Record<Prioridad, { bg: string; fg: string; letter: string; label: string }> = {
  alta: { bg: "#DC2626", fg: "#FFFFFF", letter: "A", label: "Alta" },
  normal: { bg: "#D97706", fg: "#FFFFFF", letter: "M", label: "Media" },
  baixa: { bg: "#9CA3AF", fg: "#FFFFFF", letter: "B", label: "Baja" },
};

const ESTADO_PILL_STYLE: Partial<Record<Estat, { bg: string; fg: string; label: string }>> = {
  finalitzada: { bg: "#639922", fg: "#FFFFFF", label: "Finalizada" },
  rebutjada: { bg: "#DC2626", fg: "#FFFFFF", label: "Rechazada" },
};

type TareasFilter = "asignadas_curso" | "en_curso" | "finalizadas" | "rechazadas" | "todas";
type SortKey = "prioridad" | "fecha_prevista" | "fecha_inicio" | "fecha_fin" | "titulo" | "ubicacion" | "operario";

const PRIORIDAD_RANK: Record<Prioridad, number> = { alta: 0, normal: 1, baixa: 2 };

function resolveLocation(
  inc: Incidencia,
  aptById: Map<number, AptLite>,
  espacioById: Map<number, EspacioLite>,
): string {
  if (inc.id_apt != null) return aptById.get(inc.id_apt)?.nombre ?? `#${inc.id_apt}`;
  if (inc.id_tipo_espacio_comun != null) {
    const nombre = espacioById.get(inc.id_tipo_espacio_comun)?.nombre ?? "?";
    return `${nombre} (zona común)`;
  }
  return "Otro";
}

function rightPanelStyle(estat: Estat, sessionCount: number): { bg: string; borderColor: string | null } {
  if (estat === "en_curs") return { bg: "rgba(55,138,221,0.13)", borderColor: "#378ADD" };
  if (estat === "validada" && sessionCount > 0) return { bg: "rgba(216,90,48,0.10)", borderColor: "#D85A30" };
  if (estat === "finalitzada") return { bg: "rgba(99,153,34,0.14)", borderColor: "#639922" };
  return { bg: "transparent", borderColor: null };
}

function TipoBadge({ tipus }: { tipus: IncidenciaTipo }) {
  const s = TIPO_STYLE[tipus];
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function PrioridadPill({ prioridad }: { prioridad: Prioridad | null }) {
  if (!prioridad) return <span className="text-muted-foreground text-xs">—</span>;
  const s = PRIORIDAD_STYLE[prioridad];
  return (
    <span
      title={s.label}
      className="inline-flex items-center justify-center rounded-full w-5 h-5 text-[10px] font-bold shrink-0"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.letter}
    </span>
  );
}

function MantenimientoPage() {
  const { canEdit } = usePermissions();
  const { persona } = useCurrentPersonal();
  const editable = canEdit("mantenimiento");

  const [assignTarget, setAssignTarget] = useState<Incidencia | null>(null);
  const [filtro, setFiltro] = useState<TareasFilter>("asignadas_curso");
  const [sortKey, setSortKey] = useState<SortKey>("prioridad");

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

  const registreQ = useQuery({
    queryKey: ["mantenimiento-registre", tareaIdsKey],
    enabled: tareaIds.length > 0,
    queryFn: async (): Promise<Registre[]> => {
      const { data, error } = await supabase
        .from("manteniment_registre")
        .select("id_registre,id_incidencia,id_persona,inici,fi,hores")
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

  const personalQ = useQuery({
    queryKey: ["mantenimiento-personal-lite"],
    queryFn: async (): Promise<PersonaLite[]> => {
      const { data, error } = await supabase.from("personal").select("id_persona,nombre,apellidos,codigo");
      if (error) throw error;
      return (data ?? []) as PersonaLite[];
    },
  });
  const personaById = useMemo(
    () => new Map((personalQ.data ?? []).map((p) => [p.id_persona, p])),
    [personalQ.data],
  );

  const aptQ = useQuery({
    queryKey: ["mantenimiento-apts"],
    queryFn: async (): Promise<AptLite[]> => {
      const { data, error } = await supabase.from("apartamentos").select("id_apt,nombre");
      if (error) throw error;
      return (data ?? []) as AptLite[];
    },
  });
  const aptById = useMemo(() => new Map((aptQ.data ?? []).map((a) => [a.id_apt, a])), [aptQ.data]);

  const espaciosQ = useQuery({
    queryKey: ["mantenimiento-espacios"],
    queryFn: async (): Promise<EspacioLite[]> => {
      const { data, error } = await supabase.from("tipos_espacio_comun").select("id_tipo,nombre");
      if (error) throw error;
      return (data ?? []) as EspacioLite[];
    },
  });
  const espacioById = useMemo(() => new Map((espaciosQ.data ?? []).map((e) => [e.id_tipo, e])), [espaciosQ.data]);

  const workersQ = useQuery({ queryKey: ["mantenimiento-workers"], queryFn: fetchMantenimiento });

  const sortedTareas = useMemo(() => {
    const arr = [...(tareasQ.data ?? [])];
    const locName = (t: Incidencia) => resolveLocation(t, aptById, espacioById);
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
  }, [tareasQ.data, sortKey, aptById, espacioById, personaById]);

  async function rechazar(inc: Incidencia) {
    if (!window.confirm(`¿Rechazar la incidencia "${inc.titol}"?`)) return;
    const { error } = await supabase
      .from("manteniment_incidencies")
      .update({
        estat: "rebutjada",
        validat_per: persona?.id_persona ?? null,
        validat_en: new Date().toISOString(),
      })
      .eq("id_incidencia", inc.id_incidencia);
    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    toast.success("Incidencia rechazada");
    pendientesQ.refetch();
    tareasQ.refetch();
  }

  async function confirmarAsignacion(
    inc: Incidencia,
    workerId: number,
    fecha: string | null,
    prioridad: Prioridad,
  ) {
    const { error } = await supabase
      .from("manteniment_incidencies")
      .update({
        estat: "validada",
        id_assignat: workerId,
        data_prevista: fecha,
        prioritat_confirmada: prioridad,
        validat_per: persona?.id_persona ?? null,
        validat_en: new Date().toISOString(),
      })
      .eq("id_incidencia", inc.id_incidencia);
    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    toast.success("Incidencia asignada");
    setAssignTarget(null);
    pendientesQ.refetch();
    tareasQ.refetch();
  }

  async function iniciar(inc: Incidencia) {
    const nowIso = new Date().toISOString();
    const { error: e1 } = await supabase.from("manteniment_registre").insert({
      id_incidencia: inc.id_incidencia,
      id_persona: inc.id_assignat,
      inici: nowIso,
    });
    if (e1) {
      toast.error("Error: " + e1.message);
      return;
    }
    const patch: Record<string, unknown> = { estat: "en_curs" };
    if (!inc.iniciat_en) patch.iniciat_en = nowIso;
    const { error: e2 } = await supabase
      .from("manteniment_incidencies")
      .update(patch)
      .eq("id_incidencia", inc.id_incidencia);
    if (e2) {
      toast.error("Error: " + e2.message);
      return;
    }
    toast.success("Tarea iniciada");
    tareasQ.refetch();
    registreQ.refetch();
  }

  async function finParcial(inc: Incidencia) {
    const open = (registreByIncidencia.get(inc.id_incidencia) ?? []).find((s) => s.fi == null);
    const nowIso = new Date().toISOString();
    if (open) {
      const { error: e1 } = await supabase
        .from("manteniment_registre")
        .update({ fi: nowIso })
        .eq("id_registre", open.id_registre);
      if (e1) {
        toast.error("Error: " + e1.message);
        return;
      }
    }
    const { error: e2 } = await supabase
      .from("manteniment_incidencies")
      .update({ estat: "validada" })
      .eq("id_incidencia", inc.id_incidencia);
    if (e2) {
      toast.error("Error: " + e2.message);
      return;
    }
    toast.success("Sesión pausada");
    tareasQ.refetch();
    registreQ.refetch();
  }

  async function finTotal(inc: Incidencia) {
    const open = (registreByIncidencia.get(inc.id_incidencia) ?? []).find((s) => s.fi == null);
    const nowIso = new Date().toISOString();
    if (open) {
      const { error: e1 } = await supabase
        .from("manteniment_registre")
        .update({ fi: nowIso })
        .eq("id_registre", open.id_registre);
      if (e1) {
        toast.error("Error: " + e1.message);
        return;
      }
    }
    const { error: e2 } = await supabase
      .from("manteniment_incidencies")
      .update({ estat: "finalitzada", finalitzat_en: nowIso })
      .eq("id_incidencia", inc.id_incidencia);
    if (e2) {
      toast.error("Error: " + e2.message);
      return;
    }
    toast.success("Tarea finalizada");
    tareasQ.refetch();
    registreQ.refetch();
  }

  const pendientes = pendientesQ.data ?? [];

  return (
    <AppShell title="Mantenimiento">
      <div className="space-y-6">
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
                location={resolveLocation(inc, aptById, espacioById)}
                reporter={inc.id_reporter != null ? fullName(personaById.get(inc.id_reporter)) : "—"}
                editable={editable}
                onRechazar={() => rechazar(inc)}
                onAsignar={() => setAssignTarget(inc)}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tareas</h2>
            <div className="flex items-center gap-2">
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
                location={resolveLocation(t, aptById, espacioById)}
                worker={t.id_assignat != null ? personaById.get(t.id_assignat) : null}
                personaById={personaById}
                editable={editable}
                onIniciar={() => iniciar(t)}
                onFinParcial={() => finParcial(t)}
                onFinTotal={() => finTotal(t)}
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
        onConfirm={confirmarAsignacion}
      />
    </AppShell>
  );
}

function NuevaCard({
  inc,
  location,
  reporter,
  editable,
  onRechazar,
  onAsignar,
}: {
  inc: Incidencia;
  location: string;
  reporter: string;
  editable: boolean;
  onRechazar: () => void;
  onAsignar: () => void;
}) {
  return (
    <Card className="p-3 space-y-2 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm leading-snug">{inc.titol}</div>
        <PrioridadPill prioridad={inc.prioritat_proposta} />
      </div>
      <TipoBadge tipus={inc.tipus} />
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Home className="h-3 w-3 shrink-0" />
        {location}
      </div>
      <div className="text-xs text-muted-foreground">Reportado por {reporter}</div>
      {editable && (
        <div className="flex gap-2 pt-1">
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
  editable,
  onIniciar,
  onFinParcial,
  onFinTotal,
}: {
  inc: Incidencia;
  sesiones: Registre[];
  location: string;
  worker: PersonaLite | null | undefined;
  personaById: Map<number, PersonaLite>;
  editable: boolean;
  onIniciar: () => void;
  onFinParcial: () => void;
  onFinTotal: () => void;
}) {
  const hasOpenSession = sesiones.some((s) => s.fi == null);
  const closedSessions = sesiones.filter((s) => s.fi != null);
  const totalHoras = closedSessions.reduce((sum, s) => sum + (s.hores ?? 0), 0);
  const panel = rightPanelStyle(inc.estat, sesiones.length);
  const estadoPill = ESTADO_PILL_STYLE[inc.estat];

  return (
    <Card className="p-0 overflow-hidden bg-white">
      <div className="flex">
        <div className="flex-1 min-w-0 p-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{inc.titol}</span>
            <TipoBadge tipus={inc.tipus} />
            {estadoPill && (
              <span
                className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ backgroundColor: estadoPill.bg, color: estadoPill.fg }}
              >
                {estadoPill.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Home className="h-3 w-3 shrink-0" />
            <span>{location}</span>
            <span>·</span>
            <span>{worker ? fullName(worker) : "Sin asignar"}</span>
          </div>
          {editable && (
            <div className="flex gap-2 pt-1">
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
            </div>
          )}
        </div>
        <div
          className="w-[210px] shrink-0 flex flex-col justify-center gap-1 px-3 py-2 text-xs leading-tight"
          style={{
            backgroundColor: panel.bg,
            borderLeft: panel.borderColor ? `3px solid ${panel.borderColor}` : undefined,
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Prevista: {inc.data_prevista ? fmtDate(inc.data_prevista) : "—"}
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
                  {codigo} {fmtDateTime(s.inici)} →{" "}
                  {s.fi ? fmtDateTime(s.fi) : <span className="text-[#378ADD] font-medium">en curso</span>}
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

function AsignarDialog({
  inc,
  workers,
  onOpenChange,
  onConfirm,
}: {
  inc: Incidencia | null;
  workers: PersonaLite[];
  onOpenChange: (o: boolean) => void;
  onConfirm: (inc: Incidencia, workerId: number, fecha: string | null, prioridad: Prioridad) => Promise<void>;
}) {
  const [workerId, setWorkerId] = useState<number | null>(null);
  const [fecha, setFecha] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [busy, setBusy] = useState(false);

  const openId = inc?.id_incidencia ?? null;
  useEffect(() => {
    setWorkerId(null);
    setFecha("");
    setPrioridad(inc?.prioritat_proposta ?? "normal");
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function confirmar() {
    if (!inc || workerId == null) return;
    setBusy(true);
    try {
      await onConfirm(inc, workerId, fecha || null, prioridad);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!inc} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Asignar incidencia</DialogTitle>
          <DialogDescription className="sr-only">Asignar trabajador, fecha y prioridad</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Trabajador</Label>
            <Select value={workerId != null ? String(workerId) : ""} onValueChange={(v) => setWorkerId(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un trabajador" />
              </SelectTrigger>
              <SelectContent>
                {workers.map((w) => (
                  <SelectItem key={w.id_persona} value={String(w.id_persona)}>
                    {fullName(w)}
                    {w.codigo ? ` (${w.codigo})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fecha prevista (opcional)</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prioridad confirmada</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["alta", "normal", "baixa"] as Prioridad[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrioridad(p)}
                  className={cn(
                    "h-9 rounded-md border text-sm font-medium transition-colors",
                    prioridad === p
                      ? "border-[#26215C] bg-[#26215C]/10 text-[#26215C]"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {PRIORIDAD_STYLE[p].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={busy || workerId == null}>
            {busy ? "Guardando…" : "Confirmar asignación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
