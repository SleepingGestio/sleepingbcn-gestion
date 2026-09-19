import { useState } from "react";
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
  insertEvento, updateEvento,
  type Evento, type EventoAplicaA, type EventoCategoria, type EventoEstado, type EventoFase,
  type EventoTipoValor,
} from "@/lib/pricing";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

const CATEGORIA_OPTIONS: { value: EventoCategoria; label: string }[] = [
  { value: "feria", label: "Feria" },
  { value: "deporte", label: "Deporte" },
  { value: "cultura", label: "Cultura" },
  { value: "otro", label: "Otro" },
];

const APLICA_A_OPTIONS: { value: EventoAplicaA; label: string }[] = [
  { value: "city", label: "City" },
  { value: "rural", label: "Rural" },
  { value: "ambos", label: "Ambos" },
];

const ESTADO_OPTIONS: { value: EventoEstado; label: string }[] = [
  { value: "confirmado", label: "Confirmado" },
  { value: "propuesto", label: "Propuesto" },
  { value: "descartado", label: "Descartado" },
];

export function isPositiveIntOrEmpty(s: string): boolean {
  return s.trim() === "" || (Number.isInteger(Number(s)) && Number(s) > 0);
}

/**
 * Create/edit dialog for pricing.eventos. Create mode (no `evento`) is used
 * for the top-level "+ Nuevo evento" (fase "principal", no parent) and for the
 * per-row "+ Previo" / "+ Post" actions (fase set accordingly,
 * evento_relacionado_id = parent.id). Edit mode (`evento` given, fase =
 * evento.fase, parent unused) pre-fills from the row and updates it; previo/post
 * rows never expose Categoría / Aplica a in either mode (inherited from parent).
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
  const [categoria, setCategoria] = useState<EventoCategoria>(evento?.categoria ?? "feria");
  const [fechaInicio, setFechaInicio] = useState(
    evento?.fecha_inicio ?? (fase === "post" ? (parent?.fecha_fin ?? "") : ""),
  );
  const [fechaFin, setFechaFin] = useState(
    evento?.fecha_fin ?? (fase === "previo" ? (parent?.fecha_inicio ?? "") : ""),
  );
  const [aplicaA, setAplicaA] = useState<EventoAplicaA>(evento?.aplica_a ?? "ambos");
  const [valor, setValor] = useState(evento?.valor != null ? String(evento.valor) : "");
  const [tipoValor, setTipoValor] = useState<EventoTipoValor>(evento?.tipo_valor ?? "%");
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

    setSaving(true);
    try {
      if (evento) {
        await updateEvento(evento.id, {
          nombre: nombre.trim(),
          ...(fase === "principal" ? { categoria, aplica_a: aplicaA } : {}),
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          valor: valor.trim() === "" ? null : Number(valor),
          tipo_valor: valor.trim() === "" ? null : tipoValor,
          estancia_minima: estanciaMinima.trim() === "" ? null : Number(estanciaMinima),
          afluencia_estimada: afluencia.trim() === "" ? null : Number(afluencia),
          ubicacion: ubicacion.trim() || null,
          estado,
          notas: notas.trim() || null,
        });
      } else {
        await insertEvento({
          nombre: nombre.trim(),
          categoria: fase === "principal" ? categoria : parent!.categoria,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          aplica_a: fase === "principal" ? aplicaA : parent!.aplica_a,
          valor: valor.trim() === "" ? null : Number(valor),
          tipo_valor: valor.trim() === "" ? null : tipoValor,
          estancia_minima: estanciaMinima.trim() === "" ? null : Number(estanciaMinima),
          fase,
          evento_relacionado_id: parent?.id ?? null,
          plantilla_id: fase !== "principal" ? (parent?.plantilla_id ?? null) : null,
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
          {fase === "principal" && (
            <Field label="Categoría">
              <Select value={categoria} onValueChange={(v) => setCategoria(v as EventoCategoria)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIA_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha inicio *">
              <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </Field>
            <Field label="Fecha fin *">
              <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            </Field>
          </div>
          {fase === "principal" && (
            <Field label="Aplica a">
              <Select value={aplicaA} onValueChange={(v) => setAplicaA(v as EventoAplicaA)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APLICA_A_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
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
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
