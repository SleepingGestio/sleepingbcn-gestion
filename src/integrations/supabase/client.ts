import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wayawbosopwqyivacxah.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_FLy0zybGrk-OEItDBrjoqw_mSw7UB4J";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
