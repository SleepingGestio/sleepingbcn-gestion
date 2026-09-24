import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  insertEvento, updateEvento, deleteEvento, fetchTemporadas,
  type Evento, type EventoEstado, type EventoFase,
  type EventoTipoValor,
} from "@/lib/pricing";
import { addDaysISO } from "@/lib/format";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

const ESTADO_OPTIONS: { value: EventoEstado; label: string }[] = [
  { value: "confirmado", label: "Confirmado" },
  { value: "propuesto", label: "Propuesto" },
  { value: "descartado", label: "Descartado" },
];

// Edit mode only: an edition either has no price change, a %/€ effect (valor),
// or a season override (temporada_override_id) — never both (DB enforces it too).
// Exported so dias-asignar-evento-dialog.tsx's own reassign-existing-edition
// path (also edit-mode-shaped, since it updates an existing Evento) can reuse
// the same three options instead of redefining them.
export type EfectoModo = "ninguno" | "valor" | "temporada";

export const EFECTO_OPTIONS: { value: EfectoModo; label: string }[] = [
  { value: "ninguno", label: "Sin cambio" },
  { value: "valor", label: "Efecto %/€" },
  { value: "temporada", label: "Cambio de temporada" },
];

export function isPositiveIntOrEmpty(s: string): boolean {
  return s.trim() === "" || (Number.isInteger(Number(s)) && Number(s) > 0);
}

/**
 * Create/edit dialog for pricing.eventos editions. Create mode (no `evento`)
 * is used by the per-row "+ Previo" / "+ Post" actions (fase set accordingly,
 * evento_relacionado_id = parent.id; categoria/aplica_a/plantilla_id come from
 * parent). Edit mode (`evento` given, fase = evento.fase; `parent` is only used
 * to resolve aplica_a for a previo/post's season choices) pre-fills from the
 * row and updates it. Categoría / Aplica a are owned by the
 * plantilla and never shown here; principal editions are created from the
 * Plantillas screen, not from this dialog.
 */
export function EventoFormDialog({
  fase, parent, evento, onClose, onSaved,
}: {
  fase: EventoFase;
  parent: Evento | null;
  evento?: Evento | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(evento?.nombre ?? "");
  // previo: one-day range ending where the principal starts; post: one-day
  // range starting where the principal ends (both still editable).
  const [fechaInicio, setFechaInicio] = useState(
    evento?.fecha_inicio ??
      (parent && fase === "previo" ? addDaysISO(parent.fecha_inicio, -1)
        : parent && fase === "post" ? parent.fecha_fin
        : ""),
  );
  const [fechaFin, setFechaFin] = useState(
    evento?.fecha_fin ??
      (parent && fase === "previo" ? parent.fecha_inicio
        : parent && fase === "post" ? addDaysISO(parent.fecha_fin, 1)
        : ""),
  );
  const [valor, setValor] = useState(evento?.valor != null ? String(evento.valor) : "");
  const [tipoValor, setTipoValor] = useState<EventoTipoValor>(evento?.tipo_valor ?? "%");
  const [efecto, setEfecto] = useState<EfectoModo>(
    evento?.temporada_override_id ? "temporada" : evento?.valor != null ? "valor" : "ninguno",
  );
  const [temporadaId, setTemporadaId] = useState(evento?.temporada_override_id ?? "");
  const [estanciaMinima, setEstanciaMinima] = useState(
    evento?.estancia_minima != null ? String(evento.estancia_minima) : "",
  );
  const [afluencia, setAfluencia] = useState(
    evento?.afluencia_estimada != null ? String(evento.afluencia_estimada) : "",
  );
  const [ubicacion, setUbicacion] = useState(evento?.ubicacion ?? "");
  const [estado, setEstado] = useState<EventoEstado>(evento?.estado ?? "confirmado");
  const [notas, setNotas] = useState(evento?.notas ?? "");
  const [saving, setSaving] = useState(false);

  const temporadasQ = useQuery({
    queryKey: ["pricing-temporadas"],
    queryFn: fetchTemporadas,
    enabled: !!evento,
  });
  // previo/post editions are inherited from their principal, so its aplica_a rules.
  const aplicaTemporada = evento ? (fase === "principal" ? evento.aplica_a : (parent?.aplica_a ?? evento.aplica_a)) : null;
  const temporadaOptions = (temporadasQ.data ?? []).filter(
    (t) => aplicaTemporada === "ambos" || t.aplica_a === aplicaTemporada,
  );

  function changeEfecto(next: EfectoModo) {
    setEfecto(next);
    if (next !== "valor") setValor("");
    if (next !== "temporada") setTemporadaId("");
  }

  const title = evento
    ? fase === "previo" ? "Editar previo" : fase === "post" ? "Editar post" : `Editar — ${evento.nombre}`
    : fase === "previo" ? `Nuevo previo — ${parent?.nombre ?? ""}`
    : fase === "post" ? `Nuevo post — ${parent?.nombre ?? ""}`
    : "Nuevo evento";

  async function handleSubmit() {
    if (!nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (!fechaInicio || !fechaFin) { toast.error("Las fechas son obligatorias"); return; }
    if (fechaFin < fechaInicio) { toast.error("La fecha de fin no puede ser anterior a la de inicio"); return; }

    if (!isPositiveIntOrEmpty(estanciaMinima)) {
      toast.error("La estancia mínima debe ser un número entero mayor que 0");
      return;
    }
    if (!isPositiveIntOrEmpty(afluencia)) {
      toast.error("La afluencia estimada debe ser un número entero mayor que 0");
      return;
    }
    if (evento && efecto === "valor" && valor.trim() === "") {
      toast.error("Introduce un valor o elige «Sin cambio»");
      return;
    }
    if (evento && efecto === "temporada" && !temporadaId) {
      toast.error("Elige una temporada o «Sin cambio»");
      return;
    }

    setSaving(true);
    try {
      if (evento) {
        await updateEvento(evento.id, {
          nombre: nombre.trim(),
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          // Only the chosen option is written; the other one is explicitly nulled.
          valor: efecto === "valor" ? Number(valor) : null,
          tipo_valor: efecto === "valor" ? tipoValor : null,
          temporada_override_id: efecto === "temporada" ? temporadaId : null,
          estancia_minima: estanciaMinima.trim() === "" ? null : Number(estanciaMinima),
          afluencia_estimada: afluencia.trim() === "" ? null : Number(afluencia),
          ubicacion: ubicacion.trim() || null,
          estado,
          notas: notas.trim() || null,
        });
      } else {
        await insertEvento({
          nombre: nombre.trim(),
          categoria: parent!.categoria,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          aplica_a: parent!.aplica_a,
          valor: valor.trim() === "" ? null : Number(valor),
          tipo_valor: valor.trim() === "" ? null : tipoValor,
          estancia_minima: estanciaMinima.trim() === "" ? null : Number(estanciaMinima),
          fase,
          evento_relacionado_id: parent?.id ?? null,
          plantilla_id: parent?.plantilla_id ?? null,
          notas: notas.trim() || null,
        });
      }
      toast.success("Evento guardado");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Only previo/post editions can be deleted from here; principals keep the
  // soft "Descartar" flow.
  const canDelete = !!evento && evento.fase !== "principal";

  async function handleDelete() {
    if (!evento) return;
    if (!window.confirm(`¿Eliminar definitivamente este ${fase === "previo" ? "previo" : "post"}? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      await deleteEvento(evento.id);
      toast.success("Evento eliminado");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const valorTipoFields = (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Valor">
        <Input
          type="number"
          step="any"
          placeholder="Opcional"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
      </Field>
      {valor.trim() !== "" && (
        <Field label="Tipo">
          <Select value={tipoValor} onValueChange={(v) => setTipoValor(v as EventoTipoValor)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="%">%</SelectItem>
              <SelectItem value="€">€</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {evento ? "Formulario de edición de evento" : "Formulario de alta de evento"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <Field label="Nombre *">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha inicio *">
              <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </Field>
            <Field label="Fecha fin *">
              <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            </Field>
          </div>
          {evento ? (
            <>
              <Field label="Efecto / Cambio de temporada">
                <Select value={efecto} onValueChange={(v) => changeEfecto(v as EfectoModo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EFECTO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {efecto === "valor" && valorTipoFields}
              {efecto === "temporada" && (
                <Field label="Temporada">
                  <Select value={temporadaId || undefined} onValueChange={setTemporadaId}>
                    <SelectTrigger><SelectValue placeholder="Elige una temporada" /></SelectTrigger>
                    <SelectContent>
                      {temporadaOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {aplicaTemporada === "ambos" ? `${t.aplica_a === "city" ? "City" : "Rural"} · ` : ""}
                          {t.codigo} — {t.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </>
          ) : (
            valorTipoFields
          )}
          <Field label="Estancia mínima (noches)">
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="Opcional"
              value={estanciaMinima}
              onChange={(e) => setEstanciaMinima(e.target.value)}
            />
          </Field>
          {evento && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Afluencia estimada">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Opcional"
                    value={afluencia}
                    onChange={(e) => setAfluencia(e.target.value)}
                  />
                </Field>
                <Field label="Ubicación">
                  <Input
                    placeholder="Opcional"
                    value={ubicacion}
                    onChange={(e) => setUbicacion(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Estado">
                <Select value={estado} onValueChange={(v) => setEstado(v as EventoEstado)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESTADO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
          <Field label="Notas">
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>
        <DialogFooter>
          {canDelete && (
            <Button variant="destructive" className="sm:mr-auto" onClick={handleDelete} disabled={saving}>
              Eliminar
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
