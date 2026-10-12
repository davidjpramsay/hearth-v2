export function phoneInvitationFromHash(hash: string): string | null {
  if (hash.length > 100) return null;
  const match = /^#connect-phone=([A-Za-z0-9_-]{43})$/.exec(hash);
  return match?.[1] ?? null;
}

export type PrivatePhoneIntent = { purpose: 'setup' | 'recovery'; secret: string };
export function privatePhoneIntentFromHash(hash: string): PrivatePhoneIntent | null {
  if (hash.length > 180) return null;
  const setup = /^#setup-phone=([A-Za-z0-9_-]{32,160})$/.exec(hash);
  if (setup?.[1]) return { purpose: 'setup', secret: setup[1] };
  const recovery = /^#recover-phone=([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/.exec(hash);
  return recovery?.[1] ? { purpose: 'recovery', secret: recovery[1] } : null;
}

export function stripPhoneIntentFragment(): void {
  if (/^#(?:connect-phone|setup-phone|recover-phone)=/.test(window.location.hash))
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
}
