import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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
      ? format(fromD, "PPP", { locale: es })
      : `${format(fromD, "d MMM", { locale: es })} → ${format(toD, "d MMM y", { locale: es })}`;

  const setPreset = (days: number) => {
    const today = new Date();
    onChange({ from: toISO(today), to: toISO(addDays(today, days - 1)) });
    setOpen(false);
  };

  const range: DateRange = { from: fromD, to: toD };

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
            selected={range}
            onSelect={(r) => {
              if (r?.from) {
                const from = toISO(r.from);
                const to = toISO(r.to ?? r.from);
                onChange({ from, to });
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