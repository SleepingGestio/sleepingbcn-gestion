import { useState, type ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtNum2 } from "@/lib/format";
import { upsertAjusteDia, type Festivo, type Temporada } from "@/lib/pricing";
import type { DiaCalculado } from "@/lib/pricing-calc";
import { AMBITO_LIST, AMBITO_LABEL, AMBITO_COLOR } from "@/lib/pricing-styles";

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
 * they are informational only and never affect the price. The "Ajustes manuales del día" section lets
 * the temporada, estancia mínima and precio each be overridden independently for this one day, via
 * `pricing.ajustes_dia`; `onAjusteGuardado` is called after each save so the caller can refetch and
 * recalculate.
 */
export function DiaPrecioDialog({
  dia, onClose, festivos, temporadas, onAjusteGuardado,
}: {
  dia: DiaCalculado;
  onClose: () => void;
  festivos?: Festivo[];
  temporadas: Temporada[];
  onAjusteGuardado: () => void | Promise<void>;
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{tituloDia(dia.fecha)}</DialogTitle>
          <DialogDescription className="sr-only">Desglose del cálculo del precio del día</DialogDescription>
        </DialogHeader>

        {festivos && festivos.length > 0 && (
          <div className="flex flex-col gap-1 text-xs">
            {festivos.flatMap((f) =>
              AMBITO_LIST.filter((a) => f.ambitos.includes(a)).map((a) => (
                <span key={`${f.id}-${a}`} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: AMBITO_COLOR[a] }}
                  />
                  {f.nombre} — {AMBITO_LABEL[a]}
                  {a === "comunidad_otras" && f.detalle && (
                    <span className="text-muted-foreground">({f.detalle})</span>
                  )}
                </span>
              )),
            )}
          </div>
        )}

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
    </Dialog>
  );
}
