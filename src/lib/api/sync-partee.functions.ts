import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GITHUB_REPO, githubHeaders, leerGithubToken } from "@/lib/github-actions.server";
import {
  buildDispatchBody,
  hasActiveRun,
  parseRuns,
  PARTEE_SYNC_WORKFLOW,
  syncState,
  type SyncState,
} from "@/lib/partee-sync-trigger";

// Botón "Actualizar todo" de /registre-hostes: lanza el workflow "Partee sync" (partee-sync.yml) de GitHub
// Actions, igual que el botón "Importar reservas KB" lanza el suyo, con el mismo secreto GITHUB_TOKEN del Worker.
//
// - Solo editores de registre_hostes: can_edit_menu se comprueba PRIMERO, con el JWT de quien llama; cualquier
//   cosa distinta de `true` es `forbidden` (falla cerrado).
// - Si ya hay una ejecución en cola o en curso (programada o manual) no se lanza otra (`already_running`).
// - Subrequests por llamada: getClaims 1 (puede ser 0) + can_edit_menu 1 + GitHub: listar ejecuciones 1 y, solo al
//   lanzar, dispatch 1 = 3-4 al lanzar y 3 al consultar el estado, muy por debajo de los 50 del plan gratuito.
// - Nunca se devuelven ni se registran cuerpos de GitHub ni el token: solo códigos y el número de estado HTTP.

export type LanzarSyncResponse =
  | { ok: true; since: number }
  | { ok: false; code: "forbidden" | "missing_token" | "already_running" | "github_error" | "unexpected" };

export type EstadoSyncResponse =
  | { ok: true; state: SyncState }
  | { ok: false; code: "forbidden" | "missing_token" | "github_error" | "unexpected" };

const API = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${PARTEE_SYNC_WORKFLOW}`;

/** Latest runs of the workflow, or null when GitHub answers with an error. */
async function listarEjecuciones(token: string) {
  const resp = await fetch(`${API}/runs?per_page=10`, { headers: githubHeaders(token) });
  if (!resp.ok) {
    console.error("[sync-partee] GitHub list runs status", resp.status);
    return null;
  }
  return parseRuns(await resp.json());
}

export const lanzarSincronizacionPartee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LanzarSyncResponse> => {
    try {
      // 1. Permiso, antes que nada.
      const { data: puede, error } = await context.supabase.rpc("can_edit_menu", { p_menu: "registre_hostes" });
      if (error || puede !== true) return { ok: false, code: "forbidden" };

      // 2. Secreto del Worker.
      const token = leerGithubToken();
      if (!token) return { ok: false, code: "missing_token" };

      // 3. Nada de apilar ejecuciones: si ya hay una en cola o en curso, no se lanza otra.
      const runs = await listarEjecuciones(token);
      if (!runs) return { ok: false, code: "github_error" };
      if (hasActiveRun(runs)) return { ok: false, code: "already_running" };

      // 4. workflow_dispatch en main, dry = "false" (texto), sin from/to.
      const since = Date.now();
      const resp = await fetch(`${API}/dispatches`, {
        method: "POST",
        headers: githubHeaders(token, true),
        body: JSON.stringify(buildDispatchBody()),
      });
      if (resp.status !== 204) {
        console.error("[sync-partee] GitHub dispatch status", resp.status);
        return { ok: false, code: "github_error" };
      }
      return { ok: true, since };
    } catch (e) {
      console.error("[sync-partee]", e instanceof Error ? e.name : "unknown");
      return { ok: false, code: "unexpected" };
    }
  });

/** Estado de la ejecución manual lanzada en `since` (para saber cuándo refrescar la lista). */
export const estadoSincronizacionPartee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ since: z.number().int().positive() }))
  .handler(async ({ data, context }): Promise<EstadoSyncResponse> => {
    try {
      const { data: puede, error } = await context.supabase.rpc("can_edit_menu", { p_menu: "registre_hostes" });
      if (error || puede !== true) return { ok: false, code: "forbidden" };

      const token = leerGithubToken();
      if (!token) return { ok: false, code: "missing_token" };

      const runs = await listarEjecuciones(token);
      if (!runs) return { ok: false, code: "github_error" };
      return { ok: true, state: syncState(runs, data.since) };
    } catch (e) {
      console.error("[sync-partee]", e instanceof Error ? e.name : "unknown");
      return { ok: false, code: "unexpected" };
    }
  });
