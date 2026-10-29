// Read-only Partee client. Only the two read calls the sync needs; nothing here writes.
// (The one write, check-in link creation, lives in partee-link.ts, which the cron job never imports.)
// Responses are reduced to non-personal fields immediately, bodies are never logged.
import { extractParteFacts, isoToPartee } from './logic';
import type { ParteFacts, PRecord } from './types';

const BASE = 'https://app.partee.es/resources/api';

export type FetchFn = typeof fetch;

export type PartneeResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'empty' }
  | { kind: 'rate_limited'; retryAfter: string | null }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number };

const num = (v: unknown): number | string | null =>
  typeof v === 'number' || typeof v === 'string' ? v : null;

export function toRecord(raw: unknown): PRecord {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const guests = Number(r.totalGuests);
  return {
    id: num(r.id),
    parteID: num(r.parteID),
    channel: typeof r.channel === 'string' ? r.channel : null,
    totalGuests: Number.isFinite(guests) ? guests : 0,
    checkInOnlineURL: typeof r.checkInOnlineURL === 'string' && r.checkInOnlineURL ? r.checkInOnlineURL : null,
  };
}

function asList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  for (const k of ['content', 'data', 'reservations']) if (Array.isArray(o[k])) return o[k] as unknown[];
  return [];
}

export class PartneeClient {
  constructor(
    private readonly token: string,
    private readonly f: FetchFn,
  ) {}

  protected async request(method: 'GET' | 'POST', path: string, body?: unknown) {
    const res = await this.f(BASE + path, {
      method,
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { res, text };
  }

  /** POST /reservation/external/reservations (a read query despite the verb). */
  async reservations(estId: number, dateIso: string): Promise<PartneeResult<PRecord[]>> {
    let out;
    try {
      out = await this.request('POST', '/reservation/external/reservations', {
        accomodationID: String(estId),
        checkinDate: isoToPartee(dateIso),
      });
    } catch {
      return { kind: 'error', status: 0 };
    }
    const { res, text } = out;
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 429) return { kind: 'rate_limited', retryAfter: res.headers.get('retry-after') };
    if (res.status === 404) {
      return /no reservations/i.test(text) ? { kind: 'empty' } : { kind: 'error', status: 404 };
    }
    if (!res.ok) return { kind: 'error', status: res.status };
    let data: unknown = null;
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        return { kind: 'error', status: res.status };
      }
    }
    const list = asList(data);
    return list.length === 0 ? { kind: 'empty' } : { kind: 'ok', data: list.map(toRecord) };
  }

  /** GET /parteviajeros/external/{parteID}: only the allowed facts leave this function. */
  async parte(parteId: number | string): Promise<PartneeResult<ParteFacts>> {
    let out;
    try {
      out = await this.request('GET', `/parteviajeros/external/${encodeURIComponent(String(parteId))}`);
    } catch {
      return { kind: 'error', status: 0 };
    }
    const { res, text } = out;
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 429) return { kind: 'rate_limited', retryAfter: res.headers.get('retry-after') };
    if (!res.ok) return { kind: 'error', status: res.status };
    try {
      return { kind: 'ok', data: extractParteFacts(JSON.parse(text)) };
    } catch {
      return { kind: 'error', status: res.status };
    }
  }
}
