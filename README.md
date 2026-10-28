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

**You need:** Node.js 20.12 or newer (`.nvmrc` pins 22: `nvm use` if you use nvm), npm, and an internet connection the first time
(Prisma downloads its database engine). No Docker, no database server: data lives in a local SQLite file.

```bash
git clone <repo-url>
cd <project-folder>
npm install
npm run dev        # http://localhost:3000
```

That's it. The first `npm run dev` also creates your `.env` from `.env.example`, generates the Prisma client and creates the
SQLite database (`packages/db/prisma/dev.db`), and every later run applies any new migrations after a `git pull`. You can run these
steps on their own with `npm run setup`.

Open http://localhost:3000, submit a project to create your account, and you're in.

### Configuration (`.env`, optional)

All config lives in one root `.env` (see `.env.example`). The defaults work as-is.

| Variable | What it does |
| --- | --- |
| `DATABASE_URL` | SQLite file, relative to `packages/db/prisma`. Default `file:./dev.db`. |
| `OPENROUTER_API_KEY` | Turns on the AI analysis (tags, risks, summary) of new projects. Without it projects are still saved, just not analysed. |
| `OPENROUTER_MODEL` | Optional model slug from openrouter.ai/models (default `openrouter/free`). |
| `ADMIN_EMAILS` | Comma-separated emails of team members who see **every** project and its AI analysis. Register these accounts first. |

Restart `npm run dev` after editing `.env`.

### Useful commands

| Command | |
| --- | --- |
| `npm test` | Unit and API tests (no network, no real database needed). |
| `npm run typecheck` | TypeScript check of every package. |
| `npm run build` then `npm start` | Production build. Run `npm run setup` once first. |
| `npm run db:studio` | Browse the database in the browser. |
| `npm run db:migrate -w @app/db -- --name <name>` | Create a migration after changing `schema.prisma`. |

### Troubleshooting

- **Port 3000 is busy:** `PORT=3001 npm run dev` (PowerShell: `$env:PORT=3001; npm run dev`).
- **`npm warn allow-scripts …` during install:** harmless, npm is just reporting package install scripts it skipped.
- **"The engine node is incompatible":** upgrade Node to 20.12 or newer.
- **`Environment variable not found: DATABASE_URL`:** `.env` is missing; run `npm run setup`.
- **Start over with an empty database:** stop the server, delete `packages/db/prisma/dev.db`, run `npm run dev`.

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
