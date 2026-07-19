import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnv } from "@/lib/cloudflare-env.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const uploadAdjunto = createServerFn({ method: "POST" })
  .inputValidator((formData: unknown) => formData as FormData)
  .handler(async ({ data }) => {
    const file = data.get("file");
    const idIncidencia = data.get("id_incidencia");
    if (!(file instanceof File) || typeof idIncidencia !== "string") {
      throw new Error("Missing file or id_incidencia");
    }
    const env = getCloudflareEnv();
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
    const key = `manteniment/${idIncidencia}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
    await env.MANTENIMIENTO_BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    return { key, nombreOriginal: file.name };
  });

export const getAdjunto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ key: z.string().min(1) }))
  .handler(async ({ data }) => {
    const env = getCloudflareEnv();
    const object = await env.MANTENIMIENTO_BUCKET.get(data.key);
    if (!object) {
      throw new Error("Adjunto no encontrado");
    }
    const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";
    const arrayBuffer = await object.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return { dataUrl: `data:${contentType};base64,${base64}`, contentType };
  });
