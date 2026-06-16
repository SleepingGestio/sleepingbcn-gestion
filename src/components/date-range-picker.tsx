import { useState, useEffect } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

export function toISO(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export type Range = { from: string; to: string };

export function todayRange(): Range {
  const t = toISO(new Date());
  return { from: t, to: t };
}

export function nextWeekRange(): Range {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 6);
  return { from: toISO(today), to: toISO(end) };
}

function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  const [open, setOpen] = useState(false);
  const fromD = new Date(value.from + "T00:00:00");
  const toD = new Date(value.to + "T00:00:00");

  const label =
    value.from === value.to
      ? fmtDate(fromD)
      : `${fmtDate(fromD)} → ${fmtDate(toD)}`;

  // Local draft during selection. `undefined` means "show committed value".
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);

  // Reset draft whenever the popover opens/closes.
  useEffect(() => {
    if (!open) setDraft(undefined);
  }, [open]);

  const setPreset = (days: number) => {
    const today = new Date();
    setDraft(undefined);
    onChange({ from: toISO(today), to: toISO(addDays(today, days - 1)) });
    setOpen(false);
  };

  const committed: DateRange = { from: fromD, to: toD };
  const displayed: DateRange = draft ?? committed;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start text-left font-normal min-w-[240px]")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-col gap-1 border-r p-2 min-w-[140px]">
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => setPreset(1)}>Hoy</Button>
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => setPreset(3)}>Próximos 3 días</Button>
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => setPreset(7)}>Próxima semana</Button>
          </div>
          <Calendar
            mode="range"
            selected={displayed}
            onSelect={(r) => {
              // If user hasn't started a fresh selection yet, treat this click
              // as the start of a new range (ignore the committed value).
              if (!draft) {
                if (r?.from) setDraft({ from: r.from, to: undefined });
                return;
              }
              // Mid-selection: react-day-picker may give us {from,to} once
              // the second date is picked. Wait until both are set, then commit.
              if (r?.from && r?.to) {
                const [a, b] = r.from <= r.to ? [r.from, r.to] : [r.to, r.from];
                onChange({ from: toISO(a), to: toISO(b) });
                setDraft(undefined);
                setOpen(false);
              } else if (r?.from) {
                setDraft({ from: r.from, to: undefined });
              }
            }}
            numberOfMonths={1}
            locale={es}
            className="p-3 pointer-events-auto"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}