# Retired Apple Reminders bridge

This directory preserves the 2026 EventKit/CalDAV proof for possible future research. It is not an
active Hearth package and is excluded from current builds, tests and deployment images.

Contents include the Swift iPhone proof, frozen v1 pairing/snapshot contract, server projection,
browser source-management UI, shared schemas, fixtures and the bounded CalDAV capability probe.
No Apple credential, source secret, private reminder payload or raw production identifier is stored
here.

Active Hearth reminders are household-owned. They use the contracts in
`packages/shared/src/reminders.ts`, persistence in `apps/server/src/reminder-repository.ts` and the
responsive `apps/web/src/screens/RemindersScreen.tsx` surface.

Do not copy this code back into an active package. Restoring Apple integration requires an explicit
product decision, threat review, new acceptance criteria and fresh physical-device evidence.
