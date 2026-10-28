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
  fmtMadridDateTime,
  isStaleRegistre,
  MOTIVO_EXCLUSION_LABEL,
  MOTIVOS_EXCLUSION,
  madridLocalToIso,
  reclamacionHint,
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
  it("tone is not ok for confirmed rows that are overdue or have no viajeros", () => {
    assert.equal(tone("borrador", -1, 1, exact(3)), "danger");
    assert.equal(tone("borrador", 0, 0, exact(3)), "danger");
    assert.equal(tone("borrador", 2, 1, exact(3), false), "muted");
  });
});

describe("reclamacionHint", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  it("null for ok / info levels", () => {
    assert.equal(reclamacionHint("ok", null, now), null);
    assert.equal(reclamacionHint("info", "2026-10-28T11:00:00Z", now), null);
  });
  it("Sin reclamar when there is none", () => {
    assert.equal(reclamacionHint("danger", null, now), "Sin reclamar");
    assert.equal(reclamacionHint("warning", undefined, now), "Sin reclamar");
    assert.equal(reclamacionHint("warning", "not a date", now), "Sin reclamar");
  });
  it("Sin reclamar when the last one is older than 24 h", () => {
    assert.equal(reclamacionHint("warning", "2026-10-27T11:00:00Z", now), "Sin reclamar");
    assert.equal(reclamacionHint("danger", "2026-10-27T11:59:00Z", now), "Sin reclamar");
  });
  it("Reclamado hace … within 24 h", () => {
    assert.equal(reclamacionHint("warning", "2026-10-28T09:00:00Z", now), "Reclamado hace 3 h");
    assert.equal(reclamacionHint("danger", "2026-10-28T11:55:00Z", now), "Reclamado hace 5 min");
    assert.equal(reclamacionHint("danger", "2026-10-27T12:00:00Z", now), "Reclamado hace 24 h");
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
  it("reclamacion: by last reclamation date, none last", () => {
    const rows = [
      mk({ numero_reserva: "none", lastReclamacionAt: null }),
      mk({ numero_reserva: "recent", lastReclamacionAt: "2026-10-28T09:00:00Z" }),
      mk({ numero_reserva: "older", lastReclamacionAt: "2026-10-26T09:00:00Z" }),
    ];
    assert.deepEqual(sorted(rows, "reclamacion", "asc"), ["older", "recent", "none"]);
    assert.deepEqual(sorted(rows, "reclamacion", "desc"), ["recent", "older", "none"]);
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
    assert.equal(viajerosTone({ ...base, excluida: false }, { today: TODAY }, exact(2)), "danger");
  });
  it("reclamacionHint is null for an excluded row (its level is info)", () => {
    const lvl = ex("sin_registro", 0, null).level;
    assert.equal(reclamacionHint(lvl, null, new Date("2026-10-28T12:00:00Z")), null);
  });
  it("motivo labels", () => {
    assert.deepEqual([...MOTIVOS_EXCLUSION], ["extension", "reserva_privada", "otros"]);
    assert.equal(MOTIVO_EXCLUSION_LABEL.extension, "Extensión");
    assert.equal(MOTIVO_EXCLUSION_LABEL.reserva_privada, "Reserva privada");
    assert.equal(MOTIVO_EXCLUSION_LABEL.otros, "Otros");
  });
});
