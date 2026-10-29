// The ONLY Partee write: POST /reservation/external/checkinonline/link/create (API §16), for a reservation
// that already exists in Partee. Kept apart from PartneeClient so the cron job (which only imports partee.ts)
// can never reach it. The body is fixed: the link is never e-mailed to the guest and never forced.
// Responses are reduced to the URL immediately; the body is never logged or returned. The only thing read from a
// failed response besides the status is a sanitised `errorMessage` (see safeMessage), for the short `detail`.
import { PartneeClient } from './partee';

/** `detail` is a short, fixed-format diagnostic (`link:400`, `link:network`, ...), safe to show and log. */
export type LinkResult =
  | { kind: 'ok'; url: string; existed: boolean }
  | { kind: 'unauthorized'; detail?: string } // 401: token invalid, or the accommodation's Partee subscription expired
  | { kind: 'forbidden'; detail?: string } // 403
  | { kind: 'rate_limited'; retryAfter: string | null; detail?: string }
  | { kind: 'not_found'; detail?: string } // 404
  | { kind: 'error'; status: number; detail?: string };

const PARTEE_URL_RE = /^https:\/\/([a-z0-9-]+\.)*partee\.es\/[^\s]+$/;

/** Same rule as the SQL function: https, partee.es (or a subdomain), a path, no spaces, <= 300 chars. */
export const isParteeUrl = (u: unknown): u is string =>
  typeof u === 'string' && u.length <= 300 && PARTEE_URL_RE.test(u);

export const MESSAGE_MAX = 150;

/**
 * Partee's `errorMessage`, only if it is safe to show: a string, whitespace collapsed, double quotes turned into
 * single ones, cut to 150 characters, and dropped entirely when it contains "@" (it could carry an e-mail address
 * or other guest data).
 */
export function safeMessage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  if (!m || m.includes('@')) return null;
  return m.slice(0, MESSAGE_MAX);
}

/** The `errorMessage` of a response body, or null when the body is not JSON / has none. Nothing else is read. */
function messageOf(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? safeMessage((parsed as Record<string, unknown>).errorMessage) : null;
  } catch {
    return null;
  }
}

const withMessage = (base: string, message: string | null): string => (message ? `${base} "${message}"` : base);

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
      return { kind: 'error', status: 0, detail: 'link:network' };
    }
    const { res, text } = out;
    if (!res.ok) {
      const detail = withMessage(`link:${res.status}`, messageOf(text));
      if (res.status === 401) return { kind: 'unauthorized', detail };
      if (res.status === 403) return { kind: 'forbidden', detail };
      if (res.status === 429) return { kind: 'rate_limited', retryAfter: res.headers.get('retry-after'), detail };
      if (res.status === 404) return { kind: 'not_found', detail };
      return { kind: 'error', status: res.status, detail };
    }
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      data = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
    } catch {
      return { kind: 'error', status: res.status, detail: 'link:bad_json' };
    }
    if (data.error === true) {
      return {
        kind: 'error',
        status: res.status,
        detail: withMessage('link:error_flag', safeMessage(data.errorMessage)),
      };
    }
    const url = data.checkInOnlineURL;
    if (!isParteeUrl(url)) return { kind: 'error', status: res.status, detail: 'link:bad_url' };
    const existed = typeof data.errorMessage === 'string' && /already existed/i.test(data.errorMessage);
    return { kind: 'ok', url, existed };
  }
}
