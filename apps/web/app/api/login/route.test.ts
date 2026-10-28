import { beforeEach, describe, expect, it, vi } from "vitest";
import { backend, json, nextHeadersMock } from "../../../lib/test-backend";

vi.mock("@app/backend", async () => (await import("../../../lib/test-backend")).backend);
vi.mock("next/server", async () => (await import("../../../lib/test-backend")).nextServerMock());
vi.mock("next/headers", async () => (await import("../../../lib/test-backend")).nextHeadersMock());

import { POST } from "./route";

const user = { id: "u1", name: "Ana", email: "ana@acme.com", company: "Acme" };
let n = 0;
const email = () => `user${++n}@acme.com`; // unique per test: the rate limiter is module-level state

beforeEach(() => {
  vi.clearAllMocks();
  void nextHeadersMock;
  backend.createSession.mockResolvedValue({ token: "raw-token", expiresAt: new Date("2026-11-03T12:00:00Z") });
});

describe("POST /api/login", () => {
  it("logs in, returns the user and sets a hardened session cookie", async () => {
    backend.authenticate.mockResolvedValue(user);
    const res = await POST(json("/api/login", { email: "ana@acme.com", password: "correct horse" }));

    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ id: "u1", email: "ana@acme.com" });
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("session=raw-token");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Expires=/i);
  });

  it("never returns the password or hash", async () => {
    backend.authenticate.mockResolvedValue({ ...user, passwordHash: "scrypt$secret" });
    const res = await POST(json("/api/login", { email: email(), password: "correct horse" }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("scrypt");
    expect(text).not.toContain("correct horse");
  });

  it("answers 401 with one generic message and sets no cookie when credentials are wrong", async () => {
    backend.authenticate.mockRejectedValue(new backend.InvalidCredentialsError());
    const res = await POST(json("/api/login", { email: email(), password: "wrong password" }));

    expect(res.status).toBe(401);
    expect((await res.json()).error.formErrors).toEqual(["Wrong email or password."]);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(backend.createSession).not.toHaveBeenCalled();
  });

  it.each([
    ["empty body", {}],
    ["bad email", { email: "nope", password: "x" }],
    ["missing password", { email: "a@b.co" }],
  ])("rejects %s with 400 before touching the database", async (_name, body) => {
    const res = await POST(json("/api/login", body));
    expect(res.status).toBe(400);
    expect(backend.authenticate).not.toHaveBeenCalled();
  });

  it("rejects a body that isn't JSON", async () => {
    const res = await POST(json("/api/login", "not json {"));
    expect(res.status).toBe(400);
  });

  it("blocks brute force: the 9th attempt for the same email and IP gets 429, even with the right password", async () => {
    const target = email();
    backend.authenticate.mockRejectedValue(new backend.InvalidCredentialsError());
    for (let i = 0; i < 8; i++) {
      expect((await POST(json("/api/login", { email: target, password: `guess ${i} wrong` }))).status).toBe(401);
    }
    backend.authenticate.mockResolvedValue(user);
    const blocked = await POST(json("/api/login", { email: target, password: "correct horse" }));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("set-cookie")).toBeNull();
    expect(backend.authenticate).toHaveBeenCalledTimes(8);
  });

  it("doesn't let one person's failures block another email from the same IP", async () => {
    const victim = email();
    backend.authenticate.mockRejectedValue(new backend.InvalidCredentialsError());
    for (let i = 0; i < 9; i++) await POST(json("/api/login", { email: victim, password: `guess ${i} wrong` }));

    backend.authenticate.mockResolvedValue(user);
    expect((await POST(json("/api/login", { email: email(), password: "correct horse" }))).status).toBe(200);
  });

  it("forgives earlier failures after a successful login", async () => {
    const target = email();
    backend.authenticate.mockRejectedValue(new backend.InvalidCredentialsError());
    for (let i = 0; i < 5; i++) await POST(json("/api/login", { email: target, password: `bad ${i} guess` }));
    backend.authenticate.mockResolvedValue(user);
    expect((await POST(json("/api/login", { email: target, password: "correct horse" }))).status).toBe(200);

    backend.authenticate.mockRejectedValue(new backend.InvalidCredentialsError());
    for (let i = 0; i < 8; i++) {
      expect((await POST(json("/api/login", { email: target, password: `bad ${i} again` }))).status).toBe(401);
    }
  });

  it("rejects cross-site requests (Origin from another host) with 403", async () => {
    const res = await POST(json("/api/login", { email: email(), password: "x" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(backend.authenticate).not.toHaveBeenCalled();
  });

  it("accepts same-origin browser requests", async () => {
    backend.authenticate.mockResolvedValue(user);
    const res = await POST(json("/api/login", { email: email(), password: "x" }, { origin: "http://localhost:3000" }));
    expect(res.status).toBe(200);
  });
});
