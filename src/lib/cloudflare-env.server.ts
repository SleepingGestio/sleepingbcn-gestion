import { getRequest } from "@tanstack/react-start/server";
import type { R2Bucket } from "@cloudflare/workers-types";

interface CloudflareEnv {
  MANTENIMIENTO_BUCKET: R2Bucket;
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
