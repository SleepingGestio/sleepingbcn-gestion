import { createFileRoute } from "@tanstack/react-router";
import type { R2Range } from "@cloudflare/workers-types";
import { getCloudflareEnv } from "@/lib/cloudflare-env.server";
import { verifyBearer } from "@/lib/api/verify-bearer.server";

// GET /api/adjunto?key=manteniment/<idIncidencia>/<uuid>.<ext>
// Streams the R2 object (no base64) to authenticated users only. The client
// fetches it with the Supabase bearer token and builds a blob URL.
// Keys are immutable (random UUID), so a private browser cache is safe.
const KEY_RE = /^manteniment\/[0-9]+\/[^/\s]+$/;

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/adjunto")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const userId = await verifyBearer(request);
        if (!userId) return json(401, "Unauthorized");

        const key = new URL(request.url).searchParams.get("key") ?? "";
        if (!key.startsWith("manteniment/") || key.includes("..") || !KEY_RE.test(key)) {
          return json(400, "Invalid key");
        }

        const env = getCloudflareEnv();
        const hasRange = request.headers.has("range");
        let object;
        try {
          object = hasRange
            ? await env.MANTENIMIENTO_BUCKET.get(key, {
                range: request.headers as unknown as R2Range | undefined,
              })
            : await env.MANTENIMIENTO_BUCKET.get(key);
        } catch {
          // Unsatisfiable / malformed Range header.
          return json(416, "Range not satisfiable");
        }
        if (!object) return json(404, "Adjunto no encontrado");

        const headers = new Headers({
          "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
          "cache-control": "private, max-age=86400",
          "accept-ranges": "bytes",
          "x-content-type-options": "nosniff",
          etag: object.httpEtag,
        });

        let status = 200;
        const r = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
        if (hasRange && r) {
          let start: number;
          let end: number;
          if (r.suffix !== undefined) {
            start = Math.max(0, object.size - r.suffix);
            end = object.size - 1;
          } else {
            start = r.offset ?? 0;
            end = r.length !== undefined ? start + r.length - 1 : object.size - 1;
          }
          status = 206;
          headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
          headers.set("content-length", String(end - start + 1));
        } else {
          headers.set("content-length", String(object.size));
        }
        return new Response(object.body as unknown as ReadableStream, { status, headers });
      },
    },
  },
});
