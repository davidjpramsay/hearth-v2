# Hearth

Hearth is a private family dashboard built for a wall-mounted Google TV and a phone browser.

## What it includes

- Today, Week and Month calendars with cached read-only CalDAV sync
- current, hourly and seven-day weather
- Hearth-owned reminders
- chores, routines and proportional pocket money
- lists, meals, notices and daily verse
- managed family photos and ambient display
- three allowlisted Home Assistant actions
- passkey-protected adult administration
- a minimal paired Android/Google TV shell

Apple Reminders is not part of the active product. Its retired proof is preserved under
[`archive/apple-reminders-bridge/`](archive/apple-reminders-bridge/README.md).

## Run locally

Requires Node 22.12+, pnpm 10 and Playwright Chromium.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:4320/today>. The API runs on <http://127.0.0.1:4310> and Vite proxies
`/api` during development.

## Verify

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migrations
pnpm build
pnpm test:e2e
pnpm verify:tv
```

## Structure

- `apps/server` — Fastify, SQLite, jobs and provider adapters
- `apps/web` — React TV and phone interface
- `apps/tv` — paired Kotlin TV shell
- `packages/shared` — browser-safe contracts
- `packages/core` — pure household logic
- `deploy/synology` — private container deployment
- `docs` — rendered design and acceptance evidence

Start with [`../docs/hearth-v2/README.md`](../docs/hearth-v2/README.md). Never commit household
credentials, private provider URLs or production data.
