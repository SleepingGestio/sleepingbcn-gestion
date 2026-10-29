// The ONLY Partee write: POST /reservation/external/checkinonline/link/create (API §16), for a reservation
// that already exists in Partee. Kept apart from PartneeClient so the cron job (which only imports partee.ts)
// can never reach it. The body is fixed: the link is never e-mailed to the guest and never forced.
// Responses are reduced to the URL immediately; the body and `errorMessage` are never logged or returned.
import { PartneeClient } from './partee';

export type LinkResult =
  | { kind: 'ok'; url: string; existed: boolean }
  | { kind: 'unauthorized' } // 401: token invalid, or the accommodation's Partee subscription expired
  | { kind: 'forbidden' } // 403
  | { kind: 'rate_limited'; retryAfter: string | null }
  | { kind: 'not_found' } // 404
  | { kind: 'error'; status: number };

const PARTEE_URL_RE = /^https:\/\/([a-z0-9-]+\.)*partee\.es\/[^\s]+$/;

/** Same rule as the SQL function: https, partee.es (or a subdomain), a path, no spaces, <= 300 chars. */
export const isParteeUrl = (u: unknown): u is string =>
  typeof u === 'string' && u.length <= 300 && PARTEE_URL_RE.test(u);

export class PartneeLinkClient extends PartneeClient {
  async createCheckinLink(reservationId: number | string): Promise<LinkResult> {
    let out;
    try {
      out = await this.request('POST', '/reservation/external/checkinonline/link/create', {
        reservationID: reservationId,
        requestDocs: false,
        sendLinkToGuest: false,
      });
    } catch {
      return { kind: 'error', status: 0 };
    }
    const { res, text } = out;
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 403) return { kind: 'forbidden' };
    if (res.status === 429) return { kind: 'rate_limited', retryAfter: res.headers.get('retry-after') };
    if (res.status === 404) return { kind: 'not_found' };
    if (!res.ok) return { kind: 'error', status: res.status };
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      data = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
    } catch {
      return { kind: 'error', status: res.status };
    }
    if (data.error === true) return { kind: 'error', status: res.status };
    const url = data.checkInOnlineURL;
    if (!isParteeUrl(url)) return { kind: 'error', status: res.status };
    const existed = typeof data.errorMessage === 'string' && /already existed/i.test(data.errorMessage);
    return { kind: 'ok', url, existed };
  }
}
