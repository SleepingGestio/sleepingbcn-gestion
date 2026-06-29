export const ROLE_COLORS: Record<string, { bg: string; fg: string }> = {
  AdminAPP:       { bg: "#3C3489", fg: "#EEEDFE" },
  "Gestión":      { bg: "#0C447C", fg: "#FFFFFF" },
  "Administración": { bg: "#1D5FAD", fg: "#FFFFFF" },
  Operaciones:    { bg: "#085041", fg: "#FFFFFF" },
  Mantenimiento:  { bg: "#8B4513", fg: "#FFFFFF" },
  Limpieza:       { bg: "#1D9E75", fg: "#FFFFFF" },
  "Check-in":     { bg: "#6B7280", fg: "#FFFFFF" },
};

const DEFAULT_ROLE_STYLE = { bg: "#E5E7EB", fg: "#374151" };

export function roleColor(nombre: string | null | undefined) {
  if (!nombre) return DEFAULT_ROLE_STYLE;
  return ROLE_COLORS[nombre] ?? DEFAULT_ROLE_STYLE;
}