// Minimal PostgREST client (service role). Errors carry the HTTP status only, never bodies.
import type { FetchFn } from './partee';
import type { KbRow, RegistreRow } from './types';

const PAGE = 1000;

export class Db {
  private readonly base: string;

  constructor(
    supabaseUrl: string,
    private readonly key: string,
    private readonly f: FetchFn,
  ) {
    this.base = supabaseUrl.replace(/\/+$/, '') + '/rest/v1';
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { apikey: this.key, Authorization: `Bearer ${this.key}`, ...extra };
  }

  /** Reads every page of a table query. `order` keeps paging stable. */
  private async getAll<T>(table: string, params: URLSearchParams): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const p = new URLSearchParams(params);
      p.set('limit', String(PAGE));
      p.set('offset', String(offset));
      const res = await this.f(`${this.base}/${table}?${p}`, { headers: this.headers() });
      if (!res.ok) throw new Error(`supabase_read_failed:${table}:${res.status}`);
      const page = (await res.json()) as T[];
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  establiments(): Promise<Array<{ id_apt: number; partee_est_id: number }>> {
    return this.getAll(
      'partee_establiment',
      new URLSearchParams({ select: 'id_apt,partee_est_id', activo: 'eq.true', order: 'id_apt' }),
    );
  }

  apartamentos(): Promise<Array<{ id_apt: number; nombre: string | null }>> {
    return this.getAll('apartamentos', new URLSearchParams({ select: 'id_apt,nombre', order: 'id_apt' }));
  }

  alias(): Promise<Array<{ id_apt: number; nombre_kb: string | null }>> {
    return this.getAll(
      'apartamentos_alias_kb',
      new URLSearchParams({ select: 'id_apt,nombre_kb', order: 'id_alias' }),
    );
  }

  /** KB reservations whose "Check in" (TEXT YYYY-MM-DD) is in [from, to]. Estado is filtered in code. */
  async kbReservations(from: string, to: string): Promise<KbRow[]> {
    const p = new URLSearchParams({
      select: '"Número","Check in","Estado","Habitaciones"',
      order: '"Número"',
    });
    p.append('Check in', `gte.${from}`);
    p.append('Check in', `lte.${to}`);
    const raw = await this.getAll<Record<string, string | null>>('reservas_kb', p);
    return raw.map((r) => ({
      numero: String(r['Número']),
      checkIn: String(r['Check in'] ?? ''),
      estado: r['Estado'] ?? null,
      habitaciones: r['Habitaciones'] ?? null,
    }));
  }

  /** Current state of the registre rows in the window (to avoid downgrading sent partes). */
  registreEstados(from: string, to: string): Promise<Array<{ numero_reserva: string; id_apt: number; estado: string }>> {
    const p = new URLSearchParams({ select: 'numero_reserva,id_apt,estado', order: 'id_registre' });
    p.append('fecha_checkin', `gte.${from}`);
    p.append('fecha_checkin', `lte.${to}`);
    return this.getAll('partee_registre', p);
  }

  /** Reservation numbers that do not need a Partee registration (partee_exclusion). */
  async excludedReservas(): Promise<string[]> {
    const rows = await this.getAll<{ numero_reserva: string }>(
      'partee_exclusion',
      new URLSearchParams({ select: 'numero_reserva', order: 'numero_reserva' }),
    );
    return rows.map((r) => r.numero_reserva);
  }

  /** Bulk upsert on (numero_reserva, id_apt). Columns not in the payload (ses_*) are left untouched. */
  async upsertRegistre(rows: RegistreRow[]): Promise<void> {
    if (rows.length === 0) return;
    const res = await this.f(`${this.base}/partee_registre?on_conflict=numero_reserva,id_apt`, {
      method: 'POST',
      headers: this.headers({
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`supabase_upsert_failed:${res.status}`);
  }
}
