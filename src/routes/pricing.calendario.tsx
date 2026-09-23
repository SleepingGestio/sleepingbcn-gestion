import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DiaPrecioDialog } from "@/components/dia-precio-dialog";
import { DiasEdicionMasivaDialog } from "@/components/dias-edicion-masiva-dialog";
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
            <span className="block text-[15px] font-semibold leading-[1.1]">{calc.precioFinal}€</span>
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
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [mapaCalor, setMapaCalor] = useState(true);
  const [seleccionMasiva, setSeleccionMasiva] = useState<Set<string>>(new Set());
  const [edicionMasivaAbierta, setEdicionMasivaAbierta] = useState(false);

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
  const celdas = useMemo(() => celdasDelMes(anio, mes), [anio, mes]);

  // The selection doesn't need to carry across months: simplest is to drop it whenever the
  // displayed month changes, whichever control (prev/next, Año, Mes) triggered it.
  useEffect(() => {
    setSeleccionMasiva(new Set());
  }, [anio, mes]);

  function moverMes(delta: 1 | -1) {
    setDir(delta);
    setCursor({
      y: mes + delta < 0 ? anio - 1 : mes + delta > 11 ? anio + 1 : anio,
      m: (mes + delta + 12) % 12,
    });
  }

  function toggleSeleccionDia(iso: string) {
    setSeleccionMasiva((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
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

      <div className="mx-auto max-w-[760px]">
        <div className="mb-3 flex items-center justify-between">
          <Button size="icon" variant="outline" onClick={() => moverMes(-1)} title="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold">{MESES[mes]} {anio}</h2>
          <Button size="icon" variant="outline" onClick={() => moverMes(1)} title="Mes siguiente">
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
              <Button size="sm" onClick={() => setEdicionMasivaAbierta(true)}>
                Editar {seleccionMasiva.size} días
              </Button>
            </div>
          </div>
        )}

        <div className="mb-1.5 grid grid-cols-7 gap-1.5">
          {DIAS.map((d) => (
            <div
              key={d}
              className="border-b-2 border-slate-200 py-1 text-center text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500"
            >
              {d}
            </div>
          ))}
        </div>

        <div
          key={`${anio}-${mes}`}
          className={cn(
            "grid grid-cols-7 gap-1.5 animate-in fade-in-0 duration-200",
            dir === 1 ? "slide-in-from-right-4" : "slide-in-from-left-4",
          )}
        >
          {celdas.map((c) => (
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
          ))}
        </div>
      </div>

      {seleccionado && (
        <DiaPrecioDialog
          key={seleccionado.fecha}
          dia={seleccionado}
          festivos={festivosPorFecha.get(seleccionado.fecha) ?? []}
          temporadas={temporadas}
          onAjusteGuardado={async () => { await ajustesQ.refetch(); }}
          onClose={() => setSeleccion(null)}
        />
      )}

      {edicionMasivaAbierta && (
        <DiasEdicionMasivaDialog
          fechas={[...seleccionMasiva].sort()}
          aplicaA={aplicaA}
          temporadas={temporadas}
          dias={calculo.dias}
          onClose={() => setEdicionMasivaAbierta(false)}
          onGuardado={async () => {
            await ajustesQ.refetch();
            setSeleccionMasiva(new Set());
          }}
        />
      )}
    </AppShell>
  );
}
