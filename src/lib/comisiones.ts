import type { ModoComision } from "./tarifas";

export type Comision = { ota: number; cobro: number; total: number; aplicaCobro: boolean };

/** Effective Pagado estancia when nothing's saved yet — the same one-time
 *  prefill reserva-detail.tsx seeds into local state on open (KB "Cargo
 *  estancia", plus KB's own "Comisiones retenidas" when present — that field
 *  is verified 0 on every non-withholding channel, so this single formula is
 *  correct everywhere, no modo_comision branch needed). A caller that only
 *  reads the persisted reservas_gestio value (e.g. the reservations list)
 *  must run it through here too, or it'll see an incomplete base for every
 *  reservation nobody has opened/saved yet and flag a false "No cuadra". */
export function pagadoEstanciaEfectivo(
  pagadoEstanciaGuardado: number | null | undefined,
  cargoEstancia: unknown,
  comisionesRetenidas: unknown,
): number | null {
  if (pagadoEstanciaGuardado != null) return pagadoEstanciaGuardado;
  const cargo = Number(cargoEstancia);
  if (!Number.isFinite(cargo)) return null;
  const retenidas = Number(comisionesRetenidas);
  return cargo + (Number.isFinite(retenidas) ? retenidas : 0);
}

/** Commission base: Pagado estancia + Pagado limpieza (both app-corrected
 *  figures, not KB's raw "Cargo estancia"). No fallback — when Pagado
 *  estancia isn't saved yet the base is simply incomplete, which is exactly
 *  what should make the KB comparison below fail (a useful signal, not a
 *  bug to special-case around). See prompt_inf_economica_comision_autovalidacion. */
export function comisionBase(
  pagadoEstancia: number | null | undefined,
  pagadoLimpieza: number | null | undefined,
): number {
  return (pagadoEstancia ?? 0) + (pagadoLimpieza ?? 0);
}

/** Commission amounts derived FROM a %, per the channel's modo_comision.
 *   bruto (Booking): (pOta + pCobro) · base
 *   neto  (Airbnb/Expedia): pOta · base / (1 − pOta); pCobro does not apply.
 *  Confirmed against real data (2026-08-29): the /(1-pOta) grossing-up is
 *  still needed over the new base — Pagado estancia already being the
 *  corrected gross figure for neto channels does not make it redundant. */
export function computeComision(
  modoComision: ModoComision,
  pctOta: number | null | undefined,
  pctCobro: number | null | undefined,
  base: number,
): Comision {
  const pOta = (pctOta ?? 0) / 100;
  const pCobro = (pctCobro ?? 0) / 100;
  if (modoComision === "neto") {
    const ota = pOta > 0 && pOta < 1 ? (pOta * base) / (1 - pOta) : 0;
    return { ota, cobro: 0, total: ota, aplicaCobro: false };
  }
  return { ota: pOta * base, cobro: pCobro * base, total: (pOta + pCobro) * base, aplicaCobro: true };
}

const EPS = 0.02;

/** Per-line result of testing a % against KB's real imported figure.
 *  null = no comparable KB data (% not set, or KB's own figure is 0/null) —
 *  distinct from a confirmed match, so callers that need a positive
 *  confirmation (auto-fill) never mistake "nothing to compare" for "correct". */
export type LineCheck = { kb: number; calc: number; matches: boolean } | null;

function checkLine(kb: number, calc: number): LineCheck {
  if (!Number.isFinite(kb) || kb === 0) return null;
  return { kb, calc, matches: Math.abs(kb - calc) <= EPS };
}

export type KbCheck = { ota: LineCheck; cobro: LineCheck };

/** Reserva fields this module reads. "Comisiones retenidas" isn't a named
 *  ReservaKB property (it falls under its `[key: string]: unknown` index
 *  signature, same as every other KB column not explicitly typed), so this
 *  is spelled out rather than Pick<Reserva, ...> — Pick can't extract an
 *  index-signature-only field. */
export type ReservaKbFigures = {
  "Comisiones": number | null;
  "Comisiones retenidas"?: unknown;
};

/** Tests pctOta/pctCobro against KB's real reported commission for this
 *  reservation. The caller decides which % to test — the saved value, or
 *  (nothing saved yet) the suggested tariff — so this one function drives
 *  the warning display, the auto-validate-and-fill decision, and the list
 *  column, all off the same logic.
 *   bruto/aplicaCobro (Booking): KB "Comisiones" is a bundled OTA+cobro
 *     figure — split it by each %'s share and compare the parts.
 *   neto (Airbnb/Expedia): KB "Comisiones retenidas" vs comision.ota (no
 *     cobro line on these channels). */
export function computeKbCheck(
  reserva: ReservaKbFigures,
  comision: Comision,
  pctOta: number | null | undefined,
  pctCobro: number | null | undefined,
): KbCheck {
  if (pctOta == null) return { ota: null, cobro: null };
  if (comision.aplicaCobro) {
    const kbBundled = Number(reserva["Comisiones"]);
    const denom = (pctOta ?? 0) + (pctCobro ?? 0);
    if (!Number.isFinite(kbBundled) || kbBundled === 0 || denom <= 0) return { ota: null, cobro: null };
    return {
      ota: checkLine((kbBundled * (pctOta ?? 0)) / denom, comision.ota),
      cobro: pctCobro == null ? null : checkLine((kbBundled * (pctCobro ?? 0)) / denom, comision.cobro),
    };
  }
  return { ota: checkLine(Number(reserva["Comisiones retenidas"]), comision.ota), cobro: null };
}

export type KbMismatch = { kb: number; calc: number } | null;
export type KbComparison = { ota: KbMismatch; cobro: KbMismatch };

/** Warning-display view of computeKbCheck: a real, actionable mismatch only
 *  — silent both on "no comparable KB data" and on a clean match. */
export function computeKbComparison(
  reserva: ReservaKbFigures,
  comision: Comision,
  pctOta: number | null | undefined,
  pctCobro: number | null | undefined,
): KbComparison {
  const check = computeKbCheck(reserva, comision, pctOta, pctCobro);
  return {
    ota: check.ota && !check.ota.matches ? { kb: check.ota.kb, calc: check.ota.calc } : null,
    cobro: check.cobro && !check.cobro.matches ? { kb: check.cobro.kb, calc: check.cobro.calc } : null,
  };
}

/** True when there's a real mismatch on either line — drives the "⚠ No
 *  cuadra" list column/filter. */
export function hasKbMismatch(cmp: KbComparison): boolean {
  return !!(cmp.ota || cmp.cobro);
}
