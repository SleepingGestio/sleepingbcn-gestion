import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
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

const DOW = ["L", "M", "X", "J", "V", "S", "D"];
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

function startOfWeek(d: Date): Date {
  const dow = d.getDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return addDays(d, mondayOffset);
}

/** Rolling 3-week window (Mon–Sun rows) starting at the given anchor date's week. */
function threeWeekGrid(anchorWeekStart: Date): Date[][] {
  return Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 7 }, (_, j) => addDays(anchorWeekStart, i * 7 + j)),
  );
}

/**
 * Compact occupancy calendar for a single apartment, showing a rolling
 * 3-week window (anchored at the reference date's week, moving by 3 weeks
 * at a time) rather than a full month — keeps the popup short regardless
 * of which day of the month the reference date falls on. Fetches
 * reservations overlapping the visible window (same overlap query shape as
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
  const [anchor, setAnchor] = useState(() => startOfWeek(initial));

  const rows = useMemo(() => threeWeekGrid(anchor), [anchor]);
  const fromISO = toISO(rows[0][0]);
  const toExclusiveISO = toISO(addDays(rows[2][6], 1));

  // Distinct (year, month) pairs spanned by the visible window, in order —
  // used both for the header label and to alternate a subtle background
  // tint per month so the transition is visible without a hard divider.
  const monthKeys = useMemo(() => {
    const keys: string[] = [];
    for (const row of rows) {
      for (const d of row) {
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (keys[keys.length - 1] !== key) keys.push(key);
      }
    }
    return keys;
  }, [rows]);

  function monthTintIndex(d: Date): number {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    return monthKeys.indexOf(key);
  }

  const headerLabel = useMemo(() => {
    const [firstY, firstM] = monthKeys[0].split("-").map(Number);
    const [lastY, lastM] = monthKeys[monthKeys.length - 1].split("-").map(Number);
    if (monthKeys.length === 1) return `${MONTH_ES[firstM]} ${firstY}`;
    if (firstY === lastY) return `${MONTH_ES[firstM]} – ${MONTH_ES[lastM]} ${lastY}`;
    return `${MONTH_ES[firstM]} ${firstY} – ${MONTH_ES[lastM]} ${lastY}`;
  }, [monthKeys]);

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

  function prevWindow() {
    setAnchor((a) => addDays(a, -7));
  }
  function nextWindow() {
    setAnchor((a) => addDays(a, 7));
  }
  function goToday() {
    setAnchor(startOfWeek(new Date()));
  }

  return (
    <div className={cn("select-none", className)}>
      <div className="flex items-center justify-between mb-1.5">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={prevWindow} aria-label="3 semanas antes">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium capitalize">{headerLabel}</span>
          <button
            type="button"
            onClick={goToday}
            className="text-[10px] font-medium text-white bg-[#26215C] hover:bg-[#1e1a48] rounded-full px-2 py-0.5"
          >
            hoy
          </button>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={nextWindow} aria-label="3 semanas después">
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
        <div className="space-y-1">
          {rows.map((week, ri) => (
            <CalendarWeekRow
              key={ri}
              week={week}
              monthTintIndex={monthTintIndex}
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
  monthTintIndex,
  reservas,
  todayISO,
  onSelectDate,
}: {
  week: Date[];
  monthTintIndex: (d: Date) => number;
  reservas: ReservaLite[];
  todayISO: string;
  onSelectDate?: (iso: string) => void;
}) {
  const dayISOs = week.map(toISO);
  const rowStartISO = dayISOs[0];
  const rowEndExclusiveISO = toISO(addDays(week[6], 1));

  const overlapping = reservas.filter(
    (r) => !!r["Check in"] && !!r["Check-out"] && r["Check in"]! < rowEndExclusiveISO && r["Check-out"]! >= rowStartISO,
  );

  return (
    <div className="relative" style={{ height: 40 }}>
      <div className="grid grid-cols-7 h-full">
        {week.map((d, i) => {
          const iso = dayISOs[i];
          const isToday = iso === todayISO;
          const tinted = monthTintIndex(d) % 2 === 1;
          return (
            <button
              key={i}
              type="button"
              disabled={!onSelectDate}
              onClick={() => onSelectDate?.(iso)}
              className={cn(
                "text-center pt-0.5 text-[10px] leading-none font-semibold text-foreground",
                tinted && "bg-blue-100",
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
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={`tick-${i}`}
          className="absolute bg-slate-300"
          style={{
            left: `${(i + 1) * (100 / 7)}%`,
            bottom: 0,
            width: 1,
            height: 20,
            transform: "translateX(-0.5px)",
          }}
        />
      ))}
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
  const checkinOffsetPct = 0.45 * cellPct;
  const checkoutOffsetPct = 0.35 * cellPct;
  const leftPct = ciVisible ? ciIdx * cellPct + checkinOffsetPct : ciIdx < 0 ? 0 : 7 * cellPct;
  const rightPct = coVisible ? coIdx * cellPct + checkoutOffsetPct : coIdx < 0 ? 0 : 7 * cellPct;
  const widthPct = rightPct - leftPct;
  if (widthPct <= 0) return null;

  const isNarrow = coIdx - ciIdx <= 1;

  const leftTime = resolveTime(r["Hora estimada de llegada"], "15:00:00");
  const rightTime = resolveTime(r["Hora estimada de salida"], "11:00:00");

  const leftInset = ciVisible ? 1.5 : 0;
  const rightInset = coVisible ? 1.5 : 0;
  const barStyle: CSSProperties = {
    left: `calc(${leftPct}% + ${leftInset}px)`,
    width: `calc(${widthPct}% - ${leftInset + rightInset}px)`,
    minWidth: 8,
    bottom: 2,
    height: 14,
  };
  const roundedClass = cn(ciVisible && "rounded-l", coVisible && "rounded-r");
  const borderClass = cn(
    "border-y-2 border-white",
    ciVisible && "border-l-2",
    coVisible && "border-r-2",
  );

  if (isNarrow) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute bg-[#378ADD] hover:brightness-110 flex items-center justify-between",
              roundedClass,
              borderClass,
            )}
            style={barStyle}
            title={`${fmtDate(ciISO)} → ${fmtDate(coISO)}`}
          >
            {!ciVisible && ciIdx < 0 && <span className="text-white text-xs font-black pl-0.5 leading-none">‹‹</span>}
            {!coVisible && coIdx > 6 && <span className="text-white text-xs font-black pr-0.5 leading-none">››</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 text-xs" align="center" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Entrada:</span>
              <TimeBadge value={leftTime.value.slice(0, 5)} informed={leftTime.informed} size="xs" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Salida:</span>
              <TimeBadge value={rightTime.value.slice(0, 5)} informed={rightTime.informed} size="xs" />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div
      className={cn(
        "absolute bg-[#378ADD] flex items-center justify-between gap-0.5 px-0.5 overflow-hidden",
        roundedClass,
        borderClass,
      )}
      style={barStyle}
      title={`${fmtDate(ciISO)} → ${fmtDate(coISO)}`}
    >
      {ciVisible ? (
        <TimeBadge value={leftTime.value.slice(0, 5)} informed={leftTime.informed} size="xs" />
      ) : (
        ciIdx < 0 && <span className="text-white text-xs font-black pl-0.5 leading-none">‹‹</span>
      )}
      {coVisible ? (
        <TimeBadge value={rightTime.value.slice(0, 5)} informed={rightTime.informed} size="xs" />
      ) : (
        coIdx > 6 && <span className="text-white text-xs font-black pr-0.5 leading-none">››</span>
      )}
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
  underline = true,
  children,
}: {
  idApt: number | null;
  initialDateISO?: string | null;
  underline?: boolean;
  children: ReactNode;
}) {
  if (idApt == null) return <>{children}</>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            underline && "underline decoration-dotted underline-offset-2",
            "hover:text-foreground",
          )}
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
