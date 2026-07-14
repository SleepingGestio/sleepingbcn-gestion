import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { fmtDate, resolveTime } from "@/lib/format";
import { TimeBadge } from "@/components/time-badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight } from "lucide-react";

type ReservaLite = {
  "Número": string;
  "Check in": string | null;
  "Check-out": string | null;
  "Hora estimada de llegada": string | null;
  "Hora estimada de salida": string | null;
  "Estado": string | null;
};

const DOW = ["D", "L", "M", "X", "J", "V", "S"];
const MONTH_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const ESTADOS_OCUPADO = ["Confirmada", "Check-in realizado", "Check-out realizado"];

function toISO(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Weeks (Sun–Sat) covering the given month, padded with the leading/trailing days needed to complete each row — no fixed 6-row padding, so short months stay compact. */
function monthGrid(year: number, month0: number): Date[][] {
  const first = new Date(year, month0, 1);
  const gridStart = addDays(first, -first.getDay());
  const last = new Date(year, month0 + 1, 0);
  const gridEnd = addDays(last, 6 - last.getDay());
  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
  const rows: Date[][] = [];
  for (let i = 0; i < totalDays; i += 7) {
    rows.push(Array.from({ length: 7 }, (_, j) => addDays(gridStart, i + j)));
  }
  return rows;
}

/**
 * Compact month-grid occupancy calendar for a single apartment. Fetches
 * reservations overlapping the visible grid (same overlap query shape as
 * programacion-limpiezas.tsx's Gantt, scoped to one id_apt) and renders a
 * bar per reservation, clipped per week row, with check-in/out TimeBadges
 * at each visible edge (green = KB-informed, gray = default).
 */
export function ApartamentoOcupacionCalendario({
  idApt,
  initialDateISO,
  onSelectDate,
  className,
}: {
  idApt: number;
  initialDateISO?: string | null;
  onSelectDate?: (iso: string) => void;
  className?: string;
}) {
  const initial = initialDateISO ? new Date(initialDateISO + "T00:00:00") : new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month0, setMonth0] = useState(initial.getMonth());

  const rows = useMemo(() => monthGrid(year, month0), [year, month0]);
  const fromISO = toISO(rows[0][0]);
  const toExclusiveISO = toISO(addDays(rows[rows.length - 1][6], 1));

  const reservasQ = useQuery({
    queryKey: ["apt-ocupacion", idApt, fromISO, toExclusiveISO],
    queryFn: async (): Promise<ReservaLite[]> => {
      const { data, error } = await supabase
        .from("v_reservas_por_apartamento")
        .select('"Número","Check in","Check-out","Hora estimada de llegada","Hora estimada de salida","Estado"')
        .eq("id_apt", idApt)
        .in("Estado", ESTADOS_OCUPADO)
        .lt("Check in", toExclusiveISO)
        .gt("Check-out", fromISO);
      if (error) throw error;
      return (data ?? []) as ReservaLite[];
    },
  });
  const reservas = reservasQ.data ?? [];
  const todayISO = toISO(new Date());

  function prevMonth() {
    const d = new Date(year, month0 - 1, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }
  function nextMonth() {
    const d = new Date(year, month0 + 1, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }
  function goToday() {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth0(t.getMonth());
  }

  return (
    <div className={cn("select-none", className)}>
      <div className="flex items-center justify-between mb-1.5">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={prevMonth} aria-label="Mes anterior">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium capitalize">
            {MONTH_ES[month0]} {year}
          </span>
          <button
            type="button"
            onClick={goToday}
            className="text-[10px] text-muted-foreground underline hover:text-foreground"
          >
            hoy
          </button>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={nextMonth} aria-label="Mes siguiente">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-7 text-center text-[9px] text-muted-foreground mb-0.5">
        {DOW.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      {reservasQ.isLoading ? (
        <div className="text-center text-xs text-muted-foreground py-6">Cargando…</div>
      ) : (
        <div className="space-y-px">
          {rows.map((week, ri) => (
            <CalendarWeekRow
              key={ri}
              week={week}
              month0={month0}
              reservas={reservas}
              todayISO={todayISO}
              onSelectDate={onSelectDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarWeekRow({
  week,
  month0,
  reservas,
  todayISO,
  onSelectDate,
}: {
  week: Date[];
  month0: number;
  reservas: ReservaLite[];
  todayISO: string;
  onSelectDate?: (iso: string) => void;
}) {
  const dayISOs = week.map(toISO);
  const rowStartISO = dayISOs[0];
  const rowEndExclusiveISO = toISO(addDays(week[6], 1));

  const overlapping = reservas.filter(
    (r) => !!r["Check in"] && !!r["Check-out"] && r["Check in"]! < rowEndExclusiveISO && r["Check-out"]! > rowStartISO,
  );

  return (
    <div className="relative" style={{ height: 34 }}>
      <div className="grid grid-cols-7 h-full">
        {week.map((d, i) => {
          const iso = dayISOs[i];
          const inMonth = d.getMonth() === month0;
          const isToday = iso === todayISO;
          return (
            <button
              key={i}
              type="button"
              disabled={!onSelectDate}
              onClick={() => onSelectDate?.(iso)}
              className={cn(
                "text-left px-1 pt-0.5 text-[10px] leading-none",
                !inMonth && "text-muted-foreground/40",
                inMonth && "text-foreground",
                onSelectDate ? "hover:bg-muted/50 cursor-pointer" : "cursor-default",
              )}
            >
              <span className={cn(isToday && "inline-flex items-center justify-center rounded-full bg-[#26215C] text-white h-3.5 w-3.5")}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>
      {overlapping.map((r) => (
        <OcupacionBar key={r["Número"]} r={r} dayISOs={dayISOs} />
      ))}
    </div>
  );
}

function OcupacionBar({ r, dayISOs }: { r: ReservaLite; dayISOs: string[] }) {
  const ciISO = r["Check in"]!;
  const coISO = r["Check-out"]!;

  let ciIdx = dayISOs.indexOf(ciISO);
  let coIdx = dayISOs.indexOf(coISO);
  const ciVisible = ciIdx >= 0;
  const coVisible = coIdx >= 0;
  if (!ciVisible) ciIdx = ciISO < dayISOs[0] ? -1 : 7;
  if (!coVisible) coIdx = coISO < dayISOs[0] ? -1 : 7;

  const cellPct = 100 / 7;
  const leftPct = ciVisible ? ciIdx * cellPct + 0.5 * cellPct : ciIdx < 0 ? 0 : 7 * cellPct;
  const rightPct = coVisible ? coIdx * cellPct + 0.5 * cellPct : coIdx < 0 ? 0 : 7 * cellPct;
  const widthPct = rightPct - leftPct;
  if (widthPct <= 0) return null;

  const leftTime = resolveTime(r["Hora estimada de llegada"], "15:00:00");
  const rightTime = resolveTime(r["Hora estimada de salida"], "11:00:00");

  return (
    <div
      className="absolute rounded bg-[#378ADD] flex items-center justify-between gap-0.5 px-0.5 overflow-hidden"
      style={{ left: `${leftPct}%`, width: `${widthPct}%`, bottom: 2, height: 14 }}
      title={`${fmtDate(ciISO)} → ${fmtDate(coISO)}`}
    >
      {ciVisible && <TimeBadge value={leftTime.value.slice(0, 5)} informed={leftTime.informed} size="xs" />}
      {coVisible && <TimeBadge value={rightTime.value.slice(0, 5)} informed={rightTime.informed} size="xs" />}
    </div>
  );
}

/**
 * Clickable "Prevista"-style trigger: opens a small popover showing
 * ApartamentoOcupacionCalendario for the given apartment. Renders `children`
 * as plain (non-clickable) text when idApt is null — nothing to show.
 */
export function OcupacionPopoverTrigger({
  idApt,
  initialDateISO,
  children,
}: {
  idApt: number | null;
  initialDateISO?: string | null;
  children: ReactNode;
}) {
  if (idApt == null) return <>{children}</>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <ApartamentoOcupacionCalendario idApt={idApt} initialDateISO={initialDateISO} />
      </PopoverContent>
    </Popover>
  );
}
