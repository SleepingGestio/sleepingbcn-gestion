import type { ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { fmtNum2 } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Festivo } from "@/lib/pricing";
import type { DiaCalculado } from "@/lib/pricing-calc";
import { TIPO_LABEL, TIPO_STYLES } from "@/lib/pricing-styles";

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

/**
 * Price breakdown of one day (read-only for now). `extra` is rendered between the table and the
 * minimum stay, so a follow-up (e.g. a manual price adjustment block) can be added without
 * touching the rest of this dialog. `festivos` are the ones falling on that day, passed in by the
 * caller; they are informational only and never affect the price.
 */
export function DiaPrecioDialog({
  dia, onClose, extra, festivos,
}: {
  dia: DiaCalculado;
  onClose: () => void;
  extra?: ReactNode;
  festivos?: Festivo[];
}) {
  // precioBase × coefTemporada × coefDía, shown as two increments that add up to the subtotal.
  const tempDelta = dia.precioTrasTemporada - dia.precioBase;
  const diaDelta = dia.subtotal - dia.precioTrasTemporada;
  const fuentesMin = dia.estanciaMinimaFuentes.filter((f) => f.aplicada).map((f) => f.nombre);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{tituloDia(dia.fecha)}</DialogTitle>
          <DialogDescription className="sr-only">Desglose del cálculo del precio del día</DialogDescription>
        </DialogHeader>

        {festivos && festivos.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {festivos.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-1.5">
                {f.nombre}
                <Badge className={cn("border-transparent px-1.5 py-0 text-[10px]", TIPO_STYLES[f.tipo])}>
                  {TIPO_LABEL[f.tipo]}
                </Badge>
              </span>
            ))}
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
              label={`Temporada — ${dia.temporada.nombre} (${fmtNum2(dia.temporada.coeficiente)})`}
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
            <tr className="font-bold">
              <td className="w-3.5 border-t pt-1" />
              <td className="border-t pt-1">Precio del día</td>
              <td className="border-t pt-1 text-right tabular-nums whitespace-nowrap">{dia.precioFinal} €</td>
            </tr>
          </tbody>
        </table>

        {extra}

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
