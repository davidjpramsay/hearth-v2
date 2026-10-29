# Hearth v2

Hearth is a private, television-first family dashboard for calendars, reminders, chores, meals,
lists, photos, weather and selected Home Assistant actions.

Home Assistant is optional. For a fresh household, follow the
[guided installation](hearth/deploy/portable/README.md); existing Synology installations keep their
[current update tools](hearth/deploy/synology/README.md).

The application lives in [`hearth/`](hearth/). Product and operational decisions live in
[`docs/hearth-v2/`](docs/hearth-v2/README.md).

```sh
cd hearth
pnpm install --frozen-lockfile
pnpm dev
```

Read [`AGENTS.md`](AGENTS.md) before changing the product. Hearth is LAN/Tailscale-first and must
not contain household credentials or be exposed publicly without an explicit security review.
