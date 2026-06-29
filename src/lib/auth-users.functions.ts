import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type AuthUserInfo = {
  email: string;
  exists: boolean;
  last_sign_in_at: string | null;
  created_at: string | null;
};

async function assertAdmin(accessToken: string) {
  const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = getSupabaseAdmin();
  const { data: userRes, error: uErr } = await admin.auth.getUser(accessToken);
  if (uErr || !userRes.user?.email) throw new Error("Unauthorized");
  const email = userRes.user.email;
  // Find personal row + roles
  const { data: personal, error: pErr } = await admin
    .from("personal")
    .select("id_persona, personal_roles(id_rol, fecha_hasta)")
    .ilike("mail", email)
    .maybeSingle();
  if (pErr || !personal) throw new Error("Forbidden");
  const roleIds: number[] = (((personal as any).personal_roles ?? []) as { id_rol: number; fecha_hasta: string | null }[])
    .filter((r) => !r.fecha_hasta)
    .map((r) => r.id_rol);
  if (!roleIds.includes(1)) throw new Error("Forbidden");
  return admin;
}

export const listAuthUsersByEmails = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      emails: z.array(z.string().email()),
      accessToken: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<AuthUserInfo[]> => {
    const admin = await assertAdmin(data.accessToken);
    const wanted = new Set(data.emails.map((e) => e.toLowerCase()));
    const result = new Map<string, AuthUserInfo>();
    for (const e of wanted) {
      result.set(e, { email: e, exists: false, last_sign_in_at: null, created_at: null });
    }
    // Paginate through users (admin API)
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      for (const u of list.users) {
        const em = u.email?.toLowerCase();
        if (em && wanted.has(em)) {
          result.set(em, {
            email: em,
            exists: true,
            last_sign_in_at: u.last_sign_in_at ?? null,
            created_at: u.created_at ?? null,
          });
        }
      }
      if (list.users.length < perPage) break;
      page += 1;
      if (page > 20) break;
    }
    return Array.from(result.values());
  });