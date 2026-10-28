# 0001. Monorepo structure

- Status: Accepted
- Date: 2026-10-27

## Context
We need an MVP to receive project requests, with AI analysis/tagging. We want clear module boundaries without operating multiple services.

## Decision
npm workspaces with three modules, dependency direction `web → backend → db`:
- `apps/web`: Next.js frontend and thin Route Handlers (HTTP only).
- `packages/backend`: business logic (validation, services, AI analysis).
- `packages/db`: Prisma schema, migrations, shared client.

## Alternatives considered
- Single Next.js app, no packages: simplest, but logic and data access blur into route handlers.
- Separate backend service (Express/Nest): extra deploy and CORS for no MVP benefit.
- Turborepo/pnpm: not needed at this size; can be added later.

## Trade-offs / consequences
+ Boundaries are enforced by package imports; backend can be extracted later.
- Slight setup overhead (`transpilePackages`, workspace wiring) versus one app.

## Local setup
No Docker for now. `npm install && npm run dev` (the `predev` hook runs `scripts/setup.mjs`: creates `.env`, generates the Prisma client, applies migrations); one root `.env` shared by Prisma CLI (via `dotenv-cli`) and Next.js (loaded in `next.config.ts`).
