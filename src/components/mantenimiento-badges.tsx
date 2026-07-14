import {
  ESTADO_FULL_STYLE,
  ESTADO_PILL_STYLE,
  PRIORIDAD_STYLE,
  TIPO_STYLE,
  type Estat,
  type IncidenciaTipo,
  type Prioridad,
} from "@/lib/mantenimiento";

export function TipoBadge({ tipus }: { tipus: IncidenciaTipo }) {
  const s = TIPO_STYLE[tipus];
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

export function PrioridadPill({ prioridad }: { prioridad: Prioridad | null }) {
  if (!prioridad) return <span className="text-muted-foreground text-xs">—</span>;
  const s = PRIORIDAD_STYLE[prioridad];
  return (
    <span
      title={s.label}
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.letter}
    </span>
  );
}

export function EstadoPill({ estat }: { estat: Estat }) {
  const s = ESTADO_PILL_STYLE[estat];
  if (!s) return null;
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

/** Unlike EstadoPill, always renders — used in the popover header where the
 * current state should always be visible (not just the two terminal ones). */
export function EstadoFullPill({ estat }: { estat: Estat }) {
  const s = ESTADO_FULL_STYLE[estat];
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
