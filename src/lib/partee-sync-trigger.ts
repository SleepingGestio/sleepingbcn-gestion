// Pure helpers for the "Actualizar todo" button: dispatching .github/workflows/partee-sync.yml and reading
// its runs. No I/O and no aliased imports (tested with `node --test`, see partee-sync-trigger.test.ts).

export const PARTEE_SYNC_WORKFLOW = "partee-sync.yml";
export const PARTEE_SYNC_REF = "main";

/** Body of POST .../dispatches: a REAL run (dry = "false"; workflow inputs always travel as strings). */
export function buildDispatchBody(): { ref: string; inputs: { dry: string } } {
  // No from/to: the workflow's manual default window is yesterday..today+7 (Madrid).
  return { ref: PARTEE_SYNC_REF, inputs: { dry: "false" } };
}

/** The fields of a GitHub workflow run that we read (nothing else is kept). */
export interface GhRun {
  status: string | null;
  conclusion: string | null;
  event: string | null;
  created_at: string | null;
}

/** GitHub run statuses that mean "not finished yet". */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

export const isActiveRun = (r: Pick<GhRun, "status">): boolean => r.status !== null && ACTIVE_STATUSES.has(r.status);

/** True when any run (scheduled or manual) of the workflow is queued or in progress. */
export const hasActiveRun = (runs: Array<Pick<GhRun, "status">>): boolean => runs.some(isActiveRun);

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Extracts the runs from the GET .../runs response; anything unexpected yields []. */
export function parseRuns(json: unknown): GhRun[] {
  const list = (json as { workflow_runs?: unknown } | null)?.workflow_runs;
  if (!Array.isArray(list)) return [];
  return list.map((r) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    return { status: str(o.status), conclusion: str(o.conclusion), event: str(o.event), created_at: str(o.created_at) };
  });
}

export type SyncState = "pending" | "running" | "success" | "failed";

/** A run created this much before `since` still counts (GitHub and our clock can differ a little). */
export const SINCE_TOLERANCE_MS = 15_000;

/**
 * State of the manual run we dispatched at `sinceMs`: the newest workflow_dispatch run created at or after it.
 * "pending" = GitHub does not list it yet (it appears a few seconds after the dispatch).
 */
export function syncState(runs: GhRun[], sinceMs: number): SyncState {
  const mine = runs
    .filter((r) => r.event === "workflow_dispatch" && r.created_at && Date.parse(r.created_at) >= sinceMs - SINCE_TOLERANCE_MS)
    .sort((a, b) => Date.parse(b.created_at as string) - Date.parse(a.created_at as string));
  const run = mine[0];
  if (!run) return "pending";
  if (run.status === "completed") return run.conclusion === "success" ? "success" : "failed";
  return "running";
}
