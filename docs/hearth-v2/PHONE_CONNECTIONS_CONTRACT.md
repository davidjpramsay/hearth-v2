# Adult phone connections — v1 (D-102)

Private HTTPS only. No passwords or passkeys are required. The owner bootstraps the first
controller using an external one-time secret file. Subsequent browsers scan a QR invitation
created by a connected controller, then wait for that controller's explicit approval.
An adult and a connection are separate identities; browsers/profiles are not hardware-attested.

### Protected owner phone (D-103)

The first key-connected phone is the household's protected owner phone (`source=owner`).
Only a fresh backend-issued, one-use owner key may replace it. No adult browser, including the
owner itself, can remove it, sign it out through the application, switch it with a QR, or convert
it into a shared screen. People cannot archive its adult or remove that adult's administrator
permission. Names, colours and profile photos remain editable. Other adult phones still manage
secondary phones and screens normally; a QR never grants owner-phone status.

The owner-key claim transaction revokes previous owner connections and their sessions/invitations,
creates the replacement owner and consumes the grant together. A failure rolls all of that back.
Other adult phones, legacy connections, TV grants, household contents and networking are untouched.
Issuing a file key does not disconnect anything; a newer issued key invalidates earlier unused
owner grants household-wide. An invalid, expired, reused or interrupted key claim cannot remove
the owner. `auth/status.ownerPhone` reports verified current-browser ownership; it is never input.

Expired ownership remains protected and visible in the phone list until backend replacement.
Browser deletion, cookie loss or expiry cannot be prevented by Hearth; recover the owner with a
fresh backend key, not a QR. A restrictive mixed-cookie/shared-screen safety boundary may invalidate
browser sessions, but never removes the protected owner record or grants screen admin authority.
There is no new schema migration: ownership uses the server-only provenance in migration 0028.
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

| Endpoint                                                                   | Authority / result                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/phones/owner-claims`                                    | External one-time owner key; first household input only when empty; creates/replaces protected owner phone and cookie |
| `POST /api/v1/auth/phones/invitation-claims`                               | QR secret + phone label; creates pending cookie, no adult access                                                      |
| `GET /api/v1/auth/phones/pending`                                          | Pending cookie; bounded status, no household data                                                                     |
| `POST /api/v1/auth/phones/exchanges`                                       | Approved originating pending cookie; one-use session issuance                                                         |
| `POST /api/v1/auth/phones/confirmations`                                   | Current authorized adult; recent explicit consent for sensitive update                                                |
| `GET /api/v1/households/:householdId/phone-connections`                    | Adult controller; names, last contact, expiry and current-connection flag                                             |
| `POST /api/v1/households/:householdId/phone-invitations`                   | Adult controller; target adult + requestId; QR revealed once                                                          |
| `GET /api/v1/households/:householdId/phone-invitations/:id`                | Inviting connection only; scan/approval state                                                                         |
| `POST /api/v1/households/:householdId/phone-invitations/:id/approvals`     | Inviting connection + requestId; explicit confirm after scan                                                          |
| `POST /api/v1/households/:householdId/phone-invitations/:id/cancellations` | Inviting connection + requestId; invalidate pending request                                                           |
| `POST /api/v1/households/:householdId/phone-connections/:id/revocations`   | Adult controller + requestId; independent secondary removal, owner always forbidden                                   |

Command retries do not duplicate grants or audit effects. A lost QR-reveal response requires
canceling/creating a new invitation; raw secrets are never stored to reconstruct one. A lost
exchange reply can be retried only with the originating proof during the invitation lifetime,
while its issued session remains valid. A short process-memory receipt supplies the same cookie;
after a server restart or expiry a lost reply requires a new QR, never a duplicate grant or a
persisted raw credential. Expiry timers remove receipts even when no new requests arrive.

## Owner recovery and migration

For an existing household, local root/DSM owner maintenance issues a 256-bit, 15-minute,
one-use grant bound to an existing adult controller. It writes a mode-0600 file after a verified
backup; no secret is printed. Issuing it changes no phone sessions. Claiming it replaces only the
previous owner phone, never QR phones or screens. If the owner phone is lost, issue a fresh owner
grant even if another adult phone still works; that phone cannot promote a QR into ownership.
If every phone is lost, connect the replacement owner, then remove lost secondary connections.

Migration 0028 adds tables/session references, never resets access. Existing valid sessions get
an `Earlier browser` connection with their already verified server identity; this does not infer
which physical person owns the handset. New passkey ceremonies are disabled in production once
phone authentication is enabled; legacy sessions remain for deliberate transition. Do not
remove legacy access until David and Rachael's actual phones pass acceptance. No automatic live
migration, key issuance, revocation or deployment is authorized by local implementation.
