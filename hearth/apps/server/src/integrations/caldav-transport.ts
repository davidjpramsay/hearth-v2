import { boundResponse } from './bounded-response.js';

const ICLOUD_HOST = /^(?:caldav|p\d{1,3}-caldav)\.icloud\.com$/;

/** Credentials may cross only explicitly trusted DAV origins, never arbitrary discovery hrefs. */
export function createCalDavTransport(
  serverUrl: string,
  fetcher: typeof fetch = fetch,
): typeof fetch {
  const server = new URL(serverUrl);
  let windowStart = Date.now();
  let requests = 0;
  let bytes = 0;
  let active = 0;
  const waiters: Array<() => void> = [];
  const allowed = (url: URL) =>
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    (url.origin === server.origin ||
      (server.port === '' &&
        ICLOUD_HOST.test(server.hostname) &&
        url.port === '' &&
        ICLOUD_HOST.test(url.hostname)));

  return async (input, init) => {
    const redirect = init?.redirect ?? (input instanceof Request ? input.redirect : 'follow');
    const deadline = AbortSignal.timeout(15_000);
    const suppliedSignal = init?.signal ?? (input instanceof Request ? input.signal : null);
    const signal = suppliedSignal === null ? deadline : AbortSignal.any([suppliedSignal, deadline]);
    let request = new Request(input, { ...init, redirect: 'manual', signal });
    if (Date.now() - windowStart >= 60_000) {
      windowStart = Date.now();
      requests = 0;
      bytes = 0;
    }
    if (++requests > 256 || bytes > 32 * 1024 * 1024)
      throw new Error('Calendar refresh budget exceeded.');
    if (!allowed(new URL(request.url)))
      throw new Error('Calendar request destination is not approved.');
    if (active >= 4)
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal.removeEventListener('abort', abort);
          resolve();
        };
        const abort = () => {
          const index = waiters.indexOf(ready);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Calendar request timed out.'));
        };
        if (signal.aborted) {
          reject(new Error('Calendar request timed out.'));
          return;
        }
        waiters.push(ready);
        signal.addEventListener('abort', abort, { once: true });
      });
    else active += 1;
    try {
      for (let hops = 0; hops < 4; hops += 1) {
        signal.throwIfAborted();
        const response = await fetcher(request.clone());
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          void response.body?.cancel().catch(() => undefined);
          const location = response.headers.get('location');
          if (location === null) throw new Error('Calendar redirect has no destination.');
          const next = new URL(location, request.url);
          if (!allowed(next)) throw new Error('Calendar redirect destination is not approved.');
          if (redirect === 'error')
            throw new Error('Calendar redirects are disabled for this request.');
          if (redirect === 'manual') {
            // tsdav's well-known discovery needs the approved Location to choose its DAV root.
            const headers = new Headers(response.headers);
            headers.set('location', next.href);
            return new Response(null, { status: response.status, headers });
          }
          request = new Request(next, request);
          continue;
        }
        const bounded = await boundResponse(response, 8 * 1024 * 1024, signal);
        const text = await bounded.clone().text();
        bytes += Buffer.byteLength(text);
        if (bytes > 32 * 1024 * 1024 || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) {
          throw new Error('Calendar response is outside its safe parsing budget.');
        }
        if (request.method === 'PROPFIND' || request.method === 'REPORT') {
          const responses = text.match(/<(?:[^\s<>/:]+:)?response(?:\s|\/?>)/gi)?.length ?? 0;
          if (responses > (request.method === 'PROPFIND' ? 128 : 10_000))
            throw new Error('Calendar response returned too many entries.');
        }
        return bounded;
      }
      throw new Error('Calendar returned too many redirects.');
    } finally {
      const next = waiters.shift();
      if (next === undefined) active -= 1;
      else next();
    }
  };
}
