import { getRequest } from "@tanstack/react-start/server";
import type { R2Bucket } from "@cloudflare/workers-types";

interface CloudflareEnv {
  MANTENIMIENTO_BUCKET: R2Bucket;
  // Secretos del Worker (`wrangler secret put ...` o el panel de Cloudflare).
  // Opcionales porque en desarrollo local no hay bindings: quien los use debe
  // caer a process.env y fallar con un mensaje claro si tampoco están ahí.
  PCLOUD_TOKEN?: string;
  GITHUB_TOKEN?: string;
}

export function getCloudflareEnv(): CloudflareEnv {
  const request = getRequest();
  const env = (request as unknown as { runtime?: { cloudflare?: { env?: CloudflareEnv } } })
    .runtime?.cloudflare?.env;
  if (!env) {
    throw new Error(
      "Cloudflare env bindings not available on this request (are we running outside a Cloudflare Worker, e.g. local dev?).",
    );
  }
  return env;
}
