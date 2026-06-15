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

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${fmtDate(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}