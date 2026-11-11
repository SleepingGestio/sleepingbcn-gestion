import { createClient } from "@supabase/supabase-js";

// Validates the Supabase access token of a plain Request (for server routes,
// where the createServerFn middleware requireSupabaseAuth can't be used).
// Mirrors the checks in src/integrations/supabase/auth-middleware.ts.
// Returns the user id, or null if the request is not authenticated.
export async function verifyBearer(request: Request): Promise<string | null> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error("[verifyBearer] Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY");
    return null;
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  if (token.split(".").length !== 3) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}
