import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DiaPrecioDialog } from "@/components/dia-precio-dialog";
import { DiasEdicionMasivaDialog } from "@/components/dias-edicion-masiva-dialog";
import { DiasAsignarEventoDialog } from "@/components/dias-asignar-evento-dialog";
import { CATEGORIA_STYLES, AMBITO_LIST, AMBITO_LABEL, AMBITO_COLOR } from "@/lib/pricing-styles";
import {
  fetchTemporadas, fetchDiaSemanaPeriodos, fetchPrecioBase, fetchEventos, fetchFestivos, fetchAjustesDia,
  type Evento, type Festivo, type TemporadaAplicaA,
} from "@/lib/pricing";
import { calcularAnio, calcularRango, diaDeLaSemana, eventosActivosDia, type DiaCalculado } from "@/lib/pricing-calc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing/calendario")({
  component: CalendarioPage,
});

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
/** Short form for the print-only "Calendario" format's rotated month label — a full name read
 * vertically down a narrow spine reads awkwardly, so this label uses the abbreviation instead. */
const MESES_ABR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const TEMP_COLORS: Record<string, string> = { B: "#0ea5e9", A: "#22c55e", S: "#f97316", E: "#ef4444" };
const tempColor = (codigo: string) => TEMP_COLORS[codigo.toUpperCase()] ?? "#94a3b8";

// Heatmap: light green (cheapest day of the año) → light red (priciest), linear in RGB.
const HEAT_LOW = [0xdc, 0xfc, 0xe7];
const HEAT_HIGH = [0xfe, 0xca, 0xca];
function heatColor(precio: number, min: number, max: number): string {
  const t = max === min ? 0 : (precio - min) / (max - min);
  const c = HEAT_LOW.map((lo, i) => Math.round(lo + (HEAT_HIGH[i] - lo) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const HATCHED = "repeating-linear-gradient(45deg, #f1f5f9, #f1f5f9 6px, #e2e8f0 6px, #e2e8f0 12px)";

type Celda = { iso: string; dia: number; enMes: boolean };

/**
 * Colored strip across the cell's top edge: one equal-width segment per distinct ámbito present that
 * day, in AMBITO_LIST order, counting the ámbitos of every festivo that day combined (so a single
 * festivo with several ámbitos, like Año Nuevo, already produces several segments). Absolutely
 * positioned over the (relative) cell's top edge so it takes no space in the flow: every cell's content
 * starts at the same offset whether or not it has a festivo, and the cells' fixed pt-3 keeps the day
 * number clear of it. The cell's own overflow-hidden + rounded-lg clips it to the top corners, so it
 * needs no rounding of its own. Renders nothing on a day with no festivo.
 */
function BarraFestivos({ festivos }: { festivos: Festivo[] }) {
  const ambitos = AMBITO_LIST.filter((a) => festivos.some((f) => f.ambitos.includes(a)));
  if (ambitos.length === 0) return null;
  return (
    <div className="absolute inset-x-0 top-0 flex h-2.5">
      {ambitos.map((a) => (
        <span key={a} className="h-full flex-1" style={{ background: AMBITO_COLOR[a] }} />
      ))}
    </div>
  );
}

/** One line per (festivo, ámbito) for a cell's native tooltip, detalle appended for comunidad_otras;
 * undefined when there are none. */
const tooltipFestivos = (festivos: Festivo[]) => {
  const lineas = festivos.flatMap((f) =>
    f.ambitos.map((a) => {
      const detalle = a === "comunidad_otras" && f.detalle ? ` (${f.detalle})` : "";
      return `${f.nombre} — ${AMBITO_LABEL[a]}${detalle}`;
    }),
  );
  return lineas.length > 0 ? lineas.join("\n") : undefined;
};

/** Monday-first grid covering the month, padded with the neighbouring months' days. */
function celdasDelMes(y: number, m: number): Celda[] {
  const primero = new Date(Date.UTC(y, m, 1));
  const diasMes = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const previos = (primero.getUTCDay() + 6) % 7;
  const total = Math.ceil((previos + diasMes) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(y, m, 1 - previos + i));
    return { iso: d.toISOString().slice(0, 10), dia: d.getUTCDate(), enMes: d.getUTCMonth() === m };
  });
}

// Days of the neighbouring months (padding at the grid edges) look like in-month days but muted,
// and are not clickable.
const FUERA_DE_MES = "pointer-events-none opacity-50 grayscale";

/** Every day of `mes` (0–11) as "YYYY-MM-DD", unpadded — unlike `celdasDelMes` this is only for the
 * print table, which lists just the in-month days, not a 7-column grid. */
function fechasDelMes(anio: number, mes: number): string[] {
  const dias = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return Array.from({ length: dias }, (_, i) => new Date(Date.UTC(anio, mes, i + 1)).toISOString().slice(0, 10));
}

function DiaCelda({
  celda, calc, eventos, festivos, rango, mapaCalor, seleccionado, onOpen, onToggleSeleccion,
}: {
  celda: Celda;
  calc: DiaCalculado | null;
  eventos: Evento[];
  festivos: Festivo[];
  rango: { min: number; max: number } | null;
  /** Off: cells get a plain card background instead of heatColor(); everything else is unchanged. */
  mapaCalor: boolean;
  seleccionado: boolean;
  /** Opens DiaPrecioDialog — always what a click on the cell itself does, mode or no mode. */
  onOpen: () => void;
  /** Toggles this day in the multi-day selection; only the corner checkbox calls this. */
  onToggleSeleccion: () => void;
}) {
  if (!calc || !rango) {
    return (
      <div
        className={cn(
          "relative flex min-h-[118px] flex-col overflow-hidden rounded-lg border border-slate-200 text-slate-500",
          !celda.enMes && FUERA_DE_MES,
        )}
        style={{ background: HATCHED }}
        aria-hidden={!celda.enMes}
        title={["Sin cobertura: falta período de temporada, de días de la semana o precio base", tooltipFestivos(festivos)]
          .filter(Boolean)
          .join("\n")}
      >
        <BarraFestivos festivos={festivos} />
        <div className="flex flex-1 items-start justify-between gap-1 px-1.5 pb-1.5 pt-3">
          <span className="flex h-5 items-center rounded-[5px] bg-white px-[5px] text-[13px] font-bold text-slate-900 shadow-[0_0_0_0.5px_#e2e8f0]">
            {celda.dia}
          </span>
          <span className="text-[10px] font-medium">Sin datos</span>
        </div>
      </div>
    );
  }

  const Contenedor = celda.enMes ? "button" : "div";
  return (
    <Contenedor
      {...(celda.enMes ? { type: "button" as const, onClick: onOpen } : { "aria-hidden": true })}
      className={cn(
        "relative flex min-h-[118px] flex-col overflow-hidden rounded-lg border text-left text-slate-900 outline-2 -outline-offset-2 outline-transparent transition-[outline-color]",
        celda.enMes ? "hover:outline-slate-900 focus-visible:outline-slate-900" : FUERA_DE_MES,
        seleccionado ? "border-primary ring-2 ring-primary" : "border-slate-200",
        !mapaCalor && "bg-card",
      )}
      style={mapaCalor ? { background: heatColor(calc.precioFinal, rango.min, rango.max) } : undefined}
      title={tooltipFestivos(festivos)}
    >
      {celda.enMes && (
        <span
          role="checkbox"
          aria-checked={seleccionado}
          aria-label="Seleccionar este día"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onToggleSeleccion(); }}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onToggleSeleccion(); }
          }}
          className={cn(
            "absolute bottom-1 right-1 z-20 flex h-4 w-4 cursor-pointer items-center justify-center rounded border",
            seleccionado ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-white/90",
          )}
        >
          {seleccionado && <Check className="h-3 w-3" />}
        </span>
      )}
      <BarraFestivos festivos={festivos} />
      <div className="flex flex-1 flex-col px-1.5 pb-2 pt-3">
        <div className="flex items-start justify-between gap-1">
          <span className="flex h-5 shrink-0 items-center justify-center gap-[3px] rounded-[5px] bg-white px-[5px] text-[13px] font-bold shadow-[0_0_0_0.5px_#e2e8f0]">
            {celda.dia}
            <span
              className="inline-flex h-[13px] min-w-[13px] items-center justify-center rounded-[4px] px-[2px] text-[8.5px] font-bold text-white"
              style={{ background: tempColor(calc.temporada.codigo) }}
              title={calc.temporada.nombre}
            >
              {calc.temporada.codigo}
            </span>
          </span>
          <span className="text-right">
            {/* Garnet flags a price overridden by an ajuste manual; otherwise it inherits the cell's ink. */}
            <span className={cn("block text-[15px] font-semibold leading-[1.1]", calc.precioManual != null && "text-[#7C2D33]")}>
              {calc.precioFinal}€
            </span>
            {calc.estanciaMinima != null && (
              <span
                className={cn(
                  "mt-px block text-[11px] font-bold",
                  calc.estanciaMinimaFuentes.some((f) => f.origen === "manual") && "text-[#7C2D33]",
                )}
              >
                {calc.estanciaMinima} nits
              </span>
            )}
          </span>
        </div>
        {eventos.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-[3px] pr-5 pt-1.5">
            {eventos.map((e) => (
              <span
                key={e.id}
                title={e.nombre}
                className={cn("whitespace-nowrap rounded-full px-[5px] py-px text-[9px] font-medium", CATEGORIA_STYLES[e.categoria])}
              >
                {e.nombre}
              </span>
            ))}
          </div>
        )}
      </div>
    </Contenedor>
  );
}

/**
 * Compact day cell for the 3-month view: same data as `DiaCelda` (heatmap, temporada, festivo
 * stripe, precio, mínimo noches, eventos, selection) laid out for a ~104px-tall cell instead of
 * `DiaCelda`'s full-detail one — see the approved "Vista de 3 meses" mockup this follows. Out-of-month
 * padding days render as an invisible placeholder rather than `DiaCelda`'s muted/grayscale treatment,
 * so three adjacent months' grids don't visually bleed into each other with neighbouring dates.
 *
 * Día+temporada, precio and mínimo noches are a fixed top-down flow — each always at the same
 * position relative to the cell's top, regardless of the day's other content. The evento badge is
 * deliberately NOT part of that flow: it's absolutely positioned at the bottom so its presence or
 * absence never shifts the price/mínimo noches above it.
 */
function DiaCeldaCompacta({
  celda, calc, eventos, festivos, rango, mapaCalor, seleccionado, onOpen, onToggleSeleccion,
}: {
  celda: Celda;
  calc: DiaCalculado | null;
  eventos: Evento[];
  festivos: Festivo[];
  rango: { min: number; max: number } | null;
  mapaCalor: boolean;
  seleccionado: boolean;
  onOpen: () => void;
  onToggleSeleccion: () => void;
}) {
  if (!celda.enMes) {
    return <div className="invisible min-h-[104px]" aria-hidden />;
  }

  if (!calc || !rango) {
    return (
      <div
        className="relative flex min-h-[104px] flex-col overflow-hidden rounded-[6px] border border-slate-200 px-[5px] pb-1 pt-3 text-slate-500"
        style={{ background: HATCHED }}
        title={["Sin cobertura: falta período de temporada, de días de la semana o precio base", tooltipFestivos(festivos)]
          .filter(Boolean)
          .join("\n")}
      >
        <BarraFestivos festivos={festivos} />
        <span className="text-[10px] font-bold tabular-nums">{celda.dia}</span>
      </div>
    );
  }

  // Only one event's badge fits the cell; the rest still show in the tooltip.
  const evento = eventos[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "relative flex min-h-[104px] flex-col overflow-hidden rounded-[6px] border text-left text-slate-900 outline-2 -outline-offset-2 outline-transparent transition-[outline-color] hover:outline-slate-900 focus-visible:outline-slate-900",
        "px-[5px] pb-1 pt-3",
        seleccionado ? "border-primary ring-2 ring-primary" : "border-slate-200",
        !mapaCalor && "bg-card",
      )}
      style={mapaCalor ? { background: heatColor(calc.precioFinal, rango.min, rango.max) } : undefined}
      title={tooltipFestivos(festivos)}
    >
      <span
        role="checkbox"
        aria-checked={seleccionado}
        aria-label="Seleccionar este día"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onToggleSeleccion(); }}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onToggleSeleccion(); }
        }}
        className={cn(
          "absolute bottom-0.5 right-0.5 z-20 flex h-3 w-3 cursor-pointer items-center justify-center rounded border",
          seleccionado ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-white/90",
        )}
      >
        {seleccionado && <Check className="h-2 w-2" />}
      </span>
      <BarraFestivos festivos={festivos} />
      <span className="flex h-4 w-fit shrink-0 items-center gap-1 rounded-[4px] bg-white px-1 text-[9px] font-bold shadow-[0_0_0_0.5px_#e2e8f0]">
        {celda.dia}
        <span
          className="inline-flex h-[10px] min-w-[10px] items-center justify-center rounded-[3px] px-[2px] text-[6.5px] font-bold text-white"
          style={{ background: tempColor(calc.temporada.codigo) }}
          title={calc.temporada.nombre}
        >
          {calc.temporada.codigo}
        </span>
      </span>
      <span className={cn("mt-1 block text-[11px] font-extrabold tabular-nums", calc.precioManual != null && "text-[#7C2D33]")}>
        {calc.precioFinal}€
      </span>
      {calc.estanciaMinima != null && (
        <span
          className={cn(
            "block text-[8px] font-semibold opacity-75",
            calc.estanciaMinimaFuentes.some((f) => f.origen === "manual") && "text-[#7C2D33]",
          )}
        >
          {calc.estanciaMinima} nits
        </span>
      )}
      {evento && (
        <span
          title={eventos.map((e) => e.nombre).join(", ")}
          className={cn(
            "absolute bottom-1 left-1 z-10 max-w-[calc(100%-18px)] truncate rounded-full px-1 text-[7px] font-medium",
            CATEGORIA_STYLES[evento.categoria],
          )}
        >
          {evento.nombre}
        </span>
      )}
    </button>
  );
}

/**
 * Weekday header row + 7-column day grid for one month. Cell rendering is left entirely to
 * `renderCelda`, so the same layout serves both the full-detail 1-month view (`DiaCelda`) and the
 * compact 3-month view (`DiaCeldaCompacta`) without either one knowing about the other.
 */
function MesGrid({
  celdas, renderCelda, titulo, compacta, separadorImpresion,
}: {
  celdas: Celda[];
  renderCelda: (celda: Celda) => ReactNode;
  /** Per-column month label; only the 3-month view needs one, since the 1-month view already has its own header above the grid. */
  titulo?: string;
  /** Denser weekday header to match the compact cell's smaller footprint. */
  compacta?: boolean;
  /** Print-only: a full-width light gray band directly below the weekday header, marking the
   * separation between one stacked month and the next on the printed page. Never set by the on-screen
   * views (1-month or 3-month), which are unaffected by this prop existing. */
  separadorImpresion?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      {titulo && <h3 className="mb-2 border-b border-slate-200 pb-2 text-center text-[13px] font-extrabold">{titulo}</h3>}
      <div className={cn("grid grid-cols-7", compacta ? "mb-1 gap-1" : "mb-1.5 gap-1.5")}>
        {DIAS.map((d) => (
          <div
            key={d}
            className={cn(
              "text-center font-bold uppercase tracking-[0.04em] text-slate-500",
              compacta ? "text-[9px]" : "border-b-2 border-slate-200 py-1 text-[11px]",
            )}
          >
            {d}
          </div>
        ))}
      </div>
      {separadorImpresion && <div className="mb-0.5 h-0.5 w-full bg-slate-200" />}
      <div className={cn("grid grid-cols-7", compacta ? "gap-1" : "gap-1.5")}>{celdas.map((c) => renderCelda(c))}</div>
    </div>
  );
}

type PrintSpec = {
  desde: { anio: number; mes: number };
  hasta: { anio: number; mes: number };
  mesesPorPagina: 1 | 2 | 3;
  formato: "lista" | "calendario";
};

/**
 * "Imprimir" dialog: picks an arbitrary "desde mes/año – hasta mes/año" range — independent of
 * whatever Año/Mes/Vista is currently on screen, and free to span a año boundary (e.g. Nov → Feb) —
 * plus a "meses por página" layout. `onConfirmar` hands both to the caller, which computes the
 * print-only data and kicks off `window.print()`.
 */
function ImprimirDialog({
  anio, mes, years, onClose, onConfirmar,
}: {
  anio: number;
  mes: number;
  years: number[];
  onClose: () => void;
  onConfirmar: (spec: PrintSpec) => void;
}) {
  const [desdeAnio, setDesdeAnio] = useState(anio);
  const [desdeMes, setDesdeMes] = useState(mes);
  const [hastaAnio, setHastaAnio] = useState(anio);
  const [hastaMes, setHastaMes] = useState(mes);
  const [mesesPorPagina, setMesesPorPagina] = useState<1 | 2 | 3>(1);
  const [formato, setFormato] = useState<"lista" | "calendario">("calendario");

  // The picked años might fall outside the page's own `years` (data years) once someone picks a
  // range spanning a boundary año with no data of its own yet — always keep them selectable.
  const anosSelect = useMemo(() => [...new Set([...years, desdeAnio, hastaAnio])].sort((a, b) => a - b), [years, desdeAnio, hastaAnio]);

  const rangoValido = desdeAnio < hastaAnio || (desdeAnio === hastaAnio && desdeMes <= hastaMes);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Imprimir calendario</DialogTitle>
          <DialogDescription className="sr-only">Elige el rango de meses y la disposición de impresión</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Desde — mes</span>
            <Select value={String(desdeMes)} onValueChange={(v) => setDesdeMes(Number(v))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((nombre, i) => <SelectItem key={nombre} value={String(i)}>{nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Desde — año</span>
            <Select value={String(desdeAnio)} onValueChange={(v) => setDesdeAnio(Number(v))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosSelect.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Hasta — mes</span>
            <Select value={String(hastaMes)} onValueChange={(v) => setHastaMes(Number(v))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((nombre, i) => <SelectItem key={nombre} value={String(i)}>{nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Hasta — año</span>
            <Select value={String(hastaAnio)} onValueChange={(v) => setHastaAnio(Number(v))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosSelect.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!rangoValido && <p className="text-xs text-destructive">"Hasta" debe ser igual o posterior a "Desde".</p>}

        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Formato</span>
          <ToggleGroup
            type="single"
            value={formato}
            onValueChange={(v) => v && setFormato(v as "lista" | "calendario")}
            className="h-9 justify-start"
          >
            <ToggleGroupItem value="calendario" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              Calendario
            </ToggleGroupItem>
            <ToggleGroupItem value="lista" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              Lista
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Meses por página</span>
          <ToggleGroup
            type="single"
            value={String(mesesPorPagina)}
            onValueChange={(v) => v && setMesesPorPagina(Number(v) as 1 | 2 | 3)}
            disabled={formato === "lista"}
            className="h-9 justify-start"
          >
            <ToggleGroupItem value="1" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              1 mes
            </ToggleGroupItem>
            <ToggleGroupItem value="2" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              2 meses
            </ToggleGroupItem>
            <ToggleGroupItem value="3" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              3 meses
            </ToggleGroupItem>
          </ToggleGroup>
          {/* Lista always prints one month per página regardless of this value (see paginasImpresion) —
              disabled rather than hidden, so switching back to Calendario doesn't lose the choice. */}
          {formato === "lista" && (
            <p className="text-[11px] text-muted-foreground">Lista siempre imprime un mes por página.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!rangoValido}
            onClick={() =>
              onConfirmar({ desde: { anio: desdeAnio, mes: desdeMes }, hasta: { anio: hastaAnio, mes: hastaMes }, mesesPorPagina, formato })
            }
          >
            <Printer className="mr-1.5 h-4 w-4" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One month's plain table for the print-only output: date + weekday, precio, mínimo de noches,
 * temporada and a short festivos/eventos reference — deliberately not a reuse of `DiaCelda` /
 * `DiaCeldaCompacta` (no heatmap, no pill styling, no annotation column). Manual overrides keep the
 * same garnet flag as the on-screen cells so the calculado/manual distinction survives on paper.
 */
function TablaMesImpresion({
  anio, mes, dias, eventos, festivosPorFecha, aplicaA,
}: {
  anio: number;
  mes: number;
  dias: Map<string, DiaCalculado | null>;
  eventos: Evento[];
  festivosPorFecha: Map<string, Festivo[]>;
  aplicaA: TemporadaAplicaA;
}) {
  return (
    <table className="w-full border-collapse text-[10px]">
      <caption className="mb-1.5 text-left text-[13px] font-bold">{MESES[mes]} {anio}</caption>
      <thead>
        <tr className="border-b border-slate-400 text-left">
          <th className="py-1 pr-2 font-semibold">Día</th>
          <th className="py-1 pr-2 text-right font-semibold">Precio</th>
          <th className="py-1 pr-2 text-right font-semibold">Mín. noches</th>
          <th className="py-1 pr-2 font-semibold">Temporada</th>
          <th className="py-1 font-semibold">Festivos / eventos</th>
        </tr>
      </thead>
      <tbody>
        {fechasDelMes(anio, mes).map((fecha) => {
          const calc = dias.get(fecha) ?? null;
          const dia = Number(fecha.slice(8, 10));
          const notas = [
            ...(festivosPorFecha.get(fecha) ?? []).map((f) => f.nombre),
            ...eventosActivosDia(eventos, fecha, aplicaA).map((e) => e.nombre),
          ].join(" · ");
          return (
            <tr key={fecha} className="[break-inside:avoid] border-b border-slate-200">
              <td className="py-1 pr-2 whitespace-nowrap">{dia} {DIAS[(diaDeLaSemana(fecha) + 6) % 7]}</td>
              {calc ? (
                <>
                  <td className={cn("py-1 pr-2 text-right tabular-nums", calc.precioManual != null && "font-bold text-[#7C2D33]")}>
                    {calc.precioFinal}€
                  </td>
                  <td
                    className={cn(
                      "py-1 pr-2 text-right tabular-nums",
                      calc.estanciaMinimaFuentes.some((f) => f.origen === "manual") && "font-bold text-[#7C2D33]",
                    )}
                  >
                    {calc.estanciaMinima ?? "—"}
                  </td>
                  <td className="py-1 pr-2">{calc.temporada.codigo} · {calc.temporada.nombre}</td>
                  <td className="py-1">{notas}</td>
                </>
              ) : (
                <td className="py-1 text-muted-foreground" colSpan={4}>Sin datos</td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Max per-day-cell row height (mm) for the "Calendario" print format, given `mesesPorPagina` and the
 * actual max week-rows any month in this print job needs (`maxSemanas`, from `celdasDelMes(...).length
 * / 7` — 4, 5 or 6 depending on the real month, not a hardcoded worst case). Sized so `maxSemanas`
 * stacked rows always fit `mesesPorPagina` stacked months on one A4 portrait page (`@page` in
 * styles.css: size A4, 12mm margin → 297 − 2×12 = 273mm usable height).
 *
 * The month title no longer takes a horizontal line (it's now a vertical label beside the grid, in
 * `MesImpresionCalendario` — see there), so the per-month overhead below is just the weekday header
 * plus its print-only separator band (`MesGrid`'s `separadorImpresion`):
 *
 *   interMonthGaps = (mesesPorPagina − 1) × 4mm     the page-wrapper's gap-4 between stacked months
 *   monthBudget    = (273mm − interMonthGaps) / mesesPorPagina
 *   rowGapsTotal   = (maxSemanas − 1) × 1mm         the day-grid's inter-row gaps (gap-1 ≈ 1.06mm)
 *   rowBudget      = monthBudget − 6mm − rowGapsTotal   6mm = weekday header + separator band
 *                                                        (measured ≈4.97mm, +buffer)
 *   alturaMm       = floor(rowBudget / maxSemanas)
 *
 * Worked examples (maxSemanas=4/5/6, the only values a calendar month can need):
 *   mesesPorPagina=1: monthBudget=273.    maxSemanas=4→(273−6−3)/4=66→66mm     =5→(273−6−4)/5=52.6→52mm    =6→(273−6−5)/6=43.67→43mm
 *   mesesPorPagina=2: monthBudget=134.5.  maxSemanas=4→(134.5−6−3)/4=31.4→31mm =5→(134.5−6−4)/5=24.9→24mm  =6→(134.5−6−5)/6=20.58→20mm
 *   mesesPorPagina=3: monthBudget=88.33.  maxSemanas=4→(88.33−6−3)/4=19.83→19mm=5→(88.33−6−4)/5=15.67→15mm =6→(88.33−6−5)/6=12.89→12mm
 *
 * Flooring (rather than rounding) keeps every case a guaranteed underestimate of what actually fits.
 * Note monthBudget only depends on mesesPorPagina, not maxSemanas — so a month's *total* height stays
 * ~constant regardless of how many weeks it needs; fewer weeks just means taller individual rows.
 *
 * mesesPorPagina=1 is additionally capped at whatever mesesPorPagina=2 would produce for the same
 * maxSemanas: uncapped, splitting the whole 273mm on a single month makes its cells implausibly
 * tall/stretched rather than just "the same cells with more page around them" — the leftover space on
 * a 1-mes-por-página page is meant to sit unused below the month, not inflate the cells. 2 and 3
 * mesesPorPagina are unaffected.
 */
function alturaFilaImpresionMm(mesesPorPagina: 1 | 2 | 3, maxSemanas: number): number {
  const interMonthGaps = (mesesPorPagina - 1) * 4;
  const monthBudget = (273 - interMonthGaps) / mesesPorPagina;
  const rowGapsTotal = (maxSemanas - 1) * 1;
  const rowBudget = monthBudget - 6 - rowGapsTotal;
  const alturaMm = Math.floor(rowBudget / maxSemanas);
  return mesesPorPagina === 1 ? Math.min(alturaMm, alturaFilaImpresionMm(2, maxSemanas)) : alturaMm;
}

/**
 * Font-size scale factor for the "número" elements in `DiaCeldaImpresion` (día, precio, mínimo de
 * noches) — everything else in the cell (temporada codigo, festivo/evento markers) stays at its fixed
 * size regardless. 3-meses-por-página's current sizing is the 1.0 "looks right" baseline; as
 * `mesesPorPagina` drops to 2 or 1 and `alturaMm` (post-cap, see `alturaFilaImpresionMm`) grows, this
 * scales the números up proportionally to how much taller the cell actually got, instead of leaving
 * them at a small fixed size in a now much bigger box.
 */
function escalaNumerosImpresion(alturaMm: number, maxSemanas: number): number {
  return alturaMm / alturaFilaImpresionMm(3, maxSemanas);
}

/**
 * Non-interactive calendar-grid cell for the print-only "Calendario" format, rendered via the
 * existing `MesGrid` (which already renders any cell it's given, interactive or not, so it needs no
 * changes to host this): day number + temporada codigo, a compact festivos marker top-right (just the
 * first one's name, plus "+N" for the rest — festivos only, not eventos), precio + mínimo de noches on
 * one line, each edge-aligned, and eventos pinned to the cell's bottom edge (`mt-auto`) in a visually
 * distinct style so it's never confused with the festivo marker — garnet + bold on the same manual
 * signals as everywhere else. No heatmap, no click handler, no selection checkbox. Out-of-month padding
 * cells (from `celdasDelMes`, same as the on-screen grids) render empty to keep weekday columns
 * aligned; CSS Grid's default row-stretch sizes them to match their row without needing their own
 * `alturaMm`. Día, precio and mínimo de noches scale with `escala`; temporada codigo and the
 * festivo/evento markers stay pinned to their own fixed size regardless.
 */
function DiaCeldaImpresion({
  celda, calc, eventos, festivosPorFecha, aplicaA, alturaMm, escala,
}: {
  celda: Celda;
  calc: DiaCalculado | null;
  eventos: Evento[];
  festivosPorFecha: Map<string, Festivo[]>;
  aplicaA: TemporadaAplicaA;
  /** Max row height in mm — see `alturaFilaImpresionMm`. Passed as an inline style since Tailwind's
   * JIT can't generate a class for a value computed at runtime. */
  alturaMm: number;
  /** Font-size scale for día/precio/mínimo de noches — see `escalaNumerosImpresion`. Also an inline
   * style, for the same reason. */
  escala: number;
}) {
  if (!celda.enMes) return <div aria-hidden />;

  const festivos = (festivosPorFecha.get(celda.iso) ?? []).map((f) => f.nombre);
  const eventosDia = eventosActivosDia(eventos, celda.iso, aplicaA).map((e) => e.nombre);

  return (
    <div
      className="flex flex-col gap-px rounded border border-slate-300 px-1 py-0.5 [break-inside:avoid]"
      style={{ minHeight: `${alturaMm}mm` }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="shrink-0 font-bold" style={{ fontSize: `${9 * escala}px` }}>
          {celda.dia}
          {calc && <span className="ml-0.5 text-[9px] text-slate-500">{calc.temporada.codigo}</span>}
        </span>
        {festivos.length > 0 && (
          <span className="min-w-0 flex-1 truncate text-right text-[7px] leading-tight text-muted-foreground" title={festivos.join(", ")}>
            {festivos[0]}
            {festivos.length > 1 ? ` +${festivos.length - 1}` : ""}
          </span>
        )}
      </div>
      {calc ? (
        <div className="flex items-baseline justify-between gap-1 tabular-nums">
          {calc.estanciaMinima != null && (
            <span
              className={cn(calc.estanciaMinimaFuentes.some((f) => f.origen === "manual") && "font-bold text-[#7C2D33]")}
              style={{ fontSize: `${7.5 * escala}px` }}
            >
              {calc.estanciaMinima} n.
            </span>
          )}
          <span
            className={cn("font-semibold", calc.precioManual != null && "font-bold text-[#7C2D33]")}
            style={{ fontSize: `${9 * escala}px` }}
          >
            {calc.precioFinal}€
          </span>
        </div>
      ) : (
        <span className="text-[7px] text-muted-foreground">Sin datos</span>
      )}
      {eventosDia.length > 0 && (
        <span className="mt-auto truncate text-[7px] italic leading-tight text-indigo-600" title={eventosDia.join(", ")}>
          {eventosDia[0]}
          {eventosDia.length > 1 ? ` +${eventosDia.length - 1}` : ""}
        </span>
      )}
    </div>
  );
}

/**
 * One month's calendar grid for the print-only "Calendario" format, with the month title rendered as
 * a vertical label down the left edge instead of `MesGrid`'s usual horizontal line above the grid —
 * this reclaims the vertical space the horizontal title used to take (folded into
 * `alturaFilaImpresionMm`'s math, which now only budgets for the weekday header). Reads bottom-to-top
 * (`rotate-180` alongside `writing-mode: vertical-rl`). `MesGrid`'s own `titulo` prop is left untouched
 * for the on-screen 3-month view — this wraps `MesGrid` (called with no `titulo`, but with
 * `separadorImpresion` for the print-only header band) instead of passing one. Uses the month
 * abbreviation (`MESES_ABR`), not the full name — a full name reads awkwardly rotated down a narrow
 * spine.
 */
function MesImpresionCalendario({
  anio, mes, dias, eventos, festivosPorFecha, aplicaA, alturaMm, escala,
}: {
  anio: number;
  mes: number;
  dias: Map<string, DiaCalculado | null>;
  eventos: Evento[];
  festivosPorFecha: Map<string, Festivo[]>;
  aplicaA: TemporadaAplicaA;
  alturaMm: number;
  escala: number;
}) {
  return (
    <div className="flex gap-1 [break-inside:avoid]">
      <div className="flex w-4 shrink-0 items-center justify-center text-center text-[9px] font-extrabold text-slate-700 [writing-mode:vertical-rl] rotate-180">
        {MESES_ABR[mes]} {anio}
      </div>
      <div className="min-w-0 flex-1">
        <MesGrid
          celdas={celdasDelMes(anio, mes)}
          compacta
          separadorImpresion
          renderCelda={(c) => (
            <DiaCeldaImpresion
              key={c.iso}
              celda={c}
              calc={dias.get(c.iso) ?? null}
              eventos={eventos}
              festivosPorFecha={festivosPorFecha}
              aplicaA={aplicaA}
              alturaMm={alturaMm}
              escala={escala}
            />
          )}
        />
      </div>
    </div>
  );
}

function CalendarioPage() {
  const temporadasQ = useQuery({ queryKey: ["pricing-temporadas"], queryFn: fetchTemporadas });
  const diaQ = useQuery({ queryKey: ["pricing-dia-semana-periodos"], queryFn: fetchDiaSemanaPeriodos });
  const precioQ = useQuery({ queryKey: ["pricing-precio-base"], queryFn: fetchPrecioBase });
  const eventosQ = useQuery({ queryKey: ["pricing-eventos"], queryFn: fetchEventos });
  const festivosQ = useQuery({ queryKey: ["pricing-festivos"], queryFn: fetchFestivos });
  const ajustesQ = useQuery({ queryKey: ["pricing-ajustes-dia"], queryFn: fetchAjustesDia });

  const temporadas = useMemo(() => temporadasQ.data ?? [], [temporadasQ.data]);
  const diaSemanaPeriodos = useMemo(() => diaQ.data ?? [], [diaQ.data]);
  const precioBase = useMemo(() => precioQ.data ?? [], [precioQ.data]);
  const eventos = useMemo(() => eventosQ.data ?? [], [eventosQ.data]);
  const ajustesDia = useMemo(() => ajustesQ.data ?? [], [ajustesQ.data]);
  // fetchFestivos returns every festivo: index them by date, several can share one.
  const festivosPorFecha = useMemo(() => {
    const m = new Map<string, Festivo[]>();
    for (const f of festivosQ.data ?? []) m.set(f.fecha, [...(m.get(f.fecha) ?? []), f]);
    return m;
  }, [festivosQ.data]);

  const [aplicaA, setAplicaA] = useState<TemporadaAplicaA>("city");
  // null until the person navigates: then the year/month default from the data that exists.
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [vista, setVista] = useState<"mes" | "trimestre">("mes");
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [mapaCalor, setMapaCalor] = useState(true);
  const [seleccionMasiva, setSeleccionMasiva] = useState<Set<string>>(new Set());
  // The day that started the current selection; only meaningful while it's the selection's sole day.
  const [ancla, setAncla] = useState<string | null>(null);
  const [edicionMasivaAbierta, setEdicionMasivaAbierta] = useState(false);
  const [asignarEventoAbierto, setAsignarEventoAbierto] = useState(false);
  const [imprimirAbierto, setImprimirAbierto] = useState(false);
  const [printSpec, setPrintSpec] = useState<PrintSpec | null>(null);

  const dataYears = useMemo(
    () => [...new Set([...temporadas.map((t) => t.anio), ...diaSemanaPeriodos.map((p) => p.anio), ...precioBase.map((p) => p.anio)])],
    [temporadas, diaSemanaPeriodos, precioBase],
  );
  const hoy = new Date();
  const thisYear = hoy.getFullYear();
  const defaultYear = dataYears.includes(thisYear) ? thisYear : dataYears.length ? Math.max(...dataYears) : thisYear;
  const { y: anio, m: mes } = cursor ?? { y: defaultYear, m: defaultYear === thisYear ? hoy.getMonth() : 0 };
  const years = useMemo(() => [...new Set([...dataYears, anio])].sort((a, b) => b - a), [dataYears, anio]);

  // Every day of the año is calculated once; paging between months only reads from this.
  const calculo = useMemo(
    () => calcularAnio(anio, aplicaA, { temporadas, diaSemanaPeriodos, precioBase, eventos }, ajustesDia),
    [anio, aplicaA, temporadas, diaSemanaPeriodos, precioBase, eventos, ajustesDia],
  );
  // Quarter-aligned starts only: 0, 3, 6, 9. A trimestre built from one of these never spans two
  // años, so it always reads from this single año's `calculo` — no merging across `calcularAnio` calls.
  const trimestreInicio = mes - (mes % 3);
  const mesesVisibles = useMemo(
    () => (vista === "trimestre" ? [trimestreInicio, trimestreInicio + 1, trimestreInicio + 2] : [mes]),
    [vista, trimestreInicio, mes],
  );
  const celdasPorMes = useMemo(() => mesesVisibles.map((m) => celdasDelMes(anio, m)), [anio, mesesVisibles]);
  // Flattened across every visible month, so range-fill selection (toggleSeleccionDia below) sees the
  // whole 3-month window in "trimestre" mode instead of only the first month.
  const celdasVisibles = useMemo(() => celdasPorMes.flat(), [celdasPorMes]);

  // The selection doesn't need to carry across the visible window: simplest is to drop it whenever
  // that window changes — the trimestre's start month in "trimestre" mode, the month itself in "mes"
  // mode — or whenever the view mode itself switches.
  const ventanaInicio = vista === "trimestre" ? trimestreInicio : mes;
  useEffect(() => {
    setSeleccionMasiva(new Set());
  }, [anio, vista, ventanaInicio]);

  // Every month from printSpec.desde to printSpec.hasta, inclusive — independent of the on-screen
  // Año/Mes/Vista, and free to cross a año boundary.
  const mesesImpresion = useMemo(() => {
    if (!printSpec) return [];
    const { desde, hasta } = printSpec;
    const meses: { anio: number; mes: number }[] = [];
    for (let a = desde.anio, m = desde.mes; a < hasta.anio || (a === hasta.anio && m <= hasta.mes); m++) {
      if (m > 11) { m = 0; a++; }
      meses.push({ anio: a, mes: m });
    }
    return meses;
  }, [printSpec]);

  // Day-level data for the printed range, computed once via calcularRango (which itself merges one
  // calcularAnio call per año touched) rather than reusing `calculo`, which only covers the año
  // currently shown on screen.
  const diasImpresion = useMemo(() => {
    if (!printSpec) return new Map<string, DiaCalculado | null>();
    const dias = calcularRango(
      printSpec.desde, printSpec.hasta, aplicaA,
      { temporadas, diaSemanaPeriodos, precioBase, eventos }, ajustesDia,
    );
    return new Map(dias.map((d) => [d.fecha, d.calc]));
  }, [printSpec, aplicaA, temporadas, diaSemanaPeriodos, precioBase, eventos, ajustesDia]);

  // Months grouped into page-sized chunks for the print stylesheet's page breaks.
  const paginasImpresion = useMemo(() => {
    if (!printSpec) return [];
    // "Meses por página" only makes sense for the Calendario grid (stacking compact month-grids);
    // Lista's per-day table always gets one month per página, regardless of that setting.
    const n = printSpec.formato === "lista" ? 1 : printSpec.mesesPorPagina;
    return Array.from({ length: Math.ceil(mesesImpresion.length / n) }, (_, i) => mesesImpresion.slice(i * n, i * n + n));
  }, [mesesImpresion, printSpec]);

  // The actual worst-case week-rows across the months in this print job (4, 5 or 6) — feeds
  // alturaFilaImpresionMm so the "Calendario" format's row height isn't shrunk for a hypothetical
  // 6-row month when nothing in this job actually needs one.
  const maxSemanasImpresion = useMemo(
    () => Math.max(1, ...mesesImpresion.map(({ anio: a, mes: m }) => celdasDelMes(a, m).length / 7)),
    [mesesImpresion],
  );

  // Row height (and the números' font-size scale derived from it) for the "Calendario" format, for
  // this print job's mesesPorPagina and maxSemanasImpresion — computed once here rather than inline
  // per month, since every month in the job shares the same value.
  const alturaFilaCalendario = useMemo(
    () => (printSpec ? alturaFilaImpresionMm(printSpec.mesesPorPagina, maxSemanasImpresion) : 0),
    [printSpec, maxSemanasImpresion],
  );
  const escalaNumerosCalendario = useMemo(
    () => escalaNumerosImpresion(alturaFilaCalendario, maxSemanasImpresion),
    [alturaFilaCalendario, maxSemanasImpresion],
  );

  // Fires window.print() once the print-only DOM (driven by printSpec) has actually mounted.
  useEffect(() => {
    if (!printSpec) return;
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, [printSpec]);

  // Cleanup: drop the print-only content once the print dialog (or the "Guardar como PDF" flow)
  // closes, so it doesn't sit rendered-but-hidden until the next print.
  useEffect(() => {
    const onAfterPrint = () => setPrintSpec(null);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  function moverMes(delta: 1 | -1) {
    setDir(delta);
    setCursor({
      y: mes + delta < 0 ? anio - 1 : mes + delta > 11 ? anio + 1 : anio,
      m: (mes + delta + 12) % 12,
    });
  }

  function moverTrimestre(delta: 1 | -1) {
    setDir(delta);
    const destino = trimestreInicio + delta * 3;
    setCursor({
      y: destino < 0 ? anio - 1 : destino > 9 ? anio + 1 : anio,
      m: (destino + 12) % 12,
    });
  }

  /**
   * Checkbox click. On an empty selection the day becomes the anchor; with only the anchor selected,
   * clicking another day fills the whole range between them (by date, either direction); from then on
   * — or whenever the selection holds more than the anchor — each click toggles just that one day.
   * Any clear (Cancelar selección, window change, after a bulk save) empties the set, so the next
   * click anchors afresh. The range only fills days that have their own checkbox (visible — in "mes"
   * mode the displayed month, in "trimestre" mode any of the three — and calculable), so it can't pick
   * up days that couldn't be selected one by one.
   */
  function toggleSeleccionDia(iso: string) {
    if (seleccionMasiva.size === 0) {
      setAncla(iso);
      setSeleccionMasiva(new Set([iso]));
      return;
    }
    if (ancla && iso !== ancla && seleccionMasiva.size === 1 && seleccionMasiva.has(ancla)) {
      const [desde, hasta] = ancla < iso ? [ancla, iso] : [iso, ancla];
      setSeleccionMasiva(new Set(celdasVisibles.filter((c) => c.enMes && c.iso >= desde && c.iso <= hasta && calculo.dias.get(c.iso)).map((c) => c.iso)));
      setAncla(null);
      return;
    }
    setAncla(null);
    const next = new Set(seleccionMasiva);
    if (next.has(iso)) next.delete(iso);
    else next.add(iso);
    setSeleccionMasiva(next);
  }

  const cargando =
    temporadasQ.isLoading || diaQ.isLoading || precioQ.isLoading || eventosQ.isLoading || festivosQ.isLoading || ajustesQ.isLoading;
  const error = (temporadasQ.error ?? diaQ.error ?? precioQ.error ?? eventosQ.error ?? festivosQ.error ?? ajustesQ.error) as Error | null;
  const seleccionado = seleccion ? calculo.dias.get(seleccion) ?? null : null;

  return (
    <AppShell title="Vista Calendario">
      <div className="print:hidden">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Año</span>
          <Select value={String(anio)} onValueChange={(v) => setCursor({ y: Number(v), m: mes })}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {vista === "mes" && (
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Mes</span>
            <Select
              value={String(mes)}
              onValueChange={(v) => {
                setDir(Number(v) >= mes ? 1 : -1);
                setCursor({ y: anio, m: Number(v) });
              }}
            >
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((nombre, i) => <SelectItem key={nombre} value={String(i)}>{nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Vista</span>
          <ToggleGroup
            type="single"
            value={vista}
            onValueChange={(v) => v && setVista(v as "mes" | "trimestre")}
            className="h-9 justify-start"
          >
            <ToggleGroupItem value="mes" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              1 mes
            </ToggleGroupItem>
            <ToggleGroupItem value="trimestre" className="h-9 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              3 meses
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Grupo</span>
          <Select value={aplicaA} onValueChange={(v) => setAplicaA(v as TemporadaAplicaA)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="city">City</SelectItem>
              <SelectItem value="rural">Rural</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Mapa de calor</span>
          <div className="flex h-9 items-center">
            <Switch checked={mapaCalor} onCheckedChange={setMapaCalor} />
          </div>
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground invisible">Imprimir</span>
          <Button variant="outline" className="h-9" onClick={() => setImprimirAbierto(true)}>
            <Printer className="mr-1.5 h-4 w-4" /> Imprimir
          </Button>
        </div>
        {mapaCalor && calculo.rango && (
          <div className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
            <span>{calculo.rango.min}€</span>
            <span
              className="h-2 w-24 rounded-full"
              style={{ background: `linear-gradient(to right, ${heatColor(0, 0, 1)}, ${heatColor(1, 0, 1)})` }}
            />
            <span>{calculo.rango.max}€</span>
            <span>· año {anio}</span>
          </div>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error.message}</p>}
      {cargando && <p className="mb-4 text-sm text-muted-foreground">Cargando…</p>}

      <div className={vista === "trimestre" ? "w-full" : "mx-auto max-w-[760px]"}>
        <div className="mb-3 flex items-center justify-between">
          <Button
            size="icon"
            variant="outline"
            onClick={() => (vista === "trimestre" ? moverTrimestre(-1) : moverMes(-1))}
            title={vista === "trimestre" ? "Trimestre anterior" : "Mes anterior"}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold">
            {vista === "trimestre" ? `${MESES[mesesVisibles[0]]} – ${MESES[mesesVisibles[2]]} ${anio}` : `${MESES[mes]} ${anio}`}
          </h2>
          <Button
            size="icon"
            variant="outline"
            onClick={() => (vista === "trimestre" ? moverTrimestre(1) : moverMes(1))}
            title={vista === "trimestre" ? "Trimestre siguiente" : "Mes siguiente"}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {seleccionMasiva.size > 0 && (
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {seleccionMasiva.size} día{seleccionMasiva.size === 1 ? "" : "s"} seleccionado{seleccionMasiva.size === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSeleccionMasiva(new Set())}>
                Cancelar selección
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAsignarEventoAbierto(true)}>
                Asignar a evento
              </Button>
              <Button size="sm" onClick={() => setEdicionMasivaAbierta(true)}>
                Editar {seleccionMasiva.size} días
              </Button>
            </div>
          </div>
        )}

        {vista === "mes" ? (
          <div
            key={`${anio}-${mes}`}
            className={cn("animate-in fade-in-0 duration-200", dir === 1 ? "slide-in-from-right-4" : "slide-in-from-left-4")}
          >
            <MesGrid
              celdas={celdasPorMes[0]}
              renderCelda={(c) => (
                <DiaCelda
                  key={c.iso}
                  celda={c}
                  calc={calculo.dias.get(c.iso) ?? null}
                  eventos={eventosActivosDia(eventos, c.iso, aplicaA)}
                  festivos={festivosPorFecha.get(c.iso) ?? []}
                  rango={calculo.rango}
                  mapaCalor={mapaCalor}
                  seleccionado={seleccionMasiva.has(c.iso)}
                  onOpen={() => setSeleccion(c.iso)}
                  onToggleSeleccion={() => toggleSeleccionDia(c.iso)}
                />
              )}
            />
          </div>
        ) : (
          <div
            key={`${anio}-${trimestreInicio}`}
            className={cn(
              "grid grid-cols-1 gap-6 animate-in fade-in-0 duration-200 lg:grid-cols-3",
              dir === 1 ? "slide-in-from-right-4" : "slide-in-from-left-4",
            )}
          >
            {mesesVisibles.map((m, i) => (
              <MesGrid
                key={m}
                titulo={`${MESES[m]} ${anio}`}
                celdas={celdasPorMes[i]}
                compacta
                renderCelda={(c) => (
                  <DiaCeldaCompacta
                    key={c.iso}
                    celda={c}
                    calc={calculo.dias.get(c.iso) ?? null}
                    eventos={eventosActivosDia(eventos, c.iso, aplicaA)}
                    festivos={festivosPorFecha.get(c.iso) ?? []}
                    rango={calculo.rango}
                    mapaCalor={mapaCalor}
                    seleccionado={seleccionMasiva.has(c.iso)}
                    onOpen={() => setSeleccion(c.iso)}
                    onToggleSeleccion={() => toggleSeleccionDia(c.iso)}
                  />
                )}
              />
            ))}
          </div>
        )}
      </div>
      </div>

      {imprimirAbierto && (
        <ImprimirDialog
          anio={anio}
          mes={mes}
          years={years}
          onClose={() => setImprimirAbierto(false)}
          onConfirmar={(spec) => {
            setImprimirAbierto(false);
            setPrintSpec(spec);
          }}
        />
      )}

      {printSpec && (
        <div className="hidden print:block">
          {paginasImpresion.map((pagina, i) => (
            <div key={i} className={cn("flex flex-col gap-4", i < paginasImpresion.length - 1 && "[break-after:page]")}>
              {pagina.map(({ anio: a, mes: m }) =>
                printSpec.formato === "lista" ? (
                  <TablaMesImpresion
                    key={`${a}-${m}`}
                    anio={a}
                    mes={m}
                    dias={diasImpresion}
                    eventos={eventos}
                    festivosPorFecha={festivosPorFecha}
                    aplicaA={aplicaA}
                  />
                ) : (
                  <MesImpresionCalendario
                    key={`${a}-${m}`}
                    anio={a}
                    mes={m}
                    dias={diasImpresion}
                    eventos={eventos}
                    festivosPorFecha={festivosPorFecha}
                    aplicaA={aplicaA}
                    alturaMm={alturaFilaCalendario}
                    escala={escalaNumerosCalendario}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {seleccionado && (
        <DiaPrecioDialog
          key={seleccionado.fecha}
          dia={seleccionado}
          festivos={festivosPorFecha.get(seleccionado.fecha) ?? []}
          temporadas={temporadas}
          onAjusteGuardado={async () => { await ajustesQ.refetch(); }}
          onFestivoGuardado={async () => { await festivosQ.refetch(); }}
          onClose={() => setSeleccion(null)}
        />
      )}

      {edicionMasivaAbierta && (
        <DiasEdicionMasivaDialog
          fechas={[...seleccionMasiva].sort()}
          anio={anio}
          aplicaA={aplicaA}
          temporadas={temporadas}
          dias={calculo.dias}
          onClose={() => setEdicionMasivaAbierta(false)}
          onTemporadaAplicada={async () => { await temporadasQ.refetch(); }}
          onGuardado={async () => {
            await ajustesQ.refetch();
            setSeleccionMasiva(new Set());
          }}
        />
      )}

      {asignarEventoAbierto && (
        <DiasAsignarEventoDialog
          fechas={[...seleccionMasiva].sort()}
          anio={anio}
          aplicaA={aplicaA}
          eventos={eventos}
          temporadas={temporadas}
          dias={calculo.dias}
          onClose={() => setAsignarEventoAbierto(false)}
          onEventoAplicado={async () => {
            await eventosQ.refetch();
            setSeleccionMasiva(new Set());
          }}
        />
      )}
    </AppShell>
  );
}
