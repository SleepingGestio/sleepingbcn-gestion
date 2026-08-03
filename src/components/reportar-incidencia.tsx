import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Wrench, PackageX, HelpCircle, Camera, Video, Mic, FileText, X } from "lucide-react";
import { TIPO_STYLE, PRIORIDAD_STYLE, ESTADO_FULL_STYLE, type IncidenciaTipo, type Prioridad, type Estat } from "@/lib/mantenimiento";
import { uploadAdjunto } from "@/lib/api/manteniment-adjuntos.functions";

const TIPO_OPTIONS: { value: IncidenciaTipo; label: string; icon: typeof AlertTriangle }[] = [
  { value: "averia_rotura", label: "Avería / Rotura", icon: AlertTriangle },
  { value: "manteniment", label: "Mantenimiento", icon: Wrench },
  { value: "material_danyat", label: "Material dañado / reposición", icon: PackageX },
  { value: "altre", label: "Otro", icon: HelpCircle },
];

const PRIORIDAD_OPTIONS: Prioridad[] = ["alta", "normal", "baixa"];

export type AdjuntoTipo = "foto" | "video" | "nota_veu" | "document";

const ADJUNTO_OPTIONS: { tipo: AdjuntoTipo; label: string; icon: typeof Camera; accept: string; capture?: "environment" | "user" }[] = [
  { tipo: "foto", label: "Foto", icon: Camera, accept: "image/*", capture: "environment" },
  { tipo: "video", label: "Vídeo", icon: Video, accept: "video/*", capture: "environment" },
  { tipo: "nota_veu", label: "Nota de voz", icon: Mic, accept: "audio/*", capture: "user" },
  { tipo: "document", label: "Documento", icon: FileText, accept: ".pdf,.doc,.docx" },
];

// Controlled attachment picker — file/photo/video/document selection UI, shared by
// ReportarIncidenciaSheet (new incidencia) and MantenimientoPopover's post-"Fin
// total" optional-extras dialog. Upload + manteniment_adjunts insert stays with each
// caller (they differ: creado_per is the reporter vs the worker closing the task).
export function AdjuntoPicker({
  adjuntos,
  onChange,
}: {
  adjuntos: { tipo: AdjuntoTipo; file: File }[];
  onChange: (adjuntos: { tipo: AdjuntoTipo; file: File }[]) => void;
}) {
  function addAdjunto(tipoAdj: AdjuntoTipo, file: File | null) {
    if (!file) return;
    onChange([...adjuntos, { tipo: tipoAdj, file }]);
  }
  function removeAdjunto(i: number) {
    onChange(adjuntos.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs">Adjuntar</Label>
      <div className="grid grid-cols-4 gap-2">
        {ADJUNTO_OPTIONS.map((o) => (
          <label
            key={o.tipo}
            className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-3 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <o.icon className="h-5 w-5" />
            {o.label}
            <input
              type="file"
              accept={o.accept}
              capture={o.capture}
              className="hidden"
              onChange={(e) => {
                addAdjunto(o.tipo, e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        ))}
      </div>
      {adjuntos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {adjuntos.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700"
            >
              {a.file.name}
              <button type="button" onClick={() => removeAdjunto(i)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Context the sheet is opened from. "neteja" = launched from an active
 * cleaning (apt/group/cleaning are fixed, shown read-only). "manteniment"
 * = launched standalone from mi-dia's persistent entry for Mantenimiento
 * workers — apartment must be picked. "gestor" = launched from the
 * /mantenimiento console (a gestor reporting on someone else's behalf,
 * possibly after the fact) — same manual location picker as "manteniment",
 * plus an editable "fecha del incidente" field.
 */
export type ReportarIncidenciaContext =
  | {
      origen: "neteja";
      idApt: number;
      idGrupo: number | null;
      idLimpieza: number;
      aptLabel: string;
    }
  | {
      origen: "manteniment";
      grupos: { id_grupo: number; nombre: string }[];
      apartamentos: { id_apt: number; nombre: string; id_grupo: number | null }[];
    }
  | {
      origen: "gestor";
      grupos: { id_grupo: number; nombre: string }[];
      apartamentos: { id_apt: number; nombre: string; id_grupo: number | null }[];
    };

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function ReportarIncidenciaSheet({
  open,
  onOpenChange,
  reporterId,
  context,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reporterId: number;
  context: ReportarIncidenciaContext;
  onSaved?: () => void;
}) {
  const [step, setStep] = useState<"location" | "pending" | "tipo" | "detalle">(
    context.origen === "neteja" ? "pending" : "location",
  );
  const [tipo, setTipo] = useState<IncidenciaTipo | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [materialRepuesto, setMaterialRepuesto] = useState(false);
  const [resueltaAlMomento, setResueltaAlMomento] = useState(false);
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [adjuntos, setAdjuntos] = useState<{ tipo: AdjuntoTipo; file: File }[]>([]);
  const [idApt, setIdApt] = useState<number | null>(null);
  const [idGrupo, setIdGrupo] = useState<number | null>(null);
  const [idEspacioComun, setIdEspacioComun] = useState<number | null>(null);
  const [otroUbicacion, setOtroUbicacion] = useState(false);
  const [dataIncident, setDataIncident] = useState(() => new Date().toISOString());
  const [saving, setSaving] = useState(false);

  // "manteniment" (mi-dia's standalone entry) and "gestor" (the console's
  // entry point) both need the manual grupo/apartamento/espacio-común picker
  // — only "neteja" has a fixed apartment already known from the cleaning.
  const manualLocation = context.origen === "manteniment" || context.origen === "gestor";

  const espaciosComunesQ = useQuery({
    queryKey: ["espacios-comunes-activos"],
    enabled: manualLocation,
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
  const espaciosComunes = espaciosComunesQ.data ?? [];

  // Property the "pending incidents" summary is scoped to — fixed for
  // "neteja", derived from the location step's picker otherwise.
  const pendingScopeIdApt = context.origen === "neteja" ? context.idApt : idApt;
  const pendingScopeIdEspacio = context.origen === "neteja" ? null : idEspacioComun;
  const pendingScopeKnown = pendingScopeIdApt != null || pendingScopeIdEspacio != null;

  const pendingIncidenciasQ = useQuery({
    queryKey: ["reportar-incidencia-pendientes", pendingScopeIdApt, pendingScopeIdEspacio],
    enabled: pendingScopeKnown,
    queryFn: async (): Promise<
      { id_incidencia: number; titol: string | null; descripcio: string | null; tipus: IncidenciaTipo; estat: Estat; data_incident: string | null; creado_en: string }[]
    > => {
      let q = supabase
        .from("manteniment_incidencies")
        .select("id_incidencia, titol, descripcio, tipus, estat, data_incident, creado_en")
        .in("estat", ["pendent_validacio", "validada", "en_curs"])
        .order("creado_en", { ascending: false });
      q = pendingScopeIdApt != null
        ? q.eq("id_apt", pendingScopeIdApt)
        : q.eq("id_tipo_espacio_comun", pendingScopeIdEspacio as number);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as {
        id_incidencia: number; titol: string | null; descripcio: string | null; tipus: IncidenciaTipo; estat: Estat; data_incident: string | null; creado_en: string;
      }[];
    },
  });

  // Property name shown read-only once the location is known — reused by
  // both the "pending" summary heading and the "detalle" step's summary box.
  const resolvedLocationLabel =
    context.origen === "neteja"
      ? context.aptLabel
      : idApt != null
        ? context.apartamentos.find((a) => a.id_apt === idApt)?.nombre ?? "—"
        : idEspacioComun != null
          ? espaciosComunes.find((e) => e.id_tipo === idEspacioComun)?.nombre ?? "—"
          : otroUbicacion
            ? "Otro (ver descripción)"
            : "—";

  function reset() {
    setStep(context.origen === "neteja" ? "pending" : "location");
    setTipo(null);
    setDescripcion("");
    setMaterialRepuesto(false);
    setResueltaAlMomento(false);
    setPrioridad("normal");
    setAdjuntos([]);
    setIdApt(null);
    setIdGrupo(null);
    setIdEspacioComun(null);
    setOtroUbicacion(false);
    setDataIncident(new Date().toISOString());
    setSaving(false);
  }

  function handleClose(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  const filteredApts = manualLocation
    ? idGrupo == null
      ? context.apartamentos
      : context.apartamentos.filter((a) => a.id_grupo === idGrupo)
    : [];

  async function submit() {
    if (!tipo) return;
    if (manualLocation && idApt == null && idEspacioComun == null && !otroUbicacion) {
      toast.error("Selecciona una ubicación");
      return;
    }
    setSaving(true);
    const nowIso = new Date().toISOString();
    const descTrim = descripcion.trim() || null;
    const tipoLabel = TIPO_OPTIONS.find((o) => o.value === tipo)?.label ?? "";
    const espacioComunNombre =
      idEspacioComun != null ? espaciosComunes.find((e) => e.id_tipo === idEspacioComun)?.nombre : undefined;
    const aptName =
      context.origen === "neteja"
        ? context.aptLabel
        : idApt != null
          ? context.apartamentos.find((a) => a.id_apt === idApt)?.nombre
          : espacioComunNombre;
    const titol = aptName ?? tipoLabel;
    const payload: TablesInsert<"manteniment_incidencies"> = {
      tipus: tipo,
      titol,
      descripcio: descTrim,
      origen: context.origen,
      id_reporter: reporterId,
      estat: resueltaAlMomento ? "finalitzada" : "pendent_validacio",
      prioritat_proposta: prioridad,
    };
    if (context.origen === "neteja") {
      payload.id_apt = context.idApt;
      payload.id_grup = context.idGrupo;
      payload.id_limpieza = context.idLimpieza;
    } else {
      payload.id_apt = idApt;
      payload.id_grup = idGrupo;
      payload.id_tipo_espacio_comun = idEspacioComun;
    }
    if (resueltaAlMomento) {
      payload.iniciat_en = nowIso;
      payload.finalitzat_en = nowIso;
      payload.tasca_realitzada = true;
      if (tipo === "material_danyat") payload.material_reposat = materialRepuesto;
    }
    if (context.origen === "gestor") {
      payload.data_incident = dataIncident;
    }
    const { data: inserted, error } = await supabase
      .from("manteniment_incidencies")
      .insert(payload)
      .select("id_incidencia")
      .single();
    if (error) {
      setSaving(false);
      toast.error("Error: " + error.message);
      return;
    }
    if (adjuntos.length > 0) {
      for (const a of adjuntos) {
        try {
          const fd = new FormData();
          fd.set("file", a.file);
          fd.set("id_incidencia", String(inserted.id_incidencia));
          const result = await uploadAdjunto({ data: fd });
          await supabase.from("manteniment_adjunts").insert({
            id_incidencia: inserted.id_incidencia,
            tipus: a.tipo,
            nom_fitxer: result.nombreOriginal,
            url: result.key,
            creado_per: reporterId,
          });
        } catch (e) {
          console.error("[ReportarIncidenciaSheet] adjunto upload failed:", e);
          toast.error(`No se pudo subir el adjunto "${a.file.name}", la incidencia se guardó igualmente`);
        }
      }
    }
    setSaving(false);
    toast.success("Incidencia registrada");
    handleClose(false);
    onSaved?.();
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[90vh] overflow-y-auto sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[85vh] sm:w-full sm:max-w-[440px] sm:rounded-2xl sm:border"
      >
        <div className="pt-2 pb-6 space-y-4">
          {step === "location" && manualLocation && (
            <>
              <div>
                <div className="text-lg font-semibold">Reportar incidencia</div>
                <div className="text-xs text-muted-foreground">¿Dónde está la incidencia?</div>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Grupo</Label>
                  <select
                    value={idGrupo ?? ""}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      setIdGrupo(v);
                      if (idApt != null) {
                        const apt = context.apartamentos.find((a) => a.id_apt === idApt);
                        if (v != null && apt && apt.id_grupo !== v) setIdApt(null);
                      }
                    }}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="">— Ninguno —</option>
                    {context.grupos.map((g) => (
                      <option key={g.id_grupo} value={g.id_grupo}>{g.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ubicación *</Label>
                  <select
                    value={
                      idApt != null
                        ? `apt-${idApt}`
                        : idEspacioComun != null
                          ? `esp-${idEspacioComun}`
                          : otroUbicacion
                            ? "otro"
                            : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      setIdApt(v.startsWith("apt-") ? Number(v.slice(4)) : null);
                      setIdEspacioComun(v.startsWith("esp-") ? Number(v.slice(4)) : null);
                      setOtroUbicacion(v === "otro");
                    }}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="">— Selecciona —</option>
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
                    <option value="otro">Otro (especificar en descripción)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 h-12" onClick={() => handleClose(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 h-12 bg-[#26215C] hover:bg-[#1e1a48] text-white"
                  disabled={idApt == null && idEspacioComun == null && !otroUbicacion}
                  onClick={() => setStep(otroUbicacion ? "tipo" : "pending")}
                >
                  Continuar
                </Button>
              </div>
            </>
          )}

          {step === "pending" && (
            <>
              <div>
                <div className="text-lg font-semibold">Reportar incidencia</div>
                <div className="text-xs text-muted-foreground">Incidencias pendientes en {resolvedLocationLabel}</div>
              </div>

              {pendingIncidenciasQ.isLoading ? (
                <div className="text-sm text-muted-foreground text-center py-6">Cargando…</div>
              ) : (pendingIncidenciasQ.data ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">
                  No hay incidencias pendientes para esta propiedad
                </div>
              ) : (
                <div className="space-y-2 max-h-[240px] overflow-y-auto">
                  {(pendingIncidenciasQ.data ?? []).map((inc) => {
                    const tipoStyle = TIPO_STYLE[inc.tipus];
                    const estadoStyle = ESTADO_FULL_STYLE[inc.estat];
                    return (
                      <div key={inc.id_incidencia} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                        {inc.descripcio && <div className="text-sm text-slate-700 line-clamp-2">{inc.descripcio}</div>}
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: `${tipoStyle.bg}1A`, color: tipoStyle.bg }}
                          >
                            {tipoStyle.label}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: `${estadoStyle.bg}1A`, color: estadoStyle.bg }}
                          >
                            {estadoStyle.label}
                          </span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {new Date(inc.data_incident ?? inc.creado_en).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <Button className="w-full h-12 bg-[#26215C] hover:bg-[#1e1a48] text-white" onClick={() => setStep("tipo")}>
                  Reportar nueva incidencia
                </Button>
                {manualLocation && (
                  <button
                    type="button"
                    onClick={() => setStep("location")}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    ← Cambiar ubicación
                  </button>
                )}
                <Button variant="outline" className="w-full h-11" onClick={() => handleClose(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          )}

          {step === "tipo" && (
            <>
              <button
                type="button"
                onClick={() => setStep("pending")}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Volver
              </button>
              <div>
                <div className="text-lg font-semibold">Reportar incidencia</div>
                <div className="text-xs text-muted-foreground">¿Qué tipo de incidencia quieres reportar?</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {TIPO_OPTIONS.map((o) => {
                  const s = TIPO_STYLE[o.value];
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        setTipo(o.value);
                        setStep("detalle");
                      }}
                      style={{ borderColor: s.bg, backgroundColor: `${s.bg}1A`, color: s.bg }}
                      className="flex flex-col items-center gap-2 rounded-lg border px-3 py-5 text-sm font-medium transition-colors hover:opacity-80"
                    >
                      <o.icon className="h-6 w-6" />
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <Button variant="outline" className="w-full h-11" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
            </>
          )}

          {step === "detalle" && tipo && (
            <>
              <button
                type="button"
                onClick={() => setStep("tipo")}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Cambiar tipo
              </button>
              <div className="text-lg font-semibold">
                {TIPO_OPTIONS.find((o) => o.value === tipo)?.label}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Ubicación</div>
                <div className="font-medium">{resolvedLocationLabel}</div>
              </div>

              {context.origen === "gestor" && (
                <div className="space-y-1">
                  <Label htmlFor="incidencia-fecha" className="text-xs">Fecha del incidente</Label>
                  <Input
                    id="incidencia-fecha"
                    type="datetime-local"
                    value={toLocalDatetimeInput(dataIncident)}
                    onChange={(e) =>
                      setDataIncident(e.target.value ? new Date(e.target.value).toISOString() : new Date().toISOString())
                    }
                    className="text-sm"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="incidencia-desc" className="text-xs">Descripción</Label>
                <Textarea
                  id="incidencia-desc"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Describe la incidencia…"
                  className="text-sm min-h-[90px]"
                />
              </div>

              <AdjuntoPicker adjuntos={adjuntos} onChange={setAdjuntos} />

              <div className="space-y-1.5">
                <Label className="text-xs">Prioridad</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PRIORIDAD_OPTIONS.map((p) => {
                    const s = PRIORIDAD_STYLE[p];
                    const selected = prioridad === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPrioridad(p)}
                        style={selected ? { borderColor: s.bg, backgroundColor: `${s.bg}1A`, color: s.bg } : undefined}
                        className={`h-9 rounded-md border text-sm font-medium transition-colors ${
                          selected ? "" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {tipo === "material_danyat" && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={materialRepuesto} onCheckedChange={(v) => setMaterialRepuesto(!!v)} />
                  Material repuesto
                </label>
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={resueltaAlMomento} onCheckedChange={(v) => setResueltaAlMomento(!!v)} />
                Resuelta al momento
              </label>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 h-12" onClick={() => handleClose(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 h-12 bg-[#26215C] hover:bg-[#1e1a48] text-white"
                  disabled={saving || (manualLocation && idApt == null && idEspacioComun == null && !otroUbicacion)}
                  onClick={submit}
                >
                  {saving ? "Enviando…" : "Enviar incidencia"}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
