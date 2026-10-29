// Data access for refreshReserva using the CALLER's Supabase client (the one built by requireSupabaseAuth,
// i.e. the user's JWT + the publishable key). No service role key is involved: reads go through RLS and the
// only write is the SECURITY DEFINER RPC partee_refresh_upsert, which re-checks can_edit_menu itself.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { LinkDb, LinkExistingRegistre } from "@partee-sync/link";
import type { ExistingRegistre, RefreshDb, UpsertResult } from "@partee-sync/refresh";
import type { KbRow, RegistreRow } from "@partee-sync/types";

type Client = SupabaseClient<Database>;

// Plain string so supabase-js does not try to parse the quoted column names.
const KB_COLS: string = '"Número", "Check in", "Estado", "Habitaciones"';

type KbRaw = Record<string, string | null>;
const toKb = (r: KbRaw): KbRow => ({
  numero: String(r["Número"]),
  checkIn: String(r["Check in"] ?? ""),
  estado: r["Estado"] ?? null,
  habitaciones: r["Habitaciones"] ?? null,
});

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`.slice(0, 200));
  return res.data as T;
}

export function makeRefreshDb(supabase: Client): RefreshDb {
  return {
    async kbReserva(numero) {
      const res = await supabase.from("reservas_kb").select(KB_COLS).eq("Número", numero).maybeSingle();
      const row = must(res as unknown as { data: KbRaw | null; error: { message: string } | null }, "kb");
      return row ? toKb(row) : null;
    },
    async kbMismaFecha(date) {
      const res = await supabase.from("reservas_kb").select(KB_COLS).eq("Check in", date).limit(1000);
      return must(res as unknown as { data: KbRaw[] | null; error: { message: string } | null }, "kb_fecha").map(toKb);
    },
    async isExcluded(numero) {
      const res = await supabase.from("partee_exclusion").select("numero_reserva").eq("numero_reserva", numero).maybeSingle();
      return must(res, "exclusion") !== null;
    },
    async registre(numero): Promise<ExistingRegistre[]> {
      const res = await supabase
        .from("partee_registre")
        .select("id_apt, estado, ultimo_sync, partee_reservation_id, parte_id, is_borrador, num_viajeros, num_lote, checkin_url")
        .eq("numero_reserva", numero);
      return must(res, "registre") ?? [];
    },
    async apartamentos() {
      return (must(await supabase.from("apartamentos").select("id_apt, nombre"), "apartamentos") ?? []) as Array<{
        id_apt: number;
        nombre: string | null;
      }>;
    },
    async alias() {
      return (must(await supabase.from("apartamentos_alias_kb").select("id_apt, nombre_kb"), "alias") ?? []) as Array<{
        id_apt: number;
        nombre_kb: string | null;
      }>;
    },
    async establiments() {
      return (must(
        await supabase.from("partee_establiment").select("id_apt, partee_est_id").eq("activo", true),
        "establiments",
      ) ?? []) as Array<{ id_apt: number; partee_est_id: number }>;
    },
    async upsert(rows: RegistreRow[]): Promise<UpsertResult> {
      const { data, error } = await supabase.rpc("partee_refresh_upsert", { p_rows: rows as unknown as Json });
      if (error) throw new Error(`rpc: ${error.message}`.slice(0, 200));
      const out = (data ?? {}) as { upserted?: number; needs_review?: UpsertResult["needs_review"] };
      return { upserted: out.upserted ?? 0, needs_review: out.needs_review ?? [] };
    },
  };
}

/** Data access for generarEnlace: the same reads as the refresh plus the generated URL, and the URL-only RPC. */
export function makeLinkDb(supabase: Client): LinkDb {
  const base = makeRefreshDb(supabase);
  return {
    kbReserva: base.kbReserva,
    kbMismaFecha: base.kbMismaFecha,
    isExcluded: base.isExcluded,
    apartamentos: base.apartamentos,
    alias: base.alias,
    establiments: base.establiments,
    async registre(numero): Promise<LinkExistingRegistre[]> {
      const res = await supabase
        .from("partee_registre")
        .select(
          "id_apt, estado, ultimo_sync, partee_reservation_id, parte_id, is_borrador, num_viajeros, num_lote, checkin_url, checkin_url_generado",
        )
        .eq("numero_reserva", numero);
      return must(res, "registre") ?? [];
    },
    async setCheckinUrl(numero, idApt, url) {
      const { data, error } = await supabase.rpc("partee_set_checkin_url", {
        p_numero_reserva: numero,
        p_id_apt: idApt,
        p_url: url,
      });
      if (error) throw new Error(`rpc: ${error.message}`.slice(0, 200));
      const out = (data ?? {}) as { updated?: number };
      return { updated: out.updated ?? 0 };
    },
  };
}
