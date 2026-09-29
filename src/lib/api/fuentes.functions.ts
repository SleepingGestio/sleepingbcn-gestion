import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Botón "Revisar fuentes" de Eventos-plantillas. Una llamada = una URL (el
// cliente hace el bucle), para no acercarse al límite de subrequests del Worker
// y poder mostrar el progreso. Aquí solo se clasifica; el resultado lo escribe
// el cliente en pricing.plantillas_fuentes.

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 500_000;

export type FuenteCheckResultado = "ok" | "roto" | "dudosa";

/** Lowercase and strip accents so "Sitges" / "sítges" / "SITGES" all match. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function htmlATexto(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ");
}

/** First MAX_BYTES of the body, decoded as UTF-8; the rest of the response is never downloaded. */
async function leerCuerpoAcotado(resp: Response): Promise<string> {
  if (!resp.body) return "";
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(total, MAX_BYTES));
  let offset = 0;
  for (const c of chunks) {
    const slice = c.subarray(0, buf.length - offset);
    buf.set(slice, offset);
    offset += slice.length;
    if (offset >= buf.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

export const comprobarFuente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      url: z.string().max(2048),
      nombre: z.string(),
      // Año a buscar en la página; null = no hay edición que contrastar y basta con que responda.
      anio: z.number().int().nullable(),
    }),
  )
  .handler(async ({ data }): Promise<{ resultado: FuenteCheckResultado }> => {
    let url: URL;
    try {
      url = new URL(data.url);
    } catch {
      return { resultado: "roto" };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return { resultado: "roto" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; sleepingbcn-gestion source check)",
        },
      });
      if (resp.status >= 400) return { resultado: "roto" };
      if (data.anio == null) return { resultado: "ok" };

      // The timeout also covers reading the body.
      const texto = normalizar(htmlATexto(await leerCuerpoAcotado(resp)));
      const nombreOk = texto.includes(normalizar(data.nombre.trim()));
      const anioOk = texto.includes(String(data.anio));
      return { resultado: nombreOk && anioOk ? "ok" : "dudosa" };
    } catch {
      // Network error, DNS failure, timeout/abort.
      return { resultado: "roto" };
    } finally {
      clearTimeout(timer);
    }
  });
