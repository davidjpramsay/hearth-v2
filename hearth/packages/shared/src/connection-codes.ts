import { z } from 'zod';

/** Human invitations only. Never use this alphabet/entropy for a device credential. */
export const CONNECTION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ConnectionCodeSchema = z.string().regex(/^[A-HJ-NP-Z]{6}$/);
export function normalizeConnectionCode(value: string): string {
  return value
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6);
}
