# 0005. Intake form frontend

- Status: Accepted
- Date: 2026-10-27

## Context
Users submit project intakes through a friendly page. All five fields are required and users must be told what is missing.

## Decision
One page (`apps/web/app/page.tsx`) with a client-side form (`intake-form.tsx`). The form validates with the same zod schema the API uses
(`@app/backend/contract`), so client and server messages never diverge. Native browser validation is off (`noValidate`) so we control
the messages: required fields are marked with `*`, errors show inline under each field, focus moves to the first invalid field, and
errors re-validate live after the first submit attempt. `created_at` is never sent by the client; the database sets it on insert.
Budget is a masked USD input and timeline a native date input, see [0008](0008-open-budget-and-timeline.md). Styling is a single plain CSS file (soft gradient background, rounded cards/inputs, pill button).

## Alternatives considered
- Tailwind / component library: faster for large UIs, but extra tooling for one screen.
- react-hook-form: nicer ergonomics, but an extra dependency for five fields.

## Trade-offs / consequences
- The browser bundle includes zod (small cost) in exchange for a single source of validation.
- Plain CSS will need structure (or Tailwind) if the UI grows past a few screens.

## Intake list
The home page is a server component that calls `listIntakes()` (newest first) and renders `intake-list.tsx` above the form (the "No intakes yet" message takes the list's place when the database is empty); after a
successful submit the form calls `router.refresh()` so the list updates without a manual reload. Each card shows title, date, a
3-sentence description excerpt, and chips. An empty database shows a friendly "No intakes yet" message.

Tag convention (to be produced by the AI analysis step): `tags` contains `data-engineering` when the project is data engineering, plus
subject tags. Budget ("$12,500"), industry and delivery date ("Due Nov 30, 2026") chips always come from the intake fields. Until analysis runs, cards show "Awaiting AI analysis".
