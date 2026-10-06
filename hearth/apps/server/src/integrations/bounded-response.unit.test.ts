import { describe, expect, it, vi } from 'vitest';
import { DAVClient } from 'tsdav';
import { boundResponse } from './bounded-response.js';
import { createCalDavTransport } from './caldav-transport.js';

describe('provider transport boundaries', () => {
  it('preserves approved well-known discovery redirects for the real DAV client', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const request = input as Request;
      const path = new URL(request.url).pathname;
      if (path === '/.well-known/caldav')
        return new Response(null, {
          status: 307,
          headers: { location: '/dav/' },
        });
      if (path === '/dav/')
        return new Response(
          `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/principal/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,
          { status: 207, headers: { 'content-type': 'application/xml' } },
        );
      if (path === '/principal/')
        return new Response(
          `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/principal/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/dav/home/</d:href></c:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,
          { status: 207, headers: { 'content-type': 'application/xml' } },
        );
      return new Response(null, { status: 404 });
    });
    const client = new DAVClient({
      serverUrl: 'https://calendar.test',
      credentials: { username: 'fixture', password: 'fixture-secret' },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
      fetch: createCalDavTransport('https://calendar.test', fetcher),
    });
    await client.login();
    expect(client.account?.rootUrl).toBe('https://calendar.test/dav/');
    expect(client.account?.homeUrl).toBe('https://calendar.test/dav/home/');
    fetcher.mockResolvedValueOnce(
      new Response(null, { status: 307, headers: { location: 'https://untrusted.example/' } }),
    );
    await expect(
      createCalDavTransport('https://calendar.test', fetcher)(
        'https://calendar.test/.well-known/caldav',
        { redirect: 'manual' },
      ),
    ).rejects.toThrow(/not approved/);
  });
  it('rejects decoded streaming overflow even with a false content length', async () => {
    const cancelled = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(20));
          controller.enqueue(new Uint8Array(20));
        },
        cancel: cancelled,
      }),
      { headers: { 'content-length': '1' } },
    );
    await expect(boundResponse(response, 30, AbortSignal.timeout(1000))).rejects.toThrow(
      /size limit/,
    );
    expect(cancelled).toHaveBeenCalled();
  });

  it('terminates a stalled response body and preserves a legitimate response', async () => {
    await expect(
      boundResponse(new Response(new ReadableStream()), 30, AbortSignal.timeout(10)),
    ).rejects.toThrow();
    const result = await boundResponse(
      new Response('safe', { headers: { etag: 'checked' } }),
      30,
      AbortSignal.timeout(1000),
    );
    expect(await result.text()).toBe('safe');
    expect(result.headers.get('etag')).toBe('checked');
  });

  it.each([
    'http://caldav.icloud.com/a',
    'https://caldav.icloud.com.evil.test/a',
    'https://127.0.0.1/a',
    'https://caldav.icloud.com:8443/a',
    'https://other.test/a',
  ])('rejects %s before transmitting credentials', async (url) => {
    const fetcher = vi.fn<typeof fetch>();
    const transport = createCalDavTransport('https://caldav.icloud.com', fetcher);
    await expect(transport(url, { headers: { Authorization: 'Basic private' } })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('retains approved iCloud shard discovery but blocks a subsequent unsafe redirect', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: 'https://p12-caldav.icloud.com/home' },
        }),
      )
      .mockResolvedValueOnce(new Response('<d:multistatus/>'));
    const transport = createCalDavTransport('https://caldav.icloud.com', fetcher);
    await transport('https://caldav.icloud.com', {
      method: 'PROPFIND',
      headers: { Authorization: 'Basic private' },
    });
    expect((fetcher.mock.calls[1]?.[0] as Request).url).toBe('https://p12-caldav.icloud.com/home');
    expect((fetcher.mock.calls[1]?.[0] as Request).headers.get('authorization')).toBe(
      'Basic private',
    );
    fetcher.mockResolvedValueOnce(
      new Response(null, { status: 307, headers: { location: 'http://127.0.0.1/private' } }),
    );
    await expect(transport('https://caldav.icloud.com')).rejects.toThrow(/not approved/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('bounds collection expansion and rejects XML entity declarations before parsing', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<d:response/>'.repeat(129)))
      .mockResolvedValueOnce(new Response('<!DOCTYPE data [<!ENTITY huge "value">]><d:response/>'));
    const transport = createCalDavTransport('https://calendar.test', fetcher);
    await expect(transport('https://calendar.test', { method: 'PROPFIND' })).rejects.toThrow(
      /too many entries/,
    );
    await expect(transport('https://calendar.test', { method: 'REPORT' })).rejects.toThrow(
      /parsing budget/,
    );
  });
});
