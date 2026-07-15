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
  name: "list_my_hour_adjustments",
  title: "Els meus ajustos d'hores",
  description:
    "Llista els ajustos manuals d'hores (personal_ajustos_hores) de l'usuari autenticat, filtrats opcionalment per rang de dates (YYYY-MM-DD).",
  inputSchema: {
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Data d'inici inclosa, format YYYY-MM-DD."),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Data final inclosa, format YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "No autenticat" }], isError: true };
    }
    const email = ctx.getUserEmail();
    if (!email) {
      return { content: [{ type: "text", text: "El token no conté email" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: persona, error: personaError } = await supabase
      .from("personal")
      .select("id_persona")
      .ilike("mail", email)
      .maybeSingle();
    if (personaError) {
      return { content: [{ type: "text", text: personaError.message }], isError: true };
    }
    if (!persona) {
      return { content: [{ type: "text", text: `No hi ha fitxa de personal per ${email}` }] };
    }
    let q = supabase
      .from("personal_ajustos_hores")
      .select("id_ajuste, fecha, horas, tipo, tipus_computa, notas, created_at")
      .eq("id_persona", (persona as { id_persona: number }).id_persona)
      .order("fecha", { ascending: false })
      .limit(500);
    if (from) q = q.gte("fecha", from);
    if (to) q = q.lte("fecha", to);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { adjustments: data ?? [] },
    };
  },
});