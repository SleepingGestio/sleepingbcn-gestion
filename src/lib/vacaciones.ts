// Average days per month (365.25 / 12), used to convert a monthly hours
// objective into a per-day vacation rate. Shared by every place that computes
// vacation hours (registre-horari.$id.tsx's AjustModal/NouAnyModal and
// personal-admin.tsx's computeVacHours) so they stay consistent.
export const DIAS_PROMEDIO_MES = 30.44;
