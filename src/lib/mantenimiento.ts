export type IncidenciaTipo = "averia_rotura" | "manteniment" | "material_danyat" | "altre";
export type Prioridad = "alta" | "normal" | "baixa";
export type Estat = "pendent_validacio" | "validada" | "en_curs" | "finalitzada" | "rebutjada";

export type Incidencia = {
  id_incidencia: number;
  titol: string;
  descripcio: string | null;
  tipus: IncidenciaTipo;
  estat: Estat;
  origen: string;
  numero_reserva: string | null;
  id_apt: number | null;
  id_grup: number | null;
  id_tipo_espacio_comun: number | null;
  id_limpieza: number | null;
  id_reporter: number | null;
  id_assignat: number | null;
  prioritat_proposta: Prioridad;
  prioritat_confirmada: Prioridad | null;
  data_prevista: string | null;
  data_incident: string | null;
  creado_en: string;
  validat_per: number | null;
  validat_en: string | null;
  iniciat_en: string | null;
  finalitzat_en: string | null;
  notas_gestor: string | null;
  tasca_realitzada: boolean | null;
  material_reposat: boolean | null;
};

export type Registre = {
  id_registre: number;
  id_incidencia: number;
  id_persona: number;
  inici: string;
  fi: string | null;
  hores: number | null;
  notas: string | null;
  cost_materials: number | null;
  desc_materials: string | null;
};

export type PersonaLite = { id_persona: number; nombre: string | null; apellidos: string | null; codigo?: string | null };
export type AptLite = { id_apt: number; nombre: string; id_grupo: number | null };
export type EspacioLite = { id_tipo: number; nombre: string };
export type GrupoLite = { id_grupo: number; nombre: string };

// Full column sets — shared by the list page and the detail popover so
// both always work from the same shape of row (no separate "lite" vs
// "full" incidencia/registre types to keep in sync).
export const INCIDENCIA_COLUMNS =
  "id_incidencia,titol,descripcio,tipus,estat,origen,numero_reserva,id_apt,id_grup,id_tipo_espacio_comun,id_limpieza,id_reporter,id_assignat,prioritat_proposta,prioritat_confirmada,data_prevista,data_incident,creado_en,validat_per,validat_en,iniciat_en,finalitzat_en,notas_gestor,tasca_realitzada,material_reposat";

export const REGISTRE_COLUMNS =
  "id_registre,id_incidencia,id_persona,inici,fi,hores,notas,cost_materials,desc_materials";

export const TIPO_STYLE: Record<IncidenciaTipo, { bg: string; fg: string; label: string }> = {
  averia_rotura: { bg: "#DC2626", fg: "#FFFFFF", label: "Avería / Rotura" },
  manteniment: { bg: "#2563EB", fg: "#FFFFFF", label: "Mantenimiento" },
  material_danyat: { bg: "#D97706", fg: "#FFFFFF", label: "Material dañado" },
  altre: { bg: "#6B7280", fg: "#FFFFFF", label: "Otro" },
};

export const PRIORIDAD_STYLE: Record<Prioridad, { bg: string; fg: string; label: string }> = {
  alta: { bg: "#DC2626", fg: "#FFFFFF", label: "Alta" },
  normal: { bg: "#D97706", fg: "#FFFFFF", label: "Media" },
  baixa: { bg: "#9CA3AF", fg: "#FFFFFF", label: "Baja" },
};

// Used by the compact list row, which only ever shows a pill for these two
// terminal states (validada/en_curs are conveyed by the right-panel color).
export const ESTADO_PILL_STYLE: Partial<Record<Estat, { bg: string; fg: string; label: string }>> = {
  finalitzada: { bg: "#639922", fg: "#FFFFFF", label: "Finalizada" },
  rebutjada: { bg: "#DC2626", fg: "#FFFFFF", label: "Rechazada" },
};

// Used by the detail popover header, which always shows the current state.
export const ESTADO_FULL_STYLE: Record<Estat, { bg: string; fg: string; label: string }> = {
  pendent_validacio: { bg: "#9CA3AF", fg: "#FFFFFF", label: "Pendiente de validar" },
  validada: { bg: "#0C447C", fg: "#FFFFFF", label: "Validada" },
  en_curs: { bg: "#378ADD", fg: "#FFFFFF", label: "En curso" },
  finalitzada: { bg: "#639922", fg: "#FFFFFF", label: "Finalizada" },
  rebutjada: { bg: "#DC2626", fg: "#FFFFFF", label: "Rechazada" },
};

export const PRIORIDAD_RANK: Record<Prioridad, number> = { alta: 0, normal: 1, baixa: 2 };

export const ORIGEN_LABEL: Record<string, string> = {
  gestor: "Gestor",
  neteja: "Limpieza",
  manteniment: "Mantenimiento",
};

export function resolveLocation(
  inc: Pick<Incidencia, "id_apt" | "id_tipo_espacio_comun" | "id_grup">,
  aptById: Map<number, AptLite>,
  espacioById: Map<number, EspacioLite>,
  grupoById: Map<number, GrupoLite>,
): string {
  let base: string;
  if (inc.id_apt != null) base = aptById.get(inc.id_apt)?.nombre ?? `#${inc.id_apt}`;
  else if (inc.id_tipo_espacio_comun != null) {
    const nombre = espacioById.get(inc.id_tipo_espacio_comun)?.nombre ?? "?";
    base = `${nombre} (zona común)`;
  } else {
    base = "Otro";
  }
  const grupoNombre = inc.id_grup != null ? grupoById.get(inc.id_grup)?.nombre : undefined;
  return grupoNombre ? `${base} · ${grupoNombre}` : base;
}

export function rightPanelStyle(estat: Estat, sessionCount: number): { bg: string; borderColor: string | null } {
  if (estat === "en_curs") return { bg: "rgba(55,138,221,0.13)", borderColor: "#378ADD" };
  if (estat === "validada" && sessionCount > 0) return { bg: "rgba(216,90,48,0.10)", borderColor: "#D85A30" };
  if (estat === "finalitzada") return { bg: "rgba(99,153,34,0.14)", borderColor: "#639922" };
  return { bg: "transparent", borderColor: null };
}

/** The currently open (fi IS NULL) session, if any. */
export function findOpenSession(sesiones: Registre[]): Registre | null {
  return sesiones.find((s) => s.fi == null) ?? null;
}
