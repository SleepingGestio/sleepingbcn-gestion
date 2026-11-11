import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnv } from "@/lib/cloudflare-env.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ADJUNTO_TOO_LARGE_PREFIX, adjuntoSizeError } from "@/lib/adjuntos-limits";

export const uploadAdjunto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((formData: unknown) => formData as FormData)
  .handler(async ({ data, context }) => {
    const file = data.get("file");
    const idIncidencia = data.get("id_incidencia");
    const tipo = data.get("tipo");
    if (!(file instanceof File) || typeof idIncidencia !== "string") {
      throw new Error("Missing file or id_incidencia");
    }
    if (!/^[1-9][0-9]{0,9}$/.test(idIncidencia)) {
      throw new Error("Invalid id_incidencia");
    }
    const sizeError = adjuntoSizeError(typeof tipo === "string" ? tipo : null, file);
    if (sizeError) {
      throw new Error(`${ADJUNTO_TOO_LARGE_PREFIX} ${sizeError}`);
    }
    // The incidencia must exist (and be visible to this user under RLS).
    const { data: inc, error: incError } = await context.supabase
      .from("manteniment_incidencies")
      .select("id_incidencia")
      .eq("id_incidencia", Number(idIncidencia))
      .maybeSingle();
    if (incError || !inc) {
      throw new Error("Incidencia no encontrada");
    }
    const env = getCloudflareEnv();
    const rawExt = file.name.includes(".") ? (file.name.split(".").pop() ?? "") : "";
    const ext = /^[A-Za-z0-9]{1,8}$/.test(rawExt) ? rawExt : "";
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
