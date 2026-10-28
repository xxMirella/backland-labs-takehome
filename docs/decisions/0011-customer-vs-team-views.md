# 0011. Customer view vs team view, area tags and editing

- Status: Accepted
- Date: 2026-10-27

## Context
Customers submit projects; the team triages them with AI help. The AI analysis (summary, risks, key points, tags, urgency) is for the
team: customers must only read, and be able to edit, what they sent.

## Decision
- **Two DTOs.** `IntakeDto` (full, team only) and `CustomerIntakeDto` (id, title, description, budget, timeline, industry, createdAt).
  `toCustomerDto` is an **allowlist**, so fields added later stay private by default. For customers the list query also selects only
  those columns, so AI data is never loaded, and every customer-facing response (`GET`/`POST /api/intakes`, `PATCH`, register) is
  narrowed on the server. Hiding things in the UI alone would not be enough.
- **Tags are 2 to 3 chips on team cards**: the AI's single *area* tag (`data-engineering` when it is, otherwise e.g. `frontend`,
  `backend`, `web-development`, `mobile`, `devops-cloud`, `ai-ml`), the industry the customer gave, and `Urgent` only when urgent. The
  prompt asks for exactly one area tag and keeps industry/urgency out of it; the code keeps the first usable tag. Budget, due date and
  date sent are plain facts under the chips, not tags. "Not data engineering" is no longer shown: the area says what it is.
- **Editing.** `PATCH /api/intakes/:id` lets the owner change the five project fields (admins cannot edit others' intakes). Someone
  else's id answers 404, exactly like a missing one. The identity and AI fields in a body are ignored. An unchanged delivery date that
  has since passed is accepted (so a typo fix isn't blocked); a *changed* date in the past is rejected. Priority is recomputed from the
  new date immediately and the AI re-runs.
- **AI runs after the response** (`after()` from Next). Customers don't see the analysis, so there is no reason to make them wait 20-60 s
  on submit or save. Failures are logged and leave the intake as it was. This needs a long-lived Node server (not a short-lived
  serverless function).

## Trade-offs / consequences
- The team sees the analysis a little after the customer submits (refresh the page). While a re-analysis is running after an edit, the
  analysis still describes the old text.
- The aggregate counts (total, urgent) are still public. They reveal no individual project, but if urgency should be team-only, hide
  that card for customers.
- A customer cannot see or contest the priority or tags the team assigns to their project.
