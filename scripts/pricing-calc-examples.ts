// Manual sanity check for src/lib/pricing-calc.ts, with made-up but plausible data.
// Not part of the app bundle. Run with:  node scripts/pricing-calc-examples.ts
// (Node 22.6+ strips the types itself; it throws, so exits non-zero, if any check fails.)
//
// Rule under test: subtotal = precioBase × coeficiente temporada efectiva × coeficiente del día;
// then every active event with a valor adds its own delta (each against the same subtotal).

import { calcularAnio, calcularPrecioDia, type CalcData } from "../src/lib/pricing-calc.ts";
import type { AjusteDia, DiaSemanaPeriodo, Evento, PrecioBase, Temporada } from "../src/lib/pricing.ts";

const meta = { id_negocio: "n1", created_at: "2027-01-01", updated_at: "2027-01-01" };

const temp = (
  id: string, codigo: string, nombre: string, coeficiente: number,
  periodos: [string, string, number | null][],
): Temporada => ({
  ...meta, id, aplica_a: "city", anio: 2027, codigo, nombre, coeficiente,
  temporada_periodos: periodos.map(([fecha_inicio, fecha_fin, estancia_minima], i) => ({
    id: `${id}-p${i}`, temporada_id: id, fecha_inicio, fecha_fin, estancia_minima, created_at: "2027-01-01",
  })),
});

const diaPeriodo = (entresemana: number, finsemana: number): DiaSemanaPeriodo => ({
  ...meta, id: "d1", aplica_a: "city", anio: 2027, fecha_inicio: "2027-01-01", fecha_fin: "2027-12-31",
  coef_entresemana: entresemana, coef_finsemana: finsemana,
});

// Temporadas (city 2027). ALTA has 3 minimum nights in July–August.
// MEGA / EXTRA / ALTA2 have no periods of their own: events point to them.
const temporadas: Temporada[] = [
  temp("t-baja", "BAJA", "Temporada baja", 0.9, [["2027-01-01", "2027-03-14", null], ["2027-09-01", "2027-12-31", null]]),
  temp("t-media", "MEDIA", "Temporada media", 1.1, [["2027-03-15", "2027-06-30", 2]]),
  temp("t-alta", "ALTA", "Temporada alta", 1.3, [["2027-07-01", "2027-08-31", 3]]),
  temp("t-mega", "MEGA", "Temporada mega", 1.6, []),
  temp("t-extra", "EXTRA", "Temporada extra", 1.5, []),
  temp("t-alta2", "ALTA2", "Otra con el mismo coeficiente que ALTA", 1.3, []),
];

// Weekdays ×1.00, Friday–Sunday ×1.20, all year.
const diaSemanaPeriodos: DiaSemanaPeriodo[] = [diaPeriodo(1, 1.2)];

const precioBase: PrecioBase[] = [{ ...meta, id: "b1", aplica_a: "city", anio: 2027, precio: 100 }];

const ev = (p: Partial<Evento> & Pick<Evento, "id" | "nombre" | "fecha_inicio" | "fecha_fin">): Evento => ({
  ...meta,
  categoria: "feria", aplica_a: "city", valor: null, tipo_valor: null, estancia_minima: null,
  afluencia_estimada: null, ubicacion: null, fase: "principal", evento_relacionado_id: null,
  plantilla_id: null, temporada_override_id: null, estado: "confirmado", periodicidad: "anual",
  fuente: "manual", notas: null,
  ...p,
});

const eventos: Evento[] = [
  // E1: 10–12 July. Overrides the temporada to MEGA (1.6), +5 %, 4 minimum nights.
  ev({ id: "e1", nombre: "Feria Mayor", fecha_inicio: "2027-07-10", fecha_fin: "2027-07-12", temporada_override_id: "t-mega", valor: 5, tipo_valor: "%", estancia_minima: 4 }),
  // E2: 11 July only. Also overrides (EXTRA 1.5 loses to MEGA 1.6), +10 €, 5 minimum nights.
  ev({ id: "e2", nombre: "Concierto", fecha_inicio: "2027-07-11", fecha_fin: "2027-07-11", temporada_override_id: "t-extra", valor: 10, tipo_valor: "€", estancia_minima: 5 }),
  // E3: 6 July but only proposed → ignored.
  ev({ id: "e3", nombre: "Propuesto", fecha_inicio: "2027-07-06", fecha_fin: "2027-07-06", estado: "propuesto", temporada_override_id: "t-mega", valor: 50, tipo_valor: "€" }),
  // E4: 6 July but rural only → ignored for city.
  ev({ id: "e4", nombre: "Solo rural", fecha_inicio: "2027-07-06", fecha_fin: "2027-07-06", aplica_a: "rural", valor: 50, tipo_valor: "€" }),
  // E5: Friday 16 July, overrides to ALTA2 (1.3, same coefficient as the period ALTA).
  ev({ id: "e5", nombre: "Mismo coeficiente", fecha_inicio: "2027-07-16", fecha_fin: "2027-07-16", temporada_override_id: "t-alta2" }),
  // E6: Tuesday 20 July, overrides to BAJA (0.9, lower than the period's 1.3).
  ev({ id: "e6", nombre: "Override a la baja", fecha_inicio: "2027-07-20", fecha_fin: "2027-07-20", temporada_override_id: "t-baja" }),
];

const data: CalcData = { temporadas, diaSemanaPeriodos, precioBase, eventos };

let failures = 0;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
}

// A. Tuesday in ALTA, nothing else applies (E3 is only proposed, E4 is rural).
{
  const r = calcularPrecioDia("2027-07-06", "city", data)!;
  check("A Tue ALTA: 100 × 1.3 × 1.0 = 130", r.precioFinal === 130 && close(r.subtotal, 130), r);
  check("A estancia mínima 3 (period)", r.estanciaMinima === 3 && r.temporada.origen === "periodo" && !r.hayRectificacion, r);
  check("A proposed and rural events are ignored", r.efectos.length === 0 && r.candidatosTemporada.length === 0, r);
}

// B. Friday in ALTA: 100 × 1.3 × 1.2.
{
  const r = calcularPrecioDia("2027-07-09", "city", data)!;
  check("B Fri ALTA: 100 × 1.3 × 1.2 = 156", r.precioFinal === 156 && r.dia.etiqueta === "Fin de semana", r);
}

// C. Saturday with E1: MEGA (1.6) wins, subtotal 100 × 1.6 × 1.2 = 192, then +5 % of 192.
{
  const r = calcularPrecioDia("2027-07-10", "city", data)!;
  check("C Sat + E1: precioTrasTemporada 160, subtotal 192",
    close(r.precioTrasTemporada, 160) && close(r.subtotal, 192) && r.temporada.codigo === "MEGA" && r.hayRectificacion, r);
  check("C efecto 5 % of 192 = 9.6 → final round(201.6) = 202", r.efectos.length === 1 && close(r.efectos[0].delta, 9.6) && r.precioFinal === 202, r);
  check("C estancia mínima = max(3, 4) = 4", r.estanciaMinima === 4, r.estanciaMinimaFuentes);
}

// D. Sunday with E1 and E2: MEGA wins, both efectos summed against the same subtotal (192),
//    minimum stay includes the losing E2 (5).
{
  const r = calcularPrecioDia("2027-07-11", "city", data)!;
  check("D winner is MEGA; loser EXTRA not applied to the price",
    r.temporada.codigo === "MEGA" && close(r.subtotal, 192) && r.candidatosTemporada.length === 2 && r.candidatosTemporada[0].ganador, r.candidatosTemporada);
  check("D efectos 9.6 + 10 = 19.6 → final round(211.6) = 212", close(r.efectosTotal, 19.6) && r.precioFinal === 212, r);
  check("D estancia mínima 5 from the losing E2", r.estanciaMinima === 5 && r.estanciaMinimaFuentes.some((f) => f.nombre === "Concierto" && f.aplicada), r.estanciaMinimaFuentes);
  check("D explanatory note present", r.notaTemporada !== null, r.notaTemporada);
}

// E. Monday inside E1: entre semana ×1.0 → 100 × 1.6 = 160, +5 % = 8 → 168.
{
  const r = calcularPrecioDia("2027-07-12", "city", data)!;
  check("E Mon + E1: 160 + 8 = 168", r.precioFinal === 168 && close(r.subtotal, 160), r);
}

// F. Nothing covers the date → null.
check("F no periods in 2028 → null", calcularPrecioDia("2028-07-06", "city", data) === null);
check("F rural has no data → null", calcularPrecioDia("2027-07-06", "rural", data) === null);

// G. Regression: an override to a temporada with the SAME coefficient as the period changes nothing.
//    Friday 16 July is in ALTA (1.3); E5 "overrides" to ALTA2 (also 1.3). The breakdown still says
//    the temporada came from an event, but the price is identical to having no event at all.
{
  const sin = calcularPrecioDia("2027-07-16", "city", { ...data, eventos: eventos.filter((e) => e.id !== "e5") })!;
  const con = calcularPrecioDia("2027-07-16", "city", data)!;
  check("G without E5: 100 × 1.3 × 1.2 = 156", sin.precioFinal === 156 && !sin.hayRectificacion, sin);
  check("G with E5 (same 1.3): identical price and subtotal", con.precioFinal === sin.precioFinal && close(con.subtotal, sin.subtotal), { sin: sin.precioFinal, con: con.precioFinal });
  check("G ...but the breakdown reports the event as the origin", con.hayRectificacion && con.temporada.origen === "evento" && con.temporada.codigo === "ALTA2", con.temporada);
}

// H. A single override with a LOWER coefficient than the period's still applies: 100 × 0.9 × 1.0 = 90.
{
  const r = calcularPrecioDia("2027-07-20", "city", data)!;
  check("H override to BAJA (0.9) on a Tuesday: 100 × 0.9 × 1.0 = 90", r.precioFinal === 90 && r.temporada.codigo === "BAJA", r);
}

// I. The reference example from the spec: base 100, temporada 1.2, día 1.1 → 132 (not 130).
{
  const simple: CalcData = {
    temporadas: [temp("t-x", "X", "Ejemplo", 1.2, [["2027-01-01", "2027-12-31", null]])],
    diaSemanaPeriodos: [diaPeriodo(1.1, 1.1)],
    precioBase,
    eventos: [],
  };
  const r = calcularPrecioDia("2027-07-06", "city", simple)!;
  check("I base 100, temporada 1.2, día 1.1 → 132", r.precioFinal === 132 && close(r.subtotal, 132), r);
  check("I no estancia mínima and no efectos", r.estanciaMinima === null && r.efectos.length === 0, r);
}

// K. Manual ajuste on a day that would otherwise be a plain período day (same date as A): temporada,
//    estancia mínima and precio are all overridden at once, and the underlying calculated price is
//    still available separately from the displayed (manual) one.
{
  const ajuste: AjusteDia = {
    ...meta, id: "aj1", fecha: "2027-07-06", aplica_a: "city",
    temporada_id: "t-baja", estancia_minima: 1, precio_manual: 55,
  };
  const r = calcularPrecioDia("2027-07-06", "city", data, ajuste)!;
  check("K temporada is the manual one (BAJA), not the period's ALTA", r.temporada.origen === "manual" && r.temporada.codigo === "BAJA", r.temporada);
  check("K estancia mínima is exactly the manual value (1), not maxed with the period's 3", r.estanciaMinima === 1, r.estanciaMinimaFuentes);
  check("K precioCalculado still reflects the manual temporada: 100 × 0.9 × 1.0 = 90", close(r.precioCalculado, 90), r);
  check("K precioFinal is the manual price (55), not the calculated one (90)", r.precioFinal === 55 && r.precioManual === 55, r);
  check("K no conflict note (a manual override makes it moot)", r.notaTemporada === null, r.notaTemporada);
}

// J. Whole-year calculation (what the calendar view uses): every day of 2027, min/max of the prices.
{
  const a = calcularAnio(2027, "city", data);
  check("J 365 days calculated, all covered", a.dias.size === 365 && [...a.dias.values()].every((d) => d !== null), a.dias.size);
  check("J range: min 90 (BAJA weekday), max 212 (11 July, MEGA + both efectos)", a.rango?.min === 90 && a.rango?.max === 212, a.rango);
  const rural = calcularAnio(2027, "rural", data);
  check("J rural has no data: 365 null days and no range", rural.dias.size === 365 && rural.rango === null, rural.rango);
}

if (failures > 0) throw new Error(`${failures} check(s) failed`);
console.log("\nall checks passed");
