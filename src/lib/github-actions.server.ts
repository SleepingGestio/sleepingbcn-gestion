import process from "node:process";

import { getCloudflareEnv } from "@/lib/cloudflare-env.server";

// Shared by the server functions that talk to the GitHub Actions API with the Worker's GITHUB_TOKEN secret
// (the same one kb-import.functions.ts uses). Server-only: the token never reaches the browser, the logs or
// any message.

export const GITHUB_REPO = "SleepingGestio/sleepingbcn-gestion";

/** GITHUB_TOKEN from the Worker bindings, falling back to process.env (local dev); null when missing. */
export function leerGithubToken(): string | null {
  let valor: string | undefined;
  try {
    valor = getCloudflareEnv().GITHUB_TOKEN;
  } catch {
    // Fuera de un Worker (dev local) no hay bindings; se intenta process.env.
  }
  valor ??= process.env.GITHUB_TOKEN;
  return valor || null;
}

export function githubHeaders(token: string, json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    // GitHub rechaza las peticiones sin User-Agent.
    "User-Agent": "sleepingbcn-gestion",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}
