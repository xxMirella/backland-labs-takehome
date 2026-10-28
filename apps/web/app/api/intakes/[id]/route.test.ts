import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterCallbacks, backend, cookieJar } from "../../../../lib/test-backend";

vi.mock("@app/backend", async () => (await import("../../../../lib/test-backend")).backend);
vi.mock("next/server", async () => (await import("../../../../lib/test-backend")).nextServerMock());
vi.mock("next/headers", async () => (await import("../../../../lib/test-backend")).nextHeadersMock());

import { PATCH } from "./route";

const customer = { id: "u1", name: "Ana", email: "ana@acme.com", company: "Acme", isAdmin: false };
const edit = { title: "New title", description: "A better description.", budget: 40000, timeline: "2026-12-20", industry: "Finance" };
const updated = {
  id: "i1", ...edit, name: "Ana", email: "ana@acme.com", company: "Acme", createdAt: "2026-10-27T10:00:00.000Z",
  tags: ["backend"], risks: [], summary: "Secret", keyPoints: ["Secret"], priority: "urgent", priorityReason: "Secret",
};

const patch = (body: unknown, headers: Record<string, string> = {}) =>
  PATCH(
    new Request("http://localhost:3000/api/intakes/i1", {
      method: "PATCH",
      headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "i1" }) },
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  for (const k of Object.keys(cookieJar)) delete cookieJar[k];
  cookieJar.session = "raw-token";
  backend.getSessionUser.mockResolvedValue(customer);
  backend.updateIntake.mockResolvedValue(updated);
});

describe("PATCH /api/intakes/[id]", () => {
  it("lets the owner edit and returns the customer view only", async () => {
    const res = await patch(edit);

    expect(res.status).toBe(200);
    expect(backend.updateIntake).toHaveBeenCalledWith("i1", "u1", edit);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["budget", "createdAt", "description", "id", "industry", "timeline", "title"]);
    expect(JSON.stringify(body)).not.toContain("Secret");
  });

  it("takes the owner from the session and the id from the URL, never from the body", async () => {
    await patch({ ...edit, userId: "someone-else", id: "other", name: "Mallory", priority: "normal" });
    const [id, userId, input] = backend.updateIntake.mock.calls[0]!;
    expect([id, userId]).toEqual(["i1", "u1"]);
    expect(Object.keys(input).sort()).toEqual(["budget", "description", "industry", "timeline", "title"]);
  });

  it("re-runs the AI analysis after responding", async () => {
    await patch(edit);
    expect(afterCallbacks).toHaveLength(1);
    expect(backend.analyzeAndTagIntake).not.toHaveBeenCalled();
    await afterCallbacks[0]!();
    expect(backend.analyzeAndTagIntake).toHaveBeenCalledWith("i1");
  });

  it("requires a session", async () => {
    backend.getSessionUser.mockResolvedValue(null);
    expect((await patch(edit)).status).toBe(401);
    expect(backend.updateIntake).not.toHaveBeenCalled();
  });

  it("answers 404 for an intake that isn't theirs or doesn't exist, and schedules nothing", async () => {
    backend.updateIntake.mockRejectedValue(new backend.IntakeNotFoundError());
    const res = await patch(edit);
    expect(res.status).toBe(404);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("answers 400 on the timeline field when the date was changed to the past", async () => {
    backend.updateIntake.mockRejectedValue(new backend.PastDeliveryError());
    const res = await patch(edit);
    expect(res.status).toBe(400);
    expect((await res.json()).error.fieldErrors.timeline[0]).toMatch(/past/i);
  });

  it.each([
    ["blank title", { ...edit, title: "" }, "title"],
    ["short description", { ...edit, description: "short" }, "description"],
    ["zero budget", { ...edit, budget: 0 }, "budget"],
    ["fractional budget", { ...edit, budget: 10.5 }, "budget"],
    ["bad date", { ...edit, timeline: "tomorrow" }, "timeline"],
    ["blank industry", { ...edit, industry: "  " }, "industry"],
  ])("rejects %s with 400 and changes nothing", async (_name, payload, field) => {
    const res = await patch(payload);
    expect(res.status).toBe(400);
    expect(Object.keys((await res.json()).error.fieldErrors)).toContain(field);
    expect(backend.updateIntake).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("rejects a body that isn't JSON", async () => {
    expect((await patch("{broken")).status).toBe(400);
  });

  it("rejects cross-site requests", async () => {
    expect((await patch(edit, { origin: "https://evil.example" })).status).toBe(403);
    expect(backend.updateIntake).not.toHaveBeenCalled();
  });

  it("lets unexpected errors surface instead of hiding them", async () => {
    backend.updateIntake.mockRejectedValue(new Error("disk full"));
    await expect(patch(edit)).rejects.toThrow("disk full");
  });
});
