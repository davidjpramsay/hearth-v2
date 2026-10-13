import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { createFirstPhoneScreen } from '../../scripts/first-phone-screen.mjs';

const folders: string[] = [];
const screens: Awaited<ReturnType<typeof createFirstPhoneScreen>>[] = [];
const secret = 'a'.repeat(64); // Fictional deterministic test proof; never provisions a household.
const status = {
  mode: 'private',
  configured: true,
  secureOrigin: true,
  accessMethod: 'phone',
  authenticated: false,
  actor: null,
  requiresSetup: true,
};
afterEach(async () => {
  for (const screen of screens.splice(0)) await screen.close();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
async function fixture(initial = status) {
  const folder = mkdtempSync(join(tmpdir(), 'hearth-private-screen-test-'));
  folders.push(folder);
  const keyFile = join(folder, 'fixture-key');
  writeFileSync(keyFile, secret, { mode: 0o600 });
  const fetchStatus = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(initial));
  const screen = await createFirstPhoneScreen({
    keyFile,
    origin: 'https://hearth.example.test',
    fetchStatus,
  });
  screens.push(screen);
  return { screen, fetchStatus, keyFile };
}
async function state(url: string) {
  return (await fetch(`${url}state`)).json();
}
async function rawStatus(url: string, headers: Record<string, string>) {
  return new Promise<number | undefined>((accept, reject) => {
    const req = request(url, { headers }, (response) => {
      response.resume();
      response.on('end', () => accept(response.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('trusted local first-start screen', () => {
  it('renders original branding/copy but no proof or setup link in its document/status', async () => {
    const { screen, fetchStatus } = await fixture();
    const response = await fetch(screen.url);
    const html = await response.text();
    expect(new URL(screen.url).hostname).toBe('127.0.0.1');
    expect(new URL(screen.url).pathname).toMatch(/^\/[A-Za-z0-9_-]{43}\/$/);
    expect(html).toContain('<title>Hearth setup</title>');
    expect(html).toContain('Welcome to Hearth');
    expect(html).toContain('Scan with your phone’s camera to set up your home.');
    expect(html).not.toContain(secret);
    expect(html).not.toContain('#setup-phone=');
    expect(await state(screen.url)).toEqual({ state: 'ready' });
    expect(fetchStatus).toHaveBeenCalledWith(
      'https://hearth.example.test/api/v1/auth/status',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'application/json' },
      }),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('content-security-policy')).not.toContain('unsafe-inline');
    const image = await fetch(`${screen.url}qr`);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(
      await QRCode.toBuffer(`https://hearth.example.test/#setup-phone=${secret}`, {
        type: 'png',
        width: 1024,
        margin: 4,
        errorCorrectionLevel: 'M',
      }),
    );
  });
  it('requires the random local path and rejects rebinding/cross-site access and writes', async () => {
    const { screen } = await fixture();
    expect((await fetch(new URL('/', screen.url))).status).toBe(404);
    expect((await fetch(new URL('/state', screen.url))).status).toBe(404);
    expect(await rawStatus(screen.url, { Host: 'attacker.example' })).toBe(403);
    expect(await rawStatus(`${screen.url}qr`, { 'Sec-Fetch-Site': 'cross-site' })).toBe(403);
    expect(await rawStatus(`${screen.url}qr`, { 'Sec-Fetch-Site': 'same-site' })).toBe(403);
    expect(
      (await fetch(screen.url, { headers: { Origin: 'https://attacker.example' } })).status,
    ).toBe(403);
    expect((await fetch(screen.url, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${screen.url}qr?key=anything`)).status).toBe(404);
  });
  it('hides QR on an unreadable server and restores only after a successful configured read', async () => {
    const { screen, fetchStatus } = await fixture();
    fetchStatus.mockRejectedValue(new Error('private error must not be exposed'));
    await vi.waitFor(
      async () => expect(await state(screen.url)).toEqual({ state: 'unavailable' }),
      { timeout: 4000, interval: 100 },
    );
    expect((await fetch(`${screen.url}qr`)).status).toBe(404);
    fetchStatus.mockImplementation(async () => Response.json(status));
    await vi.waitFor(async () => expect(await state(screen.url)).toEqual({ state: 'ready' }), {
      timeout: 4000,
      interval: 100,
    });
    expect((await fetch(`${screen.url}qr`)).status).toBe(200);
  }, 10000);
  it('permanently removes QR after claim and never reopens for missing/expired phones', async () => {
    const { screen, fetchStatus } = await fixture();
    fetchStatus.mockImplementation(async () => Response.json({ ...status, requiresSetup: false }));
    await vi.waitFor(async () => expect(await state(screen.url)).toEqual({ state: 'complete' }), {
      timeout: 4000,
      interval: 100,
    });
    expect((await fetch(`${screen.url}qr`)).status).toBe(404);
    const calls = fetchStatus.mock.calls.length;
    fetchStatus.mockImplementation(async () => Response.json(status));
    await new Promise((accept) => setTimeout(accept, 2100));
    expect(fetchStatus.mock.calls.length).toBe(calls);
    expect(await state(screen.url)).toEqual({ state: 'complete' });
    expect((await fetch(`${screen.url}qr`)).status).toBe(404);
  }, 10000);
  it('already claimed installations do not read a key or serve a QR', async () => {
    const fetchStatus = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        ...status,
        requiresSetup: false,
      }),
    );
    const screen = await createFirstPhoneScreen({
      keyFile: '/does-not-exist',
      origin: 'https://hearth.example.test',
      fetchStatus,
    });
    screens.push(screen);
    expect(await state(screen.url)).toEqual({ state: 'complete' });
    expect((await fetch(`${screen.url}qr`)).status).toBe(404);
  });
  it.each([
    { ...status, configured: false },
    { ...status, mode: 'demo' },
    { ...status, secureOrigin: false },
    { ...status, accessMethod: 'passkey' },
    { ...status, requiresSetup: 'yes' },
    { ...status, authenticated: true },
    { ...status, actor: { displayName: 'Fictional' } },
  ])('fails closed for an unexpected auth status %#', async (value) => {
    await expect(
      createFirstPhoneScreen({
        keyFile: '/does-not-exist',
        origin: 'https://hearth.example.test',
        fetchStatus: async () => Response.json(value),
      }),
    ).rejects.toThrow('Configured private phone access required');
  });
  it('rejects oversized status, redirects and non-HTTPS origins', async () => {
    await expect(
      createFirstPhoneScreen({
        keyFile: '/does-not-exist',
        origin: 'https://hearth.example.test',
        fetchStatus: async () => new Response('x'.repeat(8193)),
      }),
    ).rejects.toThrow('Status too large');
    await expect(
      createFirstPhoneScreen({ keyFile: '/does-not-exist', origin: 'http://hearth.example.test' }),
    ).rejects.toThrow('Trusted HTTPS origin required');
    await expect(
      createFirstPhoneScreen({
        keyFile: '/does-not-exist',
        origin: 'https://hearth.example.test',
        fetchStatus: async () => new Response(null, { status: 302 }),
      }),
    ).rejects.toThrow('Status unavailable');
  });
});
// @vitest-environment node
