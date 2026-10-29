// PartneeLinkClient with a fake fetch. Synthetic data only; no network.
import { describe, expect, it, vi } from 'vitest';
import { isParteeUrl, MESSAGE_MAX, PartneeLinkClient, safeMessage } from '../src/partee-link';

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
  it('sends exactly id (a number) + requestDocs:false + sendLinkToGuest:false, never reservationID / forceLinkCreation', async () => {
    const { c, calls } = client({ body: { error: false, parteID: 0, checkInOnlineURL: URL_OK } });
    const r = await c.createCheckinLink(7053549);
    expect(r).toEqual({ kind: 'ok', url: URL_OK, existed: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://app.partee.es/resources/api/reservation/external/checkinonline/link/create');
    expect(calls[0].init.method).toBe('POST');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({ id: 7053549, requestDocs: false, sendLinkToGuest: false });
    expect(Object.keys(body).sort()).toEqual(['id', 'requestDocs', 'sendLinkToGuest']);
    expect(body).not.toHaveProperty('reservationID');
    expect(String(calls[0].init.body)).not.toContain('forceLinkCreation');
    expect(String(calls[0].init.body)).not.toMatch(/reservationI[dD]/);
  });

  it('a numeric string id is sent as a number', async () => {
    const { c, calls } = client({ body: { error: false, checkInOnlineURL: URL_OK } });
    await c.createCheckinLink('7053549');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.id).toBe(7053549);
    expect(typeof body.id).toBe('number');
  });

  it.each([null, undefined, 0, -1, 1.5, 'abc', '', ' ', '1.5', '-3', NaN, Infinity, {}, []])(
    'invalid id %j => link:bad_id and no fetch call',
    async (bad) => {
      const { c, calls } = client({ body: { error: false, checkInOnlineURL: URL_OK } });
      expect(await c.createCheckinLink(bad)).toEqual({ kind: 'error', status: 0, detail: 'link:bad_id' });
      expect(calls).toHaveLength(0);
    },
  );

  it('"already existed" is not an error', async () => {
    const { c } = client({
      body: { error: false, errorMessage: 'The checkIn Online URL already existed', checkInOnlineURL: URL_OK },
    });
    expect(await c.createCheckinLink(1)).toEqual({ kind: 'ok', url: URL_OK, existed: true });
  });

  it('maps statuses, each with its short detail', async () => {
    expect(await client({ status: 401 }).c.createCheckinLink(1)).toEqual({ kind: 'unauthorized', detail: 'link:401' });
    expect(await client({ status: 403 }).c.createCheckinLink(1)).toEqual({ kind: 'forbidden', detail: 'link:403' });
    expect(await client({ status: 404 }).c.createCheckinLink(1)).toEqual({ kind: 'not_found', detail: 'link:404' });
    expect(await client({ status: 429, headers: { 'retry-after': '30' } }).c.createCheckinLink(1)).toEqual({
      kind: 'rate_limited',
      retryAfter: '30',
      detail: 'link:429',
    });
  });

  describe('detail variants', () => {
    it('link:400 with Partee errorMessage', async () => {
      const { c } = client({ status: 400, body: { error: true, errorMessage: 'Reservation not valid', other: 'x' } });
      expect(await c.createCheckinLink(1)).toEqual({
        kind: 'error',
        status: 400,
        detail: 'link:400 "Reservation not valid"',
      });
    });
    it('link:500 without message (empty body, non-JSON body, message not a string)', async () => {
      expect(await client({ status: 500, text: '' }).c.createCheckinLink(1)).toEqual({
        kind: 'error',
        status: 500,
        detail: 'link:500',
      });
      expect(await client({ status: 500, text: '<html>oops</html>' }).c.createCheckinLink(1)).toEqual({
        kind: 'error',
        status: 500,
        detail: 'link:500',
      });
      expect(await client({ status: 503, body: { errorMessage: 42 } }).c.createCheckinLink(1)).toEqual({
        kind: 'error',
        status: 503,
        detail: 'link:503',
      });
    });
    it('link:error_flag (200 with error:true), with and without message', async () => {
      expect(
        await client({ body: { error: true, errorMessage: 'Cannot create' } }).c.createCheckinLink(1),
      ).toEqual({ kind: 'error', status: 200, detail: 'link:error_flag "Cannot create"' });
      expect(await client({ body: { error: true } }).c.createCheckinLink(1)).toEqual({
        kind: 'error',
        status: 200,
        detail: 'link:error_flag',
      });
    });
    it('link:bad_json', async () => {
      expect(await client({ text: 'nope' }).c.createCheckinLink(1)).toEqual({
        kind: 'error',
        status: 200,
        detail: 'link:bad_json',
      });
    });
    it('link:bad_url (missing URL or foreign host); the URL itself is not in the detail', async () => {
      expect(await client({ body: { error: false } }).c.createCheckinLink(1)).toEqual({
        kind: 'error',
        status: 200,
        detail: 'link:bad_url',
      });
      const r = await client({
        body: { error: false, checkInOnlineURL: 'https://evil.example/partee.es/x' },
      }).c.createCheckinLink(1);
      expect(r).toEqual({ kind: 'error', status: 200, detail: 'link:bad_url' });
      expect(JSON.stringify(r)).not.toContain('evil.example');
    });
    it('link:network (fetch threw) and nothing is logged', async () => {
      const log = vi.spyOn(console, 'log');
      const err = vi.spyOn(console, 'error');
      const c = new PartneeLinkClient('tkn', (async () => {
        throw new Error('boom');
      }) as unknown as typeof fetch);
      expect(await c.createCheckinLink(1)).toEqual({ kind: 'error', status: 0, detail: 'link:network' });
      expect(log).not.toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
    });
    it('only the sanitised errorMessage leaves: never the URL, the token or other body fields', async () => {
      const { c } = client({
        status: 400,
        body: { error: true, errorMessage: 'Bad request', checkInOnlineURL: URL_OK, parteID: 7, guest: 'Zzyzx Qwerty' },
      });
      const r = await c.createCheckinLink(1);
      const out = JSON.stringify(r);
      for (const leak of [URL_OK, 'Zzyzx', 'tkn', '"parteID"']) expect(out).not.toContain(leak);
    });
    it('a long errorMessage is cut to 150 characters', async () => {
      const long = 'x'.repeat(400);
      const r = await client({ status: 400, body: { errorMessage: long } }).c.createCheckinLink(1);
      expect(r).toEqual({ kind: 'error', status: 400, detail: `link:400 "${'x'.repeat(150)}"` });
    });
    it('an errorMessage containing "@" is dropped', async () => {
      const r = await client({ status: 400, body: { errorMessage: 'Guest john@example.com not found' } }).c.createCheckinLink(1);
      expect(r).toEqual({ kind: 'error', status: 400, detail: 'link:400' });
      const flag = await client({ body: { error: true, errorMessage: 'a@b.c' } }).c.createCheckinLink(1);
      expect(flag).toEqual({ kind: 'error', status: 200, detail: 'link:error_flag' });
    });
  });
});

describe('safeMessage', () => {
  it('keeps short plain messages, collapsing whitespace and turning double quotes into single ones', () => {
    expect(safeMessage('  Invalid\n  reservation ')).toBe('Invalid reservation');
    expect(safeMessage('Field "x" missing')).toBe("Field 'x' missing");
  });
  it('truncates to exactly MESSAGE_MAX (150) characters', () => {
    expect(MESSAGE_MAX).toBe(150);
    expect(safeMessage('y'.repeat(151))).toBe('y'.repeat(150));
    expect(safeMessage('y'.repeat(150))).toBe('y'.repeat(150));
    expect(safeMessage('y'.repeat(149))).toBe('y'.repeat(149));
  });
  it('drops a message containing "@", even if it would fit', () => {
    expect(safeMessage('contact me@x.es')).toBeNull();
    expect(safeMessage('@')).toBeNull();
    expect(safeMessage(`${'z'.repeat(200)}@`)).toBeNull();
  });
  it('drops non-strings and empty strings', () => {
    for (const v of [undefined, null, 42, {}, [], '', '   ']) expect(safeMessage(v)).toBeNull();
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
