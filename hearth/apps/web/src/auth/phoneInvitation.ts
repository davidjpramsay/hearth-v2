export function phoneInvitationFromHash(hash: string): string | null {
  if (hash.length > 100) return null;
  const match = /^#connect-phone=([A-Za-z0-9_-]{43})$/.exec(hash);
  return match?.[1] ?? null;
}
