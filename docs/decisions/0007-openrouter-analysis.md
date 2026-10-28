# 0007. AI intake analysis with OpenRouter

- Status: Accepted
- Date: 2026-10-27

## Context
Each intake should be triaged by an AI: tags (including whether it is data engineering) and a list of risks, missing information and
whether the budget fits the scope. We have an OpenRouter API key. (A first version used Gemini directly; replaced before release.)

## Decision
`packages/backend/src/ai.ts` calls OpenRouter's OpenAI-compatible `chat/completions` endpoint (key as a bearer token) with a system
prompt that defines the analyst role and the output, at low temperature. The reply is parsed leniently (code fences and surrounding
prose are stripped) and validated with zod, so a malformed answer is rejected rather than stored.
- `tags`: 3-6 kebab-case tags, with `data-engineering` only when applicable, plus subject/technical tags.
- `risks`: findings `{ type: risk | missing_info | budget, severity: low | medium | high, message }`, always including exactly one
  `budget` finding judged against the scope and timeline (budgets treated as USD).
- The analysis runs inside `POST /api/intakes` after the intake is saved. If the key is missing or the call fails (quota, timeout,
  bad output) the intake is kept untagged and the error is logged; the user's submission never fails because of the AI.
- Client text is passed as JSON inside `<intake>` tags and the prompt tells the model to ignore instructions found in it.
- Config: `OPENROUTER_API_KEY` (required to enable) and optional `OPENROUTER_MODEL` (default `openrouter/free`).

## Alternatives considered
- Calling Gemini directly: free, but we already have an OpenRouter key and it lets us swap models by changing one variable.
- `response_format` / structured outputs: not supported by every model on OpenRouter, so we rely on the prompt + zod validation.
- Background job/queue: keeps the POST fast, but needs infrastructure; revisit if latency hurts.

## Trade-offs / consequences
- The POST waits for the model (typically 15-20s on free models, 60s timeout) before responding.
- Free models are rate limited and vary in quality; some intakes may stay unanalysed. `analyzeAndTagIntake(id)` can re-run one, but no
  route/button calls it yet.
- Intake text is sent to OpenRouter and the chosen model provider; free models may log prompts, so avoid confidential client data.
- Risks column holds structured objects (JSON column, no migration needed).
