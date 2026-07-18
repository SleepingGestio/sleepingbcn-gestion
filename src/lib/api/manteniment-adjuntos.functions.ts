import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnv } from "@/lib/cloudflare-env.server";

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
