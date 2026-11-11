import { supabase } from "@/integrations/supabase/client";

// Fetches an attachment from the authenticated streaming endpoint
// (/api/adjunto) and returns a blob: URL usable in <img>, <video>, window.open.
export async function fetchAdjuntoBlobUrl(key: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No hay sesión activa");
  const res = await fetch(`/api/adjunto?key=${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Adjunto: HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
