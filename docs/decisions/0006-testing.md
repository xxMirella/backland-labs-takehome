# 0006. Testing with Vitest

- Status: Accepted
- Date: 2026-10-27

## Context
The form must never send blank or malformed data and must always tell the user what is wrong.

## Decision
Vitest (`npm test`) with two suites: `packages/backend/src/contract.test.ts` covers the zod schema edge cases (blank/whitespace,
boundary lengths, enum values, unknown fields) and `apps/web/app/intake-form.test.tsx` covers the form with Testing Library
(warnings per field, no request on invalid input, focus, live clearing, success, 400/500/network failures, double submit).
Because the form reuses the API's schema, the schema tests also pin down the server's behaviour.

## Trade-offs / consequences
- No browser-level (e2e) tests yet; layout and real network behaviour are untested.
- The `/api/intakes` route and database writes have no automated tests yet.
