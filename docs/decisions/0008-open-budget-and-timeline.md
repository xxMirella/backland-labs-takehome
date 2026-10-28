# 0008. Open budget (USD) and delivery date

- Status: Accepted
- Date: 2026-10-28
- Supersedes: the budget/timeline buckets in [0003](0003-intake-model.md)

## Context
Dropdown buckets ("10k-50k", "1-3m") were coarse: users could not state what they actually have in mind, and the AI could only
guess whether a budget fits the scope. We want the exact numbers.

## Decision
- `budget`: whole US dollars, `1..1,000,000,000`. The form shows a currency mask (`$12,500`) over a text input with a numeric keyboard;
  state holds raw digits and the API receives a number. Letters, symbols and decimals typed by the user are dropped.
- `timeline`: the desired delivery date, `"YYYY-MM-DD"`, chosen with a native `<input type="date">` whose `min` is the user's local
  today. The server only checks calendar validity, "not in the past" and "within 10 years".
- "Past" on the server means before *yesterday in UTC*: a user west of UTC late in the evening is still on "today" while UTC has
  already rolled over, and rejecting them would be a bug. The browser applies the strict local-date check.
- The AI prompt receives the exact amount, the submission date, the delivery date and the days available between them.
- Migration `20261028010000_open_budget_and_timeline` is hand-written (Prisma will not generate a column change that needs a default
  while rows exist) and converts existing rows: budget `<10k`/`10k-50k`/`50k-150k`/`150k+` -> 5,000/30,000/100,000/150,000;
  timeline `<1m`/`1-3m`/`3-6m`/`6m+` -> created date + 15/60/135/270 days. These are midpoints, so old rows are approximations.

## Alternatives considered
- Keep buckets and add an "other" option: still forces a guess for the AI.
- Money as a decimal/cents: cents add nothing for project budgets; whole dollars keep the mask simple.
- A single "duration" field ("6 weeks"): harder to validate and compare than a date.

## Trade-offs / consequences
- Single currency (USD); supporting others needs a currency column and a selector.
- The money mask moves the caret to the end when editing mid-number.
- The API contract changed (`budgetRange` removed, `budget` is a number): old clients get a 400.
- Tests pin the clock (`TZ=UTC` in `vitest.config.ts`, fake `Date`) so date rules are deterministic.
