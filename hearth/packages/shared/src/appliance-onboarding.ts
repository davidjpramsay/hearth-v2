import { z } from 'zod';
import { OpaqueIdSchema, TimezoneSchema } from './schemas.js';

// D-104 foundation only. These DTOs are not authorization and have no active routes.
// Proof verification, device identity and secure local transport belong to adapters.
export const APPLIANCE_ONBOARDING_VERSION = 1 as const;
export const APPLIANCE_QR_MAX_CHARACTERS = 1024;

// Canonical unpadded base64url for 32 bytes. Shape cannot prove random generation.
const PrivateProof = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
const Fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const Label = z.string().trim().min(1).max(80);
const Version = z.literal(APPLIANCE_ONBOARDING_VERSION);
const CommonQr = {
  format: z.literal('hearth.appliance-qr'),
  version: Version,
  applianceId: OpaqueIdSchema,
  identityFingerprint: Fingerprint,
};

export const ApplianceSetupQrSchema = z
  .object({
    ...CommonQr,
    purpose: z.literal('setup'),
    generation: z.literal(0),
    setupSecret: PrivateProof,
  })
  .strict();

export const ApplianceRecoveryQrSchema = z
  .object({
    ...CommonQr,
    purpose: z.literal('recovery'),
    generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    recoverySecret: PrivateProof,
  })
  .strict();

export const ApplianceQrSchema = z.discriminatedUnion('purpose', [
  ApplianceSetupQrSchema,
  ApplianceRecoveryQrSchema,
]);

export type ApplianceQr = z.infer<typeof ApplianceQrSchema>;

// A native scanner must check purpose and independently authenticate the pinned
// device before using this data. Never send the QR text to logging/analytics.
export function decodeApplianceQr(text: unknown): ApplianceQr | null {
  if (typeof text !== 'string' || text.length > APPLIANCE_QR_MAX_CHARACTERS) return null;
  try {
    const result = ApplianceQrSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function encodeApplianceQr(value: ApplianceQr): string {
  const result = ApplianceQrSchema.safeParse(value);
  if (!result.success) throw new Error('That Hearth code is not supported.');
  return JSON.stringify(result.data);
}

// Discovery is public, non-authoritative metadata. No household or credential.
export const ApplianceDiscoverySchema = z
  .object({
    version: Version,
    applianceId: OpaqueIdSchema,
    claimState: z.enum(['unclaimed', 'claimed']),
    transports: z
      .array(z.enum(['ethernet', 'wifi', 'bluetooth-le']))
      .min(1)
      .max(3)
      .refine((items) => new Set(items).size === items.length, 'Duplicate transport'),
  })
  .strict();

// Metadata inside a separately authenticated commissioning channel, not a
// public HTTP claim. Callers cannot choose capabilities or recovery authorities.
export const ApplianceInitialClaimSchema = z
  .object({
    version: Version,
    requestId: OpaqueIdSchema,
    applianceId: OpaqueIdSchema,
    householdName: z.string().trim().min(1).max(100),
    adultName: Label,
    phoneName: Label,
    timezone: TimezoneSchema,
  })
  .strict();

// Recovery proof determines the existing adult. No client-selected member/role.
export const ApplianceRecoveryClaimSchema = z
  .object({
    version: Version,
    requestId: OpaqueIdSchema,
    applianceId: OpaqueIdSchema,
    generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    phoneName: Label,
  })
  .strict();

// Authenticated, adult-only policy projection. It is not a writable request.
export const ApplianceRecoveryPolicySchema = z
  .object({
    version: Version,
    ownerMemberId: OpaqueIdSchema,
    recoveryAdultIds: z
      .array(OpaqueIdSchema)
      .min(1)
      .max(20)
      .refine((items) => new Set(items).size === items.length, 'Duplicate adult'),
    // User acknowledgement, not proof that an offline copy actually survives.
    offlineRecoveryAcknowledged: z.boolean(),
  })
  .strict()
  .refine((policy) => policy.recoveryAdultIds.includes(policy.ownerMemberId), {
    message: 'The owner remains a recovery authority',
    path: ['recoveryAdultIds'],
  });

export type ApplianceDiscovery = z.infer<typeof ApplianceDiscoverySchema>;
export type ApplianceInitialClaim = z.infer<typeof ApplianceInitialClaimSchema>;
export type ApplianceRecoveryClaim = z.infer<typeof ApplianceRecoveryClaimSchema>;
export type ApplianceRecoveryPolicy = z.infer<typeof ApplianceRecoveryPolicySchema>;
