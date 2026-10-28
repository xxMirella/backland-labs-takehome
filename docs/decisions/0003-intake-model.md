# 0003. Intake model

- Status: Accepted
- Date: 2026-10-27

## Context
An intake needs: title, description, budget range, timeline, industry, created_at, plus AI-generated tags and risks.

## Decision
Table `intakes` (model `Intake`). `tags` and `risks` are `Json` columns holding `string[]`, defaulting to `[]`.
`budget` is an integer number of US dollars (`Int`) and `timeline` is the client's desired delivery date (`DateTime`, stored at
00:00 UTC and exposed in the API as `"YYYY-MM-DD"`); both are validated by zod in `packages/backend/src/contract.ts`
(see [0008](0008-open-budget-and-timeline.md)). `industry` is free text. (The first version used fixed budget/timeline buckets.)
Name, email, status and summary were dropped from the first draft since they were not required.

## Alternatives considered
- `budgetMin`/`budgetMax` integers: a range is harder to type and to judge than one amount; a single amount is enough for triage.
- DB enums: SQLite doesn't support them; validation in code is equivalent here.
- Separate `Tag`/`Risk` tables: queryable and normalised, but overkill before we need to filter by tag.

## Trade-offs / consequences
- Budget limits and date rules are not enforced by the DB; `toDto` re-validates rows on read, so bad data fails loudly.
- Filtering by tag in SQL is awkward with JSON columns; revisit with a join table if needed.
- Free-text industry may produce near-duplicates; AI/UI can normalise later.
