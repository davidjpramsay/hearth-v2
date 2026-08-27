# Retired iPhone Reminders proof

This SwiftUI/EventKit app proved read-only Apple Reminders projection on a physical iPhone. It is
archived, excluded from Hearth builds and unsupported.

The proof included selected-list persistence, Keychain-held device authentication, bounded full
snapshots and exact retry handling. It never wrote to EventKit or stored Apple credentials.

See [`../README.md`](../README.md), the frozen contract beside it and
[`../../../docs/evidence/phase-8/README.md`](../../../docs/evidence/phase-8/README.md). Restoring any
part requires a new product decision, threat review and physical-device acceptance.
