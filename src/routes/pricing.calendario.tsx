import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DiaPrecioDialog } from "@/components/dia-precio-dialog";
import { DiasEdicionMasivaDialog } from "@/components/dias-edicion-masiva-dialog";
import { DiasAsignarEventoDialog } from "@/components/dias-asignar-evento-dialog";
import { CATEGORIA_STYLES, AMBITO_LIST, AMBITO_LABEL, AMBITO_COLOR } from "@/lib/pricing-styles";
import {
  fetchTemporadas, fetchDiaSemanaPeriodos, fetchPrecioBase, fetchEventos, fetchFestivos, fetchAjustesDia,
  type Evento, type Festivo, type TemporadaAplicaA,
} from "@/lib/pricing";
import { calcularAnio, eventosActivosDia, type DiaCalculado } from "@/lib/pricing-calc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing/calendario")({
  component: CalendarioPage,
});

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
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
              <span className="mt-px block text-[11px] font-bold">{calc.estanciaMinima} nits</span>
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
 * stripe, precio, mínimo noches, eventos, selection) laid out for a ~62px-tall cell instead of
 * `DiaCelda`'s full-detail one — see the approved "Vista de 3 meses" mockup this follows. Out-of-month
 * padding days render as an invisible placeholder rather than `DiaCelda`'s muted/grayscale treatment,
 * so three adjacent months' grids don't visually bleed into each other with neighbouring dates.
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
    return <div className="invisible min-h-[62px]" aria-hidden />;
  }

  if (!calc || !rango) {
    return (
      <div
        className="relative flex min-h-[62px] flex-col overflow-hidden rounded-[6px] border border-slate-200 px-[5px] pb-1 pt-3 text-slate-500"
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
        "relative flex min-h-[62px] flex-col justify-between overflow-hidden rounded-[6px] border text-left text-slate-900 outline-2 -outline-offset-2 outline-transparent transition-[outline-color] hover:outline-slate-900 focus-visible:outline-slate-900",
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
      {evento && (
        <span
          title={eventos.map((e) => e.nombre).join(", ")}
          className="absolute right-0.5 top-3 z-10 max-w-[calc(100%-10px)] truncate rounded-full border border-primary bg-card px-1 text-[7px] font-extrabold leading-[12px] text-primary"
        >
          {evento.nombre}
        </span>
      )}
      <span className="text-[10px] font-bold tabular-nums">{celda.dia}</span>
      <div>
        <span className={cn("block text-[11px] font-extrabold tabular-nums", calc.precioManual != null && "text-[#7C2D33]")}>
          {calc.precioFinal}€
        </span>
        <div className="mt-0.5 flex items-center gap-[3px]">
          <span
            className="rounded-full px-1 text-[8px] font-extrabold leading-[13px] text-white"
            style={{ background: tempColor(calc.temporada.codigo) }}
            title={calc.temporada.nombre}
          >
            {calc.temporada.codigo}
          </span>
          {calc.estanciaMinima != null && (
            <span className="whitespace-nowrap text-[8px] font-semibold opacity-75">{calc.estanciaMinima} nits</span>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * Weekday header row + 7-column day grid for one month. Cell rendering is left entirely to
 * `renderCelda`, so the same layout serves both the full-detail 1-month view (`DiaCelda`) and the
 * compact 3-month view (`DiaCeldaCompacta`) without either one knowing about the other.
 */
function MesGrid({
  celdas, renderCelda, titulo, compacta,
}: {
  celdas: Celda[];
  renderCelda: (celda: Celda) => ReactNode;
  /** Per-column month label; only the 3-month view needs one, since the 1-month view already has its own header above the grid. */
  titulo?: string;
  /** Denser weekday header to match the compact cell's smaller footprint. */
  compacta?: boolean;
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
      <div className={cn("grid grid-cols-7", compacta ? "gap-1" : "gap-1.5")}>{celdas.map((c) => renderCelda(c))}</div>
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

      <div className={vista === "trimestre" ? "mx-auto max-w-[1360px]" : "mx-auto max-w-[760px]"}>
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
