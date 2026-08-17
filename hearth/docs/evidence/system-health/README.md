# System Health and recovery evidence

Status: local implementation evidence only. No live Synology database, secret directory or Home
Assistant backup was changed.

## Retained views

- `system-health-phone-portrait.png` — calm database and recovery summary at 390×844.
- `system-health-actions-phone-portrait.png` — focused manual recovery-copy action and explicit
  boundary between Hearth data, provider secrets, photo originals and Home Assistant backups.
- `system-health-phone-landscape.png` — responsive companion header/summary at 844×390.
- `system-health-dark-phone-portrait.png` — the same status hierarchy in the warm dark theme at
  390×844.

## Behaviour verified

- Adult-only typed status and backup routes; child access is rejected.
- Request replay does not create another file or audit event; a browser retry after a lost response
  reuses the original command identity.
- SQLite online backup while the source database remains open.
- `quick_check`, foreign-key and migration-version verification.
- Mode-`0700` backup directory and mode-`0600` retained files.
- Bounded retention and family-readable configured/never-run/ready/failure states.
- An unreadable or invalid backup location returns a path-free storage warning rather than a raw
  server or filesystem error.
- Restore to a new clean location, followed by a household read from the restored database.
- Restore accepts absolute paths only and refuses to overwrite an existing destination or work file.
- Browser responses contain no host backup path or downloadable database.
- Phone flow, keyboard focus and automated serious/critical accessibility checks.
- Calendar, Home Assistant and Photos setup states are summarised without credentials, raw entity
  IDs or host paths, with direct links back to their dedicated setup screens.
- One unavailable connection remains an isolated family-readable row; database, backup and other
  connection states continue to render.
- Explicit D-pad movement runs from the backup action through Photos, Home Assistant and Calendar;
  Back restores the exact connection row.

## Fidelity ledger

| Area        | Result                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| Copy        | Household language leads; implementation details are confined to the recovery boundary. |
| Composition | One calm summary, status cards, three connection rows, one action and one boundary.     |
| Palette     | Existing sage healthy state, ochre demo/setup state and plum primary action.            |
| Focus       | “Create backup now” uses the standard outline plus colour and elevation.                |
| Responsive  | Single-column portrait and two-column landscape cards without horizontal overflow.      |
| Safety      | Restore is absent from the browser and remains an explicit operator-only CLI step.      |

Physical Synology encrypted backup, capacity monitoring, service restart evidence and the real
restore drill remain outstanding acceptance work.
