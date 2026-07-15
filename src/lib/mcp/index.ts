import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listMyHourAdjustmentsTool from "./tools/list-my-hour-adjustments";

// Direct Supabase issuer for RFC 8414 discovery. VITE_SUPABASE_PROJECT_ID is
// inlined at build time; the sentinel keeps the URL well-formed during the
// throwaway manifest-extract eval and never verifies a real token.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "sleepingbcn-mcp",
  title: "SleepingBCN",
  version: "0.1.0",
  instructions:
    "Eines per consultar el panel intern de SleepingBCN (gestió d'apartaments turístics). Comença amb `whoami` per verificar l'usuari connectat i consulta els ajustos d'hores propis amb `list_my_hour_adjustments`.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listMyHourAdjustmentsTool],
});