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
  isStaleRegistre,
  todayMadrid,
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

describe("viajerosTone", () => {
  const t = (estado: string, d: number, n: number | null, ex: Expected) =>
    viajerosTone({ estado, num_viajeros: n, fecha_checkin: day(d) }, { today: TODAY }, ex);

  it("finalizado is ok whatever the numbers", () => {
    assert.equal(t("finalizado", -3, 0, exact(4)), "ok");
    assert.equal(t("finalizado", 5, null, UNKNOWN), "ok");
  });
  it("n >= expected is ok, even on entry day", () => {
    assert.equal(t("borrador", 0, 2, exact(2)), "ok");
    assert.equal(t("borrador", 0, 3, approx(2)), "ok");
    assert.equal(t("borrador", 2, 2, exact(2)), "ok");
  });
  it("anulado / manual are muted", () => {
    assert.equal(t("anulado", 0, 0, exact(2)), "muted");
    assert.equal(t("manual", -1, 1, exact(2)), "muted");
  });
  it("overdue (not finalizado/anulado) is danger", () => {
    assert.equal(t("borrador", -1, 1, exact(3)), "danger");
    assert.equal(t("sin_registro", -2, null, exact(3)), "danger");
  });
  it("entry day: n = 0 danger, partial warning, unknown expected with n > 0 ok", () => {
    assert.equal(t("borrador", 0, 0, exact(2)), "danger");
    assert.equal(t("sin_registro", 0, null, UNKNOWN), "danger");
    assert.equal(t("borrador", 0, 1, exact(2)), "warning");
    assert.equal(t("borrador", 0, 1, approx(3)), "warning");
    assert.equal(t("borrador", 0, 2, UNKNOWN), "ok");
  });
  it("1..3 days out: n = 0 warning, partial muted", () => {
    assert.equal(t("borrador", 2, 0, exact(2)), "warning");
    assert.equal(t("iniciado", 1, null, exact(2)), "warning");
    assert.equal(t("borrador", 3, 0, UNKNOWN), "warning");
    assert.equal(t("borrador", 2, 1, exact(3)), "muted");
  });
  it("4+ days out is muted", () => {
    assert.equal(t("borrador", 4, 0, exact(2)), "muted");
    assert.equal(t("borrador", 6, 1, exact(3)), "muted");
    assert.equal(t("sin_registro", 6, null, UNKNOWN), "muted");
  });
  it("multi-unit (expected unknown) in the days ahead with viajeros is muted", () => {
    assert.equal(t("borrador", 2, 2, UNKNOWN), "muted");
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
