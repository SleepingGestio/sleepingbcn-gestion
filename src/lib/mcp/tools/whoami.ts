import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "whoami",
  title: "Qui sóc",
  description:
    "Retorna el perfil de l'usuari autenticat (id_persona, nom, codi, rols) tal com està registrat a l'app SleepingBCN.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "No autenticat" }], isError: true };
    }
    const email = ctx.getUserEmail();
    if (!email) {
      return { content: [{ type: "text", text: "El token no conté email" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("personal")
      .select(
        "id_persona, nombre, apellidos, codigo, mail, activo, personal_roles(fecha_hasta, roles(nombre))",
      )
      .ilike("mail", email)
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return {
        content: [{ type: "text", text: `No hi ha cap fitxa de personal per ${email}` }],
      };
    }
    const roles = ((data as { personal_roles?: Array<{ fecha_hasta: string | null; roles: { nombre: string } | null }> }).personal_roles ?? [])
      .filter((r) => !r.fecha_hasta)
      .map((r) => r.roles?.nombre)
      .filter(Boolean);
    const profile = {
      id_persona: (data as { id_persona: number }).id_persona,
      nombre: (data as { nombre: string | null }).nombre,
      apellidos: (data as { apellidos: string | null }).apellidos,
      codigo: (data as { codigo: string | null }).codigo,
      mail: (data as { mail: string | null }).mail,
      activo: (data as { activo: boolean | null }).activo,
      roles,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
      structuredContent: { profile },
    };
  },
});