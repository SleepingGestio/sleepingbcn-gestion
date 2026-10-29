// PartneeLinkClient with a fake fetch. Synthetic data only; no network.
import { describe, expect, it, vi } from 'vitest';
import { isParteeUrl, PartneeLinkClient } from '../src/partee-link';

const URL_OK = 'https://m.partee.es/u123';

function client(res: { status?: number; body?: unknown; text?: string; headers?: Record<string, string> }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const status = res.status ?? 200;
    return new Response(res.text ?? JSON.stringify(res.body ?? {}), { status, headers: res.headers });
  }) as unknown as typeof fetch;
  return { c: new PartneeLinkClient('tkn', f), calls };
}

describe('PartneeLinkClient.createCheckinLink', () => {
  it('sends exactly reservationID + requestDocs:false + sendLinkToGuest:false, never forceLinkCreation', async () => {
    const { c, calls } = client({ body: { error: false, parteID: 0, checkInOnlineURL: URL_OK } });
    const r = await c.createCheckinLink(42);
    expect(r).toEqual({ kind: 'ok', url: URL_OK, existed: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://app.partee.es/resources/api/reservation/external/checkinonline/link/create');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      reservationID: 42,
      requestDocs: false,
      sendLinkToGuest: false,
    });
    expect(String(calls[0].init.body)).not.toContain('forceLinkCreation');
  });

  it('"already existed" is not an error', async () => {
    const { c } = client({
      body: { error: false, errorMessage: 'The checkIn Online URL already existed', checkInOnlineURL: URL_OK },
    });
    expect(await c.createCheckinLink(1)).toEqual({ kind: 'ok', url: URL_OK, existed: true });
  });

  it('maps statuses', async () => {
    expect(await client({ status: 401 }).c.createCheckinLink(1)).toEqual({ kind: 'unauthorized' });
    expect(await client({ status: 403 }).c.createCheckinLink(1)).toEqual({ kind: 'forbidden' });
    expect(await client({ status: 404 }).c.createCheckinLink(1)).toEqual({ kind: 'not_found' });
    expect(await client({ status: 400 }).c.createCheckinLink(1)).toEqual({ kind: 'error', status: 400 });
    expect(await client({ status: 503 }).c.createCheckinLink(1)).toEqual({ kind: 'error', status: 503 });
    expect(await client({ status: 429, headers: { 'retry-after': '30' } }).c.createCheckinLink(1)).toEqual({
      kind: 'rate_limited',
      retryAfter: '30',
    });
  });

  it('error:true, bad JSON, missing or foreign URL are errors', async () => {
    expect(await client({ body: { error: true, errorMessage: 'x' } }).c.createCheckinLink(1)).toEqual({
      kind: 'error',
      status: 200,
    });
    expect(await client({ text: 'nope' }).c.createCheckinLink(1)).toEqual({ kind: 'error', status: 200 });
    expect(await client({ body: { error: false } }).c.createCheckinLink(1)).toEqual({ kind: 'error', status: 200 });
    expect(
      await client({ body: { error: false, checkInOnlineURL: 'https://evil.example/partee.es/x' } }).c.createCheckinLink(1),
    ).toEqual({ kind: 'error', status: 200 });
  });

  it('a network failure is an error and nothing is logged', async () => {
    const log = vi.spyOn(console, 'log');
    const err = vi.spyOn(console, 'error');
    const c = new PartneeLinkClient('tkn', (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch);
    expect(await c.createCheckinLink(1)).toEqual({ kind: 'error', status: 0 });
    expect(log).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });
});

describe('isParteeUrl', () => {
  it('accepts https partee.es hosts only', () => {
    expect(isParteeUrl('https://m.partee.es/abc')).toBe(true);
    expect(isParteeUrl('https://l.partee.es/abc?x=1')).toBe(true);
    expect(isParteeUrl('http://m.partee.es/abc')).toBe(false);
    expect(isParteeUrl('https://partee.es.evil.com/abc')).toBe(false);
    expect(isParteeUrl('https://m.partee.es/a b')).toBe(false);
    expect(isParteeUrl(null)).toBe(false);
  });
});
