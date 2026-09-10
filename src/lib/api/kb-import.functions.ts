import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import process from "node:process";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCloudflareEnv } from "@/lib/cloudflare-env.server";

// Botón "Importar reservas KB" de la pantalla de Importaciones.
//
// El circuito completo (ver claude/analisi_alternatives_importacio_kb_2026-09-08.md):
// alguien exporta el .xlsx de Krossbooking a mano y lo deja en la carpeta
// compartida de pCloud; este botón dispara el workflow de GitHub Actions
// "Importar reservas KB", que baja el fichero con rclone, ejecuta el script
// Python y lo mueve a procesados/rechazados. El resultado aparece solo en el
// historial de esta misma pantalla, porque el script escribe en
// kb_importaciones / kb_importaciones_detalle como siempre.
//
// Aquí no se importa nada: solo se mira qué hay pendiente y se dispara el
// workflow. Los dos secretos viven en el Worker y nunca llegan al navegador.

const PCLOUD_API = "https://api.pcloud.com";

// Ruta interna en pCloud (no es la ruta de Windows: "SLEEPINGBCN PCloud" es
// una carpeta real en la raíz de la cuenta). El token es de una cuenta alojada
// en EE.UU., de ahí api.pcloud.com y no eapi.pcloud.com.
const PCLOUD_CARPETA = "/SLEEPINGBCN PCloud/Compartit SLEEPING/A DESCARREGUES KB";

const GITHUB_REPO = "SleepingGestio/sleepingbcn-gestion";
const GITHUB_WORKFLOW = "importar-reservas-kb.yml";
const GITHUB_REF = "main";

function leerSecreto(nombre: "PCLOUD_TOKEN" | "GITHUB_TOKEN"): string {
  let valor: string | undefined;
  try {
    valor = getCloudflareEnv()[nombre];
  } catch {
    // Fuera de un Worker (dev local) no hay bindings; se intenta process.env.
  }
  valor ??= process.env[nombre];
  if (!valor) {
    throw new Error(
      `Falta el secreto ${nombre}. Añádelo al Worker de Cloudflare (Settings → Variables and Secrets).`,
    );
  }
  return valor;
}

type PCloudEntrada = { name: string; isfolder: boolean };
type PCloudRespuesta = {
  result: number;
  error?: string;
  metadata?: { contents?: PCloudEntrada[] };
};

/**
 * Ficheros .xlsx que esperan en la carpeta de pCloud, para avisar en la
 * pantalla de que hay trabajo pendiente. Solo mira el primer nivel: los que ya
 * están en procesados/ o rechazados/ no cuentan.
 */
export const getKbPendientes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ficheros: string[] }> => {
    const token = leerSecreto("PCLOUD_TOKEN");

    const url = new URL(`${PCLOUD_API}/listfolder`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("path", PCLOUD_CARPETA);

    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) {
      throw new Error(`pCloud ha respondido ${resp.status} al listar la carpeta.`);
    }

    const data = (await resp.json()) as PCloudRespuesta;
    // pCloud devuelve HTTP 200 incluso en los errores: el estado real está en
    // "result" (0 = correcto). Un token caducado o revocado llega por aquí.
    if (data.result !== 0) {
      throw new Error(`pCloud: ${data.error ?? `error ${data.result}`}`);
    }

    const ficheros = (data.metadata?.contents ?? [])
      .filter((c) => !c.isfolder && c.name.toLowerCase().endsWith(".xlsx"))
      .map((c) => c.name)
      .sort();

    return { ficheros };
  });

/**
 * Dispara el workflow de GitHub Actions. Devuelve en cuanto GitHub acepta la
 * petición (204), no cuando la importación termina: quien llame debe esperar a
 * que aparezca una fila nueva en kb_importaciones.
 */
export const dispararImportacionKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      modo: z.enum(["diario", "historico"]).default("diario"),
      googleSync: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const token = leerSecreto("GITHUB_TOKEN");

    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          // GitHub rechaza las peticiones sin User-Agent.
          "User-Agent": "sleepingbcn-gestion",
        },
        body: JSON.stringify({
          ref: GITHUB_REF,
          // Los inputs de workflow_dispatch viajan siempre como texto por la
          // API, incluso los declarados como boolean en el YAML.
          inputs: { modo: data.modo, google_sync: String(data.googleSync) },
        }),
      },
    );

    if (resp.status !== 204) {
      const detalle = (await resp.text()).slice(0, 300);
      throw new Error(`GitHub ha respondido ${resp.status}: ${detalle}`);
    }

    return { ok: true };
  });
