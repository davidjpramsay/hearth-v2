import { randomUUID } from 'node:crypto';
import type { FastifyReply } from 'fastify';

import { RepositoryError } from './repository.js';

type Headers = Record<string, string | string[] | undefined>;
const COOKIE = 'hearth_browser_context';
const LIFETIME = 5 * 60_000;

// Correlation only: this nonce grants no household or adult authority.
// It binds a ceremony to its browser and lets pairing cancel in-flight proofs.
export class BrowserAccess {
  private readonly pending = new Map<string, Set<{ allowed: boolean }>>();
  private readonly ceremonies = new Map<string, { context: string; expiresAt: number }>();
  private count = 0;

  constructor(private readonly now: () => number = Date.now) {}

  establish(headers: Headers, reply: FastifyReply, secure: boolean): string {
    const id = this.context(headers) ?? randomUUID();
    reply.header(
      'Set-Cookie',
      `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=600${secure ? '; Secure' : ''}`,
    );
    return id;
  }

  begin(headers: Headers, reply: FastifyReply, secure: boolean, verification: boolean) {
    if (verification && this.context(headers) === null) this.reject();
    if (this.count >= 256)
      throw new RepositoryError('FORBIDDEN', 'Too many sign-in attempts. Try again shortly.');
    const id = this.establish(headers, reply, secure);
    const state = { allowed: true };
    const expiresAt = this.now() + LIFETIME;
    const requests = this.pending.get(id) ?? new Set<{ allowed: boolean }>();
    requests.add(state);
    this.pending.set(id, requests);
    this.count++;
    return {
      id,
      assertAllowed: () => {
        if (!state.allowed || this.now() >= expiresAt) this.reject();
      },
      finish: () => {
        state.allowed = false;
        if (requests.delete(state)) this.count--;
        if (requests.size === 0) this.pending.delete(id);
      },
    };
  }

  bind(context: string, ceremonyId: string): void {
    for (const [id, ceremony] of this.ceremonies) {
      if (ceremony.expiresAt <= this.now()) this.ceremonies.delete(id);
    }
    if (this.ceremonies.size >= 512)
      throw new RepositoryError('FORBIDDEN', 'Too many sign-in attempts. Try again shortly.');
    this.ceremonies.set(ceremonyId, { context, expiresAt: this.now() + LIFETIME });
  }

  verify(headers: Headers, ceremonyId: string): void {
    const ceremony = this.ceremonies.get(ceremonyId);
    if (
      ceremony === undefined ||
      ceremony.context !== this.context(headers) ||
      ceremony.expiresAt <= this.now()
    )
      this.reject();
    this.ceremonies.delete(ceremonyId);
  }

  pair(headers: Headers): void {
    const id = this.context(headers);
    if (id === null) return;
    for (const request of this.pending.get(id) ?? []) request.allowed = false;
    for (const [ceremonyId, ceremony] of this.ceremonies) {
      if (ceremony.context === id) this.ceremonies.delete(ceremonyId);
    }
  }

  private reject(): never {
    throw new RepositoryError(
      'FORBIDDEN',
      'Start passkey sign-in again on your own phone or computer.',
    );
  }

  private context(headers: Headers): string | null {
    if (typeof headers.cookie !== 'string') return null;
    for (const part of headers.cookie.split(';')) {
      const [name, value] = part.trim().split('=');
      if (
        name === COOKIE &&
        value !== undefined &&
        /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
      )
        return value;
    }
    return null;
  }
}
