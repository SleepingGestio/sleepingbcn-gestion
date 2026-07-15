import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Wrench, PackageX, HelpCircle, Camera, Video, Mic, FileText, X } from "lucide-react";

export type IncidenciaTipo = "averia_rotura" | "manteniment" | "material_danyat" | "altre";

const TIPO_OPTIONS: { value: IncidenciaTipo; label: string; icon: typeof AlertTriangle }[] = [
  { value: "averia_rotura", label: "Avería / Rotura", icon: AlertTriangle },
  { value: "manteniment", label: "Mantenimiento", icon: Wrench },
  { value: "material_danyat", label: "Material dañado / reposición", icon: PackageX },
  { value: "altre", label: "Otro", icon: HelpCircle },
];

type Prioridad = "alta" | "normal" | "baixa";

const PRIORIDAD_OPTIONS: { value: Prioridad; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "normal", label: "Media" },
  { value: "baixa", label: "Baja" },
];

type AdjuntoTipo = "foto" | "video" | "audio" | "documento";

const ADJUNTO_OPTIONS: { tipo: AdjuntoTipo; label: string; icon: typeof Camera; accept: string }[] = [
  { tipo: "foto", label: "Foto", icon: Camera, accept: "image/*" },
  { tipo: "video", label: "Vídeo", icon: Video, accept: "video/*" },
  { tipo: "audio", label: "Nota de voz", icon: Mic, accept: "audio/*" },
  { tipo: "documento", label: "Documento", icon: FileText, accept: ".pdf,.doc,.docx,image/*" },
];

/**
 * Context the sheet is opened from. "neteja" = launched from an active
 * cleaning (apt/group/cleaning are fixed, shown read-only). "manteniment"
 * = launched standalone (e.g. mi-dia's persistent entry for Mantenimiento
 * workers, or the future /mantenimiento panel) — apartment must be picked.
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
    };

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
  const [step, setStep] = useState<1 | 2>(1);
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
  const [saving, setSaving] = useState(false);

  const espaciosComunesQ = useQuery({
    queryKey: ["espacios-comunes-activos"],
    enabled: context.origen === "manteniment",
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

  function reset() {
    setStep(1);
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
    setSaving(false);
  }

  function handleClose(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  function addAdjunto(tipoAdj: AdjuntoTipo, file: File | null) {
    if (!file) return;
    // TODO: no storage/upload integration exists yet in this codebase (no
    // R2 binding, Supabase Edge Function, or signed-URL pattern found in a
    // repo-wide search). Once the upload path is designed, upload the file
    // here and insert a row into manteniment_adjunts referencing the new
    // incidencia's id. For now the file is only tracked client-side so the
    // form doesn't feel broken — nothing is persisted for attachments yet.
    console.warn("[ReportarIncidenciaSheet] TODO: attachment upload not implemented", tipoAdj, file.name);
    setAdjuntos((prev) => [...prev, { tipo: tipoAdj, file }]);
  }

  const filteredApts =
    context.origen === "manteniment"
      ? idGrupo == null
        ? context.apartamentos
        : context.apartamentos.filter((a) => a.id_grupo === idGrupo)
      : [];

  async function submit() {
    if (!tipo) return;
    if (context.origen === "manteniment" && idApt == null && idEspacioComun == null && !otroUbicacion) {
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
    const titol = aptName ? `${tipoLabel} — ${aptName}` : tipoLabel;
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
    const { error } = await supabase.from("manteniment_incidencies").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    toast.success("Incidencia registrada");
    handleClose(false);
    onSaved?.();
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="pt-2 pb-6 space-y-4">
          {step === 1 && (
            <>
              <div>
                <div className="text-lg font-semibold">Reportar incidencia</div>
                <div className="text-xs text-muted-foreground">¿Qué tipo de incidencia quieres reportar?</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {TIPO_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      setTipo(o.value);
                      setStep(2);
                    }}
                    className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-5 text-sm font-medium text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    <o.icon className="h-6 w-6" />
                    {o.label}
                  </button>
                ))}
              </div>
              <Button variant="outline" className="w-full h-11" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
            </>
          )}

          {step === 2 && tipo && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Cambiar tipo
              </button>
              <div className="text-lg font-semibold">
                {TIPO_OPTIONS.find((o) => o.value === tipo)?.label}
              </div>

              {context.origen === "neteja" ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Apartamento</div>
                  <div className="font-medium">{context.aptLabel}</div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Grupo</Label>
                    <select
                      value={idGrupo ?? ""}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        setIdGrupo(v);
                        if (idApt != null && context.origen === "manteniment") {
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
                        <button
                          type="button"
                          onClick={() => setAdjuntos((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Prioridad</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PRIORIDAD_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setPrioridad(o.value)}
                      className={`h-9 rounded-md border text-sm font-medium transition-colors ${
                        prioridad === o.value
                          ? "border-[#26215C] bg-[#26215C]/10 text-[#26215C]"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
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
                  disabled={
                    saving ||
                    (context.origen === "manteniment" && idApt == null && idEspacioComun == null && !otroUbicacion)
                  }
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
