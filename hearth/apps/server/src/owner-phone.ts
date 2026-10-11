import type Database from 'better-sqlite3';

export const OWNER_PHONE_PROTECTED =
  'The owner phone is protected. Replace it using a fresh key from the protected server file.';

// Ownership comes only from a backend-issued key, never a client label or role claim.
export function hasOwnerPhone(
  database: InstanceType<typeof Database>,
  householdId: string,
  memberId: string,
): boolean {
  return Boolean(
    database
      .prepare(
        "SELECT 1 FROM controller_phone_connections WHERE household_id=? AND member_id=? AND source='owner' AND revoked_at IS NULL",
      )
      .get(householdId, memberId),
  );
}
