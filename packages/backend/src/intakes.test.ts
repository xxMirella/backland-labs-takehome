import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  count: vi.fn(),
}));
vi.mock("@app/db", () => ({ prisma: { intake: db } }));

const ai = vi.hoisted(() => ({ analyzeIntake: vi.fn(), isAnalysisConfigured: vi.fn() }));
vi.mock("./ai", () => ai);

import {
  IntakeNotFoundError,
  PastDeliveryError,
  analyzeAndTagIntake,
  createIntake,
  getStats,
  listIntakesFor,
  updateIntake,
} from "./intakes";

const input = {
  name: "Ana Silva",
  email: "ana@acme.com",
  company: "Acme Inc.",
  title: "CRM",
  description: "Build a CRM for clinics.",
  budget: 25000,
  timeline: "2026-12-01",
  industry: "Healthcare",
};
const row = {
  id: "1",
  ...input,
  timeline: new Date("2026-12-01T00:00:00Z"),
  tags: [],
  risks: [],
  summary: null,
  keyPoints: [],
  priority: "normal",
  priorityReason: null,
  createdAt: new Date("2026-10-27T10:00:00Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db.create.mockResolvedValue(row);
});

describe("createIntake", () => {
  it("saves the intake and returns it without ever calling the AI", async () => {
    const dto = await createIntake(input, "user-1");

    expect(ai.analyzeIntake).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(dto).toMatchObject({ id: "1", name: "Ana Silva", email: "ana@acme.com", company: "Acme Inc.", budget: 25000 });
    expect(dto.timeline).toBe("2026-12-01");
    expect(dto.createdAt).toBe("2026-10-27T10:00:00.000Z");
  });

  it("stores the delivery date as a UTC date and ties the intake to its owner", async () => {
    await createIntake(input, "user-1");
    expect(db.create).toHaveBeenCalledWith({
      data: { ...input, timeline: new Date("2026-12-01T00:00:00Z"), priority: "normal", priorityReason: null, userId: "user-1" },
    });
  });

  it("leaves legacy intakes without an owner when none is given", async () => {
    await createIntake(input);
    expect(db.create.mock.calls[0]![0].data).not.toHaveProperty("userId");
  });

  it("marks an intake urgent from the deadline alone", async () => {
    db.create.mockResolvedValue({ ...row, priority: "urgent", priorityReason: "Delivery date is 9 days after submission." });
    const dto = await createIntake({ ...input, timeline: "2026-11-05" });
    expect(db.create.mock.calls[0]![0].data).toMatchObject({
      priority: "urgent",
      priorityReason: "Delivery date is 9 days after submission.",
    });
    expect(dto.priority).toBe("urgent");
  });

  it("treats exactly 14 days as urgent and 15 days as normal", async () => {
    await createIntake({ ...input, timeline: "2026-11-10" });
    await createIntake({ ...input, timeline: "2026-11-11" });
    expect(db.create.mock.calls[0]![0].data.priority).toBe("urgent");
    expect(db.create.mock.calls[1]![0].data.priority).toBe("normal");
  });
});

describe("analyzeAndTagIntake", () => {
  const analysis = {
    tags: ["backend"],
    risks: [{ type: "budget", severity: "high", message: "Too low." }],
    summary: "A CRM.",
    keyPoints: ["Ask about integrations"],
    priority: undefined,
    priorityReason: "",
  };

  beforeEach(() => {
    db.findUniqueOrThrow.mockResolvedValue(row);
    ai.isAnalysisConfigured.mockReturnValue(true);
  });

  it("stores the tags, risks, summary and key points", async () => {
    ai.analyzeIntake.mockResolvedValue(analysis);
    db.update.mockResolvedValue({ ...row, tags: ["backend"], risks: analysis.risks, summary: "A CRM.", keyPoints: analysis.keyPoints });

    const dto = await analyzeAndTagIntake("1");

    expect(db.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { tags: ["backend"], risks: analysis.risks, summary: "A CRM.", keyPoints: ["Ask about integrations"] },
    });
    expect(dto.tags).toEqual(["backend"]);
    expect(dto.summary).toBe("A CRM.");
  });

  it("sends the saved intake (with submission date) to the AI", async () => {
    ai.analyzeIntake.mockResolvedValue(analysis);
    db.update.mockResolvedValue(row);
    await analyzeAndTagIntake("1");
    expect(ai.analyzeIntake).toHaveBeenCalledWith(
      expect.objectContaining({ budget: 25000, timeline: "2026-12-01", createdAt: "2026-10-27T10:00:00.000Z" }),
    );
  });

  it("keeps the intake untouched when the AI call fails", async () => {
    ai.analyzeIntake.mockRejectedValue(new Error("429"));
    const dto = await analyzeAndTagIntake("1");
    expect(dto).toMatchObject({ id: "1", tags: [], risks: [] });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("skips the analysis when no API key is configured", async () => {
    ai.isAnalysisConfigured.mockReturnValue(false);
    await analyzeAndTagIntake("1");
    expect(ai.analyzeIntake).not.toHaveBeenCalled();
  });

  it("lets the AI raise the priority and stores its reason", async () => {
    ai.analyzeIntake.mockResolvedValue({ ...analysis, priority: "urgent", priorityReason: "Clinic opens next week." });
    db.update.mockResolvedValue({ ...row, priority: "urgent", priorityReason: "Clinic opens next week." });

    const dto = await analyzeAndTagIntake("1");

    expect(db.update.mock.calls[0]![0].data).toMatchObject({ priority: "urgent", priorityReason: "Clinic opens next week." });
    expect(dto).toMatchObject({ priority: "urgent", priorityReason: "Clinic opens next week." });
  });

  it("lets the AI lower the priority and clears the reason", async () => {
    db.findUniqueOrThrow.mockResolvedValue({ ...row, priority: "urgent", priorityReason: "Delivery date is 9 days after submission." });
    ai.analyzeIntake.mockResolvedValue({ ...analysis, priority: "normal", priorityReason: "" });
    db.update.mockResolvedValue(row);

    await analyzeAndTagIntake("1");

    expect(db.update.mock.calls[0]![0].data).toMatchObject({ priority: "normal", priorityReason: null });
  });

  it("keeps the deadline-based priority when the AI gives none", async () => {
    ai.analyzeIntake.mockResolvedValue(analysis);
    db.update.mockResolvedValue(row);
    await analyzeAndTagIntake("1");
    const data = db.update.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty("priority");
    expect(data).not.toHaveProperty("priorityReason");
  });
});

describe("listIntakesFor", () => {
  it("gives the team everything, with the full analysis", async () => {
    db.findMany.mockResolvedValue([{ ...row, tags: ["backend"], summary: "A CRM." }]);

    const listing = await listIntakesFor({ id: "admin-1", isAdmin: true });

    expect(db.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
    expect(listing.scope).toBe("all");
    expect(listing.intakes[0]).toMatchObject({ tags: ["backend"], summary: "A CRM.", priority: "normal" });
  });

  it("gives a customer only their own rows, selecting only the fields they sent", async () => {
    db.findMany.mockResolvedValue([]);

    await listIntakesFor({ id: "user-1", isAdmin: false });

    const query = db.findMany.mock.calls[0]![0];
    expect(query.where).toEqual({ userId: "user-1" });
    expect(query.orderBy).toEqual({ createdAt: "desc" });
    expect(Object.keys(query.select).sort()).toEqual(["budget", "createdAt", "description", "id", "industry", "timeline", "title"]);
  });

  it("returns customers a plain DTO with string dates and none of the AI fields", async () => {
    db.findMany.mockResolvedValue([
      { id: "1", title: "CRM", description: "Build.", budget: 5, timeline: new Date("2026-12-01T00:00:00Z"), industry: "X", createdAt: new Date("2026-10-27T10:00:00Z") },
    ]);

    const listing = await listIntakesFor({ id: "user-1", isAdmin: false });

    expect(listing.scope).toBe("own");
    expect(listing.intakes[0]).toEqual({
      id: "1", title: "CRM", description: "Build.", budget: 5, timeline: "2026-12-01", industry: "X", createdAt: "2026-10-27T10:00:00.000Z",
    });
  });

  it("returns an empty list for a customer with no intakes", async () => {
    db.findMany.mockResolvedValue([]);
    expect(await listIntakesFor({ id: "new", isAdmin: false })).toEqual({ scope: "own", intakes: [] });
  });
});

describe("updateIntake", () => {
  const edit = { title: "New title", description: "A better description.", budget: 40000, timeline: "2026-12-20", industry: "Finance" };

  beforeEach(() => {
    db.findFirst.mockResolvedValue(row);
    db.update.mockImplementation(async ({ data }) => ({ ...row, ...data }));
  });

  it("only finds intakes owned by the user", async () => {
    await updateIntake("1", "user-1", edit);
    expect(db.findFirst).toHaveBeenCalledWith({ where: { id: "1", userId: "user-1" } });
  });

  it("answers not-found for someone else's or a missing intake, and writes nothing", async () => {
    db.findFirst.mockResolvedValue(null);
    await expect(updateIntake("1", "intruder", edit)).rejects.toBeInstanceOf(IntakeNotFoundError);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates only the project fields and returns the updated intake", async () => {
    const dto = await updateIntake("1", "user-1", edit);

    const data = db.update.mock.calls[0]![0].data;
    expect(Object.keys(data).sort()).toEqual(["budget", "description", "industry", "priority", "priorityReason", "timeline", "title"]);
    expect(data.timeline).toEqual(new Date("2026-12-20T00:00:00Z"));
    expect(dto).toMatchObject({ title: "New title", budget: 40000, industry: "Finance", timeline: "2026-12-20" });
  });

  it("recomputes the priority from the new date, relative to the original submission", async () => {
    await updateIntake("1", "user-1", { ...edit, timeline: "2026-11-05" });
    expect(db.update.mock.calls[0]![0].data).toMatchObject({ priority: "urgent" });

    await updateIntake("1", "user-1", { ...edit, timeline: "2026-12-30" });
    expect(db.update.mock.calls[1]![0].data).toMatchObject({ priority: "normal", priorityReason: null });
  });

  it("rejects a changed delivery date that is in the past", async () => {
    await expect(updateIntake("1", "user-1", { ...edit, timeline: "2026-10-01" })).rejects.toBeInstanceOf(PastDeliveryError);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("accepts an unchanged delivery date even if it has passed since", async () => {
    vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
    await expect(updateIntake("1", "user-1", { ...edit, timeline: "2026-12-01" })).resolves.toBeDefined();
    expect(db.update).toHaveBeenCalled();
  });
});

describe("getStats", () => {
  it("computes public stats as plain counts", async () => {
    db.count.mockResolvedValueOnce(7).mockResolvedValueOnce(2);
    expect(await getStats()).toEqual({ total: 7, urgent: 2 });
    expect(db.count).toHaveBeenLastCalledWith({ where: { priority: "urgent" } });
  });
});
