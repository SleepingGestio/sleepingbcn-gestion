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
  todayMadrid,
  viajerosText,
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
  it("borrador with fewer than expected, not exact: warning + children suffix", () => {
    const r = a("borrador", 0, 2, approx(4));
    assert.deepEqual([r.level, r.label], ["warning", "Posible registro incompleto (2 de 4) — puede incluir niños"]);
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
  it("more than expected but not exact: counts as complete (+ suffix)", () => {
    const r = a("borrador", 2, 5, approx(4));
    assert.deepEqual([r.level, r.label], ["ok", "Completo, pendiente de finalizar — puede incluir niños"]);
  });
  it("fewer than expected at d = 2: info, never warning", () => {
    const r = a("borrador", 2, 1, exact(3));
    assert.deepEqual([r.level, r.code, r.label], ["info", "faltan_viajeros", "Faltan viajeros por registrar (1 de 3)"]);
    const r2 = a("borrador", 2, 1, approx(3));
    assert.deepEqual([r2.level, r2.label], ["info", "Faltan viajeros por registrar (1 de 3) — puede incluir niños"]);
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

describe("viajerosText", () => {
  it("formats with the asterisk rule", () => {
    assert.equal(viajerosText(3, exact(4)), "3 registrados · 4 previstos");
    assert.equal(viajerosText(3, approx(4)), "3 registrados · 4 previstos*");
    assert.equal(viajerosText(null, UNKNOWN), "0 registrados");
  });
});
