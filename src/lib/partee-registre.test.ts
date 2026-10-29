/// <reference types="node" />
// Run with: node --test src/lib/partee-registre.test.ts   (Node >= 22.18 strips types natively)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysIso,
  alertLevel,
  countRooms,
  diffDays,
  expectedViajeros,
  fmtAgo,
  fmtDateWeekday,
  fmtMadridDateTime,
  isIncompleto,
  isStaleRegistre,
  isUrgente,
  lastGeneralSync,
  MOTIVO_EXCLUSION_LABEL,
  SITUACION_LABEL,
  SITUACIONES_FILTRO,
  situacionRegistro,
  situacionTone,
  situacionTooltip,
  MOTIVOS_EXCLUSION,
  madridLocalToIso,
  isReclamable,
  puedeGenerarEnlace,
  reclamacionTooltip,
  todayMadrid,
  toMadridLocalInput,
  DEFAULT_SORT,
  sortRows,
  type SortableRow,
  type SortKey,
  type SortDir,
  viajerosTone,
  viajerosTooltip,
  type Expected,
} from "./partee-registre.ts";

const TODAY = "2026-10-28";
const day = (d: number) => addDaysIso(TODAY, d);
const UNKNOWN: Expected = { expected: null, exact: false };
const exact = (n: number): Expected => ({ expected: n, exact: true });
const approx = (n: number): Expected => ({ expected: n, exact: false });

const a = (estado: string, d: number, n: number | null, ex: Expected = UNKNOWN) =>
  alertLevel({ estado, num_viajeros: n, fecha_checkin: day(d) }, { today: TODAY, expected: ex });

describe("dates", () => {
  it("todayMadrid uses the Madrid calendar day", () => {
    assert.equal(todayMadrid(new Date("2026-10-28T10:00:00Z")), "2026-10-28");
    assert.equal(todayMadrid(new Date("2026-10-28T23:30:00Z")), "2026-10-29"); // UTC+1 in winter
    assert.equal(todayMadrid(new Date("2026-07-14T22:30:00Z")), "2026-07-15"); // UTC+2 in summer
  });
  it("diffDays / addDaysIso", () => {
    assert.equal(diffDays("2026-10-28", "2026-10-31"), 3);
    assert.equal(diffDays("2026-10-28", "2026-10-27"), -1);
    assert.equal(diffDays("2026-03-28", "2026-03-30"), 2); // DST change, still whole days
    assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01");
  });
  it("fmtAgo", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    assert.equal(fmtAgo(null, now), "nunca");
    assert.equal(fmtAgo("2026-10-28T11:55:00Z", now), "hace 5 min");
    assert.equal(fmtAgo("2026-10-28T09:00:00Z", now), "hace 3 h");
    assert.equal(fmtAgo("2026-10-25T12:00:00Z", now), "hace 3 d");
  });
});

describe("fmtDateWeekday", () => {
  it("the seven weekdays of a known week (Mon 2026-10-26 .. Sun 2026-11-01)", () => {
    assert.equal(fmtDateWeekday("2026-10-26"), "lun 26/10/26");
    assert.equal(fmtDateWeekday("2026-10-27"), "mar 27/10/26");
    assert.equal(fmtDateWeekday("2026-10-28"), "mié 28/10/26");
    assert.equal(fmtDateWeekday("2026-10-29"), "jue 29/10/26");
    assert.equal(fmtDateWeekday("2026-10-30"), "vie 30/10/26");
    assert.equal(fmtDateWeekday("2026-10-31"), "sáb 31/10/26");
    assert.equal(fmtDateWeekday("2026-11-01"), "dom 01/11/26");
  });
  it("month / year boundary and a leap day", () => {
    assert.equal(fmtDateWeekday("2026-12-31"), "jue 31/12/26");
    assert.equal(fmtDateWeekday("2027-01-01"), "vie 01/01/27");
    assert.equal(fmtDateWeekday("2028-02-29"), "mar 29/02/28");
  });
  it("DST change days keep their weekday (2026-03-29 Sun, 2026-10-25 Sun)", () => {
    assert.equal(fmtDateWeekday("2026-03-29"), "dom 29/03/26");
    assert.equal(fmtDateWeekday("2026-10-25"), "dom 25/10/26");
  });
  it("uses the first 10 characters of a longer ISO string, whatever its time or offset", () => {
    assert.equal(fmtDateWeekday("2026-10-28T15:00:00"), "mié 28/10/26");
    assert.equal(fmtDateWeekday("2026-10-28T23:59:59+02:00"), "mié 28/10/26");
    assert.equal(fmtDateWeekday("2026-10-28T00:00:00Z"), "mié 28/10/26");
  });
  it("same fallbacks as fmtDate: '—' for null/empty, the raw text for anything that is not a date", () => {
    assert.equal(fmtDateWeekday(null), "—");
    assert.equal(fmtDateWeekday(undefined), "—");
    assert.equal(fmtDateWeekday(""), "—");
    assert.equal(fmtDateWeekday("not a date"), "not a date");
    assert.equal(fmtDateWeekday("2026-13-45"), "2026-13-45");
    assert.equal(fmtDateWeekday("2026-02-30"), "2026-02-30");
  });
});

describe("isUrgente (Urgentes counter)", () => {
  // Rows of each situation: sin_registro = No generado, iniciado = Sin registros,
  // borrador 1 of 3 = Parcial, borrador 3 of 3 = Completado, borrador with unknown expected = En curso.
  const SITS: Record<string, { estado: string; n: number | null; ex: Expected }> = {
    no_generado: { estado: "sin_registro", n: null, ex: exact(3) },
    generado_sin_registros: { estado: "iniciado", n: 0, ex: exact(3) },
    parcial: { estado: "borrador", n: 1, ex: exact(3) },
    completado: { estado: "borrador", n: 3, ex: exact(3) },
    en_curso: { estado: "borrador", n: 2, ex: UNKNOWN },
    finalizado: { estado: "finalizado", n: 3, ex: exact(3) },
    anulado: { estado: "anulado", n: null, ex: UNKNOWN },
    manual: { estado: "manual", n: null, ex: UNKNOWN },
    error: { estado: "error", n: null, ex: UNKNOWN },
  };
  const urgent = (sit: string, d: number, extra: { excluida?: boolean; registro_confirmado?: boolean } = {}) => {
    const s = SITS[sit];
    return isUrgente({ estado: s.estado, num_viajeros: s.n, fecha_checkin: day(d), ...extra }, { today: TODAY, expected: s.ex });
  };

  it("pending situations are urgent for d <= 1 only (past, today, tomorrow)", () => {
    for (const sit of ["no_generado", "generado_sin_registros", "parcial"]) {
      for (const d of [-2, 0, 1]) assert.equal(urgent(sit, d), true, `${sit} d=${d}`);
      for (const d of [2, 3, 7]) assert.equal(urgent(sit, d), false, `${sit} d=${d}`);
    }
  });
  it("completado / en_curso / finalizado / anulado / manual / error are not urgent on d = 0, 1, 2", () => {
    for (const sit of ["completado", "en_curso", "finalizado", "anulado", "manual", "error"]) {
      for (const d of [0, 1, 2]) assert.equal(urgent(sit, d), false, `${sit} d=${d}`);
    }
  });
  it("overdue (alert code vencido) stays urgent, even Completado or manually confirmed", () => {
    assert.equal(urgent("completado", -1), true);
    assert.equal(urgent("en_curso", -3), true);
    assert.equal(urgent("parcial", -1, { registro_confirmado: true }), true);
    assert.equal(a("borrador", -1, 3, exact(3)).code, "vencido"); // same definition as alertLevel
  });
  it("terminal states in the past are not overdue, so not urgent (same handling as alertLevel)", () => {
    for (const sit of ["finalizado", "anulado", "manual", "error"]) assert.equal(urgent(sit, -2), false, sit);
  });
  it("excluded rows are never urgent, overdue or not", () => {
    for (const sit of ["no_generado", "parcial", "completado"]) {
      for (const d of [-2, 0, 1]) assert.equal(urgent(sit, d, { excluida: true }), false, `${sit} d=${d}`);
    }
  });
});

describe("isIncompleto (Incompletos counter)", () => {
  const sit = (estado: string, n: number | null, ex: Expected = exact(3), extra: Record<string, unknown> = {}) =>
    situacionRegistro({ estado, num_viajeros: n, fecha_checkin: day(2), ...extra }, { expected: ex });

  it("only Sin registros and Parcial", () => {
    assert.equal(isIncompleto(sit("iniciado", null)), true); // Sin registros
    assert.equal(isIncompleto(sit("borrador", 0)), true); // Sin registros
    assert.equal(isIncompleto(sit("borrador", 1)), true); // Parcial
  });
  it("never No generado, nor any other situation", () => {
    assert.equal(isIncompleto(sit("sin_registro", null)), false);
    assert.equal(isIncompleto(sit("borrador", 3)), false); // Completado
    assert.equal(isIncompleto(sit("borrador", 2, UNKNOWN)), false); // En curso
    for (const estado of ["finalizado", "anulado", "error", "manual"]) assert.equal(isIncompleto(sit(estado, 1)), false, estado);
  });
  it("excluded reservations are never incomplete", () => {
    for (const estado of ["iniciado", "borrador"]) {
      assert.equal(isIncompleto(sit(estado, 1, exact(3), { excluida: true })), false, estado);
    }
  });
});

describe("lastGeneralSync", () => {
  const T10 = "2026-10-28T10:00:00.000Z";
  const row = (d: number, ultimo_sync: string | null, excluida = false) => ({ fecha_checkin: day(d), ultimo_sync, excluida });

  it("rows in the window with the same time -> that time", () => {
    assert.equal(lastGeneralSync([row(0, T10), row(1, T10), row(3, T10)], TODAY), T10);
  });
  it("one individually refreshed row (much newer) does not move the result", () => {
    const rows = [row(0, T10), row(1, T10), row(2, T10), row(1, "2026-10-28T21:49:00.000Z")];
    assert.equal(lastGeneralSync(rows, TODAY), T10);
  });
  it("a general sync (touches all rows) does move it", () => {
    const T21 = "2026-10-28T21:00:00.000Z";
    assert.equal(lastGeneralSync([row(0, T21), row(1, T21), row(2, T21)], TODAY), T21);
  });
  it("window is today-1 .. today+3: rows outside are ignored", () => {
    const old = "2026-10-20T08:00:00.000Z";
    assert.equal(lastGeneralSync([row(-1, T10), row(3, T10), row(-2, old), row(4, old), row(10, old)], TODAY), T10);
  });
  it("excluded rows are ignored", () => {
    const old = "2026-10-20T08:00:00.000Z";
    assert.equal(lastGeneralSync([row(0, T10), row(1, old, true), row(2, old, true)], TODAY), T10);
  });
  it("null ultimo_sync (and invalid dates) are ignored", () => {
    assert.equal(lastGeneralSync([row(0, T10), row(1, null), row(2, "not a date")], TODAY), T10);
    assert.equal(lastGeneralSync([{ fecha_checkin: null, ultimo_sync: T10 }], TODAY), null);
  });
  it("no eligible rows -> null", () => {
    assert.equal(lastGeneralSync([], TODAY), null);
    assert.equal(lastGeneralSync([row(0, null), row(9, T10), row(1, T10, true)], TODAY), null);
  });
  it("odd count: the middle value; even count: the later of the two middle values", () => {
    const t = (h: number) => `2026-10-28T0${h}:00:00.000Z`;
    assert.equal(lastGeneralSync([row(0, t(3)), row(1, t(1)), row(2, t(2))], TODAY), t(2));
    assert.equal(lastGeneralSync([row(0, t(4)), row(1, t(1)), row(2, t(3)), row(3, t(2))], TODAY), t(3));
    assert.equal(lastGeneralSync([row(0, t(1)), row(1, t(2))], TODAY), t(2));
  });
  it("accepts a check-in with a time part", () => {
    assert.equal(lastGeneralSync([{ fecha_checkin: `${day(1)}T15:00:00`, ultimo_sync: T10 }], TODAY), T10);
  });
});

describe("expectedViajeros", () => {
  it("subtracts minors and exempt when present (exact)", () => {
    assert.deepEqual(expectedViajeros({ huespedes: 5, menores: 2, exentos: 0 }, 1), { expected: 3, exact: true });
    assert.deepEqual(expectedViajeros({ huespedes: 5, menores: 1, exentos: 1 }, 1), { expected: 3, exact: true });
    assert.deepEqual(expectedViajeros({ huespedes: 4, menores: null, exentos: 1 }, 1), { expected: 3, exact: true });
  });
  it("never goes below zero", () => {
    assert.deepEqual(expectedViajeros({ huespedes: 2, menores: 3, exentos: 0 }, 1), { expected: 0, exact: true });
  });
  it("uses Huéspedes as-is and not exact when there is no minors/exempt data", () => {
    assert.deepEqual(expectedViajeros({ huespedes: 4, menores: 0, exentos: 0 }, 1), { expected: 4, exact: false });
    assert.deepEqual(expectedViajeros({ huespedes: 4, menores: null, exentos: null }, 1), { expected: 4, exact: false });
  });
  it("is unknown for multi-unit reservations or without a guest count", () => {
    assert.deepEqual(expectedViajeros({ huespedes: 4, menores: 1, exentos: 0 }, 2), { expected: null, exact: false });
    assert.deepEqual(expectedViajeros({ huespedes: null, menores: 1, exentos: 0 }, 1), { expected: null, exact: false });
    assert.deepEqual(expectedViajeros(null, 1), { expected: null, exact: false });
  });
  it("countRooms", () => {
    assert.equal(countRooms("Apt 1"), 1);
    assert.equal(countRooms("Apt 1,  Apt 2"), 2);
    assert.equal(countRooms(""), 0);
    assert.equal(countRooms(null), 0);
  });
});

describe("terminal states", () => {
  it("finalizado / anulado / error / manual", () => {
    assert.deepEqual([a("finalizado", 2, 3).level, a("finalizado", 2, 3).label], ["ok", "Finalizado"]);
    assert.deepEqual([a("anulado", 2, 3).level, a("anulado", 2, 3).label], ["info", "Anulado"]);
    assert.deepEqual([a("error", 2, null).level, a("error", 2, null).label], ["danger", "Error de sincronización"]);
    assert.deepEqual([a("manual", 2, null).level, a("manual", 2, null).label], ["info", "Marcado a mano"]);
  });
  it("finalizado in the past is still ok (not overdue)", () => {
    assert.equal(a("finalizado", -3, 2).level, "ok");
  });
});

describe("overdue", () => {
  it("any non-final state in the past is danger", () => {
    for (const estado of ["sin_registro", "iniciado", "borrador"]) {
      const r = a(estado, -1, 2);
      assert.equal(r.level, "danger");
      assert.equal(r.label, "Parte vencido sin finalizar");
      assert.equal(r.code, "vencido");
    }
  });
});

describe("entry today (d = 0)", () => {
  it("borrador with viajeros: info, finalizes tonight", () => {
    const r = a("borrador", 0, 2, exact(2));
    assert.deepEqual([r.level, r.code, r.label], ["info", "hoy_se_finaliza", "Se finaliza esta noche (03:45)"]);
  });
  it("borrador with viajeros and unknown expected: info", () => {
    assert.equal(a("borrador", 0, 1, UNKNOWN).level, "info");
  });
  it("borrador with fewer than expected: warning (exact has no suffix)", () => {
    const r = a("borrador", 0, 1, exact(3));
    assert.deepEqual([r.level, r.label], ["warning", "Posible registro incompleto (1 de 3)"]);
  });
  it("borrador with fewer than expected, not exact: warning, label has no suffix", () => {
    const r = a("borrador", 0, 2, approx(4));
    assert.deepEqual([r.level, r.label], ["warning", "Posible registro incompleto (2 de 4)"]);
  });
  it("sin_registro / iniciado / borrador with 0 viajeros: danger", () => {
    for (const [estado, n] of [["sin_registro", null], ["iniciado", null], ["borrador", 0], ["borrador", null]] as const) {
      const r = a(estado, 0, n, exact(2));
      assert.deepEqual([r.level, r.label], ["danger", "Entra hoy sin registro"]);
    }
  });
});

describe("entry in the coming days (d >= 1)", () => {
  it("sin_registro: danger at 1..3, warning at 4..7", () => {
    for (const d of [1, 2, 3]) assert.equal(a("sin_registro", d, null).level, "danger");
    for (const d of [4, 7]) assert.equal(a("sin_registro", d, null).level, "warning");
    assert.equal(a("sin_registro", 4, null).label, "Sin enlace de registro");
    assert.equal(a("sin_registro", 10, null).level, "info");
  });
  it("iniciado / borrador with 0 viajeros: warning at 1..3, info at 4..7", () => {
    for (const [estado, n] of [["iniciado", null], ["borrador", 0]] as const) {
      assert.equal(a(estado, 1, n).level, "warning");
      assert.equal(a(estado, 3, n).level, "warning");
      assert.equal(a(estado, 4, n).level, "info");
      assert.equal(a(estado, 7, n).level, "info");
      assert.equal(a(estado, 2, n).label, "Registro no iniciado");
    }
  });
  it("complete (n >= expected): ok", () => {
    const r = a("borrador", 2, 3, exact(3));
    assert.deepEqual([r.level, r.code, r.label], ["ok", "completo", "Completo, pendiente de finalizar"]);
  });
  it("more than expected and exact: info", () => {
    const r = a("borrador", 2, 4, exact(3));
    assert.deepEqual([r.level, r.code, r.label], ["info", "mas_de_los_previstos", "Más viajeros que los previstos"]);
  });
  it("more than expected but not exact: counts as complete, label has no suffix", () => {
    const r = a("borrador", 2, 5, approx(4));
    assert.deepEqual([r.level, r.label], ["ok", "Completo, pendiente de finalizar"]);
  });
  it("fewer than expected at d = 2: info, never warning", () => {
    const r = a("borrador", 2, 1, exact(3));
    assert.deepEqual([r.level, r.code, r.label], ["info", "faltan_viajeros", "Faltan viajeros por registrar (1 de 3)"]);
    const r2 = a("borrador", 2, 1, approx(3));
    assert.deepEqual([r2.level, r2.label], ["info", "Faltan viajeros por registrar (1 de 3)"]);
  });
  it("fewer than expected stays info on d = 1 too", () => {
    assert.equal(a("borrador", 1, 2, exact(4)).level, "info");
  });
  it("multi-unit (expected unknown) with viajeros: ok, no comparison", () => {
    const r = a("borrador", 2, 2, UNKNOWN);
    assert.deepEqual([r.level, r.code], ["ok", "en_curso"]);
    assert.ok(!r.label.includes("de "));
  });
});

describe("priority", () => {
  it("danger before warning before info before ok, then by date", () => {
    const rows = [
      a("finalizado", 1, 2),
      a("borrador", 2, 1, exact(3)), // info
      a("sin_registro", 5, null), // warning
      a("sin_registro", 3, null), // danger (later date)
      a("sin_registro", 1, null), // danger (earlier date)
    ];
    const sorted = [...rows].sort((x, y) => x.priority - y.priority).map((r) => r.level);
    assert.deepEqual(sorted, ["danger", "danger", "warning", "info", "ok"]);
    assert.ok(rows[4].priority < rows[3].priority);
  });
});

describe("alert labels never carry the children suffix", () => {
  it("no label mentions children", () => {
    for (const ex of [exact(3), approx(3), UNKNOWN]) {
      for (const d of [0, 2, 6]) {
        for (const n of [0, 1, 3, 5]) {
          assert.ok(!a("borrador", d, n, ex).label.includes("niños"));
        }
      }
    }
  });
});

describe("viajerosTone (same colour code as the pill, never red)", () => {
  const t = (estado: string, d: number, n: number | null, ex: Expected) =>
    viajerosTone({ estado, num_viajeros: n, fecha_checkin: day(d) }, { today: TODAY }, ex);

  it("complete is green: finalizado, n >= expected (even on entry day)", () => {
    assert.equal(t("finalizado", -3, 0, exact(4)), "ok");
    assert.equal(t("finalizado", 5, null, UNKNOWN), "ok");
    assert.equal(t("borrador", 0, 2, exact(2)), "ok");
    assert.equal(t("borrador", 0, 3, approx(2)), "ok");
    assert.equal(t("borrador", 2, 2, exact(2)), "ok");
  });
  it("anulado / manual are muted", () => {
    assert.equal(t("anulado", 0, 0, exact(2)), "muted");
    assert.equal(t("manual", -1, 1, exact(2)), "muted");
  });
  it("pending and imminent (d <= 3, overdue included) is strong orange (violet for No generado)", () => {
    assert.equal(t("borrador", -1, 1, exact(3)), "pendiente_fuerte"); // parcial, overdue
    assert.equal(t("sin_registro", -2, null, exact(3)), "no_generado_fuerte"); // no generado, overdue
    assert.equal(t("borrador", 0, 0, exact(2)), "pendiente_fuerte");
    assert.equal(t("sin_registro", 0, null, UNKNOWN), "no_generado_fuerte");
    assert.equal(t("borrador", 0, 1, exact(2)), "pendiente_fuerte");
    assert.equal(t("iniciado", 1, null, exact(2)), "pendiente_fuerte");
    assert.equal(t("borrador", 2, 0, exact(2)), "pendiente_fuerte");
    assert.equal(t("borrador", 3, 0, UNKNOWN), "pendiente_fuerte");
    assert.equal(t("borrador", 2, 1, exact(3)), "pendiente_fuerte"); // parcial 2 days out
  });
  it("pending and not imminent (d >= 4) is soft orange (soft violet for No generado)", () => {
    assert.equal(t("borrador", 4, 0, exact(2)), "pendiente_suave");
    assert.equal(t("borrador", 6, 1, exact(3)), "pendiente_suave");
    assert.equal(t("sin_registro", 6, null, UNKNOWN), "no_generado_suave");
  });
  it("en_curso (multi-unit, unknown expected) is muted", () => {
    assert.equal(t("borrador", 2, 2, UNKNOWN), "muted");
    assert.equal(t("borrador", 0, 2, UNKNOWN), "muted");
  });
  it("never returns a red/warning/danger value", () => {
    const allowed = new Set(["ok", "pendiente_fuerte", "pendiente_suave", "no_generado_fuerte", "no_generado_suave", "muted"]);
    for (const estado of ["sin_registro", "iniciado", "borrador", "finalizado", "anulado", "error", "manual"]) {
      for (const d of [-3, 0, 2, 4, 9]) {
        for (const n of [null, 0, 1, 3]) {
          for (const ex of [UNKNOWN, exact(2), approx(2)]) assert.ok(allowed.has(t(estado, d, n, ex)), `${estado}/${d}/${n}`);
        }
      }
    }
  });
});

describe("viajerosTooltip", () => {
  const caveat =
    "El número previsto viene de la reserva y puede incluir niños; Partee solo exige registrar a los mayores de 14 años";
  it("exact: no caveat", () => {
    assert.equal(viajerosTooltip(3, exact(4)), "3 viajeros registrados de 4 previstos.");
  });
  it("not exact: adds the children caveat", () => {
    assert.equal(viajerosTooltip(3, approx(4)), "3 viajeros registrados de 4 previstos. " + caveat);
  });
  it("unknown expected: no previstos part and no caveat", () => {
    assert.equal(viajerosTooltip(2, UNKNOWN), "2 viajeros registrados.");
    assert.equal(viajerosTooltip(null, UNKNOWN), "0 viajeros registrados.");
  });
  it("singular for n = 1 (and for 1 previsto)", () => {
    assert.equal(viajerosTooltip(1, exact(2)), "1 viajero registrado de 2 previstos.");
    assert.equal(viajerosTooltip(1, UNKNOWN), "1 viajero registrado.");
    assert.equal(viajerosTooltip(1, approx(2)), "1 viajero registrado de 2 previstos. " + caveat);
    assert.equal(viajerosTooltip(1, exact(1)), "1 viajero registrado de 1 previsto.");
    assert.equal(viajerosTooltip(0, exact(2)), "0 viajeros registrados de 2 previstos.");
  });
});

describe("isStaleRegistre", () => {
  it("is stale when the KB check-in differs from fecha_checkin", () => {
    assert.equal(isStaleRegistre("2026-10-28", "2026-10-30"), true);
  });
  it("compares only the first 10 characters of the KB date", () => {
    assert.equal(isStaleRegistre("2026-10-28", "2026-10-28T00:00:00"), false);
    assert.equal(isStaleRegistre("2026-10-28", "2026-10-29T00:00:00"), true);
  });
  it("is not stale when the dates match or the KB date is unknown", () => {
    assert.equal(isStaleRegistre("2026-10-28", "2026-10-28"), false);
    assert.equal(isStaleRegistre("2026-10-28", null), false);
    assert.equal(isStaleRegistre("2026-10-28", undefined), false);
    assert.equal(isStaleRegistre("2026-10-28", ""), false);
  });
});

describe("registro confirmado a mano", () => {
  const conf = (estado: string, d: number, n: number | null, ex: Expected, confirmado = true) =>
    alertLevel(
      { estado, num_viajeros: n, fecha_checkin: day(d), registro_confirmado: confirmado },
      { today: TODAY, expected: ex },
    );
  const tone = (estado: string, d: number, n: number | null, ex: Expected, confirmado = true) =>
    viajerosTone(
      { estado, num_viajeros: n, fecha_checkin: day(d), registro_confirmado: confirmado },
      { today: TODAY },
      ex,
    );

  it("beats the comparison rules and the entry-day label", () => {
    for (const [d, ex] of [[2, exact(3)], [2, approx(3)], [0, exact(3)], [0, UNKNOWN], [5, exact(4)]] as const) {
      const r = conf("borrador", d, 1, ex);
      assert.deepEqual([r.level, r.code, r.label], ["ok", "confirmado_manual", "Registro confirmado a mano"]);
    }
  });
  it("overdue stays danger even if confirmed", () => {
    const r = conf("borrador", -1, 2, exact(2));
    assert.deepEqual([r.level, r.code], ["danger", "vencido"]);
  });
  it("needs n > 0 and borrador; unconfirmed rows behave as before", () => {
    assert.equal(conf("borrador", 2, 0, exact(2)).code, "no_iniciado");
    assert.equal(conf("borrador", 0, 0, exact(2)).code, "hoy_sin_registro");
    assert.equal(conf("borrador", 2, 1, exact(3), false).code, "faltan_viajeros");
    assert.equal(conf("borrador", 0, 1, exact(3), false).code, "hoy_incompleto");
  });
  it("tone is ok for confirmed rows with n > 0 and d >= 0", () => {
    assert.equal(tone("borrador", 0, 1, exact(3)), "ok");
    assert.equal(tone("borrador", 2, 1, exact(3)), "ok");
    assert.equal(tone("borrador", 5, 1, UNKNOWN), "ok");
  });
  it("confirmed rows stay green even if overdue (the alert keeps the red line), but not without viajeros", () => {
    assert.equal(tone("borrador", -1, 1, exact(3)), "ok");
    assert.equal(tone("borrador", 0, 0, exact(3)), "pendiente_fuerte");
    assert.equal(tone("borrador", 2, 1, exact(3), false), "pendiente_fuerte"); // not confirmed: parcial, imminent
  });
});

describe("reclamacion helpers", () => {
  const sit = (estado: string, n: number | null, ex: Expected = UNKNOWN, extra: Record<string, unknown> = {}) =>
    situacionRegistro({ estado, num_viajeros: n, fecha_checkin: day(2), ...extra }, { expected: ex });

  it("isReclamable only for No generado / Sin registros / Parcial", () => {
    assert.equal(isReclamable(sit("sin_registro", null)), true);
    assert.equal(isReclamable(sit("iniciado", null)), true);
    assert.equal(isReclamable(sit("borrador", 0, exact(2))), true);
    assert.equal(isReclamable(sit("borrador", 1, exact(2))), true); // parcial
    assert.equal(isReclamable(sit("borrador", 2, exact(2))), false); // completado
    assert.equal(isReclamable(sit("borrador", 1, exact(3), { registro_confirmado: true })), false);
    assert.equal(isReclamable(sit("borrador", 2, UNKNOWN)), false); // en curso
    assert.equal(isReclamable(sit("finalizado", 2, exact(2))), false);
    assert.equal(isReclamable(sit("anulado", null)), false);
    assert.equal(isReclamable(sit("error", null)), false);
    assert.equal(isReclamable(sit("manual", null)), false);
  });
  it("an excluded row is never reclaimable", () => {
    assert.equal(isReclamable(sit("sin_registro", null, UNKNOWN, { excluida: true })), false);
    assert.equal(isReclamable(sit("borrador", 1, exact(2), { excluida: true })), false);
  });
  it("reclamacionTooltip", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    assert.equal(reclamacionTooltip(0, null, now), "Sin reclamaciones");
    assert.equal(
      reclamacionTooltip(2, { enviada_en: "2026-10-28T09:00:00Z", canal: "whatsapp" }, now),
      "Última reclamación: hace 3 h · WhatsApp",
    );
    assert.equal(
      reclamacionTooltip(1, { enviada_en: "2026-10-28T09:00:00Z", canal: null }, now),
      "Última reclamación: hace 3 h",
    );
    assert.equal(reclamacionTooltip(1, { enviada_en: "2026-10-28T09:00:00Z", canal: "raro" }, now), "Última reclamación: hace 3 h · raro");
  });
});

describe("Madrid date-time helpers", () => {
  it("toMadridLocalInput formats an instant in Madrid time", () => {
    assert.equal(toMadridLocalInput(new Date("2026-10-28T10:30:00Z")), "2026-10-28T11:30"); // winter, UTC+1
    assert.equal(toMadridLocalInput(new Date("2026-07-14T10:30:00Z")), "2026-07-14T12:30"); // summer, UTC+2
    assert.equal(toMadridLocalInput(new Date("2026-10-28T23:30:00Z")), "2026-10-29T00:30");
  });
  it("madridLocalToIso converts Madrid wall time to UTC", () => {
    assert.equal(madridLocalToIso("2026-10-28T11:30"), "2026-10-28T10:30:00.000Z");
    assert.equal(madridLocalToIso("2026-07-14T12:30"), "2026-07-14T10:30:00.000Z");
    assert.equal(madridLocalToIso("2026-10-29T00:30"), "2026-10-28T23:30:00.000Z");
    assert.equal(madridLocalToIso("garbage"), null);
  });
  it("round-trips around the DST changes (2026-03-29 and 2026-10-25)", () => {
    for (const iso of ["2026-03-29T00:30:00.000Z", "2026-03-29T01:30:00.000Z", "2026-10-24T23:30:00.000Z", "2026-10-25T01:30:00.000Z"]) {
      assert.equal(madridLocalToIso(toMadridLocalInput(iso)), iso);
    }
  });
  it("fmtMadridDateTime", () => {
    assert.equal(fmtMadridDateTime("2026-10-28T10:30:00Z"), "28/10/26 11:30");
    assert.equal(fmtMadridDateTime("2026-07-14T10:30:00Z"), "14/07/26 12:30");
    assert.equal(fmtMadridDateTime(null), "—");
  });
});

describe("sortRows", () => {
  const mk = (o: Partial<SortableRow> & { numero_reserva: string }): SortableRow => ({
    fecha_checkin: "2026-10-28",
    urgency: 3_000_000,
    unit: "Apt A",
    huesped: "Ana",
    portal: "Airbnb",
    viajeros: 1,
    ultimo_sync: "2026-10-28T08:00:00Z",
    reclamacionCount: null,
    lastReclamacionAt: null,
    ...o,
  });
  const ids = (rows: SortableRow[]) => rows.map((r) => r.numero_reserva);
  const sorted = (rows: SortableRow[], key: SortKey, dir: SortDir) => ids(sortRows(rows, key, dir, (r) => r));

  it("default (entrada asc): date asc, then most urgent first, then unit name", () => {
    const rows = [
      mk({ numero_reserva: "late", fecha_checkin: "2026-10-30" }),
      mk({ numero_reserva: "d2-calm-A", fecha_checkin: "2026-10-28", urgency: 3_000_100, unit: "Apt A" }),
      mk({ numero_reserva: "d2-urgent-Z", fecha_checkin: "2026-10-28", urgency: 0, unit: "Apt Z" }),
      mk({ numero_reserva: "d2-calm-B", fecha_checkin: "2026-10-28", urgency: 3_000_100, unit: "Apt B" }),
      mk({ numero_reserva: "early", fecha_checkin: "2026-10-27" }),
    ];
    assert.deepEqual(DEFAULT_SORT, { key: "entrada", dir: "asc" });
    assert.deepEqual(sorted(rows, DEFAULT_SORT.key, DEFAULT_SORT.dir), ["early", "d2-urgent-Z", "d2-calm-A", "d2-calm-B", "late"]);
  });
  it("entrada desc flips the date only; tie-breakers stay (urgent first)", () => {
    const rows = [
      mk({ numero_reserva: "a", fecha_checkin: "2026-10-27" }),
      mk({ numero_reserva: "b-calm", fecha_checkin: "2026-10-28", urgency: 3_000_000 }),
      mk({ numero_reserva: "b-urgent", fecha_checkin: "2026-10-28", urgency: 5 }),
    ];
    assert.deepEqual(sorted(rows, "entrada", "desc"), ["b-urgent", "b-calm", "a"]);
  });
  it("urgencia: asc = most urgent first, desc reverses", () => {
    const rows = [
      mk({ numero_reserva: "ok", urgency: 3_000_000 }),
      mk({ numero_reserva: "danger", urgency: 20_000 }),
      mk({ numero_reserva: "warning", urgency: 1_020_000 }),
    ];
    assert.deepEqual(sorted(rows, "urgencia", "asc"), ["danger", "warning", "ok"]);
    assert.deepEqual(sorted(rows, "urgencia", "desc"), ["ok", "warning", "danger"]);
  });
  it("apartamento / reserva / huesped / portal: text asc and desc (natural, accent-insensitive)", () => {
    const rows = [
      mk({ numero_reserva: "R10", unit: "Apt 10", huesped: "Álvaro", portal: "Booking" }),
      mk({ numero_reserva: "R2", unit: "Apt 2", huesped: "Beatriz", portal: "Airbnb" }),
      mk({ numero_reserva: "R1", unit: "Apt 1", huesped: "Alba", portal: "Directo" }),
    ];
    assert.deepEqual(sorted(rows, "apartamento", "asc"), ["R1", "R2", "R10"]);
    assert.deepEqual(sorted(rows, "apartamento", "desc"), ["R10", "R2", "R1"]);
    assert.deepEqual(sorted(rows, "reserva", "asc"), ["R1", "R2", "R10"]);
    assert.deepEqual(sorted(rows, "reserva", "desc"), ["R10", "R2", "R1"]);
    assert.deepEqual(sorted(rows, "huesped", "asc"), ["R1", "R10", "R2"]); // Alba, Álvaro, Beatriz
    assert.deepEqual(sorted(rows, "huesped", "desc"), ["R2", "R10", "R1"]);
    assert.deepEqual(sorted(rows, "portal", "asc"), ["R2", "R10", "R1"]); // Airbnb, Booking, Directo
    assert.deepEqual(sorted(rows, "portal", "desc"), ["R1", "R10", "R2"]);
  });
  it("viajeros: numeric, nulls last in both directions", () => {
    const rows = [
      mk({ numero_reserva: "n3", viajeros: 3 }),
      mk({ numero_reserva: "none", viajeros: null }),
      mk({ numero_reserva: "n0", viajeros: 0 }),
      mk({ numero_reserva: "n10", viajeros: 10 }),
    ];
    assert.deepEqual(sorted(rows, "viajeros", "asc"), ["n0", "n3", "n10", "none"]);
    assert.deepEqual(sorted(rows, "viajeros", "desc"), ["n10", "n3", "n0", "none"]);
  });
  it("sync: by time, nulls last", () => {
    const rows = [
      mk({ numero_reserva: "new", ultimo_sync: "2026-10-28T14:00:00Z" }),
      mk({ numero_reserva: "never", ultimo_sync: null }),
      mk({ numero_reserva: "old", ultimo_sync: "2026-10-27T05:00:00Z" }),
    ];
    assert.deepEqual(sorted(rows, "sync", "asc"), ["old", "new", "never"]);
    assert.deepEqual(sorted(rows, "sync", "desc"), ["new", "old", "never"]);
  });
  it("reclamacion: by count, then by last date; rows without the badge (null) go last in both directions", () => {
    const rows = [
      mk({ numero_reserva: "na", reclamacionCount: null }),
      mk({ numero_reserva: "c2", reclamacionCount: 2, lastReclamacionAt: "2026-10-28T09:00:00Z" }),
      mk({ numero_reserva: "c0", reclamacionCount: 0 }),
      mk({ numero_reserva: "c1-new", reclamacionCount: 1, lastReclamacionAt: "2026-10-28T08:00:00Z" }),
      mk({ numero_reserva: "c1-old", reclamacionCount: 1, lastReclamacionAt: "2026-10-26T08:00:00Z" }),
    ];
    assert.deepEqual(sorted(rows, "reclamacion", "asc"), ["c0", "c1-old", "c1-new", "c2", "na"]);
    assert.deepEqual(sorted(rows, "reclamacion", "desc"), ["c2", "c1-new", "c1-old", "c0", "na"]);
  });
  it("empty text values (null or empty string) go last", () => {
    const rows = [
      mk({ numero_reserva: "empty", huesped: "" }),
      mk({ numero_reserva: "Z", huesped: "Zoe" }),
      mk({ numero_reserva: "nul", huesped: null }),
      mk({ numero_reserva: "A", huesped: "Ana" }),
    ];
    assert.deepEqual(sorted(rows, "huesped", "asc").slice(0, 2), ["A", "Z"]);
    assert.deepEqual(sorted(rows, "huesped", "desc").slice(0, 2), ["Z", "A"]);
  });
  it("ties on the key fall back to date, urgency, unit and reservation number", () => {
    const rows = [
      mk({ numero_reserva: "b", portal: "Airbnb", fecha_checkin: "2026-10-29" }),
      mk({ numero_reserva: "a", portal: "Airbnb", fecha_checkin: "2026-10-28", unit: "Apt B" }),
      mk({ numero_reserva: "c", portal: "Airbnb", fecha_checkin: "2026-10-28", unit: "Apt A" }),
    ];
    assert.deepEqual(sorted(rows, "portal", "asc"), ["c", "a", "b"]);
    assert.deepEqual(sorted(rows, "portal", "desc"), ["c", "a", "b"]); // tie-breakers are not flipped
  });
  it("is stable and does not mutate the input", () => {
    const same = (n: string) => mk({ numero_reserva: "X", unit: n });
    const input = [same("1"), same("2"), same("3"), same("4")];
    const before = input.map((r) => r.unit);
    const out = sortRows(input, "reserva", "asc", (r) => ({ ...r, unit: null, fecha_checkin: "2026-10-28", urgency: 0 }));
    assert.deepEqual(out.map((r) => r.unit), ["1", "2", "3", "4"]); // identical keys keep input order
    assert.deepEqual(input.map((r) => r.unit), before);
  });
});

describe("reservas excluidas (No requiere registro)", () => {
  const ex = (estado: string, d: number, n: number | null, e: Expected = UNKNOWN) =>
    alertLevel({ estado, num_viajeros: n, fecha_checkin: day(d), excluida: true }, { today: TODAY, expected: e });
  const tn = (estado: string, d: number, n: number | null, e: Expected = UNKNOWN) =>
    viajerosTone({ estado, num_viajeros: n, fecha_checkin: day(d), excluida: true }, { today: TODAY }, e);

  it("is info / excluida / 'No requiere registro' and beats every other rule", () => {
    const cases: Array<[string, number, number | null]> = [
      ["borrador", -3, 1], // overdue
      ["sin_registro", 0, null], // entry today without registration
      ["sin_registro", 2, null],
      ["iniciado", 1, null],
      ["borrador", 0, 1],
      ["finalizado", -1, 2],
      ["error", 2, null],
      ["anulado", 2, null],
    ];
    for (const [estado, d, n] of cases) {
      const r = ex(estado, d, n, exact(2));
      assert.deepEqual([r.level, r.code, r.label], ["info", "excluida", "No requiere registro"]);
    }
  });
  it("beats a manual confirmation too", () => {
    const r = alertLevel(
      { estado: "borrador", num_viajeros: 1, fecha_checkin: day(2), registro_confirmado: true, excluida: true },
      { today: TODAY, expected: exact(3) },
    );
    assert.equal(r.code, "excluida");
  });
  it("tone is muted whatever the state", () => {
    assert.equal(tn("borrador", -2, 0, exact(2)), "muted");
    assert.equal(tn("finalizado", 0, 2, exact(2)), "muted");
    assert.equal(tn("sin_registro", 0, null), "muted");
  });
  it("not excluded (or excluida false/null) keeps the normal rules", () => {
    const base = { estado: "borrador", num_viajeros: 0, fecha_checkin: day(0) };
    assert.equal(alertLevel({ ...base, excluida: false }, { today: TODAY, expected: UNKNOWN }).code, "hoy_sin_registro");
    assert.equal(alertLevel({ ...base, excluida: null }, { today: TODAY, expected: UNKNOWN }).code, "hoy_sin_registro");
    assert.equal(viajerosTone({ ...base, excluida: false }, { today: TODAY }, exact(2)), "pendiente_fuerte");
  });
  it("motivo labels", () => {
    assert.deepEqual([...MOTIVOS_EXCLUSION], ["extension", "reserva_privada", "otros"]);
    assert.equal(MOTIVO_EXCLUSION_LABEL.extension, "Extensión");
    assert.equal(MOTIVO_EXCLUSION_LABEL.reserva_privada, "Reserva privada");
    assert.equal(MOTIVO_EXCLUSION_LABEL.otros, "Otros");
  });
});

describe("situacionRegistro (one visible label)", () => {
  const sit = (estado: string, n: number | null, ex: Expected = UNKNOWN, extra: Record<string, unknown> = {}) =>
    situacionRegistro({ estado, num_viajeros: n, fecha_checkin: day(2), ...extra }, { expected: ex });
  const pair = (r: { code: string; label: string }) => [r.code, r.label];

  it("excluded beats everything", () => {
    for (const estado of ["sin_registro", "iniciado", "borrador", "finalizado", "anulado", "error", "manual"]) {
      assert.deepEqual(pair(sit(estado, 2, exact(2), { excluida: true, registro_confirmado: true })), ["excluida", "Excluida"]);
    }
  });
  it("anulado / error / manual / finalizado", () => {
    assert.deepEqual(pair(sit("anulado", 2)), ["anulado", "Anulado"]);
    assert.deepEqual(pair(sit("error", null)), ["error", "Error de sincronización"]);
    assert.deepEqual(pair(sit("manual", null)), ["manual", "Marcado a mano"]);
    assert.deepEqual(pair(sit("finalizado", 3, exact(3))), ["finalizado", "Finalizado"]);
    assert.deepEqual(pair(sit("finalizado", 0, exact(3))), ["finalizado", "Finalizado"]);
  });
  it("sin_registro -> No generado", () => {
    assert.deepEqual(pair(sit("sin_registro", null)), ["no_generado", "No generado"]);
  });
  describe("sin_registro with a generated link (checkin_url_generado)", () => {
    const URL = "https://m.partee.es/u1";
    it("sin_registro + generated URL -> Sin registros", () => {
      assert.deepEqual(pair(sit("sin_registro", null, UNKNOWN, { checkin_url_generado: URL })), [
        "generado_sin_registros",
        "Sin registros",
      ]);
    });
    it("without a generated URL it stays No generado (null, empty string, undefined)", () => {
      for (const v of [null, "", undefined]) {
        assert.equal(sit("sin_registro", null, UNKNOWN, { checkin_url_generado: v }).code, "no_generado");
      }
    });
    it("excluded stays Excluida", () => {
      assert.deepEqual(pair(sit("sin_registro", null, UNKNOWN, { excluida: true, checkin_url_generado: URL })), [
        "excluida",
        "Excluida",
      ]);
    });
    it("other estados are unaffected by a generated URL", () => {
      for (const [estado, n, code] of [
        ["iniciado", null, "generado_sin_registros"],
        ["borrador", 1, "en_curso"],
        ["finalizado", 2, "finalizado"],
        ["anulado", null, "anulado"],
        ["error", null, "error"],
        ["manual", null, "manual"],
      ] as const) {
        assert.equal(sit(estado, n, UNKNOWN, { checkin_url_generado: URL }).code, code);
      }
    });
    it("counts as Incompleto, stays pending / reclaimable, and loses the violet colour", () => {
      const s = sit("sin_registro", null, UNKNOWN, { checkin_url_generado: URL });
      assert.equal(isIncompleto(s), true);
      assert.equal(isReclamable(s), true);
      const row = { estado: "sin_registro", num_viajeros: null, fecha_checkin: day(2), checkin_url_generado: URL };
      assert.equal(situacionTone(s, row, { today: TODAY }), "pendiente_fuerte");
      assert.equal(situacionTone(s, { ...row, fecha_checkin: day(10) }, { today: TODAY }), "pendiente_suave");
      assert.equal(situacionTone(sit("sin_registro", null), { ...row, checkin_url_generado: null }, { today: TODAY }), "no_generado_fuerte");
    });
    it("Urgentes does not change: pending either way (imminent entry => urgent)", () => {
      const ctx = { today: TODAY, expected: UNKNOWN };
      for (const d of [-1, 0, 1]) {
        for (const gen of [null, URL]) {
          assert.equal(
            isUrgente({ estado: "sin_registro", num_viajeros: null, fecha_checkin: day(d), checkin_url_generado: gen }, ctx),
            true,
          );
        }
      }
      for (const gen of [null, URL]) {
        assert.equal(
          isUrgente({ estado: "sin_registro", num_viajeros: null, fecha_checkin: day(5), checkin_url_generado: gen }, ctx),
          false,
        );
      }
    });
    it("the tooltip mentions the generated link", () => {
      assert.equal(
        situacionTooltip({ estado: "sin_registro", num_viajeros: null, fecha_checkin: day(2), checkin_url_generado: URL }, UNKNOWN),
        "Estado en Partee: sin_registro. Enlace generado, el huésped aún no se ha registrado.",
      );
    });
  });
  it("iniciado, and borrador with 0 viajeros -> Sin registros", () => {
    assert.deepEqual(pair(sit("iniciado", null)), ["generado_sin_registros", "Sin registros"]);
    assert.deepEqual(pair(sit("borrador", 0, exact(2))), ["generado_sin_registros", "Sin registros"]);
    assert.deepEqual(pair(sit("borrador", null, exact(2))), ["generado_sin_registros", "Sin registros"]);
    // even if somebody confirmed it by hand, with no viajeros nothing was registered
    assert.equal(sit("borrador", 0, exact(2), { registro_confirmado: true }).code, "generado_sin_registros");
  });
  it("borrador with viajeros: manual confirmation -> Completado, even if fewer than expected", () => {
    assert.deepEqual(pair(sit("borrador", 1, exact(3), { registro_confirmado: true })), ["completado", "Completado"]);
    assert.equal(sit("borrador", 1, UNKNOWN, { registro_confirmado: true }).code, "completado");
  });
  it("borrador with viajeros: n >= expected -> Completado (also n > expected)", () => {
    assert.deepEqual(pair(sit("borrador", 3, exact(3))), ["completado", "Completado"]);
    assert.deepEqual(pair(sit("borrador", 4, exact(3))), ["completado", "Completado"]);
    assert.deepEqual(pair(sit("borrador", 5, approx(4))), ["completado", "Completado"]);
  });
  it("borrador with viajeros: n < expected -> Parcial (Faltan registros)", () => {
    assert.deepEqual(pair(sit("borrador", 1, exact(2))), ["parcial", "Parcial (Faltan registros)"]);
    assert.deepEqual(pair(sit("borrador", 1, approx(6))), ["parcial", "Parcial (Faltan registros)"]);
  });
  it("borrador with viajeros and unknown expected (multi-unit) -> En curso", () => {
    assert.deepEqual(pair(sit("borrador", 2, UNKNOWN)), ["en_curso", "En curso"]);
  });
  it("unknown estado falls back to its raw label", () => {
    assert.deepEqual(pair(sit("algo_nuevo", 1)), ["otro", "algo_nuevo"]);
  });
  it("no situation label contains 'Borrador'", () => {
    const combos: Array<[string, number | null, Expected, Record<string, unknown>]> = [];
    for (const estado of ["sin_registro", "iniciado", "borrador", "finalizado", "anulado", "error", "manual"]) {
      for (const n of [null, 0, 1, 3]) {
        for (const ex of [UNKNOWN, exact(2), approx(2)]) {
          for (const extra of [{}, { registro_confirmado: true }, { excluida: true }]) combos.push([estado, n, ex, extra]);
        }
      }
    }
    for (const [estado, n, ex, extra] of combos) {
      assert.ok(!/borrador/i.test(sit(estado, n, ex, extra).label), `${estado}/${n}`);
    }
    for (const label of Object.values(SITUACION_LABEL)) assert.ok(!/borrador/i.test(label));
    for (const o of SITUACIONES_FILTRO) assert.ok(!/borrador/i.test(o.label));
  });
  it("no visible label says 'Generado sin registros' any more (the internal code is unchanged)", () => {
    for (const label of Object.values(SITUACION_LABEL)) assert.ok(!/generado sin registros/i.test(label), label);
    for (const o of SITUACIONES_FILTRO) assert.ok(!/generado sin registros/i.test(o.label), o.label);
    assert.equal(SITUACION_LABEL.generado_sin_registros, "Sin registros");
    assert.equal(SITUACIONES_FILTRO.find((o) => o.code === "generado_sin_registros")?.label, "Sin registros");
    for (const estado of ["sin_registro", "iniciado", "borrador", "finalizado", "anulado", "error", "manual"]) {
      for (const n of [null, 0, 1, 3]) {
        for (const ex of [UNKNOWN, exact(2), approx(2)]) assert.ok(!/generado sin registros/i.test(sit(estado, n, ex).label));
      }
    }
  });
  it("the filter options cover every situation code except excluida and otro", () => {
    const codes = SITUACIONES_FILTRO.map((o) => o.code).sort();
    const all = (Object.keys(SITUACION_LABEL) as string[]).filter((c) => c !== "excluida").sort();
    assert.deepEqual(codes, all);
  });
  it("alertLevel is untouched by the new label (same level/code as before)", () => {
    const a1 = alertLevel({ estado: "borrador", num_viajeros: 1, fecha_checkin: day(2) }, { today: TODAY, expected: exact(3) });
    assert.deepEqual([a1.level, a1.code, a1.label], ["info", "faltan_viajeros", "Faltan viajeros por registrar (1 de 3)"]);
    const a2 = alertLevel({ estado: "borrador", num_viajeros: 0, fecha_checkin: day(-1) }, { today: TODAY, expected: UNKNOWN });
    assert.deepEqual([a2.level, a2.code, a2.label], ["danger", "vencido", "Parte vencido sin finalizar"]);
  });
});

describe("situacionTooltip", () => {
  it("shows the raw Partee estado and the viajeros when known", () => {
    assert.equal(
      situacionTooltip({ estado: "borrador", num_viajeros: 1, fecha_checkin: day(2) }, exact(2)),
      "Estado en Partee: borrador. 1 viajero registrado de 2 previstos.",
    );
    assert.equal(
      situacionTooltip({ estado: "borrador", num_viajeros: 2, fecha_checkin: day(2) }, UNKNOWN),
      "Estado en Partee: borrador. 2 viajeros registrados.",
    );
    assert.equal(
      situacionTooltip({ estado: "sin_registro", num_viajeros: null, fecha_checkin: day(2) }, exact(2)),
      "Estado en Partee: sin_registro.",
    );
  });
  it("singular for 1 viajero and for 1 previsto, plural otherwise", () => {
    const row = (n: number | null) => ({ estado: "borrador", num_viajeros: n, fecha_checkin: day(2) });
    assert.equal(situacionTooltip(row(1), UNKNOWN), "Estado en Partee: borrador. 1 viajero registrado.");
    assert.equal(situacionTooltip(row(1), exact(1)), "Estado en Partee: borrador. 1 viajero registrado de 1 previsto.");
    assert.equal(situacionTooltip(row(2), exact(1)), "Estado en Partee: borrador. 2 viajeros registrados de 1 previsto.");
    assert.equal(situacionTooltip(row(0), exact(3)), "Estado en Partee: borrador. 0 viajeros registrados de 3 previstos.");
  });
});

describe("situacionTone (one fixed colour per situation)", () => {
  const tone = (estado: string, d: number, n: number | null, ex: Expected, extra: Record<string, unknown> = {}) => {
    const row = { estado, num_viajeros: n, fecha_checkin: day(d), ...extra };
    return situacionTone(situacionRegistro(row, { expected: ex }), row, { today: TODAY });
  };

  it("completado and finalizado are ok (green) whatever the date", () => {
    for (const d of [-3, 0, 2, 10]) {
      assert.equal(tone("borrador", d, 2, exact(2)), "ok");
      assert.equal(tone("borrador", d, 1, exact(3), { registro_confirmado: true }), "ok");
      assert.equal(tone("finalizado", d, 2, exact(2)), "ok");
    }
  });
  it("completado is green regardless of the alert level (also when the alert is overdue)", () => {
    const row = { estado: "borrador", num_viajeros: 2, fecha_checkin: day(-1) };
    const a = alertLevel(row, { today: TODAY, expected: exact(2) });
    assert.deepEqual([a.code, a.level], ["vencido", "danger"]);
    assert.equal(situacionTone(situacionRegistro(row, { expected: exact(2) }), row, { today: TODAY }), "ok");
    const row2 = { estado: "borrador", num_viajeros: 2, fecha_checkin: day(0) };
    assert.equal(alertLevel(row2, { today: TODAY, expected: exact(2) }).level, "info");
    assert.equal(situacionTone(situacionRegistro(row2, { expected: exact(2) }), row2, { today: TODAY }), "ok");
  });
  it("Sin registros and Parcial: orange, strong when imminent (d <= 3, overdue included), soft otherwise", () => {
    const cases: Array<[string, number | null, Expected]> = [
      ["iniciado", null, UNKNOWN], // Sin registros
      ["borrador", 0, exact(2)], // Sin registros
      ["borrador", 1, exact(2)], // Parcial
    ];
    for (const [estado, n, ex] of cases) {
      for (const d of [-2, 0, 3]) assert.equal(tone(estado, d, n, ex), "pendiente_fuerte", `${estado} d=${d}`);
      for (const d of [4, 10]) assert.equal(tone(estado, d, n, ex), "pendiente_suave", `${estado} d=${d}`);
    }
  });
  it("No generado has its own hue (violet): strong when imminent (d <= 3, overdue included), soft otherwise", () => {
    for (const d of [-2, 0, 3]) assert.equal(tone("sin_registro", d, null, UNKNOWN), "no_generado_fuerte", `d=${d}`);
    for (const d of [4, 10]) assert.equal(tone("sin_registro", d, null, UNKNOWN), "no_generado_suave", `d=${d}`);
    // a violet tone is never used by another situation
    for (const [estado, n] of [["iniciado", null], ["borrador", 0], ["borrador", 1], ["borrador", 3], ["finalizado", 3]] as const) {
      for (const d of [-2, 0, 3, 4, 10]) assert.ok(!tone(estado, d, n, exact(3)).startsWith("no_generado"), `${estado} d=${d}`);
    }
  });
  it("same label, same colour: Parcial 2 days out has the strong tone whatever its alert level (info)", () => {
    const row = { estado: "borrador", num_viajeros: 1, fecha_checkin: day(2) };
    assert.equal(alertLevel(row, { today: TODAY, expected: exact(2) }).level, "info");
    assert.equal(situacionTone(situacionRegistro(row, { expected: exact(2) }), row, { today: TODAY }), "pendiente_fuerte");
    const far = { ...row, fecha_checkin: day(6) };
    assert.equal(situacionTone(situacionRegistro(far, { expected: exact(2) }), far, { today: TODAY }), "pendiente_suave");
  });
  it("viajerosTone of a No generado row follows its pill: same violet pair", () => {
    const vt = (d: number) =>
      viajerosTone({ estado: "sin_registro", num_viajeros: null, fecha_checkin: day(d) }, { today: TODAY }, exact(2));
    for (const d of [-2, 0, 3]) assert.equal(vt(d), "no_generado_fuerte");
    for (const d of [4, 10]) assert.equal(vt(d), "no_generado_suave");
    // Sin registros / Parcial keep the orange pair
    assert.equal(viajerosTone({ estado: "iniciado", num_viajeros: null, fecha_checkin: day(0) }, { today: TODAY }, exact(2)), "pendiente_fuerte");
    assert.equal(viajerosTone({ estado: "borrador", num_viajeros: 1, fecha_checkin: day(6) }, { today: TODAY }, exact(3)), "pendiente_suave");
  });
  it("en_curso, anulado, manual, excluida and unknown are neutro", () => {
    assert.equal(tone("borrador", 2, 2, UNKNOWN), "neutro"); // en curso
    assert.equal(tone("anulado", 2, null, UNKNOWN), "neutro");
    assert.equal(tone("manual", 2, null, UNKNOWN), "neutro");
    assert.equal(tone("sin_registro", 0, null, UNKNOWN, { excluida: true }), "neutro");
    assert.equal(tone("algo_nuevo", 0, 1, UNKNOWN), "neutro");
  });
  it("error is error (red)", () => {
    assert.equal(tone("error", 2, null, UNKNOWN), "error");
    assert.equal(tone("error", -3, null, UNKNOWN), "error");
  });
});

describe("puedeGenerarEnlace", () => {
  const sit = (extra: Record<string, unknown> = {}) =>
    situacionRegistro({ estado: "sin_registro", num_viajeros: null, fecha_checkin: day(2), ...extra }, { expected: UNKNOWN });
  const can = (d: number, unitCount = 1, extra: Record<string, unknown> = {}) => {
    const row = { estado: "sin_registro", num_viajeros: null, fecha_checkin: day(d), ...extra };
    return puedeGenerarEnlace(row, { today: TODAY, unitCount, situacion: situacionRegistro(row, { expected: UNKNOWN }) });
  };
  it("No generado, single unit, check-in today or later", () => {
    assert.equal(can(0), true);
    assert.equal(can(5), true);
    assert.equal(sit().code, "no_generado");
  });
  it("not for past check-ins, multi-unit, excluded, or rows that already have a link", () => {
    assert.equal(can(-1), false);
    assert.equal(can(2, 2), false);
    assert.equal(can(2, 1, { excluida: true }), false);
    assert.equal(can(2, 1, { checkin_url: "https://m.partee.es/u1" }), false);
    assert.equal(can(2, 1, { checkin_url_generado: "https://m.partee.es/u1" }), false);
  });
  it("not for other situations", () => {
    for (const estado of ["iniciado", "borrador", "finalizado", "anulado", "error", "manual"]) {
      assert.equal(can(2, 1, { estado, num_viajeros: 1 }), false);
    }
  });
});
