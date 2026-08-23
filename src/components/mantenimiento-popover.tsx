import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAdjunto } from "@/lib/api/manteniment-adjuntos.functions";
import { AdjuntoPicker, type AdjuntoTipo } from "@/components/reportar-incidencia";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn, formatHHMM } from "@/lib/utils";
import { fullName } from "@/lib/types";
import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentPersonal } from "@/hooks/use-current-personal";
import type { Tables } from "@/integrations/supabase/types";
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
import { Home, Loader2, RotateCcw } from "lucide-react";

type Adjunto = Record<string, unknown> & { id_adjunt?: number };

const METODO_COBRO_OPTIONS: { value: string; label: string }[] = [
  { value: "booking", label: "Booking" },
  { value: "airbnb", label: "Airbnb" },
  { value: "expedia", label: "Expedia" },
  { value: "transferencia", label: "Transferencia" },
  { value: "paypal", label: "PayPal" },
  { value: "bizum", label: "Bizum" },
  { value: "stripe", label: "Stripe" },
  { value: "efectivo", label: "Efectivo" },
];

function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function dataUrlToBlobUrl(dataUrl: string): string {
  const [header, base64] = dataUrl.split(",");
  const contentType = header.match(/data:(.*?);base64/)?.[1] ?? "application/octet-stream";
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: contentType });
  return URL.createObjectURL(blob);
}

// Grouping-by-tipo (fotos as thumbnails, video/nota_veu/document as link lists)
// shared by both the "Adjuntos" (fase 'apertura') and "Adjuntos de cierre" (fase
// 'cierre') sections below — same rendering, just a pre-filtered adjuntos array.
function AdjuntosGroup({
  adjuntos,
  loadingAdjunto,
  onVer,
}: {
  adjuntos: Adjunto[];
  loadingAdjunto: number | null;
  onVer: (idAdjunto: number, url: string) => void;
}) {
  if (adjuntos.length === 0) {
    return <div className="text-sm text-muted-foreground italic">Sin adjuntos</div>;
  }

  const groups = new Map<string, { a: Adjunto; idx: number }[]>();
  adjuntos.forEach((a, idx) => {
    const tipus = (a.tipus as string | undefined) ?? "otro";
    const arr = groups.get(tipus) ?? [];
    arr.push({ a, idx });
    groups.set(tipus, arr);
  });
  const distinctTypeCount = groups.size;
  const TYPE_LABELS: Record<string, string> = {
    video: "Vídeos",
    nota_veu: "Notas de voz",
    document: "Documentos",
  };
  const fotos = groups.get("foto") ?? [];
  const otherTypes = (["video", "nota_veu", "document"] as const).filter(
    (t) => (groups.get(t) ?? []).length > 0,
  );

  function renderLinkItem({ a, idx }: { a: Adjunto; idx: number }) {
    const label =
      (a.nom_fitxer as string | undefined) ??
      (a.tipus as string | undefined) ??
      `Adjunto ${idx + 1}`;
    const idAdjunto = (a.id_adjunt as number | undefined) ?? idx;
    const url = a.url as string | undefined;
    return (
      <li key={idAdjunto} className="text-sm">
        <button
          type="button"
          disabled={!url || loadingAdjunto === idAdjunto}
          onClick={() => url && onVer(idAdjunto, url)}
          className="flex items-center gap-1.5 text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80 disabled:opacity-50 disabled:no-underline"
        >
          {loadingAdjunto === idAdjunto && <Loader2 className="h-3 w-3 animate-spin" />}
          {label}
        </button>
      </li>
    );
  }

  return (
    <>
      {fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fotos.map(({ a, idx }) => {
            const label = (a.nom_fitxer as string | undefined) ?? "foto";
            const idAdjunto = (a.id_adjunt as number | undefined) ?? idx;
            const url = a.url as string | undefined;
            return url ? (
              <AdjuntoThumbnail key={idAdjunto} idAdjunto={idAdjunto} url={url} label={label} />
            ) : (
              <span key={idAdjunto} className="text-sm text-muted-foreground">{label}</span>
            );
          })}
        </div>
      )}
      {otherTypes.map((tipus) => (
        <div key={tipus}>
          {distinctTypeCount > 1 && (
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
              {TYPE_LABELS[tipus]}
            </div>
          )}
          <ul className="space-y-1">
            {(groups.get(tipus) ?? []).map((item) => renderLinkItem(item))}
          </ul>
        </div>
      ))}
    </>
  );
}

function AdjuntoThumbnail({ idAdjunto, url, label }: { idAdjunto: number; url: string; label: string }) {
  const thumbQ = useQuery({
    queryKey: ["adjunto-thumb", idAdjunto],
    queryFn: async () => {
      const result = await getAdjunto({ data: { key: url } });
      return dataUrlToBlobUrl(result.dataUrl);
    },
    staleTime: Infinity,
  });

  if (thumbQ.isPending) {
    return <div className="h-14 w-14 rounded bg-slate-200 animate-pulse" />;
  }

  if (thumbQ.isError || !thumbQ.data) {
    return <span className="text-sm">{label}</span>;
  }

  const blobUrl = thumbQ.data;
  return (
    <img
      src={blobUrl}
      className="h-14 w-14 rounded object-cover cursor-pointer border border-slate-200"
      onClick={() => window.open(blobUrl, "_blank")}
    />
  );
}

export function MantenimientoPopover({
  idIncidencia,
  onOpenChange,
  onSaved,
  workers,
  selfAssignId,
}: {
  idIncidencia: number | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  workers: PersonaLite[];
  selfAssignId?: number;
}) {
  const { canEdit } = usePermissions();
  const editable = canEdit("mantenimiento");

  const [assignOpen, setAssignOpen] = useState(false);
  const [nota, setNota] = useState("");
  const [notaLoadedFor, setNotaLoadedFor] = useState<number | null>(null);
  const [descripcio, setDescripcio] = useState("");
  const [descripcioLoadedFor, setDescripcioLoadedFor] = useState<number | null>(null);
  const [loadingAdjunto, setLoadingAdjunto] = useState<number | null>(null);
  const [notaFinalizacion, setNotaFinalizacion] = useState("");
  const [notaFinalizacionLoadedFor, setNotaFinalizacionLoadedFor] = useState<number | null>(null);
  const [finTotalExtrasOpen, setFinTotalExtrasOpen] = useState(false);
  const [finTotalExtrasAdjuntos, setFinTotalExtrasAdjuntos] = useState<{ tipo: AdjuntoTipo; file: File }[]>([]);
  const [finTotalExtrasNota, setFinTotalExtrasNota] = useState("");
  const [finTotalExtrasSaving, setFinTotalExtrasSaving] = useState(false);
  const [reclResponsable, setReclResponsable] = useState<number | null>(null);
  const [reclImporteReclamado, setReclImporteReclamado] = useState("");
  const [reclImporteCobrado, setReclImporteCobrado] = useState("");
  const [reclMetodoCobro, setReclMetodoCobro] = useState<string | null>(null);
  const [reclCobroConfirmado, setReclCobroConfirmado] = useState(false);
  const [reclFechaCobro, setReclFechaCobro] = useState("");
  const [reclCerrado, setReclCerrado] = useState(false);
  const [reclLoadedFor, setReclLoadedFor] = useState<number | null>(null);
  const [reclNotaTexto, setReclNotaTexto] = useState("");
  const [nuevoAdjuntos, setNuevoAdjuntos] = useState<{ tipo: AdjuntoTipo; file: File }[]>([]);
  const [nuevoAdjuntosSaving, setNuevoAdjuntosSaving] = useState(false);

  async function verAdjunto(idAdjunto: number, key: string) {
    const newWindow = window.open("", "_blank");
    setLoadingAdjunto(idAdjunto);
    try {
      const result = await getAdjunto({ data: { key } });
      if (newWindow) {
        newWindow.location.href = dataUrlToBlobUrl(result.dataUrl);
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

  const reclamacionQ = useQuery({
    queryKey: ["mantenimiento-reclamacion", idIncidencia],
    enabled: idIncidencia != null,
    queryFn: async (): Promise<Tables<"manteniment_reclamaciones"> | null> => {
      const { data, error } = await supabase
        .from("manteniment_reclamaciones")
        .select("*")
        .eq("id_incidencia", idIncidencia!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const reclamacionNotasQ = useQuery({
    queryKey: ["mantenimiento-reclamacion-notas", reclamacionQ.data?.id_reclamacion],
    enabled: reclamacionQ.data?.id_reclamacion != null,
    queryFn: async (): Promise<Tables<"manteniment_reclamacion_notas">[]> => {
      const { data, error } = await supabase
        .from("manteniment_reclamacion_notas")
        .select("*")
        .eq("id_reclamacion", reclamacionQ.data!.id_reclamacion)
        .order("creado_en", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { persona: currentPersona } = useCurrentPersonal();

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
    adjuntosQ.refetch();
    reclamacionQ.refetch();
    reclamacionNotasQ.refetch();
    onSaved();
  }

  const actions = useMantenimientoActions(refetchAll);

  const inc = detailQ.data ?? null;
  const sesiones = sesionesQ.data ?? [];
  const adjuntos = adjuntosQ.data ?? [];
  // Legacy rows predating the `fase` column have it null/undefined — treat those
  // as 'apertura' rather than splitting them into a section that never existed.
  const adjuntosApertura = adjuntos.filter((a) => (a.fase as string | undefined) !== "cierre");
  const adjuntosCierre = adjuntos.filter((a) => (a.fase as string | undefined) === "cierre");

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

  useEffect(() => {
    if (inc && notaFinalizacionLoadedFor !== inc.id_incidencia) {
      setNotaFinalizacion(inc.notas_finalizacion ?? "");
      setNotaFinalizacionLoadedFor(inc.id_incidencia);
    }
  }, [inc, notaFinalizacionLoadedFor]);

  useEffect(() => {
    const r = reclamacionQ.data;
    if (r && reclLoadedFor !== r.id_reclamacion) {
      setReclResponsable(r.id_responsable);
      setReclImporteReclamado(r.importe_reclamado != null ? String(r.importe_reclamado) : "");
      setReclImporteCobrado(r.importe_cobrado != null ? String(r.importe_cobrado) : "");
      setReclMetodoCobro(r.metodo_cobro);
      setReclCobroConfirmado(r.cobro_confirmado);
      setReclFechaCobro(r.fecha_cobro ?? "");
      setReclCerrado(r.cerrado);
      setReclLoadedFor(r.id_reclamacion);
    } else if (!r && reclLoadedFor != null) {
      setReclLoadedFor(null);
    }
  }, [reclamacionQ.data, reclLoadedFor]);

  const open = idIncidencia != null;
  const closedSessions = sesiones.filter((s) => s.fi != null);
  const totalHoras = closedSessions.reduce((sum, s) => sum + (s.hores ?? 0), 0);
  const hasOpenSession = inc != null && sesiones.some((s) => s.fi == null && s.id_persona === inc.id_assignat);
  // Notas de gestión/finalización: writable by anyone with edit access on the
  // module, OR anyone who has ever had a manteniment_registre session on THIS
  // incidencia — narrower than `editable`, which still gates Descripción and the
  // whole footer action bar. The guardar_notas_* RPCs enforce the same rule
  // server-side; this is only a UX convenience, not the authorization boundary.
  const puedeEditarNotasGestion =
    editable || (selfAssignId != null && sesiones.some((s) => s.id_persona === selfAssignId));
  // Narrower than `editable` — lets the worker who reported an incidencia edit
  // its Descripción and add adjuntos while it's still awaiting validation, without
  // exposing the footer action bar or the reclamación section (both stay gated by
  // `editable` only).
  const puedeEditarComoReporter =
    editable ||
    (inc != null && selfAssignId != null && inc.id_reporter === selfAssignId && inc.estat === "pendent_validacio");
  const notaDirty = inc != null && nota !== (inc.notas_gestor ?? "");
  const descripcioDirty = inc != null && descripcio !== (inc.descripcio ?? "");
  const notaFinalizacionDirty = inc != null && notaFinalizacion !== (inc.notas_finalizacion ?? "");
  const recl = reclamacionQ.data ?? null;
  // Split into two groups because they're filled in at different moments —
  // the claim is raised first (Responsable/Importe reclamado), resolved later
  // (cobro/cierre) — so each gets its own independent Guardar/dirty state.
  const reclDirtyGroup1 =
    recl != null &&
    (reclResponsable !== recl.id_responsable ||
      reclImporteReclamado !== (recl.importe_reclamado != null ? String(recl.importe_reclamado) : ""));
  const reclDirtyGroup2 =
    recl != null &&
    (reclMetodoCobro !== recl.metodo_cobro ||
      reclCobroConfirmado !== recl.cobro_confirmado ||
      reclFechaCobro !== (recl.fecha_cobro ?? "") ||
      reclImporteCobrado !== (recl.importe_cobrado != null ? String(recl.importe_cobrado) : "") ||
      reclCerrado !== recl.cerrado);

  // Propose (never force) a fecha/importe only at the moment Cobro confirmado
  // transitions off -> on, and only when that specific field is still empty —
  // same "propose but don't force" pattern as before, just scoped to this one
  // transition instead of re-evaluating on every render.
  function handleCobroConfirmadoChange(value: boolean | "indeterminate") {
    const checked = !!value;
    if (checked && !reclCobroConfirmado) {
      if (!reclFechaCobro) setReclFechaCobro(todayISO());
      if (!reclImporteCobrado) setReclImporteCobrado(reclImporteReclamado);
    }
    setReclCobroConfirmado(checked);
  }

  async function handleAddReclNota() {
    if (!recl || !reclNotaTexto.trim()) return;
    await actions.agregarNotaReclamacion(recl.id_reclamacion, reclNotaTexto, currentPersona?.id_persona ?? null);
    setReclNotaTexto("");
  }

  async function handleSubirNuevoAdjunto() {
    if (!inc || nuevoAdjuntos.length === 0) return;
    setNuevoAdjuntosSaving(true);
    await actions.subirAdjuntosIncidencia(inc.id_incidencia, nuevoAdjuntos, selfAssignId ?? null, "apertura");
    setNuevoAdjuntos([]);
    setNuevoAdjuntosSaving(false);
    refetchAll();
  }

  // Fin total already closes the incidencia — this dialog is a purely optional,
  // skippable follow-up. Skipping it (Omitir) must never undo or block the closure
  // that already happened.
  async function handleFinTotalWithExtras(target: Incidencia) {
    const ok = await actions.finTotal(target);
    if (ok) setFinTotalExtrasOpen(true);
  }

  function closeFinTotalExtras() {
    setFinTotalExtrasOpen(false);
    setFinTotalExtrasAdjuntos([]);
    setFinTotalExtrasNota("");
  }

  async function handleGuardarFinTotalExtras() {
    if (!inc) return;
    setFinTotalExtrasSaving(true);
    if (finTotalExtrasAdjuntos.length > 0) {
      await actions.subirAdjuntosIncidencia(inc.id_incidencia, finTotalExtrasAdjuntos, selfAssignId ?? null, "cierre");
    }
    const notaTrim = finTotalExtrasNota.trim();
    if (notaTrim) {
      // guardarNotaFinalizacion's onMutated already refetches detail/sesiones/adjuntos.
      await actions.guardarNotaFinalizacion(inc, notaTrim);
    } else if (finTotalExtrasAdjuntos.length > 0) {
      refetchAll();
    }
    setFinTotalExtrasSaving(false);
    closeFinTotalExtras();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
          {inc && (
            <DialogHeader className="px-4 py-3 border-b">
              <DialogTitle className="sr-only">{inc.titol}</DialogTitle>
              <div className="flex items-center justify-between gap-2 flex-wrap pr-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <TipoBadge tipus={inc.tipus} />
                  <EstadoFullPill estat={inc.estat} />
                </div>
                <PrioridadPill prioridad={inc.prioritat_confirmada ?? inc.prioritat_proposta} />
              </div>
              <DialogDescription className="sr-only">Detalle de la incidencia de mantenimiento</DialogDescription>
            </DialogHeader>
          )}

          <div className="overflow-y-auto px-4 py-3 space-y-3">
            {detailQ.isError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Error cargando la incidencia: {(detailQ.error as Error).message}
              </div>
            ) : !inc ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-sm">
                  <Home className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {resolveLocation(inc, aptById, espacioById, grupoById)}
                </div>

                <section>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Descripción</Label>
                    {puedeEditarComoReporter && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-6 px-2 text-xs",
                          descripcioDirty && "bg-red-600 hover:bg-red-700 text-white border-red-600",
                        )}
                        disabled={!descripcioDirty}
                        onClick={() => actions.guardarDescripcio(inc, descripcio)}
                      >
                        Guardar
                      </Button>
                    )}
                  </div>
                  <Textarea rows={3} className="mt-1" placeholder="Describe la incidencia…" value={descripcio} onChange={(e) => setDescripcio(e.target.value)} disabled={!puedeEditarComoReporter} />
                </section>

                <section>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
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
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Reportado por</Label>
                      <div className="mt-1 text-sm">
                        {inc.id_reporter != null ? fullName(personaById.get(inc.id_reporter)) : "—"}
                        <div className="text-xs text-muted-foreground">{fmtDateTime(inc.creado_en)}</div>
                        {inc.data_incident && (
                          <div className="text-xs text-muted-foreground">Ocurrió: {fmtDateTime(inc.data_incident)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {(inc.validat_per != null || inc.estat !== "pendent_validacio") && (
                  <section>
                    <div className="grid grid-cols-2 gap-3">
                      {inc.validat_per != null && (
                        <div>
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Validación</Label>
                          <div className="mt-1 text-sm">
                            {fullName(personaById.get(inc.validat_per))}
                            <div className="text-xs text-muted-foreground">{fmtDateTime(inc.validat_en)}</div>
                          </div>
                        </div>
                      )}
                      {inc.estat !== "pendent_validacio" && (
                        <div>
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Asignación</Label>
                          <div className="mt-1 text-sm">
                            {inc.id_assignat != null ? fullName(personaById.get(inc.id_assignat)) : "Sin asignar"}
                            <div className="text-xs text-muted-foreground">
                              <OcupacionPopoverTrigger idApt={inc.id_apt} initialDateISO={inc.data_prevista}>
                                Prevista: {inc.data_prevista ? fmtDate(inc.data_prevista) : "Sin fecha prevista"}
                                {inc.data_reprogramada_por_operario && (
                                  <span title="Fecha modificada por el operario">
                                    <RotateCcw className="inline-block h-3 w-3 ml-1 text-amber-600" />
                                  </span>
                                )}
                              </OcupacionPopoverTrigger>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}

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
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">NOTAS DE GESTIÓN</Label>
                    {puedeEditarNotasGestion && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-6 px-2 text-xs",
                          notaDirty && "bg-red-600 hover:bg-red-700 text-white border-red-600",
                        )}
                        disabled={!notaDirty}
                        onClick={() => actions.guardarNotaGestion(inc, nota)}
                      >
                        Guardar
                      </Button>
                    )}
                  </div>
                  <Textarea rows={3} className="mt-1" placeholder="Añade notas internas…" value={nota} onChange={(e) => setNota(e.target.value)} disabled={!puedeEditarNotasGestion} />
                </section>

                <section>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Adjuntos</Label>
                  <div className="mt-1.5 space-y-2">
                    <AdjuntosGroup adjuntos={adjuntosApertura} loadingAdjunto={loadingAdjunto} onVer={verAdjunto} />
                    {puedeEditarComoReporter && (
                      <div className="space-y-1.5 pt-2 border-t">
                        <AdjuntoPicker adjuntos={nuevoAdjuntos} onChange={setNuevoAdjuntos} />
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            "h-6 px-2 text-xs",
                            nuevoAdjuntos.length > 0 && "bg-red-600 hover:bg-red-700 text-white border-red-600",
                          )}
                          disabled={nuevoAdjuntos.length === 0 || nuevoAdjuntosSaving}
                          onClick={handleSubirNuevoAdjunto}
                        >
                          {nuevoAdjuntosSaving ? "Subiendo…" : "Subir adjuntos"}
                        </Button>
                      </div>
                    )}
                  </div>
                </section>

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

                {inc.notas_finalizacion && inc.notas_finalizacion.trim() && (
                  <section>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">NOTAS DE FINALIZACIÓN</Label>
                      {puedeEditarNotasGestion && (
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            "h-6 px-2 text-xs",
                            notaFinalizacionDirty && "bg-red-600 hover:bg-red-700 text-white border-red-600",
                          )}
                          disabled={!notaFinalizacionDirty}
                          onClick={() => actions.guardarNotaFinalizacion(inc, notaFinalizacion)}
                        >
                          Guardar
                        </Button>
                      )}
                    </div>
                    <Textarea
                      rows={3}
                      className="mt-1"
                      value={notaFinalizacion}
                      onChange={(e) => setNotaFinalizacion(e.target.value)}
                      disabled={!puedeEditarNotasGestion}
                    />
                  </section>
                )}

                {adjuntosCierre.length > 0 && (
                  <section>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">ADJUNTOS DE CIERRE</Label>
                    <div className="mt-1.5 space-y-2">
                      <AdjuntosGroup adjuntos={adjuntosCierre} loadingAdjunto={loadingAdjunto} onVer={verAdjunto} />
                    </div>
                  </section>
                )}

                {editable && (
                  <section>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">RECLAMACIÓN AL HUÉSPED</Label>
                    <div className="mt-1.5 space-y-3">
                      {reclamacionQ.isLoading ? (
                        <div className="text-sm text-muted-foreground">Cargando…</div>
                      ) : !recl ? (
                        <div className="space-y-1.5">
                          <div className="text-sm text-muted-foreground">¿Se reclama al huésped por esta incidencia?</div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => actions.crearReclamacion(inc.id_incidencia, currentPersona?.id_persona ?? null)}
                          >
                            Sí, reclamar
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Group 1 — raised when the claim is first filed */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Responsable</Label>
                              <Select
                                value={reclResponsable != null ? String(reclResponsable) : ""}
                                onValueChange={(v) => setReclResponsable(v ? Number(v) : null)}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                                <SelectContent>
                                  {workers.map((w) => (
                                    <SelectItem key={w.id_persona} value={String(w.id_persona)}>
                                      {fullName(w)}{w.codigo ? ` (${w.codigo})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Importe reclamado</Label>
                              <Input
                                type="number"
                                step="0.01"
                                className="h-8 text-xs"
                                value={reclImporteReclamado}
                                onChange={(e) => setReclImporteReclamado(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn(
                                "h-6 px-2 text-xs",
                                reclDirtyGroup1 && "bg-red-600 hover:bg-red-700 text-white border-red-600",
                              )}
                              disabled={!reclDirtyGroup1}
                              onClick={() =>
                                actions.actualizarReclamacion(recl.id_reclamacion, {
                                  id_responsable: reclResponsable,
                                  importe_reclamado: reclImporteReclamado.trim() === "" ? null : Number(reclImporteReclamado),
                                })
                              }
                            >
                              Guardar
                            </Button>
                          </div>

                          {/* Notas */}
                          <div className="pt-2 border-t space-y-2">
                            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notas</Label>
                            <Textarea
                              rows={2}
                              className="text-xs"
                              placeholder="Añade una nota…"
                              value={reclNotaTexto}
                              onChange={(e) => setReclNotaTexto(e.target.value)}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn(
                                "h-6 px-2 text-xs",
                                reclNotaTexto.trim() && "bg-red-600 hover:bg-red-700 text-white border-red-600",
                              )}
                              disabled={!reclNotaTexto.trim()}
                              onClick={handleAddReclNota}
                            >
                              Añadir nota
                            </Button>
                            <div className="space-y-1.5">
                              {(reclamacionNotasQ.data ?? []).length === 0 ? (
                                <div className="text-xs text-muted-foreground italic">Sin notas</div>
                              ) : (
                                (reclamacionNotasQ.data ?? []).map((n) => (
                                  <div key={n.id_nota} className="text-xs rounded-md border bg-muted/30 px-2 py-1.5">
                                    <div>{n.nota}</div>
                                    <div className="text-muted-foreground mt-0.5">
                                      {n.creado_por != null ? fullName(personaById.get(n.creado_por)) : "—"} · {fmtDateTime(n.creado_en)}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Group 2 — resolved later, once the claim is settled */}
                          <div className="pt-2 border-t space-y-3">
                            <div>
                              <Label className="text-xs">Método de cobro</Label>
                              <Select
                                value={reclMetodoCobro ?? ""}
                                onValueChange={(v) => setReclMetodoCobro(v || null)}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin especificar" /></SelectTrigger>
                                <SelectContent>
                                  {METODO_COBRO_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <Checkbox checked={reclCobroConfirmado} onCheckedChange={handleCobroConfirmadoChange} />
                                Cobro confirmado
                              </label>
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <Checkbox checked={reclCerrado} onCheckedChange={(v) => setReclCerrado(!!v)} />
                                Cerrado
                              </label>
                            </div>

                            {reclCobroConfirmado && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs">Fecha de cobro</Label>
                                  <Input
                                    type="date"
                                    className="h-8 text-xs"
                                    value={reclFechaCobro}
                                    onChange={(e) => setReclFechaCobro(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Importe cobrado</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-8 text-xs"
                                    value={reclImporteCobrado}
                                    onChange={(e) => setReclImporteCobrado(e.target.value)}
                                  />
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "h-6 px-2 text-xs",
                                  reclDirtyGroup2 && "bg-red-600 hover:bg-red-700 text-white border-red-600",
                                )}
                                disabled={!reclDirtyGroup2}
                                onClick={() =>
                                  actions.actualizarReclamacion(recl.id_reclamacion, {
                                    metodo_cobro: reclMetodoCobro,
                                    cobro_confirmado: reclCobroConfirmado,
                                    fecha_cobro: reclFechaCobro.trim() === "" ? null : reclFechaCobro,
                                    importe_cobrado: reclImporteCobrado.trim() === "" ? null : Number(reclImporteCobrado),
                                    cerrado: reclCerrado,
                                  })
                                }
                              >
                                Guardar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => actions.eliminarReclamacion(recl.id_reclamacion)}
                              >
                                Eliminar reclamación
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}
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
                  {selfAssignId != null ? (
                    <Button
                      className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
                      onClick={() => actions.confirmarAsignacion(inc, selfAssignId, null, inc.prioritat_proposta)}
                    >
                      Autoasignar
                    </Button>
                  ) : (
                    <Button
                      className="bg-[#26215C] hover:bg-[#1e1a48] text-white"
                      onClick={() => setAssignOpen(true)}
                    >
                      Asignar
                    </Button>
                  )}
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
                    onClick={() => handleFinTotalWithExtras(inc)}
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

      {/* Optional, skippable follow-up after Fin total — the incidencia is already
          closed by the time this appears, Omitir just discards this extra step. */}
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
    </>
  );
}
