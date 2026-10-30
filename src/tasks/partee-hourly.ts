import process from "node:process";
import { defineTask } from "nitro/task";

import { GITHUB_REPO, githubHeaders } from "../lib/github-actions.server";
import {
  buildHourlyDispatchBody,
  decidirCron,
  parseRuns,
  PARTEE_SYNC_WORKFLOW,
  type DecisionCron,
} from "../lib/partee-sync-trigger";

// Hourly Partee sync: fired by the Cron Trigger registered in vite.config.ts (scheduledTasks). Dispatches the LIGHT
// job of partee-sync.yml (mode = hourly) with the Worker's GITHUB_TOKEN, unless a run is already queued/in progress.
//
// - Off unless the Worker secret PARTEE_CRON_ENABLED is "1" (real run) or "dry" (dispatch with dry = true). DEV does
//   not have it, so there the task exits before any network call. Outside 08:00-20:59 Madrid it also exits first.
// - Env comes from the cron event (a scheduled run has no request, so getCloudflareEnv() cannot be used), with
//   process.env as a fallback.
// - One log line per invocation (outcome code, plus the HTTP status on errors); never the token or GitHub bodies.
//   No retries: the next hour tries again. The task never throws.

const API = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${PARTEE_SYNC_WORKFLOW}`;
const USER_AGENT = "sleepingbcn-gestion-cron";

interface CronEnv {
  GITHUB_TOKEN?: string;
  PARTEE_CRON_ENABLED?: string;
}

type Outcome = DecisionCron | "dispatched_real" | "dispatched_dry" | "missing_token" | "github_error" | "unexpected";

function leerEnv(context: unknown): CronEnv {
  const cf = (context as { cloudflare?: { env?: CronEnv } } | undefined)?.cloudflare?.env;
  return {
    GITHUB_TOKEN: cf?.GITHUB_TOKEN || process.env.GITHUB_TOKEN,
    PARTEE_CRON_ENABLED: cf?.PARTEE_CRON_ENABLED ?? process.env.PARTEE_CRON_ENABLED,
  };
}

async function ejecutar(env: CronEnv, date: Date): Promise<{ outcome: Outcome; status?: number }> {
  // Phase 1, no network: disabled and Madrid hour (no runs known yet).
  const previa = decidirCron({ enabled: env.PARTEE_CRON_ENABLED, date, runs: [] });
  if (previa === "skip_disabled" || previa === "skip_hora") return { outcome: previa };

  const token = env.GITHUB_TOKEN;
  if (!token) return { outcome: "missing_token" };
  const headers = { ...githubHeaders(token), "User-Agent": USER_AGENT };

  // Phase 2: never stack runs.
  const list = await fetch(`${API}/runs?per_page=10`, { headers });
  if (!list.ok) return { outcome: "github_error", status: list.status };
  const decision = decidirCron({ enabled: env.PARTEE_CRON_ENABLED, date, runs: parseRuns(await list.json()) });
  if (decision !== "lanzar_real" && decision !== "lanzar_dry") return { outcome: decision };

  const dry = decision === "lanzar_dry";
  const resp = await fetch(`${API}/dispatches`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(buildHourlyDispatchBody(dry)),
  });
  if (resp.status !== 204) return { outcome: "github_error", status: resp.status };
  return { outcome: dry ? "dispatched_dry" : "dispatched_real" };
}

export default defineTask({
  meta: { name: "partee:hourly", description: "Hourly Partee sync dispatch (light job)" },
  async run({ context }) {
    let result: { outcome: Outcome; status?: number };
    try {
      result = await ejecutar(leerEnv(context), new Date());
    } catch (e) {
      result = { outcome: "unexpected" };
      console.error("[partee-cron]", e instanceof Error ? e.name : "unknown");
    }
    console.log(`[partee-cron] outcome=${result.outcome}${result.status ? ` status=${result.status}` : ""}`);
    return { result: result.outcome };
  },
});
