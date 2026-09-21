import type { EventoCategoria } from "@/lib/pricing";

/** Tailwind classes per event category; shared by CategoriaBadge and the calendar's event pills. */
export const CATEGORIA_STYLES: Record<EventoCategoria, string> = {
  feria: "bg-blue-600 text-white hover:bg-blue-600",
  deporte: "bg-emerald-600 text-white hover:bg-emerald-600",
  cultura: "bg-violet-600 text-white hover:bg-violet-600",
  otro: "bg-slate-500 text-white hover:bg-slate-500",
};
