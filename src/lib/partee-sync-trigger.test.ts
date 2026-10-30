/// <reference types="node" />
// Run with: node --test src/lib/partee-sync-trigger.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDispatchBody,
  buildHourlyDispatchBody,
  decidirCron,
  horaMadridEnRango,
  hasActiveRun,
  isActiveRun,
  parseRuns,
  PARTEE_SYNC_REF,
  PARTEE_SYNC_WORKFLOW,
  syncState,
  type GhRun,
} from "./partee-sync-trigger.ts";

const run = (o: Partial<GhRun> = {}): GhRun => ({
  status: "completed",
  conclusion: "success",
  event: "workflow_dispatch",
  created_at: "2026-10-28T10:00:00Z",
  ...o,
});
const SINCE = Date.parse("2026-10-28T10:00:00Z");

describe("dispatch payload", () => {
  it("is a real run: dry is the STRING 'false', no from/to, on main", () => {
    const b = buildDispatchBody();
    assert.deepEqual(b, { ref: "main", inputs: { dry: "false" } });
    assert.equal(typeof b.inputs.dry, "string");
    assert.ok(!("from" in b.inputs) && !("to" in b.inputs));
    assert.equal(PARTEE_SYNC_REF, "main");
    assert.equal(PARTEE_SYNC_WORKFLOW, "partee-sync.yml");
  });
});

describe("already running detection", () => {
  it("queued / in_progress (and other not-finished statuses) are active", () => {
    for (const status of ["queued", "in_progress", "waiting", "requested", "pending"]) {
      assert.equal(isActiveRun({ status }), true, status);
    }
  });
  it("completed / unknown / null are not active", () => {
    for (const status of ["completed", "something_else", null]) assert.equal(isActiveRun({ status }), false);
  });
  it("any active run among finished ones blocks a new dispatch", () => {
    assert.equal(hasActiveRun([{ status: "completed" }, { status: "completed" }]), false);
    assert.equal(hasActiveRun([{ status: "completed" }, { status: "in_progress" }]), true);
    assert.equal(hasActiveRun([]), false);
  });
});

describe("parseRuns", () => {
  it("keeps only status, conclusion, event and created_at", () => {
    const out = parseRuns({
      workflow_runs: [
        { status: "completed", conclusion: "failure", event: "schedule", created_at: "2026-10-28T05:15:00Z", head_commit: { message: "x" }, actor: { login: "someone" } },
      ],
    });
    assert.deepEqual(out, [{ status: "completed", conclusion: "failure", event: "schedule", created_at: "2026-10-28T05:15:00Z" }]);
  });
  it("tolerates garbage", () => {
    assert.deepEqual(parseRuns(null), []);
    assert.deepEqual(parseRuns({}), []);
    assert.deepEqual(parseRuns({ workflow_runs: "no" }), []);
    assert.deepEqual(parseRuns({ workflow_runs: [null, 5] }), [{ status: null, conclusion: null, event: null, created_at: null }, { status: null, conclusion: null, event: null, created_at: null }]);
  });
});

describe("syncState of the manual run we dispatched", () => {
  it("pending while GitHub does not list a manual run created since the dispatch", () => {
    assert.equal(syncState([], SINCE), "pending");
    assert.equal(syncState([run({ created_at: "2026-10-28T09:00:00Z" })], SINCE), "pending"); // an older run
  });
  it("ignores scheduled runs", () => {
    assert.equal(syncState([run({ event: "schedule", status: "in_progress", conclusion: null })], SINCE), "pending");
  });
  it("running while queued or in progress", () => {
    assert.equal(syncState([run({ status: "queued", conclusion: null })], SINCE), "running");
    assert.equal(syncState([run({ status: "in_progress", conclusion: null })], SINCE), "running");
  });
  it("success / failed when completed", () => {
    assert.equal(syncState([run()], SINCE), "success");
    for (const conclusion of ["failure", "cancelled", "timed_out", null]) {
      assert.equal(syncState([run({ conclusion })], SINCE), "failed", String(conclusion));
    }
  });
  it("a run created a few seconds before 'since' still counts (clock tolerance)", () => {
    assert.equal(syncState([run({ created_at: "2026-10-28T09:59:50Z" })], SINCE), "success");
    assert.equal(syncState([run({ created_at: "2026-10-28T09:59:30Z" })], SINCE), "pending"); // too old
  });
  it("uses the newest matching run", () => {
    const runs = [
      run({ created_at: "2026-10-28T10:00:05Z", status: "in_progress", conclusion: null }),
      run({ created_at: "2026-10-28T10:00:01Z", status: "completed", conclusion: "failure" }),
    ];
    assert.equal(syncState(runs, SINCE), "running");
  });
});

describe("buildHourlyDispatchBody", () => {
  it("light job, real or dry, on main", () => {
    assert.deepEqual(buildHourlyDispatchBody(false), { ref: "main", inputs: { dry: "false", mode: "hourly" } });
    assert.deepEqual(buildHourlyDispatchBody(true), { ref: "main", inputs: { dry: "true", mode: "hourly" } });
  });
  it("the button's body is unchanged: no `mode`", () => {
    assert.deepEqual(buildDispatchBody(), { ref: "main", inputs: { dry: "false" } });
  });
});

describe("horaMadridEnRango", () => {
  const at = (iso: string) => horaMadridEnRango(new Date(iso));
  it("winter (UTC+1): 07:00Z = 08:00 Madrid in, 06:59Z out, 19:59Z = 20:59 in, 20:00Z = 21:00 out", () => {
    assert.equal(at("2026-01-15T06:59:00Z"), false);
    assert.equal(at("2026-01-15T07:00:00Z"), true);
    assert.equal(at("2026-01-15T19:59:00Z"), true);
    assert.equal(at("2026-01-15T20:00:00Z"), false);
  });
  it("summer (UTC+2): 06:00Z = 08:00 Madrid in, 05:59Z out, 18:59Z = 20:59 in, 19:00Z = 21:00 out", () => {
    assert.equal(at("2026-07-15T05:59:00Z"), false);
    assert.equal(at("2026-07-15T06:00:00Z"), true);
    assert.equal(at("2026-07-15T18:59:00Z"), true);
    assert.equal(at("2026-07-15T19:00:00Z"), false);
  });
  it("DST start, 29 March 2026 (then UTC+2)", () => {
    assert.equal(at("2026-03-29T05:59:00Z"), false); // 07:59 Madrid
    assert.equal(at("2026-03-29T06:00:00Z"), true); // 08:00
    assert.equal(at("2026-03-29T18:59:00Z"), true); // 20:59
    assert.equal(at("2026-03-29T19:00:00Z"), false); // 21:00
  });
  it("DST end, 25 October 2026 (then UTC+1)", () => {
    assert.equal(at("2026-10-25T06:59:00Z"), false); // 07:59 Madrid
    assert.equal(at("2026-10-25T07:00:00Z"), true); // 08:00
    assert.equal(at("2026-10-25T19:59:00Z"), true); // 20:59
    assert.equal(at("2026-10-25T20:00:00Z"), false); // 21:00
  });
  it("custom bounds", () => {
    assert.equal(horaMadridEnRango(new Date("2026-01-15T10:00:00Z"), 11, 11), true); // 11:00
    assert.equal(horaMadridEnRango(new Date("2026-01-15T11:00:00Z"), 11, 11), false); // 12:00
  });
});

describe("decidirCron", () => {
  const inHour = new Date("2026-01-15T10:00:00Z"); // 11:00 Madrid
  const outHour = new Date("2026-01-15T22:00:00Z"); // 23:00 Madrid
  const idle = [{ status: "completed" }];
  const busy = [{ status: "completed" }, { status: "in_progress" }];
  it("secret missing or anything but 1 / dry: skip_disabled", () => {
    for (const enabled of [undefined, null, "", "0", "true", "yes", "DRY", " 1"]) {
      assert.equal(decidirCron({ enabled, date: inHour, runs: idle }), "skip_disabled", String(enabled));
    }
  });
  it("1 = real run, dry = dry run", () => {
    assert.equal(decidirCron({ enabled: "1", date: inHour, runs: idle }), "lanzar_real");
    assert.equal(decidirCron({ enabled: "dry", date: inHour, runs: [] }), "lanzar_dry");
  });
  it("outside 08-20 Madrid: skip_hora", () => {
    assert.equal(decidirCron({ enabled: "1", date: outHour, runs: idle }), "skip_hora");
  });
  it("a queued / in-progress run: skip_activo", () => {
    assert.equal(decidirCron({ enabled: "1", date: inHour, runs: busy }), "skip_activo");
    assert.equal(decidirCron({ enabled: "dry", date: inHour, runs: [{ status: "queued" }] }), "skip_activo");
  });
  it("check order: disabled wins over hour; hour wins over active run", () => {
    assert.equal(decidirCron({ enabled: undefined, date: outHour, runs: busy }), "skip_disabled");
    assert.equal(decidirCron({ enabled: "1", date: outHour, runs: busy }), "skip_hora");
  });
});
