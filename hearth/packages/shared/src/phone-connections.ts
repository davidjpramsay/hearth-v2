import { z } from 'zod';
import { OpaqueIdSchema, TimestampSchema, TimezoneSchema } from './schemas.js';

const PhoneName = z.string().trim().min(1).max(80);
export const PhoneSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);
export const OwnerPhoneClaimSchema = z
  .object({
    ownerKey: z.string().trim().min(32).max(160),
    phoneName: PhoneName,
    householdName: z.string().trim().min(1).max(100).optional(),
    adultName: z.string().trim().min(1).max(80).optional(),
    timezone: TimezoneSchema.optional(),
  })
  .strict();
export const PhoneInvitationCreateSchema = z
  .object({
    memberId: OpaqueIdSchema,
    requestId: OpaqueIdSchema,
  })
  .strict();
export const PhoneInvitationClaimSchema = z
  .object({
    invitationSecret: PhoneSecretSchema,
    phoneName: PhoneName,
  })
  .strict();
export const PhoneCommandSchema = z.object({ requestId: OpaqueIdSchema }).strict();
export const PhoneConnectionSchema = z.object({
  id: OpaqueIdSchema,
  memberId: OpaqueIdSchema,
  adultName: z.string(),
  phoneName: PhoneName,
  source: z.enum(['owner', 'qr', 'legacy']),
  createdAt: TimestampSchema,
  lastSeenAt: TimestampSchema,
  expiresAt: TimestampSchema,
  current: z.boolean(),
});
export const PhoneConnectionsSchema = z.object({
  connections: z.array(PhoneConnectionSchema).max(100),
  adults: z.array(z.object({ id: OpaqueIdSchema, displayName: z.string() })),
});
export const PhoneInvitationStateSchema = z.object({
  id: OpaqueIdSchema,
  state: z.enum(['waiting', 'scanned', 'approved', 'connected', 'cancelled', 'expired']),
  adultName: z.string(),
  phoneName: PhoneName.nullable(),
  expiresAt: TimestampSchema,
  purpose: z.enum(['connect', 'recover-owner']).optional(),
});
export const PhoneInvitationRevealSchema = PhoneInvitationStateSchema.extend({
  qrUrl: z.string().url(),
});
export const PhonePendingSchema = PhoneInvitationStateSchema.nullable();
export const PhoneConfirmationSchema = z.object({
  confirmed: z.literal(true),
  expiresAt: TimestampSchema,
});
export const PhoneRemovalSchema = z.object({ removed: z.literal(true), current: z.boolean() });

export type OwnerPhoneClaim = z.infer<typeof OwnerPhoneClaimSchema>;
export type PhoneConnection = z.infer<typeof PhoneConnectionSchema>;
export type PhoneConnections = z.infer<typeof PhoneConnectionsSchema>;
export type PhoneInvitationState = z.infer<typeof PhoneInvitationStateSchema>;
export type PhoneInvitationReveal = z.infer<typeof PhoneInvitationRevealSchema>;

export const PhoneRecoveryAdultSchema = z.object({
  memberId: OpaqueIdSchema,
  displayName: z.string(),
  connected: z.boolean(),
  trusted: z.boolean(),
  phones: z
    .array(
      z.object({
        connectionId: OpaqueIdSchema,
        phoneName: PhoneName,
        trusted: z.boolean(),
      }),
    )
    .max(100),
});
export const PhoneRecoverySummarySchema = z.object({
  available: z.boolean(),
  ownerName: z.string().nullable(),
  canManage: z.boolean(),
  canRecoverOwner: z.boolean(),
  hasRecoveryCard: z.boolean(),
  adults: z.array(PhoneRecoveryAdultSchema).max(100),
});
export const PhoneRecoveryPolicyCommandSchema = z
  .object({
    requestId: OpaqueIdSchema,
    trustedConnectionIds: z
      .array(OpaqueIdSchema)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate adult'),
  })
  .strict();
export const PhoneRecoveryCardRevealSchema = z
  .object({
    id: OpaqueIdSchema,
    generation: z.number().int().positive(),
    qrUrl: z.string().url(),
    expiresAt: TimestampSchema,
  })
  .strict();
export const PhoneRecoveryCommandResultSchema = z.object({ accepted: z.literal(true) }).strict();
export const PhoneRecoveryClaimSchema = z
  .object({
    requestId: OpaqueIdSchema,
    recoverySecret: z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
    phoneName: PhoneName,
  })
  .strict();
export type PhoneRecoverySummary = z.infer<typeof PhoneRecoverySummarySchema>;
export type PhoneRecoveryCardReveal = z.infer<typeof PhoneRecoveryCardRevealSchema>;
export type PhoneRecoveryClaim = z.infer<typeof PhoneRecoveryClaimSchema>;
