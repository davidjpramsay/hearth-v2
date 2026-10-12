# Adult phone connections — v1 (D-102, D-103, D-104)

This is the locally implemented HTTP contract. D-104 extends owner protection with explicit
saved-card and exact trusted-phone recovery, plus scanned first-use cards for an already reachable
private HTTPS server. Publication/deployment and physical Safari acceptance are separate gates.
Native Bluetooth, Wi-Fi provisioning and trusted HDMI remain
[future appliance work](APPLIANCE_ONBOARDING_CONTRACT.md). Live access has not changed.

Private HTTPS only. No passwords or passkeys are required. The owner bootstraps the first
controller using a privately supplied setup QR derived from the external first-use file (or the
operator file fallback). Subsequent browsers scan a QR invitation
created by a connected controller, then wait for that controller's explicit approval.
An adult and a connection are separate identities; browsers/profiles are not hardware-attested.

### Protected owner phone (D-103)

The first key-connected phone is the household's protected owner phone (`source=owner`).
Only a deliberate D-104 recovery or fresh backend-issued one-use key may replace it. No adult
browser, including the owner itself, can casually remove it, sign it out, switch it with an ordinary QR, or convert
it into a shared screen. People cannot archive its adult or remove that adult's administrator
permission. Names, colours and profile photos remain editable. Other adult phones still manage
secondary phones and screens normally; an ordinary QR never grants owner-phone status.

The owner-key claim transaction revokes previous owner connections and their sessions/invitations,
creates the replacement owner and consumes the grant together. A failure rolls all of that back.
Other adult phones, legacy connections, TV grants, household contents and networking are untouched.
Issuing a file key does not disconnect anything; a newer issued key invalidates earlier unused
owner grants household-wide. An invalid, expired, reused or interrupted key claim cannot remove
the owner. `auth/status.ownerPhone` reports verified current-browser ownership; it is never input.

Expired ownership remains protected and visible in the phone list until authorized replacement.
Browser deletion, cookie loss or expiry cannot be prevented by Hearth; recover the owner with a
saved recovery card, exact trusted-phone replacement or fresh backend key, not an ordinary QR.
A restrictive mixed-cookie/shared-screen safety boundary may invalidate
browser sessions, but never removes the protected owner record or grants screen admin authority.
Ownership retains server-only provenance from migration 0028; migration 0029 adds explicit recovery.
Legacy access is never guessed to be the main phone; the first authorized owner-key claim establishes it.

## Authority and lifecycle

- A connected adult with `household.admin` can invite an existing active adult with that capability.
- QR invitation secrets contain 256 random bits, expire after five minutes, and are stored only
  as SHA-256 digests. Their link uses `#connect-phone=…`, never a query parameter. The recipient
  strips the fragment before claiming. No secret enters local/session storage, logs or audits.
- A scan binds one requesting browser using a separate random, HttpOnly pending cookie.
  The inviter confirms the named adult and phone. Only that original browser may exchange.
- Exchange rechecks the inviter's live session/connection and both adults' capabilities. It
  consumes the invitation atomically and issues a fresh, independently revocable connection.
  The approving phone's session and identity never change.
- Session secrets are random 256-bit Secure HttpOnly SameSite=Strict cookies, digest-only in
  SQLite. New sessions have a 180-day absolute lifetime and 90-day server-enforced idle limit.
- Secondary-phone revocation invalidates all linked sessions and invitations. It does not affect
  another adult, the owner phone, household data or the TV. Sign out removes only a secondary
  browser's connection; the owner phone has no application sign-out/removal path.
- Sensitive update confirmation is explicit recent consent from a connected adult browser,
  valid for five minutes. It is not biometric/user-verified reauthentication. Enrollment or
  session refresh does not set that consent timestamp. Protect connected phones with a lock.
- Limits: QR enrollment stops at 20 active connections; a privileged owner-issued recovery grant
  may exceed that cap so all-lost recovery cannot deadlock. Remove verified lost connections
  afterward, never automatically. Five live invitations per inviter and 50 retained household
  invitations, bounded anonymous attempts and periodic removal of expired invitation rows.

## Typed endpoints

`hearth/packages/shared/src/phone-connections.ts` defines request/response schemas.

| Endpoint                                                                    | Authority / result                                                                                                    |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/phones/owner-claims`                                     | External one-time owner key; first household input only when empty; creates/replaces protected owner phone and cookie |
| `POST /api/v1/auth/phones/invitation-claims`                                | QR secret + phone label; creates pending cookie, no adult access                                                      |
| `GET /api/v1/auth/phones/pending`                                           | Pending cookie; bounded status, no household data                                                                     |
| `POST /api/v1/auth/phones/exchanges`                                        | Approved originating pending cookie; one-use session issuance                                                         |
| `POST /api/v1/auth/phones/confirmations`                                    | Current authorized adult; recent explicit consent for sensitive update                                                |
| `GET /api/v1/households/:householdId/phone-connections`                     | Adult controller; names, last contact, expiry and current-connection flag                                             |
| `POST /api/v1/households/:householdId/phone-invitations`                    | Adult controller; target adult + requestId; QR revealed once                                                          |
| `GET /api/v1/households/:householdId/phone-invitations/:id`                 | Inviting connection only; scan/approval state                                                                         |
| `POST /api/v1/households/:householdId/phone-invitations/:id/approvals`      | Inviting connection + requestId; explicit confirm after scan                                                          |
| `POST /api/v1/households/:householdId/phone-invitations/:id/cancellations`  | Inviting connection + requestId; invalidate pending request                                                           |
| `POST /api/v1/households/:householdId/phone-connections/:id/revocations`    | Adult controller + requestId; independent secondary removal, owner always forbidden                                   |
| `GET /api/v1/households/:householdId/phone-recovery`                        | Adult controller; safe owner/card state and eligible exact phone connections; no proof or verifier                    |
| `POST /api/v1/households/:householdId/phone-recovery/policies`              | Exact current owner + recent consent; requestId and unique trustedConnectionIds, not member IDs                       |
| `POST /api/v1/households/:householdId/phone-recovery/cards`                 | Exact current owner + recent consent; requestId; private five-minute save preview                                     |
| `POST /api/v1/households/:householdId/phone-recovery/cards/:id/activations` | Same current owner; explicit saved-card UI acknowledgment; bounded idempotent activation                              |
| `POST /api/v1/households/:householdId/phone-recovery/invitations`           | Exact explicitly trusted live connection + recent consent; target owner derived server-side                           |
| `POST /api/v1/auth/phones/recovery-claims`                                  | Active saved-card proof + browser context + requestId + phoneName; deliberate owner replacement                       |

Command retries do not duplicate grants or audit effects. A lost QR-reveal response requires
canceling/creating a new invitation; raw secrets are never stored to reconstruct one. A lost
exchange reply can be retried only with the originating proof during the invitation lifetime,
while its issued session remains valid. A short process-memory receipt supplies the same cookie;
after a server restart or expiry a lost reply requires a new QR, never a duplicate grant or a
persisted raw credential. Expiry timers remove receipts even when no new requests arrive.

## Owner recovery and migration

D-104's private browser path uses `#setup-phone` and `#recover-phone` purpose-specific fragments;
these are stripped before network requests and held only in memory. Scanning a setup card hides
the copied-key input, but does not bypass the existing first-use verifier. A used first-use card
cannot recover an existing household. No unauthenticated route reveals any setup/recovery QR.

Only the exact current owner may designate already connected adult **connections** for recovery
or prepare/activate a card. Authority is never inferred from a matching name/member/role. An
ordinary invitation to the owner or a trusted adult creates a separate, untrusted connection.
Recovery invitations add `purpose=recover-owner` and freeze the current owner connection;
existing ordinary invitation responses remain unchanged. Claim/approval/exchange recheck the
original trusted connection, live sessions/capabilities and frozen owner. Revocation, untrusting,
demotion or concurrent owner replacement denies exchange without retiring the old owner.

Preparing a card stores only SHA-256 verifier/generation and a five-minute pending expiry. The
raw preview and exact prepare retry exist only in process memory. Expired/missing previews require
new preparation; an old active card stays valid. Saving acknowledgment precedes activation in
the UI. Activated cards have no routine expiry, including when phone sessions expire. Use or
successful owner replacement invalidates old cards and unused operator grants; activation rotates
the prior card atomically. An acknowledged save is not proof of a retrievable backup.

Card recovery binds exact request ID, phone label and a hashed originating browser context. It
rejects another already signed-in identity rather than switching it. An exact five-minute receipt
may return the same cookie; changed reuse/another browser fails. Restart drops raw retry receipts
but never resurrects proof or grants a second connection. Replacement rolls back fully on error
and leaves secondary phones, screens, people and content intact. Save a fresh card afterward.

Migration 0029 adds policy/cards/command receipts and replacement provenance, plus a single-owner
index. It creates no trust/card and revokes no existing connection. Existing installations must
have one non-revoked owner; a conflicting database fails migration rather than guessing which to
remove. Secret fields are redacted and private responses no-store. Recovery audit actions are
typed and family-readable; the administration/activity projections remain valid after recovery.

The backend fallback remains available:

For an existing household, local root/DSM owner maintenance issues a 256-bit, 15-minute,
one-use grant bound to an existing adult controller. It writes a mode-0600 file after a verified
backup; no secret is printed. Issuing it changes no phone sessions. Claiming it replaces only the
previous owner phone, never QR phones or screens. If the owner phone is lost, issue a fresh owner
grant if neither a saved card nor an explicitly trusted phone is available. An ordinary adult
phone cannot promote its normal QR into ownership.
If every phone is lost, connect the replacement owner, then remove lost secondary connections.

Migration 0028 adds tables/session references, never resets access. Existing valid sessions get
an `Earlier browser` connection with their already verified server identity; this does not infer
which physical person owns the handset. New passkey ceremonies are disabled in production once
phone authentication is enabled; legacy sessions remain for deliberate transition. Do not
remove legacy access until David and Rachael's actual phones pass acceptance. No automatic live
migration, key issuance, revocation or deployment is authorized by local implementation.
