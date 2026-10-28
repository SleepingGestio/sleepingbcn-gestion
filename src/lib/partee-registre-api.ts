// Read queries for the Registre hostes screens. Writes live in components/registro-reclamaciones.tsx.
import { supabase } from "@/integrations/supabase/client";
import { ESTADOS_KB_EXCLUIDOS, isStaleRegistre } from "@/lib/partee-registre";

export interface RegistreKb {
  "Número": string;
  Referencia: string | null;
  Portal: string | null;
  "Huéspedes": number | null;
  "Huéspedes menores de edad": number | null;
  "Huéspedes exentos": number | null;
  "Check in": string | null;
  "Check-out": string | null;
  Estado: string | null;
  Habitaciones: string | null;
}

export interface RegistreRowFull {
  id_registre: number;
  numero_reserva: string;
  id_apt: number;
  fecha_checkin: string;
  estado: string;
  is_borrador: boolean | null;
  num_viajeros: number | null;
  num_lote: string | null;
  checkin_url: string | null;
  ultimo_sync: string | null;
  registro_confirmado: boolean;
  registro_confirmado_por: number | null;
  registro_confirmado_en: string | null;
  registro_confirmado_nota: string | null;
  apartamentos: { nombre: string | null } | null;
  reservas_kb: RegistreKb | null;
  /** Only on the page query: ALL reclamations of the row, newest first (embedded). */
  partee_reclamacio?: Array<{ enviada_en: string; canal: string | null }> | null;
}

// Typed as plain string so supabase-js does not try to parse the quoted column names.
const SELECT_FULL: string =
  "id_registre, numero_reserva, id_apt, fecha_checkin, estado, is_borrador, num_viajeros, num_lote, checkin_url, ultimo_sync, " +
  "registro_confirmado, registro_confirmado_por, registro_confirmado_en, registro_confirmado_nota, " +
  'apartamentos(nombre), reservas_kb("Número", Referencia, Portal, "Huéspedes", "Huéspedes menores de edad", "Huéspedes exentos", "Check in", "Check-out", Estado, Habitaciones)';

// Page query: same columns + all reclamations of each row (embedded, newest first). An embedded
// resource is returned as a nested array, so it never multiplies the parent rows: the 1000-row cap and
// the paging below still apply to registre rows only.
const SELECT_WINDOW: string = SELECT_FULL + ", partee_reclamacio(enviada_en, canal)";
const LAST_RECL = { referencedTable: "partee_reclamacio" } as const;

const PAGE = 1000; // PostgREST row cap: always page

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export interface Exclusion {
  numero_reserva: string;
  motivo: string;
  nota: string | null;
  creado_por: number | null;
  creado_en: string;
}

/** Every partee_exclusion row (small table; paged at 1000 per the repo convention). */
export async function fetchExclusiones(): Promise<Exclusion[]> {
  return pageAll<Exclusion>((a, b) =>
    supabase
      .from("partee_exclusion")
      .select("numero_reserva, motivo, nota, creado_por, creado_en")
      .order("numero_reserva")
      .range(a, b),
  );
}

/** Rows of one reservation (one per unit), with the unit name. */
export async function fetchRegistreByReserva(numero: string): Promise<RegistreRowFull[]> {
  const { data, error } = await supabase
    .from("partee_registre")
    .select(SELECT_FULL)
    .eq("numero_reserva", numero)
    .order("id_apt");
  if (error) throw error;
  return (data ?? []) as unknown as RegistreRowFull[];
}

/**
 * Rows for the page: every row with fecha_checkin in [from, to], PLUS every older row that is
 * not finalizado/anulado (second query), so overdue partes never disappear from the list.
 * Rows whose KB reservation is cancelled / no-show are dropped, and so are stale rows: the KB
 * "Check in" no longer matches fecha_checkin (the reservation date changed after the sync).
 */
export async function fetchRegistreWindow(from: string, to: string): Promise<RegistreRowFull[]> {
  const inWindow = pageAll<RegistreRowFull>((a, b) =>
    supabase
      .from("partee_registre")
      .select(SELECT_WINDOW)
      .gte("fecha_checkin", from)
      .lte("fecha_checkin", to)
      .order("id_registre")
      .order("enviada_en", { ...LAST_RECL, ascending: false })
      .range(a, b),
  );
  const overdue = pageAll<RegistreRowFull>((a, b) =>
    supabase
      .from("partee_registre")
      .select(SELECT_WINDOW)
      .lt("fecha_checkin", from)
      .not("estado", "in", "(finalizado,anulado)")
      .order("id_registre")
      .order("enviada_en", { ...LAST_RECL, ascending: false })
      .range(a, b),
  );
  const [w, o] = await Promise.all([inWindow, overdue]);
  const seen = new Set<number>();
  const rows: RegistreRowFull[] = [];
  for (const r of [...w, ...o]) {
    if (seen.has(r.id_registre)) continue;
    seen.add(r.id_registre);
    const kbEstado = r.reservas_kb?.Estado;
    if (kbEstado && ESTADOS_KB_EXCLUIDOS.has(kbEstado)) continue;
    if (isStaleRegistre(r.fecha_checkin, r.reservas_kb?.["Check in"])) continue;
    rows.push(r);
  }
  return rows;
}
