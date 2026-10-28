/// <reference types="node" />
// Run with: node --test src/lib/partee-sync-trigger.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDispatchBody,
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
