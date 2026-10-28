# 0010. Accounts, sessions and who sees what

- Status: Accepted
- Date: 2026-10-27

## Context
The page used to list every intake, with names and emails, to anyone. We want visitors to see only aggregate counts, and project
details behind a login. Customers should be able to register and submit their first project in one step.

## Decision
- **Home page, signed out:** two count cards (total, urgent) plus a tabbed panel: "Submit a project" (the intake form, which also asks for
  a password and creates the account) and "I have an account" (login).
- **Home page, signed in:** the counts, the list of projects with the details dialog, and a short form for another project (identity
  comes from the account).
- **Visibility:** a user sees only their own intakes. Emails in `ADMIN_EMAILS` (comma-separated) are team members and see all intakes,
  including legacy ones created before accounts existed (no owner). The server decides this; the client cannot ask for another scope.
- **Own implementation, no auth library:**
  - Passwords: scrypt (N=32768, per-user random salt), parameters stored in the hash so they can be raised later; compared in constant
    time; not trimmed. Minimum 8, maximum 128 characters.
  - Sessions: random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production), 7 days. The database stores only
    the SHA-256 of the token, so a leaked database cannot be replayed as cookies. Logout deletes the row.
  - Login returns one message ("Wrong email or password.") for unknown emails and wrong passwords, and does one scrypt verification in
    both cases to avoid a timing difference.
  - Rate limits (in memory): 8 login attempts per IP+email per 15 min (reset on success), 10 sign-ups per IP per hour.
  - CSRF: `SameSite=Lax` plus an `Origin` check on every state-changing route.
  - Submitter name/email/company are never sent to the AI.
- Routes: `POST /api/register`, `/api/login`, `/api/logout`, `GET /api/me`, and `GET`/`POST /api/intakes` (now require a session).

## Alternatives considered
- Better Auth / Auth.js: less code to write, but extra dependency, tables and conventions for what is ~300 lines here.
- Magic links: no password to manage, but needs email delivery that we don't have.
- Everyone logged in sees everything: simplest, but any customer could read other customers' projects and emails.

## Trade-offs / consequences
- No email verification: anyone can register with someone else's address. Intakes are tied to the account, not proven to be the owner's.
- No password reset or change yet (an account whose password is forgotten is stuck).
- The rate limiter is per process and `x-forwarded-for` is only trustworthy behind a proxy that sets it; revisit when deploying.
- Registering with an email that already exists returns 409 ("already exists, log in"), which reveals that the email has an account. That
  is the usual price of a friendly sign-up flow; login itself does not reveal it.
- Expired sessions are deleted lazily, when presented. A periodic cleanup is not needed at this scale.
- `ADMIN_EMAILS` is trusted by email; with no verification, an attacker who registers an admin's email address before the admin does
  gets admin access. Register the team accounts first, or add email verification before using this beyond a trusted setup.
