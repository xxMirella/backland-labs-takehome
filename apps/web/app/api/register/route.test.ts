import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterCallbacks, backend, json } from "../../../lib/test-backend";

vi.mock("@app/backend", async () => (await import("../../../lib/test-backend")).backend);
vi.mock("next/server", async () => (await import("../../../lib/test-backend")).nextServerMock());
vi.mock("next/headers", async () => (await import("../../../lib/test-backend")).nextHeadersMock());

import { POST } from "./route";

const body = {
  name: "Ana Silva",
  email: "Ana@Acme.com",
  company: "Acme",
  password: "correct horse",
  title: "CRM",
  description: "Build a CRM for clinics.",
  budget: 25000,
  timeline: "2026-12-01",
  industry: "Healthcare",
};
const created = {
  user: { id: "u1", name: "Ana Silva", email: "ana@acme.com", company: "Acme" },
  session: { token: "raw-token", expiresAt: new Date("2026-11-03T12:00:00Z") },
  intake: {
    id: "i1", title: "CRM", description: "Build.", budget: 1, timeline: "2026-12-01", industry: "X", createdAt: "2026-10-27T12:00:00.000Z",
    name: "Ana Silva", email: "ana@acme.com", company: "Acme",
    tags: ["backend"], risks: [], summary: "Secret", keyPoints: ["Secret"], priority: "urgent", priorityReason: "Secret",
  },
};
let ip = 0;
const post = (b: unknown, headers: Record<string, string> = {}) =>
  POST(json("/api/register", b, { "x-forwarded-for": `10.0.0.${++ip}`, ...headers }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  backend.registerWithIntake.mockResolvedValue(created);
});

describe("POST /api/register", () => {
  it("creates the account and intake, signs the user in and returns both", async () => {
    const res = await post(body);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.user.email).toBe("ana@acme.com");
    expect(data.intake.id).toBe("i1");
    expect(res.headers.get("set-cookie")).toMatch(/session=raw-token.*HttpOnly/i);
  });

  it("returns the customer view of the intake (no AI fields) and schedules the analysis after responding", async () => {
    const res = await post(body);
    const data = await res.json();

    expect(Object.keys(data.intake).sort()).toEqual(["budget", "createdAt", "description", "id", "industry", "timeline", "title"]);
    expect(JSON.stringify(data)).not.toContain("Secret");
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]!();
    expect(backend.analyzeAndTagIntake).toHaveBeenCalledWith("i1");
  });

  it("passes the normalised email to the service", async () => {
    await post(body);
    expect(backend.registerWithIntake.mock.calls[0]![0]).toMatchObject({ email: "ana@acme.com", password: "correct horse" });
  });

  it("returns the password nowhere in the response", async () => {
    const res = await post(body);
    expect(await res.text()).not.toContain("correct horse");
  });

  it("answers 409 on the email field when the account exists, and sets no cookie", async () => {
    backend.registerWithIntake.mockRejectedValue(new backend.EmailTakenError());
    const res = await post(body);

    expect(res.status).toBe(409);
    expect((await res.json()).error.fieldErrors.email[0]).toMatch(/already exists/i);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["no password", { ...body, password: undefined }, "password"],
    ["short password", { ...body, password: "short" }, "password"],
    ["bad email", { ...body, email: "nope" }, "email"],
    ["blank company", { ...body, company: "   " }, "company"],
    ["past date", { ...body, timeline: "2000-01-01" }, "timeline"],
    ["zero budget", { ...body, budget: 0 }, "budget"],
  ])("rejects %s with 400 and creates nothing", async (_name, payload, field) => {
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(Object.keys((await res.json()).error.fieldErrors)).toContain(field);
    expect(backend.registerWithIntake).not.toHaveBeenCalled();
  });

  it("rejects a body that isn't JSON", async () => {
    expect((await post("{broken")).status).toBe(400);
  });

  it("rate-limits sign-ups per IP (11th within the window gets 429)", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 10; i++) expect((await POST(json("/api/register", body, headers))).status).toBe(201);
    const blocked = await POST(json("/api/register", body, headers));
    expect(blocked.status).toBe(429);
  });

  it("rejects cross-site requests with 403", async () => {
    expect((await post(body, { origin: "https://evil.example" })).status).toBe(403);
    expect(backend.registerWithIntake).not.toHaveBeenCalled();
  });

  it("lets unexpected errors surface instead of hiding them as a client error", async () => {
    backend.registerWithIntake.mockRejectedValue(new Error("disk full"));
    await expect(post(body)).rejects.toThrow("disk full");
  });
});
