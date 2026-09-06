import { isIP } from 'node:net';

export function parseTrustedProxyAddresses(value: string | undefined): string[] {
  if (value === undefined || value.trim() === '') return [];
  const addresses = value.split(',').map((entry) => entry.trim());
  for (const entry of addresses) {
    const [address = '', prefix, extra] = entry.split('/');
    const family = isIP(address);
    if (
      family === 0 ||
      extra !== undefined ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)))
    ) {
      throw new Error(
        'HEARTH_TRUST_PROXY_ADDRESSES must contain explicit proxy IP addresses or CIDRs.',
      );
    }
  }
  return addresses;
}
