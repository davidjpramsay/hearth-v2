# Hearth v2 specifications

Hearth is a private family command centre designed for a wall-mounted Google TV, D-pad remote and
phone browser. It owns reminders, chores, routines, pocket money, lists, meals, notices and photos;
connected calendars remain provider-owned.

The active product includes Today, Week, Month, Weather, Hearth reminders, Chores, Lists, Meals,
Home, Photos and phone administration. Home Assistant remains the authority for physical devices
and voice. Native television media apps remain separate.

## Source of truth

| Document                             | Purpose                         |
| ------------------------------------ | ------------------------------- |
| [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) | Outcomes and scope              |
| [`UX_SPEC.md`](UX_SPEC.md)           | Screens and interaction         |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Runtime and security boundaries |
| [`DATA_MODEL.md`](DATA_MODEL.md)     | Persistence and ownership       |
| [`INTEGRATIONS.md`](INTEGRATIONS.md) | External services               |
| [`ROADMAP.md`](ROADMAP.md)           | Delivery order                  |
| [`ACCEPTANCE.md`](ACCEPTANCE.md)     | Definition of done              |
| [`DECISIONS.md`](DECISIONS.md)       | Durable decisions               |
| [`OPERATIONS.md`](OPERATIONS.md)     | Local and Synology operation    |

## Current boundaries

- Apple Reminders/EventKit is retired. Its proof is archived under
  `hearth/archive/apple-reminders-bridge/` and excluded from builds and deployment.
- Weather uses the server-side Open-Meteo adapter and cache.
- Calendar access is read-only unless a future decision explicitly expands it.
- Household services are LAN/Tailscale-first; no public exposure is approved.
- The Synology owns Hearth's private runtime and data. The external Google/Android TV device runs
  the small native shell; the Raspberry Pi remains a headless Home Assistant appliance.

Open acceptance work is tracked only in [`ACCEPTANCE.md`](ACCEPTANCE.md) and
[`ROADMAP.md`](ROADMAP.md); this index intentionally avoids duplicating it.
