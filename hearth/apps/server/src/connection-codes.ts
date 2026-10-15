import { randomInt } from 'node:crypto';
import { CONNECTION_CODE_ALPHABET } from '@hearth/shared';

export function createConnectionCode(): string {
  return Array.from(
    { length: 6 },
    () => CONNECTION_CODE_ALPHABET[randomInt(CONNECTION_CODE_ALPHABET.length)],
  ).join('');
}
