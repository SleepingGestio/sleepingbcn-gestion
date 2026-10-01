import type { EventoCategoria, FestivoAmbito } from "@/lib/pricing";

/** Tailwind classes per event category; shared by CategoriaBadge and the calendar's event pills. */
export const CATEGORIA_STYLES: Record<EventoCategoria, string> = {
  feria: "bg-blue-600 text-white hover:bg-blue-600",
  deporte: "bg-emerald-600 text-white hover:bg-emerald-600",
  cultura: "bg-violet-600 text-white hover:bg-violet-600",
  otro: "bg-slate-500 text-white hover:bg-slate-500",
};

export type EstadoBadge = "ok" | "dudosa" | "roto" | "sin_verificar";

export const ESTADO_VERIFICACION_LABEL: Record<EstadoBadge, string> = {
  ok: "Ok", dudosa: "Dudosa", roto: "Roto", sin_verificar: "Sin verificar",
};

export const ESTADO_VERIFICACION_STYLES: Record<EstadoBadge, string> = {
  ok: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
  dudosa: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
  roto: "border-transparent bg-red-600 text-white hover:bg-red-600",
  sin_verificar: "border-transparent bg-slate-400 text-white hover:bg-slate-400",
};

/** Solid background class of each estado (the badge palette without text/border), for dots. */
export const ESTADO_VERIFICACION_DOT: Record<EstadoBadge, string> = {
  ok: ESTADO_VERIFICACION_STYLES.ok.split(" ").find((c) => c.startsWith("bg-"))!,
  dudosa: ESTADO_VERIFICACION_STYLES.dudosa.split(" ").find((c) => c.startsWith("bg-"))!,
  roto: ESTADO_VERIFICACION_STYLES.roto.split(" ").find((c) => c.startsWith("bg-"))!,
  sin_verificar: ESTADO_VERIFICACION_STYLES.sin_verificar.split(" ").find((c) => c.startsWith("bg-"))!,
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
