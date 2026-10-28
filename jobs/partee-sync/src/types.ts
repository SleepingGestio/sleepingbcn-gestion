export interface Env {
  PARTEE_API_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export type RegistreEstado = 'sin_registro' | 'iniciado' | 'borrador' | 'finalizado' | 'anulado';

/** A KB reservation, reduced to the columns the sync needs. */
export interface KbRow {
  numero: string;
  checkIn: string;
  estado: string | null;
  habitaciones: string | null;
}

/** (reservation, unit) pair expected to have a Partee registration. */
export interface TargetPair {
  numero_reserva: string;
  id_apt: number;
  fecha_checkin: string; // YYYY-MM-DD
}

/** One Partee query: an establishment on a check-in date. */
export interface CallKey {
  estId: number;
  date: string; // YYYY-MM-DD
  pairs: TargetPair[];
}

/** Partee reservation record, reduced to non-personal fields. */
export interface PRecord {
  id: number | string | null;
  parteID: number | string | null;
  channel: string | null;
  totalGuests: number;
  checkInOnlineURL: string | null;
}

/** Facts taken from a parte; nothing about the guests except their count. */
export interface ParteFacts {
  isBorrador: boolean | null;
  anulado: boolean;
  numLote: string | null;
  numViajeros: number;
}

export type Selection =
  | { kind: 'parte'; record: PRecord; ambiguous: boolean; extraParteRecords: PRecord[] }
  | { kind: 'iniciado'; record: PRecord }
  | { kind: 'sin_registro' };

export interface RegistreRow {
  numero_reserva: string;
  id_apt: number;
  fecha_checkin: string;
  partee_reservation_id: number | null;
  parte_id: number | null;
  estado: RegistreEstado;
  is_borrador: boolean | null;
  num_viajeros: number | null;
  num_lote: string | null;
  checkin_url: string | null;
  ultimo_sync: string;
  actualizado_en: string;
}

export interface RunSummary {
  window: { from: string; to: string };
  establishments: number;
  kb_pairs: number;
  ignored_units: number;
  unresolved_rooms: number;
  partee_calls: number;
  parte_calls: number;
  empty_dates: number;
  upserts: Record<string, number>;
  unmatched_partee_records: Array<number | string>;
  conflicts: number;
  /** Sent/annulled rows kept as they are because Partee now shows no parte (or failed). */
  needs_review: Array<{ numero_reserva: string; id_apt: number }>;
  ambiguous: number;
  failures: number;
  rate_limited: { hit: boolean; retry_after: string | null };
  budget_exceeded: boolean;
  dry: boolean;
  duration_ms: number;
}
