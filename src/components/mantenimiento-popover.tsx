import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAdjunto } from "@/lib/api/manteniment-adjuntos.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { formatHHMM } from "@/lib/utils";
import { fullName } from "@/lib/types";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useMantenimientoActions,
  usePersonalLite,
  useApartamentosLite,
  useEspaciosLite,
  useGruposLite,
} from "@/hooks/use-mantenimiento";
import { TipoBadge, PrioridadPill, EstadoFullPill } from "@/components/mantenimiento-badges";
import { AsignarDialog } from "@/components/mantenimiento-asignar-dialog";
import { OcupacionPopoverTrigger } from "@/components/apartamento-ocupacion-calendario";
import {
  INCIDENCIA_COLUMNS,
  REGISTRE_COLUMNS,
  ORIGEN_LABEL,
  resolveLocation,
  type Incidencia,
  type Registre,
  type PersonaLite,
} from "@/lib/mantenimiento";
import { Home, Loader2 } from "lucide-react";

type Adjunto = Record<string, unknown> & { id_adjunt?: number };

export function MantenimientoPopover({
  idIncidencia,
  onOpenChange,
  onSaved,
  workers,
}: {
  idIncidencia: number | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  workers: PersonaLite[];
}) {
  const { canEdit } = usePermissions();
  const editable = canEdit("mantenimiento");

  const [assignOpen, setAssignOpen] = useState(false);
  const [nota, setNota] = useState("");
  const [notaLoadedFor, setNotaLoadedFor] = useState<number | null>(null);
  const [descripcio, setDescripcio] = useState("");
  const [descripcioLoadedFor, setDescripcioLoadedFor] = useState<number | null>(null);
  const [loadingAdjunto, setLoadingAdjunto] = useState<number | null>(null);

  async function verAdjunto(idAdjunto: number, key: string) {
    const newWindow = window.open("", "_blank");
    setLoadingAdjunto(idAdjunto);
    try {
      const result = await getAdjunto({ data: { key } });
      if (newWindow) {
        newWindow.location.href = result.dataUrl;
      } else {
        toast.error("El navegador bloqueó la ventana. Permite ventanas emergentes e inténtalo de nuevo.");
      }
    } catch (e) {
      console.error("[MantenimientoPopover] failed to load adjunto:", e);
      toast.error("No se pudo cargar el adjunto");
      newWindow?.close();
    } finally {
      setLoadingAdjunto(null);
    }
  }

  const detailQ = useQuery({
    queryKey: ["mantenimiento-detail", idIncidencia],
    enabled: idIncidencia != null,
    queryFn: async (): Promise<Incidencia | null> => {
      const { data, error } = await supabase
        .from("manteniment_incidencies")
        .select(INCIDENCIA_COLUMNS)
        .eq("id_incidencia", idIncidencia!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Incidencia | null;
    },
  });

  const sesionesQ = useQuery({
    queryKey: ["mantenimiento-detail-registre", idIncidencia],
    enabled: idIncidencia != null,
    queryFn: async (): Promise<Registre[]> => {
      const { data, error } = await supabase
        .from("manteniment_registre")
        .select(REGISTRE_COLUMNS)
        .eq("id_incidencia", idIncidencia!)
        .order("inici", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Registre[];
    },
  });

  const adjuntosQ = useQuery({
    queryKey: ["mantenimiento-detail-adjuntos", idIncidencia],
    enabled: idIncidencia != null,
    queryFn: async (): Promise<Adjunto[]> => {
      const { data, error } = await supabase.from("manteniment_adjunts").select("*").eq("id_incidencia", idIncidencia!);
      if (error) {
        console.warn("[MantenimientoPopover] adjuntos fetch failed:", error.message);
        return [];
      }
      return (data ?? []) as Adjunto[];
    },
  });

  const personalQ = usePersonalLite();
  const personaById = new Map((personalQ.data ?? []).map((p) => [p.id_persona, p]));
  const aptQ = useApartamentosLite();
  const aptById = new Map((aptQ.data ?? []).map((a) => [a.id_apt, a]));
  const espaciosQ = useEspaciosLite();
  const espacioById = new Map((espaciosQ.data ?? []).map((e) => [e.id_tipo, e]));
  const gruposQ = useGruposLite();
  const grupoById = new Map((gruposQ.data ?? []).map((g) => [g.id_grupo, g]));

  function refetchAll() {
    detailQ.refetch();
    sesionesQ.refetch();
    onSaved();
  }

  const actions = useMantenimientoActions(refetchAll);

  const inc = detailQ.data ?? null;
  const sesiones = sesionesQ.data ?? [];
  const adjuntos = adjuntosQ.data ?? [];

  useEffect(() => {
    if (inc && notaLoadedFor !== inc.id_incidencia) {
      setNota(inc.notas_gestor ?? "");
      setNotaLoadedFor(inc.id_incidencia);
    }
  }, [inc, notaLoadedFor]);

  useEffect(() => {
    if (inc && descripcioLoadedFor !== inc.id_incidencia) {
      setDescripcio(inc.descripcio ?? "");
      setDescripcioLoadedFor(inc.id_incidencia);
    }
  }, [inc, descripcioLoadedFor]);

  const open = idIncidencia != null;
  const closedSessions = sesiones.filter((s) => s.fi != null);
  const totalHoras = closedSessions.reduce((sum, s) => sum + (s.hores ?? 0), 0);
  const hasOpenSession = inc != null && sesiones.some((s) => s.fi == null && s.id_persona === inc.id_assignat);
  const notaDirty = inc != null && nota !== (inc.notas_gestor ?? "");
  const descripcioDirty = inc != null && descripcio !== (inc.descripcio ?? "");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
          {inc && (
            <DialogHeader className="px-4 py-3 border-b">
              <DialogTitle className="text-base flex items-center gap-2 flex-wrap">
                <span>{inc.titol}</span>
                <TipoBadge tipus={inc.tipus} />
                <EstadoFullPill estat={inc.estat} />
              </DialogTitle>
              <DialogDescription className="sr-only">Detalle de la incidencia de mantenimiento</DialogDescription>
            </DialogHeader>
          )}

          <div className="overflow-y-auto px-4 py-3 space-y-4">
            {detailQ.isError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Error cargando la incidencia: {(detailQ.error as Error).message}
              </div>
            ) : !inc ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
            ) : (
              <>
                <section>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ubicación</Label>
                  <div className="mt-1 flex items-center gap-1.5 text-sm">
                    <Home className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {resolveLocation(inc, aptById, espacioById, grupoById)}
                  </div>
                </section>

                <section>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Descripción</Label>
                  <Textarea
                    rows={3}
                    className="mt-1.5"
                    placeholder="Describe la incidencia…"
                    value={descripcio}
                    onChange={(e) => setDescripcio(e.target.value)}
                    disabled={!editable}
                  />
                  {editable && (
                    <div className="mt-1.5 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!descripcioDirty}
                        onClick={() => actions.guardarDescripcio(inc, descripcio)}
                      >
                        Guardar descripción
                      </Button>
                    </div>
                  )}
                </section>

                <section>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Prioridad</Label>
                  <div className="mt-1 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <PrioridadPill prioridad={inc.prioritat_proposta} />
                      <span className="text-muted-foreground">Reportada</span>
                    </div>
                    {inc.prioritat_confirmada && inc.prioritat_confirmada !== inc.prioritat_proposta && (
                      <div className="flex items-center gap-1.5">
                        <PrioridadPill prioridad={inc.prioritat_confirmada} />
                        <span className="text-muted-foreground">Confirmada</span>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Origen</Label>
                  <div className="mt-1 text-sm space-y-0.5">
                    <div>{ORIGEN_LABEL[inc.origen] ?? inc.origen}</div>
                    {inc.origen === "neteja" && inc.id_limpieza != null && (
                      <div className="text-xs text-muted-foreground">Limpieza asociada: #{inc.id_limpieza}</div>
                    )}
                    {inc.numero_reserva && (
                      <div className="text-xs text-muted-foreground">Reserva: {inc.numero_reserva}</div>
                    )}
                  </div>
                </section>

                <section>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Reportado por</Label>
                  <div className="mt-1 text-sm">
                    {inc.id_reporter != null ? fullName(personaById.get(inc.id_reporter)) : "—"}
                    <span className="text-muted-foreground"> · {fmtDateTime(inc.creado_en)}</span>
                  </div>
                  {inc.data_incident && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Ocurrió: {fmtDateTime(inc.data_incident)}
                    </div>
                  )}
                </section>

                {inc.validat_per != null && (
                  <section>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Validación</Label>
                    <div className="mt-1 text-sm">
                      {fullName(personaById.get(inc.validat_per))}
                      <span className="text-muted-foreground"> · {fmtDateTime(inc.validat_en)}</span>
                    </div>
                  </section>
                )}

                {inc.estat !== "pendent_validacio" && (
                  <section>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Asignación</Label>
                    <div className="mt-1 text-sm">
                      {inc.id_assignat != null ? fullName(personaById.get(inc.id_assignat)) : "Sin asignar"}
                      <span className="text-muted-foreground">
                        {" "}
                        ·{" "}
                        <OcupacionPopoverTrigger idApt={inc.id_apt} initialDateISO={inc.data_prevista}>
                          Prevista: {inc.data_prevista ? fmtDate(inc.data_prevista) : "Sin fecha prevista"}
                        </OcupacionPopoverTrigger>
                      </span>
                    </div>
                  </section>
                )}

                <section>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sesiones de trabajo</Label>
                  <div className="mt-1.5 space-y-1.5">
                    {sesiones.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic">Sin sesiones aún</div>
                    ) : (
                      sesiones.map((s) => {
                        const codigo = personaById.get(s.id_persona)?.codigo ?? "";
                        return (
                          <div key={s.id_registre} className="text-sm rounded-md border bg-muted/30 px-2.5 py-1.5">
                            <div>
                              <span className="font-medium">{codigo}</span> {fmtDateTime(s.inici)} →{" "}
                              {s.fi ? (
                                fmtDateTime(s.fi)
                              ) : (
                                <span className="text-[#378ADD] font-medium">en curso</span>
                              )}
                              {s.fi && s.hores != null && (
                                <span className="text-muted-foreground"> ({formatHHMM(s.hores)} h)</span>
                              )}
                            </div>
                            {(s.cost_materials != null || s.desc_materials) && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Materiales
                                {s.cost_materials != null ? `: ${s.cost_materials.toFixed(2)} €` : ""}
                                {s.desc_materials ? ` — ${s.desc_materials}` : ""}
                              </div>
                            )}
                            {s.notas && <div className="text-xs text-muted-foreground mt-0.5">{s.notas}</div>}
                          </div>
                        );
                      })
                    )}
                    {closedSessions.length > 0 && (
                      <div className="text-sm font-medium">Total: {formatHHMM(totalHoras)} hrs.</div>
                    )}
                  </div>
                </section>

                {inc.finalitzat_en && (
                  <section>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cierre</Label>
                    <div className="mt-1 text-sm space-y-0.5">
                      <div>{fmtDateTime(inc.finalitzat_en)}</div>
                      <div className="text-xs text-muted-foreground">
                        Tarea realizada: {inc.tasca_realitzada ? "Sí" : "No"}
                        {inc.tipus === "material_danyat" && (
                          <> · Material repuesto: {inc.material_reposat ? "Sí" : "No"}</>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                <section>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notas del gestor</Label>
                  <Textarea
                    rows={3}
                    className="mt-1.5"
                    placeholder="Añade notas internas…"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    disabled={!editable}
                  />
                  {editable && (
                    <div className="mt-1.5 flex justify-end">
                      <Button size="sm" variant="outline" disabled={!notaDirty} onClick={() => actions.guardarNota(inc, nota)}>
                        Guardar nota
                      </Button>
                    </div>
                  )}
                </section>

                <section>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Adjuntos</Label>
                  <div className="mt-1.5">
                    {adjuntos.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic">Sin adjuntos</div>
                    ) : (
                      <ul className="space-y-1">
                        {adjuntos.map((a, i) => {
                          const label =
                            (a.nom_fitxer as string | undefined) ??
                            (a.tipus as string | undefined) ??
                            `Adjunto ${i + 1}`;
                          const idAdjunto = (a.id_adjunt as number | undefined) ?? i;
                          const url = a.url as string | undefined;
                          return (
                            <li key={idAdjunto} className="text-sm">
                              <button
                                type="button"
                                disabled={!url || loadingAdjunto === idAdjunto}
                                onClick={() => url && verAdjunto(idAdjunto, url)}
                                className="flex items-center gap-1.5 text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80 disabled:opacity-50 disabled:no-underline"
                              >
                                {loadingAdjunto === idAdjunto && <Loader2 className="h-3 w-3 animate-spin" />}
                                {label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>

          {inc && editable && (
            <DialogFooter className="px-4 py-3 border-t flex-row sm:justify-start gap-2">
              {inc.estat === "pendent_validacio" && (
                <>
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => actions.rechazar(inc)}
                  >
                    Rechazar
                  </Button>
                  <Button
                    className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
                    onClick={() => setAssignOpen(true)}
                  >
                    Asignar
                  </Button>
                </>
              )}
              {inc.estat === "validada" && !hasOpenSession && (
                <Button
                  className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
                  onClick={() => actions.iniciar(inc, inc.id_assignat)}
                >
                  Iniciar
                </Button>
              )}
              {inc.estat === "en_curs" && (
                <>
                  <Button
                    variant="outline"
                    className="border-amber-400 text-amber-700 hover:bg-amber-50"
                    onClick={() => actions.finParcial(inc, inc.id_assignat, sesiones)}
                  >
                    Fin parcial
                  </Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => actions.finTotal(inc)}
                  >
                    Fin total
                  </Button>
                </>
              )}
              {(inc.estat === "validada" || inc.estat === "en_curs") && (
                <Button variant="outline" onClick={() => setAssignOpen(true)}>
                  Reasignar
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AsignarDialog
        inc={assignOpen ? inc : null}
        workers={workers}
        onOpenChange={(o) => setAssignOpen(o)}
        onConfirm={async (incArg, workerId, fecha, prioridad) => {
          await actions.confirmarAsignacion(incArg, workerId, fecha, prioridad);
          setAssignOpen(false);
        }}
      />
    </>
  );
}
