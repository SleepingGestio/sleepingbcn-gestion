import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import process from "node:process";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCloudflareEnv } from "@/lib/cloudflare-env.server";
import { makeRefreshDb } from "@/lib/partee-refresh-db.server";
import { refreshReserva, type RefreshResult } from "@partee-sync/refresh";
import { PartneeClient } from "@partee-sync/partee";

// Botón "Actualizar ahora": refresca UNA reserva desde Partee y crea su fila de partee_registre si falta.
//
// - El Worker NO tiene la service role key: todo va con el JWT de quien llama (requireSupabaseAuth). Las
//   lecturas pasan por RLS y la única escritura es el RPC SECURITY DEFINER partee_refresh_upsert, que vuelve a
//   comprobar can_edit_menu('registre_hostes').
// - Único secreto nuevo del Worker: PARTEE_API_TOKEN (nunca llega al navegador ni a los mensajes).
// - Subrequests del peor caso (3 unidades): getClaims 1 (puede ser 0) + can_edit_menu 1 + lecturas 7
//   (reserva, exclusión, filas actuales, apartamentos, alias, establecimientos, reservas del mismo día) +
//   Partee 6 (3 consultas + 3 partes) + RPC 1 = 16-17, muy por debajo de los 50 del plan gratuito.
//
// Siempre devuelve un código estable (nada de cuerpos de error de Partee ni de Supabase).

export type RefreshResponse =
  | RefreshResult
  | { ok: false; code: "forbidden" | "missing_token" | "unexpected" };

function leerTokenPartee(): string | null {
  let valor: string | undefined;
  try {
    valor = getCloudflareEnv().PARTEE_API_TOKEN;
  } catch {
    // Fuera de un Worker (dev local) no hay bindings; se intenta process.env.
  }
  valor ??= process.env.PARTEE_API_TOKEN;
  return valor || null;
}

export const actualizarReservaPartee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ numero_reserva: z.string().trim().min(1).max(64) }))
  .handler(async ({ data, context }): Promise<RefreshResponse> => {
    const { supabase } = context;
    try {
      // 1. Permiso, antes que nada y en el servidor (no se fía de ningún flag del cliente).
      const { data: puede, error } = await supabase.rpc("can_edit_menu", { p_menu: "registre_hostes" });
      if (error || puede !== true) return { ok: false, code: "forbidden" };

      // 2. Secreto del Worker.
      const token = leerTokenPartee();
      if (!token) return { ok: false, code: "missing_token" };

      // 3. Refresco (cooldown de 30 s incluido, a partir de ultimo_sync de las filas de la reserva).
      return await refreshReserva(data.numero_reserva, {
        db: makeRefreshDb(supabase),
        partee: new PartneeClient(token, (...a) => fetch(...a)),
        now: () => new Date(),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      });
    } catch (e) {
      // Solo el nombre/mensaje corto (sin cuerpos de respuesta, sin datos de huéspedes).
      console.error("[actualizarReservaPartee]", e instanceof Error ? e.message.slice(0, 200) : "unknown");
      return { ok: false, code: "unexpected" };
    }
  });
