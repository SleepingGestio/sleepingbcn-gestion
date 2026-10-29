import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import process from "node:process";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCloudflareEnv } from "@/lib/cloudflare-env.server";
import { makeLinkDb } from "@/lib/partee-refresh-db.server";
import { generarEnlace, type LinkResponse } from "@partee-sync/link";
import { PartneeLinkClient } from "@partee-sync/partee-link";

// Botón "Generar enlace": crea el enlace de check-in online de Partee de UNA reserva `No generado` (una sola
// unidad) que ya existe en Partee, y guarda SOLO la URL en partee_registre.checkin_url_generado.
//
// - Igual que "Actualizar ahora": sin service role key; todo va con el JWT de quien llama (requireSupabaseAuth);
//   la única escritura en BD es el RPC SECURITY DEFINER partee_set_checkin_url, que vuelve a comprobar
//   can_edit_menu('registre_hostes').
// - La única escritura en Partee es link/create con cuerpo fijo (sin envío al huésped, sin forzar): ver
//   jobs/partee-sync/src/partee-link.ts.
// - Subrequests del peor caso (una unidad): getClaims 1 (puede ser 0) + can_edit_menu 1 + lecturas 7 +
//   Partee 2 (consulta + link/create) + RPC 1 = 12, muy por debajo de los 50 del plan gratuito.
//
// Nunca se registra la URL, el cuerpo de Partee ni su errorMessage: solo códigos de resultado.

export type GenerarEnlaceResponse =
  | LinkResponse
  | { ok: false; code: "forbidden" | "missing_token" | "unexpected"; detail?: string };

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

export const generarEnlacePartee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ numero_reserva: z.string().trim().min(1).max(64) }))
  .handler(async ({ data, context }): Promise<GenerarEnlaceResponse> => {
    const { supabase } = context;
    try {
      // 1. Permiso, antes que nada y en el servidor (no se fía de ningún flag del cliente).
      const { data: puede, error } = await supabase.rpc("can_edit_menu", { p_menu: "registre_hostes" });
      if (error || puede !== true) return { ok: false, code: "forbidden" };

      // 2. Secreto del Worker.
      const token = leerTokenPartee();
      if (!token) return { ok: false, code: "missing_token" };

      // 3. Guardas, consulta a Partee, creación del enlace y guardado de la URL.
      const client = new PartneeLinkClient(token, (...a) => fetch(...a));
      const result = await generarEnlace(data.numero_reserva, {
        db: makeLinkDb(supabase),
        partee: {
          reservations: (est, date) => client.reservations(est, date),
          createLink: (id) => client.createCheckinLink(id),
        },
        now: () => new Date(),
      });
      // Logs del Worker: solo el código y el diagnóstico corto (nunca la URL ni un cuerpo de Partee).
      if (!result.ok && result.detail) console.error("[generarEnlacePartee]", result.code, result.detail);
      return result;
    } catch (e) {
      // Solo el nombre/mensaje corto (sin cuerpos de respuesta, sin URL, sin datos de huéspedes).
      console.error("[generarEnlacePartee]", e instanceof Error ? e.message.slice(0, 200) : "unknown");
      return { ok: false, code: "unexpected" };
    }
  });
