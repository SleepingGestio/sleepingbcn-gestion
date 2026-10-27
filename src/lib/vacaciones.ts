// Average days per month (365.25 / 12), used to convert a monthly hours
// objective into a per-day vacation rate. Shared by every place that computes
// vacation hours (registre-horari.$id.tsx's AjustModal/NouAnyModal and
// personal-admin.tsx's computeVacHours) so they stay consistent.
export const DIAS_PROMEDIO_MES = 30.44;

// Días de vacaciones naturales que se devengan por mes de actividad (30 / 12).
export const DIES_VACANCES_PER_MES = 2.5;

// "Fijo discontinuo" es el nombre legal. 'discontinuo' es el valor antiguo en BD
// (mientras no se migren los datos se aceptan ambos).
export function isFijoDiscontinuo(tipo: string | null | undefined): boolean {
  return tipo === "fijo_discontinuo" || tipo === "discontinuo";
}

const MS_DIA = 86_400_000;
// Nº de día entero (UTC) de una fecha ISO: evita desvíos por zona horaria.
function diaUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_DIA);
}

// Días de vacaciones devengados por un fijo discontinuo en un año contractual,
// hasta `asOf`. Fórmula: 2,5 d × (días activos / DIAS_PROMEDIO_MES), redondeado
// al día y limitado al máximo anual. Ej.: 6 meses activos → 15 días.
// Los períodos se recortan a la ventana [anyIni, min(anyFi, asOf)] y se fusionan
// si se solapan o son contiguos para no contar ningún día dos veces.
export function diesMeritatsFD(
  periods: { fecha_inicio: string; fecha_fin: string | null }[],
  anyIni: string,
  anyFi: string,
  maxDies: number,
  asOf: string,
): number {
  const lo = diaUTC(anyIni);
  const hi = diaUTC(anyFi < asOf ? anyFi : asOf);
  if (hi < lo) return 0;
  const ivs: [number, number][] = [];
  for (const p of periods) {
    const s = Math.max(diaUTC(p.fecha_inicio), lo);
    const e = Math.min(p.fecha_fin ? diaUTC(p.fecha_fin) : hi, hi);
    if (e >= s) ivs.push([s, e]);
  }
  ivs.sort((a, b) => a[0] - b[0]);
  let activeDays = 0;
  let cur: [number, number] | null = null;
  for (const iv of ivs) {
    if (cur && iv[0] <= cur[1] + 1) cur[1] = Math.max(cur[1], iv[1]);
    else {
      if (cur) activeDays += cur[1] - cur[0] + 1;
      cur = [iv[0], iv[1]];
    }
  }
  if (cur) activeDays += cur[1] - cur[0] + 1;
  const earned = Math.round(DIES_VACANCES_PER_MES * (activeDays / DIAS_PROMEDIO_MES));
  return Math.min(earned, maxDies);
}
