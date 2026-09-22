import type { EventoCategoria, FestivoAmbito } from "@/lib/pricing";

/** Tailwind classes per event category; shared by CategoriaBadge and the calendar's event pills. */
export const CATEGORIA_STYLES: Record<EventoCategoria, string> = {
  feria: "bg-blue-600 text-white hover:bg-blue-600",
  deporte: "bg-emerald-600 text-white hover:bg-emerald-600",
  cultura: "bg-violet-600 text-white hover:bg-violet-600",
  otro: "bg-slate-500 text-white hover:bg-slate-500",
};

/** Display order of the festivo ámbitos: the grid columns, the calendar strip segments, the dialog lines. */
export const AMBITO_LIST: FestivoAmbito[] = [
  "nacional", "catalan", "comunidad_otras", "local", "francia", "alemania", "italia", "reino_unido",
];

export const AMBITO_LABEL: Record<FestivoAmbito, string> = {
  nacional: "Nacional",
  catalan: "Catalán",
  comunidad_otras: "Otra comunidad",
  local: "Local",
  francia: "Francia",
  alemania: "Alemania",
  italia: "Italia",
  reino_unido: "Reino Unido",
};

/** One color per ámbito, shared by the Festivos grid's dots, the calendar strip and the day-detail dialog. */
export const AMBITO_COLOR: Record<FestivoAmbito, string> = {
  nacional: "#e11d48",
  catalan: "#d97706",
  comunidad_otras: "#7c3aed",
  local: "#0ea5e9",
  francia: "#4f46e5",
  alemania: "#52525b",
  italia: "#0891b2",
  reino_unido: "#c026d3",
};
