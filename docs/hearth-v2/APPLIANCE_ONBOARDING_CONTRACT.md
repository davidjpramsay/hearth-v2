# Appliance onboarding and recovery — v1 (D-104)

Status: implemented private-HTTPS/browser setup-card and phone-recovery release candidate;
commit/push authorized after full local verification; deployment is not performed by this checkpoint.
Native authenticated commissioning, Bluetooth, Wi-Fi provisioning
and trusted HDMI remain future work. Existing live access/networking is unchanged. Browser,
contract and migration evidence is not physical appliance or iPhone Safari proof.

## Implemented browser/NAS compatibility path

An operator/factory privately supplies the first-phone setup card for the already reachable,
trusted HTTPS Hearth origin. The local helper `apps/web/scripts/build-first-phone-card.mjs`
converts an existing private first-use key file into a private PNG without printing its secret,
using an external QR service or writing it into Git. This is a provisioning-workstation tool,
not a public endpoint and not a process inside the deployed web container. It does not generate
or expose a new live key. Ethernet/existing networking provides reachability; this slice does
not change Wi-Fi, Synology, router, DNS or firewall settings.

The current browser QR is an HTTPS link with a purpose-specific fragment:
`#setup-phone=…`, `#connect-phone=…` or `#recover-phone=…`. The phone strips it immediately,
keeps proof only temporarily in memory and submits to the existing same-origin, screen-isolated
phone service. No QR/proof is placed in browser storage, URLs sent to the server, audits or logs.
Scanned first setup needs household, adult and phone names, not a copied key field. It uses the
existing first-use proof and atomic household/owner grant; a used setup card cannot recover an
existing household. An empty-server visitor can neither fetch nor mint setup proof. These links
are distinct from the future native JSON envelope below and do not pin an appliance identity key.

After setup or deliberate owner replacement, the owner lands on **Phones & screens → Recovery
& lost phones**. Existing households adopt recovery only through their verified owner connection:

- **Saved recovery card:** create a private preview, save/download it off the phone, explicitly
  acknowledge saving, then activate within five minutes. Preparation never retires an existing
  active card. Activation atomically replaces it. The activated proof has no routine expiry;
  it is invalidated on consumption, rotation or owner replacement. Acknowledgment is consent,
  not proof that the backup can actually be retrieved.
- **Trusted recovery phone:** the owner explicitly selects an already connected adult phone.
  Trust is bound to its exact server-verified connection ID, not the adult's name/member ID.
  Ordinary invitations, including another connection under the owner's or trusted adult's name,
  never inherit recovery authority. The trusted connection creates a five-minute replacement
  invitation, reviews the requesting phone and approves it; the replacement gets the existing
  owner's identity, while the approving adult keeps their own connection.
- **All-phone loss:** scanning the separately saved active recovery card can replace the owner
  without an existing phone. It cannot silently switch a currently authenticated browser.
  Exact retry is bound to the originating browser context, request ID and phone label; changed
  reuse fails. A five-minute process-memory receipt returns the same credential, never a second
  grant. A lost response after server restart requires another explicitly authorized recovery
  path; raw credentials are not persisted to reconstruct it.

Migration `0029_phone_recovery.sql` adds digest-only cards, generations, exact trusted-phone
policy, bounded command receipts and replacement-invitation provenance. It assigns no trust,
creates no card and revokes no existing connection. At exchange/claim commit, the server
rechecks owner, approval, exact trusted connection, live sessions and adult capabilities.
Replacement atomically retires the old owner and linked sessions/invitations/cards/unused grants,
creates one new owner and audits the operation; other phones, screens and content remain.
Casual owner Remove/sign-out, People demotion/archive and shared-screen access stay forbidden.
The protected backend one-use file remains the operator fallback. See
[the HTTP/lifecycle contract](PHONE_CONNECTIONS_CONTRACT.md).

## Implemented local presentation tool, not automatic appliance startup (D-105)

The optional operator-only `start-first-phone-screen.mjs` opens the branded welcome/QR/instructions
surface on the same trusted workstation/display process that can read the first-use file. Only an
ephemeral `127.0.0.1` listener and unpredictable local renderer path exist; no application API
returns QR/proof. Host/Origin/Fetch Metadata checks, CSP, no-store and no-referrer protect this
surface. Do not forward its listener or distribute its private renderer URL.

Bounded credential-free HTTPS status reads gate the private QR. Loading, stale, invalid or failed
reads hide it; an observed claim is permanently terminal for that presenter. The phone uses the
unchanged first-use verifier. Subsequent screen enrollment remains separate adult approval, never
an owner credential handed to the TV. Updating the current NAS does not run this tool. Factory
boot wiring and actual trusted HDMI hardware acceptance remain open; there is no automatic QR
on an anonymous empty-server page or after an existing owner session expires.

## Future physical appliance flow — not implemented

A headless Hearth appliance has a private, device-specific setup QR supplied inside its packaging.
The native phone app scans it, authenticates the expected appliance over a reviewed local
commissioning channel, and helps it join home Wi-Fi. Ethernet skips Wi-Fi configuration. Ordinary
control then uses the LAN; internet and a vendor account are not required for core household
operation. A temporary setup Wi-Fi network is a fallback, not an authentication mechanism.

Bluetooth LE is the preferred commissioning transport, not the authentication protocol. Device
identity and QR proof must protect the session even if the radio transport is hostile. Wi-Fi
credentials go only to a narrowly scoped appliance/network adapter inside that authenticated
channel. They never enter the ordinary Hearth HTTP API, SQLite, audit, analytics or browser forms;
the appliance OS/network subsystem necessarily retains what it needs to reconnect.

An HDMI-connected appliance may display a fresh private QR through a trusted local rendering
process instead of a supplied setup card. The current anonymous web page/Google TV shell is not
such a process. An unauthenticated network visitor must not retrieve or mint the setup proof.
LAN presence, browser Origin, a TV user agent and two-browser confirmation do not establish ownership.

The phone names the household and first adult, then receives its own credential. A TV receives
only a display grant, never the phone credential. Additional phones use a short-lived invitation
plus explicit approval for the intended adult; the inviter's identity stays unchanged. The current
responsive administration stays in service. A future native phone client must not duplicate all
household business logic or restore the retired Apple bridge.

## Private operator replacement QR (D-110)

The same protected-file PNG helper accepts `--purpose owner-replacement` and produces
`#replace-owner=…` from a separately issued, one-use backend grant. The fragment is stripped before
network requests and never displayed or stored. It cannot bootstrap an empty household; a setup
card cannot replace an existing owner. No browser form requests a long Hearth key. Existing saved
recovery cards and exact trusted-phone replacement retain their strong proofs and deliberate consent.

## Future native QR envelope — validation only

Source: `hearth/packages/shared/src/appliance-onboarding.ts`. Two deterministic, non-secret
interoperability fixtures live in `hearth/packages/shared/fixtures/appliance-onboarding-v1/`.
Their zero-valued identity/proof is fictional test data and must never provision a real appliance.

QR contents are bounded JSON, not an arbitrary URL, redirect or server address. A native scanner
uses `decodeApplianceQr`, rejects unsupported input without echoing it, verifies the required
purpose and authenticates the pinned identity before any grant or Wi-Fi write. The decoder only
validates shape: it does not verify possession, identity, freshness or randomness. Actual proof
generation uses a cryptographically secure random source, independent for every appliance.

| Field                 | Setup                                                              | Recovery                                                    |
| --------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `format`              | `hearth.appliance-qr`                                              | same                                                        |
| `version`             | `1`                                                                | `1`                                                         |
| `purpose`             | `setup`                                                            | `recovery`                                                  |
| `applianceId`         | opaque installation identity                                       | same claimed installation                                   |
| `identityFingerprint` | lowercase 64-hex SHA-256 fingerprint of the appliance identity key | same independently authenticated identity                   |
| `generation`          | `0`                                                                | positive safe integer, matching durable recovery generation |
| private proof         | `setupSecret`                                                      | `recoverySecret`                                            |

Proof shape is exactly 32 bytes in canonical unpadded base64url (43 characters). A short display
code is not a proof. Setup and recovery keys are not interchangeable; unknown/extra properties,
network destinations, capabilities and Wi-Fi passwords are rejected. Input is limited to 1,024
characters. Do not log QR text, save it in browser storage or submit it to external QR generators.

Discovery exposes only version, appliance identity, claimed/unclaimed state and available
transports. Discovery cannot grant access. The public claim state comes from durable installation
state, not a count of currently connected phones. Authenticated private reads retain existing
household boundaries; recovery never exposes lists, photos or household contents before acceptance.

## Metadata, not authority

`ApplianceInitialClaimSchema` accepts version, request ID, appliance ID, household name, adult
name, phone name and timezone. `ApplianceRecoveryClaimSchema` accepts version, request ID,
appliance ID, recovery generation and replacement phone name. These describe a request _inside_
an independently authenticated channel. There are deliberately no new routes accepting them.
Neither request can supply verified/owner flags, member identity, capabilities, raw QR proof or
Wi-Fi credentials. The proof adapter and durable server record determine authority and identity.

Every eventual command binds a request ID to the verified channel, expected appliance, proof
generation, requesting phone and exact payload. Exact retry must return its receipt without a
second grant; changed reuse must fail. Protocol selection, session establishment, secret receipt
handling and concrete native/server route names are the next implementation gate, not frozen by
these metadata schemas. Use an established reviewed cryptographic protocol; do not invent one.

## Ownership and lost-phone recovery

The owner is a household adult, not one irreplaceable handset. Each connection remains independently
revocable. The main connection has no ordinary Remove/self-sign-out action; replacement is a
deliberate recovery operation, not a normal invitation or arbitrary People edit.

The owner may explicitly designate another already connected adult phone as a recovery administrator.
An ordinary controller is not automatically a recovery administrator. The verified exact phone can
approve a bound replacement phone for the existing owner identity. The replacement transaction
revokes the lost connection and linked sessions/invitations, issues the new connection and
records the replacement in the audit trail without duplicate retry effects. It must not switch the approving adult, reset other phones/screens,
change people/capabilities or erase household content.

A separate offline recovery QR handles loss of every phone. It is generated after ownership,
bound to that household's existing owner and appliance, and stored separately from the phones.
Only its verifier/digest and generation persist on the appliance; the raw proof is shown/saved
privately through a bounded preview/retry window. It has no routine automatic expiry, but is invalidated on use, explicit rotation
or revocation. Recovery then asks the new owner to save a replacement card. Retaining an old
setup card never authorizes recovery. Removal/rotation must not silently eliminate the last
recovery authority; explicit saved-card acknowledgment does not prove a usable backup exists.

`ApplianceRecoveryPolicySchema` remains a future advisory read-only projection: owner member,
unique designated recovery adults (including the owner), and offline-card acknowledgment. It
is not the active authorization DTO; current `PhoneRecoverySummarySchema` and exact connection
policy are defined in `phone-connections.ts`. The core
`applianceRecoveryReadiness` helper reports owner-only, trusted-adult, recovery-card or both for
future UI guidance. It grants no permission and does not establish a phone is reachable or a
card is still available. Role, current session and proof checks belong to the server.

If all trusted phones and all recovery proofs are lost, ownership cannot be recovered securely
by an anonymous visitor. Physical recovery/reset and restoration from a verified backup remain
the final path. A factory reset must not be described as a non-destructive recovery operation.

## State invariants and future acceptance

- `unclaimed → commissioning → claimed` requires authenticated private setup proof and an atomic
  owner grant. Interrupted setup has bounded safe retry; no anonymous ownership fallback.
- Once claimed, expired/deleted/lost phones never reopen commissioning. Initial proof is consumed
  or irreversibly disabled. Only a separately defined physical transfer/reset procedure can start
  a different installation; a network request cannot toggle claimed back to unclaimed.
- Trusted-adult and offline-proof recovery are separate from ordinary phone invitations. Check
  all authority again at commit, including revocation during an asynchronous handshake.
- Wrong device, wrong purpose/generation, copied/used proof, changed retry, concurrent claim,
  cancellation, restart and network interruption must fail safely and remain bounded.
- Existing households need verified owner consent before adopting recovery administrators/cards.
  No automatic promotion, mass revocation, reset, key issuance or deployment is authorized.
- Before physical-appliance activation, prove cold phone-only setup, actual Wi-Fi join, second-adult enrollment,
  display-only TV enrollment, one-phone and all-phone loss, old-credential rejection and unchanged
  content on actual hardware. Contract tests alone close none of those acceptance gates.

## Rollout and rollback

Strict future QR/metadata validation and advisory tests are implemented. The existing trusted
HTTPS/browser compatibility path now has local recovery persistence, typed routes, atomic
replacement, exact-retry tests and rendered phone UI. Before publishing this compatibility
release, run the repository release gates, preserve a verified backup and obtain deployment
approval; then prove actual phone scanning/download/recovery with disposable household data.
No live key issuance or recovery policy migration is automatic.

Separately select and prove native appliance identity/transport and the network adapter on
disposable hardware. Do not reuse browser shape validation as Bluetooth authentication.
No provisioning service runs inside current Synology containers; no networking/firewall change
or public anonymous QR renderer is part of this work.

Retain protected D-102/D-103 operator recovery alongside the new path. Downgrade
must preserve consumed proof generations and revoked credentials; refuse an incompatible old
release rather than reopen initial setup or restore a lost phone. Back up and recovery-test before
any future live migration.
