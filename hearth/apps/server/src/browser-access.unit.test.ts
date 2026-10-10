import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { BrowserAccess } from './browser-access.js';

function reply() {
  return { header: vi.fn() } as unknown as FastifyReply;
}
function contextCookie(access: BrowserAccess) {
  const id = access.establish({}, reply(), true);
  return { cookie: `hearth_browser_context=${id}` };
}

describe('bounded browser ceremony context', () => {
  it('uses an HttpOnly secure correlation cookie with no authority', () => {
    const response = reply();
    const access = new BrowserAccess();
    const id = access.establish({}, response, true);
    expect(response.header).toHaveBeenCalledWith(
      'Set-Cookie',
      `hearth_browser_context=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=600; Secure`,
    );
    expect(access.establish({ cookie: `hearth_browser_context=${id}` }, response, true)).toBe(id);
  });
  it('invalidates only the pairing browser, even while verification is running', () => {
    const access = new BrowserAccess();
    const screen = contextCookie(access);
    const phone = contextCookie(access);
    const pending = access.begin(screen, reply(), true, true);
    const other = access.begin(phone, reply(), true, true);
    access.bind(pending.id, 'ceremony_screen');
    access.bind(other.id, 'ceremony_phone');
    access.pair(screen);
    expect(pending.assertAllowed).toThrow();
    expect(other.assertAllowed).not.toThrow();
    expect(() => access.verify(screen, 'ceremony_screen')).toThrow();
    expect(() => access.verify(phone, 'ceremony_phone')).not.toThrow();
    pending.finish();
    other.finish();
  });
  it('rejects missing, malformed and cross-browser contexts without consuming the genuine ceremony', () => {
    const access = new BrowserAccess();
    const headers = contextCookie(access);
    const request = access.begin(headers, reply(), true, false);
    access.bind(request.id, 'ceremony_test');
    expect(() => access.begin({}, reply(), true, true)).toThrow();
    expect(() => access.verify({ cookie: 'hearth_browser_context=%' }, 'ceremony_test')).toThrow();
    expect(() => access.verify(contextCookie(access), 'ceremony_test')).toThrow();
    expect(() => access.verify(headers, 'ceremony_test')).not.toThrow();
    expect(() => access.verify(headers, 'ceremony_test')).toThrow();
    request.finish();
  });
  it('bounds pending requests, cleans up idempotently and rejects late or expired commits', () => {
    let now = 0;
    const access = new BrowserAccess(() => now);
    const headers = contextCookie(access);
    const requests = Array.from({ length: 256 }, () => access.begin(headers, reply(), true, false));
    expect(() => access.begin(headers, reply(), true, false)).toThrow();
    requests[0]!.finish();
    requests[0]!.finish();
    expect(requests[0]!.assertAllowed).toThrow();
    const next = access.begin(headers, reply(), true, false);
    access.bind(next.id, 'ceremony_expiring');
    now = 5 * 60_000;
    expect(next.assertAllowed).toThrow();
    expect(() => access.verify(headers, 'ceremony_expiring')).toThrow();
    requests.forEach((request) => request.finish());
    next.finish();
    expect(() => access.begin(headers, reply(), true, false)).not.toThrow();
  });
});
