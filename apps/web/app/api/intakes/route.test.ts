import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterCallbacks, backend, cookieJar, json } from "../../../lib/test-backend";

vi.mock("@app/backend", async () => (await import("../../../lib/test-backend")).backend);
vi.mock("next/server", async () => (await import("../../../lib/test-backend")).nextServerMock());
vi.mock("next/headers", async () => (await import("../../../lib/test-backend")).nextHeadersMock());

import { GET, POST } from "./route";

const customer = { id: "u1", name: "Ana", email: "ana@acme.com", company: "Acme", isAdmin: false };
const admin = { id: "a1", name: "Boss", email: "boss@acme.com", company: "Acme", isAdmin: true };
const project = {
  title: "CRM",
  description: "Build a CRM for clinics.",
  budget: 25000,
  timeline: "2026-12-01",
  industry: "Healthcare",
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  for (const k of Object.keys(cookieJar)) delete cookieJar[k];
});

const signIn = (user: typeof customer) => {
  cookieJar.session = "raw-token";
  backend.getSessionUser.mockResolvedValue(user);
};

describe("GET /api/intakes", () => {
  it("is private: 401 without a session, and nothing is read from the database", async () => {
    backend.getSessionUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(backend.listIntakesFor).not.toHaveBeenCalled();
  });

  it("is private: 401 with a cookie that doesn't match a session", async () => {
    cookieJar.session = "forged";
    backend.getSessionUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(backend.getSessionUser).toHaveBeenCalledWith("forged");
  });

  it("asks for the signed-in user's scope, so a customer can't request someone else's", async () => {
    signIn(customer);
    backend.listIntakesFor.mockResolvedValue({ scope: "own", intakes: [{ id: "i1" }] });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "i1" }]);
    expect(backend.listIntakesFor).toHaveBeenCalledWith(customer);
  });

  it("passes the admin flag through for team members", async () => {
    signIn(admin);
    backend.listIntakesFor.mockResolvedValue({ scope: "all", intakes: [] });
    await GET();
    expect(backend.listIntakesFor).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
  });
});

describe("POST /api/intakes", () => {
  it("requires a session", async () => {
    backend.getSessionUser.mockResolvedValue(null);
    const res = await POST(json("/api/intakes", project));
    expect(res.status).toBe(401);
    expect(backend.createIntake).not.toHaveBeenCalled();
  });

  it("creates the intake as the signed-in user, ignoring any identity sent in the body", async () => {
    signIn(customer);
    backend.createIntake.mockResolvedValue({ id: "i1" });

    const res = await POST(json("/api/intakes", { ...project, name: "Mallory", email: "boss@acme.com", company: "Evil", userId: "a1" }));

    expect(res.status).toBe(201);
    const [input, userId] = backend.createIntake.mock.calls[0]!;
    expect(input).toMatchObject({ name: "Ana", email: "ana@acme.com", company: "Acme" });
    expect(input).not.toHaveProperty("userId");
    expect(userId).toBe("u1");
  });

  it("answers with the customer view only: no tags, risks, summary, key points or priority", async () => {
    signIn(customer);
    backend.createIntake.mockResolvedValue({
      id: "i1", ...project, name: "Ana", email: "ana@acme.com", company: "Acme", createdAt: "2026-10-27T12:00:00.000Z",
      tags: ["backend"], risks: [{ type: "budget", severity: "high", message: "Secret." }], summary: "Secret", keyPoints: ["Secret"],
      priority: "urgent", priorityReason: "Secret",
    });

    const body = await (await POST(json("/api/intakes", project))).json();

    expect(Object.keys(body).sort()).toEqual(["budget", "createdAt", "description", "id", "industry", "timeline", "title"]);
    expect(JSON.stringify(body)).not.toContain("Secret");
  });

  it("schedules the AI analysis after the response instead of waiting for it", async () => {
    signIn(customer);
    backend.createIntake.mockResolvedValue({ id: "i1" });

    const res = await POST(json("/api/intakes", project));

    expect(res.status).toBe(201);
    expect(backend.analyzeAndTagIntake).not.toHaveBeenCalled(); // not yet: it runs after the response
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]!();
    expect(backend.analyzeAndTagIntake).toHaveBeenCalledWith("i1");
  });

  it("a failing background analysis is logged, never thrown", async () => {
    signIn(customer);
    backend.createIntake.mockResolvedValue({ id: "i1" });
    backend.analyzeAndTagIntake.mockRejectedValue(new Error("boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(json("/api/intakes", project));
    await expect(afterCallbacks[0]!()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });

  it("doesn't schedule anything when validation fails", async () => {
    signIn(customer);
    await POST(json("/api/intakes", { ...project, title: "" }));
    expect(afterCallbacks).toHaveLength(0);
  });

  it("validates the project and answers 400 with field errors", async () => {
    signIn(customer);
    const res = await POST(json("/api/intakes", { ...project, title: "", budget: -5 }));
    expect(res.status).toBe(400);
    expect(Object.keys((await res.json()).error.fieldErrors).sort()).toEqual(["budget", "title"]);
    expect(backend.createIntake).not.toHaveBeenCalled();
  });

  it("rejects cross-site requests", async () => {
    signIn(customer);
    expect((await POST(json("/api/intakes", project, { origin: "https://evil.example" }))).status).toBe(403);
  });
});
