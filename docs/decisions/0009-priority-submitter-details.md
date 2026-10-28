# 0009. Priority, submitter identity and the details dialog

- Status: Accepted
- Date: 2026-10-27

## Context
The team needs to see at a glance how many intakes exist and how many are urgent, know who sent each one, and read the full AI
analysis without crowding the list.

## Decision
- **Priority** (`priority`: `urgent | normal`, plus `priorityReason`). On creation it is set from a deadline rule
  (`defaultPriority`: delivery date 14 days or less after submission is urgent). The AI analysis then returns its own priority, which
  also considers time pressure in the description (launches, outages, compliance deadlines). The AI's call wins; if it returns none or an
  invalid value the rule stays. Older rows were backfilled with the rule.
- **Submitter**: `name`, `email` and `company` are required (trimmed; the email is lower-cased and validated). They are never sent to the
  AI; `buildUserPrompt` only includes project fields (covered by a test).
- **AI output** now also includes a `summary` and `keyPoints` (first questions / next steps), stored with the intake.
- **UI**: two stat cards (total, urgent) above the list; each card shows submitter, priority chip and a "View details" button that opens
  a native `<dialog>` (focus trap, Esc, backdrop click) with description, submitter + mailto, summary, findings grouped
  (budget, missing information, risks) and sorted by severity, key points and tags.
- Rows created before this change have the placeholder "Not provided" for name/email/company.

## Alternatives considered
- Priority only from the AI: no priority at all when the model is down or rate-limited. The rule keeps every intake classified.
- Priority only from the rule: misses urgency that is only in the text.
- A dialog library: unnecessary, the native element covers accessibility basics.

## Trade-offs / consequences
- **Privacy:** the page and `GET /api/intakes` are public, so submitters' emails are readable by anyone who can open the app. Put the list
  behind authentication before real use.
- The 14-day threshold is a guess; it lives in `URGENT_WITHIN_DAYS`.
- Free OpenRouter models can take close to the 60s timeout, in which case the intake keeps only the rule-based priority.
- Migrations: Prisma timestamps new migrations with the current clock; keep names ordered by creation time, or a fresh `npm run setup`
  can apply them in the wrong order.
