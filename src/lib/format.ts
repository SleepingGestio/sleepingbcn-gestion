export function fmtDate(v: string | Date | null | undefined): string {
  if (v == null || v === "") return "—";
  let d: Date;
  if (v instanceof Date) d = v;
  else {
    const s = String(v);
    // ISO date or datetime
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      d = new Date(s.length === 10 ? s + "T00:00:00" : s);
    } else {
      // Try DD/MM/YYYY
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (m) {
        const yyyy = m[3].length === 2 ? Number("20" + m[3]) : Number(m[3]);
        d = new Date(yyyy, Number(m[2]) - 1, Number(m[1]));
      } else {
        d = new Date(s);
      }
    }
  }
  if (isNaN(d.getTime())) return String(v);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function fmtTime(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  const s = String(v);
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  // ISO datetime → take HH:MM
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return s;
}

/**
 * Formats a KB/Beds24-sourced time value (e.g. "Hora estimada de
 * llegada/salida") as local "HH:MM". These fields arrive either as a bare
 * "HH:MM"/"HH:MM:SS" string or as a full ISO timestamp (with or without TZ)
 * that must be converted from UTC to Europe/Madrid before display — a naive
 * digit extraction (like fmtTime) would show the raw UTC hour instead.
 * Returns null when the value is empty or matches neither shape.
 */
export function formatKbTimeLocal(v: string | null | undefined): string | null {
  if (!v) return null;
  const str = String(v).trim();
  if (/^\d{1,2}:\d{2}/.test(str)) {
    const m = str.match(/^(\d{1,2}):(\d{2})/)!;
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(str)) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    const fmt = new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.format(d).match(/(\d{2}):(\d{2})/);
    return parts ? `${parts[1]}:${parts[2]}` : null;
  }
  return null;
}

/**
 * Resolves the display/storage time for a cleaning's check-in/out edge from
 * the KB "Hora estimada de llegada/salida" field. informed=true (→ green
 * badge, per TimeBadge) when the KB field has a usable value; informed=false
 * (→ gray, defaultVal used) otherwise. Always returns "HH:MM:SS" so DB
 * `time`-column writes and stored-value comparisons line up exactly. Uses
 * formatKbTimeLocal so a full-timestamp KB value is converted to Europe/Madrid
 * local time rather than showing the raw UTC digits.
 */
export function resolveTime(
  estimada: string | null | undefined,
  defaultVal: string,
): { value: string; informed: boolean } {
  const hm = formatKbTimeLocal(estimada);
  if (hm) return { value: `${hm}:00`, informed: true };
  return { value: defaultVal, informed: false };
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${fmtDate(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}