# 0002. Next.js + Prisma + SQLite

- Status: Accepted
- Date: 2026-10-27

## Context
Goal is the easiest path to a deployed, functional end-to-end MVP.

## Decision
Next.js App Router with Route Handlers, Prisma ORM (pinned to v6), SQLite.

## Alternatives considered
- Drizzle: lighter, SQL-closer, but Prisma's migrations/Studio/tooling are quicker for an MVP.
- Prisma 7: requires driver adapters and `prisma.config.ts`; extra setup for no MVP gain.
- Postgres: better for scale, but needs a hosted DB.

## Trade-offs / consequences
- SQLite has no enums or scalar lists: `status` is a string and `tags` a JSON string.
- SQLite is a local file: deploy needs a persistent volume (e.g. Fly/Railway/VPS), not serverless. Migrating to Postgres later means changing the provider and those two columns.
