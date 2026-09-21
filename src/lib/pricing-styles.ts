import type { EventoCategoria, FestivoTipo } from "@/lib/pricing";

/** Tailwind classes per event category; shared by CategoriaBadge and the calendar's event pills. */
export const CATEGORIA_STYLES: Record<EventoCategoria, string> = {
  feria: "bg-blue-600 text-white hover:bg-blue-600",
  deporte: "bg-emerald-600 text-white hover:bg-emerald-600",
  cultura: "bg-violet-600 text-white hover:bg-violet-600",
  otro: "bg-slate-500 text-white hover:bg-slate-500",
};

/** Display order of the festivo tipos (also the order of the dots in the calendar cells). */
export const FESTIVO_TIPOS: FestivoTipo[] = ["nacional", "catalan", "comunidad_otras", "internacional", "local"];

export const TIPO_LABEL: Record<FestivoTipo, string> = {
  nacional: "Nacional",
  catalan: "Catalán",
  comunidad_otras: "Otra comunidad",
  internacional: "Internacional",
  local: "Local",
};

export const TIPO_STYLES: Record<FestivoTipo, string> = {
  nacional: "bg-rose-600 text-white hover:bg-rose-600",
  catalan: "bg-amber-600 text-white hover:bg-amber-600",
  comunidad_otras: "bg-violet-600 text-white hover:bg-violet-600",
  internacional: "bg-teal-600 text-white hover:bg-teal-600",
  local: "bg-sky-600 text-white hover:bg-sky-600",
};
