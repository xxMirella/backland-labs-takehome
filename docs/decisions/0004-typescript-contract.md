# 0004. TypeScript and a shared API contract

- Status: Accepted
- Date: 2026-10-27

## Context
Frontend and backend live in one repo; we want contract mismatches caught at compile time without codegen.

## Decision
Everything is TypeScript with a shared strict `tsconfig.base.json`. `packages/backend/src/contract.ts` holds zod schemas and
`IntakeDto`, exported as `@app/backend/contract` (no Prisma import, safe for the browser). Route handlers validate input with the
schemas and return DTOs; the frontend uses the same types.

## Alternatives considered
- tRPC: end-to-end types, but adds a framework on top of plain Route Handlers.
- OpenAPI codegen: heavier tooling for a single-app MVP.

## Trade-offs / consequences
- Types are checked at compile time only; responses are not validated at runtime on the client.
- Contract is only shared with consumers inside this repo.
