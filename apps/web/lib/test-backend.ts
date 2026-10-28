// Shared test double for "@app/backend": the real schemas and rate limiter, fake database-backed functions.
import { vi } from "vitest";
import * as contract from "../../../packages/backend/src/contract";
import { createRateLimiter } from "../../../packages/backend/src/rate-limit";

export class EmailTakenError extends Error {}
export class InvalidCredentialsError extends Error {}
export class IntakeNotFoundError extends Error {}
export class PastDeliveryError extends Error {}

export const backend = {
  ...contract,
  createRateLimiter,
  EmailTakenError,
  InvalidCredentialsError,
  IntakeNotFoundError,
  PastDeliveryError,
  analyzeAndTagIntake: vi.fn(),
  updateIntake: vi.fn(),
  authenticate: vi.fn(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
  getSessionUser: vi.fn(),
  registerWithIntake: vi.fn(),
  // Like the real one: picks safe fields only (never passwordHash).
  toSessionUser: vi.fn((u: { id: string; name: string; email: string; company: string }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    company: u.company,
    isAdmin: false,
  })),
  createIntake: vi.fn(),
  listIntakesFor: vi.fn(),
};

/** Callbacks passed to `after()`: tests run them on demand instead of Next doing it after the response. */
export const afterCallbacks: Array<() => unknown> = [];
export const nextServerMock = async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => unknown) => void afterCallbacks.push(fn) };
};

/** Cookies the mocked `next/headers` will return for the current request. */
export const cookieJar: Record<string, string> = {};
export const nextHeadersMock = () => ({
  cookies: async () => ({ get: (name: string) => (name in cookieJar ? { name, value: cookieJar[name] } : undefined) }),
});

export const json = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
