import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Field, CATEGORIA_OPTIONS } from "@/components/plantilla-edit-dialog";
import { isPositiveIntOrEmpty, EFECTO_OPTIONS, type EfectoModo } from "@/components/evento-form-dialog";
import { fmtDate, addDaysISO } from "@/lib/format";
import {
  fetchPlantillas, insertEvento, updateEvento,
  type Evento, type Plantilla, type Temporada, type TemporadaAplicaA, type EventoTipoValor,
} from "@/lib/pricing";
import { esRangoContinuo, diffDaysISO, type DiaCalculado } from "@/lib/pricing-calc";

const CREAR_NUEVA_EDICION = "__crear_nueva_edicion__";

const categoriaLabel = (c: Evento["categoria"]) => CATEGORIA_OPTIONS.find((o) => o.value === c)?.label ?? c;

/**
 * "Asignar a evento" from a calendar date-range selection (fechas[0]..fechas[last]):
 * reuse an existing nearby pricing.eventos "edición" (a principal Evento) by
 * reassigning its dates to the selection, or create a brand-new edición for an
 * existing plantilla. Mirrors DiasEdicionMasivaDialog's own shape for temporadas
 * (existing-item select + "+ Crear nueva" + a shared "conditions" section below)
 * but for eventos, per the investigation report this followed: a separate dialog
 * rather than a new tab inside that one, since the "pick or create one entity for
 * a range" shape doesn't fit that dialog's per-day-overrides model.
 */
export function DiasAsignarEventoDialog({
  fechas, anio, aplicaA, eventos, temporadas, dias, onClose, onEventoAplicado,
}: {
  fechas: string[];
  anio: number;
  aplicaA: TemporadaAplicaA;
  /** Already-fetched at page level (["pricing-eventos"]) — no new query for this. */
  eventos: Evento[];
  /** Already-fetched at page level, same convention DiasEdicionMasivaDialog uses. */
  temporadas: Temporada[];
  dias: Map<string, DiaCalculado | null>;
  onClose: () => void;
  /** Called after a reassign or create succeeds, to refetch eventos. */
  onEventoAplicado: () => void | Promise<void>;
}) {
  const rangoValido = useMemo(() => esRangoContinuo(fechas, dias), [fechas, dias]);
  const desde = fechas[0];
  const hasta = fechas[fechas.length - 1];

  // Nearby existing principal editions of this grupo, closest fecha_inicio to
  // `desde` first — computed client-side from the calendar page's own already-
  // fetched eventos (fetchEventos() has no date/plantilla-scoped variant and
  // doesn't need one just for this).
  const cercanas = useMemo(() => {
    if (!rangoValido || !desde) return [];
    return eventos
      .filter((e) => e.fase === "principal")
      // Same "grupo or ambos" convention as pricing.eventos.tsx's own filter
      // and pricing-calc.ts's eventosActivosDia.
      .filter((e) => e.aplica_a === aplicaA || e.aplica_a === "ambos")
      .map((e) => ({ evento: e, distancia: Math.abs(diffDaysISO(desde, e.fecha_inicio)) }))
      .sort((a, b) => a.distancia - b.distancia)
      .slice(0, 8);
  }, [eventos, aplicaA, rangoValido, desde]);

  const plantillasQ = useQuery({ queryKey: ["pricing-plantillas"], queryFn: fetchPlantillas });
  // No existing "plantilla picker" convention to match here: checked
  // plantilla-create-dialog.tsx (creates a brand-new plantilla, never picks an
  // existing one) and evento-form-dialog.tsx (only ever inherits plantilla_id
  // from a given parent evento) — neither actually pickers over existing
  // plantillas. Filtered with the same "activo" + "grupo or ambos" logic used
  // everywhere else in this domain instead.
  const plantillasDisponibles = useMemo(
    () => (plantillasQ.data ?? []).filter((p) => p.activo && (p.aplica_a === aplicaA || p.aplica_a === "ambos")),
    [plantillasQ.data, aplicaA],
  );

  const [edicionElegida, setEdicionElegida] = useState<string>("");
  const [plantillaId, setPlantillaId] = useState<string>("");
  const [efecto, setEfecto] = useState<EfectoModo>("ninguno");
  const [valor, setValor] = useState("");
  const [tipoValor, setTipoValor] = useState<EventoTipoValor>("%");
  const [temporadaId, setTemporadaId] = useState("");
  const [estanciaMinima, setEstanciaMinima] = useState("");
  const [saving, setSaving] = useState(false);

  const chosenEvento =
    edicionElegida && edicionElegida !== CREAR_NUEVA_EDICION
      ? cercanas.find((c) => c.evento.id === edicionElegida)?.evento ?? null
      : null;
  const chosenPlantilla =
    edicionElegida === CREAR_NUEVA_EDICION && plantillaId
      ? plantillasDisponibles.find((p) => p.id === plantillaId) ?? null
      : null;

  /** Picking an existing edition pre-fills Efecto/estancia mínima from it, same
   * as EventoFormDialog's own edit-mode initial state; picking "+ Crear nueva
   * edición" (or clearing the choice) resets them, since a new edición starts blank. */
  function elegirEdicion(id: string) {
    setEdicionElegida(id);
    setPlantillaId("");
    const ev = id && id !== CREAR_NUEVA_EDICION ? cercanas.find((c) => c.evento.id === id)?.evento : null;
    if (ev) {
      setEfecto(ev.temporada_override_id ? "temporada" : ev.valor != null ? "valor" : "ninguno");
      setValor(ev.valor != null ? String(ev.valor) : "");
      setTipoValor(ev.tipo_valor ?? "%");
      setTemporadaId(ev.temporada_override_id ?? "");
      setEstanciaMinima(ev.estancia_minima != null ? String(ev.estancia_minima) : "");
    } else {
      setEfecto("ninguno");
      setValor("");
      setTipoValor("%");
      setTemporadaId("");
      setEstanciaMinima("");
    }
  }

  function changeEfecto(next: EfectoModo) {
    setEfecto(next);
    if (next !== "valor") setValor("");
    if (next !== "temporada") setTemporadaId("");
  }

  // Same filter EventoFormDialog's own temporada-override picker uses (no año
  // filter there either — reproducing its edit-mode behavior exactly, not
  // DiasEdicionMasivaDialog's own year-scoped temporada select).
  const temporadaOptions = chosenEvento
    ? temporadas.filter((t) => chosenEvento.aplica_a === "ambos" || t.aplica_a === chosenEvento.aplica_a)
    : [];

  const valorTipoFields = (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Valor">
        <Input type="number" step="any" placeholder="Opcional" value={valor} onChange={(e) => setValor(e.target.value)} />
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

  async function reasignar(principal: Evento) {
    // Grouped by fase the same way pricing.eventos.tsx's own childrenByParent does.
    const children = eventos.filter((e) => e.evento_relacionado_id === principal.id);
    let principalUpdated = false;
    let childrenDone = 0;
    try {
      await updateEvento(principal.id, {
        fecha_inicio: desde,
        fecha_fin: hasta,
        valor: efecto === "valor" ? Number(valor) : null,
        tipo_valor: efecto === "valor" ? tipoValor : null,
        temporada_override_id: efecto === "temporada" ? temporadaId : null,
        estancia_minima: estanciaMinima.trim() === "" ? null : Number(estanciaMinima),
      });
      principalUpdated = true;
      for (const child of children) {
        const duracion = diffDaysISO(child.fecha_inicio, child.fecha_fin);
        let inicio: string, fin: string;
        if (child.fase === "previo") {
          fin = addDaysISO(desde, -1);
          inicio = addDaysISO(fin, -duracion);
        } else {
          inicio = addDaysISO(hasta, 1);
          fin = addDaysISO(inicio, duracion);
        }
        await updateEvento(child.id, { fecha_inicio: inicio, fecha_fin: fin });
        childrenDone++;
      }
      toast.success(
        children.length > 0
          ? `Edición reasignada (${children.length} periodo${children.length === 1 ? "" : "s"} Previo/Post actualizados)`
          : "Edición reasignada",
      );
      await onEventoAplicado();
      onClose();
    } catch (e) {
      if (!principalUpdated) {
        toast.error("Error: " + (e as Error).message);
      } else {
        // Same defensive shape as DiasEdicionMasivaDialog's own RPC-then-bulk-
        // upsert sequencing: don't fail silently, say exactly how far it got,
        // and still refetch since the principal (and maybe some children) did change.
        toast.error(
          `Fechas de la edición actualizadas, pero solo se actualizaron ${childrenDone} de ${children.length} `
          + `periodos Previo/Post: ${(e as Error).message}`,
        );
        await onEventoAplicado();
      }
    }
  }

  async function crearNueva(plantilla: Plantilla) {
    try {
      await insertEvento({
        nombre: plantilla.nombre,
        categoria: plantilla.categoria,
        fecha_inicio: desde,
        fecha_fin: hasta,
        aplica_a: plantilla.aplica_a,
        valor: valor.trim() === "" ? null : Number(valor),
        tipo_valor: valor.trim() === "" ? null : tipoValor,
        estancia_minima: estanciaMinima.trim() === "" ? null : Number(estanciaMinima),
        fase: "principal",
        evento_relacionado_id: null,
        plantilla_id: plantilla.id,
        notas: null,
      });
      toast.success("Edición creada");
      await onEventoAplicado();
      onClose();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    }
  }

  async function handleConfirmar() {
    if (!rangoValido || (!chosenEvento && !chosenPlantilla)) return;
    if (!isPositiveIntOrEmpty(estanciaMinima)) {
      toast.error("La estancia mínima debe ser un número entero mayor que 0");
      return;
    }
    if (chosenEvento) {
      if (efecto === "valor" && valor.trim() === "") {
        toast.error("Introduce un valor o elige «Sin cambio»");
        return;
      }
      if (efecto === "temporada" && !temporadaId) {
        toast.error("Elige una temporada o «Sin cambio»");
        return;
      }
    }
    setSaving(true);
    try {
      if (chosenEvento) await reasignar(chosenEvento);
      else if (chosenPlantilla) await crearNueva(chosenPlantilla);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Asignar a evento</DialogTitle>
          <DialogDescription className="sr-only">Asignar o crear una edición de evento para el rango seleccionado</DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">{fmtDate(desde)} – {fmtDate(hasta)}</p>

        {!rangoValido ? (
          <p className="text-[11px] text-muted-foreground">
            La selección debe ser un rango continuo de fechas para asignar un evento
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Edición</p>
              <Select value={edicionElegida} onValueChange={elegirEdicion}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Elige una edición" /></SelectTrigger>
                <SelectContent>
                  {cercanas.map(({ evento: e }) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nombre} — {fmtDate(e.fecha_inicio)}–{fmtDate(e.fecha_fin)} ({categoriaLabel(e.categoria)})
                    </SelectItem>
                  ))}
                  <SelectItem value={CREAR_NUEVA_EDICION}>+ Crear nueva edición</SelectItem>
                </SelectContent>
              </Select>
              {cercanas.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Sin ediciones cercanas de este grupo</p>
              )}
            </div>

            {edicionElegida === CREAR_NUEVA_EDICION && (
              <Field label="Plantilla *">
                <Select value={plantillaId} onValueChange={setPlantillaId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Elige una plantilla" /></SelectTrigger>
                  <SelectContent>
                    {plantillasDisponibles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre} ({categoriaLabel(p.categoria)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {plantillasDisponibles.length === 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">Sin plantillas activas de este grupo</p>
                )}
              </Field>
            )}

            {(chosenEvento || chosenPlantilla) && (
              <div className="space-y-3 border-t pt-3">
                {chosenEvento ? (
                  <>
                    <Field label="Efecto / Cambio de temporada">
                      <Select value={efecto} onValueChange={(v) => changeEfecto(v as EfectoModo)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
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
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Elige una temporada" /></SelectTrigger>
                          <SelectContent>
                            {temporadaOptions.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {chosenEvento.aplica_a === "ambos" ? `${t.aplica_a === "city" ? "City" : "Rural"} · ` : ""}
                                {t.codigo} — {t.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </>
                ) : (
                  // "Crear nueva edición" only ever offers valor/tipo, matching
                  // EventoFormDialog's own create-mode restriction — its
                  // insertEvento() has no temporada_override_id support at all
                  // yet, so a temporada override for a brand-new edición has to
                  // be added afterward via the Eventos page's Editar dialog.
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
                    className="h-8 w-28 text-xs"
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleConfirmar}
            disabled={saving || !rangoValido || (!chosenEvento && !chosenPlantilla)}
          >
            {chosenEvento ? "Reasignar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
