# Project Intake

Receive project intakes, then analyse and tag them with AI (tags + risks).

Next.js (App Router + Route Handlers) · Prisma · SQLite · TypeScript · npm workspaces

```
apps/web          frontend (pages) + HTTP layer (app/api route handlers)
packages/backend  business logic + shared API contract (zod schemas, DTO types)
packages/db       Prisma schema, migrations, shared client
docs/             decisions (ADRs) and trade-offs — see docs/README.md
scripts/setup.mjs one-shot local setup
```

Dependency direction: `web → backend → db`.

## Run locally

Requires Node >= 20.12 (`.nvmrc` pins 22).

```bash
npm install
npm run setup   # creates .env, generates Prisma client, applies migrations
npm run dev     # http://localhost:3000
```

Other scripts: `npm run typecheck`, `npm run db:studio`, `npm run db:reset`,
`npm test`, `npm run db:migrate -w @app/db -- --name <name>` (after changing the schema).

All config lives in one root `.env` (see `.env.example`). To enable AI analysis, put your OpenRouter key in `OPENROUTER_API_KEY` (and optionally a model slug in `OPENROUTER_MODEL`); without it intakes are still saved, just not analysed.

## Accounts

Visitors see only the intake counts. Submitting a project creates an account (email + password) and signs the user in; they then see
their own projects. To let team members see **every** intake, list their emails in `ADMIN_EMAILS` in `.env` (comma-separated), then
register those accounts. See `docs/decisions/0010-accounts-and-access.md`.

## API

- `POST /api/register` → creates the account + first intake, sets the session cookie (409 if the email has an account)
- `POST /api/login` / `POST /api/logout` / `GET /api/me`
- `GET  /api/intakes` → the signed-in user's intakes, customer view only (`CustomerIntakeDto[]`); team members get every intake with the AI analysis (`IntakeDto[]`); 401 when signed out
- `POST /api/intakes` → `CustomerIntakeDto` for a signed-in user (400 with field errors on invalid input)
- `PATCH /api/intakes/:id` → the owner edits their intake (404 for anyone else's)

The contract lives in `packages/backend/src/contract.ts`. The frontend imports it from
`@app/backend/contract` (types + zod schemas, no database code), so TypeScript flags any drift.
