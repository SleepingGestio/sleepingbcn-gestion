import { useState, type ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtNum2 } from "@/lib/format";
import { deleteFestivo, upsertAjusteDia, type Festivo, type Temporada } from "@/lib/pricing";
import type { DiaCalculado } from "@/lib/pricing-calc";
import { AMBITO_LIST, AMBITO_LABEL, AMBITO_COLOR } from "@/lib/pricing-styles";
import { usePermissions } from "@/hooks/use-permissions";
import { FestivoDialog } from "@/components/festivo-dialog";
import { esGenerado } from "@/components/festivos-tab";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2027-03-13" → "Día 13 de marzo" */
function tituloDia(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number);
  return `Día ${d} de ${MESES[m - 1]}`;
}

const eur = (n: number) => `${fmtNum2(n)} €`;

/** One "+ / − amount" line of the breakdown; a negative delta shows "−" and its absolute value. */
function Linea({ label, delta }: { label: ReactNode; delta: number }) {
  return (
    <tr>
      <td className="w-3.5 py-0.5 text-muted-foreground">{delta < 0 ? "−" : "+"}</td>
      <td className="py-0.5 whitespace-nowrap">{label}</td>
      <td className="py-0.5 text-right tabular-nums whitespace-nowrap">{eur(Math.abs(delta))}</td>
    </tr>
  );
}

function ManualTag() {
  return (
    <span className="rounded bg-primary/10 px-1 py-px text-[9px] font-semibold text-primary">Manual</span>
  );
}

/** Number field of the "Ajustes manuales" section: shows the effective value, editable inline,
 * with a "Quitar" to clear it back to automatic when a manual value is currently active. */
function AjusteNumero({
  label, valorActual, manual, saving, sufijo, onGuardar, onQuitar,
}: {
  label: string;
  valorActual: number | null;
  manual: boolean;
  saving: boolean;
  sufijo?: string;
  onGuardar: (valor: number) => void;
  onQuitar: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className={manual ? "font-medium" : ""}>
            {valorActual != null ? `${valorActual}${sufijo ?? ""}` : "—"}
          </span>
          {manual && <ManualTag />}
          <Button
            size="sm" variant="ghost" className="h-6 px-2 text-xs"
            onClick={() => { setValue(valorActual != null ? String(valorActual) : ""); setEditing(true); }}
          >
            Editar
          </Button>
          {manual && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onQuitar} disabled={saving}>
              Quitar
            </Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-7 w-20 text-xs"
          autoFocus
        />
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)} disabled={saving}>
          Cancelar
        </Button>
        <Button
          size="sm" className="h-6 px-2 text-xs"
          disabled={saving || value.trim() === "" || Number.isNaN(Number(value))}
          onClick={() => { onGuardar(Number(value)); setEditing(false); }}
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}

/** Temporada field of the "Ajustes manuales" section: a select over that año/aplicaA's temporadas. */
function AjusteTemporada({
  dia, temporadasDelAnio, saving, onGuardar, onQuitar,
}: {
  dia: DiaCalculado;
  temporadasDelAnio: Temporada[];
  saving: boolean;
  onGuardar: (temporadaId: string) => void;
  onQuitar: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(dia.temporada.temporadaId);
  const manual = dia.temporada.origen === "manual";

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Temporada</span>
        <div className="flex items-center gap-1.5">
          <span className={manual ? "font-medium" : ""}>{dia.temporada.codigo} · {dia.temporada.nombre}</span>
          {manual && <ManualTag />}
          <Button
            size="sm" variant="ghost" className="h-6 px-2 text-xs"
            onClick={() => { setValue(dia.temporada.temporadaId); setEditing(true); }}
          >
            Editar
          </Button>
          {manual && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onQuitar} disabled={saving}>
              Quitar
            </Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">Temporada</span>
      <div className="flex items-center gap-1.5">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {temporadasDelAnio.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.codigo} · {t.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)} disabled={saving}>
          Cancelar
        </Button>
        <Button size="sm" className="h-6 px-2 text-xs" disabled={saving} onClick={() => { onGuardar(value); setEditing(false); }}>
          Guardar
        </Button>
      </div>
    </div>
  );
}

/**
 * Price breakdown of one day. `festivos` are the ones falling on that day, passed in by the caller;
 * they are informational only and never affect the price, but the "Festivos" panel now also lets
 * whoever can edit temporadas add/edit/delete them right here, reusing the same FestivoDialog and
 * insert/update/deleteFestivo the Festivos tab uses — `onFestivoGuardado` is called after each of
 * those so the caller can refetch. The "Ajustes manuales del día" section lets the temporada, estancia
 * mínima and precio each be overridden independently for this one day, via `pricing.ajustes_dia`;
 * `onAjusteGuardado` is called after each save so the caller can refetch and recalculate.
 */
export function DiaPrecioDialog({
  dia, onClose, festivos, temporadas, onAjusteGuardado, onFestivoGuardado,
}: {
  dia: DiaCalculado;
  onClose: () => void;
  festivos?: Festivo[];
  temporadas: Temporada[];
  onAjusteGuardado: () => void | Promise<void>;
  onFestivoGuardado: () => void | Promise<void>;
}) {
  // precioBase × coefTemporada × coefDía, shown as two increments that add up to the subtotal.
  const tempDelta = dia.precioTrasTemporada - dia.precioBase;
  const diaDelta = dia.subtotal - dia.precioTrasTemporada;
  const fuentesMin = dia.estanciaMinimaFuentes.filter((f) => f.aplicada).map((f) => f.nombre);
  const estanciaManual = dia.estanciaMinimaFuentes.some((f) => f.origen === "manual");
  const anioDia = Number(dia.fecha.slice(0, 4));
  const temporadasDelAnio = temporadas
    .filter((t) => t.anio === anioDia && t.aplica_a === dia.aplicaA)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const { canEdit } = usePermissions();
  const canEditFestivos = canEdit("pricing_temporadas");
  const [festivoDialog, setFestivoDialog] = useState<{ id: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Festivo | null>(null);

  const [saving, setSaving] = useState(false);

  async function guardarAjuste(
    changes: Partial<{ temporadaId: string | null; estanciaMinima: number | null; precioManual: number | null }>,
    successMsg: string,
  ) {
    setSaving(true);
    try {
      await upsertAjusteDia(dia.fecha, dia.aplicaA, changes);
      toast.success(successMsg);
      await onAjusteGuardado();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteFestivo() {
    if (!deleteTarget) return;
    try {
      await deleteFestivo(deleteTarget.id);
      toast.success("Festivo eliminado");
      await onFestivoGuardado();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{tituloDia(dia.fecha)}</DialogTitle>
          <DialogDescription className="sr-only">Desglose del cálculo del precio del día</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border p-2 text-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Festivos</p>
            {canEditFestivos && (
              <Button
                size="sm" variant="ghost" className="h-6 px-2 text-xs"
                onClick={() => setFestivoDialog({ id: null })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Añadir
              </Button>
            )}
          </div>
          {festivos && festivos.length > 0 ? (
            <div className="flex flex-col gap-1">
              {festivos.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {AMBITO_LIST.filter((a) => f.ambitos.includes(a)).map((a) => (
                      <span
                        key={a}
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: AMBITO_COLOR[a] }}
                        title={AMBITO_LABEL[a]}
                      />
                    ))}
                    {f.nombre}
                    {f.ambitos.includes("comunidad_otras") && f.detalle && (
                      <span className="text-muted-foreground">({f.detalle})</span>
                    )}
                  </span>
                  {canEditFestivos && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        size="sm" variant="ghost" className="h-6 px-1.5"
                        onClick={() => setFestivoDialog({ id: f.id })}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-6 px-1.5"
                        onClick={() => setDeleteTarget(f)}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Sin festivos este día</p>
          )}
        </div>

        {dia.notaTemporada && (
          <p className="text-xs text-muted-foreground">{dia.notaTemporada}</p>
        )}

        <table className="w-full border-collapse text-[13px]">
          <tbody>
            <tr>
              <td className="w-3.5 py-0.5" />
              <td className="py-0.5">Precio base</td>
              <td className="py-0.5 text-right tabular-nums whitespace-nowrap">{eur(dia.precioBase)}</td>
            </tr>
            <Linea
              label={
                <>
                  Temporada — {dia.temporada.nombre} ({fmtNum2(dia.temporada.coeficiente)})
                  {dia.temporada.origen === "manual" && <span className="ml-1 align-middle"><ManualTag /></span>}
                </>
              }
              delta={tempDelta}
            />
            <Linea
              label={`Día — ${dia.dia.etiqueta} (${fmtNum2(dia.dia.coeficiente)})`}
              delta={diaDelta}
            />
            <tr className="font-bold">
              <td className="w-3.5 border-t pt-1 text-muted-foreground font-normal">=</td>
              <td className="border-t pt-1">Subtotal</td>
              <td className="border-t pt-1 text-right tabular-nums whitespace-nowrap">{eur(dia.subtotal)}</td>
            </tr>
            {dia.efectos.map((ef) => (
              <Linea key={ef.eventoId} label={ef.nombre} delta={ef.delta} />
            ))}
            <tr className={dia.precioManual == null ? "font-bold" : undefined}>
              <td className="w-3.5 border-t pt-1" />
              <td className="border-t pt-1">Precio del día</td>
              <td className="border-t pt-1 text-right tabular-nums whitespace-nowrap">{dia.precioCalculado} €</td>
            </tr>
            {dia.precioManual != null && (
              <tr className="font-bold">
                <td className="w-3.5" />
                <td className="pt-0.5">
                  Precio del día ajustado <ManualTag />
                </td>
                <td className="pt-0.5 text-right tabular-nums whitespace-nowrap">{dia.precioManual} €</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="rounded-md border p-2 text-xs space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ajustes manuales del día</p>
          <AjusteTemporada
            dia={dia}
            temporadasDelAnio={temporadasDelAnio}
            saving={saving}
            onGuardar={(temporadaId) => guardarAjuste({ temporadaId }, "Temporada manual guardada")}
            onQuitar={() => guardarAjuste({ temporadaId: null }, "Temporada vuelve a ser automática")}
          />
          <AjusteNumero
            label="Estancia mínima"
            valorActual={dia.estanciaMinima}
            manual={estanciaManual}
            saving={saving}
            sufijo=" nits"
            onGuardar={(valor) => guardarAjuste({ estanciaMinima: valor }, "Estancia mínima manual guardada")}
            onQuitar={() => guardarAjuste({ estanciaMinima: null }, "Estancia mínima vuelve a ser automática")}
          />
          <AjusteNumero
            label="Precio"
            valorActual={dia.precioManual ?? dia.precioCalculado}
            manual={dia.precioManual != null}
            saving={saving}
            sufijo=" €"
            onGuardar={(valor) => guardarAjuste({ precioManual: valor }, "Precio manual guardado")}
            onQuitar={() => guardarAjuste({ precioManual: null }, "Precio vuelve a ser el calculado")}
          />
        </div>

        <div className="text-xs">
          Estancia mínima:{" "}
          <strong>{dia.estanciaMinima != null ? `${dia.estanciaMinima} nits` : "—"}</strong>
          {fuentesMin.length > 0 && (
            <span className="text-muted-foreground"> ({fuentesMin.join(", ")})</span>
          )}
        </div>
      </DialogContent>

      {festivoDialog && (
        <FestivoDialog
          key={festivoDialog.id ?? "nuevo"}
          festivo={festivoDialog.id ? (festivos ?? []).find((f) => f.id === festivoDialog.id) ?? null : null}
          anio={anioDia}
          defaultFecha={dia.fecha}
          onClose={() => setFestivoDialog(null)}
          onSaved={onFestivoGuardado}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleteTarget?.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && esGenerado(deleteTarget.ambitos)
                ? "Es un festivo generado: volverá a aparecer si generas de nuevo los festivos del año. "
                : ""}
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFestivo}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
